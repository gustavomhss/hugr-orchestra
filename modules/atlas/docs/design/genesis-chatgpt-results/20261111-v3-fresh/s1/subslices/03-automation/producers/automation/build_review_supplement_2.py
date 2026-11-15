"""Assemble literal evidence for automation-2 without changing frozen v2 or supplement1."""
from pathlib import Path
import hashlib
import json

ROOT=Path(__file__).resolve().parent
COMMIT="1cde2ff7a71bcf7aecb5d030917b577165135d38"
BODY_SHA="e9c89bea68d594bc61356ff461642ea23cd905d4584f2b52d32e10a5af984e55"
RECIPE_SHA="2bed1778e629415d5bc7c818773ef18b012a8a0bd4239d5bc85db6642b41a80e"
REQUEST="Confirmei o retorno v2; trate-o congelado. Execute agora suplemento2 para RE-AUT2-01..06 de J1 em relay/automation-2/j1-response.md; J2 está em avaliação e será incorporado quando o arquivo aparecer ou raiz avisar. Preserve body/recipe v2 e suplemento1, reaproveite blocos já presentes ao atender sobreposições. Atenda também eventuais pedidos públicos automation-3/4 quando relay os entregar, mas mantenha suplementos separados por lote para não bloquear o transporte já pronto. Não leia oracle ou avaliações reservadas. Escritas somente producers/automation. Trechos literais com cadeia chamador/ramo/resposta e offsets/hash, index/mapeamento de pedidos, sem recensus204 nem repetir histórico. Se achar inexatidão factual, registre proposta mínima e peça à raiz para aplicar, não silencie."

def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()
def ref(name):
    b=(ROOT/name).read_bytes()
    return dict(path=name,bytes=len(b),sha256=sha(b),git_blob_sha=blob(b))
