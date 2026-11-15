from pathlib import Path
import hashlib
import json
import difflib
import copy
import sys

ROOT = Path('/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390')
BASE = 'producers/derived-boundary-flow'
REV = BASE + '/revisions/v2'
NAMES = ['body.md', 'evidence.md', 'production-manifest.json', 'response.md']


def digest(data):
    return hashlib.sha256(data).hexdigest()


def info(path, data):
    data.decode('utf-8')
    return {'local_path': path, 'bytes': len(data), 'sha256': digest(data), 'git_blob_sha': hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest(), 'whole_file_identity': True}


def packed(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def check(data, expected):
    observed = info(expected['local_path'], data)
    for field in ['bytes', 'sha256', 'git_blob_sha']:
        assert observed[field] == expected[field], (expected['local_path'], field)


def write_new(path, data):
    assert path.startswith(BASE + '/')
    with (ROOT / path).open('xb') as handle:
        handle.write(data)


freeze_path = REV + '/procedure-freeze.json'
freeze_data = (ROOT / freeze_path).read_bytes()
assert len(sys.argv) == 2 and digest(freeze_data) == sys.argv[1], 'freeze identity mismatch'
freeze = json.loads(freeze_data)
script_path = REV + '/apply.py'
script_data = (ROOT / script_path).read_bytes()
check(script_data, freeze['procedure'])
assert freeze['state'] == 'FROZEN_BEFORE_EXECUTION'
loaded = {}
for item in freeze['read_paths']:
    data = (ROOT / item['local_path']).read_bytes()
    check(data, item)
    loaded[item['local_path']] = data
for path in freeze['created_by_apply']:
    assert not (ROOT / path).exists(), 'refuse repeated or partial apply: ' + path
recipe = json.loads(loaded[REV + '/recipe.json'])
assert recipe['artifact'] == 's1.subslice03.boundary-flow' and recipe['version'] == 2
assert recipe['new_predecessor']['body_sha256'] == '937208953bb286da7bcefad8fd145d935a0ed00ee7d8f87d87c840973033d070'
old = {name: loaded[BASE + '/' + name] for name in NAMES}
for name in NAMES:
    assert old[name] == loaded[REV + '/history/' + name]
prior_manifest = json.loads(old['production-manifest.json'])


def edit(before, after, kind, label, findings=None):
    return {'before': before, 'after': after, 'classification': kind, 'label': label, 'finding_ids': findings or []}


def apply_exact(original, specifications):
    operations = []
    for spec in specifications:
        before = spec['before'].encode('utf-8')
        after = spec['after'].encode('utf-8')
        assert original.count(before) == 1, ('literal not unique', spec['label'])
        start = original.index(before)
        operations.append((start, start + len(before), before, after, spec))
    operations.sort(key=lambda operation: operation[0])
    result = bytearray()
    old_cursor = 0
    changes = []
    unchanged = []
    for start, end, before, after, spec in operations:
        assert start >= old_cursor, 'overlapping replacements'
        stable = original[old_cursor:start]
        unchanged.append({'old_start': old_cursor, 'old_end': start, 'new_start': len(result), 'new_end': len(result) + len(stable), 'bytes': len(stable), 'sha256': digest(stable)})
        result.extend(stable)
        new_start = len(result)
        result.extend(after)
        changes.append({**spec, 'old_start': start, 'old_end': end, 'new_start': new_start, 'new_end': len(result), 'before_bytes': len(before), 'after_bytes': len(after), 'before_sha256': digest(before), 'after_sha256': digest(after)})
        old_cursor = end
    stable = original[old_cursor:]
    unchanged.append({'old_start': old_cursor, 'old_end': len(original), 'new_start': len(result), 'new_end': len(result) + len(stable), 'bytes': len(stable), 'sha256': digest(stable)})
    result.extend(stable)
    result = bytes(result)
    inverse = result
    for change in reversed(changes):
        assert inverse[change['new_start']:change['new_end']] == change['after'].encode('utf-8')
        inverse = inverse[:change['new_start']] + change['before'].encode('utf-8') + inverse[change['new_end']:]
    assert inverse == original
    for segment in unchanged:
        assert original[segment['old_start']:segment['old_end']] == result[segment['new_start']:segment['new_end']]
    return result, {'offset_unit': 'UTF-8 bytes, zero-based half-open ranges', 'changes': changes, 'unchanged_segments': unchanged, 'inverse_reconstructs_exact_prior_bytes': True}


body_edits = [
    edit('| Predecessor obrigatório | `s1.core.boundaries`, 23.665 bytes UTF-8 |', '| Predecessor obrigatório | `s1.core.boundaries` v3, 23.769 bytes UTF-8 |', 'metadata', 'accepted predecessor version and byte length'),
    edit('ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6', '937208953bb286da7bcefad8fd145d935a0ed00ee7d8f87d87c840973033d070', 'metadata', 'accepted predecessor SHA256'),
    edit('Na delegação de respostas, a pergunta precisa pertencer ao lote corrente. O esquema solicita `answer` e `why` como strings, mas a verificação explícita de conteúdo testa `answer.trim()`; não há base para exigir que `why` esteja preenchido. Falhas por pergunta retornam diagnóstico e respostas malsucedidas são omitidas/abstidas. O fluxo descrito pelo comentário como “Genesis mining from the screen” usa teto de 1–200 e concorrência quatro, envia resposta, justificativa e modelo à superfície e passa por gate/admission até staging, sem promoção. [L1 §2]',
         'Na delegação de respostas, a pergunta precisa pertencer ao lote corrente. O esquema solicita `answer` e `why` como strings, mas a verificação explícita de conteúdo testa `answer.trim()`; não há base para exigir que `why` esteja preenchido. A delegação conserva disposição/diagnóstico por pergunta. O host envia à superfície resposta, justificativa e identificação do modelo; a decisão final pertence ao protocolo da superfície. [L1 §2]\n\nO caminho distinto de mining, descrito pelo comentário como “Genesis mining from the screen”, usa teto de 1–200 e concorrência quatro. Respostas de chamadas malsucedidas são omitidas/abstidas nesse caminho, que passa por gate/admission até staging, sem promoção. A justificativa estruturada descrita para delegação não é transferida a esse contrato de mining. [L1 §2]',
         'substantive', 'separate delegation from mining', ['BFLOW-J1-F01', 'BF-J2-F01']),
    edit('`trial` exige trust antes de executar. Seu dry grading evita avanço/ledger, mas os comandos ainda podem produzir efeitos.',
         '`trial` exige trust antes de executar. Executa o comando e devolve seu resultado, sem grading nem registro de veredito; os comandos ainda podem produzir efeitos.',
         'substantive', 'remove grading attribution from trial', ['BF-J2-F02']),
    edit('chunks/texto/linhas/hash/boundary', 'chunks com texto, hash, boundary e campos inteiros `start`/`end` (sem unidade declarada pelo schema)', 'substantive', 'remove unsupported line unit from chunk intervals', ['BF-J2-F03'])
]
body, body_delta = apply_exact(old['body.md'], body_edits)
assert sum(change['classification'] == 'substantive' for change in body_delta['changes']) == 3
assert sum(change['classification'] == 'metadata' for change in body_delta['changes']) == 2
assert b'dry grading' not in body
assert b'chunks/texto/linhas/hash/boundary' not in body
headings = [line for line in body.decode('utf-8').splitlines() if line.startswith('## ')]
assert len(headings) == 8


def section(data, number):
    marker = ('## ' + str(number) + '. ').encode()
    start = data.index(marker)
    next_start = data.find(b'\n## ', start + len(marker))
    return data[start:] if next_start == -1 else data[start:next_start]


unchanged_sections = []
for number in [1, 4, 5, 6, 8]:
    prior_section = section(old['body.md'], number)
    assert prior_section == section(body, number)
    unchanged_sections.append({'section': number, 'bytes': len(prior_section), 'sha256': digest(prior_section)})

# Reconcile cumulative file-version units without treating current outputs as inputs.
inputs = copy.deepcopy(prior_manifest['inputs'])
old_parent_alias = recipe['read_exactly'][5]['local_path']
for item in inputs:
    original_path = item['local_path']
    item['original_read_paths'] = [original_path]
    item['context_origin_revision'] = 1
    item['retained_from_manifest'] = REV + '/history/production-manifest.json'
    item['consumption_in_this_revision'] = 'RETAINED_AUTHOR_CONTEXT_NOT_REREAD'
    item['current_semantic_build_predecessor'] = False
    if item['sha256'] == 'ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6':
        item['local_path'] = old_parent_alias
        item['retained_alias'] = old_parent_alias
        item['original_read_paths'].append(old_parent_alias)
        item['original_role'] = item['role']
        item['role'] = 'Historical accepted L1 v2 context; contains the original trial/chunk imprecisions and is not the current build predecessor.'
        item['historical_accepted_predecessor_key'] = item.pop('accepted_predecessor_key')
        item['consumption_in_this_revision'] = 'FULL_UTF8_TEXT_READ_AT_RETAINED_ALIAS'
new_units = []
for index, entry in enumerate(recipe['read_exactly']):
    if index == 5:
        continue
    record = info(entry['local_path'], loaded[entry['local_path']])
    record['original_read_paths'] = [entry['local_path']]
    record['context_origin_revision'] = 2
    record['consumption_in_this_revision'] = 'FULL_UTF8_TEXT'
    record['provenance'] = 'Enumerated in frozen correction recipe read_exactly; whole-file identity matched before execution.'
    record['current_semantic_build_predecessor'] = index == 4
    if index < 4:
        record['local_path'] = REV + '/history/' + Path(entry['local_path']).name
        record['retained_alias'] = record['local_path']
        record['original_read_paths'].append(record['local_path'])
        record['role'] = 'L2 v1 output consumed as correction/preservation input, now retained byte-identically.'
    elif index == 4:
        record['role'] = 'Only current accepted semantic predecessor: s1.core.boundaries L1 v3.'
        record['accepted_predecessor_key'] = 's1.core.boundaries'
    else:
        record['role'] = 'Public local correction findings; no full judge prose or oracle.'
    new_units.append(record)
for name, role in [('recipe.json', 'Effective frozen correction recipe, not a postproduction reconstruction.'), ('request.txt', 'Frozen correction request preserved unchanged.'), ('dispatch-message.txt', 'Exact visible correction dispatch preserved UTF-8 without an appended newline.')]:
    path = REV + '/' + name
    record = info(path, loaded[path])
    record.update({'original_read_paths': [path], 'context_origin_revision': 2, 'consumption_in_this_revision': 'FULL_UTF8_TEXT', 'provenance': 'Explicit other_actual_inputs of correction recipe.', 'role': role, 'current_semantic_build_predecessor': False})
    new_units.append(record)
for path, data, role in [(script_path, script_data, 'Actual Python correction procedure, written and pinned before its single observed invocation.'), (freeze_path, freeze_data, 'Pre-execution freeze pinning the actual procedure and exact read paths.')]:
    record = info(path, data)
    record.update({'original_read_paths': [path], 'context_origin_revision': 2, 'consumption_in_this_revision': 'EXECUTED_PROCEDURE' if path == script_path else 'FULL_JSON_INPUT', 'provenance': 'Own genuine pre-execution procedure/freeze explicitly authorized as other_actual_inputs.', 'role': role, 'current_semantic_build_predecessor': False})
    new_units.append(record)
inputs.extend(new_units)
assert len(inputs) == 28 and len(new_units) == 11
assert len({(item['local_path'], item['sha256']) for item in inputs}) == 28
assert not ({BASE + '/' + name for name in NAMES} & {item['local_path'] for item in inputs})
assert sum(item['current_semantic_build_predecessor'] for item in inputs) == 1

identity_before = 'A única base semântica de build é `s1.core.boundaries`, arquivo `producers/boundaries/bodies/boundaries.md`, 23.665 bytes, SHA256 `ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6`, Git blob `6821d54aec4f8015dd00d634f632dc9960d1bd74`.'
identity_after = 'A única base semântica de build atual é `s1.core.boundaries` L1 v3, arquivo `producers/boundaries/bodies/boundaries.md`, 23.769 bytes, SHA256 `937208953bb286da7bcefad8fd145d935a0ed00ee7d8f87d87c840973033d070`, Git blob `d3b070015882d10f778f563438eb3f9d67cab061`.'
recipe_before = 'A receita efetivamente usada é `payload/recipes/derived/boundary-flow.json`, 8.459 bytes, SHA256 `3e4c7ebbb94d3fb6d7c4de5238aaea74e817cbfb1e80ea2c15bb259bc20eb544`, em conjunto com `payload/recipes/derived-contract.json` e o dispatch preservado. Foi congelada antes do dispatch. `production-manifest.json` registra a produção depois dela; não é uma receita anterior.'
recipe_after = 'A receita efetivamente usada nesta correção é `producers/derived-boundary-flow/revisions/v2/recipe.json`, 5.580 bytes, SHA256 `19923925cfbf39dcbbb33cb8fb00615dd2b37c5678a250f41dbd09ad4a398d30`, em conjunto com o request e o dispatch adjacentes, os achados públicos e o contrato público retido. A receita inicial `payload/recipes/derived/boundary-flow.json` continua no contexto histórico com SHA256 `3e4c7ebbb94d3fb6d7c4de5238aaea74e817cbfb1e80ea2c15bb259bc20eb544`. A receita de correção precede o dispatch; `revisions/v2/apply.py` e `procedure-freeze.json` foram fixados antes da aplicação. O manifesto atual registra a produção depois dela; não é uma receita anterior.'
gate_before = 'A receita informa PASS de `parallel-v3-fresh/S1-03/J1` e `parallel-v3-fresh/S1-03/J2` sobre o mesmo hash do predecessor. Os hashes das respostas originais nela citados são, respectivamente, `9c7496988762a6455d1682eea750037377778c316d37071203f1c8b719951adc` e `5ae3e9104142c41c0d261bb979dc29607a69065d019d3899d28c9fea52334801`. São metadados de gate fornecidos pela principal, não pareceres consumidos ou novo juízo deste autor. O cabeçalho original do L1 ainda diz candidato/aceite pendente; foi preservado sem correção. A autoridade para liberar a derivação vem do gate da receita sobre aqueles bytes, sem reescrever o histórico.'
gate_after = 'A receita de correção informa PASS dos mesmos `parallel-v3-fresh/S1-03/J1` e `parallel-v3-fresh/S1-03/J2` sobre o hash integral do L1 v3. Os hashes das respostas originais nela citados são, respectivamente, `1f4b25f011a54a640723d4660aa69cae6e6920fe46f92d8a3f49ae13c3ff5923` e `24109643bb94e2c8c1124d9996e5bb4af83a5030c74ae276e466fee526c2e816`. São metadados fornecidos pela principal, não pareceres consumidos ou juízo deste autor. O cabeçalho do L1 ainda diz candidato/aceite pendente; sua preservação não substitui o gate da receita.\n\nO L1 v2 anterior, SHA256 `ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6`, permanece no alias `producers/boundaries/revisions/boundaries-v3/history/body.md`. Ele atribuía dry grading a trial e linhas aos intervalos dos chunks. As duas qualificações corrigidas pertencem ao L1 v3 e não são atribuídas retroativamente ao v2. Esse alias é proveniência cumulativa, sem segunda dependência semântica atual. Os quatro outputs L2 v1 estão preservados em `revisions/v2/history/`.'
verification_before = 'Foram consumidas 14 unidades integrais enumeradas pela receita, mais a própria receita, request e dispatch: 17 unidades de input. O primeiro lote de saída da ferramenta truncou um trecho de COMMON; COMMON foi relido integralmente em lote menor antes da composição. As identidades integrais de todos os inputs constam no manifesto. Os outputs foram relidos para verificação de bytes, UTF-8, hashes e headings; essas releituras são verificação dos próprios outputs, não fontes adicionais.'
verification_after = 'O manifesto atual conserva 28 unidades cumulativas: as 17 da autoria v1 e 11 unidades novas da correção. Nesta revisão foram lidos integralmente os sete arquivos enumerados, incluindo o alias do L1 v2 já conhecido, mais receita/request/dispatch; o procedimento e seu freeze também foram consumidos, totalizando 12 unidades diretas distintas. As quatro cópias de histórico são aliases dos outputs v1, sem inflar essa contagem. Os demais inputs anteriores foram retidos do contexto e do manifesto preservado, sem nova leitura de arquivos. O truncamento histórico de COMMON já havia sido resolvido por releitura integral na autoria v1.\n\nO procedimento congelado aplicou três reparos substantivos e duas atualizações de metadados no corpo. `delta.json` conserva literais antes/depois, offsets de bytes UTF-8, segmentos inalterados e reconstrução inversa. As seções 1, 4, 5, 6 e 8 do corpo permanecem byte-idênticas. As identidades e aliases cumulativos constam no manifesto e em `input-manifest-extension.json`; o readback dos outputs e a verificação inversa constam em `producer-verification.json`. Essas verificações determinísticas de arquivos não são testes de produto nem juízo semântico.'
evidence_edits = [
    edit(identity_before, identity_after, 'metadata', 'current predecessor identity'),
    edit(recipe_before, recipe_after, 'metadata', 'actual correction recipe and procedure provenance'),
    edit(gate_before, gate_after, 'metadata', 'new predecessor gate and historical nonretroactivity'),
    edit('perguntas do lote, answer.trim e ausência de garantia de why não vazio; teto/concorrência, staging sem promoção.', 'delegação com disposição/diagnóstico por pergunta, answer.trim sem garantia extra de why e resposta/justificativa/modelo à superfície; mining separado com omissão/abstenção, teto/concorrência e staging sem promoção, sem transferir justificativa estruturada.', 'evidence_mapping', 'delegation and mining evidence separated', ['BFLOW-J1-F01', 'BF-J2-F01']),
    edit('trial com efeitos; check sem registro', 'trial executa comando sem grading nem registro de veredito, com efeitos possíveis; check pode avaliar sem registro', 'evidence_mapping', 'trial and evaluation evidence separated', ['BF-J2-F02']),
    edit('Workspace como schema; entidades RAG, chunks sem FK, índice sem unicidade declarada', 'Workspace como schema; entidades RAG, chunks com start/end inteiros sem unidade declarada e sem FK, índice sem unicidade declarada', 'evidence_mapping', 'chunk interval units explicitly unestablished', ['BF-J2-F03']),
    edit(verification_before, verification_after, 'metadata', 'cumulative inputs preservation and actual correction verification')
]
evidence, evidence_delta = apply_exact(old['evidence.md'], evidence_edits)

extension = {
    'schema': 's1-03-cumulative-input-extension/v1',
    'artifact': recipe['artifact'], 'revision': 2,
    'prior_input_manifest': info(REV + '/history/production-manifest.json', old['production-manifest.json']),
    'counting_unit': 'One consumed whole-file version; a byte-identical retained alias preserves lineage without adding a new unit.',
    'retained_prior_units': 17, 'new_units_count': 11, 'cumulative_units': 28,
    'direct_units_this_revision': 12, 'direct_read_paths_this_revision': 16,
    'new_units': new_units,
    'old_parent_alias_update': next(item for item in inputs if item['local_path'] == old_parent_alias),
    'preservation_aliases': [{'original_read_path': BASE + '/' + name, 'retained_alias': REV + '/history/' + name, **{field: info(REV + '/history/' + name, old[name])[field] for field in ['bytes', 'sha256', 'git_blob_sha']}} for name in NAMES],
    'unchanged_prior_context_not_reread': [item['local_path'] for item in inputs[:17] if item['consumption_in_this_revision'] == 'RETAINED_AUTHOR_CONTEXT_NOT_REREAD'],
    'current_outputs_used_as_self_inputs': False,
    'old_parent_is_current_build_predecessor': False,
    'raw_oracle_full_judge_inputs': []
}
extension_data = packed(extension)
body_info = info(BASE + '/body.md', body)
evidence_info = info(BASE + '/evidence.md', evidence)
review = f"""# Suplemento de revisão — boundary-flow L2 v2

## Identidade e escopo

Candidato `s1.subslice03.boundary-flow`, L2 `flow`, revisão 2. Corpo: {len(body)} bytes, SHA256 `{digest(body)}`. Evidência: {len(evidence)} bytes, SHA256 `{digest(evidence)}`. A correção segue a receita de 5.580 bytes, SHA256 `19923925cfbf39dcbbb33cb8fb00615dd2b37c5678a250f41dbd09ad4a398d30`, e os achados públicos de 1.561 bytes, SHA256 `bdf2775890fc18bb642fc4e341b5984b8c2fb3fc0ef15217ded1650d44e196ca`.

O único predecessor atual é `s1.core.boundaries` L1 v3, 23.769 bytes, SHA256 `937208953bb286da7bcefad8fd145d935a0ed00ee7d8f87d87c840973033d070`, Git blob `d3b070015882d10f778f563438eb3f9d67cab061`. A receita registra os PASS de J1/J2 nos mesmos bytes; os pareceres integrais não foram consumidos. O corpo L1 v2 histórico, SHA256 `ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6`, ainda contém as imprecisões sobre trial e linhas de chunks. As correções dessas duas frases vêm do v3, sem atribuição retroativa.

## Reparos obrigatórios aplicados

| Achado público | Local | Resultado da autoria |
| --- | --- | --- |
| BFLOW-J1-F01 / BF-J2-F01 | Corpo §2; evidência §2 | Separados os parágrafos de delegação e mining: a delegação mantém disposição/diagnóstico por pergunta e envia resposta/justificativa/modelo à superfície; mining conserva omissão/abstenção, teto 1–200, concorrência quatro e staging sem promoção. A justificativa estruturada não é transferida entre contratos. A redação utiliza o nível de detalhe explicitado no L1 §2, sem acrescentar chamadas brutas. |
| BF-J2-F02 | Corpo §3; evidência §3 | Trial executa o comando e devolve resultado, sem grading nem registro de veredito, conservando possíveis efeitos. Check sem state directory permanece avaliação separada; não se acrescenta sanitização. Suporte: L1 v3 §3.2. |
| BF-J2-F03 | Corpo §7; evidência §7 | Chunks têm start/end inteiros sem unidade estabelecida pelo schema. Removida a unidade linhas. Suporte: L1 v3 §6. |

## Delimitação mecânica

O corpo tem exatamente três substituições substantivas e duas de identidade do predecessor. As seções 1, 4, 5, 6 e 8 permanecem byte-idênticas; os segmentos fora das cinco substituições também. O mapa de evidência recebeu apenas os vínculos desses reparos e a atualização necessária de identidade, gate, histórico e contagem cumulativa. Manifesto e resposta foram atualizados como registros da revisão.

`delta.json` guarda os literais completos antes/depois, offsets zero-based em bytes UTF-8, hashes dos segmentos inalterados e verificação inversa para os quatro outputs atuais. `delta.patch` é a apresentação unificada determinística do mesmo delta. O procedimento real `apply.py` foi congelado em `procedure-freeze.json` antes da aplicação; os quatro outputs v1 já estavam preservados em `history/`. O manifesto cumulativo contém 28 unidades, com aliases estáveis e linhagem dos paths de leitura; os outputs atuais não são self-inputs.

## Estado para o par

Pronto para reavaliação pelos mesmos J1/J2. A verificação foi apenas de arquivos, identidades, escopo de substituições e inversão; não há self-PASS. Nenhum oracle, parecer integral ou fonte bruta foi aberto. Rede, GitHub, produto, testes, Atlas, consumidores, manutenção e camadas posteriores não foram executados. Tentativas físicas, tokens e cobrança: UNKNOWN.
"""
review_data = review.encode('utf-8')
response = f"""Entregue **`s1.subslice03.boundary-flow` L2 v2**, pronta para reavaliação pelo mesmo par, em `producers/derived-boundary-flow`.

Foram aplicados somente os três reparos públicos: separação entre delegação e mining; retirada de grading de `trial`; substituição de “linhas” por `start`/`end` inteiros sem unidade declarada. O único predecessor atual é `s1.core.boundaries` L1 v3, SHA256 `937208953bb286da7bcefad8fd145d935a0ed00ee7d8f87d87c840973033d070`. As qualificações novas de trial/chunks não foram atribuídas ao L1 v2 histórico.

| Output atual | Bytes | SHA256 |
| --- | ---: | --- |
| `body.md` | {len(body)} | `{digest(body)}` |
| `evidence.md` | {len(evidence)} | `{digest(evidence)}` |

Os quatro outputs v1 foram preservados byte-identicamente em `revisions/v2/history/`. O procedimento foi congelado antes da aplicação. O delta registra cinco substituições no corpo, sendo três substantivas e duas de metadados, com literais, offsets UTF-8, segmentos inalterados e reconstrução inversa exata. As seções 1, 4, 5, 6 e 8 permanecem byte-idênticas.

O manifesto conserva **28 unidades cumulativas de input**, com aliases estáveis e linhagem de leitura, sem usar outputs atuais como self-inputs. Esta revisão produziu **16 arquivos**, incluindo os quatro outputs atuais, quatro cópias históricas e oito registros em `revisions/v2/`. Os hashes do manifesto, desta resposta e da verificação final são enviados no envelope separado para evitar autorreferência.

Não houve oracle, parecer integral, fonte bruta, rede, GitHub, delegação, alteração/teste de produto, operação Atlas, consumidor ou manutenção. Nenhuma camada posterior foi produzida ou liberada. **Não há self-PASS. Tentativas físicas, tokens e custo: UNKNOWN.**
"""
response_data = response.encode('utf-8')

pending = {
    BASE + '/body.md': body,
    BASE + '/evidence.md': evidence,
    BASE + '/response.md': response_data,
    REV + '/input-manifest-extension.json': extension_data,
    REV + '/review-supplement.md': review_data
}
prewritten = {REV + '/dispatch-message.txt': loaded[REV + '/dispatch-message.txt'], script_path: script_data, freeze_path: freeze_data}
prewritten.update({REV + '/history/' + name: old[name] for name in NAMES})
manifest = copy.deepcopy(prior_manifest)
manifest.update({
    'schema': 's1-03-derived-production-manifest/v2', 'version': 2, 'prior_version': 1,
    'state': 'CORRECTION_COMPLETE_AWAITING_SAME_TWO_NATIVE_JUDGES',
    'manifest_role': 'POSTPRODUCTION_RECORD_NOT_AN_EARLIER_RECIPE',
    'inputs': inputs,
    'input_counts': {'retained_prior_units': 17, 'new_units': 11, 'total_unique_actual_input_units': 28, 'total_input_bytes': sum(item['bytes'] for item in inputs), 'direct_whole_file_units_this_revision': 12, 'direct_read_paths_this_revision': 16, 'alias_reads_add_units': False, 'raw_source_units': 0, 'full_judge_response_units': 0, 'oracle_units': 0},
    'initial_recipe_preserved': copy.deepcopy(prior_manifest['actual_recipe']),
    'actual_recipe': {'correction': info(REV + '/recipe.json', loaded[REV + '/recipe.json']), 'common_retained': prior_manifest['actual_recipe']['common'], 'visible_dispatch': info(REV + '/dispatch-message.txt', loaded[REV + '/dispatch-message.txt']), 'frozen_request': info(REV + '/request.txt', loaded[REV + '/request.txt']), 'public_findings': info(REV + '/public-findings.md', loaded[REV + '/public-findings.md']), 'actual_procedure': info(script_path, script_data), 'procedure_freeze': info(freeze_path, freeze_data), 'not_retroactive': True},
    'build_dependencies': [{'key': 's1.core.boundaries', 'version': 3, 'local_body_path': recipe['new_predecessor']['local_body_path'], 'body_bytes': 23769, 'body_sha256': recipe['new_predecessor']['body_sha256'], 'body_git_blob_sha': recipe['new_predecessor']['body_git_blob_sha'], 'acceptance_gate': recipe['predecessor_acceptance_gate'], 'acceptance_provenance': 'Frozen correction recipe supplies the same two native judges accepting all L1 v3 bytes; full responses not consumed.', 'unselected_package_ref': None}],
    'historical_parent_alias': {'local_path': old_parent_alias, 'sha256': 'ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6', 'role': 'Prior actual context only; not current semantic predecessor; old trial/chunk wording preserved.'},
    'preserved_prior_outputs': [info(REV + '/history/' + name, old[name]) for name in NAMES],
    'output_count': 16,
    'semantic_review': {'this_artifact': 'REVISION_2_NOT_YET_REVIEWED', 'prior_findings_source': REV + '/public-findings.md', 'required_pair': ['parallel-v3-fresh/S1-03/J1', 'parallel-v3-fresh/S1-03/J2'], 'next_layer_released': False},
    'correction_scope': {'body_substantive_replacements': 3, 'body_metadata_replacements': 2, 'findings': ['BFLOW-J1-F01', 'BF-J2-F01', 'BF-J2-F02', 'BF-J2-F03'], 'unchanged_body_sections': unchanged_sections, 'cumulative_current_output_self_inputs': False, 'later_layers_produced': False},
    'usage': {'physical_attempts': 'UNKNOWN', 'tokens': 'UNKNOWN', 'billing': 'UNKNOWN', 'inference_method': 'No physical attempt or cost estimates inferred from one observed script invocation or file sizes.'}
})
manifest['producer']['fresh_context'] = 'Same native oracle-blind family author continued; prior actual context retained.'
manifest['verification'].update({'input_identity': 'Seven enumerated whole files plus recipe/request/dispatch verified; procedure/freeze pinned before execution; four history aliases verified. Earlier public context retained without rereading unlisted paths.', 'output_identity': 'Known output hashes recorded here; final delta/patch/self-manifest identities are in producer-verification.json and the external envelope.', 'body_byte_length': len(body), 'body_depth2_headings': headings, 'body_sizing': 'Prior sizing retained; only mandatory localized repairs and predecessor metadata changed.', 'inverse_verification': 'Exact prior bytes reconstructed for body/evidence and regenerated manifest/response.', 'unchanged_segments': 'All segments outside explicit body/evidence replacements verified byte-identical.', 'one_observed_application_invocation': True})
manifest['procedure_provenance'].append({'procedure': 'Revision 2 exact correction', 'implementation': info(script_path, script_data), 'pre_execution_freeze': info(freeze_path, freeze_data), 'effect': 'Seven enumerated full-file reads; preserve four v1 outputs before edits; apply only three substantive body repairs plus metadata; update evidence and cumulative input aliases; verify inverse and unchanged segments; preserve exact visible response.', 'prior_input_policy': 'Prior normative/recipe/request/dispatch units retained from same author context and preserved v1 manifest, without rereading unlisted paths.'})
manifest['limitations'] = [item for item in prior_manifest['limitations'] if not item.startswith('Predecessor body original')]
manifest['limitations'].append('L1 v3 supplies corrected trial and chunk interval descriptions; L1 v2 remains preserved with its original imprecisions. No retroactive correction or acceptance is asserted.')
manifest['outputs'] = []
known = {**prewritten, **pending}
for path in freeze['expected_outputs']:
    if path in known:
        manifest['outputs'].append(info(path, known[path]))
    else:
        manifest['outputs'].append({'local_path': path, 'bytes': None, 'sha256': None, 'git_blob_sha': None, 'integrity_provenance': 'Measured after serialization in producer-verification.json or final envelope; excluded here to avoid cyclic/self identities.'})
pending[BASE + '/production-manifest.json'] = packed(manifest)

file_deltas = []
for name, details in [('body.md', body_delta), ('evidence.md', evidence_delta)]:
    current = pending[BASE + '/' + name]
    file_deltas.append({'local_path': BASE + '/' + name, 'retained_alias': REV + '/history/' + name, 'before_identity': info(REV + '/history/' + name, old[name]), 'after_identity': info(BASE + '/' + name, current), **details})
for name in ['production-manifest.json', 'response.md']:
    current = pending[BASE + '/' + name]
    result, details = apply_exact(old[name], [edit(old[name].decode('utf-8'), current.decode('utf-8'), 'metadata_record_regeneration', 'revision record with cumulative provenance and current output identities')])
    assert result == current
    file_deltas.append({'local_path': BASE + '/' + name, 'retained_alias': REV + '/history/' + name, 'before_identity': info(REV + '/history/' + name, old[name]), 'after_identity': info(BASE + '/' + name, current), **details})
delta = {'schema': 's1-03-exact-correction-delta/v1', 'artifact': recipe['artifact'], 'from_version': 1, 'to_version': 2, 'procedure': info(script_path, script_data), 'freeze': info(freeze_path, freeze_data), 'body_substantive_edits': 3, 'body_metadata_edits': 2, 'files': file_deltas, 'all_inverse_checks_exact': True, 'unchanged_body_sections': unchanged_sections, 'semantic_verdict': 'NOT_ISSUED_BY_AUTHOR'}
pending[REV + '/delta.json'] = packed(delta)
patch = ''
for name in NAMES:
    patch += ''.join(difflib.unified_diff(old[name].decode('utf-8').splitlines(keepends=True), pending[BASE + '/' + name].decode('utf-8').splitlines(keepends=True), fromfile=REV + '/history/' + name, tofile=BASE + '/' + name))
pending[REV + '/delta.patch'] = patch.encode('utf-8')
assert len(pending) == 8
assert len(prewritten) == 7
assert set(pending) | set(prewritten) | {REV + '/producer-verification.json'} == set(freeze['expected_outputs'])
for path, data in pending.items():
    if path in {BASE + '/' + name for name in NAMES}:
        assert (ROOT / path).read_bytes() == old[Path(path).name], 'current output drifted before write'
        (ROOT / path).write_bytes(data)
    else:
        write_new(path, data)
readback = []
for path in freeze['expected_outputs']:
    if path == REV + '/producer-verification.json':
        continue
    data = (ROOT / path).read_bytes()
    expected = pending[path] if path in pending else prewritten[path]
    assert data == expected
    readback.append(info(path, data))
for entry in freeze['read_paths']:
    if entry['local_path'] not in {BASE + '/' + name for name in NAMES}:
        check((ROOT / entry['local_path']).read_bytes(), entry)
verification = {
    'schema': 's1-03-producer-correction-verification/v1', 'artifact': recipe['artifact'], 'version': 2,
    'verification_kind': 'Deterministic file verification only; not product tests or semantic PASS.',
    'procedure': info(script_path, script_data), 'freeze': info(freeze_path, freeze_data), 'invocation': ['python', str(ROOT / script_path), sys.argv[1]],
    'observed_apply_invocations': 1, 'physical_attempts': 'UNKNOWN',
    'enumerated_inputs_matched': 7, 'preserved_prior_outputs_matched': 4,
    'cumulative_input_units': 28, 'new_input_units': 11, 'direct_units_this_revision': 12, 'direct_read_paths_this_revision': 16,
    'current_output_self_inputs': False, 'unique_current_semantic_predecessor': recipe['new_predecessor'],
    'body_substantive_replacements': 3, 'body_metadata_replacements': 2, 'unchanged_body_sections': unchanged_sections,
    'exact_inverse_all_four_outputs': True, 'unchanged_segments_exact': True, 'body_depth2_heading_count': 8,
    'frozen_inputs_and_histories_unchanged_after_application': True,
    'outputs': readback + [{'local_path': REV + '/producer-verification.json', 'bytes': None, 'sha256': None, 'git_blob_sha': None, 'integrity_provenance': 'Self identity delivered in final external envelope.'}],
    'output_count': 16,
    'not_run': ['network', 'GitHub', 'delegation', 'product_changes', 'product_tests', 'Atlas', 'consumers', 'maintenance', 'later_layers'],
    'not_consumed': ['oracle', 'full_judge_responses', 'raw_sources', 'unlisted_sibling_files'],
    'semantic_review': 'Awaiting same J1/J2; no self-PASS.', 'tokens': 'UNKNOWN', 'billing': 'UNKNOWN'
}
verification_path = REV + '/producer-verification.json'
verification_data = packed(verification)
write_new(verification_path, verification_data)
assert (ROOT / verification_path).read_bytes() == verification_data
for path in [BASE + '/' + name for name in NAMES] + [script_path, freeze_path, REV + '/delta.json', REV + '/review-supplement.md', REV + '/input-manifest-extension.json', verification_path]:
    print(json.dumps(info(path, (ROOT / path).read_bytes()), ensure_ascii=False))
print('VERIFIED: 28 cumulative input units; 16 output files; 3 substantive + 2 metadata body edits; inverse reconstruction exact; no semantic verdict.')
