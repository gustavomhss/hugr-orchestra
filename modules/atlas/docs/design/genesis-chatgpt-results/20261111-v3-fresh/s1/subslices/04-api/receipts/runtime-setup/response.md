# S1-04 — setup R3 e captura mecânica concluídos

O R3 publicado está materializado e compilado, o Bun está disponível, e os 306 inputs solicitados estão preservados byte a byte. A recusa da fonte inteira pelo R3 foi observada em execução da função original. O prepare do pacote ainda não foi executado, conforme a espera pelo pacote final e seus julgamentos.

## Identidade e caminhos

- Candidato R3: `e3a8ab8cf56dbff1ee91272df51ffa398d882aa1`.
- Release observado: `20261111-v3-fresh-s4-r3`, mantido no HEAD S4 `db9b4235022c4df32fe3bfd4faeea8adcd69abb7`.
- Código: `/workspace/scratch/8833f71e3e94/s1-04-runtime-scout/code-r3`.
- CWD Atlas: `/workspace/scratch/8833f71e3e94/s1-04-runtime-scout/code-r3/modules/atlas`.
- Inputs: `/workspace/scratch/8833f71e3e94/s1-04-runtime-scout/source-snapshot`.
- Bun real: `/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/runtime-tools/node_modules/.bin/bun`, versão 1.3.14.

Código e inputs têm identidade **materialized, not git checkout**. Nenhum HEAD, index ou outro metadata Git foi fabricado. A ausência inicial de Bun está resolvida e não constitui bloqueio atual.

## Rota dos 1.037 arquivos

O inventário veio exclusivamente do conector GitHub: contents em `modules/atlas` no pin R3 e árvores Git recursivas, ambas sem truncamento. O conteúdo veio por `github_fetch_file` em base64 no mesmo pin, com reutilização de 34 capturas já verificadas desse exato pin. Não houve clone, transporte Git, download direto do GitHub ou credenciais.

Foram materializados 1.037 arquivos, totalizando 8.792.867 bytes: árvore completa dos packages, manifests e lockfile originais, tsconfigs, entrypoint `scripts/genesis-native.ts` e o shim declarado de postinstall. Cada arquivo foi conferido por tamanho, SHA-1 de blob Git, SHA-256 e leitura do disco.

`npm ci --no-audit --no-fund` terminou com exit 0, instalando 167 pacotes do lockfile. O script original `bun typecheck --force` terminou com exit 0. Os 13 exports principais dos workspaces estão disponíveis. O build original inclui a compilação de arquivos de teste; nenhum teste foi executado. Nenhuma configuração de build ou fonte original foi alterada.

## Captura dos inputs

O plano foi conferido pelo SHA-256 `147cb96b6082f04993e94e22b54b8ac2323e2fe26e1ebc289e9e50a40ae43d43`. Os 306 arquivos, totalizando 2.037.868 bytes, foram obtidos pelo conector nos commits indicados pelo plano, sem nova leitura semântica. Todos os blobs retornados, hashes esperados disponíveis e readbacks conferem.

A fonte `packages/client/src/generated/types.ts` está completa:

- 462.732 bytes.
- Blob `fca4633666a639d550065312a13e48c6ce221d12`.
- SHA-256 `2763d389d2694a6737719865cbabbbdfee937d81a86497b783c246cdaf76ef0f`.

## Resultados reais dos probes autorizados

**Teto R3:** executei a função original `readNativeFile` sobre a fonte completa, com o bound 256000 usado pelo prepare R3. Ela retornou exit 1 e:

```text
native-file-limit: packages/client/src/generated/types.ts
```

Esse resultado é uma recusa real da capacidade de leitura; não foi prepare, import ou publicação do pacote. O comando integral, ambiente, tempos, saída e hashes estão preservados.

**Members:** executei o observer original `observeOwnershipInput`, sem seams nem lista injetada. O resultado literal foi 21 `unavailable` e 1 `absent`. O último corresponde a `members:tooling/httpapi-codegen/test`: nenhum dos 306 arquivos solicitados materializou esse diretório. Esse `absent` descreve apenas o snapshot parcial e não prova ausência no repositório original. Os 22 membros permanecem sem evidência de tracking original. Não criei diretório vazio para alterar o resultado.

O readback após os probes confirmou os 1.037 arquivos do runtime e os 306 inputs sem mudança. Código e inputs continuam sem metadata Git e sem policy criada.

## Próxima ação concreta

Assim que a principal fornecer o caminho relativo do pacote final dentro de source-snapshot e o novo arquivo de saída, a chamada original é:

```text
CWD: /workspace/scratch/8833f71e3e94/s1-04-runtime-scout/code-r3/modules/atlas

/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/runtime-tools/node_modules/.bin/bun scripts/genesis-native.ts prepare /workspace/scratch/8833f71e3e94/s1-04-runtime-scout/source-snapshot <final-package-relative-path> <new-candidate-file>
```

O diretório de saída deve existir e o arquivo candidate deve ser novo. Prepare não precisa de policy. A recusa literal deve ser preservada mesmo se members impedir que a execução chegue ao limite da fonte. Publish continua dependente de autoridade real e decisões vinculadas ao candidato efetivamente preparado; a policy baseline retornou 404 e isso não autoriza criar outra.

O candidato posterior de 2 MiB não foi materializado nem executado nesta etapa. Sua evidência de CI não altera o release R3 nem substitui binding S1.

## Evidência consolidada

- `setup/status.json`: estado consolidado, caminhos, comandos futuros e hashes das evidências; SHA-256 `0e359712df1bff7c5ab71ee367047207cd8f9cc16ee6cb7ef8c2940d64b9da83`.
- `setup/materialization-manifest.json`: 1.037 hashes do R3.
- `setup/input-materialization-receipt.json`: 306 hashes dos inputs.
- `setup/post-probe-readback.json`: integridade após execução.
- `setup/commands/`: Bun, npm ci, typecheck e observação de ausência de checkout.
- `setup/probes/`: comandos originais, stdout, stderr e recibos dos dois probes.
- `setup/captures/` e `setup/input-captures/`: respostas integrais do conector.
- `setup/request.txt`, `setup/bun-update.txt`, `setup/input-capture-direction.txt` e `setup/input-capture-request.txt`: pedidos visíveis preservados.

Todos esses caminhos são relativos a `/workspace/scratch/8833f71e3e94/s1-04-runtime-scout/`. Não houve testes locais, CI, prepare, publish, operação de index/read, policy, binding ou mutação remota.
