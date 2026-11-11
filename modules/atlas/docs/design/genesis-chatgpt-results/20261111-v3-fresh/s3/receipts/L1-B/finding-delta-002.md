# Finding original J2 e correção 002

**Origem:** feedback da orquestradora sobre julgamento v1. J1: PASS v1. J2: FIX-FIRST, F1, C3/R2. Não são julgamentos produzidos por este agente. Ambos os juízes reavaliarão v2.

**Expected original:** Indicar como distinguir os significados de stdout vazio usando arm state, stderr e relay verify

**Observed original:** O corpo enumera os significados possíveis, mas não fornece essa orientação conjunta. README pinado L110–117 a fornece expressamente.

## Fonte decisiva já capturada

`modules/relay/README.md` — commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`, blob `cd560185711063570400578596daa387f98c841f`, linhas 110–117. SHA-256 externo da fonte: `7db61c7076b66cc627ce8769e0bb2b0932b9259d82778ed306871349fc4cb981`.

```text
- Arm binding prefers `agent_transcript_path`. Ambiguous tokens or a different
  bound `agent_id` cause refusal with exit `0`, permitting the stop.
- Empty hook stdout can mean completion, escalation, refusal, or a plan defect.
  Inspect arm `state`, stderr, and `relay verify`; a stopped runner is not proof.
  ARM `.run.lock` serializes evaluation; contention exits `3` with stderr, no block.
- Mandatory ARM/CLI/benchmark evidence and transition appends fail fatally before
  corresponding counter/state/retry/release updates. Some ARM ancillary appends
  and archives remain best-effort; this ordering provides neither atomicity nor rollback.
```

## Ajuste aplicado, sem aceite presumido

Após a tabela de drivers, foi inserida exatamente a orientação solicitada e a referência às linhas acima. Também foi aplicada a sugestão aceita de trocar “ID inteiro primeiro” por “ID completo primeiro”. Não houve outro ajuste no corpo. `body-delta-002.diff` preserva o delta integral; `body-v1.md`, `response-v1.md` e `verification-v1.json` preservam a entrega anterior.

A inspeção e a validação se limitam a bytes, fontes já capturadas e artefatos. Zero testes do produto, zero CI, zero escrita remota e nenhuma etapa L2. Estado permanece `L1_CANDIDATE_FOR_REVIEW`, v2.
