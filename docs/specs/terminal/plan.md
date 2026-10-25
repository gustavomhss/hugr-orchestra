# Terminal do Orchestra: plano de 0 a 100

Revisão 2 de 2026-10-24. Incorpora uma revisão adversarial a frio e uma revisão de completude, ambas de leitura. Nada aqui foi implementado.

Convenções: fatos sobre o código citam arquivo e linha e vieram de leitura; os marcados **[verificado]** foram conferidos de novo depois das revisões. Fatos sobre projetos externos vêm de pesquisa web, fonte secundária, e estão marcados **[a verificar]** até a Fase 0 medi-los.

## 1. Objetivo e escopo

O terminal é superfície de apoio num harness completo, não o centro do produto. Não competimos com Ghostty ou iTerm em latência crua. A entrega fechada significa:

1. **Terminal humano sólido**: sem glitch, input correto (Alt, copiar/colar), reconexão sem corrupção, histórico que sobrevive a restart do app, memória limitada.
2. **Terminal do agente**: o agente executa comandos num PTY visível, com exit code confiável, sem deadlock, sem truncar o que importa, **sem perder nenhuma garantia de confinamento e aprovação do `bash` atual**, e com o humano podendo assumir o controle.
3. **TUIs de agentes** (Claude Code, Codex) renderizam sem flicker nem pulo de scroll.
4. Tudo integrado (protocolo, SDKs, servidor, desktop, web, sessão/evidência), validado em CI, empacotado, documentado e atrás de flags removidas ou declaradas permanentes.

**Fora de escopo, com motivo** (cada item vira linha em "Limites conhecidos" nos docs):

