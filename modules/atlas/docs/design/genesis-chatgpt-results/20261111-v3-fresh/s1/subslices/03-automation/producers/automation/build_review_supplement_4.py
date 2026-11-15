"""Literal scheduler chains and prior evidence references; no runtime qualification."""
from pathlib import Path
import hashlib
import json
import runpy

ROOT=Path(__file__).resolve().parent
BODY_SHA="968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae"
RECIPE_SHA="c769860c4a685cdbeaff94d471ca393078b74b275924048a996a6376fbeb61c6"
COMMIT="1cde2ff7a71bcf7aecb5d030917b577165135d38"

def sha(data):return hashlib.sha256(data).hexdigest()
def blob(data):return hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
def ref(name):
    data=(ROOT/name).read_bytes()
    return dict(path=name,bytes=len(data),sha256=sha(data),git_blob_sha=blob(data))
def write_json(name,value):
    (ROOT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

SPECS=[
 ("packages/core/src/scheduled-task.ts","01,02,03,04","S01,S02,S04,S06",[(23,32),(80,558)],
  "Constants, construction/wake/binding, legacy routes and planning, dispatch/settle/pruning/takeover, tick and daemon"),
 ("packages/core/src/scheduled-task/capability.ts","01,02,03,04","S01,S03,S04,S05,S06",[(26,493)],
  "Owner/operator API, claim planning, holds/present/revoke, create/list/placed/get/edit/manual replay, cadence encoding and settling"),
 ("packages/core/src/scheduled-task/shared.ts","01,03","S01,S04,S05",[(13,144)],
  "Errors, claim/outcome, immediate transaction, legacy filtering, deterministic IDs and persisted claim snapshot"),
 ("packages/core/src/scheduled-task/sql.ts","01,03","S01",[(1,76)],
  "Both task policies and complete claim schema, cascade and unique dedupe indexes"),
 ("packages/core/src/scheduled-task/port.ts","01","S01",[(7,41)],
  "Scope acquire/release, previous binding restoration, missing binding failure and forwarding"),
 ("packages/core/src/scheduled-task/model.ts","01,02,03","S01,S02",None,
  "Complete legacy model: plan/record/skip/resume, local DST conversion and deterministic noncryptographic IDs"),
 ("packages/core/src/scheduled-task/capability-model.ts","02,03","S03",None,
  "Complete capability timing: cron parsing, possible dates and OR, anchor/catchup, bounds/scan/countWalls and gap resolution"),
]

CALL_SEQUENCES={
 "RE-AUT4-01":[
  [("scheduled-task.ts",349,361),("scheduled-task/shared.ts",46,66),("scheduled-task.ts",107,111),("scheduled-task.ts",506,508)],
  [("scheduled-task.ts",362,473)],
  [("scheduled-task/capability.ts",70,87),("scheduled-task/capability.ts",238,268),("scheduled-task/capability.ts",384,394)],
  [("scheduled-task.ts",156,185),("scheduled-task/capability.ts",121,157)],
  [("scheduled-task/shared.ts",94,134),("scheduled-task/model.ts",94,140),("scheduled-task/sql.ts",9,76)],
  [("scheduled-task.ts",349,350),("scheduled-task/port.ts",7,41)]
 ],
 "RE-AUT4-02":[
  [("scheduled-task/model.ts",1,140),("scheduled-task.ts",408,450),("scheduled-task.ts",521,528)],
  [("scheduled-task/capability.ts",397,453),("scheduled-task/capability.ts",487,493),("scheduled-task/capability-model.ts",1,218)],
  [("scheduled-task/capability-model.ts",83,105),("scheduled-task/capability-model.ts",122,175),("scheduled-task/capability-model.ts",177,200)],
  [("scheduled-task.ts",23,32),("scheduled-task/capability-model.ts",27,38)]
 ],
 "RE-AUT4-03":[
  [("scheduled-task.ts",120,150),("scheduled-task/capability.ts",89,119),("scheduled-task/shared.ts",52,66),("scheduled-task/shared.ts",94,134)],
  [("scheduled-task.ts",152,185),("scheduled-task/capability.ts",121,157),("scheduled-task.ts",187,264),("scheduled-task/capability.ts",455,466)],
  [("scheduled-task.ts",23,32),("scheduled-task.ts",272,320)],
  [("scheduled-task/capability.ts",159,200),("scheduled-task/capability.ts",270,334),("scheduled-task/sql.ts",44,76)],
  [("scheduled-task/capability.ts",335,378),("scheduled-task.ts",187,218),("scheduled-task.ts",272,302),("scheduled-task/shared.ts",139,144)],
  [("scheduled-task.ts",408,473),("scheduled-task.ts",521,528)]
 ],
 "RE-AUT4-04":[
  [("scheduled-task.ts",23,32),("scheduled-task.ts",304,347),("scheduled-task.ts",484,504),("scheduled-task.ts",546,558)],
  [("scheduled-task.ts",85,95),("scheduled-task/capability.ts",207,237)]
 ],
}

def main():
    frozen_names=["body.md","recipe.json","captures.json","coverage.jsonl","evidence.md","evidence-review.md",
                  "history/body-v3.md","history/recipe-v3.json","revisions/v4/delta.json"]
    frozen_names += [str(p.relative_to(ROOT)) for p in sorted(ROOT.glob("review-supplement-[123]*")) if p.is_file()]
    frozen={name:ref(name) for name in frozen_names}
    assert frozen["body.md"]["sha256"]==BODY_SHA and frozen["recipe.json"]["sha256"]==RECIPE_SHA
    public=[]
    for judge in ["J1","J2"]:
        path=f"../../relay/automation-4/{judge.lower()}-response.md"
        request=(ROOT/path).read_text()
        assert all(f"RE-AUT4-{n:02d}" in request for n in range(1,5))
        public.append({**ref(path),"judge_id":judge,"origin":"public_request_relay","repository_commit":None})
    captures={c["path"]:c for c in json.loads((ROOT/"captures.json").read_text())["captures"]}
    prior_plan=runpy.run_path(str(ROOT/"build_artifacts.py"))["PLAN"]
    documents={name:(ROOT/name).read_bytes() for name in ["evidence-review.md","evidence.md"]}
    available={};test_refs=[]

    def prior_literal(path,a,b,anchor,document,role):
        c=captures[path];raw=(ROOT/c["capture_path"]).read_bytes()
        assert sha(raw)==c["sha256"] and blob(raw)==c["git_blob_sha"] and len(raw)==c["bytes"]
        lines=raw.splitlines(keepends=True);excerpt=b"".join(lines[a-1:b])
        marker=f"Linhas **{a}–{b}**; SHA256 do intervalo `{sha(excerpt)}`:\n\n~~~~typescript\n".encode()
        index=documents[document].find(marker);assert index>=0,(path,a,b,document)
        begin=index+len(marker);end=begin+len(excerpt)
        assert documents[document][begin:end]==excerpt
        return dict(type="prior_literal_range_reference",anchor_id=anchor,role=role,
            source_path=path,source_archive=c["capture_path"],source_commit=c["commit"],source_git_blob_sha=c["git_blob_sha"],
            source_sha256=c["sha256"],source_bytes=c["bytes"],first_line=a,last_line=b,
            source_byte_start=sum(map(len,lines[:a-1])),source_byte_end_exclusive=sum(map(len,lines[:b])),
            excerpt_bytes=len(excerpt),excerpt_sha256=sha(excerpt),prior_document=document,
            prior_document_sha256=frozen[document]["sha256"],literal_content_byte_start=begin,literal_content_byte_end_exclusive=end)

    for item in prior_plan:
        if item["id"].startswith("S"):
            for entry in item["entries"]:
                for a,b in entry["review"]:
                    value=prior_literal(entry["path"],a,b,item["id"],"evidence-review.md","previously_transported_implementation")
                    available.setdefault(entry["path"],[]).append(value)
        if item["id"]=="T01":
            for entry in item["entries"]:
                for a,b in entry["full"]:
                    value=prior_literal(entry["path"],a,b,"T01","evidence.md","existing_test_assertions_NOT_RUN")
                    value["execution_status"]="NOT_RUN"
                    test_refs.append(value)
    assert len({x["source_path"] for x in test_refs})==7
    source_index=json.loads((ROOT/"review-supplement-1-index.json").read_text())
    shared_pointer=dict(index=frozen["review-supplement-1-index.json"],pointer="/shared_population_reconciliation",new_census=False,new_rows=0)
    history_pointer=dict(index=frozen["review-supplement-1-index.json"],pointer="/history",new_history_projection=False,
                         prior_literal_block_ids=["AUT1-H01","AUT1-H02","AUT1-H03","AUT1-H04"])
    assert source_index["shared_population_reconciliation"]["source_count"]==204
    body=(ROOT/"body.md").read_bytes();scope_begin=body.index(b"## 10.")
    revision=json.loads((ROOT/"revisions/v4/delta.json").read_text())
    out=bytearray();blocks=[];reused=[];source_sequences=[]
    def put(text):out.extend(text.encode("utf-8"))
    put("# Suplemento literal de revisão 4 — AUTOMATION-L1\n\n```json\n"+json.dumps(dict(
        type="documentary_transport_header",review_batch="automation-4",body_ref=frozen["body.md"],recipe_ref=frozen["recipe.json"],
        source_commit=COMMIT,body_sections=[10,11,12,13,14],body_utf8_byte_interval=[scope_begin,len(body)],public_requests=public,
        canonical_request_namespace="RE-AUT4-01..04 shared; J2-04 is the shared reconciliation only",
        authorized_body_revision=dict(receipt=frozen["revisions/v4/delta.json"],substitutions=revision["changes"],
                                      inverse_to_v3_verified=revision["inverse_recovers_v3_byte_for_byte"]),
        prior_literals="S01–S06 in evidence-review.md; exact existing excerpts referenced, not copied",
        shared_reconciliation=shared_pointer,historical_evidence=history_pointer,
        decisive_tests=dict(archive=frozen["evidence.md"],anchor="T01",index_pointer="/existing_test_literal_references",execution="NOT_RUN",new_test_literals=False),
        new_population_census=False,history_repeated=False,tests="NOT_RUN",provider_execution="NOT_RUN",timezone_execution="NOT_RUN",oracle_access=False),
        ensure_ascii=False,indent=2)+"\n```\n")
    for number,(path,groups,anchors,ranges,subject) in enumerate(SPECS,1):
        c=captures[path];raw=(ROOT/c["capture_path"]).read_bytes()
        assert sha(raw)==c["sha256"] and blob(raw)==c["git_blob_sha"] and len(raw)==c["bytes"]
        lines=raw.splitlines(keepends=True);ranges=ranges or [(1,len(lines))]
        needed={line for a,b in ranges for line in range(a,b+1)}
        prior=[value for value in available.get(path,[]) if set(range(value["first_line"],value["last_line"]+1))<=needed]
        covered={line for value in prior for line in range(value["first_line"],value["last_line"]+1)}
        fresh=[]
        for line in sorted(needed-covered):
            if fresh and fresh[-1][1]+1==line:fresh[-1][1]=line
            else:fresh.append([line,line])
        block_id=f"AUT4-C{number:02d}"
        record=dict(block_id=block_id,type="literal_source_chain",requests=["RE-AUT4-"+group for group in groups.split(",")],
            body_anchors=anchors.split(","),requested_subject=subject,path=path,archive=c["capture_path"],commit=c["commit"],
            source_git_blob_sha=c["git_blob_sha"],source_sha256=c["sha256"],source_bytes=c["bytes"],required_source_line_ranges=ranges,
            prior_literal_ranges=prior,new_literal_intervals=[])
        start=len(out)
        put("\n## "+block_id+"\n\n```json\n"+json.dumps({k:v for k,v in record.items() if k!="new_literal_intervals"},ensure_ascii=False,indent=2)+"\n```\n")
        for a,b in fresh:
            excerpt=b"".join(lines[a-1:b])
            interval=dict(first_line=a,last_line=b,source_byte_start=sum(map(len,lines[:a-1])),source_byte_end_exclusive=sum(map(len,lines[:b])),
                bytes=len(excerpt),sha256=sha(excerpt))
            put("\n```json\n"+json.dumps(interval,separators=(",",":"))+"\n```\n\n~~~~typescript\n")
            interval["literal_content_byte_start"]=len(out);out.extend(excerpt);interval["literal_content_byte_end_exclusive"]=len(out)
            if not excerpt.endswith(b"\n"):put("\n")
            put("~~~~\n");record["new_literal_intervals"].append(interval)
        record["supplement_byte_start"]=start;record["supplement_byte_end_exclusive"]=len(out);record["transport_sha256"]=sha(bytes(out[start:]))
        seq=[dict(type="new_literal",block_id=block_id,first_line=value["first_line"],last_line=value["last_line"],sha256=value["sha256"],
             source_byte_start=value["source_byte_start"],source_byte_end_exclusive=value["source_byte_end_exclusive"],
             byte_start=value["literal_content_byte_start"],byte_end_exclusive=value["literal_content_byte_end_exclusive"]) for value in record["new_literal_intervals"]]
        seq += [dict(type="reused_prior_literal",**{k:v for k,v in value.items() if k!="type"}) for value in prior]
        seq.sort(key=lambda value:(value["first_line"],value["last_line"]))
        assert {line for value in seq for line in range(value["first_line"],value["last_line"]+1)}==needed
        source_sequences.append(dict(path=path,required_source_line_ranges=ranges,sequence=seq,all_required_lines_available=True))
        blocks.append(record);reused.extend(prior)
    (ROOT/"review-supplement-4.md").write_bytes(out)
    by_path={record["path"]:record for record in blocks}
    flow_map={}
    for request,sequences in CALL_SEQUENCES.items():
        mapped=[]
        for sequence in sequences:
            steps=[]
            for short,a,b in sequence:
                path="packages/core/src/"+short;block=by_path[path]
                provided={line for lo,hi in block["required_source_line_ranges"] for line in range(lo,hi+1)}
                assert set(range(a,b+1))<=provided,(request,path,a,b)
                raw=(ROOT/block["archive"]).read_bytes();lines=raw.splitlines(keepends=True);excerpt=b"".join(lines[a-1:b])
                steps.append(dict(chain_id=block["block_id"],path=path,first_line=a,last_line=b,
                    source_byte_start=sum(map(len,lines[:a-1])),source_byte_end_exclusive=sum(map(len,lines[:b])),
                    excerpt_sha256=sha(excerpt),literal_transport="new and reused intervals in source_reconstruction_sequences"))
            mapped.append(steps)
        flow_map[request]=mapped
    request_map=[]
    for i in range(1,5):
        request=f"RE-AUT4-{i:02d}";selected=[block for block in blocks if request in block["requests"]]
        request_map.append(dict(judge_id="J1",request_id=request,literal_chain_ids=[block["block_id"] for block in selected],
            source_paths=[block["path"] for block in selected],caller_branch_response_sequences=flow_map[request],
            shared_reconciliation=shared_pointer if i==4 else None,historical_evidence=history_pointer if i==4 else None,
            existing_test_literal_references="/existing_test_literal_references" if i==4 else None,status="EVIDENCE_SUPPLIED_NOT_JUDGED"))
    j2=[]
    for i in range(1,5):
        request=f"RE-AUT4-{i:02d}"
        if i==4:
            j2.append(dict(judge_id="J2",request_id=request,literal_chain_ids=[],shared_reconciliation=shared_pointer,
                historical_evidence=history_pointer,existing_test_literal_references="/existing_test_literal_references",status="EVIDENCE_SUPPLIED_NOT_JUDGED"))
            continue
        groups=[request]+(["RE-AUT4-04"] if i==3 else [])
        selected=[block for block in blocks if set(groups)&set(block["requests"])]
        j2.append(dict(judge_id="J2",request_id=request,canonical_groups=groups,literal_chain_ids=[block["block_id"] for block in selected],
            caller_branch_response_sequences=[seq for group in groups for seq in flow_map[group]],status="EVIDENCE_SUPPLIED_NOT_JUDGED"))
    index=dict(schema="genesis-review-supplement-index/v1",review_batch="automation-4",task="AUTOMATION-L1",
        principal_request=ref("revisions/v4/request.txt"),public_request_refs=public,body_ref=frozen["body.md"],recipe_ref=frozen["recipe.json"],
        body_scope=dict(sections=[10,11,12,13,14],utf8_byte_interval=[scope_begin,len(body)],sha256=sha(body[scope_begin:]),
            contains_only_two_authorized_v4_corrections=True),authorized_revision_receipt=frozen["revisions/v4/delta.json"],authorized_changes=revision["changes"],
        supplement=ref("review-supplement-4.md"),request_map=request_map,judge_J2_request_map=j2,literal_chains=blocks,
        source_reconstruction_sequences=source_sequences,shared_reconciliation=shared_pointer,historical_evidence=history_pointer,
        existing_test_literal_references=test_refs,existing_test_reference_semantics="Literal archived assertions only; same seven decisive files, NOT_RUN; no new test/census",
        reuse_source_document=frozen["evidence-review.md"],new_external_sources=[],additional_proposed_deltas=[],
        changes_outside_authorized_revision=[],tests="NOT_RUN",provider_execution="NOT_RUN",timezone_execution="NOT_RUN",status="EVIDENCE_SUPPLIED_NOT_JUDGED")
    write_json("review-supplement-4-index.json",index)
    carried=(ROOT/"review-supplement-4.md").read_bytes()
    for block in blocks:
        raw=(ROOT/block["archive"]).read_bytes();lines=raw.splitlines(keepends=True)
        for interval in block["new_literal_intervals"]:
            original=b"".join(lines[interval["first_line"]-1:interval["last_line"]])
            value=carried[interval["literal_content_byte_start"]:interval["literal_content_byte_end_exclusive"]]
            assert value==original and sha(value)==interval["sha256"]
            assert raw[interval["source_byte_start"]:interval["source_byte_end_exclusive"]]==value
    for value in reused+test_refs:
        assert sha(documents[value["prior_document"]][value["literal_content_byte_start"]:value["literal_content_byte_end_exclusive"]])==value["excerpt_sha256"]
    for name,value in frozen.items():assert ref(name)==value,name
    unique={(value["source_path"],value["first_line"],value["last_line"]) for value in reused}
    new_bytes=sum(interval["bytes"] for block in blocks for interval in block["new_literal_intervals"])
    response=f'''# Resposta original do produtor — suplemento4

Atendi os quatro grupos públicos de J1/J2 em automation-4. Sete cadeias das implementações do scheduler recompõem cada intervalo requerido com trechos novos e {len(unique)} intervalos S01–S06 já presentes em evidence-review.md. São {new_bytes} bytes literais novos. Ambos os models estão completos na união; as demais cadeias incluem chamadores, guards, ramos e respostas, com offsets de origem/transporte e hashes.

O índice liga os pedidos às sequências: separação legacy/capability e placement/port; IDs e schema de claims; calendários/parsing/catch-up/DST/limites; immediate/claim/holds/present/dispatch/settle/takeover/revisão/manualKey/retention; boot/stale→due/loop/wake/failures. A reconciliação204 e o histórico permanecem apenas no suplemento1. O índice aponta os trechos T01 já arquivados dos sete arquivos de assertion decisivos, sem copiá-los ou transformar NOT_RUN em execução.

Corpo v4 `{BODY_SHA}` e receita v4 `{RECIPE_SHA}` foram preservados na montagem. O header e o índice vinculam as duas correções autorizadas em revisions/v4/delta.json: presença do owner é verificada antes da Session, enquanto os dois holds não a releem; manualKey bloqueia ausência de SessionInput quando a row está running, e não nos demais estados assentados não revoked. O caminho completo da nova chamada sem admissão e sua limpeza também está no suplemento, sem afirmar que um caso adversarial foi executado.

Suplemento: {ref('review-supplement-4.md')['sha256']} ({ref('review-supplement-4.md')['bytes']} bytes). Índice: {ref('review-supplement-4-index.json')['sha256']} ({ref('review-supplement-4-index.json')['bytes']} bytes).

Sem nova captura externa, recensus, repetição histórica, nova proposta de delta ou alteração fora das duas frases autorizadas. Preservados suplementos1/2/3 e versões anteriores. Somente verificação documental de bytes e hashes; testes de produto, execução de provider e execução de timezone: NOT_RUN. Sem oracle, julgamento reservado, produto alterado ou escrita remota. Nenhum julgamento/aceite emitido pelo produtor.
'''
    (ROOT/"review-supplement-4-response.md").write_text(response,encoding="utf-8")
    receipt=dict(schema="genesis-review-supplement-receipt/v1",task="AUTOMATION-L1",review_batch="automation-4",producer="/root/automation_l1",
        outputs=[ref("review-supplement-4.md"),ref("review-supplement-4-index.json"),ref("review-supplement-4-response.md"),ref("build_review_supplement_4.py")],
        preserved_files=list(frozen.values()),source_chains=7,new_literal_bytes=new_bytes,new_literal_intervals=sum(len(block["new_literal_intervals"]) for block in blocks),
        reused_unique_intervals=len(unique),existing_test_literal_references=len(test_refs),existing_decisive_test_files=7,new_test_literals=0,new_external_sources=0,
        source_line_reconstruction_complete=True,interval_bytes_equal=True,previous_file_hashes_equal=True,recensus204=False,history_repeated=False,
        applied_revision="v4: only two previously authorized scheduler wording corrections",additional_deltas=[],
        product_tests="NOT_RUN",provider_execution="NOT_RUN",timezone_execution="NOT_RUN",oracle_access=False,remote_writes=0,judgment="NOT_PERFORMED",model_tokens="UNKNOWN",model_cost="UNKNOWN")
    write_json("review-supplement-4-receipt.json",receipt)
    print(json.dumps(dict(outputs=receipt["outputs"],receipt=ref("review-supplement-4-receipt.json"),source_chains=7,
        new_literal_bytes=new_bytes,new_literal_intervals=receipt["new_literal_intervals"],reused_intervals=len(unique),
        existing_test_references=len(test_refs),preserved=True),ensure_ascii=False,indent=2))

if __name__=="__main__":main()
