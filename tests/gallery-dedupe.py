"""One-time exact-file cleanup via authenticated Gallery APIs. Token JSON on stdin.

Dry run by default. --apply removes only byte-identical copies and retains the
oldest row. --manifest writes survivor fingerprints for the SQL backfill; it
never writes tokens, signed URLs or image bytes.
"""
import argparse, concurrent.futures, hashlib, json, pathlib, sys, urllib.request

ROOT='https://qagsczjxzshjxmmxvkbq.supabase.co/functions/v1/lead-hub-gallery'
def fingerprint(data):
    return hashlib.sha256(data).hexdigest()
def duplicate_groups(rows):
    groups={}
    for row in sorted(rows,key=lambda r:(r['created_at'],r['id'])):
        groups.setdefault(row['sha256'],[]).append(row)
    return list(groups.values())
def run():
    parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');parser.add_argument('--manifest',required=True)
    args=parser.parse_args();token=json.load(sys.stdin)['admin']
    def call(action,**payload):
        req=urllib.request.Request(ROOT,data=json.dumps({'action':action,**payload}).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=45) as response: result=json.load(response)
        if not result.get('ok'): raise RuntimeError('Gallery operation failed')
        return result
    def read(url):
        with urllib.request.urlopen(url,timeout=45) as response: return response.read()
    rows=[];offset=0
    while True:
        page=call('list',offset=offset);rows.extend(page['files']);offset=page['next_offset']
        if offset is None: break
    def hashed(row):
        data=read(row['url'])
        if len(data)!=row['byte_size']: raise RuntimeError('Original image size mismatch: '+row['id'])
        return {key:row[key] for key in ['id','created_at','byte_size','model']}|{'sha256':fingerprint(data)}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: rows=list(pool.map(hashed,rows))
    groups=duplicate_groups(rows);deleted=0
    for group in groups:
        if len(group)<2 or not args.apply: continue
        keeper=group[0]
        # Recheck a currently available original before deleting any extra copy.
        original=call('download',id=keeper['id'])
        if fingerprint(read(original['url']))!=keeper['sha256']: raise RuntimeError('Keeper changed')
        for row in group[1:]:
            call('delete',id=row['id'],confirmed=True);deleted+=1
    manifest={'mode':'apply' if args.apply else 'dry-run','scanned':len(rows),'unique':len(groups),'duplicate_copies':sum(len(g)-1 for g in groups),'deleted':deleted,'survivors':[g[0] for g in groups],'duplicate_ids':[r['id'] for g in groups for r in g[1:]]}
    target=pathlib.Path(args.manifest);target.write_text(json.dumps(manifest));target.chmod(0o600)
    print(json.dumps({k:v for k,v in manifest.items() if k not in ['survivors','duplicate_ids']}))
if __name__=='__main__':run()
