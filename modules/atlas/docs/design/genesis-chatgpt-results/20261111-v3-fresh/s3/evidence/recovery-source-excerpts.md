# S3 recovery — literal source excerpts for the pending review findings

Baseline: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`.

These excerpts support the recovered findings. They are source evidence, not execution evidence and not a judge verdict.

## Relay recheck: `not-run` versus `invalid`

`modules/relay/src/audit.ts` defines the bare comparison state:

```ts
const NOT_RUN_BARE: Recheck = {
  status: "not-run",
  items: [],
  note: "Recorded controls only; no current sprint comparison. Pass --sprint to compare.",
}
```

The same file states and implements the boundary:

```ts
// A reachable sprint that cannot be read is invalid, never not-run.
function oracleRecheck(usable: ReadonlyArray<Entry>, sprint: string | undefined) {
  if (sprint === undefined) return Effect.succeed(NOT_RUN_BARE)
  // read/decode/parse failure returns status: "invalid"
}
```

A broken chain or unusable records use a separate `NOT_RUN_BROKEN` note saying that sprint comparison did not run. Therefore the guide must not collapse absent comparison and malformed reachable sprint into one status.

## Cost absent is not zero

`modules/relay/src/audit.ts`:

```ts
// A run with no cost recorded was not measured: total is null, never zero.
```

and the returned note is:

```text
this run recorded no cost data — not zero cost, unmeasured
```

Thus unobserved cost, tokens, billing and physical attempts remain `UNKNOWN`.

## CI procedure

Root `AGENTS.md` says literally:

```text
Tests run on GitHub Actions, never on this machine.
```

and documents:

```sh
bun run test:ci <package> [test files...] [-t pattern] [--os linux|windows|both]
```

For `modules/relay`, selecting only `.py` files runs pytest; other selections run Bun tests. A written command or local result is not a CI run: evidence needs the observed run identity and result.
