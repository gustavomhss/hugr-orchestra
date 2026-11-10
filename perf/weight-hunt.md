# Caça de peso e tempo

Nota de trabalho, não guia de usuário. Baseline do código: `088697393e` (branch `perf-cut`).
Medido nesta máquina em 2026-11-10, no app instalado 0.3.3, salvo onde o texto diz "documentado" ou "estrutura".
Nenhum número daqui é um benchmark. Não inventar percentual em cima de estrutura.

## O que 75% quer dizer

75% mais leve ou mais rápido no produto inteiro não cabe num corte só.
O app instalado tem 1,1 GB. O chão, ficando Electron + servidor + tree-sitter + renderer, fica perto de 530 MB.
Isso é cerca de metade, não um quarto. Boot quente medido: 4,8 s até o servidor responder. Só o processo escutar já leva 2,4 s.
75% disso seria 1,2 s. Não há prova de que o binário de 122 MB chegue lá.

O único corte já medido acima de 75% é a pasta de dados, não a conversa.

## Já medido, dá para fazer

### Cópias velhas do servidor

`~/Library/Application Support/ai.hugr.orchestra/cli` tem 6 versões, 696 MB. A atual sozinha é 122 MB.
`installCliArtifact` em `apps/desktop/src/main/cli-install.ts` cria uma pasta por versão+digest e não apaga as anteriores.
Ficar com uma cópia é 82% daquela pasta.

O perfil de produção inteiro está em 982 MB. Essas cópias mais o cache do Chromium (271 MB, sem teto no desktop) são quase tudo.
Podar as cópias e limitar o cache leva o perfil para perto de 150 MB, cerca de 85%.
O perfil de dev está em 1,6 GB, dos quais 1,2 GB são `Cache` e 351 MB são `Code Cache`. Não há `disk-cache-size` em `apps/desktop`.

### Arquivo morto dentro do app

`/Applications/HuGR Orchestra.app` = 1,1 GB.

| Pedaço | Tamanho | Nota |
| --- | --- | --- |
| `app.asar` | 378 MB no disco, 388 MB indexados | ver abaixo |
| Electron Framework | 280 MB | não sai enquanto for Electron |
| `claude-code` | 227 MB | obrigatório hoje: `sidecarLaunchEnv` faz `access` e falha se o arquivo não existe, mesmo sem modo Claude (`apps/desktop/src/main/server.ts`) |
| CLI | 122 MB | o servidor. `bun --compile` de `apps/cli`. Skill diz ~116 MB |
| tree-sitter unpacked | 83 MB | parse nativo |
| omni | 2,8 MB | o spawn do servidor usa |

Dentro do asar, o packager leva arquivo que o processo não executa. `apps/desktop/electron-builder.config.ts` não exclui mapa nem fonte.

| O que está no asar | Tamanho | Fração |
| --- | --- | --- |
| source maps | 113 MB | 29% |
| fontes `.ts` | 47 MB | 12% |
| wallpapers | 23 MB | 6% |
| wasm | 10 MB | 3% |

Mapas + fontes = 160 MB, 41% do asar, 14% do app. Exemplos: `typescript.js` (9 MB), quatro builds do exceljs com mapa, pdf-lib em cjs/esm/min, `effect` em `.ts` e `.js`, OpenTelemetry em três builds. O desktop não importa exceljs, pdf-lib nem `@ai-sdk`. Entram porque `@orchestra/desktop` depende de `@orchestra/core`, e o builder copia a árvore. O servidor já vai de novo dentro do CLI. Isso é disco e instalação, não RAM de turno.

## Boot, um log, não um benchmark

App 0.3.3, 2026-11-04, `logs/20261104T172253/main.log`:

- 14:22:53.722 app starting
- 14:22:55.715 CLI resolvido
- 14:22:56.054 `--version` voltou
- 14:22:58.505 server listening
- 14:22:58.538 server ready

A janela pode pintar antes do servidor. A Home não. A splash espera o bundle (`apps/desktop/src/renderer/boot.tsx`). O comentário diz que compilar o bundle segura a thread por segundos. Esse segundo número não foi medido de novo.

