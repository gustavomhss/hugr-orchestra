# Handoff — dock-accessibility → Claude

Data: 2026-10-04. Escrito no fim de uma sessão opencode; a próxima sessão é Claude.
Este arquivo é o índice. Detalhe histórico continua em `closeout.md`, `handoff.md`, `runtime-execution.md`.

## 0. Leitura mínima para continuar

1. `AGENTS.md` da raiz e `packages/desktop/AGENTS.md` (regras de estilo/testes/typecheck).
2. Este arquivo, seções **3. Estado exato agora** e **11. Branches, worktrees, sessões e estado do host**.
3. `packages/desktop/docs/plans/dock-accessibility/closeout.md` (linha 12+ tem o checkpoint mais recente).
4. Comandos da seção **4. Primeiros comandos**.

## 1. Autorizações humanas já dadas

| Autorização | Estado |
|---|---|
| Lead compõe nesta frente, snapshot conferido de `dock-runtime` | concedida |
| Escopo = workspace Linux inteiro (sem pareamento por XID/janela) | concedida (waiver explícito em `handoff.md`) |
| `dock_action(mode:"observed")`, teclado Electron explícito, defaults conservadores | concedida |
| Implementação, sem commit/stage/push/PR | concedida |
| `open -a Docker` (recuperar daemon) | concedida |
| Publicação/release | **NÃO concedida** |

Regras do usuário para você (Claude): responda em português "smart caveman" nível **full** — curto, sem
filler, substância intacta. Código/comandos/mensagens de commit em texto normal. Só desligar com
`stop caveman` / `normal mode`.

## 2. Repositório

