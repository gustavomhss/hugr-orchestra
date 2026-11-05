# Fabric Studio — catálogo de templates proposto

**Estado: desenho de catálogo. Não indica que componentes, adaptadores ou templates já estejam implementados.**

Um template é uma definição para o compositor, não uma página programada separadamente. A galeria usa nomes orientados à tarefa, com nomes técnicos nos detalhes. Os IDs abaixo são de rastreabilidade de desenho; nomes definitivos, copy e contrato vêm nas specs.

## Regras comuns

- Sem credenciais, tokens, autoridade, endpoints arbitrários ou comandos ao abrir/importar.
- Um principal, ferramentas de apoio e inspector tipado; assistência IA é opcional e recolhível.
- Parâmetros selecionam recursos por IDs e contexto, não por nomes ambíguos.
- Acesso a dados/consulta é separado de acesso a metadados; execução tem efeitos e consumo explícitos.
- Mudanças usam a mesma revisão/aprovação do domínio, independentemente do template.
- Sem capacidade essencial qualificada, o template não aparece como pronto. Pode abrir preview ou modo de leitura útil, com a limitação nomeada.
- Abertura em demo usa fixtures identificadas; nenhuma evidência fictícia se torna recibo de produção.
- Não existe um papel Microsoft universal mínimo para todos os casos. “Ler”, “consultar”, “escrever”, “executar” e “administrar” abaixo são categorias de desenho, não scopes OAuth.

## Catálogo principal

