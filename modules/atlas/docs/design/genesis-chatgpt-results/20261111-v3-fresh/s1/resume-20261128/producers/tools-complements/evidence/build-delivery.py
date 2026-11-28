"""Deterministic data/hashing packaging only; does not import or execute product code."""
from pathlib import Path
from collections import Counter, defaultdict
import hashlib
import json
import re
import shutil

ROOT = Path('/workspace/scratch/dd08f46a3e40/agents/produce_tools')
RECOVERY = Path('/workspace/scratch/dd08f46a3e40/agents/recover_tools_libraries')
PROTOCOL = Path('/workspace/scratch/dd08f46a3e40/protocol')
COMMIT = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
PROTOCOL_COMMIT = 'ee2521a5b966bd505cc95bd1c733e09e12f33531'
PREFIX = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/resume-20261128/producers/tools-complements'
BODY_PREFIX = 'resume-20261128/producers/tools-complements'

def digest(b):
    return {'byte_length': len(b), 'sha256': hashlib.sha256(b).hexdigest(),
            'git_blob_sha': hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()}

def write_json(name, value):
    target = ROOT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def ref(name):
    return {'payload_path': PREFIX + '/' + name, 'sha256': digest((ROOT / name).read_bytes())['sha256']}

def merge_ranges(ranges):
    result = []
    for start, end in sorted(set(map(tuple, ranges))):
        if result and start <= result[-1][1] + 1:
            result[-1][1] = max(result[-1][1], end)
        else:
            result.append([start, end])
    return result

# Exact public inputs; never oracle/review/request/response material from another producer.
input_records = []
for name in ['a_needs.json', 'tools-source-map.json', 'tools_contract.json', 'tools_work.md']:
    destination = ROOT / 'inputs' / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(RECOVERY / name, destination)
    input_records.append({'input_role': 'public_projection_or_contract', 'original_local_path': str(RECOVERY / name),
                          'capture_path': 'inputs/' + name, **digest(destination.read_bytes())})
for name in ['AGENTS.md', 'transport.md', 'principles.md']:
    destination = ROOT / 'inputs' / ('protocol-' + name)
    shutil.copyfile(PROTOCOL / name, destination)
    input_records.append({'input_role': 'protocol', 'asserted_protocol_revision': PROTOCOL_COMMIT,
                          'original_local_path': str(PROTOCOL / name), 'capture_path': 'inputs/protocol-' + name,
                          **digest(destination.read_bytes())})
write_json('input-manifest.json', {'schema': 'genesis-producer-public-inputs/v1', 'entries': input_records})

assigned = json.loads((ROOT / 'inputs/tools-source-map.json').read_text())['entries']
by_path = {item['path']: item for item in assigned}
assert len(assigned) == len(by_path) == 424
needs = json.loads((ROOT / 'inputs/a_needs.json').read_text())['needs']
contract = json.loads((ROOT / 'inputs/tools_contract.json').read_text())
assert json.loads((ROOT / 'inputs/tools-source-map.json').read_text())['source_revision'] == COMMIT

zip_records = json.loads((ROOT / 'evidence/zip-extraction.json').read_text())
zip_by_path = {item['path']: item for item in zip_records}
github_records = [json.loads(line) for line in (ROOT / 'evidence/github-captures.jsonl').read_text().splitlines()]
github_by_path = defaultdict(list)
for item in github_records:
    assert not item['result'].get('isError', False)
    github_by_path[item['path']].append(item['result']['structuredContent'])

# The raw log records requested outputs. It is not automatically a semantic-read receipt.
# Exclude the known truncated whole-store output and last-call repeats whose full output
# was not visible. Confirmed later reads replace those requests.
raw_read_log = [json.loads(line) for line in (ROOT / 'evidence/reading-log.jsonl').read_text().splitlines()]
excluded_log_rows = {12, 94, 95, 96, 97, 98}
confirmed = defaultdict(list)
for number, item in enumerate(raw_read_log, 1):
    if number in excluded_log_rows:
        continue
    confirmed[item['path']].append([item['start_line'], item['end_line']])
# Two contract documents were actually displayed and read in the initial direct
# connector result before the range logger was installed. They describe intent/history.
direct_contract_reads = [
    'packages/core/src/tool/MODEL-CAPTURE-CONTRACT.md',
    'packages/core/src/tool/LEAN-DASHBOARD-CONTRACT.md',
]
for path in direct_contract_reads:
    confirmed[path].append([1, len((ROOT / 'sources' / path).read_text().splitlines())])
