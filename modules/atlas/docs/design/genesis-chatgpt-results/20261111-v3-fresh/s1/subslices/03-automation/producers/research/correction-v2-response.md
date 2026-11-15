# Resposta original à correção L1 research v2

As duas substituições autorizadas foram aplicadas ao corpo. Nenhum outro trecho do corpo foi alterado.

Corpo v1 preservado em history/body-v1.md: 63389 bytes; SHA-256 1213f85cf16f73feed220e8c1b33ed52b2af75afd570b154a29eaf8f99f27d73; Git blob c29b9f5b8a8913cc4afa58d3e9cdede292f0657e.

Corpo v2 em body.md: 63501 bytes; SHA-256 d2def4b82495605b491e0d5494b1511e1b68c47dcffa84af87c8d35705468661; Git blob bb0eaa73b4fe9120fb46d9304778649b5c7205dd.

A receita v1 permanece em recipe.json e foi copiada byte a byte para history/recipe-v1.json, SHA-256 a5bd9215347a9eb06ab008846f2ef169e1d3269f0f6c0a75f73da72d914178a2. A receita desta revisão está em recipe-v2.json. Suplementos, requests e responses anteriores permanecem intactos.

## Substituições exatas

### CORRECTION-V2-1 — linha 203

BEFORE:

~~~text
Memoiza no máximo dois dumps por path, mtime e tamanho;
~~~

AFTER:

~~~text
O memo mantém no máximo duas entradas no total, uma por path, validadas por mtime e tamanho;
~~~

Evidência: packages/core/src/research-toolkit/code-index/scip.ts 81–110. Grupo RA5-02; identidades e hashes dos intervalos em correction-v2.json.

### CORRECTION-V2-2 — linha 225

BEFORE:

~~~text
`query.ts` abre shard atual ou o mais novo retido de mesmo id quando o atual falta.
~~~

AFTER:

~~~text
`query.ts` abre o shard atual ou o primeiro retido de mesmo id ainda presente, na ordem do manifesto (atualizada por `retain`/`touch`), quando o atual falta.
~~~

Evidência: packages/core/src/research-toolkit/code-index/query.ts 180–196; packages/core/src/research-toolkit/code-index/store.ts 170–215. Grupo RB1-02; identidades e hashes dos intervalos em correction-v2.json.

## Verificação e fronteira

A reconstrução inversa das duas substituições devolveu exatamente os bytes v1. A comparação por linhas encontrou somente duas trocas de uma linha, nas linhas 203 e 225; o restante é byte-idêntico. Os três arquivos-fonte pertinentes coincidem com seus SHA-256 e Git blobs de captura no pin 1cde2ff7a71bcf7aecb5d030917b577165135d38.

A revisão muda apenas a redação demonstrada sobre o memo global e a ordem do fallback. Os hashes prospectivos individuais dos suplementos continuam históricos; o hash v2 acima incorpora as duas alterações. Índices/suplementos originais continuam ligados ao v1 preservado. A principal cuida do novo binding e do envio do delta aos mesmos juízes.

Não houve oracle, contato ou criação de juiz, teste de produto, alteração de produto, operação Atlas, publicação remota ou novo PASS. A verificação aqui é somente de bytes, hashes e diff; não emite julgamento semântico.
