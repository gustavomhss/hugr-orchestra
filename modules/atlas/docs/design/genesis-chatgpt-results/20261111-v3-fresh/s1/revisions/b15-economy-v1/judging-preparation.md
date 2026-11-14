# B15 — pacote de preparação para julgamento independente

Estado: **BLOCKED — sem capacidade nativa de subagentes nesta sessão**. Este documento prepara a transferência; não é um julgamento nem aprovação.

## Identidade fixa

- Repo: `gustavomhss/hugr-orchestra`
- Checkpoint/handoff: `882752dea940817edbc261d8b5763bde32872e7e`
- Branch de autoria isolada: `genesis-s1-b15-reconciliation-20261113`
- Head do artefato: `5e34e464e0c504261287ad7b4cfa2cf25f65c834`
- Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`
- Protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`
- Artifact: `s1.core.economy`
- Package SHA-256 declarado e consistente entre handoff/manifest: `fe4b807717cfd2b623e89eb29ae8a13dc1e35c3a0cbc57bf02773a4faf4e045e`
- Body SHA-256 declarado e consistente entre handoff/manifest: `74a59d062ae560dc633abd7561b1a763a7a9982db587d5c0076b8fc8f4a9b6bf`; byte_length declarado: 3288.
- Critérios do pacote: GO-A1, GO-A2, GO-A3, GO-A4, GO-A5, GO-A6, GO-A7, QS-1, QS-2, QS-3, QS-4, QS-5, QS-6, CC-1, CC-3, CC-7, GO-I1, GO-I2, GO-I7, GO-I8.
- Oracle ref: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/oracles/l1.json`, SHA-256 declarado `01689e1afd57acd85eb0fbdb967e8853821e38a5a21c52994882eeb68d07d42f`.

Nota de integridade: os hashes acima foram conferidos contra os campos de handoff/manifest e o binding do pacote; a ferramenta GitHub expôs também blob SHAs, não uma operação SHA-256 local nesta sessão. Não declaro recálculo criptográfico independente.

## Artefato candidato — corpo integral

<BEGIN exact body>
# Durable economic reservation and evidence separation

Layer: **L1 — pinned factual basis**. Need: `evidence`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

The economy envelope names authority, scope, provider/model/route, admitted stages, attempt/in-flight and optional token limits plus retry policy. A sealed request fingerprints those fields, logical identity/snapshot, endpoint/protocol, final request-body digest and per-attempt bounds. `validateBound` requires token dimensions bounded by the envelope to be present; supplied token bounds must be positive safe integers and not exceed any corresponding envelope limit. It does not validate `bound.attempts`; reservation applies the attempt limit by counting stored attempts. A request-body digest is identity evidence; it is not a provider usage receipt. [1]

`reserveAttempt` requires database storage identity, refuses an ambient transaction and performs admission in its own immediate transaction. It checks the exact stored envelope, reconciles the predecessor-derived admission ordinal, rejects conflicting fingerprints, reuses retained completion when available. An existing attempt with a `completionRef` receives a non-consumable grant before the body or forwarding checks, without requiring a `completionBody`. Searches for another retained completion require both reference and body. If neither completion path applies, a previously forwarded existing attempt is held as response-unavailable. Occupancy sums actual settled usage and retained bounds for unsettled obligations; a slot is counted until explicitly released. Corrupt or incomplete accounted dimensions hold/refuse rather than becoming zero. New rows retain exact body snapshot, bound and a forward intent; physical forward observation is separately recorded. [1]

`observeTerminal` records exact remote terminal evidence and releases the in-flight slot. `settleAttempt` additionally requires terminal evidence, matching evidence identity, complete bound usage dimensions and valid numeric relationships. It stores confirmed usage; exceeding an admitted bound blocks the envelope. An HTTP transport error by itself is explicitly not remote terminus. Completion body/reference, physical forward observation and semantic accepted/refused outcome are separate fields. Semantic rejection has no refund path for confirmed usage or held obligations. Recovery reads persisted obligations and does not infer missing evidence. [1]

## Authority and gaps

These facts describe the Core admission ledger module. The existence of these functions does not prove every provider path is governed by them; sender/route integration and the owning executor are required to establish that claim. Nor does this product module measure this Genesis conversation's tokens, physical attempts or billing. Those session economics remain unknown unless exposed by separate observed receipts. No reservation, settlement, fault injection or provider call was run.

## Source anchors

- **1.** `packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — sealed request, reservation, independent observations and recovery, lines 41–110, 242–284, 409–510, 550–615, 630–734, 783–823.

