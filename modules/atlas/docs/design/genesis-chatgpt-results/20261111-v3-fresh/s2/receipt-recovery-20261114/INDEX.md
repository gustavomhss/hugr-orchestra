# Genesis S2 — índice de recibos públicos preservados

**Status do índice:** consolidado a partir de evidência Git pública; não é novo julgamento.
**Pacote S2:** `native-package.json`, commit-base `7c8905a0e833f057bca359bb8debd548440bc23e`.
**Execução semântica:** `46d09d97-39a9-482a-a290-646ba1d94c99`.
**Fonte:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
**Protocolo:** `ee2521a5b966bd505cc95bd1c733e09e12f33531`.

## 1. Identidade do pacote e preservação

| Registro | Caminho relativo a `s2/` | Git blob SHA (no commit-base) | Identidade declarada |
|---|---|---|---|
| Pacote nativo | `native-package.json` | `b869729c4a4e8bd817e8f987264ae2c579c9e992` | SHA-256 `9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b`; 332.594 bytes; 13 chaves |
| Handoff histórico | `handoff.json` | `1825683bbb669f036d2c8c8be50b9f427a5be82d` | execution ID acima; completion `INCOMPLETE_BLOCKED` |
| Registro de trabalho | `work.md` | `78cca60d416741018ea73b5754eb4eb321e0fb6d` | preserva a preparação falha original e limites |
| Publicação do arquivo histórico | `git-publication/state.json` | `2e9b1ffd51c594497775683a1ab1849c5693b2f4` | 1.109/1.109; archive SHA-256 `7cd39199afb286e16b191bf28030bda2964ec32a7b0476ee81de0597d12abab2`; `COMPLETE_ARCHIVE_PRESERVATION` |
| Protocolo da fatia | `.orchestra/skills/execute-genesis/references/fatia-2.md` | commit `ee2521a5b966bd505cc95bd1c733e09e12f33531` | contrato S2 |

## 2. Recibos de aceite semântico dos 13 corpos

Os quatro manifests são registros mecânicos que apontam para decisões reais, não novos julgamentos. Todos referem a mesma execução, fonte, protocolo e população de 4.506 paths; cada corpo tem SHA-256 e byte length, e cada entrada lista J1/J2 como PASS.

| Camada | Manifesto | Git blob SHA |
|---|---|---|
| L1 (3 corpos) | `accepted/l1.json` | `dc5bafc334a001f03533e0cf65b1439de85c1136` |
| L2 (3 corpos) | `accepted/l2.json` | `37bea292cbe9bb123055d0befdbbadf40aff0695` |
| L3 (3 corpos) | `accepted/l3.json` | `a8b0540a6a56972443256520ff37d02eb23a46d6` |
| L4 (4 corpos) | `accepted/l4.json` | `2a2d5bc9e66e600297a6374c72c4de6fbe749fcb` |

Os 13 corpos e seus hashes são definidos em `native-package.json` e nos manifests. Os pareceres originais por artefato permanecem nos caminhos `judgments/resume-l1/*`, `judgments/l2-r1/*`, `judgments/l3-r1/*`, `judgments/l3-r2/*`, `judgments/l4-r1/*` e `judgments/l4-r2/*`, referenciados por path, hash, juiz e veredito nos manifests acima. O índice não reescreve nem substitui esses bytes.

## 3. Pareceres públicos de fechamento e correção de registros

| Registro | Caminho relativo a `s2/` | Git blob SHA | Identidade / escopo |
|---|---|---|---|
| J1 — fechamento r1 | `judgments/final-closure-r1/j1.json` | `35ff6fc0d0c5d023a296a9fed43031e2eb0a75ac` | reviewer `parallel-v3-fresh/S2/J1`; pacote `069416fb6b9d6fe2b0d2c12664f9283a09dddd761d08392f1026b5ca948b8410`; arquivo vincula o pacote nativo `9356...` |
| J2 — fechamento r1 | `judgments/final-closure-r1/j2.json` | `a144602bf73c59b141f11513ce2669a3fc56b847` | reviewer `parallel-v3-fresh/S2/J2`; mesmo packet SHA e native-package SHA |
| J1 — correção de registro | `judgments/final-record-check-r1/j1.json` | `aa799c54c3bc44b07fee299099a1a66dc60c2918` | `J1-CLOSURE-04` satisfeito apenas para a correção delimitada do registro |
| J2 — correção de registro | `judgments/final-record-check-r1/j2.json` | `ba0abd51af1ebff3188f111af85c1764b79b0c28` | `CLOSURE-J2-F3` resolvido apenas no escopo da correção local de registro |

