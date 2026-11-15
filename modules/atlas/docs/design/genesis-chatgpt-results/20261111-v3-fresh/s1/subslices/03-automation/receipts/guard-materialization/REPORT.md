# Guard oficial — preparação fiel, bloqueio binário

HEAD local preservado: `63e99146961161b8596bbe8b51e293c92eba4182`, branch `genesis-s1-automation`. `origin/dev` permanece em `5e0807b5ff953508f792b8a965883985b05a7066`; merge-base real `7e3c21c0d0aaffc5afc7a5f466fa2b61880e3249`. Nenhum reset, nova branch, commit sintético ou mutação remota.

## Trabalho concluído

As árvores completas de HEAD e merge-base foram capturadas pelo conector e reconstruídas somente quando o SHA do objeto Git coincidiu exatamente. `git ls-tree -r` enumera 15.367 entradas em HEAD e 13.892 na base, sem truncamento. O `git diff-tree` real confirma 1.551 paths alterados (1.475 adicionados e 76 modificados), não o máximo truncado de 300 retornado pela API compare. Essas diferenças incluem histórico herdado e não são atribuídas integralmente à S1-03.

O índice contém toda a árvore HEAD. Sparse checkout legítimo seleciona os 1.666 paths necessários ao diff, ao runner oficial, às regras/config da base e aos atributos Git. Os 13.701 paths fora da seleção continuam presentes no índice como skip-worktree; não foram classificados como ausentes do repositório. Os blobs necessários totalizam 1.635 identidades distintas: 442 foram reutilizados de capturas locais pelo SHA Git exato e 1.192 foram capturados pelo conector, incluindo o TAR.GZ pequeno por base64. Todos esses 1.634 blobs estão verificados.

Os arquivos do runner oficial e as regras da base estão disponíveis sem alterações. Não houve bootstrap, modo warn, aprovação, mudança de regra nem motor substituto.

## Bloqueio preciso

Falta um único blob obrigatório: `d83941a9d836a23e466ca09ecba1f21d423094cb`, o arquivo histórico `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/evidence/source-captures.zip`, de 1.339.105 bytes.

- `github_fetch_blob` falhou com `UnicodeDecodeError` ao interpretar os bytes binários como UTF-8.
- `github_fetch` no Git blob recusou conteúdo não UTF-8.
- `github_fetch_file` com `encoding=base64` retornou o SHA correto mas conteúdo vazio para esse arquivo maior que 1 MiB; os bytes vazios não foram aceitos nem materializados.
- O commit de origem é `dd8d3effd86476f8ffde4c45f1843ca448144280`, que adicionou o próprio ZIP. A consulta dos workflow runs desse commit retornou `total_count=0`. Nenhum artifact_id real de origem foi descoberto para usar a ferramenta de download de artefato de workflow.
- `git checkout-index --all` executou e falhou com `unable to read sha1 file ... (d83941a9d836a23e466ca09ecba1f21d423094cb)`. Os outros 1.665 arquivos selecionados foram materializados e verificados.

## Gate

`bun run check:guards --base origin/dev --json` permanece **NOT_RUN**. Sua precondição não está satisfeita: executar o runner contra a worktree com esse ZIP rastreado faltando faria desaparecer uma adição real da comparação contra a base. Nenhum resultado verde parcial foi produzido ou aceito.

Condição de desbloqueio: obter os bytes exatos desse ZIP por uma rota autorizada e verificar o blob Git; completar o checkout e repetir a verificação de bytes antes do comando oficial. A reconstrução inteira fica preservada para isso. Este candidato é checkpoint e nunca substitui o gate do payload final.

## Evidências

- `guard-reconstruction/ancestry-receipt.json` e `commits-receipt.json`: 1.660 commits exatos e fronteira shallow explícita.
- `guard-reconstruction/trees/` e `trees-receipts.jsonl`: capturas e verificação dos objetos tree.
- `guard-reconstruction/materialization-plan.json`, `changed-paths.json`, `head-files.json`, `base-files.json`: populações completas e seleção necessária.
- `guard-reconstruction/local-reuse-receipt.json` e `blobs-receipts.jsonl`: identidades dos blobs efetivos, sem conteúdo reservado exposto.
- `binary-transport-blocker.json`: respostas originais e descoberta da origem.
- `checkout-index-attempt.json`: falha concreta de materialização do ZIP.
- `materialization-verification.json`: SHAs, contagens, diffs e verificação dos arquivos presentes.

Não foram executados testes de produto, nova workflow, política/credencial/ator, leitura semântica de oracle reservado ou operação Atlas. Tokens/custos não expostos permanecem UNKNOWN.
