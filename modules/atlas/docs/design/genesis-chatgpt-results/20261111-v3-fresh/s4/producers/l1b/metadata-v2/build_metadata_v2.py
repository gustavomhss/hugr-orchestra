from pathlib import Path
from collections import Counter, defaultdict
import copy, hashlib, json

BASE=Path('/workspace/scratch/aff930d22ec7/s4')
OUT=BASE/'producers/l1b'
V2=OUT/'metadata-v2'
PAYLOAD='modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/'
ROOT=PAYLOAD+'producers/l1b/'
REV='1cde2ff7a71bcf7aecb5d030917b577165135d38'
PROTOCOL='ee2521a5b966bd505cc95bd1c733e09e12f33531'
EXECUTION='a2095d5a-1464-4c38-a222-6376974fc9c9'
sha=lambda b:hashlib.sha256(b).hexdigest()
blob=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
write=lambda path,obj:path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
def payload_ref(path):
    raw=path.read_bytes()
    return {'payload_path':ROOT+str(path.relative_to(OUT)),'sha256':sha(raw),'byte_length':len(raw)}
def original_ref(path):
    raw=(BASE/path).read_bytes()
    return {'payload_path':PAYLOAD+path,'sha256':sha(raw),'byte_length':len(raw),'role':'historical capture provenance, not a native file input'}

immutable=json.loads((V2/'v1-immutability.json').read_text())['files']
for path,digest in immutable.items():assert sha((OUT/path).read_bytes())==digest,path
v1=json.loads((OUT/'artifacts.json').read_text())
citations=json.loads((OUT/'citation-register.json').read_text())
coverage=json.loads((OUT/'coverage.json').read_text())
inventory=json.loads((BASE/'inventory.json').read_text())
receipt=json.loads((BASE/'source-capture-receipt.json').read_text())
rows=coverage['entries'];by_path={r['path']:r for r in rows}
assert len(rows)==len(by_path)==len(inventory)==len(receipt['files'])==2220
assert set(by_path)=={r['path'] for r in inventory}=={r['path'] for r in receipt['files']}
assert sha(('\n'.join(sorted(by_path))+'\n').encode())==coverage['path_set_sha256']
assert sha((BASE/'inventory.json').read_bytes())==coverage['inventory_sha256']
assert sha((BASE/'source-capture-receipt.json').read_bytes())==coverage['source_capture_receipt_sha256']
assert sha((OUT/'coverage.json').read_bytes())=='9d0473edc9de818e36111cd741928d5ab5be05ac063439aeac11719ac0fc9759'
source={(r['commit'],r['path']):r for a in v1 for r in a['source_refs']}
protocol=[r for r in source.values() if r['commit']==PROTOCOL]
assert len(protocol)==5
for r in rows:
    raw=(BASE/'source'/r['path']).read_bytes()
    assert len(raw)==r['byte_length'] and sha(raw)==r['sha256'] and blob(raw)==r['git_blob_sha'],r['path']

def source_ref(path):return {k:source[(REV,path)][k] for k in ['commit','path','git_blob_sha','sha256']}
def origin(r):return {'commit':REV,'path':r['path'],'git_blob_sha':r['git_blob_sha'],'sha256':r['sha256'],'byte_length':r['byte_length']}

# A compact, static derivative of the already preserved fixed population. It is
# deliberately not a new claim to observe every origin through the native guard.
restricted=[]
for r in rows:
    if r['observer_limitations']:
        restricted.append({'origin':origin(r),'classification':r['classification'],'semantic_group':r['semantic_group'],
          'native_origin_observation':'unavailable under current file observer; not an input key in v2',
          'limits':r['observer_limitations'],'disposition':'preserved unchanged in coverage.json; exact-origin static evidence only'})
logs=[]
for path in ['.atlas/members/orch/memory/logbook.jsonl','.atlas/project/board.jsonl','.atlas/project/orientation.jsonl']:
    raw=(BASE/'source'/path).read_bytes()
    records=[json.loads(line) for line in raw.decode('utf-8').splitlines() if line.strip()]
    keys=Counter(tuple(sorted(record)) for record in records)
    logs.append({'origin':origin(by_path[path]),'record_count':len(records),
      'envelope_key_sets':[{'keys':list(k),'count':n} for k,n in sorted(keys.items())],
      'payload_contents_included':False,
      'claim_supported':'Only the historical record count and envelope structure stated in coverage-governance.md.',
      'not_supported':'Current session state, authorship authentication, current ownership/publication, or current native observability of the origin.'})
