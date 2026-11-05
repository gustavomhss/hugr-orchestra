# Bootstrap HTTP de contexto — próximo recorte

**Estado:** predecisões do lead para materializar a aceitação; não congelado nem implementado. Depende do contrato local de `CONTEXT-WAVE.md`, não altera sua autoridade ou seu formato de recibo. S01/S02 e `BOOTSTRAP-WAVE.md` continuam normativos. Não é login Microsoft, C07 ou Studio integral.

## Resultado e fronteira

O cliente do servidor selecionado pode listar, criar explicitamente, resolver e revogar contextos sem fornecer uma Location anterior. Os providers por diretório só são montados depois da resolução. A ausência de projeto Git não bloqueia bootstrap, mas também não concede autoridade.

O Server compõe o domínio Fabric; Protocol depende apenas dos schemas canônicos. Client continua sem imports runtime de Core/Server. A raiz é configuração confiável do host: nenhum endpoint aceita root, directory, workspaceID, storageID, principal, nonce, grant ou maxContexts. Não usar `LocationMiddleware` para fabricar uma Location antes de conhecer o contexto. Não adicionar Fabric a `serverWideChapters` para contornar a resolução.

## Superfície proposta

| Operação | Transporte | Entrada canônica / saída |
| --- | --- | --- |
| `fabric.context.list` | GET `/api/fabric/contexts` | Query `after?`, `limit?` / Page |
| `fabric.context.preparing` | GET `/api/fabric/contexts/preparing` | mesma Query / Page, sem Location |
| `fabric.context.create` | POST `/api/fabric/contexts` | Create fechado `{}` / Info |
| `fabric.context.resolve` | GET `/api/fabric/contexts/:id` | ID no path, generation positiva na query / Info |
| `fabric.context.remove` | POST `/api/fabric/contexts/remove` | Ref fechado / Ref tombstone |

Query numérica é decodificada do transporte usando os campos canônicos, não outro modelo de contexto. Rotas literais não podem ser capturadas como IDs. Mutations exigem `idempotency-key` válido; resolve/read não ganha autoridade por carregar uma chave. O SDK gerado expõe esses métodos no cliente global, sem directory obrigatório. Depois de mudar HttpApi, executar `bun run generate` em `packages/client`; nunca editar os diretórios gerados diretamente.

## Autoridade e duração

Reusar `CapabilityAuthorization` e o mesmo `ServerOperator.Service` entregue ao domínio. Credenciais Basic configuradas e Bearer emitido são testadas separadamente; um header principal inventado não autentica nem muda o dono. A autenticação precede aquisição do domínio/root e qualquer seleção de Location. Frames privados de Core, não DTOs, carregam autoridade e chave. `ServerAuth` remoto não é login Fabric.

Preservar os modos existentes, não oferecer autenticações alternativas: composição com senha configurada aceita Basic válido e recusa Bearer-only; composição sem senha/embedded exige Bearer real emitido pelo operador dessa composição e recusa ausência, revogação, fábrica alheia e Basic-only. As fixtures positivas correspondem a cada modo; não tentar um positivo Bearer num servidor configurado com senha. Nenhum modo provisiona a raiz antes de autenticar.

Mapa factual para o cliente nativo: `apps/desktop/src/main/owned-serve.ts` gera senha efêmera por servidor e entrega `ORCHESTRA_SERVER_PASSWORD` ao processo; `apps/desktop/src/main/index.ts` publica as credenciais de conexão após health. `packages/app-shell/src/context/server-sdk.tsx` constrói `orchestra` com Basic da conexão selecionada e fetch limitado ao lifetime. Portanto o bootstrap deve capturar esse cliente efetivo, não gerar outro operador nem criar um endpoint anônimo de emissão de Bearer. O caso de conexão sem senha continua exigindo autoridade host-issued real; não tratar localhost ou `origin: desktop` vindo do request como grant. Esse mapa de fonte não qualifica ainda o fluxo no app.

O adaptador não guarda Info/refs/promises por ID sem owner/store. Uma chamada nova revalida autoridade e estado atuais pelo domínio real. Uma instância hospedada captura seu Database/storageID e raiz confiável; trocar servidor no cliente não retargeta uma operação pendente. Nenhum endpoint faz inventário, query, login, consentimento ou execução remota.

