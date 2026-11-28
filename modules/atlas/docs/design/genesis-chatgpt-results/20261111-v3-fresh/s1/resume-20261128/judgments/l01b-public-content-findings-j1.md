# L01B — findings públicos para autoria independente, sem oracle

Corpo SHA256 59a9f41829855df521efcaf45ff42026f4bf0ff5c227a99a42624808e399d00e. Excerpt literal de J1 complementar.

### Disposição dos findings

| Finding | Resultado | Evidência e consequência |
|---|---|---|
| **J1-L01B-F01** | **FIX-FIRST — evidência recebida, conteúdo incompleto** | Em `packages/codemode/src/tool-runtime.ts:759–781`, resolução e decodificação precedem `recordAndObserve`. Este registra a chamada e aciona `onToolCallStart` antes da execução. Em **721–740**, `observeEnd` notifica sucesso/falha, mas a interrupção não produz nenhum desses outcomes. **143–149** preserva a interrupção pura. |
| **J1-L01B-F02** | **PASS — encerrado** | Coverage e population fixam a fixture em **637.024 bytes**, com o mesmo blob. `ownership-input.ts:172,181` demonstra o teto de **256.000 bytes** no observador do baseline. A classificação continua metadata-only; não há observação semântica da fixture nem prova de comportamento de um release posterior. |

### Menor correção material necessária

Acrescentar ao contrato de observação, com vínculo à fonte suplementar:

- A resolução e a decodificação aplicável ocorrem **antes** do registro. Uma falha nessa admissão não equivale a uma chamada registrada que terminou em erro. Isso não cria validação genérica para JSON Schema descritivo.
- Chamadas admitidas são registradas e notificadas pelo início **antes** da execução do handler; registro não comprova conclusão.
- Quando o efeito da chamada é interrompido, inclusive pela interrupção decorrente do timeout de execução, **`onToolCallEnd` não recebe outcome `success` nem `failure`**. A ausência desse término não pode ser interpretada como settlement.

Não é necessário ampliar a auditoria do interpretador, reler a fixture ou executar um programa. A correção deve receber identidade própria e preservar os vínculos anteriores.

