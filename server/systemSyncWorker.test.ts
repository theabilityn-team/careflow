import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { SYSTEM_SYNC_WORKER } from "./systemSyncWorker";
const exec=promisify(execFile);
const fixture=String.raw`
import sys,os,json,importlib.util,subprocess
from pathlib import Path
os.environ['CAREFLOW_SYNC_BASE']='https://app.example.invalid/api/system-sync/jobs/1'
os.environ['CAREFLOW_SYNC_TOKEN']='PRIVATE_CALLBACK'
os.environ['CAREFLOW_SYNC_PAUSE_AFTER']='1'
spec=importlib.util.spec_from_file_location('worker',sys.argv[1]);w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
scenario=sys.argv[2];image=b'\xff\xd8\x01\x02';calls=[]
class Response:
    def __init__(self,body):self.body=body
    def __enter__(self):return self
    def __exit__(self,*a):pass
    def read(self):return self.body

def urlopen(req,timeout):
    url=req.full_url;calls.append(url)
    assert req.get_header('User-agent')=='CareFlow-Sync/1.0', 'default urllib UA is blocked in production'
    if url.startswith('https://storage.example.invalid'):
        assert req.data==image, 'binary was changed/JSON encoded'
        assert req.get_header('Authorization') is None, 'bearer leaked to storage'
        return Response(b'')
    assert req.get_header('Authorization')=='Bearer PRIVATE_CALLBACK'
    if url.endswith('/manifest'):
        return Response(json.dumps({'eligible':scenario!='paused','items':[{'id':4,'driveFileId':'drive-assigned','byteSize':4,'mimeType':'image/jpeg'}]}).encode())
    if '/upload/4' in url:
        if scenario=='replay':return Response(b'{"status":"imported"}')
        return Response(json.dumps({'protocol':'careflow-direct-storage-v3','method':'PUT','byteSize':4,'headers':{'Content-Type':'image/jpeg'},'uploadUrl':'https://storage.example.invalid/exact'}).encode())
    if '/uploaded/4' in url:return Response(b'{"status":"imported"}')
    if url.endswith('/file-error'):
        assert json.loads(req.data)=={'itemId':4,'stage':'download'}
        return Response(b'{}')
    if url.endswith('/complete'):
        assert json.loads(req.data)=={'success':scenario!='download_failure','pauseFolderAfterCompletion':True}
        return Response(b'{}')
    raise AssertionError('unassigned request')
def download(args,cwd,capture_output,timeout):
    assert json.loads(args[args.index('--params')+1])=={'fileId':'drive-assigned','alt':'media'}
    assert args[-1]=='4.bin'
    assert Path(cwd).parent==Path.cwd()
    if scenario=='download_failure':return subprocess.CompletedProcess(args,1)
    (Path(cwd)/'4.bin').write_bytes(image)
    return subprocess.CompletedProcess(args,0)
w.urllib.request.urlopen=urlopen;w.subprocess.run=download
result=w.main()
assert result==(1 if scenario in ('paused','download_failure') else 0)
assert not list(Path.cwd().glob('.careflow-transfer-*')), 'source cleanup failed'
assert w.COUNTS['imported']==(1 if scenario in ('success','replay') else 0)
if scenario=='replay':assert not any('storage.example.invalid' in x for x in calls)
if scenario=='paused':assert len(calls)==1
`;
describe("fixed system sync Python worker",()=>{
  it.each(["success","replay","paused","download_failure"])("executes %s with the actual numeric manifest and preserves secrets/bytes",async scenario=>{
    const dir=await mkdtemp(`${tmpdir()}/careflow-worker-test-`);
    try {await writeFile(`${dir}/worker.py`,SYSTEM_SYNC_WORKER);await writeFile(`${dir}/fixture.py`,fixture);const result=await exec("python3",[`${dir}/fixture.py`,`${dir}/worker.py`,scenario],{cwd:dir});expect(result.stdout).not.toContain("PRIVATE_CALLBACK");expect(result.stderr).toBe("");}
    finally{await rm(dir,{recursive:true,force:true});}
  });
});
