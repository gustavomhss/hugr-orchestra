"""Read-only discovery plus explicit per-file dispositions. Never infer reachability."""
from __future__ import annotations
import argparse,json,subprocess,sys
from pathlib import Path, PurePosixPath
from effective_contract import load
ROOT=Path(__file__).resolve().parents[1]
REQUIRED_ROOTS = ('packages/app/src', 'packages/ui/src', 'packages/session-ui/src',
                  'packages/desktop/src/renderer')


def scan_roots(values, repo=None):
    """Normalize spelling, never silently shrink the contracted UI search universe."""
    if not isinstance(values, list) or not values:
        raise ValueError('CENSUS.scan_roots must be a nonempty array')
    roots = []
    for value in values:
        if (not isinstance(value, str) or not value or value.startswith(('/', '~'))
                or any(c in value for c in ('\\', '\x00', ':', '*', '?', '['))
                or '..' in value.split('/')):
            raise ValueError('unsafe census root')
        root = PurePosixPath(value).as_posix()
        if root == '.' or root in roots:
            raise ValueError('empty or duplicate normalized census root: ' + root)
        roots.append(root)
    missing = set(REQUIRED_ROOTS) - set(roots)
    if missing:
        raise ValueError('required census roots missing: ' + ', '.join(sorted(missing)))
    if repo is not None:
        base = Path(repo).resolve()
        for root in roots:
            path = base / root
            resolved = path.resolve()
            resolved.relative_to(base)
            if not path.is_dir() or resolved != path:
                raise ValueError('census root absent or redirected: ' + root)
    return roots

def discover(repo,roots):
    roots = scan_roots(roots, repo)
    raw=subprocess.check_output(['git','-C',str(repo),'ls-files','--cached','--others','--exclude-standard','-z'],timeout=30).decode()
    found = sorted({p for p in raw.split('\0') if p and any(p.startswith(x+'/') for x in roots) and p.endswith(('.tsx','.css')) and not any(x in p for x in ('.test.','.spec.','.stories.'))})
    if not found:
        raise ValueError('census discovered no UI; inspect checkout and scan scope')
    return found

def check(plan,surfaces,census,repo=None):
    from validate_plan import owners_for
    if not isinstance(census, dict):return ['CENSUS must be an object']
    try: roots = scan_roots(census.get('scan_roots'), repo)
    except (ValueError, OSError, RuntimeError) as exc:return [str(exc)]
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
        try: actual=set(discover(repo,roots))
        except (ValueError, OSError, RuntimeError, subprocess.SubprocessError) as exc:return errors+[str(exc)]
        for path in sorted(actual-set(seen)):errors.append('unclassified discovered UI '+path)
        for path in sorted(set(seen)-actual):errors.append('stale census file '+path)
    return errors

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--repo',type=Path,required=True);ap.add_argument('--out',type=Path);a=ap.parse_args()
    try:
        c=load(ROOT/'CENSUS.json');c['scan_roots']=scan_roots(c.get('scan_roots'),a.repo);existing={x['path']:x for x in c['files']}
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
