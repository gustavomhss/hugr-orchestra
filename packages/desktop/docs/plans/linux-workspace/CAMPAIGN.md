# Campanha única — Linux workspace para o agente (CLI + interface)

Dono: sessão Claude (assumida em 2026-10-04 por pedido do usuário). Branch de integração:
`dock-linux-unified` em `_worktrees/dock-linux-unified`, base `5e4bea3b51`. Este documento
substitui como índice os handoffs das duas frentes; o detalhe histórico continua neles.

## Objetivo

Um build do Orchestra em que o agente opera o workspace Linux isolado do App Dock de duas formas:

- **Frente A — acesso Linux (CLI/terminal/arquivos):** `linux_exec`, `linux_read`, `linux_write`,
  `linux_list` e `linux_terminal_*` (PTY) pelo canal privado `linux.rpc` e `LinuxWorkspacePlugin`;
  CLI `bun run linux`. Origem: worktree `dock-runtime` (sem commits), handoff em
  `_worktrees/dock-accessibility/packages/desktop/docs/plans/linux-workspace/HANDOFF.md`.
- **Frente B — interface de qualquer app (acessibilidade nativa):** helper AT-SPI no guest,
  `dock_read`/`dock_find`/`dock_action`/`dock_type` com refs `n:`. Origem: branch `dock-a11y-w06`,
  handoff em `docs/plans/dock-accessibility/handoff-claude.md` (seções 1–12).

As duas frentes mexem no mesmo núcleo: runtime Docker, `workspace.py`, App Dock host, IPC,
painel Apps e plugin `app-dock.ts`.

## Estado da integração

| Passo | Estado |
| --- | --- |
| Frente B commitada (`dock-a11y-w06`, 6 commits) | feito |
| 18 arquivos só da frente A + 2 merges limpos (`073926ab0b`) | feito |
| 15 arquivos divergentes: merge de 3 vias por grupos disjuntos | em andamento |
| Gate completo (typecheck, suítes host/plugin/app/script, fixtures Python em container) | pendente |
| Build único + prova no Orchestra real (CLI e interface na mesma sessão) | pendente |
| Controle negativo e receipt durável da rodada no app real | pendente |

Grupos de merge (um agente e um worktree cada; arquivos sem sobreposição):

| Grupo | Branch / worktree | Arquivos |
| --- | --- | --- |
| Runtime | `merge-runtime` | `app-dock-runtime.ts`, `docker-engine.ts(.test)`, `linux-runtime/Dockerfile`, `electron-builder.config.ts`, `docs/linux-runtime.md` |
| Guest | `merge-guest` | `resources/linux-runtime/workspace.py` |
| Host | `merge-host` | `app-dock-linux.ts`, `app-dock-linux-live.test.ts`, `ipc.ts`, `app-dock.ts`, `app-dock-rpc.ts` |
| App/plugin | `merge-app` | `apps-panel.tsx(.test)`, `opencode/src/plugin/app-dock.ts` |

Cada entrega só entra depois de verificação do lead: lista de arquivos, diff, testes por nome e
probe de mutação nos testes do agente.

## Fases seguintes

1. **Gate** no `dock-linux-unified`: `bun typecheck` em `packages/desktop`, `packages/app`,
   `packages/opencode`, `packages/script`; suítes `app-dock-*`, `linux-workspace*`, plugin,
   `apps-panel`, `script`; fixtures Python (`test_bus`, `test_snapshot`, `test_actions`,
   `test_helper`, `test_runtime_session`, `test_workspace`) no container de prova com
   `--self-check`/`--mutations`.
2. **Build único e prova no app real**, uma GUI por vez: Orchestra dev deste branch, Linux no App
   Dock, VS Code lançado pela UI; na mesma sessão o agente usa `linux_exec`/PTY e
   `dock_find`/`dock_action`/`dock_type`; efeito conferido por fora (`docker exec`).
3. **Controle negativo** na rodada real (ação bloqueada de propósito tem que reprovar) e receipt
   durável fora do Git.
4. **Revisão fria** das mudanças da campanha e atualização deste documento.

## Regras herdadas das duas frentes

- Não afrouxar guarda, limite ou oráculo para concluir; mudança de política só com waiver humano.
- Nunca repetir automaticamente mutação com resultado incerto.
- Não reiniciar o app/servidor de outra frente; preservar o login do Slack (vive no container).
- `runtime/metadata.json` e `i1-runtime-state-v2/metadata.json` têm senha: nunca imprimir nem
  arquivar.
- Sem `git add -A`; stage por nome; typecheck e testes a partir do diretório do pacote.
- Uma GUI/job pesado por vez; agentes só com testes direcionados.
- App dev: ver a seção 12 de `docs/plans/dock-accessibility/handoff-claude.md` (versão real no
  build do servidor, `OPENCODE_DB` isolado, `ELECTRON_EXEC_PATH`, imagem
  `orchestra-native-code:20261004`).
