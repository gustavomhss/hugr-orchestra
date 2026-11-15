from pathlib import Path
import json, hashlib, datetime, shutil
W=Path(__file__).resolve().parents[1]; P=W/'payload'; D=W/'producers/derived-research-flow'; R=D/'revisions/v3'
H=lambda b:hashlib.sha256(b).hexdigest()
G=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def check(u):
 b=(W/u['local_path']).read_bytes()
 assert len(b)==u.get('byte_length',u.get('bytes')) and H(b)==u['sha256'] and G(b)==u.get('git_blob_sha',u.get('calculated_git_blob_sha')),u['local_path']
 return b
m=json.loads((D/'production-manifest.json').read_text()); assert len(m['inputs'])==45
for u in m['inputs']:check(u)
assert len({u['local_path'] for u in m['inputs']})==45
assert sum(u['byte_length'] for u in m['inputs'])==500591
for n in ['body.md','evidence.md','production-manifest.json','response.md']:
 assert (R/'history'/n).read_bytes()==(P/'producers/derived-research-flow'/n).read_bytes(),n
j=json.loads((R/'delta.json').read_text());checks=[]
for f in j['files']:
 before=check(f['historical_input']); after=check(f['new_output']);name=Path(f['new_output']['local_path']).name
 changes=[c for c in j['changes'] if c['file']==name];out=b'';pos=0
 for c in changes:
  a=c['before'].encode();z=c['after'].encode()
  assert before[c['old_byte_offset']:c['old_end_exclusive']]==a and after[c['new_byte_offset']:c['new_end_exclusive']]==z
  assert H(a)==c['before_sha256'] and H(z)==c['after_sha256']
  out+=before[pos:c['old_byte_offset']]+z;pos=c['old_end_exclusive']
 out+=before[pos:];assert out==after
 inverse=b'';pos=0
 for c in changes:inverse+=after[pos:c['new_byte_offset']]+c['before'].encode();pos=c['new_end_exclusive']
 inverse+=after[pos:];assert inverse==before
 for s in [s for s in j['unchanged_segments'] if s['file']==name]:
  a=before[s['old_start']:s['old_end_exclusive']];z=after[s['new_start']:s['new_start']+s['byte_length']]
  assert a==z and len(a)==s['byte_length'] and H(a)==s['sha256']
 checks.append({'file':name,'before_sha256':H(before),'after_sha256':H(after),'edits':len(changes),'forward_and_inverse_exact':True})
j2=json.loads((D/'revisions/v2/delta.json').read_text())
for c in j2['changes']:
 before=check(c['historical_input']);after=(R/'history'/c['file']).read_bytes();assert H(after)==c['new_output']['sha256']
 start=c['byte_offset_zero_based'];a=c['before'].encode();z=c['after'].encode()
 assert before[start:c['before_end_byte_exclusive']]==a and after[start:c['after_end_byte_exclusive']]==z
 assert before[:start]+z+before[c['before_end_byte_exclusive']:]==after
 assert after[:start]+a+after[c['after_end_byte_exclusive']:]==before
body=(D/'body.md').read_bytes();ev=(D/'evidence.md').read_bytes();v2=(R/'history/body.md').read_bytes()
assert body[body.index(b'## F1.'):]==v2[v2.index(b'## F1.'):]
assert H((W/'producers/research/body.md').read_bytes())=='c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1'
freeze=json.loads((R/'procedure-freeze.json').read_text());pv=json.loads((R/'producer-verification.json').read_text())
assert freeze['frozen_at_utc']<pv['execution_started_at_utc'];check(freeze['script'])
for u in freeze['inputs']:check(u)
orig=P/'receipts/producer-responses/derived-research-l2-v3-original.md';ob=orig.read_bytes()
assert len(ob)==5556 and H(ob)=='ce765d5c0f8f763f8f37962ea84112ddacc1a57a6224581381e9c4f21f2d7ae8'
receipt={'schema':'s1-03-root-derived-correction-verification/v1','artifact':'s1.subslice03.research-flow','version':3,'at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'whole_inputs_verified':45,'input_bytes':500591,'input_groups':m['input_counts'],'files':checks,'v1_to_v2_deltas_reverified':True,'v2_to_v3_deltas_reverified':True,'F1_through_F8_identical_to_v2':True,'body_bytes':len(body),'body_sha256':H(body),'body_git_blob_sha':G(body),'evidence_bytes':len(ev),'evidence_sha256':H(ev),'substantive_body_edits_since_last_reviewed_v1':1,'metadata_body_edits_since_last_reviewed_v1':1,'freeze_precedes_execution':True,'current_parent':'s1.core.research L1 v4','old_parent_is_historical_alias_only':True,'original_native_final':str(orig.relative_to(W)),'original_native_final_sha256':H(ob),'original_native_final_capture':'Relay original list_agents capture; no reconstruction of missing earlier v2 FINAL','semantic_status':'PENDING_SAME_PAIR','runtime_status':'NOT_RUN'}
rp=P/'receipts/derived-research-flow-v3-verification.json';assert not rp.exists();rp.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
for src in D.rglob('*'):
 if src.is_file():
  dest=P/src.relative_to(W);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest)
