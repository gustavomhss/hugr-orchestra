"""Recalculate budgets from raw paired observations; never trust declared PASS."""
from __future__ import annotations
import argparse,json,math,statistics,sys,re
from pathlib import Path
from effective_contract import load,file_hash,digest
ROOT=Path(__file__).resolve().parents[1]

def statistic(xs,kind):
    if not xs or any(type(x) not in (int,float) or not math.isfinite(x) for x in xs):raise ValueError('missing/non-finite numeric samples')
    ys=sorted(xs)
    if kind=='max':return max(ys)
    if kind=='median':return statistics.median(ys)
    return ys[max(0,math.ceil(float(kind[1:])/100*len(ys))-1)]

def evaluate(raw,budgets,gates):
    errors=[];results=[]
    if not isinstance(budgets,dict) or not isinstance(budgets.get('metrics'),list):return {'status':'FAIL','errors':['budget contract invalid']}
    ids=set()
    for m in budgets['metrics']:
        if not isinstance(m,dict) or not isinstance(m.get('id'),str) or m['id'] in ids or m.get('mode') not in ('absolute','absolute_and_delta','delta','relative_delta') or m.get('stat') not in ('max','median','p95','p99') or type(m.get('min_samples')) is not int or m['min_samples']<5 or type(m.get('min_pairs')) is not int or m['min_pairs']<5:
            return {'status':'FAIL','errors':['invalid quantitative rule; no implicit PASS']}
        ids.add(m['id'])
    known={m['gate'] for m in budgets['metrics']}|set(budgets['computed_gates'])
    if not isinstance(gates,list) or not gates or any(not isinstance(g,str) for g in gates) or not set(gates)<=known or len(gates)!=len(set(gates)):return {'status':'FAIL','errors':['invalid requested gates']}
    if not isinstance(raw,dict) or raw.get('kind')!='paired-performance-observations':return {'status':'FAIL','errors':['invalid observations kind']}
    try: raw_digest=digest(raw)
    except (ValueError,TypeError):return {'status':'FAIL','errors':['non-finite or non-JSON raw observations']}
    env=raw.get('environment',{})
    if not isinstance(env,dict) or any(k not in env or env[k] is None for k in budgets['environment_keys']):errors.append('environment incomplete')
    if raw.get('baseline_environment')!=env:errors.append('A/B environments differ')
    if raw.get('budget_sha256')!=digest(budgets):errors.append('budget identity mismatch')
    for k in ['candidate_head','baseline_head']:
        if not isinstance(raw.get(k),str) or not re.fullmatch('[0-9a-f]{40}',raw[k]):errors.append('source head missing '+k)
    for k in ['candidate_build_sha256','baseline_build_sha256','fixture_sha256','candidate_features_sha256','baseline_features_sha256']:
        if not isinstance(raw.get(k),str) or not re.fullmatch('[0-9a-f]{64}',raw[k]):errors.append('build/fixture identity missing '+k)
    if raw.get('candidate_features_sha256')!=raw.get('baseline_features_sha256'):errors.append('baseline/candidate capabilities differ')
    if raw.get('build_mode')!='production' or raw.get('quiet_host') is not True:errors.append('production build and quiet host required')
    observed=raw.get('observations',[])
    if not isinstance(observed,list):return {'status':'FAIL','errors':errors+['observations not array']}
    by={}
    for ob in observed:
        if not isinstance(ob,dict) or not isinstance(ob.get('metric'),str):errors.append('invalid observation');continue
        if ob['metric'] in by:errors.append('duplicate metric '+ob['metric'])
        by[ob['metric']]=ob
    for rule in budgets['metrics']:
        if rule['gate'] not in gates:continue
        ident=rule['id'];e=[];vals=[];deltas=[]
        ob=by.get(ident)
        if not ob:results.append({'id':ident,'gate':rule['gate'],'status':'FAIL','errors':['metric absent']});continue
        if ob.get('unit')!=rule['unit'] or ob.get('profile')!=rule['profile']:e.append('unit/profile mismatch')
        if (raw.get('profiles') if isinstance(raw.get('profiles'),dict) else {}).get(rule['profile'])!=budgets['profiles'][rule['profile']]:e.append('workload mismatch')
        pairs=ob.get('pairs')
        if not isinstance(pairs,list) or len(pairs)<rule['min_pairs']:e.append('insufficient A/B pairs');pairs=[]
        counts=[0,0];names=set()
        for pair in pairs:
            try:
                name=pair['id']
                if not isinstance(name,str) or not name or name in names:raise ValueError('pair IDs invalid/duplicated')
                names.add(name)
                if pair.get('order') not in ('AB','BA'):raise ValueError('pair order not recorded')
                arrays=[pair['baseline'],pair['candidate']]
                for j,a in enumerate(arrays):
                    if not isinstance(a,list):raise ValueError('samples not array')
                    counts[j]+=len(a)
                b,c=[statistic(a,rule['stat']) for a in arrays]
                if rule['unit'] not in ('MiB/min','bytes/min') and any(v<0 for a in arrays for v in a):raise ValueError('negative measurement invalid for nonnegative unit')
                vals.append(c);deltas.append((b,c-b))
            except (KeyError,ValueError,TypeError) as exc:e.append(str(exc))
        if min(counts)<rule['min_samples']:e.append('insufficient samples')
        if pairs and len({x.get('order') for x in pairs if isinstance(x,dict)})<2:e.append('A/B order must alternate')
        status='FAIL' if e else 'PASS';aggregate=None
        if not e:
            flatb=[x for pair in pairs for x in pair['baseline']];flatc=[x for pair in pairs for x in pair['candidate']]
            b=statistic(flatb,rule['stat']);c=statistic(flatc,rule['stat']);aggregate={'base':b,'candidate':c,'samples':counts,'pairs':len(pairs)}
            checks=[];local=[]
            if rule['mode'] in ('absolute','absolute_and_delta'):
                checks.append(c<=rule['limit']);local += [v<=rule['limit'] for v in vals]
            if rule['mode']=='delta':
                checks.append(statistics.median(d for _,d in deltas)<=rule['limit']);local += [d<=rule['limit'] for _,d in deltas]
            if rule['mode'] in ('relative_delta','absolute_and_delta'):
                margins=[d-max(rule['delta_floor'],abs(v)*rule['relative']) for v,d in deltas]
                checks.append(statistics.median(margins)<=0);local += [v<=0 for v in margins]
            if not all(checks):status='FAIL'
            elif not all(local):status='INCONCLUSIVE'
        results.append({'id':ident,'gate':rule['gate'],'status':status,'errors':e,'aggregate':aggregate})
    gate_results=[]
    for g in gates:
        items=[x for x in results if x['gate']==g]
        passed=not errors and (all(x['status']=='PASS' for x in items) if g not in budgets['computed_gates'] else True)
        gate_results.append({'id':g,'status':'PASS' if passed else 'FAIL','metrics':items})
    return {'kind':'performance-evaluation','evaluator_version':budgets['evaluator_version'],'status':'FAIL' if errors or any(g['status']!='PASS' for g in gate_results) else 'PASS','head':raw.get('candidate_head'),'build_sha256':raw.get('candidate_build_sha256'),'environment':env,'budget_sha256':digest(budgets),'raw_sha256':raw_digest,'gates':gate_results,'errors':errors}

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('observations',type=Path);ap.add_argument('--gates',nargs='+',required=True);ap.add_argument('--out',type=Path);a=ap.parse_args()
    try:
        result=evaluate(load(a.observations),load(ROOT/'BUDGETS.json'),a.gates);text=json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n'
        if a.out:
            a.out.parent.mkdir(parents=True,exist_ok=True)
            with a.out.open('x',encoding='utf-8') as f:f.write(text)
        else:print(text,end='')
        return int(result['status']!='PASS')
    except (OSError,ValueError,KeyError,TypeError) as e:print(json.dumps({'status':'FAIL','errors':[str(e)]}));return 1
if __name__=='__main__':sys.exit(main())
