"""Explicitly SYNTHETIC test fixtures. Never represents an Orchestra run."""
from pathlib import Path
import json,copy,shutil,struct,zlib,math
from effective_contract import load,digest,file_hash
ROOT=Path(__file__).resolve().parents[1]

def install(root):
    # The fixture includes every normative input referenced by the current plan.
    # Do not weaken contract checks when a new design input is introduced.
    required={'RECEIPTS-v4.md','PLAN.json','SURFACES.json','CENSUS.json','CONTRACTS.md','SPEC.md','PERFORMANCE.md','BUDGETS.json','COVERAGE.json','fixture.json','reference/approved.png','BRAND-ASSETS.json','BRAND-INTEGRATION.md','WIDGETS.md'}
    plan=load(ROOT/'PLAN.json')
    required.update(rel for n in plan['nodes'] for rel in n.get('normative_files',[]))
    for rel in sorted(required):
        dest=root/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/rel,dest)

def png(w,h):
    def ch(k,b):return struct.pack('>I',len(b))+k+b+struct.pack('>I',zlib.crc32(k+b)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+ch(b'IDAT',zlib.compress((b'\0'+b'\x20\x20\x20'*w)*h,1))+ch(b'IEND',b'')

def raw_fixture(root,gates,head='a'*40,build='b'*64):
    b=load(root/'BUDGETS.json');env={k:'synthetic-isolated-test' for k in b['environment_keys']}
    raw={'kind':'paired-performance-observations','synthetic':True,'budget_sha256':digest(b),'environment':env,'baseline_environment':copy.deepcopy(env),'candidate_head':head,'baseline_head':'c'*40,'candidate_build_sha256':build,'baseline_build_sha256':'d'*64,'fixture_sha256':file_hash(root/'fixture.json'),'candidate_features_sha256':'e'*64,'baseline_features_sha256':'e'*64,'build_mode':'production','quiet_host':True,'profiles':copy.deepcopy(b['profiles']),'observations':[]}
    raw['artifact_manifests'] = {label: {'kind': 'build-cost-manifest', 'build_sha256': raw[label + '_build_sha256'], 'initial_chunks': [], 'decorations': [], 'runtime_dependencies': []} for label in ('baseline', 'candidate')}
    for rule in b['metrics']:
        if rule['gate'] not in gates or rule.get('observation_kind') == 'artifact':continue
        value=0 if rule['limit'] is None else max(0,rule['limit']/2)
        base=value
        if rule['mode'] in ('delta','relative_delta'):base=value=100
        n=math.ceil(rule['min_samples']/5)
        raw['observations'].append({'metric':rule['id'],'profile':rule['profile'],'unit':rule['unit'],'pairs':[{'id':str(i),'order':'AB' if i%2==0 else 'BA','baseline':[base]*n,'candidate':[value]*n} for i in range(5)]})
    return raw

def categories(root,value,node):
    from visual_coverage import required_captures
    from evaluate_performance import evaluate
    from seal_receipt import seal
    base={'status':'PASS','head':value['head'],'build_sha256':'b'*64,'known_defects':[]}
    gates=node.get('required_performance_gates') or ['P11','P12'];raw=raw_fixture(root,gates,value['head'])
    (root/'raw.json').write_text(json.dumps(raw));report=evaluate(raw,load(root/'BUDGETS.json'),gates)
    for g in report['gates']:g['evidence']=['raw.json']
    (root/'metrics.json').write_text(json.dumps(report));value['performance']={**base,'metrics_file':'metrics.json','observations_file':'raw.json'}
    native={**base,'kind':'native-evaluation','environment':{'synthetic':True},'gates':[{'id':i,'status':'PASS','evidence':['proof.txt']} for i in node.get('required_native_gates') or ['identity']]}
    (root/'native.json').write_text(json.dumps(native));value['native']={**base,'report_file':'native.json'}
    required=required_captures(node,root);rows=[]
    for rec in required or [{'surface_id':'SYNTHETIC-EXTRA','state_id':'default','viewport':[1672,941],'dpr':1,'zoom':100,'host':'web'}]:
        name=f'shot-{rec["viewport"][0]}-{rec["viewport"][1]}-{rec["dpr"]}.png';path=root/name
        if not path.exists():path.write_bytes(png(rec['viewport'][0]*rec['dpr'],rec['viewport'][1]*rec['dpr']))
        rows.append({**rec,'path':name,'platform':'synthetic-test','producer':'electron-capture' if rec['host']=='electron' else 'playwright','review_status':'PASS','known_defects':[],'review_file':'proof.txt','masks':[]})
    policy=load(root/'COVERAGE.json')
    cm={'kind':'visual-capture-manifest',**base,'master_sha256':policy['master_sha256'],'fixture_sha256':file_hash(root/'fixture.json'),'coverage_sha256':digest(required),'theme':policy['theme'],'flags':policy['flags'],'captures':rows,'synthetic':True}
    (root/'captures.json').write_text(json.dumps(cm));value['visual']={**base,'screenshots':sorted({x['path'] for x in rows}),'review_file':'proof.txt','manifest_file':'captures.json'}
    value.update(seal(value,root));return value