- Worktree do lead: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/dock-accessibility`
- Branch `dock-accessibility`, HEAD `5e4bea3b519c04cebfb787e98dfa171f5771d25c`
- `dev` é o default; `main` pode não existir local. Branch ≤3 palavras com hífen. Commits `type(scope): summary`.
- 118 arquivos modificados/untracked. **Nada commitado.** `git diff` sozinho não cobre a entrega.
- Runtime original `dock-runtime`: **não editar**. Runtime alheio observado: `orchestra-linux-f2c9513b-...` (ID curto `7bf658227d1e`) — não manipular.
- Testes e `bun typecheck` só em package cwd. Nunca da raiz, nunca `tsc` direto.

## 3. Estado exato agora

### 3.1 Fonte de produção — hashes atuais

| Arquivo | SHA-256 |
|---|---|
| `src/main/app-dock-native.ts` | `b92e0f0db1a2815dd56abb6e687fc8360db70e0c9c056d8ea6d4473256b7783b` |
| `src/main/app-dock-rpc.ts` | `23c85374f5c2dc9bc49afd294f4d949a5f9dac944df5d83a196b8e21f6469e8a` |
| `src/main/app-dock-native.test.ts` | `cf6a5ab1cd5b18762502d40d95844e7fe84d2888b79541d433baa3c495e43b17` |
| `src/main/app-dock-rpc-workspace.test.ts` | `f155b13cb1757ef4221d48b347c23077ee3bcea78bcf6efc23d121f6172cfee7` |
| `resources/linux/app-dock-accessibility/snapshot.py` | `cf8d3e04ece4d7bda686605e6d00454697042b4c5bbabe9ec6dfcedd95fff17c` |
| `resources/linux/app-dock-accessibility/main.py` | `1aa2933e941c119acb07cbe945410970cd5a52c7fb0e5d1ed0d7229e0d8ced9e` |
| `resources/linux/app-dock-accessibility/bindings.py` | `436f2461c6f26677e891e738e023c4df98639afd339670f9a50e4fbeb235f76f` |
| `resources/linux/app-dock-accessibility/refs.py` | `ffce3825eb9738c1ec5f1fb20d1808e679eeda10ae7fc59d129ce0e16708d9c3` |
| `resources/linux/app-dock-accessibility/actions.py` | `25f90e40b4f8ec4e9351a42a39342dce61fe006dd8dc9e749bb95788c81cfb4c` |
| `resources/linux/app-dock-accessibility/keyboard.py` | `2495d5ed503a34aaa7b20b33f56c0f56ce5905978ba88aea2bbb14052d00fdb6` |
| `resources/linux/app-dock-accessibility/bus.py` | `3b1c0d0f339efbed162585ab4e974291f34669515f442ade309280e0bc97b177` |
| `resources/linux/app-dock-accessibility/context.py` | `3bbabe8bf9b6036434238efe80cea22de2d3feed6b3e14f503d9787eefbc0242` |
| `scripts/app-dock-workspace-proof.ts` | `16cce1a1f110ac8925b507201a0dbaac750296a3f76a3fe13b82b61b9f43043d` (**contém mudança ainda não validada — ver 3.5**) |
| `test/native/workspace-scenarios.json` | `9488ce28038704052f10fc1667054162ff6a1c4c258331eb8919c88ea197aae6` |
| `test/native/workspace-proof.test.ts` | `0ab12af21c3f4aeeb56a82e5fa238861f611fed84d6b3f4ee685de633f7cac5e` |
| `test/native/test_snapshot.py` | `c15c20bb2942d0aa79bc072273affdb401b601f871843abb4f1453882642f7a9` |
| `test/native/test_workspace.py` | `b8fbdaf77f072fd382b62bbd673ce1d8ef1eb9a6e1067145ccd8cf5058ee4741` |
| `test/native/test_runtime_session.py` | `ebcb0a51193e46655c7f9094324487db94f1a070098ec23744f81f653ca7ad35` |

### 3.2 Fechado e verificado nesta sessão

- **Correção P1 (classificação fria nativa):** `dock_read` cujo primeiro bind falha não pode cair no browser
  depois. `workspaceIntents` em `app-dock-rpc.ts` guarda a intenção por `{senderID,tabID}→generation`,
  sobrevivendo a `reset()` enquanto o viewer viver; some só em remoção com generation igual ou fechamento de
  janela. Reproduzido vermelho (4 testes), corrigido, verde.
- **Correção P2 (evidência primária):** `withCleanup` em `app-dock-native.ts` + `catch` em
  `prepareWorkspace` preservam `code/message/outcome/result` do erro primário quando o cleanup também falha;
  cleanup vira `{code,outcome:"unknown"}` sanitizado (`native-cleanup-failed` se não ASCII ≤256).
  Reproduzido vermelho (6 testes), corrigido, verde.
- **Host suite:** `bun test src/main/app-dock-native.test.ts src/main/app-dock-native-client.test.ts
  src/main/app-dock-rpc-native.test.ts src/main/app-dock-rpc-workspace.test.ts ../opencode/src/plugin/app-dock.test.ts`
  → **244 pass / 0 fail**. `bun typecheck` em `packages/desktop` passou.
- **Par GTK/Qt validado por verificador próprio**
  (`.recovery/a11y-20261002/verify_workspace_pair.ts`):
  - `i1-runtime-state-v2/workspace-normal-4.json` — PASS, 5/5, 224 requests/replies, 1 helper reaped.
  - `i1-runtime-state-v2/workspace-control-1.json` — FAIL esperado em W02/W03 (`controlDetected:true`,
    restauração concluída), W01/W04/W05 PASS.
  - Resumo: `i1-runtime-state-v2/workspace-pair-verified-1791114486961.json`.
  - Verificador recalcula bytes do efeito, integridade de cada frame raw, correlação pedido↔resposta,
    reap de helper, ausência de drift de fonte e **4 controles negativos próprios**
    (`false-status`, `empty-case-list`, `empty-trace`, `corrupt-wire` — todos matam).
- **Snapshot integrado salvo:** `.recovery/a11y-20261002/recheck-20261004T114807Z`
  — 169 arquivos fonte, 56 receipts, archive SHA `421f6fb57dc77c005161e86dd2223061c9901d6ef8b4566e52f7c9ffcb6b2b34`,
  `quick_check ok`, tabelas session37/message2293/part17630/todo4.
  `latest-recheck.json` **ainda aponta o snapshot de 2026-10-03** — corrigir se quiser usar como âncora.
- **Code 1.140.0 instalado no workspace isolado** (não na imagem base):
  receipt `workspace-code-install-1791115919428.json` — commit `07f806f999227108933c2e30515b26eecc1fda74`,
  Electron43.7.3/Chromium150.0.7871.250, archive SHA `d32031e9e213...dc0dc` conferido contra
  `/opt/versions.json`. `code.desktop` registrado em `/usr/share/applications`.
- **Snapshot root-first no guest (landed):** `snapshot.py` agora cataloga todas as raízes confirmadas do
  workspace antes de descer, com frontier `deferred` (≤32), revalidação de fingerprint antes de expandir,
  e participação em `more`/rollback/terminal-clear. Motivo medido: cada releitura do campo do Code percorria
  ~680 nós / 12 replies (~15s) porque GTK/Qt vinham antes.
  `test_snapshot.py` 50 testes + 16 controles de mutação, todos matar e restaurados.
  **Isso é gate novo: não aumento de limite nem relaxamento de identidade.**
- **Teclado Code no runtime real: PROVADO.** `dock_type(mode:"keyboard")` em Quick Open verificado
  com `postcondition:"verified"`, focus confirmado, `modifierRelease:"acknowledged"`:
  Unicode `café 漢字 🧪` → decomposed `e\u0301` → clear `""`. `controllerCalls` 17/7/5.
  Não é mais hipótese.

### 3.3 Code: o que trava agora

Sequência real de tentativas, todas com viewer Electron/Xpra anexado de verdade
(`workspace-code-N.json` + `viewer-*`):

| N | Resultado | Causa medida |
|---|---|---|
| 1 | FAIL | sem viewer as janelas não ficam visíveis no X11 (`xdotool search --onlyvisible` vazio) |
| 2 | FAIL | sem viewer as janelas ficam **sem mapear**; census instável |
| 3 | FAIL | com viewer: census estável, mas `Native request cancelled or closed`; leitura por busca consumia ~680 nós |
| 4 | FAIL | `Native workspace membership changed before confirmation` —绑定 fresco logo após setup |
| 5 | FAIL | campo encontrado em profundidade 16 (dentro do Code) mas releitura custa ~15s → travou o budget |
| 6 | FAIL | viewer sem `app.show()/focus` (macOS) → state assertion falhou |
| 7 | FAIL | `SETUP-code-ready-not-effect-oracle-guest-exec-failed-or-unjoined` — janela do Code não estava pronta |

Diagnóstico do caso 5 (medido, não suposto): o campo `Search files by name (...)` aparece em
`role 79` nas profundidades 16 e 12 **e** como `role 79` com `depth 0` quando lido escopado pelo ref da
raiz. Ou seja: o caminho barato existe, mas exige achar o root do Code.

### 3.4 Corrigido e ainda não provado

- Harness: `select()` usa first-match (`stopAt:"match"`) para `vscode`, como o `find()` do proof E04 já fazia.
- Harness: retry de readonly aceita também `wrong-scope` + mensagem exata
  `Native workspace membership changed before confirmation` (só leitura, sem replay de mutação).
- Harness: `codeView` ganhou modo `ready` que espera a janela existir e tem o título esperado.
- Root-first do guest deve reduzir drasticamente o custo de `field("quick")`/`field("settings")`.
- **Nada disso foi revalidado em runtime real.** Próximo passo é repetir o comando da seção 4.

### 3.5 Mudança pendente de validação (importante)

Última edição, feita **após** a última execução:
`scripts/app-dock-workspace-proof.ts` — `codeView` agora devolve `{"ready":false}` em vez de levantar exceção
quando a janela do Code ainda não está visível, e o setup faz **3 tentativas de poll** de prontidão com
`check(attempt < 3, "Code-workbench-not-ready")`. Isso responde ao caso 7.

Verificar antes de confiar:
- `bun typecheck ../../.recovery/a11y-20261002/workspace-proof-tsconfig.json` (scoped, porque o tsconfig do
  package exclui `*.test.ts` e `scripts/`) → **passou** depois da edição.
- `bun test test/native/workspace-proof.test.ts` → **3 pass / 0 fail** (manifest, frame, parser Python real).
- Falta apenas rodar o gate W06 de novo em runtime real.

## 4. Primeiros comandos

Todos a partir de `packages/desktop`. Um processo GUI pesado por vez.

```sh
# 0. estado
git -C /Users/gustavoschneiter/Documents/HuGR/_worktrees/dock-accessibility status --short | head -40
docker --host unix:///Users/gustavoschneiter/.docker/run/docker.sock ps --format '{{.ID}} {{.Names}} {{.Status}}'

