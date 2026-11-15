# Resposta original do produtor — AUTOMATION-L1 v4

Apliquei apenas as duas qualificações autorizadas no scheduler. Corpo e receita v3 estão preservados integralmente em history/. Suplementos1/2/3, seus índices e recibos permanecem idênticos.

## AUT4-DELTA-01 — §12

Antes:

> Em capability, verifica owner e `holds` antes da Session e outra vez antes de prompt.

Depois:

> Em capability, verifica a presença/identidade do owner antes da Session; para claim ainda não admitida, verifica `holds` antes da Session e outra vez antes de prompt, sem reler a Session do owner.

Intervalo UTF-8 v3 `[52110, 52195]`; v4 `[52110, 52308]`; linha `304`.

## AUT4-DELTA-02 — §12

Antes:

> Capability manualKey reutiliza Session somente depois de admissão; claim ainda starting retorna “retry shortly”; revoked não executa novamente com a mesma chamada.

Depois:

> No replay de capability manualKey, `running` sem SessionInput retorna “retry shortly” e `revoked` retorna erro; nos demais casos, o ramo devolve o SessionID retido com `reused:true`, sem exigir admissão para uma row já assentada.

Intervalo UTF-8 v3 `[53944, 54113]`; v4 `[54057, 54292]`; linha `318`.

A primeira correção diferencia a presença/identidade do owner de estado, lease, revisão e habilitação verificados por holds. A segunda documenta o predicado efetivo do replay: a consulta a SessionInput só bloqueia a reutilização quando a row está running. O caminho inicial não admitido continua sendo enviado a void, exceto revoked; isso será transportado integralmente no suplemento4. Não se afirma uma reprodução de row assentada sem admissão nem uma falha executada.

## Identidades

| Arquivo | Bytes | SHA256 | Git blob SHA1 |
| --- | ---: | --- | --- |
| history/body-v3.md | 60588 | b31d52e5bf25f6eca3807e9c1f418b70d865c9d63c5690125c530c54f8247d84 | 04c87b44543b6bde9713228c7b6fda0fc444a00a |
| history/recipe-v3.json | 32520 | d42e72daa68af5354ddc50e8f7d03c3bb82b451b2732612fc4a4dbb87ed89a3a | a2bc0ec47c421abc4fa18ee6f0212213999606ad |
| body.md | 60767 | 968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae | e26213eb2fc76dc843dca17d1111334c76f88890 |
| recipe.json | 35356 | c769860c4a685cdbeaff94d471ca393078b74b275924048a996a6376fbeb61c6 | 96513c04a7d69233a2127315e6915152d485ebb8 |

Inversão das duas substituições recupera v3 byte a byte. Os três segmentos não alterados foram comparados. Fontes, linhas, offsets e hashes estão em delta.json. Permanecem oito inputs semânticos externos brutos S1-04, população local204/subslice462 e nenhuma nova captura.

Verificação documental somente; testes e provider: NOT_RUN. Oracle/julgamento reservado: não acessados. Nenhuma mudança de produto ou escrita remota. Aceite/julgamento não realizados pelo produtor.
