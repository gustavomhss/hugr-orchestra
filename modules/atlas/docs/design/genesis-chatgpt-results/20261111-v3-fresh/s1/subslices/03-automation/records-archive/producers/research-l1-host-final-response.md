# RESEARCH-L1 produzido para revisão

Entreguei o L1 completo de `s1.core.research` no baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`, com fontes exatas, cobertura por path e evidência literal. O estado é **PRODUCED_NOT_JUDGED**: este produtor não emitiu PASS, não consumiu oracle e não assumiu papel de juiz.

## Entrega

Todos os arquivos estão em `/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/research/`.

| Arquivo | Conteúdo |
| --- | --- |
| [body.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/research/body.md) | Corpo integral de L1, 63.389 bytes, com propósito, contratos, comportamento, falhas, limites e orientação de impacto. |
| [captures.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/research/captures.json) e `sources/` | 130 fontes UTF-8 capturadas pelo conector GitHub, com commit, blob Git, SHA-256 e tamanho. |
| [coverage.jsonl](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/research/coverage.jsonl) | Uma linha por fonte, incluindo profundidade, papel, necessidade, artefato, razão e vínculos de evidência. |
| [evidence-review.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/research/evidence-review.md) | Projeção de 89.675 bytes: 34 grupos, 1.112 linhas literais de 32 fontes, centradas nas decisões de contrato. |
| [evidence.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/research/evidence.md) | Arquivo integral de evidência: 599.806 bytes, 46 grupos e 8.693 linhas literais verificadas. |
| [evidence-index.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/research/evidence-index.json) | Índice de paths/intervalos e linhas do archive para pedidos REQUEST_EVIDENCE sem ferramentas do juiz. |
| [recipe.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/research/recipe.json) | Inputs, pins, critérios públicos, procedimento, escopo, limites, seleção de evidência e integridade dos outputs. |
| [request.txt](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/research/request.txt) | Pedido original preservado integralmente. |
| [history/body-initial.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/research/history/body-initial.md) | Versão inicial integral preservada antes da correção pontual documentada na receita. |

## Cobertura e achados

A população está reconciliada: **59 fontes backend-toolkit + 71 research = 130**, totalizando **1.212.271 bytes**. Há 80 implementações, 41 contratos de teste, sete locks, um gerado e um README. As implementações receberam leitura de fluxo ou de receita/constraints; os testes foram lidos como contratos, sem execução. Não há fonte ausente, substituída ou sem disposição.

O corpo conserva as fronteiras decisivas:

- Manifestos e pins descrevem aquisição; readiness depende de executável, runtime, dependências e shim, e não qualifica execução ou plataforma.
- Adapter default vazio, prewarm detached e persistência best effort não certificam índice construído.
- Shards stale, overlay dirty limitado e persistência de `opaque: false` impedem transformar ausência de hits em prova de ausência de uso.
- Probe produz resultado; cobrança, retenção e admissão dependem das portas nativas pertinentes.
- Custódia de bytes não equivale a SourceAdmitted. Binding, receipt, digest, representation, locator e revisão continuam distintos.
- Publicação incerta preserva causalidade e impede retry live oculto.

Na seleção literal corrigi uma afirmação do corpo inicial: o dialer CONNECT permite userinfo convertido em Basic e path vazio ou `/`; recusa query/fragment e exige proxy loopback/porta canônica. A versão anterior e a identidade da correção foram preservadas. Nenhum código de produto foi alterado.

## Integridade e limites

Os **130 blobs Git e SHA-256** foram recalculados e conferidos contra os inputs; os 130 paths da cobertura correspondem exatamente à população. Linhas e hashes dos excertos foram conferidos contra os bytes capturados. Isso é verificação mecânica do pacote, não execução de produto nem suficiência semântica.

| Artefato | SHA-256 |
| --- | --- |
| body.md | `1213f85cf16f73feed220e8c1b33ed52b2af75afd570b154a29eaf8f99f27d73` |
| coverage.jsonl | `bb06bcef77a2dbeccabc70dd00dc10d70bf22cb338588661d7ecc9f49e01eec9` |
| evidence-review.md | `3496f3e102e5db734d2954cf18e9bea6da5fbc418d2084f56814eefb5347788e` |
| evidence.md | `e8cc0b447e48f26b3a059dc70c7ad7e607ec9b60a9af3d605e76f4c10b1da05b` |

**Bloqueio concreto preservado:** `modelina.package-lock.json` possui 266.885 bytes. A principal informou limite Atlas de 256.000 bytes no release S4 r3; o lock permanece integral e obrigatório, sem split, resumo ou substituição por hash.

**Faltas no lote de fontes/cobertura L1:** nenhuma. Permanecem separados o aceite independente, a qualificação de runtime/plataforma, importação/publicação/consumo Atlas e L2–L4. Não executei testes locais, installs, chamadas pagas externas, escritas remotas ou operações Atlas. Uso/custo de modelo não exposto permanece UNKNOWN.
