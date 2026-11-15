"""Three explicitly authorized documentary corrections; no product execution."""
from pathlib import Path
import hashlib
import json

ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
BODY_V2="e9c89bea68d594bc61356ff461642ea23cd905d4584f2b52d32e10a5af984e55"
RECIPE_V2="2bed1778e629415d5bc7c818773ef18b012a8a0bd4239d5bc85db6642b41a80e"
REQUEST="J1 automation-3 terminou REQUEST_EVIDENCE,6 grupos; relay deve salvar já em relay/automation-3/j1-response.md. Execute suplemento3 separado, mantendo suplementos1/2 íntegros. J2 chega a seguir; incorporar pedidos públicos dele também. Grupos:1 transições Board/backlog/intake/queue/archive/deps/stepactive/decisão/undo/notes/anexos/projeção;2 mirror/intake paginado/comments/dirty/overwrite/close/reopen/PR/semaphore e métricas Sessions/filhosCI/trailcache/thresholds/settings/forecast;3 CIcontrato/base/discovery/tree temporário/tokenização/packages/none/persist/dedup/scoped-green;4 fila head/tree/recordcompleto/followups/dequeue/bundles/thresholds/turbo/globalglobs/plan drift/capacidade/fullsafety;5 red rerun/rebuild duasfalhasbase/trêspasseshead/probes/bisseção/fix/split/held/flakyaccepted/headbundle/skew/atlasexception/integração+cleanup/gateleitura;6 snapshotsrefpushregistroremote/restoreworktree/attempts/conflitos/recordportfallback/redaction/importevents/excludedtables. Duas frases exigem confronto literal: 'Subscription engine ou preço ausente é not-metered' vs spend.card30–49 e origem tokens/parcelas; e 'scoped-green cobre caminhos requeridos' vs latest.some scoped pass coexistindo pendentes/error no mesmo tree. Se essas duas frases forem imprecisas, está autorizado a aplicar APENAS suas correções mínimas apoiadas na evidência, arquivando v2 integral, receita e delta/pedido/resposta v3. Para outros defeitos proponha sem aplicar. Nenhum oracle; escrita própria; sem testeproduto/remote. Trechos literais/offsets/hashes e reuso do que já enviado. Não refazer204/histórico."
ADDITIONAL_AUTHORIZATION="Autorizada também a terceira correção mínima sobre redispatch quando só há rows outcome=error (ci.ts311–313). Inclua-a na mesma revisão v3 se ainda não fechada; caso já selada localmente, preserve v3 e faça v4 apenas desse delta. Mantenha as três substituições/qualificações exatas, com texto anterior/novo, fontes/linhas, hashes e inversão verificável; demais passagens byte-idênticas. Nenhuma alteração do produto."

CHANGES=[
 dict(id="AUT3-DELTA-01",section="7.2",
      old="Estado scoped-red resulta de fail mais recente; scoped-green precisa de requisitos existentes e pass dos caminhos requeridos; sem requisito, retorna null. Um check error/pending não vira pass.",
      new="O estado usa o resultado mais recente por `(kind, command)` no tree: qualquer `fail` produz scoped-red e, sem requisito configurado, retorna null. Para scoped-green, basta algum check `scoped` com `pass` quando há scoped.tests, além de um `pass` por workflow exigido. Isso pode coexistir com outros checks scoped `pending`/`error`; não prova que todos os comandos scoped passaram.",
      sources=[("packages/core/src/board/ci.ts",[(426,454)])]),
 dict(id="AUT3-DELTA-02",section="7.2",
      old="Workflows são enviados uma vez por tree/arquivo no ledger observado.",
      new="Para o card, o ledger evita novo dispatch do mesmo workflow no mesmo tree quando já existe row com outcome diferente de `error`; se houver apenas rows em `error`, permite outra tentativa.",
      sources=[("packages/core/src/board/ci.ts",[(284,334)])]),
 dict(id="AUT3-DELTA-03",section="7.3",
      old="Subscription engine ou preço ausente é `not-metered`, e mistura de medido/não medido pode ser parcial.",
      new="`spend.card` considera medida a Session com custo positivo cujo provider não é `claude-code`; não medidas entram na outra classe apenas se têm tokens. O meter de modelos é `not-metered` sem Sessions vinculadas, ou se não houver Session medida e houver não medidas com tokens; nos demais casos retorna `usd`, inclusive `usd:0` com ambas as classes vazias. A coexistência de medidas e não medidas com tokens marca `partial`.",
      sources=[("packages/core/src/board/spend.ts",[(9,17),(19,55),(127,133)]),("packages/core/src/board/money.ts",[(21,64)])]),
]

