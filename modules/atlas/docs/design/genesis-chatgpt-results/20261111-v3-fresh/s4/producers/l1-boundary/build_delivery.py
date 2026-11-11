"""Package static L1 boundary evidence; hashes and metadata only, no product execution."""
from pathlib import Path
from collections import defaultdict
import hashlib
import json
import re

HERE = Path(__file__).resolve().parent
S4 = HERE.parents[1]
BASE = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
PROTOCOL = "ee2521a5b966bd505cc95bd1c733e09e12f33531"
EXECUTION = "a2095d5a-1464-4c38-a222-6376974fc9c9"
KEY = "S4:L1:host-boundaries"
SCOPE = "atlas-continuity-rag-genesis"
PAYLOAD = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/producers/l1-boundary/"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(path.read_text())


def write_json(name, value):
    (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def file_ref(name):
    data = (HERE / name).read_bytes()
    return {"payload_path": PAYLOAD + name, "sha256": sha(data), "byte_length": len(data)}


def merge(ranges):
    out = []
    for start, end in sorted(ranges):
        if out and start <= out[-1][1] + 1:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return out


aliases = {
    "S": "packages/core/src/session.ts",
    "C": "packages/core/src/session/compaction.ts",
    "L": "packages/core/src/session/runner/llm.ts",
    "I": "packages/core/src/session/runner/index.ts",
    "P": "packages/core/package.json",
    "D": "packages/core/src/rag-studio/sql.ts",
    "RS": "packages/server/src/handlers/rag-studio-session.ts",
    "RH": "packages/server/src/handlers/rag-studio.ts",
    "RP": "packages/protocol/src/groups/rag-studio.ts",
    "RT": "packages/schema/src/rag-studio.ts",
    "AH": "packages/server/src/handlers/atlas.ts",
    "AC": "packages/core/src/atlas.ts",
    "M": "modules/atlas/packages/cli/src/surface-mine.ts",
}
prefixes = {
    "V/": "modules/continuity/src/v2/",
    "R/": "modules/rag-studio/src/",
    "A/": "modules/atlas/packages/adapter-io/src/",
    "B/": "modules/atlas/boundary/",
}

body = (HERE / "body.md").read_bytes()
assert len(body) <= 12000
text = body.decode("utf-8")
pattern = r"(?<![A-Za-z0-9_])((?:V|R|A|B)/[A-Za-z0-9_./-]+|RS|RH|RP|RT|AH|AC|S|C|L|I|P|D|M):(\d+(?:–\d+)?(?:,\d+(?:–\d+)?)*)"
cited = defaultdict(list)
labels = defaultdict(list)
for match in re.finditer(pattern, text):
    label, spans = match.groups()
    path = aliases.get(label)
    if path is None:
        path = prefixes[label[:2]] + label[2:]
    labels[path].append(match.group())
    for part in spans.split(","):
        numbers = [int(value) for value in part.split("–")]
        cited[path].append([numbers[0], numbers[-1]])

boundary_receipt = S4 / "boundary-capture-receipt.json"
domain_receipt = S4 / "source-capture-receipt.json"
boundary = {row["path"]: row for row in read_json(boundary_receipt)}
domain_data = read_json(domain_receipt)
assert domain_data["source_revision"] == BASE and domain_data["count"] == 2220
domain = {row["path"]: {**row, "commit": BASE} for row in domain_data["files"]}
protocol = read_json(S4 / "producers/l1a/protocol-captures.json")
agents = next(row for row in read_json(S4 / "producers/l1a/artifact.json")["source_refs"] if row["path"] == "AGENTS.md")
assert len(boundary) == 12 and set(boundary) <= set(cited)

inspection = defaultdict(list)
for item in read_json(HERE / "inspection-register.json"):
    inspection[item["path"]].extend(item["ranges"])

reasons = {
    "packages/core/src/session.ts": "Admissão, exclusividade, consultas persistidas, contexto e delegação ao runner; não demonstra o interior do projetor/Store.",
    "packages/core/src/session/compaction.ts": "Serialização, orçamento, eventos e hooks do compactador padrão; intenção do prompt separada de fidelidade demonstrada.",
    "packages/core/src/session/runner/llm.ts": "Ordem de governança, promoção, hooks, ferramentas, publicação de etapa, recuperação e caminhos hospedado/generate.",
    "packages/core/src/session/runner/index.ts": "Contrato público do runner para drenagem, compactação e generate sem registros.",
    "packages/core/package.json": "Exports públicos de Session/compaction/runner/Atlas e dependência de atlas-boundary; demais exports lidos sem virarem alegações de domínio.",
    "packages/core/src/rag-studio/sql.ts": "Forma persistida, chaves primárias e campos por tabela, inclusive pipeline/blocked.",
    "packages/server/src/handlers/rag-studio-session.ts": "Hidratação por Location, extração, noteBytes, execução em Store e ciclo delete/insert; seleção de traces por perguntas.",
    "packages/server/src/handlers/rag-studio.ts": "Fronteira HTTP concreta, adaptação de erros, extração anterior à admissão e encaminhamento das operações.",
    "packages/protocol/src/groups/rag-studio.ts": "Declaração das rotas e exigência de Location; não prova instalação/middleware global.",
    "packages/schema/src/rag-studio.ts": "Payloads HTTP, literais lexical/embedding e limites numéricos ausentes nas formas observadas.",
    "packages/server/src/handlers/atlas.ts": "Location/raiz, conversão de falhas, operações e resolução de modelos fora de Session.",
    "packages/core/src/atlas.ts": "Imports boundary, adaptador síncrono, projectId do host, modelos, indexação e dois passes de mineração.",
    "modules/continuity/src/v2/index.ts": "Declaração da contribuição que substitui SessionCompaction e acrescenta ferramentas; instalação global não inferida.",
    "modules/continuity/src/v2/strategy.ts": "Ligação dos hooks ao modelo/última entrada, arquivo antes de máscara, proteção de contexto obsoleto e falhas.",
    "modules/continuity/src/v2/tools.ts": "Autorização e sessão da ferramenta, loadAll, paginação e distinção de ausência/indisponibilidade.",
    "modules/continuity/src/v2/archive.ts": "Layout e persistência de arquivo/máscaras e exportação separada; não é input de dados .atlas.",
    "modules/rag-studio/src/context.ts": "Gate, Store, contador reiniciado e Maps, AsyncLocalStorage e permissão externa padrão.",
    "modules/rag-studio/src/extract.ts": "Leitura real Bun.file/PDF que precede o gate no handler.",
    "modules/rag-studio/src/admit.ts": "Ordem do gate, leitura do Store e identidade de fonte vinculada a Location/caminho.",
    "modules/rag-studio/src/reparse.ts": "Tratamento distinto de bytes alterados e falha de leitura, ligado à hidratação do servidor.",
    "modules/rag-studio/src/search.ts": "Filtros sobre fonte/chunks atuais; ausência de consulta a revision.members.",
    "modules/rag-studio/src/ask.ts": "Trace gravado sob revisionId, ligado à persistência por questionId do servidor.",
    "modules/rag-studio/src/trace.ts": "Parâmetro questionId efetivamente usado como chave no Store.",
    "modules/rag-studio/src/proof.ts": "Alocação de pergunta e exigência de trace por questionId para prova.",
    "modules/rag-studio/src/revision.ts": "Conversão de pipeline, alocação de revisão e snapshot de membros; liga a inferência de reutilização de IDs.",
    "modules/atlas/packages/adapter-io/src/surface/index.ts": "Origem declarada da surface externa e distinção empty/instalação; sem equiparar origem a bundle verificado.",
    "modules/atlas/packages/adapter-io/src/surface/review.ts": "Roteamento de resposta/decisão, ator declarado e token de território; não autenticação HTTP.",
    "modules/atlas/packages/adapter-io/src/review-answer.ts": "Bloqueio de proposta automática quando answer é drafted.",
    "modules/atlas/packages/cli/src/surface-mine.ts": "Origem declarada de mineSites/mineWith, dois passes advisory sobre HEAD e admissão de resposta.",
    "modules/atlas/boundary/package.json": "Destino gerado dos subpaths efetivamente importados pelo host.",
    "modules/atlas/boundary/script/build.ts": "Mapeamento das origens para bundles e verificação --check disponível; não executada.",
}
assert set(reasons) == set(cited), (set(reasons) - set(cited), set(cited) - set(reasons))

sources = []
source_refs = []


def add_source(row, captured, role, reason, ranges=None, read_ranges=None):
    raw = captured.read_bytes()
    calculated_blob = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
    assert row["sha256"] == sha(raw), row["path"]
    assert row["git_blob_sha"] == calculated_blob, row["path"]
    assert row.get("byte_length", len(raw)) == len(raw), row["path"]
    assert len(raw) <= 256000, row["path"]
    assert ".atlas" not in Path(row["path"]).parts, row["path"]
    ref = {key: row[key] for key in ("commit", "path", "git_blob_sha", "sha256")}
    source_refs.append(ref)
    line_count = len(raw.decode("utf-8").splitlines())
    for start, end in ranges or []:
        assert 1 <= start <= end <= line_count, (row["path"], start, end, line_count)
        assert any(a <= start and b >= end for a, b in read_ranges or []), (row["path"], start, end, "range not inspected")
    sources.append({
        **ref,
        "byte_length": len(raw),
        "line_count": line_count,
        "captured_file": str(captured.relative_to(S4)),
        "role": role,
        "semantic_reason": reason,
        "body_locators": labels.get(row["path"], []),
        "body_line_ranges": ranges or [],
        "inspected_line_ranges": read_ranges or [],
        "inspection_basis": "Leitura estática nesta unidade" if ranges else "Instruções lidas no trabalho L1 anterior e aplicadas nesta unidade; bytes novamente conferidos",
    })


for path in sorted(cited):
    external = path in boundary
    row = boundary[path] if external else domain[path]
    assert row["commit"] == BASE
    ranges = merge(cited[path])
    read_ranges = merge(inspection[path])
    captured = S4 / ("boundary-source" if external else "source") / path
    if external:
        assert read_ranges == [[1, len(captured.read_text().splitlines())]], path
    add_source(row, captured, "external-read-only-boundary" if external else "assigned-domain-link", reasons[path], ranges, read_ranges)

for row in protocol:
    assert row["commit"] == PROTOCOL
    add_source(row, S4 / "producers/l1a/protocol-source" / Path(row["path"]).name,
               "protocol-contract", "Contrato efetivo da produção L1, qualidade, autoridade, transporte e separação de observação/runtime; pin próprio, sem alegar checkout único.")
add_source(agents, S4 / "source/AGENTS.md", "repository-instructions",
           "Instruções aplicáveis da raiz do repositório; não ampliam a população S4 atribuída.")
source_refs.sort(key=lambda row: row["path"])
sources.sort(key=lambda row: row["path"])

origins = []
for path, role in [(boundary_receipt, "Origem da captura dos 12 externos"), (domain_receipt, "Origem da captura do domínio atribuído")]:
    raw = path.read_bytes()
    origins.append({"origin_path": str(path.relative_to(S4)), "sha256": sha(raw), "byte_length": len(raw), "role": role,
                    "native_file_input": False, "reason": "Apenas proveniência da captura. Inputs são as fontes semânticas individuais e este registro compacto, não o recibo bruto."})

provenance = {
    "schema": "genesis-static-source-provenance-v1",
    "execution": EXECUTION,
    "artifact_key": KEY,
    "source_revision": BASE,
    "protocol_revision": PROTOCOL,
    "observed_head": None,
    "method": "Inspeção estática e conferência de tamanho, SHA-256 e identidade Git blob sobre bytes capturados. Sem execução de código de produto, teste, build, importador ou integração.",
    "capture_origins": origins,
    "population": {"assigned_count": 2220, "changed": False, "external_read_only_references": 12, "semantic_domain_files_used": len(cited) - 12,
                   "limit": "Não recenseia o host nem transforma referências externas em nova população atribuída. Não afirma compreensão de todos os ramos dos módulos."},
    "counts": {"body_semantic_sources": len(cited), "instruction_sources": len(protocol) + 1, "source_refs": len(source_refs), "body_locators": sum(len(value) for value in labels.values())},
    "materialization": {
        "source_paths": "Cada source_ref deve ser materializado no path original com bytes exatamente iguais à captura; file:<path> é o mesmo path.",
        "multi_pin": "Código e AGENTS no baseline; contratos de protocolo no pin do protocolo, em seus paths originais. observed_head=null: não é declaração de checkout Git de um só commit.",
        "payloads": "Arquivos novos deste produtor usam payload_path no prefixo declarado; não têm commit inventado.",
        "refused_origins": "Nenhum input de dados .atlas, bundle gigante, censo bruto ou recibo de captura gigante. Os limites preservados de L1B não foram removidos nem reclassificados.",
        "pending": "Materialização, prepare/refresh, aceitação semântica e publicação não foram executados por este produtor. Runtime deve reobservar os mesmos paths/bytes.",
    },
    "sources": sources,
}
write_json("source-provenance.json", provenance)

recipe = {
    "schema": "genesis-producer-recipe-v1",
    "execution": EXECUTION,
    "work_package": "WP-L1-BOUNDARY",
    "producer": "/root/producer_l1a",
    "artifact_key": KEY,
    "scope": SCOPE,
    "layer": 1,
    "need": "evidence",
    "source_revision": BASE,
    "protocol_revision": PROTOCOL,
    "observed_head": None,
    "request_ref": file_ref("request.md"),
    "source_provenance_ref": file_ref("source-provenance.json"),
    "inspection_register_ref": file_ref("inspection-register.json"),
    "source_reader_ref": file_ref("read_source.py"),
    "metadata_builder_ref": file_ref("build_delivery.py"),
    "protocol_refs": [{key: row[key] for key in ("commit", "path", "git_blob_sha", "sha256")} for row in protocol],
    "public_criteria": ["QS-1", "QS-2", "CC-3", "CC-7", "GO-I2", "GO-I5", "GO-I7", "GO-I8"],
    "steps": [
        "Preservar o pedido literal antes da produção, sem acessar oracle nem delegar.",
        "Ler os 12 arquivos externos e conferir suas identidades contra o recibo de captura do conector.",
        "Seguir as ligações necessárias para 19 fontes do domínio já capturado; selecionar claims e intervalos efetivamente usados.",
        "Escrever corpo português <=12000 bytes, separando constatação, inferência, intenção e execução; preservar conflitos que alteram uso.",
        "Conferir localizadores dentro de intervalos lidos; anexar somente fontes semânticas/instruções efetivas, com file input no path original.",
        "Empacotar receita/proveniência compactas, request/response e hashes finais. Manter build_dependencies e recibos de julgamento/runtime vazios.",
    ],
    "semantic_bound": "supported significa que as afirmações limitadas do corpo são sustentadas pela inspeção. Não é aceite independente, integração comprovada, equivalência de bundles, autorização HTTP ou completude do domínio.",
    "critical_input_availability": "Todos os bytes necessários às afirmações delimitadas estão capturados, conferidos e abaixo do limite de file input. As dependências externas não examinadas aparecem como limites; não sustentam afirmações positivas de integração.",
    "navigation_only": ["S4:L1:ownership-boundaries", "S4:L1:atlas-host-genesis", "S4:L1:continuity-rag", "S4:L1:coverage-governance"],
    "build_dependencies": [],
    "limits": ["Nenhum teste de produto, CI, build, chamada externa/modelo, importador nativo, Git remoto ou publicação.", "Nenhuma leitura de oracle ou edição dos corpos/arquivos L1A/L1B.", "Nenhuma expansão do censo de 2220 arquivos; fronteiras externas são referências somente de leitura.", "Não há nova delegação; esta unidade foi produzida diretamente."],
}
write_json("recipe.json", recipe)

response = f"""# Entrega WP-L1-BOUNDARY

Unidade **{KEY}** concluída para revisão independente, em português, com **{len(body)} bytes UTF-8**. Estado proposto: `supported` para as afirmações estáticas delimitadas; não há aceite de juízes ou vinculação em runtime nesta entrega.

## Resultado substantivo

- **Session/Continuity:** o corpo acompanha admissão, exclusividade, governança, ferramentas, compactação e persistência exposta pela API. Distingue o caminho de modelo normal, engine hospedada e `generate`; a contribuição de Continuity é declarada, mas sua instalação global não foi demonstrada. O recall recebe a sessão do contexto, e arquivo/máscaras têm persistência própria, separada da exportação ao repositório.
- **RAG/Store/SQL:** o servidor reconstrói Store por Location e por requisição, relê fontes, executa a operação e regrava tabelas. A leitura de arquivo precede o gate de admissão. Foram registrados o desencontro entre `revisionId` e `questionId` nos traces, a inferência de reutilização de `rev_1`/`q_1` pelo contador reiniciado, a diferença entre arquivo indisponível e hash alterado e a busca sobre estado atual apesar de membros históricos persistidos. O adaptador não abre uma transação para todo o ciclo; isolamento externo permanece desconhecido.
- **Atlas host/boundary:** o adaptador in-processo importa `surface`/`mine` gerados e resolve modelos fora de Session. As origens declaradas separam rascunho de modelo, proposta e decisão; o ator declarado e o token de ratificação não demonstram autenticação HTTP. Dois passes de mineração envolvem chamadas assíncronas; paridade dos bundles e estabilidade do estado entre passes não foram estabelecidas.

## Arquivos e integridade

- `body.md`: SHA-256 `{sha(body)}`.
- `request.md`: SHA-256 `{file_ref('request.md')['sha256']}`; pedido literal preservado antes da produção.
- `source-provenance.json`: SHA-256 `{file_ref('source-provenance.json')['sha256']}`; mapa de fontes, intervalos, razões, pins e capturas.
- `recipe.json`: SHA-256 `{file_ref('recipe.json')['sha256']}`; método e referências de payload.
- `artifact.json`: metadados comuns com refs/input paths correspondentes, sem dependências de build. Seu hash final é registrado no recibo de integridade separado para evitar referência circular com esta resposta.

Todos ficam em `/workspace/scratch/aff930d22ec7/s4/producers/l1-boundary/`. O recibo de integridade deve conferir os bytes finais sem executar código de produto.

## Fontes efetivas e limites

São **{len(cited)} fontes semânticas**: os **12 externos** de Session/runner/compaction, core package/Atlas/SQL, handlers Atlas/RAG/Store, protocolo HTTP e schema; mais **19 ligações do domínio** em Continuity v2, RAG e origens/gerador de Atlas boundary. Há ainda **6 fontes de instrução**: AGENTS e cinco contratos do protocolo. Cada uma está listada com commit, path, Git blob e SHA-256 em `source-provenance.json`; cada `source_refs.path` tem o `file:` correspondente no mesmo path.

Código: `{BASE}`. Protocolo: `{PROTOCOL}`. A materialização é explicitamente multi-pin, com `observed_head=null`. Não inclui o censo bruto, recibo gigante, dados `.atlas` ou bundles grandes como inputs. Os **2.220 caminhos atribuídos permanecem preservados e inalterados**; as 12 referências externas não ampliam essa população.

Permanecem desconhecidos a composição global, o interior do Store/projetor/History e suas garantias completas, middleware/autenticação HTTP, atomicidade global e paridade dos bundles. Essas lacunas impedem concluir integração operacional completa, sem invalidar as observações delimitadas. `semantic_review_refs=[]`, `runtime_receipt_refs=[]` e `build_dependencies=[]` são vazios reais. Nenhum teste local de produto, build, CI, chamada externa, Git remoto, oracle, alteração de produto ou nova delegação foi realizado.
"""
(HERE / "response.md").write_text(response)

payload_inputs = ["request.md", "response.md", "recipe.json", "source-provenance.json", "inspection-register.json", "read_source.py", "build_delivery.py"]
input_keys = ["file:" + row["path"] for row in source_refs] + ["file:" + PAYLOAD + name for name in payload_inputs]
assert len(input_keys) == len(set(input_keys))
for name in payload_inputs:
    assert (HERE / name).stat().st_size <= 256000

artifact = {
    "key": KEY,
    "scope": SCOPE,
    "title": "Fronteiras do host: Session, persistência RAG e entrada Atlas",
    "layer": 1,
    "need": "evidence",
    "body": {"path": "producers/l1-boundary/body.md", "encoding": "utf-8", "byte_length": len(body), "sha256": sha(body)},
    "source_refs": source_refs,
    "input_keys": input_keys,
    "authority": {"scope": SCOPE, "basis": f"Produção direta de WP-L1-BOUNDARY por /root/producer_l1a na execução {EXECUTION}; fonte {BASE}, protocolo {PROTOCOL}. Evidência de inspeção estática com distinção de inferência, intenção e execução. Referências externas somente de leitura; população S4 permanece 2220. supported sustenta somente as afirmações limitadas do corpo; não declara aceite independente, integração, publicação ou autoridade de ratificação. Materialização multi-pin, observed_head=null, sem alegação de checkout único."},
    "validity": "supported",
    "gaps": [
        "Instalação global de Continuity e implementação interna de SessionExecution/Store/History/projetor não foram capturadas; não se afirma integração completa, atomicidade da sessão ou recuperação após crash.",
        "RAG mantém conflitos materiais entre trace de ask por revisionId e persistência/prova por questionId; contador recriado permite inferir reutilização de IDs. São constatações/inferências estáticas, sem reprodução executada.",
        "Leitura RAG anterior ao gate, conservação de metadados sob arquivo indisponível e ausência de transação explícita do ciclo exigem cuidado; autorização e isolamento oferecidos externamente não foram demonstrados.",
        "Middleware, autenticação e registro global das rotas/Location não foram capturados. Ator/token Atlas são contratos de domínio e não provam autenticação HTTP.",
        "Imports do host apontam a bundles gerados; origem e receita foram examinadas, mas paridade integral de bytes não foi estabelecida. Dois passes de mineração não provam snapshot imutável entre chamadas de modelo.",
        "Inspeção estática não é teste, CI, build, chamada externa ou integração executada; revisão independente, prepare/binding e recibos runtime permanecem pendentes.",
    ],
    "evidence": [
        f"Corpo com {sum(len(value) for value in labels.values())} localizadores em {len(cited)} fontes semânticas, incluindo todos os 12 externos; hashes e intervalos conferidos contra capturas fixas.",
        "Proveniência e correspondência semântica: " + json.dumps(file_ref("source-provenance.json"), ensure_ascii=False),
        "Registro de leituras: " + json.dumps(file_ref("inspection-register.json"), ensure_ascii=False),
        "Critérios públicos QS-1, QS-2, CC-3, CC-7, GO-I2, GO-I5, GO-I7, GO-I8 são alvos de avaliação, não parecer de aceite.",
        "Não foi alterada a população de 2220 caminhos ou qualquer corpo L1A/L1B. Navegação abaixo é consulta, sem dependência de build.",
    ],
    "recipe_ref": {key: value for key, value in file_ref("recipe.json").items() if key != "byte_length"},
    "build_dependencies": [],
    "navigation": recipe["navigation_only"],
    "producer_request_ref": {key: value for key, value in file_ref("request.md").items() if key != "byte_length"},
    "producer_response_ref": {key: value for key, value in file_ref("response.md").items() if key != "byte_length"},
    "semantic_review_refs": [],
    "runtime_receipt_refs": [],
}
write_json("artifact.json", artifact)
print(json.dumps({"body_bytes": len(body), "body_sha256": sha(body), "artifact_sha256": sha((HERE / "artifact.json").read_bytes()), "semantic_sources": len(cited), "source_refs": len(source_refs), "inputs": len(input_keys), "max_source_bytes": max(row["byte_length"] for row in sources)}, ensure_ascii=False))