# 1. checks baratos de tipo/teste do harness
bun typecheck ../../.recovery/a11y-20261002/workspace-proof-tsconfig.json
bun test test/native/workspace-proof.test.ts

# 2. reiniciar só o workspace de prova próprio (recria sessão/identidades)
bun run ../../.recovery/a11y-20261002/i1_session_probe.ts --restart

# 3. W06 diagnóstico com viewer Electron real anexado
env -u ELECTRON_RUN_AS_NODE TMPDIR=/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode \
  bun run ../../.recovery/a11y-20261002/workspace_viewer.ts \
  --output "/Users/gustavoschneiter/.local/share/opencode/recovery/dock-accessibility-20261002/i1-runtime-state-v2/workspace-code-8.json" \
  --diagnostic-case W06

# 4. se W06 passar: par completo normal + controle negativo
bun run ../../.recovery/a11y-20261002/i1_session_probe.ts --restart
bun run ./scripts/app-dock-workspace-proof.ts \
  --root "$ROOT" --context resources/linux-runtime \
  --native-payload resources/linux/app-dock-accessibility \
  --image orchestra-native-i1:20261004 \
  --output "$ROOT/workspace-normal-5.json"
bun run ../../.recovery/a11y-20261002/i1_session_probe.ts --restart
bun run ./scripts/app-dock-workspace-proof.ts \
  --root "$ROOT" --context resources/linux-runtime \
  --native-payload resources/linux/app-dock-accessibility \
  --image orchestra-native-i1:20261004 \
  --output "$ROOT/workspace-control-2.json" --suppress-action

