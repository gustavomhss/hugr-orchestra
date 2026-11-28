## PASS — WP-L1B e correção de metadados v2

**Juiz persistente:** `parallel-v3-fresh/S4/J1`  
**Execução:** `a2095d5a-1464-4c38-a222-6376974fc9c9`

Concedo **PASS semântico às quatro unidades L1B e à correção de seleção de fontes e observação descrita pelos metadados v2**, no escopo de evidência estática apresentado. Não identifiquei defeito obrigatório nos corpos recebidos ou na correção descrita.

O julgamento considera os quatro corpos integrais, a reposição de `coverage-governance.md`, os trechos de fonte, o plano integral de observação e os recibos fornecidos. As medições de bytes, hashes e correspondência de caminhos foram realizadas pelo principal e pelo courier; não alego tê-las reexecutado.

### Identidade exata da decisão

| Unidade | Bytes UTF-8 informados e reconferidos | SHA-256 do corpo | Decisão |
|---|---:|---|---|
| `S4:L1:atlas-engine` | 17.987 | `c0d39faabe422adcfb5a6b4e67b0d105931d90661b695fbcaa7571187b4f103e` | PASS |
| `S4:L1:atlas-host-genesis` | 17.595 | `97b3adc25e1a8754ebdbab0b27040403893e90d410df08a5c8f90520e3a0156d` | PASS |
| `S4:L1:continuity-rag` | 17.429 | `2a286b2570b9967c1e78ee14b671f333957a6a54c97427dc24feaec7ccab5b38` | PASS |
| `S4:L1:coverage-governance` | 17.988 | `201b5cc97ba7ae5b1148b98377a174ba3d00c8f4d9d521b4fadc6c1d69a03381` | PASS |

Todos estão dentro do limite de **18.000 bytes por corpo**.

| Identificador do pacote | Valor |
|---|---|
| Fonte | `1cde2ff7a71bcf7aecb5d030917b577165135d38` |
| Protocolo | `ee2521a5b966bd505cc95bd1c733e09e12f33531` |
| Manifest de transporte | `5055ed46acc3bb5c5a6f605ed902ee6524adca095795f0f6c5af33c456f20d44` |
| `artifacts-v2.json` | `6a1e451387b25dfec778f326bbdcd61fbbc95e90e819cfba7ce70da43493a058` |
| Oracle L1B | `94f980004f3ca5f88b59d24578848a6c84cc51faafa75c343b0c9451c5d5e15d` |

L1A permanece cobertura anterior, com seu corpo inalterado. Seu PASS não foi transferido para os novos corpos nem usado como substituto deste julgamento.

## Critérios obrigatórios

| Critério | Decisão | Evidência localizada | Motivo |
|---|---|---|---|
| **AC-01** | PASS | `coverage-governance.md`, “Population is complete”; `coverage-summary.md`; verificação independente do principal | A população fixada permanece com **2.220 caminhos únicos**, com classificação, origem e profundidade explícitas. A conta integral não é apresentada como compreensão semântica integral. |
| **QS-1** | PASS | Corpos integrais e respectivos trechos; especialmente canonicalização, provenance, ownership read/access, RAG search/ask/proof e workflow | As distinções materiais estão preservadas: identidade versus metadados laterais, modelo de referência versus caminho utilizado pelo host, histórico versus atual, candidato versus publicação e diagnóstico versus resposta de modelo. |
| **QS-2** | PASS | Tabelas e seções de manutenção de engine/host; ciclos de Continuity/RAG; rotas de geradores e automação | Os textos permitem localizar o ponto de mudança e compreender seu efeito. Exemplos concretos incluem a divergência entre chaves de trace de `ask` e proof, o carregamento interno de corpos pelo índice e os limites do classificador de provenance. |
| **CC-1** | PASS | Distribuição dos quatro corpos; plano “Per-group correspondence” | A seleção tem finalidade e origem justificadas para os **41 grupos semânticos**. Componentes, contratos, testes, fixtures, gerados, instruções e história recebem tratamentos distintos e pertinentes. |
| **CC-3** | PASS | Seções de propósito, contratos, impacto e manutenção dos quatro corpos | O conteúdo relaciona mecanismo e consequência. Não se limita a inventariar símbolos: explica efeitos sobre identidade, revisão, recuperação, manutenção, admissibilidade e leitura. |
| **CC-7** | PASS | Limites semânticos ao final de cada corpo; reconciliações documentais e históricas; plano v2 | O conjunto mantém visíveis a profundidade efetiva, as relações entre unidades e as lacunas. Não transforma preservação por origem, presença de um teste ou existência de uma interface em prova de comportamento completo. |
| **GO-I2** | PASS | Marcadores observado/intendido/inferido; README versus archive; documentação RAG obsoleta; referência versus host | Divergências relevantes permanecem explícitas. O texto não harmoniza artificialmente documentação, implementação e história. |
| **GO-I5** | PASS | Limites do observer; oito caminhos preservados; falhas de recall e provenance; plano v2 | Ausência comprovada, indisponibilidade e projeções que perdem essa distinção não são confundidas. Os caminhos recusados continuam na população; o snapshot não os declara observados. |
| **GO-I7** | PASS | Policy, ratificação, provenance/re-proof, carrier publicado, ferramentas de recall e fontes históricas | Texto importado, nomes nominais de atores, staging, recibos antigos e dados de UI não recebem autoridade nova. A semântica não substitui os controles do host. |
| **GO-I8** | PASS | Separação entre census e semântica; ressalvas sobre testes, gerados, schemas e recibos | Hashes e estrutura sustentam identidade e contabilização. O mérito semântico está nas explicações e distinções verificáveis; nenhum desses mecanismos é usado isoladamente como prova de suficiência. |

