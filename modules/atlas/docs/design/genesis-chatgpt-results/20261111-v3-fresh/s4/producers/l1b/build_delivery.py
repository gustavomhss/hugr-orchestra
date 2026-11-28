from pathlib import Path
from collections import Counter
import hashlib, json, re

BASE = Path('/workspace/scratch/aff930d22ec7/s4')
OUT = BASE / 'producers/l1b'
REV = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
PROTOCOL = 'ee2521a5b966bd505cc95bd1c733e09e12f33531'
EXECUTION = 'a2095d5a-1464-4c38-a222-6376974fc9c9'
SCOPE = 'atlas-continuity-rag-genesis'
PAYLOAD = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/'
sha = lambda b: hashlib.sha256(b).hexdigest()
blob = lambda b: hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
coverage = json.loads((OUT/'coverage.json').read_text())
capture = json.loads((BASE/'source-capture-receipt.json').read_text())
source = {x['path']: {'commit':REV, 'path':x['path'], 'git_blob_sha':x['git_blob_sha'], 'sha256':x['sha256']} for x in capture['files']}
prior = json.loads((BASE/'producers/l1a/artifact.json').read_text())
for ref in prior['source_refs']:
    if ref['commit']==REV and ref['path'] not in source:source[ref['path']]=ref
protocol=[]
for ref in json.loads((BASE/'producers/l1a/protocol-captures.json').read_text()):
    raw=(BASE/'producers/l1a/protocol-source'/Path(ref['path']).name).read_bytes()
    assert sha(raw)==ref['sha256'] and blob(raw)==ref['git_blob_sha']
    protocol.append({k:ref[k] for k in ('commit','path','git_blob_sha','sha256')})

engine={x:'modules/atlas/packages/'+y+'/src/' for x,y in zip(['C','K','P','I','G','N','R','M','A'],['contracts','kernel','persist','index','grounding','knowledge','retrieval','memory','adapter-io'])}
engine['H']='modules/atlas/harness/'
host={x:'modules/atlas/packages/'+y+'/src/' for x,y in zip(['A','G','L','T','S','N'],['adapter-io','genesis','cli','tools','mcp-server','knowledge'])}
host['B']='modules/atlas/boundary/'
maps={'atlas-engine.md':engine,'atlas-host-genesis.md':host,'continuity-rag.md':{},'coverage-governance.md':{'AG':'script/atlas-genesis/','H':'modules/atlas/harness/','D':'modules/atlas/docs/'}}
pattern=re.compile(r'(?<![\w/])((?:[A-Z]{1,2}/|modules/|script/|specs/|docs/|\.orchestra/|\.github/)[^\s:;\]`|]+?):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)')
citations={}
for name,aliases in maps.items():
    rows=[]
    for m in pattern.finditer((OUT/name).read_text()):
        path,ref=m.groups();prefix=path.split('/')[0]
        if prefix in aliases:path=aliases[prefix]+path[len(prefix)+1:]
        fp=BASE/'source'/path
        if path.startswith('.orchestra/skills/execute-genesis/'):
            fp=BASE/'producers/l1a/protocol-source'/Path(path).name
        assert fp.exists(),path
        count=len(fp.read_text().splitlines()); ranges=[]
        for text in ref.split(','):
            a,*rest=text.split('-'); a=int(a); b=int(rest[0]) if rest else a
            assert 1<=a<=b<=count,(name,path,text,count)
            ranges.append([a,b])
        rows.append({'path':path,'ranges':ranges})
    citations[name]=rows
(OUT/'citation-register.json').write_text(json.dumps(citations,indent=2)+'\n')