# Product AGENTS was read as a control document, not as leaf implementation evidence.
control_reads = ['AGENTS.md']
for path in control_reads:
    confirmed[path].append([1, len((ROOT / 'sources' / path).read_text().splitlines())])

body_specs = [
    {'slug': 'tools-security-completion', 'key': 's1.subslice02.tools-security-completion',
     'title': 'Folhas de ferramentas, escrita, autoridade e saída', 'need': 'component',
     'historical_keys': ['s1.core.tools', 's1.core.security'], 'work_package': 'A2-tools-security',
     'bounded_need': 'Leitura das folhas de escrita/autoridade e separação captura, truncamento genérico e Lean.',
     'gaps': ['Sem prova de rollback multi-file, sandbox universal, todos os OS ou validação local universal de Tool.dynamic.',
              'Implementação externa de hugr-lean e folhas não lidas permanecem fora da evidência.',
              'Sem execução do produto, teste, medição de qualidade de resumo, tokens cobrados ou consumidor.']},
    {'slug': 'extensions-completion', 'key': 's1.subslice02.extensions-completion',
     'title': 'Admissão e lifetime de extensões, MCP/OAuth, agentes e skills', 'need': 'component',
     'historical_keys': ['s1.core.extensions'], 'work_package': 'A2-extensions',
     'bounded_need': 'Leitura das folhas de SDK/host, falha de ativação, OAuth pendente e mutação de skills.',
     'gaps': ['Sem operação live de MCP/OAuth, execução de plugin ou garantia de recuperação durável de ativação/tentativa OAuth.',
              'Adaptadores/provedores não lidos, efeitos externos e compatibilidade de todos os plugins/OS permanecem fora da evidência.',
              'Inspeção/admissão de pacote e política declarada não provam sandbox universal.']},
    {'slug': 'capability-completion', 'key': 's1.subslice02.capability-completion',
     'title': 'Capacidades nativas, revalidação de efeito, MCP e limites de host', 'need': 'component',
     'historical_keys': ['s1.core.capability'], 'work_package': 'A2-capability',
     'bounded_need': 'Leitura de frame/policy/efeito, schemas/descritores, MCP implementado, persistência/projeção e folhas representativas do host.',
     'gaps': ['Sem execução remota, prova de nonexecution após abort ou atomicidade entre provedor e persistência local.',
              'Vendors/engines de documentos/planilhas, channels, conexões/gestões completas, redaction e todos os schemas/OS continuam pendentes.',
              'Folhas de documento/planilha lidas como pontos de delegação e contratos declarados; fidelidade/OCR/cálculo não foram verificados.']},
]
source_users = defaultdict(list)
for item in body_specs:
    body = (ROOT / 'bodies' / (item['slug'] + '.md')).read_text()
    paths = sorted(set(re.findall(r'`(packages/[^`]+)`', body)))
    item['source_paths'] = paths
    for path in paths:
        assert (ROOT / 'sources' / path).is_file(), path
        assert path in confirmed, 'Referenced source without confirmed reading: ' + path
        source_users[path].append(item['key'])

read_entries = []
for path, ranges in sorted(confirmed.items()):
    data = (ROOT / 'sources' / path).read_bytes()
    total = len(data.decode('utf-8').splitlines())
    normalized = merge_ranges(ranges)
    assert all(1 <= a <= b <= total for a, b in normalized), path
    kind = 'control_document_read' if path in control_reads else 'historical_contract_read_as_intent' if path in direct_contract_reads else 'decisive_source_ranges_read'
    read_entries.append({'path': path, 'sha256': digest(data)['sha256'], 'total_lines': total,
                         'confirmed_ranges': normalized, 'read_kind': kind,
                         'in_assigned_424': path in by_path,
                         'used_by': source_users[path],
                         'proof_basis': 'Author confirmation of visible source output, not inferred from capture or inventory',
                         'runtime_execution': 'NOT_RUN'})
