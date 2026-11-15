from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import difflib

ROOT = Path('/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390')
BASE = 'producers/derived-research-flow/'
REV = BASE + 'revisions/v3/'
HISTORY = REV + 'history/'
FREEZE = REV + 'procedure-freeze.json'

def identity(rel, data):
    return {'local_path': rel, 'byte_length': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'git_blob_sha': hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\x00' + data).hexdigest()}

def packed(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')

def write_new(rel, data):
    assert rel.startswith(REV)
    path = ROOT / rel
    assert not path.exists(), 'Refusing to overwrite frozen or existing revision output: ' + rel
    path.write_bytes(data)

started = datetime.now(timezone.utc).isoformat()
freeze_bytes = (ROOT / FREEZE).read_bytes()
freeze = json.loads(freeze_bytes)
assert freeze['state'] == 'FROZEN_BEFORE_APPLY_EXECUTION'
assert freeze['artifact'] == 's1.subslice03.research-flow' and freeze['version'] == 3
inputs = []
read_bytes = {}
for item in freeze['inputs']:
    rel = item['local_path']
    data = (ROOT / rel).read_bytes()
    actual = identity(rel, data)
    assert all(actual[k] == item[k] for k in ['byte_length', 'sha256', 'git_blob_sha']), rel
    inputs.append(dict(item, whole_file_consumed=True, expected_identity_match=True))
    read_bytes[rel] = data
self_identity = identity(FREEZE, freeze_bytes)
self_identity.update({'role': 'Actual pre-execution frozen procedure and input manifest', 'input_group': 'revision_v3_new', 'original_read_paths': [FREEZE], 'whole_file_consumed': True, 'expected_identity_match': True})
inputs.append(self_identity)
assert len(inputs) == 45 and len({x['local_path'] for x in inputs}) == 45
assert identity(REV + 'apply.py', read_bytes[REV + 'apply.py']) == freeze['script']
assert all(x['local_path'] not in [BASE + n for n in ['body.md', 'evidence.md', 'production-manifest.json', 'response.md']] for x in inputs)
recipe = json.loads(read_bytes[REV + 'recipe.json'])
old_manifest = json.loads(read_bytes[HISTORY + 'production-manifest.json'])
preservation = json.loads(read_bytes[REV + 'prior-output-preservation.json'])
for item in preservation['files']:
    assert (ROOT / item['original_read_path']).read_bytes() == read_bytes[item['local_path']]

changes = []
unchanged = []
candidates = {}
for name in ['body.md', 'evidence.md']:
    old = read_bytes[HISTORY + name]
    selected = sorted([x for x in freeze['planned_edits'] if x['file'] == name], key=lambda x: x['old_byte_offset'])
    pieces = []
    cursor = 0
    shift = 0
    for edit in selected:
        before = edit['before'].encode('utf-8')
        after = edit['after'].encode('utf-8')
        start = edit['old_byte_offset']
        end = start + len(before)
        assert start >= cursor and old[start:end] == before
        assert old.count(before) == 1
        segment = old[cursor:start]
        unchanged.append({'file': name, 'old_start': cursor, 'old_end_exclusive': start, 'new_start': cursor + shift, 'byte_length': len(segment), 'sha256': hashlib.sha256(segment).hexdigest()})
        pieces.extend([segment, after])
        changes.append({'edit_id': edit['edit_id'], 'file': name, 'category': edit['category'], 'reason': edit['reason'], 'old_byte_offset': start, 'old_end_exclusive': end, 'new_byte_offset': start + shift, 'new_end_exclusive': start + shift + len(after), 'old_line_one_based': old[:start].count(b'\n') + 1, 'before': edit['before'], 'after': edit['after'], 'before_byte_length': len(before), 'after_byte_length': len(after), 'before_sha256': hashlib.sha256(before).hexdigest(), 'after_sha256': hashlib.sha256(after).hexdigest()})
        cursor = end
        shift += len(after) - len(before)
    segment = old[cursor:]
    unchanged.append({'file': name, 'old_start': cursor, 'old_end_exclusive': len(old), 'new_start': cursor + shift, 'byte_length': len(segment), 'sha256': hashlib.sha256(segment).hexdigest()})
    pieces.append(segment)
    new = b''.join(pieces)
    new.decode('utf-8', errors='strict')
    inverse = new
    for edit in sorted([x for x in changes if x['file'] == name], key=lambda x: x['new_byte_offset'], reverse=True):
        start = edit['new_byte_offset']; end = edit['new_end_exclusive']
        assert inverse[start:end] == edit['after'].encode('utf-8')
        inverse = inverse[:start] + edit['before'].encode('utf-8') + inverse[end:]
    assert inverse == old
    assert identity(BASE + name, new) == freeze['expected_outputs'][name]
    candidates[name] = new
assert len(changes) == 4 and all(x['category'] == 'metadata' for x in changes)
old_f3 = read_bytes[HISTORY + 'body.md'].split(b'## F3.', 1)[1].split(b'## F4.', 1)[0]
new_f3 = candidates['body.md'].split(b'## F3.', 1)[1].split(b'## F4.', 1)[0]
assert old_f3 == new_f3
assert candidates['body.md'].split(b'## F1.', 1)[1] == read_bytes[HISTORY + 'body.md'].split(b'## F1.', 1)[1]
parent = recipe['new_predecessor']
assert identity(parent['local_body_path'], read_bytes[parent['local_body_path']])['sha256'] == parent['body_sha256']
assert len([x for x in inputs if x.get('semantic_status') == 'sole_current_build_predecessor']) == 1
for name, data in candidates.items():
    (ROOT / (BASE + name)).write_bytes(data)
    assert (ROOT / (BASE + name)).read_bytes() == data

file_pairs = [{'historical_input': identity(HISTORY + name, read_bytes[HISTORY + name]), 'new_output': identity(BASE + name, candidates[name])} for name in ['body.md', 'evidence.md']]
delta = {'schema': 's1-03-parent-update-literal-delta/v1', 'artifact': recipe['artifact'], 'from_version': 2, 'to_version': 3, 'changes': changes, 'unchanged_segments': unchanged, 'files': file_pairs, 'metadata_edits': 4, 'substantive_edits': 0, 'F3_exactly_preserved': True, 'all_F1_through_F8_bytes_preserved': True, 'inverse_verification': 'PASS_DETERMINISTIC_ONLY', 'new_semantic_predecessor': parent, 'old_predecessor_retained_alias': freeze['old_predecessor_alias'], 'procedure': freeze['script'], 'pre_execution_freeze': identity(FREEZE, freeze_bytes)}
delta_bytes = packed(delta)
write_new(REV + 'delta.json', delta_bytes)
patch = ''
for name in ['body.md', 'evidence.md']:
    patch += ''.join(difflib.unified_diff(read_bytes[HISTORY + name].decode().splitlines(keepends=True), candidates[name].decode().splitlines(keepends=True), fromfile=HISTORY + name, tofile=BASE + name))
patch_bytes = patch.encode('utf-8')
write_new(REV + 'delta.patch', patch_bytes)

counts = {'carried_from_previous_input_manifest': 28, 'earlier_output_verification_units_now_enumerated': 5, 'new_revision_v3_units': 12, 'total_unique_whole_file_units': len(inputs), 'total_unique_input_bytes': sum(x['byte_length'] for x in inputs)}
aliases = [dict((k, x[k]) for k in ['local_path', 'retained_alias', 'original_read_paths', 'byte_length', 'sha256', 'git_blob_sha'] if k in x) for x in inputs if 'retained_alias' in x]
extension = {'schema': 's1-03-cumulative-input-manifest-extension/v1', 'artifact': recipe['artifact'], 'version': 3, 'previous_manifest': identity(HISTORY + 'production-manifest.json', read_bytes[HISTORY + 'production-manifest.json']), 'inputs': inputs, 'counts': counts, 'retained_aliases': aliases, 'path_policy': 'local_path always identifies the exact retained byte unit. original_read_paths separately records original access lineage. Old parent v3 is provenance only; current parent v4 is the sole semantic build predecessor. Current outputs are never self-inputs.', 'earlier_output_read_explanation': 'Five v2 records were already consumed by actual byte/hash verification after their production. They are included as historical input units now rather than lost because the earlier manifest excluded its own fresh outputs.', 'non_file_context': freeze['retained_non_file_context'], 'raw_source_or_judge_prose_read': False}
extension_bytes = packed(extension)
write_new(REV + 'input-manifest-extension.json', extension_bytes)

verification = {'schema': 's1-03-producer-delta-verification/v1', 'artifact': recipe['artifact'], 'version': 3, 'producer': '/root/derived_research', 'execution_started_at_utc': started, 'freeze_created_at_utc': freeze['frozen_at_utc'], 'procedure': freeze['script'], 'freeze': identity(FREEZE, freeze_bytes), 'all_frozen_inputs_match': True, 'input_count': 45, 'v2_preserved_before_mutation': True, 'v1_history_and_previous_controls_unchanged': True, 'new_predecessor_read_in_full': True, 'new_predecessor_sha256': parent['body_sha256'], 'historical_parent_alias_verified': True, 'only_planned_metadata_edits': True, 'metadata_edits': 4, 'substantive_edits': 0, 'inverse_reproduces_prior_files_exactly': True, 'unchanged_segments_verified': True, 'F3_exactly_preserved': True, 'all_F1_through_F8_bytes_preserved': True, 'principal_verification_v2': 'Reported completed in the visible principal control message; no root receipt or full judge prose read', 'principal_verification_v3': 'PENDING', 'same_pair_semantic_reevaluation_v3': 'PENDING', 'product_network_runtime_tests': 'NOT_RUN', 'files': file_pairs}
verification_bytes = packed(verification)
write_new(REV + 'producer-verification.json', verification_bytes)

review = ['# Research-flow L2 v3 — atualização ao predecessor aceito\n', '## Escopo e autoridade\n', f"O único predecessor semântico corrente é `s1.core.research` L1 v4, {parent['body_bytes']} bytes, SHA-256 `{parent['body_sha256']}`, blob `{parent['body_git_blob_sha']}`. A receita v3 fornece os dois PASS para esses bytes; nenhum parecer integral foi lido. O L1 v3 anterior permanece apenas como contexto histórico no alias autorizado.\n", '## Decisão de autoria\n', 'A releitura integral confirmou que R8.1 agora explicita missing && !building && ctx.extract, com missing por ausência ou stale e retorno inicial quando não há shards no escopo. F3 v2 já condiciona o início à necessidade de construção, ao extrator e à ausência de build em curso, sem converter building/unavailable em prova de disparo. Nenhuma contradição concreta remanescente foi identificada nesse vínculo. F3 e todos os bytes de F1–F8 foram preservados. Não houve nova alteração substantiva.\n', '## Delta exato\n']
for edit in changes:
    review += [f"### {edit['edit_id']} — {edit['file']}\n", f"Categoria: metadata. Motivo: {edit['reason']} Offset antigo {edit['old_byte_offset']}, novo {edit['new_byte_offset']}; linha antiga {edit['old_line_one_based']}.\n", '**ANTES**\n\n```text\n' + edit['before'] + '\n```\n', '**DEPOIS**\n\n```text\n' + edit['after'] + '\n```\n', f"Hashes dos literais: ANTES `{edit['before_sha256']}`; DEPOIS `{edit['after_sha256']}`.\n"]
review += ['## Preservação e consumo\n', 'Os quatro outputs v2 estão em `revisions/v3/history/`, byte-idênticos; o histórico v1 e os controles v2 não foram modificados. O manifesto cumulativo inclui 45 unidades integrais: 28 manifestadas anteriormente, cinco registros v2 já lidos nas verificações e 12 unidades desta revisão. O alias do L1 v3 conserva hash e origem; não é outro predecessor de build. E3 corrente foi atualizado para distinguir medições históricas e atuais.\n', '## Verificação e limites\n', 'O procedimento e seus inputs foram congelados antes da execução. Quatro edições de metadata foram aplicadas; os deltas inversos recompõem os dois arquivos v2 exatamente. `delta.patch` oferece a comparação literal adicional. A verificação da principal e o mesmo par de juízes devem avaliar a v3; nenhum parecer L2 v2 foi presumido. Não há self-PASS, L3/L4, produto/rede/Atlas/testes/consumidores. Uso físico, tokens e custo: UNKNOWN.\n']
review_bytes = '\n'.join(review).encode('utf-8')
write_new(REV + 'review-supplement.md', review_bytes)

response = f"""# Entrega L2 v3 — research-flow

Atualizei `s1.subslice03.research-flow` para derivar exclusivamente do L1 research v4 aceito, SHA-256 `{parent['body_sha256']}`, {parent['body_bytes']} bytes. Preservei integralmente a correção RF-J2-F01 e todos os bytes de F1–F8. Foram quatro edições de metadata: identidade em F0, identidade/gate e leitura em E0, fonte direta do mapa E1 e registros de verificação em E3. Nenhuma alteração substantiva adicional.

## Outputs atuais

| Arquivo | Bytes | SHA-256 |
| --- | ---: | --- |
| body.md | {len(candidates['body.md'])} | `{hashlib.sha256(candidates['body.md']).hexdigest()}` |
| evidence.md | {len(candidates['evidence.md'])} | `{hashlib.sha256(candidates['evidence.md']).hexdigest()}` |
| apply.py | {freeze['script']['byte_length']} | `{freeze['script']['sha256']}` |
| procedure-freeze.json | {len(freeze_bytes)} | `{hashlib.sha256(freeze_bytes).hexdigest()}` |

Os quatro outputs v2 foram preservados em `revisions/v3/history/`; v1 e os controles anteriores permanecem intactos. O delta contém literais, offsets, hashes, segmentos inalterados e prova inversa. Há também `delta.patch`, suplemento de revisão, extensão de inputs e verificação do produtor. Este response é preservado em `revisions/v3/response.md`.

## Proveniência e estado

Foram registrados {len(inputs)} inputs integrais únicos, {counts['total_unique_input_bytes']} bytes: 28 do manifesto anterior, cinco registros v2 efetivamente lidos nas verificações e 12 unidades da revisão atual. Todos têm local_path, tamanho, SHA-256 e blob Git; aliases conservam as versões antigas e a linhagem original fica separada. Nenhum output corrente é auto-input. O L1 v3 histórico não é predecessor semântico corrente.

A principal informou verificação mecânica da v2; nenhum novo parecer L2 foi presumido. A v3 está pronta para conferência da principal e os mesmos J1/J2. Sem self-PASS, raw source, oracle, parecer integral, rede, delegação, produto/Atlas/testes/consumidores ou L3/L4. Uso físico, tokens e custo não expostos: UNKNOWN. Hashes finais do manifesto e response são comunicados externamente para evitar autorreferência.
"""
response_bytes = response.encode('utf-8')
write_new(REV + 'response.md', response_bytes)
(ROOT / (BASE + 'response.md')).write_bytes(response_bytes)

output_paths = [BASE + n for n in ['body.md', 'evidence.md', 'response.md']] + [HISTORY + n for n in ['body.md', 'evidence.md', 'production-manifest.json', 'response.md']] + [REV + n for n in ['dispatch-message.txt', 'prior-output-preservation.json', 'apply.py', 'procedure-freeze.json', 'delta.json', 'delta.patch', 'review-supplement.md', 'input-manifest-extension.json', 'producer-verification.json', 'response.md']]
outputs = [identity(rel, (ROOT / rel).read_bytes()) for rel in output_paths]
outputs.append({'local_path': BASE + 'production-manifest.json', 'identity_location': 'External final digest report; no self-hash'})
manifest = {'schema': 's1-03-derived-production-manifest/v1', 'record_role': 'Postproduction cumulative provenance; not a preexisting recipe or semantic verdict', 'execution_id': recipe['execution_id'], 'artifact': old_manifest['artifact'], 'version': 3, 'author': {'native_task': '/root/derived_research', 'role': 'Same research family producer; L2 only', 'actual_model_id': 'UNKNOWN'}, 'authoring_status': 'DELIVERED_FOR_SAME_PAIR_REEVALUATION', 'exclusive_output_directory': BASE.rstrip('/'), 'source_revision': old_manifest['source_revision'], 'protocol_revision': old_manifest['protocol_revision'], 'supersedes': identity(HISTORY + 'production-manifest.json', read_bytes[HISTORY + 'production-manifest.json']), 'semantic_build_predecessors': [dict(parent, status='Accepted predecessor only; no L2 acceptance inferred')], 'predecessor_gate': {'basis': 'Acceptance tuples supplied in frozen revision v3 recipe after principal gate', 'decisions': recipe['predecessor_acceptance_gate'], 'full_judgments_read': False, 'scope': 'Only semantic acceptance of exact L1 v4 body'}, 'historical_predecessor_context': freeze['old_predecessor_alias'], 'correction_base_not_self_build_edge': identity(HISTORY + 'body.md', read_bytes[HISTORY + 'body.md']), 'actual_authoring_recipe': {'current_recipe': next(x for x in inputs if x['local_path'] == REV + 'recipe.json'), 'current_request': next(x for x in inputs if x['local_path'] == REV + 'request.txt'), 'current_dispatch': next(x for x in inputs if x['local_path'] == REV + 'dispatch-message.txt'), 'public_findings': next(x for x in inputs if x['local_path'] == REV + 'public-findings.md'), 'script': freeze['script'], 'pre_execution_freeze': identity(FREEZE, freeze_bytes), 'inherited_recipes_and_controls_retained': [x for x in inputs if x['input_group'] == 'inherited_v2_manifest' and any(mark in x['local_path'] for mark in ['recipe', 'request.txt', 'dispatch-message.txt', 'public-finding.md', 'apply.py', 'procedure-freeze.json'])]}, 'inputs': inputs, 'input_counts': counts, 'retained_aliases': aliases, 'non_file_context': freeze['retained_non_file_context'], 'procedure_provenance': {'implementation': 'Persisted apply.py executed once via functions.exec -> tools.exec_command -> python; standard library only', 'frozen_before_execution': True, 'whole_new_predecessor_read': 'All 378 lines displayed in contiguous spans 1-230 and 231-378', 'historical_parent_read': 'Whole-byte alias verified; complete same-byte content retained from earlier family reading', 'all_seven_recipe_units_read_in_full': True, 'prior_outputs_read_and_preserved_before_mutation': True, 'metadata_edits': 4, 'substantive_edits': 0, 'inverse_verification': True, 'delta': identity(REV + 'delta.json', delta_bytes), 'producer_verification': identity(REV + 'producer-verification.json', verification_bytes)}, 'verification': {'all_45_input_identities_match': True, 'v2_history_exact': True, 'older_history_and_controls_unchanged': True, 'F3_and_F1_through_F8_byte_identical': True, 'body_bytes': len(candidates['body.md']), 'evidence_bytes': len(candidates['evidence.md']), 'depth2_sections': 9, 'root_verification_v3': 'PENDING', 'semantic_reevaluation_v3': 'PENDING', 'product_runtime_network_tests': 'NOT_RUN'}, 'outputs': outputs, 'output_counts': {'current_files': 4, 'v2_historical_copies': 4, 'revision_v3_files': 10, 'total': 18, 'supplied_frozen_controls_preserved': 3}, 'limitations': ['Only metadata and accepted-parent binding were updated; semantic RF-J2-F01 correction remains exactly as authored in v2.', 'The current semantic predecessor is L1 v4 only; old parent v3 is historical context.', 'Full new predecessor was read, but no raw source, full judge prose, oracle, runtime or consumer was read/executed.', 'No self-PASS, provider qualification, maintenance success, L3/L4 or S1/global completion is claimed.', 'Earlier UNKNOWN physical usage remains UNKNOWN; input byte counts are not token/cost estimates.'], 'later_layers_authored_or_released': [], 'usage': {'physical_attempts': 'UNKNOWN', 'input_tokens': 'UNKNOWN', 'output_tokens': 'UNKNOWN', 'billing_cost': 'UNKNOWN', 'observed_revision_v3_dispatches': 1}, 'preservation': {'v1_preserved': True, 'v2_preserved': True, 'old_controls_unchanged': True, 'new_dispatch_exact': True, 'response_revision_copy_exact': True, 'original_read_lineage_separate_from_retained_alias': True}}
(ROOT / (BASE + 'production-manifest.json')).write_bytes(packed(manifest))
for item in inputs:
    actual = identity(item['local_path'], (ROOT / item['local_path']).read_bytes())
    assert all(actual[k] == item[k] for k in ['byte_length', 'sha256', 'git_blob_sha'])
for item in outputs:
    if 'sha256' in item:
        assert identity(item['local_path'], (ROOT / item['local_path']).read_bytes()) == item
print('Applied v3: four metadata edits, zero substantive edits; F3 and F1-F8 byte-identical.')
print('Input counts:', json.dumps(counts))
for rel in [BASE + 'body.md', BASE + 'evidence.md', BASE + 'production-manifest.json', BASE + 'response.md', REV + 'delta.json', REV + 'delta.patch', REV + 'input-manifest-extension.json', REV + 'review-supplement.md', REV + 'producer-verification.json']:
    item = identity(rel, (ROOT / rel).read_bytes())
    print(rel, item['byte_length'], item['sha256'], item['git_blob_sha'])