snapshot={
 'schema':'s4-l1b-static-population-evidence/v2','execution_id':EXECUTION,
 'source_repository':'gustavomhss/hugr-orchestra','source_revision':REV,
 'evidence_kind':'compact static derivative of frozen captured population; this snapshot is the new observable payload input',
 'native_versions':'Not computed here. The runtime must observe this snapshot file itself. Origin SHA-256/Git blobs are historical provenance, never runtime versions.',
 'origin_records':{'inventory':original_ref('inventory.json'),'source_capture_receipt':original_ref('source-capture-receipt.json'),
   'coverage_v1':{**payload_ref(OUT/'coverage.json'),'role':'immutable complete population register; not a native file input because it exceeds the observer limit'}},
 'population':{'count':2220,'unique_paths':2220,'same_path_set_in_inventory_capture_and_coverage':True,
   'path_set_sha256':coverage['path_set_sha256'],'path_set_encoding':coverage['path_set_encoding'],
   'raw_source_identity_check':'All 2220 captured byte lengths, SHA-256 values and Git blob identities were rechecked for this static derivative; this is not a native observer or product execution.',
   'git_mode_counts':dict(sorted(Counter(r['git_mode'] for r in rows).items())),
   'primary_body_counts':{'S4:L1:atlas-engine':318,'S4:L1:atlas-host-genesis':658,'S4:L1:continuity-rag':63,'S4:L1:coverage-governance':1181},
   'counts':coverage['counts']},
 'observer_limited_population':restricted,'historical_atlas_log_envelopes':logs,
 'duplicate_adr0016_paths':sorted(p for p in by_path if p.startswith('modules/atlas/docs/adr/ADR-0016-')),
 'frozen_body_binding':[{k:a['body'][k] for k in ['path','byte_length','sha256']} for a in v1],
 'limitations':[
   'The snapshot preserves historical evidence from the fixed capture. Reading it does not observe the eight refused origins.',
   'The complete 2220-row register remains unchanged; it is not replaced by a shorter population.',
   'Generated bundle/source parity and UI dataset currency are unverified; no generation or product test was run.',
   'Freshness of this snapshot plus selected source files is not freshness of every preserved historical/generated file or of the entire domain.',
   'A changed source revision, assignment/membership, classification recipe or claimed historical envelope requires a fresh capture/derivation and new review; native prepare alone does not refresh the static population.'
 ]}
write(V2/'population-evidence.json',snapshot)

extras={
 'S4:L1:atlas-engine':{},
 'S4:L1:atlas-host-genesis':{},
 'S4:L1:continuity-rag':{
   'modules/atlas/packages/persist/src/scrub.ts':'Direct implementation of context-log scrubText delegation; scopes the whole-buffer scrub claim.',
   'modules/atlas/packages/persist/src/scrub-scan.ts':'Actual declared-shape scan under the archive scrub helper; no general-secret guarantee.',
   'modules/atlas/packages/adapter-io/src/durable-log.ts':'Integrity/refusal semantics delegated by the committed context log.',
   'modules/atlas/packages/adapter-io/src/layout.ts':'Path ownership and placement delegated by context export/read.',
   'modules/atlas/boundary/package.json':'Public context export used by Continuity, paired with the already cited build-source mapping.'
 },
 'S4:L1:coverage-governance':{}}
selected={}
for a in v1:
    name=Path(a['body']['path']).name
    refs=defaultdict(list)
    for citation in citations[name]:
        refs[citation['path']].extend(citation['ranges'])
    entries=[]
    for path in sorted(set(refs)|set(extras[a['key']])|{'AGENTS.md'}):
        commit=PROTOCOL if path.startswith('.orchestra/skills/execute-genesis/') else REV
        ref=source[(commit,path)]
        if path=='AGENTS.md':role='Repository constraints used by the production recipe; not a blanket source for module behavior.'
        elif path in extras[a['key']]:role=extras[a['key']][path]
        else:role='Direct source citation supporting bounded body claims; selected ranges are recorded, not whole-file semantic sufficiency.'
        ranges=sorted(set(tuple(x) for x in refs.get(path,[])))
        entries.append({'source_ref':ref,'input_key':'file:'+path,'role':role,'cited_ranges':[list(x) for x in ranges]})
    have={e['source_ref']['path'] for e in entries}
    for ref in protocol:
        if ref['path'] not in have:
            entries.append({'source_ref':ref,'input_key':'file:'+ref['path'],
              'role':'Pinned production/transport/runtime/scope contract used by the recipe; original path must carry these exact protocol bytes.',
              'cited_ranges':[]})
    for e in entries:
        ref=e['source_ref'];path=ref['path']
        local=BASE/'source'/path if ref['commit']==REV else BASE/'producers/l1a/protocol-source'/Path(path).name
        raw=local.read_bytes()
        assert sha(raw)==ref['sha256'] and blob(raw)==ref['git_blob_sha']
        assert len(raw)<=256000 and not any(s in {'.atlas','.git'} for s in path.split('/'))
        assert e['input_key']=='file:'+path
        e['byte_length']=len(raw)
    selected[a['key']]=sorted(entries,key=lambda e:e['source_ref']['path'])

