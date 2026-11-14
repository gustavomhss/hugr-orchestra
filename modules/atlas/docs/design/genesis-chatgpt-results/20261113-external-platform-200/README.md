# Genesis — candidato documental Platform 200

Entrada para consultar o conhecimento estático de **200 caminhos exatos** de `gustavomhss/hugr-orchestra`, no baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`. O [manifesto L1](manifest.json) fixa a população; **21 corpos L2** explicam as fontes; [relações L3](bodies/relations.md), [ownership](bodies/ownership.md) e [manutenção L4](bodies/maintenance.md) orientam a leitura conjunta e as próximas decisões. As sínteses e os apoios delimitados não acrescentam primárias. O resultado permanece candidato documental para verificação pela coordenação.

## Comece pela pergunta

Escolha a necessidade, leia a síntese e abra as bases L2 indicadas. Dentro delas, `Pnnn` localiza a fonte no manifesto; blob, linhas e símbolos permitem acompanhar a evidência. Os links desta entrada são **rotas de consulta**. Consumo causal, contrato de formato, especificação estática de teste e reconciliação histórica são distinguidos em L3: um link não demonstra dependência de execução. No índice do pacote, `build_dependencies` registra os predecessores usados na construção documental; `navigation` registra destinos de consulta, em relação separada.

| Pergunta ou necessidade | Rota de leitura |
| --- | --- |
| Como localização, imports, exports e política de módulos se relacionam? | [L3 R1/R7](bodies/relations.md), depois [B-02](bodies/b-02.md), [B-03](bodies/b-03.md) e [A-05](bodies/a-05.md). |
| O que conecta lock, patches, cache e tarefas? | [L3 R2/R3](bodies/relations.md), com [B-01](bodies/b-01.md), [B-06](bodies/b-06.md), [B-07](bodies/b-07.md), [A-01](bodies/a-01.md) e [C-02](bodies/c-02.md). |
| Como os artefatos chegam à distribuição, e qual é o alcance de qualificação e proveniência? | [L3 R4–R6](bodies/relations.md); [A-02](bodies/a-02.md) e [A-03](bodies/a-03.md) para workflows; [A-04](bodies/a-04.md), [A-05](bodies/a-05.md) e [A-06](bodies/a-06.md) para contratos Nix. |
| Como interpretar planos de extração, cancelamentos e convergência? | [L3 R8](bodies/relations.md), seguido de [C-05](bodies/c-05.md), [C-06](bodies/c-06.md), [C-07](bodies/c-07.md) e [C-08](bodies/c-08.md), conservando a autoridade histórica. |
| O que distinguir entre inventário, recuperação, arquivo histórico e mirror? | [L3 R9](bodies/relations.md), com [B-03](bodies/b-03.md), [B-04](bodies/b-04.md) e [C-04](bodies/c-04.md). |
| Que objeto uma observação visual ou smoke realmente descreve? | [L3 R10](bodies/relations.md) e [C-01](bodies/c-01.md), separando fontes, build, modalidade de observação e superfície. |
| Que responsabilidade funcional ou autoridade precisa ser envolvida? | [Ownership: matriz de decisões e limites](bodies/ownership.md). Distingue autor documental, responsável funcional inferido, autoridade operacional não demonstrada e coordenação de integração. |
| O que reconsiderar quando a fonte ou seu consumidor mudar? | [Manutenção: M1–M8](bodies/maintenance.md). Separa renovação dos bytes, revisão do significado e eventual comprovação operacional em tarefa própria. |
| O candidato foi admitido por um consumidor Atlas? | [L3 R11](bodies/relations.md) e [manutenção M8](bodies/maintenance.md) explicam a fronteira; [handoff.json](handoff.json) registra o alcance da entrega. Este pacote não comprova admissão nem versão de input observada. |

## Catálogo dos 21 corpos L2

A contagem por corpo corresponde às suas seções primárias vinculadas ao manifesto, sem duplicação: **A — 54**, **B — 69**, **C — 77**, total **200**. As coberturas [A](coverage-a.json), [B](coverage-b.json) e [C](coverage-c.json) ligam cada entrada ao corpo e registram os métodos de leitura. O manifesto conserva path, Git blob, SHA-256, tamanho e lote.

| Corpo | Tema | Primárias |
| --- | --- | ---: |
| [A-01](bodies/a-01.md) | Preparação de CI e controles declarados | 11 |
| [A-02](bodies/a-02.md) | Artefatos nativos e contratos de integração | 12 |
| [A-03](bodies/a-03.md) | Distribuição, releases e gates | 6 |
| [A-04](bodies/a-04.md) | Contratos de distribuição e derivação Nix | 8 |
| [A-05](bodies/a-05.md) | Preparação determinística e identidade de dependências | 11 |
| [A-06](bodies/a-06.md) | Admissão de evidência e verificação das saídas Nix | 6 |
| [B-01](bodies/b-01.md) | Dependências, identidade de versão e artefatos tree-sitter | 8 |
| [B-02](bodies/b-02.md) | Arquitetura declarada e fronteiras de módulos | 6 |
| [B-03](bodies/b-03.md) | Inventários e transformação controlada de fontes | 12 |
| [B-04](bodies/b-04.md) | Distribuição, espelhamento e recuperação | 12 |
| [B-05](bodies/b-05.md) | Verificadores estreitos e contratos estáticos de tooling | 11 |
| [B-06](bodies/b-06.md) | Patches dos adaptadores de modelos | 7 |
| [B-07](bodies/b-07.md) | Patches de transporte, UI, runtime e empacotamento | 13 |
| [C-01](bodies/c-01.md) | Linguagem visual, auxiliares de inspeção e smoke da TUI | 12 |
| [C-02](bodies/c-02.md) | Configuração do repositório e orientação de manutenção | 26 |
| [C-03](bodies/c-03.md) | Contratos de produto, colaboração, contexto e histórico | 9 |
| [C-04](bodies/c-04.md) | Guias operacionais, recuperação histórica e saída do scaffold | 12 |
| [C-05](bodies/c-05.md) | Diagnóstico do monólito e plano de reestruturação | 2 |
| [C-06](bodies/c-06.md) | Propostas de scaffolding 70–80 e 80–90 | 2 |
| [C-07](bodies/c-07.md) | Consolidação do scaffold, briefs e convergência de produto | 8 |
| [C-08](bodies/c-08.md) | Corte 70-C′, portas de execução e inventários históricos | 6 |

A disposição também conserva os casos de leitura distintos: [P061, em C-02](bodies/c-02.md), é um blob vazio; [P072, em B-01](bodies/b-01.md), recebeu leitura estrutural completa do lockfile, sem equivaler à revisão semântica individual das dependências ou de seus tarballs. Captura e hash dos bytes não são, por si, conclusão semântica.

## Autoridade, limites e registros da entrega

Os [critérios congelados](criteria.md) e os [critérios integrados](layer-criteria.md) definem a barra documental. Código e configuração descrevem mecanismos estáticos no baseline; planos, guias e relatos conservam sua autoridade de intenção, orientação ou história; testes descrevem especificações. Uma referência a Omni, guardrails, Atlas ou implementação externa delimita uma interface e não transfere ownership nem amplia as 200 primárias. Índices históricos não comprovam disponibilidade atual de bundles.

Consulte o [índice nativo](native-package.json) para identidades, SHAs e vínculos do pacote; a [matriz de critérios](criteria-matrix.json) para o mapeamento; [work.md](work.md) para trabalho e limites; [review-summary.json](review-summary.json) para o alcance preciso das revisões efetivamente registradas; e [handoff.json](handoff.json) para a identidade e o alcance da entrega/publicação. Esses registros devem ser lidos em conjunto. Esta entrada não atribui aceite a si mesma nem antecipa decisão sobre metadados ou SHA de publicação.

O pacote não reivindica PASS global, execução de produto, testes ou CI, manutenção executada, integração de runtime nem consumidores comprovados. Identidade de transporte e aceite documental não substituem comprovação operacional ou admissão Atlas; essas fronteiras permanecem explícitas em L3/L4.
