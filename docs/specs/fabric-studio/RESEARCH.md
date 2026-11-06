# Fabric Studio — discovery e pesquisa

## Estado

Pesquisa para o desenho, não implementação. Referência: 2026-11-04. Branch principal: `fabric-workbench`.
Baseline de inspeção do repositório: `9fcb899d50867c1ddc3f25d8345ac9fd8009d788`.

## Divisão do trabalho

| Pacote | Responsabilidade | Saída | Estado |
| --- | --- | --- | --- |
| R1 | Superfícies Fabric, APIs, identidades, maturidade e limites | Inventário com fontes oficiais e lacunas; complemento de famílias adjacentes e conflito Gen2 | Concluído para esta revisão |
| R2 | Jornadas, necessidades de interface, templates e pontos de integração no Orchestra | Matriz de jornadas e riscos; crítica do primeiro desenho | Concluído para esta revisão |
| Lead | Arquitetura, decisões, cruzamento das matrizes e desenho consolidado | `DESIGN.md`, `COVERAGE.md`, `TEMPLATES.md` e mapa para specs | Consolidado como proposta para revisão |

## Contrato de discovery

- Dois agentes independentes em worktrees próprios, no mesmo baseline; nenhum edita arquivos do lead.
- Pesquisa sem implementação, sem testes de produto, sem commits, sem push, sem PR e sem execução contra tenants.
- Relatórios persistidos em arquivos externos ao checkout; não depender apenas do contexto dos agentes.
- Mapa de conflitos: R1 e R2 não escrevem no mesmo arquivo. Não há dependência entre eles.
- Decisões de produto e arquitetura continuam com o lead; achados dos agentes são evidências a verificar.
- Critérios: cobertura de áreas nomeadas, fontes primárias, distinção entre documentação e verificação em ambiente real, limitações explícitas e contraexemplos à proposta.
- Mutation probes de implementação e gates de CI não se aplicam a esta tarefa de pesquisa. A verificação consiste em abrir as fontes e cruzar o inventário com o desenho.
- Relay: registrar os braços de acompanhamento se disponíveis; não alegar enforcement de SubagentStop sem comprovar o hook neste harness.

## Consolidação das fontes

Os relatórios dos dois agentes foram lidos pelo lead. Achados aceitos foram incorporados aos documentos do módulo, não usados como prova de implementação. Fontes críticas foram abertas novamente pelo lead. Não houve conexão ou experimento em tenant.

### Fontes críticas verificadas pelo lead

