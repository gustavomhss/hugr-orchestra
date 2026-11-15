# S1-04 — checkout real e membership concluídos

**O checkout mínimo está pronto e o observer original do R3 retornou 22/22 membros presentes.** A captura de objetos para o guard terminou com 1.152 dos 1.153 blobs incrementais comprovados; resta um ZIP histórico cujo corpo não foi disponibilizado pelas três rotas expostas verificadas. O guard e o prepare final ainda não foram executados.

## Identidade observada no Git local

Checkout: `/workspace/scratch/8833f71e3e94/s1-04-runtime-scout/verified-git-candidate`.

| Medida | Resultado |
|---|---|
| HEAD / branch local genesis-s1-api | 8835faf6329cc3d5f5de1097872882d57472b793 |
| origin/dev capturado | 5e0807b5ff953508f792b8a965883985b05a7066 |
| git merge-base HEAD origin/dev | 7e3c21c0d0aaffc5afc7a5f466fa2b61880e3249 |
| Comparação do merge-base com GitHub | Idêntico |
| Index completo derivado da árvore original | 15.079 paths, modos e SHAs idênticos |
| Worktree sparse materializado | 617 paths, bytes conferidos |
| Paths skip-worktree | 14.462 |
| Fronteiras shallow explícitas | 8 commits reais, preservados sem editar parents |
| Objetos Git importados | 1.509 commits, 2.333 trees, 1.842 blobs |
| Status após a importação final | Limpo |

Os objetos vieram exclusivamente de capturas do conector ou de caches dessas capturas. Todos foram conferidos pelo SHA do objeto completo antes da importação, e o Git devolveu os mesmos SHAs ao importá-los. O index foi derivado por `git read-tree` da árvore completa. A seleção de arquivos foi feita por sparse checkout, com flags observadas posteriormente. Não foi criado index de uma lista parcial de paths.

A identidade é um **checkout sparse com objetos exatos, história shallow explícita e armazenamento parcial de objetos**, sem alegação de clone completo. Não há transporte remoto configurado nem operação sobre refs remotos. O HEAD aponta para o commit remoto real.

## Observação original de membership

A função `observeOwnershipInput` do runtime R3 e3a8ab8cf56dbff1ee91272df51ffa398d882aa1 foi executada sobre esse checkout, sem seams ou substituição de listas.

Resultado: **exit 0, 22 present**. A união das member keys está materializada integralmente, com 506 paths. Os 24 arquivos de tooling/httpapi-codegen/test existem agora no worktree. Os 306 inputs anteriores têm os mesmos blobs do candidato e permanecem íntegros.

Recibo: `probes/members-verified-checkout.receipt.json`.
Stdout SHA-256: `13c80b0755f7a9c4896e089d82216950b0ac2e0d23b2568660464a7c1cf2742e`.

## Fonte grande e limite correto do R3

`packages/client/src/generated/types.ts` continua inteiro, com **462.732 bytes**, blob `fca4633666a639d550065312a13e48c6ce221d12` e SHA-256 `2763d389d2694a6737719865cbabbbdfee937d81a86497b783c246cdaf76ef0f`.

O limite observado de **256.000 bytes é passado explicitamente pelo prepare às source_refs e às entradas file:**. A função readNativeFile tem default de **8 MiB**, usado pela leitura do JSON do pacote. Portanto, a recusa anterior não estabelece um limite de 256 KB para o pacote inteiro. O runtime R3 não foi alterado e o probe original continua preservado; prepare e publicação não foram executados.

## Captura para o guard

O diff histórico entre merge-base e candidato contém 1.263 paths: 1.187 adições e 76 modificações. Esse escopo inclui mudanças anteriores à missão.

Dos 1.153 blobs adicionais solicitados, **1.152 foram capturados e comprovados, totalizando 33.762.749 bytes**. As 300 respostas já obtidas pelo child foram recuperadas sem repetir chamadas: o conector entregava corpos UTF-8 já decodificados, e seus hashes completos conferiram. Outros 852 corpos foram capturados pela principal desta subtarefa. O erro inicial do parser permanece preservado.

A união necessária de diff, regras e configuração contém 1.332 blobs. O readback real por `git cat-file --batch-check` confirmou **1.331 disponíveis e um missing**:

- Path: modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/evidence/source-captures.zip
- Blob: d83941a9d836a23e466ca09ecba1f21d423094cb
- Tamanho esperado: 1.339.105 bytes

Tentativas preservadas:

1. github_fetch_file com encoding=base64: SHA de metadata correto, conteúdo vazio; não aceito.
2. github_fetch_blob: UnicodeDecodeError no conteúdo binário; não aceito.
3. github_fetch GET no GitData /git/blobs/SHA: HTTP 400, “GitHub Fetch only accepts UTF-8 text.”; não aceito.

Nenhum objeto substituto foi criado. O guard não foi executado no checkout verificado, portanto não existe novo veredito do gate. Sua execução com o overlay final é a próxima tarefa da principal e deverá registrar o resultado real, considerando esse objeto ainda ausente.

## Entrega e próxima chamada

Estado consolidado: `status.json`, SHA-256 `3ea9988248e9e38d90c715d4cd8e34d546f1a82ac39ec09d32a87ca5c1399aa6`.

Recibos principais:

- verified-checkout.json — Git real, index completo, sparse/shallow e 617 arquivos.
- minimum-blob-proof.json — 313 blobs reutilizados e 292 capturados para o mínimo.
- guard-blob-proof.json — 1.152 corpos adicionais, proveniência completa e ZIP faltante.
- git-commands/ — comandos, stdout, stderr, tempos e hashes de importação e readback.
- probes/ — observação original dos 22 membros.
- guard-blob-captures/ — respostas integrais, incluindo as três recusas do ZIP.
- import-interruption.json — criação inicial de .git/info necessária após template Git vazio; reparo registrado sem reinit ou reset.

Todos esses caminhos são relativos a /workspace/scratch/8833f71e3e94/s1-04-runtime-scout/setup/verified-git/.

Para o prepare final, usar o runtime materializado em `/workspace/scratch/8833f71e3e94/s1-04-runtime-scout/code-r3/modules/atlas` e o source root Git verificado acima:

```text
/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/runtime-tools/node_modules/.bin/bun scripts/genesis-native.ts prepare /workspace/scratch/8833f71e3e94/s1-04-runtime-scout/verified-git-candidate <final-package-relative-path> <new-candidate-file>
```

O pacote final e o novo output serão definidos pela principal. Nenhuma policy, identidade de ator, binding, teste de produto, CI, publicação ou mutação remota foi criado ou executado. Os recibos anteriores de ausência de checkout, Bun inicial ausente e recusa de fonte permanecem históricos e intactos.
