from pathlib import Path
from datetime import datetime, timezone
import json, hashlib, difflib, os

BASE = Path(__file__).resolve().parents[2]
REV = Path(__file__).resolve().parent
SOURCE_PIN = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
OUTPUT_PREFIX = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/producers/research/"
BEFORE = "`locate.ts` combina termos/símbolos/pergunta, mapa e buscas, com orçamento máximo de 32 buscas, no máximo dez buscas de vizinhos, cinco seeds e três snippets por arquivo."
AFTER = "`locate.ts` combina termos/símbolos/pergunta, mapa e buscas. Com índice utilizável, a seleção reserva uma chamada `map` e até dez buscas de vizinhos dentro do orçamento de 32; sem `sources.query`, permite até 32 listas lexicais. Se `sources.query` existe, mas a sondagem `map` retorna `index_unavailable` ou `index_building`, essa chamada já ocorreu e não é descontada das 32 listas lexicais: 16 termos distintos podem gerar 33 consultas internas. O limite é de cinco seeds e três snippets por arquivo."

def identity(data):
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "git_blob_sha": hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()}

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

def write_new(path, data):
    with path.open("xb") as handle:
        handle.write(data)

# Read only the explicitly frozen procedure/control files and four production inputs.
freeze_raw = (REV / "apply-freeze.json").read_bytes()
freeze = json.loads(freeze_raw)
own_raw = Path(__file__).read_bytes()
assert identity(own_raw) == freeze["effective_procedure"]["identity"], "Procedure differs from its pre-execution freeze"
assert BEFORE == freeze["correction"]["BEFORE"] and AFTER == freeze["correction"]["AFTER"]
loaded = {}
for item in freeze["inputs"]:
    data = (BASE / item["read_path"]).read_bytes()
    assert identity(data) == item["identity"], item["read_path"]
    loaded[item["id"]] = data

old = loaded["body-v2"]
prior_recipe = loaded["recipe-v2"]
old_literal = BEFORE.encode("utf-8")
new_literal = AFTER.encode("utf-8")
assert old.count(old_literal) == 1, "Expected one literal occurrence"
start = old.index(old_literal)
changed = old.replace(old_literal, new_literal, 1)
assert changed.replace(new_literal, old_literal, 1) == old, "Inverse replacement differs"
ops = [op for op in difflib.SequenceMatcher(a=old.splitlines(keepends=True),
                                           b=changed.splitlines(keepends=True), autojunk=False).get_opcodes()
       if op[0] != "equal"]
assert ops == [("replace", 238, 239, 238, 239)], ops
assert old[:start] == changed[:start]
assert old[start + len(old_literal):] == changed[start + len(new_literal):]

# Preserve v2 before replacing the current body. No earlier recipe or audit file is edited.
for target, data in [(BASE / "history/body-v2.md", old), (BASE / "history/recipe-v2.json", prior_recipe)]:
    write_new(target, data)

inputs = []
for item in freeze["inputs"]:
    inputs.append({**item, "whole_original_file": True,
                   "canonical_destination": OUTPUT_PREFIX + item["retained_path"] if item["origin"] == "local-production" else item["repository_path"]})
inputs.extend([
    {"id": "effective-apply", "read_path": "revisions/v3/apply.py", "identity": identity(own_raw),
     "whole_original_file": True, "role": "effective executable procedure frozen before execution",
     "origin": "local-production", "retained_path": "revisions/v3/apply.py",
     "canonical_destination": OUTPUT_PREFIX + "revisions/v3/apply.py"},
    {"id": "pre-execution-freeze", "read_path": "revisions/v3/apply-freeze.json", "identity": identity(freeze_raw),
     "whole_original_file": True, "role": "pre-execution identity and exact-input freeze consumed by apply.py",
     "origin": "local-production", "retained_path": "revisions/v3/apply-freeze.json",
     "canonical_destination": OUTPUT_PREFIX + "revisions/v3/apply-freeze.json"}
])
assert len(inputs) == 8
assert all(item["canonical_destination"] != OUTPUT_PREFIX + "body.md" for item in inputs)