c=j2['changes'][0];c3=j['changes'][0]
header=f'''# Reavaliação — research-flow L2 v3 completo

Mesmo par nativo independente, sem ferramentas. Execução 34269cf4-d631-41c5-a30b-85b0ec217390. Nenhum parecer corrente do outro juiz é fornecido.

Candidato s1.subslice03.research-flow, L2 flow: {len(body)} bytes, SHA256 {H(body)}, Git blob {G(body)}. Corpo integral, evidência corrente e receita real seguem abaixo.

A última versão julgada foi v1 (16980 bytes, SHA256 a4b50fa9ae0b781dbea831aefcb98cb099f93167d4a7a584dc88878fc93bc044). A v2 foi preparada e verificada, mas NUNCA despachada aos juízes. A revisão atual é cumulativa v1→v3. Julgue explicitamente o corpo v3 completo, reutilizando somente seu próprio exame anterior e fechando ou mantendo RF-J2-F01. O L1 v4 aceito por você agora é a única autoridade semântica corrente; o L1 v3 permanece histórico, sem qualificação retroativa.

## Dois deltas do corpo desde v1

F3, reparo substantivo público RF-J2-F01:

ANTES:
`````text
{c['before']}
`````
DEPOIS:
`````text
{c['after']}
`````

F0, atualização de identidade do predecessor:

ANTES:
`````text
{c3['before']}
`````
DEPOIS:
`````text
{c3['after']}
`````

A principal verificou ambas as composições e inversas; todos os demais bytes do body v1 permanecem iguais. De v2 para v3, F1–F8 estão byte-idênticos; somente F0 mudou. O mapa de evidência foi atualizado para a autoridade v4 e a proveniência cumulativa. A receita pública de v3 foi congelada antes do despacho; apply.py real tem 20110 bytes e SHA256 fa8fb1920a259dda654fb75321d41bcd4416c8c03b69facbe7dcdd5088d48435. O freeze anterior à execução foi conferido, incluindo os inputs. Foram verificados 45 inputs integrais, 500591 bytes: 28 retidos, cinco registros v2 realmente lidos nas verificações anteriores e 12 desta revisão. Os cinco registros são outputs históricos consumidos; não são inputs retroativos de v2 nem self-inputs atuais. A v3 preserva os quatro outputs v2 e toda a linhagem anterior.

O FINAL nativo corrente foi capturado literalmente; o FINAL v2 anterior não foi capturado separadamente antes da compactação. O response.md original v2 e uma confirmação posterior explicitamente distinta estão preservados. Essa lacuna não foi apagada nem preenchida por reconstrução. Usage físico/tokens/custo UNKNOWN.

Critérios públicos mantidos: foco QS-1, CC-3, GO-A1/GO-A2/GO-A5 e AC-01 local. Sem binding, consumidor, manutenção ou aceitação operacional implícita. Pedimos decisão sobre o corpo completo identificado, não apenas aprovação dos dois trechos.

## Corpo corrente integral

'''
packet=header.encode()+body+b'\n## Evidencia corrente integral\n\n'+ev+b'\n## Receita v3 congelada antes do despacho\n\n'+(R/'recipe.json').read_bytes()
pp=W/'review-packets/derived-research-flow-v3.md';assert not pp.exists();pp.write_bytes(packet)
meta={'schema':'s1-03-derived-delta-review-packet/v1','lot':'derived-research-flow-v3','artifact':'s1.subslice03.research-flow','version':3,'bytes':len(packet),'sha256':H(packet),'git_blob_sha':G(packet),'body_bytes':len(body),'body_sha256':H(body),'body_git_blob_sha':G(body),'dispatch_state':'NOT_YET_DISPATCHED','mechanical_verification':'receipts/derived-research-flow-v3-verification.json','last_judged_version':1,'v2_packet_superseded_without_dispatch':True};pp.with_suffix('.manifest.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
f=P/'receipts/derived-dispatches.json';ds=json.loads(f.read_text());row=next(c for c in ds['calls'] if c['id']=='derived-research-l2-parent-rebind-v3');row.update(state='COMPLETED_FOR_REVIEW',original_response_archive=str(orig.relative_to(W)),original_response_sha256=H(ob),producer_response_file='producers/derived-research-flow/response.md',producer_response_sha256=H((D/'response.md').read_bytes()),dispatch_message_archive='producers/derived-research-flow/revisions/v3/dispatch-message.txt',dispatch_message_sha256=H((R/'dispatch-message.txt').read_bytes()));f.write_text(json.dumps(ds,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(meta,ensure_ascii=False))
