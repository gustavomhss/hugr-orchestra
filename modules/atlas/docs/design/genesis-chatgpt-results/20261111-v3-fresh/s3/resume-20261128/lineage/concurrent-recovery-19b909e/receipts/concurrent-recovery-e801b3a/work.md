# S3 — Maestro, Relay, especialistas e integrações

Estado: **IN_PROGRESS / RECOVERED_WITH_BLOCKED_REVIEW**.

- Execução original: `bdac971f-e4ee-40e5-ad9b-30d659303bab` (UUID local, não ID de conversa).
- Execução de recuperação: `e51ef44b-a6d6-47b0-a6ea-dd5aef7d7c3e`.
- Sessão: S3; modo `fresh_chat`; branch exclusiva `genesis-fresh-s3`.
- Fonte fixa: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- Protocolo: `parallel-v3-fresh`, commit `ee2521a5b966bd505cc95bd1c733e09e12f33531`; resultados `20261111-v3-fresh`.
- População preservada: 4.553 entradas únicas — Maestro 424, Relay 3.700, especialistas/integrações 429.
- Tokens, billing, custo e tentativas físicas não expostos: `UNKNOWN`.

## Estado durável atual

| Unidade | Artefatos | Estado | Evidência / próxima condição |
| --- | --- | --- | --- |
| L1 | `s3-l1-maestro`, `s3-l1-relay`, `s3-l1-integrations` | **ACCEPTED_PERSISTED** | Aceite do par persistente original em `evidence/L1-acceptance.json` e `judgments/judge-{1,2}-L1-*.json`. |
| L2 | três corpos em `bodies/l2-*.md` | **CORRECTED_NOT_JUDGED** | Oracle original preservado; validação rev. 2 é `PASS_STATIC_ONLY`; requer dois novos ACCEPT nos hashes exatos. |
| L3 | `bodies/l3-flows.md` | **CORRECTED_CANDIDATE_UNRELEASED** | Oracle congelado antes do corpo; precondição: L2 corrigido aceito pelo par. |
| L4 | entry, ownership, maintenance e operational | **CANDIDATE_UNRELEASED / CORRECTED_WHERE_AFFECTED** | Precondição: L3 corrigido aceito pelo par. |
| REVIEW | `/root/judge_j1`, `/root/judge_j2` | **WAITING_FOR_INDEPENDENT_JUDGES_ON_CORRECTED_BYTES** | Fila rev. 2 em `review-packets/recovery-review-queue.json`; qualquer nova correção material exige os dois novamente. |
| PACKAGE | `native-package.json` | **IN_PROGRESS_L1_ONLY** | Não inserir L2–L4 até aceite semântico durável. |
| RUNTIME | import, binding, publication, index/read | **NOT_RUN_FOR_RECOVERED_PACKAGE** | Só depois dos 11 artefatos aceitos e pacote completo; usar contrato S4 compatível. |
| CONSUMER | casos S3-C1…S3-C7 | **NOT_RUN** | Executar em contexto isolado somente após publicação/read real. |
| UPDATE/VERIFY | afetados, gates, accounting e handoff | **PENDING** | Integração global continua pertencendo a ROOT; não absorver pendências locais. |

## O que sobreviveu e o que foi reconstruído

O branch anterior persistiu a população, os três corpos L1, suas fontes/coverage, as correções autorais e os seis pareceres L1. O checkpoint remoto anterior à recuperação era `4a8a2965eea1a42432123db772f496b6331a1f9d`.

O histórico da conversa antiga relatava L2 e L3 aceitos pelo par e L4 despachado, mas os corpos completos e os pareceres correspondentes não estavam duráveis no branch, refs, workflow artifacts ou handles recuperáveis. Essa afirmação foi preservada somente como contexto; **não** foi usada como release ou aceite.

A recuperação produziu, em ordem:

1. `f99f2ad9305aed3de870afca051cff1ff92e5152` — congelou os oracles L3/L4 e o recibo de retomada antes dos novos corpos.
2. `84a3e82e7aa22fb7f7cadca4740d97842e0e5c92` — reconstruiu os três corpos L2 e os marcou `NOT_JUDGED`.
3. `86d2253e9985a3f24b3f2f2f0b80a6ad6ed63d9c` — preparou L3/L4 como candidatos não liberados, sua validação estática e a fila de revisão.
4. `0df5e185f6dc426a2de3da8898752fc6d62da0e9` — transformou o estado da recuperação em checkpoint retomável no branch.
5. `8b3f707c69b533774d79919ee5955c9f5e5501b6` — aplicou findings recuperados de revisão aos bytes L2/L3/L4, persistiu os trechos-fonte e regenerou hashes, validações e fila.