write_json('reading-confirmation.json', {
    'schema': 'genesis-source-reading-confirmation/v1', 'producer': '/root/produce_tools',
    'source_revision': COMMIT, 'raw_requested_output_log': 'evidence/reading-log.jsonl',
    'excluded_raw_log_rows': sorted(excluded_log_rows),
    'exclusion_reason': 'Known output truncation; later explicit ranges or full rereads provide the confirmed receipt.',
    'initial_direct_contract_reads': direct_contract_reads, 'entries': read_entries,
    'limits': ['A confirmed range is static source reading, not test execution or semantic acceptance.',
               'Captured unread dependencies remain unread; the manifest cannot upgrade them.']})
read_by_path = {x['path']: x for x in read_entries}

source_entries = []
for source in sorted((ROOT / 'sources').rglob('*')):
    if not source.is_file():
        continue
    assert not source.is_symlink()
    path = source.relative_to(ROOT / 'sources').as_posix()
    data = source.read_bytes()
    hashes = digest(data)
    checks = []
    provenance = []
    if path in by_path:
        checks.append({'against': 'public_source_map', 'expected_git_blob_sha': by_path[path]['git_blob_sha']})
    if path in zip_by_path:
        z = zip_by_path[path]
        checks.append({'against': 'verified_zip_entry_receipt', 'expected_git_blob_sha': z['git_blob_sha'], 'expected_sha256': z['sha256']})
        provenance.append({'method': 'selective_zip_source_extraction', 'zip_entry': z['zip_entry'], 'receipt_path': 'evidence/zip-extraction.json'})
    for capture in github_by_path[path]:
        captured_bytes = capture['content'].encode('utf-8')
        assert captured_bytes == data
        checks.append({'against': 'github_fetch_file_pinned_revision', 'expected_git_blob_sha': capture['sha']})
        provenance.append({'method': 'github_connector_fetch_file_read_only', 'display_url': capture['display_url'],
                           'receipt_path': 'evidence/github-captures.jsonl'})
    assert checks, path
    for check in checks:
        assert check['expected_git_blob_sha'] == hashes['git_blob_sha'], (path, check)
        if 'expected_sha256' in check:
            assert check['expected_sha256'] == hashes['sha256'], path
    source_entries.append({'repository': 'gustavomhss/hugr-orchestra', 'commit': COMMIT, 'path': path,
                           'capture_path': 'sources/' + path, **hashes, 'verification': checks,
                           'capture_provenance': provenance, 'in_assigned_424': path in by_path,
                           'current_production_read': read_by_path.get(path, {}).get('read_kind', 'not_read'),
                           'confirmed_ranges': read_by_path.get(path, {}).get('confirmed_ranges', []),
                           'historical_read_status': by_path.get(path, {}).get('read_status'),
                           'used_by': source_users[path]})
source_by_path = {x['path']: x for x in source_entries}
zip_data = Path('/workspace/scratch/dd08f46a3e40/guard-artifacts/source-captures.zip').read_bytes()
zip_digest = digest(zip_data)
assert zip_digest == {'byte_length': 1339105, 'sha256': '429f82f075aaf8aacff755137015d9bce0623c6ad9746b86fe8eae4bcd9726d4', 'git_blob_sha': 'd83941a9d836a23e466ca09ecba1f21d423094cb'}
write_json('source-manifest.json', {'schema': 'genesis-exact-source-capture-manifest/v1', 'source_revision': COMMIT,
                                  'archive': {'provided_entry_count': 678, **zip_digest},
                                  'entries': source_entries, 'captured_count': len(source_entries),
                                  'meaning': 'Byte identity and provenance only; reading is recorded separately.'})

base_bindings = []
for item in needs:
    if item['key'] not in {'s1.core.tools', 's1.core.security', 's1.core.extensions', 's1.core.capability'}:
        continue
    path = RECOVERY / 'materialized/producers/a' / item['body']['path']
    actual = digest(path.read_bytes())
    assert actual['byte_length'] == item['body']['byte_length'] and actual['sha256'] == item['body']['sha256']
    base_bindings.append({'key': item['key'], 'original_local_path': str(path), **actual,
                          'handling': 'Read as unaccepted proposal and limits; unchanged; not build dependency',
                          'historical_validity_in_projection': item['validity'], 'semantic_acceptance': 'NOT_OBSERVED'})
write_json('historical-candidates.json', {'schema': 'genesis-unaccepted-candidate-preservation/v1', 'entries': base_bindings})

