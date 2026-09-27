"""Objective capture coverage; deliberately not an aesthetic or authenticity judge."""
from __future__ import annotations
import json
from effective_contract import load,digest,file_hash
from png_check import decode_png

def required_captures(node,root):
    policy=load(root/'COVERAGE.json');surfaces=load(root/'SURFACES.json')['surfaces'];owner=node['id'].split('-')[0]
    if node['id'].startswith('S25-W0'):
        rows=[r for r in surfaces if r['id'] in policy['pilot_surface_ids']];views=[policy['primary_viewport'],[1366,768]];extras=[]
    else:
        all_ui=node['id'].startswith(('S24-','S25-W1-T2'))
        rows=[r for r in surfaces if r['inventory_class']=='ui-surface' and r['disposition'] in ('migrate','inherit') and (all_ui or r['owner']==owner)]
        views=policy['viewports'];extras=policy['extra_profiles']
    bindings=policy.get('task_consumer_states', {}).get(node['id'])
    if bindings is not None:
        if not isinstance(bindings,list) or not bindings:raise ValueError('mandatory consumer binding is empty')
        catalog={row['id']:row for row in surfaces};rows=[]
        for binding in bindings:
            row=catalog.get(binding.get('surface_id'))
            if not row or row.get('inventory_class')!='ui-surface':raise ValueError('visual consumer missing/not a UI surface')
            states=binding.get('states')
            allowed=row['states']+row.get('conditional_states',[])
            if not isinstance(states,list) or not states or any(s not in allowed for s in states):raise ValueError('visual consumer state missing/invalid')
            rows.append({**row,'states':states})
        # Consumer-bound checks use primary states and a single narrow viewport;
        # integrated coverage still covers all standard viewports and DPR profiles.
        views=[policy['primary_viewport'],[1366,768]];extras=[]
    specs=[]
    for r in rows:
        host=r.get('coverage_host','web')
        for state in r['states']:
            specs.append({'surface_id':r['id'],'state_id':state,'viewport':policy['primary_viewport'],'dpr':1,'zoom':100,'host':host})
        for view in views:
            if view!=policy['primary_viewport']:specs.append({'surface_id':r['id'],'state_id':'default','viewport':view,'dpr':1,'zoom':100,'host':host})
        for prof in extras:specs.append({'surface_id':r['id'],'state_id':'default','host':host,**prof})
    return sorted(specs,key=key)

def key(x):return (x['surface_id'],x['state_id'],tuple(x['viewport']),x['dpr'],x['zoom'],x['host'])

def validate_captures(node,report,root,head,build,artifact):
    errors=[];required=required_captures(node,root);policy=load(root/'COVERAGE.json')
    if not isinstance(report,dict) or report.get('kind')!='visual-capture-manifest':return ['visual capture manifest missing/type invalid']
    expected_binding={'head':head,'build_sha256':build,'master_sha256':policy['master_sha256'],'fixture_sha256':file_hash(root/policy['fixture_path']),'coverage_sha256':digest(required),'theme':policy['theme'],'flags':policy['flags']}
    for k,v in expected_binding.items():
        if report.get(k)!=v:errors.append('visual binding mismatch: '+k)
    entries=report.get('captures')
    if not isinstance(entries,list) or not entries:return errors+['visual captures must be nonempty']
    if node.get('evidence_requirements',{}).get('visual')=='required' and not required:
        errors.append('mandatory visual category has no required consumer captures')
    seen=set();decoded={}
    expected={key(x) for x in required}
    for e in entries:
        try:
            if not isinstance(e,dict):raise ValueError('invalid capture')
            k=key(e)
            if k in seen:raise ValueError('duplicate capture coverage')
            seen.add(k)
            if expected and k not in expected:raise ValueError('capture does not match a required consumer/state/profile')
            if not isinstance(e.get('platform'),str) or not e['platform'].strip():raise ValueError('capture platform absent')
            if e.get('producer') not in ('playwright','electron-capture'):raise ValueError('capture producer must be a product capture tool')
            if e['host']=='electron' and e['producer']!='electron-capture':raise ValueError('web screenshot cannot prove native composition')
            if e.get('review_status')!='PASS' or e.get('known_defects')!=[]:raise ValueError('capture requires scoped review and no known defects')
            path=artifact(e.get('path'));review=artifact(e.get('review_file'))
            if not path or not review:continue
            info=decoded.get(str(path))
            if not info:info=decode_png(path);decoded[str(path)]=info
            if len(e['viewport'])!=2 or any(type(v)!=int or v<128 for v in e['viewport']):raise ValueError('invalid capture viewport')
            if type(e['dpr'])!=int or e['dpr'] not in (1,2):raise ValueError('invalid DPR')
            if (info['width'],info['height'])!=tuple(v*e['dpr'] for v in e['viewport']):raise ValueError('capture dimensions differ from viewport/DPR')
            if e.get('masks',[])!=[]:raise ValueError('v4 default capture forbids masks; reviewed semantic differences belong in review_file')
        except (KeyError,TypeError,ValueError,OSError) as exc:errors.append(str(exc))
    missing={key(x) for x in required}-seen
    if missing:errors.append('visual coverage incomplete: '+str(len(missing))+' required captures missing')
    return errors
