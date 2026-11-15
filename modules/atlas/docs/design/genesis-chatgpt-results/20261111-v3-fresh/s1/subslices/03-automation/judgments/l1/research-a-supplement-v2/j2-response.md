## J2 — PASS semântico para `research-a` v2, R0–R7

**Candidato:** `producers/research/body.md`, **63.501 bytes**, SHA256 `d2def4b82495605b491e0d5494b1511e1b68c47dcffa84af87c8d35705468661`.  
**Base da revisão:** corpo v1 recebido, dois deltas exatos declarados e suplemento integral em quatro partes, com identidades e preservação dos demais bytes verificadas pela principal.

O suplemento resolve os cinco pedidos de evidência de `research-a`. **Não há correção obrigatória nem pedido de evidência remanescente para R0–R7 nesta versão.**

| Pedido / critérios pertinentes | Decisão | Localização e fundamento |
|---|---|---|
| **RE-A-01 — CC1, CC7, GO-A2/A4, GO-I1, QS1/QS6** | **Resolvido** | RA1, especialmente RA-S001 e RA-S041–045, permite reconciliar as 130 fontes, suas disposições e a relação com R0–R14. Os trechos históricos sustentam a diferença entre os quatro inputs anteriores, as folhas antes sem leitura decisiva e a produção atual. A projeção mecânica identifica população e profundidade sem se apresentar como julgamento de compreensão. |
| **RE-A-02 — CC3, QS1/QS4/QS5, GO-A5/A6** | **Resolvido** | RA2 identifica os 21 engines, cinco runtimes, cinco packs de research e sete locks com os campos relevantes ao corpo. A exceção dos componentes `inBundle` de Modelina permanece visível; scripts declarados no lock são distinguidos da instalação com `--ignore-scripts`. Versões, pins e floors são tratados como configuração capturada, sem promover esses dados a instalação ou qualificação de plataforma. |
| **RE-A-03 — CC3, QS1/QS4, GO-A6, GO-I7** | **Resolvido** | RA-S047–053 sustentam seleção por `BACKEND_TOOLKIT_BIN`, espera de 60 segundos, composição de PATH, ambiente do instalador, builds Go/Cargo e recusa de saída truncada. O guard OpenAPI mostra gramática fechada, resolução física e limite de metadata. O overlay Cassandra conserva os inputs pinados, transformação delimitada, notices, exclusão entre modos e tratamento limitado do CONNECT. |
| **RE-A-04 — GO-A1/A3, CC3, QS1/QS4/QS5, GO-I8** | **Resolvido** | RA-S054–058 completam caps, pack ausente, descoberta de projetos, órfãos, diferença de `.pyi`, falhas de Git, cache de planos, single-flight, transação SQLite e retenção. A execução SCIP continua descrita com seu cwd real no worktree e suas fronteiras de processo, sem inventar snapshot imutável ou recuperação distribuída. |
| **RE-A-05 — GO-A1/A6, CC3, QS1/QS2/QS3** | **Resolvido** | RA-S059–068 sustentam filtros, limites e parse parcial; associação de definições e referências; heurísticas de callers; resolução por linguagem; e PageRank. A distinção entre rank persistido e contagem de arquivos usada no planejamento fica apoiada. Os limites de cobertura e de precisão permanecem úteis para orientar consulta e manutenção. |

### Correções de precisão

A alteração em **R7** está sustentada por `scip.ts` 81–109: o memo possui **duas entradas no total**, uma por path, validadas por mtime e tamanho. A formulação v2 elimina a ambiguidade anterior sem ocultar a possibilidade de colisão desses metadados.

A alteração em **R8** também deixa de afirmar que o fallback escolhe necessariamente o shard cronologicamente mais novo. Registro esse delta no candidato v2; **ele não encerra, sozinho, a revisão de `research-b`**.

### Cobertura deste parecer

O PASS cobre a suficiência semântica de **R0–R7 da v2**. A parte de reconciliação populacional comum a **RE-B-06** está atendida por RA1; as demais evidências solicitadas para `research-b`, incluindo seus contratos e testes decisivos, continuam sob os pedidos correspondentes.

A limitação de transporte do lock Modelina de **266.885 bytes** permanece explícita para a etapa Atlas. Este parecer não a converte em transporte resolvido, binding de runtime, consumo executado ou encerramento das obrigações operacionais.