key_for_base = {base: item['key'] for item in body_specs for base in item['historical_keys']}
coverage_entries = []
for original in assigned:
    path = original['path']
    read = read_by_path.get(path)
    capture = source_by_path.get(path)
    historical = original['read_status']
    if read:
        disposition = 'targeted_reading_delta' if historical == 'not_read' else 'historical_source_reread'
        rationale = 'Direct source ranges were read for the bounded L1 need; claims outside those ranges and leaf algorithms remain excluded.'
        next_obligation = 'Re-evaluate this source and actual dependents if its input/contract changes; operational claims require separately authorized evidence.'
    elif historical == 'semantically_read_decisive_ranges':
        disposition = 'historical_decisive_reading_preserved_without_new_read'
        rationale = 'Preserved historical status and unaccepted base candidate; no new body is justified by inventory alone.'
        next_obligation = 'Independent review of the historical candidate; fresh source read before a new behavior-specific change.'
    elif historical == 'captured_targeted_orientation_only':
        disposition = 'historical_orientation_preserved_without_semantic_upgrade'
        rationale = 'Orientation evidence retained; not promoted to implementation understanding.'
        next_obligation = 'Read the exact implementation before depending on behavior suggested by the document.'
    elif original['kind'] in {'test_code', 'test_support', 'test_fixture'}:
        disposition = 'validation_inventory_deferred_not_read_not_run'
        rationale = 'The path is validation evidence for its recorded family, not product behavior or a result; no local product tests were authorized.'
        next_obligation = 'When the specific leaf changes, inspect the pertinent test/fixture contract and ask coordination for the authorized Actions gate; do not infer a result.'
    elif original['kind'] in {'bundled_instruction', 'repository_skill', 'runtime_asset'}:
        disposition = 'support_contract_deferred_not_read'
        rationale = 'Instruction/asset membership is not an authority grant or proof of runtime semantics.'
        next_obligation = 'Read this exact content and its loader when a change relies on it; preserve content/host authority separation.'
    elif original['kind'] == 'documentation':
        disposition = 'documentation_deferred_not_read'
        rationale = 'Documentation classification alone cannot establish current implementation, especially where historical intent differs from code.'
        next_obligation = 'Read the document and decisive implementation before making its behavior-specific claim.'
    else:
        disposition = 'leaf_implementation_deferred_not_read'
        rationale = 'The mandatory bounded need was resolved at directly read gates/selected leaves; this unconsumed leaf has no newly authored behavioral claim.'
        next_obligation = 'Read this exact leaf and required dependencies before modifying it or asserting its algorithm, vendor behavior or platform coverage.'
    coverage_entries.append({**original,
        'historical_record_preserved': dict(original),
        'complement_key': key_for_base[original['artifact_key']],
        'current_production_read': read['read_kind'] if read else 'not_read',
        'confirmed_ranges': read['confirmed_ranges'] if read else [],
        'new_read_from_historical_not_read': bool(read and historical == 'not_read'),
        'capture_state': 'captured_and_hash_verified' if capture else 'not_captured_in_this_production',
        'capture_sha256': capture['sha256'] if capture else None,
        'used_in_new_body': source_users[path],
        'disposition': disposition, 'rationale': rationale, 'remaining_obligation': next_obligation,
        'semantic_acceptance': 'NOT_ASSERTED', 'product_test_result': 'NOT_RUN'})
summary = {
    'assigned_count': len(coverage_entries),
    'by_historical_artifact': dict(Counter(x['artifact_key'] for x in assigned)),
    'historical_read_status_preserved': dict(Counter(x['read_status'] for x in assigned)),
    'current_production_read': dict(Counter(x['current_production_read'] for x in coverage_entries)),
    'dispositions': dict(Counter(x['disposition'] for x in coverage_entries)),
    'new_read_from_historical_not_read': sum(x['new_read_from_historical_not_read'] for x in coverage_entries),
    'assigned_captured': sum(x['capture_state'] == 'captured_and_hash_verified' for x in coverage_entries),
    'captured_total_including_dependencies': len(source_entries),
    'confirmed_read_paths_total_including_control_and_dependencies': len(read_entries),
    'product_tests': 'NOT_RUN', 'semantic_verdict': 'NOT_ASSERTED'}
assert summary['by_historical_artifact'] == {'s1.core.security': 51, 's1.core.extensions': 122, 's1.core.capability': 170, 's1.core.tools': 81}
write_json('coverage-424.json', {'schema': 'genesis-s1-02-source-disposition/v1', 'source_revision': COMMIT,
                               'public_population_ref': ref('inputs/tools-source-map.json'),
                               'summary': summary, 'entries': coverage_entries,
                               'warning': 'Coverage is exact disposition of the population, not a claim that all 424 files were read or understood.'})

