"""Deterministic transport assembly only; no product code or test execution."""
from pathlib import Path
import hashlib
import json

BASE = Path('/workspace/scratch/dd08f46a3e40')
OUT = BASE / 'agents/produce_libraries'
CBASE = BASE / 'agents/recover_tools_libraries/materialized'
COREBASE = BASE / 'agents/recover_sessions'
S1 = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/'
DEST = S1 + 'subslices/05-libraries/producers/l2-resume/'
SOURCE = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
C_COMMIT = 'a8df22ae3a140c58c63f62ce2a634c84f415c943'
CORE_COMMIT = '9fd024a34e76d2e9328e1f793ef1f69fbf606e51'

def identity(path):
    data = path.read_bytes()
    return {'byte_length': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def write_json(name, value):
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return path

def payload(name):
    return {'payload_path': DEST + name, 'sha256': identity(OUT / name)['sha256']}

def committed(commit, path, local):
    return {'commit': commit, 'path': path, 'sha256': identity(local)['sha256']}

c_pkg = json.loads((CBASE / 'native-package.c-r1-v2.json').read_bytes())
core_pkg = json.loads((COREBASE / 'native-package.json').read_bytes())
acceptance = json.loads((COREBASE / 'judgments/acceptance-index.json').read_bytes())
contract_bytes = (BASE / 'agents/recover_tools_libraries/libs_contract.json').read_bytes()
canonical_contract = (CBASE / 'libs_contract.json').read_bytes()
if json.loads(contract_bytes) != json.loads(canonical_contract):
    raise ValueError('Public contract projections disagree')
(OUT / 'public-contract-read.json').write_bytes(contract_bytes)
contract = json.loads(contract_bytes)

c_ref = committed(C_COMMIT, S1 + 'native-package.c-r1-v2.json', CBASE / 'native-package.c-r1-v2.json')
core_ref = committed(CORE_COMMIT, S1 + 'subslices/01-sessions/native-package.json', COREBASE / 'native-package.json')
index_ref = committed(CORE_COMMIT, S1 + 'subslices/01-sessions/judgments/acceptance-index.json', COREBASE / 'judgments/acceptance-index.json')
contract_origin = committed('4fd2b5e7690a486e87fba0abe2daedcdbfd26c88', S1 + 'subslices/05-libraries/public-contract.json', CBASE / 'libs_contract.json')

definitions = [
    {'slug': 'llm-contracts', 'need': 'component', 'title': 'Do request ao settlement de uma ferramenta',
     'c': ['s1.runtime.llm_turns.l1', 's1.runtime.llm_providers.l1'],
     'core': ['s1.core.session-execution'], 'raw': ['packages/llm/src/tool.ts', 'packages/llm/src/tool-runtime.ts'],
     'basis': 'Synthesis of accepted bounded LLM L1, accepted source-only Session runner boundary, and two pinned source reads for schema-failure settlement. Core routing, Tools authority and unresolved completions are excluded.',
     'gaps': ['C-N01-host remains pending; accepted runner facts do not certify Tools authorization or all Session continuation claims.', 'C-N02 route adoption remains pending for Models/Runtime; no remote-provider compatibility is established.', 'N03: no provider, tool, CI, Atlas or consumer execution receipt; N04/N06/X01 remain bounded.']},
    {'slug': 'extension-contracts', 'need': 'component', 'title': 'Contratos de extensão, CodeMode e OpenAPI',
     'c': ['s1.runtime.plugin.l1', 's1.runtime.codemode.l1', 's1.runtime.codemode_openapi.l1'], 'core': [], 'raw': [],
     'basis': 'Local synthesis of accepted package declarations, selected interpreter boundaries and OpenAPI adapter behavior. Host/Tools policy and lifecycle claims remain excluded pending accepted suppliers.',
     'gaps': ['C-N01-host remains pending; no loader, host permission or installation execution claim.', 'N04 preserves selected interpreter/operator coverage; N06 preserves unread large OpenAPI and other metadata-only fixtures.', 'N03: no network, tool, replay, CI or Atlas execution. X01 preserves output-envelope, Promise, redirect and response-schema limits.']},
    {'slug': 'storage-evidence', 'need': 'operational', 'title': 'Diagnóstico de armazenamento, gravação e replay',
     'c': ['s1.runtime.effect_sqlite.l1', 's1.runtime.http_recorder.l1', 's1.runtime.llm_recording.l1'], 'core': ['s1.core.persistence'], 'raw': [],
     'basis': 'Operational synthesis of accepted generic adapters and recording contracts, with exact accepted Core persistence mechanism used only where explicitly attributed. No restore, driver-adoption or execution qualification.',
     'gaps': ['C-N02 is only partially available: accepted persistence does not establish driver adoption, absence of consumers, restore or pending Models/Runtime completions.', 'N03: no database, migration, replay, build, CI, provider or Atlas execution receipt.', 'N04/N06 retain depth and unread fixtures; X01 retains unimplemented Node streaming and different public/internal socket chronology.']},
    {'slug': 'intent-authority', 'need': 'maintenance', 'title': 'Da orientação documental à afirmação do produto',
     'c': ['s1.runtime.guides_intent.l1', 's1.runtime.maintenance_intent.l1'], 'core': ['s1.core.configuration', 's1.subslice01.config-project-supplement'], 'raw': [],
     'basis': 'Synthesis of accepted documentary intent with exact accepted Core decoder/publisher comparison. The specific C-N05 claim is bound; whole-R2 closeout, generated freshness, regeneration and runtime guarantees are excluded.',
     'gaps': ['N05 runtime regeneration/equality/freshness remain unexecuted despite the accepted source-only decoder/publisher comparison.', 'C-N01-host and unaccepted parts of C-N02/completions remain pending; no general host-policy or restore assertion.', 'N03: M1-M3, import/binding/publication and consumption remain NOT_RUN; N04/N06/X01 retained.']},
]

c_lookup = {a['key']: a for a in c_pkg['artifacts']}
core_lookup = {a['key']: a for a in core_pkg['artifacts']}
predecessors = {}
for definition in definitions:
    for kind, lookup, local_base, prefix, package_ref, commit in [
        ('c', c_lookup, CBASE, S1, c_ref, C_COMMIT),
        ('core', core_lookup, COREBASE, S1 + 'subslices/01-sessions/', core_ref, CORE_COMMIT),
    ]:
        for key in definition[kind]:
            artifact = lookup[key]
            local = local_base / artifact['body']['path']
            actual = identity(local)
            if actual != {k: artifact['body'][k] for k in ['byte_length', 'sha256']}:
                raise ValueError('Predecessor body mismatch: ' + key)
            if kind == 'core':
                item = acceptance['artifacts'][key]
                if item['state'] != 'ACCEPTED_BY_SAME_NATIVE_PAIR' or item['body_sha256'] != actual['sha256']:
                    raise ValueError('Unaccepted Core predecessor: ' + key)
            predecessors[key] = {
                'key': key, 'package_ref': package_ref, 'body_ref': committed(commit, prefix + artifact['body']['path'], local),
                'body_identity': actual, 'local_path': str(local), 'source_revision': SOURCE,
                'acceptance_basis': 'Accepted bounded C L1 supplied by the principal; exact inherited reviews preserved, no new approval' if kind == 'c' else 'ACCEPTED_BY_SAME_NATIVE_PAIR in exact acceptance index',
                'semantic_review_refs': artifact['semantic_review_refs'],
                'acceptance_index_ref': index_ref if kind == 'core' else None,
                'authority': artifact['authority'], 'validity': artifact['validity'], 'retained_gaps': artifact['gaps'],
            }
write_json('predecessor-bindings.json', {'schema': 'genesis-l2-predecessor-bindings/v1', 'producer': '/root/produce_libraries', 'source_revision': SOURCE, 'predecessors': list(predecessors.values())})

coverage = json.loads((CBASE / 'producers/c/coverage.json').read_bytes())
population = json.loads((CBASE / 'producers/c/population.json').read_bytes())
metadata_only = json.loads((CBASE / 'revisions/c-l1-evidence-v1/R1-metadata-only-dispositions.json').read_bytes())
paths = sorted(e['path'] for e in population)
if len(paths) != 323 or len(set(paths)) != 323 or set(paths) != {e['path'] for e in coverage['entries']}:
    raise ValueError('C population identity mismatch')
meta_paths = {e['path'] for e in metadata_only['entries']}
if len(meta_paths) != 39 or meta_paths != {e['path'] for e in coverage['entries'] if e['depth'] == 'git_metadata_only'}:
    raise ValueError('Metadata-only disposition mismatch')
if any(e['captured'] or e['read_status'] != 'not_read' for e in metadata_only['entries']):
    raise ValueError('Metadata-only authority was changed')
coverage_refs = [committed(C_COMMIT, S1 + p, CBASE / p) for p in ['producers/c/coverage.json', 'producers/c/population.json', 'revisions/c-l1-evidence-v1/R1-metadata-only-dispositions.json']]
write_json('coverage-preservation.json', {
    'schema': 'genesis-l2-coverage-preservation/v1', 'source_revision': SOURCE, 'refs': coverage_refs,
    'count': 323, 'captured_assigned': 284, 'metadata_only_count': 39,
    'membership_algorithm': 'sha256 of sorted repo paths joined by LF with one final LF, UTF-8',
    'membership_sha256': hashlib.sha256(('\n'.join(paths) + '\n').encode()).hexdigest(),
    'paths': paths, 'metadata_only_dispositions': metadata_only['entries'],
    'authority': 'Path membership and original metadata dispositions preserved; no fixture body was read and no semantic depth was promoted.'})

source_entries = []
for source_path, name in [('packages/llm/src/tool.ts', 'tool.ts'), ('packages/llm/src/tool-runtime.ts', 'tool-runtime.ts')]:
    inherited = next(r for r in c_lookup['s1.runtime.llm_turns.l1']['source_refs'] if r['path'] == source_path)
    local = OUT / 'evidence/source' / name
    actual = identity(local)
    if actual['sha256'] != inherited['sha256']:
        raise ValueError('Additional source mismatch: ' + source_path)
    source_entries.append({'source_ref': inherited, 'local_path': 'evidence/source/' + name, **actual,
        'method': 'GitHub fetch_file at exact pin', 'purpose': 'Narrow additional source read: input/success schema error mapping and settlement projection; no L1 re-mining or re-approval', 'depth': 'full file read'})
write_json('evidence/source-manifest.json', {'schema': 'genesis-pinned-source-capture/v1', 'repository': 'gustavomhss/hugr-orchestra', 'source_revision': SOURCE, 'fetch_file_calls': 2, 'captured_utf8_bytes': sum(e['byte_length'] for e in source_entries), 'entries': source_entries})

read_specs = [
    ('protocol/AGENTS.md', 'full instructions'), ('protocol/SKILL.md', 'full public protocol'), ('protocol/fatia-1.md', 'full public scope'),
    ('protocol/principles.md', 'full public principles'), ('protocol/transport.md', 'full public transport'), ('protocol/orchestration.md', 'full public orchestration'),
    ('agents/recover_tools_libraries/libs_contract.json', 'full public contract; exact local bytes preserved'),
    ('agents/recover_tools_libraries/materialized/libs_contract.json', 'canonical contract identity and semantic equality comparison'),
    ('agents/recover_tools_libraries/materialized/native-package.c-r1-v2.json', 'metadata parsed; targeted artifact/source/ref projections'),
    ('agents/recover_sessions/native-package.json', 'metadata parsed; only accepted Core selected'),
    ('agents/recover_sessions/judgments/acceptance-index.json', 'full acceptance states; only accepted keys used'),
    ('agents/recover_tools_libraries/materialized/c_needs.json', 'N01-N06/X01 proposals and retained gaps'),
    ('agents/recover_tools_libraries/reconciliation-report.json', 'R2 dependency section and exact-key searches'),
    ('agents/recover_tools_libraries/SUMMARY.md', 'targeted R2/coverage lines'),
    ('agents/recover_tools_libraries/libraries_work.md', 'targeted R2/coverage lines'),
    ('agents/recover_tools_libraries/c_frozen.md', 'targeted coverage and authority lines; no oracle content'),
    ('agents/recover_tools_libraries/materialized/producers/c/coverage.json', 'metadata/disposition parse, not source contents'),
    ('agents/recover_tools_libraries/materialized/producers/c/population.json', 'complete path/blob/size metadata'),
    ('agents/recover_tools_libraries/materialized/revisions/c-l1-evidence-v1/R1-artifact-coverage-projection.json', 'selected projection/count metadata'),
    ('agents/recover_tools_libraries/materialized/revisions/c-l1-evidence-v1/R1-metadata-only-dispositions.json', 'complete 39 metadata dispositions, no fixture bodies'),
    ('agents/recover_tools_libraries/materialization-receipt.json', 'origin identity projection'),
    ('agents/recover_tools_libraries/remote-materialization.json', 'origin metadata projection; permitted artifact references, no reserved contents consulted'),
    ('agents/recover_sessions/retrieval-metadata.json', 'origin URLs/Git blob metadata for package and index'),
    ('agents/recover_sessions/recovery-report.json', 'checkpoint and key projection'),
    ('agents/recover_sessions/handoff.json', 'origin/branch key projection'),
]
read_records = [{'path': p, 'scope': scope, **identity(BASE / p)} for p, scope in read_specs]
for p in predecessors.values():
    read_records.append({'path': p['local_path'], 'key': p['key'], 'scope': 'section A through line 29 and targeted matches' if p['key'] == 's1.subslice01.config-project-supplement' else 'full body', **p['body_identity']})
write_json('reads-and-limits.json', {
    'schema': 'genesis-producer-read-record/v1', 'producer_id': '/root/produce_libraries', 'source_revision': SOURCE,
    'skills_applied': ['host-workspace-operator', 'sandbox-python-executor'], 'reads': read_records,
    'additional_source_manifest': payload('evidence/source-manifest.json'),
    'output_truncation_note': 'Initial large metadata printouts were truncated. Later targeted projections supplied the decisive identities and limitations; no claim depends on an unseen tail.',
    'original_request': payload('request.txt'), 'original_request_text_status': 'Visible assigned task preserved; no private reasoning captured.',
    'reserved_content_access': False, 'reserved_reference_note': 'Permitted predecessor metadata includes references to reserved materials; no reserved file or expected-answer content was opened.',
    'execution': {'new_native_producer': 1, 'github_file_reads': 2, 'github_captured_utf8_bytes': sum(e['byte_length'] for e in source_entries), 'remote_writes': 0, 'product_tests': 0, 'provider_calls': 0, 'credential_reads': 0, 'Atlas_operations': 0, 'consumer_runs': 0, 'tokens': 'UNKNOWN', 'physical_model_attempts': 'UNKNOWN', 'billing': 'UNKNOWN'},
    'limit_ids_preserved': ['N01', 'N02', 'N03', 'N04', 'N05', 'N06', 'X01'],
    'state': 'Four L2 candidates authored; semantic reviews, binding/publication and consumers remain pending. No L3/L4 produced.',
    'contract_projection': {'local_read': payload('public-contract-read.json'), 'canonical_origin': contract_origin, 'json_semantics_equal': True, 'local_has_one_extra_terminal_LF': contract_bytes == canonical_contract + b'\n'},
})

write_json('recipe.json', {
    'schema': 'genesis-l2-production-recipe/v1', 'version': 1, 'producer_id': '/root/produce_libraries', 'model_label': 'GPT-6 Astra Pro (developer-provided label); actual host model identifier UNKNOWN',
    'source_revision': SOURCE, 'protocol_ref': c_pkg['protocol_ref'], 'public_contract_ref': payload('public-contract-read.json'), 'canonical_public_contract_ref': contract_origin,
    'request_ref': payload('request.txt'), 'transport_assembler_ref': payload('assemble.py'), 'required_keys': [f"s1.subslice05.{d['slug']}.l2" for d in definitions], 'criteria': contract['criteria'],
    'method': ['Reuse exact accepted C L1 once, without reapproval or broad source mining.', 'Add only accepted Core predecessors supporting explicit bounded claims.', 'Read tool.ts and tool-runtime.ts at the pin only for success-schema failure conversion.', 'Author useful cumulative local L2; preserve blocked external claims and N03/X01.', 'Compute transport identities and reconcile paths; no product tests, runtime proof, remote writes or credential access.'],
    'predecessor_bindings_ref': payload('predecessor-bindings.json'), 'coverage_ref': payload('coverage-preservation.json'),
    'read_record_ref': payload('reads-and-limits.json'), 'source_manifest_ref': payload('evidence/source-manifest.json'),
    'artifact_contracts': [{k: d[k] for k in ['slug', 'need', 'c', 'core', 'raw', 'basis', 'gaps']} for d in definitions],
    'membership': 'Inherited 323-path coverage/population remains fixed and bound; future source membership changes require the existing ownership observation/rebuild workflow. No runtime membership observation is asserted.',
})

rows = []
for d in definitions:
    ident = identity(OUT / 'bodies' / (d['slug'] + '.md'))
    rows.append('| `' + f"s1.subslice05.{d['slug']}.l2" + '` | ' + str(ident['byte_length']) + ' | `' + ident['sha256'] + '` |')
response = '''# Entrega original do produtor — quatro L2 locais

Produzidos os quatro candidatos contratados em `agents/produce_libraries/bodies/`. O estado é **REVIEW**, sem parecer semântico novo, sem fechamento global de R2 e sem liberação de L3/L4.

| Chave | Bytes UTF-8 | SHA-256 |
| --- | ---: | --- |
''' + '\n'.join(rows) + '''

[fragment-metadata.json](sandbox:/workspace/scratch/dd08f46a3e40/agents/produce_libraries/fragment-metadata.json) usa o formato nativo e caminhos de corpo relativos ao diretório S1 de `native-package.json`; [local-path-map.json](sandbox:/workspace/scratch/dd08f46a3e40/agents/produce_libraries/local-path-map.json) liga esses caminhos aos arquivos locais. O prefixo remoto proposto é `subslices/05-libraries/producers/l2-resume/`. Nenhuma escrita remota ocorreu.

As dependências preservam os dez L1 C aceitos no alcance delimitado e quatro chaves Core efetivamente usadas: session-execution, persistence, configuration e config-project-supplement. Todas as quatro estão `ACCEPTED_BY_SAME_NATIVE_PAIR` no índice exato. Models/Runtime/Economy, Tools e completions pendentes não foram usados como fornecedores aceitos.

O vínculo de configuração resolve apenas a comparação específica decoder/schema: o loader inspecionado ignora excess properties com opção explícita, enquanto o schema capturado é fechado. Regeneração, igualdade/freshness de output e o restante de R2 continuam sem prova nova.

Foram preservados 323 paths e 39 disposições metadata-only. Duas leituras adicionais, `tool.ts` e `tool-runtime.ts`, totalizaram 12.664 bytes capturados no pin e esclareceram a conversão da falha de success schema para ToolFailure/eventos de erro. Nenhuma fixture não lida, fonte de oracle ou resposta esperada foi consultada. N03/X01 e os demais limites pertinentes permanecem explícitos.

O contrato local efetivamente lido tem um LF terminal a mais que o arquivo remoto canônico; o JSON é idêntico. Ambos os vínculos foram preservados sem atribuir ao commit remoto o hash da projeção local. Bytes/hashes dos predecessores e o censo de cobertura foram conferidos deterministicamente. Essas conferências não são testes do produto nem provas Atlas.

Request, receita, resposta, registros de leitura, proveniência e cobertura acompanham os corpos. Provider, ferramentas, banco, migração, replay, build, CI, Atlas e consumidores: **NOT_RUN**. Tokens, tentativas físicas de modelo e custo: **UNKNOWN**.
'''
(OUT / 'response.md').write_text(response, encoding='utf-8')

artifacts = []
local_map = []
for d in definitions:
    key = f"s1.subslice05.{d['slug']}.l2"
    local_body = OUT / 'bodies' / (d['slug'] + '.md')
    body_path = 'subslices/05-libraries/producers/l2-resume/bodies/' + d['slug'] + '.md'
    all_keys = d['c'] + d['core']
    source_refs = [predecessors[k]['body_ref'] for k in all_keys]
    source_refs += [e['source_ref'] for e in source_entries if e['source_ref']['path'] in d['raw']]
    inputs = ['file:' + r['path'] for r in source_refs]
    inputs += ['file:' + DEST + p for p in ['request.txt', 'recipe.json', 'public-contract-read.json']]
    inputs += ['file:' + S1 + 'producers/c/coverage.json', 'file:' + S1 + 'producers/c/population.json']
    if d['core']:
        inputs.append('file:' + index_ref['path'])
    artifacts.append({
        'key': key, 'scope': 'orchestra.s1', 'title': d['title'], 'layer': 2, 'need': d['need'],
        'body': {'path': body_path, 'encoding': 'utf-8', **identity(local_body)},
        'authority': {'scope': 'orchestra.s1', 'basis': d['basis']}, 'validity': 'supported',
        'gaps': d['gaps'] + ['Candidate L2 only; semantic review and Atlas binding/publication/consumption remain pending. No R2 closure or L3/L4 release.'],
        'evidence': [json.dumps(payload(p), ensure_ascii=False, separators=(',', ':')) for p in ['predecessor-bindings.json', 'coverage-preservation.json', 'reads-and-limits.json', 'evidence/source-manifest.json']],
        'input_keys': list(dict.fromkeys(inputs)), 'source_refs': source_refs,
        'recipe_ref': payload('recipe.json'), 'build_dependencies': [{'key': k, 'package_ref': predecessors[k]['package_ref']} for k in all_keys],
        'navigation': [f"s1.subslice05.{other['slug']}.l2" for other in definitions if other['slug'] != d['slug']],
        'producer_request_ref': payload('request.txt'), 'producer_response_ref': payload('response.md'),
        'semantic_review_refs': [], 'runtime_receipt_refs': [],
    })
    local_map.append({'key': key, 'native_body_path': body_path, 'local_path': str(local_body), **identity(local_body)})
write_json('fragment-metadata.json', {
    'schema': 'genesis-native-package/v1', 'campaign': '20261111-v1', 'protocol_epoch': 'parallel-v3-fresh', 'results_epoch': '20261111-v3-fresh',
    'session': 'S1', 'source_revision': SOURCE, 'protocol_ref': c_pkg['protocol_ref'], 'scope': 'orchestra.s1', 'package_state': 'LOCAL_L2_CANDIDATES_REVIEW',
    'contract': {'criteria': contract['criteria'], 'oracle_ref': None, 'public_contract_ref': payload('public-contract-read.json')},
    'required_artifact_keys': [a['key'] for a in artifacts], 'artifacts': artifacts,
    'roots': {'component': 's1.subslice05.llm-contracts.l2', 'operational': 's1.subslice05.storage-evidence.l2', 'maintenance': 's1.subslice05.intent-authority.l2'},
    'missing_required_artifact_keys': [],
    'known_limits': ['Fragment selection consists only of the four assigned local L2; the six-artifact full public contract is not complete.', 'Source-supported authority is bounded to the bodies; no semantic PASS for the new L2 is claimed.', 'Oracle binding belongs to the principal; its contents were not read and no reference was invented.', 'R2 and all excluded external claims remain pending; unsupported external artifacts are not consumed as build dependencies.', '323 inherited paths and 39 metadata-only dispositions are preserved; underlying source read depths are unchanged.', 'N03/X01 and relevant N01/N02/N04/N05/N06 remain explicit; no product or Atlas execution was performed.'],
    'fragment': {'merge_target': S1 + 'native-package.json', 'body_path_base': S1, 'payload_prefix': DEST, 'local_root': str(OUT), 'state': 'REVIEW', 'local_path_map': 'local-path-map.json', 'no_remote_writes': True},
})
write_json('local-path-map.json', {'schema': 'genesis-local-transport-map/v1', 'merge_target': S1 + 'native-package.json', 'entries': local_map})

receipt = {'schema': 'genesis-producer-transport-check/v1', 'producer': '/root/produce_libraries', 'check_kind': 'Deterministic byte, identity and membership reconciliation only; not product/Atlas tests or semantic approval',
    'four_required_L2_present': len(artifacts) == 4, 'body_hashes': local_map, 'verified_predecessor_bodies': len(predecessors),
    'accepted_C_predecessors_reused': sum(k.startswith('s1.runtime.') for k in predecessors), 'accepted_Core_predecessors_used': len({k for d in definitions for k in d['core']}),
    'c_population': 323, 'metadata_only': 39, 'additional_source_bytes': sum(e['byte_length'] for e in source_entries),
    'new_semantic_review_count': 0, 'runtime_receipt_count': 0, 'artifact_validity_meaning': 'supported only within explicitly bounded source-based local claims; candidate review remains pending',
    'fragment_identity': identity(OUT / 'fragment-metadata.json'), 'response_identity': identity(OUT / 'response.md'), 'package_assembly_or_publication_executed': False}
write_json('transport-check.json', receipt)
print(json.dumps({'state': 'REVIEW', 'bodies': local_map, 'predecessors': len(predecessors), 'coverage': [323, 39], 'fragment': identity(OUT / 'fragment-metadata.json')}, ensure_ascii=False, indent=2))
