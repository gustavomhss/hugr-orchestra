"""Deterministic evidence projection and authorized one-body correction. No product execution."""
from pathlib import Path
from collections import Counter, defaultdict
import copy
import difflib
import hashlib
import json

R = Path(__file__).resolve().parent
ROOT = R.parent.parent
B = ROOT / "producers/b"
D = ROOT / "output/producers/b/review-dossier.md"
PIN = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
PROTOCOL = "ee2521a5b966bd505cc95bd1c733e09e12f33531"
BASE_DOSSIER = "6c0face0fd44960dbc7bae233ec90607956af5a6a8b40fc50a8fc2a82dc5ce86"
BASE_FRAGMENT = "1d018091d48893b69d390db03c01d39d785ce58c1a52230471308a1bfacab98b"
FUTURE = "revisions/b-l1-evidence-v1"
PAYLOAD = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/" + FUTURE

def sha(data): return hashlib.sha256(data).hexdigest()
def info(p):
    raw = p.read_bytes()
    return {"sha256": sha(raw), "byte_length": len(raw)}
def dump(name, value):
    (R / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
def snapshot(): return {str(p.relative_to(B)): info(p) for p in sorted(B.rglob("*")) if p.is_file()}
def ref(name): return {"payload_path": f"{PAYLOAD}/{name}", **info(R / name)}

before = snapshot()
assert sha(D.read_bytes()) == BASE_DOSSIER
assert before["artifacts.json"]["sha256"] == BASE_FRAGMENT
fragment = json.loads((B / "artifacts.json").read_text())
coverage_doc = json.loads((B / "coverage.json").read_text())
entries = coverage_doc["entries"]
manifest = json.loads((B / "source-manifest.json").read_text())
sources = {s["path"]: s for s in manifest["sources"]}
compact = json.loads((B / "review-evidence-compact-index.json").read_text())
old_lines = defaultdict(set)
for s in compact["sources"]:
    for span in s["ranges"]: old_lines[s["path"]].update(range(span["start_line"], span["end_line"]+1))
keys = [a["key"] for a in fragment["artifacts"]]
bykey = {a["key"]: a for a in fragment["artifacts"]}
assert len(keys) == 9 and len(set(keys)) == 9
for a in fragment["artifacts"]:
    raw = (B / a["body"]["path"]).read_bytes()
    assert raw in D.read_bytes()
    assert sha(raw) == a["body"]["sha256"] and len(raw) == a["body"]["byte_length"]

# A new version, never an edit to the original. Only the principal-authorized sentence changes.
target = "s1.api.session-contract"
original_body = (B / bykey[target]["body"]["path"]).read_bytes()
old = "Missing command resolution maps to an invalid request; an MCP-backed command failure is logged and returned as an unknown server error."
new = "Missing command resolution maps to an invalid request; MCP-backed command failures map to `UnknownError`. The inspected mapping branch contains no logging call."
assert original_body.decode().count(old) == 1
corrected_body = original_body.decode().replace(old, new).encode()
(R / "corrected").mkdir(exist_ok=True)
(R / "corrected/session-contract.md").write_bytes(corrected_body)
diff = "".join(difflib.unified_diff(original_body.decode().splitlines(keepends=True), corrected_body.decode().splitlines(keepends=True), fromfile="producers/b/bodies/session-contract.md", tofile=f"{FUTURE}/corrected/session-contract.md", n=2))
(R / "corrected/session-contract.diff").write_text(diff)
newbody = {"path": f"{FUTURE}/corrected/session-contract.md", "encoding": "utf-8", "byte_length": len(corrected_body), "sha256": sha(corrected_body)}
revised_fragment = copy.deepcopy(fragment)
next(a for a in revised_fragment["artifacts"] if a["key"] == target)["body"] = newbody
dump("corrected/fragment-metadata.json", revised_fragment)

response = f"""# Correção de S1-L1-B: session-contract

Criei uma nova versão somente de `s1.api.session-contract`, sem alterar nenhum original. A frase sobre comandos MCP agora registra o mapeamento para `UnknownError` e a ausência de chamada de log no ramo observado. Não afirma que nenhum outro componente do servidor possa registrar a requisição.

Original: `producers/b/bodies/session-contract.md`, {len(original_body)} bytes, SHA-256 `{sha(original_body)}`.
Nova versão: `{FUTURE}/corrected/session-contract.md`, {len(corrected_body)} bytes, SHA-256 `{sha(corrected_body)}`.

O diff delimitado está em `corrected/session-contract.diff`. `corrected/fragment-metadata.json` copia o fragmento original e altera apenas o objeto `body` desse key, com o path futuro relativo ao pacote solicitado. Os demais oito objetos de artefato permanecem idênticos. Os refs originais de pedido/resposta são preservados como proveniência do candidato-base; `corrected/correction-receipt.json` vincula este pedido e esta resposta de correção para a selagem pela principal.

Autoridade factual: `packages/server/src/handlers/session.ts`, commit `{PIN}`, blob `{sources['packages/server/src/handlers/session.ts']['git_blob_sha']}`, linhas 267–273. Os ramos `Mcp.NotFoundError` e `Mcp.RequestError` retornam `UnknownError`; o trecho não chama logging. A evidência exata e seu hash estão no suplemento desta revisão.

Verificação local: originais em `producers/b` preservados byte-for-byte; os nove corpos continuam correspondendo aos bytes do dossiê-base `{BASE_DOSSIER}`; o novo corpo difere somente pela substituição autorizada. Não executei produto, não li oracle e não enviei o pacote aos juízes. Não há aceite semântico antecipado.
"""
(R / "corrected/response.md").write_text(response)

# Lossless grouping of the original row data, with all common values inherited by members.
cols = ["family", "kind", "depth", "source_read_status", "need", "artifact_key", "justification"]
reason_values = sorted({e["justification"] for e in entries})
reasons = {f"R{i:02}": value for i, value in enumerate(reason_values, 1)}
reason_ids = {value: key for key, value in reasons.items()}
grouped = defaultdict(list)
for e in entries: grouped[tuple(e[c] for c in cols)].append(e)
groups = []
for i, (common, members) in enumerate(sorted(grouped.items()), 1):
    groups.append({"id": f"G{i:02}", "count": len(members), "common": dict(zip(cols, common)), "reason_id": reason_ids[common[-1]], "members": [{k: v for k, v in e.items() if k not in cols} for e in sorted(members, key=lambda x: x["path"])]})
need_values = ["entry", "ownership", "maintenance", "operational", "flow", "evidence", "component"]
depth_values = ["L1_full_source", "L1_representative_source", "L1_literal_surface", "captured_only", "inventory_only"]
need_matrix = {need: {depth: sum(e["need"] == need and e["depth"] == depth for e in entries) for depth in depth_values} for need in need_values}
artifact_inventory = []
for a in fragment["artifacts"]:
    owned = [e for e in entries if e["artifact_key"] == a["key"]]
    artifact_inventory.append({"key": a["key"], "title": a["title"], "need": a["need"], "layer": a["layer"], "required_in_frozen_fragment": a["key"] in fragment["required_artifact_keys"], "frozen_body": a["body"], "candidate_body": newbody if a["key"] == target else a["body"], "body_change": "authorized correction, separate version" if a["key"] == target else "none", "primary_assigned_members": len(owned), "depth_counts": dict(Counter(e["depth"] for e in owned)), "family_counts": dict(Counter(e["family"] for e in owned)), "gaps_verbatim": a["gaps"], "build_dependencies_verbatim": a["build_dependencies"], "semantic_review_refs_at_freeze": a["semantic_review_refs"], "runtime_receipt_refs_at_freeze": a["runtime_receipt_refs"]})

# These are conditions already recorded in the frozen scope/gaps. They do not invent new artifact keys or tests.
future = [
    {"id": "F01", "keys": keys, "condition": "Antes de liberar L2–L4 dependente dos nove L1", "obligation": "A principal precisa dos dois juízos aplicáveis aos bytes e evidências exatos; esta projeção e a correção não constituem aceite.", "blocked_dependents": "Explicações locais L2, relações/impactos L3 e ownership/manutenção L4 que usam estes L1.", "basis": "Todos os nove artifacts.gaps[0]; protocolo S1: L1/L2/L3/L4 e dois juízes."},
    {"id": "F02", "keys": ["s1.api.surface-disposition", "s1.api.sdk-composition", "s1.api.schema-contracts"], "condition": "Antes de afirmar entendimento semântico completo dos módulos de domínio", "obligation": "Tratar as 190 fontes apenas indexadas (94 Schema, 44 Protocol, 51 Server e SDK tool.ts) com a profundidade justificada para a necessidade real. O inventário não prova regras internas.", "blocked_dependents": "Explicações ou procedimentos sobre regras/efeitos/falhas dos domínios ainda não lidos semanticamente.", "basis": "coverage: L1_literal_surface; surface-disposition.gaps; schema-contracts.gaps."},
    {"id": "F03", "keys": ["s1.api.surface-disposition", "s1.api.client-projection", "s1.api.codegen"], "condition": "Antes de elevar inventário de gerados/testes/fixtures/configs a prova de comportamento", "obligation": "Manter as 183 entradas inventory-only e os 2 gerados capturados sem leitura distintos de fonte lida. Agrupamento por autoridade de geração continua válido para disposição; não exige ler todos os gerados por rotina.", "blocked_dependents": "Alegações de comportamento ou sucesso derivadas apenas desses arquivos não lidos.", "basis": "coverage: inventory_only/captured_only e justificativas exatas; client-projection.gaps; codegen.gaps."},
    {"id": "F04", "keys": ["s1.api.boundaries", "s1.api.session-contract", "s1.api.sdk-composition"], "condition": "Antes de afirmar ciclo de sessão, persistência, agendamento ou recuperação ponta a ponta", "obligation": "Vincular evidência aceita dos donos Core às delegações observadas. Os adaptadores por si só não provam transação, execução exatamente uma vez, recuperação distribuída ou isolamento sob toda concorrência.", "blocked_dependents": "Fluxos integrados de sessão, impacto de mudanças de runtime e diagnósticos de recuperação.", "basis": "boundaries/session-contract/sdk-composition gaps e limites dos corpos."},
    {"id": "F05", "keys": ["s1.api.codegen", "s1.api.client-projection", "s1.api.boundaries"], "condition": "Após mudança pública de HttpApi ou antes de alegar frescor/import boundary executado", "obligation": "Seguir a autoridade de regeneração e obter as verificações reais pertinentes. Este trabalho executou zero geração/build/testes; não transforma testes lidos em PASS.", "blocked_dependents": "Procedimento de mudança segura com frescor de gerados, prova de bundle/browser e interoperabilidade executada.", "basis": "AGENTS.md 1–2; Client package scripts; gaps codegen/client/boundaries."},
    {"id": "F06", "keys": ["s1.api.server-edge", "s1.api.stream-contract", "s1.api.sdk-composition"], "condition": "Antes de afirmar comportamento operacional observado", "obligation": "Produzir a prova de runtime correspondente quando autorizada. Manter distintos origem/autoridade, live versus durable, limite de fila e ausência de reconnect automático; os testes existentes aqui são apenas fonte.", "blocked_dependents": "Garantias operacionais de autorização, boot, socket, overflow/replay, transporte e concorrência SDK.", "basis": "server-edge/stream-contract/sdk-composition gaps."},
    {"id": "F07", "keys": ["s1.api.client-projection", "s1.api.schema-contracts", "s1.api.codegen"], "condition": "Ao manter as superfícies onde fonte e intenção divergem", "obligation": "Preservar e resolver com o dono a divergência README/fs.read, o upload sem declaração no grupo/handler inspecionado e os identificadores V2. Não alegar que esta revisão os corrigiu.", "blocked_dependents": "Manutenção que pressupõe alinhamento total de documentação, nomes e transporte de upload.", "basis": "Gaps congelados client-projection/schema-contracts; corpos respectivos."},
    {"id": "F08", "keys": ["s1.api.client-projection", "s1.api.codegen", "s1.api.surface-disposition"], "condition": "Antes de binding do input generated/types.ts no runtime atual", "obligation": "Resolver explicitamente o limite de 256.000 bytes para o arquivo capturado de 462.732 bytes, ou manter o binding bloqueado. Não omitir, subdividir disfarçadamente ou fabricar versão observada.", "blocked_dependents": "Import/binding/publicação que dependem da observação fiel desse input.", "basis": "source-manifest exact bytes; transport current observer boundary; gaps respectivos."},
    {"id": "F09", "keys": keys, "condition": "Antes de declarar entrega S1 inteira ou publicação consumível", "obligation": "A principal completa o inventário finito das camadas posteriores e os recibos separados de revisão, binding, publicação e consumo. As chaves futuras não foram inventadas neste suplemento.", "blocked_dependents": "Declaração de completude de S1 e aceitação/publicação operacional além deste L1 B.", "basis": "CC-1/CC-2, S1 scope e common transport; fragment package_state IN_PROGRESS."},
]
projection = {"schema": "genesis-l1-coverage-projection/v1", "source_revision": PIN, "protocol_revision": PROTOCOL, "scope": "orchestra.s1", "task": "S1-L1-B", "base_dossier": {"path": "output/producers/b/review-dossier.md", **info(D)}, "base_fragment": {"path": "producers/b/artifacts.json", **info(B / "artifacts.json")}, "base_coverage": {"path": "producers/b/coverage.json", **info(B / "coverage.json")}, "assigned_count": len(entries), "family_count": len({e["family"] for e in entries}), "group_count": len(groups), "required_artifact_keys_verbatim": fragment["required_artifact_keys"], "missing_required_artifact_keys_verbatim": fragment["missing_required_artifact_keys"], "need_depth_matrix": need_matrix, "reasons_verbatim": reasons, "artifact_inventory": artifact_inventory, "groups": groups, "future_obligations": future, "future_artifact_keys": None, "acceptance_limit": "Complete grouped disposition and nine bounded L1 bodies do not establish complete domain semantics, CC-1 for all S1, judge acceptance, or runtime binding."}
dump("coverage-projection.json", projection)

# Material claims whose decisive lines are absent from the compact dossier. Only missing lines are emitted.
desired = []
def add(tags, p, claim, *ranges): desired.append((tags.split(), p, claim, ranges))
add("boundaries", "docs/architecture/phase-plans/70-90-briefs/EXP-SCHEMA.md", "Historical source baseline is distinct from current capture pin", (7, 7))
add("boundaries", "docs/architecture/phase-plans/70-90-briefs/EXP-PROTOCOL.md", "Historical source baseline", (7, 7))
add("boundaries", "docs/architecture/phase-plans/70-90-briefs/EXP-SERVER.md", "Historical source baseline", (7, 7))
add("boundaries", "docs/architecture/phase-plans/70-90-briefs/RN-SDK.md", "Historical source baseline", (9, 9))
add("boundaries schema-contracts", "packages/schema/AGENTS.md", "Direct event entrypoints, readonly contracts and loose ID compatibility are intent", (10, 10), (60, 60), (76, 76))
add("boundaries schema-contracts", "packages/schema/src/model.ts", "Observed V2 brand and identifier", (8, 9), (85, 87))
add("schema-contracts", "packages/schema/src/session.ts", "Session time/cost/token fields omitted from compact range", (36, 48))
add("schema-contracts", "packages/schema/src/prompt.ts", "Canonical attachment includes mime; Prompt files use this schema", (12, 20), (40, 45))
add("schema-contracts", "packages/schema/src/prompt-input.ts", "Admission attachment omits mime and has its own Prompt schema", (7, 26))
add("schema-contracts", "packages/schema/src/session-delivery.ts", "steer/queue delivery union", (5, 6))
add("schema-contracts", "packages/schema/src/session-message.ts", "Message ID prefix, tool states/provider facts and message union", (13, 16), (122, 142), (206, 219))
add("schema-contracts", "packages/schema/src/event.ts", "Event ID prefix", (9, 12))
add("schema-contracts stream-contract", "packages/schema/src/session-event.ts", "Failed step version option and live-only/full-value boundaries", (245, 254), (307, 329), (351, 369), (472, 494))
add("schema-contracts stream-contract", "packages/schema/src/durable-event-manifest.ts", "Durable manifest includes Maestro, RelayHook and Research", (1, 20))
add("session-contract", "packages/protocol/src/groups/session.ts", "Session list envelope and archive/remove declared responsibilities", (137, 147), (202, 220), (240, 252))
add("session-contract", "packages/server/src/handlers/session.ts", "Default page sizes, session list cursor behavior and create cwd fallback", (24, 25), (107, 164))
add("session-contract", "packages/server/src/handlers/session.ts", "Operation/policy/context mappings; command UnknownError branch without logging", (35, 46), (82, 91), (261, 303), (587, 612), (686, 701))
add("session-contract", "packages/protocol/src/groups/message.ts", "Message limit 1–200 and page envelope", (7, 36))
add("session-contract", "packages/server/src/handlers/message.ts", "Default page size and opaque cursor codec", (8, 23))
add("server-edge", "packages/protocol/src/errors.ts", "Remaining 404 and invalid-cursor schemas", (46, 54), (65, 97), (105, 121))
add("server-edge", "packages/server/src/middleware/capability-authorization.ts", "Cause preservation and canonical Basic decoding", (49, 60), (68, 78))
add("server-edge", "packages/server/src/location.ts", "Cached location caveat", (43, 48))
add("server-edge sdk-composition", "packages/server/src/principal.ts", "OS account principal, not one identity per Basic username", (1, 20))
add("server-edge", "packages/server/src/handlers/model.ts", "Catalog availability, deduplication and preferred/default model", (14, 43))
add("server-edge", "packages/server/src/handlers/provider.ts", "Provider list/sign-in adapter declarations", (13, 56))
add("client-projection", "packages/client/src/generated/client.ts", "Header precedence and binary files.read method identity", (539, 556), (1548, 1561))
add("client-projection", "packages/client/src/generated-effect/client.ts", "Actual generated adapter uses original ClientApi and validates headers", (3410, 3485))
add("client-projection", "packages/client/src/wire.ts", "Encoded session-event projection", (1, 4))
add("client-projection", "packages/client/src/actions-transfer.ts", "Streaming successful response ownership and stream support probe", (15, 62), (107, 121))
add("client-projection", "packages/client/src/actions-transfer-error.ts", "Outcome retained and retry-after parser", (4, 34), (130, 136))
add("client-projection", "packages/server/src/handlers/actions-transfer.ts", "Complete inspected group contains info/read handlers, not upload", (1, 35))
add("codegen", "tooling/httpapi-codegen/src/index.ts", "Input mode, collision rejection, recursive-type refusal and manifest ownership read", (158, 171), (178, 211), (531, 551), (707, 713))
add("codegen surface-disposition", "packages/client/src/generated/.httpapi-codegen.json", "Exact Promise generated output membership, 40 names", (1, 42))
add("codegen surface-disposition", "packages/client/src/generated-effect/.httpapi-codegen.json", "Exact Effect generated output membership, 14 names", (1, 16))
add("client-projection", "packages/client/test/promise.test.ts", "Unexecuted intended wire timestamp assertion", (101, 115))
add("client-projection", "packages/client/test/effect.test.ts", "Unexecuted intended decoded timestamp assertion", (6, 16))
add("stream-contract", "packages/server/test/event-stream.test.ts", "Test stand-in scope and unexecuted burst/encoding assertions", (8, 16), (51, 59), (87, 94))
add("sdk-composition", "packages/sdk-next/test/embedded.test.ts", "Unexecuted admission/wake/durable/missing-session/isolation assertions", (59, 75), (108, 123), (166, 166), (187, 199))
add("boundaries", "packages/server/test/client-contract-identity.test.ts", "Unexecuted intended canonical identity and client/server generation checks", (24, 45))

selected_by_path = {}
for tags, p, claim, ranges in desired:
    rec = selected_by_path.setdefault(p, {"keys": set(), "claims": [], "lines": set()})
    rec["keys"].update("s1.api." + tag for tag in tags)
    rec["claims"].append(claim)
    line_count = len((B / "sources" / p).read_bytes().decode().splitlines(keepends=True))
    for start, end in ranges: rec["lines"].update(set(range(start, min(end, line_count)+1)) - old_lines[p])
supplement = []
for i, (p, selection) in enumerate(selected_by_path.items(), 1):
    if not selection["lines"]: continue
    raw = (B / "sources" / p).read_bytes()
    assert sha(raw) == sources[p]["sha256"]
    assert hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest() == sources[p]["git_blob_sha"]
    lines = raw.decode().splitlines(keepends=True)
    spans = []
    ordered = sorted(selection["lines"])
    start = prev = ordered[0]
    ranges = []
    for n in ordered[1:]:
        if n != prev + 1: ranges.append((start, prev)); start = n
        prev = n
    ranges.append((start, prev))
    for start, end in ranges:
        text = "".join(lines[start-1:end])
        spans.append({"start_line": start, "end_line": end, "byte_length": len(text.encode()), "sha256": sha(text.encode()), "text": text})
    supplement.append({"id": f"S{len(supplement)+1:02}", "path": p, "commit": PIN, "git_blob_sha": sources[p]["git_blob_sha"], "source_sha256": sources[p]["sha256"], "source_byte_length": sources[p]["byte_length"], "artifact_keys": sorted(selection["keys"]), "claims": selection["claims"], "ranges": spans})

out = ["# Evidência adicional exata para o candidato L1 B\n\n", f"Base: `output/producers/b/review-dossier.md`, SHA-256 `{BASE_DOSSIER}`. Fonte: `{PIN}`. Protocolo: `{PROTOCOL}`. Todos os trechos vêm de bytes previamente capturados. Somente linhas ausentes do compacto congelado são acrescentadas; saltos de linhas são explícitos. A seleção não eleva a profundidade registrada em coverage e não representa execução.\n\n", "## Correção factual autorizada\n\n", "O corpo-base session-contract atribuía logging ao ramo de comando MCP. O trecho de handlers/session.ts 267–273 mapeia as duas falhas para UnknownError sem chamada de log nesse ramo. A nova versão separada em corrected/session-contract.md remove essa garantia. O resto do dossiê-base permanece congelado. Esta constatação não afirma ausência de logs em todo o servidor.\n\n", "## Mapa de artefato para fonte adicional\n\n"]
for key in keys:
    out.append(f"- `{key}`: {', '.join(s['id'] for s in supplement if key in s['artifact_keys']) or 'Cobertura exata em coverage-projection.md; evidência primária já no dossiê-base'}.\n")
for s in supplement:
    out.append(f"\n## {s['id']} — `{s['path']}`\n\nCommit `{PIN}`; blob `{s['git_blob_sha']}`; arquivo SHA-256 `{s['source_sha256']}`; {s['source_byte_length']} bytes.\n\nFinalidade: {'; '.join(s['claims'])}.\n\n")
    for span in s["ranges"]:
        out.append(f"Linhas {span['start_line']}–{span['end_line']}; trecho SHA-256 `{span['sha256']}`:\n\n```\n{span['text']}")
        if not span["text"].endswith("\n"): out.append("\n")
        out.append("```\n\n")
(R / "source-supplement.md").write_text("".join(out))
dump("source-supplement-index.json", {"schema": "genesis-source-supplement/v1", "source_revision": PIN, "base_dossier": {"path": "output/producers/b/review-dossier.md", **info(D)}, "base_compact": {"path": "producers/b/review-evidence-compact.md", **info(B / "review-evidence-compact.md")}, "sources": [{**s, "ranges": [{k: v for k, v in span.items() if k != "text"} for span in s["ranges"]]} for s in supplement]})

short = {key: f"A{i:02}" for i, key in enumerate(keys, 1)}
depth_names = {"L1_full_source": "full", "L1_representative_source": "representative", "L1_literal_surface": "surface", "captured_only": "captured", "inventory_only": "inventory"}
normative = ROOT / "protocol/genesis-ownership-plan.md"
normraw = normative.read_bytes()
assert hashlib.sha1(b"blob " + str(len(normraw)).encode() + b"\0" + normraw).hexdigest() == "b45a73f17c34341097a8c8725a1df6260cd273b5"
cc1 = normraw.decode().splitlines()[158]
md = ["# Projeção exata de cobertura e necessidades — L1 B\n\n", f"Dossiê-base verificado: `{BASE_DOSSIER}`. Fragmento-base: `{BASE_FRAGMENT}`. Fonte `{PIN}`, protocolo `{PROTOCOL}`, scope `orchestra.s1`. Esta revisão adiciona evidência e uma única correção autorizada; não julga o candidato e não altera os originais.\n\n", "## CC-1 e limite desta projeção\n\n", "Fonte normativa identificada pelo registro público de critérios: `modules/atlas/docs/design/genesis-ownership-plan.md`, blob `b45a73f17c34341097a8c8725a1df6260cd273b5`, SHA-256 `" + sha(normraw) + "`, linha 159:\n\n```\n" + cc1 + "\n```\n\n", "O inventário finito deste fragmento contém nove L1 obrigatórios, todos com corpo; missing_required_artifact_keys está vazio. Isso não significa que toda a população tenha conhecimento semântico completo nem que CC-1 de S1 inteiro esteja satisfeito. Há 472 entradas atribuídas, 52 famílias, 68 grupos de disposição, 289 fontes atribuídas capturadas e duas autoridades de fronteira externas. A classificação é copiada sem promoção de profundidade.\n\n", "## Os nove keys obrigatórios\n\n", "| ID | Key | Need | Entradas primárias | Full / representative / surface / captured / inventory | Corpo candidato |\n| --- | --- | --- | ---: | --- | --- |\n"]
for a in artifact_inventory:
    counts = " / ".join(str(a["depth_counts"].get(d, 0)) for d in depth_values)
    md.append(f"| {short[a['key']]} | `{a['key']}` | `{a['need']}` | {a['primary_assigned_members']} | {counts} | {'Nova versão separada, somente logging MCP' if a['key']==target else 'Original intacto'} |\n")
md.append("\nEntradas primárias são uma partição de coverage, não o número de source_refs: fontes de fronteira e referências compartilhadas sobrepõem-se entre artefatos. A entrada `packages/sdk-next/src/tool.ts` continua surface, embora seu key primário seja sdk-composition. Os demais 189 surface são 94 Schema + 44 Protocol + 51 Server.\n\n")
md.append("### Identidades de corpos\n\n| Key | Corpo original SHA-256 / bytes | Corpo candidato SHA-256 / bytes |\n| --- | --- | --- |\n")
for a in artifact_inventory:
    md.append(f"| {short[a['key']]} | `{a['frozen_body']['sha256']}` / {a['frozen_body']['byte_length']} | `{a['candidate_body']['sha256']}` / {a['candidate_body']['byte_length']} |\n")
md.append("\n## Matriz need × profundidade\n\n| Need | full | representative | surface | captured | inventory | Total |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n")
for need in need_values:
    vals = [need_matrix[need][d] for d in depth_values]
    md.append(f"| `{need}` | " + " | ".join(str(v) for v in vals) + f" | {sum(vals)} |\n")
md.append("\n`evidence` é um need legal sem key primário neste fragmento; a evidência é vinculada aos nove artefatos, e não foi inventado um décimo key. Totais atribuídos: 95 full, 2 representative, 190 surface, 2 captured-only, 183 inventory. As duas autoridades externas full elevam o registro global de leitura a 97 full.\n\n")
md.append("## Justificativas exatas do original\n\n")
for rid, value in reasons.items(): md.append(f"- **{rid}:** {value}\n")
md.append("\n## Grupos exatos por família, tipo, profundidade e key\n\nAs 68 linhas abaixo particionam as 472 entradas sem perda. `coverage-projection.json` preserva todos os membros e todos os campos originais; cada membro herda os sete campos common. Reconstituir common + member reproduz a linha original exatamente.\n\n| Grupo | Família | Tipo | Count | Profundidade | Key / need | Razão |\n| --- | --- | --- | ---: | --- | --- | --- |\n")
for g in groups:
    c = g["common"]
    md.append(f"| {g['id']} | `{c['family']}` | `{c['kind']}` | {g['count']} | `{depth_names[c['depth']]}` | {short[c['artifact_key']]} / `{c['need']}` | {g['reason_id']} |\n")
md.append("\n### Resumo das 52 famílias\n\n")
md.append("| Família | Count | Profundidades e counts |\n| --- | ---: | --- |\n")
for fam in sorted({e["family"] for e in entries}):
    rows = [e for e in entries if e["family"] == fam]
    counts = Counter(e["depth"] for e in rows)
    md.append(f"| `{fam}` | {len(rows)} | " + ", ".join(f"{depth_names[d]}={counts[d]}" for d in depth_values if counts[d]) + " |\n")
md.append("\n## Obrigações futuras já decorrentes dos limites congelados\n\nEstas condições não são novos artefatos L2–L4 nem testes impostos por esta revisão. Os nomes dos artefatos futuros não foram observados no fragmento; permanecem null no JSON. A principal deve fixá-los no trabalho correspondente, sem copiar um PASS de inventário ou de hashing.\n\n| ID | Condição | Obrigação preservada | Dependentes ainda bloqueados |\n| --- | --- | --- | --- |\n")
for f in future:
    md.append(f"| {f['id']} | {f['condition']} | {f['obligation']} | {f['blocked_dependents']} |\n")
md.append("\n### Gaps por key, copiados literalmente\n\n")
for a in artifact_inventory:
    md.append(f"#### {a['key']}\n\n")
    for gap in a["gaps_verbatim"]: md.append(f"- {gap}\n")
    md.append("\n")
md.append("## Evidência e estado de revisão\n\nO suplemento adiciona apenas linhas decisivas ausentes do compacto, com pin, blob, SHA-256 do arquivo, linha e SHA-256 do trecho. Não tenta transformar toda fonte capturada em semântica aceita. A única mudança de corpo é a correção MCP autorizada. Os build_dependencies continuam vazios; não há predecessor L2 inventado. Os refs de revisão/runtime do fragmento congelado estão vazios; a principal é quem incorpora juízos novos e autoriza dependentes. Nenhum oracle foi lido ou parecer enviado nesta preparação.\n")
(R / "coverage-projection.md").write_text("".join(md))

correction_receipt = {"schema": "genesis-producer-correction/v1", "task": "S1-L1-B", "key": target, "scope": "orchestra.s1", "layer": 1, "source_revision": PIN, "protocol_revision": PROTOCOL, "status": "produced-unjudged", "base_dossier": {"path": "output/producers/b/review-dossier.md", **info(D)}, "base_fragment": {"path": "producers/b/artifacts.json", **info(B / "artifacts.json")}, "original_body": bykey[target]["body"], "corrected_body": newbody, "fragment_metadata_ref": ref("corrected/fragment-metadata.json"), "diff_ref": ref("corrected/session-contract.diff"), "producer_request_ref": ref("correction-request.txt"), "producer_response_ref": ref("corrected/response.md"), "evidence_ref": ref("source-supplement.md"), "source_ref": {"commit": PIN, "path": "packages/server/src/handlers/session.ts", "git_blob_sha": sources["packages/server/src/handlers/session.ts"]["git_blob_sha"], "sha256": sources["packages/server/src/handlers/session.ts"]["sha256"], "lines": [267, 273]}, "only_fragment_field_changed": "artifacts[key=s1.api.session-contract].body", "other_eight_artifact_objects_unchanged": True, "semantic_review_refs": [], "runtime_receipt_refs": [], "binding_note": "This copied producer fragment retains original relative body paths and original provenance refs except corrected body identity. Principal remaps existing paths and binds the correction receipt when assembling the new shared candidate."}
dump("corrected/correction-receipt.json", correction_receipt)

# Deterministic, local artifact verification only.
restored = []
for g in groups:
    assert len(g["members"]) == g["count"]
    restored += [{**g["common"], **m} for m in g["members"]]
assert sorted(restored, key=lambda e: e["path"]) == sorted(entries, key=lambda e: e["path"])
assert sum(g["count"] for g in groups) == 472
assert len({e["path"] for e in restored}) == 472
assert len(groups) == 68 and len({e["family"] for e in entries}) == 52
for a, revised in zip(fragment["artifacts"], revised_fragment["artifacts"]):
    if a["key"] != target: assert a == revised
    else:
        test = copy.deepcopy(revised); test["body"] = a["body"]; assert test == a
assert corrected_body == original_body.replace(old.encode(), new.encode(), 1)
for s in supplement:
    lines = (B / "sources" / s["path"]).read_bytes().decode().splitlines(keepends=True)
    for span in s["ranges"]:
        raw = "".join(lines[span["start_line"]-1:span["end_line"]]).encode()
        assert sha(raw) == span["sha256"] and len(raw) == span["byte_length"]
        assert not (set(range(span["start_line"], span["end_line"]+1)) & old_lines[s["path"]])
after = snapshot()
assert before == after
assert info(D)["sha256"] == BASE_DOSSIER
dump("frozen-originals-manifest.json", {"schema": "genesis-frozen-originals/v1", "root": "producers/b", "file_count": len(before), "files": before, "dossier": {"path": "output/producers/b/review-dossier.md", **info(D)}, "unchanged_after_revision": True})
files = ["request.txt", "correction-request.txt", "prepare.py", "coverage-projection.json", "coverage-projection.md", "source-supplement.md", "source-supplement-index.json", "frozen-originals-manifest.json", "corrected/session-contract.md", "corrected/session-contract.diff", "corrected/fragment-metadata.json", "corrected/response.md", "corrected/correction-receipt.json"]
checks = {"schema": "genesis-revision-checks/v1", "status": "PASS", "scope": "deterministic transport and exact authorized correction; no semantic acceptance", "counts": {"assigned_entries": 472, "families": 52, "lossless_groups": 68, "required_keys": 9, "source_supplement_files": len(supplement), "source_supplement_spans": sum(len(s['ranges']) for s in supplement), "source_supplement_lines": sum(span['end_line']-span['start_line']+1 for s in supplement for span in s['ranges']), "changed_original_files": 0, "new_body_versions": 1, "other_unchanged_bodies": 8}, "checks": ["Base dossier matches principal SHA-256", "Original producer fragment matches frozen SHA-256", "All nine original body byte sequences occur in dossier", "Lossless grouping reconstructs all 472 original coverage records", "Every mandatory key retained; no future artifact key invented", "Every supplemental span matches original source bytes and pin/blob/SHA-256", "Supplemental line spans have zero overlap with compact excerpt line sets", "Corrected body equals exactly one authorized sentence substitution", "Only the target body object differs in copied fragment metadata", "Eight other artifact objects unchanged", "All original producer files and dossier unchanged before/after", "No product execution or judge dispatch"], "file_hashes": {p: info(R / p) for p in files}, "original_body": {"sha256": sha(original_body), "byte_length": len(original_body)}, "corrected_body": info(R / "corrected/session-contract.md"), "limits": ["No CC-1 PASS or judge verdict claimed", "Future L2-L4 key inventory not supplied by frozen B fragment; principal must fix the relevant work before claiming complete S1", "190 surface and 183 inventory-only entries remain at the original depth", "Oversized generated input remains unresolved for runtime binding", "Original dossier includes superseded logging sentence and must be paired with the one-body correction for review", "No oracle access, remote reads/writes, product tests or judge messages in this revision"]}
dump("checks.json", checks)
print(json.dumps({"status": checks["status"], "counts": checks["counts"], "projection": info(R / "coverage-projection.md"), "supplement": info(R / "source-supplement.md"), "corrected_body": info(R / "corrected/session-contract.md"), "checks": info(R / "checks.json")}, indent=2))
