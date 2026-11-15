from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import difflib

ROOT = Path('/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390')
BASE = 'producers/derived-research-flow/'
OUT = ROOT / BASE
REV = OUT / 'revisions/v2'
FREEZE_REL = BASE + 'revisions/v2/procedure-freeze.json'
BEFORE_BODY = 'Sem shard aberto, dispara build detached e responde building/unavailable com motivo.'
AFTER_BODY = 'Sem shard aberto, só inicia build detached se houver extrator, construção necessária e nenhum build em curso; a resposta building/unavailable com motivo não comprova, por si, que a consulta iniciou novo trabalho.'
BEFORE_EVIDENCE = '| F3, query/stale/dirty | building/unavailable, retido stale, basis do plano atual, overlay limitado, candidates e limites de cobertura | R8.1 Query: vazio, stale e dirty | Observação; ausência de hit não prova ausência de uso |'
AFTER_EVIDENCE = '| F3, query/stale/dirty | Build condicionado a extrator presente, construção necessária e nenhum build em curso; building/unavailable não comprova novo disparo; retido stale, basis do plano atual, overlay limitado, candidates e limites de cobertura | R8.1 Query: vazio, stale e dirty; qualificação pública RF-J2-F01 | Observação; ausência de hit não prova ausência de uso |'