ROOT="/Users/gustavoschneiter/.local/share/opencode/recovery/dock-accessibility-20261002/i1-runtime-state-v2"

# 5. validar par com o verificador (ajuste os dois nomes dentro do arquivo antes)
bun run ../../.recovery/a11y-20261002/verify_workspace_pair.ts

# 6. host suite + typecheck do package
bun test src/main/app-dock-native.test.ts src/main/app-dock-native-client.test.ts \
  src/main/app-dock-rpc-native.test.ts src/main/app-dock-rpc-workspace.test.ts ../opencode/src/plugin/app-dock.test.ts
bun typecheck
```

Fixtures Python Linux rodam isolados no container de prova, sem tocar a sessão real:

```sh
docker --host unix:///Users/gustavoschneiter/.docker/run/docker.sock exec --user dock \
  -w /tmp/<seu-dir>/packages/desktop b9f66d795c6af833f2d7537114472373f02e145623eb06b484480ccaabdafafa \
  env -u AT_SPI_BUS_ADDRESS -u XDG_RUNTIME_DIR -u DBUS_SESSION_BUS_ADDRESS TMPDIR=/tmp/<seu-dir> \
  dbus-run-session -- /usr/bin/python3 -B test/native/test_snapshot.py --self-check
```

Ordem obrigatória: **unset do ambiente → Xvfb → D-Bus**. Inverter quebra o socket do testbed principal.
Não parar/reiniciar o container, não tocar `/opt/orchestra`, não usar `/home/dock` para fixtures.

## 5. Ambiente de prova

- Root privado: `/Users/gustavoschneiter/.local/share/opencode/recovery/dock-accessibility-20261002/i1-runtime-state-v2`
- Owner `fb116c6a-dec0-4096-8cf8-ad56ceb0f1bd`
- Container `b9f66d795c6af833f2d7537114472373f02e145623eb06b484480ccaabdafafa`
- Image `orchestra-native-i1:20261004` (`sha256:7e75933d2ef9...32a7c`), derivada de
  `orchestra-linux-eb889345-...:xpra-6.5.4-html5-21` + `at-spi2-core`.
- Code veio de `sha256:7bfae913d474...fb a6` (`orchestra-a11y-test:20260930`) via `docker cp`+`tar` em container descartável.
- UID/GID 10001 `dock`, HOME `/home/dock`, DISPLAY `:100`.
- `i1-session-probe.json` é a fonte de identidade **atual**; `--restart` muda session/StartedAt de novo.
- `i1-runtime-state-v2/metadata.json` **contém senha**. Nunca logar, nunca arquivar em Git.

## 6. Invariantes que não podem ser afrouxadas

- Escopo workspace = GUI acessível do workspace Linux isolado. Título/classe/foco/geometria servem
  **seleção dentro** do workspace já autorizado, nunca autoridade de binding. Não virar "cobertura GUI universal".
- Snapshot não-atômico; nova observação/mutação invalida refs; ACK ≠ conclusão; **nunca replay automático de mutação incerta**.
- Limites: frame 262144 (com LF), bindings 8, refs/nodes 512, calls 1600, depth 40, text 20000, field 256,
  pending 32, timeout 10000ms, cursores 2, proposals 8, actions 8, roots 32, processes 128, keyboardCalls 800.
- Host: startup ≤5000ms, request ≤10000ms incluindo fila, cancel grace ≤1000ms, um semantic in-flight.
  Timeout/abort/ACK de controle não libera slot sem terminal original/reap.
  Capacidade 32 inclui clients, failed retirements e reservas não adotadas.
- NativeError: código ≤256 ASCII `[A-Za-z0-9_-]`, senão `native-cleanup-failed`. Sem caminhos/mensagens privadas.
- Sem `libatspi` no guest (puxa cache cedo). Proibidos `Cache.GetItems`, `GetChildren`, `Properties.GetAll`,
  coleção ilimitada. Travessia indexada por `ChildCount`/`GetChildAtIndex`.
- `native-scope`/census é autoritativo; processo inacessível ou >128 falha, não vira lista parcial.
- Teclado só `mode:"keyboard"` X11, sem fallback; Qt5 posições UTF16; ≤1500 chars.
- `app-dock-native-protocol.ts` é protocolo **privado desktop**: mudança ali **não** exige regerar SDK.
  Protocol público/`HttpApi` mudado → `bun run generate` em `packages/client`.
- Renderer só `window.api`; IPC em `src/main/ipc.ts`; copy visível via i18n typed.

## 7. O que ainda NÃO está provado (não chamar de pronto)

- **W06 completo**: só o teclado foi provado. Faltam o fluxo Settings (baseline one-result, rejeição
  `unstable-ref` do checkbox estável, `dock_action(mode:"observed")` com config lida de forma independente,
  restauração) e o par normal/controle novo com 6 casos.
- **Caminho de produção real**: W01–W06 usam plugin/RPC/preparer/Runtime/helper reais, mas **fixtures**
  in-process de porta, viewer e `ToolContext.ask`. Falta: Electron `AppDockLinux` + IPC + utility-process +
  permission service de verdade, payload empacotado (`extraResources`), restart/reopen/persistência N12.
- Windows named pipes, arm64: nunca executados.
- Performance P01–P05: nenhum baseline/noise/threshold congelado.
- CI: automação nova não implementada.
- Revisão fria final da composição (root-first do guest + correções P1/P2 + W06) ainda útil.
- Snapshot de 2026-10-04 **não** inclui W06 nem as correções desta sessão (foi tirado antes). Refazer no freeze.

## 8. Documentação divergente (corrigir, sem apagar histórico)

- `handoff.md` ainda tem parágrafo exigindo app/janela explícito, seguido do waiver de workspace — harmonizar.
- `runtime-execution.md:11` (I2) ainda descreve associação por janela; contradiz o contrato workspace congelado.
  **Não ressuscitar bloqueio de XID.**
- `closeout.md:12` precisa do checkpoint W06.
- `latest-recheck.json` aponta snapshot antigo.

## 9. Ferramentas de diagnóstico prontas (`.recovery/a11y-20261002/`, ignorado pelo Git)

| Arquivo | Uso |
|---|---|
| `verify_workspace_pair.ts` | valida par normal/controle com controles próprios |
| `workspace_viewer.ts` | driver Electron: anexa `AppDockLinux` real, roda o harness filho, grava `viewer.json` |
| `inspect_code_receipt.ts` | agrupa trace por turno, mostra campo/nós/ms por leitura |
| `workspace_receipt_summary.ts` |Diagnóstico compacto (parses `wire.reply.value.raw`, não `.value.value`) |
| `workspace_timings.ts` | amostra `tool.args`→`tool.result` ordenadas por ms |
| `prepare_workspace_code.ts` | instala Code no workspace de prova a partir da imagem pinada |
| `i1_session_probe.ts` | bootstrap/identidade do workspace de prova (`--restart`) |
| `snapshot_recheck.py` | snapshot de recuperação; whitelist **já expandida** para app/runtime/native/test novos |
| `workspace-proof-tsconfig.json` | typecheck scoped do harness |

## 10. Regras de execução que o usuário pediu

- Um GUI/job pesado por vez. Até dois reviews leves readonly, slices disjuntas, worktrees isoladas.
- Probe curto por hipótese, observable previsto, receipt durável. ~60s alvo de diagnóstico, não SLA.
- Duas hipóteses sem evidência → parar de rerunar e inspecionar mecanismo/trace.
- Green só conta com controle negativo medido. Resultado vazio exige positivo.
- Nunca relaxar guard/oracle/budget para concluir. Melhor registrar waiver humano.
- Sem commits/push/PR até o usuário pedir.

## 11. Branches, worktrees, sessões e estado do host

Verificado em 2026-10-04. Este repositório tem **~200 worktrees**; quase todos são de outras frentes.
Não tocar, não remover, não `git worktree prune` indiscriminado.

### 11.1 Worktree do lead (único que você edita)

`/Users/gustavoschneiter/Documents/HuGR/_worktrees/dock-accessibility` — branch `dock-accessibility`,
`5e4bea3b51`. 118 entradas em `git status --short`, nada commitado.

### 11.2 Worktrees de reviewer desta frente (isolados, detached, já consumidos)

| Caminho | Estado | O que produziu |
|---|---|---|
| `_worktrees/a11y-rpc-review` | `5e4bea3b51` detached | Correções **P1 + P2** (já aplicadas no lead byte-a-byte) |
| `_worktrees/a11y-helper-review` | `5e4bea3b51` detached | **Root-first do snapshot** (já aplicado no lead byte-a-byte) |
| `_worktrees/a11y-focus-review` | `5e4bea3b51` detached | idem; conteúdo do harness superseded pelo lead |

Todos os três mostram ~6710 linhas ` D` no `git status`: são artefatos de sparse checkout
(`--no-checkout`), **não são deleções reais**. Não stagear, não restaurar, não "corrigir".
Os dois arquivos úteis por worktree são `??` (2–4 arquivos cada). Servem só como referência histórica
de o que foi tentado; o lead está à frente.

### 11.3 Branches `a11y-*`

`a11y-actions`, `a11y-channel`, `a11y-lifetime`, `a11y-proof-check`, `a11y-proof-tools`, `a11y-read`,
`a11y-resource`, `a11y-tools` — todas apontam `5e4bea3b51`, `ahead=0 behind=0`. **Nada commitado
nelas.** São relíquias de ref; todo o trabalho real está nos arquivos soltos do lead.

`dock-runtime` também `ahead=0` (fonte preservada, como combinado). `native-admission` está
`ahead=103` mas é de **outra frente** — não tocar. `dock-mcp-native` é outra frente.

### 11.4 Sessões de agente (retomáveis, contexto já carregado)

| Sessão | Worktree | Papel |
|---|---|---|
| `ses_ef94a32bdffedZU6zECb2Y1idS` | `a11y-rpc-review` | achou P1/P2, aplicou as correções |
| `ses_ef94a32a2ffeSNqwI5I4A584Lt` | `a11y-focus-review` | mapeou cobertura do caminho de produção (achou que nenhum harness fecha a cadeia nativa) |
| `ses_ef91647d7ffek4ve7SAaGtP0UX` | `a11y-helper-review` | implementou root-first do snapshot |

Retomar com `task_id` se precisar do contexto/detalhe. **O resultado final já está no lead**;
retomar só serve para perguntar "o que meu enquadramento errou?", não para refazer.

Achado da revisão de produção que continua aberto: nenhum harness existente fecha
Desktop real → IPC → utility-process → permission service → native workspace RPC. Nomes de arquivo
e os pontos de entrada estão em `closeout.md` e nos comentários da seção 7.

### 11.5 Docker (endpoint `unix:///Users/gustavoschneiter/.docker/run/docker.sock`)

