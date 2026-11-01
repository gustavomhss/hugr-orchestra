# Atlas harness

The gates, gate libraries and probes that keep Atlas's code, specs and docs honest. It is not part of the Atlas
product: it reads the tree from the outside and fails the build when a claim and the code disagree. It lives
inside the Orchestra repository with Atlas, and the product depends on the harness only as dev tooling.

## Who uses it

- `modules/atlas/package.json` exposes each gate as an npm script (`npm run layer-guard`, and so on).
- The `atlas` job in `.github/workflows/test.yml` runs them all on every change under `modules/atlas`, and
  `atlas-guard.yml` and `atlas-worklist.yml` run `own-snapshot-guard`. `modules/atlas/.github/workflows/ci.yml` is
  the standalone contract the host job mirrors.
- The policy lock over `harness/gates/` and `harness/lib/` is described in
  [../docs/governance/policy-lock.md](../docs/governance/policy-lock.md); both are admin-owned in `CODEOWNERS`.

## Layout

| Folder | What it holds |
| --- | --- |
| `gates/` | Files that can fail and are run by name in CI: `godfile-guard`, `layer-guard`, `reference-model-guard`, `spec-conformance-guard`, `id-integrity`, `command-doc-guard`, `wiring-guard`, `adr-citation-guard`, `req-clause-guard`, `ears-coamend-guard`, `doc-transcript-guard`, `service-gate-guard`, `own-snapshot-guard`, each with a `*.test.mjs` twin |
| `lib/` | What gates delegate to: `lexing.mjs` (the one TypeScript comment stripper), `reachability.mjs` (value versus type imports), `drift-patterns.mjs` (governance-count drift), `workspace-scan.mjs`, the EARS and quote-coverage helpers |
| `probes/` | Instruments, not gates. A probe judges one run against a written contract and is invoked by hand, so no script in `package.json` runs it |
| `inv-text-pins.json`, `req-clause-ledger.json` | Ledgers read by the property-pin and clause guards |

Probes cover the genesis output contract (`genesis-output-probe.mjs`, `docs/design/genesis-output-contract.md`),
staleness and recall measurement (`a2-staleness.mjs`, `a2r-reproof.mjs`), and a concurrency kit
(`model-call-shim.mjs`, `fake-model.mjs`, `concurrency-report.mjs`) that reports how many model calls of a `mine`
run were in flight. `concurrency-report.test.mjs` is the one probe test the product suite runs: it calibrates the
instrument against a known 8-wide and a known serial run, and takes no external input.

## The rule for `gates/`

`harness/gates/` holds files that can fail and are run by name in CI. Everything a gate imports lives in
`harness/lib/`. `gate-directory.test.mjs` checks both halves empirically: it copies `harness/` into an empty tree
and runs every `gates/*.mjs` there. A gate pointed at a tree with no `docs/` or `packages/` must exit non-zero; a
pure module exits 0. A file that exits 0 having checked nothing reads like coverage, which is why such files
belong in `lib/`.

## Invariant

Harness code never imports `@atlas/*` product code. Verify from `modules/atlas`:

```sh
grep -rnE "^\s*(import|export).*from '@atlas/" harness/   # must return nothing
```

The check looks at import positions on purpose: `@atlas/` appears in prose and in guard fixtures, and those are not
imports. `gate-directory.test.mjs` asserts the same thing.

## Working on it

Tests run on GitHub Actions: from the repository root, `bun run test:ci atlas harness/gates/<name>.test.mjs`. Run a
gate by hand from `modules/atlas` with `npm run <gate>`.

- A new gate must fail when its input is absent, have a teeth test that shows it fails on a planted defect, and be
  added to `package.json`, to the `atlas` job in `.github/workflows/test.yml` and to `ci.yml`.
- A gate change must be a strengthening. Loosening a check needs the owner's review under the policy lock.
- Gates that read the Atlas README (`command-doc-guard`, `wiring-guard`) work from delimited regions
  (`command-table`, `transport-parity`, `unreached`). Keep the markers when editing it.

## Docs the harness owns

The governed pipeline and its execution loop live as prompts and protocols under `../docs/`, left there so the
work-package cards keep their pointer and digest references: [EXECUTION-PROTOCOL](../docs/EXECUTION-PROTOCOL.md),
[DECOMPOSITION-PROTOCOL](../docs/DECOMPOSITION-PROTOCOL.md), [CONVENTIONS](../docs/CONVENTIONS.md), and the
[method](../docs/method/README.md) with its stage prompts (`S0` to `S4`, `C`, `review`) and per-work-package prompts
(`BIND`, `RED`, `GREEN`, `REFACTOR`, `GATE`, `SEAL`) under `docs/method/prompts/`.
