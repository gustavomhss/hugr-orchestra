# Fabric Studio — mapa de cobertura Microsoft Fabric

**Referência de pesquisa: 2026-11-04. Estado do Studio: desenho, sem qualificação em tenant.**

Este mapa impede omissões silenciosas. Não é uma lista de endpoints já implementados nem uma promessa de “100% de Fabric”. Recursos e APIs evoluem; a spec de catálogo manterá versões, fontes e evidências por operação.

## Como interpretar cobertura

Para cada família, o Studio precisa dar uma resposta explícita: ferramenta operacional qualificada; leitura parcial útil; handoff para ferramenta oficial; ou indisponibilidade nomeada. Um tipo desconhecido pode aparecer no inventário como metadado seguro, mas não recebe editor mutante nem execução genérica.

Quatro dimensões independentes:

1. **Desenho:** sabemos qual trabalho e quais ferramentas a área requer.
2. **Plataforma:** há contrato Microsoft documentado para a operação exata.
3. **Implementação:** o adaptador/componentes existem e foram verificados.
4. **Contexto atual:** identidade, permissões, versão, capacidade, região e rede permitem usá-los.

Esta entrega trata a primeira e pesquisa a segunda. Não declara as demais prontas.

## Matriz de famílias

Templates citados estão em [TEMPLATES.md](./TEMPLATES.md). Operações abaixo são objetivos de integração, não grants.

