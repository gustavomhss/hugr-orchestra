from pathlib import Path
import json,hashlib,datetime,shutil
W=Path(__file__).resolve().parents[1];P=W/'payload';R='producers/boundaries/revisions/boundaries-v3';D=W/R
H=lambda b:hashlib.sha256(b).hexdigest();G=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
j=json.loads((D/'delta.json').read_text());before=(D/'history/body.md').read_bytes();after=(W/j['current_body']['path']).read_bytes();assert before==(P/'producers/boundaries/bodies/boundaries.md').read_bytes();out=before
for op in j['operations']:
 a=op['before'].encode();z=op['after'].encode();assert before[op['before_start_byte']:op['before_end_byte_exclusive']]==a;assert after[op['after_start_byte']:op['after_end_byte_exclusive']]==z;assert out.count(a)==1;out=out.replace(a,z,1)
assert out==after
rev=after
for op in reversed(j['operations']):rev=rev.replace(op['after'].encode(),op['before'].encode(),1)
assert rev==before
for s in j['unchanged_segments']:
 a=before[s['before_start_byte']:s['before_end_byte_exclusive']];z=after[s['after_start_byte']:s['after_end_byte_exclusive']];assert a==z and H(a)==s['sha256']
for row,b in [(j['prior_body'],before),(j['current_body'],after)]:assert len(b)==row['bytes'] and H(b)==row['sha256'] and G(b)==row['git_blob_sha']
manifest=json.loads((D/'input-manifest-extension.json').read_text());aliases={r['path']:r['stable_alias']['path'] for r in manifest['changed_in_place_aliases']};units=manifest['new_dispatch_whole_file_reads']+manifest['procedure_inputs'];verified=[]
for u in units:
 p=W/aliases.get(u['path'],u['path']);b=p.read_bytes();assert len(b)==u['bytes'] and H(b)==u['sha256'] and G(b)==u['git_blob_sha'];verified.append({'read_path':u['path'],'retained_path':str(p.relative_to(W)),**{k:u[k] for k in ['bytes','sha256','git_blob_sha']}})
supp=(D/'review-supplement.md').read_bytes();ix=json.loads((D/'review-supplement.index.json').read_text())
for e in ix['literal_entries']:
 raw=(W/e['input_path']).read_bytes();ident=e['source_identity'];assert len(raw)==ident['bytes'] and H(raw)==ident['sha256'] and G(raw)==ident['git_blob_sha'];ex=raw[e['source_start_byte']:e['source_end_byte_exclusive']];assert ex==b''.join(raw.splitlines(keepends=True)[e['first_line']-1:e['last_line']]);assert ex==supp[e['supplement_start_byte']:e['supplement_end_byte_exclusive']];assert H(ex)==e['excerpt_sha256']
freeze=json.loads((D/'procedure-freeze.json').read_text());pv=json.loads((D/'producer-verification.json').read_text());assert freeze['frozen_at_utc']<pv['actual_order'][0]['utc'];assert pv['procedure_invocations_in_this_dispatch']==1
for rel,sha in [('producers/boundaries/bodies/support.md','498a0454418a14977b9b2f4c4f515711d941b6d4bbece13f1baaa8feaa76d378'),('producers/boundaries/union-navigation-proposal.md','f4362077ed7eb2f0dff7bb76acd60debeaa41bd37886551977b92c02addfcb6e')]:assert H((W/rel).read_bytes())==sha
receipt={'schema':'s1-03-root-minimal-correction-verification/v1','artifact':'s1.core.boundaries','version':3,'at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'prior_body':j['prior_body'],'current_body':j['current_body'],'exact_literal_replacements':2,'unchanged_segments':3,'inverse_byte_identical':True,'literal_source_excerpts_verified':4,'new_dispatch_and_procedure_units':verified,'prior_audited_input_count':60,'prior_lineage_retained':True,'freeze_precedes_execution':True,'producer_reported_invocations':1,'support_union_unchanged':True,'semantic_result':'PENDING_SAME_PAIR','runtime_result':'NOT_RUN'}
rc=P/'receipts/boundaries-l1-v3-principal-verification.json';assert not rc.exists();rc.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
for src in D.rglob('*'):
 if src.is_file():
  dest=P/src.relative_to(W);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest)
shutil.copyfile(W/j['current_body']['path'],P/j['current_body']['path'])
header=f'''# Reavaliação de consistência L1 — boundaries v3\n\nMesmo juiz nativo independente, sem ferramentas; nenhuma opinião atual do outro juiz incluída. Execução 34269cf4-d631-41c5-a30b-85b0ec217390.\n\nArtefato completo: s1.core.boundaries L1, need component; corpo atual {len(after)} bytes, SHA256 {H(after)}, Git blob {G(after)}. O corpo v2 completo anteriormente recebido tem SHA256 {H(before)}; são exatamente duas substituições abaixo, com três segmentos restantes idênticos e inversa integral verificados pela principal. Reutilize seu juízo sobre o restante inalterado, julgue estes dois deltas contra a fonte literal e emita conclusão explícita sobre o corpo inteiro v3.\n\nA conferência da principal depois do L2 identificou estas duas imprecisões também no L1 antes aceito; não atribua ao predecessor uma qualificação que seus bytes antigos não continham. Os pareceres anteriores ficam históricos, intactos. Este lote reabre e corrige somente esses achados de fidelidade (QS-1, CC-3, GO-A1 e suficiência local AC-01); os demais critérios públicos e limites de runtime permanecem os já fornecidos. Não é pedido de binding, consumidor, manutenção, union ou PASS operacional. Não avalia ainda o L2, cujo novo predecessor dependerá deste gate.\n\nProcedimento real apply.py SHA256 {H((D/'apply.py').read_bytes())}, congelado em {freeze['frozen_at_utc']} antes da invocação {pv['actual_order'][0]['utc']}. Receita/root request congelados antes do despacho, todas as {len(units)} unidades integrais deste despacho e procedimento conferidas; o fechamento anterior de 60 inputs permanece herdado. O novo manifesto é saída descritiva, não receita retroativa. Support/union conferidos intactos. Recibo da principal: receipts/boundaries-l1-v3-principal-verification.json.\n\n## Suplemento literal do produtor\n\n'''
packet=header.encode()+supp
name='l1-consistency-boundaries-v3';p=W/'review-packets'/f'{name}.md';assert not p.exists();p.write_bytes(packet)
mi={'schema':'s1-03-minimal-review-packet/v1','lot':name,'artifact':'s1.core.boundaries','version':3,'bytes':len(packet),'sha256':H(packet),'git_blob_sha':G(packet),'body_bytes':len(after),'body_sha256':H(after),'body_git_blob_sha':G(after),'dispatch_state':'NOT_YET_DISPATCHED','root_verified':True}
p.with_suffix('.manifest.json').write_text(json.dumps(mi,ensure_ascii=False,indent=2)+'\n')
f=P/'receipts/l1-consistency-correction-dispatches.json';ds=json.loads(f.read_text());row=next(x for x in ds['calls'] if x['artifact']=='s1.core.boundaries');row.update(state='COMPLETED_FOR_REVIEW',producer_response=R+'/response.md',producer_response_sha256=H((D/'response.md').read_bytes()),dispatch_message=R+'/dispatch-message.txt',dispatch_message_sha256=H((D/'dispatch-message.txt').read_bytes()));f.write_text(json.dumps(ds,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(mi,ensure_ascii=False))
