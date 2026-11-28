from pathlib import Path
from collections import Counter, defaultdict
import hashlib, json, re

BASE = Path('/workspace/scratch/aff930d22ec7/s4')
OUT = BASE / 'producers/l1b'
REV = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
ENGINE = 'S4:L1:atlas-engine'
HOST = 'S4:L1:atlas-host-genesis'
CR = 'S4:L1:continuity-rag'
GOV = 'S4:L1:coverage-governance'
engine_packages = {'contracts','kernel','persist','index','grounding','knowledge','retrieval','memory'}
host_packages = {'adapter-io','genesis','cli','mcp-server','tools'}
inventory = json.loads((BASE/'inventory.json').read_text())
receipt = json.loads((BASE/'source-capture-receipt.json').read_text())
capture = {x['path']:x for x in receipt['files']}
assert len(inventory) == len(capture) == 2220
assert len({x['path'] for x in inventory}) == 2220
assert receipt['source_revision'] == REV
inspection = defaultdict(list)
log = json.loads((OUT/'inspection-log.json').read_text())
for item in log:
    inspection[item['path']].append({'ranges':item['ranges'], 'mode':item['mode'], 'reader':item['reader']})
child = OUT/'continuity-research/inspected-files.json'
if child.exists():
    data = json.loads(child.read_text())
    if isinstance(data,dict): data = data.get('files',data.get('inspected_files',[]))
    for item in data:
        if isinstance(item,str): item={'path':item,'ranges':[]}
        ranges=item.get('read_ranges',item.get('ranges',[]))
        inspection[item['path']].append({'ranges':ranges, 'mode':item.get('inspection','research-source-inspection'), 'reader':'/root/producer_l1a/continuity_research'})

def group(path):
    parts=path.split('/')
    if path.startswith('modules/atlas/packages/') and len(parts)>3:
        pkg=parts[3]
        if pkg in engine_packages:return 'engine.'+pkg,ENGINE
        if pkg in host_packages:return 'host.'+pkg,HOST
        return 'governance.integration-tests' if pkg in {'e2e','e2e-blackbox'} else 'governance.workspace',GOV
    if path.startswith('modules/atlas/boundary/'):return 'host.boundary',HOST
    if path.startswith('modules/continuity/') or path.endswith('/RD-CONTINUITY.md') or path=='docs/guides/context.md':return 'continuity',CR
    if path.startswith('modules/rag-studio/') or path.startswith('docs/specs/rag-studio/') or path=='docs/guides/rag-studio.md':return 'rag-studio',CR
    if path.startswith('.atlas/'):return 'governance.repository-data',GOV
    if path.startswith('.github/') or '/.github/' in path:return 'governance.workflows',GOV
    if path.startswith('script/atlas-genesis/'):return 'governance.legacy-genesis-automation',GOV
    if path=='script/atlas-baseline.mjs':return 'governance.baseline-automation',GOV
    if path.startswith('specs/atlas-ui/mock/'):return 'governance.ui-prototype',GOV
    if path.startswith('specs/atlas-ui/'):return 'governance.ui-design',GOV
    if path.startswith('modules/atlas/harness/'):return 'governance.harness',GOV
    if path.startswith('modules/atlas/scripts/'):return 'governance.contributor-scripts',GOV
    if path.startswith('modules/atlas/docs/design/genesis-ownership-results/') or path.startswith('modules/atlas/docs/design/genesis-campaign-results/'):
        return 'governance.historical-results',GOV
    if path.startswith('modules/atlas/docs/design/genesis-ownership-prompts/'):return 'governance.historical-prompts',GOV
    if path.startswith('modules/atlas/docs/'):
        return 'governance.docs.'+parts[3] if len(parts)>4 else 'governance.docs.root',GOV
    if '/skills/' in path:return 'governance.contributor-skills',GOV
    if path.startswith('docs/'):return 'governance.integration-guidance',GOV
    return 'governance.workspace',GOV

def classify(path,semantic):
    p=Path(path); name=p.name
    if semantic=='governance.historical-results':
        return 'historical-executable-evidence' if p.suffix in {'.ts','.js','.mjs','.sh','.py'} else 'historical-evidence'
    if semantic=='governance.historical-prompts':return 'historical-prompt'
    if '/fixtures/' in path or '/__fixtures__/' in path or '/fixture/' in path or name.startswith('fixture.') or '/support/' in path or name=='checkpoint-fixture.mjs':return 'test-fixture'
    if '/src/generated/' in path:return 'generated-runtime-bundle'
    if name in {'OWN-SNAPSHOT.json','OWN-COVERAGE.json'} or '/.orchestra/skills/own/' in path:return 'generated-ownership-artifact'
    if semantic=='governance.repository-data':return 'repository-event-data'
    if name in {'data-real.js','data-spawns.js'} and semantic=='governance.ui-prototype':return 'generated-ui-data'
    if '/test/' in path or re.search(r'\.(?:test|node-test|node-smoke)\.',name):return 'test-source'
    if semantic=='governance.integration-tests':return 'test-harness'
    if '/harness/probes/' in path and p.suffix in {'.json','.jsonl','.tsv'}:return 'historical-probe-data'
    if '/harness/probes/' in path:return 'test-probe'
    if '/harness/gates/' in path:return 'validation-tool'
    if '/harness/lib/' in path:return 'validation-support'
    if semantic=='governance.workflows' and p.suffix in {'.yml','.yaml'}:return 'ci-workflow'
    if 'license' in name.lower():return 'license'
    if name in {'package-lock.json','bun.lock','bun.lockb'}:return 'dependency-lock'
    if name=='.gitkeep':return 'repository-placeholder'
    if '/skills/' in path and p.suffix=='.md':return 'contributor-skill'
    if '/prompts/' in path or name in {'judge-prompt.md'}:return 'prompt-template'
    if semantic=='governance.ui-prototype':
        return 'generator-script' if p.suffix=='.py' else 'ui-prototype' if p.suffix in {'.js','.html','.css'} else 'design-document'
    if semantic=='governance.legacy-genesis-automation' and p.suffix=='.json':
        return 'build-or-policy-config' if name=='grok-agent.json' else 'historical-evaluation-data'
    if path.startswith('docs/specs/rag-studio/') and name=='seam.ts':return 'design-contract'
    if path.startswith('script/') or '/scripts/' in path or '/script/' in path:
        if p.suffix in {'.ts','.js','.mjs','.sh','.py'}:return 'operational-script'
    if semantic.startswith('governance.docs') or path.startswith('docs/') or semantic=='governance.ui-design':
        return 'design-data' if p.suffix in {'.json','.jsonl'} else 'historical-consultation' if p.suffix=='.txt' else 'design-document'
    if '/src/' in path and p.suffix in {'.ts','.js','.mjs'}:return 'executable-component'
    if name=='README.md' or p.suffix=='.md':return 'package-documentation'
    if p.suffix in {'.json','.toml','.yml','.yaml'} or name.startswith('.') or name=='CODEOWNERS':return 'build-or-policy-config'
    if p.suffix in {'.js','.mjs','.ts','.sh','.py'}:return 'operational-script'
    if p.suffix in {'.html','.css'}:return 'design-visual'
    return 'repository-support'