Configuração proposta: root padrão deriva de `Global.Service.data` em `fabric/contexts`; override somente na composição confiável `ServerRoutes.Options.fabricContexts.root`, nunca em request/config importado de workspace. O mesmo override é aceito por `createEmbeddedRoutes`. Inicializar o router ou montar handlers não provisiona essa pasta: a aquisição do domínio é preguiçosa dentro da chamada já autenticada. Tests de isolamento podem injetar a raiz por essa opção sem trocar o domínio por um mock. O operador entregue ao domínio é sempre o `ServerOperator.Service` da mesma composição, não outra fábrica com principal coincidentemente igual.

Erros de domínio usam somente os erros Protocol existentes, com mensagem pública fixa por código, sem copiar a mensagem interna:

| Código canônico | Erro Protocol / status | Mensagem fixa |
| --- | --- | --- |
| `invalid-input` | InvalidRequestError / 400 | `Fabric context input is invalid` |
| `denied` | ForbiddenError / 403 | `Fabric context access is denied` |
| `expired` | ConflictError / 409 | `Fabric context reference has expired` |
| `conflict` | ConflictError / 409 | `Fabric context request conflicts` |
| `limit` | ConflictError / 409 | `Fabric context limit is reached` |
| `unavailable` | ServiceUnavailableError / 503 | `Fabric context is unavailable` |

O código reservado `conflict` continua coberto pela projeção completa da álgebra, mesmo que a implementação local atual não o emita. Teste puro do mapper pode construir os seis erros canônicos reais; não substituir o domínio nas provas HTTP de execução. Falhas de autenticação/escopo de Core preservam o mapeamento já definido por `CapabilityAuthorization`, separado dessa tabela. Respostas nunca serializam Cause, stack, SQL, marker, nonce ou caminhos de falha. O único caminho exposto é a Location válida e autorizada do Info de sucesso. Não distinguir desconhecido de outro owner.

## Aceitação a materializar antes do freeze

| ID | Prova pretendida com HTTP, domínio e persistência reais |
| --- | --- |
| FHT01 | Clientes sem Location usam as cinco operações no router real; root sintético fora de Git, migração real, Info/Ref/Page canônicos; nenhuma criação implícita em list/preparing/resolve. |
| FHT02 | Sem autenticação, Basic inválido, Bearer ausente/revogado ou de outro operador não criam root/reserva. Positivos usam Basic configurado e Bearer real de Core, não middleware substituído. |
| FHT03 | Excesso de propriedades/query de placement/principal é recusado, não ignorado para fabricar outro alvo; payload inválido, ID/generation/cursor/limite inválidos e chave ausente/malformada não mudam SQL/filesystem. |
| FHT04 | Mesmo create/remove com chave e novo cliente HTTP reusa o recibo real; replay sob autoridade atual insuficiente é recusado; outro owner/store/root não acessa refs, mesmo com Project.global compartilhado. |
| FHT05 | Pasta danificada torna resolve indisponível sem reparo; remove continua possível sem abrir/deletar a pasta. Tombstone/stale/unknown têm status e envelope públicos fixos, sem detalhes privados. |
| FHT06 | Reserva real interrompida pode ser descoberta/cancelada pelo transporte sem projetar Location; cancelar não publica, prepara nem remove arquivos. |
| FHT07 | Cliente gerado, OpenAPI e HttpApi compartilham os schemas canônicos e endpoints de bootstrap sem LocationQuery; barrel puro não passa a carregar Core/Server. |
| FHT08 | Montagem no router padrão e no embedded usa configuração host-owned e o mesmo operador real; não basta testar um router privado que o produto nunca registra. |

Fixtures isolam DB/raiz/operador reais e evitam perfil instalado, credenciais reais e rede Microsoft. Não executar testes localmente. Fonte do serviço local deverá estar qualificada antes de chamar qualquer green HTTP de prova integrada. Revisão fria da suite, RED intencional, contrato mínimo e contraprovas do transporte precedem integração. A seleção afetada não substitui a qualificação conjunta posterior do capítulo nativo.
