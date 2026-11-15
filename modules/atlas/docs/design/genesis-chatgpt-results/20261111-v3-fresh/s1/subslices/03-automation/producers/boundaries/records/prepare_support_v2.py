"""Three authorized support precision corrections and two separately versioned coverage reasons."""
import hashlib,json,difflib
from pathlib import Path
ROOT=Path('/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390')
OUT=ROOT/'producers/boundaries';V1=OUT/'revisions/support-v1';V2=OUT/'revisions/support-v2'
sha=lambda b:hashlib.sha256(b).hexdigest()
blob=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def ident(b):return {'bytes':len(b),'sha256':sha(b),'git_blob_sha':blob(b)}
V1.mkdir(parents=True,exist_ok=True);(V2/'inputs').mkdir(parents=True,exist_ok=True)
for rel,h in {'bodies/support.md':'3a4ef5ee6925eb3c80404181f00a0e4e012750459f2dbb1ab11076b69449d684','recipe.json':'b55bbbda05c426500409dfb49610dc2f83e520dd6dd37721ec1cb93507687a51','coverage.jsonl':'d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9','response.md':'8b4c8f014f5e4b06ee996b1015af2e1c14ef4207eb1ab965f43944793f4e9708'}.items():
 dst=V1/rel;b=dst.read_bytes() if dst.exists() else (OUT/rel).read_bytes();assert sha(b)==h,(rel,sha(b));dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(b)
for j in ['j1-response.md','j2-response.md']:(V2/'inputs'/j).write_bytes((ROOT/'relay/support'/j).read_bytes())
p=ROOT/'payload/receipts/independent-support-structure.json';b=p.read_bytes()
assert sha(b)=='d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb'
(V2/'inputs/independent-support-structure.json').write_bytes(b)
(V2/'inputs/verify-support-structure.py').write_bytes((ROOT/'scripts/verify-support-structure.py').read_bytes())
before=(V1/'bodies/support.md').read_text()
ops=[
 {'id':'SUP-F01/D-SUP-01','old':'A direção declarada vai de Schema/Protocol para Core e daí para Server; Core não deve importar Client/Server.',
 'new':'A fonte declara separadamente `Schema → Core` e `Protocol → Server`; também informa que Server expõe os serviços Core por HTTP. Core não deve importar Client/Server.'},
 {'id':'SUP-F03','old':'aponta a chave de testes para arquivo temporário',
 'new':'fornece um caminho temporário para a chave de testes quando `ORCHESTRA_CREDENTIAL_KEY_FILE` ainda não está definida (`??=` preserva um valor previamente definido)'},
 {'id':'SUP-F02','old':'`omni-expect.ts` registra snapshot de contagem no próprio teste e compara apenas seus spawns quando o teste termina. Outro teste não pode satisfazer a expectativa aberta; caso filtrado/skipped que não abriu expectativa não declara controle.',
 'new':'`omni-expect.ts` mantém uma única expectativa `open` e calcula a diferença do contador `Omni.snapshot().spawns` na janela entre `expectSpawn` e `settle`. O comentário declara a intenção de atribuir os spawns ao teste e descreve liquidação por `afterEach`; a folha isolada não demonstra atribuição individual de cada spawn nem exclusão de sobreposição. Interpretar a diferença como contagem exclusiva de um teste exige que essa janela não contenha spawns de outros testes ou trabalhos e que a integração ao runner delimite a janela corretamente. Caso filtrado/skipped que não chamou `expectSpawn` não abriu expectativa. Essa qualificação não afirma que tenha ocorrido uma falha real.'}
]
after=before
for op in ops:
 assert after.count(op['old'])==1,op['id'];after=after.replace(op['old'],op['new'],1)
 op.update({'old_sha256':sha(op['old'].encode()),'new_sha256':sha(op['new'].encode()),'old_bytes':len(op['old'].encode()),'new_bytes':len(op['new'].encode()),'old_byte_offset':before.encode().index(op['old'].encode())})