def identity(rel, data):
    return {'local_path': rel, 'byte_length': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'calculated_git_blob_sha': hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\x00' + data).hexdigest()}

def encode_json(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')

def write_new(rel, data):
    path = ROOT / rel
    assert rel.startswith(BASE + 'revisions/v2/')
    assert not path.exists(), 'Refusing to overwrite revision output: ' + rel
    path.write_bytes(data)

started = datetime.now(timezone.utc).isoformat()
freeze_bytes = (ROOT / FREEZE_REL).read_bytes()
freeze = json.loads(freeze_bytes)
assert freeze['state'] == 'FROZEN_BEFORE_APPLY_EXECUTION'
assert freeze['artifact'] == 's1.subslice03.research-flow'
assert freeze['finding'] == 'RF-J2-F01'
assert freeze['script']['local_path'] == BASE + 'revisions/v2/apply.py'

consumed = []
input_bytes = {}
for pinned in freeze['inputs']:
    rel = pinned['local_path']
    data = (ROOT / rel).read_bytes()
    actual = identity(rel, data)
    assert actual['byte_length'] == pinned['byte_length'], rel
    assert actual['sha256'] == pinned['sha256'], rel
    if pinned.get('calculated_git_blob_sha'):
        assert actual['calculated_git_blob_sha'] == pinned['calculated_git_blob_sha'], rel
    input_bytes[rel] = data
    consumed.append(dict(pinned, expected_identity_match=True, whole_file_consumed=True))
assert identity(freeze['script']['local_path'], input_bytes[freeze['script']['local_path']])['sha256'] == freeze['script']['sha256']
freeze_input = identity(FREEZE_REL, freeze_bytes)
freeze_input.update({'role': 'Pre-execution frozen procedure/input manifest; consumed by apply.py', 'provenance': 'Persisted before this executable correction was invoked', 'whole_file_consumed': True, 'input_group': 'correction_new'})
consumed.append(freeze_input)
assert len(consumed) == 28
assert len({item['local_path'] for item in consumed}) == 28
assert all(item['local_path'] not in [BASE + name for name in ['body.md', 'evidence.md', 'production-manifest.json', 'response.md']] for item in consumed)

preservation_rel = BASE + 'revisions/v2/prior-output-preservation.json'
preservation = json.loads(input_bytes[preservation_rel])
for prior in preservation['files']:
    original = (ROOT / prior['original_read_path']).read_bytes()
    preserved = input_bytes[prior['historical_alias']]
    assert original == preserved
    assert hashlib.sha256(preserved).hexdigest() == prior['sha256']

changes = []
candidates = {}
for name, before, after in [('body.md', BEFORE_BODY, AFTER_BODY), ('evidence.md', BEFORE_EVIDENCE, AFTER_EVIDENCE)]:
    old_rel = BASE + 'history/v1/' + name
    current_rel = BASE + name
    old = input_bytes[old_rel]
    literal_before = before.encode('utf-8')
    literal_after = after.encode('utf-8')
    assert old.count(literal_before) == 1, name
    offset = old.index(literal_before)
    end = offset + len(literal_before)
    new = old[:offset] + literal_after + old[end:]
    assert new[:offset] == old[:offset]
    assert new[offset + len(literal_after):] == old[end:]
    assert new.count(literal_after) == 1
    assert new.count(literal_before) == 0
    new.decode('utf-8', errors='strict')
    candidates[name] = new
    changes.append({'file': name, 'historical_input': identity(old_rel, old), 'new_output': identity(current_rel, new), 'byte_offset_zero_based': offset, 'before_end_byte_exclusive': end, 'after_end_byte_exclusive': offset + len(literal_after), 'line_one_based': old[:offset].count(b'\n') + 1, 'before': before, 'after': after, 'before_utf8_bytes': len(literal_before), 'after_utf8_bytes': len(literal_after), 'before_sha256': hashlib.sha256(literal_before).hexdigest(), 'after_sha256': hashlib.sha256(literal_after).hexdigest(), 'unchanged_prefix_sha256': hashlib.sha256(old[:offset]).hexdigest(), 'unchanged_suffix_sha256': hashlib.sha256(old[end:]).hexdigest(), 'prefix_identical': True, 'suffix_identical': True, 'occurrences_replaced': 1})

expected_changes = freeze['planned_changes']
assert len(expected_changes) == 2
for planned, actual in zip(expected_changes, changes):
    for key in ['file', 'byte_offset_zero_based', 'before', 'after', 'before_sha256', 'after_sha256']:
        assert planned[key] == actual[key], key
body_headings = [line for line in candidates['body.md'].decode('utf-8').splitlines() if line.startswith('## ')]
assert len(body_headings) == 9
assert body_headings == [line for line in input_bytes[BASE + 'history/v1/body.md'].decode('utf-8').splitlines() if line.startswith('## ')]

for name in ['body.md', 'evidence.md']:
    (OUT / name).write_bytes(candidates[name])
    assert (OUT / name).read_bytes() == candidates[name]

delta = {'schema': 's1-03-minimal-literal-delta/v1', 'artifact': 's1.subslice03.research-flow', 'from_version': 1, 'to_version': 2, 'finding': 'RF-J2-F01', 'effective_procedure': freeze['script'], 'pre_execution_freeze': identity(FREEZE_REL, freeze_bytes), 'changes': changes, 'body_and_evidence_other_bytes_unchanged': True, 'semantic_predecessor_unchanged': True, 'later_layers_authored': []}
delta_rel = BASE + 'revisions/v2/delta.json'
delta_bytes = encode_json(delta)
write_new(delta_rel, delta_bytes)

extension = {'schema': 's1-03-cumulative-input-manifest-extension/v1', 'artifact': 's1.subslice03.research-flow', 'version': 2, 'previous_manifest': identity(BASE + 'history/v1/production-manifest.json', input_bytes[BASE + 'history/v1/production-manifest.json']), 'inputs': consumed, 'counts': {'inherited_whole_file_units': 17, 'new_whole_file_units': 11, 'total_unique_whole_file_units': 28, 'total_unique_input_bytes': sum(item['byte_length'] for item in consumed)}, 'aliases': preservation['files'], 'read_path_semantics': 'Historical aliases are the identities of the four v1 inputs. Original current paths were read only before mutation to preserve/compare those same v1 bytes. Newly produced current paths are output verification, never semantic self-inputs.', 'mechanical_reads_included': ['four prior outputs and their exact historical copies', 'prior-output-preservation.json', 'apply.py', 'procedure-freeze.json', 'whole-byte rechecks of frozen input identities'], 'unlisted_inputs_consumed': False, 'raw_source_or_full_judgment_consumed': False}
extension_rel = BASE + 'revisions/v2/input-manifest-extension.json'
extension_bytes = encode_json(extension)
write_new(extension_rel, extension_bytes)

verification = {'schema': 's1-03-producer-delta-verification/v1', 'artifact': 's1.subslice03.research-flow', 'version': 2, 'finding': 'RF-J2-F01', 'producer': '/root/derived_research', 'execution_started_at_utc': started, 'freeze_created_at_utc': freeze['frozen_at_utc'], 'procedure': freeze['script'], 'freeze': identity(FREEZE_REL, freeze_bytes), 'input_count': len(consumed), 'all_frozen_input_identities_match': True, 'history_v1_preserved_before_mutation': True, 'current_outputs_compared_to_historical_bytes_before_mutation': True, 'body_sentence_replacements': 1, 'evidence_mapping_row_replacements': 1, 'unchanged_prefixes_and_suffixes': True, 'depth2_headings_unchanged': True, 'request_dispatch_and_old_recipes_unmodified': True, 'product_tests': 'NOT_RUN', 'network': 'NOT_RUN', 'runtime_or_consumer_execution': 'NOT_RUN', 'principal_independent_verification': 'PENDING; this producer cannot sign the root verification', 'same_pair_semantic_reevaluation': 'PENDING; no author PASS', 'changes': [{'file': item['file'], 'new_output': item['new_output'], 'byte_offset_zero_based': item['byte_offset_zero_based']} for item in changes]}
verification_rel = BASE + 'revisions/v2/producer-verification.json'
verification_bytes = encode_json(verification)
write_new(verification_rel, verification_bytes)

review = [
    '# RF-J2-F01 — suplemento literal para reavaliação L2 v2\n',
    '## Identidade e alcance\n',
    'Artefato `s1.subslice03.research-flow`, somente L2. O achado público RF-J2-F01 pediu restaurar a condição de início do build em F3 e separar estado devolvido de novo trabalho iniciado. O produtor aplicou uma substituição de frase e uma atualização da linha correspondente de E1. Nenhuma outra passagem do body ou evidence mudou.\n',
    'Predecessor semântico inalterado: `s1.core.research`, 63.841 bytes, SHA-256 `f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f`. A condição explícita é preservada conforme a qualificação pública RF-J2-F01, ligada ao mecanismo de R8.1. Não foi aberto raw source nem parecer integral.\n',
    '## Antes e depois exatos\n'
]
for item in changes:
    review.extend([
        '### ' + item['file'] + '\n',
        f"Versão v1 preservada: `{item['historical_input']['sha256']}`, {item['historical_input']['byte_length']} bytes. Versão v2: `{item['new_output']['sha256']}`, {item['new_output']['byte_length']} bytes. Offset inicial UTF-8 zero-based: {item['byte_offset_zero_based']}; linha: {item['line_one_based']}.\n",
        '**ANTES**\n\n```text\n' + item['before'] + '\n```\n',
        '**DEPOIS**\n\n```text\n' + item['after'] + '\n```\n',
        f"SHA-256 do literal ANTES: `{item['before_sha256']}`. SHA-256 do literal DEPOIS: `{item['after_sha256']}`. Prefixo e sufixo restantes foram comprovados byte-idênticos.\n"
    ])
review.extend([
    '## Disposição dos registros históricos\n',
    'Os quatro outputs anteriores foram preservados byte a byte em `history/v1/` antes da mudança. A seção E3 do evidence foi mantida literalmente, por ser registro da produção v1: seus números 16.980 bytes/17 inputs e as verificações daquela etapa permanecem históricos. As identidades atuais e os 28 inputs cumulativos de v2 estão no manifesto atual e em `input-manifest-extension.json`; não se apresentam os números antigos como medição de v2.\n',
    '## Verificação e gate\n',
    'O script real `apply.py` e seus inputs foram congelados em `procedure-freeze.json` antes da execução. A verificação do produtor confirmou um literal alterado em cada arquivo e nenhuma outra mudança nesses bytes. A principal deve conferir independentemente o delta e reapresentá-lo aos mesmos J1/J2; este suplemento não é parecer nem libera L3/L4. Testes de produto, rede, runtime e consumidores: NOT_RUN. Tentativas físicas, tokens e custo: UNKNOWN.\n'
])
review_rel = BASE + 'revisions/v2/review-supplement.md'
review_bytes = ('\n'.join(review)).encode('utf-8')
write_new(review_rel, review_bytes)

response = f"""# Entrega da correção RF-J2-F01 — L2 v2

Corrigi somente a frase de F3 e a linha correspondente de E1 em `s1.subslice03.research-flow`. O início de build agora depende de extrator presente, construção necessária e nenhum build em curso; o retorno building/unavailable não é tratado como prova de novo disparo.

## Identidades atuais

| Arquivo | Bytes | SHA-256 |
| --- | ---: | --- |
| body.md | {changes[0]['new_output']['byte_length']} | `{changes[0]['new_output']['sha256']}` |
| evidence.md | {changes[1]['new_output']['byte_length']} | `{changes[1]['new_output']['sha256']}` |
| apply.py | {freeze['script']['byte_length']} | `{freeze['script']['sha256']}` |
| procedure-freeze.json | {len(freeze_bytes)} | `{hashlib.sha256(freeze_bytes).hexdigest()}` |

O procedimento foi persistido e congelado antes da execução. O delta literal inclui offsets, hashes dos trechos e comprovação de prefixos/sufixos inalterados. `history/v1/` conserva body/evidence/manifest/response exatos; request, dispatch e receitas antigos permanecem intocados.

## Proveniência e limitações

Há 28 inputs integrais únicos: 17 herdados e 11 novos, incluindo aliases históricos dos quatro outputs antigos, controles da correção, dispatch, preservação, script e freeze. Leituras mecânicas foram incluídas; nenhum output corrente é auto-input. E3 do evidence permanece como registro literal de v1; contagens e hashes atuais estão nos registros de v2.

Verificação determinística do produtor concluída. A verificação independente da principal e a reavaliação dos mesmos juízes continuam pendentes. Não há PASS semântico autoemitido, produção/liberação L3/L4, raw source, oracle, parecer integral, rede, outro agente, teste de produto, runtime ou consumidor. Tentativas físicas, tokens e custo não expostos: UNKNOWN.

Este response foi preservado também em `revisions/v2/response.md`. Os hashes finais dos manifestos e deste response serão comunicados externamente, evitando autorreferência.
"""
response_bytes = response.encode('utf-8')
response_rel = BASE + 'revisions/v2/response.md'
write_new(response_rel, response_bytes)
(OUT / 'response.md').write_bytes(response_bytes)

output_rels = [BASE + 'body.md', BASE + 'evidence.md', BASE + 'response.md']
output_rels += [item['historical_alias'] for item in preservation['files']]
output_rels += [BASE + 'revisions/v2/' + name for name in ['dispatch-message.txt', 'prior-output-preservation.json', 'apply.py', 'procedure-freeze.json', 'delta.json', 'review-supplement.md', 'input-manifest-extension.json', 'producer-verification.json', 'response.md']]
outputs = [identity(rel, (ROOT / rel).read_bytes()) for rel in output_rels]
outputs.append({'local_path': BASE + 'production-manifest.json', 'identity_location': 'Final external producer digest report; no self-hash embedded'})
old_manifest = json.loads(input_bytes[BASE + 'history/v1/production-manifest.json'])
manifest = {
    'schema': 's1-03-derived-production-manifest/v1',
    'record_role': 'Postproduction cumulative provenance for minimal correction; not an earlier recipe or semantic verdict',
    'execution_id': freeze['execution_id'],
    'artifact': old_manifest['artifact'],
    'version': 2,
    'finding': 'RF-J2-F01',
    'author': {'native_task': '/root/derived_research', 'role': 'Same family producer, L2 correction only', 'actual_model_id': 'UNKNOWN'},
    'authoring_status': 'CORRECTION_DELIVERED_FOR_SAME_PAIR_REEVALUATION',
    'exclusive_output_directory': BASE.rstrip('/'),
    'source_revision': old_manifest['source_revision'],
    'protocol_revision': old_manifest['protocol_revision'],
    'supersedes': identity(BASE + 'history/v1/production-manifest.json', input_bytes[BASE + 'history/v1/production-manifest.json']),
    'semantic_build_predecessors': old_manifest['build_dependencies'],
    'predecessor_gate': old_manifest['predecessor_gate'],
    'correction_base_is_provenance_not_self_build_edge': identity(BASE + 'history/v1/body.md', input_bytes[BASE + 'history/v1/body.md']),
    'actual_authoring_recipe': {'initial_effective_recipe': old_manifest['effective_authoring_recipe'], 'correction_request': next(item for item in consumed if item['local_path'] == BASE + 'revisions/v2/request.txt'), 'correction_recipe': next(item for item in consumed if item['local_path'] == BASE + 'revisions/v2/recipe.json'), 'public_finding': next(item for item in consumed if item['local_path'] == BASE + 'revisions/v2/public-finding.md'), 'visible_dispatch': next(item for item in consumed if item['local_path'] == BASE + 'revisions/v2/dispatch-message.txt'), 'persisted_executable': freeze['script'], 'pre_execution_freeze': identity(FREEZE_REL, freeze_bytes)},
    'inputs': consumed,
    'input_counts': extension['counts'],
    'historical_input_aliases': preservation['files'],
    'input_path_policy': extension['read_path_semantics'],
    'procedure_provenance': {'implementation': 'Persisted apply.py, executed once through functions.exec -> tools.exec_command -> python; standard library only', 'frozen_before_execution': True, 'freeze': identity(FREEZE_REL, freeze_bytes), 'pre_mutation_preservation': identity(preservation_rel, input_bytes[preservation_rel]), 'permitted_change_count': {'body_sentence': 1, 'evidence_E1_row': 1}, 'delta': identity(delta_rel, delta_bytes), 'producer_verification': identity(verification_rel, verification_bytes)},
    'evidence_historical_section_note': 'E3 is unchanged v1 provenance. Its 16980-byte body and 17-input counts describe v1; current v2 metrics appear in this manifest and the review supplement.',
    'verification': {'all_frozen_inputs_match': True, 'history_v1_byte_identical': True, 'only_two_authorized_literal_substitutions': True, 'body_byte_length': len(candidates['body.md']), 'evidence_byte_length': len(candidates['evidence.md']), 'depth2_sections': 9, 'principal_independent_verification': 'PENDING', 'same_pair_semantic_review': 'PENDING', 'product_tests': 'NOT_RUN', 'runtime_consumers_maintenance': 'NOT_RUN'},
    'outputs': outputs,
    'output_counts': {'current_outputs_replaced': 4, 'prior_outputs_preserved': 4, 'revision_outputs_created': 9, 'total_output_files': 17, 'preexisting_revision_controls_preserved': 3},
    'limitations': old_manifest['limitations'] + ['Only RF-J2-F01 was addressed; no new full review or gate beyond authoring is claimed.', 'Producer verification does not substitute for independent root verification or J1/J2 re-evaluation.'],
    'later_layers_authored_or_released': [],
    'usage': {'physical_attempts': 'UNKNOWN', 'input_tokens': 'UNKNOWN', 'output_tokens': 'UNKNOWN', 'total_tokens': 'UNKNOWN', 'billing_cost': 'UNKNOWN', 'observed_correction_dispatches': 1},
    'preservation': {'v1_exact_copies': True, 'old_request_dispatch_recipes_unmodified': True, 'new_dispatch_exact': True, 'new_dispatch_terminal_newline_added': False, 'current_response_matches_revision_response': True, 'hash_graph': 'The output manifest hashes all other output files; its own digest is reported outside the manifest.'}
}
(OUT / 'production-manifest.json').write_bytes(encode_json(manifest))
assert json.loads((OUT / 'production-manifest.json').read_text(encoding='utf-8'))['input_counts']['total_unique_whole_file_units'] == 28
for item in outputs:
    if 'sha256' in item:
        assert hashlib.sha256((ROOT / item['local_path']).read_bytes()).hexdigest() == item['sha256']
for prior in preservation['files']:
    assert hashlib.sha256((ROOT / prior['historical_alias']).read_bytes()).hexdigest() == prior['sha256']
print('Applied RF-J2-F01; exactly one body sentence and one E1 row replaced.')
print('Cumulative unique inputs:', len(consumed), 'bytes:', extension['counts']['total_unique_input_bytes'])
for rel in [BASE + 'body.md', BASE + 'evidence.md', BASE + 'production-manifest.json', BASE + 'response.md', delta_rel, extension_rel, review_rel, verification_rel]:
    item = identity(rel, (ROOT / rel).read_bytes())
    print(item['local_path'], item['byte_length'], item['sha256'])