| Container | Estado | Regra |
|---|---|---|
| `b9f66d795c6a` `orchestra-linux-fb116c6a-...` | Up | **nosso** workspace de prova. Reiniciar quando o plano pedir |
| `7bf658227d1e` `orchestra-linux-f2c9513b-...` | Up 15h | **alheio. não manipular** |
| `4b0c0c44745b` `hugr-lean-gitlab-linux` | Up | outra frente |
| `7cf91c05d437` buildkit corelink | Up | outra frente |
| `653fe4459902` `orchestra-a11y-session-closeout-20261003` | Exited 17h | testbed legado, parado/preservado |
| `db773e68306b` `...closeout-20261002` | Exited 25h | idem, parado/preservado |
| `a222e5a64749` `...retire-boundary-20261002` | Exited 37h | idem |
| `3a04317bebb3` `orchestra-a11y-session-20260930` | Exited 2d | idem |
| `c4f54922bc1f`, `6e6641b943de` `orchestra-linux-*` | Exited | workspaces antigos, não reutilizar |

Imagens relevantes: `orchestra-native-i1:20261004` (nossa, com at-spi2-core),
`orchestra-a11y-test:20260930` (fonte do Code 1.140.0), `orchestra-linux-eb889345-...:xpra-6.5.4-html5-21` (base).
Se o daemon sumir: `open -a Docker` (autorizado). Não reiniciar Docker à toa.

