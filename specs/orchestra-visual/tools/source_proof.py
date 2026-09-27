"""Read-only Git attribution. No reset/stash/clean; isolated lane commits are required."""
from __future__ import annotations
import hashlib,json,subprocess,fnmatch,re,os
from pathlib import Path
from effective_contract import file_hash,load,digest

def git(repo,*args):
    return subprocess.check_output(['git','-C',str(repo),*args],timeout=30,stderr=subprocess.PIPE).decode('utf-8')

def is_ancestor(repo,a,b):
    if not re.fullmatch('[0-9a-f]{40}',str(a)) or not re.fullmatch('[0-9a-f]{40}',str(b)):return False
    return subprocess.run(['git','-C',str(repo),'merge-base','--is-ancestor',a,b],capture_output=True,timeout=30).returncode==0

def metadata(path):
    return path.startswith('specs/orchestra-visual/evidence/') or path=='specs/orchestra-visual/progress.json'

def file_state(repo,p):
    path=Path(repo)/p
    if path.is_symlink():return 'symlink:'+hashlib.sha256(os.readlink(path).encode()).hexdigest()
    if not path.exists():return 'deleted'
    if not path.is_file():return 'non-file'
    return file_hash(path)

def snapshot(repo):
    dirty=set(filter(None,(git(repo,'diff','--name-only','--no-renames','-z','HEAD')+git(repo,'ls-files','--others','--exclude-standard','-z')).split('\0')))
    return {'schema_version':1,'kind':'task-source-baseline','head':git(repo,'rev-parse','HEAD').strip(),'dirty':{p:file_state(repo,p) for p in sorted(dirty) if not metadata(p)},'dirty_index':{p:git(repo,'ls-files','--stage','-z','--',p) for p in sorted(dirty) if not metadata(p)},'index_sha256':hashlib.sha256(git(repo,'ls-files','--stage','-z').encode()).hexdigest()}

def scoped(node,path):
    return any(fnmatch.fnmatchcase(path,p) for p in node.get('write_paths',[])+node.get('leased_write_paths',[])) and not any(fnmatch.fnmatchcase(path,p) for p in node.get('exclude_paths',[]))

def tree_entry(repo, revision, path):
    # Includes mode and object identity; absence is significant for deleted paths.
    return git(repo,'ls-tree','-z',revision,'--',path)


def imported_grants(node,receipt,root,repo):
    from validate_evidence import local_file,validate_receipt
    refs=receipt.get('source',{}).get('imported_receipts',[])
    if not isinstance(refs,list) or len(refs)>39:raise ValueError('invalid/bounded imported receipt list')
    if refs and not node['id'].startswith('S25-'):raise ValueError('only S25 integrates other owners')
    plan=load(root/'PLAN.json');by={n['id']:n for n in plan['nodes']};grants={}
    seen=set()
    for ref in refs:
        path=local_file(root,ref)
        if ref in seen:raise ValueError('duplicate imported receipt')
        seen.add(ref)
        if receipt.get('artifacts',{}).get(ref)!=file_hash(path):raise ValueError('imported receipt hash missing/altered')
        proof=load(path);child=by.get(proof.get('id'))
        if not child or child['kind']!='task' or child['id'].startswith('S25-'):raise ValueError('import must identify another leaf owner task')
        if proof.get('source',{}).get('imported_receipts'):raise ValueError('nested imports not supported; provide direct owner receipts')
        errs=validate_receipt(child,proof,root,repo=None,plan=plan)+footprint(child,proof,root,repo,allow_imports=False)
        if errs:raise ValueError('invalid imported delivery '+proof['id']+': '+ '; '.join(errs))
        if not is_ancestor(repo,proof['head'],receipt['head']):raise ValueError('imported source absent from candidate ancestry')
        for changed in proof['paths_changed']:
            if not scoped(child,changed):raise ValueError('imported path not owned by producer')
            grants.setdefault(changed,set()).add(tree_entry(repo,proof['head'],changed))
    return grants


