# Genesis — auditoria estática externa de integração

## Resultado e limite

As três frentes A/B/C estão produzidas e tiveram seus pedidos específicos de revisão independente resolvidos. Este pacote é um **candidato estático público** para a dupla de integração da coordenação principal. Não declara PASS global, integração concluída, satisfação dos 50 requisitos ou aceite do dono. Os 13 controles do plano permanecem **NOT_RUN**.

A revisão de processo e a selagem são registradas em `review-summary.json` e `handoff.json`. O handoff fixa um payload anterior; seus arquivos são endereçados por commit e hashes em `artifact-index.json`. Um recibo público posterior, `delivery-verification.json`, quando emitido após a conferência da selagem, referencia esses commits sem reescrevê-los; esse recibo não integra o payload anterior.

## Identidades distintas

| Uso | Commit/objeto |
| --- | --- |
| Código e árvore investigados | `1cde2ff7a71bcf7aecb5d030917b577165135d38` |
| Árvore raiz do baseline | `a522a53e5f046f1758151b0f558531bbded04592` |
| Protocolo | `ee2521a5b966bd505cc95bd1c733e09e12f33531` |
| Prompts S1–S5 | `d2d985c28947c7f984a36b07ad34ede3d4d2d6b4` |
| Freeze pré-autoria | `3d9a515f264a7938c764d37532bc42ad6005fc47` |
| Branch de entrega | `genesis-external-integration-static` |

Nenhum HEAD atual substituiu o baseline. A branch nasceu exatamente nele. Todas as escritas remotas foram feitas pela orquestradora via GitHub MCP, com lease e `force:false`, somente neste diretório.

## A — Inventário e reconciliação

As **14.442 entradas** definidas pela partição são folhas rastreadas: **14.442 blobs**, incluindo o blob de um symlink, e **zero gitlinks**. A árvore completa contém **16.710 linhas descendentes**, pois acrescenta **2.268 diretórios tree**. A raiz é identificada separadamente. Não há divergência de população.

| Fatia | Esperado | Observado | Diferença |
| --- | ---: | ---: | ---: |
| S1 | 2.236 | 2.236 | 0 |
| S2 | 4.506 | 4.506 | 0 |
| S3 | 4.553 | 4.553 | 0 |
| S4 | 2.220 | 2.220 | 0 |
| S5 | 927 | 927 | 0 |
| Total | 14.442 | 14.442 | 0 |

A enumeração foi recomposta por 47 respostas Git tree não truncadas após uma falha de transporte da consulta recursiva global. O resolver encontrou 87 arquivos exatos, 14.130 folhas por prefixo e 225 pelo fallback S5. Não houve paths duplicados, sobreposições, entradas sem dono, exclusões de folhas ou regras sem correspondência. Os 12 digests da partição conferem. Uma reconstrução independente dos 2.269 objetos tree por caminho, incluindo a raiz, reproduziu todas as identidades esperadas. O TSV persistido está ordenado por bytes UTF-8, sem inversões.

**Achado de fit:** a interseção das regras do observer do baseline com os metadados identifica 80 blobs acima de 256.000 bytes, cinco paths com segmento `.atlas` e um symlink: união disjunta de **86 entradas**. Elas continuam na população. É uma fronteira estática a conciliar no candidato real S4; não equivale a 86 falhas de execução nem a defeito comprovado de uma versão posterior. O efeito sobre membership e a materialização real dos bytes não foram medidos.

Detalhes e evidência: [inventory.md](inventory.md), [inventory.json](inventory.json), [tree-inventory.tsv](tree-inventory.tsv), [sources-A.json](sources-A.json) e [static-verification.json](static-verification.json).

## B — Contratos, navegação e impactos

O grafo tem **20 nós**, **17 relações observadas** (13 de dependência/composição/geração, duas de chamada/dispatch e duas de navegação) e **sete impactos inferidos delimitados**. Import, chamada escrita e receita não demonstram execução.

As cadeias rastreadas incluem CLI S5 → Server/Core S1; composição de seats S5 → Maestro S3 → Relay S3 e a interface Core S1; App Shell S2 → Client S1 → Protocol/API S1 → Core Atlas S1 → boundary/implementação Atlas S4. A navegação de conhecimento identifica mecanismos de catálogo, referência, anchor e reaquisição; não cria um grafo concreto de unidades aceitas da campanha.

