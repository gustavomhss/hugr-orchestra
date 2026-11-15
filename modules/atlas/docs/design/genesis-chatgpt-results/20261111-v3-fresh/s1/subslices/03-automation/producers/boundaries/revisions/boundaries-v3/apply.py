"""One frozen, local byte correction; reads source as data, never executes product."""
import difflib
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390')
REV_REL = 'producers/boundaries/revisions/boundaries-v3'
REV = ROOT / REV_REL
BODY_REL = 'producers/boundaries/bodies/boundaries.md'
SOURCE_REV = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
sha = lambda b: hashlib.sha256(b).hexdigest()
blob = lambda b: hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()
now = lambda: datetime.now(timezone.utc).isoformat()
events = []
written = {}

def record(action, **details):
    events.append({'sequence': len(events) + 1, 'utc': now(), 'action': action, **details})

def identity(path, raw):
    return {'path': path, 'bytes': len(raw), 'sha256': sha(raw), 'git_blob_sha': blob(raw)}

def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()

def emit(name, raw):
    if isinstance(raw, str): raw = raw.encode()
    assert '/' not in name, 'Outputs of this procedure are direct revision children.'
    target = REV / name
    with target.open('xb') as handle:
        handle.write(raw)
    written[name] = identity(REV_REL + '/' + name, raw)
    record('revision_output_written', path=written[name]['path'], sha256=written[name]['sha256'])

record('apply_invocation_started')
freeze_raw = (REV / 'procedure-freeze.json').read_bytes()
freeze = json.loads(freeze_raw)
script_raw = (REV / 'apply.py').read_bytes()
assert freeze['state'] == 'FROZEN_BEFORE_EXECUTION'
assert identity(REV_REL + '/apply.py', script_raw) == freeze['procedure_file']
record('procedure_and_freeze_read_whole', procedure=identity(REV_REL + '/apply.py', script_raw), freeze=identity(REV_REL + '/procedure-freeze.json', freeze_raw))

raws = {}
for unit in freeze['whole_file_inputs']:
    raw = (ROOT / unit['path']).read_bytes()
    assert identity(unit['path'], raw) == {k: unit[k] for k in ['path','bytes','sha256','git_blob_sha']}, unit['path']
    raws[unit['path']] = raw
    record('whole_input_verified', path=unit['path'], bytes=len(raw), sha256=sha(raw), role=unit['role'])

recipe_path = REV_REL + '/recipe.json'
assert sha(raws[recipe_path]) == '8e51dad268ee1fc9ade4b91c4d4ff1c08a76aa3f0ec9636786d778026085f385'
recipe = json.loads(raws[recipe_path])
assert recipe['artifact'] == 's1.core.boundaries' and recipe['version'] == 3
assert recipe['allowed_current_changes'] == [BODY_REL]
before = raws[BODY_REL]
assert before == raws[REV_REL + '/history/body.md']
assert sha(before) == 'ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6'
for output in freeze['outputs_created_by_apply']:
    assert not (REV / output).exists(), 'Refuse to overwrite a frozen output: ' + output
record('preflight_and_prior_body_preservation_verified')

# Build from the original bytes, keeping all interstitial segments verbatim.
parts = []
ops = []
segments = []
old_cursor = 0
new_cursor = 0
for spec in freeze['operations']:
    old = spec['before'].encode(); new = spec['after'].encode()
    assert before.count(old) == 1, spec['id']
    start = before.index(old)
    assert start >= old_cursor
    unchanged = before[old_cursor:start]
    parts.append(unchanged)
    segments.append({'before_start_byte': old_cursor, 'before_end_byte_exclusive': start,
                     'after_start_byte': new_cursor, 'after_end_byte_exclusive': new_cursor + len(unchanged),
                     'bytes': len(unchanged), 'sha256': sha(unchanged)})
    new_cursor += len(unchanged)
    ops.append({**spec, 'before_start_byte': start, 'before_end_byte_exclusive': start + len(old),
                'after_start_byte': new_cursor, 'after_end_byte_exclusive': new_cursor + len(new),
                'before_bytes': len(old), 'after_bytes': len(new), 'before_sha256': sha(old), 'after_sha256': sha(new)})
    parts.append(new); new_cursor += len(new); old_cursor = start + len(old)
tail = before[old_cursor:]
parts.append(tail)
segments.append({'before_start_byte': old_cursor, 'before_end_byte_exclusive': len(before),
                 'after_start_byte': new_cursor, 'after_end_byte_exclusive': new_cursor + len(tail),
                 'bytes': len(tail), 'sha256': sha(tail)})
