"""Apply only AUT1-DELTA-PROPOSAL-01 and record its documentary provenance."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
BODY_V1 = "2ed7670affc680005840d0918489cb1ac36e1c5a4021defcc57ae44186ae7459"
RECIPE_V1 = "0bea2453bc31f3f93109b9c64c7952aa690e6e6e8e5794c35a5630b8f9b38b21"
REQUEST = "Aplique apenas a substituição mínima AUT1-DELTA-PROPOSAL-01 registrada por você. Preserve body v1 e recipe v1 byte a byte em history/, registre antes/depois, sha256/Git blob, offsets, fontes/linhas e pedido/resposta próprios como research fez. Atualize receita v2 e identidade da dependência externa: sete inputs semânticos S1-04 (workflow/run incluídos), população continua204/462. Não altere suplemento1 já congelado nem outras passagens. Não acesse oracle/julgamentos; finalidade é corrigir precisão identificada por sua própria evidência. Volte com delta literal e hashes v2. Somente seu diretório produtor, sem remote writes."

def sha(data): return hashlib.sha256(data).hexdigest()
def blob(data): return hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
def meta(path, data=None):
    data=(ROOT/path).read_bytes() if data is None else data
    return dict(path=path,bytes=len(data),sha256=sha(data),git_blob_sha=blob(data))
def write_json(path, obj):
    (ROOT/path).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def main():
    body=(ROOT/"body.md").read_bytes(); recipe_bytes=(ROOT/"recipe.json").read_bytes()
    assert sha(body)==BODY_V1 and sha(recipe_bytes)==RECIPE_V1
    frozen_names=["review-supplement-1.md","review-supplement-1-index.json","review-supplement-1-receipt.json",
        "external-source-captures.json","captures.json","coverage.jsonl","request.txt","response.md","evidence.md","evidence-review.md","document-integrity.json"]
    frozen={name:meta(name) for name in frozen_names}
    index=json.loads((ROOT/"review-supplement-1-index.json").read_text())
    delta=next(d for d in index["proposed_deltas"] if d["id"]=="AUT1-DELTA-PROPOSAL-01")
    assert delta["applied"] is False and delta["body_sha256"]==BODY_V1
    old=delta["exact_old_text"].encode("utf-8");new=delta["proposed_new_text"].encode("utf-8")
    assert body.count(old)==1
    start=body.index(old);after=body[:start]+new+body[start+len(old):]
    history=ROOT/"history";history.mkdir(exist_ok=True)
    for filename,data in [("body-v1.md",body),("recipe-v1.json",recipe_bytes)]:
        target=history/filename
        if target.exists():assert target.read_bytes()==data
        else:target.write_bytes(data)
    (HERE/"request.txt").write_text(REQUEST+"\n",encoding="utf-8")
    (ROOT/"body.md").write_bytes(after)
    recipe=json.loads(recipe_bytes)
    external=json.loads((ROOT/"external-source-captures.json").read_text())
    semantics=[c for c in external["captures"] if c["role"]=="semantic_dependency_of_Core_Actions_call_sites"]
    assert len(semantics)==7
    for c in external["captures"]:
        b=(ROOT/c["capture_path"]).read_bytes()
        assert sha(b)==c["sha256"] and blob(b)==c["git_blob_sha"] and len(b)==c["bytes"]
        assert c["owner"]=="S1-04" and c["population_member"] is False
        recipe["actual_inputs"].append(dict(path=c["capture_path"],repository_path=c["path"],
            commit=c["commit"],git_blob_sha=c["git_blob_sha"],sha256=c["sha256"],bytes=c["bytes"],
            role=c["role"],source_owner="S1-04",population_member=False,
            read_scope="raw external schema source supporting Core call sites" if c in semantics else "applicable Schema package instructions read in full",
            authority="raw_source_not_acceptance_of_S1_04_artifact"))
    for name in ["history/body-v1.md","history/recipe-v1.json","review-supplement-1-index.json","external-source-captures.json"]:
        recipe["actual_inputs"].append({**meta(name),"read_scope":"v2 documentary correction provenance"})
    recipe["producer_revision"]=2
    recipe["revision"]=dict(id="AUTOMATION-L1-v2",proposal_id=delta["id"],
        previous_body=meta("history/body-v1.md"),previous_recipe=meta("history/recipe-v1.json"),
        current_body=meta("body.md"),request=meta("revisions/v2/request.txt"),
        replacement_count=1,scope="Only the exact registered sentence in body §1.1; no other passage changed",
        correction_authority="Principal authorization following producer's own source evidence; no oracle or judgment input",
        supplements_preserved=[frozen[n] for n in frozen_names if n.startswith("review-supplement-1")])
    recipe["external_dependencies"]=dict(type="file_source_inputs_not_artifact_acceptance_edges",owner="S1-04",
        semantic_input_count=7,population_effect=0,local_population_retained=204,subslice_population_retained=462,
        manifest=frozen["external-source-captures.json"],
        semantic_source_refs=[dict(input_key="file:"+c["path"],path=c["path"],capture_path=c["capture_path"],
            commit=c["commit"],git_blob_sha=c["git_blob_sha"],sha256=c["sha256"],bytes=c["bytes"],
            source_owner="S1-04",population_member=False,authority="raw_source_only") for c in semantics],
        instruction_inputs=[c["path"] for c in external["captures"] if c not in semantics],
        impact_rule="Changes to these pinned schema inputs require reassessing the corresponding Core binding/source/filter/operation/output claims; ownership and artifact acceptance remain S1-04")
    recipe["producer_procedure"].append("v2: apply only AUT1-DELTA-PROPOSAL-01, preserve body/recipe v1 and frozen supplement1, and register seven external S1-04 semantic source identities; documentary byte checks only.")
    recipe["deterministic_receipt_generator"]="revisions/v2/apply.py"
    recipe["prior_receipt_generator"]="build_artifacts.py (v1; retained unchanged, do not rerun over v2)"
    recipe["artifacts"]=[meta("body.md") if a["path"]=="body.md" else a for a in recipe["artifacts"]]
    assert recipe["population"]==json.loads(recipe_bytes)["population"] and recipe["population"]["count"]==204
    write_json("recipe.json",recipe)
    before_body=meta("history/body-v1.md");after_body=meta("body.md")
    before_recipe=meta("history/recipe-v1.json");after_recipe=meta("recipe.json")
    caps={c["path"]:c for c in json.loads((ROOT/"captures.json").read_text())["captures"]}
    sources=[]
    for s in delta["supporting_source_ranges"]:
        c=caps[s["path"]];a,b=s["lines"]
        excerpt=b"".join((ROOT/c["capture_path"]).read_bytes().splitlines(keepends=True)[a-1:b])
        sources.append(dict(path=c["path"],commit=c["commit"],git_blob_sha=c["git_blob_sha"],
            sha256=c["sha256"],bytes=c["bytes"],archive=c["capture_path"],first_line=a,last_line=b,
            excerpt_sha256=sha(excerpt),excerpt_bytes=len(excerpt)))
    response=f'''# Resposta original do produtor — AUTOMATION-L1 v2

Apliquei somente `AUT1-DELTA-PROPOSAL-01`, autorizada pela principal. O corpo contém uma substituição literal em §1.1; as demais passagens permanecem byte a byte iguais. O suplemento1 e seu índice/recibo não foram alterados.

## Delta literal

Antes:

> {delta['exact_old_text']}

Depois:

> {delta['proposed_new_text']}

Offset de bytes UTF-8, base zero: início `{start}`; intervalo antigo `[{start}, {start+len(old)})`; intervalo novo `[{start}, {start+len(new)})`. Linha 1-based: `{body[:start].count(bytes([10]))+1}`. Prefixo e sufixo fora da substituição são idênticos.

## Identidades

| Versão | Arquivo | Bytes | SHA256 | Git blob SHA1 |
| --- | --- | ---: | --- | --- |
| Corpo v1 preservado | history/body-v1.md | {before_body['bytes']} | {before_body['sha256']} | {before_body['git_blob_sha']} |
| Corpo v2 | body.md | {after_body['bytes']} | {after_body['sha256']} | {after_body['git_blob_sha']} |
| Receita v1 preservada | history/recipe-v1.json | {before_recipe['bytes']} | {before_recipe['sha256']} | {before_recipe['git_blob_sha']} |
| Receita v2 | recipe.json | {after_recipe['bytes']} | {after_recipe['sha256']} | {after_recipe['git_blob_sha']} |

A evidência continua em `AUT1-C01` e `AUT1-C02`: `packages/core/src/actions.ts` linhas49–85 e `packages/core/src/actions/transport.ts` linhas14–67. As identidades completas das fontes e trechos estão em `delta.json`.

A receita v2 registra os sete inputs semânticos externos de S1-04, incluindo workflow.ts e run.ts, com commit/path/blob/SHA256/bytes e captura. O AGENTS de Schema é contexto instrucional separado. A população continua **204** nesta chave e **462** na subfatia; leitura cruzada não transfere propriedade nem aceita o artefato Schema.

Esta correção usa a evidência do próprio produtor. Não houve acesso a oracle ou julgamentos, teste de produto, execução de provider, alteração de produto ou escrita remota. Tokens/custo de modelo não expostos permanecem UNKNOWN.
'''
    (HERE/"response.md").write_text(response,encoding="utf-8")
    assert (ROOT/"body.md").read_bytes()==body[:start]+new+body[start+len(old):]
    assert (ROOT/"history/body-v1.md").read_bytes()==body
    assert (ROOT/"history/recipe-v1.json").read_bytes()==recipe_bytes
    for name,value in frozen.items():assert meta(name)==value,name
    record=dict(schema="genesis-producer-literal-revision/v1",task="AUTOMATION-L1",revision=2,
        proposal_id=delta["id"],status="APPLIED_DOCUMENTARY_CORRECTION_NO_JUDGMENT",
        request=meta("revisions/v2/request.txt"),response=meta("revisions/v2/response.md"),
        procedure=meta("revisions/v2/apply.py"),before=dict(body=before_body,recipe=before_recipe),
        after=dict(body=after_body,recipe=after_recipe),
        literal_delta=dict(section="1.1",old_text=delta["exact_old_text"],new_text=delta["proposed_new_text"],
            replacement_count=1,offset_basis="UTF-8 bytes, zero-based, end exclusive",
            old_byte_interval=[start,start+len(old)],new_byte_interval=[start,start+len(new)],
            first_line_1_based=body[:start].count(b"\n")+1,old_bytes=len(old),new_bytes=len(new),
            unchanged_prefix_sha256=sha(body[:start]),unchanged_suffix_sha256=sha(body[start+len(old):]),
            prefix_and_suffix_byte_identical=True),
        supporting_literal_blocks=delta["supporting_literal_blocks"],sources=sources,
        external_semantic_inputs=recipe["external_dependencies"],frozen_files_preserved=list(frozen.values()),
        counts=dict(local_population=204,subslice_population=462,external_semantic_inputs=7,external_population_effect=0),
        verification="byte equality, hashes, unique replacement and identity checks only",
        product_tests="NOT_RUN",provider_execution="NOT_RUN",oracle_access=False,judgment_access=False,
        remote_writes=0,model_tokens="UNKNOWN",model_cost="UNKNOWN")
    write_json("revisions/v2/delta.json",record)
    print(json.dumps(dict(body_v2=after_body,recipe_v2=after_recipe,delta=meta("revisions/v2/delta.json"),
        request=meta("revisions/v2/request.txt"),response=meta("revisions/v2/response.md"),
        literal_delta=record["literal_delta"],preserved=True),ensure_ascii=False,indent=2))

if __name__=="__main__":main()