A revisão corrigiu B-E04: a origem S4 de contribuições não estava demonstrada e foi retirada. Foram explicitados o fluxo `hosts() → listen → bind → createRoutes`, o import de Host e seu export map. Os dois revisores reavaliaram as correções. Permanecem desconhecidos a paridade dos executáveis gerados, o alcance transitivo completo, os recursos do build escolhido, as unidades reais e a paridade integral Client/API/UI.

Detalhes e trechos públicos: [contracts.md](contracts.md), [contracts.json](contracts.json), [sources-B.json](sources-B.json), [evidence-excerpts-B.json](evidence-excerpts-B.json) e [review-delta-B1.json](review-delta-B1.json). O último é o registro histórico do delta do autor; a disposição atual está em [review-summary.json](review-summary.json).

## C — 50 critérios e plano mínimo

A matriz preserva **exatamente os 50 IDs**, na sequência do registro, e as 50 linhas normativas literais: 7 GO-A, 8 GO-I, 10 AC, 7 CC, 5 SC, 6 QS e 7 DOD. A interpretação de owners, a evidência decisiva futura, as possibilidades de reuso e os gates ficam em campos separados. ROOT significa a coordenação principal.

Os controles INT-00..12 cobrem seleção exata dos inputs, cobertura, construção/binding, consumidores, cache/reuse, impacto/rebuild, recuperação, recusas, preservação, economia, gates técnicos, dupla final e entrega governada. Dependências estão explícitas e sem ciclos. Mecanismos comuns S4 podem ser reutilizados somente com versões, contratos, inputs, autoridade, escopo e casos compatíveis; os casos locais e os deltas transversais continuam necessários.

**Todos os 50 requisitos têm satisfação e aceite UNKNOWN. Todos os 13 controles estão NOT_RUN.** Não foram selecionados nem inspecionados handoffs, resultados, releases correntes ou estado privado das outras sessões.

Consulte [criteria-matrix.md](criteria-matrix.md), [criteria-matrix.json](criteria-matrix.json), [verification-plan.md](verification-plan.md), [verification-plan.json](verification-plan.json) e [sources-C.json](sources-C.json).

## Proveniência e revisão

O [source-manifest.json](source-manifest.json) reúne **70 vínculos distintos de revisão/path/blob**: 46 do baseline, 18 do protocolo, cinco prompts e o freeze desta auditoria. Isso não significa leitura semântica dos 14.442 blobs. O escopo real de cada leitura está registrado. A orquestradora comparou por MCP 77 excertos de 40 fontes decisivas de B e dois excertos contextuais adicionais, sem divergências.

Três produtores reais receberam ownership disjunto. Dois revisores novos, sem autoria e com `fork_turns:none`, avaliaram a mesma barra congelada e receberam os corpos pertinentes, não apenas links. As correções voltaram aos mesmos revisores. Só achados e disposições públicas estão neste pacote; pareceres integrais e material reservado não foram publicados.

[gaps.json](gaps.json) conserva 14 registros de lacunas, limites e incidente recuperado. A fronteira do observer é descrita em A e C; os registros não são 14 defeitos independentes. A auditoria não resolve runtime, economia, CI/proteção, preservação privada, revisão final de integração ou aceite humano. Omni 393 e Platform 200 não foram produzidas nem alteradas.

## Recuperação e uso pela coordenação

1. Ler `handoff.json` no commit de selagem divulgado. Fixar `artifact_revision` e buscar `artifact-index.json` nesse commit, conferindo seu SHA-256.
2. Para cada entrada do índice, buscar o path no mesmo payload e conferir byte length, SHA-256 e Git blob SHA. Para o TSV grande, usar GitHub MCP `fetch_blob` se `fetch_file` retornar somente metadados.
3. Manter separados os pins de código, protocolo e prompts. Reler a branch antes de qualquer continuação; um avanço de HEAD não substitui os inputs fixados.
4. Se precisar corrigir este pacote, criar novo payload descendente e nova selagem que referencie o payload anterior conhecido. Atualizar com `expected_sha` observado e `force:false`; se o lease falhar, reler e reconciliar. Não resetar nem forçar a branch.
5. A coordenação seleciona os handoffs reais S1–S5 e a release S4, examina os gaps e aplica o plano aos deltas autorizados. A dupla desta auditoria não substitui sua dupla de integração.

Nenhum teste, CI, consumidor, ferramenta nativa do produto, integração final, merge ou deploy foi executado nesta auditoria. As verificações efetuadas foram leituras MCP e cálculos determinísticos de metadados, JSON, texto e hashes.