after = b''.join(parts)
assert len(ops) == 2
inverse = after
for op in reversed(ops):
    a, b = op['after_start_byte'], op['after_end_byte_exclusive']
    assert inverse[a:b] == op['after'].encode()
    inverse = inverse[:a] + op['before'].encode() + inverse[b:]
assert inverse == before
for segment in segments:
    a = before[segment['before_start_byte']:segment['before_end_byte_exclusive']]
    b = after[segment['after_start_byte']:segment['after_end_byte_exclusive']]
    assert a == b and sha(a) == segment['sha256']

# Independent full-text diff, not a hand-authored rendering of the operation list.
patch = ''.join(difflib.unified_diff(before.decode().splitlines(keepends=True), after.decode().splitlines(keepends=True),
    fromfile='boundaries-v3/history/body.md', tofile='boundaries-v3/body.md', n=3)).encode()
assert patch and patch.count(b'@@ -') == 2
record('two_substitutions_inverse_and_unchanged_segments_verified_in_memory')
delta = {'schema':'s1-03-exact-literal-delta/v1','artifact':'s1.core.boundaries','from_version':2,'to_version':3,
         'prior_body':identity(BODY_REL,before),'prior_body_preserved_as':identity(REV_REL+'/history/body.md',before),
         'current_body':identity(BODY_REL,after),'operations':ops,'unchanged_segments':segments,
         'inverse_reconstruction_sha256':sha(inverse),'inverse_reconstruction_byte_identical':True,
         'other_body_bytes_unchanged':True,'semantic_status':'PENDING_SAME_PAIR_REEVALUATION'}

review = bytearray()
proof = []
def put(text): review.extend(text.encode() if isinstance(text,str) else text)
put('# Boundaries v3 — suplemento mínimo para ROOT-BND-L1-F01/F02\n\n')
put('Mesma autoria L1 oracle-blind. Este suplemento registra duas substituições e a prova fonte correspondente; não atribui aceite semântico. O corpo v2 e os registros anteriores permanecem preservados.\n\n')
put(f'Corpo anterior: {len(before)} bytes, SHA256 `{sha(before)}`; corpo v3: {len(after)} bytes, SHA256 `{sha(after)}`. Offsets abaixo são bytes UTF-8, base zero e fim exclusivo.\n')
for op in ops:
    put(f'\n## {op["id"]} — {op["section"]}\n\nAnterior [{op["before_start_byte"]}, {op["before_end_byte_exclusive"]}), SHA256 `{op["before_sha256"]}`:\n\n`````text\n{op["before"]}\n`````\n\nNovo [{op["after_start_byte"]}, {op["after_end_byte_exclusive"]}), SHA256 `{op["after_sha256"]}`:\n\n`````text\n{op["after"]}\n`````\n')
put('\n## Alcance da correção\n\n**Observação:** `trial` executa o comando e retorna resultado; não chama grading nem grava veredito de gate nesse percurso. O shell pode ter efeitos. `check` permanece separado, com `stateDir: undefined`, e `evaluate` permanece separado, com o guard de workflow e a chamada ArmEvaluate. O delta não amplia a sanitização de trial.\n\n**Observação e limite:** o objeto RagChunkTable declara `start` e `end` inteiros. A folha lida integralmente não fornece unidade para esses campos; o corpo deixa de atribuir números de linha. Não se consultou outra fonte para completar essa unidade.\n\n## Prova literal decisiva\n')
for spec in freeze['source_excerpts']:
    raw = raws[spec['input_path']]; lines = raw.splitlines(keepends=True)
    a = sum(map(len,lines[:spec['first_line']-1])); b = sum(map(len,lines[:spec['last_line']]))
    ex = raw[a:b]
    rec = {**spec, 'commit':SOURCE_REV, 'source_identity':identity(spec['input_path'],raw),
           'source_start_byte':a,'source_end_byte_exclusive':b,'excerpt_sha256':sha(ex),'excerpt_bytes':len(ex)}
    put(f'\n### {spec["id"]} — `{spec["source_path"]}` {spec["first_line"]}–{spec["last_line"]}\n\nCommit `{SOURCE_REV}`; blob `{blob(raw)}`; SHA256 integral `{sha(raw)}`; {len(raw)} bytes. Recorte [{a}, {b}); SHA256 trecho `{sha(ex)}`.\n\n`````text\n')
    rec['supplement_start_byte'] = len(review); put(ex); rec['supplement_end_byte_exclusive'] = len(review)
    if not ex.endswith(b'\n'):put('\n')
    put('`````\n');proof.append(rec)
