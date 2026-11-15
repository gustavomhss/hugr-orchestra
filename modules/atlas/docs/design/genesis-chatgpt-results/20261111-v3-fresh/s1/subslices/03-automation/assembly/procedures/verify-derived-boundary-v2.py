from pathlib import Path
import json,hashlib,datetime,shutil
W=Path(__file__).resolve().parents[1];P=W/'payload';D=W/'producers/derived-boundary-flow';R=D/'revisions/v2'
H=lambda b:hashlib.sha256(b).hexdigest();G=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def check(p,u):
 b=p.read_bytes();assert len(b)==u['bytes'] and H(b)==u['sha256'] and G(b)==u['git_blob_sha'],str(p);return b
j=json.loads((R/'delta.json').read_text());files=[]
for f in j['files']:
 before=check(W/f['retained_alias'],f['before_identity']);after=check(W/f['local_path'],f['after_identity']);assert before==(P/f['local_path']).read_bytes()
 assembled=b'';pos=0
 for c in f['changes']:
  a=c['before'].encode();z=c['after'].encode();assert before[c['old_start']:c['old_end']]==a and after[c['new_start']:c['new_end']]==z;assert H(a)==c['before_sha256'] and H(z)==c['after_sha256'];assembled+=before[pos:c['old_start']]+z;pos=c['old_end']
 assembled+=before[pos:];assert assembled==after
 inverse=b'';pos=0
 for c in f['changes']:inverse+=after[pos:c['new_start']]+c['before'].encode();pos=c['new_end']
 inverse+=after[pos:];assert inverse==before
 for s in f['unchanged_segments']:
  a=before[s['old_start']:s['old_end']];z=after[s['new_start']:s['new_end']];assert a==z and H(a)==s['sha256']
 files.append({'path':f['local_path'],'prior_alias':f['retained_alias'],'before_sha256':H(before),'after_sha256':H(after),'changes':len(f['changes']),'inverse_exact':True})
m=json.loads((D/'production-manifest.json').read_text());units=m['inputs'];assert len(units)==28
for u in units:check(W/u['local_path'],u)
body=(D/'body.md').read_bytes();ev=(D/'evidence.md').read_bytes();parent=W/'producers/boundaries/bodies/boundaries.md';assert H(parent.read_bytes())=='937208953bb286da7bcefad8fd145d935a0ed00ee7d8f87d87c840973033d070'
freeze=json.loads((R/'procedure-freeze.json').read_text());pv=json.loads((R/'producer-verification.json').read_text());assert (R/'procedure-freeze.json').stat().st_mtime<(D/'body.md').stat().st_mtime;assert pv['observed_apply_invocations']==1
response='''Entregue **`s1.subslice03.boundary-flow` L2 v2**, pronta para reavaliação pelo mesmo par, em `producers/derived-boundary-flow`.

Foram aplicados somente os três reparos públicos: separação entre delegação e mining; retirada de grading de `trial`; substituição de “linhas” por `start`/`end` inteiros sem unidade declarada. O único predecessor atual é `s1.core.boundaries` L1 v3, SHA256 `937208953bb286da7bcefad8fd145d935a0ed00ee7d8f87d87c840973033d070`. As qualificações novas de trial/chunks não foram atribuídas ao L1 v2 histórico.

| Output atual | Bytes | SHA256 |
| --- | ---: | --- |
| `body.md` | 16484 | `e18fe141b88a3aba6ede8e8a0dd138876161984db36d4b8e5540f9ab329c0771` |
| `evidence.md` | 10057 | `b87c56d31e6b0f846b0cab7e9d329bdcb40fcbffcbb1025a3cd4b864f0f97f4d` |

Os quatro outputs v1 foram preservados byte-identicamente em `revisions/v2/history/`. O procedimento foi congelado antes da aplicação. O delta registra cinco substituições no corpo, sendo três substantivas e duas de metadados, com literais, offsets UTF-8, segmentos inalterados e reconstrução inversa exata. As seções 1, 4, 5, 6 e 8 permanecem byte-idênticas.

O manifesto conserva **28 unidades cumulativas de input**, com aliases estáveis e linhagem de leitura, sem usar outputs atuais como self-inputs. Esta revisão produziu **16 arquivos**, incluindo os quatro outputs atuais, quatro cópias históricas e oito registros em `revisions/v2/`. Os hashes do manifesto, desta resposta e da verificação final são enviados no envelope separado para evitar autorreferência.

Não houve oracle, parecer integral, fonte bruta, rede, GitHub, delegação, alteração/teste de produto, operação Atlas, consumidor ou manutenção. Nenhuma camada posterior foi produzida ou liberada. **Não há self-PASS. Tentativas físicas, tokens e custo: UNKNOWN.**'''
assert (D/'response.md').read_bytes()==response.encode()+b'\n'
orig=P/'receipts/producer-responses/derived-boundaries-l2-v2-original.md';assert not orig.exists();orig.write_text(response)
receipt={'schema':'s1-03-root-derived-correction-verification/v1','artifact':'s1.subslice03.boundary-flow','version':2,'at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':files,'whole_inputs_verified':28,'body_bytes':len(body),'body_sha256':H(body),'body_git_blob_sha':G(body),'evidence_bytes':len(ev),'evidence_sha256':H(ev),'body_substantive_changes':3,'body_metadata_changes':2,'all_inverse_checks_exact':True,'freeze_file_timestamp_precedes_body_write':True,'producer_reported_observed_apply_invocations':1,'original_native_final':str(orig.relative_to(W)),'original_native_final_bytes':len(response.encode()),'original_native_final_sha256':H(response.encode()),'capture_note':'Visible original native FINAL copied exactly, without terminal LF; matches producer response file apart from that LF. Host wire hash/id unknown.','semantic_status':'PENDING_SAME_PAIR','runtime_status':'NOT_RUN'}
rp=P/'receipts/derived-boundary-flow-v2-verification.json';assert not rp.exists();rp.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
for src in D.rglob('*'):
 if src.is_file():
  dest=P/src.relative_to(W);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest)
