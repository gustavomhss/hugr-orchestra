# S1-04 — tentativa real do guard estático e rotas do conector

**O comando original foi executado e terminou com exit 1, por ausência de repositório Git. O gate não foi satisfeito.**

O HEAD observado de `genesis-s1-api` foi `8835faf6329cc3d5f5de1097872882d57472b793`. Li o AGENTS.md desse commit e materializei os oito arquivos necessários ao entrypoint e à sua closure direta em `/workspace/scratch/8833f71e3e94/s1-04-runtime-scout/guard-snapshot`, mantendo a identidade `materialized, not git checkout`. Essa pasta não representa um checkout completo do candidato.

O conjunto contém AGENTS.md, package.json, bunfig.toml, tsconfig.json e os módulos originais run.ts, diff.ts, engine.ts e rule.ts. O package.json define `check:guards` como `bun run script/guards/run.ts`. As dependências de execução são apenas módulos locais, built-ins de Node e APIs de Bun; nenhuma instalação adicional foi necessária. Os oito arquivos foram verificados por blob Git, SHA-256 e readback e permaneceram inalterados.

## Execução

CWD:

```text
/workspace/scratch/8833f71e3e94/s1-04-runtime-scout/guard-snapshot
```

Comando:

```text
/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/runtime-tools/node_modules/.bin/bun run check:guards --base origin/dev
```

Resultado literal, exit 1:

```text
ERROR /workspace/scratch/8833f71e3e94/s1-04-runtime-scout/guard-snapshot is not a git repository
guards: 0 rules, 0 changed paths, 0 gate and 0 warn findings, 1 errors.
```

O runner original verifica `git rev-parse --git-dir` antes de resolver o merge-base com origin/dev ou carregar regras. Sua recusa corresponde a `no-repository`. Nenhuma regra nem caminho foi avaliado; os zeros de findings não significam aprovação. Não houve branch, HEAD, index, base ou diff fabricado, nem uso de GUARDRAIL_APPROVED ou outro override Git. A única adaptação de ambiente foi acrescentar o diretório do Bun real ao PATH.

## Rotas expostas

A inspeção das ferramentas GitHub expostas não encontrou tool de workflow_dispatch, archive, clone, checkout ou download de tracking. O fetch genérico aceita apenas GET e documenta que não suporta respostas binárias.

A tentativa real read-only de:

```text
https://api.github.com/repos/gustavomhss/hugr-orchestra/zipball/8835faf6329cc3d5f5de1097872882d57472b793
```

retornou HTTP 400 / INVALID_ARGUMENT:

```text
GitHub Fetch URL is not an allowed public GitHub repository or search endpoint.
```

Após essa recusa, não tentei rotas alternativas de download. Os writes de Actions expostos são apenas rerun de job e rerun de jobs falhos; eles não foram acionados e não são dispatch arbitrário.

A leitura de artefatos existentes continua disponível por github_download_workflow_artifact. Ela não cria checkout nem dispara um workflow. Os artefatos Atlas previamente inspecionados contêm evidência de CI, sem tracking Git original. GET de refs/commits/trees/blobs serve à materialização verificada; não cria o checkout, HEAD ou index exigido pelo guard.

## Evidências

Diretório de evidência: `/workspace/scratch/8833f71e3e94/s1-04-runtime-scout/setup/guards/`.

- `discovery.json`: relatório estruturado, SHA-256 `74c75b9ec377a89bf46d3de4abc76f580cbcea8d75934517f5109dfc4fe27196`.
- `check-guards.receipt.json`: comando, CWD, tempos, exit e hashes; SHA-256 `803d4bfe21b6e535e16b329545f6cc82e1efcfb2cc9690ac04cc19798bdf670e`.
- `check-guards.stdout.txt`: SHA-256 `03e07767148f3539dd1590f90e88dbd9431a3c467f9c86c4c226df6b9c290576`.
- `check-guards.stderr.txt`: SHA-256 `1d94fca7cd039cb028502c2ed2c275f74238d3dc240f237a5c1fb958daaede4b`.
- `branch-capture.json`, `initial-captures.json`, `script-captures.json`, `dependency-captures.json`: requests/responses integrais do conector.
- `materialization-manifest.json`: os oito arquivos, blobs, tamanhos e hashes.
- `tool-routes.json`: inventário de nomes GitHub e descrições das rotas relevantes.
- `request.txt` e este `response.md`: pedido e resposta visíveis preservados.

A retomada do gate exige um checkout real autorizado com a mudança candidata e origin/dev resolvível; nenhuma rota exposta que forneça esse estado foi identificada. Não executei testes, CI, workflow, Atlas prepare, policy, binding ou mutação remota. O prepare S1 continua aguardando o pacote final.