source_specs = [
    {"id": "RB-S005", "input_id": "locate-source", "path": "packages/core/src/research-toolkit/locate.ts",
     "ranges": [[37,43], [56,79], [187,199]]},
    {"id": "RB-S032", "input_id": "locate-contract-test", "path": "packages/core/test/research-locate.test.ts",
     "ranges": [[34,62], [98,114], [116,121]]}
]
sources = []
for spec in source_specs:
    raw = loaded[spec["input_id"]]
    lines = raw.splitlines(keepends=True)
    spans = []
    for lo, hi in spec["ranges"]:
        excerpt = b"".join(lines[lo-1:hi])
        spans.append({"lines": [lo,hi], "bytes": len(excerpt),
                      "sha256": hashlib.sha256(excerpt).hexdigest()})
    sources.append({"source_id": spec["id"], "path": spec["path"], "commit": SOURCE_PIN,
                    **identity(raw), "archive_path": "sources/" + spec["path"], "excerpts": spans})

supplement = [
    "# Research v3 — suplemento literal RB-J2-F01\n\n",
    "Correção documental única em R8. A contagem 1 + 32 = 33 decorre da leitura estática dos ramos abaixo; nenhum teste ou produto foi executado. Este suplemento não é o parecer agregado dos juízes.\n\n",
    "## Delta do corpo\n\n",
    "BEFORE (v2, SHA-256 " + identity(old)["sha256"] + "):\n\n~~~text\n" + BEFORE + "\n~~~\n\n",
    "AFTER (v3, SHA-256 " + identity(changed)["sha256"] + "):\n\n~~~text\n" + AFTER + "\n~~~\n\n",
    "## Ramos e contratos literais\n\n",
    "Os IDs RB-S005/RB-S032 são os mesmos do suplemento B. Os intervalos adicionais curtos da fixture explicitam o map utilizável e o teste building sem asserção de teto; todos pertencem aos mesmos arquivos fixados. Comentários e expectativas são conteúdo de fonte, sem execução.\n\n"
]
for spec, record in zip(source_specs, sources):
    raw = loaded[spec["input_id"]]
    lines = raw.decode("utf-8").splitlines()
    supplement.append("### " + record["source_id"] + " — " + record["path"] + "\n\n")
    supplement.append("Commit " + SOURCE_PIN + "; " + str(record["bytes"]) + " bytes; SHA-256 " + record["sha256"] +
                      "; Git blob " + record["git_blob_sha"] + ". Arquivo integral: " + record["archive_path"] + ".\n\n")
    for span in record["excerpts"]:
        lo, hi = span["lines"]
        supplement.append("Linhas " + str(lo) + "–" + str(hi) + "; bytes brutos " + str(span["bytes"]) +
                          "; SHA-256 do intervalo " + span["sha256"] + ".\n\n~~~text\n")
        supplement.extend(str(i) + ": " + lines[i-1] + "\n" for i in range(lo, hi+1))
        supplement.append("~~~\n\n")
supplement.append("## Leitura limitada ao achado\n\n")
supplement.append("RB-S005 chama ranks antes da seleção e zera query após a falha admitida. Nesse ramo, slice não desconta a chamada já feita; 16 termos distintos permitem 16 listas lexical e 16 lexical-wide. O teste de teto usa a fixture com map bem-sucedido. O teste sem índice passa query: undefined; o teste building usa um termo e verifica a degradação, sem contar o teto. Esta é a razão da qualificação documental, sem alterar o produto nem alegar teste executado.\n")
supplement_bytes = "".join(supplement).encode("utf-8")

# The replacement itself is the only modification to an existing artifact.
staging = REV / "body-v3.staging"
write_new(staging, changed)
os.replace(staging, BASE / "body.md")
assert (BASE / "body.md").read_bytes() == changed
assert (BASE / "history/body-v2.md").read_bytes() == old
assert (BASE / "history/recipe-v2.json").read_bytes() == prior_recipe
for item in freeze["inputs"]:
    if item["id"] != "body-v2":
        assert (BASE / item["read_path"]).read_bytes() == loaded[item["id"]]
assert Path(__file__).read_bytes() == own_raw
assert (REV / "apply-freeze.json").read_bytes() == freeze_raw

