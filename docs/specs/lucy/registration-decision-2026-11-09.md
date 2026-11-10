# Lucy native: production registration decision (2026-11-09)

Decision by Astra via the browser, per owner directive. The lead executes and cold-checks.

## Astra verdict (verbatim)

> A — Registrar o oxlint no controller e fechar a execução ponta a ponta.
>
> Com nenhum scanner registrado, essa é a lacuna funcional imediata. Esse bloco permite
> validar controller → inputs → execução → catálogo → relatório em um caminho integrado,
> antes de ampliar o catálogo zizmor.
>
> A documentação exigida por `docs/guides/review.md` acompanha esse bloco como critério
> de aceite. Depois, B.

## Scope

Block A: register the oxlint scanner in the production controller (no scanner is registered
today), closing the path controller → inputs → execution → catalog → report, with the
`docs/guides/review.md` documentation as acceptance. Then block B (zizmor catalog).

## Current state at the canonical tip

- Canonical tip: `native-oxlint-map` `178955c532f933e479f34dafba43d1608313eb78`.
- Catalog has `oxlint.ts` (pack + 2 curated rules, probation).
- Controller has the extracted `actionlint-analyze.ts`; no oxlint controller registration.
- No production scanner is registered.

## Executed result

- `packages/core/src/review-toolkit/oxlint-analyze.ts`: extracted controller.
- `packages/core/src/review-toolkit/analyze.ts`: dispatch + source selection + staging.
- `packages/core/src/review-toolkit/index.ts`: export.
- `docs/guides/review.md`: check documented.
- `packages/core/test/review-toolkit/oxlint-analyze.test.ts`: end-to-end test.
- Fix: dropped rules are now excluded before the native CLI (`excluded: selection.dropped`).

CI `42717964674` at `c0f5dae846222f383e1870e0b348fd75593dd13b` (Ubuntu 24.04 x64):
6 pass / 0 fail, 82 assertions, 284 omni spawns, 0 delegated.

Astra follow-up (verbatim): "A — Sim: catálogo zizmor, com classe e severidade das 36 regras restantes."

## Follow-ups found

- Registration must reuse the qualified preparation/admission already accepted; it must not
  re-qualify native targets or widen the Linux x64 boundary.
- The guide `docs/guides/review.md` is the acceptance criterion for this block.