public_routes = []
for case in contract.get('cases', []):
    identity = case.get('id', '')
    if identity.endswith('C1') or identity.endswith('DIRECT-L1'):
        keys = [body_specs[0]['key'], body_specs[2]['key']]
    elif identity.endswith('C2') or identity.endswith('DIRECT-L2'):
        keys = [body_specs[2]['key'], body_specs[0]['key']]
    else:
        keys = [x['key'] for x in body_specs]
    public_routes.append({'public_case_id': identity, 'body_keys_for_later_reader': keys,
                          'case_execution': 'NOT_RUN', 'consumer_result': 'NOT_OBSERVED',
                          'purpose': 'Navigation for public need; not an answer key, evaluation or simulated consumer.'})
write_json('need-disposition.json', {
    'schema': 'genesis-l1-need-disposition/v1', 'public_contract_ref': ref('inputs/tools_contract.json'),
    'units': [{'work_package': x['work_package'], 'key': x['key'], 'new_body_necessary': True,
               'reason': x['bounded_need'], 'historical_candidates_preserved': x['historical_keys'],
               'bounded_result': 'Targeted source-derived L1 delta produced; independent review outstanding',
               'residual_limits': x['gaps']} for x in body_specs],
    'public_case_navigation': public_routes,
    'maintenance': {'M1': 'NOT_RUN', 'M2': 'NOT_RUN', 'reason': 'Future real maintenance trials after accepted layers; no false consumer or local product test.'},
    'N01': {'state': 'L1_SOURCE_BOUNDARIES_ONLY', 'relation': 'Plugin host, model tool frame and operator host separated in source; no L3 or S1-05 release claimed.'}})

write_json('recipe.json', {
    'schema': 'genesis-producer-recipe/v1', 'producer': '/root/produce_tools', 'role': 'independent_author_not_judge',
    'execution_id_from_public_contract': contract['execution_id'], 'model_declared_in_host_context': 'GPT-6 Astra Pro',
    'host_conversation_id': 'UNKNOWN', 'source_repository': 'gustavomhss/hugr-orchestra', 'source_revision': COMMIT,
    'protocol_revision': PROTOCOL_COMMIT, 'scope': 'orchestra.s1', 'layers_produced': [1],
    'request_ref': ref('request.txt'), 'parent_steering_ref': ref('evidence/parent-steering.txt'),
    'public_input_manifest_ref': ref('input-manifest.json'), 'public_contract_ref': ref('inputs/tools_contract.json'),
    'source_manifest_ref': ref('source-manifest.json'), 'coverage_ref': ref('coverage-424.json'),
    'reading_ref': ref('reading-confirmation.json'), 'need_disposition_ref': ref('need-disposition.json'),
    'historical_candidate_ref': ref('historical-candidates.json'),
    'actual_method': ['Read protocol/public contract/public needs and the four unaccepted historical proposals.',
                      'Selectively extract exact source captures from the supplied verified archive.',
                      'Retrieve missing decisive source/dependency files through the read-only GitHub connector at the pinned revision.',
                      'Preserve raw connector receipts and compare computed Git blob/SHA-256 with source-map/archive or pinned GitHub metadata.',
                      'Read source ranges, distinguish implementation from historical intent and record capture separately from reading.',
                      'Author three bounded L1 deltas, preserve all original population records and identify remaining source-specific obligations.',
                      'Perform only native file/data/hash checks; no product/provider/test execution.'],
    'build_dependencies': [], 'historical_candidates_are_accepted_predecessors': False,
    'isolation': {'tools_oracle_accessed': False, 'expected_answers_accessed': False,
                  'other_review_files_accessed': False,
                  'incidental_exposure': 'A collaboration.list_agents status response incidentally exposed a completed S1-01 runtime review, not the S1-02 Tools oracle. Reported to root; not used in this authorship. No such review file was opened.',
                  'aborted_delegation': 'An extensions_sources child was started before the no-slot steering arrived, then immediately interrupted. No child finding was consumed. Subsequent work was solo.',
                  'incident_text_is_summary_not_original_transcript': True},
    'local_recoverable_tool_errors': ['One oversized command argument while storing source receipts was split into bounded native writes; no product ran.',
                                      'A resumed read used packages/opencode instead of packages/core and failed with file-not-found; corrected before reading.',
                                      'Some source output was truncated; later rereads and the explicit confirmation ledger bound the claimed ranges.'],
    'execution': {'product_tests': 'NOT_RUN', 'provider_calls': 'NOT_RUN', 'runtime_import': 'NOT_RUN',
                  'consumers': 'NOT_RUN', 'maintenance_M1_M2': 'NOT_RUN', 'remote_writes': 'NONE',
                  'commit': 'NONE', 'merge': 'NONE', 'semantic_acceptance': 'NOT_ASSERTED'},
    'usage': {'tokens': 'UNKNOWN', 'billed_cost': 'UNKNOWN', 'physical_model_attempts': 'UNKNOWN'},
    'transport': {'payload_prefix_authorized_by_root': PREFIX,
                  'body_paths_are_relative_to_native_package': BODY_PREFIX,
                  'payload_commit': None, 'note': 'Root alone integrates and seals; no invented Git commit or Atlas runtime identity.'}})

