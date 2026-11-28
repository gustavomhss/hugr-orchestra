"""Package the narrowly requested L1 correction. No product code or tests are run."""
from collections import defaultdict
from pathlib import Path
from copy import deepcopy
import hashlib
import json
import re

HERE = Path(__file__).resolve().parent
S4 = HERE.parents[1]
PAYLOAD = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/producers/l1-boundary/"
PIN = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
PROTOCOL = "ee2521a5b966bd505cc95bd1c733e09e12f33531"
V1_RECEIPT_SHA = "094211ad9152bb78adae123832c403cf990a9049171b41e8fed37cf089fff232"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def load(name):
    return json.loads((HERE / name).read_text())


def save(name, value):
    assert name not in {row["path"] for row in v1_receipt["files"]} | {"integrity-receipt.json"}
    (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def ref(name):
    raw = (HERE / name).read_bytes()
    return {"payload_path": PAYLOAD + name, "sha256": sha(raw), "byte_length": len(raw)}


def short_ref(name):
    return {k: v for k, v in ref(name).items() if k != "byte_length"}


def merge(ranges):
    result = []
    for start, end in sorted(ranges):
        if result and start <= result[-1][1] + 1:
            result[-1][1] = max(result[-1][1], end)
        else:
            result.append([start, end])
    return result


v1_receipt = load("integrity-receipt.json")
assert sha((HERE / "integrity-receipt.json").read_bytes()) == V1_RECEIPT_SHA
for row in v1_receipt["files"]:
    raw = (HERE / row["path"]).read_bytes()
    assert len(raw) == row["byte_length"] and sha(raw) == row["sha256"], row["path"]

old_artifact = load("artifact.json")
old_provenance = load("source-provenance.json")
body = (HERE / "body-v2.md").read_bytes()
assert len(body) <= 12000
text = body.decode("utf-8")
assert "`transform` que devolve `input.messages` e `afterStep` sem efeito" in text
assert "sem demonstrar instalação global" in text

aliases = {
    "S": "packages/core/src/session.ts", "C": "packages/core/src/session/compaction.ts",
    "L": "packages/core/src/session/runner/llm.ts", "I": "packages/core/src/session/runner/index.ts",
    "P": "packages/core/package.json", "D": "packages/core/src/rag-studio/sql.ts",
    "RS": "packages/server/src/handlers/rag-studio-session.ts", "RH": "packages/server/src/handlers/rag-studio.ts",
    "RP": "packages/protocol/src/groups/rag-studio.ts", "RT": "packages/schema/src/rag-studio.ts",
    "AH": "packages/server/src/handlers/atlas.ts", "AC": "packages/core/src/atlas.ts",
    "M": "modules/atlas/packages/cli/src/surface-mine.ts",
}
prefixes = {"V/": "modules/continuity/src/v2/", "R/": "modules/rag-studio/src/", "A/": "modules/atlas/packages/adapter-io/src/", "B/": "modules/atlas/boundary/"}
pattern = r"(?<![A-Za-z0-9_])((?:V|R|A|B)/[A-Za-z0-9_./-]+|RS|RH|RP|RT|AH|AC|S|C|L|I|P|D|M):(\d+(?:–\d+)?(?:,\d+(?:–\d+)?)*)"
cited = defaultdict(list)
labels = defaultdict(list)
for found in re.finditer(pattern, text):
    label, spans = found.groups()
    path = aliases.get(label) or prefixes[label[:2]] + label[2:]
    labels[path].append(found.group())
    for span in spans.split(","):
        numbers = [int(x) for x in span.split("–")]
        cited[path].append([numbers[0], numbers[-1]])

provenance = deepcopy(old_provenance)
assert set(cited) == {row["path"] for row in provenance["sources"] if row["body_line_ranges"]}
for row in provenance["sources"]:
    raw = (S4 / row["captured_file"]).read_bytes()
    assert len(raw) == row["byte_length"] and sha(raw) == row["sha256"], row["path"]
    assert hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest() == row["git_blob_sha"]
    assert len(raw) <= 256000
    if row["path"] in cited:
        row["body_locators"] = labels[row["path"]]
        row["body_line_ranges"] = merge(cited[row["path"]])
        for start, end in row["body_line_ranges"]:
            assert 1 <= start <= end <= row["line_count"]
            assert any(a <= start and b >= end for a, b in row["inspected_line_ranges"])
    if row["path"] == aliases["C"]:
        row["semantic_reason"] += " A correção explicita a implementação padrão do node: make fornece compact/compactIfNeeded/compactAfterOverflow, transform preserva input.messages e afterStep não tem efeito; substituição instalada é distinção separada."
        row["correction_reread_line_ranges"] = [[258, 330]]
provenance["counts"]["body_locators"] = sum(len(value) for value in labels.values())
assert provenance["counts"]["body_locators"] == 57
provenance["correction"] = {
    "request_ref": ref("correction-request.md"),
    "scope": "Explicitar default SessionCompaction antes da substituição, sem nova fonte nem expansão do domínio.",
    "source_refs_unchanged": True,
    "source_reread": {"path": aliases["C"], "commit": PIN, "lines": [258, 330]},
    "new_body_locator": "C:277–329",
    "remaining_limits": "Instalação global e garantias operacionais continuam não demonstradas; nenhum novo estado de execução ou revisão independente.",
}
save("source-provenance-v2.json", provenance)

recipe = {
    "schema": "genesis-producer-recipe-v1",
    "execution": old_provenance["execution"],
    "work_package": "WP-L1-BOUNDARY correction-v2",
    "producer": "/root/producer_l1a",
    "artifact_key": old_artifact["key"],
    "scope": old_artifact["scope"],
    "layer": 1,
    "need": "evidence",
    "source_revision": PIN,
    "protocol_revision": PROTOCOL,
    "observed_head": None,
    "original_request_ref": ref("request.md"),
    "correction_request_ref": ref("correction-request.md"),
    "source_provenance_ref": ref("source-provenance-v2.json"),
    "prior_inspection_register_ref": ref("inspection-register.json"),
    "prior_integrity_ref": ref("integrity-receipt.json"),
    "diff_ref": ref("body-v2.diff"),
    "metadata_builder_ref": ref("build_delivery_v2.py"),
    "protocol_refs": load("recipe.json")["protocol_refs"],
    "public_criteria": load("recipe.json")["public_criteria"],
    "steps": [
        "Preservar o pedido de correção literalmente e conferir todos os hashes v1 antes de produzir a revisão.",
        "Reler compaction.ts:258–330 da captura fixa; verificar os retornos de make, a interface e o node padrão.",
        "Acrescentar default com três métodos de make, transform que retorna input.messages e afterStep sem efeito; manter declaração de contribuição separada da instalação global não demonstrada.",
        "Aparar somente redundância local, ajustar nomes dos arquivos v2 e manter o corpo até 12000 bytes UTF-8.",
        "Manter source_refs exatamente iguais; atualizar localizadores da fonte já usada e trocar apenas payloads de receita/proveniência necessários.",
        "Conferir bytes finais, same-path file inputs e preservação v1; deixar build_dependencies, semantic_review_refs e runtime_receipt_refs vazios.",
    ],
    "semantic_bound": "Correção pontual de evidência estática direta. supported não é aceite independente, integração comprovada, paridade de bundles, instalação de contribuição ou autorização HTTP.",
    "input_selection": "As mesmas 37 fontes commitadas continuam efetivas. Payloads desta revisão registram os pedidos, proveniência, receita, resposta, diff e procedimento. Registro de leitura e recibo v1 são evidências estáticas de origem/preservação, não observação runtime de todos os arquivos neles citados.",
    "build_dependencies": [],
    "navigation_only": old_artifact["navigation"],
    "limits": ["Nenhum teste de produto, build, chamada externa/modelo, CI, importador nativo, Git remoto, oracle ou nova delegação.", "Nenhuma expansão do censo de 2220 ou mudança dos hashes v1.", "Nenhum parecer independente ou recibo runtime foi acrescentado."],
}
save("recipe-v2.json", recipe)

response = f"""# Correção WP-L1-BOUNDARY — v2

Entregue `body-v2.md`, com **{len(body)} bytes UTF-8**, para a mesma unidade `{old_artifact['key']}`, scope `{old_artifact['scope']}`, layer 1, need evidence. A correção preserva todos os arquivos e hashes v1.

## Diff substantivo

Foi acrescentado, com localizador **C:277–329** (`packages/core/src/session/compaction.ts`), o comportamento do node padrão: os três métodos de `make` são `compact`, `compactIfNeeded` e `compactAfterOverflow`; `transform` devolve `input.messages`, enquanto `afterStep` não produz efeito. A contribuição Continuity continua descrita separadamente, com instalação global não demonstrada. Foram abreviadas frases locais redundantes e atualizados os nomes dos arquivos de metadados/proveniência no corpo. Não mudou a evidência RAG/Atlas nem seus limites.

Os **37 source_refs permanecem idênticos** à v1: 31 fontes semânticas e 6 de instrução. O mapa tem agora **57 localizadores**, sem novo arquivo fonte. A releitura pontual foi compaction.ts:258–330; os bytes da fonte continuam no baseline `{PIN}`. Os inputs de payload apontam às receitas/proveniência efetivas desta revisão e aos registros preservados necessários, sempre abaixo de 256000 bytes.

## Arquivos e hashes

- `body-v2.md`: `{sha(body)}`.
- `recipe-v2.json`: `{ref('recipe-v2.json')['sha256']}`.
- `source-provenance-v2.json`: `{ref('source-provenance-v2.json')['sha256']}`.
- `correction-request.md`: `{ref('correction-request.md')['sha256']}` — pedido literal, referenciado junto do pedido original na receita.
- `body-v2.diff`: `{ref('body-v2.diff')['sha256']}`.
- `artifact-v2.json` registra este corpo e esta resposta; seu hash final fica no recibo v2 separado para evitar autorreferência.

Arquivos em `/workspace/scratch/aff930d22ec7/s4/producers/l1-boundary/`. `validity=supported` continua limitado às constatações estáticas. `build_dependencies=[]`, `semantic_review_refs=[]` e `runtime_receipt_refs=[]` permanecem vazios. Nenhum teste de produto, remoto, oracle, nova delegação ou execução operacional foi realizado. A população atribuída segue com 2.220 caminhos.
"""
(HERE / "correction-response.md").write_text(response)

artifact = deepcopy(old_artifact)
artifact["body"] = {"path": "producers/l1-boundary/body-v2.md", "encoding": "utf-8", "byte_length": len(body), "sha256": sha(body)}
artifact["authority"]["basis"] += " Revisão v2 por correção primária explícita: default do SessionCompaction acrescentado a partir da mesma fonte; v1 preservada, sem novo parecer ou execução."
payload_inputs = ["request.md", "correction-request.md", "correction-response.md", "recipe-v2.json", "source-provenance-v2.json", "inspection-register.json", "integrity-receipt.json", "body-v2.diff", "build_delivery_v2.py"]
artifact["input_keys"] = ["file:" + row["path"] for row in artifact["source_refs"]] + ["file:" + PAYLOAD + name for name in payload_inputs]
artifact["evidence"] = [
    "Correção primária: default SessionCompaction explícito em C:277–329; contribuição e instalação continuam distintas.",
    "Corpo v2 com 57 localizadores em 31 fontes semânticas. Todos os 37 source_refs são exatamente os da v1.",
    "Proveniência e correspondência semântica v2: " + json.dumps(ref("source-provenance-v2.json"), ensure_ascii=False),
    "Pedido literal de correção: " + json.dumps(ref("correction-request.md"), ensure_ascii=False),
    "Diff textual delimitado: " + json.dumps(ref("body-v2.diff"), ensure_ascii=False),
    "Critérios públicos QS-1, QS-2, CC-3, CC-7, GO-I2, GO-I5, GO-I7, GO-I8 continuam alvos de avaliação, sem parecer acrescentado.",
    "Navegação é somente consulta; censo de 2220, corpo e metadados v1 permanecem preservados.",
]
artifact["recipe_ref"] = short_ref("recipe-v2.json")
artifact["producer_request_ref"] = short_ref("correction-request.md")
artifact["producer_response_ref"] = short_ref("correction-response.md")
assert artifact["source_refs"] == old_artifact["source_refs"]
assert artifact["build_dependencies"] == artifact["semantic_review_refs"] == artifact["runtime_receipt_refs"] == []
assert len(artifact["input_keys"]) == len(set(artifact["input_keys"]))
for name in payload_inputs:
    assert (HERE / name).stat().st_size <= 256000
save("artifact-v2.json", artifact)

for row in v1_receipt["files"]:
    raw = (HERE / row["path"]).read_bytes()
    assert len(raw) == row["byte_length"] and sha(raw) == row["sha256"], row["path"]
assert sha((HERE / "integrity-receipt.json").read_bytes()) == V1_RECEIPT_SHA
print(json.dumps({"body_bytes": len(body), "body_sha256": sha(body), "artifact_sha256": sha((HERE / "artifact-v2.json").read_bytes()), "source_refs_unchanged": len(artifact["source_refs"]), "inputs": len(artifact["input_keys"]), "v1_unchanged": True}, ensure_ascii=False))
