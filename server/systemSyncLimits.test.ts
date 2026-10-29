import {describe,expect,it} from 'vitest';
import {syncTransferBatchSize} from './systemSyncLimits';
describe('initial System sync transfer limits',()=>{
 it('limits the unproven pipeline to one original image per transfer',()=>{
  expect(syncTransferBatchSize(50,[])).toBe(1);
  expect(syncTransferBatchSize(50,[{counts:{imported:0,attached:0,needs_review:0}}])).toBe(1);
 });
 it.each(['imported','attached','needs_review'] as const)('requires a persisted %s outcome before configured batch expansion',outcome=>{
  expect(syncTransferBatchSize(50,[{counts:{[outcome]:1}}])).toBe(50);
 });
 it('keeps a single-file configured batch after proof',()=>expect(syncTransferBatchSize(1,[{counts:{imported:1}}])).toBe(1));
 it('never exceeds the service batch ceiling',()=>expect(syncTransferBatchSize(500,[{counts:{attached:1}}])).toBe(100));
});
