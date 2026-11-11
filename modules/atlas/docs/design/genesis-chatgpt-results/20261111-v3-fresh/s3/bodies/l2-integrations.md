# Especialistas e integrações — entendimento local L2

Fonte fixa: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`. Predecessor aceito: `s3-l1-integrations`; relações de seats usam também `s3-l1-maestro`. Oracle congelado: `oracles/L2-all.json`, casos L2-C1 e L2-C2. Este corpo descreve contratos locais; não ativa providers, presets, Dock ou Janitor.

## 1. Três tipos de coisa que não podem ser confundidos

1. **Assets de capacidade e skills:** texto, manifestos, presets e árvores embarcáveis. Podem descrever uma integração sem fornecer credencial, conexão ou grant.
2. **Adapters de execução:** traduzem turns e ferramentas entre Core e um provider, preservando Session, autorização e lifetime.
3. **Integrações de host/desktop:** dependem de transportes, canais, tokens e estado fornecidos pela composição real.

Um catálogo torna um item descobrível e preserva proveniência. Não o torna conectado, autenticado, qualificado ou aprovado ao vivo. Um adapter existente não dá autoridade ao modelo para atravessar tools. Um módulo com nome de desktop não prova que seu estado in-memory está ligado ao store do app.

## 2. Novo preset e tentativa de usar Claude Agent/Task — caso L2-C1

Adicionar um preset em `capability-assets` é uma mudança de dados. O item continua `source-qualified`/candidato até passar a qualificação e integração específicas. Não há conexão, credencial, live acceptance ou grant apenas porque o catálogo o lista.

Na execução Claude:

- `ExecutionHost` e Core continuam donos da Session. O adapter recebe `Turn` com history, context, tools filtradas, `execute`, `authorize`, estado e steers.
- O system prompt precisa permanecer no preset estrutural `claude_code`; contexto Orchestra entra por `additionalContext`. Um cast ou preset de catálogo não autoriza prompt arbitrário.
- Claude `Agent`/`Task`, `ListAgents`, `SendMessage`, `RemoteTrigger` e `PushNotification` são recusados. Delegação permitida usa `mcp__orchestra__task`, que cria a child Session durável.
- Built-ins passam por `turn.authorize`/ToolSafety. Tools Orchestra passam por `turn.execute` no registry. `ToolSearch` carrega schema; não autoriza a operação.
- `PreToolUse` e `canUseTool` compartilham a decisão por tool-use id para não divergir, mas uma allow rule local do provider não é bypass do host.
- Tools `maestro_*` exigem que `maestro-run-governed` seja carregado com sucesso pela tool `skill` do MCP Orchestra naquela Session. O Set é in-memory e se perde no restart.
- `maestro_arsenal_*` e `maestro_workflows` são exceções apenas ao pré-requisito de load; continuam sujeitos às próprias permissões e contratos.
- Carregar playbook não equivale a owner approval, reservation ou permission snapshot.

Logo, nem o preset fica “live” por catalogação nem Agent/Task é um caminho alternativo. O caminho correto preserva child Session, gates e tools Orchestra.

## 3. Dock incerto e Janitor indisponível — caso L2-C2

O Dock tem duas superfícies de permissão diferentes:

- **Hooks diretos:** checam host/permission e handler na ordem definida pelo contrato da interface.
- **MCP/interface RPC:** depende de interface registrada, tool/capability permitida e do canal real. Não herda automaticamente a ordem ou a authority do hook direto.

No desktop, o transport relevante usa Electron main e loopback WebSocket com URL/token por launch. `fromEnv` ausente significa que o processo não recebeu a configuração; não se inventa token nem se reutiliza credencial de outro launch. Fora do desktop, sem canal, a integração está indisponível.

Resultado de ação deve ser distinguido:

- `success/failure` observado: seguir o receipt.
- `stale-not-dispatched`: a regra específica pode permitir no máximo o retry delimitado.
- `unknown/uncertain`: a ação pode ter sido despachada; não repetir automaticamente quando duplicação é perigosa.
- `channel-unavailable`: corrigir a composição/transport, não simular sucesso.

O reaper Linux ligado a Session deletion pertence ao lifetime do Dock; não concede a Janitor o poder de matar processos.

Janitor é scanner/read-only. Ele detecta órfãos/candidatos e emite report por sink fornecido pelo host. Não remove, mata, reinicia, limpa credenciais ou resolve ações Dock incertas. Falha de scanner é `unavailable`, não “nenhum órfão”. Há state/scheduler no módulo, mas o consumo pelo desktop/store precisa de composição observada; nome semelhante não é prova.

## 4. Especialistas e assets

`backend`, `archie` e `jimmy` têm IDs canônicos e contratos diferentes. Skills próprias são assets declarados e embarcados; o seat recebe somente roots e tools compatíveis com seu profile. Documentos históricos de Jimmy, charter e handoff preservam contexto datado; a implementação atual usa duas skills e Session filha via `task`. Conflito documental não deve ser apagado nem promovido a bloqueio universal.

Capability assets reservam nomes/destinos e preservam fonte/licença. Até prova contrária:

- catálogo é data-only;
- provider/destination reservado não é conexão;
- texto adaptado não é autoridade executável;
- itens não carregados por um seat não estão disponíveis a ele;
- dependency integrity, conformance e live acceptance pendentes continuam pendentes;
- economia/custo não observado é `UNKNOWN`, não zero.

## 5. Lifetime e recuperação Claude

O adapter reutiliza/deriva session ID estável e mantém tails por Session. Antes de novo turn, fecha a tail anterior; trabalho background pode reter query até notificar, terminar ou atingir o limite. `processLifetime.join()` espera exit real; `Query.return` ou abort não são recibos de processo encerrado. Conta é consultada sem prompt; falha preserva último signed-in observado e não prova sign-out. Login explícito tem slot próprio e não deve ser iniciado como recuperação automática.

SDK e executable têm versões pinadas e targets próprios. Não transferir a matriz de suporte do backend toolkit para Claude nem vice-versa.

## 6. Checklist local de diagnóstico

1. Identifique Session, seat canônico, engine e owner real.
2. Confirme tool visível e qual porta a executa (`authorize`, `execute`, hook ou MCP).
3. Para governed tools, confirme load naquela Session e bindings de approval separados.
4. Para Dock, confirme desktop/channel/URL/token reais antes de qualquer ação.
5. Classifique resultado certo, failure, stale-not-dispatched, unknown ou unavailable.
6. Para Janitor, leia scanner/report/sink; nunca use-o como cleaner.
7. Preserve conflitos históricos e marque runtime/CI/live acceptance como `NOT_RUN` quando não exercitados.

Este L2 não conectou provider, não abriu Dock, não executou Janitor e não validou presets ao vivo.