<END exact body>

## Entrada de contrato do artefato no pacote

```json
{
  "key": "s1.core.economy",
  "scope": "orchestra.s1",
  "title": "Durable economic reservation and evidence separation",
  "layer": 1,
  "need": "evidence",
  "body": {
    "path": "bodies/economy.md",
    "encoding": "utf-8",
    "byte_length": 3288,
    "sha256": "74a59d062ae560dc633abd7561b1a763a7a9982db587d5c0076b8fc8f4a9b6bf"
  },
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "blocked",
  "gaps": [
    "Provider/executor integration was not exhaustively read; universal economic enforcement is not asserted.",
    "Product economy code is not a receipt for this producer execution; token/attempt/billing usage is UNKNOWN.",
    "B15 impact-2 correction is incorporated in this isolated candidate; independent J1 and J2 decisions for this exact candidate version are not present.",
    "Historical impact findings and NO_CHANGE dispositions are provenance only; they are not transferable semantic or binding approvals for this revised body."
  ],
  "evidence": [
    {
      "payload_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/review-evidence-compact.md",
      "sha256": "1d28ad12ce7c525d230e42486b6bccd691104d5e6acd4a815728dda7b8ed8676"
    },
    {
      "payload_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/excerpt-map.json",
      "sha256": "301173d05efb7a14a5fedfafbf6755d34e413100dadd7f21560a62e0f4cff471"
    },
    {
      "commit": "51a7c500835c48b35cdfc2348484482d41c9770f",
      "path": "modules/atlas/docs/design/genesis-chatgpt-results/20261113-s1-economy-impact-2/findings.md",
      "sha256": "dbcd92a10aa9532bb174e408d78d4b66836d04112e242d362bbda58212e0d1f3"
    },
    {
      "commit": "7bfb9a4f69cd5ea1dc31b33d4afd26ec9e6c7f4a",
      "path": "modules/atlas/docs/design/genesis-chatgpt-results/20261113-s1-economy-impact-1/findings.md",
      "sha256": "17c1c42f4c0867ea2a3f6b2d81c99e3f3a22fa8facced2e2f45f6fb983ade93d"
    }
  ],
  "input_keys": [
    "file:packages/core/src/economy/admission.ts"
  ],
  "source_refs": [
    {
      "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "path": "packages/core/src/economy/admission.ts",
      "git_blob_sha": "914a0b925dd282e264292b2247189c549c993a3f",
      "sha256": "4806923787eb5724f7d70f9316bec2f74e3bd94fa48e8e62f9d4674dbf469dd7"
    }
  ],
  "recipe_ref": {
    "payload_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/recipe.json",
    "sha256": "79c21a0eb94bf9eb6927984134592a688d3b028c2213e5552bb1017ae50bd8fb"
  },
  "build_dependencies": [],
  "navigation": [],
  "producer_request_ref": {
    "payload_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/request.txt",
    "sha256": "5ade453a557acd559e6796cab8f6ed42d5141ddf668d3c6f06169e7ce8840d7d"
  },
  "producer_response_ref": {
    "payload_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/response.md",
    "sha256": "79a01b28b5df5d99a60f8dfd5af2b223671aec009ec9e77ae755cf38096ff12d"
  },
  "semantic_review_refs": [],
  "runtime_receipt_refs": []
}
```

## Oracle L1 congelado — conteúdo integral

Fonte: `genesis-fresh-s1`; Git blob `06b06ba1e1af456c8087882a8ba83733ee298e86`.

