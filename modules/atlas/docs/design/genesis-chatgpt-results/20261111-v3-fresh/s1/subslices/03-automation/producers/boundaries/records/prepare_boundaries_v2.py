"""Preserve v1 bytes and apply exactly two principal-authorized prose corrections."""
import difflib,hashlib,json
from pathlib import Path
ROOT=Path('/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390')
OUT=ROOT/'producers/boundaries'
V1=OUT/'revisions/boundaries-v1'
V2=OUT/'revisions/boundaries-v2'
sha=lambda b:hashlib.sha256(b).hexdigest()
blob=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def ident(b):return {'sha256':sha(b),'git_blob_sha':blob(b),'bytes':len(b)}
V1.mkdir(parents=True,exist_ok=True);(V2/'inputs').mkdir(parents=True,exist_ok=True)
expected={
 'bodies/boundaries.md':'c557b33392cae8d0078a7da17f3421bb57ec2434f3bf5bba3b54f4172faeadae',
 'recipe.json':'b55bbbda05c426500409dfb49610dc2f83e520dd6dd37721ec1cb93507687a51',
 'response.md':'8b4c8f014f5e4b06ee996b1015af2e1c14ef4207eb1ab965f43944793f4e9708',
}
preserved=[]
for rel,h in expected.items():
    src=OUT/rel;dst=V1/rel
    b=dst.read_bytes() if dst.exists() else src.read_bytes()
    assert sha(b)==h,(rel,sha(b))
    dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(b)
    preserved.append({'original_path':rel,'preserved_path':str(dst.relative_to(OUT)),**ident(b)})
for rel in ['request.txt','request-followups.txt','records/verification.json']:
    dst=V1/rel;dst.parent.mkdir(parents=True,exist_ok=True)
    if not dst.exists():dst.write_bytes((OUT/rel).read_bytes())
for j in ['j1-response.md','j2-response.md']:
    b=(ROOT/'relay/boundaries'/j).read_bytes();(V2/'inputs'/j).write_bytes(b)
    preserved.append({'source_path':'relay/boundaries/'+j,'local_path':str((V2/'inputs'/j).relative_to(OUT)),**ident(b),'role':'public_evidence_request_original_not_new_acceptance'})

before=(V1/'bodies/boundaries.md').read_text()
ops=[
 {'id':'BND-PRECISION-01','authorization':'Principal authorized mineWith/comment attribution only; J1 RE-BND-02 clarification.',
  'old':'O comentário de `mineWith` distingue o fluxo legado de tela da publicação Genesis.',
  'new':'O comentário de `atlas.ts` 301–304 chama o fluxo de “Genesis mining from the screen” e descreve respostas passando pelo gate/admission do Atlas até o staging, sem promoção. Essa é a atribuição textual sustentada; “legado” era uma classificação interpretativa do corpo histórico, não uma distinção declarada por esse comentário.'},
 {'id':'BND-PRECISION-02','authorization':'Principal authorized limitation of MoveSession preservation to path/index; J2 RE-BND-06 clarification.',
  'old':'A sequência substantiva é capturar alterações de origem, aplicá-las no destino, publicar `Session.Moved` e depois descartar a parte correspondente da origem, preservando index e alterações não envolvidas conforme o caminho Git.',
  'new':'A sequência substantiva é capturar alterações de origem, aplicá-las no destino, publicar `Session.Moved` e depois descartar alterações no diretório de origem da Session, com `index: "preserve"` e `untracked: "remove"`. O código do teste de sessão aninhada prepara alterações em `packages/` e contém asserções de preservação do arquivo staged nesse path e de arquivos alterados na raiz, fora de `packages/`. Esse caso preparado não exercita alterações concorrentes posteriores à captura dentro do mesmo diretório. A chamada `discard` recebe diretório e opções, sem receber o patch capturado. O trecho literal do teste está em `suplemento-boundaries-1.md`, RE-BND-06/BT01.'}
]
after=before
for op in ops:
    assert after.count(op['old'])==1,op['id']
    after=after.replace(op['old'],op['new'],1)
    op['old_sha256']=sha(op['old'].encode());op['new_sha256']=sha(op['new'].encode())
    op['old_utf8_bytes']=len(op['old'].encode());op['new_utf8_bytes']=len(op['new'].encode())
    op['old_byte_offset']=before.encode().index(op['old'].encode())
    op['new_byte_offset']=after.encode().index(op['new'].encode())
new=after.encode();old=before.encode()
for rel in ['bodies/support.md','union-navigation-proposal.md']:
    exp={'bodies/support.md':'3a4ef5ee6925eb3c80404181f00a0e4e012750459f2dbb1ab11076b69449d684','union-navigation-proposal.md':'f4362077ed7eb2f0dff7bb76acd60debeaa41bd37886551977b92c02addfcb6e'}[rel]
    assert sha((OUT/rel).read_bytes())==exp,rel
(OUT/'bodies/boundaries.md').write_bytes(new)
(V2/'body.md').write_bytes(new)
(V2/'delta.patch').write_text(''.join(difflib.unified_diff(before.splitlines(keepends=True),after.splitlines(keepends=True),fromfile='boundaries-v1/bodies/boundaries.md',tofile='boundaries-v2/body.md',n=2)))
record={'kind':'authorized_two_precision_deltas','artifact_key':'s1.core.boundaries','from':ident(old),'to':ident(new),'operations':ops,'other_body_changes':False,'support_and_proposal_unchanged':True,'v1_preserved':preserved,'semantic_acceptance':'PENDING_SAME_JUDGE_PAIR_REEVALUATION','runtime':'NOT_RUN'}
(V2/'delta.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'v1':ident(old),'v2':ident(new),'two_authorized_operations':len(ops),'preserved':len(preserved)},ensure_ascii=False))