group_reasons={
 'continuity':'Masking/summary/recall/archive behavior is supported by cited production TS and narrowly cited tests/docs. All other files retain the frozen population role; external Session permission/lifecycle is not inferred.',
 'rag-studio':'Lexical admission/revision/trace/proof/pass behavior and documentation drift are supported by cited module/spec/test sources. Remaining integration behavior is explicitly unknown, not inferred from census.',
 'engine.contracts':'Type-only exports, tier, status and freshness distinctions come from three cited contract files; configs/tests are population context.',
 'engine.kernel':'Canonicalization/encoding/store/log/fold claims come from cited implementations; package presence does not prove durable or authenticated operation.',
 'engine.persist':'Portable source projection, reference reconstruction and scrub/transcript claims use cited implementations plus scrub helpers. Other reference models are preserved with depth limits.',
 'engine.index':'SCIP edge construction, path identities, reverse closure and ratio behavior use build/depgraph/coverage excerpts; other language/index cases remain unproved.',
 'engine.grounding':'Current anchor resolution, drift, freshness closure and downgrade-only gate use three cited implementations; other helpers are not implied to be reached.',
 'engine.knowledge':'Routing, lifecycle status, ratification and ownership shape/read/update-plan use the cited functions. Unread key/verifier families remain bounded gaps.',
 'engine.retrieval':'Reference pack/drop, live Own, host-context and exact snapshot/artifact contracts use cited implementations; broad runtime parity is not claimed.',
 'engine.memory':'Partition/injection/rules/awareness/orientation/portable scanner claims use cited functions; host enforcement is separate.',
 'host.adapter-io':'Selected composition/policy/provenance/CAS/emit/replay/ownership/model/context adapters support concrete behavior. The remaining adapter population is not a transitive semantic dependency.',
 'host.boundary':'Package export and build mapping support generated-source ownership. Bulk JS/d.ts stay historical generated output; neither their freshness nor byte parity was established.',
 'host.cli':'Entry/dispatch/mining proposer and staging excerpts support declared paths. Uninspected commands and recovery branches remain gaps.',
 'host.genesis':'Extraction, controller, admission harness and seed excerpts support candidate semantics; no whole-oracle soundness or publication is inferred.',
 'host.tools':'Handler arrays/envelopes and band splitting support tool counts and query behavior; the reference-model ledger distinguishes unused helpers.',
 'host.mcp-server':'Server dispatch/schema/stdio excerpts and README support this transport boundary, not external client use.',
 'governance.baseline-automation':'The baseline script itself supports synthetic comparison-commit mechanics, not an executed Git result.',
 'governance.contributor-scripts':'Ownership-pilot is selected for its historical corpus specificity. Other contributor scripts remain inventoried support; no individual behavior claim.',
 'governance.contributor-skills':'Current Atlas maintenance/ownership/usage instructions support named limits. Older methods and generated Own skills are preserved by origin, not imported as instructions or fresh ownership.',
 'governance.docs.adr':'Two cited ADRs support staging and model-history decisions. The full 23-file count and duplicate ADR-0016 paths are static population facts, not endorsement of every ADR.',
 'governance.docs.design':'Assigned design documents are preserved by origin; no uncited design is promoted into implemented behavior. Category/count come from the static population snapshot.',
 'governance.docs.explanation':'Preservation/classification only; behavior is supported elsewhere by actual code excerpts, not by these uninspected explanations.',
 'governance.docs.governance':'The policy-lock document is cited as historical governance narrative, explicitly not current GitHub enforcement.',
 'governance.docs.how-to':'Preservation/classification only; no execution or operational readiness is inferred from how-to files.',
 'governance.docs.method':'Method/prompt materials retain historical instructional origin; they do not replace the current pinned Genesis protocol.',
 'governance.docs.reference':'Reference documents remain in the frozen population; uncited command/state claims are not imported as current facts.',
 'governance.docs.requirements':'Requirements are retained as intended contracts by origin; their count is not proof of implementation or passing tests.',
 'governance.docs.roadmap':'Roadmap material is intended/future origin only; no completion or authorization claim is derived from it.',
 'governance.docs.root':'Root docs and historical protocols retain origin; only the current pinned task/protocol governs this production.',
 'governance.docs.spec':'Preservation/classification only; no individual uncited specification is claimed implemented.',
 'governance.harness':'README and reference-model guard excerpts support roles and measurement limits; probes, fixtures, ledgers and old reports stay validation/history surfaces without new pass claims.',
 'governance.historical-prompts':'All 13 prompts are preserved by origin, never treated as new instructions, inputs to current behavior, or independent judgments.',
 'governance.historical-results':'All 368 prior campaign artifacts are preserved by origin; neither their bodies nor old PASS receipts become semantic dependencies of this fresh explanation.',
 'governance.integration-guidance':'Assigned guides outside the cited Continuity/RAG set retain origin/category; no uninspected host integration is asserted.',
 'governance.integration-tests':'All e2e/e2e-blackbox files remain potential validation surfaces. No test result or full coverage is inferred, so raw fixture bytes are not body-semantic inputs.',
 'governance.legacy-genesis-automation':'Cited baseline/index/checkpoint/continuation/judge/calibration/publish/scan scripts support specific mechanisms. Other variants/tests/data are preserved, not claimed proved.',
 'governance.repository-data':'Only the three historical record counts and envelope keys are used. They are derived into the compact static snapshot with exact origins; direct native .atlas observation remains unavailable.',
 'governance.ui-design':'All design/build files are preserved; product implementation is not inferred from their presence. The static snapshot supports the population count.',
 'governance.ui-prototype':'README and extract.py establish simulation, data origin and import-based stand-in. Generated datasets remain origin evidence with sizes; no live data or product action is asserted.',
 'governance.workflows':'The six cited workflow files support declared orchestration/disabled publication only; current execution and branch enforcement remain unknown.',
 'governance.workspace':'Configs/lock/license/support/generated ownership entries retain exact population identity. No installation/readiness/parity claim follows from that identity.'
}
assert set(group_reasons)==set(coverage['counts']['semantic_group'])
groups=[]
for group,count in coverage['counts']['semantic_group'].items():
    support=[]
    for key,entries in selected.items():
        paths=[e['source_ref']['path'] for e in entries if by_path.get(e['source_ref']['path'],{}).get('semantic_group')==group]
        if paths:support.append({'artifact_key':key,'semantic_source_paths':paths})
    groups.append({'semantic_group':group,'preserved_path_count':count,'whole_population_is_native_input':False,
      'justification':group_reasons[group],'effective_semantic_sources':support,
      'population_evidence':'metadata-v2/population-evidence.json; immutable coverage.json retains every row/hash/origin'})
