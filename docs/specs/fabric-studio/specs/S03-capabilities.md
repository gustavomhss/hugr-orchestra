# S03 — catálogo preparado e adaptadores

**Estado:** proposta técnica; não congelada para implementação.  
**Requisitos proprietários:** FS-CAP-001–007; FS-FAB-001–031; FS-INT-003; FS-INT-005–006.

## 1. Responsabilidade e integrações

Catálogo do módulo Fabric possui operações, não endpoints livres. Aplica Q05–Q08/Q11/Q12 e [C01/C02/C06](./CONTRACTS.md). Core não importa Fabric; Server compõe handlers e ferramentas; Schema/Protocol contêm só wire mínimo e Client é gerado. Component registry e driver runtime não são transportados a Schema. Fabric continua plataforma de storage/compute/jobs: coordinator de passos de mudança não interpreta/executa pipeline em engine própria.

## 2. Contrato

Descriptor privado: CapabilityRef estável, input/output schemas, tipos/gerações aceitos, efeito, audience/scopes/roles, maturity, rede/capacidade, preflight, concorrência, idempotência, submit/observe/cancel/recovery, limites/dados/evidências e qualification refs. Descriptor público é a projeção segura de tarefa/efeito/readiness/motivo, sem endpoint credenciado ou callback executável. Schemas e drivers são resolvidos pelo backend.

Effect classes: metadata-read, data-read, consumed-execution, definition-write, data-write, access-change, destructive. Se uma query/função pode ter efeito não delimitado, não recebe classe data-read por léxico ou título. Notebook arbitrário não é “consulta só leitura”. Microsoft permite negar mais estritamente a qualquer momento; UI readiness é retrato contextual, nunca autorização de execução.

`Availability` é exatamente C02. `ready` requer operação implementada + qualificação da tupla recurso/formato/identidade/direitos/capacidade/região/rede + autorização atual. Rota documentada sem integração = `unverified`; perfil conhecido não incluído = `unsupported`/disabled com motivo. Um recurso desconhecido só retorna metadados seguros; não ganha editor/run genérico.

### Receitas iniciais de integração — candidatas, não suporte entregue

| Superfície | Operações a especializar | Transporte / contrato a fixar antes de habilitar |
| --- | --- | --- |
| Core Fabric | Listar workspaces/itens/pastas; ler item/definição autorizada | Fabric REST por tipo suportado, cursores/next links validados. GET item não habilita get/updateDefinition para todo tipo. |
| Definições notebook/pipeline | Ler formato, preservar partes desconhecidas e aplicar diff exato suportado | Rota específica/core qualificada; base64/parts com limites; write fraco somente sandbox Q07. Sem assumir publish/execução pelo readback. |
| Jobs e agendas | Run on-demand, observar instância/LRO, solicitar cancel e agenda suportada | Job Scheduler/workload API com contrato individual; IDs persistidos em S09. Ausência de logs/cancel não é preenchida por shell. |
| OneLake | Listar/ler caminhos e atalhos permitidos | ADLS/Blob compatível apenas na paridade documentada; audience Storage, endpoint regional e residência qualificados. |
| SQL | Descobrir schema/query com conta restrita; aplicar mudança delimitada em rota qualificada | Tedious/TDS e token Entra; endpoint analítico Lakehouse sem DML; Warehouse/SQL Database têm contratos separados. Produção exige prova forte Q07. |
| Power BI | Report/model metadata e DAX nas rotas qualificadas | Power BI REST; Build/Read/roles/tenant settings por rota. Embed não é pré-condição implícita; deep link/metadados úteis são opção do template, não editor completo. |
| KQL | Query/metadados e gestão em capacidades distintas | azure-kusto-data; endpoint do recurso resolvido. Management e ingestão não herdam classe leitura. |
| Segurança | Ler roles/mecanismos e conferir visibilidade sob identidades reais | Rota autorizada por superfície; não expandir grupos invisíveis nem impersonar leitor por parâmetro inventado. |

Os IDs operacionais finais/revisões são congelados junto aos schemas e fontes exatas de cada operação, antes da primeira implementação dependente. Não usar nomes de exemplo como endpoints já presentes. Cada descriptor deve incluir ao menos um positivo real, negativo de auth, paginação/partial, throttle, limite, unknown/cancel/recovery quando aplicáveis. O índice não substitui subcontrato de endpoint.

### Semântica e disposição por família

As linhas abaixo são obrigações do catálogo por contexto. “Candidato inicial” não é `ready`; “extensão” permanece visível com leitura/handoff/indisponibilidade específicos. A prova proprietária está ligada ao ID FS-FAB, não ao número de wrappers.