for op in ops:op['new_byte_offset']=after.encode().index(op['new'].encode())
(OUT/'bodies/support.md').write_text(after);(V2/'body.md').write_text(after)
(V2/'delta.patch').write_text(''.join(difflib.unified_diff(before.splitlines(keepends=True),after.splitlines(keepends=True),fromfile='support-v1/bodies/support.md',tofile='support-v2/body.md',n=2)))
delta={'kind':'three_authorized_precision_corrections','artifact_key':'s1.subslice03.support','from':ident(before.encode()),'to':ident(after.encode()),'operations':ops,'other_body_changes':False,'semantic_status':'PENDING_SAME_PAIR_REEVALUATION','product_execution':'NOT_RUN'}
(V2/'delta.json').write_text(json.dumps(delta,ensure_ascii=False,indent=2)+'\n')

reason_changes={
 'packages/core/README.md':('SUP-F01/D-SUP-01','Entrada pública: Schema→Core e Protocol→Server são relações separadas; Server expõe serviços Core por HTTP. Composição e geradores oficiais são declarados; intenção de arquitetura não prova todas as folhas.'),
 'packages/core/test/fixture/omni-expect.ts':('SUP-F02','Mantém uma expectativa open e mede diferença do contador de spawns na janela expectSpawn→settle. Exclusividade por teste é intenção do comentário e exige ausência de sobreposição/integração correta com runner, não demonstradas só por esta folha.')
}
original=(OUT/'coverage.jsonl').read_bytes();newlines=[];changes=[]
for line_no,line in enumerate(original.splitlines(keepends=True),1):
 x=json.loads(line)
 if x['path'] in reason_changes:
  fid,reason=reason_changes[x['path']];old=x['reason'];x['reason']=reason
  new=(json.dumps(x,ensure_ascii=False,separators=(',',':'))+'\n').encode()
  changes.append({'finding':fid,'path':x['path'],'line':line_no,'old_reason':old,'new_reason':reason,'old_line_sha256':sha(line),'new_line_sha256':sha(new),'old_line':line.decode(),'new_line':new.decode()});newlines.append(new)
 else:newlines.append(line)
new=b''.join(newlines);assert len(changes)==2 and len(new.splitlines())==128
(OUT/'coverage-v2.jsonl').write_bytes(new)
cd={'kind':'two_authorized_coverage_reason_corrections','base':{'path':'coverage.jsonl',**ident(original)},'updated':{'path':'coverage-v2.jsonl',**ident(new)},'changes':changes,'all_other_lines_byte_identical':True,'shared_reconciliation_1_preserved':True}
(OUT/'coverage-v2.delta.json').write_text(json.dumps(cd,ensure_ascii=False,indent=2)+'\n')
md=['# Erratum compartilhado — duas razões de coverage\n\n'
 'Autorizado pela principal para alinhar exclusivamente SUP-F01/D-SUP-01 e SUP-F02. `coverage.jsonl` v1 e `shared-reconciliation-1.md` permanecem byte-idênticos; use `coverage-v2.jsonl` para estas duas razões corrigidas. Contagens, paths, hashes das fontes, profundidades e estados não mudam. Não há novo aceite.\n\n'
 f'v1 SHA256 `{sha(original)}`; v2 SHA256 `{sha(new)}`. Exatamente duas linhas modificadas.\n']
for c in changes:md.append('\n## '+c['finding']+' — `'+c['path']+'`\n\nRazão anterior (literal):\n\n`````text\n'+c['old_reason']+'\n`````\n\nRazão corrigida (literal):\n\n`````text\n'+c['new_reason']+'\n`````\n\n'+f'Linha {c["line"]}, SHA256 da linha v1 `{c["old_line_sha256"]}`, linha v2 `{c["new_line_sha256"]}`.\n')
(OUT/'shared-reconciliation-2.delta.md').write_text(''.join(md))
assert sha((OUT/'coverage.jsonl').read_bytes())=='d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9'
assert sha((OUT/'shared-reconciliation-1.md').read_bytes())=='75aa4f74aba2ddcecd58c52fd329481dffabc60271a57bf0bfbe358d0b903992'
assert sha((OUT/'bodies/boundaries.md').read_bytes())=='ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6'
assert sha((OUT/'union-navigation-proposal.md').read_bytes())=='f4362077ed7eb2f0dff7bb76acd60debeaa41bd37886551977b92c02addfcb6e'
print(json.dumps({'body_v2':ident(after.encode()),'three_body_deltas':len(ops),'coverage_v2':ident(new),'two_coverage_reasons':len(changes)},ensure_ascii=False))
