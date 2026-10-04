# Orchestra — estado da campanha e retomada

**Ponto único de entrada para a próxima sessão.** Leia este documento antes de
alterar código, trocar a base ou iniciar um novo chapter.

## 1. Resumo executivo

| Item                      | Estado verificável                                                                                                                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repositório               | O remote `fork` é o GitLab `gmhelmold/hugr-orchestra`. O GitHub `gusmhs/HuGR-Orchestra` (remote `github-archive`) é só arquivo, e a conta parece sinalizada. A conta GitHub `gmhelmold` foi bloqueada em 2026-10-02, e os links `github.com/gmhelmold/...` deste documento ficaram inacessíveis |
| Identidade desktop        | Integrada em `dev` pelo PR [#239](https://github.com/gmhelmold/HuGR-Orchestra/pull/239), squash `9fc1af89b9` (2026-10-02)                                                                                                                                                                       |
| Chapters onda 1           | Integrados em `dev` pelo PR [#240](https://github.com/gmhelmold/HuGR-Orchestra/pull/240), squash `9e21939938`: C01, C02, C07, C09–C13                                                                                                                                                           |
| Chapters adiados          | C03, C04, C08 (exigem backend inexistente); C05, C06 (painéis de Settings existentes); decisões em [CHAPTERS-SCOPE.md](CHAPTERS-SCOPE.md)                                                                                                                                                       |
| Correções de CI           | PR [#241](https://github.com/gmhelmold/HuGR-Orchestra/pull/241) (deadlock do `InstanceStore` no gate HttpApi); PR #244 (timeouts Windows)                                                                                                                                                       |
| Onda 2                    | Integrada em `dev` (`fork/dev@76015a9dcd`): PRs #4–#25 do GitHub `gusmhs/HuGR-Orchestra`, detalhados em [COVERAGE.md](COVERAGE.md)                                                                                                                                                              |
| Cockpit, onda A           | `wave-a-integration@ab4975dd55`, fora de `dev`: MRs !27 (Tasks e Stop), !31 (Contexto), !33 (checklists) e !34 (Dock)                                                                                                                                                                           |
| Cockpit, onda B           | MR !37 a partir de `wave-b-integration`, fora de `dev`; candidato final com as correções da revisão em `cockpit-review-fixes@607c2bf4c6`                                                                                                                                                        |
| CI                        | O GitLab nunca executou um teste (cota gratuita esgotada); o dono usa um gate local no macOS. Windows e `nix-eval` continuam sem prova (seção 5)                                                                                                                                                |
| Campanha integral         | Épico [#215](https://github.com/gmhelmold/HuGR-Orchestra/issues/215) aberto; nenhuma entrega fecha o épico sem reconciliação e aceite                                                                                                                                                           |
| Planejamento complementar | PR documental [#232](https://github.com/gmhelmold/HuGR-Orchestra/pull/232), inacessível no repositório antigo; a branch `visual-migration-plan` segue no `fork` (`e5b5bf9c44`)                                                                                                                  |
| Aceite do dono            | Pendente para a identidade integrada, cada chapter da onda 1 e o bundle integrado das ondas A e B                                                                                                                                                                                               |
| Próxima prioridade        | Merge na ordem !38 → !27, !31, !33 e !34 → !37 redirecionada para `dev`, com recibos do gate local; depois o aceite do dono e as pendências da seção 7                                                                                                                                          |

O usuário pediu este checkpoint para continuar em uma sessão nova. Código,
documentação, referências e WIP histórico são preservados com localização e
disposition explícitas. Uma pendência registrada não equivale a entrega aprovada.

**Estado atual:** [handoff/STATE.json](handoff/STATE.json) registra os PRs
integrados em `dev`, as ondas A e B com suas MRs, os fatos de hospedagem e CI, as
pendências abertas, o estado de cada chapter (integrado, aceito pelo dono, adiado)
e, em `previousSnapshot`, os SHAs do checkpoint anterior da `identity-integration`
como proveniência.

Os inventários de GitHub e worktrees em `handoff/` (`open-prs.json`,
`global-worktrees.json`, `global-refs.json`) são históricos e foram coletados em
**2026-10-01T23:09:20.607Z**. A publicação deste handoff adiciona documentação e
arquivos de recuperação ao commit de implementação; o CI dessa nova revisão
deve ser consultado novamente. Os resultados abaixo pertencem ao SHA indicado,
não a qualquer HEAD futuro.

## 2. Onde trabalhar e quais referências usar

**Base atual:** `fork/dev` (identidade, chapters onda 1, correções de CI e onda 2
já integrados, em `76015a9dcd`). Trabalho novo começa em worktree própria a partir
de `fork/dev`; a worktree `identity-integration` foi removida após o merge (a
branch segue no fork como histórico).

As ondas A e B ainda não estão em `dev`. `wave-b-integration` contém
`wave-a-integration`, e o candidato final da onda B, `cockpit-review-fixes@607c2bf4c6`,
acrescenta as correções da revisão sobre `wave-b-integration`. Correções do cockpit
partem desse candidato, não de `fork/dev`. As branches de cada lane
(`orchestra-cockpit`, `orchestra-evidence`, `orchestra-governance`,
`orchestra-compact-nav`, `tasks-truth`, `context-unknown-usage`,
`timeline-checklists` e `dock-tab-binding`) ficam como proveniência; não reaplicar
seus commits.

O clone tem cerca de 175 worktrees registradas, a maioria de outras campanhas.
Nunca usar `git worktree prune`, `git worktree remove` ou limpeza em massa.

**Clone comum/canônico:**
`/Users/gustavoschneiter/Documents/HuGR/orchestra-canonical`.
Ele permanece em `feat/app-dock-mcp@5e4bea3b519c04cebfb787e98dfa171f5771d25c`;
não é a base atual desta entrega. Há quatro conjuntos de artefatos do usuário
nesse checkout, preservados também em `handoff/archives/ancillary-assets.tar.gz`.

| Remote           | Destino                                             | Uso                                              |
| ---------------- | --------------------------------------------------- | ------------------------------------------------ |
| `fork`           | `git@gitlab.com:gmhelmold/hugr-orchestra.git`       | Publicação autorizada (GitLab); MRs contra `dev` |
| `github-archive` | `https://github.com/gusmhs/HuGR-Orchestra.git`      | Só arquivo; a conta parece sinalizada            |
| `myfork`         | `https://github.com/gustavomhss/HuGR-Orchestra.git` | Outro fork; não é destino desta campanha         |
| `origin`         | `https://github.com/anomalyco/opencode.git`         | Upstream; não usar como base por engano          |

O `dev` local está antigo. Use `fork/dev` após fetch. Não assumir que `main`
existe, não resetar o canônico e não modificar worktrees de outras campanhas.

### Histórico da entrega

1. Mock aprovado e referência em `Downloads/orchestra-replica-static`.
2. Migração original publicada em `orchestra-identity`, commit
   `9c535be9e98021b34500794bdc207199b120217a`, sobre `5e4bea3b51`.
3. Auditoria encontrou 15 ancestors extras de App Dock/RPC/CI nessa branch.
4. App Dock necessário já estava em `fork/dev`; não precisava desses ancestors.
5. Apenas o delta da identidade foi portado para `identity-integration`.
6. Quatro extrações respeitaram Godfile sem modificar o gate/waivers.
7. Commit `791b3bc9d0` publicado no #239, com screenshots e checks locais.
8. CI amplo revelou falhas adicionais que a suite local de entrega não cobria.

A branch original continua publicada como histórico. **Não fazer PR da branch
original contra dev, force-push, ou cherry-pick dos ancestors para resolver CI.**

## 3. Autoridade visual e decisões congeladas

- Autoridade desta implementação: `app.html`, `mock-features.js`,
  `MOCK-GUIDE.md` e `CHAPTERS.md` do mock aprovado. Cópia completa em
  `handoff/archives/approved-mock.tar.gz`, com hashes em `mock-snapshot.json`.
- Marca oficial: compact inverse/primary SVGs byte-preserved, 121×32px;
  descriptor exato `Human Guardrail`. Uma montanha contínua `mtn-src.jpg`.
- Sidebar 230px, toolbar 45px, gutters/padding 6px, panel radius 9px;
  frame externo margin 12px/radius 13px. Dark/light e glass aprovado.
- Navegação compacta (onda B): 230px a partir de 1440px, 208px em 1280–1439px,
  trilho de 56px quando recolhido ou abaixo de 1280px, e trilho escondido com botão
  na titlebar em 768–1023px. O oracle de geometria da identidade roda em 1672×941,
  acima do breakpoint, para medir 230/45/6 no shell expandido; 208px e 56px ficam
  com `packages/app/e2e/orchestra/compact-navigation.spec.ts`.
- Perfil representa repositório/projeto, fica no rodapé; menu sobe em portal.
  Navegação rola independentemente. Settings usa o owner/servidor correto.
- Abas ficam abaixo da toolbar, sobre conversa e Review; filtro por perfil
  não altera identidade durável. Fechar preserva histórico.
- Modelo da aba vem do último assistant principal executado. Cache limitado
  por aba; histórico desconhecido usa neutro, não modelo configurado.
- Manufacturer explícito/catálogo → router → neutro; Qwen usa Alibaba.
  Draft compartilha seleção e disponibilidade reais do composer.
- Running pulse 2.4s; espera humana bounce/shadow 1.15s; espera precede busy.
  Idle/error/interrupted estáticos; produção respeita reduced motion.
- Composer empilhado 98px; multiline/anexos/placeholders podem crescer.
  Review compacto com lista acima e preview full-width; unified automático
  abaixo de 600px, preservando escolhas explícitas.
- Rail default 430px/360px em janela compacta; conversa mínima 450px;
  resize explícito 600px persiste em `orchestra-session-panel` server-scoped.
- Branch label: dark `#d5ae68`, light `#8a641f`, monospace 10px/peso 500.
  Texto default 400; profile card 46px, metadata 12px, avatar 28×28px.
- `-webkit-backdrop-filter` deve vir **antes** de `backdrop-filter`:
  ordem inversa eliminava propriedade standard no optimizer e zerava o blur.
- Não reduzir blur nem trocar assets para melhorar benchmark. Protótipos
  cached/fused-filter que alteraram pixels foram rejeitados.
- Escopo desta fatia: desktop; comportamento mobile/legacy preservado.
  Não instalar/reiniciar o app ou servidores existentes para verificar a skin.

O pacote de design do #232 contém referências suplementares e decisões do
planejador. Reconciliar com a aprovação do usuário e o código atual; não tratar
renders de referência como implementação ou aceite novo.

## 4. O que já existe no produto

| Área                     | Arquivos principais                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Skin e marca             | `packages/app/src/orchestra/{theme,shell,tabs,session,composer,review}.css`, `brand.tsx`, `public/orchestra/` |
| Shell/perfil             | `pages/layout-new.tsx`, `pages/home.tsx`, `orchestra/sidebar.tsx`                                             |
| Abas/modelos             | `components/titlebar*.tsx`, `titlebar-tab-order.ts`, `orchestra/model-logo*.ts/tsx`                           |
| Composer/model selection | `pages/session/composer/prompt-model-selection.ts`, `session-composer-region.tsx`                             |
| Review/layout            | `orchestra/review.tsx`, `orchestra/panel-sizing.ts`, `pages/session.tsx`                                      |
| Bounds Dock              | `pages/session/apps-panel-resize.ts`, `apps-panel.tsx`                                                        |
| Legacy file tree         | `pages/session/legacy-file-tree-panel.tsx`, `session-side-panel.tsx`                                          |
| i18n                     | `src/i18n/orchestra.ts`, composição tipada em `context/language.tsx`                                          |
| Caption renderer         | `components/orchestra/native-frame.ts`, `src/native-titlebar.ts`, `context/platform.tsx`                      |
| Caption native           | `packages/desktop/src/main/{titlebar-frame,windows,ipc}.ts`, preload e renderer                               |

As áreas abaixo existem no candidato `607c2bf4c6` e ainda não em `dev`. Caminhos
relativos a `packages/app/src/`; a evidência linha a linha está em
[COVERAGE.md](COVERAGE.md), seção "Cobertura do cockpit depois da onda B".

| Área                                 | Arquivos principais                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Tasks e Stop (onda A)                | `pages/session/tasks-data.ts`, `tasks-panel.tsx`                                                                               |
| Contexto desconhecido (onda A)       | `components/session/session-context-metrics.ts`, `session-context-format.ts`                                                   |
| Checklists confirmadas (onda A)      | `packages/session-ui/src/components/confirmed-todos.ts`, `message-part.tsx`                                                    |
| Resize/Hide do Dock por aba (onda A) | `pages/session/apps-panel-controller.ts`, `packages/desktop/src/main/ipc.ts`                                                   |
| Cockpit simultâneo (onda B)          | `pages/session/orchestra-cockpit*`, `orchestra-dock*`, `orchestra-activity*`, `session-side-panel.tsx`                         |
| Painéis locais e evidência (onda B)  | `pages/session/orchestra-evidence-{files,docs,terminal}.tsx`, `orchestra-evidence*.ts/tsx`                                     |
| Replay e preparação de PR (onda B)   | `pages/session/composer/session-evidence-actions.ts`, `pages/session/orchestra-evidence-actions.tsx`                           |
| Governança do Maestro e Own (onda B) | `pages/session/orchestra-governance*`, comando `maestro.governance` em `use-session-commands.tsx`                              |
| Navegação compacta (onda B)          | `orchestra/{compact-navigation.ts,navigation-toggle.tsx,navigation-tooltip.tsx,sidebar.tsx,shell.css}`, `pages/layout-new.tsx` |

Os dicionários app/UI atuais, Janitor plurals/templates/native bundles e
handlers nativos de browser foram preservados na integração. `ORCHESTRA_COPY`
compõe o fallback tipado, sem expandir todos os locales ou alegar traduções novas.
Nenhuma alteração de Protocol/Server HttpApi ou waiver. A identidade não adicionou
dependência runtime; a onda B adiciona `strip-ansi` 7.1.2 como dependência direta
do app, o mesmo pacote que o `session-ui` já usava.

Caption macOS: DTO `{left, top, height}` em CSS viewport; main usa zoom nativo
da janela e valida sender/mainFrame/limites. IPC `set-titlebar-frame`, state em
WeakMap, cleanup em hidden/legacy/mobile/fullscreen/unmount. Controles físicos
em RTL. Posições medidas: `{26,28}` em zoom 1, `{32,36}` em 1.25/RTL, legacy
`{14,14}`. Tipo-only subpath `@opencode-ai/app/native-titlebar` evita poluir
`Window.api` via barrel do app.

As extrações finais são `createNativeTitlebarFrame`,
`createOrchestraPanelSizing`, `createAppDockBoundsSync` e `LegacyFileTreePanel`.
Não reintegrar versões antigas dos workers por cima delas.

## 5. Verificação: resultado local e CI são distintos

### Candidato da onda B, `607c2bf4c6`

O CI do GitLab nunca executou: a cota gratuita de computação se esgotou (568 de
400 minutos em outubro) e os runners compartilhados foram desativados. Os
pipelines criados ficaram presos sem runner (`stuck_pending_no_matching_runners`),
sem nenhum teste executado.

O dono escolheu um gate local que replica no macOS os jobs Linux do
`.gitlab-ci.yml`. As lanes Windows (`unit-windows` e `e2e-windows`) e o
`nix-eval` continuam sem prova. Os resultados abaixo são preenchidos no merge, a
partir de execuções reais do candidato final; não copiar números de recibos
anteriores.

| Check                                                           | Resultado                          |
| --------------------------------------------------------------- | ---------------------------------- |
| `godfile`                                                       | <!-- receipts: filled at merge --> |
| `atlas`                                                         | <!-- receipts: filled at merge --> |
| `unit-linux`                                                    | <!-- receipts: filled at merge --> |
| `e2e-linux` (runner padrão, inclui os casos de desenvolvimento) | <!-- receipts: filled at merge --> |
| `typecheck`                                                     | <!-- receipts: filled at merge --> |
| `storybook` (só quando as regras de caminho do job se aplicam)  | <!-- receipts: filled at merge --> |
| Suíte Orchestra no build de produção (`integration.config.ts`)  | <!-- receipts: filled at merge --> |
| Dock nativo U01–U31 no candidato integrado                      | <!-- receipts: filled at merge --> |
| `unit-windows`, `e2e-windows`, `nix-eval`                       | Sem prova                          |

Os recibos escopados de cada lane, anteriores à integração, estão em
`evidence/S06/`, `evidence/S11/`, `evidence/S15/` e `evidence/S20/`. Eles provam
cada fatia no seu próprio commit, não o candidato integrado.

### Local, candidato de implementação

- App: `bun typecheck`, `bun run typecheck:e2e`, 761 unit e 51 browser passaram.
- Suite de entrega: 21 E2Es em quatro specs, production build, sem benchmarks
  acidentais; recibo `.last-run.json` passou. Quatro capturas adicionais usaram
  o bundle existente, sem novo build ou CSS substituto.
- Desktop: typecheck, production main/preload/renderer build e cinco testes
  de geometry passaram.
- Godfile intacto: 3484 arquivos conferidos, zero erros contra `fork/dev`.
- Reviews frias dos quatro helpers e preservação de Janitor/locales foram
  registradas; controles de mutação incluem geometry/glass/motion/lifecycle.

Fontes: [VERIFICATION.md](VERIFICATION.md), [DELIVERY.md](DELIVERY.md),
[screenshots](screenshots/README.md) e arquivos recuperáveis em `handoff/`.

### GitHub, implementação `791b3bc9d0`

Run: [36932235243](https://github.com/gmhelmold/HuGR-Orchestra/actions/runs/36932235243).
Snapshot completo: [handoff/pr-239.json](handoff/pr-239.json).

| Check                                       | Resultado final observado                   |
| ------------------------------------------- | ------------------------------------------- |
| Godfile, typecheck, nix-eval                | SUCCESS                                     |
| Standards/compliance/duplicates/contributor | SUCCESS                                     |
| Atlas scope                                 | SUCCESS; Atlas SKIPPED pelo escopo normal   |
| Unit Linux / Windows                        | SUCCESS / SUCCESS                           |
| E2E Linux                                   | **FAILURE: 10 failed, 1 flaky, 113 passed** |
| E2E Windows                                 | **FAILURE: 17 failed, 107 passed**          |

O run amplo executou 124 casos, não apenas os 21 da entrega. O PR está aberto,
mergeable, mas `UNSTABLE`; nenhuma aprovação humana registrada. Não esconder
falhas selecionando apenas a suite menor ou retirando testes do workflow.

## 6. Bloqueio de E2E do #239: resolvido

Os oito grupos de falha registrados em `handoff/e2e-{linux,windows}-36932235243.log`
foram corrigidos no #239 antes do merge: fixture nativo com `normalizePath` no
Windows, specs de abas por perfil (fechar a última aba volta para a Home; troca de
perfil pelo menu), entradas do project picker e da Home pelo menu de perfil,
oracle do canto do painel contra o backdrop real, sombra de evidência da timeline
separada do contorno, e hover de comentário de review com retry após re-render.
Cada assert novo teve prova de mutação. O CI final do #239 passou em E2E Linux e
Windows; o único job travado era o gate HttpApi, cuja causa (deadlock do
`InstanceStore` ao fechar com boot em andamento) foi corrigida no #241.

## 7. O que falta para encerrar a campanha

Situação em 2026-10-04, depois da onda B. Números `#NN` recentes são PRs do
GitHub `gusmhs/HuGR-Orchestra`, hoje só arquivo; números `!NN` são merge requests do
GitLab `gmhelmold/hugr-orchestra`.

1. **Hospedagem e CI:** a identidade, os chapters da onda 1 e as correções de CI
   (#239, #240 e #241 do repositório antigo) estão em `dev`, assim como o ajuste de
   CI #15. A MR !38 estende a validação de produto ao GitLab, mas nenhum pipeline do
   GitLab executou testes: a cota gratuita se esgotou e os runners compartilhados
   foram desativados. O gate é local, no macOS, replicando os jobs Linux; Windows e
   `nix-eval` continuam sem prova (seção 5).
2. **Reconciliação de cobertura:** atualizada depois da onda B em
   [COVERAGE.md](COVERAGE.md); a seção "Situação atual" registra a cobertura do
   cockpit com evidência por arquivo.
3. **Lacunas de superfície (onda 2):** integradas em `dev` (`fork/dev@76015a9dcd`):
   - #8 paleta do terminal; #10 branding no splash e na página de erro;
     #12 fundo correto no primeiro paint; #17 alvos de clique de 24 px;
     #21 chaves de provider mascaradas e listas de modelos virtualizadas;
     #23 navegador nativo do Dock escondido sob overlays.
   - #25 regressão de performance: recálculo de estilo no streaming ~2,8 s → 0,28 s
     e passada de scroll 34 s → 10 s, com capturas idênticas pixel a pixel.
   - #19 suíte Orchestra contra o build de produção (89/89) e #6 fixtures do
     Maestro no Windows.
4. **Cockpit (#131/#132):** entregue em duas ondas, ainda fora de `dev`.
   (A) Correções em superfícies existentes, em `wave-a-integration@ab4975dd55`:
   Tasks que só afirmam resultados provados e Stop só da subtask com estados
   pendente, erro e retry (!27), custo e uso desconhecidos no Contexto (!31),
   checklists históricas confirmadas (!33) e Resize/Hide do Dock amarrados à aba e
   à geração (!34). (B) Funcionalidades novas, na MR !37 com candidato final
   `cockpit-review-fixes@607c2bf4c6`: cockpit simultâneo com Dock compacto acima de
   Tasks e Atividade, painéis locais Arquivos/Docs/Terminal, resumo de testes,
   replay seguro e preparação de PR não enviada, destino de governança do Maestro
   com estados honestos de Own, e navegação compacta (230px, 208px e 56px, com
   RTL). Ordem de merge: !38, depois !27, !31, !33 e !34, e por fim !37
   redirecionada para `dev`. Não mergear !37 em `wave-a-integration` e declarar a
   campanha encerrada.
5. **Verificação formal ainda sem automação:** budgets de CPU/memória/startup/
   streaming no CI, matriz visual contra o mock aprovado, contraste e anel de
   foco, hit zones nativas Windows/Linux. A medição A/B manual de 2026-10-02 está
   resumida no PR #25. Recibos do candidato final:
   <!-- receipts: filled at merge -->
6. **Aceite do dono:** identidade integrada, cada chapter da onda 1 e o bundle
   integrado das ondas A e B.
7. **Entrega:** fechar a continuação do épico (#1, aberta no repositório GitHub hoje
   arquivado) e os tickets com evidência real; blocker externo recebe
   owner/dependência, não PASS fictício.

### Pendências abertas

1. Aceite visual do dono do bundle integrado, incluindo a barra lateral de 208px.
   A regra CSS cobre 768–1439px, mas a largura de 208px só aparece em 1280–1439px:
   abaixo de 1280px o layout força o trilho de 56px, e abaixo de 1024px o trilho
   fica escondido atrás de um botão da titlebar. Não há captura de 208px.
2. Janitor (S21): adiado pelo dono.
3. Cabeçalho de Tasks, "Finished" ou "Completed": aguarda confirmação do dono. O
   código usa `orchestra.tasks.finished` ("Finished") em
   `packages/app/src/pages/session/tasks-panel.tsx:506`.
4. O menu de abas do Dock abre deslocado; a causa apontada é o `contain: strict`.
5. Popups de abas do Dock em segundo plano anexam um navegador visível.
6. Decisão do dono sobre o tema Graphite; não há tema Graphite registrado.
7. Prova de CI no Windows e do `nix-eval`.
8. Benchmarks de performance pareados no candidato final.

### Registro dos chapters

| Chapter | Destino     | Estado / boundary                                                                               |
| ------- | ----------- | ----------------------------------------------------------------------------------------------- |
| C01     | MCP         | Em `dev` (#240); inventário por perfil, conectar/desconectar/OAuth. Aguarda aceite do dono      |
| C02     | Skills      | Em `dev` (#240); catálogo e leitor read-only. Aguarda aceite do dono                            |
| C03     | LLM Plugins | Adiado: ativação de comportamentos exige backend inexistente                                    |
| C04     | Hooks       | Adiado: regras/execução declarativas exigem backend inexistente                                 |
| C05     | Providers   | Adiado: painel de Settings existente continua sendo o destino                                   |
| C06     | Shortcuts   | Adiado: painel de Settings existente continua sendo o destino                                   |
| C07     | CI/CD       | Em `dev` (#240); inventário read-only de workflows e draft para o Chat. Aguarda aceite do dono  |
| C08     | Agendar     | Adiado: não há MVP honesto sem scheduler durável                                                |
| C09     | .env        | Em `dev` (#240); editor só em memória com download fiel. Aguarda aceite do dono                 |
| C10     | Home/KPIs   | Em `dev` (#240); "Uso registrado" na Home, sem dados sample. Aguarda aceite do dono             |
| C11     | Agents      | Em `dev` (#240); roster read-only e Chat com o agente escolhido. Aguarda aceite do dono         |
| C12     | Workspaces  | Em `dev` (#240); raiz e sandboxes, draft no workspace escolhido. Aguarda aceite do dono         |
| C13     | Dock        | Em `dev` (#240); um navegador por projeto, compartilhado com a aba Apps. Aguarda aceite do dono |

Escopo e aceite por chapter em [CHAPTERS-SCOPE.md](CHAPTERS-SCOPE.md). Chapters
adiados mantêm o marcador "rework pendente" e o diálogo atual. Marcar um chapter
como aceito somente depois do aceite explícito do dono.

## 8. Performance e limites que não podem desaparecer

As medições de hardware são históricas, feitas na branch original, antes dos
refinamentos finais composer/Review e do port atual. Electron 42.3.3/Chromium148,
Intel UHD630/ANGLE Metal, 18 history turns, 64 deltas, CPU1/batch1/DPR1:

| Tema  | RAF-gap p95 base → migrado | Initial visible base → migrado |
| ----- | -------------------------- | ------------------------------ |
| Dark  | 17.5 → 17.4ms              | 371.8 → 608.9ms                |
| Light | 17.5 → 17.6ms              | 369.8 → 596.7ms                |

Software renderer: baseline p95 33.4ms; backdrop grande restaurado chegou a
200–250ms. O custo existe e precisa disposition/budget no candidato final.
Não retirar workload/features, reduzir blur ou trocar referência para obter verde.

Renderer PNG não certifica AppKit inteiro: captura whole-window falhou com
`could not create image from window`. Hit zones nativas Windows/Linux e igualdade
whole-frame entre fontes/dados diferentes permanecem sem certificação.

Os recibos das lanes da onda B registram medições diagnósticas de uma rodada
(`evidence/S11/result.json` e `evidence/S15/result.json`), não qualificação de
performance. Benchmarks pareados no candidato final continuam pendentes:

<!-- receipts: filled at merge -->

## 9. Preservação, worktrees e PRs abertos

Índice: [handoff/README.md](handoff/README.md). Os arquivos `.tar.gz`, patches e
manifests são **recuperação histórica**, não novos módulos runtime nem código
que deva ser aplicado por cima do candidato.

- `worker-snapshots.json`: 14 workers da identidade, 13 com payload de WIP;
  `identity-shell` sem delta físico. SHA, branch, arquivos, patches e hashes
  individuais em `archives/<worker>.json`.
- `approved-mock.tar.gz`: os 27 arquivos do mock, incluindo capítulos, corpus,
  controladores e assets oficiais. Funciona sem o Downloads original.
- `historical-evidence`: logs, medições, capturas e fontes dos probes. Manifest
  `evidence-snapshot.json` explicita arquivos incluídos e outputs/cache omitidos;
  não alegar preservação de uma pasta ausente ou cache regenerável.
- `ancillary-assets.tar.gz`: quatro conjuntos de imagens/mascotes do canônico,
  copiados para recuperação, sem substituir a marca aprovada.
- `global-worktrees.json`: inventário observado do clone inteiro, incluindo
  worktrees externas/prunable; `global-refs.json` registra branches e cinco
  stashes por SHA. São inventário, não autorização de merge/limpeza de trabalho
  Maestro/continuity/AppDock/CI de outras sessões.
- `open-prs.json`: snapshot dos PRs abertos. #238 Maestro/native e #236 continuity
  são frentes independentes; #232 é planejamento; #12/#13 são stacks históricos
  que não devem ser misturados nesta migração.

Os quatro sandboxes `identity-*-limit` foram criados com `--no-checkout`. Seus
indexes mostram muitos paths ausentes; isso **não é exclusão intencional do
produto**. Os patches preservados são scoped aos arquivos físicos de trabalho.
Recuperar HEAD completo, aplicar patches e extrair payload; nunca aplicar uma
deleção em massa inferida desse status.

Workers históricos só podem ser retirados após validar hashes, recuperação,
ausência de processo usando o diretório e publicação remota. O recibo final
de limpeza está em [handoff/cleanup.json](handoff/cleanup.json): **os 14 workers
da identidade foram arquivados, confirmados no remote e aposentados**, com
remoção das branches locais históricas correspondentes. O commit que publicou
os backups é `cbbdf7b1f5`; o inventário anterior continua como proveniência.
Worktrees/stashes externos e os arquivos originais do usuário foram preservados.

`orchestra-identity` permanece como entrega original publicada. Não há WIP de
produto da campanha aguardando resgate de worker; o #239 foi integrado em `dev`
(seção 1).

**Pendências de merge conhecidas:** no GitLab, !38 (validação de produto), !27,
!31, !33 e !34 (onda A) e !37 (onda B), na ordem da seção 7. !36 (continuidade de
contexto), !35 (arsenal Maestro) e !13 (Maestro nativo) são frentes independentes,
fora desta campanha. Este handoff não declara tudo merged ou repo global limpo, nem
converte WIP arquivado em produto aprovado.

## 10. Retomada na próxima sessão

Crie uma worktree a partir de `fork/dev` (ou de `cockpit-review-fixes`, para
correções do cockpit antes do merge) e leia `AGENTS.md`, `packages/app/AGENTS.md`,
`packages/desktop/AGENTS.md` e este handoff.

```sh
git fetch fork dev
git worktree add -b <branch-curta> ../<branch-curta> fork/dev
glab mr list --repo gmhelmold/hugr-orchestra
```

Issues e PRs do GitHub antigo (`gmhelmold/HuGR-Orchestra`) estão inacessíveis; os
snapshots em `handoff/` são a referência para eles.

Verificação proporcional à mudança, com portas próprias e sem reiniciar o
servidor/app do usuário:

```sh
# CWD: packages/app
bun typecheck
bun run typecheck:e2e
bun run test:unit
bun run test:browser
PLAYWRIGHT_PORT=4313 bunx playwright test e2e/orchestra/ --reporter=line

# CWD: packages/desktop
bun typecheck

# CWD: raiz da worktree; guard, não testes
GODFILE_BASE_REF=fork/dev bun run check:godfile
```

Toda rodada de navegador usa o lock compartilhado
`/Users/gustavoschneiter/Documents/HuGR/_worktrees/e2e-lock.sh`; nunca rodar
Playwright em paralelo nesta máquina. O runner de produção e os casos
`@development-only` e `@source-fixture` estão descritos em
`packages/app/e2e/orchestra/INTEGRATION.md`.

Para consultar o plano ainda não integrado:

```sh
# CWD: qualquer worktree; ler sem sobrescrever o checkout
git fetch fork visual-migration-plan
git show fork/visual-migration-plan:specs/orchestra-visual/START-HERE.md
git show fork/visual-migration-plan:specs/orchestra-visual/INDEX.md
git show fork/visual-migration-plan:specs/orchestra-visual/WIDGETS.md
```

O plano publicado prevê 38 WPs/66 tasks e cinco grupos de axiomas por unidade.
Reconciliar a implementação atual antes de escolher a próxima task; o ponto
inicial histórico S01-W1-T1 não obriga refazer código já provado. Não mergear
#232 cegamente nem fechar #215 com #239.

## 11. Regras permanentes

- Comunicação com usuário: português, caveman full; código/docs/commits normais.
- Estabilidade → simplicidade → performance; baseline de produção antes de
  alterar sessão/timeline. Benchmarks não concorrem por CPU com builds/tests.
- Agentes: problema/faixa de arquivos disjunta, branch/worktree própria;
  integração centralizada, review frio e controles de mutação. Nenhum agente
  faz merge. Preservar o checkout Janitor e trabalho de outras sessões.
- Branch até três palavras com hífens; sem slash/type prefix. Commits/PRs
  `feat|fix|docs|chore|refactor|test(scope): summary`.
- Stage por nomes; nunca `git add -A` nesta integração. Não reset/clean/force-push,
  skip hooks, relaxar gate/waiver ou expor segredos para limpar o estado.
- Testes só nos packages; `bun typecheck` nos packages, nunca `tsc` direto.
- Uma rodada de navegador por vez, sempre com o lock compartilhado de E2E.
- Copy via APIs i18n tipadas; preservar English designer-written e Janitor
  plurals/native bundles. Sem inventar traduções ou Gramática no componente.
- Sem novas aliases/star imports/`any`; preferir const/inferência/early returns,
  Bun e helpers só quando expressam conceito real. Effect services nomeados
  antes das chamadas, sem nested service yields.
- Schema → Core/Protocol → Server; Client runtime só Schema/Protocol, não Core/Server.
  Public Protocol/Server HttpApi alterado exige `bun run generate` em
  `packages/client`; generated não é editado direto. Legacy SDK:
  `./packages/sdk/js/script/build.ts`.
- V2 Session Core continua conforme AGENTS: prompt admission durável separada
  de execution, retries exatos, SessionExecution process-global por Session ID,
  placement descoberto no drain, runner Location-scoped, uma `llm.stream` por
  provider turn, reload history, steer/queue explícitos, sem retry pós-crash ou
  legacy/in-memory tool loop. System Context/epochs e EventV2 ownership mantêm
  boundaries existentes.

## 12. Prompt pronto para a sessão nova

> Continue a campanha Orchestra a partir de `specs/orchestra-visual/HANDOFF.md`
> no remote `fork`, o GitLab `gmhelmold/hugr-orchestra`. Identidade (#239),
> chapters onda 1 (#240), correções de CI (#241) e onda 2 já estão em `dev`. As
> ondas A e B do cockpit aguardam merge nas MRs !38, !27, !31, !33, !34 e !37, com
> candidato final `cockpit-review-fixes@607c2bf4c6`. O CI do GitLab não executa;
> use o gate local e registre recibos reais. Siga a seção 7: merge na ordem,
> pendências abertas e aceite do dono. Preserve visual aprovado, Janitor,
> isolamento por perfil/servidor, gates e trabalho externo. Não invente backend
> para chapters adiados. Responda em português, caveman full.
