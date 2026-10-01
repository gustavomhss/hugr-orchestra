# Orchestra — estado da campanha e retomada

**Ponto único de entrada para a próxima sessão.** Leia este documento antes de
alterar código, trocar a base ou iniciar um novo chapter.

## 1. Resumo executivo

| Item | Estado verificável |
| --- | --- |
| Produto entregue | Migração da identidade desktop HuGR/Orchestra, publicada no PR [#239](https://github.com/gmhelmold/HuGR-Orchestra/pull/239) |
| Commit de implementação | `791b3bc9d06125e8ed4ad891a9e1e61798ae18ba` |
| Branch de trabalho | `identity-integration`, tracking `fork/identity-integration` |
| Base da implementação | `fork/dev@da2b75aff12e21c9974ebc5be41ae138302de40b` |
| Integração em dev | **Pendente: E2E Linux e Windows falharam.** Não há aprovação de merge |
| Campanha integral | Épico [#215](https://github.com/gmhelmold/HuGR-Orchestra/issues/215), aberto; esta entrega é uma fatia, não fechamento do épico |
| Planejamento complementar | PR documental [#232](https://github.com/gmhelmold/HuGR-Orchestra/pull/232), branch `visual-migration-plan`, ainda aberto |
| Chapters C01–C13 | Propostas de rework pendentes; nenhum ativo ou aprovado |
| Próxima prioridade | Resolver regressões/compatibilidade do CI do #239, revisar e integrar; depois reconciliar a cobertura da campanha |

O usuário pediu este checkpoint para continuar em uma sessão nova. Código,
documentação, referências e WIP histórico são preservados com localização e
disposition explícitas. Uma pendência registrada não equivale a entrega aprovada.

O snapshot de GitHub e worktrees em `handoff/` foi coletado em
**2026-10-01T23:09:20.607Z**. A publicação deste handoff adiciona documentação e
arquivos de recuperação ao commit de implementação; o CI dessa nova revisão
deve ser consultado novamente. Os resultados abaixo pertencem ao SHA indicado,
não a qualquer HEAD futuro.

## 2. Onde trabalhar e quais referências usar

**Worktree de integração:**
`/Users/gustavoschneiter/Documents/HuGR/_worktrees/identity-integration`.

**Clone comum/canônico:**
`/Users/gustavoschneiter/Documents/HuGR/orchestra-canonical`.
Ele permanece em `feat/app-dock-mcp@5e4bea3b519c04cebfb787e98dfa171f5771d25c`;
não é a base atual desta entrega. Há quatro conjuntos de artefatos do usuário
nesse checkout, preservados também em `handoff/archives/ancillary-assets.tar.gz`.

| Remote | Destino | Uso |
| --- | --- | --- |
| `fork` | `https://github.com/gmhelmold/HuGR-Orchestra.git` | Publicação autorizada; default `dev` |
| `myfork` | `https://github.com/gustavomhss/HuGR-Orchestra.git` | Outro fork; não é destino deste PR |
| `origin` | `https://github.com/anomalyco/opencode.git` | Upstream; não usar como base por engano |

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

| Área | Arquivos principais |
| --- | --- |
| Skin e marca | `packages/app/src/orchestra/{theme,shell,tabs,session,composer,review}.css`, `brand.tsx`, `public/orchestra/` |
| Shell/perfil | `pages/layout-new.tsx`, `pages/home.tsx`, `orchestra/sidebar.tsx` |
| Abas/modelos | `components/titlebar*.tsx`, `titlebar-tab-order.ts`, `orchestra/model-logo*.ts/tsx` |
| Composer/model selection | `pages/session/composer/prompt-model-selection.ts`, `session-composer-region.tsx` |
| Review/layout | `orchestra/review.tsx`, `orchestra/panel-sizing.ts`, `pages/session.tsx` |
| Bounds Dock | `pages/session/apps-panel-resize.ts`, `apps-panel.tsx` |
| Legacy file tree | `pages/session/legacy-file-tree-panel.tsx`, `session-side-panel.tsx` |
| i18n | `src/i18n/orchestra.ts`, composição tipada em `context/language.tsx` |
| Caption renderer | `components/orchestra/native-frame.ts`, `src/native-titlebar.ts`, `context/platform.tsx` |
| Caption native | `packages/desktop/src/main/{titlebar-frame,windows,ipc}.ts`, preload e renderer |

Os dicionários app/UI atuais, Janitor plurals/templates/native bundles e
handlers nativos de browser foram preservados na integração. `ORCHESTRA_COPY`
compõe o fallback tipado, sem expandir todos os locales ou alegar traduções novas.
Nenhuma dependência runtime nova, alteração de Protocol/Server HttpApi ou waiver.

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

| Check | Resultado final observado |
| --- | --- |
| Godfile, typecheck, nix-eval | SUCCESS |
| Standards/compliance/duplicates/contributor | SUCCESS |
| Atlas scope | SUCCESS; Atlas SKIPPED pelo escopo normal |
| Unit Linux / Windows | SUCCESS / SUCCESS |
| E2E Linux | **FAILURE: 10 failed, 1 flaky, 113 passed** |
| E2E Windows | **FAILURE: 17 failed, 107 passed** |

O run amplo executou 124 casos, não apenas os 21 da entrega. O PR está aberto,
mergeable, mas `UNSTABLE`; nenhuma aprovação humana registrada. Não esconder
falhas selecionando apenas a suite menor ou retirando testes do workflow.

## 6. Bloqueio imediato: E2E antes do merge

Logs completos estão versionados em `handoff/e2e-{linux,windows}-36932235243.log`.
Observação de falha é fato; hipóteses abaixo ainda precisam reprodução.

| Grupo | Evidência | Próximo passo |
| --- | --- | --- |
| Cross-server close | `cross-server-tab-close.spec.ts:10`: esperava sessão B, recebeu Home | Reconciliar filtro por perfil e successor com contrato; preservar cobertura real de servidor e legacy |
| Remote settings / busy | `remote-session-settings.spec.ts:46`, `remote-tab-busy.spec.ts:10`: aba B/indicador antigo não encontrados | Navegar pelo perfil adequado e conferir owner/state do servidor; não apagar assertions de isolamento |
| Project picker | Dois casos em `project-picker-recent-search.spec.ts`: entrypoint antigo ausente | Adaptar entrada ao picker real mantendo busca de todos recentes e limite idle de cinco |
| Home smoke | `smoke/session-timeline.spec.ts:322`: `home-project-row` ausente | Adaptar helper `selectHomeProject`, preservando paginação/ordem do histórico |
| New session corner | `new-session-panel-corner.spec.ts:14`: comparação de pixels false | Reproduzir tema/frame aprovado e verificar se regressão ou oracle antigo; manter prova de cantos |
| Timeline shell/patch | `session-timeline-shell-outline.spec.ts`, dois zooms e patch | Magenta esperado virou `rgba(70,84,98,0.14)`; altura esperada 33 recebeu 81; investigar CSS/fixture e clipping real |
| Review comment | `review-line-comment.spec.ts:47`: flaky no Linux | Preservar sinal; conferir hover/virtualization no painel compacto |
| Native fixture Windows | Todos os sete casos `orchestra/titlebar-native-frame.spec.ts` falharam | Resolver Vite fixture: import `@/context/layout` não resolvido; conferir normalização de `id`/`importer` Windows versus `fileURLToPath` |

Erro Windows observado literalmente:
`Failed to resolve import "@/context/layout" from "src/components/titlebar.tsx". Does the file exist?`

Para mudanças no oracle/gate, provar que o teste continua rejeitando a falha
protegida. Um ajuste visual aprovado pode mudar uma expectativa antiga, mas não
autoriza enfraquecer teste de comportamento, isolamento, clipping ou performance.

## 7. O que falta para encerrar a campanha

1. **CI e integração da identidade:** corrigir os grupos acima, verificação
   proporcional, CI completo na revisão final, review e aceite antes do merge.
2. **Reconciliação de cobertura:** mapear #239 aos tickets de #215/#232;
   classificar cada superfície como migrada, herda tema, pendente ou fora do
   escopo com razão. Não inventar porcentagem nem declarar 66 tasks concluídas.
3. **Superfícies/widgets reais:** conferir lacunas em settings, dialogs/pickers,
   command palette, terminal, diff, checklist/Docs/evidência de testes,
   Tasks/Atividade, Contexto/Own, Maestro, Janitor e Dock. Implementar o que a
   cobertura provar pendente usando controllers/dados existentes.
4. **Rework por chapter:** fechar escopo e aceite de cada proposta antes de
   execução. Infraestrutura existente não é feature ausente. Não inventar
   backend, scheduler ou novos tickets como consequência automática da skin.
5. **Aceitação integrada:** comportamento, visual, foco/contraste/RTL/reduced
   motion, native e budgets de CPU/memória/startup/streaming no mesmo candidato.
6. **Entrega:** evidência permanente, comandos/run/rollback, aceite do usuário e
   fechamento verdadeiro dos tickets. Blocker externo recebe owner/dependência,
   não PASS fictício.

### Registro dos chapters

| Chapter | Destino | Estado / boundary |
| --- | --- | --- |
| C01 | MCP | Pendente; gestão por perfil sobre infraestrutura OpenCode |
| C02 | Skills | Pendente; reutilizar conceito/infra existente |
| C03 | LLM Plugins | Pendente; comportamento/instruções LLM, distinto de plugin geral |
| C04 | Hooks | Pendente; eventos/automação por perfil |
| C05 | Providers | Pendente; settings Providers já existe |
| C06 | Shortcuts | Pendente; settings Shortcuts já existe |
| C07 | CI/CD | Pendente; propostas de pipelines/logs/deploy não são jobs implementados |
| C08 | Agendar | Pendente; proposta one-off/recorrente |
| C09 | .env | Pendente; proposta de editor dedicado |
| C10 | Home/KPIs | Pendente; impacto/uso/gastos, não dados sample como produto |
| C11 | Agents | Pendente; agents existentes, novo destino/roster |
| C12 | Workspaces | Pendente; reutilizar capacidade existente |
| C13 | Dock | Pendente; destino dedicado reutiliza browser App Dock/Apps |

**Nenhum chapter ativo.** C01/MCP foi sugerido como próximo, não iniciado nem
aceito. O usuário escolhe e aprova um por vez; IDs não impõem sequência. As
novas páginas do mock não aprovam domínio/workflow. Atualizar registro e marcador
apenas após aceite. O registro completo está no mock arquivado (`CHAPTERS.md`).

## 8. Performance e limites que não podem desaparecer

As medições de hardware são históricas, feitas na branch original, antes dos
refinamentos finais composer/Review e do port atual. Electron 42.3.3/Chromium148,
Intel UHD630/ANGLE Metal, 18 history turns, 64 deltas, CPU1/batch1/DPR1:

| Tema | RAF-gap p95 base → migrado | Initial visible base → migrado |
| --- | --- | --- |
| Dark | 17.5 → 17.4ms | 371.8 → 608.9ms |
| Light | 17.5 → 17.6ms | 369.8 → 596.7ms |

Software renderer: baseline p95 33.4ms; backdrop grande restaurado chegou a
200–250ms. O custo existe e precisa disposition/budget no candidato final.
Não retirar workload/features, reduzir blur ou trocar referência para obter verde.

Renderer PNG não certifica AppKit inteiro: captura whole-window falhou com
`could not create image from window`. Hit zones nativas Windows/Linux e igualdade
whole-frame entre fontes/dados diferentes permanecem sem certificação.

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
de limpeza fica em `handoff/cleanup.json`; o inventário anterior continua como
proveniência. Não apagar worktrees ou stashes de escopo externo.

**Pendência de merge conhecida:** #239 aguarda E2E/review; #232 e PRs externos
continuam com suas próprias condições. Este handoff não declara tudo merged ou
repo global limpo, nem converte WIP arquivado em produto aprovado.

## 10. Retomada na próxima sessão

No checkout `identity-integration`, leia `AGENTS.md`, `packages/app/AGENTS.md`,
`packages/desktop/AGENTS.md` e este handoff. Em outra máquina, clone o fork e
faça checkout de `identity-integration`; não precisa de ZIP enviado pelo chat.

```sh
# CWD: worktree identity-integration
git status --short --branch
git fetch fork dev identity-integration orchestra-identity
git log --oneline fork/dev..HEAD
gh pr view 239 --repo gmhelmold/HuGR-Orchestra
gh pr checks 239 --repo gmhelmold/HuGR-Orchestra
gh run list --repo gmhelmold/HuGR-Orchestra --branch identity-integration --limit 10
```

Primeiro reproduzir somente os grupos de falha, com portas próprias e waits de
estado. Depois rodar a suite ampla e conferir Linux/Windows no CI. Não repetir
builds/benchmarks verdes sem mudança ou dúvida específica.

```sh
# CWD: packages/app
bun typecheck
bun run typecheck:e2e
bun run test:unit
bun run test:browser
PLAYWRIGHT_PORT=4313 bun run test:orchestra --reporter=line
bun run test:e2e:local -- e2e/regression/cross-server-tab-close.spec.ts e2e/regression/remote-session-settings.spec.ts e2e/regression/remote-tab-busy.spec.ts

# CWD: packages/desktop
bun typecheck
bun test src/main/titlebar-frame.test.ts
bun run build

# CWD: worktree identity-integration; isto é guard, não testes na raiz
GODFILE_BASE_REF=fork/dev bun run check:godfile
```

Preparar o backend/fixture correto para cada runner conforme configuração; não
reiniciar servidor/app do usuário para conseguir uma porta. No CI, o runner
amplo usa a configuração padrão; a suite Orchestra de produção é complementar.

Para consultar o plano ainda não integrado:

```sh
# CWD: worktree identity-integration; ler sem sobrescrever o checkout
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

> Continue a campanha Orchestra a partir de
> `specs/orchestra-visual/HANDOFF.md` na branch `identity-integration` do fork
> `gmhelmold/HuGR-Orchestra`. Revalide HEAD/PR/CI, leia os logs preservados e
> resolva primeiro os bloqueios E2E do PR #239. Preserve visual aprovado,
> Janitor, isolamento por perfil/servidor, gates e trabalho externo. Não refaça
> migração nem misture ancestors da branch original. Depois de CI/review/aceite
> e integração, reconcilie #215/#232 e proponha escopo do C01/MCP; nenhum chapter
> está ativo ou aprovado. Use manifests/archives para recuperação, nunca para
> sobrescrever código atual cegamente. Responda em português, caveman full.