Volume do nosso container: `b9d87f64051b3564bee3a59384945da86f3d7df2dbfda68a82d05d14f535db57`.

### 11.6 Dependências no host

- `bun install` já feito no lead (2960 pacotes, `--frozen-lockfile --ignore-scripts --backend symlink`).
  `packages/desktop/node_modules` tem 26 entradas.
- `node_modules/electron` é **symlink readonly** para o Electron 42.3.3 do worktree `dock-runtime`.
  Consequência: os testes de browser/Electron do lead usam o binário do `dock-runtime`.
  **Não editar aquele `node_modules`.**
- Bun 1.3.14 às vezes imprime `Internal error: directory mismatch ...runtime-tsconfig.json...`.
  Isso é ruído separado do resultado real — não tratar como falha.
- Para browser/Electron: `env -u ELECTRON_RUN_AS_NODE TMPDIR=/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode bun run test:app-dock:{tools,rpc,e2e}`
  em `packages/desktop`.
- O diretório `.recovery/a11y-20261002/deps/` **não existe** (o summary antigo mentia); o resolver
  persistido é `.recovery/a11y-20261002/runtime-tsconfig.json` + `workspace-proof-tsconfig.json`.

### 11.7 Sessão opencode original (para quem quiser ler o transcript completo)

- Root session `ses_f0c3ddc49ffepSx1ketF4sV6m7`, DB `~/.local/share/opencode/opencode.db`.
- Filtered SQLite + JSONL preservados em `.recovery/a11y-20261002/recheck-20261004T114807Z`
  (session37 / message2293 / part17630 / todo4, `quick_check ok`).
