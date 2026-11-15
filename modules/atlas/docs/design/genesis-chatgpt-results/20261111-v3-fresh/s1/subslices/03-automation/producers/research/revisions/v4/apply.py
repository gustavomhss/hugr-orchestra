#!/usr/bin/env python3
# Actual v4 documentary procedure, frozen before execution. No product imports.
from pathlib import Path
from datetime import datetime, timezone
import difflib, hashlib, json, sys

BASE = Path('/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/research')
ROOT = BASE.parent.parent
REV = BASE / 'revisions/v4'
RP = 'producers/research/revisions/v4/'
BODY = 'producers/research/body.md'
SOURCE = 'producers/research/sources/packages/core/src/research-toolkit/code-index/query.ts'
PARENT = 'producers/research/revisions/v3/input-manifest-extension.json'
PRECIPE = 'producers/research/recipe-v3.json'
PIN = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
PREFIX = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/'
BEFORE = 'Se não há shard aberto, dispara build detached e devolve building/unavailable com motivo, sem fabricar resultado vazio limpo.'
AFTER = 'O build detached exige shard ausente ou stale, ausência de build em andamento do plano ou dos shards e `ctx.extract` disponível (`missing && !building && ctx.extract`). Sem shards no escopo, retorna `index_unavailable` antes desse caminho; sem shard utilizável, devolve building/unavailable com motivo, sem fabricar resultado vazio limpo. Esse erro não implica novo disparo nesta chamada.'
NAMES = ['history/body.md', 'delta.patch', 'delta.json', 'review-supplement.md', 'response.md', 'input-manifest-extension.json', 'producer-verification.json']

def now():
    return datetime.now(timezone.utc).isoformat()

def ident(data):
    return {'bytes':len(data), 'sha256':hashlib.sha256(data).hexdigest(),
            'git_blob_sha':hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()}

def jsonbytes(value):
    return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8')

written = {}
def create(name,data):
    target=REV/name
    target.parent.mkdir(parents=True,exist_ok=True)
    with target.open('xb') as output:
        output.write(data)
    written[name]=ident(data)
    return written[name]

started=now()
order=[]
def event(action,**details):
    order.append({'sequence':len(order)+1,'at_utc':now(),'action':action,**details})

assert len(sys.argv)==2, 'Expected frozen procedure-freeze SHA-256'
freeze_bytes=(REV/'procedure-freeze.json').read_bytes()
assert ident(freeze_bytes)['sha256']==sys.argv[1]
freeze=json.loads(freeze_bytes)
procedure_bytes=Path(__file__).read_bytes()
assert ident(procedure_bytes)==freeze['procedure']['identity']
assert freeze['state']=='FROZEN_BEFORE_EXECUTION'
assert freeze['replacement']=={'before':BEFORE,'after':AFTER,'count':1}
event('verify-procedure-and-freeze-created-before-invocation')
inputs={}
for row in freeze['inputs']:
    data=(ROOT/row['path']).read_bytes()
    assert ident(data)==row['identity'],row['path']
    data.decode('utf-8')
    inputs[row['path']]=data
recipe=json.loads(inputs[RP+'recipe.json'])
assert recipe['version']==4 and recipe['prior_version']==3
assert recipe['body']==BODY and recipe['allowed_current_changes']==[BODY]
assert recipe['exclusive_revision_directory']==RP.rstrip('/')
for row in recipe['inputs']:
    assert ident(inputs[row['path']])=={key:row[key] for key in ('bytes','sha256','git_blob_sha')}
for name in NAMES:
    assert not (REV/name).exists(),'Do not rerun or overwrite revision outputs: '+name
event('read-and-verify-eight-whole-file-input-units',paths=list(inputs))

prior=inputs[BODY]
needle=BEFORE.encode('utf-8')
replacement=AFTER.encode('utf-8')
assert prior.count(needle)==1 and prior.count(replacement)==0
start=prior.index(needle)
end_before=start+len(needle)
end_after=start+len(replacement)
assert prior[:start].count(b'\n')+1==225
assert prior.index(b'### R8.1')<start<prior.index(b'### R8.2')
current=prior[:start]+replacement+prior[end_before:]
assert current[:start]==prior[:start] and current[end_after:]==prior[end_before:]
assert current[:start]+needle+current[end_after:]==prior
changed=[i+1 for i,(a,b) in enumerate(zip(prior.splitlines(),current.splitlines())) if a!=b]
assert len(prior.splitlines())==len(current.splitlines()) and changed==[225]
source=inputs[SOURCE]
lines=source.splitlines(keepends=True)
assert len(lines)==524
excerpt=b''.join(lines[175:225])
for decisive in [b'if (missing && !building && ctx.extract)',b'choices.some((choice) => choice === undefined || choice.stale)',b'progress !== undefined || shards.some((planned) => CodeIndexStore.building(ctx.storeRoot, planned.key))',b'if (shards.length === 0)',b'if (ready.length === 0)']:
    assert decisive in excerpt
