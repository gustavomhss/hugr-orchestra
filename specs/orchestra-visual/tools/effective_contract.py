"""Normative identity, scoped by task; no authenticity claim and no product writes."""
from __future__ import annotations
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def digest(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()

def load(path):
    return json.loads(path.read_text(encoding='utf-8'),parse_constant=lambda x: (_ for _ in ()).throw(ValueError('non-finite JSON: '+x)))

def file_hash(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()

def manifest(node,root=ROOT,plan=None):
    plan=plan if plan is not None else load(root/'PLAN.json')
    by={n['id']:n for n in plan['nodes']}
    fields=('id','kind','depends_on','acceptance_requires','external_requires','write_paths','leased_write_paths','exclude_paths','read_paths','steps','axioms','criterion_ids','evidence_requirements','required_performance_gates','required_visual_gates','required_native_gates','resource_locks','proof_mode','source_watch_mode','normative_files','contract_surface_scope','criterion_evaluation_stage','source_watch_paths','proof_claim','optional_inputs','verification_tier','sampling_requires_quiet_host','proof_reuse','dependency_inputs')
    chain=[];ident=node.get('parent');seen=set()
    while ident:
        if ident in seen or ident not in by:raise ValueError('invalid ancestor chain')
        seen.add(ident);n=by[ident]
        # Only continuing obligations inherit; closure belongs to the aggregate stage.
        chain.append({'id':ident,'invariants':n['axioms']['invariants'],'quality_standards':n['axioms']['quality_standards'],'depends_on':n.get('depends_on',[]),'external_requires':n.get('external_requires',[])})
        ident=n.get('parent')
    owner=node['id'].split('-')[0]
    rows=load(root/'SURFACES.json')['surfaces']
    selected=rows if node.get('contract_surface_scope')=='all' else [r for r in rows if r['owner']==owner]
    files={}
    for rel in node.get('normative_files',[]):
        path=(root/rel).resolve();path.relative_to(root.resolve())
        files[rel]=file_hash(path)
    return {'schema_version':1,'task':{k:node.get(k) for k in fields},'scheduling_policy':plan.get('scheduling_policy',{}),'ancestors':chain,'surface_contract':selected,'normative_files':files,'gate_registry':plan['gate_registry'],'final_gate_policy':plan['final_gate_policy'] if node['id']==plan['final_gate_policy']['task'] else None,'leases':[x for x in plan.get('shared_write_leases',[]) if node['id'] in x['tasks']]}

def contract_digest(node,root=ROOT,plan=None):return digest(manifest(node,root,plan))