- `refs/recovery/dock-accessibility-20261002` é **tree**, não commit.
- `latest-recheck.json` aponta `recheck-20261003T184506Z` (antigo). Atualizar para o de 2026-10-04
  quando refizer o snapshot no freeze.
## 12. Checkpoint 2026-10-04 (sessão Claude, worktree `dock-a11y-w06`)

O trabalho saiu do worktree do lead (outra sessão edita lá) para `_worktrees/dock-a11y-w06`, branch `dock-a11y-w06`. O estado do handoff foi reconstruído e provado por bundle idêntico e por 25/26 hashes de proveniência. Nada foi commitado.

**Prova no Orchestra real (não no harness).** App dev rodando a partir deste worktree, App Dock → "Espaço de trabalho Linux" → VS Code lançado pela UI, agente da sessão (MiMo-V2.6-Flash Free) operando pelo caminho de produção: plugin → utility-process → permissão → RPC → helper nativo. Tarefa concluída em 2m40s: abrir a busca, digitar `café 漢字 🧪` (keyboard, `postcondition: verified`), reler o texto exato, limpar e confirmar vazio. Tela conferida por fora.

**Por que o desenho antigo falhava com um agente real:** continuação nativa vale 10s (`refs.py`), e um turno do modelo leva 20–60s; além disso, eventos do app invalidam refs entre turnos. A paginação feita pelo modelo nunca chegava ao alvo.

