# OWNERSHIP — projeção canônica v4.1

Fonte única: PLAN.json. Cada task herda seu write scope explicitamente; grants de codegen são condicionais a lease serial.

Um coordenador mantém progress.json. --jobs limita RUNNING + novas alocações. Benchmark reserva o host; nenhum processo é cancelado automaticamente.

Use worktrees de execução isoladas; capture baseline antes de escrever. Não resetar/limpar o checkout pessoal. Integrações podem importar commits de lanes somente com recibos íntegros e atribuição de paths verificada.

Mudança de código do produto não invalida a fotografia histórica S01. Mudança de contrato/cobertura efetiva invalida as provas pertinentes. --affected-by é triagem de impacto, não comando de reinício global.

## S01 — Censo de superfícies e contratos de capacidade
Escrita:
- `specs/orchestra-visual/PLAN.json`
- `specs/orchestra-visual/SURFACES.json`
- `specs/orchestra-visual/CENSUS.json`
- `specs/orchestra-visual/MAP.md`
- `specs/orchestra-visual/OWNERSHIP.md`
- `specs/orchestra-visual/issues/*.md`
- `specs/orchestra-visual/evidence/S01/**`
- `specs/orchestra-visual/coverage-manifest.json`
- `specs/orchestra-visual/BRAND-ASSETS.json`
- `specs/orchestra-visual/BRAND-INTEGRATION.md`

## S02 — Fixture, medição e budgets que realmente reprovam
Escrita:
- `packages/app/e2e/performance/orchestra/**`
- `packages/app/e2e/regression/orchestra-reference.spec.ts`
- `specs/orchestra-visual/performance-baseline.json`
- `specs/orchestra-visual/fixtures/**`
- `specs/orchestra-visual/evidence/S02/**`

## S03 — Tema Graphite em V1/V2 e primeiro paint
Escrita:
- `packages/ui/src/theme/**`
- `packages/app/index.html`
- `packages/app/src/index.css`
- `specs/orchestra-visual/evidence/S03/**`

## S04 — Primitives, estados e tipografia de toda a UI
Escrita:
- `packages/ui/src/components/**`
- `packages/ui/src/styles/**`
- `packages/ui/src/v2/**`
- `specs/orchestra-visual/evidence/S04/**`
Exclusões:
- `packages/ui/src/components/logo.tsx`

## S05 — Marca HuGR oficial e paisagem independente
Escrita:
- `packages/app/src/assets/orchestra/**`
- `packages/desktop/resources/orchestra/**`
- `specs/orchestra-visual/evidence/S05/**`
- `packages/app/src/components/orchestra-brand.tsx`
- `packages/app/src/components/orchestra-brand.test.tsx`
- `packages/ui/src/components/logo.tsx`

## S06 — Shell e navegação da composição aprovada
Escrita:
- `packages/app/src/pages/layout-new.tsx`
- `packages/app/src/pages/layout.tsx`
- `packages/app/src/components/titlebar*`
- `packages/app/src/pages/session/session-panel-layout.ts`
- `packages/app/src/pages/session/session-panel-width.ts`
- `packages/app/src/pages/session/orchestra-shell*`
- `packages/app/src/components/session/session-header.tsx`
- `specs/orchestra-visual/evidence/S06/**`
- `packages/app/src/pages/layout/**`

## S07 — Home, nova sessão, onboarding e erros
Escrita:
- `packages/app/src/pages/home.tsx`
- `packages/app/src/pages/home/**`
- `packages/app/src/pages/new-session*`
- `packages/app/src/pages/error*`
- `packages/app/src/components/session/session-new-view.tsx`
- `specs/orchestra-visual/evidence/S07/**`

## S08 — Chrome desktop, startup, updater e plataformas
Escrita:
- `packages/desktop/src/renderer/**`
- `packages/desktop/src/main/window*`
- `packages/desktop/src/main/menu*`
- `packages/desktop/src/main/theme*`
- `packages/app/src/components/windows-app-menu.tsx`
- `packages/app/src/components/updater-action*`
- `packages/app/src/components/dialog-release-notes.tsx`
- `specs/orchestra-visual/evidence/S08/**`