| Fonte | Escopo que sustenta | Efeito no desenho |
| --- | --- | --- |
| [Microsoft Fabric overview](https://learn.microsoft.com/en-us/fabric/fundamentals/microsoft-fabric-overview) | Plataforma unificada com múltiplos workloads e governança | Não vender “unificar Fabric” como novidade suficiente. |
| [Item management](https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/item-management-overview) | Matriz de suporte por tipo/operação | Catálogo preparado, mas disponibilidade por operação/contexto, não família inteira. |
| [Notebook public APIs](https://learn.microsoft.com/en-us/fabric/data-engineering/notebook-public-api) | Definições, execução, status/cancel e exit value | Não prometer automaticamente execução interativa/saída de toda célula. |
| [SQL analytics endpoint](https://learn.microsoft.com/en-us/fabric/data-engineering/lakehouse-sql-analytics-endpoint) | Leitura dos dados Delta sem DML por esse endpoint | Separar Lakehouse, SQL endpoint, Warehouse e engine de escrita. |
| [OneLake access](https://learn.microsoft.com/en-us/fabric/onelake/onelake-access-api) | Audience Storage e endpoints/residência | Autenticação por superfície e perfil de rede/região. |
| [Power BI RLS](https://learn.microsoft.com/en-us/fabric/security/service-admin-row-level-security) | Viewer versus papéis de editor e limites de teste/identidade | Sem cache cross-identity e sem usar admin como prova de segurança do leitor. |
| [Metadata scanning](https://learn.microsoft.com/en-us/fabric/governance/metadata-scanning-overview) | Scanning com configuração/autoridade próprias | Não exigir admin escondido nem prometer lineage completo ao usuário comum. |
| [Fabric IQ MCP](https://learn.microsoft.com/en-us/fabric/iq/connectors/fabric-iq-mcp) | Consumo read-only, sem Build obrigatório nessa rota, limites por conteúdo/região | Não transferir requisitos de REST DAX para toda rota de consulta. |
| [MCP overview](https://learn.microsoft.com/en-us/rest/api/fabric/articles/mcp-servers/what-is-fabric-mcp-server) | MCPs Core/local/IQ com papéis diferentes | Transporte conhecido não é autoridade nem integração universal. |
| [Skills for Fabric](https://learn.microsoft.com/en-us/fabric/fundamentals/skills-for-fabric-overview) | Instruções reutilizáveis e agentes existentes | Reusar conhecimento, sem tratar skills como backend implementado. |
| [Copilot overview](https://learn.microsoft.com/en-us/fabric/fundamentals/copilot-fabric-overview) | Assistência nativa, contexto e consumo de capacidade | Não usar a premissa de ausência de IA/memória no concorrente. |
| [Project Osmos](https://learn.microsoft.com/en-us/fabric/data-engineering/data-engineering-agent-overview) | Tarefas persistentes com planejamento, execução e validação, em preview | Diferenciação por experiência/controle, não alegação de ter inventado agentes de resultado. |
| [Lifecycle troubleshooting](https://learn.microsoft.com/en-us/fabric/cicd/troubleshoot-cicd) | Partial deployment sem rollback automático | Recuperação por operação; nada de “desfazer todo o Fabric”. |
| [Lifecycle best practices](https://learn.microsoft.com/en-us/fabric/cicd/best-practices-cicd) | Permissões/configurações e publicação além da cópia de conteúdo | Ambiente de destino e validação de consumidor são parte da mudança. |
| [Dataflow public APIs](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-public-apis) | Limitações explícitas, inclusive texto sobre Run sem sucesso | Fonte em conflito com rotas mais recentes, não afirmação de falha universal. |
| [Dataflow CI/CD](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-cicd-and-git-integration) | Publicação just-in-time, com limitações textuais ainda conflitantes | Pin de rota/geração e necessidade de qualificação. |
| [Dataflow Execute](https://learn.microsoft.com/en-us/rest/api/fabric/dataflow/background-jobs/run-on-demand-execute) | Operação com requisitos próprios e sem SP/MI no contrato consultado | Não prometer unattended SP por suporte genérico do item. |

As outras fontes do inventário foram levantadas pelo agente R1 e estão citadas ao lado de cada família em [COVERAGE.md](./COVERAGE.md). Elas servem como mapa de pesquisa para a spec da operação; detalhe não revalidado em endpoint/tenant continua não qualificado. Anúncio de GA encontrado apenas em índice de busca não foi convertido em claim de suporte de lançamento no desenho.

### Encaixe no Orchestra conferido em código

- Chapter routing e providers: `packages/app-shell/src/orchestra/chapter-route.tsx`.
- Contrato visual: `packages/app-shell/src/orchestra/DESIGN.md`.
- Padrão de chapter complexo: `packages/app-shell/src/orchestra/chapters/atlas/atlas.tsx`.
- Fluxo de integração UI: `packages/app-shell/src/orchestra/chapters/integrations-contract.ts`.
- Contratos compartilhados: `packages/schema/src/capability.ts` e `capability-setup.ts`.
- OAuth/credenciais: `packages/core/src/integration.ts`, `credential.ts`, `credential/cipher.ts`.
- Operador: `packages/core/src/capability/operator/contract.ts` e handler de conexões.
- Invocação de agente/política: `packages/core/src/capability/policy.ts`.
- Jobs: `packages/core/src/capability/job/index.ts` — metadata/observations, não polling remoto pronto.
- Actions: `packages/core/src/actions.ts` — readers GitHub/GitLab, não engine Fabric genérico.
- Placement sem Git: `packages/core/src/project.ts` — fallback `Project.ID.global`, exigindo isolamento adicional no desenho.

## Cobertura e lacunas

O mapa [COVERAGE.md](./COVERAGE.md) trata explicitamente plataforma/controle; storage/Delta; SQL; Spark; ingestão/replicação; BI; real-time; ML; IQ/grafo; governança; acesso; admin/capacidade; lifecycle; agentes; APIs/funções; orquestração adjacente e extensões. A meta não é enumerar todo endpoint num documento de produto, mas impedir que uma área desapareça sem decisão.

Lacunas que impedem promessas operacionais:

- Consentimento/app registration Microsoft e ambientes reais de qualificação ainda não foram definidos.
- Catálogo de suporte precisa ser por operação, identidade e geração, não por workload.
- Definições/notebooks não garantem logs ou saídas completas.
- Dataflow Gen2 tem conflito documental por rota/geração; autoria de destino precisa de prova específica.
- Lineage e acesso efetivo podem ser parciais; um usuário comum não ganha visibilidade de admin.
- Formatos de modelo, embedding, report generation e runtime de itens adjacentes precisam de qualificação própria.
- Sem transação/rollback global ou proteção de concorrência forte onde o endpoint não oferece.
- Cache/modelo/exportação exigem política de dados, e não herdam a proteção do storage de credenciais.
- Sem Git, o isolamento não pode depender só do `Project.ID.global`.
- A política atual de ferramentas exige invocação de agente real; a UI manual não pode fabricar uma para aproveitar o caminho existente.

As personas e jornadas do discovery são hipóteses informadas, não pesquisa de campo. O catálogo de templates é proposto, não testado com usuários.

## Conclusões do lead

### Correções feitas após a crítica R2

1. Portas de binding tipadas, cardinalidade/nulabilidade, projeções registradas e exemplos rejeitados.
2. Propriedade explícita de preferências duráveis versus seleção efêmera; pin de componente distinto de pin de recurso; lock/veto/undo.
3. Separação entre proponente, iniciador, aprovador e identidade executora; proibição de reroute de negação de agente para operador.
4. Jornada sem repositório Git e registro do fallback global observado no código.
5. Fechar painel, sair do app, perder backend e fechar aba web com consequências diferentes; observabilidade condicionada a API/retention/autorização.
6. Ativação de query separada de mount, seleção e bindings; custo recorrente visível.
7. Divulgação progressiva, usuário iniciante de leitura e profissional com IA desligada incluídos na aceitação.
8. Inventário amplo e templates com capacidades/permissões/evidência/indisponibilidade, em arquivos próprios.

### Julgamento de produto

A direção é coerente: **backend Fabric preparado + frontend composto por declaração + templates úteis + continuidade verificável do trabalho**. Flexibilidade não vem de gerar código arbitrário; vem de conectar ferramentas reais sobre contexto autorizado.

Não há evidência ainda de demanda comercial, ganho de tempo ou confiança suficiente para operação. A prova precisa usar tarefas reais de profissionais e resultado verificado fora da narrativa da IA.

### Alcance da verificação

Esta etapa produziu documentação e mocks anteriores; não alterou o runtime Fabric/Orchestra nem executou jobs Microsoft. Os agentes não fizeram commits/push/PR e não tocaram nos arquivos do lead. Artefatos brutos de pesquisa foram persistidos fora dos checkouts durante a sessão; os achados aceitos estão preservados nos documentos deste diretório. Não foi alegado enforcement de Relay sem hook comprovado.

Revisão do lead é consolidação de desenho e conferência de fontes, não aprovação independente de PR de código. Specs e implementação ainda exigem seus próprios critérios/gates.