```json
{
  "schema": "genesis-s1-oracle/v1",
  "frozen_at": "2026-11-11T16:24:54.415843+00:00",
  "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "layer": 1,
  "units": [
    "S1-L1-A",
    "S1-L1-B",
    "S1-L1-C"
  ],
  "cases": [
    {
      "id": "L1-FIDELITY",
      "question": "Can every material fact be traced to bytes captured at the source pin?",
      "expected": "Commit/blob/hash and source excerpts agree; distinguish source reads from executions; no runtime success inferred from code."
    },
    {
      "id": "L1-POPULATION",
      "question": "Does every assigned entry have an honest depth/disposition?",
      "expected": "2236 unique entries, path hash 67d80c0e398b495140ef3b9fd4d0a8058036290919856635298b9007ed153889; generated/test/fixture/support rows do not imply individual semantic review; each family retains an explicit follow-up need."
    },
    {
      "id": "L1-SESSION",
      "question": "Does baseline support crash recovery, queue and exact-retry claims?",
      "expected": "AGENTS mandates durable admission separate from wake, admit-only resume:false, exact retry matching session/prompt/delivery, safe-boundary steer and idle queue, process-local ownership and no automatic crash continuation. Source discrepancies must stay visible."
    },
    {
      "id": "L1-ARCH",
      "question": "Which packages are contract authorities and generated clients?",
      "expected": "Schema feeds Core/Protocol then Server; Client runtime may depend on Schema/Protocol, never Core/Server; SDK composes; public Protocol/HttpApi changes require client generation; no direct generated edits."
    },
    {
      "id": "L1-RUNTIME",
      "question": "Can provider/tool/runtime support be treated uniformly?",
      "expected": "Do not equate provider event stream, external execution host and Orchestra tools. Enforce one explicit provider-turn stream, governed tools and process spawning boundaries; document unavailable details as gaps."
    }
  ],
  "public_criteria": [
    "QS-1",
    "QS-2",
    "QS-4",
    "QS-5",
    "CC-1",
    "CC-3",
    "CC-7",
    "GO-I1",
    "GO-I2",
    "GO-I7",
    "GO-I8"
  ],
  "reserved": true
}

```

## Fonte de implementação fixada

Arquivo: `packages/core/src/economy/admission.ts`; Git blob `914a0b925dd282e264292b2247189c549c993a3f`; baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`. O corpo candidato ancora observações nos blocos de seal/bound/reserve/settlement/recovery (linhas 41–110, 242–284, 409–510, 550–615, 630–734, 783–823). Os juízes devem confrontar essas âncoras com a fonte pinada, sem inferir execução a partir de código.

## Contexto histórico que não pode ser promovido

Os commits `7bfb9a4f69cd5ea1dc31b33d4afd26ec9e6c7f4a` e `51a7c500835c48b35cdfc2348484482d41c9770f` geraram sete disposições dependentes `NO_CHANGE` (quatro + três). O manifesto do candidato diz explicitamente que são história preservada, não nova avaliação do corpo B15. Não as conte como J1/J2.

## Despacho obrigatório quando o host oferecer os subagentes

Criar **dois novos** subagentes independentes com `fork_turns: none`, papéis `parallel-v3-fresh/S1/J1` (fidelidade/autoridade) e `parallel-v3-fresh/S1/J2` (completude/utilidade). Registrar somente IDs reais retornados pelo host. Ambos recebem exatamente este pacote e cobrem todos os critérios obrigatórios; sem ferramentas, sem navegação, sem delegação. Exigir por critério PASS/FIX-FIRST/HOLD/REQUEST_EVIDENCE, evidência/localização e motivo conciso; findings obrigatórios com resultado esperado, observado e correção; separar sugestões opcionais. Não usar terceiro voto, maioria ou substituir veto. Reutilizar os mesmos IDs nos deltas.

## Verificação explícita do catálogo nesta sessão

Inspecionada a lista completa `ALL_TOOLS` disponível em Chat + GitHub MCP, filtrando nomes e descrições por subagent, fork_turns, spawn/create agent, além das ferramentas GitHub. Nenhuma ferramenta de criação/fork de subagente foi encontrada. O conector GitHub permite operações de repositório/review PR, mas não cria agentes Chat independentes. Portanto não há IDs J1/J2 válidos nesta sessão e nenhuma avaliação formal pode ser fabricada.

## Estado e limites

- Candidate manifest: `CANDIDATE_BLOCKED_PENDING_INDEPENDENT_REVIEW`.
- Handoff: `IN_PROGRESS`; `judgments: []`.
- Este dossier não altera candidato, branch canônica `genesis-fresh-s1`, nem decisões históricas.
- Sem julgamento formal, sem binding/runtime review, sem Atlas consumer evidence, sem CI e sem aceitação global.