**Mudanças (sem afrouxar limites do helper ou do host):**
- `packages/opencode/src/plugin/app-dock.ts`: nova `dock_find` (a ferramenta pagina sozinha, pedindo cada continuação imediatamente; reinicia só leituras após `cursor-stale`/`stale-ref`, no máximo 2 vezes; saída compacta) e `target {name, role}` em `dock_action`/`dock_type` (acha e age na mesma chamada; repete só `stale-ref` com `not-dispatched`, nunca resultado `unknown`). Testes em `app-dock.test.ts` (37 pass; 4 mutações de controle mortas).
- `packages/app/src/pages/session/session-side-panel.tsx`: a aba Tasks abria e ficava ativa sozinha quando o agente rodava Shell, escondendo o App Dock no meio da tarefa. Agora ela abre sem roubar o foco de Apps.
- `resources/linux/app-dock-accessibility/bus.py`: chamadas ao provider via `call_sync` (sem o salto pela thread do loop GLib). Medido: 3.89 → 1.89 ms por chamada sob a cota de 0.5 CPU do helper. Suítes Python verdes, mutações de `test_bus` mortas.
- Harness/viewer (`scripts/app-dock-workspace-proof.ts`, `.recovery/.../workspace_viewer.ts`): poll de prontidão do Code dentro do budget, gate de quiescência, waiver humano do switch `disable-backgrounding-occluded-windows` e waiver humano de 120s por fase do W06.

**Como subir o app dev (não óbvio):** o `predev` quebra (`install-electron` não existe). Rode `OPENCODE_VERSION=1.18.27 bun script/build-node.ts` em `packages/opencode` (sem isso a versão sai `0.0.0-<branch>` e o tier grátis recusa), depois `electron-vite dev` em `packages/desktop` com `ELECTRON_EXEC_PATH` (binário do `dock-runtime`), `APP_DOCK_LINUX_IMAGE=orchestra-native-code:20261004` (imagem derivada com Code 1.140.0) e `OPENCODE_DB` isolado, para não migrar o banco real do usuário.

**Configurações no app real (mesmo VS Code, mesmo agente):** abrir Manage → Settings, buscar `@id:files.trimTrailingWhitespace` (keyboard, verified), marcar a caixa com `dock_action` target + `mode: "observed"` em 2m23s; oráculo independente via `docker exec`: `~/.config/Code/User/settings.json` passou de ausente para `{"files.trimTrailingWhitespace": true}`. Restauração (desmarcar) em 36s; o arquivo voltou para `{}`. Sem controle negativo nesta rodada no app real (o controle de ação suprimida existe só no harness).

**Ainda aberto:** controle negativo e receipt durável da rodada no app real; W06 completo no harness com as ferramentas novas; prova com modelo mais forte; cobertura de busca para páginas do navegador (`dock_find` hoje é só nativo); revisão fria das mudanças acima.