selection={'schema':'s4-l1b-semantic-input-selection/v2','execution_id':EXECUTION,
 'rule':'Select actual cited semantic sources, explicitly justified helper implementations and pinned production contracts; do not turn all classified population members into current file inputs.',
 'source_ref_input_invariant':'Every source_ref.path has exactly the same file:<path> key; native prepare reads that same path.',
 'artifacts':[{'key':key,'semantic_sources':entries} for key,entries in selected.items()],
 'group_justifications':groups,
 'payload_input_roles':{
  'metadata-v2/population-evidence.json':'Frozen census/envelope facts with exact historical provenance; observed snapshot does not observe refused origins.',
  'metadata-v2/source-selection.json':'Reviewable source-to-claim and per-group selection; its identity is part of this metadata recipe.',
  'metadata-v2/recipe.json':'Pins original body request and this explicit metadata correction, public criteria and compact derivation inputs.',
  'observation-plan.md':'Explains current observer keys, multi-pin materialization, static origin limits and refresh obligations.',
  'metadata-v2/build_metadata_v2.py':'Actual metadata/static-evidence derivation recipe; does not execute the product.',
  'build_coverage.py':'Preserved classification algorithm used for original population categories; no rerun mutation is needed.',
  'request.txt':'Original body scope/recipe, kept byte-exact.',
  'correction-request.txt':'Authorized metadata-only correction.',
  'metadata-v2/schema-constraint.txt':'Explicit real-adapter same-path constraint and multi-pin observation instruction.'},
 'excluded_as_native_inputs':['inventory.json','source-capture-receipt.json','producers/l1b/coverage.json','all paths included only because they were classified','all eight observer-limited origins'],
 'excluded_does_not_mean_removed':'Every excluded population member remains in immutable coverage.json and its source capture. These exclusions remove unjustified live semantic dependencies, not population or known limitations.'}