put('\n## Mapa da revisão e herança\n\nF01 atualiza somente a afirmação de §3.2, sustentada por `V3-TRIAL-CONTRACT`, `V3-TRIAL` e `V3-EVALUATE`; F02 atualiza somente a afirmação de §6, sustentada por `V3-RAG-CHUNK`. Os mapas/excertos v1/v2 continuam históricos e não foram reescritos. Este mapa local identifica as duas afirmações correntes e sua prova.\n\nAs fontes integrais relay.ts e rag-studio/sql.ts foram relidas, assim como todos os demais inputs enumerados na receita v3. A lineage integral anterior permanece em effective-inputs.json e na receita v2, incluindo A3/A4/projection e suas unidades completas. Excertos não substituem inputs integrais. Support/union não foram abertos nem alterados neste despacho.\n\nProduto, testes, providers, Atlas e rede: NOT_RUN. Sem acesso a oracle/juízes/descendentes nesta revisão; sem delegação. O mesmo par deve reavaliar estes bytes antes de qualquer gate dependente.\n')
for rec in proof:
    raw = raws[rec['input_path']]
    ex = raw[rec['source_start_byte']:rec['source_end_byte_exclusive']]
    assert review[rec['supplement_start_byte']:rec['supplement_end_byte_exclusive']] == ex
    assert sha(ex) == rec['excerpt_sha256']
record('supplement_literal_offsets_verified_in_memory')

# Every file read by the procedure is represented as a whole-file unit. The
# prior current-body identity resolves through its stable history alias.
inherited = json.loads(raws['producers/boundaries/effective-inputs.json'])
prior_recipe = json.loads(raws['producers/boundaries/revisions/boundaries-v2/recipe.json'])
manifest = {
    'schema':'s1-03-actual-input-manifest-extension/v1','artifact':'s1.core.boundaries','version':3,
    'unit_rule':'Every file read or hashed is a whole-file input unit; selected excerpts are evidence projections only.',
    'new_dispatch_whole_file_reads':freeze['whole_file_inputs'],
    'procedure_inputs':[identity(REV_REL+'/apply.py',script_raw),identity(REV_REL+'/procedure-freeze.json',freeze_raw)],
    'changed_in_place_aliases':[{'path':BODY_REL,'prior_identity':identity(BODY_REL,before),'stable_alias':identity(REV_REL+'/history/body.md',before),'new_identity_is_output_only':identity(BODY_REL,after)}],
    'retained_lineage':{
        'scope':'All actual original L1-family input lineage is retained; this two-claim correction does not narrow or reclassify prior inputs.',
        'boundary_prior_recipe':prior_recipe,
        'effective_inputs_manifest':identity('producers/boundaries/effective-inputs.json',raws['producers/boundaries/effective-inputs.json']),
        'source_groups':inherited['source_groups'],
        'historical_full_inputs':inherited['historical_full_inputs'],
        'historical_bodies':inherited['historical_bodies'],
        'guidance_and_authority_inputs':inherited['guidance_and_authority_inputs'],
        'per_artifact':inherited['per_artifact'],
        'capture_manifest':inherited['capture_manifest'],'coverage_manifest':inherited['coverage'],
        'large_input_notice':inherited['large_input_notice'],
        'prior_context_records_not_reopened':freeze['retained_prior_context_records_not_reopened'],
        'not_a_dependency_acceptance':True,
    },
    'current_outputs_are_not_self_inputs':True,
    'postwrite_body_read':'Whole resulting body is read only for mechanical output verification and recorded in producer-verification, not listed as its own production input.',
    'supplemental_summary':'review-supplement.md is a new output derived from the frozen two operations and the whole source inputs; it is not a substitute input.',
    'preparation_record':freeze['pre_execution_order'],
    'no_new_source_fetch':True,'tokens':'UNKNOWN','physical_attempts':'UNKNOWN','cost':'UNKNOWN',
}

emit('body.md',after)
(ROOT/BODY_REL).write_bytes(after)
record('current_body_written_once',path=BODY_REL,identity=identity(BODY_REL,after))
observed = (ROOT/BODY_REL).read_bytes()
assert observed == after
record('current_output_whole_bytes_verified',path=BODY_REL,identity=identity(BODY_REL,observed),classification='postproduction_output_verification_not_self_input')
emit('delta.json',json_bytes(delta))
emit('delta.patch',patch)
emit('review-supplement.md',bytes(review))
emit('review-supplement.index.json',json_bytes({'supplement':identity(REV_REL+'/review-supplement.md',bytes(review)),'literal_entries':proof,'finding_map':{'ROOT-BND-L1-F01':['V3-TRIAL-CONTRACT','V3-TRIAL','V3-EVALUATE'],'ROOT-BND-L1-F02':['V3-RAG-CHUNK']}}))
emit('input-manifest-extension.json',json_bytes(manifest))