def disposition(path,classification,semantic):
    if path in inspection:
        return 'source-excerpts-inspected','Decisive source or contract excerpts were inspected; ranges are recorded. This does not claim every caller, branch, or runtime case was verified.'
    if classification.startswith('historical'):
        return 'preserved-by-origin','Prior campaign material preserved with exact identity and origin; not re-read as current authority, current review acceptance, or new execution evidence.'
    if classification.startswith('generated'):
        return 'generator-and-integrity','Exact derived bytes retained; generator/source route is explained. No new generation or byte-parity gate was run, and bulk output is not independent semantic evidence.'
    if classification in {'test-source','test-fixture','test-harness','test-probe'}:
        return 'test-role-and-integrity','Test, fixture, or probe retained as a maintenance/validation surface; contents were not comprehensively reviewed and no product test was run.'
    if classification in {'executable-component','operational-script','validation-tool','validation-support','generator-script'}:
        return 'group-context-and-integrity','Assigned executable is preserved within its semantic group. The body explains selected consequential entry points; this file has no individual function-level sufficiency claim.'
    if classification=='repository-event-data':
        return 'structure-and-integrity','JSONL envelope keys and record counts inspected; historical payloads retained without promotion to current policy, ownership, or session authority.'
    if classification in {'design-document','design-contract','design-data','package-documentation','contributor-skill','prompt-template','design-visual','ui-prototype'}:
        return 'origin-and-integrity','Reference, intent, guide, or prototype retained by origin; only specifically cited excerpts are reconciled against live code. It is not executable authority or proof of implementation.'
    return 'support-role-and-integrity','Repository/build/dependency support retained with exact bytes; its presence does not establish installed dependencies, configuration readiness, or successful validation.'

rows=[]
for item in sorted(inventory,key=lambda x:x['path']):
    path=item['path']; cap=capture[path]; raw=(BASE/'source'/path).read_bytes()
    assert item['type']=='blob' and item['sha']==cap['git_blob_sha']
    assert len(raw)==cap['byte_length']
    assert hashlib.sha256(raw).hexdigest()==cap['sha256'],path
    assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==item['sha'],path
    semantic,key=group(path); category=classify(path,semantic); depth,reason=disposition(path,category,semantic)
    restrictions=[]
    if any(s in {'.atlas','.git'} for s in path.split('/')):restrictions.append('refused-path-segment')
    if len(raw)>256000:restrictions.append('exceeds-256000-byte-file-observer-limit')
    if item['mode']=='120000':restrictions.append('symlink-refused')
    rows.append({'path':path,'git_blob_sha':item['sha'],'sha256':cap['sha256'],'byte_length':len(raw),'git_mode':item['mode'],'classification':category,'semantic_group':semantic,'depth':depth,'depth_reason':reason,'artifact_keys':list(dict.fromkeys([key,GOV])),'inspections':inspection.get(path,[]),'observer_limitations':restrictions})

path_bytes=('\n'.join(x['path'] for x in rows)+'\n').encode()
result={'schema':'s4-l1-coverage/v1','execution_id':'a2095d5a-1464-4c38-a222-6376974fc9c9','source_revision':REV,'count':len(rows),'source_capture_receipt_sha256':hashlib.sha256((BASE/'source-capture-receipt.json').read_bytes()).hexdigest(),'inventory_sha256':hashlib.sha256((BASE/'inventory.json').read_bytes()).hexdigest(),'path_set_sha256':hashlib.sha256(path_bytes).hexdigest(),'path_set_encoding':'UTF-8 sorted repository paths, each terminated by LF','population_preserved':True,'semantic_sufficiency':'pending independent review of bounded group evidence; census does not establish complete code understanding','counts':{'classification':dict(sorted(Counter(x['classification'] for x in rows).items())),'semantic_group':dict(sorted(Counter(x['semantic_group'] for x in rows).items())),'depth':dict(sorted(Counter(x['depth'] for x in rows).items()))},'observer_limited_paths':[x['path'] for x in rows if x['observer_limitations']],'entries':rows}
(OUT/'coverage.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='entries'},indent=2))
print('UNCLASSIFIED_SUPPORT', [x['path'] for x in rows if x['classification']=='repository-support'])