manifest = {
    "schema": "genesis-native-input-extension/v1", "revision": 3, "finding": "RB-J2-F01",
    "status": "ACTUAL_EXECUTED_CORRECTION_INPUTS", "whole_file_identity": True,
    "inheritance": {
        "body_v2": {"path": "history/body-v2.md", **identity(old)},
        "descriptive_recipe_v2": {"path": "history/recipe-v2.json", **identity(prior_recipe)},
        "prior_audit": {"path": "native-input-audit/native-input-disposition.json",
                        "sha256": "3b1695b21f8bb70014e65acd200456b8dd56e0bf7688cfe6bbe3aa003c240b79",
                        "use": "historical provenance reference from prior delivery; not read or changed in this correction"},
        "policy": "Inherit v2 content/lineage; list only files actually read in this v3 correction. No audit output is made a retroactive v2 input."
    },
    "inputs": inputs,
    "counts": {"actual_whole_file_inputs_this_correction": 8, "pinned_source_files_reread": 2,
               "prior_body_and_recipe_files": 2, "new_procedure_and_control_files": 4},
    "effective_recipe": ["revisions/v3/request.txt", "revisions/v3/apply.py"],
    "procedure_frozen_before_execution": True,
    "new_outputs_not_effective_inputs": ["body.md", "recipe-v3.json", "history/body-v2.md", "history/recipe-v2.json",
                                       "revisions/v3/delta.json", "revisions/v3/review-supplement.md",
                                       "revisions/v3/input-manifest-extension.json", "revisions/v3/response.md"],
    "version_alias_note": "history/body-v2.md and history/recipe-v2.json preserve the input bytes originally read at body.md and recipe-v2.json. Current body.md v3 is never its own input.",
    "source_text_is_data": True,
    "usage": {"tokens": "UNKNOWN", "physical_attempts": "UNKNOWN", "cost": "UNKNOWN",
              "network_calls": 0, "product_test_runs": 0}
}
manifest_bytes = encoded(manifest)
write_new(REV / "input-manifest-extension.json", manifest_bytes)
write_new(REV / "review-supplement.md", supplement_bytes)
delta = {
    "schema": "genesis-l1-literal-correction/v1", "revision": 3, "finding": "RB-J2-F01",
    "status": "APPLIED_DOCUMENTARY_QUALIFICATION", "produced_at_utc": datetime.now(timezone.utc).isoformat(),
    "BEFORE": BEFORE, "AFTER": AFTER,
    "BEFORE_literal_sha256": hashlib.sha256(old_literal).hexdigest(),
    "AFTER_literal_sha256": hashlib.sha256(new_literal).hexdigest(),
    "before_body": {"path": "history/body-v2.md", **identity(old)},
    "after_body": {"path": "body.md", **identity(changed)},
    "body_line": 239, "before_byte_range": [start, start+len(old_literal)],
    "after_byte_range": [start, start+len(new_literal)],
    "substitutions": 1, "line_diff_operations": ops, "remaining_body_bytes_identical": True,
    "static_finding": {"classification": "confirmed_by_static_source_reading",
                       "path_condition": "sources.query exists; initial map returns index_unavailable or index_building; 16 distinct terms",
                       "count": "1 initial map query + 16 lexical + 16 lexical-wide = 33 internal calls",
                       "runtime_reproduction": "NOT_RUN"},
    "sources": sources,
    "request": {"path": "revisions/v3/request.txt", **identity(loaded["request"])},
    "public_finding": {"path": "revisions/v3/j2-finding.md", **identity(loaded["public-finding"])},
    "effective_procedure": {"path": "revisions/v3/apply.py", **identity(own_raw)},
    "procedure_freeze": {"path": "revisions/v3/apply-freeze.json", **identity(freeze_raw)},
    "input_extension": {"path": "revisions/v3/input-manifest-extension.json", **identity(manifest_bytes)},
    "review_supplement": {"path": "revisions/v3/review-supplement.md", **identity(supplement_bytes)},
    "preservation_scope": "Only consumed v2 body/recipe and the two source files were compared. No full archive hash sweep was performed. Other earlier artifacts were neither opened nor written by this executable.",
    "prior_recipe_v2": {"path": "history/recipe-v2.json", **identity(prior_recipe)},
    "semantic_status": "SAME_PAIR_REEVALUATION_PENDING; no producer PASS",
    "not_performed": ["product edit", "product test", "network call", "publication", "oracle access", "reserved judgment access",
                      "new judge", "L2 production", "prior audit alteration"]
}
delta_bytes = encoded(delta)
write_new(REV / "delta.json", delta_bytes)
recipe = {
    "schema": "genesis-native-l1-descriptive-recipe/v1", "revision": 3, "artifact_key": "s1.core.research",
    "task": "RESEARCH-L1", "classification": "POST_EXECUTION_DESCRIPTIVE_OUTPUT_NOT_EFFECTIVE_RECIPE",
    "produced_at_utc": datetime.now(timezone.utc).isoformat(), "body": {"path": "body.md", **identity(changed)},
    "source_revision": SOURCE_PIN,
    "effective_recipe": [
        {"path": "revisions/v3/request.txt", **identity(loaded["request"])},
        {"path": "revisions/v3/apply.py", **identity(own_raw)}
    ],
    "freeze": {"path": "revisions/v3/apply-freeze.json", **identity(freeze_raw)},
    "input_extension": {"path": "revisions/v3/input-manifest-extension.json", **identity(manifest_bytes)},
    "delta": {"path": "revisions/v3/delta.json", **identity(delta_bytes)},
    "review_supplement": {"path": "revisions/v3/review-supplement.md", **identity(supplement_bytes)},
    "previous_body": {"path": "history/body-v2.md", **identity(old)},
    "previous_recipe": {"path": "history/recipe-v2.json", **identity(prior_recipe)},
    "change_scope": "One literal substitution in R8 line 239, solely qualifying search-list budget versus the already-consumed map probe.",
    "semantic_review": "EXTERNAL; same-pair reevaluation requested by principal; no new producer PASS",
    "outputs_after_execution": ["recipe-v3.json", "revisions/v3/response.md"],
    "usage": {"tokens": "UNKNOWN", "physical_attempts": "UNKNOWN", "cost": "UNKNOWN",
              "network_calls": 0, "product_test_runs": 0}
}
recipe_bytes = encoded(recipe)
write_new(BASE / "recipe-v3.json", recipe_bytes)
response = (
    "# Resposta original — research v3 / RB-J2-F01\n\n"
    "Achado confirmado por inspeção estática e corrigido documentalmente com uma única substituição em R8, linha 239. "
    "O corpo distingue índice utilizável, ausência de sources.query e sondagem map já executada que falha com index_unavailable/index_building. "
    "Nesse último ramo, 16 termos distintos podem produzir 33 consultas internas. Nenhum teste ou produto foi executado.\n\n"
    "Body v3: " + str(len(changed)) + " bytes; SHA-256 " + identity(changed)["sha256"] + "; Git blob " + identity(changed)["git_blob_sha"] + ".\n\n"
    "Body v2 preservado byte a byte em history/body-v2.md: SHA-256 " + identity(old)["sha256"] + ". "
    "recipe-v2.json permanece intacta e foi preservada também em history/recipe-v2.json: SHA-256 " + identity(prior_recipe)["sha256"] + ".\n\n"
    "A receita efetiva é o pedido mais apply.py, ambos existentes e congelados antes da execução. "
    "apply.py: SHA-256 " + identity(own_raw)["sha256"] + "; freeze: " + identity(freeze_raw)["sha256"] + ". "
    "A extensão de inputs identifica oito arquivos efetivamente consumidos, por unidade integral, sem varrer o acervo. "
    "recipe-v3.json é saída descritiva posterior, não a receita executada. A auditoria v2 permanece histórica, não lida nem alterada.\n\n"
    "Delta: SHA-256 " + identity(delta_bytes)["sha256"] + ". "
    "Suplemento literal curto: " + str(len(supplement_bytes)) + " bytes; SHA-256 " + identity(supplement_bytes)["sha256"] + ". "
    "Extensão de inputs: SHA-256 " + identity(manifest_bytes)["sha256"] + ". "
    "Receita descritiva v3: SHA-256 " + identity(recipe_bytes)["sha256"] + ".\n\n"
    "A reconstrução inversa recupera exatamente a v2; a comparação por linhas mostra uma única linha substituída e o restante byte-idêntico. "
    "O pedido e o achado público original estão preservados. O suplemento reutiliza RB-S005/RB-S032, com hashes dos arquivos e intervalos literais curtos. "
    "A contagem 33 é contraprova estática, sem reprodução de runtime. Sem oracle, resultados reservados, rede, publicação, produto, novo juiz ou L2. "
    "Parecer agregado e protocolo P/H pertencem à principal e aos mesmos juízes; não há novo PASS do produtor.\n"
).encode("utf-8")
write_new(REV / "response.md", response)

print(json.dumps({
    "body_v3": identity(changed), "effective_apply": identity(own_raw), "freeze": identity(freeze_raw),
    "outputs": {name: identity(data) for name, data in [
        ("revisions/v3/request.txt", loaded["request"]), ("revisions/v3/j2-finding.md", loaded["public-finding"]),
        ("revisions/v3/delta.json", delta_bytes), ("revisions/v3/review-supplement.md", supplement_bytes),
        ("revisions/v3/input-manifest-extension.json", manifest_bytes), ("recipe-v3.json", recipe_bytes),
        ("revisions/v3/response.md", response), ("history/body-v2.md", old), ("history/recipe-v2.json", prior_recipe)]},
    "substitutions": 1, "changed_line": 239, "actual_input_file_units": 8, "product_test_runs": 0,
    "preserved_v2_body_and_recipe": True
}, ensure_ascii=False))