| Família / requisito | Contrato que o adaptador não pode apagar | Disposição inicial |
| --- | --- | --- |
| F01 / FS-FAB-003 | Pastas de item ≠ diretórios de dados; inventário limitado/paginado. | Candidato controle/leitura; write por operação e Q07. |
| F02 / FS-FAB-004 | Paridade OneLake parcial; atalhos externos e residência/audience próprios. | Leitura candidata; escrever/atalho mutante só contrato qualificado. |
| F03 / FS-FAB-005 | Inspeção Delta ≠ escrita/otimização/VACUUM; retenção altera recuperabilidade. | Metadados/leitura; manutenção não anunciada pronta. |
| F04–F06 / FS-FAB-006 | Lakehouse SQL é leitura de dados; Warehouse e SQL Database são engines distintos; réplica analítica não escreve na origem. | Leitura candidata e uma rota forte de mudança a provar. |
| F07 / FS-FAB-007 | Item Cosmos, documento/runtime e Azure Cosmos mirroring não são intercambiáveis. | Extensão nomeada; sem grid SQL ou CRUD genérico. |
| F08 / FS-FAB-008 | Definição, job, Livy e saída por célula são capacidades separadas. | Editor/job qualificados; sem replay Jupyter inventado. |
| F09 / FS-FAB-009 | Staging, publish e associação/runtime de environment são etapas distintas. | Leitura/handoff; T27 não conta na biblioteca inicial. |
| F10 / FS-FAB-010 | Conector/activity desconhecido preservado; agenda/processamento permanecem Fabric. | Autoria/run delimitados candidatos. |
| F11 / FS-FAB-011 | Matriz Gen2 por geração/rota/identidade; parâmetro apply/skip explícito e demonstrado. | Unverified para claim amplo; T04 não depende dessa rota. |
| F12/F14 / FS-FAB-012 | Incremental/replicação depende de fonte, chaves, watermark/atrasos/schema/lag; sem writeback universal. | Carga inicial por rota qualificada; mirroring/copy extensões próprias. |
| F13 / FS-FAB-013 | Quem chama controle ≠ quem autentica na fonte/gateway. | Preflight de conexão/acesso; nenhum segredo em template. |
| F15 / FS-FAB-014 | DAX REST/XMLA/IQ MCP têm permissões/limites próprios, não Build universal. | REST candidato; XMLA nativo fora do primeiro escopo. |
| F16/F20 / FS-FAB-015 | Report/dashboard/paginated/real-time embed têm recursos e tokens diferentes. | Report metadata/deep link; embed só se qualificado separadamente. |
| F16/F25/F27 / FS-FAB-016 | Workspace apps/org apps/audiences ≠ Fabric Apps; versão publicada do consumidor/grants diretos são conferidos à parte. | Inventário/disposição; publicação de app sem adapter é handoff explícito, não sucesso da promoção. |
| F25 / FS-FAB-017 | Workspace/item/SQL/OneLake/RLS/OLS são mecanismos diferentes; testar leitor real. | Leitura e checks candidatos T17–T19; alteração é efeito high-risk separado. |
| F24 / FS-FAB-018 | Scanner/Purview/lineage/labels têm cobertura/autoridade próprias. | Fontes permitidas e lacunas; admin scan não é requisito oculto de T01. |
| F26 / FS-FAB-019 | ARM/admin não herdam grant do workspace; blast radius pode atravessar times. | Disposição/handoff; sem administração implícita. |
| F26 / FS-FAB-020 | Modelo do Capacity Metrics app não é fonte externa suportada para painel próprio. | T16 não anunciado pronto; fonte suportada a qualificar. |
| F27 / FS-FAB-021 | Git local ≠ Git Fabric; definitions/variable libraries/deploy não são backup/restauração integral; efeitos parciais. | T20 por rota forte delimitada; demais promotions específicas, sem rollback universal. |
| F17/F18 / FS-FAB-022 | KQL query/management/ingestão/ativação de stream têm efeitos separados. | Query candidata; gestão/stream extensão específica. |
| F19 / FS-FAB-023 | Activator pode emitir mensagem/chamada externa; executor e teste controlado explícitos. | Leitura/handoff; não ativa ao abrir template. |
| F21/F22 / FS-FAB-024 | Item ML ≠ MLflow runs/artifacts/serving; inferência tem schema/identidade/consumo próprios. | Extensão; T24–T25 não contam no inicial. |
| F23 / FS-FAB-025 | Ontologia/grafo/digital twins/planning independentes; writeback não é leitura. | Extensão por geração, sem compatibilidade Azure Digital Twins presumida. |
| F28 / FS-FAB-026 | Skills/instruções, UI Copilot e contratos MCP/agent não concedem autoridade nem API embutível por implicação. | Adaptador oficial somente quando qualificado; não duplicar runtime. |
| F29/F30 / FS-FAB-027 | GraphQL query/mutation/procedure e UDF publish/invocation/fontes têm efeitos separados. | Extensão; sem HTTP/função universal de leitura. |
| F31 / FS-FAB-028 | DAG é código, dbt escreve; agenda/execução no runtime próprio Fabric. | Inspeção/handoff quando possível; não engine Studio concorrente. |
| F32 / FS-FAB-029 | Maps/anomaly item não garante rendering/embedding/runtime/ativação ou residência. | Extensão especializada, sem iframe genérico. |
| F33 / FS-FAB-030 | App/workload terceiro não herda editor/mutador nativo. | Inventário seguro/handoff por contrato. |
| F33 adjacente / FS-FAB-031 | Industry Solutions healthcare/nonprofit são pacotes com semântica e implantação próprias. | Nomear pacote/handoff; suporte de pipeline/lakehouse não valida solução setorial. |