| ID / modelo | Objetivo | Principal · apoio · inspeção | Capacidades e autoridade mínima | Evidência de conclusão / indisponibilidade |
| --- | --- | --- | --- | --- |
| T01 · Entender uma solução | Explicar o caminho de um resultado de negócio | Mapa · recursos/definições · etapa selecionada | Metadados e definições autorizados; sem dados tabulares por padrão | Relações com fonte e cobertura; trecho inacessível fica desconhecido. |
| T02 · Conhecer um workspace | Saber o que existe e o que precisa de atenção | Inventário · atividade disponível · recurso | Listagens paginadas e metadados no escopo escolhido | Inventário datado, páginas e lacunas; ausência de acesso não significa workspace vazio. |
| T03 · Explorar dados | Responder uma pergunta com fonte conhecida | Resultados · consulta/perfil/gráfico · coluna/filtro | Consulta autorizada no engine escolhido, limites de consumo/retorno | Consulta, identidade, filtros, resultado e truncamento; sem acesso, metadados/rascunho apenas. |
| T04 · Criar uma carga | Conectar uma fonte a um destino com regra e agenda | Fluxo/plano · conectores/definições/testes · etapa | Criar/editar itens suportados; conexão de fonte/gateway; executar separadamente | Artefatos, primeira execução e validação; conector não suportado fica como decisão pendente, sem fluxo falso. |
| T05 · Desenvolver notebook | Ler, editar e executar código com contexto | Editor · estrutura/parâmetros/execuções · célula ou job | Ler definição; escrever definição e executar são direitos separados | Readback e resultado remoto suportado; sem API de saída por célula, não exibir replay inventado. |
| T06 · Trabalhar com SQL | Explorar e desenvolver consultas/objetos suportados | Query editor · schema/resultados · objeto | Contrato do engine e conta apropriados; escrita separada da leitura | Consulta e efeitos identificados; endpoint somente leitura não ganha botões DML. |
| T07 · Alterar um pipeline | Revisar uma mudança na transformação/orquestração | Diff/plano · dependências · atividade | Definição suportada e direito de alteração; run separado | Revisão aplicada/readback e testes pertinentes; atividade desconhecida é preservada, não reescrita por editor genérico. |
| T08 · Investigar uma falha | Encontrar evidências da falha e possíveis correções | Execuções · logs/mapa/comparação · evento | Status/histórico/definições/logs disponíveis; sem direito de execução obrigatório | Diagnóstico fundamentado ou hipótese explícita; log indisponível tem motivo. |
| T09 · Reexecutar com cuidado | Repetir trabalho sem duplicar efeitos inadvertidamente | Plano de execução · histórico/parâmetros · alvo | Execute e eventual cancel, mais fontes/destinos usados pelo job | ID remoto, observação terminal e validação; sem prova de retry seguro, monitorar/investigar em vez de repetir. |
| T10 · Acompanhar atualizações | Saber o que está fresco, atrasado ou falhou | Estado/timeline · dependências/refresh · processo | Metadados e observações autorizadas; refresh não automático | Freshness com origem e intervalo; desconhecido não vira indicador verde. |
| T11 · Validar uma tabela | Conferir schema, chaves, nulos e regras de negócio | Checks · consulta/resultados · regra | Metadados + consultas explicitamente permitidas | Critérios, população/amostra e resultados; sem consulta, schema-only com dados não verificados. |
| T12 · Reconciliar indicadores | Explicar por que dois números diferem | Comparação/checks · consultas/filtros · medida | Consulta em cada origem/modelo, sem substituir conta por escritor privilegiado | Período, filtros, identidade e snapshot comparáveis; caso contrário, inconclusivo. |
| T13 · Alterar um modelo semântico | Mudar medida/relacionamento com impacto visível | Diff/modelo · relatório/checks · medida | Definição/consulta/edição suportadas por rota e identidade | Readback + regressão de medidas; formato ou licença incompatível exige handoff explícito. |
| T14 · Entender um relatório | Explicar indicadores, fontes e atualização | Relatório/indicadores · modelo/mapa · visual/medida | Descoberta e consumo autorizados; embedding opcional e qualificado | Ligações e definições verificadas no escopo; sem embed, metadados e deep link seguro. |
| T15 · Investigar lentidão | Explicar duração/carga e comparar alternativas | Execuções/telemetria · consulta/plano disponível · operação | Telemetria pertinente + consulta/teste autorizados | Antes/depois controlado com limites; sem telemetria, hipótese e dados faltantes, sem ganho numérico inventado. |
| T16 · Entender consumo | Relacionar consumo observado a trabalhos e horários | Séries/consumo · workloads/timeline · intervalo | Acesso à fonte real de métricas; admin só onde exigido | Unidade, fonte, atraso e atribuição possível; sem preço/telemetria, custo desconhecido. |
| T17 · Explicar um acesso negado | Ajudar usuário a entender o que precisa solicitar | Recursos/acesso · requisitos · operação | Evidências disponíveis à própria identidade; não exige grant automático | Requisito e pedido encaminhável; memberships ocultos continuam desconhecidos. |
| T18 · Revisar permissões | Revisar acesso por superfície e principal | Matriz · evidências/plano · identidade | Leitura autorizada; alteração de acesso é confirmação forte separada | Readback e checks pertinentes; lista parcial não se chama acesso efetivo completo. |
| T19 · Conferir segurança dos dados | Validar visibilidade sob identidades leitoras | Checks de segurança · modelo/políticas · caso | Direitos explícitos de teste; identidades/scopes reais suportados | Resultado por identidade/mecanismo; simulação não suportada vira checklist de usuário real, não impersonation fictício. |
| T20 · Preparar uma publicação | Comparar ambientes e promover escopo suportado | Diff/plano · dependências/settings · recurso | Ler ambos os destinos; escrever/deploy no destino autorizado | Readback, efeitos parciais e checks pós-publicação; sem rollback global. |
| T21 · Entregar o trabalho | Preservar contexto e transferir conhecimento | Evidências/resumo · mapa/decisões · recibo | Salvar composição; compartilhar dados requer autorização própria | Destinatário autentica e rebind; pacote não concede acesso nem exporta segredos. |

## Composições especializadas