## S09 — Timeline, mensagens e ferramentas sem rerender global
Escrita:
- `packages/app/src/pages/session/timeline/**`
- `packages/session-ui/src/components/message*`
- `packages/session-ui/src/components/tool*`
- `packages/session-ui/src/styles/message*`
- `packages/session-ui/src/styles/tool*`
- `packages/session-ui/src/v2/components/message*`
- `packages/session-ui/src/v2/styles/message*`
- `packages/session-ui/src/components/markdown*`
- `packages/session-ui/src/components/session-turn*`
- `packages/session-ui/src/styles/markdown*`
- `packages/session-ui/src/styles/session-turn*`
- `packages/session-ui/src/v2/components/session-turn*`
- `specs/orchestra-visual/evidence/S09/**`
Exclusões:
- `packages/session-ui/src/components/message-file*`

## S10 — Composer, anexos e seleção de execução
Escrita:
- `packages/app/src/components/prompt-input*`
- `packages/app/src/pages/session/composer/**`
- `packages/app/src/pages/session/use-composer-commands.tsx`
- `packages/session-ui/src/v2/components/prompt-input/**`
- `packages/app/src/components/dialog-subagent-models.tsx`
- `packages/app/src/components/draft-subagent-models*`
- `packages/app/src/components/subagent-model-rules*`
- `specs/orchestra-visual/evidence/S10/**`

## S11 — Arquivos, diff, terminal e evidência verificável
Escrita:
- `packages/app/src/pages/session/review-tab.tsx`
- `packages/app/src/pages/session/v2/review*`
- `packages/app/src/pages/session/file-tabs*`
- `packages/app/src/pages/session/terminal-panel*`
- `packages/app/src/components/file-tree*`
- `packages/app/src/components/terminal.tsx`
- `packages/session-ui/src/pierre/**`
- `packages/session-ui/src/components/session-review*`
- `packages/session-ui/src/components/session-diff*`
- `packages/session-ui/src/components/file*`
- `packages/session-ui/src/v2/components/session-review*`
- `packages/app/src/pages/session/orchestra-evidence*`
- `packages/session-ui/src/components/message-file*`
- `packages/app/src/pages/session/v2/session-file-browser*`
- `packages/app/src/components/session/open-in-app*`
- `specs/orchestra-visual/evidence/S11/**`

## S12 — Configurações gerais, teclas e conexões
Escrita:
- `packages/app/src/components/settings-v2/**`
- `packages/app/src/components/settings-*.tsx`
- `packages/app/src/components/settings-dialog.tsx`
- `packages/app/src/components/dialog-settings.tsx`
- `specs/orchestra-visual/evidence/S12/**`
Exclusões:
- `packages/app/src/components/settings-v2/providers.tsx`
- `packages/app/src/components/settings-v2/models.tsx`
- `packages/app/src/components/settings-providers.tsx`
- `packages/app/src/components/settings-models.tsx`

## S13 — Providers, credenciais, modelos e MCP
Escrita:
- `packages/app/src/components/settings-v2/providers.tsx`
- `packages/app/src/components/settings-v2/models.tsx`
- `packages/app/src/components/settings-providers.tsx`
- `packages/app/src/components/settings-models.tsx`
- `packages/app/src/components/dialog-connect-provider*`
- `packages/app/src/components/dialog-custom-provider*`
- `packages/app/src/components/dialog-manage-models.tsx`
- `packages/app/src/components/dialog-select-model*`
- `packages/app/src/components/dialog-select-mcp.tsx`
- `packages/app/src/components/model-tooltip.tsx`
- `specs/orchestra-visual/evidence/S13/**`

## S14 — Command palette, busca, pickers e popovers
Escrita:
- `packages/app/src/components/dialog-command-palette-v2*`
- `packages/app/src/components/command-palette.ts`
- `packages/app/src/components/dialog-select-directory*`
- `packages/app/src/components/dialog-select-file.tsx`
- `packages/app/src/components/dialog-select-server.tsx`
- `packages/app/src/components/dialog-edit-project*`
- `packages/app/src/components/dialog-fork.tsx`
- `packages/app/src/components/directory-picker.tsx`
- `packages/app/src/components/prompt-project-selector.tsx`
- `packages/app/src/components/prompt-workspace-selector.tsx`
- `packages/app/src/components/status-popover*`
- `packages/app/src/components/dialog-usage-exceeded.tsx`
- `packages/app/src/utils/toast*`
- `specs/orchestra-visual/evidence/S14/**`

