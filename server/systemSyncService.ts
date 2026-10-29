import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, lte, or, desc } from "drizzle-orm";
import { getDb } from "./db";
import { systemSyncFolders, systemSyncItems, systemSyncJobs } from "../drizzle/schema";
import * as sync from "./systemSyncDb";
import { checkDriveConnector, createCallbackSecret, createManusSyncTask, DEFAULT_SYNC_ROOT, discoveryPrompt, DRIVE_CONNECTOR_ID, getManusTask, importPrompt, manusRequest, stopManusTask, SYNC_PROTOCOL, SyncProviderError, validateSyncBaseUrl, verifyCallbackToken } from "./systemSyncManus";
import { extractSyncImage, commitSyncExtraction } from "./systemSyncImport";
import { storagePut } from "./storage";

const ACTIVE_JOB_STATES = ["created", "dispatching", "running", "waiting", "dispatch_unknown"];
const END_STATES = ["completed", "failed", "stopped"];
export const safeSyncError = (error: unknown) => error instanceof SyncProviderError ? error.message : "Sync could not complete this step. Check the folder status and retry only failed items.";
async function db() { const database = await getDb(); if (!database) throw new Error("System sync database is unavailable."); return database; }
export async function listActiveSyncJobs() { return (await db()).select().from(systemSyncJobs).where(inArray(systemSyncJobs.status, ACTIVE_JOB_STATES)).orderBy(systemSyncJobs.id); }
export async function listSyncJobs() { return (await db()).select({ id:systemSyncJobs.id,kind:systemSyncJobs.kind,folderId:systemSyncJobs.folderId,status:systemSyncJobs.status,manusTaskUrl:systemSyncJobs.manusTaskUrl,creditsUsed:systemSyncJobs.creditsUsed,lastError:systemSyncJobs.lastError,createdAt:systemSyncJobs.createdAt }).from(systemSyncJobs).orderBy(desc(systemSyncJobs.id)).limit(100); }