Os pareceres de fechamento distinguem PASS de conteúdo e HOLD operacional. A correção de registro não altera os votos originais nem transforma runtime, binding, consumidores, manutenção, publicação ou CI em PASS.

## 4. Preparação nativa: falha integral preservada e recuperação posterior incompleta

| Registro | Caminho / origem | Identidade | O que prova |
|---|---|---|---|
| Prepare original | `evidence/native-final-prepare/prepare-execution-receipt.json` | Git blob SHA `be5fc3cb24858fb97546c851921d4a7dd9a1ac33`; native package SHA-256 `9356...` | Recibo integral: `PREPARE_FAILED`, exit 1; sem candidate_id/binding_id; CAS parcial de 13 arquivos preservado; publish/testes não executados |
| Resumo público r4 | `evidence/recovery-prepare-r4/public-summary.json` | Commit `c73238fd2bc2a841691be09b4e07678c9d30dbed`; Git blob SHA `72a104c694c78fdfecd5c5a552c05dc992669abf` | Declara explicitamente `DERIVED_REDACTED_SUMMARY_NOT_VERBATIM_EXECUTION_RECEIPT`; reporta `PREPARE_SUCCEEDED`, candidate revision `22815b6821dce26562624b4711c705c7cd786268`, candidate ID `f310ec9b3844d6833ea5a867f9ed14ce099669492c66d8b133116642310310dd`, 13 artefatos/626 observações e prepared SHA-256 `a4946200211c54cdf7f94a26e659cdc285e65d5775a8e1e2f56cf2d9c9d2f207` |
| Reconciliação documental r4 | `resume-20261114/recovery-prepare-reconciliation.md` | Commit `c73238fd2bc2a841691be09b4e07678c9d30dbed`; blob SHA `cd84f8da06ce580a93f23d37115609b890908315` | Declara que o resumo r4 não substitui recibo integral nem prova binding; 14 consumidores e S2-U1 continuam NOT_RUN |
| Handoff da retomada | `resume-20261114/handoff.md` | Commit `6d49a6a821c3bcb153f794326ab757346f87bcf6`; blob SHA `f34f3a7b2941fb17355090b8f5a9fdceb47989fc` | Unidade de reconciliação documental DONE; fatia S2 PARTIAL/INCOMPLETE_BLOCKED |

**Ausência real confirmada neste conjunto público:** não foi localizado o recibo integral verbatim da execução r4, nem seus bytes completos de stdout/manifesto/candidato preparados. O resumo redigido não contém o ledger, argv, paths internos, candidato completo ou inventário de referências omitidos. Não é correto reconstruí-los a partir dos hashes ou do resumo.

## 5. Estado operacional preservado — não inferir aceite

O handoff histórico e a matriz de gates mantêm:
- Binding/candidate runtime independente: não comprovado pelo resumo r4.
- Publicação governada/Atlas read: não executada.
- 14 casos S2-C/S2-I: NOT_RUN.
- S2-U1 (mutação, invalidação, restauração, reuse e comparação): NOT_RUN.
- Recuperação/manutenção e CI específico S2: HOLD/NOT_RUN conforme a matriz.
- `delivery_complete=false`.

A matriz `evidence/final-local-gates.json` tem Git blob SHA `249e89e1ad0b774576922416f55a48c8483c3a46`; o registro de aceite L4 e os pareceres não promovem nenhum desses gates operacionais.

## 6. Verificação de não duplicação e limites de atividade

No relatório de reconciliação pinado em `85f10964d08feb09b9971cf2c25702cd40fc6078`, a sessão S2 `genesis-s2-resume-unit-20261114` está registrada com commit `6d49a6a821c3bcb153f794326ab757346f87bcf6`, unidade documental DONE e handoff PARTIAL; atividade da conversa UNKNOWN. A própria reconciliação dessa unidade registra `genesis-s2-publish` em `b5e02be4c5be46be5dd9c001e411683561f9cb47`, sete commits atrás da base S2 e sem commits à frente naquele momento. A busca de branches desta tarefa encontrou apenas `genesis-s2-publish` e `genesis-s2-resume-unit-20261114` para `genesis-s2`; não encontrou branch prévia de receipt-recovery. Isso não prova que conversas estejam encerradas: estado de sessão continua UNKNOWN.

Esta unidade apenas indexa evidência pública existente. Não acessou arquivos privados, não refez produção/julgamento/runtime, não executou produto/CI, não modificou pacote ou branches alheias e não concede autorização de publicação de material interno.
