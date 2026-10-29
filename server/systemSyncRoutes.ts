import { ENV } from "./_core/env";
import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { systemSyncJobs, systemSyncSettings } from "../drizzle/schema";
import * as sync from "./systemSyncDb";
import { authorizeSyncCallback, getSyncManifest, processSyncImage, recordSyncFileFailure, recordSyncMetadata, tickSyncWorker } from "./systemSyncService";
import { completeSyncAndAdvance, handleSyncTaskStop } from "./systemSyncEvents";
import { getManusWebhookKey, SYNC_BACKGROUND_PROTOCOL, SYNC_PROTOCOL, verifyManusWebhook } from "./systemSyncManus";
import { sdk } from "./_core/sdk";

const idSchema=z.coerce.number().int().positive();
const driveId=z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const inventorySchema=z.object({
  folders:z.array(z.object({driveFolderId:driveId,name:z.string().min(1).max(255)})).max(100),
  files:z.array(z.object({folderDriveId:driveId,driveFileId:driveId,name:z.string().min(1).max(255),mimeType:z.string().max(100),byteSize:z.number().int().nonnegative().nullable().optional(),checksum:z.string().max(80).nullable().optional(),modifiedTime:z.string().max(80).nullable().optional(),sourcePath:z.string().max(2000).nullable().optional()})).max(100),
});
async function callbackAuth(req:Request,res:Response,next:express.NextFunction) {
  const id=idSchema.safeParse(req.params.jobId); const auth=req.get("authorization")??"";
  if(!id.success||!auth.startsWith("Bearer ")) return res.status(401).json({error:"Invalid sync callback."});
  try { await authorizeSyncCallback(id.data,auth.slice(7)); res.locals.syncJobId=id.data; next(); }
  catch { return res.status(401).json({error:"Sync callback is invalid, unavailable or expired."}); }
}
const failure=(res:Response)=>res.status(503).json({error:"This sync step could not complete. Completed records are preserved; retry only the failed step."});

/** Register BEFORE the global JSON parser to preserve raw images and signed body bytes. */
export function registerSystemSyncRoutes(app:Express) {
  app.get("/api/system-sync/health",(req,res)=>res.json({protocol:SYNC_PROTOCOL,backgroundProtocol:SYNC_BACKGROUND_PROTOCOL,challenge:String(req.query.challenge??"").slice(0,100)}));
  app.get("/api/system-sync/jobs/:jobId/manifest",callbackAuth,async(req,res)=>{
    try {const result=await getSyncManifest(res.locals.syncJobId);return res.status(result.eligible?200:409).json(result);}catch{return failure(res);}
  });
  app.post("/api/system-sync/jobs/:jobId/metadata",callbackAuth,express.json({limit:"2mb"}),async(req,res)=>{
    const parsed=inventorySchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Invalid metadata chunk."});
    try{return res.json(await recordSyncMetadata(res.locals.syncJobId,parsed.data));}catch{return failure(res);}
  });
  app.post("/api/system-sync/jobs/:jobId/image/:itemId",callbackAuth,express.raw({type:["image/jpeg","image/png","image/webp"],limit:"25mb"}),async(req,res)=>{
    const id=idSchema.safeParse(req.params.itemId);if(!id.success||!Buffer.isBuffer(req.body))return res.status(400).json({error:"Supported raw image required."});
    try{return res.json(await processSyncImage(res.locals.syncJobId,id.data,req.body,req.get("content-type")?.split(";")[0]??""));}
    catch(error){ if(error instanceof Error && /paused|expired/.test(error.message)) return res.status(409).json({error:"Transfer paused or expired."}); if(error instanceof Error && /busy/.test(error.message)) return res.status(429).set("Retry-After","30").json({error:"Image processing in progress; retry after 30 seconds."}); return failure(res); }
  });
  app.post("/api/system-sync/jobs/:jobId/file-error",callbackAuth,express.json({limit:"8kb"}),async(req,res)=>{
    const input=z.object({itemId:z.number().int().positive(),error:z.string().max(500).optional(),stage:z.enum(["download","upload","unknown"]).optional(),httpStatus:z.number().int().min(100).max(599).optional()}).safeParse(req.body);if(!input.success)return res.status(400).json({error:"Invalid file failure."});
    try{return res.json(await recordSyncFileFailure(res.locals.syncJobId,input.data.itemId,input.data.stage,input.data.httpStatus));}catch{return failure(res);}
  });
  app.post("/api/system-sync/jobs/:jobId/complete",callbackAuth,express.json({limit:"8kb"}),async(req,res)=>{
    const input=z.object({success:z.boolean(),error:z.string().max(500).optional(),pauseFolderAfterCompletion:z.boolean().optional()}).safeParse(req.body);if(!input.success)return res.status(400).json({error:"Completion state required."});
    try{return res.json(await completeSyncAndAdvance(res.locals.syncJobId,input.data.success,input.data.pauseFolderAfterCompletion));}catch{return failure(res);}
  });
  app.post("/api/system-sync/webhook",express.raw({type:"application/json",limit:"1mb"}),async(req,res)=>{
    try {
      const settings=await sync.getSyncSettings(); if(!settings?.publicBaseUrl||!Buffer.isBuffer(req.body))return res.status(401).json({error:"Webhook unavailable."});
      const valid=verifyManusWebhook({publicKey:await getManusWebhookKey(),url:`${settings.publicBaseUrl}${req.originalUrl}`,body:req.body,timestamp:req.get("x-webhook-timestamp")??"",signature:req.get("x-webhook-signature")??""});
      if(!valid)return res.status(401).json({error:"Invalid signature."});
      const body=JSON.parse(req.body.toString("utf8")); const taskId=body.task_detail?.task_id;
      if(body.event_type==="task_stopped"&&typeof taskId==="string") {
        const database=await getDb();const job=database?(await database.select().from(systemSyncJobs).where(eq(systemSyncJobs.manusTaskId,taskId)).limit(1))[0]:undefined;
        if(job) await handleSyncTaskStop(job, body.task_detail?.stop_reason);
      }
      return res.json({ok:true});
    }catch{return res.status(503).json({error:"Webhook verification unavailable."});}
  });
  app.post("/api/scheduled/system-sync",express.json({limit:"8kb"}),async(req,res)=>{
    try {
      const authorization=req.headers.authorization;
      if(!authorization?.startsWith("Bearer "))return res.status(403).json({error:"cron-only"});
      const session=await sdk.verifySession(authorization.slice(7));
      if(!session?.openId.startsWith("cron_")||session.appId!==ENV.appId)return res.status(403).json({error:"cron-only"});
      const cronRequest={...req,headers:{...req.headers,cookie:undefined,authorization}} as Request;
      const user=await sdk.authenticateRequest(cronRequest);
      if(!user.isCron||!user.taskUid)return res.status(403).json({error:"cron-only"});
      const database=await getDb(); const settings=database?(await database.select().from(systemSyncSettings).where(eq(systemSyncSettings.scheduleTaskUid,user.taskUid)).limit(1))[0]:undefined;
      if(!settings)return res.json({ok:true,skipped:"orphan"});
      return res.json({ok:true,...await tickSyncWorker()});
    }catch{return res.status(500).json({error:"System sync heartbeat failed safely; inspect the folder status.",context:{url:req.originalUrl},timestamp:new Date().toISOString()});}
  });
  app.use("/api/system-sync",(error:unknown,_req:Request,res:Response,_next:express.NextFunction)=>{
    res.status(400).json({error:"Unsupported or oversized sync callback body."});
  });
}
