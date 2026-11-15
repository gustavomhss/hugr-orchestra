# Diagnóstico do código Atlas em db9b423

O candidato original `db9b4235022c4df32fe3bfd4faeea8adcd69abb7` está materializado e compilado em `/workspace/scratch/8833f71e3e94/s1-04-runtime-scout/code-db9b423-diagnostic`. A identidade é **materialized diagnostic candidate, not git checkout; not promoted release**. O setup não encontrou incompatibilidade de dependências ou compilação. O `prepare` diagnóstico permanece para a principal.

## Captura e integridade

A closure inclui todos os arquivos originais em `modules/atlas/packages`, os manifests e tsconfigs de Atlas, o entrypoint `scripts/genesis-native.ts` e o postinstall declarado `scripts/fix-scip-types.mjs`. Não inclui harness/documentação fora dessa closure.

| Medida | Resultado |
| --- | ---: |
| Arquivos originais | 1.052 |
| Bytes originais | 9.002.568 |
| Reaproveitados do R3, mesmo Git blob | 998 |
| Deltas capturados pelo conector | 54 |
| Bytes de deltas | 718.076 |
| Arquivos modificados / novos | 39 / 15 |
| Fontes / arquivos de teste entre os deltas | 46 / 8 |
| Exports compilados de workspaces presentes | 13 |

A rota foi o conector GitHub: listagem `contents/modules/atlas` e árvores Git recursivas de `packages` e `scripts` no commit fixado; somente os 54 corpos divergentes foram lidos por `github_fetch_file`, em base64, no mesmo commit. Os 998 corpos reaproveitados foram comparados à identidade da árvore db9. Cada arquivo foi verificado por comprimento, SHA-1 do objeto Git completo e SHA-256, seguido de readback em disco. Não houve clone, download GitHub direto, criação de HEAD ou uso de credenciais.

O readback após instalação/compilação confirmou os 1.052 originais inalterados. Os 1.037 arquivos originais do setup R3 também continuam com os hashes anteriores.

## Comandos observados

Todos foram executados em:

`/workspace/scratch/8833f71e3e94/s1-04-runtime-scout/code-db9b423-diagnostic/modules/atlas`

1. `npm ci --no-audit --no-fund` — exit 0; 167 pacotes; postinstall original `node scripts/fix-scip-types.mjs` executado. Duração: 10,05 segundos.
2. `/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/runtime-tools/node_modules/.bin/bun typecheck --force` — exit 0; script original `$ tsc -b --force`; duração: 15,33 segundos.

O `package-lock.json`, os manifests de dependências e o entrypoint native são byte-idênticos aos de R3. As versões instaladas conferidas correspondem ao lock: TypeScript 5.9.3, `@noble/hashes` 1.8.0, `@bufbuild/protobuf` 2.12.1, `@types/node` 26.1.1, Vitest 4.1.12, fast-check 3.23.2, `@c4312/scip` 0.1.0, tree-sitter-typescript e web-tree-sitter 0.23.2, MCP SDK 1.32.0.

Os arquivos de teste pertencem às entradas originais dos tsconfigs e foram compilados. Nenhum teste de produto foi executado. Os avisos npm sobre configurações de ambiente `http-proxy` e `devdir`, além do aviso de nova versão npm, foram preservados no stderr; a instalação concluiu com exit 0.

## Diferença de implementação e limites

| Leitura | R3 e3a8ab8 | Candidato db9b423 |
| --- | ---: | ---: |
| Pacote, controles, referências preservadas e corpo: default de `readNativeFile` | 8.388.608 bytes | 8.388.608 bytes |
| Cada `source_ref` no native prepare | 256.000 bytes explícitos | 2.097.152 bytes compartilhados |
| Cada entrada `file:` e observador de arquivo | 256.000 bytes | 2.097.152 bytes |

Em `genesis-native.ts`, os dois argumentos literais `256000` foram substituídos pelo `ownershipInputMaxBytes` original de `ownership-input.ts`. O observador usa `2 * 1024 * 1024` e verifica o total efetivamente lido antes de reter cada novo chunk. O padrão de 8 MiB de `genesis-native-io.ts` não mudou. Uma fonte acima do teto em `source_refs` continua recusada como `native-file-limit`; o observador de `file:` acima do teto retorna `unavailable`.

O arquivo exigido `packages/client/src/generated/types.ts`, com 462.732 bytes, cabe numericamente no teto db9 e excede o teto explícito R3. Isso estabelece a diferença de capacidade pelo código e pela compilação, sem alegar sucesso de `prepare` neste pacote. Os hashes completos da fonte continuam necessários; não houve divisão, omissão ou alteração dessa fonte neste complemento.

