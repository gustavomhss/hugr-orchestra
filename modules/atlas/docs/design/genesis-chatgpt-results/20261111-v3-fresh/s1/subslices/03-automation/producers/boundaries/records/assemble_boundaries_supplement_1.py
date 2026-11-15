"""Assemble public evidence requested by J1/J2, preserving input identities and v1."""
import hashlib,json,re
from collections import Counter
from pathlib import Path
ROOT=Path('/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390')
OUT=ROOT/'producers/boundaries'; V2=OUT/'revisions/boundaries-v2'
SOURCE='1cde2ff7a71bcf7aecb5d030917b577165135d38'; HISTORY='a8df22ae3a140c58c63f62ce2a634c84f415c943';KIT='70234d541a9a3539935ef16f19e33c8f2d5f30ec'
sha=lambda b:hashlib.sha256(b).hexdigest()
blob=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def dump(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def identity(p):
 b=p.read_bytes();return {'path':str(p.relative_to(OUT)),'sha256':sha(b),'git_blob_sha':blob(b),'bytes':len(b)}

caps=json.loads((OUT/'captures.json').read_text()); capmap={x['path']:x for x in caps}
registry={}
for c in caps:
 p=OUT/c['capture_path'];b=p.read_bytes();assert sha(b)==c['sha256'] and blob(b)==c['git_blob_sha']
 registry[c['path']]={'local_path':c['capture_path'],'source_path':c['path'],'commit':c['commit'],'sha256':sha(b),'git_blob_sha':blob(b),'bytes':len(b)}
input_manifest=json.loads((ROOT/'inputs/inputs.json').read_text())
effective_root=OUT/'inputs-effective';effective_root.mkdir(exist_ok=True)
full_history=[]
for name,fragment in [('a3-dossier.md','a3-v1-dossier'),('a4-dossier.md','a4-v1-dossier'),('coverage-needs-projection.json','coverage-needs-projection')]:
 b=(ROOT/'inputs/history'/name).read_bytes()
 m=next(x for x in input_manifest['decisive_history'] if fragment in x['path'])
 assert blob(b)==m['git_blob_sha'] and len(b)==m['byte_length']
 p=effective_root/'history'/name;p.parent.mkdir(exist_ok=True);p.write_bytes(b)
 key='history-input:'+name
 registry[key]={'local_path':str(p.relative_to(OUT)),'source_path':m['path'],'commit':m['commit'],'sha256':sha(b),'git_blob_sha':blob(b),'bytes':len(b)}
 full_history.append({**registry[key],'role':'effective_full_historical_input','read_mode':'selected relevant ranges/records from the original whole file','file_identity_unit':'whole original file, not the excerpt or projection','needed_for':['s1.core.boundaries','s1.subslice03.support'],'rationale':'Explicit claims of historical reuse, predecessor scope and inherited coverage depend on this actual input.'})
mandatory=['COMMON.md','mission.json','inputs.json','AGENTS.md','SKILL.md','sources.jsonl']+['references/'+x+'.md' for x in ['principles','fatia-1','fresh-start','orchestration','judging','transport']]
guidance=[]
for rel in mandatory:
 b=(ROOT/'inputs'/rel).read_bytes();p=effective_root/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
 m={'local_path':str(p.relative_to(OUT)),'source_path':'provided-inputs/'+rel,'commit':SOURCE if rel=='AGENTS.md' else None,'sha256':sha(b),'git_blob_sha':blob(b),'bytes':len(b)}
 registry['input:'+rel]=m;guidance.append({**m,'role':'effective_recipe_or_authority_input','rationale':'Original task guidance/inventory/authority actually read; no source identity is fabricated for locally supplied wrappers.'})
assert registry['input:AGENTS.md']['git_blob_sha']=='ef3b523b0c00aed722582b870c1919188edc4c4f'
for name in ['boundaries','entry']:
 p=OUT/'history'/f'{name}.md';b=p.read_bytes()
 m=next(x['body'] for x in input_manifest['bodies'] if x['artifact_key']=='s1.core.'+name)
 assert sha(b)==m['sha256'] and blob(b)==m['git_blob_sha']
 registry['history-body:'+name]={'local_path':str(p.relative_to(OUT)),'source_path':m['path'],'commit':m['commit'],'sha256':sha(b),'git_blob_sha':blob(b),'bytes':len(b)}
for rel in ['coverage.jsonl','history/manifest.json','union-navigation-proposal.md']:
 p=OUT/rel;b=p.read_bytes();registry['local:'+rel]={'local_path':rel,'source_path':rel,'commit':None,'sha256':sha(b),'git_blob_sha':blob(b),'bytes':len(b)}

coverage_bytes=(OUT/'coverage.jsonl').read_bytes();cover_lines=coverage_bytes.splitlines(keepends=True)
coverage=[json.loads(x) for x in cover_lines]
assert len(coverage)==128 and len({x['path'] for x in coverage})==128
boundary_rows=[x for x in coverage if x['legacy_artifact_key']=='s1.core.boundaries']
support_rows=[x for x in coverage if x['legacy_artifact_key']=='s1.core.entry']
assert len(boundary_rows)==24 and len(support_rows)==104

class Writer:
 def __init__(self):self.data=bytearray();self.index=[]
 def put(self,s):self.data.extend(s.encode() if isinstance(s,str) else s)
 def literal_bytes(self,eid,key,start,end,reqs,extra=None):
  m=registry[key];b=(OUT/m['local_path']).read_bytes();ex=b[start:end]
  first=b[:start].count(b'\n')+1;last=first+ex.count(b'\n')-(1 if ex.endswith(b'\n') else 0)
  record={'id':eid,'requests':reqs,'registry_key':key,**m,'source_start_byte':start,'source_end_byte_exclusive':end,'first_line':first,'last_line':last,'excerpt_sha256':sha(ex),'excerpt_bytes':len(ex)}
  if extra:record.update(extra)
  self.put(f'\n### {eid} — `{m["source_path"]}` linhas {first}–{last}\n\n')
  self.put(f'Commit: `{m["commit"] or "LOCAL_CANDIDATE_OR_PROVIDED_INPUT"}`. Blob: `{m["git_blob_sha"]}`. SHA256 integral: `{m["sha256"]}`. Bytes fonte: {len(b)}. '
           f'Intervalo byte `[ {start}, {end} )`, zero-based, fim exclusivo. SHA256 trecho: `{sha(ex)}`.\n\n`````text\n')
  record['output_excerpt_start_byte']=len(self.data);self.put(ex);record['output_excerpt_end_byte_exclusive']=len(self.data)
  if not ex.endswith(b'\n'):self.put('\n')
  self.put('`````\n');self.index.append(record)
 def literal(self,eid,key,first,last,reqs,extra=None):
  b=(OUT/registry[key]['local_path']).read_bytes();ls=b.splitlines(keepends=True)
  assert 1<=first<=last<=len(ls),(eid,first,last,len(ls))
  self.literal_bytes(eid,key,sum(map(len,ls[:first-1])),sum(map(len,ls[:last])),reqs,extra)

common=Writer()
common.put('# Reconciliação compartilhada 1 — fronteiras e suporte\n\n'
 'Prova comum congelada para RE-BND-01 e futuros pedidos públicos de suporte. Não altera corpos de suporte/proposta, não cria aceite e não converte navegação em build dependency. '
 'A origem é `coverage.jsonl` v1, SHA256 `'+sha(coverage_bytes)+'`, e os inputs históricos integrais identificados abaixo.\n\n'
 '| População | Quantidade | Disposição |\n|---|---:|---|\n'
 '| Fronteiras | 24 | 14 implementações e 10 testes preparados |\n'
 '| Suporte local | 104 | 9 históricos, 3 documentação, 12 package/tooling, 80 validação/fixtures/harness |\n'
 '| Total deste produtor | 128 | Cada path aparece uma única vez em coverage |\n'
 '| Core inteiro histórico | 1441 | Escopo do corpo herdado de entrada; não é o recorte atual |\n'
 '| União S1 no kit | 2236 | Meta de união; não resultado de aceite |\n\n'
 '## 24 disposições individuais literais\n\nCada fence contém uma linha original inteira do JSONL, incluindo read_depth, role, need, artifact e reason.\n')
for i,x in enumerate(coverage,1):
 if x['legacy_artifact_key']=='s1.core.boundaries':common.literal(f'POP-B{i:03d}','local:coverage.jsonl',i,i,['RE-BND-01'])
common.put('\n## Relação exata das 104 fontes locais de suporte\n\n'
 'Esta tabela é projeção determinística de campos do mesmo JSONL, sem substituir seus bytes. Os valores de path, profundidade, role e rationale vêm das entradas originais. '
 'Ela poderá ser reutilizada no lote de suporte sem repetir o censo. Nenhuma linha afirma PASS.\n\n'
 '| Path | Read depth / role | Rationale original |\n|---|---|---|\n')
for x in support_rows:
 common.put('| `'+x['path']+'` | `'+x['read_depth']+'` / `'+x['role']+'` | '+x['reason'].replace('|','\\|').replace('\n',' ')+' |\n')
common.put('\n## História integral preservada e significado do reuso\n\n'
 'O corpo histórico boundaries contém a classificação interpretativa “legacy screen mining”. Ele é preservado como história; a correção v2 não atribui essa palavra ao comentário atual da fonte. '
 'As identidades dos históricos permanecem imutáveis. A3/A4/projection são inputs integrais efetivos; os recortes seguintes são somente evidência de leitura para os juízes.\n')
for eid,key in [('H-BND','history-body:boundaries'),('H-ENTRY','history-body:entry'),('H-MANIFEST','local:history/manifest.json')]:
 b=(OUT/registry[key]['local_path']).read_bytes();common.literal_bytes(eid,key,0,len(b),['RE-BND-01'])
for eid,key,ranges in [
 ('H-A3','history-input:a3-dossier.md',[(3395,3408)]),
 ('H-A4','history-input:a4-dossier.md',[(2134,2150),(2180,2195),(2757,2772),(2827,2844),(2918,2932),(2967,2989)])]:
 for n,(a,b) in enumerate(ranges,1):common.literal(eid+f'-{n}',key,a,b,['RE-BND-01'])

# Locate exact original JSON fields without serializing them into substitute inputs.
key='history-input:coverage-needs-projection.json';raw=(OUT/registry[key]['local_path']).read_bytes();txt=raw.decode();dec=json.JSONDecoder()
pos=txt.index('[',txt.index('"artifacts"'))+1
while True:
 while pos<len(txt) and txt[pos] in ' \r\n\t,':pos+=1
 if txt[pos]==']':break
 obj,end=dec.raw_decode(txt,pos)
 art=obj.get('original_artifact',{}).get('key')
 if art in ('s1.core.boundaries','s1.core.entry'):
  for prop in ['derived_population_routing','clarification_authored_in_this_revision']:
   at=txt.index('"'+prop+'"',pos,end);vstart=txt.index(':',at)+1
   while txt[vstart].isspace():vstart+=1
   _,vend=dec.raw_decode(txt,vstart)
   begin=txt.rfind('\n',pos,at)+1
   if vend<len(txt) and txt[vend]==',':vend+=1
   if vend<len(txt) and txt[vend]=='\n':vend+=1
   common.literal_bytes('H-PROJ-'+('BND' if art.endswith('boundaries') else 'ENTRY')+'-'+prop,key,len(txt[:begin].encode()),len(txt[:vend].encode()),['RE-BND-01'],{'json_artifact_key':art,'json_property':prop,'whole_input_remains_required':True})
 pos=end
common.put('\n## README e autoridade I01\n\nO README declara separadamente Schema→Core e Protocol→Server, e Server expondo serviços Core; o trecho literal permite julgar as atribuições sem auditoria nova de imports.\n')
common.literal('COMMON-S01','packages/core/README.md',1,88,['RE-BND-01'])
common.literal('COMMON-I01','input:AGENTS.md',207,217,['RE-BND-01'])
kitbase='modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/'
common.put('\n## Rotas reais do kit e limite de seleção\n\nA proposta integral permanece em julgamento próprio, inalterada. Estes são os bytes normativos necessários à relação entre donos/keys e navegação. Versões externas continuam NOT_SELECTED.\n')
common.literal('COMMON-K01',kitbase+'partition.json',11,51,['RE-BND-01'])
for n,(a,b) in enumerate([(1,9),(55,98),(160,202)],1):common.literal('COMMON-K02-'+str(n),kitbase+'dependencies.json',a,b,['RE-BND-01'])
common_path=OUT/'shared-reconciliation-1.md';common_path.write_bytes(common.data)
dump(OUT/'shared-reconciliation-1.index.json',{'artifact':identity(common_path),'entries':common.index,'full_historical_inputs':full_history,'notice':'Projection evidence is not a replacement for complete native inputs.'})

# Reuse only the boundary evidence actually acknowledged by both public requests.
review=(OUT/'evidence-review.md').read_bytes()
received=[x for x in json.loads((OUT/'records/evidence-review-index.json').read_text()) if x['body']=='bodies/boundaries.md' and int(x['id'][1:])<=41]
assert len(received)==41
reuse=[]
for x in received:
 b=(OUT/capmap[x['path']]['capture_path']).read_bytes();ls=b.splitlines(keepends=True)
 start=sum(map(len,ls[:x['first_line']-1]));end=sum(map(len,ls[:x['last_line']]))
 ex=b[start:end];assert sha(ex)==x['sha256']
 marker=('## '+x['id']+' ').encode();s=review.index(marker);a=review.index(b'`````text\n',s)+len(b'`````text\n');z=a+len(ex)
 assert review[a:z]==ex
 reuse.append({'id':x['id'],'path':x['path'],'commit':x['commit'],'first_line':x['first_line'],'last_line':x['last_line'],'source_start_byte':start,'source_end_byte_exclusive':end,'excerpt_sha256':sha(ex),'evidence_review_start_byte':a,'evidence_review_end_byte_exclusive':z,'evidence_review_sha256':sha(review),'acknowledged_by':['j1-response.md','j2-response.md'],'note':'R012 includes the transport correction acknowledged by J1; original source/evidence bytes remain unchanged.' if x['id']=='R012' else ''})
by_received={}
for x in reuse:by_received.setdefault(x['path'],[]).append(x)
def subtract(first,last,old):
 result=[];cursor=first
 for r in sorted(old,key=lambda x:x['first_line']):
  if r['last_line']<cursor or r['first_line']>last:continue
  if cursor<r['first_line']:result.append((cursor,min(last,r['first_line']-1)))
  cursor=max(cursor,r['last_line']+1)
  if cursor>last:break
 if cursor<=last:result.append((cursor,last))
 return result

w=Writer()
w.put('# Suplemento boundaries 1 — RE-BND-01..06\n\n'
 'Autor: produtor `/root/boundaries_l1`, mesma execução e sem acesso a oracle. Inputs públicos: J1/J2 integrais preservados em `revisions/boundaries-v2/inputs/`. '
 'Estado: resposta a REQUEST_EVIDENCE e duas correções de precisão autorizadas; sem julgamento atribuído pelo produtor, teste/runtime ou aceite externo.\n\n'
 '## Candidato v2 e deltas autorizados\n\n')
delta=json.loads((V2/'delta.json').read_text())
w.put(f'v1: {delta["from"]["bytes"]} bytes, SHA256 `{delta["from"]["sha256"]}`. v2: {delta["to"]["bytes"]} bytes, SHA256 `{delta["to"]["sha256"]}`. '
      'O corpo/receita/resposta v1 permanecem byte-idênticos em `revisions/boundaries-v1/`. Suporte e proposta não foram alterados nesta etapa.\n')
for op in delta['operations']:
 w.put('\n### '+op['id']+'\n\nAnterior, literal do corpo v1:\n\n`````text\n'+op['old']+'\n`````\n\nNovo, literal do corpo v2:\n\n`````text\n'+op['new']+'\n`````\n')
w.put('\n## Plano de reuso: R001–R041 já recebidos\n\n'
 'Os dois pedidos reconhecem esse conjunto. A tabela fornece offsets/hashes para recompor intervalos, sem repeti-los no suplemento. Cada trecho novo abaixo complementa os ramos recebidos. '
 'Exceção explícita: RAG 1–81 é retransmitido integralmente a pedido de J1, para preservar a unidade completa do schema.\n\n'
 '| R | Fonte e linhas | Bytes na fonte | SHA256 do trecho | Bytes em evidence-review.md |\n|---|---|---|---|---|\n')
for x in reuse:w.put(f'| {x["id"]} | `{x["path"]}` {x["first_line"]}–{x["last_line"]} | [{x["source_start_byte"]}, {x["source_end_byte_exclusive"]}) | `{x["excerpt_sha256"]}` | [{x["evidence_review_start_byte"]}, {x["evidence_review_end_byte_exclusive"]}) |\n')
w.put('\n## RE-BND-01 — População, herança, navegação e dez contratos de teste\n\n'
 'A reconciliação comum seguinte é incluída integralmente uma única vez neste pacote. O arquivo irmão `shared-reconciliation-1.md` contém os mesmos bytes e poderá ser referenciado por offset/hash no lote de suporte, sem retransmissão.\n\n')
common_start=len(w.data);w.put(common.data);common_end=len(w.data)
for item in common.index:
 entry={**item,'common_excerpt_start_byte':item['output_excerpt_start_byte'],'common_excerpt_end_byte_exclusive':item['output_excerpt_end_byte_exclusive']}
 entry['output_excerpt_start_byte']+=common_start;entry['output_excerpt_end_byte_exclusive']+=common_start;w.index.append(entry)
w.put('\n### Dez fontes de teste: contratos preparados, NOT_RUN\n\n'
 'Cada fonte tem trechos concretos de preparação/asserção. Valores de verdict, MAC, contagem e PASS dentro do teste são expectativas do código, nunca resultados desta produção. '
 'BT01 atende também RE-BND-06; BT05 inclui o intervalo T03; BT09 inclui os intervalos T02; o primeiro intervalo de BT01 é T01 do arquivo integral.\n')
test_spans=[
 ('BT01','move-session.test.ts',[(83,117),(167,239)],['RE-BND-01','RE-BND-06']),
 ('BT02','relay-commands.test.ts',[(1,42)],['RE-BND-01','RE-BND-02']),
 ('BT03','relay-hook-install.test.ts',[(382,395),(398,466),(612,624)],['RE-BND-01','RE-BND-04']),
 ('BT04','relay-hook-recovery-startup.test.ts',[(159,202),(226,248)],['RE-BND-01','RE-BND-04']),
 ('BT05','relay-hook-recovery.test.ts',[(211,261)],['RE-BND-01','RE-BND-04']),
 ('BT06','relay-hook-session.test.ts',[(235,288),(290,338)],['RE-BND-01','RE-BND-04']),
 ('BT07','relay-hook-shipper.test.ts',[(194,215),(307,353)],['RE-BND-01','RE-BND-04']),
 ('BT08','relay-workflow-binding.test.ts',[(141,164),(468,506)],['RE-BND-01','RE-BND-05']),
 ('BT09','relay-workflow-evaluator.test.ts',[(63,77),(89,128),(162,190)],['RE-BND-01','RE-BND-05']),
 ('BT10','relay.test.ts',[(187,274)],['RE-BND-01','RE-BND-03']),
]
for eid,p,ranges,reqs in test_spans:
 for n,(a,b) in enumerate(ranges,1):w.literal(eid+'-'+str(n),'packages/core/test/'+p,a,b,reqs,{'test_execution':'NOT_RUN'})

requests=[
 ('RE-BND-02','Atlas e descoberta de comandos',[
  ('AT01','packages/core/src/atlas.ts',[(103,148),(152,195),(208,258),(312,347)],False),
  ('AT02','packages/core/src/relay-commands.ts',[(7,114)],False)]),
 ('RE-BND-03','Relay: paths, chave, ambiente, registro e recuperação',[
  ('RL01','packages/core/src/relay.ts',[(42,48),(184,217),(240,246),(284,300),(319,334),(390,418),(434,481),(568,629)],False)]),
 ('RE-BND-04','Lifecycle/parse de hooks, shipping e loop de recovery',[
  ('HK01','packages/core/src/relay-hook-install.ts',[(1,215),(240,252),(274,282),(337,500)],False),
  ('HK02','packages/core/src/relay-hook-shipper.ts',[(1,130)],False),
  ('HK03','packages/core/src/relay-hook-recovery.ts',[(1,88)],False)]),
 ('RE-BND-05','Publicação/materialização, view, host e settlement',[
  ('WF01','packages/core/src/relay-workflow-binding.ts',[(1,261)],False),
  ('WF02','packages/core/src/relay-workflow-currentstep.ts',[(1,139)],False),
  ('WF03','packages/core/src/relay-workflow-session.ts',[(1,96)],False),
  ('WF04','packages/core/src/relay-workflow-transition.ts',[(1,125)],False),
  ('WF05','packages/core/src/relay-workflow-evaluator.ts',[(1,208)],False)]),
 ('RE-BND-06','Precondições de MoveSession e schema RAG completo',[
  ('MV01','packages/core/src/control-plane/move-session.ts',[(1,86)],False),
  ('RG01','packages/core/src/rag-studio/sql.ts',[(1,81)],True)]),
]
resolution=[]
for req,title,items in requests:
 w.put('\n## '+req+' — '+title+'\n\n')
 if req=='RE-BND-03':w.put('A detecção de comandos pedida também por J2 está integralmente recomposta por AT02 + R011/R012; não é repetida aqui.\n')
 if req=='RE-BND-06':w.put('BT01-2, acima, contém o teste aninhado 167–239: staged no path e arquivos alterados fora do path. Nenhuma concorrência posterior à captura é exercitada por esse caso preparado. R006/R007 preservam a ordem apply→evento→discard e o erro posterior.\n')
 for eid,p,ranges,force in items:
  n=0
  for a,b in ranges:
   old=[x for x in by_received.get(p,[]) if x['first_line']<=b and x['last_line']>=a]
   fresh=[(a,b)] if force else subtract(a,b,old)
   resolution.append({'request':req,'evidence_family':eid,'path':p,'requested_first_line':a,'requested_last_line':b,'reused':[x['id'] for x in old] if not force else [],'new_intervals':fresh,'intentional_repeat':'J1 requested complete RAG 1-81' if force else None})
   w.put(f'\n**Plano `{p}` {a}–{b}:** '+('retransmissão integral explícita do schema.' if force else 'reuso '+(', '.join(x['id'] for x in old) or 'nenhum')+'; complemento literal abaixo.')+'\n')
   for c,d in fresh:
    n+=1;reqs=[req]
    if eid=='AT02':reqs.append('RE-BND-03')
    w.literal(eid+'-'+str(n),p,c,d,reqs,{'intentional_repeat':force})
w.put('\n## Estado da resposta e inputs efetivos\n\n'
 'Todos RE-BND-01..06 têm prova nova literal ou reuso exato de trechos reconhecidos pelo par. A suficiência continua para decisão dos juízes. '
 'Os dois deltas alteram somente atribuição do comentário de mining e escopo da preservação em MoveSession. Nenhum aceite anterior foi movido. '
 'A3 (177.076 bytes), A4 (155.061 bytes) e coverage-needs-projection (726.892 bytes) permanecem inputs integrais efetivos de ambos os artefatos para as afirmações históricas. '
 'Os recortes usados em evidência não são substitutos dessas identidades nem solução de limite 256K. Ver `effective-input-disposition.md` e `effective-inputs.json`; nenhum import/runtime foi executado.\n')
supp=OUT/'suplemento-boundaries-1.md';supp.write_bytes(w.data)
idx={'supplement':identity(supp),'candidate_v2':delta['to'],'source_revision':SOURCE,'history_revision':HISTORY,'kit_revision':KIT,
 'offset_convention':'zero-based UTF-8 bytes; end exclusive; excerpt hashes include original line endings',
 'requests':{j:identity(V2/'inputs'/j) for j in ['j1-response.md','j2-response.md']},
 'reused_received':reuse,'request_resolution':resolution,'literal_entries':w.index,
 'common_reconciliation':{'identity':identity(common_path),'supplement_start_byte':common_start,'supplement_end_byte_exclusive':common_end,'reuse_without_retransmission':True},
 'test_source_count':10,'new_execution_results':0,'semantic_status':'PENDING_SAME_PAIR_REEVALUATION'}
dump(OUT/'suplemento-boundaries-1.index.json',idx)

# Exact lists reuse the original capture identity manifest; they do not duplicate
# all 128 captures or disguise the original large projection as a new small input.
source_groups={
 'boundaries_assigned':{'paths':[x['path'] for x in boundary_rows],'count':24,'identity_manifest':'captures.json','reason':'Fourteen full implementation leaves and ten prepared test contracts supply the local adapter claims.'},
 'support_assigned':{'paths':[x['path'] for x in support_rows],'count':104,'identity_manifest':'captures.json','reason':'Each historical/documentation/package/fixture disposition uses its actual full captured file identity; depth is coverage.jsonl.'},
 'boundary_cross_support_readme':{'paths':['packages/core/README.md'],'count':1,'identity_manifest':'captures.json','reason':'Architecture, entry points and maintenance authority explicitly cited in boundaries.'},
 'kit_navigation':{'paths':[x['path'] for x in caps if x['role']=='kit_navigation_authority'],'count':8,'identity_manifest':'captures.json','reason':'Actual partition, obligations, owners, keys and missions for navigation and source population; no accepted artifact version.'},
}
eff={
 'kind':'effective_input_disposition','version':1,'identity_rule':'The original full file is the source unit even when only relevant ranges/records were semantically read. Evidence excerpts do not replace native input identities.',
 'capture_manifest':identity(OUT/'captures.json'),'coverage':identity(OUT/'coverage.jsonl'),'source_groups':source_groups,
 'historical_full_inputs':full_history,'historical_bodies':[registry['history-body:'+x] for x in ['boundaries','entry']],
 'guidance_and_authority_inputs':guidance,
 'per_artifact':{
  's1.core.boundaries':{'source_groups':['boundaries_assigned','boundary_cross_support_readme','kit_navigation'],'historical_full_inputs':[x['local_path'] for x in full_history],'historical_bodies':['history/boundaries.md','history/entry.md'],'authority':'inputs-effective/AGENTS.md','recipe_inputs':[x['local_path'] for x in guidance],'note':'History is needed for actual reuse/population/navigation claims; engine guarantees are not transferred.'},
  's1.subslice03.support':{'source_groups':['support_assigned','kit_navigation'],'historical_full_inputs':[x['local_path'] for x in full_history],'historical_bodies':['history/entry.md','history/boundaries.md'],'authority':'inputs-effective/AGENTS.md','recipe_inputs':[x['local_path'] for x in guidance],'shared_population_reference':'coverage.jsonl original all 128 rows; uses boundaries counts/read-depth, not an accepted boundary body as build predecessor','note':'Actual full archives, generated schema, fixtures, history and guidance remain inputs with declared semantic read depth; no metadata-only relabel to fit native cap.'}
 },
 'large_input_notice':{'path':'inputs-effective/history/coverage-needs-projection.json','bytes':726892,'sha256':registry['history-input:coverage-needs-projection.json']['sha256'],'exceeds_256KiB':True,'disposition':'preserved as actual full input; no splitting or projection substitution to evade an input limit','native_binding_status':'NOT_RUN_NOT_SELECTED'},
 'judgments_status':'No acceptance is created, copied or promoted by this input list.'
}
dump(OUT/'effective-inputs.json',eff)
md=['# Inputs efetivos por artefato\n\n'
 'Esta disposição registra entradas realmente usadas. O arquivo integral continua sendo a unidade de identidade, mesmo quando a leitura semântica se concentrou em intervalos. '
 'A lista não declara imports/aceites nem transforma fonte em predecessor aceito. Não há duplicação dos 128 registros de captura: paths exatos abaixo resolvem suas identidades em `captures.json`.\n\n'
 '## História efetiva compartilhada\n\n| Input integral | Bytes | SHA256 | Motivo em boundaries e support |\n|---|---:|---|---|\n']
for x in full_history:md.append(f'| `{x["local_path"]}` | {x["bytes"]} | `{x["sha256"]}` | Reuso declarado, escopo histórico, contagens/profundidade herdadas e limites de autoridade. |\n')
md.append('\nA3/A4 foram lidos por trechos pertinentes; a projeção foi parseada para selecionar os dois registros. Isso **não** muda a unidade de input para o recorte pequeno. '
 'A projeção de 726.892 bytes permanece necessária às afirmações atuais de 4+20/2+102 e às obrigações históricas. Se um caminho nativo tiver teto 256K, estes registros não o contornam: capacidade/binding precisa ser resolvido pela autoridade competente ou uma futura mudança real de claims/recipe deve ser autorizada e julgada.\n\n'
 'Os corpos históricos `history/boundaries.md` e `history/entry.md` também são inputs reais, preservados byte a byte. `inputs-effective/` conserva os 12 arquivos originais de orientação/inventário/autoridade, com identidades em `effective-inputs.json`. '
 'AGENTS corresponde ao blob de produto `ef3b523b0c00aed722582b870c1919188edc4c4f`, conferido contra a referência histórica, sem novo fetch fictício.\n\n'
 '## Relação por artefato\n\n'
 '- `s1.core.boundaries`: grupo 24 fronteiras + README compartilhado + oito arquivos de navegação; os dois corpos históricos, A3/A4/projection integrais e os inputs de autoridade/receita.\n\n'
 '- `s1.subslice03.support`: grupo 104 suporte + oito arquivos de navegação; os dois corpos históricos, A3/A4/projection integrais e os inputs de autoridade/receita. A composição 24+104 vem do coverage original, sem declarar o corpo boundaries um predecessor aceito.\n\n'
 '## Lista exata por grupo\n')
for name,g in source_groups.items():
 md.append('\n### '+name+f' — {g["count"]} paths\n\n'+g['reason']+'\n\n')
 for p in g['paths']:md.append('- `'+p+'`\n')
md.append('\n## Exceções de profundidade e capacidade\n\n'
 '- Archive hugr-lean: bytes/hash e metadata de package/dir do tar, sem execução e sem revisão integral de código interno. O tarball inteiro permanece input.\n'
 '- ZIP e SCIP: bytes completos preservados, leitura de diretório/strings limitada; não são índices/artefatos runtime aceitos.\n'
 '- schema.json: parsing estrutural, sem migração executada. Fixtures/testes: profundidade individual no coverage; nenhum PASS nasce de título/assertion.\n'
 '- Histórico/protocolo: são entradas efetivas de autoridade e de confronto, não instruções operacionais executadas.\n'
 '- Proposta/links do kit: navegação, não build dependencies aceitas.\n')
(OUT/'effective-input-disposition.md').write_text(''.join(md))

# Verify source hashes, every literal byte range, whole historical inputs and
# immutable other bodies. This is packaging verification, not a product test.
for ent in w.index:
 raw=(OUT/ent['local_path']).read_bytes();ex=raw[ent['source_start_byte']:ent['source_end_byte_exclusive']]
 assert sha(raw)==ent['sha256'] and blob(raw)==ent['git_blob_sha']
 assert sha(ex)==ent['excerpt_sha256'] and len(ex)==ent['excerpt_bytes']
 assert bytes(w.data[ent['output_excerpt_start_byte']:ent['output_excerpt_end_byte_exclusive']])==ex
assert bytes(w.data[common_start:common_end])==common_path.read_bytes()
assert sha((OUT/'bodies/support.md').read_bytes())=='3a4ef5ee6925eb3c80404181f00a0e4e012750459f2dbb1ab11076b69449d684'
assert sha((OUT/'union-navigation-proposal.md').read_bytes())=='f4362077ed7eb2f0dff7bb76acd60debeaa41bd37886551977b92c02addfcb6e'
report={'supplement':identity(supp),'index':identity(OUT/'suplemento-boundaries-1.index.json'),'common':identity(common_path),'literal_entries':len(w.index),'received_reused':len(reuse),'request_groups':['RE-BND-'+str(i).zfill(2) for i in range(1,7)],'test_contract_sources':10,'effective_input_manifest':identity(OUT/'effective-inputs.json'),'all_source_and_excerpt_hashes_verified':True,'whole_history_preserved':True,'support_proposal_unchanged':True,'product_tests':'NOT_RUN','semantic_acceptance':'PENDING_JUDGES'}
dump(V2/'supplement-verification.json',report)
print(json.dumps(report,ensure_ascii=False))
