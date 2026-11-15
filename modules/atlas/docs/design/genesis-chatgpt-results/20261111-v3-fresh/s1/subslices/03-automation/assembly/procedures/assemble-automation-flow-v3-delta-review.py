"""Reuse prior literal review context and send the entire v3 body plus exact changed evidence.

All generated projections are labelled. No verdict is inferred and no other judge's
response is included. The complete evidence, recipe and manifests stay preserved.
"""
from pathlib import Path
import json, hashlib, difflib, datetime
W=Path(__file__).resolve().parents[1];P=W/'payload';D=W/'producers/derived-automation-flow';OLD=D/'revisions/v3/history'
H=lambda b:hashlib.sha256(b).hexdigest()
G=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def ident(p):
 b=p.read_bytes();return {'path':str(p.relative_to(W)),'bytes':len(b),'sha256':H(b),'git_blob_sha':G(b)}
old=json.loads((OLD/'production-manifest.json').read_text());new=json.loads((D/'production-manifest.json').read_text());previous={x['local_path']:x for x in old['inputs']};current={x['local_path']:x for x in new['inputs']}
assert set(previous)<=set(current) and len(previous)==24 and len(current)==31
for p,u in current.items():
 b=(W/p).read_bytes();assert H(b)==u['sha256'] and len(b)==u['bytes'] and G(b)==u['git_blob_sha']
 if p in previous:assert all(previous[p][k]==u[k] for k in ['bytes','sha256','git_blob_sha'])
added=[current[p] for p in current if p not in previous]
before=(OLD/'body.md').read_bytes();body=(D/'body.md').read_bytes();delta=json.loads((D/'revisions/v3/delta.json').read_text());replacement=delta['replacement'];assert before.replace(replacement['old_literal'].encode(),replacement['new_literal'].encode(),1)==body;assert body.replace(replacement['new_literal'].encode(),replacement['old_literal'].encode(),1)==before
old_e=(OLD/'evidence.md').read_bytes();new_e=(D/'evidence.md').read_bytes();a=old_e.decode().splitlines(keepends=True);b=new_e.decode().splitlines(keepends=True);changes=[]
for tag,i,j,k,l in difflib.SequenceMatcher(a=a,b=b,autojunk=False).get_opcodes():
 if tag=='equal':assert a[i:j]==b[k:l];continue
 changes.append({'tag':tag,'old_lines_zero_based_half_open':[i,j],'new_lines_zero_based_half_open':[k,l],'new_exact_text':''.join(b[k:l])})
rebuilt=a[:]
for change in reversed(changes):
 i,j=change['old_lines_zero_based_half_open'];rebuilt[i:j]=change['new_exact_text'].splitlines(keepends=True)