| ID / família | Trabalhos que o desenho considera | Superfície candidata e cautela central | Templates e disposição |
| --- | --- | --- | --- |
| F01 · Tenant, workspaces, itens e pastas | Descobrir, buscar, organizar, criar/editar recursos e revisar papéis | Fabric Core REST/MCP; operação e item têm suporte próprio. Lista acessível não é inventário completo do tenant. Pastas de itens não são diretórios de dados. [Itens](https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/item-management-overview) | T01–T02, T17–T20. Base de contexto para todas as áreas. |
| F02 · OneLake, arquivos e shortcuts | Navegar, ler/escrever arquivos suportados, configurar atalhos e referências externas | APIs compatíveis ADLS/Blob + REST de shortcuts; token Storage, endpoint regional e limites de paridade. Não tratar diretórios gerenciados como pasta arbitrária. [Acesso](https://learn.microsoft.com/en-us/fabric/onelake/onelake-access-api), [paridade](https://learn.microsoft.com/en-us/fabric/onelake/onelake-api-parity) | T01–T04, T11, T18. Operações de arquivo/shortcut com efeitos e permissões distintos. |
| F03 · Lakehouse, Delta e manutenção | Inspecionar tabelas/histórico; transformar; carregar; otimizar e administrar retenção | Lakehouse REST, Spark/Delta e jobs de manutenção. VACUUM pode remover capacidade de recuperação; não é manutenção inofensiva. [Lakehouse API](https://learn.microsoft.com/en-us/fabric/data-engineering/lakehouse-api) | T03–T05, T11, T15. Separar inspeção, escrita de dados e manutenção. |
| F04 · SQL analytics endpoint | Consultar Delta e trabalhar com objetos SQL suportados | Endpoint lê dados, não permite DML de dados Lakehouse. Sincronização/freshness precisa ser observada. [Endpoint](https://learn.microsoft.com/en-us/fabric/data-engineering/lakehouse-sql-analytics-endpoint) | T03, T06, T11–T14. Não oferecer INSERT/UPDATE/DELETE de Lakehouse nessa rota. |
| F05 · Warehouse | Consultar, carregar, transformar e alterar schema/objetos | T-SQL/TDS e lifecycle REST; superfície SQL difere de SQL Server e de SQL Database. [T-SQL](https://learn.microsoft.com/en-us/fabric/data-warehouse/tsql-surface-area) | T03, T06, T11–T16, T20. Contrato de SQL e concorrência por operação. |
| F06 · SQL database | Dados operacionais, schema e representação analítica | Engine transacional e endpoint analítico separado, com auth/freshness próprios. [Visão geral](https://learn.microsoft.com/en-us/fabric/database/sql/overview) | T03, T06, T11–T12. Não usar a réplica analítica como rota de escrita operacional. |
| F07 · Cosmos DB em Fabric | Inspecionar e consultar documentos; operar recursos suportados | REST de item e SDK/runtime Cosmos são contratos diferentes; não confundir com espelhamento de Azure Cosmos. Qualificar blast radius e permissões. [Autenticação](https://learn.microsoft.com/en-us/fabric/database/cosmos-db/how-to-authenticate), [autorização](https://learn.microsoft.com/en-us/fabric/database/cosmos-db/authorization) | T02–T03, T11, T18, T29. Componente de documentos pode ser necessário; não forçar tabela SQL. |
| F08 · Notebooks e sessões Spark | Ler/editar definição, parametrizar, executar, acompanhar e cancelar quando suportado | Items + Job Scheduler; Livy é superfície distinta. Estado/exit value não equivale a saída completa por célula. [Notebook APIs](https://learn.microsoft.com/en-us/fabric/data-engineering/notebook-public-api), [Livy](https://learn.microsoft.com/en-us/fabric/data-engineering/api-livy-overview) | T05, T08–T09, T15. Editor não promete paridade Jupyter sem API qualificada. |
| F09 · Environments e Spark job definitions | Bibliotecas, runtime/compute, staging/publicação e jobs | APIs de environment/job; editar staging não é publicar. Referências a arquivos/libs e identidade de execução precisam funcionar. [Environments](https://learn.microsoft.com/en-us/fabric/data-engineering/environment-public-api) | T05, T09, T20, T27. Publicação com preflight próprio. |
| F10 · Data Factory pipelines | Autoria, dependências, agenda, execução, histórico e atividades | Definições, scheduler e monitoramento; suporte de pipeline não garante cada activity/conector/parâmetro. [Pipeline REST](https://learn.microsoft.com/en-us/fabric/data-factory/pipeline-rest-api) | T04, T07–T10, T20. Não criar scheduler concorrente. |
| F11 · Dataflows Gen2 / Power Query | Inspecionar, preparar alterações e executar rotas suportadas | Definição/publish/refresh variam por geração/rota. Há conflito documental explícito descrito abaixo. [APIs](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-public-apis), [CI/CD](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-cicd-and-git-integration) | T04, T07–T12, T20. Qualificação bloqueada para qualquer claim amplo de autoria/execução. |
| F12 · Copy jobs e ingestão incremental | Configurar carga, CDC/incremental e monitorar | Item/definition/scheduler; semântica de escrita depende de conector e modo. [Copy jobs](https://learn.microsoft.com/en-us/fabric/data-factory/copy-job-rest-api-capabilities) | T04, T08–T11, T28. Watermark/duplicidade são critérios de negócio, não detalhes de UI. |
| F13 · Connections, gateways e fontes | Descobrir conexões, bind, configurar e revisar acessos | APIs próprias + credenciais/gateway/rede da fonte. Quem chama REST não é necessariamente quem acessa a origem. [Criar conexão](https://learn.microsoft.com/en-us/rest/api/fabric/core/connections/create-connection) | T04, T17–T18, T20. Não embutir segredo em declaração nem clonar credencial ao compartilhar. |
| F14 · Mirroring | Configurar/acompanhar réplica, lag e schema | Fonte específica, open mirroring e APIs suportadas. Não é writeback bidirecional universal. [Visão geral](https://learn.microsoft.com/en-us/fabric/mirroring/overview) | T04, T08, T10–T11, T28. Separar origem, replica e analytics endpoint. |
| F15 · Modelos semânticos / DAX / XMLA | Explorar, consultar, editar medidas/modelo, processar/refresh | Fabric definitions, Power BI REST, XMLA/TOM/TMSL e IQ MCP, com permissões/licenças distintas. [ExecuteQueries](https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/execute-queries), [XMLA](https://learn.microsoft.com/en-us/fabric/enterprise/powerbi/service-premium-connect-tools), [IQ MCP](https://learn.microsoft.com/en-us/fabric/iq/connectors/fabric-iq-mcp) | T03, T10, T12–T14, T19–T20. Read, Build e edit não são equivalentes. |
| F16 · Power BI reports, dashboards e paginated reports | Entender relatório, consultar modelo, refresh, publicar/rebind/embutir onde suportado | Power BI REST/SDK e definições de report. Cada tipo e modo de embedding tem contrato e identidade próprios. [Embedding](https://learn.microsoft.com/en-us/power-bi/developer/embedded/embedded-capacity) | T10, T12–T14, T20. Sem promessa de gerar visual final perfeito por API de definição. |
| F17 · Eventhouse / KQL | Ingestão, consultas e schema/políticas | Endpoint Kusto de consulta/gestão e ingestão, mais item REST. Management commands podem alterar recursos. [Eventhouse](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/eventhouse) | T03, T08, T11, T15, T22. Não classificar qualquer texto KQL como leitura. |
| F18 · Eventstreams / Real-Time hub | Explorar eventos, configurar fontes, transformações e destinos | Definições/REST/conectores; lifecycle, acesso e rede por tipo. [REST](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/event-streams/eventstream-rest-api) | T04, T10, T22–T23. Ativação e roteamento têm efeitos contínuos. |
| F19 · Activator e ações por evento | Revisar regras, testar e ativar respostas | Item/API tipo Reflex e ações suportadas; efeito pode ser mensagem, chamada ou execução externa. [Limites](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/data-activator/activator-limitations) | T23. Identidade executora e efeitos externos aparecem no plano. |
| F20 · Real-Time dashboards | Consultar/editar/compartilhar painéis em tempo real | Definições KQLDashboard e Fabric Embed, diferente de embedding Power BI. [Fabric Embed](https://learn.microsoft.com/en-us/fabric/embed/what-is-fabric-embed) | T22. Embedding/read/source access precisam de qualificação específica. |
| F21 · Experimentos e modelos ML | Comparar runs, métricas, artefatos e versões; treinar/pontuar | MLflow/SynapseML e item APIs; item visível não comprova acesso a artefatos/experimentos completos. [MLflow](https://learn.microsoft.com/en-us/fabric/data-science/mlflow-3-overview) | T24–T25. Schema de métricas/modelo e pacote/runtime específicos. |
| F22 · Model endpoints | Configurar serving, testar e observar inferência | Endpoint e API de scoring têm auth e consumo próprios; inferência não é necessariamente autoridade de leitura. [Endpoints](https://learn.microsoft.com/en-us/fabric/data-science/model-endpoints) | T25. Preview, schema e permissões por operação. |
| F23 · IQ, ontologias, grafo, digital twins e planning | Explorar conceitos/relações, binds, consultas e writeback suportado | Ontology/graph/digital-twin/planning são modelos distintos, não uma API intercambiável. [IQ](https://learn.microsoft.com/en-us/fabric/iq/overview) | T26. Gerações e efeitos de planning explícitos; sem fingir compatibilidade com Azure Digital Twins. |
| F24 · Catalog, Purview, lineage e proteção | Descobrir, rastrear, classificar e revisar governança | OneLake Catalog, lineage, scanner/admin e Purview, com roles e cobertura diferentes. [Scanning](https://learn.microsoft.com/en-us/fabric/governance/metadata-scanning-overview), [Purview](https://learn.microsoft.com/en-us/fabric/governance/microsoft-purview-fabric) | T01–T02, T18–T21. Escopo incompleto e labels/exportações não viram segurança universal. |
| F25 · Acesso, RLS/OLS e segurança OneLake/SQL | Explicar acesso, revisar grants e testar visibilidade | Workspace/item roles, modelo, SQL e OneLake são mecanismos distintos. [RLS](https://learn.microsoft.com/en-us/fabric/security/service-admin-row-level-security) | T17–T19. Sucesso de editor/admin não prova restrição do leitor. |
| F26 · Administração, capacidade, métricas e auditoria | Settings, inventário autorizado, consumo, incidentes e ações administrativas | Fabric admin, Power BI admin/audit, métricas e Azure ARM para capacidade. [Métricas](https://learn.microsoft.com/en-us/fabric/enterprise/metrics-app), [ARM](https://learn.microsoft.com/en-us/rest/api/microsoftfabric/fabric-capacities?view=rest-microsoftfabric-2023-11-01) | T02, T15–T18. Papéis/scopes/audiences extras; alterações podem afetar outros times. |
| F27 · Git, deployments, deployment plans e variable libraries | Comparar, revisar, promover e configurar ambientes | APIs e formatos por item; value sets/rebinding não carregam segredos. Deployment pode ser parcial. [Lifecycle](https://learn.microsoft.com/en-us/fabric/cicd/best-practices-cicd), [planos](https://learn.microsoft.com/en-us/fabric/cicd/deployment-plan/deployment-plan-overview), [variáveis](https://learn.microsoft.com/en-us/fabric/cicd/variable-library/variable-library-permissions) | T07, T13, T20–T21. Não equivale a backup de dados ou reprodução integral de ambiente. |
| F28 · Copilot, data agents, Operations Agent, Osmos e MCP | Aproveitar capacidades oficiais sem duplicar seus runtimes | MCPs Core/IQ/local/workload são distintos; skills são instruções. Copilot UI não comprova API embutível. [MCP](https://learn.microsoft.com/en-us/rest/api/fabric/articles/mcp-servers/what-is-fabric-mcp-server), [Osmos](https://learn.microsoft.com/en-us/fabric/data-engineering/data-engineering-agent-overview) | Assistência transversal, com efeitos/identidade/evidência preservados. Sem delegação cega de autoridade. |
| F29 · API for GraphQL | Inspecionar schema e consultar/operar API suportada | API de item/definição e runtime query/mutation separados; fontes e authorizers próprios. [Identidade de serviço](https://learn.microsoft.com/en-us/fabric/data-engineering/api-graphql-service-principal) | T29. Stored procedures/mutations não são GET inofensivo por aparência. |
| F30 · User Data Functions | Entender função, editar/publicar e invocar quando suportado | Owner/definition/publish/invocation e conexões têm restrições próprias. Função pode acessar fontes por identidade diferente. [Limites](https://learn.microsoft.com/en-us/fabric/data-engineering/user-data-functions/user-data-functions-service-limits) | T29. Não oferecer invocação arbitrária como ferramenta de leitura. |
| F31 · Apache Airflow e dbt jobs | Inspecionar projeto/DAG, alterações, jobs e execução | Superfícies Fabric de cada workload; upload de DAG é código executável; dbt pode escrever Warehouse. [Airflow](https://learn.microsoft.com/en-us/fabric/data-factory/apache-airflow-jobs-api-capabilities), [dbt](https://learn.microsoft.com/en-us/fabric/data-factory/dbt-job-overview) | T30. Reusar runtime remoto e qualificar logs/trigger; não criar scheduler próprio. |
| F32 · Maps e anomaly detection | Explorar camadas geográficas e acompanhar detecção/alertas | Item/definição não garante render/embedding/runtime completo. Fonte, cross-geo e ativação têm requisitos próprios. [Maps](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/map/about-map-permissions), [anomaly detection](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/anomaly-detection) | T22/T26 e especialização visual quando qualificada; sem prometer iframe/editor universal. |
| F33 · Fabric Apps e workloads de terceiros | Descobrir relações e oferecer integração/handoff quando houver contrato | Apps é uma plataforma adjacente; workload de terceiro não herda automaticamente as ferramentas de um item nativo. [Fabric Apps](https://learn.microsoft.com/en-us/fabric/apps/overview), [visão Fabric](https://learn.microsoft.com/en-us/fabric/fundamentals/microsoft-fabric-overview) | Inventário seguro e contrato futuro específico. Fora do gerador de aplicações genérico do Studio. |

## Conflitos e limitações que bloqueiam claims

### C01 — Dataflows Gen2

As páginas oficiais consultadas não permitem uma promessa ampla e uniforme:

- [Public APIs](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-public-apis), atualizada em 2026-09-11, inclui literalmente **“You can invoke Run APIs, but the actual run never succeeds.”** e limita autoria de destino/autenticação.
- [CI/CD](https://learn.microsoft.com/en-us/fabric/data-factory/dataflow-gen2-cicd-and-git-integration), atualizada em 2026-10-29, descreve publicação just-in-time e a rota Execute/`ApplyChangesIfNeeded`, mas também conserva instruções de publicação manual em limitações.
- A [referência da operação Execute](https://learn.microsoft.com/en-us/rest/api/fabric/dataflow/background-jobs/run-on-demand-execute) consultada exige Member ou superior e indica que service principal/managed identity não são suportadas nessa operação.

**Disposição:** não afirmar que todo Gen2 falha, nem que Execute resolve toda autoria/destino. Qualificar rota, geração, formato e identidade escolhidos, por esclarecimento oficial e execução em ambiente autorizado. Até lá, marcar a capacidade correspondente como não qualificada.

### C02 — Notebook e evidência de execução

O [guia de notebook APIs](https://learn.microsoft.com/en-us/fabric/data-engineering/notebook-public-api) descreve execução e exit values. Isso não estabelece contrato completo de edição/execução interativa por célula nem recuperação integral de todas as saídas. Endpoints beta/workload-specific podem devolver formatos diferentes do exemplo conceitual. A ferramenta mostra apenas o que seu adaptador observou, com versão e limites.

### C03 — Consulta de modelo e privilégio

O [REST ExecuteQueries](https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/execute-queries) e o [IQ MCP](https://learn.microsoft.com/en-us/fabric/iq/connectors/fabric-iq-mcp) não são rotas equivalentes: a documentação do IQ MCP dispensa workspace role/Build para consumo autorizado, com limitações próprias. Não generalizar o requisito de uma rota para todas.

O [RLS Power BI](https://learn.microsoft.com/en-us/fabric/security/service-admin-row-level-security) aplica restrições de leitor a Viewer e não aos papéis de editor Admin/Member/Contributor. Testar como admin não demonstra o que um leitor vê. Segurança OneLake, SQL e modelo também precisa ser verificada em sua própria superfície.

### C04 — Mudança e recuperação

[Troubleshoot lifecycle](https://learn.microsoft.com/en-us/fabric/cicd/troubleshoot-cicd) descreve implantação que para e conserva o que já foi aplicado, **sem rollback automático**. Exportar definição/Git não é backup dos dados nem de todas as configurações. Cada etapa do plano precisa declarar recuperação possível e efeitos irreversíveis.

### C05 — Rede, identidade e dados

[OneLake](https://learn.microsoft.com/en-us/fabric/onelake/onelake-access-api) exige token Storage e documenta consideração de residência de dados para endpoint global/regional. Perfil de nuvem, private networking, proxies e acesso do servidor Orchestra são parte da qualificação. Não copiar garantias de residência do Copilot para um cliente externo com outro provedor de IA.

### C06 — Maturidade e fontes

GA de workload, GA de integração Git e disponibilidade de um endpoint são fatos diferentes. Algumas páginas/gerações se contradizem. Onde o inventário não resolveu maturidade ou runtime completo, a spec mantém **não verificado**, em vez de inferir GA por URL `/v1` ou por anúncio adjacente.

## Contrato de expansão do catálogo

Para adicionar suporte real a uma linha:

1. Escolher operações concretas e fontes exatas, não um nome de família.
2. Fixar formato/generation, identidade, scopes, papéis, rede/capacidade e maturidade.
3. Implementar adaptação de erros, paginação, resultados, preflight e observação.
4. Definir efeito, dados expostos, consumo, retry e recuperação.
5. Exercitar cenários positivos/negativos e qualificação autorizada.
6. Habilitar componentes/templates apenas nos contextos que satisfazem esse contrato.
7. Registrar o que permanece indisponível, sem esconder a linha do mapa de cobertura.

Esse processo é o mecanismo de completude: inventário explícito + disposição + prova por operação. Não existe prova de “qualquer coisa no Fabric” a partir de uma chamada bem-sucedida.