def write_json(name,obj):
    (ROOT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

PARTS=[]
def part(q,path,anchors,subject,ranges=None):
    PARTS.append(dict(requests=["RE-AUT2-"+v for v in q.split(",")],path="packages/core/src/"+path,
        body_anchors=anchors.split(","),requested_subject=subject,ranges=ranges))

part("01","actions/github/commands.ts","A18","Chamador: captura e seleção do comando por kind")
part("01","actions/github/commands/inputs.ts","A18","Parser completo de definições/inputs dispatch, budgets/defaults/required/choices")
part("01","actions/github/commands/workflow.ts","A18","Schemas anteriores a dispatch e ramos enable/disable; dispatch12–47 reutilizado de AUT1-C38",[(1,11),(48,79)])
part("01","actions/github/commands/run.ts","A19","Imports/declarações anteriores ao ramo completo já transportado em AUT1-C39",[(1,9)])
part("01","actions/github/commands/job.ts","A19","Imports/declarações anteriores ao ramo completo já transportado em AUT1-C40",[(1,8)])
part("02","actions/gitlab/commands/native.ts","A20","Roles observados, project policies, ref e variables/cancellation")
part("02","actions/gitlab/commands/inputs.ts","A21","Inputs locais autoritativos, includes/constraints/defaults e gate de versão")
part("02","actions/gitlab/commands/launch.ts","A20","Planejamento de dispatch versus trigger e acknowledgment pipeline")
part("02","actions/gitlab/commands/merge-request.ts","A21","MR no mesmo projeto, ref head/merge e pós-condição nativa")
part("02","actions/gitlab/commands/shared.ts","A22","Imports anteriores a admit/target/source/pipeline completos em AUT1-C42",[(1,8)])
part("02","actions/gitlab/commands/runs.ts","A22","Imports anteriores a ramos completos em AUT1-C43",[(1,8)])
part("03,04","actions/resources.ts","A23","Roteamento de domínios, environments/deployments, artifact e schedule source.write")
part("03,04","actions/resources/native.ts","A23","Captura/selection/authority/versão/source e envio de recursos")
part("03,04","actions/resources/config-common.ts","A23","Schemas e guarda de contexto, projeto/ator/source/versão e execução em fases")
part("03","actions/resources/variables.ts","A24","Leitura/redaction, key/scope, rename/move, sealed box e zeroização local")
part("03","actions/resources/config-variable-github-page.ts","A24","Pagination conjunta de variables e secrets, sem fundir identidades")
part("03","actions/resources/config-sodium.d.ts","A24","Contrato local do módulo crypto usado pelo wrapper, não implementação criptográfica")
part("03","actions/resources/config-environment-schema.ts","A25","Schemas de environments/reviewers/refs GH e GL")
part("03","actions/resources/config-environment-reviewers.ts","A25","Reviews representáveis, read-only e lookup de identidade")
part("03","actions/resources/environments.ts","A26","Entrada list/execute e caminho runID para pending review")
part("03","actions/resources/config-environment-github.ts","A25","Reviewers/branch-tag policies/timer e plano multifase GH")
part("03","actions/resources/config-environment-gitlab.ts","A25","Estado stopped/delete, proteção e approvals representáveis GL")
part("03","actions/resources/config-deployment-review.ts","A26","Pending deployments por run/env, precondições/ator/versão e aprovação nativa")
part("03","actions/resources/policy.ts","A27","Policy/retention local versus configurações remotas e limites de edição")
part("04","actions/resources/caches.ts","A28","GH inventário/correspondência/delete; GL namespace/future jobs e versão do projeto")
part("04","actions/resources/gitlab-graphql.ts","A28,A29","Seam allowlisted GraphQL, cacheClear e ownerProject nativos")
part("04","actions/resources/runners.ts","A29","Ownership/labels/JIT/enrollment/assign/update/remove e saída efêmera")
part("04","actions/resources/schedules.ts","A30,A31","Owners/take-ownership/play, inputs/variables em fases e source.write GH; editores em AUT1-C28/C29")
part("04,06","actions/output/artifacts.ts","A35","Inventory GH/GL, ownership, versões e estados de artifact")
part("04,06","actions/output/mutations.ts","A37","Delete/keep completos com target/version/ownership e pós-condição")
part("04,06","actions/output/version.ts","A37","Campos selecionados de versão e expiry observada")
part("05","actions/transport/cli.ts","A32","CLI target/argv/stdin/ambiente, host/origin/path e ausência de shell no command builder")
part("05","actions/transport/credentials.ts","A33","Qualificação glab, token/config, CA/mTLS, arquivos regulares e limites")
part("05,06","actions/transport/gitlab.ts","A33","Snapshot por pedido, ator e write, rotas raw e framing de upload multipart")
part("05,06","actions/transport/http.ts","A33,A34","HTTPS verificado, phase sticky, request/body/backpressure/erro/abort e streams")
part("05","actions/transport/identity.ts","A32,A33","Parsers nativos de projeto/conta chamados pelo transporte")
part("05","actions/transport/response.ts","A34","Parsers headers/JSON/saída completa; failure56–76 reutilizado de AUT1-C45",[(1,55)])
part("05,06","actions/transport/process.ts","A32","Process capture/bytes: buffers/timeout, stdin, watchdog, scope, backpressure e exit após EOF")
part("06","actions/output/index.ts","A35,A36","Chamador de open(renew=true), recusa 206/content-range antes de body, watchdog e Scope/Pull")
part("06","actions/output/target.ts","A35","Targets/IDs/attempts/single-file path, ownership e endpoint exato")
part("04,06","actions/output/native.ts","A35","Schemas/ownership/erased/expired e parsers de outputs nativos")
part("06","actions/output/download.ts","A36","Open/redirect/renew antes de bytes, revalidação e renew=false")
part("06","actions/output/signed.ts","A36","HTTPS sem credenciais nativas, validação de cada hop, bounds e EOF completo")
part("06","actions/output/headers.ts","A36","Parsing e sanitização de filename/headers, digest como metadado")

REUSE={
 "RE-AUT2-01":["AUT1-C01","AUT1-C30","AUT1-C38","AUT1-C39","AUT1-C40","AUT1-X01","AUT1-X03","AUT1-X04","AUT1-X05"],
 "RE-AUT2-02":["AUT1-C01","AUT1-C12","AUT1-C13","AUT1-C41","AUT1-C42","AUT1-C43","AUT1-C44","AUT1-X01","AUT1-X03","AUT1-X04"],
 "RE-AUT2-03":["AUT1-C01","AUT1-C03","AUT1-C04","AUT1-C05","AUT1-C31","AUT1-C32","AUT1-C33","AUT1-C34","AUT1-X02","AUT1-X03","AUT1-X04","AUT1-X05"],
 "RE-AUT2-04":["AUT1-C01","AUT1-C28","AUT1-C29","AUT1-C32","AUT1-C33","AUT1-C34","AUT1-X03","AUT1-X04","AUT1-X05"],
 "RE-AUT2-05":["AUT1-C02","AUT1-C05","AUT1-C37","AUT1-C45","AUT1-X02"],
 "RE-AUT2-06":["AUT1-C01","AUT1-C02","AUT1-C05","AUT1-X05"],
}
CHAINS={
 "RE-AUT2-01":["Actions.execute → GitHubCommands.execute","capture/authority/source/actor → command plan","workflow/run/job → send → native acknowledgement"],
 "RE-AUT2-02":["Actions.execute → ActionsGitLabCommands.execute","admit + native role/policies + inputs → plan","single request → status check → plan.acknowledge → native pipeline/job ownership"],
 "RE-AUT2-03":["ActionsResources route → concrete config domain","selection/project/actor/source/version → planned phases","stage result → acknowledgement; CommandOutput stays outside operations/sql"],
 "RE-AUT2-04":["Resource capture/authority/version → cache/runner/schedule domain","native ownership/inventory/precondition → mutation(s) → acknowledgement/output","artifact mutation → OutputTarget/OutputNative ownership/state/version → delete/keep"],
 "RE-AUT2-05":["ActionsTransport request/resolve → CLI or GitLab transport","glab qualified snapshot → same snapshot actor + authenticated request","HTTP phase/write/read/response → safe classifier; multipart body under backpressure"],
 "RE-AUT2-06":["ActionsOutput.read → OutputTarget.resolve → OutputDownload.open(renew=true)","native redirect → OutputSigned.follow/open → pre-byte renewal if eligible","ActionsOutput.read rejects206/content-range → response.body → valid EOF and finalizers"],
}

def main():
    names=["body.md","recipe.json","review-supplement-1.md","review-supplement-1-index.json","review-supplement-1-receipt.json",
        "external-source-captures.json","coverage.jsonl","captures.json","history/body-v1.md","history/recipe-v1.json"]
    frozen={n:ref(n) for n in names}
    assert frozen["body.md"]["sha256"]==BODY_SHA and frozen["recipe.json"]["sha256"]==RECIPE_SHA
    prior=json.loads((ROOT/"review-supplement-1-index.json").read_text())
    prior_blocks={b["block_id"]:b for b in prior["literal_blocks"]}
    caps={c["path"]:c for c in json.loads((ROOT/"captures.json").read_text())["captures"]}
    public_path="../../relay/automation-2/j1-response.md"
    public_ref={**ref(public_path),"judge_id":"J1","origin":"public_request_relay","repository_commit":None}
    public_text=(ROOT/public_path).read_text()
    assert all(q in public_text for q in REUSE)
    j2_path="../../relay/automation-2/j2-response.md"
    j2_ref={**ref(j2_path),"judge_id":"J2","origin":"public_request_relay","repository_commit":None}
    j2_text=(ROOT/j2_path).read_text()
    assert all(f"RE-AUT2-{n:02d}" in j2_text for n in range(1,5))
    j2_groups={"RE-AUT2-01":["RE-AUT2-01","RE-AUT2-02"],"RE-AUT2-02":["RE-AUT2-03","RE-AUT2-04"],
        "RE-AUT2-03":["RE-AUT2-05"],"RE-AUT2-04":["RE-AUT2-06"]}
    body=(ROOT/"body.md").read_bytes();old=(ROOT/"history/body-v1.md").read_bytes()
    a=body.index(b"## 4.");b=body.index(b"## 6.")
    oa=old.index(b"## 4.");ob=old.index(b"## 6.")
    assert body[a:b]==old[oa:ob]
    additional=json.loads((ROOT/"external-source-captures-supplement-2.json").read_text())["captures"][0]
    source=(ROOT/additional["capture_path"]).read_bytes()
    assert sha(source)==additional["sha256"] and blob(source)==additional["git_blob_sha"]
    assert additional["path"] not in caps

    out=bytearray();blocks=[]
    def put(s):out.extend(s.encode("utf-8"))
    def emit(block_id,c,ranges,requests,anchors,subject,category="owned_population_source"):
        raw=(ROOT/c["capture_path"]).read_bytes()
        assert sha(raw)==c["sha256"] and blob(raw)==c["git_blob_sha"] and len(raw)==c["bytes"]
        lines=raw.splitlines(keepends=True)
        ranges=ranges or [(1,len(lines))]
        block=dict(block_id=block_id,type="literal_source_excerpt",request_namespace="J1 canonical groups; J2 mapping in index",requests=requests,body_anchors=anchors,
            requested_subject=subject,source_category=category,path=c["path"],archive=c["capture_path"],commit=c["commit"],
            source_git_blob_sha=c["git_blob_sha"],source_sha256=c["sha256"],source_bytes=c["bytes"],intervals=[])
        start=len(out);put("\n## "+block_id+"\n\n```json\n"+json.dumps({k:v for k,v in block.items() if k!="intervals"},ensure_ascii=False,separators=(",",":"))+"\n```\n")
        for lo,hi in ranges:
            assert 1<=lo<=hi<=len(lines),(block_id,lo,hi,len(lines))
            excerpt=b"".join(lines[lo-1:hi]);info=dict(first_line=lo,last_line=hi,bytes=len(excerpt),sha256=sha(excerpt))
            put("\n```json\n"+json.dumps(info,separators=(",",":"))+"\n```\n\n~~~~typescript\n")
            info["literal_content_byte_start"]=len(out);out.extend(excerpt);info["literal_content_byte_end_exclusive"]=len(out)
            if not excerpt.endswith(b"\n"):put("\n")
            put("~~~~\n");block["intervals"].append(info)
        block["supplement_byte_start"]=start;block["supplement_byte_end_exclusive"]=len(out)
        block["transport_sha256"]=sha(bytes(out[start:]));blocks.append(block)

    put("# Suplemento literal de revisão 2 — AUTOMATION-L1\n\n```json\n"+json.dumps(dict(
        type="documentary_transport_header",review_batch="automation-2",body_sha256=BODY_SHA,recipe_sha256=RECIPE_SHA,
        body_sections=[4,5],body_utf8_byte_interval=[a,b],body_section_bytes_unchanged_from_v1=True,
        source_commit=COMMIT,public_requests=[public_ref,j2_ref],request_namespace="J1 canonical groups",requests=list(REUSE),j2_group_mapping=j2_groups,
        prior_literal_source="review-supplement-1.md",reuse_rule="Referenced blocks retain exact frozen bytes and hashes; do not re-send duplicates",
        shared_population_reconciliation="review-supplement-1-index.json#/shared_population_reconciliation",
        population_recount_performed=False,historical_body_repeated=False,tests="NOT_RUN",provider_execution="NOT_RUN",
        evidence_authority="raw_source_and_typed_mechanical_index; no judgment or acceptance"),ensure_ascii=False,indent=2)+"\n```\n")
    reused=[]
    for q,ids in REUSE.items():
        records=[]
        for bid in ids:
            src=prior_blocks[bid]
            item=dict(request_id=q,block_id=bid,supplement="review-supplement-1.md",supplement_sha256=frozen["review-supplement-1.md"]["sha256"],
                byte_start=src["supplement_byte_start"],byte_end_exclusive=src["supplement_byte_end_exclusive"],
                transport_sha256=src["transport_sha256"],source_path=src["repository_path"],source_commit=src["commit"],
                source_git_blob_sha=src["source_git_blob_sha"],source_sha256=src["source_sha256"],
                source_line_intervals=[[v["first_line"],v["last_line"]] for v in src["intervals"]])
            records.append(item);reused.append(item)
        put("\n## "+q+" — blocos reutilizados\n\n```json\n"+json.dumps(dict(type="mechanical_literal_block_references",request_id=q,
            requested_chain=CHAINS[q],blocks=records),ensure_ascii=False,indent=2)+"\n```\n")
    for n,p in enumerate(PARTS,1):
        emit(f"AUT2-C{n:02d}",caps[p["path"]],p["ranges"],p["requests"],p["body_anchors"],p["requested_subject"])
    emit("AUT2-X01",additional,None,["RE-AUT2-03","RE-AUT2-04","RE-AUT2-06"],["A23","A35"],
        "ResourceKind/ResourceListInput/TransferInput/TransferInfo consumidos pelo Core","external_S1_04_raw_source")
    (ROOT/"review-supplement-2.md").write_bytes(out)
    mapped=[]
    for q,ids in REUSE.items():
        local=[x for x in blocks if q in x["requests"]]
        mapped.append(dict(judge_id="J1",request_id=q,public_request_origin=public_ref,new_literal_block_ids=[x["block_id"] for x in local],
            reused_block_ids=ids,requested_chain=CHAINS[q],new_literal_bytes=sum(v["bytes"] for x in local for v in x["intervals"]),
            status="EVIDENCE_SUPPLIED_NOT_JUDGED"))
    j2_mapped=[]
    for q,groups in j2_groups.items():
        local=[x for x in blocks if set(groups)&set(x["requests"])]
        j2_mapped.append(dict(judge_id="J2",request_id=q,public_request_origin=j2_ref,canonical_J1_request_groups=groups,
            new_literal_block_ids=[x["block_id"] for x in local],
            reused_block_ids=list(dict.fromkeys(b for group in groups for b in REUSE[group])),
            status="EVIDENCE_SUPPLIED_NOT_JUDGED"))
    index=dict(schema="genesis-review-supplement-index/v1",task="AUTOMATION-L1",review_batch="automation-2",
        principal_request_original=REQUEST,body_ref=frozen["body.md"],recipe_ref=frozen["recipe.json"],
        body_scope=dict(sections=[4,5],utf8_byte_interval=[a,b],sha256=sha(body[a:b]),v1_byte_interval=[oa,ob],v1_v2_section_bytes_equal=True),
        public_request_refs=[public_ref,j2_ref],supplement=ref("review-supplement-2.md"),request_namespace="J1 canonical groups",request_map=mapped,judge_J2_request_map=j2_mapped,
        literal_blocks=blocks,reused_literal_blocks=reused,
        shared_population_reconciliation=dict(index_ref=frozen["review-supplement-1-index.json"],json_pointer="/shared_population_reconciliation",new_census=False,new_rows=0),
        external_additional_input=dict(manifest=ref("external-source-captures-supplement-2.json"),source=additional,
            frozen_recipe_v2_modified=False,prior_external_manifest_modified=False,population_effect=0,
            integration_note="One additional raw schema source input for principal to account for; no S1-04 artifact acceptance"),
        specific_chain_206=dict(request_id="RE-AUT2-06",caller="packages/core/src/actions/output/index.ts",lines=[43,50],
            literal_block_id="AUT2-C39",helper="packages/core/src/actions/output/download.ts",helper_accepts_2xx=True,
            source_observation="caller checks status206 or content-range after open and before returning response.body",
            defect_or_runtime_result="NOT_ASSERTED"),
        proposed_deltas=[],body_changes_applied=[],recipe_changes_applied=[],
        j2_status="PUBLIC_REQUEST_READ_AND_MAPPED",future_public_requests="separate addendum if required; preserve frozen supplement bytes",
        other_batches="Separate supplements for automation-3/4 when public requests arrive",tests="NOT_RUN",provider_execution="NOT_RUN")
    write_json("review-supplement-2-index.json",index)
    rendered=(ROOT/"review-supplement-2.md").read_bytes()
    for block in blocks:
        src=(ROOT/block["archive"]).read_bytes().splitlines(keepends=True)
        for v in block["intervals"]:
            expected=b"".join(src[v["first_line"]-1:v["last_line"]])
            actual=rendered[v["literal_content_byte_start"]:v["literal_content_byte_end_exclusive"]]
            assert expected==actual and sha(actual)==v["sha256"]
    prior_bytes=(ROOT/"review-supplement-1.md").read_bytes()
    for item in reused:assert sha(prior_bytes[item["byte_start"]:item["byte_end_exclusive"]])==item["transport_sha256"]
    for name,value in frozen.items():assert ref(name)==value,name
    prior_owned={v["repository_path"] for v in prior["literal_blocks"] if v["source_category"]=="owned_population_source"}
    joined_owned=prior_owned|{v["path"] for v in blocks if v["source_category"]=="owned_population_source"}
    assert len(joined_owned)==83
    response=f'''# Resposta original do produtor — suplemento2

Entreguei os trechos literais adicionais para os seis grupos públicos de J1 e os quatro grupos públicos de J2 em automation-2 (§4–5). O índice distingue os namespaces: J2-01 → J1-01/02; J2-02 → J1-03/04; J2-03 → J1-05; J2-04 → J1-06.

São **45 blocos novos**, relativos a **44 fontes Core já capturadas e um schema externo**, com **28 blocos únicos do suplemento1 reutilizados** por identidade/offset/hash. A união mecânica dos paths Core com trechos nos suplementos1–2 tem 83 implementações Actions; isso não é aceite semântico. Não refiz o censo204 nem repeti o histórico: a reconciliação compartilhada continua no índice congelado do suplemento1.

O caminho de partial content está literal em `AUT2-C39`, `output/index.ts` linhas43–50: após `OutputDownload.open(..., true)`, o chamador recusa status206 ou content-range antes de devolver response.body. `AUT2-C42/C43`, `AUT2-C35/C38` completam download/URLs assinadas/HTTP/processo e a finalização. Isso é observação de fonte, sem download ou execução de provider.

O schema adicional `packages/schema/src/actions/resource.ts` está em `external-sources/`, com manifesto próprio `external-source-captures-supplement-2.json`. Dono S1-04, baseline fixado, fora204/462; não modifica a receita v2 nem o manifesto externo anterior. A principal deve registrar esse input bruto adicional na materialização pertinente; não há aceite de artefato Schema.

Corpo v2 SHA256: `{BODY_SHA}`. Receita v2 SHA256: `{RECIPE_SHA}`. Ambos, suplemento1, seus índice/recibo e as capturas/disposições originais verificadas permanecem idênticos. Não proponho novo delta factual neste lote.

Suplemento2: `{ref('review-supplement-2.md')['sha256']}` ({ref('review-supplement-2.md')['bytes']} bytes). Índice: `{ref('review-supplement-2-index.json')['sha256']}` ({ref('review-supplement-2-index.json')['bytes']} bytes).

A verificação é documental: cada intervalo foi comparado byte a byte ao archive e cada bloco reutilizado ao suplemento congelado. Testes de produto/provider: NOT_RUN. Nenhum oracle, avaliação reservada, escrita remota ou mudança de produto. Julgamento/aceite não são realizados pelo produtor. Lotes3–4 terão suplementos próprios quando seus pedidos públicos chegarem.
'''
    (ROOT/"review-supplement-2-response.md").write_text(response,encoding="utf-8")
    receipt=dict(schema="genesis-review-supplement-receipt/v1",task="AUTOMATION-L1",review_batch="automation-2",producer="/root/automation_l1",
        outputs=[ref("review-supplement-2.md"),ref("review-supplement-2-index.json"),ref("review-supplement-2-response.md"),ref("external-source-captures-supplement-2.json"),ref("build_review_supplement_2.py")],
        preserved_files=list(frozen.values()),new_literal_blocks=len(blocks),new_owned_source_files=len(PARTS),new_external_source_files=1,
        reused_unique_blocks=len({v["block_id"] for v in reused}),literal_bytes_equal=True,reused_transport_bytes_equal=True,
        unique_Core_source_paths_with_literal_blocks_in_supplements_1_2=len(joined_owned),join_authority="mechanical source-path union, not semantic acceptance or new census204",
        original_hashes_equal=True,recount204=False,history_repeated=False,product_tests="NOT_RUN",provider_execution="NOT_RUN",
        oracle_access=False,remote_writes=0,judgment="NOT_PERFORMED",proposed_deltas=[],model_tokens="UNKNOWN",model_cost="UNKNOWN")
    write_json("review-supplement-2-receipt.json",receipt)
    print(json.dumps(dict(outputs=receipt["outputs"],receipt=ref("review-supplement-2-receipt.json"),
        new_literal_blocks=len(blocks),reused_unique_blocks=receipt["reused_unique_blocks"],request_map=mapped,judge_J2_request_map=j2_mapped,proposed_deltas=[]),ensure_ascii=False,indent=2))

if __name__=="__main__":main()
