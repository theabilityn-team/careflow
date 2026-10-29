export const SYSTEM_SYNC_WORKER = String.raw`#!/usr/bin/env python3
import json, os, tempfile, subprocess, shutil, urllib.request, urllib.error, time
from pathlib import Path

BASE = os.environ['CAREFLOW_SYNC_BASE'].rstrip('/')
TOKEN = os.environ['CAREFLOW_SYNC_TOKEN']
PAUSE = os.environ.get('CAREFLOW_SYNC_PAUSE_AFTER') == '1'
COUNTS = dict(imported=0, attached=0, needs_review=0, failed=0)
TERMINAL = {'imported', 'attached', 'needs_review'}

class TransferError(Exception):
    def __init__(self, stage, status=0):
        self.stage, self.status = stage, status
        super().__init__(stage)

def request(path, payload=None, raw=None, headers=None, signed=False):
    url = path if signed else BASE + path
    hdr = dict(headers or {})
    hdr['User-Agent'] = 'CareFlow-Sync/1.0'
    if signed:
        if not url.startswith('https://'):
            raise TransferError('upload')
        data = raw
    else:
        hdr['Authorization'] = 'Bearer ' + TOKEN
        hdr['Content-Type'] = 'application/json'
        data = None if payload is None else json.dumps(payload).encode()
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, data=data, headers=hdr,
                                         method='PUT' if signed else ('GET' if payload is None else 'POST'))
            with urllib.request.urlopen(req, timeout=180) as resp:
                body = resp.read() if not signed else b''
                return {} if signed else json.loads(body)
        except urllib.error.HTTPError as err:
            if err.code in (409, 410):
                raise TransferError('paused', err.code)
            if (err.code == 429 or err.code >= 500) and attempt < 2:
                try: delay = min(60, max(1, int(err.headers.get('Retry-After', '3'))))
                except (ValueError, TypeError): delay = 3
                time.sleep(delay)
                continue
            raise TransferError('upload', err.code)
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            if attempt < 2:
                time.sleep(2)
                continue
            raise TransferError('upload')

def failure(item_id, err):
    COUNTS['failed'] += 1
    data = {'itemId': item_id, 'stage': 'download' if err.stage == 'download' else 'upload'}
    if 100 <= err.status <= 599: data['httpStatus'] = err.status
    request('/file-error', data)

def main():
    work = None
    try:
        manifest = request('/manifest')
        if manifest.get('eligible') is not True:
            raise TransferError('paused')
        items = manifest.get('items')
        if not isinstance(items, list): raise TransferError('manifest')
        work = Path(tempfile.mkdtemp(prefix='.careflow-transfer-', dir=os.getcwd()))
        for item in items:
            item_id, drive_id, size = item.get('id'), item.get('driveFileId'), item.get('byteSize')
            if type(item_id) is not int or item_id < 1 or not isinstance(drive_id, str) or type(size) is not int or not 0 < size <= 25000000:
                raise TransferError('manifest')
            name = str(item_id) + '.bin'
            path = work / name
            try:
                done = request('/upload/' + str(item_id), {})
                if done.get('status') in TERMINAL:
                    COUNTS[done['status']] += 1
                    continue
                if done.get('protocol') != 'careflow-direct-storage-v3' or done.get('byteSize') != size or done.get('method') != 'PUT':
                    raise TransferError('upload')
                mime = item.get('mimeType')
                if mime not in ('image/jpeg','image/png','image/webp') or done.get('headers') != {'Content-Type': mime}:
                    raise TransferError('upload')
                try:
                    cp = subprocess.run(['gws','drive','files','get','--params',json.dumps({'fileId':drive_id,'alt':'media'}),'--output',name], cwd=work, capture_output=True, timeout=180)
                    if cp.returncode != 0 or not path.is_file() or path.stat().st_size != size:
                        raise TransferError('download')
                    content = path.read_bytes()
                except (subprocess.SubprocessError, OSError):
                    raise TransferError('download')
                valid = (mime == 'image/jpeg' and content[:2] == b'\xff\xd8') or (mime == 'image/png' and content[:8] == b'\x89PNG\r\n\x1a\n') or (mime == 'image/webp' and content[:4] == b'RIFF' and content[8:12] == b'WEBP')
                if not valid: raise TransferError('download')
                request(done['uploadUrl'], raw=content, headers={'Content-Type':mime}, signed=True)
                outcome = request('/uploaded/' + str(item_id), {})
                if outcome.get('status') not in TERMINAL: raise TransferError('upload')
                COUNTS[outcome['status']] += 1
            except TransferError as err:
                if err.stage == 'paused': raise
                failure(item_id, err)
            finally:
                path.unlink(missing_ok=True)
        request('/complete', {'success':COUNTS['failed'] == 0, 'pauseFolderAfterCompletion': PAUSE})
        return 0 if COUNTS['failed'] == 0 else 1
    except TransferError as err:
        if err.stage != 'paused':
            try: request('/complete', {'success':False, 'pauseFolderAfterCompletion':True})
            except TransferError: pass
        print(json.dumps({'stage':err.stage,'httpStatus':err.status}), flush=True)
        return 1
    finally:
        if work: shutil.rmtree(work, ignore_errors=True)
        print(json.dumps(COUNTS), flush=True)

if __name__ == '__main__':
    raise SystemExit(main())
`;
