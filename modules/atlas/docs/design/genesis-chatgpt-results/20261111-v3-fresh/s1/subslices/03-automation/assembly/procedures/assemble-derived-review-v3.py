"""Verify and stage one delivered derived artifact, preserving exact review literals."""
from pathlib import Path
import sys,json,hashlib,datetime,re,shutil
W=Path(__file__).resolve().parents[1]; P=W/'payload'
key=sys.argv[1];version=sys.argv[2] if len(sys.argv)>2 else 'v1'
slug=key.removeprefix('s1.subslice03.');d=W/('producers/derived-'+slug)
manifest=json.loads((d/'production-manifest.json').read_text())
assert manifest['artifact']['key']==key
H=lambda b:hashlib.sha256(b).hexdigest()
G=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
if 'inputs' in manifest:
 units=manifest['inputs']
elif manifest.get('schema')=='s1-03-derived-production-manifest/v1' and manifest['artifact']['key']=='s1.subslice03.entry':
 units=manifest['actual_inputs']
else:
 raise AssertionError('Unrecognized actual input manifest schema')
seen=set(); verified=[]
for u in units:
 path=u['local_path']; assert path not in seen;seen.add(path)
 b=(W/path).read_bytes();b.decode('utf-8')
 assert len(b)==u.get('byte_length',u.get('bytes')) and H(b)==u['sha256'] and G(b)==u.get('calculated_git_blob_sha',u.get('git_blob_sha')),path
 verified.append({'local_path':path,'byte_length':len(b),'sha256':H(b),'calculated_git_blob_sha':G(b),'role':u['role']})
for u in manifest['outputs']:
 b=(W/u['local_path']).read_bytes();b.decode('utf-8')
 if u.get('sha256'):assert H(b)==u['sha256'] and len(b)==u.get('byte_length',u.get('bytes')) and G(b)==u.get('calculated_git_blob_sha',u.get('git_blob_sha'))
body=(d/'body.md').read_bytes(); headings=re.findall(r'^## (.+)$',body.decode(),flags=re.M)
assert len(headings)==len(set(headings)) and headings
if 'effective_authoring_recipe' in manifest:
 recipe_record=manifest['effective_authoring_recipe']['task_recipe']
elif 'actual_authoring_recipe' in manifest:
 recipe_record=manifest['actual_authoring_recipe']['task_recipe']
elif 'actual_recipe' in manifest:
 recipe_record=manifest['actual_recipe']['per_task']
elif manifest.get('schema')=='s1-03-derived-production-manifest/v1' and manifest['artifact']['key']=='s1.subslice03.entry':
 recipe_record=manifest['effective_recipe']['per_task_recipe']
else:
 raise AssertionError('Unrecognized effective recipe manifest schema')
recipe_path=W/recipe_record['local_path']
recipe=recipe_path.read_bytes(); common=(P/'recipes/derived-contract.json').read_bytes(); public_plan=(P/'artifact-plan.json').read_bytes()
assert any(u['local_path']=='payload/artifact-plan.json' and u['sha256']==H(public_plan) for u in units), 'Do not introduce a new author plan during review.'
outputs=[]
for f in sorted(d.rglob("*")):
 assert not f.is_symlink(),f
 if f.is_dir():continue
 assert f.is_file(),f
 b=f.read_bytes();dest=P/f.relative_to(W);dest.parent.mkdir(parents=True,exist_ok=True)
 if dest.exists():assert dest.read_bytes()==b,'Preserve previous output before changing an existing staged version'
 else:dest.write_bytes(b)
 outputs.append({'path':str(f.relative_to(W)),'bytes':len(b),'sha256':H(b),'git_blob_sha':G(b)})