write(V2/'source-selection.json',selection)

plan=['# WP-L1B metadata v2: semantic sources and observation plan','',
 'The four body files and all v1 files remain immutable. This correction changes the declared inputs and their evidence correspondence, so it needs independent review/binding of this exact v2 metadata; no old PASS is transferred.','',
 '## The corrected dependency claim','',
 'A file is a direct native input when its code, contract or generator supports a concrete statement in a body. Classification alone is not that dependency. `source-selection.json` records each selected source, cited ranges or helper reason, and a justification for every one of the 41 preserved semantic groups. The original `coverage.json` still holds exactly 2,220 rows with their identities and origins.','',
 'The new compact `population-evidence.json` supports the fixed-baseline census, classifications, observer limits, duplicate ADR prefix and historical log-envelope counts. It was derived from the immutable inventory/capture/coverage and checked against all 2,220 captured blob identities. Its hash is the identity of a new static evidence file; it is not an observed version of those originals.','',
 '## Same-path source materialization','',
 f'- Materialize selected code/instruction files from `{REV}` at their original repository paths.',
 f'- Materialize the five pinned protocol files from `{PROTOCOL}` at their original `.orchestra/skills/execute-genesis/` paths.',
 '- This is explicit multi-pin materialization, not a claim that one Git checkout contains both revisions. Report `observed_head = null`; `source_revision` names the code baseline. Keep candidate runtime implementation outside this source copy.',
 '- For every `source_refs.path`, preserve `file:<same path>` in `input_keys`. Prepare must read the exact bytes at that path and check the recorded origin hash. Do not relocate a referenced source silently or map an origin path to a different payload path.',
 '- Copy new compact payload inputs to their exact declared repository-relative result paths. They have payload references and actual SHA-256 values; no commit is invented before sealing.',
 '- Runtime input versions must be produced by the real observer. This producer checked bytes, limits and correspondence only; no prepare/index/read/publication was run.','',
 '## Refused origins and the historical .atlas claim','',
 'The immutable governance body uses the three `.atlas` files only for historical record counts/envelope structure: 4 logbook, 96 board and 9 orientation records. Direct native `file:.atlas/...` observation is refused and is not claimed. The snapshot preserves each original commit/path/Git blob/SHA-256/byte length and derived keys/count; it contains no record payloads. A reader may conclude what the captured baseline showed, not current sessions, authorship or publication.','',
 'The two `.atlas/index.scip` fixtures and three oversized generated files remain fully present in coverage. The snapshot records their origin/size/refusal disposition. The bodies use fixture/category/generator/origin facts, not the bulk bytes as current product evidence. Generated/source parity and dataset currency remain unknown.','',
 'No native file input points to the 711,587-byte inventory, 594,072-byte capture receipt, oversized coverage register, refused origins or bulk generated/history files merely classified. Their exact historical provenance is inside the compact snapshot and the unchanged full coverage. Reading the snapshot is not a workaround that grants observation of an origin the guard refused.','',
 '## Refresh and validity limits','',
 'Current observation covers selected semantic files, production contracts and these compact payloads. It does not certify freshness of the full preserved population or whole-domain ownership. If source revision, assigned membership, classification recipe or a claimed historical count changes, recapture/rederive the snapshot and review the changed result. If a later claim needs current .atlas content or generated parity, that remains unavailable/unverified until a compatible authorized mechanism supplies new evidence. Native prepare alone cannot establish those facts.','',
 'The bodies remain `supported` as bounded static source evidence; independent judges must decide whether the compact derivation adequately supports the unchanged claims. No unobservable current claim is promoted to supported. Original producer request/response references remain intact; the new recipe/evidence records the metadata correction separately.','',
 '## Per-group correspondence','', '| Group | Paths preserved | Semantic source or inventory role |','|---|---:|---|']