export async function callbackReady(base: string | null | undefined) {
  if (!base) return false;
  try {
    const origin = validateSyncBaseUrl(base); const challenge = randomBytes(12).toString("hex");
    const response = await fetch(`${origin}/api/system-sync/health?challenge=${challenge}`, { signal:AbortSignal.timeout(5000), redirect:"error" });
    const result = await response.json(); return response.ok && result.protocol === SYNC_PROTOCOL && result.challenge === challenge;
  } catch { return false; }
}
export async function getSyncStatus() {
  const settings = await sync.getSyncSettings();
  const effective = settings ?? { id:1,rootFolderId:DEFAULT_SYNC_ROOT,connectorId:DRIVE_CONNECTOR_ID,publicBaseUrl:"https://carecrm-ajn4jvsk.manus.space",enabled:false,maxParallel:3,batchSize:50,scheduleTaskUid:null,lastCheckedAt:null };
  let driveConnected = false;
  if (process.env.MANUS_SYNC_API_KEY) { try { driveConnected = await checkDriveConnector(); } catch {} }
  return { settings:effective, ready:{configured:Boolean(settings?.enabled && settings.publicBaseUrl),apiKeyPresent:Boolean(process.env.MANUS_SYNC_API_KEY),driveConnected,callbackReady:await callbackReady(effective.publicBaseUrl),workerScheduled:Boolean(effective.scheduleTaskUid)},folders:await sync.listSyncFolders(),events:await sync.listSyncEvents(),jobs:await listSyncJobs() };
}
export async function configureSync(input: {rootFolderId?:string;publicBaseUrl?:string;maxParallel?:number;batchSize?:number}) {
  if(input.rootFolderId && input.rootFolderId!==DEFAULT_SYNC_ROOT) throw new Error("System sync is restricted to the approved Drive root.");
  const active = await listActiveSyncJobs(); if (active.length) throw new Error("Pause and finish active tasks before changing sync configuration.");
  const old = await sync.getSyncSettings();
  if (old && input.rootFolderId && input.rootFolderId !== old.rootFolderId) throw new Error("This sync is bound to its approved source root. Configure a separate import for another root.");
  const settings = await sync.saveSyncSettings({ rootFolderId:input.rootFolderId ?? old?.rootFolderId ?? DEFAULT_SYNC_ROOT, connectorId:DRIVE_CONNECTOR_ID, ...(input.publicBaseUrl ? {publicBaseUrl:validateSyncBaseUrl(input.publicBaseUrl)} : {}), maxParallel:input.maxParallel ?? old?.maxParallel ?? 3,batchSize:input.batchSize ?? old?.batchSize ?? 50, enabled:true });
  return {success:true, settings};
}
async function requireReady() {
  const settings = await sync.getSyncSettings();
  if (!process.env.MANUS_SYNC_API_KEY) throw new Error("The Manus API server key is missing. Add MANUS_SYNC_API_KEY to the published project secrets.");
  if (!settings?.enabled) throw new Error("Save and enable Sync settings before checking folders.");
  if (!settings.publicBaseUrl) throw new Error("Save the published CareFlow callback URL in Sync settings.");
  if (!await checkDriveConnector()) throw new Error("Reconnect the approved Google Drive connector before starting sync.");
  if (!await callbackReady(settings.publicBaseUrl)) throw new Error("The published sync callback is unavailable. Publish the latest CareFlow version and check the callback URL.");
  return settings;
}
async function dispatch(job: NonNullable<Awaited<ReturnType<typeof sync.getSyncJob>>>, token:string, base:string, root:string) {
  await sync.updateSyncJob(job.id,{status:"dispatching"});
  const prompt = job.kind === "discovery" ? discoveryPrompt({jobId:job.id,rootFolderId:root,callbackBase:base,token}) : importPrompt({jobId:job.id,callbackBase:base,token});
  try {
    const task = await createManusSyncTask(job.kind as "import"|"discovery",job.id,prompt);
    const current = await sync.getSyncJob(job.id);
    await sync.updateSyncJob(job.id,{manusTaskId:task.task_id,manusTaskUrl:task.task_url,...(!current || !END_STATES.includes(current.status) ? {status:"running" as const} : {})});
    await sync.addSyncEvent({jobId:job.id,folderId:job.folderId,type:"task_started",message:`${job.kind === "discovery" ? "Read-only inventory" : "Image transfer"} task started.`});
    return {jobId:job.id,taskUrl:task.task_url};
  } catch(error) {
    const uncertain = error instanceof SyncProviderError && error.uncertain;
    await sync.updateSyncJob(job.id,{status:uncertain?"dispatch_unknown":"failed",lastError:safeSyncError(error)});
    if (job.folderId) await sync.updateSyncFolder(job.folderId,{status:"blocked",desiredState:"paused",lastError:safeSyncError(error)});
    throw error;
  }
}
export async function checkSyncFolders() {
  const settings = await requireReady();
  const secret = createCallbackSecret();
  const job = await sync.reserveDiscoveryJob({callbackTokenHash:secret.hash,expiresAt:Date.now()+90*60_000});
  if (!job) throw new Error("Inventory is already running or a folder sync is active. Pause and complete transfers before checking Drive changes.");
  return dispatch(job,secret.token,settings.publicBaseUrl!,settings.rootFolderId);
}
export async function startSyncFolder(folderId:number) {
  const settings = await requireReady();
  if (!settings.scheduleTaskUid) throw new Error("Activate the published background worker before folder sync.");
  const folder=await sync.getSyncFolder(folderId); if(!folder?.active) throw new Error("Check folders before starting this folder.");
  if ((await listActiveSyncJobs()).some(job=>job.kind==="discovery"||job.status==="dispatch_unknown")) throw new Error("Finish inventory or resolve unknown task dispatch before syncing.");
  await sync.updateSyncFolder(folderId,{desiredState:"running",status:"queued",lastStartedAt:Date.now(),lastError:null});
  await tickSyncWorker(); return {success:true};
}
export async function pauseSyncFolder(folderId:number) {
  await sync.updateSyncFolder(folderId,{desiredState:"paused",status:"paused"});
  const jobs=(await listActiveSyncJobs()).filter(job=>job.folderId===folderId);
  for (const job of jobs) {
    if (job.manusTaskId) { try { await stopManusTask(job.manusTaskId); } catch { await sync.updateSyncJob(job.id,{lastError:"Pause is enforced in CareFlow; provider stop could not be confirmed. Inspect the Manus task."}); continue; } }
    if (job.status !== "dispatch_unknown") await sync.updateSyncJob(job.id,{status:"stopped"});
  }
  await (await db()).update(systemSyncItems).set({status:"pending",jobId:null,leaseUntil:null}).where(and(eq(systemSyncItems.folderId,folderId),eq(systemSyncItems.status,"processing")));
  return {success:true};
}
export async function retrySyncFailures(folderId:number) {
  if ((await listActiveSyncJobs()).some(job=>job.folderId===folderId)) throw new Error("Pause and finish the current task before retrying failed files.");
  await (await db()).update(systemSyncItems).set({status:"pending",jobId:null,leaseUntil:null,lastError:null}).where(and(eq(systemSyncItems.folderId,folderId),eq(systemSyncItems.status,"failed")));
  return startSyncFolder(folderId);
}

