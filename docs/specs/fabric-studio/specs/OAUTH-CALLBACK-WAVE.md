# R02 — inbox privado e claim de callback

**IDA03, freeze solo antes do scaffold.** Consome IDP01/IDA01/IDA02 aceitos no alcance registrado. Não ativa listener/HttpApi, troca de tokens, JWT, cache ou conexão. Sem agente delegado; crítica independente continua pendente. `pending` ainda não é autenticação Microsoft.

## Contrato e separação de autoridade

- `FabricIdentityCallbacks.make(options)` é Scope-owned, usa as opções host de IDA02 e `maxEntries` (default 64, hard máximo 256). Um host instala uma instância por perfil/processo. Ao fechar o Scope, limpa inbox/tickets e recusa continuação; não toca no banco para inventar uma autoridade de limpeza. A composição HTTP/listener ainda será outra fatia.
- `register(Selection) -> Prepared` exige ação `fabric.identity.callback.register`, operador e Location atuais. Chama preparo real autorizado, pega o state **da URL emitida pelo domínio**, valida que a tentativa permanece pending/revisão 2 no contexto/perfil atuais e registra `(state, context Ref, attempt Ref, createdAt, expiresAt)` em memória. Nunca recebe state, owner, Location ou grant de JSON. Retry mantém callback já capturado; não substitui uma resposta válida por outra. Não salva URL/state/code em recibo SQL. Quota inclui tanto slots quanto tickets não consumidos; expiração/Scope limpam memória sem prometer secure-zero de strings JS nem limpeza de backups.
- `receive(unknown): void` é síncrono e não recebe Effect/services/Authority. Faz parse limitado de URL (16 KiB), encontra registro privado pelo state (32 bytes aleatórios de IDA02), usa `FabricIdentityProfile.callback` real com o expectedState registrado, aceita só o primeiro callback válido e guarda **somente** `{outcome:code, code}` ou denied. Hints e descrições nunca persistem. Sem SQL, decrypt, token, rede, operador reconstituído ou metadados retornados ao remetente. Inválido, expirado e duplicado são ignorados sem oracle de existência no retorno. O futuro adapter deve fornecer a URL real validada pelo host, não um parâmetro livre dizendo qual seria a origem.
- `claim(Selection) -> {attempt, outcome:denied} | {attempt, outcome:claimed, ticket}` exige ação `fabric.identity.callback.claim`, operador/Location atuais e o mesmo contexto/perfil/deadline. Só pending/revisão 2 com callback capturado pode fazer CAS para **exchanging/revisão 3** (code) ou **denied/revisão 3** (erro remoto sanitizado). Denied remove segredo na mesma transação; code mantém o envelope original revisão 2 para o futuro exchange host. Claim não decripta PKCE nem verifica identidade. SQL contém apenas metadados/Ref, nunca code.
- Ticket é objeto runtime imutável opaco, não serializável como licença e sem code/owner/grant em propriedades. Só a identidade emitida nessa instância pode ser consumida; cópia/JSON não funciona. Um ticket **não é Authority**.
- `consume({context, attempt, ticket}) -> {code}` é seam privada do futuro exchange host, sem registro em tools/HttpApi. Exige ação `fabric.identity.exchange`, operador/Location/contexto/perfil e row exchanging/revisão 3 atuais, além do ticket runtime. Revalida antes de remover o ticket em uma etapa síncrona de uso único; dois consumidores não recebem o mesmo code. O code nunca é DTO de progresso/modelo/log. Outros dados esperados (nonce/verifier/conta) não vêm do callback; integração de material com exchange será outro WP.

## Persistência, falha e limites

Extender a união tipada de estado/Schema.Info e o guard interno apenas para exchanging/3 e denied/3. Denied é terminal, mesmo depois do deadline; cancelar exchanging ainda é conflict, sem fingir que uma chamada remota já iniciada foi cancelada. Não há novo DDL/tabela/crypto/dependência. Existing preparing/pending/cancelled e seus gates permanecem regressão afetada. Claim retorna uma Ref nova; não usa CapabilityRequest para serializar ticket/code. Lost outcome após CAS/queda do processo exige reinício explícito, **não** recriação de ticket a partir de SQL ou repetição automática de code. Tentativa em exchanging não volta a pending. Restore/backup anti-rollback continua não provado.

Materialize ticket somente depois de confirmar CAS e revalidar current authority/context. Se Scope/slot sumir após commit, retornar falha honesta, sem reconstruir entrega. Falhas de claim não removem callback nem alteram segredo. Consume falho por autorização não gasta ticket; consume bem-sucedido o gasta antes de entregar code. Quota/deadline/Scope são limites de memória local, não medição de heap nem suporte clustered. Nenhum timer usa principal persistido para agir como operador.

## Ownership e aceitações CBC01–08

Novos `identity-callback.ts`, contrato e testes/fixture próprios; package export do serviço host. Delta mínimo de estado em `identity-attempt/sql.ts`, Schema.Info, `identity-attempt-access.ts` e terminal projection em `identity-attempt.ts`. Guias/DELIVERY atualizados. Sem Core trust changes ou generated Client.

1. Registro real + receive fora de invocação não faz SQL/cifra; callback de code não altera pending antes de claim autorizado; ticket/ref não expõem code; hints descartados.
2. State/destino/duplicatas/fragmentos/code excessivo inválidos não enfileiram; callback válido depois de inválido funciona; uma segunda resposta válida não substitui a primeira.
3. Dois claims concorrentes têm um vencedor; CAS durable exchanging impede re-registro/claim após novo serviço; cópia de ticket negada; dois consumes têm uma entrega.
4. Denied sanitizado só conclui sob autorização viva; remove segredo atomicamente; permanece terminal após prazo sem criar conexão.
5. Falta de Authority/Location, contexto/perfil/principal incorretos e grant restrito negam claim/consume sem gastar callback/ticket. Revogação entre resolução e writer não publica claim.
6. Expiração, relógio inválido/regressivo, quota, retry registrado e Scope fechado são recusas explícitas sem renovação ou captura de frame.
7. Claim tardio ou interrupção após SQL não recria ticket; novo serviço não reconstitui code/Authority de JSON; primeira autorização não concede token/identidade.
8. Guarda de contexto dentro de SQL e exclusão CAS são provadas por contraprovas comportamentais; sem mocks de MSAL/cifra/banco. Usa callback parser real já qualificado, sem rerodar IDP01 por retomada.

Scaffold compilável e RED focado `test:ci` antes de implementação; typecheck local de pacote, regressão afetada e contraprovas/restauração exata no CI. Windows armazenamento, listener/TLS e Entra continuam não qualificados; nenhum skip/bypass. Full/epic só no bundle final; fechar este WP não fecha a campanha.
