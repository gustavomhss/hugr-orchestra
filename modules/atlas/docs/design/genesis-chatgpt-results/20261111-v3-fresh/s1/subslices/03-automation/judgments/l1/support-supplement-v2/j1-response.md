## J1 — PASS semântico para `s1.subslice03.support` L1 v2

**Juiz:** `parallel-v3-fresh/S1-03/J1`  
**Execução:** `34269cf4-d631-41c5-a30b-85b0ec217390`  
**Corpo completo:** 23.025 bytes; SHA256 `498a0454418a14977b9b2f4c4f515711d941b6d4bbece13f1baaa8feaa76d378`.  
**Escopo:** L1, necessidade `entry`, suporte local das **104 fontes** atribuídas.  
**Fonte investigada:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

Recebidas as sete partes, a correção restrita de transporte em **FX-CAP-MANAGEMENT-1** e o `FIM_DO_LOTE` externo. **Aceito a suficiência semântica do corpo v2 completo**, considerando os três deltas, a evidência complementar e o material anterior reutilizado. Não usei ferramentas; as verificações mecânicas de identidade são as informadas pela principal.

### Correções obrigatórias e qualificações

| Item | Decisão e fundamento |
|---|---|
| **D-SUP-01 / SUP-F01 — direção arquitetural** | **FECHADO.** A redação agora conserva separadamente `Schema → Core` e `Protocol → Server`, acrescentando a exposição dos serviços Core por Server conforme o README. A razão correspondente de coverage foi corrigida sem alterar inventário ou profundidade de leitura. Sustentação: **R042**, README integral anteriormente recebido e **SUP-COVERAGE-ERRATUM**. |
| **SUP-F02 — atribuição dos spawns** | **FECHADO pela qualificação da afirmação.** O texto descreve a única expectativa `open` e a diferença do contador entre `expectSpawn` e `settle`. Exclusividade por teste permanece uma intenção condicionada à delimitação correta da janela e à ausência de trabalho sobreposto. **HAR-OPEN-1, R060–R061** sustentam essa descrição. Os casos de **CI-CONTROL-1** não são promovidos a prova universal de exclusividade. |
| **SUP-F03 — chave de testes** | **FECHADO.** A redação explicita que `??=` fornece o caminho temporário somente quando a variável ainda não está definida, preservando um valor anterior. Sustentação: **R046**, `test/preload.ts` 4–11. |

Não resta necessidade de provar uma integração universal de runner para sustentar o corpo atual: a promessa incondicional de exclusividade foi retirada, e a precondição não demonstrada ficou explícita.

### Pedidos anteriores

| Pedido | Decisão e evidência suficiente |
|---|---|
| **RE-SUP-01 — população, herança e estrutura** | **FECHADO.** A reconciliação compartilhada conserva os 104 paths individuais, suas profundidades e a relação com as 24 fontes de fronteira. O histórico permanece distinto do inventário local. **MECH-PROCEDURE**, os recibos estruturais e os materiais de tar, ZIP e SCIP sustentam as contagens e inspeções limitadas declaradas, sem revisão semântica fictícia dos binários. |
| **RE-SUP-02 — configuração e manutenção gerada** | **FECHADO.** **CFG-TS, CFG-DRIZZLE, GEN-MIG, GEN-PACK, GEN-FLOOR e GEN-PTY**, junto dos trechos anteriores, mostram os caminhos de geração, ordenação, verificação, pins incompletos e limites de medição descritos no corpo. |
| **RE-SUP-03 — documentação histórica** | **FECHADO.** **DOC-CTRL, DOC-SESSION, DOC-PLAN, DOC-SNAPSHOT, DOC-WAVE, DOC-CHANGE, DOC-MIG-HISTORY e DOC-API-DISCUSSION** permitem conferir época, candidato, intenção, compatibilidade e exclusões. O corpo não transfere os resultados históricos para a execução atual. |
| **RE-SUP-04 — fixtures e contratos dirigidos** | **FECHADO.** Os grupos **FX-ACTIONS, FX-GH, FX-CAP, DIST, CI, PKG, UP e FX-RECORDING** sustentam a distinção entre componentes reais usados pelo harness, respostas controladas, falhas injetadas, dados gravados e expectativas preparadas. O runner substituído da fixture de schedule continua explicitamente limitado. |
| **RE-SUP-05 — processo e harness** | **FECHADO.** **HAR, PROC-NONCE, PROC-WINDOWS, PROC-FLOCK, PROC-EFLOCK, PROC-BACKGROUND, PROC-APP e PROC-DIALER**, com os trechos anteriores, fornecem os mecanismos concretos pedidos. Contadores, identidade de processo, cleanup, scopes, schemas e casos de teste não são apresentados como execuções desta produção. |

### Conclusão agregada

O conjunto atende à fidelidade e rastreabilidade exigidas por **QS-1, CC-3 e AC-01 local**. A organização por famílias e necessidades oferece entrada utilizável e aprofundamento delimitado; a preservação de gerados, história, fontes binárias e ownership mantém os demais critérios pertinentes de navegação, manutenção documental e escopo. A separação entre verificações determinísticas, interpretação, intenção de testes e execução preserva **QS-5/QS-6 e GO-I2/GO-I7/GO-I8**.

**Achados obrigatórios abertos neste corpo v2: nenhum. Pedidos RE-SUP-01 a RE-SUP-05 pendentes: nenhum.**

O `FIX-FIRST` do v1 permanece histórico. O erratum de coverage vale para as duas razões identificadas na versão `d1ed0705d256b1578a0debce284c3a2c4dd3bd2e00bf9f8f60e047b097d5bf74`; não reescreve os registros anteriores. Este aceite não encerra a proposta de união nem seus pedidos próprios, e não constitui execução de produto, binding Atlas, consumo independente ou manutenção executada.