export async function authorizeSyncCallback(jobId:number,token:string) {
  const job=await sync.getSyncJob(jobId);
  if (!job || !verifyCallbackToken(token,job.callbackTokenHash) || job.expiresAt <= Date.now() || END_STATES.includes(job.status)) throw new Error("Sync callback is invalid or expired.");
  return job;
}
function parseIds(value:string|null) { try { const ids=JSON.parse(value||"[]"); return Array.isArray(ids) ? ids.filter((id:unknown)=>Number.isInteger(id)) as number[] : []; } catch {return [];} }
export async function getSyncManifest(jobId:number) {
  const job=await sync.getSyncJob(jobId); if(!job||job.kind!=="import") throw new Error("Import job unavailable.");
  const folder=job.folderId ? await sync.getSyncFolder(job.folderId) : undefined;
  const eligible=folder?.desiredState==="running" && job.expiresAt>Date.now() && !END_STATES.includes(job.status);
  const ids=parseIds(job.itemIds);
  const items=ids.length ? await (await db()).select({id:systemSyncItems.id,driveFileId:systemSyncItems.driveFileId,name:systemSyncItems.name,mimeType:systemSyncItems.mimeType,byteSize:systemSyncItems.byteSize,status:systemSyncItems.status}).from(systemSyncItems).where(and(eq(systemSyncItems.jobId,jobId),inArray(systemSyncItems.id,ids))) : [];
  return {eligible:Boolean(eligible),items:items.filter(item=>item.status==="processing")};
}
export async function recordSyncMetadata(jobId:number,input:{folders:Array<{driveFolderId:string;name:string}>;files:Array<{folderDriveId:string;driveFileId:string;name:string;mimeType:string;byteSize?:number|null;checksum?:string|null;modifiedTime?:string|null;sourcePath?:string|null}>}) {
  const job=await sync.getSyncJob(jobId); if(!job||job.kind!=="discovery") throw new Error("Discovery job unavailable.");
  const folderIds:number[]=[]; const itemIds:number[]=[];
  for(const inputFolder of input.folders) {
    if(!/^\d+\.\s*Images$/i.test(inputFolder.name)) throw new Error("Non-numbered source folder rejected.");
    const folder=await sync.upsertDiscoveredFolder(inputFolder); if(folder) folderIds.push(folder.id);
  }
  const folderMap = new Map((await sync.listSyncFolders()).filter(folder=>folder.active).map(folder=>[folder.driveFolderId,folder]));
  for(const file of input.files) {
    const folder=folderMap.get(file.folderDriveId);
    if(!folder) throw new Error("File outside the numbered inventory scope.");
    const item=await sync.upsertDiscoveredItem({...file,folderId:folder.id});
    if(item) { itemIds.push(item.id); if(!["image/jpeg","image/png","image/webp"].includes(item.mimeType) || (item.byteSize??0)>25_000_000) await sync.updateSyncItem(item.id,{status:"skipped",lastError:"Unsupported image type or image exceeds 25 MB."}); }
  }
  await sync.appendDiscoverySeen(jobId,itemIds,folderIds);
  await sync.updateSyncJob(jobId,{lastActivityAt:Date.now()});
  return {accepted:itemIds.length};
}
export async function processSyncImage(jobId:number,itemId:number,bytes:Buffer,mimeType:string) {
  const item=await sync.getSyncItem(itemId); const job=await sync.getSyncJob(jobId);
  if(!item||!job||item.jobId!==jobId||!parseIds(job.itemIds).includes(itemId)) throw new Error("File is outside its assigned transfer batch.");
  if(["imported","attached","needs_review"].includes(item.status)) return {status:item.status,leadId:item.leadId,documentId:item.documentId};
  const folder=await sync.getSyncFolder(item.folderId);
  if(folder?.desiredState!=="running"||job.expiresAt<=Date.now()||item.status!=="processing") throw new Error("Transfer is paused or expired.");
  if(bytes.length===0||bytes.length>25_000_000||mimeType!==item.mimeType||item.byteSize&&item.byteSize!==bytes.length) throw new Error("Image bytes do not match the declared source.");
  if(item.checksum&&createHash("md5").update(bytes).digest("hex")!==item.checksum) { await sync.updateSyncItem(itemId,{status:"needs_review",lastError:"Drive content changed after inventory. Check the source before importing."}); return {status:"needs_review"}; }
  const magic=mimeType==="image/jpeg" ? bytes[0]===0xff&&bytes[1]===0xd8 : mimeType==="image/png" ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mimeType==="image/webp"&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
  if(!magic) throw new Error("The source is not a supported image.");
  const claimUntil=Date.now()+300_000;
  const resultClaim=await (await db()).update(systemSyncItems).set({leaseUntil:claimUntil}).where(and(eq(systemSyncItems.id,itemId),eq(systemSyncItems.jobId,jobId),eq(systemSyncItems.status,"processing"),or(eq(systemSyncItems.leaseUntil,job.expiresAt),lte(systemSyncItems.leaseUntil,Date.now()))));
  if(!resultClaim[0].affectedRows) throw new Error("Image processing is busy; retry after the current request completes.");
  try {
    const extension=mimeType==="image/png"?"png":mimeType==="image/webp"?"webp":"jpg";
    const stored = item.uploadedFileKey&&item.uploadedFileUrl ? {key:item.uploadedFileKey,url:item.uploadedFileUrl} : await storagePut(`system-sync/${item.driveFileId}/${item.fingerprint}.${extension}`,bytes,mimeType);
    if(!item.uploadedFileKey) await sync.updateSyncItem(itemId,{uploadedFileKey:stored.key,uploadedFileUrl:stored.url});
    const extraction=item.extractionJson ? JSON.parse(item.extractionJson) : await extractSyncImage(bytes,mimeType);
    if(!item.extractionJson) await sync.updateSyncItem(itemId,{extractionJson:JSON.stringify(extraction)});
    const result=await commitSyncExtraction({itemId,jobId,extraction,stored});
    await sync.addSyncEvent({folderId:item.folderId,itemId,jobId,type:result.status,message:result.status==="imported"?"Verified lead and source document imported.":result.status==="attached"?"Source document attached to existing matching lead without overwriting.":"Image retained for identity/data review; no guessed lead created."});
    return result;
  } finally {
    await (await db()).update(systemSyncItems).set({leaseUntil:job.expiresAt}).where(and(eq(systemSyncItems.id,itemId),eq(systemSyncItems.jobId,jobId),eq(systemSyncItems.status,"processing"),eq(systemSyncItems.leaseUntil,claimUntil)));
  }
}
export async function recordSyncFileFailure(jobId:number,itemId:number) {
  const item=await sync.getSyncItem(itemId); if(!item||item.jobId!==jobId) throw new Error("File is outside this job.");
  if(item.status==="processing") await sync.updateSyncItem(itemId,{status:"failed",lastError:"Source download or transfer failed. Retry this file after checking Drive access."});
  return {success:true};
}
export async function completeSyncJob(jobId:number,success:boolean) {
  const job=await sync.getSyncJob(jobId); if(!job||END_STATES.includes(job.status)) return {success:true};
  if(job.kind==="discovery") {
    if(success) await sync.finishDiscovery(jobId);
    else await sync.updateSyncJob(jobId,{status:"failed",lastError:"Drive inventory was incomplete. Missing files were not removed."});
  } else {
    await (await db()).update(systemSyncItems).set({status:"failed",lastError:"Transfer task ended without returning this assigned image."}).where(and(eq(systemSyncItems.jobId,jobId),eq(systemSyncItems.status,"processing")));
    await sync.updateSyncJob(jobId,{status:success?"completed":"failed",lastError:success?null:"Transfer batch interrupted; completed files are preserved."});
  }
  return {success:true};
}
export async function inspectSyncJob(jobId:number) {
  const job=await sync.getSyncJob(jobId); if(!job?.manusTaskId) return {status:job?.status??"unknown"};
  const detail=await getManusTask(job.manusTaskId); const task=detail.task??detail;
  await sync.updateSyncJob(jobId,{...(typeof task.credit_usage==="number"?{creditsUsed:task.credit_usage}:{}),...(task.status==="waiting"?{status:"waiting",lastError:"Manus needs input. Open the task; do not start another paid batch."}:{})});
  if(task.status==="error") await completeSyncJob(jobId,false);
  if(task.status==="stopped"&&task.has_running_background_jobs!==true&&!END_STATES.includes(job.status)) {
    // Completion callbacks, not prose, are authoritative; an unreturned task is failed.
    if(Date.now()-job.lastActivityAt>60_000) await completeSyncJob(jobId,false);
  }
  return {status:task.status,taskUrl:job.manusTaskUrl,creditsUsed:task.credit_usage};
}
export async function tickSyncWorker() {
  const deadline=Date.now()+80_000;
  const settings=await sync.getSyncSettings(); if(!settings?.enabled) return {skipped:"disabled"};
  const active=await listActiveSyncJobs();
  const finished=(await listSyncJobs()).filter(job=>END_STATES.includes(job.status)&&job.manusTaskUrl&&job.creditsUsed===null).slice(0,3);
  for(const job of finished) {if(Date.now()>deadline) break; try{await inspectSyncJob(job.id);}catch{}}
  for(const job of active) {
    if(Date.now()>deadline) return {skipped:"time_budget"};
    if(job.status==="dispatching" && !job.manusTaskId && Date.now()-job.lastActivityAt>300_000) { await sync.updateSyncJob(job.id,{status:"dispatch_unknown",lastError:"Task dispatch outcome is unknown; inspect the Manus account before retrying."});return {skipped:"dispatch_unknown"}; }
    if(job.status==="dispatch_unknown") return {skipped:"dispatch_unknown"};
    if(job.expiresAt<=Date.now()) {
      if(job.manusTaskId) { try {await stopManusTask(job.manusTaskId);} catch {return {skipped:"provider_stop_unconfirmed"};} }
      await completeSyncJob(job.id,false);
    } else if(job.manusTaskId) { try {await inspectSyncJob(job.id);} catch {} }
  }
  if((await listActiveSyncJobs()).some(job=>job.kind==="discovery")) return {skipped:"inventory"};
  if(!settings.publicBaseUrl||!await checkDriveConnector()) return {skipped:"not_ready"};
  let started=0;
  for(const folder of await sync.listSyncFolders()) {
    if(Date.now()>deadline-25_000) break;
    if(!folder.active||folder.desiredState!=="running") continue;
    const items=await sync.listImportCandidates(folder.id,settings.batchSize);
    if(!items.length) {
      if(folder.counts.processing===0) await sync.updateSyncFolder(folder.id,{status:folder.counts.failed||folder.counts.needs_review?"completed_with_issues":"completed",desiredState:"idle",lastCompletedAt:Date.now()});
      continue;
    }
    const secret=createCallbackSecret(); const expiresAt=Date.now()+90*60_000;
    const job=await sync.reserveSyncImportJob({folderId:folder.id,callbackTokenHash:secret.hash,expiresAt,itemIds:items.map(item=>item.id)}); if(!job) break;
    const claimed=await sync.claimSyncItems(job.id,items.map(item=>item.id),expiresAt);
    if(!claimed.length) {await sync.updateSyncJob(job.id,{status:"stopped"});continue;}
    await sync.updateSyncJob(job.id,{itemIds:claimed.map(item=>item.id)});
    await sync.updateSyncFolder(folder.id,{status:"running"});
    try {await dispatch(job,secret.token,settings.publicBaseUrl,settings.rootFolderId);started++;} catch {break;}
    if(started>=settings.maxParallel) break;
  }
  return {started};
}
