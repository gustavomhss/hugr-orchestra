"""Package two cumulative L2 bodies and review packets; byte processing only."""
from pathlib import Path
import hashlib
import json
import re

HERE = Path(__file__).resolve().parent
PREFIX = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/producers/l2a/"
PAYLOAD_COMMIT = "8a041ca66982dcc2b89aaed46ebe347cb3de57db"
MANIFEST_SHA = "00812b16cc21f2520bf16d46747417917f3f4c069309b2bb11a170c1ecc1f3ca"
EXECUTION = "a2095d5a-1464-4c38-a222-6376974fc9c9"
SCOPE = "atlas-continuity-rag-genesis"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def load(name):
    return json.loads((HERE / name).read_text())


def write_json(name, data):
    (HERE / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def payload_ref(name):
    raw = (HERE / name).read_bytes()
    return {"payload_path": PREFIX + name, "sha256": sha(raw), "byte_length": len(raw)}


def short_ref(name):
    return {k: v for k, v in payload_ref(name).items() if k != "byte_length"}


manifest_bytes = (HERE / "input-manifest.json").read_bytes()
assert len(manifest_bytes) == 12610 and sha(manifest_bytes) == MANIFEST_SHA
manifest = json.loads(manifest_bytes)
assert manifest["source_payload_commit"] == PAYLOAD_COMMIT
assert manifest["predecessor_layer"] == 1 and manifest["predecessor_layer_complete_accepted"]
accepted = {row["key"]: row for row in manifest["artifacts"]}
captured = {row["key"]: row for row in load("source-captures.json")}
extras = {Path(row["copied_path"]).name: row for row in load("additional-captures.json")}
allowed_extra_refs = {row["source_ref"]["path"]: row for row in manifest["additional_evidence"]}

for key, row in captured.items():
    original = accepted[key]
    assert original["accepted"] and row["source_ref"] == original["body_source_ref"]
    raw = (HERE / row["copied_path"]).read_bytes()
    assert row["source_ref"]["commit"] == PAYLOAD_COMMIT
    assert len(raw) == original["byte_length"] and sha(raw) == row["source_ref"]["sha256"]
    assert hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest() == row["source_ref"]["git_blob_sha"]
for row in extras.values():
    original = allowed_extra_refs[row["source_ref"]["path"]]
    assert row["source_ref"] == original["source_ref"]
    raw = (HERE / row["copied_path"]).read_bytes()
    assert len(raw) == original["byte_length"] and sha(raw) == row["source_ref"]["sha256"]
    assert hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest() == row["source_ref"]["git_blob_sha"]

aliases = {
    "O": "S4:L1:ownership-boundaries", "E": "S4:L1:atlas-engine",
    "H": "S4:L1:atlas-host-genesis", "C": "S4:L1:coverage-governance",
    "N": "S4:L1:native-runtime-delta", "B": "S4:L1:host-boundaries",
}
specs = [
    {
        "key": "S4:L2:atlas-system", "file": "atlas-system.md",
        "title": "Atlas: da evidência ao conhecimento servido",
        "predecessors": ["S4:L1:ownership-boundaries", "S4:L1:atlas-engine", "S4:L1:atlas-host-genesis", "S4:L1:native-runtime-delta", "S4:L1:host-boundaries"],
        "additional": ["ci-r2b-receipt.json"],
        "navigation": ["S4:L2:genesis-governance"],
        "addition": "Relaciona responsabilidades do motor/host, identidades e observações com consequências para revisão, consumo e manutenção. Explica por que igualdade da prosa, presença em CAS, atualidade, autoridade e leitura publicada não se substituem.",
        "reasons": {
            "S4:L1:ownership-boundaries": "Identidades de ownership, autoridade no resultado e observação tri-state/membership, usados para explicar invalidação e correspondência.",
            "S4:L1:atlas-engine": "Responsabilidades de índice/grounding/knowledge/kernel, leitor, retrieval/Own/memory e caminhos de manutenção.",
            "S4:L1:atlas-host-genesis": "Composição, persistência, provenance, publicação governada, accessor e rebuild candidatos.",
            "S4:L1:native-runtime-delta": "Transformação nativa, binding exato, portas reais de consumo e limites da execução documentada.",
            "S4:L1:host-boundaries": "Seção Atlas externa: chamada real do host, boundary gerado, modelo fora de Session e limite de autenticação/ratificação.",
        },
        "gaps": [
            "A síntese herda profundidade seletiva dos L1: ramos não examinados e comportamento completo do índice entre linguagens não são demonstrados.",
            "Chamadas e contratos de host não provam autenticação HTTP nem instalação/composição externa completa; o boundary não transfere hooks de Session por proximidade.",
            "O recibo CI descreve um candidato/run, um Worker/writer e seam de falha controlado; não prova concorrência universal, perda de energia ou paridade em outra revisão.",
            "Inputs declarados e seus hashes não demonstram snapshot coerente de todo o repositório; indisponibilidade continua distinta de ausência e mudança.",
            "Este corpo L2 ainda não tem aceitação semântica, binding, publicação ou consumo próprios; supported descreve sustentação limitada das afirmações.",
        ],
    },
    {
        "key": "S4:L2:genesis-governance", "file": "genesis-governance.md",
        "title": "Genesis: produção cumulativa, autoridade e uso",
        "predecessors": ["S4:L1:ownership-boundaries", "S4:L1:atlas-host-genesis", "S4:L1:coverage-governance", "S4:L1:native-runtime-delta"],
        "additional": ["ci-r2b-receipt.json", "runtime-release.json"],
        "navigation": ["S4:L2:atlas-system"],
        "addition": "Explica o papel da cobertura/profundidade nas receitas, ligações cumulativas, autoridade semântica/binding/publicação e interpretação temporal de pilotos, automação, amostra runtime e CI.",
        "reasons": {
            "S4:L1:ownership-boundaries": "Transporte versus conhecimento servido, identidade completa, observação e limites do piloto histórico.",
            "S4:L1:atlas-host-genesis": "Rebuild por receita, candidatos, staging/mineração, portas governadas e pontos reais de manutenção.",
            "S4:L1:coverage-governance": "População de 2220, profundidade por papel/origem, limites do observador, histórico, checkpoints e saída do workflow.",
            "S4:L1:native-runtime-delta": "Contrato do adapter, validação, dependências, binding, publicação/leitura e semântica dos controles de recuperação.",
        },
        "gaps": [
            "Censo preservado não equivale a leitura semântica de todos os ramos/arquivos históricos. As oito limitações de observação descritas no baseline não se tornam ausência.",
            "Identidades declaradas e revisão estrutural do adapter não autenticam operador/reviewer nem conferem autorização de produção.",
            "O delta nativo descrito é limitado a um pacote/scope; composição entre pacotes/scopes, migração geral e recuperação em toda falha continuam obrigações separadas.",
            "runtime-release.json conserva uma amostra anterior e andamento histórico; seus bindings/capacidades não se transferem ao candidato CI posterior ou aos corpos L2.",
            "Controles e fixtures não substituem julgamento independente ou consumidor real; os próprios semantic_review_refs e runtime_receipt_refs desta L2 continuam vazios.",
        ],
    },
]

for spec in specs:
    raw = (HERE / spec["file"]).read_bytes()
    text = raw.decode("utf-8")
    assert len(raw) <= 8000
    heads = [line[3:] for line in text.splitlines() if line.startswith("## ")]
    assert heads and len(heads) == len(set(heads))
    uses = {}
    for alias, key in aliases.items():
        source_text = (HERE / captured[key]["copied_path"]).read_text()
        sections = [line[3:] for line in source_text.splitlines() if line.startswith("## ")]
        used = [section for section in sections if f"{alias} § {section}" in text]
        count = len(re.findall(r"(?<![A-Za-z])" + alias + r" § ", text))
        assert count == sum(text.count(f"{alias} § {section}") for section in used), (spec["key"], alias)
        if used:
            uses[key] = used
    assert set(uses) == set(spec["predecessors"])
    spec["sections"] = heads
    spec["body"] = {"path": "producers/l2a/" + spec["file"], "encoding": "utf-8", "byte_length": len(raw), "sha256": sha(raw)}
    source_entries = []
    for key in spec["predecessors"]:
        cap = captured[key]
        source_entries.append({
            "key": key, "role": "semantic-build-predecessor", "source_ref": cap["source_ref"],
            "byte_length": cap["byte_length"], "local_exact_copy": cap["copied_path"],
            "sections_used": uses[key], "reason": spec["reasons"][key],
            "accepted_in_frozen_manifest": True,
            "predecessor_acceptance_refs_as_named_by_manifest": accepted[key]["semantic_review_refs"],
        })
    for name in spec["additional"]:
        cap = extras[name]
        is_ci = name == "ci-r2b-receipt.json"
        source_entries.append({
            "role": "historical-execution-evidence", "source_ref": cap["source_ref"],
            "byte_length": cap["byte_length"], "local_exact_copy": cap["copied_path"],
            "fields_used": ["candidate_revision", "run_id", "tests", "mutation_controls", "guards", "generated_parity", "limits"] if is_ci else ["entrypoints", "capabilities", "known_limits", "candidate_revision"],
            "reason": "Recibo do candidato 7102f2e3 e run 43077975153: resultados e limites daquele controle, sem transferir autoridade à L2." if is_ci else "Amostra anterior de um L1A e seus pins/limites; andamento antigo explicitamente separado do manifesto L2 e do CI posterior.",
            "not_a_runtime_receipt_for_this_l2": True,
        })
    source_file = spec["file"].replace(".md", "-sources.json")
    spec["source_file"] = source_file
    spec["source_refs"] = [entry["source_ref"] for entry in source_entries]
    write_json(source_file, {
        "schema": "genesis-cumulative-source-use/v1", "artifact_key": spec["key"], "execution": EXECUTION,
        "manifest_ref": payload_ref("input-manifest.json"), "source_payload_commit": PAYLOAD_COMMIT,
        "body_sections": heads, "added_explanation": spec["addition"], "sources": source_entries,
        "source_rule": "Somente corpos aceitos e evidências adicionais nomeadas no manifesto. Paths de manutenção aparecem como informação herdada de L1; não foram reabertos como fonte bruta.",
        "navigation_rule": "A outra síntese L2 é somente consulta. Não existe dependência de build entre os dois corpos L2.",
    })

recipe = {
    "schema": "genesis-producer-recipe-v1", "version": "l2a-v1", "execution": EXECUTION,
    "producer": "/root/producer_l1a", "scope": SCOPE, "layer": 2, "need": "component",
    "request_ref": payload_ref("request.md"), "input_manifest_ref": payload_ref("input-manifest.json"),
    "source_payload_commit": PAYLOAD_COMMIT, "baseline_documented_by_l1": manifest["baseline"],
    "runtime_code_candidate_named_by_manifest": manifest["runtime_code_candidate"],
    "public_criteria": manifest["public_criteria"],
    "body_limit_utf8_bytes": 8000,
    "producer_metadata": {"model_id": "UNKNOWN", "model_version": "UNKNOWN", "input_tokens": "UNKNOWN", "output_tokens": "UNKNOWN", "cost": "UNKNOWN"},
    "method": [
        "Preservar pedido literal e manifesto byte exato; conferir hash/bytes e aceite dos predecessores nomeados.",
        "Copiar e conferir corpos/evidências relevantes do manifesto por SHA-256, Git blob e tamanho, sem consultar fonte bruta ou pacote nativo mutável.",
        "Relacionar propósito, sequência, contratos, decisões, impacto e manutenção; separar constatação L1, inferência, intenção e execução de recibo.",
        "Tratar o release anterior como amostra histórica e o CI posterior como evidência de seu candidato/run, sem transferir binding ou publicar L2.",
        "Produzir exatamente dois corpos portugueses, H2 únicos, cada um <=8000 bytes, com referências a chaves/seções L1 e paths herdados de manutenção.",
        "Derivar source_refs e build_dependencies dos predecessores realmente citados; adicionar somente os recibos efetivamente usados. Navegação não é aresta de build.",
        "Gerar metadados comuns, resposta original e recibo mecânico; manter semantic_review_refs/runtime_receipt_refs vazios e telemetria não exposta como UNKNOWN.",
    ],
    "artifacts": [{
        "key": s["key"], "output_body_path": s["body"]["path"],
        "predecessor_keys": s["predecessors"], "additional_evidence": s["additional"],
        "sources_used_ref": payload_ref(s["source_file"]), "added_explanation": s["addition"],
        "build_dependencies": [{"key": key, "same_package": True} for key in s["predecessors"]],
        "navigation_only": s["navigation"],
        "input_keys": ["file:" + ref["path"] for ref in s["source_refs"]] + ["file:" + PREFIX + name for name in ["request.md", "input-manifest.json", "recipe.json", s["source_file"]]],
    } for s in specs],
    "limits": [
        "Nenhuma execução de produto, teste, build, runtime, alteração de candidato/produto ou escrita GitHub.",
        "Nenhum oracle foi aberto ou usado; nenhuma nova decisão de juiz é fabricada. Referências de aceite dos predecessores vêm somente do manifesto fixado.",
        "Este procedimento produz arquivos de evidência, não kernel IDs, CAS objects, receipt IDs, binding ou publicação.",
        "O aceite informado do predecessor não é aceite destes corpos L2. Não se solicita aprovação da fatia.",
    ],
    "delivery": {"steering_record": "steering-transport.md", "review_packets": ["review-packet-01.txt", "review-packet-02.txt"], "max_bytes_each": 32000, "closure": "AGUARDAR FECHAMENTO DO PRINCIPAL", "sent_to_judges": False},
}
write_json("recipe.json", recipe)

response = f"""# Produção L2A concluída para revisão

Foram produzidas exatamente duas sínteses cumulativas `layer=2`, `need=component`, scope `{SCOPE}`, a partir do manifesto fixado SHA-256 `{MANIFEST_SHA}` e dos predecessores aceitos no commit `{PAYLOAD_COMMIT}`.

## Conteúdo acrescentado

- **S4:L2:atlas-system:** organiza responsabilidades do motor e do host, explica efeitos de mudança de identidade/autoridade/inputs, distingue CAS de seleção publicada e aponta as portas e paths úteis para manutenção. Relaciona a fronteira externa do host sem lhe atribuir autenticação ou hooks de Session não demonstrados.
- **S4:L2:genesis-governance:** liga cobertura e profundidade à seleção de inputs/receitas, distingue dependências de consulta e explica aceitação semântica, transformação/binding, publicação e consumo. Separa piloto e automação históricos do adapter novo e lê release/CI com seus respectivos pins e limites.

O release preserva uma amostra anterior e campos antigos de andamento. O manifesto fixa L1 completa aceita; o recibo CI identifica o candidato posterior. Esses registros não publicam as novas sínteses nem transferem suas decisões de binding.

## Corpos e dependências

| Corpo | Bytes UTF-8 | SHA-256 | Predecessores semânticos |
|---|---:|---|---:|
| atlas-system.md | {specs[0]['body']['byte_length']} | `{specs[0]['body']['sha256']}` | 5 |
| genesis-governance.md | {specs[1]['body']['byte_length']} | `{specs[1]['body']['sha256']}` | 4 |

Os metadados são independentes: o primeiro artefato usa ownership-boundaries, atlas-engine, atlas-host-genesis, native-runtime-delta e host-boundaries; o segundo usa ownership-boundaries, atlas-host-genesis, coverage-governance e native-runtime-delta. CI é fonte adicional dos dois; runtime-release somente do segundo. Cada artefato tem seis source_refs exatos e file inputs nos mesmos caminhos, além dos inputs próprios de receita/pedido/manifesto/proveniência. Navegação entre as duas sínteses é apenas consulta.

## Arquivos

Todos estão em `/workspace/scratch/aff930d22ec7/s4/producers/l2a/`: corpos, `artifacts.json`, `recipe.json`, pedido literal, manifesto byte exato, fontes copiadas em `inputs/`, mapas `*-sources.json`, resposta e recibo mecânico. `recipe.json` SHA-256: `{payload_ref('recipe.json')['sha256']}`. `review-packet-01.txt` e `review-packet-02.txt` conterão os corpos/metadados exatos e as identidades dos predecessores, com limite de 32000 bytes por parte e a marca AGUARDAR FECHAMENTO DO PRINCIPAL. Nenhuma parte foi enviada aos juízes.

## Limites

Não houve redescoberta de fonte bruta, teste/build/runtime, alteração de produto/candidato ou escrita remota. A sustentação proposta é `supported` dentro dos limites herdados e declarados; `semantic_review_refs=[]` e `runtime_receipt_refs=[]` permanecem vazios. Persistem profundidade seletiva, limites de observação, integração/autenticação externas, recuperação geral e composição entre scopes/pacotes. Metadados de modelo, tokens e custo não expostos são `UNKNOWN`. O recibo mecânico verifica apenas bytes, tamanhos, seções e correspondência de referências; não é juízo semântico.
"""
(HERE / "response.md").write_text(response)

artifacts = []
for spec, component_recipe in zip(specs, recipe["artifacts"]):
    artifact = {
        "key": spec["key"], "scope": SCOPE, "title": spec["title"], "layer": 2, "need": "component",
        "body": spec["body"],
        "authority": {"scope": SCOPE, "basis": f"Síntese cumulativa autoral de /root/producer_l1a para {EXECUTION}, sobre predecessores L1 aceitos no manifesto fixado {MANIFEST_SHA}, payload commit {PAYLOAD_COMMIT}. Afirmações limitadas distinguem inspeção documentada, inferência, intenção e recibos históricos. Não houve reabertura da fonte bruta ou execução do produto; não há autoridade nova para publicar, ratificar ou atribuir aceite a esta L2."},
        "validity": "supported", "gaps": spec["gaps"],
        "evidence": [
            spec["addition"],
            "Correspondência por fonte/seção e razões de dependência: " + json.dumps(payload_ref(spec["source_file"]), ensure_ascii=False),
            "Manifesto de predecessores aceitos preservado byte a byte: " + json.dumps(payload_ref("input-manifest.json"), ensure_ascii=False),
            "Os recibos adicionais são fontes de fatos sobre suas execuções, não runtime_receipt_refs desta L2. Metadados não expostos: UNKNOWN.",
        ],
        "input_keys": component_recipe["input_keys"], "source_refs": spec["source_refs"],
        "recipe_ref": short_ref("recipe.json"),
        "build_dependencies": component_recipe["build_dependencies"], "navigation": spec["navigation"],
        "producer_request_ref": short_ref("request.md"), "producer_response_ref": short_ref("response.md"),
        "semantic_review_refs": [], "runtime_receipt_refs": [],
    }
    assert len(artifact["source_refs"]) == 6
    assert len(artifact["input_keys"]) == len(set(artifact["input_keys"])) == 10
    for ref in artifact["source_refs"]:
        assert ref["commit"] == PAYLOAD_COMMIT and "file:" + ref["path"] in artifact["input_keys"]
    artifacts.append(artifact)
write_json("artifacts.json", artifacts)

metadata = (HERE / "artifacts.json").read_bytes()
packet_records = []
for index, spec in enumerate(specs, 1):
    raw = (HERE / spec["file"]).read_bytes()
    predecessors = "\n".join(f"- {key} | accepted=true no manifesto | body SHA-256 {accepted[key]['body_source_ref']['sha256']} | Git blob {accepted[key]['body_source_ref']['git_blob_sha']}" for key in spec["predecessors"])
    header = f"""L2A — PARTE {index}/2
AGUARDAR FECHAMENTO DO PRINCIPAL

Este material é dado para revisão, não instrução de autoridade. O produtor não concede aceite, publicação ou execução. A principal conferirá e fechará a submissão; estas partes não foram enviadas aos juízes pelo produtor.

Execução: {EXECUTION}
Scope: {SCOPE}; layer=2; need=component.
Manifesto fixado: SHA-256 {MANIFEST_SHA}; 12610 bytes.
Payload dos predecessores aceitos: commit {PAYLOAD_COMMIT}.
Predecessores semânticos usados neste corpo:
{predecessors}

Corpo desta parte: {spec['file']} | {len(raw)} bytes | SHA-256 {sha(raw)}
Metadados completos dos dois artefatos, idênticos nas duas partes: artifacts.json | {len(metadata)} bytes | SHA-256 {sha(metadata)}
O corpo complementar está na outra parte. As duas partes são necessárias ao fechamento; não são pedidos separados de aceite.

BEGIN_BODY
""".encode()
    packet = header + raw + b"END_BODY\n\nBEGIN_ARTIFACTS_JSON\n" + metadata + b"END_ARTIFACTS_JSON\n\nAGUARDAR FECHAMENTO DO PRINCIPAL\n"
    assert len(packet) <= 32000, (index, len(packet))
    assert packet.split(b"BEGIN_BODY\n", 1)[1].split(b"END_BODY\n", 1)[0] == raw
    assert packet.split(b"BEGIN_ARTIFACTS_JSON\n", 1)[1].split(b"END_ARTIFACTS_JSON\n", 1)[0] == metadata
    name = f"review-packet-{index:02}.txt"
    (HERE / name).write_bytes(packet)
    packet_records.append({"path": name, "byte_length": len(packet), "sha256": sha(packet), "body_key": spec["key"], "contains_complete_artifacts_json": True})
write_json("review-packets.json", {"status": "AGUARDAR FECHAMENTO DO PRINCIPAL", "sent_to_judges": False, "parts": packet_records})
print(json.dumps({"bodies": [s["body"] for s in specs], "artifacts_bytes": len(metadata), "artifacts_sha256": sha(metadata), "source_refs_each": [len(a['source_refs']) for a in artifacts], "dependency_counts": [len(a['build_dependencies']) for a in artifacts], "packets": packet_records}, ensure_ascii=False, indent=2))
