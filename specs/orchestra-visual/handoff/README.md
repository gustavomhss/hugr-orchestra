# Índice de recuperação

Entrada humana: [HANDOFF.md](../HANDOFF.md). Este diretório preserva o checkpoint
da campanha de identidade e o inventário local observado em 2026-10-01.

| Arquivo | Conteúdo / uso |
| --- | --- |
| `pr-239.json` | Head/base e resultado CI da implementação original |
| `e2e-linux-36932235243.log` | Log completo do job Linux que bloqueia merge |
| `e2e-windows-36932235243.log` | Log completo do job Windows que bloqueia merge |
| `epic-215.json`, `plan-pr-232.json` | Escopo e planejamento remoto no checkpoint |
| `open-prs.json` | Frentes publicadas, incluindo trabalho externo |
| `worker-snapshots.json` | Índice dos 14 workers e seus manifests |
| `archives/<worker>.json` | Base, branch, paths, staged/untracked, hashes e disposition |
| `archives/<worker>.tar.gz` | Bytes de WIP físico, quando existia payload |
| `archives/worker-patches.tar.gz` | Patches staged/unstaged de cada worker, bytes originais |
| `text-archives.json`, `*.log.gz` | Hashes dos patches e logs brutos; `.log` legível tem apenas formatação normalizada |
| `mock-snapshot.json`, `archives/approved-mock.tar.gz` | Mock completo aprovado, com hashes |
| `evidence-snapshot.json` | Proveniência, hashes e omissões declaradas da evidência histórica |
| `archives/historical-evidence.tar.gz.part-*` | Partes ordenadas da evidência, abaixo do limite de arquivo GitHub |
| `ancillary-assets.json`, `archives/ancillary-assets.tar.gz` | Cópia recuperável dos quatro conjuntos de assets do canônico |
| `global-worktrees.json`, `global-refs.json` | Inventário anterior à limpeza, inclusive trabalho externo e stashes |
| `archive-verification.json` | Conferência real de hashes/conteúdo e controle de corrupção |
| `secret-scan.json` | Controle do scanner e quatro falsos positivos auditados em literals estáticos |
| `restore-evidence.ts` | Reconstrução portátil das partes, com SHA-256 antes da escrita |
| `cleanup.json` | Recibo final: 14 workers arquivados/publicados e aposentados; escopo externo preservado |

## Recuperação segura de um worker

Use um destino novo; nunca extrair sobre o app atual. Leia o manifest antes de
agir. Seu `head` precisa existir: fetch das branches `orchestra-identity` e
`identity-integration` preserva as duas bases históricas utilizadas.

```sh
# Primeiro extraia os patches em uma pasta nova; use paths absolutos
tar -xzf <handoff>/archives/worker-patches.tar.gz -C <pasta-nova-de-patches>

# CWD: clone do fork; substitua <head>, <novo-destino> e <worker> pelo manifest
git worktree add --detach <novo-destino> <head>

# CWD: worktree nova; paths dos patches devem ser absolutos
git apply --index <pasta-nova-de-patches>/<worker>.staged.patch
git apply <pasta-nova-de-patches>/<worker>.unstaged.patch
tar -xzf <handoff>/archives/<worker>.tar.gz -C <novo-destino>
git status --short
```

Se o patch for vazio, não execute `git apply` nele. Um worker sem payload não
tem `.tar.gz`; seu manifest ainda registra o estado. A extração coloca os bytes
finais dos arquivos; os patches mantêm informação do index. Compare hashes
individuais com o manifest. Arquivos antes untracked permanecem recuperáveis.

Sandboxes `--no-checkout` tinham arquivos de baseline ausentes no index/working
tree. `missingTrackedPaths` é registro forense, **não lista de exclusões a aplicar**.
Os patches foram restritos aos arquivos físicos de trabalho.

## Evidência dividida

Concatene as partes na ordem numérica listada em `evidence-snapshot.json` e
confira SHA-256 do tar completo antes de extrair. O arquivo reconstituído é
`historical-evidence.tar.gz`; ele não deve ser adicionado ao Git como um blob
único acima de 100MB. Confira os hashes individuais após extração.

```sh
# CWD: checkout identity-integration; confirme que o diretório de destino existe
bun specs/orchestra-visual/handoff/restore-evidence.ts /caminho/novo/historical-evidence.tar.gz
tar -xzf /caminho/novo/historical-evidence.tar.gz -C /caminho/novo
```

As omissões listadas são outputs/dependências/cache regeneráveis ou diretórios
históricos ausentes, não produto declarado concluído. Os originais locais não
foram apagados por este snapshot. Inventário externo não é backup integral das
outras campanhas e não autoriza merge, stash pop ou limpeza de seus worktrees.
