# R02 — listener local do callback

**IMX04, primeiro corte, freeze solo antes do scaffold.** Só o transporte loopback que entrega o redirect ao `receive` já qualificado. Não é HttpApi, Client gerado, UI, claim, exchange, publicação nem login. Sem agentes, credenciais reais, restart, full/epic, merge dev ou release. Review independente continua pendente.

## Fatos

- O perfil desktop já admite somente `http://localhost:<porta>/api/fabric/oauth/callback`. `127.0.0.1` e `[::1]` continuam fora desse perfil. Esta fatia não alarga isso.
- `receive` é síncrono, não tem banco nem operador, e só guarda a URL se o state bater com o registro. O listener não pode virar outra autoridade.
- O redirect não é uma rota do servidor Orchestra. É um socket loopback da porta do perfil, para o browser voltar sem cookie de sessão.

## Contrato

`FabricIdentityListener.make({ callbacks, profile })`, Scope-owned, sem package export/HttpApi. Só perfil desktop já admitido. Escuta **somente `127.0.0.1` na porta do redirect**. A URL entregue a `receive` é montada do redirect admitido mais a query recebida. O header `Host` não escolhe origem, porta nem path.

Aceita um GET no path exato, sem body, query até 8 KiB, um request por vez. Resposta 200 é uma página fixa, sem query, code, state ou erro remoto. Path, método, tamanho ou query inválida não chamam `receive` e não ecoam o alvo. Fechar o Scope fecha o servidor. Não chama claim, exchange nem publish.

## Aceitações LST01–03

1. Registro real, GET HTTP no socket ligado, claim vê o code, e o corpo da resposta não contém o code.
2. POST, path errado, query extra e `Host` estrangeiro não entregam. O GET válido seguinte ainda entrega uma vez.
3. Depois do controle positivo, fechar o Scope recusa a conexão seguinte e não entrega callback tardio.

Ainda não executadas. HttpApi, Client e UI manual ficam no corte seguinte do IMX04. Sem conta Entra, Windows ou review independente.