Também não identifiquei conflito material com **QS-3, QS-5 e GO-I3**, declarados na receita v2: a correção mantém o mecanismo limitado, as alegações de execução são honestas e as revisões de origem continuam explícitas.

## Respostas aos sete casos do oracle

| Caso | Decisão | Evidência e conclusão |
|---|---|---|
| **1. População completa, sem exclusões por categoria** | PASS | A verificação do principal preserva a distribuição fixada: **1.889 Atlas + 17 Continuity + 34 RAG + 93 script + 15 docs + 162 specs + 3 `.atlas` + 4 workflows + 3 `.orchestra` = 2.220**. A distribuição editorial por grupos não altera essa população. Fixtures, gerados e história permanecem classificados, com profundidade justificada. |
| **2. Admissão RAG, permissões e pipeline** | PASS | `continuity-rag.md`, “Admission and identity” e “Revision and retrieval semantics”, preserva a recusa de caminhos do projeto, o callback de autorização fora de Location, `lexical: true`, `embedding: false` e a participação de K na configuração e revisão do pipeline. Obrigações de realpath, symlinks e enforcement do adaptador ficam explícitas. |
| **3. Re-admissão não equivale a retrieval/citação** | PASS | O corpo distingue estabilidade de ID/status para conteúdo igual, manutenção do ID com retorno a `not_yet_read` para conteúdo alterado, leitura e provas. Os trechos de `search.ts`, `ask.ts`, `proof.ts`, `trace.ts` e o teste com traces inseridos manualmente sustentam a limitação de ligação pública descrita. Nenhuma resposta de modelo é alegada. |
| **4. Continuity e recuperação** | PASS | O contrato descrito preserva arquivamento antes da máscara, exigência de `context_recall`, exclusões de ferramentas protegidas, janela normal de cinco passos e descarte de resumo stale. Os defaults **0,4 / 0,7 / 3** são tratados como valores do código, sem atribuição ao usuário. |
| **5. Semântica, policy e provenance** | PASS | `atlas-host-genesis.md` conserva staging como não confiável, exige re-proof no caminho provable e explicita que falha de Git pode resultar em `trusted`. Os trechos de `store-provenance.ts`, policy e ownership access sustentam essas distinções. Não há fallback autorizado para Markdown ou CAS bruto. |
| **6. Gerados, mocks e recibos antigos** | PASS | A rota de geração dos bundles boundary está identificada. Os mocks de UI permanecem design/simulação com dados de origem histórica. Recibos anteriores não são reclassificados como votos novos. Paridade e atualidade dos gerados não são presumidas. |
| **7. Genesis legado e execução** | PASS | Mining/staging, checkpoint, julgamento amostrado e patch de publicação são descritos em seus contratos específicos. Configuração do operador, portas governadas e limites de integração permanecem separados. Schemas e testes não são apresentados como execução desta produção. |

## Decisão sobre metadata-v2

**PASS para a correção de correspondência entre alegações, fontes semânticas e inputs declarados**, vinculada a `artifacts-v2.json` de SHA-256 `6a1e451387b25dfec778f326bbdcd61fbbc95e90e819cfba7ce70da43493a058`.

A correção resolve o problema de v1 sem apagar a evidência anterior:

- **Seleção semântica e população têm funções diferentes.** Os inputs passam a acompanhar fontes que sustentam alegações concretas e os registros compactos da produção. A população integral continua preservada em `coverage.json`.
- **A correspondência de caminhos é explícita.** Cada `source_refs.path` conserva seu `file:<mesmo caminho>`, com a origem B ou P declarada. O plano reconhece a materialização de múltiplas revisões e não a apresenta como um único checkout Git.
- **Os limites deixam de ser tratados como inputs presentes.** Os inputs declarados ficam abaixo de 256.000 bytes, com máximo informado e reconferido de **177.641 bytes**. Os oito caminhos de origem recusada ou oversized continuam contabilizados.
- **O snapshot tem uma identidade própria e uma função histórica limitada.** Ele sustenta o census, classificações, tamanhos e contagens de envelopes capturados. Não fornece versões runtime dos originais, atualidade de `.atlas`, identidade autenticada de autores ou paridade dos gerados.
- **A revisão não é herdada de v1.** O plano exige nova avaliação da correspondência alterada, conserva os quatro corpos e os arquivos anteriores e registra separadamente a correção.

As quantidades declaradas são coerentes com essa separação:

| Unidade | Fontes selecionadas | Inputs declarados |
|---|---:|---:|
| Engine | 50 | 59 |
| Host/Genesis | 45 | 54 |
| Continuity/RAG | 62 | 71 |
| Coverage/Governance | 32 | 41 |

A validade aceita continua sendo a de **evidência estática limitada às fontes, origens e alegações descritas**. O snapshot não amplia essa validade para a atualidade de toda a população.

## Findings obrigatórios

**Nenhum identificado neste pacote fechado.** Não há correção obrigatória de corpo ou de seleção v2 a prescrever neste julgamento.

## Sugestões opcionais

Nenhuma necessária para o aceite.

**Limite da decisão:** este parecer conclui somente a revisão semântica estática de WP-L1B e da correção v2 apresentada. As provas de execução permanecem obrigações separadas. O material de WP-R0 recebido durante este turno não integra esta decisão.