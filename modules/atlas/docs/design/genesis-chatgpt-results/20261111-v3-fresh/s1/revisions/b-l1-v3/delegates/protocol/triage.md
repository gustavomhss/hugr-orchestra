# Triagem semântica L1 — 44 módulos Protocol

Fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`; grupo histórico G30. Os 44 arquivos foram lidos integralmente nesta revisão: 155.952 bytes. Seu estado histórico `L1_literal_surface` permanece preservado em triage.json; o novo estado é leitura completa do contrato Protocol, não execução nem aceite.

Esta base distingue schemas/erros/middleware declarados, anotações de intenção e enforcement de Server/Core. Ela complementa s1.api.surface-disposition e os corpos existentes; não cria chaves L2–L4 ou predecessores aceitos.

## actions — 9 membros

**Propósito:** API de bindings versionados, operações admitidas e comandos de CI/provedor.

**Necessidade L1 atual:** Distinguir o identificador/revisão do binding de uma autorização de execução; conhecer a forma de erro e separar preparação/readback dos comandos específicos de provedor.

**Base factual nova:** ActionsApiError expõe os campos de Actions.ErrorData com status 400. BindingQuery combina LocationQuery com revisão positiva decodificada de string. As respostas usam Location.response; preparação/leitura/reconcile têm Operation e comandos de jobs/runs/workflows/resources têm CommandExecution. Payloads distinguem GitHub, GitLab e comandos genéricos; presence de endpoint não comprova um efeito remoto.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** A validade operacional de um binding/revisão, credencial de provedor, execução/reconcile e resultado remoto pertence ao serviço Actions/Core e seus handlers; este contrato não prova esses efeitos. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.boundaries`, `s1.api.client-projection`, `s1.api.codegen`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/actions-binding.ts` | CRUD de binding e acesso a capabilities/policy; create/update recebem BindingInput, policy usa Policy/PolicyState. | P01 |
| `packages/protocol/src/groups/actions-common.ts` | Define erro público ActionsError 400, bindingID, revision positiva e limites/attempt opcionais positivos. | P02 |
| `packages/protocol/src/groups/actions-job.ts` | retry/play/cancel/erase usam jobID não vazio e retornam CommandExecution; comandos de cancel/erase são GitLabCommand. | P03 |
| `packages/protocol/src/groups/actions-operation.ts` | prepare recebe OperationIntent; get/reconcile usam OperationID e devolvem Operation. A fonte separa admissão/readback de writes específicos. | P04 |
| `packages/protocol/src/groups/actions-pipeline.ts` | merge-request usa mergeRequestID e MergeRequestCommand; trigger usa TriggerPipelineCommand; ambos devolvem CommandExecution. | P05 |
| `packages/protocol/src/groups/actions-resource.ts` | list combina ResourceListInput e limit positivo; command restringe action a create/update/delete/play/pause/keep/clear e recebe ResourceCommand. | P06 |
| `packages/protocol/src/groups/actions-run.ts` | List/get/jobs são readback paginado; retry/cancel/forceCancel/remove/approveFork/rename têm comandos com schemas específicos de provedor. | P07 |
| `packages/protocol/src/groups/actions-source.ts` | Validação de source/draft retorna Graph, com onExcessProperty:error nos DTOs de validação; branch/write/review são actions admitidas. | P08 |
| `packages/protocol/src/groups/actions-workflow.ts` | List/source/graph são leitura; dispatch/state aceitam DispatchCommand/WorkflowStateCommand e retornam CommandExecution. | P09 |

## agent-authoring — 4 membros

**Propósito:** Catálogos de agentes/comandos/skills e authoring de agentes, skills e comportamentos de projeto.

**Necessidade L1 atual:** Separar o catálogo anunciado ao modelo de execução e identificar quais arquivos/valores podem ser alterados por esta API.

**Base factual nova:** AgentDetail declara ferramentas, skills e engines com estado de instalação; agent.file.update aceita AgentFile.Input e declara conflito. Behavior.set substitui o conjunto de comportamentos, com anotação de aplicação no próximo provider turn. command.list só lê o catálogo. skill.save/remove aceitam inputs/path e anotam que globais, built-in e Atlas-governed são read-only.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** Revisão de arquivo, reload, contenção de paths e aplicação no provider turn são enforcement dos handlers/Core, não consequência da declaração Schema.String ou do OpenAPI. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.schema-contracts`, `s1.api.boundaries`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/agent.ts` | Detail anuncia tools, skills e engines/status; file get/update usam AgentFile e update declara 409 por revision stale. | P10 |
| `packages/protocol/src/groups/behavior.ts` | PUT recebe SetInput, devolve array Info e declara substituição do contexto de comportamento do projeto. | P12 |
| `packages/protocol/src/groups/command.ts` | GET retorna catálogo Command.Info na localização; execução de comando não pertence a este grupo. | P17 |
| `packages/protocol/src/groups/skill.ts` | List e save/remove para catálogo/arquivos de projeto; save declara globals/built-ins/Atlas-governed read-only, com InvalidRequest/Conflict. | P42 |

## atlas — 1 membros

**Propósito:** Fachada HTTP da tela Atlas sobre o store da localização, incluindo leitura, draft/emit/review e setup legado.

**Necessidade L1 atual:** Reconhecer a autoridade da fachada existente sem confundir atlas.mine ou a descrição de portas governadas com o runtime Genesis aceito nesta campanha.

**Base factual nova:** O grupo usa LocationQuery, Location.response e ServiceUnavailableError; separa draft declarado sem escrita, emit na rev do draft, verificações, review, decisões humanas, install/index/mine. A própria fonte identifica formas legadas /atlas/* e ausência como null/estado empty. São contratos e descrições de intenção de portas, não recibos desta produção.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** Governança efetiva, CAS, reader, efeitos de index/mine e equivalência ao runtime comum dependem dos donos Atlas e implementação; nenhuma chamada desta API foi feita. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.boundaries`, `s1.api.surface-disposition`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/atlas.ts` | Fachada da tela/store Atlas: distingue draft, emit, review, decisões e setup/index/mine; todos os endpoints declaram ServiceUnavailable. | P11 |

## board — 1 membros

**Propósito:** Leitura do board de projetos e comandos do owner para orientar Maestro.

**Necessidade L1 atual:** Identificar a fronteira entre planejamento por Maestro e operações do proprietário, com respostas/erros de conflito concretos.

**Base factual nova:** BoardGroup não usa LocationQuery nos endpoints: key e issue number positivo identificam o projeto/issue. Leituras retornam Snapshot/IssuePage/relatórios; mutations retornam OwnerResult e declaram BoardNotFoundError 404/BoardRefusedError 409. As anotações restringem edição de notas ao owner e descrevem pause/hold/accept/decline como orientação de Maestro.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** Identificação real de owner, recusa de escrita e efeitos GitHub/Maestro exigem o handler/serviço Board. A descrição de segredo nunca retornado não é uma prova de redaction executada. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.boundaries`, `s1.api.server-edge`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/board.ts` | Projeto por key e issue por número positivo; reads têm DTOs específicos e writes OwnerResult, com 404/409; ownership de notas é declarado. | P13 |

## capability-management — 3 membros

**Propósito:** Inspeção de autoridade, ciclo de connections/targets/bindings e gerenciamento de schedules criados por agentes.

**Necessidade L1 atual:** Não tratar IDs de cliente como grants; localizar middleware e idempotência na declaração pública.

**Base factual nova:** Connections limita páginas a 1..32 (anotação default 16), requer idempotency-key não vazio nas mutations e retorna Receipt/DTOs diretos. Operator.inspect retorna requestID/principal/origin/scopeHash. Os três factories aplicam location middleware e CapabilityAuthorization. Capability schedules não cria/edita: isso fica com schedule_manage do agente; run usa key idempotente e retorna Started.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** Validação mais estrita do header, autenticação e revogação, atomicidade de recibos e idempotência efetiva pertencem ao middleware/serviços Core; o corpo server-edge existente cobre parte da autenticação e a triagem Server deve cobrir as delegações. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.server-edge`, `s1.api.sdk-composition`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/capability-connections.ts` | Páginas 1..32, mutations com idempotency-key, input de setup/binding/target e receipts diretos; aplica CapabilityAuthorization. | P14 |
| `packages/protocol/src/groups/capability-operator.ts` | Inspeciona requestID/principal/origin/scopeHash; origin é configured-auth/desktop/cli/sdk; aplica CapabilityAuthorization. | P15 |
| `packages/protocol/src/groups/capability-schedules.ts` | Ações list/pause/resume/run/remove de schedules de agente; create/edit ficam no tool do agente; mutations exigem key. | P16 |

## global-settings-trust — 2 membros

**Propósito:** Configuração global, shells disponíveis e decisão global de trust de projetos.

**Necessidade L1 atual:** Evitar interpretar configurações globais como mutations de uma Location escolhida pelo cliente; separar string de diretório de validação de caminho.

**Base factual nova:** ConfigPatch substitui listas de disabledProviders/permissions e definições de providers por ID; update é NoContent e a descrição pede reload de localizações abertas. Trust é explicitamente global, sem LocationQuery; approve/revoke recebem directory:String. A anotação de approve exige pasta existente/absoluta/realpath e revoke preserva trust herdado de pai.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** Schema.String não verifica existência/realpath/trust: o enforcement e o start/stop de MCP são fatos a confirmar no Server/Core antes de alegá-los implementados. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.boundaries`, `s1.api.server-edge`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/config.ts` | Patch global de modelo/shell/engines/providers/permissions; listas substituem as anteriores; update é NoContent. | P18 |
| `packages/protocol/src/groups/trust.ts` | Lista/aprova/revoga trust global com directory String; não é Location-scoped; realpath e herança são descrições de behavior. | P43 |

## integration-credentials — 2 membros

**Propósito:** Descoberta de integrações e ciclo de credenciais/attempts de autenticação.

**Necessidade L1 atual:** Distinguir metadados de credencial e attempts OAuth de segredos e registrar a existência dos endpoints de compatibilidade.

**Base factual nova:** Credential só expõe update label e remoção por ID, com ConflictError. Integration list/get anunciam métodos; connect/key recebe key, connect/oauth recebe methodID/inputs e retorna Attempt. Há endpoints por integrationID+attemptID de compatibilidade e endpoints globais por attemptID para status/complete/cancel. A anotação de disconnect remove credenciais armazenadas, preservando env vars.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** Ownership de um attempt, armazenamento seguro, cancelamento de recursos e efeito OAuth não são provados pelas formas públicas; dependem dos handlers/serviços e não foram executados. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.server-edge`, `s1.api.client-projection`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/credential.ts` | PATCH altera somente label; DELETE remove por Credential.ID; os dois retornam NoContent e declaram ConflictError. | P19 |
| `packages/protocol/src/groups/integration.ts` | Discovery de métodos, connect por key/OAuth e polling/completion/cancel; endpoints OAuth por integrationID preservam compatibilidade. | P24 |

## host-health-installation — 2 membros

**Propósito:** Prontidão declarada do servidor e solicitação de upgrade.

**Necessidade L1 atual:** Distinguir um DTO de health/upgrade de observação de disponibilidade ou instalação realmente realizada.

**Base factual nova:** health.get declara healthy literal true, pid opcional e version; installation.upgrade recebe target:String, retorna success literal true/version e declara InvalidRequestError/UnknownError. A descrição escolhe o package manager que instalou o servidor.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** Prontidão, pacote instalado, integridade e sucesso do upgrade precisam de implementação/execução pertinente; o L1 aqui só afirma o contrato solicitado. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.boundaries`, `s1.api.server-edge`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/health.ts` | GET declara healthy:true, version e pid opcional; é schema de resposta, não medição de disponibilidade desta sessão. | P22 |
| `packages/protocol/src/groups/installation.ts` | POST target seleciona release, resposta success:true/version e erros 400/500; upgrade executado não foi observado. | P23 |

## developer-services — 3 membros

**Propósito:** Status de formatters/LSP e administração de conexões, config, recursos e auth MCP.

**Necessidade L1 atual:** Identificar operações que apenas anunciam status versus as que escrevem config, conectam e iniciam OAuth.

**Base factual nova:** Formatter/LSP retornam listas Status em Location.response. MCP expõe server state, resource catalog, entries/config, tool names e mutations de conexão/config/OAuth, com InvalidRequestError e McpServerNotFoundError conforme rota. As descrições distinguem config resolvida sem secrets de entries com referências env não resolvidas; auth.start e callback têm respostas diretas, não todas envelopadas.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** Redaction, confiança de projeto, processo MCP e OAuth dependem de implementação; os comentários de debug/segredos não provam que uma chamada de rede ocorreu ou que toda resposta está saneada. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.server-edge`, `s1.api.client-projection`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/formatter.ts` | Status dos formatters configurados/disponíveis por Location, Array(Formatter.Status). | P20 |
| `packages/protocol/src/groups/lsp.ts` | Status de language servers conectados na Location, Array(Lsp.Status). | P27 |
| `packages/protocol/src/groups/mcp.ts` | Discovery/status/config/resources/tools, mutations de config/conexão e OAuth; descrições distinguem redaction e env refs não resolvidas. | P28 |

## locations-projects — 3 membros

**Propósito:** Resolução de contexto de localização e catálogo/cópias de projeto.

**Necessidade L1 atual:** Separar query deepObject, catálogo global e operações de projeto com IDs de entradas cuja autoridade vem da Location.

**Base factual nova:** LocationQuery possui directory/workspace opcionais e transforma a representação OpenAPI para deepObject/explode; location.get retorna Info direto, paths retorna home. Project list/directories/update usam IDs e respostas diretas; initGit usa LocationQuery/envelope. ProjectCopy remove projectID/sourceDirectory de CreateInput em favor de params/contexto e declara ProjectCopyError 400 com forceRequired opcional.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** Resolução de path, isolamento, initGit e semântica destrutiva/force de cópias são responsabilidade Server/Core; não decorrem de branded strings ou do schema de erro. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.server-edge`, `s1.api.schema-contracts`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/location.ts` | Query directory/workspace opcionais deepObject; Info direto e paths.home no endpoint de caminhos. | P26 |
| `packages/protocol/src/groups/project-copy.ts` | Create omite projectID/sourceDirectory do payload e usa params/contexto; Remove omite projectID; erro400 inclui forceRequired opcional. | P31 |
| `packages/protocol/src/groups/project.ts` | Catálogo global e mutation por Project.ID; initGit é operação com LocationQuery e resposta nullable dentro do envelope. | P32 |

## permission-question — 2 membros

**Propósito:** Pendências de aprovação e perguntas, com recursos ligados à sessão e permissões salvas.

**Necessidade L1 atual:** Estabelecer placement de middleware e ownership de request/session declarado antes de usar essas APIs no fluxo de sessão.

**Base factual nova:** Os factories aplicam location middleware aos endpoints já adicionados e sessionLocationMiddleware a cada endpoint de sessão. Permission.create aceita action/resources/save/metadata/source, devolvendo ID/effect; get/reply combinam sessionID+requestID e erros 404 apropriados. Question reply usa Question.Reply e reject é NoContent. Saved permissions têm list por projectID opcional e remove por ID.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** O contrato descreve requests owned by session; lookup e autorização reais precisam da implementação de Permission/Question. Não inferir ownership somente do par de params nem confundir saved state com uma decisão executada. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.session-contract`, `s1.api.server-edge`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/permission.ts` | Queries de requests/saved e recursos de sessão; middleware placement separa endpoints prévios e session endpoints; reply é NoContent. | P30 |
| `packages/protocol/src/groups/question.ts` | Pending list por Location; list/reply/reject por sessionID e requestID com middleware de sessão e erros404. | P34 |

## meetings — 1 membros

**Propósito:** Registros de reuniões de sessão, transcrições finais e decisões do owner.

**Necessidade L1 atual:** Conhecer fronteiras start/append/stop, resultado de ações e passagem de itens para Maestro sem atribuir gravação de áudio a estas rotas.

**Base factual nova:** MeetingError 400 contém ErrorReason. Endpoints usam DTOs Start/Append/Stop/Read/List e NoContent para append; descrições dizem um meeting running por Session e append idempotente por segmento já armazenado. Confirm/commitment/handoff têm DTOs próprios; handoff é declarado como itens com origem, sem transcript.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** Unicidade de running meeting, deduplicação de segmentos, cascade de memória no delete e envio team_message são responsabilidade de implementação; nenhuma dessas operações foi executada. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.session-contract`, `s1.api.surface-disposition`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/meeting.ts` | Start/append/stop/read/list, confirmações e handoff; ErrorReason estruturado em400, append NoContent e descrição de deduplicação. | P29 |

## guardrails — 1 membros

**Propósito:** Leitura de regras e solicitação de avaliação de mudança no repositório.

**Necessidade L1 atual:** Distinguir o contrato de um engine de guardrail de um parecer executado sobre esta produção.

**Base factual nova:** rules retorna Guardrail.Rules e run recebe RunInput/retorna Report em Location.response; GuardrailError 400 contém kind e message. A descrição usa regras do merge-base com a branch alvo.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** Seleção efetiva de base/regra e resultado do engine permanecem externos ao contrato Protocol; não são veredictos Genesis. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.surface-disposition`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/guardrail.ts` | Rules e run/reports com erro400 kind/message e descrição de baseline merge-base. | P21 |

## lean — 1 membros

**Propósito:** Dashboard e preferências/histórico de Lean no perfil salvo da localização.

**Necessidade L1 atual:** Distinguir DTOs/meters históricos de medição de economia observada nesta execução.

**Base factual nova:** GET/PATCH /api/lean usa LeanDashboard.Info/Update; history por LeanCoverage.ItemID retorna History. Os três endpoints declaram ServiceUnavailableError.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** Cálculo de economia e aplicação de switches dependem de Core/persistência; nenhuma economia ou desempenho foi medido aqui. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.surface-disposition`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/lean.ts` | Dashboard/update/history por item, todos com ServiceUnavailableError; não calcula economia nesta camada. | P25 |

## retrieval-research — 2 membros

**Propósito:** Pipeline de fontes/revisões RAG e leitura de artefatos de pesquisa admitidos à sessão.

**Necessidade L1 atual:** Separar source/pipeline experimental da leitura imutável autorizada por sessão e evitar tratar qualquer path como fonte autorizada.

**Base factual nova:** RAG usa LocationQuery/envelopes para admit/parse/revision/search/ask/proofs; embedding declara literal refused:embedding_off e passes/batch refused:one_pass. Research read exige sessionID, ArtifactID, revisão positiva e cursor opcional; responde ArtifactPage direto e declara 404/409/400/503, aplicando o middleware recebido. A anotação restringe acesso ao escopo admitido e proíbe paths arbitrários.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** A verificação de binding e escopo admitido, paginação imutável efetiva e recusa de source de projeto dependem dos handlers/serviços. A presença de ask/search não prova resposta fundamentada nem embedding ativo. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.session-contract`, `s1.api.client-projection`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/rag-studio.ts` | Sources/pipeline/revisions/search/ask/proofs; tipos explícitos de refusal embedding_off e one_pass restringem duas rotas. | P35 |
| `packages/protocol/src/groups/research-artifact.ts` | SessionID + ArtifactID + revisão positiva, cursor opcional, ArtifactPage direto e middleware recebido; sem path de filesystem. | P40 |

## references — 1 membros

**Propósito:** Catálogo de referências disponíveis na localização.

**Necessidade L1 atual:** Conhecer a fronteira de descoberta e não inferir que uma referência dá acesso a um arquivo.

**Base factual nova:** reference.list usa LocationQuery e retorna Location.response(Array(Reference.Info)); não declara uma operação de leitura de conteúdo neste grupo.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** Disponibilidade real, origem e autorização de conteúdo exigem serviço de referência e o consumidor correspondente. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.schema-contracts`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/reference.ts` | Somente catálogo Reference.Info na localização; não fornece acesso de conteúdo. | P36 |

## vcs-pull-requests — 2 membros

**Propósito:** Estado/diffs/atividade VCS e operações de pull request via host.

**Necessidade L1 atual:** Distinguir observações locais de Git, métricas de sessão e mutations externas com identidade do servidor.

**Base factual nova:** VCS diff requer mode working|branch e context não negativo opcional; activity recebe limites epoch-millis não negativos. PullRequestError 400 contém kind/message e host/branch/remote opcionais; list/create são Location.response e o contrato atribui ao gh/glab autenticado no servidor a interação com GitHub/GitLab.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** Comandos Git/host CLI, limites de repo, credenciais e publicação externa dependem da implementação; nenhuma PR ou chamada CLI foi feita neste trabalho. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.server-edge`, `s1.api.surface-disposition`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/pull-request.ts` | List/create com erro400 kind/message e contexto host; declaração atribui efeitos ao gh/glab autenticado do servidor. | P33 |
| `packages/protocol/src/groups/vcs.ts` | Info/status/diff working|branch, métricas entre millis e atividade de sessão por período. | P44 |

## schedules — 1 membros

**Propósito:** Agendamento de prompts por localização e disparo manual.

**Necessidade L1 atual:** Distinguir CRUD de schedule, admissão de sessão e sucesso de execução; separar esta API de capability schedules de agentes.

**Base factual nova:** CRUD usa ScheduledTask.CreateInput/UpdateInput e Info; remove é NoContent. run retorna RunResult e declara ScheduleNotFoundError 404/ScheduleRunError 500. Anotações descrevem ID existente como create idempotente, admissão do prompt, slot devido versus execução extra e falha não registrada.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** Idempotência, exclusão de slot, armazenamento e execução são implementação Core; a descrição não comprova scheduler distribuído nem exatamente uma vez. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.session-contract`, `s1.api.server-edge`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/schedule.ts` | CRUD e run de ScheduledTask; erros404/500 explícitos para run, descrição separa admissão e execução. | P41 |

## relay — 3 membros

**Propósito:** Authoring/publicação de Relay, instalação de hooks e leitura de execução externa.

**Necessidade L1 atual:** Separar drafts/versões/checks executáveis, manutenção explícita de hooks e auditoria auto-reportada de evidência aceita.

**Base factual nova:** RelayErrors carregam code/message sob 400/404/409/503, com Forbidden403 separado. Update declara versionId/expectedChecksum/force opcionais; publish exige versionId. Anotação de check nega execução pública com 403 Maestro; trial é endpoint distinto para comando de até 60s sem grading/registro. Hooks têm versões publicadas, order list completo e repair exige confirm:true. External run é read-only; DTO Audit admite pass/fail/pending, mas a anotação deste audit exige pending external-self-reported para cadeia íntegra, nunca pass.

**Profundidade:** All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.

**Limite / claim bloqueado:** A condição versionId-unless-force é descrição, não expressa como refinamento no Struct; checksums, trust, política de reparo e decisão pending precisam de implementação Server/Relay. Nenhum dado externo self-reported foi promovido a prova. A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.

**Contexto L1 existente:** `s1.api.boundaries`, `s1.api.server-edge`, `s1.api.surface-disposition`. Esses refs são navegação, sem aceite implícito.

| Membro exato | Observação material lida | Evidência nova |
| --- | --- | --- |
| `packages/protocol/src/groups/relay-document.ts` | Authoring e publicação; revision/checksum/force, recusa de check público e trial separado; versão publicada tem porta própria. | P37 |
| `packages/protocol/src/groups/relay-hook.ts` | Instalações versionadas, enable/disable/order/uninstall/decision read; repair explícito exige confirm:true e preserva ledger no uninstall. | P38 |
| `packages/protocol/src/groups/relay-run.ts` | Leitura de runs e ledger externo; audit schema admite pass, mas descrição exige pending para cadeia íntegra self-reported. | P39 |

## Limites de prova

Nenhum produto foi executado. Fontes não são resultados de OAuth, Git, instalação, scheduler, guards ou publicações. O Audit de Relay ilustra por que as camadas precisam permanecer separadas: a união do DTO permite pass, enquanto a anotação da rota externa afirma pending; só o handler pode estabelecer o comportamento implementado. As descrições de realpath/trust, ownership de request/attempt e proteção de arquivos também não surgem automaticamente de campos String.

A disposição é reversível: triage.json mantém cada registro histórico completo e adiciona o novo recibo de leitura, com pin/blob/SHA-256/span. O conjunto é exatamente G30; os outros 146 membros do finding B3 pertencem às triagens irmãs e não recebem cobertura por este documento.