excerpt_start=sum(map(len,lines[:175]))
source_ref={'id':'RB-S002','repository_path':'packages/core/src/research-toolkit/code-index/query.ts','capture_path':SOURCE,'commit':PIN,'identity':ident(source),'range':{'start_line':176,'end_line_inclusive':225,'utf8_start_offset_inclusive':excerpt_start,'utf8_end_offset_exclusive':excerpt_start+len(excerpt),'literal_excerpt_identity':ident(excerpt)}}
event('verify-one-literal-change-and-pinned-source-conditions',changed_lines=changed)

create('history/body.md',prior)
assert (REV/'history/body.md').read_bytes()==prior
(REV/'history/body.md').chmod(0o444)
event('preserve-and-verify-v3-before-current-body-mutation',path=RP+'history/body.md',identity=ident(prior))
(ROOT/BODY).write_bytes(current)
assert (ROOT/BODY).read_bytes()==current
event('apply-single-literal-substitution-and-read-back-v4',identity=ident(current))
patch=''.join(difflib.unified_diff(prior.decode().splitlines(keepends=True),current.decode().splitlines(keepends=True),fromfile='a/producers/research/body.md (v3)',tofile='b/producers/research/body.md (v4)',n=3)).encode('utf-8')
create('delta.patch',patch)
delta={'schema':'genesis-minimal-l1-delta/v1','artifact':'s1.core.research','revision':4,'finding':'ROOT-R-L1-F01','prior_body':{'read_path':BODY,'retained_path':RP+'history/body.md',**ident(prior)},'current_body':{'path':BODY,**ident(current)},'replacement_count':1,'section':'R8.1','line':225,'before':BEFORE,'after':AFTER,'utf8_offsets':{'convention':'zero-based bytes; end exclusive','before':{'start':start,'end':end_before},'after':{'start':start,'end':end_after}},'before_literal':ident(needle),'after_literal':ident(replacement),'unchanged_prefix':ident(prior[:start]),'unchanged_suffix':ident(prior[end_before:]),'inverse_reconstruction_equals_v3':True,'all_other_bytes_unchanged':True,'changed_lines':changed,'source':source_ref,'independent_unified_diff':{'path':RP+'delta.patch',**written['delta.patch']},'verification_scope':'Byte identity and exact replacement; no semantic verdict or product execution.'}
create('delta.json',jsonbytes(delta))

supplement=f'''# R8.1 — condição de disparo do build detached (v4)

**Observação de fonte.** Esta correção documental responde a ROOT-R-L1-F01. O disparo em `open` depende de `missing && !building && ctx.extract`. `missing` inclui shard ausente ou fallback stale; `building` considera progresso do plano ou build de shard. O retorno building/unavailable pode ocorrer sem novo disparo por esta chamada. A saída inicial quando não há shards precede esse ramo.

**Identidade do delta.** Uma substituição literal na linha 225 de R8.1; demais bytes preservados. V3: {len(prior)} bytes, SHA-256 `{ident(prior)['sha256']}`, blob `{ident(prior)['git_blob_sha']}`; cópia integral em `revisions/v4/history/body.md`. V4: {len(current)} bytes, SHA-256 `{ident(current)['sha256']}`, blob `{ident(current)['git_blob_sha']}`. Offsets UTF-8 zero-based, fim exclusivo: BEFORE [{start}, {end_before}); AFTER [{start}, {end_after}). `delta.json` conserva hashes de prefixo/sufixo e verificação inversa; `delta.patch` é o diff unificado independente.

## BEFORE — literal v3

```text
{BEFORE}
```

## AFTER — literal v4

```text
{AFTER}
```

## RB-S002 — ramo decisivo completo

Fonte original: `packages/core/src/research-toolkit/code-index/query.ts`, commit `{PIN}`; captura integral: `sources/packages/core/src/research-toolkit/code-index/query.ts`. Arquivo: {len(source)} bytes; SHA-256 `{ident(source)['sha256']}`; blob Git `{ident(source)['git_blob_sha']}`. Trecho literal contínuo: linhas 176–225 inclusivas, bytes [{excerpt_start}, {excerpt_start+len(excerpt)}), {len(excerpt)} bytes, SHA-256 `{ident(excerpt)['sha256']}`. O bloco abaixo conserva os bytes originais do trecho, sem prefixos de numeração; o fechamento do fence é editorial. A identificação RB-S002/E24 mantém o vínculo ao acervo anterior, que permanece integral e inalterado.

```typescript
{excerpt.decode('utf-8')}```

**Limite.** A base é inspeção estática do baseline fixado. Nenhum build, teste de produto ou chamada externa foi executado. A verificação de bytes não é um parecer de suficiência semântica.
'''
create('review-supplement.md',supplement.encode('utf-8'))
event('emit-exact-delta-independent-patch-and-neutral-literal-evidence')

