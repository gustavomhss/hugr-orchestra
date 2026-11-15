"""Literal Board chains for automation-3; reuse prior literal ranges without new census."""
from pathlib import Path
import hashlib
import json
import runpy

ROOT=Path(__file__).resolve().parent
BODY_SHA="b31d52e5bf25f6eca3807e9c1f418b70d865c9d63c5690125c530c54f8247d84"
RECIPE_SHA="d42e72daa68af5354ddc50e8f7d03c3bb82b451b2732612fc4a4dbb87ed89a3a"
COMMIT="1cde2ff7a71bcf7aecb5d030917b577165135d38"

def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()
def ref(name):
    b=(ROOT/name).read_bytes();return dict(path=name,bytes=len(b),sha256=sha(b),git_blob_sha=blob(b))
def write_json(name,obj):(ROOT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

SPECS=[
 ("board.ts","01,02,04,05,06","B01,B02,B03,B07,B10,B13",[(149,1720)],"Serviço completo desde constants/make: transações/projeções/trail/deps/CRUD/move/steps/questions/decisions/notes/attachments/undo/owner controls/polls/ports"),
 ("tools.ts","01","B01",None,"Porta de tools e guard Maestro"),
 ("rows.ts","01,06","B01,B03",None,"Projeções públicas, decisão vigente e anexos sem path/credentialID"),
 ("shared.ts","01,02,04,06","B01,B05",None,"Helpers de loads/authority/log/worktree/forecast/waits e runner Git"),
 ("sql.ts","01,02,03,04,05,06","B01,B12",None,"Tabelas/índices de plano, checks, attempts, queue/bundles e activity; disposição operacional distinta"),
 ("decision.ts","01","B03",None,"Criação, supersession e outcome narrado completos"),
 ("thread.ts","01,06","B03",None,"Thread de host readonly, identidade determinística e insert idempotente"),
 ("github.ts","02","B04",None,"Mirror/CI semaphore, imports/ETag/pagination/comments/overwrite/state questions/PR progression/labels/dirty/cache/minutes"),
 ("money.ts","02","B05",None,"Sessions/filhos/tokens/custos CI, thresholds, evaluate/settings e entrada building"),
 ("spend.ts","02","B05",None,"Metered/unmetered/card/total, thresholds, peers e budget/forecast arithmetic"),
 ("forecast.ts","02","B05",None,"Throughput com zeros, seed, simulação, percentis, horizon/waits/late"),
 ("ledger.ts","02,05,06","B13",None,"Origem das métricas derivadas de rows e ausência como null"),
 ("proof.ts","02,06","B13",None,"Leitura viva e composição de proof com attempts/recorded facts"),
 ("ci.ts","03,04","B06",None,"Contrato/base/defaults, índice temporário, commands/packages/none, ledger/dedupe/dispatch/settle/state completos"),
 ("queue.ts","04,05","B07,B08,B09,B10",None,"Admissão/head/tree/record/followups/dequeue, owner bundle actions, tick/cut/lanes/globs/capacity/full safety/PR/adaptive size"),
 ("queue-lanes.ts","04","B08",None,"Overlap/unknown-global/predecessors/order/capacity"),
 ("queue-shared.ts","04,05","B08,B09",None,"Judge/rollup, affected integrated tree/turbo, open bundles, dispatch newest-run correlation e holds"),
 ("queue-drift.ts","04","B08",None,"Plan drift apenas registra desvio entre area e affected"),
 ("queue-settle.ts","04,05","B09,B10",None,"Cadeia gate/head→infra/red/probe/isolation/accepted→heads/base/skew/push→rows/cleanup; helpers de dissolve/eject/held"),
 ("queue-red.ts","05","B09",None,"Classificação logs/base, 2 falhas base/3 passes head, prefix/isolation/bisect/fix/probes/flaky"),
 ("snapshot.ts","06","B11",None,"Índice/scanner/remote/ref/push/registro/restoreworktree e lifecycle de attempts"),
 ("conflicts.ts","06","B11",None,"Base fetch/write sets/merge-tree/conflict notices, sem rebase no caminho"),
 ("queue-record.ts","04,05,06","B07,B12",None,"Fetch head, record completo, Atlas writer/visibilidade/redaction/fatos host e campos ausentes"),
 ("record.ts","06","B12",None,"Port e fallback sem implementação Atlas"),
 ("tree.ts","06","B12",None,"Import vazio, catálogo/aplicação de eventos, exclusões, dependências e lacuna de prosa redigida"),
]
J2_MAP={"RE-AUT3-01":["RE-AUT3-01"],"RE-AUT3-02":["RE-AUT3-02","RE-AUT3-03"],
    "RE-AUT3-03":["RE-AUT3-04","RE-AUT3-05"],"RE-AUT3-04":["RE-AUT3-04","RE-AUT3-05"],"RE-AUT3-05":["RE-AUT3-06"]}

def main():
    names=["body.md","recipe.json","review-supplement-1.md","review-supplement-1-index.json","review-supplement-1-receipt.json",
        "review-supplement-2.md","review-supplement-2-index.json","review-supplement-2-receipt.json","review-supplement-2-response.md",
        "evidence-review.md","coverage.jsonl","captures.json","history/body-v2.md","history/recipe-v2.json","revisions/v3/delta.json"]
    frozen={n:ref(n) for n in names}
    assert frozen["body.md"]["sha256"]==BODY_SHA and frozen["recipe.json"]["sha256"]==RECIPE_SHA
    public=[]
    for judge,count in [("J1",6),("J2",5)]:
        p=f"../../relay/automation-3/{judge.lower()}-response.md";text=(ROOT/p).read_text()
        assert all(f"RE-AUT3-{n:02d}" in text for n in range(1,count+1))
        public.append({**ref(p),"judge_id":judge,"origin":"public_request_relay","repository_commit":None})
    caps={c["path"]:c for c in json.loads((ROOT/"captures.json").read_text())["captures"]}
    prior_plan=runpy.run_path(str(ROOT/"build_artifacts.py"))["PLAN"]
    prior_bytes=(ROOT/"evidence-review.md").read_bytes();available={}
    for item in prior_plan:
        if not item["id"].startswith("B"):continue
        for e in item["entries"]:
            if not e["review"]:continue
            c=caps[e["path"]];source=(ROOT/c["capture_path"]).read_bytes().splitlines(keepends=True)
            for a,b in e["review"]:
                raw=b"".join(source[a-1:b]);marker=f"Linhas **{a}–{b}**; SHA256 do intervalo `{sha(raw)}`:\n\n~~~~typescript\n".encode()
                at=prior_bytes.find(marker);assert at>=0,(e["path"],a,b)
                begin=at+len(marker);end=begin+len(raw);assert prior_bytes[begin:end]==raw
                available.setdefault(e["path"],[]).append(dict(type="prior_literal_range_reference",anchor_id=item["id"],
                    source_path=e["path"],source_commit=c["commit"],source_git_blob_sha=c["git_blob_sha"],source_sha256=c["sha256"],
                    first_line=a,last_line=b,excerpt_bytes=len(raw),excerpt_sha256=sha(raw),
                    prior_document="evidence-review.md",prior_document_sha256=frozen["evidence-review.md"]["sha256"],
                    literal_content_byte_start=begin,literal_content_byte_end_exclusive=end))
    body=(ROOT/"body.md").read_bytes();a=body.index(b"## 6.");b=body.index(b"## 10.")
    revision=json.loads((ROOT/"revisions/v3/delta.json").read_text())
    out=bytearray();blocks=[];reused=[];source_sequences=[]
    def put(s):out.extend(s.encode("utf-8"))
    put("# Suplemento literal de revisão 3 — AUTOMATION-L1\n\n```json\n"+json.dumps(dict(
        type="documentary_transport_header",review_batch="automation-3",body_ref=frozen["body.md"],recipe_ref=frozen["recipe.json"],
        source_commit=COMMIT,body_sections=[6,7,8,9],body_utf8_byte_interval=[a,b],public_requests=public,
        canonical_request_namespace="J1; J2 correspondence in index",j2_mapping=J2_MAP,
        authorized_body_revision=dict(receipt=frozen["revisions/v3/delta.json"],substitutions=revision["changes"],
            inverse_to_v2_verified=revision["inverse_recovers_v2_byte_for_byte"]),
        prior_literals="evidence-review.md; existing B01–B13 ranges reused by exact byte offsets and hashes",
        shared_population_reconciliation="review-supplement-1-index.json#/shared_population_reconciliation",
        new_population_census=False,history_repeated=False,tests="NOT_RUN",provider_execution="NOT_RUN",oracle_access=False),ensure_ascii=False,indent=2)+"\n```\n")
    for n,(short,groups,anchors,ranges,subject) in enumerate(SPECS,1):
        path="packages/core/src/board/"+short;c=caps[path];raw=(ROOT/c["capture_path"]).read_bytes()
        assert sha(raw)==c["sha256"] and blob(raw)==c["git_blob_sha"] and len(raw)==c["bytes"]
        lines=raw.splitlines(keepends=True);ranges=ranges or [(1,len(lines))]
        requests=["RE-AUT3-"+q for q in groups.split(",")]
        needed={line for lo,hi in ranges for line in range(lo,hi+1)}
        prior=[x for x in available.get(path,[]) if set(range(x["first_line"],x["last_line"]+1))<=needed]
        covered={line for x in prior for line in range(x["first_line"],x["last_line"]+1)}
        missing=sorted(needed-covered);fresh=[]
        for line in missing:
            if fresh and fresh[-1][1]+1==line:fresh[-1][1]=line
            else:fresh.append([line,line])
        bid=f"AUT3-C{n:02d}"
        record=dict(block_id=bid,type="literal_source_chain",canonical_request_namespace="J1",requests=requests,body_anchors=anchors.split(","),
            requested_subject=subject,path=path,archive=c["capture_path"],commit=c["commit"],source_git_blob_sha=c["git_blob_sha"],
            source_sha256=c["sha256"],source_bytes=c["bytes"],required_source_line_ranges=ranges,prior_literal_ranges=prior,new_literal_intervals=[])
        start=len(out);put("\n## "+bid+"\n\n```json\n"+json.dumps({k:v for k,v in record.items() if k!="new_literal_intervals"},ensure_ascii=False,indent=2)+"\n```\n")
        for lo,hi in fresh:
            excerpt=b"".join(lines[lo-1:hi]);interval=dict(first_line=lo,last_line=hi,bytes=len(excerpt),sha256=sha(excerpt))
            put("\n```json\n"+json.dumps(interval,separators=(",",":"))+"\n```\n\n~~~~typescript\n")
            interval["literal_content_byte_start"]=len(out);out.extend(excerpt);interval["literal_content_byte_end_exclusive"]=len(out)
            if not excerpt.endswith(b"\n"):put("\n")
            put("~~~~\n");record["new_literal_intervals"].append(interval)
        record["supplement_byte_start"]=start;record["supplement_byte_end_exclusive"]=len(out);record["transport_sha256"]=sha(bytes(out[start:]))
        seq=[dict(type="new_literal",block_id=bid,first_line=i["first_line"],last_line=i["last_line"],sha256=i["sha256"],
            byte_start=i["literal_content_byte_start"],byte_end_exclusive=i["literal_content_byte_end_exclusive"]) for i in record["new_literal_intervals"]]
        seq += [dict(type="reused_prior_literal",**{k:v for k,v in item.items() if k!="type"}) for item in prior]
        seq.sort(key=lambda item:(item["first_line"],item["last_line"]))
        provided={line for i in seq for line in range(i["first_line"],i["last_line"]+1)}
        assert provided==needed
        source_sequences.append(dict(path=path,required_source_line_ranges=ranges,sequence=seq,all_required_lines_available=True))
        blocks.append(record);reused.extend(prior)
    (ROOT/"review-supplement-3.md").write_bytes(out)
    request_map=[]
    for i in range(1,7):
        q=f"RE-AUT3-{i:02d}";selected=[x for x in blocks if q in x["requests"]]
        request_map.append(dict(judge_id="J1",request_id=q,literal_chain_ids=[x["block_id"] for x in selected],
            source_paths=[x["path"] for x in selected],new_literal_bytes=sum(v["bytes"] for x in selected for v in x["new_literal_intervals"]),
            status="EVIDENCE_SUPPLIED_NOT_JUDGED"))
    j2=[]
    for q,groups in J2_MAP.items():
        selected=[x for x in blocks if set(groups)&set(x["requests"])]
        j2.append(dict(judge_id="J2",request_id=q,canonical_J1_groups=groups,literal_chain_ids=[x["block_id"] for x in selected],status="EVIDENCE_SUPPLIED_NOT_JUDGED"))
    index=dict(schema="genesis-review-supplement-index/v1",review_batch="automation-3",task="AUTOMATION-L1",
        principal_request=ref("revisions/v3/request.txt"),public_request_refs=public,body_ref=frozen["body.md"],recipe_ref=frozen["recipe.json"],
        body_scope=dict(sections=[6,7,8,9],utf8_byte_interval=[a,b],sha256=sha(body[a:b]),contains_three_explicitly_authorized_v3_corrections=True),
        authorized_revision_receipt=frozen["revisions/v3/delta.json"],authorized_changes=revision["changes"],
        supplement=ref("review-supplement-3.md"),request_map=request_map,judge_J2_request_map=j2,
        literal_chains=blocks,source_reconstruction_sequences=source_sequences,
        shared_reconciliation=dict(index=frozen["review-supplement-1-index.json"],pointer="/shared_population_reconciliation",new_census=False,new_rows=0),
        reuse_source_document=frozen["evidence-review.md"],new_external_sources=[],
        additional_proposed_deltas=[],changes_outside_authorized_revision=[],tests="NOT_RUN",provider_execution="NOT_RUN",
        status="EVIDENCE_SUPPLIED_NOT_JUDGED")
    write_json("review-supplement-3-index.json",index)
    carried=(ROOT/"review-supplement-3.md").read_bytes()
    for block in blocks:
        source=(ROOT/block["archive"]).read_bytes().splitlines(keepends=True)
        for interval in block["new_literal_intervals"]:
            original=b"".join(source[interval["first_line"]-1:interval["last_line"]])
            value=carried[interval["literal_content_byte_start"]:interval["literal_content_byte_end_exclusive"]]
            assert value==original and sha(value)==interval["sha256"]
    for item in reused:assert sha(prior_bytes[item["literal_content_byte_start"]:item["literal_content_byte_end_exclusive"]])==item["excerpt_sha256"]
    for name,value in frozen.items():assert ref(name)==value,name
    reuse_unique={(x["source_path"],x["first_line"],x["last_line"]) for x in reused}
    new_bytes=sum(i["bytes"] for b in blocks for i in b["new_literal_intervals"])
    response=f'''# Resposta original do produtor — suplemento3

Atendi os seis grupos públicos de J1 e os cinco de J2 em automation-3, com 25 cadeias literais das fontes Board. As cadeias recompõem todos os intervalos necessários a partir de trechos novos e {len(reuse_unique)} intervalos já transportados em evidence-review.md. O índice dá a sequência por arquivo e hashes/offsets; nenhuma linha requerida fica apenas descrita por um resumo.

São {new_bytes} bytes literais novos. Não repeti os intervalos já enviados, nem o histórico ou o censo204. A reconciliação compartilhada continua no suplemento1. Nenhuma fonte externa nova foi capturada para este lote.

Corpo v3 `{BODY_SHA}` e receita v3 `{RECIPE_SHA}` preservados durante a montagem. As três correções autorizadas aparecem no header/índice, com antes/depois e fonte, e continuam registradas em revisions/v3/delta.json com inversão exata à v2. Não apliquei nem proponho outro delta neste suplemento.

A evidência inclui transições/autoridade/anexos/undo; mirror/CI cache/meter/forecast; contrato/tree/rows/scoped-state; admissão/corte/lanes; red/infra/base/probes/isolation/accepted/gate→push/cleanup/skew; snapshots/attempts/conflicts/record port/restore. A cadeia inteira de settle permanece fonte estática, sem alegação de corrida executada ou revogação atômica.

Suplemento: {ref('review-supplement-3.md')['sha256']} ({ref('review-supplement-3.md')['bytes']} bytes). Índice: {ref('review-supplement-3-index.json')['sha256']} ({ref('review-supplement-3-index.json')['bytes']} bytes).

Verificação documental de bytes e hashes apenas; nenhum teste de produto, provider, oracle, avaliação reservada ou escrita remota. Julgamento/aceite não são feitos pelo produtor. Suplementos1/2 e seus índices/recibos permanecem íntegros.
'''
    (ROOT/"review-supplement-3-response.md").write_text(response,encoding="utf-8")
    receipt=dict(schema="genesis-review-supplement-receipt/v1",task="AUTOMATION-L1",review_batch="automation-3",producer="/root/automation_l1",
        outputs=[ref("review-supplement-3.md"),ref("review-supplement-3-index.json"),ref("review-supplement-3-response.md"),ref("build_review_supplement_3.py")],
        preserved_files=list(frozen.values()),source_chains=25,new_literal_bytes=new_bytes,new_literal_intervals=sum(len(b["new_literal_intervals"]) for b in blocks),
        reused_unique_intervals=len(reuse_unique),new_external_sources=0,source_line_reconstruction_complete=True,
        interval_bytes_equal=True,previous_file_hashes_equal=True,recensus204=False,history_repeated=False,
        applied_revision="v3: three previously authorized changes only",additional_deltas=[],product_tests="NOT_RUN",provider_execution="NOT_RUN",
        oracle_access=False,remote_writes=0,judgment="NOT_PERFORMED",model_tokens="UNKNOWN",model_cost="UNKNOWN")
    write_json("review-supplement-3-receipt.json",receipt)
    print(json.dumps(dict(outputs=receipt["outputs"],receipt=ref("review-supplement-3-receipt.json"),source_chains=25,
        new_literal_bytes=new_bytes,new_literal_intervals=receipt["new_literal_intervals"],reused_intervals=len(reuse_unique),preserved=True),ensure_ascii=False,indent=2))

if __name__=="__main__":main()
