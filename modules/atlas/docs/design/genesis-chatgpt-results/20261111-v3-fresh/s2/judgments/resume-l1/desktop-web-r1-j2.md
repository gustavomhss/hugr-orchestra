## Parecer J2 — desktop-web L1 r1

**Decisão do artefato: FIX-FIRST.** Há uma omissão concreta no contrato de inicialização exigido pelo oráculo e faltam trechos decisivos para confirmar algumas afirmações obrigatórias. O restante do lote apresenta boa separação entre implementação, instruções, testes não executados, documentação histórica e desconhecidos.

**Vinculação:** `s2.l1.desktop-web`, corpo de 28.755 bytes, SHA-256 `f680f5e2900f4e5039e0d9be32b4756db66de7d776d59ee0232c26555fd362f9`; fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`. Avaliação independente do novo J2, baseada somente no lote selado. Os hashes são os fornecidos pelo verificador externo; não houve recomputação nem verificação dos bytes internos do transporte.

### Finding obrigatório

**F1 — FIX-FIRST: diretório de execução específico ausente.**

- **Localização:** `l1.md`, §1, primeiro parágrafo; família `startup-owned-server`, campo `maintenance_implications`.
- **Esperado:** transmitir explicitamente que a inicialização usa **`userData/global`**, com o comportamento sustentado por `main/index.ts` e a orientação de manutenção atribuída separadamente ao skill.
- **Observado:** o corpo informa apenas “a cwd under desktop user data”; a família recomenda preservar “scoped state/cwd”. Nenhum deles identifica `global`. O trecho E01 começa depois da configuração do lançamento e não resolve essa omissão.
- **Consequência:** um mantenedor recebe uma aproximação da raiz de execução, insuficiente para preservar o contrato específico congelado em `L1-DESKTOP`.
- **Correção necessária:** acrescentar o caminho exato e sua relação com a inicialização; apresentar o trecho correspondente de `index.ts` e o trecho relevante do skill. Qualquer motivação deve permanecer atribuída à fonte que efetivamente a estabelece. Não é necessário executar o produto.

### Evidência complementar necessária

**R1 — REQUEST_EVIDENCE: readiness e lançamento.** Apresentar os trechos de `owned-serve.ts` que contêm `READY_TIMEOUT`, a construção do `Promise.race`, a sondagem autenticada de `/api/health`, a associação à saída do primeiro filho e o limite temporal; junto do trecho de lançamento de `index.ts` solicitado em F1. O corpo afirma esses detalhes, mas E01 prova somente que a publicação das credenciais sucede `owned.health.wait`; E02 trata do reinício.

**R2 — REQUEST_EVIDENCE: ponte e localização nativas.** Apresentar os trechos de `preload/index.ts` que expõem `window.api` e de `main/native-translations.ts:1–24` que sustentam o consumo tipado. E25 comprova a instrução de usar `nativeT(...)` e a exceção com texto literal; não comprova, sozinho, a implementação da ponte tipada descrita no §9.

### Decisões por critério pertinente

| Critério | Decisão | Localização e fundamento |
|---|---|---|
| **GO-A1; AC-01, parcela semântica L1; QS-2** | **FIX-FIRST** | §1 e família `startup-owned-server`: F1 impede a transferência exata de uma obrigação congelada. As demais seções oferecem propósito, fronteiras e consequências de manutenção úteis. |
| **GO-A2** | **PASS no recorte L1** | Corpo, mapa de famílias e evidência decisiva constituem uma base intermediária identificada e diretamente utilizável. Não implica alcançabilidade por índices futuros. |
| **GO-A6; QS-6** | **PASS no recorte L1** | Recibo mecânico, profundidades explícitas e excertos limitam interpretação e evitam confundir enumeração com leitura. Orçamento global e economia medida continuam sem aceitação. |
| **GO-I1** | **PASS quanto às identidades apresentadas** | Fonte, capturas originais e novos artefatos têm identidades separadas no recibo. Isso não certifica preservação integral de objetos da campanha. |
| **GO-I2; GO-I8** | **PASS** | §1, §§5–9 e “Open evidence”: inferências estáticas, expectativas de testes e limites de runtime permanecem distintos; contagens não são promovidas a completude semântica. |
| **GO-I7; QS-4** | **PASS no recorte documental** | §§2, 5–8; E04–E19: fronteiras, segredos, identidades e superfícies geradas são tratados explicitamente. Não equivale a auditoria integral ou aprovação da segurança do produto. |
| **AC-04, parcela de construção L1; QS-1; QS-5** | **REQUEST_EVIDENCE** | R1–R2 são necessários para confirmar afirmações obrigatórias contra testemunhos concretos. E02/E25 sustentam bem os conflitos identificados; E23/E24 impedem promoção de documentação a resultado executado. |
| **CC-1** | **PASS para o inventário local** | Recibo e mapa: 532 entradas, 30 famílias e profundidades delimitadas, incluindo cinco entradas somente de metadados. Inventário não substitui aceitação semântica. |
| **CC-7** | **PASS no recorte L1** | §9 e famílias de localização, assets, corpus, propostas e harnesses apresentam disposições e limites explícitos. Preservação e migração globais continuam abertas. |
| **QS-3** | **PASS** | O artefato explica a implementação existente sem introduzir armazenamento, agentes ou mecanismos de governança novos. |

### Casos do oráculo

| Caso | Decisão | Fundamento |
|---|---|---|
| **L1-COVERAGE** | **PASS local** | Reconciliação externa das 532 entradas; famílias distinguem leitura, representação e metadados. Não certifica as 4.506 entradas da camada completa. |
| **L1-AUTHORITY** | **PASS no recorte apresentado** | §1 e §9; E23–E25 distinguem implementação, instrução e histórico. Dependências de construção versus navegação permanecem obrigação posterior, sem aprovação aqui. |
| **L1-DESKTOP** | **FIX-FIRST** | F1; R1–R2 ainda pendentes. O conflito de localização e a discrepância de reinício estão corretamente qualificados como constatações de fonte. |
| **L1-UI** | **REQUEST_EVIDENCE na parcela desktop** | R2. E25 sustenta preservação de inglês/chaves e regras nativas. Obrigações de app-shell, session-ui e UI devem ser avaliadas também nos respectivos lotes. |
| **L1-SCOPE** | **PASS local** | As 30 famílias têm propósito, consumidores, manutenção e limites significativos; não há garantia indevida de backend, recuperação ou consenso. |

**HOLD:** liberação da camada L1 inteira, L2–L4, consumidores, testes/runtime, CI e critérios globais de publicação, preservação e economia. Este parecer não aprova esses resultados ausentes.

**Sugestões opcionais:** nenhuma adicional; corrigir F1 e completar R1–R2 basta para a próxima avaliação deste lote.