## S15 — Dock visual no rail simultâneo
Escrita:
- `packages/app/src/pages/session/apps-panel.tsx`
- `packages/app/src/pages/session/apps-panel.css`
- `packages/app/src/pages/session/orchestra-dock*`
- `specs/orchestra-visual/evidence/S15/**`

## S16 — Bounds, overlays e lifecycle nativo do Dock
Escrita:
- `packages/desktop/src/main/app-dock*`
- `packages/desktop/src/main/ipc.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/preload/types.ts`
- `packages/app/src/context/platform.tsx`
- `specs/orchestra-visual/evidence/S16/**`

## S17 — Projeção incremental e identidade de Tasks
Escrita:
- `packages/app/src/pages/session/tasks-data.ts`
- `packages/app/src/pages/session/tasks-data.test.ts`
- `packages/app/src/pages/session/orchestra-activity-data*`
- `specs/orchestra-visual/evidence/S17/**`

## S18 — Tasks resumidas, drill-down e atividade
Escrita:
- `packages/app/src/pages/session/tasks-panel.tsx`
- `packages/app/src/pages/session/orchestra-tasks*`
- `packages/app/src/pages/session/orchestra-activity.tsx`
- `specs/orchestra-visual/evidence/S18/**`

## S19 — Contexto, recursos e Own com read boundary explícita
Escrita:
- `packages/app/src/components/session-context-usage.tsx`
- `packages/app/src/components/session/session-context-*`
- `packages/app/src/pages/session/orchestra-context*`
- `packages/server/src/orchestra-context-read/**`
- `packages/protocol/src/orchestra-context-read/**`
- `packages/client/src/orchestra-context-read/**`
- `specs/orchestra-visual/evidence/S19/**`

## S20 — Maestro: status, input e aprovação sem autoridade fictícia
Escrita:
- `packages/app/src/pages/session/orchestra-governance*`
- `packages/server/src/orchestra-governance-read/**`
- `packages/protocol/src/orchestra-governance-read/**`
- `packages/client/src/orchestra-governance-read/**`
- `specs/orchestra-visual/evidence/S20/**`

## S21 — Janitor: widget, pocket e diagnósticos contextualizados
Escrita:
- `packages/app/src/components/janitor*`
- `packages/app/src/context/janitor.tsx`
- `packages/app/src/utils/janitor-report*`
- `packages/desktop/src/main/janitor*`
- `specs/orchestra-visual/evidence/S21/**`

## S22 — Localização, acessibilidade e matriz de estados
Escrita:
- `packages/app/src/i18n/**`
- `packages/ui/src/i18n/**`
- `packages/app/e2e/regression/orchestra-accessibility.spec.ts`
- `specs/orchestra-visual/copy.json`
- `specs/orchestra-visual/qa/a11y.json`
- `specs/orchestra-visual/evidence/S22/**`

## S23 — Performance de produto e soak no hardware-alvo
Escrita:
- `packages/app/e2e/performance/orchestra-final/**`
- `packages/desktop/test/orchestra-performance/**`
- `specs/orchestra-visual/qa/performance/**`
- `specs/orchestra-visual/evidence/S23/**`

## S24 — Inspeção visual integral e microacabamento
Escrita:
- `packages/app/e2e/regression/orchestra-visual*`
- `packages/app/e2e/orchestra-screenshots/**`
- `specs/orchestra-visual/qa/visual/**`
- `specs/orchestra-visual/evidence/S24/**`

## S25 — Integração, ativação reversível e entrega completa
Escrita:
- `packages/app/src/app.tsx`
- `packages/app/src/pages/session.tsx`
- `packages/app/src/pages/session/session-side-panel.tsx`
- `packages/app/src/context/settings.tsx`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/server.ts`
- `packages/app/package.json`
- `packages/desktop/package.json`
- `packages/storybook/.storybook/**`
- `specs/orchestra-visual/DELIVERY.md`
- `specs/orchestra-visual/evidence/S25/**`

## Grants compartilhados serializados
- public-api-registration-and-client-codegen: S19-W2-T1, S20-W2-T1; status remote-paths-confirmed-local-footprint-pending
  - `packages/client/src/generated/**`
  - `packages/client/src/generated-effect/**`
  - `packages/client/src/contract.ts`
  - `packages/protocol/src/api.ts`
  - `packages/server/src/api.ts`
  - `packages/server/src/handlers.ts`