O delta completo contém mudanças mais amplas que o teto: novos módulos originais de evaluation binding, identidade de manifesto/runtime/store, orçamento de leitura e reconstrução, além de suas integrações. Por isso a closure inteira foi materializada. Nos arquivos comparados de validação native, as outras mudanças são casts de retorno; o CLI native permanece byte-idêntico. O contrato de dependências `same_package` e o observador Git de membros permanecem originais. Nenhum seam de tracking foi instalado.

Identidades decisivas:

| Arquivo | Git blob SHA | SHA-256 |
| --- | --- | --- |
| `genesis-native.ts` em adapter-io/src | `187610f59758e185a8889412b9058b75eb6e62ca` | `07c8103ef3809ff6d91e8678fa4193e397706a93f7705fc990aaa29d32d44a84` |
| `ownership-input.ts` | `ef317aab980f42601ce78269fcfba10649f06735` | `9cb3d220d5f2de83e34c0303e5e6744c83e08a22e5ffdf5f5151355d88056f36` |
| `package-lock.json` de Atlas | `52385ecfa7a9ee21c5ce3918790029687cddfcd0` | `b3c505a0227808e04acf49138a1acccfd3e1a0e9b5476a5f9748fccd84e1a06f` |

## Release e próximo passo

O `runtime-release.json` já capturado em db9 publica `20261111-v3-fresh-s4-r3`, com native candidate `e3a8ab8cf56dbff1ee91272df51ffa398d882aa1`; SHA-256 do release: `6de0b5f7a8911eb40c7fbcf74e74210805175ee580c0c8482249c016af1c0016`. O handoff preservado declara que R3 continua publicado e que aquele checkpoint não publica R4. A existência do código de 2 MiB, o sucesso Actions anterior no exato db9 e este typecheck não promovem db9 a release aceito nem transferem bindings de outro candidato para S1.

A condição pendente para tratar db9 como release aprovado é uma promoção/release explícita e revisada que cubra esse candidato exato. Qualquer publicação S1 também continua dependente da autoridade real de policy/ator e dos bindings exatos do candidato preparado. Este complemento não qualifica S4 nem cria nenhum desses elementos.

O próximo passo concreto é a principal executar o CLI original abaixo no pacote final, escolhendo antes um root diagnóstico com estado isolado. `prepare` escreve CAS sob `.atlas/cas` do root fornecido, portanto a comparação deve preservar o CAS existente.

```text
cwd: /workspace/scratch/8833f71e3e94/s1-04-runtime-scout/code-db9b423-diagnostic/modules/atlas
argv:
  /workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/runtime-tools/node_modules/.bin/bun
  scripts/genesis-native.ts
  prepare
  <isolated-diagnostic-source-root>
  <package-path-relative-to-root>
  <new-candidate-output-file>
```

O checkout fonte e seu CAS não foram acessados neste complemento. Não houve prepare, publish, index, read, CI, testes de produto, escrita remota, edição de código original, alteração de S4, criação de policy, ator ou binding.

## Evidência local

Todos os arquivos estão em `/workspace/scratch/8833f71e3e94/s1-04-runtime-scout/setup/db9b423-diagnostic/`:

- `request.txt`: pedido recebido.
- `initial-captures.json`, `tree-captures.json`, `delta-captures.json`: requests/responses do conector.
- `materialization-plan.json` e `materialization-manifest.json`: inventário, origem e identidade de cada arquivo.
- `implementation-diff.patch`: delta completo R3 → db9 de toda a closure.
- `commands/`: argv, cwd, duração, exit, stdout, stderr e hashes das duas execuções.
- `readback.json`: verificação posterior de código, dependências e exports.
- `status.json`: resultado estruturado, limites, pins de release e condição de retomada.
- `evidence-index.json`: índice de hashes dos recibos.

Hashes SHA-256:

| Evidência | SHA-256 |
| --- | --- |
| Manifesto | `43a44d9e627902ac59f1688542e933468bfe5ad7c42bf25d8d6470bb2590072d` |
| Diff | `dc46165221f61c29b69cfd91d1012dd33a186a4a5bf1cfac5144185e6d3bfcee` |
| Readback | `2ba623e356d683a0926f578863a154cc9d0cd3bae2cef05448f20824717d5b9e` |
| Status | `fa6eb21a284db5bf5a0b79ad98f618bf7f0687ce15013f4cba4efdd133c4edca` |
