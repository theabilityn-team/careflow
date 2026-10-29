import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import * as service from "../systemSyncService";
import * as db from "../systemSyncDb";
import { SyncProviderError } from "../systemSyncManus";
const folderInput=z.object({folderId:z.number().int().positive()});
async function safe<T>(fn:()=>Promise<T>):Promise<T> {
  try{return await fn();}catch(error){throw new TRPCError({code:"BAD_REQUEST",message:error instanceof SyncProviderError?error.message:error instanceof Error && !/query|sql|password|token|params|access denied/i.test(error.message)?error.message:"System sync could not complete this step. Inspect the status and retry safely."});}
}
export const systemSyncRouter=router({
  status:adminProcedure.query(()=>safe(service.getSyncStatus)),
  configure:adminProcedure.input(z.object({rootFolderId:z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).optional(),publicBaseUrl:z.string().url().max(500).optional(),maxParallel:z.number().int().min(1).max(3).optional(),batchSize:z.number().int().min(1).max(100).optional()})).mutation(({input})=>safe(()=>service.configureSync(input))),
  checkFolders:adminProcedure.mutation(()=>safe(service.checkSyncFolders)),
  syncFolder:adminProcedure.input(folderInput).mutation(({input})=>safe(()=>service.startSyncFolder(input.folderId))),
  resumeFolder:adminProcedure.input(folderInput).mutation(({input})=>safe(()=>service.startSyncFolder(input.folderId))),
  pauseFolder:adminProcedure.input(folderInput).mutation(({input})=>safe(()=>service.pauseSyncFolder(input.folderId))),
  retryFailed:adminProcedure.input(folderInput).mutation(({input})=>safe(()=>service.retrySyncFailures(input.folderId))),
  inspectJob:adminProcedure.input(z.object({jobId:z.number().int().positive()})).mutation(({input})=>safe(()=>service.inspectSyncJob(input.jobId))),
  items:adminProcedure.input(folderInput.extend({status:z.enum(["pending","processing","imported","attached","needs_review","failed","skipped","removed"]).optional(),page:z.number().int().min(1).default(1),pageSize:z.number().int().min(1).max(100).default(10)})).query(({input})=>safe(async()=>{
    const result=await db.listSyncItems(input);
    return {total:result.total,items:result.items.map(({id,driveFileId,folderId,name,mimeType,byteSize,modifiedTime,status,attempts,lastError,completedAt,leadId,documentId})=>({id,driveFileId,folderId,name,mimeType,byteSize,modifiedTime,status,attempts,lastError,completedAt,leadId,documentId}))};
  })),
});