specs=[
 ('atlas-engine.md','S4:L1:atlas-engine','Atlas engine: identity, grounded knowledge, retrieval and memory',[
  'Selected consequential functions were inspected; uninspected engine branches, verifier/key families and callers retain explicit depth limits in coverage.json.',
  'Reference models are not assumed to be shipped paths; full cross-language index soundness and end-to-end host integration remain outside these bounded claims.',
  'No runtime, product test, benchmark, build, scanner or publication was executed; independent semantic review and runtime binding are separate pending evidence.'
 ]),
 ('atlas-host-genesis.md','S4:L1:atlas-host-genesis','Atlas host composition, transports, publication and candidate Genesis',[
  'Uninspected verifier families, commit failure branches, UI port implementations and recovery variants remain semantic depth limits.',
  'External Orchestra host invocation/authentication/privacy enforcement and generated-source parity were not established by execution.',
  'This is source evidence of candidate/publication boundaries, not a generic native importer execution, independent semantic judgment, successful runtime binding or publication receipt.'
 ]),
 ('continuity-rag.md','S4:L1:continuity-rag','Continuity recovery and RAG Studio document diagnostics',[
  'RAG historical revision membership is not enforced by inspected search; ask and proof use different trace keys. Their full public linkage remains unestablished.',
  'External Session/core wiring, archive visibility-to-export flag binding, durable RAG Store/transactions, transport validation and UI integration were not inspected.',
  'Archive scrub coverage is limited to declared credential shapes; no runtime, scanner, PDF extraction, product test or generated parity gate was executed.'
 ]),
 ('coverage-governance.md','S4:L1:coverage-governance','S4 preserved population, automation, governance and historical evidence',[
  'Complete accounting of 2220 assigned paths is not a claim of complete code understanding; per-path depth is explicit.',
  'Historical conversations and bulk generated data are preserved by origin; all tests/recovery variants and external host/CI enforcement were not semantically verified.',
  'Eight preserved files encounter current observer limits. They were not omitted or labeled absent; any later runtime binding needs explicit compatible observation.',
  'No new CI, local product test, runtime, deployment, publication or whole-domain completion is claimed.'
 ])
]
bodyinfo=[]
for name,key,title,gaps in specs:
    raw=(OUT/name).read_bytes();raw.decode('utf-8')
    assert 0<len(raw)<=18000,(name,len(raw))
    bodyinfo.append({'key':key,'path':name,'byte_length':len(raw),'sha256':sha(raw)})

summary=['# S4 L1B coverage summary','',f'Execution `{EXECUTION}`; source `{REV}`; protocol `{PROTOCOL}`.','',
 '**All 2,220 assigned paths are preserved, uniquely classified and bound to exact source hashes.** This is population integrity, not complete semantic understanding or executed product validation.','',
 f'- Sorted-path-set SHA-256: `{coverage["path_set_sha256"]}` (UTF-8 paths sorted, each with LF).',
 f'- Inventory SHA-256: `{coverage["inventory_sha256"]}`.',
 f'- Source-capture receipt SHA-256: `{coverage["source_capture_receipt_sha256"]}`.',
 f'- Coverage JSON SHA-256: `{sha((OUT/"coverage.json").read_bytes())}`.',
 '- No symlinks; all 2,220 raw bodies match their captured SHA-256, byte length and Git blob.',
 '', '## Bounded bodies','', '| Key | UTF-8 bytes | SHA-256 |','|---|---:|---|']