def footprint(node,receipt,root,repo,allow_imports=True):
    from validate_evidence import local_file
    errors=[];source=receipt.get('source')
    if not isinstance(source,dict):return ['source attribution missing; capture baseline before work']
    try:
        ref=source['baseline_file'];path=local_file(root,ref)
        if receipt.get('artifacts',{}).get(ref)!=file_hash(path):raise ValueError('source baseline hash absent or altered')
        baseline=load(path);base=baseline['head'];head=receipt['head']
        if baseline.get('kind')!='task-source-baseline' or baseline.get('schema_version')!=1:raise ValueError('source baseline kind/schema invalid')
        if not is_ancestor(repo,base,head):raise ValueError('task baseline not ancestor of verified head')
        commits=source.get('commits')
        actual=git(repo,'rev-list','--reverse','--topo-order',base+'..'+head).splitlines()
        if not isinstance(commits,list) or commits!=actual:raise ValueError('task commit range incomplete/interleaved; isolate lane or account before starting')
        touched=set()
        for commit in actual:
            parents=git(repo,'rev-list','--parents','-n','1',commit).split()[1:]
            if not parents or (len(parents)!=1 and not node['id'].startswith('S25-')):raise ValueError('only S25 may record merge commits; leaf lanes require linear task commits')
            touched.update(filter(None,git(repo,'diff','--name-only','--no-renames','-z',parents[0],commit).split('\0')))
        touched={p for p in touched if not metadata(p)}
        declared=set(receipt.get('paths_changed',[]))
        if touched!=declared:errors.append('actual Git footprint differs from paths_changed: '+str(sorted(touched^declared)))
        grants=imported_grants(node,receipt,root,repo) if allow_imports else {}
        for path in sorted(touched):
            if not scoped(node,path) and tree_entry(repo,head,path) not in grants.get(path,set()):errors.append('actual changed path outside owner or imported version: '+path)
        before=baseline.get('dirty',{})
        if not isinstance(before,dict):raise ValueError('baseline dirty inventory invalid')
        current=snapshot(repo)
        for path,sha in before.items():
            if path in touched or file_state(repo,path)!=sha or git(repo,'ls-files','--stage','-z','--',path)!=baseline.get('dirty_index',{}).get(path):errors.append('preexisting user change touched: '+path)
        newdirty=set(current['dirty'])-set(before)
        if current['head']!=head:
            watched=node.get('source_watch_paths',node.get('write_paths',[]))
            newdirty={p for p in newdirty if any(fnmatch.fnmatchcase(p,w) for w in watched)}
        if newdirty:errors.append('uncommitted/unassigned changes after task: '+', '.join(sorted(newdirty)))
        if any(any(fnmatch.fnmatchcase(path,p) for p in node.get('read_paths',[])+node.get('write_paths',[])) for path in before):errors.append('preexisting dirty overlaps proof scope; use another worktree without clearing user work')
        if any('/src/generated/' in p or '/src/generated-effect/' in p for p in touched) and not node['id'].startswith('S25-'):
            codegen=source.get('codegen',{})
            plan=load(root/'PLAN.json')
            grants=[x for x in plan.get('shared_write_leases',[]) if node['id'] in x['tasks']]
            if len(grants)!=1 or grants[0].get('status')!='local-command-footprint-verified':errors.append('codegen footprint has not been locally verified in the canonical contract')
            commands=receipt.get('commands',[])
            if not any(c.get('command')=='bun run generate' and str(c.get('cwd','')).rstrip('/').endswith('packages/client') and c.get('exit_code')==0 for c in commands):errors.append('generated output lacks official generation command')
            if not any(c.get('command')=='bun run check:generated' and str(c.get('cwd','')).rstrip('/').endswith('packages/client') and type(c.get('exit_code')) is int and c.get('exit_code')==0 for c in commands):errors.append('generated output lacks idempotence check')
            if codegen.get('manual_edits') is not False or codegen.get('outputs')!=sorted(p for p in touched if '/src/generated/' in p or '/src/generated-effect/' in p):errors.append('codegen footprint/provenance missing')
    except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError) as e:errors.append(str(e))
    return errors