for g in groups:
    names=sorted({p for entry in g['effective_semantic_sources'] for p in entry['semantic_source_paths']})
    detail=g['justification']
    if names:detail+=' Selected file names: '+', '.join('`'+Path(p).name+'`' for p in names)+'.'
    else:detail+=' No direct semantic source file from this group is declared; only frozen population/origin facts are used.'
    plan.append(f'| `{g["semantic_group"]}` | {g["preserved_path_count"]} | {detail} |')
plan+=['','Full repository paths, exact origins and citation ranges are in `metadata-v2/source-selection.json`; original population rows stay in `coverage.json`.','']
(OUT/'observation-plan.md').write_text('\n'.join(plan))

recipe={'schema':'s4-l1b-metadata-correction-recipe/v2','execution_id':EXECUTION,
 'operation':'Metadata-only semantic input correction; preserve four bodies and all v1 files.',
 'source_revision':REV,'protocol_revision':PROTOCOL,
 'original_body_request':payload_ref(OUT/'request.txt'),'original_body_response':payload_ref(OUT/'response.md'),
 'correction_request':payload_ref(OUT/'correction-request.txt'),'schema_constraint':payload_ref(V2/'schema-constraint.txt'),
 'observation_plan':payload_ref(OUT/'observation-plan.md'),'selection':payload_ref(V2/'source-selection.json'),
 'population_snapshot':payload_ref(V2/'population-evidence.json'),
 'classification_recipe':payload_ref(OUT/'build_coverage.py'),'correction_recipe':payload_ref(V2/'build_metadata_v2.py'),
 'public_criteria':['QS-1','QS-2','QS-3','QS-5','CC-3','GO-I2','GO-I3','GO-I5','GO-I7','GO-I8'],
 'body_binding':[{'key':a['key'],'body':a['body']} for a in v1],
 'build_dependencies':[],'native_observation':'not run; no runtime versions manufactured'}
write(V2/'recipe.json',recipe)

common=[OUT/'request.txt',OUT/'correction-request.txt',OUT/'build_coverage.py',OUT/'observation-plan.md',
 V2/'population-evidence.json',V2/'source-selection.json',V2/'recipe.json',V2/'schema-constraint.txt',V2/'build_metadata_v2.py']
for p in common:assert 0<p.stat().st_size<=256000,(p,p.stat().st_size)
bodyproof=[{'key':a['key'],'body':a['body'],'selected_source_ref_count':len(selected[a['key']]),
 'native_input_count':len(selected[a['key']])+len(common)} for a in v1]
response=['# WP-L1B metadata correction response','',
 'A nova versão separa fontes semânticas de população preservada. `artifacts-v2.json` usa somente os arquivos citados, auxiliares justificados, contratos e nove inputs compactos de receita/evidência. Os quatro corpos, `artifacts.json`, `coverage.json`, o pedido/resposta originais e todos os demais arquivos v1 continuam byte a byte iguais.','',
 '| Artefato | Source refs v2 | Inputs v2 |','|---|---:|---:|']
for p in bodyproof:response.append(f'| `{p["key"]}` | {p["selected_source_ref_count"]} | {p["native_input_count"]} |')
response+=['',
 '`metadata-v2/source-selection.json` explica cada fonte e todos os 41 grupos; `observation-plan.md` distingue fonte semântica, inventário e origem histórica. `metadata-v2/population-evidence.json` preserva os digests da captura/inventário/coverage, as contagens e as oito limitações do observador. A população original mantém seus 2.220 caminhos; nenhum foi removido.','',
 'A afirmação sobre os três logs `.atlas` está delimitada a contagens/envelopes históricos da captura: 4, 96 e 9 registros. A observação nativa desses caminhos continua recusada. O novo input é o snapshot estático com origem exata; não se apresenta seu hash como versão runtime dos logs. Paridade dos bundles e atualidade dos dados gerados continuam não verificadas.','',
 'Cada `source_refs.path` conserva `file:<mesmo path>`. O plano exige materialização multi-pin explícita: código baseline e protocolo pinado nos paths originais, `observed_head=null`, com o código candidato separado. Não se inventou commit para payloads nem versão de input.','',
 'Verifiquei a correspondência de caminhos, hashes, tamanhos ≤256.000 bytes dos inputs declarados, a derivação estática e a imutabilidade v1. Isso não executou native prepare, testes de produto, runtime ou publicação, nem emitiu aceite semântico. Os juízes precisam avaliar esta correspondência v2 antes de um binding novo.','']