for b in bodyinfo:summary.append(f'| `{b["key"]}` | {b["byte_length"]:,} | `{b["sha256"]}` |')
summary += ['','Primary population: engine 318; host/Genesis 658; Continuity/RAG 63; governance 1,181. Each row also maps to coverage-governance. All build dependencies are empty; L1A is navigation only.','','## Classification','', '| Classification | Paths |','|---|---:|']
for key,n in coverage['counts']['classification'].items():summary.append(f'| {key} | {n:,} |')
summary += ['','## Inspection depth','', '| Disposition | Paths |','|---|---:|']
for key,n in coverage['counts']['depth'].items():summary.append(f'| {key} | {n:,} |')
summary += ['','Excerpt inspection does not establish every branch/caller. Historical preservation does not import old authority. Fixtures/test files identify validation surfaces without a test result. Generated artifacts retain source/generator routes without a parity claim.','','## Observer-limited files retained','']
summary += [f'- `{p}`.' for p in coverage['observer_limited_paths']]
summary += ['','Five paths contain `.atlas`; three exceed 256,000 bytes. No observer was invoked. These are source-code-derived limits, not absence claims.','','## Material findings and limits','',
 '- Pure engine models and actual host doors must be distinguished; actor/ratifier names are not authenticated identities.',
 '- Provenance, source freshness, truth, review and publication remain separate checks; a CAS object is not necessarily published ownership.',
 '- Continuity has a local persistent archive; its Atlas context adapter hashes/checks data but leaves the blob flag to its host caller.',
 '- RAG reads current corpus rows without enforcing saved revision membership and uses divergent ask/proof trace keys; docs/test setup do not close those links.',
 '- Legacy checkpoint/calibration/publish scripts and old receipts are specific evidence, not fresh native Genesis execution or acceptance.',
 '- Remaining depth gaps include uninspected branches/recovery variants, generated parity, current remote CI enforcement and external Session/Store/UI integration. No local product tests ran.',
 '']
(OUT/'coverage-summary.md').write_text('\n'.join(summary))

response=['# WP-L1B producer response','',f'Completed the finite direct-source L1B delivery for execution `{EXECUTION}`. The four substantive bodies are within the 18,000-byte limit. L1A was not modified. No L2 artifact or acceptance/runtime/publication claim is made.','',
 'Deliverables are `atlas-engine.md`, `atlas-host-genesis.md`, `continuity-rag.md`, `coverage-governance.md`, common transport array `artifacts.json`, `coverage.json`, `coverage-summary.md`, this response and exact `request.txt`. Supporting citation/inspection registers preserve the evidence route.','',
 '| Artifact | UTF-8 bytes | SHA-256 |','|---|---:|---|']
for b in bodyinfo:response.append(f'| `{b["key"]}` | {b["byte_length"]:,} | `{b["sha256"]}` |')
response += ['', f'Coverage has exactly 2,220 unique paths and reproduces the frozen path-set digest `{coverage["path_set_sha256"]}`. Raw source byte lengths, SHA-256 and Git blob identities were checked against the capture receipt. Coverage SHA-256 is `{sha((OUT/"coverage.json").read_bytes())}`. All five `.atlas`-segment paths and all three oversized generated files remain present.', '',
 'The bodies explain canonical identity and grounding, reference-model versus shipped behavior, provenance and governed publication, candidate Genesis and its historical tooling, owner-scoped memory, Continuity persistence/recall, and lexical RAG contracts. Material limits are explicit: configured names are not authentication; archive export leaves visibility/commit decisions to its caller; RAG historical membership and ask/proof trace linkage are not established; generated parity and external host/Store/UI behavior remain unverified.', '',
 'Validation was limited to evidence integrity, unique population coverage, byte bounds and citation path/range checks. It did not run product tests, builds, CI, models, runtime observers, scanners or publication. Historical receipts remain historical; remaining semantic depth is recorded per path. Independent judges must assess this L1 union before any dependent L2 work.', '']
(OUT/'response.md').write_text('\n'.join(response))
request_ref={'payload_path':PAYLOAD+'producers/l1b/request.txt','sha256':sha((OUT/'request.txt').read_bytes())}
response_ref={'payload_path':PAYLOAD+'producers/l1b/response.md','sha256':sha((OUT/'response.md').read_bytes())}