assert ''.join(rebuilt).encode()==new_e
recipe=P/'recipes/derived/automation-flow-dispatch-fidelity-v3.json'
header='''# s1.subslice03.automation-flow — correção v3 e corpo corrente integral

Mesmos J1/J2, execução34269cf4-d631-41c5-a30b-85b0ec217390; sem ferramentas e independentes. Não há parecer do outro juiz sobre estes bytes neste pacote. O achado público AF-L2-J2-01 consta da receita de correção; o voto anterior de outro juiz não é retransmitido.

Reutilize seu próprio exame integral de v2 e o predecessor L1 v4 já recebido. O corpo v3 inteiro segue abaixo. Julgue a correção e sua integração com o restante, mantendo a barra pública já recebida (GO-A1–7, GO-I1/2/7/8, QS1–6, CC1/3/7 e AC01 local). Não reabra conteúdo inalterado por rotina; falta obrigatória nova deve ser concreta. Se suficiente, explicite aceite do CORPO INTEIRO CORRENTE v3, e não só da célula corrigida. Binding/runtime, consumidores e entrega têm provas separadas.

A principal conferiu31 inputs integrais e os outputs, capturou o FINAL original antes de reutilizar o autor e leu o corpo integral com todas as mudanças da evidência. Nenhum teste de produto. A única substituição do corpo inverte exatamente para v2; os16442 bytes restantes e a §8 inteira são idênticos. Os24 inputs anteriores continuam com os mesmos bytes, e há7 inputs adicionais de correção/proveniência. O manifesto continua output posterior. O contrato comum e plano público são os mesmos literais já recebidos no lote derived-automation-flow-v2, pacote53852 bytes SHA256617afeacbade05f07406461052aea9e9dbb3ceeaecdc107a5eeda3db4c43a9e6.

A evidência v2 foi recebida integralmente no lote anterior. Para evitar retransmissão do inalterado, este pacote inclui TODOS os segmentos novos/modificados da evidência v3, com coordenadas de linhas0-based e identidades integrais antes/depois. Substituir os ranges antigos pelos textos novos recompõe exatamente a evidência atual; a principal conferiu a igualdade. Isso é uma projeção mecânica declarada, não um novo texto de autoridade ou parecer. Receita v3 é transmitida integralmente. O manifesto/delta completos permanecem no payload; suas identidades e o quadro de novos inputs não são uma afirmação de leitura integral deles pelo juiz.

Decida somente após FIM_DO_LOTE externo. Pendências obrigatórias: disposição explícita de AF-L2-J2-01 e preservação das qualificações AF-L2-PREVIEW-01/02. Nenhum dependente foi liberado.
'''
parts=[header.encode(),'\n## Identidades integrais e delta — projeção mecanica\n\n'.encode(),json.dumps({'before_body':ident(OLD/'body.md'),'current_body':ident(D/'body.md'),'before_evidence':ident(OLD/'evidence.md'),'current_evidence':ident(D/'evidence.md'),'current_manifest':ident(D/'production-manifest.json'),'full_delta':ident(D/'revisions/v3/delta.json'),'body_replacement':replacement,'inverse_body_equality':True,'evidence_reconstruction_equality':True},ensure_ascii=False,indent=2).encode()]
parts += [b'\n\n## BEGIN_CORPO_V3_INTEIRO\n\n',body,b'\n## END_CORPO_V3_INTEIRO\n\n## BEGIN_RECEITA_V3_INTEIRA\n\n',recipe.read_bytes(),b'\n## END_RECEITA_V3_INTEIRA\n']
for i,c in enumerate(changes,1):
 parts.append(('\n## EVIDENCIA_DELTA_'+str(i)+' '+json.dumps({k:v for k,v in c.items() if k!='new_exact_text'},ensure_ascii=False)+'\n\nBEGIN_NEW_EXACT_TEXT\n').encode()+c['new_exact_text'].encode()+b'\nEND_NEW_EXACT_TEXT\n')
parts.append('\n## Novos inputs — projeção do manifesto posterior\n\n'.encode())
for u in added:parts.append((json.dumps({k:u[k] for k in ['local_path','bytes','sha256','git_blob_sha','role']},ensure_ascii=False)+'\n').encode())
packet=b''.join(parts);lot='derived-automation-flow-v3-delta';dest=W/'review-packets'/ (lot+'.md');assert not dest.exists();dest.write_bytes(packet)
meta={'schema':'s1-03-derived-delta-review-packet/v1','lot':lot,'artifact':'s1.subslice03.automation-flow','layer':2,'version':'v3','bytes':len(packet),'sha256':H(packet),'git_blob_sha':G(packet),'body_bytes':len(body),'body_sha256':H(body),'body_sent_complete':True,'unchanged_context_reuse':'Prior exact v2 review packet and own decision only; no other-judge vote','evidence_changed_segments_complete':True,'evidence_reconstruction_matches':True,'changed_evidence_segment_count':len(changes),'added_inputs':len(added),'retained_inputs':len(previous),'full_verification_receipt':'payload/receipts/derived-automation-flow-v3-verification.json','full_alternative_packet_not_dispatched':'review-packets/derived-automation-flow-v3.md','dispatch_state':'NOT_YET_DISPATCHED'};dest.with_suffix('.manifest.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n');print(json.dumps(meta,ensure_ascii=False))