FS-FAB-001/002 obrigam disposição de todas as famílias e separação controle/definição/dados/execução. Uma linha de extensão não pode ser apagada por não estar no lançamento. O gate dos dezoito templates não é satisfeito por preencher esta matriz.

## 3. Estados e falhas

Normalizar somente erros esperados: denied/authentication-required, unsupported, unverified, throttled com Retry-After, limit, incompatibilidade e unknown. Não confundir ausência de acesso com recurso inexistente; não propagar bearer/payload bruto de erro. LRO após HTTP 202 entra em observação S09, não em “concluído”. Paginação interrompida retorna partial/cursor/erro, não total global definitivo.

Falha de driver/rede/preview desabilita a operação sem destruir a declaração salva. Não alternar conta/nuvem/audience nem browser/shell para contornar. CLI eventual é opt-in, binário conhecido, args estruturados/ambiente mínimo por abstração de processo Orchestra; nenhum comando de shell vindo de props, SQL ou row. Primeiro escopo não precisa de CLI para esconder integração incompleta.

## 4. Persistência e autoridade

Qualification record registra CapabilityRef, fonte/data, formato e contexto exatos, cenários executados/resultado, rede/plataforma e limites; não contém credenciais. Mudança de contrato/contexto invalida readiness correspondente. Diagnóstico público referencia esse record sem revelar conteúdo restrito.

Adaptadores recebem apenas UsePermit/target resolvido e token da audience pertinente no boundary host; não recebem manifesto para decidir endpoint. S02/08 autorizam; S09 registra efeito; S07 limita query; S10 limita evidência. A extensão genérica de plataforma não vira novo framework Fabric dentro de Core.

## 5. Prova e bloqueios

| IDs | Prova futura / contraprova |
| --- | --- |
| FS-CAP-001–003 | Mesma operação manual/IA resolve descriptor/revisão e readiness contextual; mudar identidade/geração/permissão desabilita o necessário. Listagem não concede execução. |
| FS-CAP-004–007 | Tipo desconhecido só metadados; conflito documental fica unverified; cap declara efeitos/retry/cancel. Remover suporte não dispara fallback privilegiado. |
| FS-FAB-001–002 | Fixture de inventário inclui todas as famílias e estados de disposição; tipo só CRUD não habilita dados/run. A prova estrutural não qualifica endpoint real. |
| FS-FAB-003–031 | Para **cada** linha da matriz: um caso do comportamento suportado e a contraprova semântica nomeada. Extensão não habilitada tem negativo de operação antes da rede; primeiro positivo operacional só após qualificação. |
| FS-INT-003 | Grafo/bundle mantém Client/Schema/Protocol sem Core/Server/driver; API alterada só com geração oficial. |
| FS-INT-005 | CLI permitida usa spawner conhecido e argumentos sem interpolação; falta de API não a habilita automaticamente. |
| FS-INT-006 | Pipeline/agenda executados no Fabric; nenhum modo opcional Studio interpreta carga ou vira storage/engine analítico/reconciliador tenant-wide. |

Bloqueios de freeze: subcontratos compiláveis dos endpoints escolhidos com URLs/métodos/DTOs/scopes/roles/gerações exatos e evidência Microsoft revisada; fixture hostil/erro/paginação/semântica por operação; conformidade Bun/driver/distribuição e rota forte SQL. Fontes-base: [COVERAGE](../COVERAGE.md), seus C01–C06, [RESEARCH](../RESEARCH.md) e referências em Q06/Q12. Sem esse trabalho, este documento é índice técnico proposto, **não spec completa de todos os endpoints ou catálogo pronto**.