body_rows = []
for item in body_specs:
    body_name = item['slug'] + '.md'
    raw = (ROOT / 'bodies' / body_name).read_bytes()
    stats = digest(raw)
    item['body_hashes'] = stats
    body_rows.append(f"| `{item['key']}` | `{body_name}` | {stats['byte_length']} | `{stats['sha256']}` |")
response = f'''# Entrega L1 — S1-02 Ferramentas

Três complementos independentes estão prontos para revisão e integração pela coordenação. As quatro bases históricas permanecem inalteradas e sem aceite presumido. Não produzi L2, L3 ou L4, não executei produto/provedor/testes e não fiz escrita remota, commit, merge ou declaração de aceite.

## Corpos exatos

| Chave | Arquivo em `bodies/` | Bytes UTF-8 | SHA-256 |
| --- | --- | ---: | --- |
{chr(10).join(body_rows)}

Todos têm layer `1`, need `component` e scope `orchestra.s1`. O fragmento vincula os corpos ao destino autorizado `{PREFIX}`; a coordenação copia os arquivos de `bodies/` para os filenames desse destino. Os demais arquivos mantêm seus caminhos relativos. As refs usam `payload_path` e SHA-256; não foi inventado commit nem identidade de runtime.

## Delta útil

Ferramentas/segurança distingue declaração tipada, catálogo sob demanda e autorização de efeito; compara write/edit e as limitações de mutação física; separa perda do produtor, limite genérico e Lean. Registra que o gate de completude da projeção sem perda não é repetido pelo estágio de resumo e que recall não recompõe bytes descartados pelo produtor.

Extensões acrescenta leitura de admissão SDK, lifetime de hooks, falha de ativação e OAuth. Separa credenciais salvas de transporte/fluxo pendente em memória e evita prometer restauração da ativação anterior ou rollback de efeitos externos. Agentes e skills permanecem conteúdo/política sob o host correspondente.

Capabilities acrescenta fonte dos frames emitidos, provas persistidas, gates repetidos junto ao efeito, schema/descritor e MCP nativo. Distingue intenção, ACK, materialização e resultado remoto desconhecido; lê fronteiras de artefatos, processos, schedule, runtime e mídia sem atribuir algoritmo a vendors/engines não lidos.

## Cobertura honesta e evidência

`coverage-424.json` conserva os {summary['assigned_count']} registros originais: 81 Tools, 51 Security, 122 Extensions e 170 Capability. A leitura histórica permanece {json.dumps(summary['historical_read_status_preserved'], ensure_ascii=False)}. O delta registra {summary['new_read_from_historical_not_read']} caminhos antes `not_read` com leitura nova. A classificação atual é {json.dumps(summary['current_production_read'], ensure_ascii=False)}.

`source-manifest.json` contém {len(source_entries)} capturas exatas, incluindo dependências; {summary['assigned_captured']} pertencem aos 424 caminhos. Todas foram comparadas por Git blob e SHA-256 com a captura verificada, o mapa público ou a resposta GitHub fixada. `reading-confirmation.json` conserva {len(read_entries)} caminhos confirmados, incluindo documentos de controle/intenção e dependências, separando intervalos lidos de captura. Logs de output solicitado não foram automaticamente promovidos a leitura: as ocorrências truncadas estão identificadas e as releituras pertinentes preservadas.

`need-disposition.json` explica por que cada um dos três corpos era necessário e mantém os ensaios M1/M2 e consumidores como `NOT_RUN`. Folhas, testes, fixtures, documentos e conteúdos não lidos conservam obrigações explícitas; não há claim de que o censo de 424 fontes é compreensão integral.

## Arquivos de fechamento

- `native-package.fragment.json` e `artifact-metadata.json`: três metadados L1 com body/source/recipe/request/response bindings.
- `request.txt`, `response.md`, `recipe.json`: pedido real, esta resposta original e método efetivo, com uso/cobrança `UNKNOWN`.
- `source-manifest.json`, `reading-confirmation.json`, `coverage-424.json`, `need-disposition.json`, `historical-candidates.json`: identidade, delta e limites.
- `inputs/` e `input-manifest.json`: cópias exatas do contrato/projeções públicas e protocolo.
- `sources/` e `evidence/`: fontes e recibos originais; apenas processamento nativo de arquivos/dados/hashes.
- `verification.json` e `handoff-manifest.json`: conferência estrutural/bytes e mapa de entrega, sem significado de aceite semântico ou gate de produto.

Incidente de isolamento registrado: um status de `list_agents` expôs incidentalmente revisão de S1-01 runtime; não era oracle de Ferramentas, foi reportado e não usado. O filho de extensão iniciado antes da instrução de seguir solo foi interrompido e não forneceu conteúdo consumido. Não li oracle S1-02, respostas esperadas ou arquivos de pareceres.

Restam à coordenação integração/selagem, dois juízos independentes e somente depois os níveis seguintes e consumidores reais. Não há lacuna de acesso às fontes citadas. Limites operacionais/vendor/OS e fontes não lidas permanecem explícitos nos corpos e na cobertura.
'''
(ROOT / 'response.md').write_text(response, encoding='utf-8')