def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()
def ref(name):
    b=(ROOT/name).read_bytes();return dict(path=name,bytes=len(b),sha256=sha(b),git_blob_sha=blob(b))
def write_json(name,value):
    (ROOT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def main():
    before=(ROOT/"body.md").read_bytes();recipe_before=(ROOT/"recipe.json").read_bytes()
    assert sha(before)==BODY_V2 and sha(recipe_before)==RECIPE_V2
    frozen_names=["review-supplement-1.md","review-supplement-1-index.json","review-supplement-1-receipt.json",
        "review-supplement-2.md","review-supplement-2-index.json","review-supplement-2-receipt.json","review-supplement-2-response.md",
        "external-source-captures.json","external-source-captures-supplement-2.json","captures.json","coverage.jsonl",
        "request.txt","response.md","evidence.md","evidence-review.md","document-integrity.json",
        "history/body-v1.md","history/recipe-v1.json","revisions/v2/delta.json","revisions/v2/request.txt","revisions/v2/response.md"]
    frozen={n:ref(n) for n in frozen_names}
    (ROOT/"history").mkdir(exist_ok=True)
    for name,data in [("history/body-v2.md",before),("history/recipe-v2.json",recipe_before)]:
        p=ROOT/name
        if p.exists():assert p.read_bytes()==data
        else:p.write_bytes(data)
    (HERE/"request.txt").write_text(REQUEST+"\n\n--- Autorização adicional ---\n\n"+ADDITIONAL_AUTHORIZATION+"\n",encoding="utf-8")
    ordered=[]
    for change in CHANGES:
        old=change["old"].encode();assert before.count(old)==1
        ordered.append({**change,"old_start":before.index(old),"old_end":before.index(old)+len(old)})
    ordered.sort(key=lambda c:c["old_start"])
    after=bytearray();pos=0;unchanged=[]
    for change in ordered:
        segment=before[pos:change["old_start"]];start_new=len(after);after.extend(segment)
        unchanged.append(dict(v2_interval=[pos,change["old_start"]],v3_interval=[start_new,len(after)],sha256=sha(segment),bytes=len(segment)))
        change["new_start"]=len(after);after.extend(change["new"].encode());change["new_end"]=len(after)
        pos=change["old_end"]
    start_new=len(after);segment=before[pos:];after.extend(segment)
    unchanged.append(dict(v2_interval=[pos,len(before)],v3_interval=[start_new,len(after)],sha256=sha(segment),bytes=len(segment)))
    after=bytes(after)
    inverse=after
    for change in reversed(ordered):
        assert inverse[change["new_start"]:change["new_end"]]==change["new"].encode()
        inverse=inverse[:change["new_start"]]+change["old"].encode()+inverse[change["new_end"]:]
    assert inverse==before
    (ROOT/"body.md").write_bytes(after)
    captures={c["path"]:c for c in json.loads((ROOT/"captures.json").read_text())["captures"]}
    changes=[]
    for c in ordered:
        evidence=[]
        for path,ranges in c["sources"]:
            capture=captures[path];raw=(ROOT/capture["capture_path"]).read_bytes();assert sha(raw)==capture["sha256"] and blob(raw)==capture["git_blob_sha"]
            lines=raw.splitlines(keepends=True)
            evidence.append(dict(path=path,archive=capture["capture_path"],commit=capture["commit"],git_blob_sha=capture["git_blob_sha"],
                sha256=capture["sha256"],bytes=capture["bytes"],intervals=[dict(first_line=a,last_line=b,
                    bytes=len(b"".join(lines[a-1:b])),sha256=sha(b"".join(lines[a-1:b]))) for a,b in ranges]))
        changes.append(dict(id=c["id"],section=c["section"],old_text=c["old"],new_text=c["new"],
            v2_byte_interval=[c["old_start"],c["old_end"]],v3_byte_interval=[c["new_start"],c["new_end"]],
            line_1_based=before[:c["old_start"]].count(b"\n")+1,old_bytes=len(c["old"].encode()),new_bytes=len(c["new"].encode()),sources=evidence))
    recipe=json.loads(recipe_before)
    recipe["producer_revision"]=3
    recipe["revision"]=dict(id="AUTOMATION-L1-v3",change_ids=[c["id"] for c in changes],
        previous_body=ref("history/body-v2.md"),previous_recipe=ref("history/recipe-v2.json"),current_body=ref("body.md"),
        request=ref("revisions/v3/request.txt"),replacement_count=3,
        scope="Only three explicitly authorized factual qualifications in §7.2–7.3; all other bytes identical",
        correction_authority="Principal authorization and producer static source inspection; no oracle",
        inverse_byte_equality_verified=True,
        supplements_preserved=[value for name,value in frozen.items() if name.startswith("review-supplement-")])
    recipe["producer_procedure"].append("v3: qualify scoped-green's existential predicate, workflow redispatch after only error rows, and spend.card metering; preserve v2 and supplements1/2; verify exact inverse to v2 bytes; no product tests.")
    recipe["prior_receipt_generator"]="revisions/v2/apply.py (v2; preserved unchanged)"
    recipe["deterministic_receipt_generator"]="revisions/v3/apply.py"
    for name in ["history/body-v2.md","history/recipe-v2.json","revisions/v3/request.txt"]:
        recipe["actual_inputs"].append({**ref(name),"read_scope":"authorized v3 documentary corrections"})
    extra_manifest=json.loads((ROOT/"external-source-captures-supplement-2.json").read_text())
    additional=extra_manifest["captures"][0]
    extra_bytes=(ROOT/additional["capture_path"]).read_bytes()
    assert sha(extra_bytes)==additional["sha256"] and blob(extra_bytes)==additional["git_blob_sha"]
    assert additional["population_member"] is False
    if additional["path"] not in {v["path"] for v in recipe["external_dependencies"]["semantic_source_refs"]}:
        recipe["external_dependencies"]["semantic_source_refs"].append(dict(input_key="file:"+additional["path"],path=additional["path"],
            capture_path=additional["capture_path"],commit=additional["commit"],git_blob_sha=additional["git_blob_sha"],
            sha256=additional["sha256"],bytes=additional["bytes"],source_owner="S1-04",population_member=False,authority="raw_source_only"))
        recipe["actual_inputs"].append(dict(path=additional["capture_path"],repository_path=additional["path"],
            commit=additional["commit"],git_blob_sha=additional["git_blob_sha"],sha256=additional["sha256"],bytes=additional["bytes"],
            source_owner="S1-04",population_member=False,role=additional["role"],
            read_scope="Previously captured supplement2 raw ResourceListInput/TransferInput evidence, now explicitly accounted in v3 recipe",
            authority="raw_source_not_acceptance_of_S1_04_artifact"))
    recipe["external_dependencies"]["semantic_input_count"]=len(recipe["external_dependencies"]["semantic_source_refs"])
    assert recipe["external_dependencies"]["semantic_input_count"]==8
    recipe["external_dependencies"]["additional_review_manifests"]=[ref("external-source-captures-supplement-2.json")]
    recipe["actual_inputs"].append({**ref("external-source-captures-supplement-2.json"),"read_scope":"identity of additional raw supplement2 schema input; no new capture"})
    recipe["artifacts"]=[ref("body.md") if a["path"]=="body.md" else a for a in recipe["artifacts"]]
    assert recipe["population"]==json.loads(recipe_before)["population"] and recipe["population"]["count"]==204
    write_json("recipe.json",recipe)
    response="# Resposta original do produtor — AUTOMATION-L1 v3\n\nApliquei exatamente as três correções documentais autorizadas. Corpo/receita v2 foram preservados integralmente em history/; suplementos1/2 e seus índices/recibos permanecem idênticos. Não houve mudança do produto.\n\n"
    for c in changes:
        response+=f"## {c['id']} — §{c['section']}\n\nAntes:\n\n> {c['old_text']}\n\nDepois:\n\n> {c['new_text']}\n\nIntervalo v2 `{c['v2_byte_interval']}`; intervalo v3 `{c['v3_byte_interval']}`; linha `{c['line_1_based']}`.\n\n"
    response+="## Identidades\n\n| Arquivo | Bytes | SHA256 | Git blob SHA1 |\n| --- | ---: | --- | --- |\n"
    for name in ["history/body-v2.md","history/recipe-v2.json","body.md","recipe.json"]:
        m=ref(name);response+=f"| {name} | {m['bytes']} | {m['sha256']} | {m['git_blob_sha']} |\n"
    response+="\nA inversão das três substituições recupera exatamente o corpo v2. Os quatro segmentos fora das substituições foram comparados byte a byte. Fonte/linhas/hashes estão em delta.json; o suplemento3 transportará os ramos completos.\n\nA receita v3 também incorpora a identidade do schema resource.ts já capturado e informado no suplemento2: são oito inputs semânticos brutos S1-04 (sete anteriores mais esse), fora das populações204/462, sem transferência de propriedade ou aceite Schema. Nenhuma nova captura ocorreu nesta revisão.\n\nVerificação documental apenas. Testes de produto/provider: NOT_RUN. Oracle: não acessado. Escrita remota: nenhuma. Julgamento/aceite: não realizados pelo produtor.\n"
    (HERE/"response.md").write_text(response,encoding="utf-8")
    for name,value in frozen.items():assert ref(name)==value,name
    for s in unchanged:assert before[s["v2_interval"][0]:s["v2_interval"][1]]==after[s["v3_interval"][0]:s["v3_interval"][1]]
    receipt=dict(schema="genesis-producer-literal-revision/v1",task="AUTOMATION-L1",revision=3,status="APPLIED_DOCUMENTARY_CORRECTIONS_NO_JUDGMENT",
        request=ref("revisions/v3/request.txt"),response=ref("revisions/v3/response.md"),procedure=ref("revisions/v3/apply.py"),
        before=dict(body=ref("history/body-v2.md"),recipe=ref("history/recipe-v2.json")),after=dict(body=ref("body.md"),recipe=ref("recipe.json")),
        offset_basis="UTF-8 bytes, zero-based, end exclusive; line numbers one-based",substitution_count=3,changes=changes,
        unchanged_segments=unchanged,inverse_recovers_v2_byte_for_byte=True,inverse_sha256=sha(inverse),
        preserved_files=list(frozen.values()),external_semantic_input_count=8,external_population_effect=0,
        counts=dict(local_population=204,subslice_population=462),
        raw_additional_source_identity_incorporated=additional["path"],new_source_captures=0,
        verification="exact replacement, inverse byte equality, source and file hashes; no product execution",
        product_tests="NOT_RUN",provider_execution="NOT_RUN",oracle_access=False,remote_writes=0,model_tokens="UNKNOWN",model_cost="UNKNOWN")
    write_json("revisions/v3/delta.json",receipt)
    print(json.dumps(dict(body_v3=ref("body.md"),recipe_v3=ref("recipe.json"),delta=ref("revisions/v3/delta.json"),
        request=ref("revisions/v3/request.txt"),response=ref("revisions/v3/response.md"),changes=[{k:v for k,v in c.items() if k!="sources"} for c in changes],
        inverse_equal=True,preserved=True),ensure_ascii=False,indent=2))

if __name__=="__main__":main()
