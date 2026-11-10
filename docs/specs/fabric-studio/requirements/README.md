# Fabric Studio — requirements

## Estado e limites da etapa

**Baseline de requirements proposta para revisão. Não aprovada pelo proprietário, não implementada e não testada.**

Decomposição documental concluída nesta rodada: **200 requisitos** em oito áreas, com obrigação, aceitação, contraprova e origem. São 195 cenários mecânicos futuros e cinco julgamentos humanos. A crítica de cobertura encerrou com duas avaliações independentes sem nova lacuna na versão final; registro completo em [CRITIC.md](./CRITIC.md). Depois disso, o proprietário delegou as decisões ao TechLead: as treze direções Q foram escolhidas em [DECISIONS.md](./DECISIONS.md), sem declarar resolvida sua qualificação operacional. Julgamentos humanos e cenários de produto continuam não executados.

Direção de trabalho: **desenho → requirements → specs → implementação**. Este corpus define obrigações e resultados verificáveis. Não congela endpoints, tabelas, interfaces de código, organização de pacotes ou work packages.

Após autorização do proprietário, começou a [etapa de specs](../specs/README.md). Os critérios canônicos deste diretório não foram reescritos para acomodá-la; contratos propostos e gates de freeze são registrados lá.

O TechLead mantém o julgamento da decomposição. A crítica independente procura demandas sem aceitação correspondente; não escolhe arquitetura ou reduz escopo por conveniência.

Os documentos do desenho e da cold review anteriores são preservados. As correções da review são incorporadas explicitamente aos requisitos, sem reescrever a entrada congelada como se os problemas nunca tivessem existido.

## Hierarquia: desenho, requirements, specs e implementação

| Artefato | Pergunta que responde | O que não significa |
| --- | --- | --- |
| [Desenho](../DESIGN.md) | Qual produto e qual direção arquitetural queremos? | Contrato técnico já congelado. |
| Requirements deste diretório | O que deve ser verdade e como reconheceremos isso? | Produto implementado ou disponibilidade garantida de APIs. |
| Specs futuras | Como os requisitos serão realizados, com quais contratos e limites? | Autorização para ignorar pendências de requisito. |
| Implementação e qualificação | A solução funciona e satisfaz os critérios no escopo declarado? | Que uma fixture ou um mock comprova comportamento de tenant real. |

A lista S01–S14 no desenho é apenas um mapa antecipado de assuntos. Nesta etapa ela não substitui o catálogo de requisitos nem autoriza a criação das specs.

## Como ler o catálogo

| Documento canônico | Responsabilidade |
| --- | --- |
| [01-experience.md](./01-experience.md) | Entrada, espaços declarativos, composição visual e templates. |
| [02-authority-and-data.md](./02-authority-and-data.md) | Identidade, autoridade, credenciais, privacidade e conteúdo não confiável. |
| [03-discovery-and-queries.md](./03-discovery-and-queries.md) | Descoberta, referências, dependências, consultas, resultados e consumo. |
| [04-changes-and-jobs.md](./04-changes-and-jobs.md) | Mudanças, aprovação, submissão, jobs, falhas e recuperação. |
| [05-evidence-and-continuity.md](./05-evidence-and-continuity.md) | Validação, evidências, persistência, exclusão e compartilhamento. |
| [06-ai-and-operation.md](./06-ai-and-operation.md) | IA, integração Orchestra, operação, compatibilidade e qualificação. |
| [07-fabric-semantics.md](./07-fabric-semantics.md) | Limites de semântica dos workloads que a abstração não pode apagar. |
| [08-end-to-end.md](./08-end-to-end.md) | Aceitação de jornadas completas, sem satisfação por telas vazias. |

Requisitos têm IDs estáveis `FS-<domínio>-NNN`. Cada linha é a unidade canônica de obrigação **e** aceitação; não há uma suite textual paralela com critérios diferentes. As futuras specs e testes referenciarão esses mesmos IDs.

- **M:** cenário mecanicamente verificável quando houver implementação; hoje não executado.
- **H:** julgamento humano explícito, com rubrica indicada; nunca autoaprovado por testes ou por narrativa da IA.
- Toda linha é **proposta**, mesmo quando deriva de uma direção de produto firmada. Direção aprovada não equivale a aprovação de cada detalhamento.
- `D:` referencia IDs/seções de `../DESIGN.md`; `F:` famílias de `../COVERAGE.md`; `T:` templates de `../TEMPLATES.md`; `R:` achados de `../REVIEW.md`.
- Referência Q identifica a decisão e as condições de validação pertinentes em DECISIONS.md. As direções antes abertas foram escolhidas por delegação; contratos/evidências ainda não demonstrados continuam bloqueando o congelamento ou a ativação correspondentes.

Condições como “para operação suportada” não autorizam satisfação vacuosa: as jornadas E2E e a biblioteca mínima exigem capacidades reais. Handoff/indisponibilidade podem satisfazer uma obrigação de transparência, nunca uma obrigação de executar ou concluir uma tarefa.

## Critérios de aceitação e evidências

Cada requisito contém uma aceitação concreta e uma contraprova: situação que deve falhar, bloquear ou manter um estado honesto em vez de produzir falso sucesso. Uma mesma obrigação pode exigir vários casos de teste depois; eles mantêm o ID do requisito e não reduzem seu alcance.

Nesta fase, o estado de todos os cenários é **não executado**. Não foi criada suite executável, capturado baseline vermelho ou alegado green. Isso pertence à etapa de implementação, pelos runners/CI do repositório. A verificação documental de links/IDs não demonstra comportamento de produto.

Fixtures demonstram contrato de forma limitada; qualificação de integração exige ambiente Microsoft autorizado. Evidência de API, de job e de negócio são diferentes. Julgamentos H exigem revisão humana registrada e não viram sucesso automático.

## Cobertura e rastreabilidade

[TRACEABILITY.md](./TRACEABILITY.md) liga direções P, invariantes I, jornadas J, critérios A, famílias F, templates T e achados da review aos requisitos. É um índice derivado de referências, não uma segunda definição de aceitação.

As omissões FAB-01/FAB-02 entram como obrigações nomeadas para distribuição Power BI/apps/audiences e Industry Solutions. RT-01/RT-02 entram como identidade/deduplicação de comando e retenção/proveniência do trabalho. Isso não implica que as correções já estejam implementadas ou requalificadas.

## Decisões delegadas e validação pendente

[DECISIONS.md](./DECISIONS.md) registra autoridade delegada, decisões Q01–Q13, justificativas, requisitos afetados e bloqueios remanescentes. O TechLead decidiu a política de dados/retenção, os seeds limitados de ensaio e o recorte inicial; não alegou SLA medido, consentimento Entra ou operação Fabric já qualificada.

Não converter validação pendente em dispensa. A delegação autoriza julgamento de produto/arquitetura pelo TechLead, não waiver dos requisitos nem ação remota. Priorização e recorte de lançamento não são decididos por um agente que implementa uma fatia.

## Revisão independente

[CRITIC.md](./CRITIC.md) registra rodadas frias de crítica de cobertura, achados, decisão do lead e revisões. O critério do protocolo é chegar a duas rodadas consecutivas sem nova lacuna substanciada; isso é crítica documental, não prova de funcionamento nem garantia absoluta de completude.

Não há dispatch de implementação ou contratos compartilhados congelados nesta etapa.
