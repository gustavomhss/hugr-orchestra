# Oxlint route-oracle execution (2026-11-10)

Implements the block in `route-oracle-2026-11-10.md`. The hold is not lifted.
This is not zizmor integration and not tip qualification.

## Candidate

- Branch: `native-severity`
- SHA: `b71683ea9aa97cf50ee1092fc01558b7e3eb6532`
- Parent: `7f5ace4007744365874b9ad6dce655ba282923b6`
- Descends from the required base.
- The only change is one row in `packages/core/test/review/route.test.ts`:
  `{ id: "oxlint", source: "catalog", lane: "no-build", status: "routed" }`
  after squawk, in catalog order. The fixture, production route, catalog and
  controller are unchanged.

## Evidence

Typecheck `42826603244`, success, headSha
`b71683ea9aa97cf50ee1092fc01558b7e3eb6532`, packages `@orchestra/core`.

Run `42827399846`, job `test (ubuntu-24.04)`, runner label `ubuntu-24.04`,
runner `GitHub Actions 1000047355`, bun, headSha
`5905bf058e64fb4f1ec777fe923223bc9cc22152`, branch
`ci-run-linux-mwaqsm2a-5905bf0`.

`git diff-tree -r --name-status b71683ea9a 5905bf05` is only `A .ci-run.json`.
That file names package `core`, runner `bun`, args
`./test/review/route.test.ts` and `./test/review/oxlint-catalog.test.ts`,
timeout `120000`, empty env.

Result: 67 pass / 0 fail, 189 assertions. Omni control: not applicable. No
declaring test ran, and the run made no omni spawn. That is not a claim about
native oxlint execution.

This run is content-equivalent to the candidate. It is not an execution whose
headSha is the candidate. Run `42822565653` does not prove this block: it did
not include `route.test.ts`.