predecessor=json.loads(inputs[PARENT])
predecessor_recipe=json.loads(inputs[PRECIPE])
rows=[]
for item in freeze['inputs']:
    row={**item,'read_path':item['path'],'whole_original_file':True,'input_unit':'complete UTF-8 file; no excerpt replaces file identity'}
    row['retained_path']=RP+'history/body.md' if item['path']==BODY else item['path']
    row['canonical_destination']=source_ref['repository_path'] if item['path']==SOURCE else PREFIX+row['retained_path']
    if item['path']==BODY:
        row.update({'aliases':[BODY,RP+'history/body.md'],'version':3})
    if item['path']==SOURCE:
        row.update({'repository_path':source_ref['repository_path'],'commit':PIN})
    rows.append(row)
for name,data,role in [('apply.py',procedure_bytes,'effective executable procedure frozen before execution'),('procedure-freeze.json',freeze_bytes,'pre-execution procedure/input identity freeze consumed by apply.py')]:
    rows.append({'path':RP+name,'read_path':RP+name,'retained_path':RP+name,'identity':ident(data),'role':role,'origin':'local-pre-execution-control','whole_original_file':True,'canonical_destination':PREFIX+RP+name})

response=f'''# Resposta original — correção L1 research v4

Concluída a correção documental de ROOT-R-L1-F01 por uma substituição literal única na linha 225 de R8.1. O texto conserva a condição `missing && !building && ctx.extract`, inclui falta e stale, distingue building/unavailable do disparo efetivo e registra a saída antecipada sem shards. Nenhuma outra frase foi alterada.

Pedido, receita prévia, dispatch literal e achados públicos permanecem preservados. O procedimento real `apply.py` foi gravado e congelado por `procedure-freeze.json` antes de uma execução. A cópia integral v3 foi comparada antes de escrever v4. A receita v3 e sua extensão de inputs continuam históricas e inalteradas. Nenhuma receita posterior foi apresentada como anterior.

## Identidades

| Objeto | Bytes | SHA-256 |
| --- | ---: | --- |
| V3 preservada em `history/body.md` | {len(prior)} | `{ident(prior)['sha256']}` |
| V4 corrente em `../../body.md` | {len(current)} | `{ident(current)['sha256']}` |
| Procedimento prévio `apply.py` | {len(procedure_bytes)} | `{ident(procedure_bytes)['sha256']}` |
| Freeze anterior à execução | {len(freeze_bytes)} | `{ident(freeze_bytes)['sha256']}` |

Blob Git da v4: `{ident(current)['git_blob_sha']}`. `delta.json` registra literais, offsets UTF-8, prefixo/sufixo e inversão exata; `delta.patch` conserva o diff independente. `review-supplement.md` contém o delta e as linhas 176–225 de query.ts, sem decisões ou opiniões de juízes.

## Inputs e preservação

A extensão declara dez unidades integrais realmente consumidas: os cinco inputs da receita, pedido, receita, dispatch, procedimento e freeze. A unidade body-v3 possui o alias preservado; a v4 não é seu próprio input. query.ts foi relido integralmente; as demais 129 capturas não foram reabertas. A extensão v3 e seu vínculo ao inventário histórico v2 são retidos sem transformar referências históricas em novas leituras. Leituras de outputs para verificação são verificações de outputs, não dependências retroativas.

O bootstrap inicial falhou na análise sintática antes de qualquer instrução ou escrita. O incidente consta do freeze. A gravação corrigida produziu e congelou o procedimento antes de sua execução única. A ordem efetiva está em `producer-verification.json`. As verificações locais abrangem preservação, hashes, fonte fixada, diff e inversão; não são testes de produto nem aceite semântico.

## Limites

Nenhuma rede, publicação, alteração de produto, teste de produto, delegação ou L2–L4. Nenhum oracle, juiz, descendente ou novo material fora do conjunto autorizado foi lido. Tokens, tentativas físicas de modelo e custo permanecem UNKNOWN por não estarem expostos. O mesmo par deve reavaliar esta revisão; a entrega não emite PASS nem libera camada posterior.
'''
create('response.md',response.encode('utf-8'))
manifest={'schema':'genesis-native-input-extension/v2','artifact':'s1.core.research','revision':4,'finding':'ROOT-R-L1-F01','status':'ACTUAL_EXECUTED_CORRECTION_INPUTS','whole_file_identity':True,'path_base':str(ROOT),'inheritance':{'predecessor_extension':{'path':PARENT,**ident(inputs[PARENT])},'predecessor_descriptive_recipe':{'path':PRECIPE,**ident(inputs[PRECIPE]),'classification':predecessor_recipe['classification']},'predecessor_inheritance_retained_verbatim_as_json_value':predecessor['inheritance'],'predecessor_inputs_retained_verbatim_as_json_value':predecessor['inputs'],'predecessor_paths_base':'producers/research/','policy':'All prior actual lineage remains inherited. Ancestor references are not new reads or hashes. Historical v2 audit and v3 extension remain unchanged.'},'inputs':rows,'counts':{'whole_file_input_units_this_revision':len(rows),'enumerated_recipe_inputs':5,'other_preexisting_control_files':3,'new_pre_execution_procedure_files':2,'pinned_source_files_reread':1},'effective_recipe':[RP+name for name in ['request.txt','recipe.json','dispatch-message.txt','public-findings.md','apply.py','procedure-freeze.json']],'procedure_frozen_before_execution':True,'script_creation':'Inline producer bootstrap wrote apply.py and freeze before invocation; bootstrap code is retained in the tool transcript, not invented later as a file input. Initial bootstrap SyntaxError occurred before all file writes.','semantic_reads':'Request, recipe, dispatch, findings and five enumerated files consumed in full; body/query display split or repeated when output was truncated.','mechanical_reads':'Eight initial file units re-read for hashing/preservation; apply.py and procedure-freeze.json read in full. No broad archive hash sweep.','version_alias':{'input_read_path':BODY,'input_version':3,'retained_alias':RP+'history/body.md','current_output_version':4},'new_outputs_not_self_inputs':[BODY]+[RP+name for name in NAMES],'verification_output_reads':[BODY]+[RP+name for name in NAMES],'metadata_only_checks':'existence preflight, directory creation and chmod; no additional source content read','source_text_is_data':True,'usage':{'tokens':'UNKNOWN','physical_model_attempts':'UNKNOWN','cost':'UNKNOWN','recorded_apply_invocations':1,'network_calls':0,'product_test_runs':0}}
create('input-manifest-extension.json',jsonbytes(manifest))
event('emit-original-response-and-whole-file-input-extension')

