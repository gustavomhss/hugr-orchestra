# Actions resumed campaign — 2026-10-14

## Owner instructions

> Retome o trabalhjo com eficiencia operacional maxima por favor, agents testam so o que mexeram, testes pesados so no Ci, e Ci apenas no final da campanha. Voce faz PRs pequenas normalmente, mas nao roda o CI, quando fechar tod oo trabalho, faz um stacked PR com todas as PRs bundleadas e roda o CI no stack. Vamos trabahar rapido.

No intermediate CI dispatch or epic labels. Authors write scoped regression tests
and run lightweight owned-file checks; heavy tests and mutation probes wait for
the final stack campaign. Child PRs stay unmerged until final qualification.

## Legacy PR size waiver

WAIVER (human-authorized) — group inherited pre-pause implementation into module
PRs rather than imposing a 400-line cap on its approximately 34,000 accumulated
lines. New corrections stay review-sized; independent review is divided into
blocks of at most 400 changed lines.

- Authorized by: owner, 2026-10-14.
- Question: “Código acumulado antes da pausa soma ~34 mil linhas. Limite de 400
  linhas criaria dezenas de PRs. Para acelerar: posso agrupar esse legado por
  módulos, mantendo correções novas em PRs pequenas e review dividido em blocos de
  até 400 linhas? CI continua só no bundle final.”
- Answer, verbatim: **“Agrupar legado (Recommended)”**.
- Reason: avoid dozens of mechanical PRs for existing uncommitted implementation.
- Remediation/tracking: dependency-ordered module PRs, final bundle with one CI
  campaign; precise outstanding evidence in UI-MOCK-PARITY.md.

## Baselines and ownership

- Private recovery `actions-seed`: `3331b9c7adb94346c5c53e538851df8550c30af4`.
- Publishing base `fork/dev`: `e87fd95799cba0220abf5c86b203bc8d82b29732`.
- Reconciled candidate: `actions-delivery` worktree; original `actions-runtime`
  dirty worktree preserved. Newer dev schema/subagent changes retained.
- Repo: `gustavomhss/hugr-orchestra`; final target `dev`.
- Lockfile reserved for final bundle because its ordinary PR event triggers CI.

R1 writers ran in five disjoint worktrees: controls, dispatch hydration, variable
scopes, desktop streaming, source proposals. Local commits are integrated on the
reconciled candidate; private snapshot ancestry will not be published as the stack.
Lead owns shared model/contract/i18n/codegen and final integration.

Frozen view-owned seams: `Model.inspectWorkflow(workflowID, ref, signal)`,
`Model.resourceScopes(signal)`, `Model.discardSource()`, `Filters.scope?`.
GitLab file proposals preserve exact admitted path and do not change native config
slot/includes/enablement. Unknown request policy remains owner-approved Unknown,
not Available. No live provider mutations or process restart authorized.
