# R02 — host contextual de exchange

**IMX02, freeze solo antes do scaffold.** Consome IMX01 local já qualificado, sem elevar candidato/proof/ticket a Authority. Sem agentes, restart, credenciais reais, full/epic, merge dev ou release. Publicação account/cache/conexão continua IMX03; listener/HTTP/UI, IMX04. Review independente permanece pendente.

## Fronteira e ownership

`FabricIdentityExchange.make(options)` é interno, sem export de package, tool, HttpApi ou DTO. Opções host: opções de IDA02, receiver IDA03 do mesmo Scope, network nativo IJW/IMX01, certificado CCA opcional e limite de conclusões efêmeras (default 16, máximo 64). Não recebe verifier/chaves/material/code/Authority por seleção. `exchange({context, attempt, ticket})` captura refs e a identidade do ticket em call-time, não o frame da invocação. Não fazer structuredClone do ticket: identidade é runtime-local. Readiness não concede acesso.

Na execução, exigir operador/Location atuais com `fabric.identity.exchange`, ausência de transaction ambiente e tuple exchanging/3 estável. Ler IXM original/2, carregar IJW e validar configuração MSAL/CCA antes de consumir ticket. Revalidar então consumir IDA03 uma vez; nenhum retry/reconstrução de code/ticket após consumo, Scope perdido ou resultado remoto desconhecido. Falha de preflight não gasta ticket. Sem crypto/rede dentro de transaction SQL e nenhuma escrita/reseal de segredo.

## Bridge limitada e frame real

Um único pedido POST por operação. `INetworkModule` apenas coloca `{url, options, resolve, reject}` numa mailbox **call-owned de uma entrada**; sem Context/Authority/services singleton e sem `Effect.runPromise` para realizar autorização no callback. Worker Effect filho é criado sob a invocação atual e dentro da Scope da operação; admite o pedido com guard real antes de abrir o transporte. Recusar GET, pedido extra, callback tardio e URL/correlation que não sejam exatos. O transport host executa o Effect de admissão no worker, não na Promise MSAL. Guard após resposta antes de criar conclusão efêmera; conclusão só sai depois de assinatura/nonce/account de IMX01.

O transporte POST precisa também de admissão após TLS verificado e antes de enfileirar body/code/PKCE/assertion. Não inferir esse guard de `sendPostRequestAsync`: hoje IMX01 chama `req.end(body)` e o transporte nativo agenda TLS/escrita. A implementação IMX02 deve separar readiness TLS da entrega do body, manter parser/erro/teardown e executar o guard no child Effect que aguarda readiness. Headers fixos sem credenciais podem iniciar conexão; nenhum code/assertion passa por TLS não verificado. Não prometer que revogação local e transmissão remota são uma transaction atômica: a janela depois do último guard é risco residual, e revogação após envio recusa a conclusão mas não desfaz a transmissão já feita. Qualificar essa divisão com native TLS real antes de materializar IMX02.

Fechar operação/Scope rejeita Promise pendente e interrompe worker/request. Deadline nativa deve exceder a janela do oracle de interrupção, para não esconder abort perdido. Usar o FD positivo antes e ausência depois, antes da cooperação da fixture. Não transformar timeout/infrastructure error em prova de revogação.

## Conclusão privada e futura publicação

Retorno `Completion` é identidade opaca congelada registrada no host/Scope, não Candidate serializável. Map limitado e limpeza em Scope; nenhum segredo no handle. `consume({context, attempt, completion})` revalida operador/Location/tuple atual e entrega o candidato uma vez **somente ao futuro publisher backend**. Erro de consumo não autoriza outro contexto; cópia/JSON de Completion é negada. Não armazenar Authority na entrada. Conclusão perdida não reexecuta provider; nova autenticação exige nova tentativa explícita. Este seam não publica cache ou conexão e não torna o login utilizável.

## Aceitações CXH01–06 iniciais

1. Preparo/callback/claim/cifra/discovery/MSAL/JOSE/TLS reais: um POST, handle opaco, consume backend autorizado uma vez; SQL e ciphertext sem escrita/publicação. A necessidade do frame no worker será demonstrada por autorização real, não mock que sempre retorna void.
2. Falta de invocação/Location, outro contexto/perfil e SQL ambiente recusam antes de rede/provider. Captura das refs não captura autorização; operação construída sob frame não funciona depois de ele acabar.
3. Preflight JWKS/configuração recusado preserva ticket, que o receiver real ainda pode entregar; sem POST. Controle positivo separado evita scaffold verde por recusa constante.
4. Exclusão real de contexto durante fetch de keys e durante resposta POST impede transmissão ou conclusão respectivamente; injeção wire/SQL não depende do guard que uma contraprova removerá. Depois de code enviado não há retry automático.
5. Interrupção com POST real ativo fecha FD e não recompõe ticket; callbacks tardios não publicam Completion. Guards de TLS/body requerem controle nativo adicional antes do aceite final.
6. Completion copiada, contexto errado, reconsumo e Scope fechado recusam; capacidade limitada e refs capturadas não permitem retarget. Preflight/resultado não podem ser persistidos em receipts/logs.

Scaffold/RED dessas aceitações antes de implementação. Acrescentar controles de TLS/body, mailbox tardia e concorrência antes do restauro final, registrando-os como adições posteriores ao RED se necessário. Não repetir IDA/IXM/IDV/JWK/MXC inalterados apenas por retomada; parser nativo alterado exige regressão realmente afetada. Sem alegação de conta Microsoft/Windows/distribuição ou entrega Studio integral.