response = f'''# Entrega boundaries L1 v3

Aplicadas somente ROOT-BND-L1-F01 e ROOT-BND-L1-F02. §3.2 agora descreve execução e retorno do comando de trial sem grading/registro de veredito; preserva efeitos possíveis do shell, o limite de sanitização e os caminhos separados de check/evaluate. §6 descreve campos inteiros start/end sem lhes atribuir unidade de linha.

O corpo v2 foi preservado em history/body.md antes da mutação. O procedimento apply.py e suas entradas foram congelados em procedure-freeze.json antes da única invocação. recipe.json/request.txt/public-findings.md permanecem byte-idênticos às identidades fornecidas. dispatch-message.txt preserva o despacho literal. A ordem efetiva está em producer-verification.json.

Corpo anterior: {len(before)} bytes, SHA256 `{sha(before)}`, blob `{blob(before)}`.
Corpo atual: {len(after)} bytes, SHA256 `{sha(after)}`, blob `{blob(after)}`.

delta.json contém duas operações literais com offsets/hash, três segmentos inalterados e inversão byte-idêntica. delta.patch é o diff independente dos corpos integrais. review-supplement.md contém o delta e quatro excertos literais decisivos, com identidade das fontes, linhas/offsets/hash e mapa das duas afirmações correntes. Os registros antigos permanecem históricos.

Todos os inputs enumerados foram lidos integralmente; as leituras mecânicas, aliases de preservação, pedido, despacho, script e freeze também estão declarados em input-manifest-extension.json. A lineage anterior permanece integral: A3/A4/projection continuam inputs reais, sem recorte/reclassificação para contornar limite. Os outputs correntes não se tornam self-inputs.

Somente o corpo boundaries corrente mudou fora deste diretório revisional. Support/union não foram lidos ou alterados neste despacho. Não houve rede, produto/testes, providers, Atlas, oracle/juízes/descendentes ou delegação. Não foi produzida camada posterior nem self-PASS semântico. O mesmo par independente deve reavaliar antes de qualquer gate dependente. Tokens, physical attempts e custo: UNKNOWN quando não expostos.
'''
emit('response.md',response)
record('all_requested_artifacts_except_this_verification_record_written')
verification = {
    'schema':'s1-03-producer-byte-verification/v1','artifact':'s1.core.boundaries','version':3,
    'scope':'Mechanical byte/delta/evidence verification only; no semantic self-PASS.',
    'frozen_recipe':identity(recipe_path,raws[recipe_path]),
    'procedure_freeze':identity(REV_REL+'/procedure-freeze.json',freeze_raw),
    'procedure':identity(REV_REL+'/apply.py',script_raw),
    'actual_order':events,'pre_execution_order':freeze['pre_execution_order'],
    'procedure_invocations_in_this_dispatch':1,'current_body_write_calls':1,
    'prior_body':identity(REV_REL+'/history/body.md',before),'current_body':identity(BODY_REL,observed),
    'operations':len(ops),'unchanged_segments':segments,'inverse_verified_byte_identical':True,
    'literal_source_excerpts':len(proof),'literal_offsets_and_hashes_verified':True,
    'frozen_supplied_inputs_preserved_by_no_write':True,
    'output_identities':written.copy(),
    'write_scope':'Only exclusive revision directory and the one authorized current boundaries body.',
    'support_union_status':'NOT_OPENED_NOT_WRITTEN_IN_THIS_DISPATCH',
    'verification_record_emission':'This record is emitted last; its own file hash is returned in tool output, avoiding self-reference.',
    'product_tests_runtime_network':'NOT_RUN','semantic_status':'PENDING_SAME_PAIR_REEVALUATION',
    'tokens':'UNKNOWN','physical_attempts':'UNKNOWN','cost':'UNKNOWN',
}
emit('producer-verification.json',json_bytes(verification))
print(json.dumps({'completed':True,'current_body':identity(BODY_REL,observed),'outputs':written,'semantic_status':'PENDING_SAME_PAIR_REEVALUATION'},ensure_ascii=False))
