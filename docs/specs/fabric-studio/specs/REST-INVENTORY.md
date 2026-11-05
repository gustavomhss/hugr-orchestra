# REST de inventário — contrato de preparação

**Estado:** decisões do lead para a próxima fatia de S03/S06; ainda sem implementação, API Studio ou qualificação remota. Não congela OAuth, UsePermit ou persistência. Requisitos proprietários: FS-CAP-001–007, FS-DIS-001/002/004/005, FS-FAB-001–003; a aceitação canônica não muda.

## 1 Fontes e operações selecionadas

O lead reabriu as três referências Microsoft em 2026-11-04. Caminhos são relativos exclusivamente a `https://api.fabric.microsoft.com`; versão `v1` faz parte do path. Nenhum registro/tenant ou token foi usado.

| Operação | Método/path documentado | Permissões/scopes documentados | Fonte/revisão observada |
| --- | --- | --- | --- |
| Listar workspaces acessíveis | `GET /v1/workspaces` | `Workspace.Read.All` ou `Workspace.ReadWrite.All`; o texto limita ao principal atual, não declara um papel mínimo adicional | [List Workspaces](https://learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/list-workspaces), `updated_at` 2026-09-24, commit de origem `9feaea0cb4ae5c7942ca78399640061545c3df95` |
| Listar itens de um workspace | `GET /v1/workspaces/{workspaceId}/items` | “The caller must have a viewer workspace role.” Mesmas alternativas de scope de workspace | [List Items](https://learn.microsoft.com/en-us/rest/api/fabric/core/items/list-items), `updated_at` 2026-10-22, origem `5df184c567fafea7284357607ebac79d6301a698` |
| Ler metadados de um item suportado | `GET /v1/workspaces/{workspaceId}/items/{itemId}` | Read do item; `Item.Read.All` ou `Item.ReadWrite.All`, ou alternativa específica do tipo | [Get Item](https://learn.microsoft.com/en-us/rest/api/fabric/core/items/get-item), mesma revisão de origem de List Items |

São candidatos `metadata-read`, não grants nem fontes de definição/dados. Os três documentam 200 e 429 com `Retry-After` inteiro em segundos. Quotas publicadas de 500/min não são budget concedido ao Studio nem throughput garantido. Readiness continua `unverified` até implementação, autorização e qualificação contextual.

Não inferir suporte de Get para todos os tipos enumerados por List. Tipos desconhecidos conservam metadados seguros e não recebem editor, query ou run genérico. `defaultIdentity`, quando devolvida, não é a identidade autorizada do request nem licença para impersonação.

## 2 Requests delimitados

- IDs de rota são UUIDs do provedor validados, não paths, aliases, labels ou IDs locais `fctx_`/`fconn_`. A resolução contextual preserva todos os campos de FabricResource.Ref; a URI não escolhe conexão, conta ou tenant.
- A primeira implementação pede somente os dados necessários. `include=DefaultIdentity` e endpoint específico de workspace não são opções implícitas; nomes/UPNs de identidades não precisam ser coletados para inventário básico.
- List Items fixa explicitamente a política de `recursive` e `rootFolderId` no request autorizado. A referência documenta `recursive=true` como default do provedor; omitir o parâmetro não pode fingir uma leitura de pasta única.
- `roles` em List Workspaces é filtro por papel do chamador, não uma concessão. Tipo, prefixo de nome e demais filtros da operação Studio não se tornam query parameters livres; um filtro local também integra a identidade do cursor.
- Não usar `apiEndpoint` devolvido pelo inventário como novo destino de bearer. O escopo inicial é nuvem pública; private links/hosts regionais exigem qualificação e política explícitas, não descoberta seguida de confiança automática.

## 3 Resposta externa e projeção segura

Os DTOs do provedor são extensíveis; não copiar a política de objetos wire Studio fechados para rejeitar toda nova propriedade Microsoft. Validar a projeção realmente consumida e descartar campos não usados, sem expô-los genericamente no frontend, ferramentas ou logs. Isso não autoriza descartar partes desconhecidas de uma definição editável, que é outro contrato.

As tabelas **Definitions** não assinalam requiredness de cada campo de resposta. A implementação poderá exigir campos mínimos para construir uma observação íntegra, mas deve identificar isso como requisito do consumidor, não garantia citada da Microsoft. Ausência/tipo inválido de campos consumidos produz resposta inválida/partial, não valores inventados.

| DTO documentado | Campos relevantes e tratamento decidido |
| --- | --- |
| Workspace | `id` UUID; `displayName`, `description`; `type` string extensível; `capacityId`, `domainId`, `capacityRegion`, `tags`, `apiEndpoint` opcionais conforme exemplos. Não converter tipo/região desconhecidos em suporte conhecido. |
| Item | `id`, `workspaceId` UUID; `displayName`, `description`; `type` extensível; `folderId`, `logicalId`, `tags`, `sensitivityLabel`, `defaultIdentity` podem não estar presentes nos exemplos. `logicalId` explicitamente admite null. A projeção verifica workspace/ID contra o destino esperado antes de publicar uma referência. |
| Workspaces/Items | `value` array da entidade correspondente; `continuationToken` e/ou `continuationUri`. [Pagination](https://learn.microsoft.com/en-us/rest/api/fabric/articles/pagination) permite ausência ou null no esgotamento. Página vazia com continuação não prova fim. Falta de `value` não vira array vazio completo. |
| ErrorResponse | `errorCode`, `message`, `requestId`, `isRetriable`, `moreDetails`, `parameters`, `relatedResource`. Não ecoar mensagem/parameters/body bruto; podem incluir dados sensíveis. Problemas públicos usam códigos/chaves i18n canônicos de FabricObservation. |

IDs, tipos e labels continuam texto/dados inertes. Nem HTML no label nem nomes de propriedades especiais podem virar código, chave herdada, import, comando ou autoridade.

## 4 Continuação e transporte sem escalada

Cursores públicos Studio são opacos, server-owned e vinculados à tupla completa de S06, nunca URLs de próxima página entregues ao frontend para execução. Reinício pode expirar um cursor em memória; não criar store durável paralela para evitar essa expiração.

Para a próxima página remota, preferir reconstrução do endpoint preparado com token opaco. Não interpretar/decode manualmente tokens como paths ou comandos; serializar query por API de URL, preservando seu valor. Se for necessário consumir somente `continuationUri`, validar antes de qualquer bearer/fetch: HTTPS, host/origin inicial exatos, sem userinfo/hash/porta alternativa, path do mesmo endpoint e IDs, e somente parâmetros permitidos compatíveis com os filtros autorizados. Alterar workspace, tipo, pasta, papel ou conta exige novo percurso, não seguir silenciosamente. Divergência entre sinais de continuação não deve gerar marca de completude.

Redirect remoto não é seguido automaticamente com bearer. Limites de páginas/itens/bytes/tempo se aplicam ao percurso inteiro; atingir budget retorna parcial com `limit`, sem pré-buscar página por montagem de painel. Retry-After em 429 adia/reporta; não dormir indefinidamente nem repetir até sucesso. Nenhuma mensagem de erro habilita shell, browser, audience alternativa ou scope mais amplo.

A definição de audience/JWT e a emissão de UsePermit continuam em S02/S03: o [quickstart](https://learn.microsoft.com/en-us/rest/api/fabric/articles/get-started/fabric-api-quickstart) usa scopes `https://api.fabric.microsoft.com/...`; referências em outro contexto usam audience diferente. Não unificar por suposição nem procurar credenciais no host. Falta de confirmação impede qualificação remota, não os testes de transporte hostil com fixtures.

## 5 Próxima prova necessária

Antes de dispatch do adaptador: congelar os schemas/projeções, budgets menores ou iguais à política, interface do host autorizado existente e a suite RED. A suite deverá isolar positivos/negativos de cada operação, requiredness do consumidor, nulidade/ausência de continuação, página vazia intermediária, escape de origem/escopo, redirects, erro versus vazio, throttle, limites, unknown types e resposta tardia após mudança de geração. Fixtures provam parser/controle de transporte; só um tenant explicitamente autorizado qualifica a operação real.

Get notebook definition e Job Scheduler continuam subcontratos separados. O primeiro usa POST, read-write permissions e possível LRO; o segundo tem estados extensíveis e Retry-After também em 200. Nenhum deles entra nesse adaptador de inventário por similaridade de URL.
