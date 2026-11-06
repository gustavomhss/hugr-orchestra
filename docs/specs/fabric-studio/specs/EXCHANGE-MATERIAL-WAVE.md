# R02 — material protegido para o exchange host

**IXM01, freeze solo antes do scaffold.** Consome IDA02/IDA03/IDV01 no alcance registrado. O próximo host precisa ler nonce/verifier reais sem chamar `prepare` sobre exchanging/3 nem reemitir state/PKCE. Não inicia MSAL exchange, transport/JWKS, cache, conexão ou login UI. Nenhuma credencial real/restart/agent delegado. Review independente continua pendente.

## Contrato e vínculo explícito de revisões

`FabricIdentityExchangeMaterial.make(options)` é seam **interna, sem package export/DTO/schema wire/tool**. Usa Database/Project/CredentialCipher existentes e as opções host de IDA02. `read(Selection)` captura refs na construção do Effect, não Authority/Location. Exige `fabric.identity.exchange`, operador e Location atuais. Só aceita metadata **exchanging/revisão 3** com segredo **revisão 2** (original pending). Nenhum parâmetro escolhe revisão do segredo, scope, nonce, perfil ou redirect.

Autenticar o envelope original com a tuple derivada da row atual, substituindo **somente** revisão por 2 (estado não participa da tuple). Todas as demais partes — store/principal/contexto/generation/Location/projeto/attempt/perfil/scopes/createdAt/deadline — continuam exatas, inclusive prazo sem renovação. Compartilhar schema/decode/tuple de envelope entre preparo e leitor interno em `identity-envelope.ts`, sem alterar bytes/formato de IDA02. Não aceitar ciphertext/nonce/claims vindos de request. Envelope original limitado a 16 KiB, sealed a 32 KiB e bytes exatos; crypto fora de SQL, sem ambient transaction. Guard/contexto/tempo antes e depois de decrypt, read estável do ciphertext antes do retorno. Ausência/corrupção/revisão/tuple/chave erradas recusam sem escrever/resealar nem gastar code/ticket.

Retorno backend efêmero imutável: `{verifier, nonce, correlationID, scopes, redirectUri, createdAt, expiresAt}`. Não retornar state/challenge/ciphertext/URL completa/Authority/token. É material sensível, não progresso/modelo/log. Ler não fornece code, não constitui login ou prova de identidade, não muda estado e não concede permissão remota. A futura composição deve ler material e confirmar ambiente/credential/JWKS antes de `callbacks.consume`; então consumir code uma vez e revalidar para executar o provider. Falhas depois de consumir code não permitem retry automático/recriação de ticket. Este WP não qualifica a composição ainda inexistente.

## Ownership e aceitações EXM01–06

Novos service/contrato/fixture/testes internos e helper de envelope; refactor mínimo de `identity-preparation.ts` para usar o helper único. Sem Core/Schema/DDL/dependência/HttpApi/Client/exports novos. IDA02 PKP afetado será regressão real; callback e IDV inalterados não são repetidos por retomada.

1. Preparo/callback/claim reais: metadata/3 e segredo/2; leitura abre cifra real e corresponde ao material/URL; scopes/redirect/prazo só do host/envelope; nenhuma escrita/receipt sensível, retorno frozen.
2. Pending/denied/cancelled, binding/Location/perfil/contexto errados recusam antes do decrypt (controle positivo conta crypto real).
3. Mesmo deadline e dois envelopes autenticados de tentativas distintas: substituição, revisão de segredo e corrupção recusadas com bytes preservados.
4. Revogação real depois do decrypt impede retorno; expiry/clock inválido e SQL ambiente recusam, sem reencryption.
5. Chave errada/falta/ciphertext ausente não gasta ticket; continuação direta já qualificada ainda pode consumi-lo uma vez, sem afirmar provider work.
6. Refs capturadas antes de mutação; troca do ciphertext após decrypt detectada antes de retornar material. Nenhuma Authority capturada com refs.

Scaffold compilável/RED via test:ci; implementação; regressão afetada PKP; contraprovas tuple de revisão, guard pós-decrypt e estabilidade do ciphertext; restauração exata. Gates estáticos/guards, candidato publicado e materialização própria sem staging/reset primária. Sem full/epic, dev merge ou release.
