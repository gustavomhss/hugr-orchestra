"""Literal/typed documentary transport for RE-AUT1-01..06; no product execution."""
from pathlib import Path
import collections
import hashlib
import json
import runpy

ROOT = Path(__file__).resolve().parent
INPUTS = ROOT.parent.parent / "inputs"
COMMIT = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
BODY_SHA = "2ed7670affc680005840d0918489cb1ac36e1c5a4021defcc57ae44186ae7459"
REQUEST = """J1 e J2 revisaram automation-1 (§0–3, bodysha2ed767...) e ambos pediram evidência adicional, sem contradição demonstrada/FIX-FIRST. Preserve corpo e originais. Produza review-supplement-1.md + índice/recibo, apenas literal/mecânico tipado. Perguntas coincidentes: RE-AUT1-01 histórico automation4377bytes e lacunas/continuidade; projeção coverage porpath/role/readdepth/necessidade e correspondência às seções, com reconciliação204uma vez compartilhável. 02 fachada serviços lazy; bindingcanonicalização/matching/resoluçãofísica/subprocessoGit/limites/create/update/policyidentidadeimutável/revisão;stateexternaldecode/corrupção/symlink/permissões/mutex/write. 03 (J1) parsers IDs/commits e paginação/filtros completos GH/GL, commit/path/versões, único slotGL ci_config_path, jobsGH run/attempt rechecados, GLduascoleções, metadatafeaturegates. 04 parserdocument const/config/aplicaçãolimites/YAML/duplicate/alias/merge;graph/GHneeds/ciclos;GLextendsordemprecedência/arrays/default/includes/references/optionalneeds/partial. 05 authoring schemas/snapshotbeforeawait/extra/payloadporop;create/updatefileGH/GL precondsversão/textoigual/absent/ack/readbackprojectactorhead;branch/reviewPRMRretorno;falhaapóswrite/semretryrollback/reflexãopayload;lintresultado +editoresschedule (A31podeemlotefuturo,comvínculo). 06 ledgerintentnormalization/schemaack/persistedfieldssemsegredopayload;Location/project/directory/workspace/provideractor;constantslease/deadline/retention;unavailable/checkedAck/definitive/finalize/Scopefibers/recoverysending1vezpordb;reconcile/mergeIDs/início readback anteslinha14;ackconcretoretryGH/GL A19/A22. Use branches completos quando provarausência/ordem; selecionar para todasasafirmações do corpo pertinente, semenviar testes repetitivos. Papéis de algunsIDs deJ2fundem02/03 e05/06, masperguntas sãoequivalentes. Se encontrarerrofactual, proponhadeltamínimopreservandov1; nãocorrijasemregistro. Nenhumtestedeproduto ou execprovider, nenhumoracle/juiz. Outroslotes2–4ainda serãoavaliados; esteé1. Finalizeapósentregarpara liberar slot."""
EXTERNAL_AUTHORIZATION = """Pode capturar diretamente pelo conector GitHub, SOMENTE leitura no baseline1cde2ff7a71bcf7aecb5d030917b577165135d38. COMMON permite leitura cruzada sem transferir propriedade. Não tenho captura confirmada de packages/schema/src/actions aqui. Descubra path real/AGENTS aplicáveis e leia apenas schema necessário aos claims do Core; salve em external-sources/ e external-source-captures.json com commit/path/blob/SHA/bytes/dono S1-04, claramente FORA da população204. Trate como evidência bruta, não aceite do artefato schema nem garantia externa. Não escreva no produto nem peça outroagente. Avise quais arquivos são inputs semânticos necessários para eu acrescentar refs/materialização/impacto ao transporte sem inflar a contagem462."""


def sha(data):
    return hashlib.sha256(data).hexdigest()


def blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def write_json(name, value):
    (ROOT/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")


def ref(path):
    b = (ROOT/path).read_bytes()
    return dict(path=path, bytes=len(b), sha256=sha(b), git_blob_sha=blob(b))


# Each listed range is literal and inclusive. Shared files appear once, with multiple request IDs.
PARTS = []
def part(questions, path, ranges, anchors, subject):
    PARTS.append(dict(requests=["RE-AUT1-"+q for q in questions.split(",")], path=path,
                      ranges=ranges, body_anchors=anchors.split(","), requested_subject=subject))

part("02,05,06", "actions.ts", [(49,216)], "A01,A15,A17", "Composição da fachada, lazy store/operations/output, snapshot e roteamento de execute/reconcile")
part("02", "actions/transport.ts", [(14,67)], "A01,A32", "Composição do transporte e momento de request/resolve")
part("02", "actions/binding.ts", [(12,161)], "A02", "Resolução física e Git; target, create/update/policy; matching remoto completo")
part("02", "actions/state.ts", [(8,166)], "A02", "Canonical/locationKey, estado externo, read/decode/parents/physical/write, identidade/provider/path")
part("02,06", "actions/contract.ts", [(8,88)], "A01,A15,A17", "Interfaces que separam transporte, operação, acknowledgment e output")
part("03", "actions/cursor.ts", [(1,82)], "A03", "Schema/identidade de cursor, filtros, next/total/limit/fingerprint")
part("03", "actions/github/native.ts", [(9,121)], "A04", "IDs/SHAs/ref/path, repository ID e paginação completa")
part("03", "actions/github/catalog.ts", [(13,89)], "A03,A04", "Workflow, commit/path/bytes/sourceVersion e capabilities")
part("03", "actions/github/runs.ts", [(10,120)], "A05", "Schemas, filtros/list/get, projeção e created-range")
part("03", "actions/github/jobs.ts", [(10,61)], "A05", "Tentativa fixada, endpoints e checks de run/attempt/job")
part("03", "actions/github/index.ts", [(8,17)], "A04", "Composição do adapter GitHub")
part("03", "actions/gitlab/native.ts", [(12,170)], "A06", "Schemas/IDs/SHAs, projeto/pipeline, metadata/version, slot/configPath e paginação")
part("03", "actions/gitlab/catalog.ts", [(10,87)], "A06", "Slot/configuração, fonte local, path/commit/blob/last_commit_id e capabilities")
part("03", "actions/gitlab/runs.ts", [(10,116)], "A07", "Filtros nativos, metadata gates, tempos e ausência de attempt fabricado")
part("03", "actions/gitlab/jobs.ts", [(10,69)], "A07", "Jobs/bridges em faixas de cursor, include_retried e ownership")
part("03", "actions/gitlab/index.ts", [(5,11)], "A06", "Composição do adapter GitLab")
part("04", "actions/source/document.ts", [(1,276)], "A08", "Constantes e todas as aplicações: preflight lexical/CST, composição, YAML, aliases/merges/duplicatas/Json")
part("04", "actions/source/graph.ts", [(1,74)], "A09", "Grafo, estados de resolução, needs, ciclo e inputs")
part("04", "actions/source/github.ts", [(1,62)], "A09", "Jobs/needing/cycle input, matrix/reusable/condition")
part("04", "actions/source/gitlab.ts", [(1,240)], "A10", "Includes/references, extends, precedence/arrays, defaults, needs optional/external e partial")
part("05", "actions/authoring/input.ts", [(9,124)], "A11", "Payloads strict, bytes/path/ref, captura/fields por kind e versões/precondições")
part("05", "actions/authoring/base.ts", [(14,72)], "A11", "Default branch observada, commit-base e revalidação de draft")
part("05", "actions/authoring/index.ts", [(16,52)], "A11,A14", "Snapshot, validação/lint, seleção do plano e uma execução")
part("05", "actions/authoring/github.ts", [(11,99)], "A12", "Schemas de retorno e ramos branch/create/update/review/head completos")
part("05", "actions/authoring/gitlab.ts", [(10,101)], "A13", "Schemas de retorno e ramos branch/create/update/MR/head completos")
part("05", "actions/authoring/remote.ts", [(12,129)], "A14", "before/after, actor/absent/current/written/readSource/reviewURL/send completos")
part("05", "actions/authoring/lint.ts", [(1,30)], "A14", "Opções CI lint e propagação de resultado/erro para resolução local")
part("05", "actions/authoring/schedule.ts", [(1,77)], "A14", "Editor de autoria de on.schedule completo")
part("05", "actions/resources/schedule-yaml.ts", [(1,81)], "A31", "Segundo editor de on.schedule e suas restrições, já transportado neste lote")
part("05,06", "actions/github/commands/common.ts", [(16,166)], "A18", "Preflight/autoridade GitHub usada por autoria; source/run e send")
part("06", "actions/operations.ts", [(16,204)], "A15,A16,A17", "Location/Scope, get/prepare/execute/reconcile completos")
part("06", "actions/operations/sql.ts", [(1,35)], "A15", "Todos os campos persistidos e unicidade")
part("06", "actions/operations/storage.ts", [(9,142)], "A16", "Constants, access/matches/unavailable/sweep/recover/finalize/identity completos")
part("06", "actions/operations/outcome.ts", [(1,40)], "A16,A17", "Decode estrito, definitive, combine, attributed e checked ack/observation")
part("06", "actions/operations/readback.ts", [(1,27)], "A17", "Reconcile update/CAS completo")
part("06", "actions/readback.ts", [(1,35)], "A17", "Observador completo, incluindo assinatura/imports anteriores à linha14")
part("06", "actions/error.ts", [(1,6)], "A16", "Tipo de erro Actions usado por definitive")
part("06", "actions/github/commands/workflow.ts", [(12,47)], "A18", "Ack concreto dispatch 204 versus identidade nativa 200")
part("06", "actions/github/commands/run.ts", [(10,59)], "A19", "Retry/cancel/delete/fork e acknowledgments concretos")
part("06", "actions/github/commands/job.ts", [(9,33)], "A19", "Retry de job e acknowledgment sem nova tentativa fabricada")
part("06", "actions/gitlab/commands.ts", [(8,33)], "A22", "Preflight plan, send único e qualificação de acknowledgment GitLab")
part("06", "actions/gitlab/commands/shared.ts", [(9,83)], "A22", "Intent estrito, target/commit/source, parser do ack pipeline")
part("06", "actions/gitlab/commands/runs.ts", [(9,47)], "A22", "Retry/cancel/delete/rename e acknowledgment pipeline concreto")
part("06", "actions/gitlab/commands/jobs.ts", [(13,133)], "A22", "Ramos job/bridge, novo jobID retry e readback após escrita")
part("05,06", "actions/transport/response.ts", [(56,76)], "A34", "Classificador de resposta: prova positiva de rejeição, não stderr vago")

EXTERNAL = [
 ("packages/schema/src/actions.ts", [(1,18)], ["02","05","06"], "Barrel canônico consumido por Core"),
 ("packages/schema/src/actions/identity.ts", [(1,93)], ["02","06"], "Binding/provider/ref/policy/error e IDs públicos"),
 ("packages/schema/src/actions/operation.ts", [(1,79)], ["05","06"], "Kind/target/expected/intent/ack/observation/operation versus execute payload"),
 ("packages/schema/src/actions/command.ts", [(1,68)], ["05","06"], "Payloads tipados e CommandOutput separado do recibo"),
 ("packages/schema/src/schema.ts", [(1,23)], ["02","05","06"], "PositiveInt/optional/statics usados pelos schemas"),
 ("packages/schema/src/actions/workflow.ts", None, ["03","04","05"], "Schemas SourceBase/Source/Graph/ListInput efetivamente usados na validação do Core"),
 ("packages/schema/src/actions/run.ts", None, ["03"], "Schemas Run/Job/RunListInput e paginação efetivamente usados pelos adapters")
]

# Include input schemas before the adapter functions; a declaration is never cut in half.
for item in PARTS:
    if item["path"] in {
        "actions/github/catalog.ts","actions/github/runs.ts","actions/github/jobs.ts",
        "actions/gitlab/catalog.ts","actions/gitlab/runs.ts","actions/gitlab/jobs.ts",
        "actions/github/commands/common.ts","actions/gitlab/commands.ts","actions/gitlab/commands/jobs.ts",
    }:
        item["ranges"]=[(1,item["ranges"][-1][1])]


def main():
    preserved_names=["body.md","recipe.json","request.txt","captures.json","coverage.jsonl","response.md",
        "evidence.md","evidence-review.md","document-integrity.json","build_artifacts.py","capture-ledger.jsonl","capture_save.py"]
    preserved={p:ref(p) for p in preserved_names}
    assert preserved["body.md"]["sha256"]==BODY_SHA
    caps=json.loads((ROOT/"captures.json").read_text())["captures"]
    captured={c["path"]:c for c in caps}
    coverage=[json.loads(l) for l in (ROOT/"coverage.jsonl").read_text().splitlines()]
    source_population=[json.loads(l) for l in (INPUTS/"sources.jsonl").read_text().splitlines()]
    expected={s["path"]:s for s in source_population if s["legacy_artifact_key"]=="s1.core.automation"}
    assert len(caps)==len(coverage)==len(expected)==204
    assert {c["path"] for c in coverage}==set(captured)==set(expected)
    for c in caps:
        b=(ROOT/c["capture_path"]).read_bytes()
        assert len(b)==c["bytes"] and sha(b)==c["sha256"]
        assert blob(b)==c["git_blob_sha"]==expected[c["path"]]["git_blob_sha"]
    external=json.loads((ROOT/"external-source-captures.json").read_text())
    ext={c["path"]:c for c in external["captures"]}
    for c in ext.values():
        b=(ROOT/c["capture_path"]).read_bytes()
        assert sha(b)==c["sha256"] and blob(b)==c["git_blob_sha"] and len(b)==c["bytes"]
        assert c["path"] not in expected and c["population_member"] is False

    # This reads only the producer's previous metadata definitions; no product module is executed.
    plans=runpy.run_path(str(ROOT/"build_artifacts.py"))["PLAN"]
    sections={a["id"]:[int(x.strip()) for x in a["body_section"].split(",")] for a in plans}
    projected=[]
    for c in coverage:
        ids=c["evidence_ids"]
        concrete=sorted({section for anchor in ids for section in sections[anchor]})
        projected.append(dict(path=c["path"],git_blob_sha=c["git_blob_sha"],sha256=c["sha256"],bytes=c["bytes"],
            role=c["role"],read_depth=c["read_depth"],need=c["need"],artifact=c["artifact"],
            disposition=c["disposition"],body_anchors=ids,body_sections=concrete or [13],
            section_mapping_type="recorded_anchor_to_body_section" if concrete else "validation_inventory_only_section_13",
            execution_status=c["execution_status"]))
    assert len({c["path"] for c in projected})==204

    inputs=json.loads((INPUTS/"inputs.json").read_text())
    hist=next(v for v in inputs["bodies"] if v["artifact_key"]=="s1.core.automation")
    hist_body=(INPUTS/"history/bodies/automation.md").read_bytes()
    assert len(hist_body)==4377 and sha(hist_body)==hist["body"]["sha256"] and blob(hist_body)==hist["body"]["git_blob_sha"]
    hist_projection_path=INPUTS/"history/coverage-needs-projection.json"
    hp=json.loads(hist_projection_path.read_text())
    old_artifact=next(a for a in hp["artifacts"] if a["original_artifact"]["key"]=="s1.core.automation")
    historical_refs={}
    for filename, ending in [("a3-dossier.md","l1-a3-v1-dossier.md"),("a4-dossier.md","l1-a4-v1-dossier.md"),("coverage-needs-projection.json","coverage-needs-projection.json")]:
        meta=next(m for m in inputs["decisive_history"] if m["path"].endswith(ending))
        b=(INPUTS/"history"/filename).read_bytes()
        assert len(b)==meta["byte_length"] and blob(b)==meta["git_blob_sha"]
        historical_refs[filename]={**meta,"sha256":sha(b),"archive":"../../inputs/history/"+filename}

    blocks=[]
    out=bytearray()
    def put(text): out.extend(text.encode("utf-8"))
    def literal(block_id, requests, archive, metadata, ranges, kind, anchors, subject, language="typescript"):
        raw=(ROOT/archive).read_bytes()
        lines=raw.splitlines(keepends=True)
        record=dict(block_id=block_id,type="literal_source_excerpt",requests=requests,source_category=kind,
            archive=archive,repository_path=metadata["path"],commit=metadata["commit"],
            source_git_blob_sha=metadata["git_blob_sha"],source_sha256=sha(raw),source_bytes=len(raw),
            body_anchors=anchors,requested_subject=subject,intervals=[])
        start=len(out)
        put(f"\n## {block_id}\n\n")
        put("```json\n"+json.dumps({k:v for k,v in record.items() if k!="intervals"},ensure_ascii=False,separators=(",",":"))+"\n```\n")
        for a,b in ranges:
            assert 1<=a<=b<=len(lines),(block_id,archive,a,b,len(lines))
            rawpart=b"".join(lines[a-1:b])
            interval=dict(first_line=a,last_line=b,bytes=len(rawpart),sha256=sha(rawpart))
            put("\n```json\n"+json.dumps(interval,separators=(",",":"))+"\n```\n\n~~~~"+language+"\n")
            interval["literal_content_byte_start"]=len(out)
            out.extend(rawpart)
            interval["literal_content_byte_end_exclusive"]=len(out)
            if not rawpart.endswith(b"\n"):put("\n")
            put("~~~~\n")
            record["intervals"].append(interval)
        record["supplement_byte_start"]=start
        record["supplement_byte_end_exclusive"]=len(out)
        record["transport_sha256"]=sha(bytes(out[start:]))
        blocks.append(record)

    put("# Suplemento literal de revisão 1 — AUTOMATION-L1\n\n")
    put("```json\n"+json.dumps(dict(type="documentary_transport_header",task="AUTOMATION-L1",review_batch="automation-1",
        body_sha256=BODY_SHA,body_sections=[0,1,2,3],source_commit=COMMIT,
        requests=[f"RE-AUT1-{n:02d}" for n in range(1,7)],
        coverage_projection="review-supplement-1-index.json#/shared_population_reconciliation",
        coverage_projection_reuse="One 204-row projection, shared by both judges and later review batches",
        source_text="literal_unmodified",metadata="typed_mechanical_projection",
        tests="NOT_RUN",provider_execution="NOT_RUN",oracle_access=False,body_v1_changed=False,
        cross_scope_sources="raw_source_only; S1-04 ownership retained; outside population 204",
        proposition_authority="producer evidence submission; no judgment or acceptance"),ensure_ascii=False,indent=2)+"\n```\n")
    literal("AUT1-H01",["RE-AUT1-01"],"../../inputs/history/bodies/automation.md",hist["body"],[(1,len(hist_body.splitlines()))],
        "historical_body",[],"Corpo histórico integral de 4.377 bytes","markdown")
    literal("AUT1-H02",["RE-AUT1-01"],"../../inputs/history/a3-dossier.md",historical_refs["a3-dossier.md"],[(414,428)],
        "historical_gap_record",[],"Gaps originais e continuidade registrada","markdown")
    literal("AUT1-H03",["RE-AUT1-01"],"../../inputs/history/a4-dossier.md",historical_refs["a4-dossier.md"],[(299,301),(347,349)],
        "historical_authority_record",[],"Regras históricas de leitura de folhas e preservação de estado","markdown")
    put("\n## AUT1-H04\n\n```json\n"+json.dumps(dict(type="mechanical_json_projection",requests=["RE-AUT1-01"],
        source=historical_refs["coverage-needs-projection.json"],
        selector='artifacts[original_artifact.key == "s1.core.automation"]',record=old_artifact),ensure_ascii=False,indent=2)+"\n```\n")
    for n,p in enumerate(PARTS,1):
        path="packages/core/src/"+p["path"]
        c=captured[path]
        literal(f"AUT1-C{n:02d}",p["requests"],c["capture_path"],c,p["ranges"],"owned_population_source",p["body_anchors"],p["requested_subject"])
    for n,(path,ranges,questions,subject) in enumerate(EXTERNAL,1):
        c=ext[path]
        if ranges is None:
            ranges=[(1,len((ROOT/c["capture_path"]).read_bytes().splitlines()))]
        literal(f"AUT1-X{n:02d}",["RE-AUT1-"+q for q in questions],c["capture_path"],c,ranges,
                "external_S1_04_raw_source",[],subject)
    (ROOT/"review-supplement-1.md").write_bytes(out)

    question_map=[]
    for n in range(1,7):
        q=f"RE-AUT1-{n:02d}"
        qblocks=[b for b in blocks if q in b["requests"]]
        question_map.append(dict(request_id=q,literal_block_ids=[b["block_id"] for b in qblocks],
            literal_bytes=sum(i["bytes"] for b in qblocks for i in b["intervals"]),
            shared_projection="shared_population_reconciliation" if n==1 else None,
            extra_json_projection="AUT1-H04" if n==1 else None,
            submitted_status="EVIDENCE_SUPPLIED_NOT_JUDGED"))
    proposal=dict(id="AUT1-DELTA-PROPOSAL-01",type="minimal_factual_wording_precision_proposal",
        applied=False,body_sha256=BODY_SHA,section="1.1",
        exact_old_text="Binding e serviços são construídos por necessidade.",
        proposed_new_text="A resolução do binding, a inicialização cached de operations e o carregamento de output são adiados; transport, readers e resources são compostos ao construir a fachada.",
        supporting_literal_blocks=["AUT1-C01","AUT1-C02"],
        supporting_source_ranges=[dict(path="packages/core/src/actions.ts",lines=[49,85]),dict(path="packages/core/src/actions/transport.ts",lines=[14,67])],
        reason_type="Avoid implying that every service is constructed lazily; preserve the narrower non-Git boot statement",
        judgment="NOT_ASSERTED_BY_PRODUCER")
    index=dict(schema="genesis-review-supplement-index/v1",task="AUTOMATION-L1",review_batch="automation-1",
        request_original=REQUEST,additional_authorization_original=EXTERNAL_AUTHORIZATION,
        body_ref=preserved["body.md"],supplement=ref("review-supplement-1.md"),
        request_map=question_map,literal_blocks=blocks,
        shared_population_reconciliation=dict(type="mechanical_projection_of_frozen_producer_records",
            source_commit=COMMIT,artifact_key="s1.core.automation",need="flow",
            population_selector='legacy_artifact_key == "s1.core.automation"',
            source_inventory_ref=ref("../../inputs/sources.jsonl"),coverage_ref=preserved["coverage.jsonl"],captures_ref=preserved["captures.json"],
            source_count=204,unique_path_count=204,duplicated_paths=[],missing_paths=[],extra_paths=[],
            total_captured_bytes=sum(c["bytes"] for c in caps),
            family_counts=dict(collections.Counter(c["family"] for c in coverage)),
            read_depth_counts=dict(collections.Counter(c["read_depth"] for c in coverage)),
            exact_original_fields=["path","git_blob_sha","sha256","bytes","role","read_depth","need","artifact","disposition","execution_status"],
            mechanical_fields=["body_anchors renamed from evidence_ids","body_sections joined from prior PLAN body_section; empty evidence_ids maps only to validation §13"],
            rows=projected,external_source_population_effect=0,
            reuse="This reconciliation is emitted once in this index and can be shared unchanged with both judges and review batches2–4"),
        history=dict(body=hist,projection=historical_refs["coverage-needs-projection.json"],
            immutable_authority="Historical supported is not final dual acceptance; historical bodies/corrections/decisions remain unchanged"),
        external_source_manifest=ref("external-source-captures.json"),
        external_semantic_inputs=[c for c in ext.values() if c["role"]=="semantic_dependency_of_Core_Actions_call_sites"],
        proposed_deltas=[proposal],body_changes_applied=[],product_test_results=[],provider_execution_results=[],
        deferred_review_batches=["automation-2","automation-3","automation-4"],
        scheduling_editor_A31=dict(status="BOTH_EDITOR_IMPLEMENTATIONS_INCLUDED",block_id="AUT1-C29",original_anchor="A31",
            native_schedule_resource_command_semantics="Later batch for body §4, not implied accepted by this editor excerpt"))
    write_json("review-supplement-1-index.json",index)

    # Verify literal intervals against frozen archives and verify old files did not change.
    rendered=(ROOT/"review-supplement-1.md").read_bytes()
    for b in blocks:
        source=(ROOT/b["archive"]).read_bytes().splitlines(keepends=True)
        for interval in b["intervals"]:
            original=b"".join(source[interval["first_line"]-1:interval["last_line"]])
            carried=rendered[interval["literal_content_byte_start"]:interval["literal_content_byte_end_exclusive"]]
            assert original==carried and sha(carried)==interval["sha256"]
    for name,old in preserved.items():assert ref(name)==old, name
    receipt=dict(schema="genesis-review-supplement-receipt/v1",task="AUTOMATION-L1",review_batch="automation-1",
        producer="/root/automation_l1",source_commit=COMMIT,body_sha256=BODY_SHA,
        outputs=[ref("review-supplement-1.md"),ref("review-supplement-1-index.json"),ref("external-source-captures.json"),ref("build_review_supplement_1.py")],
        original_files_preserved=list(preserved.values()),
        literal_blocks=len(blocks),literal_source_intervals=sum(len(b["intervals"]) for b in blocks),
        owned_population_sources_in_supplement=len(PARTS),external_semantic_sources=len(EXTERNAL),external_instruction_sources=1,
        all_original_population_verified=204,projection_rows_verified=204,
        literal_intervals_byte_equal=True,old_file_hashes_equal=True,
        verification_type="document_bytes_hashes_and_population_only_not_product_tests",
        proposed_delta_ids=[proposal["id"]],applied_deltas=[],judgment="NOT_PERFORMED",
        product_tests="NOT_RUN",provider_execution="NOT_RUN",paid_provider_calls=0,remote_writes=0,oracle_access=False,
        schema_artifact_acceptance="NOT_ASSERTED",model_tokens="UNKNOWN",model_cost="UNKNOWN")
    write_json("review-supplement-1-receipt.json",receipt)
    print(json.dumps(dict(outputs=receipt["outputs"],receipt=ref("review-supplement-1-receipt.json"),
        literal_blocks=len(blocks),originals_unchanged=True,population=204,external_semantic_inputs=len(EXTERNAL),
        proposed_delta_ids=receipt["proposed_delta_ids"],question_map=question_map),ensure_ascii=False,indent=2))


if __name__=="__main__":
    main()
