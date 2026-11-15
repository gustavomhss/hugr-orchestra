"""Directed literal support evidence, exact reuse and independent structural receipt."""
import hashlib,json,re
from pathlib import Path
from collections import Counter
ROOT=Path('/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390')
OUT=ROOT/'producers/boundaries';V2=OUT/'revisions/support-v2'
sha=lambda b:hashlib.sha256(b).hexdigest()
blob=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def ident(p):
 b=p.read_bytes();return {'path':str(p.relative_to(OUT)),'bytes':len(b),'sha256':sha(b),'git_blob_sha':blob(b)}
def dump(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
caps=json.loads((OUT/'captures.json').read_text());registry={}
for c in caps:registry[c['path']]={'local_path':c['capture_path'],'source_path':c['path'],'commit':c['commit'],'sha256':c['sha256'],'git_blob_sha':c['git_blob_sha'],'bytes':c['byte_length']}
def register(key,local,source=None,commit=None,extra=None):
 p=OUT/local;b=p.read_bytes();registry[key]={'local_path':local,'source_path':source or local,'commit':commit,'bytes':len(b),'sha256':sha(b),'git_blob_sha':blob(b),**(extra or {})}
register('independent-receipt','revisions/support-v2/inputs/independent-support-structure.json','payload/receipts/independent-support-structure.json')
register('independent-procedure','revisions/support-v2/inputs/verify-support-structure.py','scripts/verify-support-structure.py')
register('history-a4','inputs-effective/history/a4-dossier.md','modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/review-packets/l1-a4-v1-dossier.md','a8df22ae3a140c58c63f62ce2a634c84f415c943')
register('erratum','shared-reconciliation-2.delta.md')
register('coverage-v2','coverage-v2.jsonl')
receipt_bytes=(OUT/registry['independent-receipt']['local_path']).read_bytes()
assert sha(receipt_bytes)=='d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb'
receipt=json.loads(receipt_bytes)
member=receipt['tar']['package_json_exact_utf8'].encode()
assert sha(member)==receipt['tar']['package_json_sha256'] and len(member)==receipt['tar']['package_json_bytes']
(V2/'inputs/vendor-package-metadata.json').write_bytes(member)
register('vendor-member','revisions/support-v2/inputs/vendor-package-metadata.json','packages/core/vendor/hugr-lean-0.4.0-0660c2b5dc92.tgz!package/package.json',registry['packages/core/vendor/hugr-lean-0.4.0-0660c2b5dc92.tgz']['commit'],{'provenance':'Exact metadata bytes recovered from principal independent receipt; no archive unpack to execution path.'})

class Writer:
 def __init__(self):self.data=bytearray();self.index=[]
 def put(self,s):self.data.extend(s.encode() if isinstance(s,str) else s)
 def literal_bytes(self,eid,key,a,b,reqs,extra=None):
  m=registry[key];raw=(OUT/m['local_path']).read_bytes();ex=raw[a:b]
  first=raw[:a].count(b'\n')+1;last=first+ex.count(b'\n')-(1 if ex.endswith(b'\n') else 0)
  rec={'id':eid,'requests':reqs,**m,'source_start_byte':a,'source_end_byte_exclusive':b,'first_line':first,'last_line':last,'excerpt_sha256':sha(ex),'excerpt_bytes':len(ex),**(extra or {})}
  self.put(f'\n### {eid} — `{m["source_path"]}` {first}–{last}\n\nCommit `{m["commit"] or "LOCAL_OR_INDEPENDENT_RECORD"}`; blob `{m["git_blob_sha"]}`; SHA256 integral `{m["sha256"]}`. Bytes fonte {len(raw)}; recorte [{a}, {b}); SHA256 trecho `{sha(ex)}`.\n\n`````text\n')
  rec['output_excerpt_start_byte']=len(self.data);self.put(ex);rec['output_excerpt_end_byte_exclusive']=len(self.data)
  if not ex.endswith(b'\n'):self.put('\n')
  self.put('`````\n');self.index.append(rec)
 def literal(self,eid,key,a,b,reqs,extra=None):
  raw=(OUT/registry[key]['local_path']).read_bytes();ls=raw.splitlines(keepends=True)
  if b is None:b=len(ls)
  assert 1<=a<=b<=len(ls),(eid,key,a,b,len(ls))
  self.literal_bytes(eid,key,sum(map(len,ls[:a-1])),sum(map(len,ls[:b])),reqs,extra)

review=(OUT/'evidence-review.md').read_bytes();received=[x for x in json.loads((OUT/'records/evidence-review-index.json').read_text()) if x['body']=='bodies/support.md']
assert len(received)==36 and received[0]['id']=='R042' and received[-1]['id']=='R077'
reuse=[];old_by_path={}
for x in received:
 m=registry[x['path']];raw=(OUT/m['local_path']).read_bytes();ls=raw.splitlines(keepends=True)
 a=sum(map(len,ls[:x['first_line']-1]));b=sum(map(len,ls[:x['last_line']]));ex=raw[a:b]
 start=review.index(('## '+x['id']+' ').encode());s=review.index(b'`````text\n',start)+len(b'`````text\n');e=s+len(ex)
 assert review[s:e]==ex and sha(ex)==x['sha256']
 row={'id':x['id'],'path':x['path'],'first_line':x['first_line'],'last_line':x['last_line'],'source_start_byte':a,'source_end_byte_exclusive':b,'excerpt_sha256':sha(ex),'review_start_byte':s,'review_end_byte_exclusive':e,'review_sha256':sha(review)}
 reuse.append(row);old_by_path.setdefault(x['path'],[]).append(row)
def subtract(a,b,old):
 rs=[];cur=a
 for r in sorted(old,key=lambda z:z['first_line']):
  if r['last_line']<cur or r['first_line']>b:continue
  if cur<r['first_line']:rs.append((cur,min(b,r['first_line']-1)))
  cur=max(cur,r['last_line']+1)
  if cur>b:break
 if cur<=b:rs.append((cur,b))
 return rs

# Exact JSON value locations in the independent receipt; no reconstructed fragment
# is represented as literal source bytes.
text=receipt_bytes.decode();decoder=json.JSONDecoder();locations={}
def ws(i):
 while i<len(text) and text[i].isspace():i+=1
 return i
def visit(i,path=()):
 i=ws(i);start=i
 if text[i]=='{':
  i=ws(i+1)
  while text[i]!='}':
   k,end=decoder.raw_decode(text,i);i=ws(end);assert text[i]==':';i=visit(i+1,path+(k,));i=ws(i)
   if text[i]==',':i=ws(i+1)
   else:break
  assert text[i]=='}';i+=1
 elif text[i]=='[':
  i=ws(i+1);n=0
  while text[i]!=']':
   i=visit(i,path+(n,));n+=1;i=ws(i)
   if text[i]==',':i=ws(i+1)
   else:break
  assert text[i]==']';i+=1
 else:_,i=decoder.raw_decode(text,i)
 locations[path]=(len(text[:start].encode()),len(text[:i].encode()));return i
visit(0)
w=Writer();delta=json.loads((V2/'delta.json').read_text());cd=json.loads((OUT/'coverage-v2.delta.json').read_text())
w.put('# Suplemento support 1 — correções e RE-SUP-01..05\n\n'
 'Produtor original `/root/boundaries_l1`; pedidos públicos J1/J2 lidos integralmente e preservados. Nenhum oracle ou outro parecer reservado foi consultado. '
 'Estado: resposta a FIX-FIRST/REQUEST_EVIDENCE, com três precisões autorizadas; nenhuma decisão de aceite atribuída pelo produtor.\n\n'
 f'Corpo v1 `{delta["from"]["sha256"]}` ({delta["from"]["bytes"]} bytes); corpo v2 `{delta["to"]["sha256"]}` ({delta["to"]["bytes"]} bytes). '
 'Original, receita, resposta e coverage v1 estão preservados em `revisions/support-v1/`.\n')
for op in delta['operations']:
 w.put('\n## '+op['id']+' — delta literal autorizado\n\nAnterior:\n\n`````text\n'+op['old']+'\n`````\n\nNovo:\n\n`````text\n'+op['new']+'\n`````\n')
w.put('\n## Erratum compartilhado de duas razões de coverage\n\nO original e o bloco compartilhado já congelado permanecem intactos. Só README e omni-expect recebem nova razão, em arquivo v2 separado.\n')
w.literal('SUP-COVERAGE-ERRATUM','erratum',1,None,['RE-SUP-01'])
w.put('\n## Plano de reuso do que J1/J2 já receberam\n\nR042–R077, I01 e S29 foram reconhecidos nos pedidos públicos. Os ramos abaixo complementam esses recortes. '
 'O comentário de omni-expect é intenção; a correção escolhe a descrição limitada da janela, não tenta provar exclusividade com uma integração de runner não exibida. Não se afirma falha real.\n\n'
 '| R | Fonte / linhas | Offset na fonte | SHA256 trecho | Offset em evidence-review.md |\n|---|---|---|---|---|\n')
for x in reuse:w.put(f'| {x["id"]} | `{x["path"]}` {x["first_line"]}–{x["last_line"]} | [{x["source_start_byte"]}, {x["source_end_byte_exclusive"]}) | `{x["excerpt_sha256"]}` | [{x["review_start_byte"]}, {x["review_end_byte_exclusive"]}) |\n')
shared=json.loads((OUT/'suplemento-boundaries-1.index.json').read_text())['common_reconciliation']
w.put('\n## RE-SUP-01 — População/herança reutilizadas e fatos estruturais independentes\n\n'
 'O bloco `shared-reconciliation-1.md` deve ser transportado uma única vez no lote boundaries; é reutilizado aqui sem duplicação. '
 f'SHA256 `{shared["identity"]["sha256"]}`, {shared["identity"]["bytes"]} bytes. Está integralmente em `suplemento-boundaries-1.md` nos bytes [{shared["supplement_start_byte"]}, {shared["supplement_end_byte_exclusive"]}). '
 'A principal deve manter esse bloco no contexto do par para este reuso; a referência não afirma entrega já concluída pelo produtor.\n\n'
 'Esse bloco fornece as 24 linhas originais completas e a projeção individual dos 104 paths (path/read_depth/role/rationale), com identidade do JSONL, composição 9/3/12/80, históricos boundaries/entry/manifest, 1441/2236, e os campos literais 2+102/4+20 da projeção original. '
 'O erratum acima substitui somente duas razões; `coverage-v2.jsonl` conserva 128 linhas e todos os outros bytes de linha. Os 104 continuam no artefato `s1.subslice03.support`, need `entry`; os 24 continuam em `s1.core.boundaries`, need `component`.\n\n'
 '### Verificação independente da principal\n\n'
 'O recibo tem 58.492 bytes, SHA256 `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. '
 'Ele liga seis inputs aos blobs/SHA/bytes capturados. Confirmou 437 exports sem raiz/wildcard; 63 tables, 637 columns, 59 fks, 63 pks, 52 indexes, 3 uniques e 1 check; 191 membros no tar. '
 'O escopo do resultado é estrutural; o próprio recibo mantém semantic_acceptance NOT_ASSIGNED e product_execution NOT_RUN. O procedimento foi lido, não reexecutado por este produtor.\n')
w.literal('MECH-PROCEDURE','independent-procedure',1,None,['RE-SUP-01'])
for n,path in enumerate([('method',),('sources',),('schema_snapshot',),('zip_fixture',),('status',),('semantic_acceptance',),('product_execution',)],1):
 a,b=locations[path];w.literal_bytes('MECH-RECEIPT-'+str(n),'independent-receipt',a,b,['RE-SUP-01'],{'json_path':list(path)})
# Compact literal package prefix: count/absence are source values, export selection
# is cited from the actual keys rather than reprinting the entire 437-key list.
pa,_=locations[('package',)];pb=locations[('package','exports_keys')][0]
raw_prefix=receipt_bytes[pa:pb];end=raw_prefix.rfind(b'"exports_keys"')
w.literal_bytes('MECH-PACKAGE-COUNTS','independent-receipt',pa,pa+end,['RE-SUP-01'])
selected_export_names={'./atlas','./relay','./control-plane/move-session','./rag-studio/sql','./test/fixture/omni-expect','./test/lib/effect'}
for n,key in enumerate(receipt['package']['exports_keys']):
 if key in selected_export_names:
  a,b=locations[('package','exports_keys',n)];w.literal_bytes('MECH-EXPORT-'+str(n),'independent-receipt',a,b,['RE-SUP-01'],{'export_key':key})
w.literal('MECH-TAR-PACKAGE-JSON','vendor-member',1,None,['RE-SUP-01'])
for n,m in enumerate(receipt['tar']['members']):
 if m['name'] in {'package/package.json','package/LICENSE','package/NOTICE','package/licenses/TRS-MIT.txt'}:
  a,b=locations[('tar','members',n)];w.literal_bytes('MECH-TAR-MEMBER-'+str(n),'independent-receipt',a,b,['RE-SUP-01'],{'member':m['name']})
for fi,f in enumerate(receipt['scip_fixtures']):
 chosen=[(i,z) for i,z in enumerate(f['strings']) if ('@orchestra/core' in z['text'] or 'src/main.ts' in z['text'] or z['text']=='scip-typescript')][:5]
 w.put('\nSCIP `'+f['path']+'`: strings ASCII apenas; nenhum decode semântico do protocolo. Os offsets abaixo referem-se ao binário capturado.\n')
 for si,z in chosen:
  a,b=locations[('scip_fixtures',fi,'strings',si)];w.literal_bytes(f'MECH-SCIP-{fi}-{si}','independent-receipt',a,b,['RE-SUP-01'],{'binary_path':f['path'],'binary_string_start':z['byte_start'],'binary_string_end_exclusive':z['byte_end_exclusive']})

P='packages/core/';T=P+'test/';F=T+'fixture/'
groups=[
 ('RE-SUP-02','Geradores/configuração: implementação e limites, sem execução',[
  ('CFG-TS',P+'tsconfig.json',[(1,None)]),('CFG-DRIZZLE',P+'drizzle.config.ts',[(1,None)]),('GEN-PTY',P+'script/fix-node-pty.ts',[(1,None)]),
  ('GEN-MIG',P+'script/migration.ts',[(1,36),(59,70),(89,126),(171,196)]),
  ('GEN-PACK',P+'script/toolkit-pack.ts',[(26,149),(151,246),(249,342)]),
  ('GEN-FLOOR',P+'script/toolkit-floors.ts',[(35,119),(122,186),(202,258),(268,317),(319,351)])]),
 ('RE-SUP-03','História adicional: época, intenção, candidatos e exclusões',[
  ('DOC-CTRL','docs/architecture/phase-plans/70-90-briefs/RD-CTRLPLANE.md',[(1,17),(36,77)]),
  ('DOC-SESSION','docs/architecture/phase-plans/70-90-briefs/RD-SESSION.md',[(1,17),(36,79)]),
  ('DOC-PLAN','docs/specs/runtime-closure/PLAN.md',[(1,40),(115,167)]),
  ('DOC-SNAPSHOT','docs/specs/runtime-closure/SNAPSHOT-QUALIFICATION.md',[(1,31),(57,87)]),
  ('DOC-WAVE','docs/specs/runtime-closure/WAVE-2.md',[(1,25),(44,73)]),
  ('DOC-CHANGE','docs/specs/v2/schema-changelog.md',[(1,84)]),
  ('DOC-MIG-HISTORY','history-a4',[(2151,2177)])]),
 ('RE-SUP-04','Actions, capability, distribuição, packaging e upstream: contratos dirigidos',[
  ('FX-ACTIONS-CLI',F+'actions-cli.ts',[(1,None)]),('FX-ACTIONS-HTTP',F+'actions-http.ts',[(1,None)]),
  ('FX-ACTIONS-NET',F+'actions-network.ts',[(16,34),(34,96),(113,147)]),
  ('FX-ACTIONS-RESOURCE',F+'actions-resource-runtime.ts',[(10,88),(118,121)]),
  ('FX-ACTIONS-CAPTURE',F+'actions-transport.ts',[(88,115)]),
  ('FX-GH-COMMAND',F+'github-command.ts',[(52,126)]),('FX-GH-CLI',F+'github-command-cli.ts',[(1,None)]),
  ('FX-GH-READCLI',F+'github-read-cli.ts',[(1,None)]),('FX-GIT',F+'git.ts',[(1,None)]),
  ('FX-CAP-ARTIFACTS',F+'capability-artifacts.ts',[(27,72)]),
  ('FX-CAP-CHANNEL',F+'capability-channel.ts',[(35,82),(235,259),(299,337)]),
  ('FX-CAP-CHILDREN',F+'capability-children.ts',[(30,81)]),
  ('FX-CAP-MANAGEMENT',F+'capability-connection-management.ts',[(43,80),(108,147)]),
  ('FX-CAP-SQL',F+'capability-connection-setup-sql.ts',[(13,58)]),
  ('FX-CAP-SETUP',F+'capability-connection-setup.ts',[(19,64),(117,125)]),
  ('FX-CAP-DISCOVERY',F+'capability-discovery.ts',[(46,96),(120,151)]),
  ('FX-CAP-MCP',F+'capability-mcp.ts',[(11,25),(38,96)]),
  ('FX-CAP-POLICY',F+'capability-policy.ts',[(30,39),(50,95),(97,130)]),
  ('FX-CAP-PROCESS',F+'capability-process-control.ts',[(43,96)]),
  ('FX-CAP-SCHEDULE',F+'capability-schedule.ts',[(53,71),(86,96)]),
  ('FX-CAP-CALL',F+'capability-service-call.ts',[(52,87),(118,153),(187,212)]),
  ('FX-CAP-SERVICES',F+'capability-services.ts',[(42,60),(79,147)]),
  ('DIST-GATES',T+'distribution-bundle-gates.ts',[(1,None)]),
  ('DIST-DENO',T+'distribution-bundle-deno.test.ts',[(12,64),(79,115),(121,176)]),
  ('DIST-WORKFLOW',T+'distribution-bundle-workflow.test.ts',[(1,40),(75,115)]),
  ('CI-REQUEST',T+'test-ci-request.test.ts',[(152,182),(212,236),(265,295)]),
  ('CI-UPLOAD',T+'test-ci-upload.test.ts',[(79,123),(164,183)]),
  ('CI-CACHE',T+'setup-bun-cache.test.ts',[(28,64),(86,105)]),
  ('CI-CONTROL',T+'test-omni-control.test.ts',[(26,70)]),
  ('PKG-SKILLS',F+'packaged-skills.ts',[(30,82)]),('PKG-SDK',F+'sdk-registry.ts',[(1,None)]),
  ('PKG-RG',F+'ripgrep-release.ts',[(14,36),(42,95)]),
  ('UP-PROOF',F+'upstream-arsenal-proof.ts',[(5,73)]),('UP-REGISTRY',F+'upstream-arsenal-registry.ts',[(7,49)]),
  ('UP-RUNTIME',F+'upstream-arsenal-runtime.ts',[(16,79)]),
  ('UP-PACKAGE',T+'maestro-arsenal-package.test.ts',[(1,15),(95,117)]),
  ('UP-HOST',T+'maestro-arsenal.test.ts',[(36,71),(96,148)]),
  ('UP-OPS',T+'upstream-arsenal.test.ts',[(89,120)]),
  ('UP-SETTLE',T+'upstream-settlement-preservation.test.ts',[(165,215)]),
  ('FX-RECORDING',T+'fixtures/recordings/session-runner/openai-chat-streams-text.json',[(1,None)])]),
 ('RE-SUP-05','Processo e harness: mecanismos/precondições, não resultados executados',[
  ('HAR-OPEN',F+'omni-expect.ts',[(8,12)]),('HAR-IDENTITY',F+'omni-effect.ts',[(1,None)]),
  ('PROC-NONCE',F+'process-tree.ts',[(23,95),(144,218)]),
  ('PROC-WINDOWS',F+'windows-process-query.ts',[(78,118),(184,221)]),
  ('HAR-EFFECT',T+'lib/effect.ts',[(1,40)]),('HAR-REJECTION',T+'lib/rejection.ts',[(1,None)]),
  ('HAR-TMP',F+'tmpdir.ts',[(1,None)]),('HAR-TOOL',T+'lib/tool.ts',[(1,None)]),
  ('HAR-LOCATION',F+'location.ts',[(1,None)]),
  ('HAR-SHARED',T+'shared-schema.test.ts',[(33,59),(167,202)]),
  ('HAR-GOVERNANCE',T+'task-governance.test.ts',[(1,None)]),
  ('PROC-FLOCK',F+'flock-worker.ts',[(23,72)]),('PROC-EFLOCK',F+'effect-flock-worker.ts',[(24,60)]),
  ('PROC-BACKGROUND',T+'background-job.test.ts',[(1,104)]),
  ('PROC-APP',T+'process/process.test.ts',[(31,85),(235,274)]),
  ('PROC-DIALER',T+'fixtures/cassandra-dialer_test.go',[(207,257),(269,302),(330,360)]),
  ('PROC-DIALER-LINUX',T+'fixtures/cassandra-dialer-linux_test.go',[(1,88)])]),
]
resolution=[]
for req,title,items in groups:
 w.put('\n## '+req+' — '+title+'\n\n')
 if req=='RE-SUP-04':w.put('Todos os paths abaixo constam da relação individual de suporte. As treze fixtures capability estão identificadas separadamente; as implementações externas importadas não recebem aceite por essa leitura. Casos CI/distribution e fixtures de provider permanecem NOT_RUN.\n')
 if req=='RE-SUP-05':w.put('Este bloco atende também à lista de helpers de RE-SUP-04 de J2. SUP-F02 foi resolvido por qualificação: nenhuma promessa de exclusividade é inferida do contador. O comentário afterEach permanece intenção até prova de integração do runner; não foi necessário expandir o escopo a uma auditoria de runner.\n')
 for eid,path,ranges in items:
  n=0;raw=(OUT/registry[path]['local_path']).read_bytes();count=len(raw.splitlines())
  for a,b in ranges:
   if b is None:b=count
   assert a<=b<=count,(eid,path,a,b,count)
   old=[x for x in old_by_path.get(path,[]) if x['first_line']<=b and x['last_line']>=a]
   fresh=subtract(a,b,old)
   resolution.append({'request':req,'evidence_family':eid,'path':path,'requested_first_line':a,'requested_last_line':b,'reused':[x['id'] for x in old],'new_intervals':fresh})
   if old:w.put('\nReuso para `'+path+'`: '+', '.join(x['id'] for x in old)+'. Omitidos desses intervalos os bytes já recebidos.\n')
   for c,d in fresh:
    n+=1;reqs=[req]
    if req=='RE-SUP-05':reqs.append('RE-SUP-04')
    w.literal(eid+'-'+str(n),path,c,d,reqs,{'source_execution':'NOT_RUN'})
 # api.html's discussion indication is located from the actual captured bytes,
 # not inferred from a route name.
 if req=='RE-SUP-03':
  path='docs/specs/v2/api.html';ls=(OUT/registry[path]['local_path']).read_text().splitlines()
  found=[i for i,l in enumerate(ls,1) if 'Needs team discussion' in l]
  assert found
  for n,i in enumerate(found[:3],1):w.literal('DOC-API-DISCUSSION-'+str(n),path,max(1,i-4),min(len(ls),i+4),['RE-SUP-03'])

# Per-path pointers make grouped fixture proof and population reconciliation
# concrete without duplicating source capture identities for all 128 files.
coverage=[json.loads(x) for x in (OUT/'coverage-v2.jsonl').read_text().splitlines()]
proof_by_path={}
for ent in w.index:proof_by_path.setdefault(ent['source_path'],[]).append(ent['id'])
mapping=[]
for x in coverage:
 if x['legacy_artifact_key']!='s1.core.entry':continue
 mapping.append({'path':x['path'],'read_depth':x['read_depth'],'role':x['role'],'reason':x['reason'],'new_evidence_ids':proof_by_path.get(x['path'],[]),'prior_received_ids':[z['id'] for z in old_by_path.get(x['path'],[])],'population_location':'shared-reconciliation-1.md relation104 + shared-reconciliation-2.delta.md for two reasons','identity_manifest':'captures.json'})
w.put('\n## Encerramento probatório e inputs\n\n'
 'A evidência nova complementa os trechos reconhecidos, com identificação por path no índice. A população é a mesma 104+24, sem recontagem inflacionada por auxiliares. '
 'Os três deltas e duas razões estão isolados; histórico e proposta não foram reescritos. Inputs históricos integrais A3/A4/projection permanecem efetivos conforme `effective-inputs.json`; o arquivo 726.892 bytes não foi recortado/reclassificado para contornar limite nativo. '
 'O recibo independente e seu procedimento são novas entradas probatórias desta revisão. Status estrutural do recibo não promove suficiência semântica, operação ou união. A decisão é do mesmo par.\n')
supp=OUT/'suplemento-support-1.md';supp.write_bytes(w.data)
for ent in w.index:
 raw=(OUT/ent['local_path']).read_bytes();ex=raw[ent['source_start_byte']:ent['source_end_byte_exclusive']]
 assert sha(raw)==ent['sha256'] and blob(raw)==ent['git_blob_sha']
 assert sha(ex)==ent['excerpt_sha256'] and len(ex)==ent['excerpt_bytes']
 assert bytes(w.data[ent['output_excerpt_start_byte']:ent['output_excerpt_end_byte_exclusive']])==ex
idx={'supplement':ident(supp),'candidate':ident(OUT/'bodies/support.md'),'offsets':'zero-based UTF-8 byte offsets, end exclusive','public_requests':[ident(V2/'inputs'/j) for j in ['j1-response.md','j2-response.md']],'reused_received':reuse,'shared_reconciliation':shared,'shared_erratum':ident(OUT/'shared-reconciliation-2.delta.md'),'request_resolution':resolution,'literal_entries':w.index,'support_path_mapping':mapping,'independent_receipt':ident(V2/'inputs/independent-support-structure.json'),'independent_procedure':ident(V2/'inputs/verify-support-structure.py'),'semantic_status':'PENDING_SAME_PAIR_REEVALUATION','product_execution':'NOT_RUN'}
dump(OUT/'suplemento-support-1.index.json',idx)
summary={'supplement':ident(supp),'index':ident(OUT/'suplemento-support-1.index.json'),'literal_entries':len(w.index),'reused_received_count':len(reuse),'new_source_path_count':len(proof_by_path),'support_population_paths':len(mapping),'capability_fixture_paths_with_new_evidence':len([p for p in proof_by_path if p.startswith(F+'capability-')]),'all_excerpt_hashes_offsets_verified':True,'mechanical_receipt_identity_verified':True,'source_tests':'NOT_RUN','semantic_acceptance':'PENDING_JUDGES'}
assert summary['support_population_paths']==104 and summary['capability_fixture_paths_with_new_evidence']==13
dump(V2/'supplement-verification.json',summary)
print(json.dumps(summary,ensure_ascii=False))