| Item | Motivo |
|---|---|
| Processo sobrevive a restart do servidor | Exige processo-guardião separado, outro épico. A UI mostra "encerrado" com histórico restaurado e há teste disso. |
| Imagens (kitty/sixel), kitty keyboard protocol | Não é necessário para o valor entregue; depende do emulador escolhido. |
| Splits | Aba única por PTY basta; sem demanda medida. |
| Agente operando vim/REPL pelo texto renderizado | Fase posterior, só depois do agente-em-PTY estar estável e aprovado. |
| Leitor de tela do conteúdo do buffer | Limite do emulador (issue #187 do `ghostty-web`); entra só o baseline de acessibilidade da Fase 6. |
| `packages/tui`, `apps/cli`, `apps/web`, `modules/app-dock` | Grep não encontrou uso de PTY ou terminal em `src` nesses pacotes. Os testes e scripts de distribuição do CLI que mencionam pty são de empacotamento e entram na Fase 8. |

## 1.1 Enxugamento após a Fase 0 (prevalece sobre as seções abaixo)

Decisões e evidências em [adr-phase0.md](adr-phase0.md). Por pedido do dono ("sem overengineering"), a v1 corta:

- **Segundo emulador e interface para dois**: fica `ghostty-web`, com patches no fork (modo 2026, loop de render oculto). Fase 1 vira: fork ou vendor próprio, patches, testes, higiene, scrollback em linhas, OSC 52 testado, Alt e copiar/colar testados.
- **`ScreenState` no servidor, snapshot, protocolo v2 com versão, histórico em disco, `terminal.v2`**: cortados. Fase 2 vira: attach com lacuna (servidor manda reset e força repaint). Outbox limitado e teto de PTYs ficaram de fora: o writer do WebSocket (`ws.send`, `Socket.ts:742`) não espera o TCP, então um limite na fila nunca dispara; backpressure real exige o `bufferedAmount` do WebSocket, que o Effect esconde; `request.source.socket.writableLength` lê 0 sob Bun (medido). Um cliente que para de ler faz o servidor crescer (RSS passou de 1,6 GB em 40 s de `yes`): risco conhecido, fora deste épico.
- **Corpus gravado, orçamentos numéricos, soak de 1 h como gates**: cortados. Ficam testes diretos de cada comportamento e uma validação manual de Claude Code e Codex.
- **Shell integration**: zsh e bash primeiro; fish e PowerShell só se houver alvo que os exija.
- **Remoção de `bun-pty`/`node-pty`**: fora deste épico.
- **Busca no scrollback e links `arquivo:linha`**: fora (o emulador não os oferece e não são necessários para o valor).
- **Texto para o modelo**: saída entre marcas OSC 133, sem escapes, tratamento simples de `\r`; sem emulador.

Permanecem como estão: confinamento e paridade com o `bash`, spec e aprovação da Fase 4, nonce, política OSC 52, estado na aba, cwd herdado, docs e `AGENTS.md`.

## 2. Fatos conferidos e correções à primeira versão

- O ring tem `BUFFER_LIMIT = 1024 * 1024 * 2` **em caracteres UTF-16**, não bytes, e o cursor também conta caracteres (`packages/core/src/pty.ts:20,262-290`) **[verificado]**. Qualquer protocolo novo define o cursor na mesma unidade.
- **Correção**: a reconexão com cursor absoluto não corrompe estado enquanto o cliente continua conectado (`pty.ts:350-360`). O replay só começa no meio de uma sequência quando o ring estoura e o cursor do cliente fica abaixo de `bufferCursor` (é cortado para o início), ou num attach novo (`cursor: 0`) depois do estouro. A Fase 0 reproduz exatamente essas duas condições.
- `subscriber.pending` só cresce **antes** de `activate()` (`pty.ts:277,363-372`); o crescimento ilimitado real é o `Queue.unbounded` do outbox, em `apps/orchestra/.../handlers/pty.ts:218` e `packages/server/src/handlers/pty.ts:179`.
- As **duas superfícies de servidor existem**: `packages/server/src/handlers.ts:18,64` importa `PtyHandler` de `./handlers/pty` **[verificado]** e `apps/orchestra/.../handlers/pty.ts` é importado por `server.ts`. Os testes `httpapi-pty` e `httpapi-v2-pty` as cobrem separadamente.
- **Gap de segurança verificado**: `Pty.create` monta o ambiente com `{...process.env, ...input.env}` sem limpar credenciais e sem sandbox (`pty.ts:216-220`) **[verificado]**. O `bash` usa `ToolSafetySandbox.wrap(...)` e `ToolSafetySandbox.environment()` (`bash.ts:210,223,235`), além de `permission.assert` por comando, checagem de diretório externo e `workdir` (`bash.ts:173-186`) **[verificado]**. Um PTY de agente construído sobre `Pty.create` como está **perderia** tudo isso.
- `serialize.ts` **tem** teste (`addons/serialize.test.ts`), que importa `ghostty-web`; corrijo minha afirmação anterior. O que falta de fato é teste de reconexão, restore e eviction do ring.
- `terminal.tsx` também importa `SerializeAddon`, `FitAddon` e `runtime-adapters`; trocar o emulador custa mais que um import. Os e2e `terminal-composer-focus.spec.ts` (linhas 112, 139) e `serialize.test.ts` estão acoplados ao `ghostty-web`.
- Desktop: `apps/desktop/src/main/wsl/runtime.ts:126-130` cai para `@lydell/node-pty` quando omni está desligado, e `linux-workspace-omni.ts` está na allowlist com `@lydell/node-pty` (`script/spawn-allowlist.json:63,65`).
- O CSP do servidor já tem `'wasm-unsafe-eval'` (`apps/orchestra/src/server/shared/ui.ts:9`). O CSP do renderer do desktop **não foi verificado**.

## 3. Decisões de arquitetura

**D1. Emulador atrás de um adapter** (`TerminalEmulator`). Duas implementações até o gate da Fase 0: `ghostty-web` e `xterm.js` com WebGL.

**D2. Estado VT autoritativo no servidor** (`ScreenState` por PTY, dentro de `packages/core`). Serve para reconexão por snapshot, backpressure, histórico em disco e para o agente ler texto renderizado.

**D3. O agente executa pelo mesmo pipeline do `bash`, não por um segundo caminho.** O PTY-backed é um **runner alternativo** do tool `bash` existente, atrás de flag, com o mesmo schema, as mesmas permissões e o mesmo confinamento. Não existe tool novo com autoridade própria. O PTY do agente:
- sobe sob `ToolSafetySandbox.wrap(...)` com `ToolSafetySandbox.environment()` (credenciais removidas), nunca com `process.env` cru;
- é **separado** do PTY do humano; o humano só digita nele em modo assumir, e nesse modo o agente fica pausado e a ação gera evento de auditoria;
- recebe comando do agente somente depois de `permission.assert`, checagem de diretório externo e `workdir`, idênticos ao bash.

**D4. Marcas de shell autenticadas e o que isso protege de verdade.** O nonce impede que **dados na saída** (arquivo, `curl`, host remoto) forjem "comando terminou" ou cwd. Ele **não** protege contra código executando dentro da mesma shell (uma função, `eval` ou script `source`d lê variável de shell). Esse atacante já é o comando autorizado, e o dano dele fica limitado pelo sandbox; forjar exit code só engana o modelo sobre o próprio comando. O limite é documentado e testado, não escondido.

**D5. Saída de terminal é dado não confiável.** O modelo recebe o **texto renderizado** do `ScreenState` (movimentos de cursor e `\r` já aplicados), sem escapes e sem OSC, dentro de um envelope de resultado de ferramenta. Exit code, cwd, duração e nível de integração vão em **campos estruturados fora do trecho truncado**, para que o corte cabeça-e-cauda nunca esconda o resultado.

**D6. Política única de OSC 52**, aplicada em todas as camadas:

| Camada | Leitura (`?`) | Escrita |
|---|---|---|
| Adapter do cliente, PTY humano | negada sempre | configuração `terminal.clipboard`: `ask` (padrão, pergunta uma vez por PTY), `allow`, `deny`; limite de tamanho |
| Adapter do cliente, PTY do agente | negada | negada |
| `ScreenState` e snapshots | sequência nunca entra no snapshot | idem |
| Texto enviado ao modelo | removida | removida |

Motivo: [CVE do Warp](https://www.superagent.sh/blog/when-terminal-output-owns-your-clipboard-osc-52-in-warp) usou exatamente esse canal, com saída de agente ou conteúdo baixado lendo o clipboard.

**D7. Compatibilidade de protocolo.** O attach ganha versão (parâmetro `v` e campo no meta frame). Servidor novo atende cliente antigo pelo caminho de replay atual durante uma janela de compatibilidade de um release; cliente novo detecta servidor antigo e usa replay. A unidade do cursor (caracteres UTF-16) é preservada e documentada; o snapshot informa o cursor do servidor no instante da captura.

## 4. Decisões a fechar (todas fecham antes da fase que dependem)

| # | Pergunta | Recomendação | Fecha em | Quem |
|---|---|---|---|---|
| D-1 | Motor do `ScreenState`: WASM no Bun ou nativo no omni | WASM; nativo só se o spike de memória/CPU da Fase 0 reprovar | Fase 0 | eu, com números |
| D-2 | Qual superfície de servidor está viva | Provável que **as duas** (desktop/orchestra e `packages/server`); lógica fica no core, handlers finos, mudança nas duas | Fase 0 | eu, com evidência |
| D-3 | Emulador: `ghostty-web` ou xterm.js | Pelo gate numérico da Fase 0 | Fase 0 | gate |
| D-4 | Engine `claude-code`: o agente-em-PTY alcança esse engine? | Só se o `Bash` passar por `turn.execute` do runner com o mesmo pipeline; senão declarado **não suportado**, com texto na UI e no doc | Fase 7 | dono |
| D-5 | rc do usuário no PTY do agente | Usar, com `ORCHESTRA_AGENT=1` e `ORCHESTRA_TERMINAL=1` como guards documentados; se os testes de deadlock falharem, shell isolada com ambiente capturado uma vez | Fase 3 | eu, testado |
| D-6 | Aposentar `bun-pty` e `@lydell/node-pty`? | Só se omni cobrir todos os alvos publicados, incluindo WSL e o workspace Linux; senão manter como fallback declarado, nunca no caminho do agente | Fase 8 | dono |
| D-7 | Histórico de scrollback em disco: padrão ligado ou desligado | Ligado só para o PTY humano, com 0600, teto de tamanho, retenção de 7 dias, limpeza ao fechar a aba e opção de desligar | Fase 2 | dono |

## 5. Flags e configurações

Flags (em `flag/flag.ts`, com data de remoção): `ORCHESTRA_TERMINAL_EMULATOR` (`ghostty`/`xterm`), `ORCHESTRA_TERMINAL_SNAPSHOT`, `ORCHESTRA_AGENT_TERMINAL`. Cada uma começa desligada, liga por padrão na fase em que fica validada, e é **removida ou declarada permanente na Fase 8**; flag esquecida reprova a definição de pronto.

Configurações do usuário: `terminal.scrollback` (**em linhas**), `terminal.clipboard`, `terminal.shellIntegration`. Fonte já existe (`context/settings.tsx`).

## 6. Fases

Cada fase lista entregas, arquivos, testes **nomeados** e o portão. Toda fase termina com: `bun run test:ci` nos arquivos da mudança, typecheck pelo workflow `typecheck.yml`, e as guardas do repositório (`check:spawn-imports`, `specialist-name-guard.test.ts`, waiver de godfile se algum arquivo crescer; `pty.ts` tem 395 linhas e `terminal.tsx` 644). Nada pesado roda nesta máquina. A suíte completa roda **uma vez**, no PR do épico, com o rótulo `epic`.

### Fase 0: medir e fechar decisões

**Entregas**
1. **Reprodução do replay**: teste que força overflow do ring e prova se um attach com cursor abaixo de `bufferCursor` ou `cursor: 0` pós-estouro começa no meio de uma sequência e perde tela alternada e modos. O resultado dimensiona o valor real de D2.
2. **Sonda do pin do `ghostty-web`** em diretório isolado, no navegador: scrollback em linhas ou bytes (#140), modo 2026, OSC 52 (leitura e escrita), Alt+tecla (#203), Ctrl+Shift+C e Ctrl+V (#204, #148), loop de render com terminal oculto (#208), WASM sob o CSP do renderer do desktop (#188), render que lança (#189), vazamento de título (#153).
3. **Spike do `ScreenState`**: libghostty-vt em WASM no Bun. Mede memória por instância, CPU por MB processado, e testa o **teste diferencial** que será o portão da Fase 2 (bytes → emulador A; mesmos bytes → snapshot → emulador B; comparar grade de células, modos, cursor, tela alternada, caracteres largos).
4. **Resolução de D-2** com evidência: quem usa cada superfície (desktop, web, CLI, SDK).
5. **Corpus de fixtures**: gravações dos bytes de sessões reais de vim, tmux, less, fzf, htop, Claude Code e Codex. É o que torna a conformância **hermética**, sem credenciais no CI.
6. **Baselines e orçamentos** (proposta inicial, finalizada aqui e gravada no ADR): latência tecla→pixel p95 ≤ 40 ms local; CPU ≈ 0 com terminal oculto; `yes | head -c 100M` sem tarefa longa de UI > 100 ms; crescimento de RSS do servidor limitado por teto por PTY e global. Valores finais saem das medidas, não do desejo.
7. **ADR** `docs/specs/terminal/adr-emulator.md` com a decisão D-3, os números e o plano B.

**Gate de emulador.** `ghostty-web` fica se nenhum bloqueador abaixo falhar sem correção viável em uma semana nossa: input engolido, copiar/colar, Alt, estabilidade em soak, WASM sob CSP, modo 2026. Qualquer falha e o padrão é xterm.js.

**Pronto quando**: relatório com números no ADR, D-1/D-2/D-3 fechadas, fixtures e harness versionados, os testes da Fase 0 rodando em `test:ci`. Soak de 1 h e sessões ao vivo com credenciais são **manuais/noturnos**, declarados como tal; o portão duro é o corpus gravado.

### Fase 1: adapter de emulador e higiene

**Entregas**
- Interface `TerminalEmulator` em `packages/app-shell`: escrita (string e bytes), resize, eventos de dados/título/bell/seleção, busca, provedor de links, foco, descarte, aplicar snapshot, scrollback em linhas, ganchos de parser OSC.
- `terminal.tsx` só consome a interface; remove `Ghostty`, `FitAddon` e `SerializeAddon` do componente, que passam para a implementação.
- Duas implementações atrás da flag `ORCHESTRA_TERMINAL_EMULATOR`.
- Política D6 aplicada **no adapter**, mais título sanitizado e sequências hostis neutralizadas.
- `terminal.v2` no estado persistido do cliente (`context/terminal.tsx:104-105` usa `terminal.v1`), com migração: payload v1 válido é lido e convertido; inválido é descartado e o terminal reanexa. Teste com payload v1 real.
- Portar `serialize.test.ts` e os e2e acoplados (`terminal-composer-focus.spec.ts` e demais `terminal-*.spec.ts`) para rodar nas duas implementações.
- Higiene: remover `_ghostty` sem uso (`terminal.tsx:173`) e o vazamento de `onSubmit` para o div.
- Testes novos: reconexão, restore, eviction do ring, Alt+tecla, copiar/colar, OSC 52 hostil, título hostil.

**Pronto quando**: a troca de emulador é só a flag, a suíte de conformância (corpus da Fase 0) verde nas duas implementações, e a matriz abaixo verde nos três sistemas.

### Fase 2: estado VT no servidor e protocolo v2

**Entregas**
- `ScreenState` em `packages/core` (`write`, `resize`, `snapshot()`, `text(range)`, marcas de prompt), alimentado pelo mesmo caminho do ring em `pty.ts`. Dependência respeita a direção Schema → Core/Protocol → Server.
- **Snapshot no attach** com versão (D7); o cursor do snapshot na mesma unidade do ring. Janela de compatibilidade com replay para clientes antigos.
- **Backpressure**: o outbox deixa de ser `Queue.unbounded` nas **duas** superfícies; quando passa do limite, o servidor para de enfileirar e manda snapshot assim que o cliente alcançar (ideia da [exploração do Ghostty](https://github.com/ghostty-org/ghostty/discussions/12176)).
- **Tetos**: scrollback do servidor em linhas, número máximo de PTYs por servidor, memória por PTY e total, derivados das medidas da Fase 0.
- **Histórico em disco** (D-7): diretório sob o estado do usuário, 0600, versão de formato, teto de tamanho, retenção, limpeza ao fechar, comportamento definido para arquivo corrompido (descarta e registra). Snapshots nunca contêm OSC 52.
- Protocolo: `packages/protocol/src/groups/pty.ts`; **regenerar** com `bun run generate` em `packages/client` e rodar `./packages/sdk/js/script/build.ts` para o SDK legado; atualizar os testes de deriva do OpenAPI (`httpapi-public-openapi`, `httpapi-query-schema-drift`) e `packages/schema/src/event-manifest.ts` se eventos mudarem. Nunca editar `src/generated*`.
- Escopo de ticket: teste de que um ticket de PTY não vale em outro PTY nem em outra Location (`core/pty/ticket.ts`, `app-shell/utils/pty-ticket.ts`, middlewares de autorização das duas superfícies).
- Observabilidade: logs estruturados e contadores para `ring_evictions`, `snapshot_fallbacks`, `slow_client_events`, `dropped_marks`, `snapshot_restore_failures`.

**Testes**: diferencial (snapshot ≡ replay completo sobre o corpus e sobre fuzz de bytes, incluindo tela alternada, caracteres largos, modos de mouse, scrollback); cliente lento não eleva memória acima do teto; cliente antigo contra servidor novo e o inverso; restart mostra histórico e estado "encerrado"; permissão do arquivo em disco.

**Pronto quando**: o teste diferencial passa sobre todo o corpus e o fuzz com semente fixa; memória do servidor limitada sob `yes` com cliente parado; compatibilidade nos dois sentidos; SDKs regenerados sem deriva.

### Fase 3: shell integration com nonce

**Entregas**
- Scripts para zsh, bash (3.2 do macOS e 5.x), fish e PowerShell 7, injetados no spawn sem editar o rc do usuário (por exemplo `ZDOTDIR`, `--rcfile`, `--init-command`, `-NoExit -Command`).
- Sequências: OSC 133 A/B/C/D com número de comando monotônico, OSC 7 (cwd), linha de comando junto da marca C. Marcas sem nonce válido **e** sem número esperado são descartadas e contadas.
- **Entrega do nonce**: o servidor grava o nonce num arquivo 0600 e passa só o **caminho** pelo ambiente; o script, primeira coisa que roda, lê o arquivo, **apaga-o**, remove a variável de caminho do ambiente e guarda o nonce numa variável **não exportada**. Documentado o que isso não cobre (D4).
- **Níveis** `rich`/`basic`/`none` por PTY, visíveis no estado da sessão e informados ao modelo. SSH e shell aninhada sem integração degradam para `basic`/`none`; uma shell aninhada que carrega o script tem outro escopo de nonce e suas marcas são descartadas, não confundidas.
- Robustez (lições do [vscode#313074](https://github.com/microsoft/vscode/issues/313074)): todo estado tem timeout; fallback não é cancelado por evento intermediário; estado inicial definido ao carregar o script; log de eventos do protocolo.
- Guards D-5 documentados em `CONTEXT.md` (`ORCHESTRA_TERMINAL`, `ORCHESTRA_AGENT`).
- Configuração `terminal.shellIntegration` e o desligamento limpo.

**Testes**: matriz shell × versão × sistema; marca forjada por `cat` de arquivo é ignorada; `set -e`, `PROMPT_COMMAND` pré-existente e hooks de rc que chamam de volta o orchestrador não travam; nonce não aparece em `/proc/<pid>/environ` nem em `ps eww` de processos filhos.

**Runners**: bash 3.2 só roda em macOS, fish e pwsh7 precisam estar instalados nos runners; a escolha é parte da entrega (workflow `terminal-matrix.yml`, por `workflow_dispatch` e pelo rótulo `epic`; os testes de unidade da Fase 3 rodam em `test:ci`).

**Pronto quando**: matriz verde nos três sistemas ou o limite de cada célula declarado no doc de limites, e os testes de forja e de vazamento de nonce verdes.

### Fase 4: desenho e aprovação do agente-em-PTY

Esta fase **não escreve código de produto**. Produz `docs/specs/terminal/agent-terminal.md` e o registro `docs/specs/terminal/agent-terminal-approval.md` com a aprovação do dono.

O spec precisa fechar, por escrito:
1. **Onde mora**: um serviço Location-scoped que usa `Pty.Service` e fica ligado ao registro de tools como backend do `bash`. Por que não é um tool novo.
2. **Confinamento**: sandbox, ambiente limpo, `permission.assert`, diretório externo, `workdir`, comandos em background (paridade com `00211262ce`) e limite de captura, cada um mapeado ao trecho de `bash.ts` correspondente.
3. **Ciclo de vida**: como `execute` conclui pela marca D, como abort e interrupt matam o comando (SIGINT ao grupo em primeiro plano, depois parada da árvore pelo omni após a graça), e que eventos persistem na sessão (os mesmos do bash).
4. **Atribuição e controle humano**: campos opcionais de sessão e agente em `PtyInfo`, estados `agent`/`paused`/`human`, confirmação ao digitar durante execução do agente, evento de auditoria na troca.
5. **Modelo de ameaça** completo (D4, D5, D6), incluindo injeção de prompt por saída longa, `\r`, bell e cursor-up que escondem linhas.
6. **Engine `claude-code`** (D-4): caminho ou declaração de não suportado.
7. **Critérios de paridade**: lista exata de casos que o runner PTY deve negar ou aprovar igual ao bash.

**Pronto quando**: spec e registro de aprovação do dono commitados. Sem isso a Fase 5 não começa.

### Fase 5: agente-em-PTY, implementação

**Entregas**
- Runner PTY do `bash` atrás de `ORCHESTRA_AGENT_TERMINAL`, conforme o spec aprovado.
- Ambiente: `PAGER=cat`, `GIT_PAGER=cat`, tamanho 200×50, `TERM` consistente, credenciais removidas por `ToolSafetySandbox.environment()`.
- Retorno ao modelo: texto renderizado e sanitizado (D5) com truncamento cabeça e cauda marcado com a contagem omitida; exit code, cwd, duração, nível, `truncated` como campos estruturados.
- Aba do PTY do agente com atribuição e botão de assumir/devolver; digitar enquanto o agente executa pede confirmação.
- Regeneração de SDK se `PtyInfo` mudou.

**Testes obrigatórios**
- **Paridade negativa com o bash**: os mesmos casos passam pelo bash atual e pelo runner PTY e produzem a mesma decisão. Inclui: credencial em variável não vaza para o comando, escrita fora do sandbox é negada, diretório externo exige permissão, `workdir` externo exige permissão, comando em background segue as regras de `00211262ce`, limite de captura vale.
- Conclusão: comando longo, com pager, que lê stdin, que redefine `PROMPT_COMMAND`, que imprime marca forjada (ignorada), que sai por sinal, abort no meio, timeout.
- Humano: assumir pausa o agente; texto digitado pelo humano não chega ao modelo como saída de comando do agente.
- Injeção: fixtures com instruções escondidas em cabeça, meio e cauda da saída; o envelope as trata como dado.

**Pronto quando**: a suíte de paridade e a de conclusão passam em `test:ci`, nenhum caso pendura (todo estado tem timeout), e o relatório de paridade lista caso a caso. Qualquer divergência de permissão bloqueia a fase.

### Fase 6: superfícies de produto

Mudanças visuais seguem a sessão "Orchestra visual handoff".

- Estado na aba: rodando, ocioso, esperando input, encerrado com código, cwd, portas (da árvore de processos do omni).
- Notificação quando o agente espera input.
- cwd herdado ao abrir nova aba (`context/terminal.tsx:311` hoje envia só o título).
- Busca no scrollback, links `arquivo:linha` integrados ao editor.
- **TUIs de agentes sem flicker**: modo 2026 honrado, viewport preservado quando o usuário rolou para cima, scrollback sem duplicação. Validado com o corpus gravado de Claude Code e Codex (por exemplo, contagem de redesenhos completos fora de bloco 2026 e de saltos de viewport).
- Estado "encerrado" após restart do servidor, com histórico.
- i18n: chaves novas em `packages/app-shell/src/i18n/en.ts` (hoje ~21 chaves de terminal) e as demais línguas conforme o guard de paridade, se existir, ou cair para inglês com isso declarado **[a verificar: guard de paridade]**.
- Comandos e atalhos: registrar buscar, assumir/devolver, limpar em `command.tsx` e `command-palette.ts` (hoje só `terminal.toggle` e `terminal.new`), e declarar quais teclas pertencem ao programa dentro do terminal.
- **Acessibilidade, baseline**: foco e saída do foco por teclado, rótulos de aba e de estado, região viva que anuncia mudança de estado do agente, respeito a `prefers-reduced-motion`.

**Pronto quando**: e2e dos fluxos acima verdes, orçamentos de desempenho da Fase 0 afirmados em teste, revisão visual aprovada.

### Fase 7: integração com sessão, evidência e engines

- `orchestra-evidence-terminal.tsx`: passa a poder mostrar o PTY do agente, não só a aba ativa do usuário, mantendo a regra de um renderizador por PTY.
- Hook de plugin `pty-environment` (`apps/orchestra/src/plugin/pty-environment.ts`, `core/host/pty-environment.ts`, `CONTEXT.md:138`) revisado para o PTY do agente: plugin não pode reintroduzir credenciais no ambiente do agente.
- `packages/schema/src/event-manifest.ts` e testes (`event-manifest.test.ts`, `contract-hygiene.test.ts`) atualizados se eventos mudarem.
- **Engine `claude-code` (D-4)**: o caminho aprovado na Fase 4, ou a declaração de não suportado na UI e no doc, com teste do texto.
- Rotas protocolo por Location e atribuição de sessão/agente com testes de autorização.

**Pronto quando**: fluxo ponta a ponta (sessão → comando do agente → aba atribuída → evidência) coberto por e2e, e D-4 fechada com o dono.

### Fase 8: endurecimento, remoção de legado e entrega

**Remoção de legado** (só se D-6 aprovar). Lista completa, com um **gate de grep** que exige zero referências depois:
`package.json:20,101,137` (postinstall `fix-node-pty`, catálogo), `packages/core/package.json:11,435,455`, `packages/core/script/fix-node-pty.ts`, `packages/core/src/pty/pty.bun.ts` e `pty.node.ts` (mapa `#pty`), `apps/desktop/package.json:45,72-77`, `apps/desktop/electron.vite.config.ts:19,64-67`, `spawn-allowlist.json:43-44,63,65`, `apps/desktop/src/main/wsl/runtime.ts:126-130`, `linux-workspace-omni.ts`, scripts Nix (`nix/scripts/prune-desktop-addons.py`, `verify-distribution.ts`), `apps/orchestra/script/build-node.ts` e os testes de pacote enxuto e de ativos implantados. Se D-6 reprovar, o fallback fica declarado e fora do caminho do agente.

**Empacotamento**: o WASM do servidor entra no build do Bun, em `build-node.ts`, no teste de pacote enxuto, em `verify-distribution.ts` e no payload do CLI; teste automatizado de que o app desktop empacotado e o build web **carregam** o WASM do renderer sob o CSP real.

**Validação final**: soak de 1 h (manual/noturno, resultado anexado), matriz de plataformas completa, conformância no corpus, orçamentos, segurança (forja, OSC 52, título, injeção), paridade com o bash, compatibilidade de protocolo nos dois sentidos.

**Documentação**: ADR do emulador, `docs/specs/terminal/agent-terminal.md`, seção "Terminal e PTY" em `AGENTS.md` com os invariantes (agente só pelo pipeline do bash, ambiente limpo, OSC 52, unidade do cursor, versionamento), `CONTEXT.md` (guards e agente-PTY), documentação do usuário e a lista "Limites conhecidos".

**Entrega**: flags removidas ou declaradas permanentes, notas de release (`release-desktop.yml`, `release-cli.yml`), plano de rollback (flag volta ao valor anterior por um release), nota de handoff, limpeza do que sobrou.

## 7. Estrutura de entrega

- Branch do épico: `terminal-epic` (≤ 3 palavras, sem barras). Uma PR por fase na ordem 0 → 8, com título no formato `type(scope): resumo`, por exemplo `feat(core): server-side VT state for pty`.
- Fases 2 → 3 → 4 → 5 são sequenciais (protocolo e `ScreenState` primeiro); Fase 1 pode correr em paralelo à 2 desde que não toque os mesmos arquivos; Fase 6 depende da 3 e da 5.
- Revisores: o dono aprova o spec da Fase 4 e D-4/D-6/D-7; a sessão visual revisa a Fase 6; revisão independente a frio (agente sem contexto) em cada PR antes do merge.
- Cadência: portão por unidade com `test:ci` direcionado e typecheck pelo workflow; **uma** suíte completa no PR do épico, com o rótulo `epic`; merges de `dev` e conflitos recebem só typecheck e `test:ci` direcionado. Todo teste que spawna processo chama `expectSpawn(import.meta.path)`.

## 8. Definição de pronto do épico

Todos verdadeiros e verificados, com o gate nomeado:

1. Orçamentos de desempenho afirmados em teste (Fase 0 define, Fase 6 afirma).
2. Teste diferencial de snapshot verde sobre corpus e fuzz.
3. Suíte de paridade com o bash verde, sem divergência de permissão.
4. Marca forjada, OSC 52, título hostil e injeção por saída cobertos e verdes.
5. Compatibilidade de protocolo cliente/servidor nos dois sentidos, SDKs regenerados sem deriva, testes de OpenAPI verdes.
6. Matriz shell × sistema verde ou limites declarados.
7. D-1 a D-7 fechadas e registradas; nenhuma flag esquecida.
8. Remoção de legado com grep zerado, ou fallback declarado.
9. Empacotamento verificado em desktop, web, CLI e Nix.
10. Docs, i18n e comandos entregues; baseline de acessibilidade verificado.
11. Suíte completa do épico verde no CI, dizendo qual portão rodou; soak manual anexado.
12. Revisão a frio sem achados bloqueadores em aberto.

## 9. Riscos

- **Fase 5 mexe em segurança.** Qualquer atalho vira regressão de confinamento. Mitigação: runner do `bash`, não tool novo; spec aprovado antes; paridade negativa como portão.
- **Maturidade do `ghostty-web` e do libghostty-vt** (API instável). Mitigação: adapter, versão fixa, plano B xterm.js, gate numérico.
- **Custo do `ScreenState`**: memória por PTY e correção do snapshot são desconhecidas até o spike da Fase 0. Se reprovar, D2 recua para um ring melhor (corte em fronteira segura) sem emulador no servidor, e o agente lê texto por outro caminho; a Fase 2 é reescrita, o resto permanece.
- **Windows**: ConPTY (fechamento de até 6 s, `pty.ts:27`) e PowerShell têm comportamento próprio; a matriz inclui Windows ou o limite é declarado.
- **Corpus gravado envelhece** quando Claude Code e Codex mudam o que emitem; o corpus é versionado e a atualização é uma tarefa documentada.
- **Fontes secundárias** da pesquisa de mercado; a Fase 0 troca suposição por medição.
