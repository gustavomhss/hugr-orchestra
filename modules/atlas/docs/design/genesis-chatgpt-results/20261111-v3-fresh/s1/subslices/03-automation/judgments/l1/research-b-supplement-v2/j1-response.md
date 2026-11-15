## J1 — `PASS` semântico para o recorte `research-b` v2

**Juiz:** `parallel-v3-fresh/S1-03/J1`  
**Execução:** `34269cf4-d631-41c5-a30b-85b0ec217390`  
**Escopo deste parecer:** R8–R14, incluindo o delta de R8.1  
**Corpo v2:** 63.501 bytes; SHA256 `d2def4b82495605b491e0d5494b1511e1b68c47dcffa84af87c8d35705468661`

As cinco partes foram recebidas com `FIM_DO_LOTE`. Considerei a correção literal da linha 368 de RB-S002, preservando o incidente como erro de transporte.

**RE-B1 a RE-B7 estão encerrados no escopo semântico estático solicitado.** O corpo `research` integral ainda permanece em **`REQUEST_EVIDENCE`**, exclusivamente pelo residual de **RE-A4** identificado no parecer anterior. Este PASS do recorte não antecipa o encerramento daquele pedido.

### Encerramento dos pedidos

| Pedido | Decisão | Evidência e conclusão |
|---|---|---|
| **RE-B1 — Query, search e locate** | **Encerrado** | RB-S001–005 mostram as uniões públicas, limites, basis, normalização, seleção de shards, resolução e ramos de consulta. O overlay de definições permanece distinto das relações persistidas; não há fundamento para convertê-lo em atualização global de referências/imports. Search expõe paginação, clipping e os limites da classificação de completude; JSON inválido não é silenciosamente transformado em resultado vazio. Locate mostra releitura, verificação do range completo, checks, descarte, limites e fallback lexical. |
| **RE-B2 — Liveness** | **Encerrado** | RB-S006 apresenta `allowed`, normalização, atalho de captura recente, pool, DNS, HEAD/GET, redirects e classificação dos resultados. Confirma que `allowed` é helper separada e não é invocada automaticamente por `check`/`probe`. Os checks locais não são promovidos a qualificação externa de isolamento. |
| **RE-B3 — Probe e processo** | **Encerrado** | RB-S007–013 fornecem os tipos fechados, execução completa, slots, snapshot, assets, runners, typecheck e supervisão de processo. Sustentam as distinções entre snapshot e ambiente hermético, resultado do probe e retenção/cobrança pelo caller, bem como entre o rótulo `memoryCap` derivado da configuração e uma medição de eficácia do enforcement. |
| **RE-B4 — Binding, allowance e ledger** | **Encerrado** | RB-S014–016 mostram Task/Session/placement, as duas representações de tool part, revalidação, bind compatível, charge, reconciliação, interrupção, canonicalização e replay. O suporte é para identidade, escopo e operação; não transforma o conteúdo registrado em verdade. |
| **RE-B5 — Custódia, páginas e locators** | **Encerrado** | RB-S017 e RB5-03 mostram publicação imutável, manifestação e admissão separadas, checks de diretório/arquivo, leitura paginada, UTF-8 estrito e cursor vinculado. `records.source` percorre todas as páginas retidas sem aquisição ao vivo. Os locators e `lineStart` estão expostos, incluindo o limite do ramo de snapshot `code_locate`, que não acrescenta desambiguação de path ausente no locator. |
| **RE-B6 — Mutação, aquisição, views e inquiry** | **Encerrado** | RB6-01–04 fornecem os caminhos completos solicitados: validação de referências e citações, limites, CAS, publicação/replay, aquisição pendente ou assentada, views e cursores. `inquire` não exige localmente `opened` antes de `checked`/`closed`; impede novos eventos de inquiry após fechamento, preservando replay exato. `closed` consulta a última allowance compatível, sem usar automaticamente o card de um dispatch anterior. |
| **RE-B7 — Seat, população e contratos de testes** | **Encerrado** | RB-S019 fornece a declaração das listas de ferramentas; RB-S020–032 fornecem os contratos decisivos de E44–E46. A população continua sendo a mesma projeção RA1-P já examinada. Nomes `live`, assertions e cenários preparados permanecem evidência de contrato, com execução **NOT_RUN** nesta produção. |

### Delta de R8.1 — `PASS`

A redação corrigida está diretamente sustentada:

- **RB-S002, linhas 187–196:** tenta o shard atual; reúne os retidos de mesmo id na ordem dos registros; verifica sua presença; seleciona o primeiro correspondente por `previous.find`.
- **RB-S003, linhas 170–200:** `records` mantém a ordem armazenada; `retain` antepõe o registro recebido; `touch` promove o commit utilizado sem alterar os seus shards.

Portanto, “primeiro retido de mesmo id ainda presente, na ordem do manifesto” descreve o mecanismo observado com precisão. **Encerro o residual de RE-B1 sobre esse delta.** O PASS do delta do memo em R7.2, emitido no parecer do suplemento A, permanece válido.

As notas internas de proposta “não aplicada” e o hash prospectivo de uma única substituição pertencem ao momento anterior identificado pelo envelope. Não substituem a identidade v2 submetida nem criam um terceiro corpo aceito.

### Critérios e limite do parecer

Os pedidos de suficiência relativos a **QS-1, QS-4 e CC-3**, com os aspectos pertinentes de **GO-A1 e GO-A5**, foram atendidos neste recorte. O uso da população e do histórico compartilhados conserva os pontos de **GO-A4, CC-1 e CC-7** já examinados. A separação entre fonte, interpretação, teste preparado e execução mantém **QS-5, QS-6, GO-I1, GO-I2, GO-I7 e GO-I8** no escopo declarado.

**Nenhum novo achado obrigatório de correção foi demonstrado neste suplemento.** Binding operacional, Atlas, consumidores e manutenção executada continuam obrigações próprias de suas fases.

### Única pendência restante de `research` para J1

**RE-A4 — `packages/core/src/research-toolkit/code-index/extract.ts`, linhas 150–180**, mesma identidade de RA-S058: mostrar a função que liga o plano ao conteúdo extraído, a ordem do fallback estrutural/SCIP e o controle de compatibilidade com HEAD. Esse trecho não foi incluído no suplemento B.

Os pareceres originais permanecem preservados. As decisões dos outros lotes, inclusive **D-SUP-01**, não mudam por este envio.