# Erratum compartilhado — duas razões de coverage

Autorizado pela principal para alinhar exclusivamente SUP-F01/D-SUP-01 e SUP-F02. `coverage.jsonl` v1 e `shared-reconciliation-1.md` permanecem byte-idênticos; use `coverage-v2.jsonl` para estas duas razões corrigidas. Contagens, paths, hashes das fontes, profundidades e estados não mudam. Não há novo aceite.

v1 SHA256 `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`; v2 SHA256 `d1ed0705d256b1578a0debce284c3a2c4dd3bd2e00bf9f8f60e047b097d5bf74`. Exatamente duas linhas modificadas.

## SUP-F01/D-SUP-01 — `packages/core/README.md`

Razão anterior (literal):

`````text
Entrada pública e direção Schema/Protocol→Core→Server, composição e geradores oficiais; intenção de arquitetura não prova todas as folhas.
`````

Razão corrigida (literal):

`````text
Entrada pública: Schema→Core e Protocol→Server são relações separadas; Server expõe serviços Core por HTTP. Composição e geradores oficiais são declarados; intenção de arquitetura não prova todas as folhas.
`````

Linha 16, SHA256 da linha v1 `60bec29f8994fbfa5b8def81c75bbe31d1c37d692beec4c7c230674407ba6579`, linha v2 `9e68bdedf893a3bb659e225f1cba4f871d2b9a4d5d006aa2e14735f61d6fa167`.

## SUP-F02 — `packages/core/test/fixture/omni-expect.ts`

Razão anterior (literal):

`````text
Controle positivo abre expectativa no próprio teste e computa apenas seus spawns; outro teste não satisfaz a declaração.
`````

Razão corrigida (literal):

`````text
Mantém uma expectativa open e mede diferença do contador de spawns na janela expectSpawn→settle. Exclusividade por teste é intenção do comentário e exige ausência de sobreposição/integração correta com runner, não demonstradas só por esta folha.
`````

Linha 77, SHA256 da linha v1 `04ce87f24436a300e75936ae56404b47c77eb2299950b7db068cc65d6e01fc30`, linha v2 `13dd2bc2e03bb8374d6778d8c7b26139b742de825e9208c985c2dd2718a28be0`.
