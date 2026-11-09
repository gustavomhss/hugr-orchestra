# Lucy native stack reconciliation (2026-11-09)

Decision by Astra via the browser, per owner directive ("quem manda é o Astra").
The lead is the executor and cold-checks every factual claim against `git`.

## Remote state read (before reconciliation)

Common base: `45e3f41c39`. `dev` head: `f10916d142`.

| Branch | SHA | Role |
|---|---|---|
| `native-input-api` | `a9cea7433f` | old chain |
| `native-input-contract` | `904b12706e` | old chain |
| `native-input-seam` | `4ecd1c5712` | old chain |
| `native-input-zizmor` | `3204e2497f` | old chain |
| `native-input-oxlint` | `62840c4b80` | old chain |
| `native-info-report` | `d1e7bf9504` | old chain tip |
| `native-pack-adapters` | `da00fd41f6` | new stack base (PR 1348) |
| `native-scan-boundary` | `31e3f34520` | new stack |
| `native-actionlint-run` | `355d8e9236` | new stack (controller refactor) |
| `native-oxlint-map` | `8cccd250e8b` | new stack (oxlint catalog) |
| `native-zizmor-input` | `5aa42cfc46` | divergent (ancestor of oxlint-map) |

## Astra verdict (verbatim)

> B — reconciliar de baixo para cima, mantendo adapters antes dos seus descendentes.
>
> Ordem
> Rebasear native-pack-adapters sobre native-info-report. Isso encaixa a pilha nova no final da cadeia velha.
> Reempilhar native-scan-boundary sobre os adapters reconciliados e native-actionlint-run sobre o boundary. Preservar o refactor do controller.
> Reempilhar native-oxlint-map sobre native-actionlint-run, incorporando uma única vez a contribuição de native-zizmor-input, antes do catálogo oxlint. Trabalhar com os deltas exclusivos dessas contribuições.
>
> Não adicionar native-zizmor-input novamente depois de native-oxlint-map: você informou que ela já é ancestral de oxlint-map. Se essas contribuições forem separadas em PRs, a ordem é inputs zizmor → catálogo oxlint.
>
> Ponta canônica
> native-oxlint-map reconciliada, em um novo SHA, contendo o controller de native-actionlint-run, os inputs zizmor e o catálogo oxlint.
>
> native-actionlint-run é a base de integração dessas duas contribuições; a ponta final passa a ser o resultado completo.
>
> PR 1348
> Rebaseado e mantido, com: Head: native-pack-adapters. Base: native-info-report.
> Ele continua sendo o PR dos adapters, na base da pilha nova. Colocá-lo sobre a ponta final, como em A, inverteria a dependência: essa ponta já contém os adapters na ancestralidade.

## Cold-check of the factual claims

| Claim | Check | Disposition |
|---|---|---|
| `native-zizmor-input` is an ancestor of `native-oxlint-map` | `git merge-base --is-ancestor 5aa42cfc46 8cccd250e8` | CONFIRMED |
| `native-info-report` is the old-chain tip with open PR 1347 | `gh pr view 1347` base `native-input-oxlint` → head `native-info-report` | CONFIRMED |
| `native-pack-adapters` is not an ancestor of `native-info-report` | `git merge-base --is-ancestor da00fd41 d1e7bf95` → false | CONFIRMED |
| `native-input-seam` is an ancestor of `native-pack-adapters` but not of `native-zizmor-input` | both `merge-base` checks | CONFIRMED |
| `native-actionlint-run` contains the controller refactor and not the oxlint catalog | `git ls-tree` of `packages/core/src/review/catalog/` | CONFIRMED |

The decision's dependency reasoning is sound: adapters must precede their descendants; zizmor's
contribution is already in `native-oxlint-map`'s ancestry, so re-adding it after would duplicate.

## Execution order (approved by Astra)

1. `native-pack-adapters` → rebase onto `native-info-report`; PR 1348 head/base unchanged.
2. `native-scan-boundary` → rebase onto the reconciled adapters.
3. `native-actionlint-run` → rebase onto the boundary (preserve the controller refactor).
4. `native-oxlint-map` → rebase onto `native-actionlint-run` (single incorporation of zizmor input + oxlint catalog).
5. Canonical tip = reconciled `native-oxlint-map` (new SHA).
6. Production catalog/controller registration, zizmor catalog, guides/runtime docs remain open.

## Executed result

The ancestry was already bottom-up except for the last link: `native-info-report`,
`native-pack-adapters`, `native-scan-boundary` and `native-zizmor-input` were already
ancestors of `native-actionlint-run` / `native-oxlint-map`. The only missing link was
`native-actionlint-run` → `native-oxlint-map`, so:

- `native-pack-adapters` onto `native-info-report`: no-op (already stacked).
- `native-scan-boundary` onto the adapters: no-op (already stacked).
- `native-actionlint-run` onto the boundary: no-op (already stacked).
- `native-oxlint-map` rebased onto `native-actionlint-run`: replayed 3 commits
  (`dad7545fe9`, `e634299b58`, `8cccd250e8` → new SHAs), preserving the controller refactor.
  New canonical tip: **`178955c532f933e479f34dafba43d1608313eb78`**.

Remote after reconciliation:

| Branch | SHA | PR |
|---|---|---|
| `native-pack-adapters` | `da00fd41f6` | #1348 → `native-info-report` |
| `native-scan-boundary` | `31e3f34520` | #1355 → `native-pack-adapters` |
| `native-actionlint-run` | `355d8e9236` | #1356 → `native-scan-boundary` |
| `native-oxlint-map` | `178955c532` | #1357 → `native-actionlint-run` |
| `native-zizmor-input` | `5aa42cfc46` | no separate PR; ancestor of #1357 |

PR chain is now linear from #1290 (`lucy-core` → `dev`) through #1357.

Scope note: this is the executor's reconciliation under the Astra decision; it is not a merge,
campaign closure, epic, release or full Lucy delivery.