preserved=[]
for item in freeze['inputs']:
    target=REV/'history/body.md' if item['path']==BODY else ROOT/item['path']
    data=target.read_bytes()
    assert ident(data)==item['identity']
    preserved.append({'path':str(target.relative_to(ROOT)),**ident(data)})
assert Path(__file__).read_bytes()==procedure_bytes
assert (REV/'procedure-freeze.json').read_bytes()==freeze_bytes
assert (ROOT/BODY).read_bytes()==current
outputs=[{'path':BODY,**ident(current)}]
for name,expected in written.items():
    data=(REV/name).read_bytes()
    assert ident(data)==expected
    outputs.append({'path':RP+name,**ident(data)})
event('verify-preserved-inputs-and-all-written-outputs')
verification={'schema':'genesis-producer-mechanical-verification/v1','revision':4,'artifact':'s1.core.research','classification':'MECHANICAL_PRODUCER_VERIFICATION_NOT_SEMANTIC_JUDGMENT','started_at_utc':started,'completed_at_utc':now(),'procedure_frozen_at_utc':freeze['frozen_at_utc'],'procedure':{'path':RP+'apply.py',**ident(procedure_bytes)},'freeze':{'path':RP+'procedure-freeze.json',**ident(freeze_bytes)},'invocation':['python',RP+'apply.py',sys.argv[1]],'recorded_apply_invocations':1,'bootstrap_incident':freeze['bootstrap_incident'],'actual_order':order,'single_literal_substitution':True,'changed_lines':changed,'prefix_and_suffix_unchanged':True,'inverse_exact':True,'preserved_input_identities':preserved,'outputs_before_this_receipt':outputs,'output_self_hash':'Excluded to avoid self-reference; reported after writing.','write_scope':[BODY,RP],'external_or_reserved_reads':0,'network_calls':0,'product_test_runs':0,'semantic_self_pass':False,'limitations':['Documentary replacement and fixed-source inspection only.','No runtime qualification, oracle, new judge, dependent gate or later layer.']}
create('producer-verification.json',jsonbytes(verification))
print(json.dumps({'revision':4,'body':ident(current),'substitutions':1,'changed_lines':changed,'whole_file_input_units':len(rows),'verification':ident((REV/'producer-verification.json').read_bytes())},ensure_ascii=False))
