# Vista mecânica S3 v4

Estado: **FINAL_PACKAGE_V4_PREPARE_VIEW_NOT_A_BINDING**. Sem parecer ou binding.

Prepare real Actions `46121909582`; candidate observado `efc5e131f6969566606b834e1c63a8082511c6e330f90a17d04d3f6f4c2e420f`; pacote SHA-256 `e2bec9aadf58327d7ae72c991c581a03089ee6dce165595fa802e4923c58ccde`.

O commit identifica arquivos publicados no Git. `ownership_manifest=null` e `publication_attempted=false` permanecem no estado preparado.

## Conteúdo e verificações

A vista contém as 11 entradas e os 32 critérios exatos. Para cada entrada inclui artifact embutido, result inteiro, result ID, inputs ID, dependências, navegação, hash/tamanho/custódia do corpo e referência exata do vetor de inputs omitido.

Foram comparados ZIP e tar com os hashes pinados, os snapshots e o candidate CAS com prepared, 11 corpos com os bytes CAS/archive/pacote selecionado/readback/releases, 35 refs CAS com os arquivos transportados, 4639 arquivos do input lock e 14577 entradas do inventário. O único symlink de fonte permaneceu apenas como metadado e foi relacionado ao alvo interno arquivado.

## Limites que devem acompanhar qualquer envio

- IDs do kernel foram preservados como observados, sem recomputação independente: a fonte canônica foi capturada, mas `blake3` não está instalado no Python usado.
- SHA-256 dos bytes CAS e dos corpos não são IDs canônicos do kernel.
- Os vetores extensos, corpos e textos de referências foram omitidos explicitamente. `omissions.json` e `cas-index.json` fornecem seus hashes e localizadores exatos.
- A leitura desta vista não equivale à leitura humana do prepared completo, dos corpos, dos oráculos ou dos pareceres preservados.
- O verificador não executou produto/runtime/testes, não criou votos e não publicou. A decisão de binding continua separada e deve citar este candidate exato.

## Mapa dos corpos

| Key | Bytes | SHA-256 do corpo | Inputs |
|---|---:|---|---:|
| s3-l1-maestro | 19752 | `75b4438d79ebd9667db94f03a6fea884329cd5c72e2c69f649eff1047e7b1918` | 464 |
| s3-l1-relay | 23932 | `369d2610ba4507a0950bd16cfce045dede276b67dee05f5d0086ef9ea503ffcb` | 3722 |
| s3-l1-integrations | 23985 | `81685f16fb32aae6958671939413d121e4f5babaf01d3b9565b03a50f7842e8a` | 486 |
| s3-l2-maestro | 6979 | `5907c7745c2533529d3039f9d8635f76bd98aeefaa5612b8594723341d258012` | 165 |
| s3-l2-relay | 7235 | `ebeef855436f687189c081b5a47ade29a2e716b0284613daaa0515f32d333037` | 114 |
| s3-l2-integrations | 6968 | `90c2c94bf63580c676f88a7065fd3cadb4e6fd6332c99c9f9d9534d56086d259` | 165 |
| s3-l3-flows | 13637 | `17c3d7fdd7f693d66eefc29df3928d5bda449387db77a016a9b7b1f3cc3f0b99` | 265 |
| s3-l4-entry | 7764 | `a5e1bf88aa6c17470c2832c99049dba76867615279689db85d25e2fe8b39e9ef` | 265 |
| s3-l4-ownership | 6934 | `a09dfcf8b6733c20b36be5228d2bd315533473983c4d20af3a9d2e60e4fc0c4b` | 265 |
| s3-l4-maintenance | 9724 | `d5d7a91cfd94691f7c3221e65d87f7042f586c40d0aca9bf7868e5e34da8bb91` | 265 |
| s3-l4-operational | 9757 | `704d631906d268e2e326f23d85e9bb6dc80845a8e2191ef970bab1c24a8e34c1` | 265 |