## Findings recuperados e aplicados

O pacote `evidence/recovered-judge-findings.json` é derivado de um resumo seguro da sessão anterior. Os pareceres integrais não foram recuperados; portanto ele é input de correção, não decisão de juiz.

Foram aplicados três findings:

- **Relay recheck:** ausência de sprint atual ou comparação não executada produz `not-run`; um sprint fornecido/descoberto que não pode ser lido, decodificado ou validado produz `invalid`, nunca `not-run`.
- **Custo:** ausência de cost data é não medido, com `total: null`; custo, billing, tokens e tentativas permanecem `UNKNOWN`, nunca zero por omissão.
- **CI:** o baseline diz literalmente “Tests run on GitHub Actions, never on this machine.” e documenta `bun run test:ci ...`; somente um run observado com identidade e resultado é evidência de CI.

Os trechos literais estão em `evidence/recovery-source-excerpts.md`. Como os bytes de `s3-l2-relay` mudaram, nenhuma decisão L2/L3/L4 anterior é herdável.

## Hashes correntes que os juízes devem revisar

### L2

- `s3-l2-maestro`: `7505522f3e92fa25dfda8dac896a2717d6eac71d9bd3a928d0bf4ae5e5b08d7e`
- `s3-l2-relay`: `ebeef855436f687189c081b5a47ade29a2e716b0284613daaa0515f32d333037`
- `s3-l2-integrations`: `5b65c606ab258eea521adbf0cdf4bdf43b0755ec2ec0a7be5a2efc25545ce0c3`

### L3

- `s3-l3-flows`: `d69898e99b6e6eb4d9309b46c9e1541059effdbbdcc59fd2efb29ddd860947b7`

### L4

- `s3-l4-entry`: `43dfa1d4d82c7072c911f8e28e6abecce9686f0dea1be7d19077f3d2c27de871`
- `s3-l4-ownership`: `6c27da488bf8a376b0153150b59584766abd2a8c420910ec9ed542b8c2d4bfa3`
- `s3-l4-maintenance`: `31821e9ed5533a9e48fd590fad4bf94373c7a2241615e563038eb27c8b7d0cf8`
- `s3-l4-operational`: `4f6a500ee4b575d9c06aa6c070ee8071f3b580c76c0f55da3871e567ebba7d81`

## Outros findings preservados

- precedência de label: `labelEnv`, senão `agent.<id>.name`, senão default do roster; valor selecionado inválido usa o default e não cai para a fonte inferior;
- rotas diretas de evidência L1 no entry L4, explicitamente como navegação;
- dependências reconstruídas de forma mínima, distinguindo build/semântica de navegação. O relato de “seis remoções” foi mantido como incompleto porque a lista exata não sobreviveu.

## Validação disponível

`evidence/L2-static-validation.json` e `evidence/recovery-candidate-static-validation.json`, ambas revisão 2, confirmam deterministicamente:

- cobertura dos seis casos L2;
- limites de bytes e cobertura dos quatro casos L3;
- cobertura dos quatro papéis L4;
- roteamento estático dos sete casos S3-C1…S3-C7;
- cobertura estática dos três findings recuperados;
- ausência, nos candidatos, dos erros críticos listados pelos oracles.

O resultado é `PASS_STATIC_ONLY_AFTER_CORRECTION`. A validação foi feita pela principal de recuperação e não substitui J1 ou J2.

## Capacidades observadas nesta recuperação

- não havia run de GitHub Actions para `genesis-fresh-s3` nem status checks no head L2 observado;
- o dispositivo Desktop Commander disponível estava offline;
- esta interface não expôs um handle síncrono recuperável para os dois subagentes/juízes persistentes;
- o workflow `atlas-genesis` existente julga candidatos do `atlas mine`/Grok e não é semanticamente o juiz L2–L4 desta campanha.

Nenhum runtime, CI, import, binding, publicação, leitura Atlas ou consumidor foi declarado verde por inferência.

## Ordem obrigatória de continuação

1. J1 e J2 revisam os três hashes L2 correntes contra `oracles/L2-all.json`.
2. Corrigir qualquer finding; os dois reavaliam os novos bytes.
3. Depois de dois ACCEPT L2, J1/J2 revisam o hash corrente de `s3-l3-flows`.
4. Depois de dois ACCEPT L3, J1/J2 revisam os quatro hashes L4 correntes.
5. Finalizar `native-package.json` com as 11 revisões aceitas.
6. Executar importação, binding, publicação, `index`/`read`, sete consumidores independentes, afetados, gates, accounting e handoff.

Até essa sequência completar, o estado não é `DELIVERY_COMPLETE`.
