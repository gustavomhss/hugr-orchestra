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

## Estado da integração (2026-10-04, fim do dia)

| Passo | Estado |
| --- | --- |
| Frente B commitada (`dock-a11y-w06`) | feito |
| 18 arquivos só da frente A + 2 merges limpos | feito |
| 15 arquivos divergentes, merge por 4 grupos disjuntos (agentes, verificados pelo lead) | feito |
| Conflito sem marcador: `mode` com dois sentidos (leitura do navegador × ação nativa), corrigido no host e no plugin, com testes | feito |
| `target` nativo: nome exato vence parciais; alvo decidido na árvore inteira com segunda passada antes de agir | feito |
| Gate: typecheck desktop/app/opencode/script = 0 erros; desktop 379, plugin 46, app 116, script 2, runtime Docker 2, todos sem falha; fixtures Python idênticas às aprovadas | feito |
| Prova no Orchestra real, build único, na mesma sessão | feito |
| Controle negativo no app real | feito |
| Receipt durável | feito: `~/.local/share/opencode/recovery/linux-workspace-campaign-20261004/real-app-joint-proof.json` (0600) |

### Prova no app real (Orchestra dev deste branch, VS Code 1.140.0, agente MiMo-V2.6-Flash Free)

- **Terminal → interface:** `linux_exec`/`linux_write` criam `/home/dock/campaign/nota.txt`; `code --reuse-window` pede a abertura; o VS Code mostra o diálogo de confiança de arquivos; o agente aperta "Open" pela interface; `dock_find` acha a janela "nota.txt - Visual Studio Code". Conferido por fora (`docker exec`).
- **Interface → terminal:** Manage → Settings, busca `@id:files.trimTrailingWhitespace` (keyboard, `verified`), marcar a caixa (`observed`); `linux_read` vê `{"files.trimTrailingWhitespace": true}`; desmarcar e `linux_read` vê `{}`. Repetido no código final: 7/7.
- **Recusa segura:** `target {name: "Settings"}` foi recusado (`target-ambiguous`, nada executado), porque a árvore inteira tem dois itens; com `"Settings Ctrl"` passou.
- **Controle negativo:** com `OPENCODE_PERMISSION={"dock":{"*":"allow","action":"deny"}}`, o primeiro `dock_action` é negado pela regra de permissão, o agente para, e `settings.json` fica com bytes e mtime idênticos. Isso também prova que o serviço de permissão real está ligado ao App Dock.
- **Recolhimento do helper:** helper `accessibility` rodando antes de fechar o app e 0 depois.
- A frente A provou sua correção de versão: o build se carimba `1.18.27-<branch>-<data>` e o free tier aceita.

### Revisão fria (Claude; codex sem cota até 9/out) e correções

Todas integradas e verificadas pelo lead (diff, testes por nome, mutação própria):
- Aba Tasks roubava o foco mesmo com a correção anterior (o `open()` já ativava a aba): agora entra via `setAll` sem ativar quando Apps está ativa. Provado no app real com um subagente em segundo plano.
- `target` agia após varredura incompleta: agora recusa (`target-search-incomplete`) se a cobertura da árvore inteira não fechar; identidade da segunda passada inclui posição, `depth` e `scopeDepth`; prazo total de 90s por chamada. No VS Code real a varredura fecha completa e as ações passam (7/7).
- `stop()`/`dispose()` pulavam o encerramento do helper/container se `access.close()` falhasse: agora encerram sempre e repassam a falha.
- `bus.py`: `OverflowError` de parâmetro fora da faixa vira `protocol-error`, com fixture que falha sem a correção.

## Pendências (próximas fatias)

1. **Pré-aquecer o helper** sem passar pela fila do runtime. A tentativa `helper-prewarm` (branch guardado, não integrado) mostrou que a fila marca o workspace como "erro" em qualquer falha e segura lista de apps/launch/Slack durante a partida a frio. Precisa de um caminho de aquecimento fora da fila.
2. `target`: controle homônimo surgindo em outra página entre as passadas ainda não é detectado; o prazo de 90s inclui o tempo do pedido de permissão; `dock_find` não sinaliza cobertura parcial quando acha resultados.
3. Teste Docker dedicado para `stop()`/`dispose()` com terminal abrindo (a correção não tem teste).
4. Falha do helper nativo (via fila do runtime) marca o workspace inteiro como "erro" na UI.
5. Decisão de produto: o `workspace.py` estrito faz toda a sessão Linux depender do barramento de acessibilidade.
6. W06 no harness com as ferramentas novas; pacote empacotado (`extraResources`); Windows/arm64; performance.
7. Nome com atalho ("Settings Ctrl+,") impede casamento exato.

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
