# Resposta original do produtor — AUTOMATION-L1 v2

Apliquei somente `AUT1-DELTA-PROPOSAL-01`, autorizada pela principal. O corpo contém uma substituição literal em §1.1; as demais passagens permanecem byte a byte iguais. O suplemento1 e seu índice/recibo não foram alterados.

## Delta literal

Antes:

> Binding e serviços são construídos por necessidade.

Depois:

> A resolução do binding, a inicialização cached de operations e o carregamento de output são adiados; transport, readers e resources são compostos ao construir a fachada.

Offset de bytes UTF-8, base zero: início `3852`; intervalo antigo `[3852, 3906)`; intervalo novo `[3852, 4027)`. Linha 1-based: `27`. Prefixo e sufixo fora da substituição são idênticos.

## Identidades

| Versão | Arquivo | Bytes | SHA256 | Git blob SHA1 |
| --- | --- | ---: | --- | --- |
| Corpo v1 preservado | history/body-v1.md | 59832 | 2ed7670affc680005840d0918489cb1ac36e1c5a4021defcc57ae44186ae7459 | 1867e5763e724fb2c3641f28297da24b311bdcda |
| Corpo v2 | body.md | 59953 | e9c89bea68d594bc61356ff461642ea23cd905d4584f2b52d32e10a5af984e55 | b8fec4854b4c1384d3c4a2a4f0d51d220c874618 |
| Receita v1 preservada | history/recipe-v1.json | 15037 | 0bea2453bc31f3f93109b9c64c7952aa690e6e6e8e5794c35a5630b8f9b38b21 | 01c0b2008499d7df9449dd881ff9d9fd7f0f6853 |
| Receita v2 | recipe.json | 28464 | 2bed1778e629415d5bc7c818773ef18b012a8a0bd4239d5bc85db6642b41a80e | ee579c43b9ab1eef07025be8f6221f6609326ebf |

A evidência continua em `AUT1-C01` e `AUT1-C02`: `packages/core/src/actions.ts` linhas49–85 e `packages/core/src/actions/transport.ts` linhas14–67. As identidades completas das fontes e trechos estão em `delta.json`.

A receita v2 registra os sete inputs semânticos externos de S1-04, incluindo workflow.ts e run.ts, com commit/path/blob/SHA256/bytes e captura. O AGENTS de Schema é contexto instrucional separado. A população continua **204** nesta chave e **462** na subfatia; leitura cruzada não transfere propriedade nem aceita o artefato Schema.

Esta correção usa a evidência do próprio produtor. Não houve acesso a oracle ou julgamentos, teste de produto, execução de provider, alteração de produto ou escrita remota. Tokens/custo de modelo não expostos permanecem UNKNOWN.
