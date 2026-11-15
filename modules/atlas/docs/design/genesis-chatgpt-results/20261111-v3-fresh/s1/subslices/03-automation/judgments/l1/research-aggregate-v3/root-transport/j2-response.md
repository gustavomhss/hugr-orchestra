## J2 — PASS semântico para `s1.core.research` L1 v3 completo

**Juiz:** `parallel-v3-fresh/S1-03/J2`  
**Execução:** `34269cf4-d631-41c5-a30b-85b0ec217390`  
**Corpo avaliado:** `producers/research/body.md`, **v3, R0–R14, 63.841 bytes**  
**SHA-256:** `f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f`  
**Git blob:** `72bdc55fdf2dbda97e84c87111be73fa49aceeb4`  
**Fonte:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`

O conjunto formado pelos corpos originais, suplementos A/B v2, deltas anteriores e substituição v3 sustenta a suficiência semântica **do corpo completo**. A verificação de identidade e da substituição única é a informada pela principal; este julgamento, realizado sem ferramentas, avalia o conteúdo literal recebido.

**RB-J2-F01 está fechado. Não permanece achado obrigatório nem pedido de evidência aberto para este candidato L1.**

### 1. Fechamento de RB-J2-F01

| Elemento | Avaliação |
|---|---|
| **Esperado** | Distinguir o limite das listas selecionadas da chamada inicial de sondagem, conservando o ramo em que o total pode atingir 33 consultas internas. |
| **Observado em v3, R8** | O texto separa índice utilizável, ausência de `sources.query` e sondagem que falha com `index_unavailable` ou `index_building`. Explica que, neste último caso, a chamada `map` já aconteceu e não é descontada das 32 listas lexicais. |
| **Fundamentação** | `RB-S005`, `locate.ts:56–79,187–199`: `ranks` antecede a seleção; a falha admitida produz `undefined`; o desconto depende de `query` após essa sondagem. Dezesseis termos distintos podem, portanto, produzir 16 listas `lexical` e 16 `lexical-wide`, além do `map`. |
| **Tratamento dos testes** | `RB-S032:34–62,98–121` confirma que a expectativa de teto usa `map` bem-sucedido, o caso sem índice remove `query`, e o caso `index_building` verifica a degradação com um termo, sem contar o teto. São contratos de teste fornecidos, sem resultado de execução atribuído. |
| **Decisão** | **Correção suficiente — fechado**, nos critérios QS-1, GO-A6 e CC-3. |

As precisões anteriores sobre **duas entradas totais no memo SCIP** e sobre **seleção do primeiro shard retido presente na ordem do manifesto, alterada por `retain`/`touch`**, permanecem incorporadas ao v3. O complemento `RESEARCH-RES-01`, `extract.ts:150–180`, também sustenta o encaminhamento explícito de arquivos ausentes, parsing parcial, ocorrências SCIP malformadas e modo estrutural para os registros de cobertura.

### 2. Avaliação agregada de R0–R14

| Critérios pertinentes | Decisão e fundamento |
|---|---|
| **GO-A1, GO-A2, GO-A3, GO-A4; QS-2, QS-3; CC-3** | **PASS no escopo L1.** O corpo fornece compreensão utilizável dos toolkits, instalação e prontidão, construção e consulta do índice, busca e localização, liveness, probes e registros de pesquisa. Liga comportamento, falhas, limites e pontos de mudança às fontes correspondentes, permitindo consulta mais profunda quando necessária. A organização preserva intermediários e distingue componentes que produzem resultados daqueles que os admitem, cobram ou conservam. Fundamentação: R0–R14; suplementos A e B, especialmente RA-S047–068 e RB-S001–019. |
| **QS-4; CC-1, CC-7** | **PASS no escopo L1.** A população de 130 fontes está reconciliada: 59 de backend-toolkit e 71 de research; 80 de implementação, 41 de testes, sete dados ou pins de runtime, um resultado gerado e uma documentação. A projeção compartilhada conserva papel, necessidade, profundidade de leitura e seções atendidas. Histórico, arquivos gerados, manifests, pins e fixtures recebem disposição própria, sem transformar contagem ou presença em compreensão integral. Fundamentação: RA1-P, fontes históricas e de cobertura do suplemento A, R0–R7 e R13. |
| **GO-A5, GO-A6; QS-1, QS-5, QS-6; GO-I2, GO-I8** | **PASS no escopo L1.** O corpo distingue observação estática, intenção expressa em comentários, expectativa de teste e comportamento executado. Conserva limites decisivos: prontidão além do marker, caminhos padrão indisponíveis, resultados stale ou parciais, heurísticas do índice, sondagem de liveness e suas limitações, snapshot com dependências externas, delegação de contenção e memória, custódia sem prova de verdade e aquisição sem retry oculto. A qualificação de R8 elimina a generalização restante sobre o teto de buscas. Fundamentação: RA-S047–068; RB-S001–018; RB-S020–032; delta v3. |
| **GO-A7; GO-I7** | **PASS no escopo L1.** O conhecimento permanece situado nos componentes e contratos existentes. As descrições de referências, admissões, publicações e ferramentas não concedem autoridade governante a conteúdo importado, comentários ou fixtures, nem atribuem ao recorte garantias externas de Atlas ou de execução. O aceite anterior do reúso exato dos controles nativos permanece separado e limitado ao seu escopo. |
| **GO-I1** | **PASS.** As versões anteriores e seus pareceres são preservados. O v3 incorpora uma substituição documental identificada, mantendo os demais bytes conforme a conferência informada pela principal. A decisão atual reconhece a correção sem reclassificar retroativamente o v2 ou apresentar relatos posteriores de receita como procedimentos anteriores. |
| **AC-01 e parcela pertinente de AC-04** | **Atendidos para esta decisão semântica L1.** As necessidades locais estão cobertas pelo corpo e pela evidência recebida; nenhuma falta obrigatória de conteúdo ou suporte permanece. Mantém-se o reconhecimento anterior do reúso exato de `AC-04-local-native`. Este resultado não fecha as demais obrigações operacionais de AC-04. |

### 3. Pedidos anteriores e preservação dos votos

- **Research-a — RE-A01–05:** permanecem encerrados pela evidência do suplemento A e pelos complementos pertinentes. O PASS de R0–R7 em v2 é preservado e sustenta a decisão agregada sobre os trechos correspondentes do v3.
- **Research-b — RE-B01–06:** permanecem encerrados pelo suplemento B. **RB-J2-F01**, único achado obrigatório restante, está encerrado pela substituição v3.
- **Voto anterior de research-b v2:** permanece **FIX-FIRST como registro histórico daquele corpo**. O PASS aqui emitido pertence ao **v3 completo**.
- **Demais lotes:** seus pareceres permanecem inalterados.

**Achados obrigatórios remanescentes neste corpo: nenhum. Evidência adicional necessária para seu aceite semântico L1: nenhuma.**

O alcance deste PASS é o conteúdo de `s1.core.research` L1 v3. Binding e operação Atlas, consumidores, manutenção executada, qualificação de runtime e conclusão da missão continuam sujeitos às suas próprias evidências e decisões.
