#!/usr/bin/env python3
"""Read-only plan audit. Uses synthetic inputs, NOT measurements of Orchestra."""
from __future__ import annotations
import argparse, collections, copy, functools, hashlib, itertools, json, sys, tempfile
from pathlib import Path


def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args(); root=args.package.resolve()
    sys.dont_write_bytecode=True
    sys.path.insert(0,str(root/'tools'))
    import select_work as sw
    import evaluate_performance as ep
    from test_support import raw_fixture, png
    from visual_coverage import required_captures,validate_captures
    from effective_contract import digest,file_hash
    plan=json.loads((root/'PLAN.json').read_text());bud=json.loads((root/'BUDGETS.json').read_text())
    by={n['id']:n for n in plan['nodes']};tasks={i:n for i,n in by.items() if n['kind']=='task'}
    @functools.lru_cache(None)
    def ancestors(i):
        result=set()
        for dep in sw.dependencies(by,i):
            if dep in tasks:result.add(dep)
            result.update(ancestors(dep))
        return result
    parallel=[(a,b) for a,b in itertools.combinations(tasks,2) if a not in ancestors(b) and b not in ancestors(a)]
    conflicts=[];write_conflicts=[]
    for a,b in parallel:
        if sw.conflict(tasks[a],tasks[b]):
            locks=sorted(set(tasks[a].get('resource_locks',[]))&set(tasks[b].get('resource_locks',[])))
            conflicts.append({'a':a,'b':b,'common_locks':locks})
            # Remove resource locks to test declared file cones separately.
            aa={**tasks[a],'resource_locks':[]};bb={**tasks[b],'resource_locks':[]}
            if sw.conflict(aa,bb):write_conflicts.append([a,b])
    def simulation(data):
        progress={'tasks':{},'external':{e['ref']:{'status':'PASS'} for n in data['nodes'] for e in n.get('external_requires',[])}}
        rounds=[]
        for _ in range(100):
            result=sw.select(data,progress,root=root,jobs=4,check_evidence=False)
            selected=[n['id'] for n in result['selected']]
            if not selected:return {'rounds':rounds,'completed':result['completed_tasks'],'status':result['status']}
            rounds.append(selected)
            for ident in selected:progress['tasks'][ident]={'status':'PASS'}
        raise RuntimeError('Graph simulation did not terminate')
    sim=simulation(plan)
    remaining=set(tasks); done=set(); dependency_waves=[]
    while remaining:
        ready=sorted(i for i in remaining if ancestors(i)<=done)
        if not ready:raise ValueError('Declared dependency graph does not converge')
        dependency_waves.append(ready); done.update(ready); remaining.difference_update(ready)
    lock_owners=[i for i,n in tasks.items() if 'exclusive-benchmark-hardware' in n.get('resource_locks',[])]
    p03=raw_fixture(root,['P03'])
    for ob in p03['observations']:
        base,cand=(8,49) if ob['metric'].startswith('input_paint') else ((10,90) if ob['metric']=='hot_tab' else (8,40))
        for pair in ob['pairs']:
            pair['baseline']=[base]*len(pair['baseline']);pair['candidate']=[cand]*len(pair['candidate'])
    input_result=ep.evaluate(p03,bud,['P03']);assert input_result['status']=='PASS'
    over=copy.deepcopy(p03)
    for pair in over['observations'][0]['pairs']:pair['candidate']=[51]*len(pair['candidate'])
    over_result=ep.evaluate(over,bud,['P03']);assert over_result['status']=='FAIL'
    slope_results={}
    for candidate in [-1000,0,1]:
        raw=raw_fixture(root,['P10'])
        ob=next(x for x in raw['observations'] if x['metric']=='residual_slope')
        for pair in ob['pairs']:
            pair['baseline']=[0]*len(pair['baseline']);pair['candidate']=[candidate]*len(pair['candidate'])
        result=ep.evaluate(raw,bud,['P10'])
        slope_results[str(candidate)]={'overall':result['status'],'metric':next(x for g in result['gates'] for x in g['metrics'] if x['id']=='residual_slope')}
    assert [slope_results[str(x)]['overall'] for x in (-1000,0,1)]==['FAIL','PASS','FAIL']
    captures={i:len(required_captures(n,root)) for i,n in tasks.items() if n['evidence_requirements']['visual']=='required'}
    zero_rows=[i for i,n in captures.items() if n==0]
    policy=json.loads((root/'COVERAGE.json').read_text())
    # Test ONLY the formal coverage validator, not the complete task receipt.
    with tempfile.TemporaryDirectory() as tmp:
        t=Path(tmp);(t/'unrelated.png').write_bytes(png(128,128));(t/'review.txt').write_text('Synthetic coverage-validator probe, not product evidence.\n')
        node=by['S20-W1-T2']
        manifest={'kind':'visual-capture-manifest','head':'a'*40,'build_sha256':'b'*64,
          'master_sha256':policy['master_sha256'],'fixture_sha256':file_hash(root/policy['fixture_path']),
          'coverage_sha256':digest(required_captures(node,root)),'theme':policy['theme'],'flags':policy['flags'],
          'synthetic':True,'captures':[{'surface_id':'UNRELATED-SYNTHETIC','state_id':'default','viewport':[128,128],
          'dpr':1,'zoom':100,'host':'web','path':'unrelated.png','platform':'synthetic-test','producer':'playwright',
          'review_status':'PASS','known_defects':[],'review_file':'review.txt','masks':[]}]}
        coverage_errors=validate_captures(node,manifest,root,'a'*40,'b'*64,lambda p:t/p)
        assert not coverage_errors
        normal=by['S24-W1-T2'];manifest['coverage_sha256']=digest(required_captures(normal,root))
        final_errors=validate_captures(normal,manifest,root,'a'*40,'b'*64,lambda p:t/p)
        assert any('incomplete' in e for e in final_errors)
    meta=[i for i in tasks if i.startswith('I')]
    size={f.name:{'lines':len(f.read_text().splitlines()),'bytes':f.stat().st_size} for f in (root/'tools').glob('*.py')}
    result={
      'kind':'adversarial-planning-review-not-product-benchmark','synthetic':True,
      'plan_sha256':file_hash(root/'PLAN.json'),'plan_revision':plan['contract_revision'],
      'node_counts':dict(collections.Counter(n['kind'] for n in by.values())),
      'parallel_pairs':len(parallel),'declared_write_conflicts_between_independent_tasks':write_conflicts,
      'resource_conflicts':conflicts,'host_exclusive_tasks':lock_owners,
      'synthetic_jobs4_equal_duration':sim,
      'synthetic_unlimited_precedence_only_waves':dependency_waves,
      'write_conflict_protection':[{'tasks':[a,b],'common_locks':sorted(set(tasks[a].get('resource_locks',[])) & set(tasks[b].get('resource_locks',[])))} for a,b in write_conflicts],
      'input_fingerprints':{name:{'sha256':file_hash(root/name),'git_blob_sha1':hashlib.sha1(b'blob '+str((root/name).stat().st_size).encode()+b'\0'+(root/name).read_bytes()).hexdigest()} for name in ['PLAN.json','SURFACES.json','BUDGETS.json','COVERAGE.json','tools/select_work.py','tools/evaluate_performance.py','tools/visual_coverage.py']},
      'important_prerequisites':{i:sorted(ancestors(i)) for i in ['S06-W1-T1','S11-W1-T1','S25-W0-T1','S25-W0-T2','S25-W1-T1']},
      'quantitative':{'input_regression_8_to_49_ms':input_result,'input_overbudget_51_ms_control':over_result,'memory_slope':slope_results},
      'visual':{'required_rows_by_task':captures,'required_category_with_zero_rows':zero_rows,
                'S20_unrelated_128px_manifest_errors':coverage_errors,'S24_same_manifest_negative_control':final_errors},
      'coordination_only_tasks':meta,
      'static_rules_requiring_5_pairs':[{k:m[k] for k in ['id','mode','min_samples','min_pairs']} for m in bud['metrics'] if m['gate']=='P01'],
      'P10_consumers':[i for i,n in tasks.items() if 'P10' in n['required_performance_gates']],
      'candidate_producer_quality_standards':by['S25-W1-T1']['axioms']['quality_standards'],
      'candidate_producer_quality_stage':{k:v for k,v in by['S25-W1-T1']['criterion_evaluation_stage'].items() if 'QUALITY_STANDARDS' in k},
      'files':size,
      'limitations':['No Orchestra build, Electron run or runtime benchmark.','No full product checkout in this container; declared scopes and selected connector reads only.','Scheduling rounds assume all tasks take one unit and all external prerequisites exist; not a delivery estimate.','128px probe tests capture coverage only, not every source/receipt/census gate.']}
    args.out.parent.mkdir(parents=True,exist_ok=True)
    with args.out.open('x',encoding='utf-8') as out:
        out.write(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
    print(json.dumps({'status':'AUDIT_REPRODUCED','parallel_pairs':len(parallel),'declared_write_conflicts_including_serialized_codegen':len(write_conflicts),
       'host_locks':len(lock_owners),'jobs4_equal_duration_rounds':len(sim['rounds']),
       'p03_regression_result':input_result['status'],'memory_slope_states':{k:v['overall'] for k,v in slope_results.items()},
       'zero_visual_coverage_tasks':zero_rows,'report':str(args.out)},ensure_ascii=False,indent=2))
    return 0
if __name__=='__main__':raise SystemExit(main())