def external_proof(ref,record,root,repo):
    """External authority must be in candidate ancestry or an installed hashed artifact."""
    from validate_evidence import local_file
    errors=[]
    try:
        if repo is None:raise ValueError('external capability requires --repo validation')
        path=local_file(root,record.get('evidence'))
        if record.get('evidence_sha256')!=file_hash(path):raise ValueError('external receipt hash absent/altered')
        proof=load(path)
        if proof.get('kind')!='external-capability-proof' or proof.get('schema_version')!=1 or proof.get('status')!='PASS' or proof.get('ref')!=ref:raise ValueError('external proof schema/binding invalid')
        current=git(repo,'rev-parse','HEAD').strip()
        if proof.get('candidate_head')!=current:raise ValueError('external public path must be rechecked on the current candidate')
        dirty=snapshot(repo)['dirty']
        if any(p.startswith('packages/') or p in ('bun.lock','package.json') for p in dirty):raise ValueError('external capability cannot be verified against dirty product source; use an isolated worktree')
        binding=proof['binding'];kind=binding.get('kind')
        if kind=='same-repository':
            if binding.get('repo')!='gmhelmold/HuGR-Orchestra' or not is_ancestor(repo,binding.get('head'),current):raise ValueError('external authority not in candidate ancestry')
        elif kind=='installed-artifact':
            for item in [binding.get('artifact'),binding.get('lockfile')]:
                if not isinstance(item,dict):raise ValueError('installed artifact and lockfile bindings required')
                p=item['path'];resolved=(Path(repo)/p).resolve();resolved.relative_to(Path(repo).resolve())
                if p.startswith('/') or '..' in Path(p).parts or not resolved.is_file() or file_hash(resolved)!=item.get('sha256'):raise ValueError('installed artifact/lockfile absent or altered')
        else:raise ValueError('unknown external binding kind')
        if not proof.get('public_path') or not proof.get('tests') or not isinstance(proof['tests'],list):raise ValueError('executed public-path tests required')
        positive=negative=False
        inventory=proof.get('artifacts',{})
        for test in proof['tests']:
            if type(test.get('exit_code')) is not int or test.get('exit_code')!=0 or not isinstance(test.get('command'),str) or not test.get('command').strip() or not isinstance(test.get('cwd'),str) or not test.get('cwd').strip():raise ValueError('external verification command did not pass')
            f=local_file(root,test.get('log'))
            if inventory.get(test['log'])!=file_hash(f):raise ValueError('external command evidence altered/missing')
            positive|=test.get('case')=='public-positive';negative|=test.get('case')=='public-negative'
        if not positive or not negative:raise ValueError('external capability needs positive and negative public cases')
        review=local_file(root,proof.get('review_file'))
        if inventory.get(proof['review_file'])!=file_hash(review):raise ValueError('external review evidence missing/altered')
    except (ValueError,OSError,TypeError,KeyError,subprocess.SubprocessError) as e:errors.append(str(e))
    return errors


def source_errors(node, receipt, snapshot):
    """Read-only Git compatibility check. Does not treat old unrelated commits as stale."""
    head = receipt.get('head')
    if head not in snapshot.get('ancestors', []):
        return ['receipt source is absent or not an ancestor of current checkout']
    if node['id'].startswith('S25-W0-') and node.get('source_watch_mode')=='historical':
        return []  # Pilot milestone; the effective contract is checked separately.
    changes = snapshot.get('changed_since', {}).get(head, []) + snapshot.get('dirty', [])
    # Receipts are written after the measured source commit. Their integrity is
    # checked by hashes above; writing them is not a product-source mutation.
    # Source maps, fixtures, contracts and DELIVERY.md are NOT excluded here.
    changes = [p for p in changes if not p.startswith('specs/orchestra-visual/evidence/')
               and p != 'specs/orchestra-visual/progress.json']
    if node.get('source_watch_mode')=='historical':
        # Discovery observes a revision; future planned product edits do not alter
        # that observation. Canonical contract digests and per-file census checks
        # still run before admitting consumers.
        changes=[p for p in changes if p.startswith('specs/orchestra-visual/')]
    patterns = node.get('source_watch_paths',node.get('read_paths',[])+node.get('write_paths',[]))
    affected = [p for p in changes if any(fnmatch.fnmatchcase(p, pat) for pat in patterns)]
    if node['id'] in ('S23-W1-T2', 'S24-W1-T2', 'S25-W1-T2'):
        affected += [p for p in changes if p.startswith('packages/') or p in ('bun.lock', 'package.json', 'turbo.json')]
    if affected:
        return ['STALE: relevant source changed since verification: ' + ', '.join(sorted(set(affected))[:12])]
    return []


def git_snapshot(repo, progress):
    def git(*args):
        return subprocess.check_output(['git', '-C', str(repo), *args], text=True, timeout=30)
    current = git('rev-parse', 'HEAD').strip()
    heads = {r['head'] for r in progress.get('tasks', {}).values()
             if isinstance(r, dict) and r.get('status') == 'PASS' and isinstance(r.get('head'), str)
             and re.fullmatch(r'[0-9a-f]{40}', r['head'])}
    dirty = set(filter(None, (git('diff', '--name-only', '--no-renames', '-z', 'HEAD') + git('ls-files', '--others', '--exclude-standard', '-z')).split('\0')))
    result = {'head': current, 'repo':str(repo.resolve()), 'ancestors': [], 'changed_since': {}, 'dirty': sorted(dirty)}
    for head in sorted(heads):
        check = subprocess.run(['git', '-C', str(repo), 'merge-base', '--is-ancestor', head, current],
                               capture_output=True, timeout=30)
        if check.returncode == 0:
            result['ancestors'].append(head)
            result['changed_since'][head] = list(filter(None, git('diff', '--name-only','--no-renames', '-z', head, current).split('\0')))
    return result