header=f'''# Reavaliação — boundary-flow L2 v2\n\nMesmo par nativo independente, sem ferramentas. Execução 34269cf4-d631-41c5-a30b-85b0ec217390. Nenhum parecer atual do outro juiz é fornecido.\n\nCandidato completo s1.subslice03.boundary-flow L2 flow: {len(body)} bytes, SHA256 {H(body)}, Git blob {G(body)}. O corpo v1 inteiro foi recebido antes por cada juiz; a principal verificou os cinco deltas abaixo, todos os segmentos restantes e a inversa integral. Reutilize seu próprio exame do restante e julgue explicitamente o corpo v2 completo, fechando ou mantendo os achados obrigatórios.\n\nO predecessor corrente é L1 boundaries v3, já recebido e aceito por você. As imprecisões de trial/chunks também estavam no L1 v2; não atribuir qualificação retroativa. Fonte semântica atual única: v3 SHA937208953bb286da7bcefad8fd145d935a0ed00ee7d8f87d87c840973033d070. Foram verificados os28 inputs cumulativos (17retidos+11novos), sem self-inputs atuais. O procedimento real apply.py de36148bytes tem SHA256 fbf7ef729de0f11bc3df2ccbe77da99d9e69171f21c36bbea62421d93c984a6e; freeze persistido antes da escrita do corpo e autor registra uma aplicação. Recibo da principal: receipts/derived-boundary-flow-v2-verification.json.\n\nCritérios públicos mantidos; foco obrigatório QS-1, CC-3, GO-A1/GO-A2/GO-A5 e AC-01 local. Sem binding, consumidor, manutenção ou aceitação operacional implícita.\n\n## Suplemento original\n\n'''
chunks=[header.encode(),(R/'review-supplement.md').read_bytes(),b'\n## Deltas literais completos do corpo\n\n']
for c in j['files'][0]['changes']:
 t=f"### {c['label']} ({c['classification']})\n\nBEFORE [{c['old_start']}, {c['old_end']}):\n\n`````text\n{c['before']}\n`````\n\nAFTER [{c['new_start']}, {c['new_end']}):\n\n`````text\n{c['after']}\n`````\n\n";chunks.append(t.encode())
chunks+=[b'\n## Evidencia corrente integral\n\n',ev,b'\n## Receita de correcao congelada antes do despacho\n\n',(R/'recipe.json').read_bytes()]
packet=b''.join(chunks);name='derived-boundary-flow-v2';pp=W/'review-packets'/f'{name}.md';assert not pp.exists();pp.write_bytes(packet)
meta={'schema':'s1-03-derived-delta-review-packet/v1','lot':name,'artifact':'s1.subslice03.boundary-flow','version':2,'bytes':len(packet),'sha256':H(packet),'git_blob_sha':G(packet),'body_bytes':len(body),'body_sha256':H(body),'body_git_blob_sha':G(body),'dispatch_state':'NOT_YET_DISPATCHED','mechanical_verification':'receipts/derived-boundary-flow-v2-verification.json'};pp.with_suffix('.manifest.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
f=P/'receipts/derived-dispatches.json';ds=json.loads(f.read_text());row=next(c for c in ds['calls'] if c['id']=='derived-boundaries-l2-correction-v2');row.update(state='COMPLETED_FOR_REVIEW',original_response_archive=str(orig.relative_to(W)),original_response_sha256=H(response.encode()),producer_response_file='producers/derived-boundary-flow/response.md',producer_response_sha256=H((D/'response.md').read_bytes()),dispatch_message_archive='producers/derived-boundary-flow/revisions/v2/dispatch-message.txt',dispatch_message_sha256=H((R/'dispatch-message.txt').read_bytes()));f.write_text(json.dumps(ds,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(meta,ensure_ascii=False))
