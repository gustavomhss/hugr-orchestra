"""Two authorized scheduler wording corrections, with exact inverse and immutable v3."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
BODY_V3 = "b31d52e5bf25f6eca3807e9c1f418b70d865c9d63c5690125c530c54f8247d84"
RECIPE_V3 = "d42e72daa68af5354ddc50e8f7d03c3bb82b451b2732612fc4a4dbb87ed89a3a"
REQUEST = "J1 automation-4 acabou REQUEST_EVIDENCE; relay salvará final literal em relay/automation-4/j1-response.md antes de ativar J2. Após concluir suplemento3, faça suplemento4 separado:RE4-01 políticas/ownership/port bind/unbind/IDs/dedupe/schema;02 model/capability-model completos (local, cron parseField/impossible/OR, firstSlot/following,weekly,horizonte,countWalls,gap);03 claim/takeover120s/servedslot/lock/settle/poda20/update/pause/remove/resume/repeat/manualrun;04 daemon boot/loop/failures/stale→due/sleepTICK e cobertura compartilhada204 comteste7decisivos já reconciliados. Dois pontos específicos para conferir: segunda verificação pré-prompt chama holds, e só antes da Session há cap.present; holds integral deve provar ou limitar owner. E manual replay devolve reused para prior não revoked e recusa running nãoadmitted; conferir possibilidade de prior assentado sem SessionInput para frase 'reutiliza Session somente depois de admissão'. Está autorizado a corrigir APENAS essas duas frases se a evidência mostrar imprecisão, em revisão nova preservando v3; outros defeitos proponha. Não aguarde autorizações para suplementos, só leitura pública/oracle proibido. Mesmo escopo, sem testeproduto/remote; preserve versões e registre hashes."
CONTINUATION = "J2 automation-4 também terminou e relay preservará agora; pedidos RE-AUT4-01..04 correspondem aos de J1, incluindo o mesmo ponto manualKey/reused semadmissão. Nenhum defeito além dos pontos a conferir, nenhuma execução timezone solicitada. A reconciliação204/83-25-7/89 e histórico80/83 é compartilhada do suplemento1, não reenviar. Incorpore J2 via arquivo original assim que salvo."

CHANGES = [
    dict(id="AUT4-DELTA-01", section="12",
         old="Em capability, verifica owner e `holds` antes da Session e outra vez antes de prompt.",
         new="Em capability, verifica a presença/identidade do owner antes da Session; para claim ainda não admitida, verifica `holds` antes da Session e outra vez antes de prompt, sem reler a Session do owner.",
         sources=[("packages/core/src/scheduled-task.ts", [(152,185)]),
                  ("packages/core/src/scheduled-task/capability.ts", [(121,157)])]),
    dict(id="AUT4-DELTA-02", section="12",
         old="Capability manualKey reutiliza Session somente depois de admissão; claim ainda starting retorna “retry shortly”; revoked não executa novamente com a mesma chamada.",
         new="No replay de capability manualKey, `running` sem SessionInput retorna “retry shortly” e `revoked` retorna erro; nos demais casos, o ramo devolve o SessionID retido com `reused:true`, sem exigir admissão para uma row já assentada.",
         sources=[("packages/core/src/scheduled-task/capability.ts", [(335,378)]),
                  ("packages/core/src/scheduled-task.ts", [(187,218),(272,302)])]),
]

def sha(data): return hashlib.sha256(data).hexdigest()
def blob(data): return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
def ref(name):
    data=(ROOT/name).read_bytes()
    return dict(path=name, bytes=len(data), sha256=sha(data), git_blob_sha=blob(data))
def write_json(name, value):
    (ROOT/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")

def main():
    before=(ROOT/"body.md").read_bytes()
    recipe_before=(ROOT/"recipe.json").read_bytes()
    assert sha(before)==BODY_V3 and sha(recipe_before)==RECIPE_V3
    frozen_names=["captures.json", "coverage.jsonl", "request.txt", "response.md", "evidence.md", "evidence-review.md",
                  "document-integrity.json", "external-source-captures.json", "external-source-captures-supplement-2.json"]
    frozen_names += [str(p.relative_to(ROOT)) for p in sorted((ROOT/"history").glob("*")) if p.is_file()]
    frozen_names += [str(p.relative_to(ROOT)) for v in [2,3] for p in sorted((ROOT/f"revisions/v{v}").glob("*")) if p.is_file()]
    frozen_names += [str(p.relative_to(ROOT)) for p in sorted(ROOT.glob("review-supplement-[123]*")) if p.is_file()]
    frozen={name:ref(name) for name in frozen_names}
    public=[dict(**ref(f"../../relay/automation-4/{j}-response.md"), origin="public_request_relay", judge_id=j.upper()) for j in ["j1","j2"]]
    captures={c["path"]:c for c in json.loads((ROOT/"captures.json").read_text())["captures"]}
    ordered=[]
    for change in CHANGES:
        old=change["old"].encode()
        assert before.count(old)==1
        evidence=[]
        for path,ranges in change["sources"]:
            c=captures[path]; raw=(ROOT/c["capture_path"]).read_bytes()
            assert sha(raw)==c["sha256"] and blob(raw)==c["git_blob_sha"] and len(raw)==c["bytes"]
            lines=raw.splitlines(keepends=True)
            evidence.append(dict(path=path, archive=c["capture_path"], commit=c["commit"], git_blob_sha=c["git_blob_sha"],
                sha256=c["sha256"], bytes=c["bytes"], intervals=[dict(first_line=a,last_line=b,
                    source_byte_start=sum(map(len,lines[:a-1])),source_byte_end_exclusive=sum(map(len,lines[:b])),
                    bytes=len(b"".join(lines[a-1:b])),sha256=sha(b"".join(lines[a-1:b]))) for a,b in ranges]))
        ordered.append({**change, "old_start":before.index(old), "old_end":before.index(old)+len(old), "evidence":evidence})
    ordered.sort(key=lambda c:c["old_start"])
    after=bytearray(); pos=0; unchanged=[]
    for c in ordered:
        segment=before[pos:c["old_start"]]; start_new=len(after); after.extend(segment)
        unchanged.append(dict(v3_interval=[pos,c["old_start"]],v4_interval=[start_new,len(after)],sha256=sha(segment),bytes=len(segment)))
        c["new_start"]=len(after); after.extend(c["new"].encode()); c["new_end"]=len(after); pos=c["old_end"]
    start_new=len(after); segment=before[pos:]; after.extend(segment)
    unchanged.append(dict(v3_interval=[pos,len(before)],v4_interval=[start_new,len(after)],sha256=sha(segment),bytes=len(segment)))
    after=bytes(after); inverse=after
    for c in reversed(ordered):
        assert inverse[c["new_start"]:c["new_end"]]==c["new"].encode()
        inverse=inverse[:c["new_start"]]+c["old"].encode()+inverse[c["new_end"]:]
    assert inverse==before
    for s in unchanged:
        assert before[s["v3_interval"][0]:s["v3_interval"][1]]==after[s["v4_interval"][0]:s["v4_interval"][1]]
    for name,data in [("history/body-v3.md",before),("history/recipe-v3.json",recipe_before)]:
        p=ROOT/name
        if p.exists(): assert p.read_bytes()==data
        else: p.write_bytes(data)
    (HERE/"request.txt").write_text(REQUEST+"\n\n--- Continuidade pública J2 ---\n\n"+CONTINUATION+"\n",encoding="utf-8")
    changes=[]
    for c in ordered:
        changes.append(dict(id=c["id"],section=c["section"],old_text=c["old"],new_text=c["new"],
            v3_byte_interval=[c["old_start"],c["old_end"]],v4_byte_interval=[c["new_start"],c["new_end"]],
            line_1_based=before[:c["old_start"]].count(b"\n")+1,old_bytes=len(c["old"].encode()),new_bytes=len(c["new"].encode()),
            old_sha256=sha(c["old"].encode()),new_sha256=sha(c["new"].encode()),sources=c["evidence"]))
    (ROOT/"body.md").write_bytes(after)
    recipe=json.loads(recipe_before)
    recipe["producer_revision"]=4
    recipe["revision"]=dict(id="AUTOMATION-L1-v4",change_ids=[c["id"] for c in changes],
        previous_body=ref("history/body-v3.md"),previous_recipe=ref("history/recipe-v3.json"),current_body=ref("body.md"),
        request=ref("revisions/v4/request.txt"),replacement_count=2,
        scope="Only two authorized scheduler wording qualifications in section12; all other body bytes identical",
        correction_authority="Principal authorization and producer static inspection of captured baseline source; no oracle",
        inverse_byte_equality_verified=True,
        supplements_preserved=[value for name,value in frozen.items() if name.startswith("review-supplement-")])
    recipe["producer_procedure"].append("v4: distinguish owner presence check from the two holds calls; describe the actual manualKey replay predicate without inferring admission for settled rows. Preserve v3 and supplements1/2/3, verify exact inverse, no product execution.")
    recipe["prior_receipt_generator"]="revisions/v3/apply.py (v3; preserved unchanged)"
    recipe["deterministic_receipt_generator"]="revisions/v4/apply.py"
    for name in ["history/body-v3.md","history/recipe-v3.json","revisions/v4/request.txt"]:
        recipe["actual_inputs"].append({**ref(name),"read_scope":"authorized v4 documentary corrections"})
    recipe["actual_inputs"] += [{**value,"read_scope":"public evidence request, not oracle or authority to execute"} for value in public]
    recipe["artifacts"]=[ref("body.md") if a["path"]=="body.md" else a for a in recipe["artifacts"]]
    previous_recipe=json.loads(recipe_before)
    assert recipe["population"]==previous_recipe["population"] and recipe["population"]["count"]==204
    assert recipe["external_dependencies"]==previous_recipe["external_dependencies"]
    assert recipe["external_dependencies"]["semantic_input_count"]==8
    write_json("recipe.json",recipe)
    response="# Resposta original do produtor — AUTOMATION-L1 v4\n\nApliquei apenas as duas qualificações autorizadas no scheduler. Corpo e receita v3 estão preservados integralmente em history/. Suplementos1/2/3, seus índices e recibos permanecem idênticos.\n\n"
    for c in changes:
        response+=f"## {c['id']} — §{c['section']}\n\nAntes:\n\n> {c['old_text']}\n\nDepois:\n\n> {c['new_text']}\n\nIntervalo UTF-8 v3 `{c['v3_byte_interval']}`; v4 `{c['v4_byte_interval']}`; linha `{c['line_1_based']}`.\n\n"
    response+="A primeira correção diferencia a presença/identidade do owner de estado, lease, revisão e habilitação verificados por holds. A segunda documenta o predicado efetivo do replay: a consulta a SessionInput só bloqueia a reutilização quando a row está running. O caminho inicial não admitido continua sendo enviado a void, exceto revoked; isso será transportado integralmente no suplemento4. Não se afirma uma reprodução de row assentada sem admissão nem uma falha executada.\n\n## Identidades\n\n| Arquivo | Bytes | SHA256 | Git blob SHA1 |\n| --- | ---: | --- | --- |\n"
    for name in ["history/body-v3.md","history/recipe-v3.json","body.md","recipe.json"]:
        value=ref(name);response+=f"| {name} | {value['bytes']} | {value['sha256']} | {value['git_blob_sha']} |\n"
    response+="\nInversão das duas substituições recupera v3 byte a byte. Os três segmentos não alterados foram comparados. Fontes, linhas, offsets e hashes estão em delta.json. Permanecem oito inputs semânticos externos brutos S1-04, população local204/subslice462 e nenhuma nova captura.\n\nVerificação documental somente; testes e provider: NOT_RUN. Oracle/julgamento reservado: não acessados. Nenhuma mudança de produto ou escrita remota. Aceite/julgamento não realizados pelo produtor.\n"
    (HERE/"response.md").write_text(response,encoding="utf-8")
    for name,value in frozen.items(): assert ref(name)==value,name
    receipt=dict(schema="genesis-producer-literal-revision/v1",task="AUTOMATION-L1",revision=4,status="APPLIED_DOCUMENTARY_CORRECTIONS_NO_JUDGMENT",
        request=ref("revisions/v4/request.txt"),response=ref("revisions/v4/response.md"),procedure=ref("revisions/v4/apply.py"),public_request_refs=public,
        before=dict(body=ref("history/body-v3.md"),recipe=ref("history/recipe-v3.json")),after=dict(body=ref("body.md"),recipe=ref("recipe.json")),
        offset_basis="UTF-8 bytes, zero-based, end exclusive; line numbers one-based",substitution_count=2,changes=changes,
        unchanged_segments=unchanged,inverse_recovers_v3_byte_for_byte=True,inverse_sha256=sha(inverse),preserved_files=list(frozen.values()),
        external_semantic_input_count=8,external_population_effect=0,counts=dict(local_population=204,subslice_population=462),new_source_captures=0,
        verification="exact replacements, inverse equality, unchanged segments and literal source identities; no product execution",
        product_tests="NOT_RUN",provider_execution="NOT_RUN",oracle_access=False,remote_writes=0,model_tokens="UNKNOWN",model_cost="UNKNOWN")
    write_json("revisions/v4/delta.json",receipt)
    print(json.dumps(dict(body_v4=ref("body.md"),recipe_v4=ref("recipe.json"),delta=ref("revisions/v4/delta.json"),
        request=ref("revisions/v4/request.txt"),response=ref("revisions/v4/response.md"),
        changes=[{k:v for k,v in c.items() if k!="sources"} for c in changes],inverse_equal=True,preserved=True),ensure_ascii=False,indent=2))

if __name__=="__main__": main()
