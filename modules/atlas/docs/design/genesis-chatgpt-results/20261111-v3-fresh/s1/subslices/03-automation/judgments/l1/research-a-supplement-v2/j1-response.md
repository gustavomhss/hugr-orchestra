## J1 — `REQUEST_EVIDENCE` para `research-a-supplement-v2`

**Juiz:** `parallel-v3-fresh/S1-03/J1`  
**Execução:** `34269cf4-d631-41c5-a30b-85b0ec217390`  
**Corpo v2:** 63.501 bytes; SHA256 `d2def4b82495605b491e0d5494b1511e1b68c47dcffa84af87c8d35705468661`

As quatro partes foram recebidas, com `FIM_DO_LOTE`. O suplemento encerra a maior parte dos cinco pedidos originais. **Restam dois encadeamentos específicos de evidência:** a função de extração situada entre planejamento e execução SCIP, e a seleção do shard retido descrita pelo delta de R8.1.

O parecer original sobre v1 permanece registrado. A nota interna final que chama a alteração do memo de “não aplicada” é histórica, conforme o envelope de v2; não a trato como contradição da versão agora apresentada.

### Disposição dos pedidos originais

| Pedido | Disposição neste suplemento | Fundamentação |
|---|---|---|
| **RE-A1** | **Encerrado para histórico e reconciliação da população.** | RA1-01–04 fornecem o corpo histórico, os trechos A3/A4 e a projeção que distingue `supported` de aceite semântico. RA1-P identifica os 130 paths e reconcilia 59 backend + 71 research, com 80 implementações, 41 testes, sete locks, um gerado e um documento. A projeção de leitura mantém a diferença entre disposição de arquivo e execução comprovada. |
| **RE-A2** | **Encerrado.** | RA2-01–04 e RA2-P fornecem os manifests e campos antes ausentes: engines, runtimes, instalação, dependências, exceções de plataforma, features, finalidade e locks. A separação entre o TypeScript do indexador e o pack `oracle` está demonstrada por RA-S031/032/038/039. Os campos `hasInstallScript` de Modelina e Orval permanecem visíveis; RA-S050 mostra a instalação npm com `--ignore-scripts`. |
| **RE-A3** | **Encerrado para os pontos solicitados.** | RA-S047–050 sustentam reconhecimento de variável, espera de 60 segundos, ambiente preparado e limites do instalador. RA-S051 expõe a gramática fechada, caminhos, config e tratamento de YAML. RA-S052/053 acrescentam os checks de módulo/sum/staging, notices, exclusividade dos modos de conexão e leitura limitada da resposta CONNECT. |
| **RE-A4** | **Parcialmente encerrado; permanece o residual abaixo.** | RA-S054–057 sustentam caps, estados, descoberta, `.pyi`, Git, memo de planos, single-flight, escrita transacional, rename, leitura scoped e retenção. RA-S058 esclarece seleção de indexadores, fallback por toolchain e execução SCIP, mas a projeção omite a função intermediária entre as linhas 149 e 181. |
| **RE-A5** | **Encerrado.** | RA-S059–068 fornecem filtro, extração estrutural, exports/imports, conversão de posições SCIP, memo, enclosing, canonicalização, callers, adapters, resolução e PageRank. A evidência permite conservar os limites desses mecanismos, inclusive heurísticas e resolução restrita ao índice disponível. |

Esses encerramentos atendem às dúvidas de fidelidade, arquitetura e compreensão local abrangidas por **QS-1, QS-4, CC-1, CC-3, CC-7 e GO-A4**, nos respectivos pontos. Não constituem resultados novos de execução ou qualificação.

### Dois deltas de v2

**R7.2 — memo: `PASS` para a correção textual.**  
A redação “duas entradas no total, uma por path, validadas por mtime e tamanho” corresponde diretamente a RA-S061, linhas 81–109: chave por arquivo, validação por `mtimeMs`/`size`, reinserção para recência e evicção enquanto `memo.size > MEMO_LIMIT`. A alteração resolve a ambiguidade anterior sem ampliar a garantia do cache.

**R8.1 — shard retido: evidência ainda necessária para encerrar o delta.**  
RA-S057, linhas 177–195, sustenta que `retain` coloca o registro recebido à frente do manifesto. Isso, isoladamente, não demonstra a escolha feita por `query.ts` nem a atualização de ordem por `touch`. A nova redação fica vinculada ao residual de **RE-B1** abaixo.

### Evidência exata ainda necessária

#### RE-A4 — função intermediária de extração

- **Claim:** ordem entre conteúdo do commit, extração estrutural/fallback, execução SCIP e controle de mudança de HEAD, descrita em R6.
- **Fonte:** `packages/core/src/research-toolkit/code-index/extract.ts`, mesma identidade de RA-S058.
- **Trecho necessário:** **linhas 150–180**, ou a função completa caso seus limites ultrapassem esse intervalo.
- **Pergunta a resolver:** qual ramo efetivamente liga o plano ao conteúdo extraído, em que ordem aplica fallback e SCIP, e onde verifica a compatibilidade de HEAD com o commit solicitado?
- **Razão:** os trechos apresentados mostram `prepared`/`toolkit` até a linha 149 e `scip` a partir da 181. O teste `shard-not-at-head` do wrapper não substitui a demonstração desse encadeamento intermediário.

#### RE-B1 — seleção e ordem do shard retido, referente ao delta R8.1

- **Claim:** quando falta o shard atual, a consulta abre o primeiro retido de mesmo id ainda presente, na ordem do manifesto atualizada por `retain`/`touch`.
- **Fontes:** `packages/core/src/research-toolkit/code-index/query.ts` e `packages/core/src/research-toolkit/code-index/store.ts`.
- **Trechos necessários:** o bloco de `query.ts` que lê os registros, seleciona candidatos e verifica sua presença; e o **corpo de `touch`**, imediatamente após a linha 195 de `store.ts`, omitido antes da retomada na linha 203.
- **Pergunta a resolver:** a seleção percorre os candidatos nessa ordem e escolhe o primeiro disponível? Como `touch` altera essa ordem?
- **Evitar retransporte desnecessário:** se o bloco de seleção já foi transportado no lote anterior, basta indicar seu ID e intervalo literal exatos e fornecer somente o trecho ainda ausente.

### Estado preservado

A parcela de **RE-B7** referente ao inventário comum das 130 fontes está atendida por RA1-P; os pedidos de contratos decisivos de seat e testes permanecem abertos. Os demais pedidos de `research-b` e dos outros lotes, assim como **D-SUP-01**, não são alterados por este parecer.

**Não há novo `FIX-FIRST` demonstrado neste suplemento.** O resultado agregado permanece `REQUEST_EVIDENCE` pelos dois pontos delimitados acima.