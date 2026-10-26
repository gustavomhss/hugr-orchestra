# Terminal, Fase 0: decisões

2026-10-24. Fase 0 enxuta: só o que decide algo, por leitura de código. Nada foi rodado. O que depende de execução está marcado e vira teste na fase que o consome.

## Evidências

**D-2, superfícies de servidor.** Na época as duas estavam vivas no mesmo servidor: o servidor V1 montava os handlers legados de PTY e os `handlers` de `@orchestra/server`. Com a remoção do V1 resta só `@orchestra/server`. A lógica de sessão é única (`packages/core/src/pty.ts`).

**`ghostty-web` no pin `83c0a07`** (fonte lido, não executado):

| Pergunta | Achado | Consequência |
|---|---|---|
| Scrollback | `lib/ghostty.ts:349`: `scrollbackLimit` em linhas, padrão 10000, "WASM converts to bytes internally" | Intenção é linhas. Se a conversão está correta (issue #140) **só execução diz**; teste na Fase 1. |
| Modo 2026 (synchronized output) | Nenhuma referência em `lib/`. O render loop desenha todo frame (`lib/terminal.ts:1196-1222`). `getMode(mode)` existe (`lib/ghostty.ts:824`) | Não é honrado no renderer, mas dá para honrar com um patch pequeno: pular o render enquanto `getMode(2026)` estiver ligado, com timeout. É o que resolve flicker de TUIs. |
| OSC 52 | Nenhum tratamento no TS (clipboard só por seleção, `selection-manager.ts`) | Provável que seja ignorado, ou seja, negado por padrão. O WASM pode tratar; **confirmar com teste** na Fase 1. |
| Alt+tecla | `input-handler.ts:333` codifica `Mods.ALT` via encoder; `isPrintableCharacter` exclui Alt (`:352`) | Há caminho de encoder; se manda ESC-prefixo (issue #203) **só execução diz**; teste na Fase 1. |
| Render loop oculto | `requestAnimationFrame` perpétuo, sem checagem de visibilidade (`terminal.ts:1219`) | #208 confirmado por leitura. Mitigação: parar o loop quando o painel está oculto. |

## Decisões

1. **Emulador (D-3): fica `ghostty-web`.** Não há motivo para manter dois emuladores. Não se constrói implementação xterm.js nem interface para duas; o xterm.js fica só como plano B documentado, acionado se um teste da Fase 1 reprovar sem correção simples.
2. **`ScreenState` no servidor (D2): cortado da v1.** Motivo: o replay só corrompe depois que o ring de 2 MiB (caracteres) estoura e só para TUIs, que se redesenham com um resize. A correção barata é suficiente: no attach com lacuna, o cliente reinicia o terminal e o servidor força repaint com um resize; o outbox passa a ser limitado e, ao estourar, vira lacuna. O texto que o modelo recebe é a saída entre marcas OSC 133 sem escapes e com tratamento simples de `\r`, sem emulador. Reabrir só se uma medida real mostrar corrupção que o repaint não cura.
3. **Histórico em disco (D-7): não.** Sem emulador no servidor não há snapshot a gravar; evita ainda o risco de segredos em disco.
4. **Aposentar `bun-pty`/`node-pty` (D-6): não neste épico.** Fica como fallback declarado e fora do caminho do agente. Reabrir como épico próprio.
5. **D-1 (motor do ScreenState): não se aplica.**

## O que continua

Política OSC 52 (teste), 2026 e render loop (patch no fork ou vendorado), scrollback em linhas, shell integration com nonce (zsh e bash primeiro), agente-em-PTY como runner do `bash` com paridade de confinamento e aprovação do spec, cwd herdado, estado na aba.
