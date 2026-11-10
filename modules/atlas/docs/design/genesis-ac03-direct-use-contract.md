# AC-03 — direct-use coverage matrix

Status: **FROZEN for documentary organization only.** Not a semantic verdict, not a mine, not a consumer redispatch, not a spend, not a PR.

Source sentences:

- `genesis-ownership-plan.md:140` — each intermediate artifact has a direct-use case. Validate real readers, not only Markdown links.
- `genesis-global-completion-plan.md:63-65` — direct usefulness of each required intermediate artifact, not only L2/L3 bodies consulted incidentally. Prepare the finite coverage matrix before deciding whether more semantic evaluation is needed.
- `genesis-global-completion-plan.md:177-181` — six intermediate artifacts were named as having no direct body/section consultation in the enumerated case set. That sentence is not a license to drop rows the inventory now lists.
- `genesis-closeout-plan.md:47-49` — reuse accepted v3 cases. New judged cases only for uncovered criteria. This package does not judge.

## Source of rows

`modules/atlas/docs/design/genesis-campaign-results/need-artifact-case-inventory-v1.json`

A row is open when `actualMatchingResultReadCases` is empty. List every such key. If that count is not six, record the count. Do not delete rows to match the older sentence.

## Output

One file:

`modules/atlas/docs/design/genesis-campaign-results/ac03-direct-use-matrix-v1.json`

Each open row has:

- `key`, `result` hash, copied from the inventory
- `inventoryStatus`, copied, not rewritten into PASS
- `receiptSearch`: paths under `modules/atlas/docs/design/genesis-campaign-results/` whose file text contains that result hash, or an explicit empty list
- `disposition`: `OPEN`. No other value is allowed in this package.

## Stop

Do not add a case, a consumer, a model call, or a usefulness judgment. A hash found in an existing receipt is a citation, not a direct-use PASS.