receipt={'schema':'s1-03-derived-mechanical-verification/v1','at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'artifact':manifest['artifact'],'version':version,'checks':'Exact whole-file sizes/SHA256/Git blobs for every declared actual input and output; UTF-8, JSON and unique depth2 headings. No semantic, runtime or product-test result.','input_units':verified,'input_count':len(verified),'body_bytes':len(body),'body_sha256':H(body),'body_git_blob_sha':G(body),'depth2_headings':headings,'output_files':outputs,'recipe_sha256':H(recipe),'production_manifest_sha256':H((d/'production-manifest.json').read_bytes()),'producer_reporting_limit':'The author reports complete reads and exact allowed file access; this does not assert an operating-system sandbox or expose private reasoning.','author_file_read_declaration':manifest.get('input_counts'),'semantic_status':'PENDING_SAME_PAIR'}
rp=P/('receipts/derived-'+slug+'-'+version+'-verification.json');assert not rp.exists();rp.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
lot='derived-'+slug+'-'+version
parts=[]
parts.append((f'# {key} — revisão semântica L{manifest["artifact"]["layer"]} {version}\n\n'
 'Execução34269cf4-d631-41c5-a30b-85b0ec217390. Mesmos J1/J2, independentes, sem ferramentas. Material literal termina apenas no FIM_DO_LOTE externo. Nenhum voto do outro juiz sobre este candidato foi emitido ou incluído neste pacote. Metadados de gate na receita/evidência referem-se exclusivamente ao predecessor já aceito.\n\n'
 f'Candidato: {key}, {len(body)} bytes, SHA256 {H(body)}, Git blob {G(body)}. '
 'Reutilize seus próprios pareceres e os bytes exatos dos predecessores indicados, já recebidos. Não reabrir por rotina conteúdo inalterado nem inferir aceite do novo corpo a partir do anterior.\n\n'
 'Aplicar todos os critérios públicos pertinentes já recebidos, em especial GO-A1–7, GO-I1/2/7/8, QS-1–6, CC-1/3/7 e a suficiência local AC-01; demais obrigações operacionais mantêm provas próprias. Julgar o corpo inteiro e a fidelidade ao predecessor, utilidade da camada, limites de autoridade, interpretação, navegação versus build e receita/proveniência. Emitir PASS, FIX-FIRST ou REQUEST_EVIDENCE com falta obrigatória concreta; sugestão opcional não amplia a barra. Não emitir binding Atlas, consumidor, manutenção ou entrega completa.\n\n'
 f'A principal conferiu deterministicamente os {len(verified)} inputs declarados e os outputs, seus tamanhos/SHA256/blobs; receita congelada antes do dispatch; predecessor gate verificado antes da autoria. Corpo e evidência foram lidos integralmente. Nenhum teste de produto foi executado. Recibo {rp.relative_to(P)}. A tabela abaixo é projeção mecânica identificada do manifesto posterior, não texto da receita anterior nem nova autoridade semântica.\n\n').encode())
for label,raw in [('CORPO_EXATO',body),('EVIDENCIA_EXATA',(d/'evidence.md').read_bytes()),('RECEITA_DE_TAREFA_EXATA',recipe),('RECEITA_COMUM_EXATA',common),('PLANO_PUBLICO_EXATO',public_plan)]:
 parts.append(f'\n## BEGIN_{label}\n\n'.encode()+raw+f'\n## END_{label}\n'.encode())
table='\n## Inputs reais — projeção mecânica do manifesto\n\n| Path local | Bytes | SHA256 | Papel declarado |\n| --- | ---: | --- | --- |\n'
for u in verified:table+='| '+u['local_path']+' | '+str(u['byte_length'])+' | '+u['sha256']+' | '+u['role'].replace('|',' / ')+' |\n'
table+=f'\nManifesto original posterior: {d.relative_to(W)}/production-manifest.json; {(d/"production-manifest.json").stat().st_size} bytes; SHA256 {H((d/"production-manifest.json").read_bytes())}. Ele permanece integral no payload, mas sua totalidade não é retransmitida aqui. Conteúdo declarativo de uso não substitui seu juízo.\n\nDecida somente após FIM_DO_LOTE externo.\n'
parts.append(table.encode());packet=b''.join(parts)
q=W/('review-packets/'+lot+'.md');assert not q.exists();q.write_bytes(packet)
meta={'schema':'s1-03-derived-review-packet/v1','lot':lot,'artifact':key,'layer':manifest['artifact']['layer'],'bytes':len(packet),'sha256':H(packet),'git_blob_sha':G(packet),'body_bytes':len(body),'body_sha256':H(body),'literal_files':[{'label':label,'bytes':len(raw),'sha256':H(raw)} for label,raw in [('body',body),('evidence',(d/'evidence.md').read_bytes()),('task_recipe',recipe),('common_recipe',common),('public_plan',public_plan)]],'input_table':'Explicit mechanical projection of actual manifest; original remains preserved.','dispatch_state':'NOT_YET_DISPATCHED'}
q.with_suffix('.manifest.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(meta,ensure_ascii=False))
