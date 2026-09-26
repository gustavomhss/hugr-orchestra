"""Read-only discovery plus explicit per-file dispositions. Never infer reachability."""
from __future__ import annotations
import argparse,json,subprocess,sys
from pathlib import Path
from effective_contract import load
ROOT=Path(__file__).resolve().parents[1]

def discover(repo,roots):
    raw=subprocess.check_output(['git','-C',str(repo),'ls-files','--cached','--others','--exclude-standard','-z'],timeout=30).decode()
    return sorted({p for p in raw.split('\0') if p and any(p.startswith(x+'/') for x in roots) and p.endswith(('.tsx','.css')) and not any(x in p for x in ('.test.','.spec.','.stories.'))})

def check(plan,surfaces,census,repo=None):
    from validate_plan import owners_for
    errors=[];entries=census.get('files',[])
    if not isinstance(entries,list):return ['CENSUS.files must be an array']
    by={n['id']:n for n in plan['nodes']};rows={x['id']:x for x in surfaces['surfaces']};seen={}
    for entry in entries:
        if not isinstance(entry,dict) or not isinstance(entry.get('path'),str):errors.append('invalid census entry');continue
        path=entry['path']
        if path in seen:errors.append('duplicate census path '+path)
        seen[path]=entry
        if entry.get('disposition') not in ['migrate','inherit','out-of-scope']:errors.append('unclassified UI '+path)
        if not isinstance(entry.get('reason'),str) or len(entry['reason'].strip())<15:errors.append('census reason missing '+path)
        if not isinstance(entry.get('source'),str) or not entry['source'].strip():errors.append('census source missing '+path)
        if entry.get('disposition')=='migrate':
            owner=entry.get('owner');ids=entry.get('surface_ids',[])
            if owners_for([path],plan['nodes']).get(path)!=[owner]:errors.append('census writer mismatch '+path)
            if not ids or any(i not in rows or rows[i]['owner']!=owner for i in ids):errors.append('UI capture mapping absent '+path)
        elif entry.get('disposition')=='inherit':
            if not entry.get('surface_ids') or any(i not in rows for i in entry['surface_ids']):errors.append('inherit needs consumer coverage '+path)
    if repo:
        actual=set(discover(repo,census['scan_roots']))
        for path in sorted(actual-set(seen)):errors.append('unclassified discovered UI '+path)
        for path in sorted(set(seen)-actual):errors.append('stale census file '+path)
    return errors

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--repo',type=Path,required=True);ap.add_argument('--out',type=Path);a=ap.parse_args()
    try:
        c=load(ROOT/'CENSUS.json');existing={x['path']:x for x in c['files']}
        c['files']=[existing.get(p,{'path':p,'disposition':'UNCLASSIFIED','owner':None,'surface_ids':[],'reason':'','source':'git index/untracked discovery; reachability not yet reviewed'}) for p in discover(a.repo,c['scan_roots'])]
        c['source_sha']=subprocess.check_output(['git','-C',str(a.repo),'rev-parse','HEAD'],text=True).strip();c['status']='CANDIDATE_REQUIRES_REVIEW'
        text=json.dumps(c,ensure_ascii=False,indent=2)+'\n'
        if a.out:
            a.out.parent.mkdir(parents=True,exist_ok=True)
            with a.out.open('x',encoding='utf-8') as f:f.write(text)
        else:print(text,end='')
        return 0
    except (OSError,ValueError,KeyError,subprocess.SubprocessError) as e:print(json.dumps({'status':'FAIL','error':str(e)}));return 1
if __name__=='__main__':sys.exit(main())