Estas também usam o compositor, mas podem exigir ferramentas especializadas. Estar no desenho garante tratamento da área, não compromisso de lançar todas as especializações na primeira etapa.

| ID / modelo | Objetivo e organização | Capacidades/limites | Evidência / alternativa |
| --- | --- | --- | --- |
| T22 · Operar dados em tempo real | Eventstream/mapa principal; ingestão, KQL e logs de apoio | Fontes, rotas e management commands são efeitos próprios; não tratar KQL como leitura por default | Ingestão/freshness/query no escopo; conector ou telemetry ausente explicitado. |
| T23 · Revisar uma regra de evento | Definição/regra principal; eventos de exemplo e efeitos de apoio | Ativar Activator pode enviar mensagem/disparar automação; identidade do executor explícita | Regra aplicada e ação de teste controlada; nunca habilitar ao abrir template. |
| T24 · Comparar experimentos | Experimentos/métricas principal; artefatos e modelos de apoio | Item REST não implica acesso completo a runs/MLflow/artifacts | Runs/métricas e versões reais; o que não foi recuperado é indisponível. |
| T25 · Preparar uso de modelo ML | Plano/modelo principal; schema/endpoint/métricas de apoio | Servir modelo e inferir podem exigir permissão de escrita e consumir compute; preview explícito | Versão, schema e resposta de teste; compatibilidade e identidade qualificadas. |
| T26 · Explorar conceitos e relações | Ontologia/grafo principal; dados e proveniência de apoio | Ontologia, graph query, digital twins e planning não são sinônimos; suporte por geração | Relações consultadas e cobertura; writeback exige plano separado. |
| T27 · Revisar ambiente Spark | Environment/definições principal; libs, compute e jobs de apoio | Staging, publicação e associação a jobs são etapas distintas | Revisão publicada e job de teste compatível; sem “instalar e rodar” automático. |
| T28 · Acompanhar replicação | Estado de mirroring/copy principal; origem/destino e lag de apoio | Capacidades por fonte, schema, modo incremental e credenciais | Replicação/lag observados e conferência; não prometer writeback bidirecional. |
| T29 · Inspecionar uma API da solução | Schema/contrato principal; dados/funcões e chamada de teste de apoio | GraphQL, UDF e Apps são superfícies separadas; mutações/side effects identificados | Contrato e resposta autorizados; ausência de API pública vira handoff, não HTTP arbitrário. |
| T30 · Entender orquestração existente | DAG/definição principal; jobs, logs e referências de apoio | Airflow/dbt/pipelines mantêm seus runtimes; Studio não reimplementa scheduler | Estado/artefatos obtidos por superfície suportada; sem access não simular o runtime. |

## Personalização e ciclo de vida

1. Escolher modelo e resolver seus parâmetros de destino com identidade atual.
2. Mostrar uma composição útil e as dependências não satisfeitas.
3. Ativar consultas/dados/execução conforme política e intenção, separadas da montagem visual.
4. Ajustar principal, abas, apoio, inspector e pins; preservar foco e rascunho.
5. Pedir à IA mudanças de organização; revisar diff e aceitar/rejeitar sem remount surpresa.
6. Salvar cópia pessoal versionada. Receber update do template por diff, sem sobrescrever customizações.
7. Compartilhar composição sanitizada; destinatário resolve conta e recursos novamente.

## Critérios de catálogo

- Cada template tem owner de produto, dependências tipadas, versões compatíveis, fixture demonstrativa e cenário operacional de aceitação.
- Galeria organiza por intenção e função; um usuário de leitura encontra tarefas úteis sem receber uma solicitação indiscriminada de Contributor/Admin.
- Especializações reutilizam componentes quando seu modelo mental é compatível; não forçar “editor JSON + grid” como resposta a qualquer experiência.
- Mais de dez definições é uma meta de biblioteca, não prova de cobertura de backend. Aceitação considera a conclusão da tarefa e a clareza dos limites.