artifacts = []
for item in body_specs:
    source_refs = [{key: source_by_path[path][key] for key in ['commit', 'path', 'git_blob_sha', 'sha256']}
                   | {'byte_length': source_by_path[path]['byte_length'], 'read_ranges': read_by_path[path]['confirmed_ranges']}
                   for path in item['source_paths']]
    artifacts.append({'key': item['key'], 'scope': 'orchestra.s1', 'title': item['title'], 'layer': 1, 'need': item['need'],
        'body': {'path': BODY_PREFIX + '/' + item['slug'] + '.md', 'encoding': 'utf-8',
                 'byte_length': item['body_hashes']['byte_length'], 'sha256': item['body_hashes']['sha256']},
        'authority': {'scope': 'orchestra.s1', 'basis': 'Direct static reading of exact pinned source captures; public need contract; unaccepted historical candidates used only as limits/navigation.',
                      'claim_boundary': item['bounded_need'], 'observed': 'Source implementation at pinned revision',
                      'unexecuted': 'All product/provider/runtime/consumer/maintenance execution',
                      'historical_intent_is_current_behavior': False},
        'validity': 'supported', 'validity_meaning': 'Producer claim for the bounded statements only; not an independent acceptance verdict.',
        'gaps': item['gaps'],
        'evidence': [ref('source-manifest.json'), ref('reading-confirmation.json'), ref('coverage-424.json'), ref('need-disposition.json')],
        'input_keys': ['file:' + path for path in item['source_paths']] +
                      ['file:' + PREFIX + '/recipe.json', 'file:' + PREFIX + '/inputs/tools_contract.json',
                       'file:' + PREFIX + '/inputs/tools-source-map.json', 'file:' + PREFIX + '/inputs/a_needs.json'],
        'source_refs': source_refs, 'recipe_ref': ref('recipe.json'), 'build_dependencies': [],
        'navigation': [{'key': key, 'status': 'historical_unaccepted_candidate', 'purpose': 'Context/limits only; no accepted build edge'} for key in item['historical_keys']],
        'producer_request_ref': ref('request.txt'), 'producer_response_ref': ref('response.md'),
        'semantic_review_refs': [], 'runtime_receipt_refs': [], 'local_body_path': 'bodies/' + item['slug'] + '.md'})