artifacts=[]
allkeys=[x[1] for x in specs]
for (name,key,title,gaps),body in zip(specs,bodyinfo):
    wanted={row['path'] for row in coverage['entries'] if key in row['artifact_keys']}
    wanted |= {c['path'] for c in citations[name] if not c['path'].startswith('.orchestra/skills/execute-genesis/')}
    wanted.add('AGENTS.md')
    refs=[]
    for path in sorted(wanted):
        ref=source[path]
        raw=(BASE/'source'/path).read_bytes()
        assert sha(raw)==ref['sha256'] and blob(raw)==ref['git_blob_sha'],path
        refs.append(ref)
    refs += protocol
    inputs=['file:'+r['path'] for r in refs]
    inputs += ['file:'+request_ref['payload_path'], 'file:'+PAYLOAD+'inventory.json', 'file:'+PAYLOAD+'source-capture-receipt.json']
    artifacts.append({
      'key':key,'scope':SCOPE,'title':title,'layer':1,'need':'evidence',
      'body':{'path':'producers/l1b/'+name,'encoding':'utf-8','byte_length':body['byte_length'],'sha256':body['sha256']},
      'authority':{'scope':SCOPE,'basis':f'WP-L1B source-derived evidence authored by /root/producer_l1a, with bounded continuity research by /root/producer_l1a/continuity_research, for execution {EXECUTION}; source {REV}; protocol {PROTOCOL}. Observed denotes static source inspection; documented intention, inference and unknown are distinguished. The complete path census proves population preservation, not full semantic understanding. No semantic approval, runtime binding, publication or operational authority is asserted.'},
      'validity':'supported','gaps':gaps,
      'evidence':[
       f'{name}: exact pinned source paths and line citations; citation-register.json preserves expanded paths/ranges.',
       f'coverage.json: {coverage["count"]} unique assigned paths; SHA-256 {sha((OUT/"coverage.json").read_bytes())}; per-path classification, group, depth, artifact mapping and observer limits.',
       f'source-capture-receipt.json SHA-256 {coverage["source_capture_receipt_sha256"]}; inventory.json SHA-256 {coverage["inventory_sha256"]}; frozen path-set digest {coverage["path_set_sha256"]}.',
       'Exact protocol captures: transport, runtime, principles, fatia-4 and SKILL at the pinned protocol revision; source_refs retain Git blob and SHA-256.',
       'Public criteria addressed: QS-1, QS-2, QS-3, QS-5, CC-3, GO-I2, GO-I3, GO-I5, GO-I7, GO-I8. Criteria are review targets, not producer verdicts.'
      ],
      'input_keys':list(dict.fromkeys(inputs)),'source_refs':refs,'recipe_ref':request_ref,
      'build_dependencies':[],
      'navigation':['S4:L1:ownership-boundaries']+[x for x in allkeys if x!=key],
      'producer_request_ref':request_ref,'producer_response_ref':response_ref,
      'semantic_review_refs':[],'runtime_receipt_refs':[]
    })
(OUT/'artifacts.json').write_text(json.dumps(artifacts,ensure_ascii=False,indent=2)+'\n')
assert sha((BASE/'producers/l1a/body.md').read_bytes())=='242de88e5cbb656b9752e231b2125e41733e449b19e6e887d1889830a1d5764c'
assert len({r['path'] for r in coverage['entries']})==len(capture['files'])==2220
assert {r['path'] for r in coverage['entries']}=={r['path'] for r in capture['files']}
report={'execution_id':EXECUTION,'source_revision':REV,'protocol_revision':PROTOCOL,'bodies':bodyinfo,
 'artifacts_sha256':sha((OUT/'artifacts.json').read_bytes()),'coverage_sha256':sha((OUT/'coverage.json').read_bytes()),
 'request_sha256':request_ref['sha256'],'response_sha256':response_ref['sha256'],
 'citation_path_range_count':sum(map(len,citations.values())),
 'source_ref_counts':{a['key']:len(a['source_refs']) for a in artifacts},
 'coverage_count':2220,'observer_limited_count':8,'l1a_unchanged':True,
 'verification':'Evidence byte/hash/path/range integrity only; no product execution or semantic verdict.'}
(OUT/'delivery-receipt.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