(OUT/'correction-response.md').write_text('\n'.join(response))

artifacts=[]
for old in v1:
    a=copy.deepcopy(old);key=a['key']
    a['source_refs']=[{k:e['source_ref'][k] for k in ('commit','path','git_blob_sha','sha256')} for e in selected[key]]
    a['input_keys']=['file:'+r['path'] for r in a['source_refs']]+['file:'+payload_ref(p)['payload_path'] for p in common]
    assert len(a['input_keys'])==len(set(a['input_keys']))
    a['recipe_ref']={k:payload_ref(V2/'recipe.json')[k] for k in ('payload_path','sha256')}
    a['authority']['basis'] += ' Metadata v2 follows the explicit correction request. Source refs identify effective semantic excerpts/contracts/helpers, not every classified population member. Population/envelope claims are bounded static evidence through the compact snapshot; origin refusal and generated parity limits remain. The original body producer request/response are preserved.'
    a['gaps'] += [
      'Native freshness covers selected semantic sources and compact static payload inputs only, not every preserved population file or whole-domain current ownership.',
      'The eight refused/oversized origins remain in coverage and snapshot provenance; none is claimed currently observed. Historical .atlas counts use a derived static snapshot, not direct native reads.',
      'Metadata v2 requires new independent correspondence/binding review. Source-copy materialization is explicitly multi-pin with observed_head=null; no prepare run is claimed.'
    ]
    a['evidence']=[
      'Unchanged body bytes and citations retain the source-derived claims; exact source_refs below are the effective semantic subset.',
      'Semantic source/range and per-group justification: '+json.dumps(payload_ref(V2/'source-selection.json'),ensure_ascii=False),
      'Compact static population/envelope evidence: '+json.dumps(payload_ref(V2/'population-evidence.json'),ensure_ascii=False),
      'Same-path observation plan and validity limits: '+json.dumps(payload_ref(OUT/'observation-plan.md'),ensure_ascii=False),
      'Correction request: '+json.dumps(payload_ref(OUT/'correction-request.txt'),ensure_ascii=False),
      'Correction response: '+json.dumps(payload_ref(OUT/'correction-response.md'),ensure_ascii=False),
      'Original full 2220-row coverage remains unchanged at SHA-256 9d0473edc9de818e36111cd741928d5ab5be05ac063439aeac11719ac0fc9759; it is historical provenance, not a native file input.',
      'Public criteria remain QS-1/QS-2/QS-3/QS-5, CC-3, GO-I2/GO-I3/GO-I5/GO-I7/GO-I8; these are review targets, not verdicts.'
    ]
    assert all('file:'+r['path'] in a['input_keys'] for r in a['source_refs'])
    assert a['body']==old['body'] and a['producer_request_ref']==old['producer_request_ref'] and a['producer_response_ref']==old['producer_response_ref']
    assert a['build_dependencies']==[]
    artifacts.append(a)
write(OUT/'artifacts-v2.json',artifacts)
for path,digest in immutable.items():assert sha((OUT/path).read_bytes())==digest,path
report={'schema':'s4-l1b-metadata-v2-receipt','execution_id':EXECUTION,
 'artifacts_v2':payload_ref(OUT/'artifacts-v2.json'),'observation_plan':payload_ref(OUT/'observation-plan.md'),
 'population_snapshot':payload_ref(V2/'population-evidence.json'),'selection':payload_ref(V2/'source-selection.json'),
 'correction_response':payload_ref(OUT/'correction-response.md'),
 'bodies_and_counts':bodyproof,'all_v1_files_unchanged':True,'v1_file_count':len(immutable),
 'preserved_population_count':2220,'observer_limited_origins_preserved':8,
 'same_source_ref_and_input_path':True,'every_declared_input_at_most_256000_bytes':True,
 'largest_selected_source_bytes':max(e['byte_length'] for entries in selected.values() for e in entries),
 'compact_inputs':[payload_ref(p) for p in common],
 'runtime_observation':'not run','semantic_acceptance':'not asserted'}
write(V2/'correction-receipt.json',report)
print(json.dumps({k:v for k,v in report.items() if k not in {'compact_inputs'}},ensure_ascii=False,indent=2))