write_json('artifact-metadata.json', {'schema': 'genesis-producer-artifact-fragment/v1', 'artifacts': artifacts})
write_json('native-package.fragment.json', {
    'schema': 'genesis-native-package/v1', 'campaign': '20261111-v1', 'protocol_epoch': 'parallel-v3-fresh',
    'results_epoch': '20261111-v3-fresh', 'session': 'S1', 'source_revision': COMMIT,
    'protocol_ref': ref('inputs/protocol-transport.md'), 'protocol_revision': PROTOCOL_COMMIT,
    'scope': 'orchestra.s1', 'package_state': 'IN_PROGRESS',
    'fragment_only': True, 'contract': {'criteria': contract['public_bar'], 'public_ref': ref('inputs/tools_contract.json'),
                                      'oracle_ref': None, 'oracle_note': 'Frozen by coordination before production; never provided to author; root must bind exact reference.'},
    'required_artifact_keys': [x['key'] for x in artifacts], 'artifacts': artifacts,
    'roots': {'component': [x['key'] for x in artifacts]}, 'missing_required_artifact_keys': [],
    'known_limits': ['This is the three-complement producer fragment, not the complete S1 package.',
                     'Historical candidates have no acceptance assumed and no build edges.',
                     'No L2-L4, runtime binding, publication, consumers or maintenance execution.',
                     'Population disposition is not exhaustive semantic reading; exact residual limits are preserved.']})

# Transport/hash verification only. No product imports, tests or provider calls.
assert len(artifacts) == 3 and len({a['key'] for a in artifacts}) == 3
for artifact in artifacts:
    body_path = Path(artifact['body']['path'])
    assert not body_path.is_absolute() and '..' not in body_path.parts
    assert artifact['layer'] == 1 and artifact['need'] in {'entry', 'ownership', 'maintenance', 'operational', 'flow', 'evidence', 'component'}
    actual = digest((ROOT / artifact['local_body_path']).read_bytes())
    assert actual['byte_length'] == artifact['body']['byte_length'] and actual['sha256'] == artifact['body']['sha256']
    for r in [artifact['recipe_ref'], artifact['producer_request_ref'], artifact['producer_response_ref']] + artifact['evidence']:
        relative = r['payload_path'].removeprefix(PREFIX + '/')
        assert digest((ROOT / relative).read_bytes())['sha256'] == r['sha256']
    assert artifact['build_dependencies'] == [] and artifact['semantic_review_refs'] == [] and artifact['runtime_receipt_refs'] == []
assert all(x['historical_record_preserved'] == by_path[x['path']] for x in coverage_entries)
write_json('verification.json', {'schema': 'genesis-producer-byte-transport-verification/v1',
    'checks_completed': ['424 unique population entries and exact 81/51/122/170 partition', 'Every historical source-map record preserved exactly',
                         'Every captured source matches expected Git blob; SHA-256 and byte lengths computed on exact bytes',
                         'Every body source reference has a confirmed source reading and exact capture',
                         'Three unique L1 keys with permitted need enum and portable body paths',
                         'Body, request, response, recipe and evidence payload references match exact bytes',
                         'Historical body candidates remain byte-identical to public bindings',
                         'No accepted build predecessor, semantic review, runtime result or product-test result fabricated'],
    'source_count': len(source_entries), 'coverage_summary': summary,
    'semantic_verdict': 'NOT_ASSERTED', 'product_tests': 'NOT_RUN', 'runtime_binding': 'NOT_RUN'})

handoff_entries = []
for path in sorted(ROOT.rglob('*')):
    if not path.is_file() or path.name == 'handoff-manifest.json':
        continue
    assert not path.is_symlink()
    relative = path.relative_to(ROOT).as_posix()
    destination = path.name if relative.startswith('bodies/') else relative
    handoff_entries.append({'local_path': relative, 'payload_path': PREFIX + '/' + destination, **digest(path.read_bytes())})
write_json('handoff-manifest.json', {'schema': 'genesis-producer-handoff/v1', 'payload_commit': None, 'entries': handoff_entries,
                                    'note': 'Copy exact bytes using these destinations; only body files flatten from local bodies/. Root alone seals/imports.'})
print(json.dumps({'bodies': [{k: x[k] for k in ['key', 'body']} for x in artifacts],
                  'source_count': len(source_entries), 'coverage_summary': summary,
                  'handoff_manifest': digest((ROOT / 'handoff-manifest.json').read_bytes())}, ensure_ascii=False, indent=2))
