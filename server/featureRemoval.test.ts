import { describe, expect, it } from 'vitest';
import { readFileSync,existsSync } from 'node:fs';
import { appRouter } from './routers';
import * as schema from '../drizzle/schema';
const source=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
describe('removed Drive sync feature',()=>{
 it('does not expose its tRPC namespace while preserving existing CRM APIs',()=>{
  const keys=Object.keys(appRouter._def.procedures);
  expect(keys.some(k=>k.startsWith('systemSync.'))).toBe(false);
  for(const prefix of ['scanner.','leads.','groups.','customers.','orders.','emailLibrary.'])expect(keys.some(k=>k.startsWith(prefix))).toBe(true);
 });
 it('removes its page and navigation but retains normal image intake',()=>{
  const app=source('client/src/App.tsx'),nav=source('client/src/components/DashboardLayout.tsx'),guide=source('client/src/pages/SystemGuide.tsx');
  expect(app).not.toContain('SystemSync');expect(app).not.toContain('/system-sync');
  expect(nav).not.toContain('System sync');expect(guide).not.toContain('System sync');
  expect(app).toContain('/bulk-import');expect(app).toContain('/scan');
  expect(existsSync(new URL('../client/src/pages/SystemSync.tsx',import.meta.url))).toBe(false);
 });
 it('has no callback/provider/worker registration and returns 404 for unknown APIs',()=>{
  const index=source('server/_core/index.ts');
  expect(index).not.toContain('registerSystemSync');
  expect(index).toContain('app.use("/api",');expect(index).toContain('res.status(404)');
  for(const name of ['Routes','Service','Manus','Worker','Db','Transfer','Events','Import'])expect(existsSync(new URL(`./systemSync${name}.ts`,import.meta.url))).toBe(false);
  expect(index).toContain('/api/scheduled/follow-up-reminders');
 });
 it('has no sync schema and its cleanup migration clears only dedicated state without destructive DDL',()=>{
  expect(Object.keys(schema).some(k=>k.startsWith('systemSync'))).toBe(false);
  const sql=source('drizzle/0026_remove_system_sync.sql');
  expect([...sql.matchAll(/DELETE FROM `([^`]+)`/g)].map(m=>m[1]).sort()).toEqual(['system_sync_events','system_sync_folders','system_sync_items','system_sync_jobs','system_sync_settings']);
  expect(sql).not.toContain('DROP TABLE');
  expect(sql).not.toContain('`leads`');expect(sql).not.toContain('`lead_documents`');
 });
});
