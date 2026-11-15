# Resposta original do produtor — AUTOMATION-L1 v3

Apliquei exatamente as três correções documentais autorizadas. Corpo/receita v2 foram preservados integralmente em history/; suplementos1/2 e seus índices/recibos permanecem idênticos. Não houve mudança do produto.

## AUT3-DELTA-01 — §7.2

Antes:

> Estado scoped-red resulta de fail mais recente; scoped-green precisa de requisitos existentes e pass dos caminhos requeridos; sem requisito, retorna null. Um check error/pending não vira pass.

Depois:

> O estado usa o resultado mais recente por `(kind, command)` no tree: qualquer `fail` produz scoped-red e, sem requisito configurado, retorna null. Para scoped-green, basta algum check `scoped` com `pass` quando há scoped.tests, além de um `pass` por workflow exigido. Isso pode coexistir com outros checks scoped `pending`/`error`; não prova que todos os comandos scoped passaram.

Intervalo v2 `[37127, 37320]`; intervalo v3 `[37127, 37510]`; linha `218`.

## AUT3-DELTA-02 — §7.2

Antes:

> Workflows são enviados uma vez por tree/arquivo no ledger observado.

Depois:

> Para o card, o ledger evita novo dispatch do mesmo workflow no mesmo tree quando já existe row com outcome diferente de `error`; se houver apenas rows em `error`, permite outra tentativa.

Intervalo v2 `[37328, 37397]`; intervalo v3 `[37518, 37706]`; linha `220`.

## AUT3-DELTA-03 — §7.3

Antes:

> Subscription engine ou preço ausente é `not-metered`, e mistura de medido/não medido pode ser parcial.

Depois:

> `spend.card` considera medida a Session com custo positivo cujo provider não é `claude-code`; não medidas entram na outra classe apenas se têm tokens. O meter de modelos é `not-metered` sem Sessions vinculadas, ou se não houver Session medida e houver não medidas com tokens; nos demais casos retorna `usd`, inclusive `usd:0` com ambas as classes vazias. A coexistência de medidas e não medidas com tokens marca `partial`.

Intervalo v2 `[38086, 38191]`; intervalo v3 `[38395, 38826]`; linha `224`.

## Identidades

| Arquivo | Bytes | SHA256 | Git blob SHA1 |
| --- | ---: | --- | --- |
| history/body-v2.md | 59953 | e9c89bea68d594bc61356ff461642ea23cd905d4584f2b52d32e10a5af984e55 | b8fec4854b4c1384d3c4a2a4f0d51d220c874618 |
| history/recipe-v2.json | 28464 | 2bed1778e629415d5bc7c818773ef18b012a8a0bd4239d5bc85db6642b41a80e | ee579c43b9ab1eef07025be8f6221f6609326ebf |
| body.md | 60588 | b31d52e5bf25f6eca3807e9c1f418b70d865c9d63c5690125c530c54f8247d84 | 04c87b44543b6bde9713228c7b6fda0fc444a00a |
| recipe.json | 32520 | d42e72daa68af5354ddc50e8f7d03c3bb82b451b2732612fc4a4dbb87ed89a3a | a2bc0ec47c421abc4fa18ee6f0212213999606ad |

A inversão das três substituições recupera exatamente o corpo v2. Os quatro segmentos fora das substituições foram comparados byte a byte. Fonte/linhas/hashes estão em delta.json; o suplemento3 transportará os ramos completos.

A receita v3 também incorpora a identidade do schema resource.ts já capturado e informado no suplemento2: são oito inputs semânticos brutos S1-04 (sete anteriores mais esse), fora das populações204/462, sem transferência de propriedade ou aceite Schema. Nenhuma nova captura ocorreu nesta revisão.

Verificação documental apenas. Testes de produto/provider: NOT_RUN. Oracle: não acessado. Escrita remota: nenhuma. Julgamento/aceite: não realizados pelo produtor.