Primeiro launch sem assinatura: o guia registra varredura do macOS de cerca de 30 s. Não reclockada hoje. Assinatura tira isso.

## Turno do modelo, estrutura, sem milissegundo

Cada passo de provedor:

1. Lê e decodifica toda `session_message` desde a última compactação, sem `LIMIT` (`packages/core/src/session/history.ts:30-50`, chamado em `packages/core/src/session/runner/llm.ts:231`). A cauda da compactação é estimada em 8.000 tokens (`packages/core/src/session/compaction.ts:20`). Entre compactações, o transcript inteiro volta.
2. `initialize` volta vazio se a época já existe (`packages/core/src/session/context-epoch.ts:85`). O turno cai em `prepare` (`llm.ts:222-223`), que relê skill, instrução, referência e reunião. Se nada mudou, devolve o texto guardado. `AGENTS.md` entra inteiro, sem teto. A lista de skills já tem teto (300 / 12.000). Não refazer.
3. Passo que não é o último: `mcp.ready()` e remontagem das ferramentas (`llm.ts:238-240`).
4. Cada delta de texto ou raciocínio publica um evento e o projetor regrava o JSON inteiro da mensagem (`packages/core/src/session/runner/publish-llm-event.ts:319-328`, `packages/core/src/session/message-updater.ts:208-211`). Coalescer está aberto no checklist (`llm.ts:106`). Ficou assim porque o selo e a ordem dependem do evento. Não é delete gratuito.

Saída de ferramenta já está em 2.000 linhas ou 50 KiB. Bash segura 1 MiB. Não é alavanca.

Numa resposta curta o tempo é o modelo. Esses cortes atacam sessão longa e streaming. O spec pede métrica de latência de observação antes de cachear leitura de arquivo (`docs/specs/v2/session.md`).

## Tela, estrutura, sem milissegundo novo

O `:has()` estreito já está em `packages/app-shell/src/orchestra/session.css:91-101`. Os 2,8 s → 0,28 s e 34 s → 10 s só existem em `docs/specs/orchestra-visual/HANDOFF.md`. Não medir de novo e vender como novo.

Cada delta ainda percorre o array de `session_message` (`packages/app-shell/src/context/server-session-v2-reducer.ts`) e `normalizeSessionMessages` caminha toda a fonte (`packages/app-shell/src/utils/session-message.ts`). O highlight já está num worker. Uma sessão rodando continua recebendo token mesmo fora da aba. Fechar a aba só desfixa. A fila do renderer não tem teto de tamanho.

## Já feito, não refazer

- Watch da home, ~3 a 3,4 s. Cwd do servidor é `userData/global`. Changelog 0.3.2.
- Hash duplo do CLI no caminho quente, ~1 s. `cli-install.ts:52-54`.
- Net log antes do servidor, ~1 s. Agora solto.
- Updater e limpeza de store esperam a janela pintar.
- Watcher próprio da busca de arquivo. Changelog 0.3.4.
- SQLite já abre WAL, `synchronous=NORMAL`, cache 64 MB (`packages/core/src/database/database.ts`).
- Lista de skills limitada. Diffs de turno cacheados. Health não reconstrói o cliente inteiro a cada poll.

## O que ainda não fecha 75% do produto

Para passar de "metade do instalador" e de "sessão longa mais leve" falta achar corte grande nestas fatias. A caça seguinte é isso, não micro-otimização.

1. Os 2,4 s até `server listening`: o que o processo faz antes de escutar, e o que pode esperar.
2. O peso em tokens de um pedido (sistema, ferramentas, `AGENTS.md`). É o que deixa o modelo mais rápido.
3. CPU parado com um projeto aberto: watcher, LSP, tarefa agendada, SSE.
4. Gravação no banco além do delta: índice, crescimento da tabela de evento, regravação da linha.
5. O que o bundle da Home puxa antes do primeiro paint de verdade.
6. O custo de cada comando de shell: sandbox, omni, PTY.
7. O que está dentro do binário de 122 MB, e se ele mesmo encolhe.
8. Várias sessões abertas, cada uma com o transcript inteiro na memória.
9. Snapshot de git e watcher em todo turno ou ao abrir projeto.
10. Peso morto do instalador que esta nota ainda não viu.
