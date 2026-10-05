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

## Fatia 2026-10-04 noite: acessibilidade opcional e bordas do target

Decisão de produto (delegada pelo usuário à sessão): a acessibilidade é capacidade opcional da
sessão Linux. Se ela falhar, terminal, arquivos, apps e Slack continuam; só `dock_*` nativo recusa.

- `ca29c6d626` desktop:
  - `workspace.py session` grava `accessibilityError` (código fixo) em vez de abortar; `parse_session`
    aceita só o par ausente com código, nunca um campo sozinho; `native_session` recusa
    `native-session-a11y-unavailable`.
  - Runtime: a admissão do helper saiu da fila de mutação (só o retrato de posse é serializado,
    chamadas concorrentes se juntam); falha nativa não marca mais o workspace como `error`;
    `stop()`/`dispose()` invalidam admissões em voo e esperam por elas. Com isso entrou o
    pré-aquecimento ao abrir a view Linux (commit do branch `helper-prewarm`).
  - Provas: `test_runtime_session.py` 25/0 com 16 mutações mortas (2 novas); desktop typecheck 0;
    testes sem Docker verdes. `src/main/app-dock-runtime-native.test.ts` (Docker real) 4/0: fila livre
    durante a admissão, `stop()` e `dispose()` no meio da admissão sem helper sobrando, sessão sem
    acessibilidade (imagem `orchestra-native-noa11y:20261004`, igual à i1 sem o serviço
    `org.a11y.Bus`). Mutações mortas: fila presa durante a admissão, `dispose()` sem esperar, sem as
    duas checagens de época, guest abortando sem acessibilidade. Não cobertas por teste: a espera em
    `stop()` (a admissão já falha sozinha quando o workspace para) e `marks=false` (o `state()` se
    corrige na leitura seguinte).
  - App real: abrir a view Linux subiu o helper sozinho (workspace em 12 s, helper em 61 s, nenhuma
    chamada do agente) com a lista de apps visível. A rodada do agente (`dock_action` target +
    `dock_find`) falhou com `native-preparation-timeout`/`ownership-unresolved`: com load 120–200 no
    host, o censo `native-scope` do guest levou 1,8–5,0 s contra o prazo de 5 s. Limite não afrouxado;
    repetir com o host aliviado.
- `73621152dc` plugin: segunda passada do `target` cobre a árvore inteira e precisa escolher o mesmo
  controle pela mesma regra (homônimo surgindo em outra página recusa `target-changed`); tempo de
  espera pela permissão empurra o prazo; `dock_find` sinaliza travessia parcial mesmo com resultados.
  52/0, três mutações mortas.
- Suíte desktop inteira: 441 passam; as 2 falhas são de carga de módulo em arquivos intocados desde a
  base (`draft-store` precisa de `node:sqlite`, `wsl/servers` importa o electron do link).

## Validação por exploração (regra do dono)

O dono valida as ferramentas do dock deixando o modelo explorar sozinho, sem roteiro de ferramentas:
se o modelo sofre para usar, a ferramenta não presta. As dores que o dono já levantou no navegador
(sessão "Avaliação completa do dock") são backlog conhecido: `dock_read` verboso e sem filtro por
nome, ref vencida exige reler tudo, `dock_action`/`dock_type` recusam abas do navegador,
`dock_evaluate` morre com CSP, só HTTPS, `dock_screenshot` devolve base64 cru, retângulos de viewport
confusos.

Primeira rodada aberta no app real (2026-10-05, MiMo-V2.6-Flash Free, tarefa: ativar e desfazer
"trim trailing whitespace" pela interface do VS Code): o agente não concluiu em 19 min. Sob load
80–150 vieram `native-preparation-timeout`/`transport-timeout`; depois de um timeout, toda chamada
passou a responder `helper-termination-failed` para sempre. Causa: o canal do helper guarda como
definitiva a falha de limpeza que perdeu o prazo de 5 s, e o runtime ficava preso nesse helper
morto (o container ficou `Exited (137)` sem remoção). Correção `d522ca3495`: o runtime remove o
container do helper pelo ID e rótulos comprovados e só solta o handle depois de provar a remoção;
teste Docker dedicado, mutação morta. Falta repetir a rodada aberta com o host aliviado.

## Pendências (próximas fatias)

1. Rodar `app-dock-runtime-native.test.ts` com Docker (ver acima) e provar no app real: abrir a view
   Linux pré-aquece o helper; lista de apps e launch respondem durante a partida a frio.
2. Teste Docker de `stop()`/`dispose()` com terminal (`access`) abrindo.
3. W06 no harness com as ferramentas novas; pacote empacotado (`extraResources`); Windows/arm64; performance.
4. Nome com atalho ("Settings Ctrl+,") impede casamento exato.

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
