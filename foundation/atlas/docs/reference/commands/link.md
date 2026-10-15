# `atlas link`

Assert that two facts are the same fact — a governed `sameAs` edge. It is an **equivalence, never a merge**:
both nodes stay, and the edge is surfaced on read. With `--retract` it withdraws an equivalence you
previously asserted, by appending, never by deleting.

This page describes the **CLI** command `atlas link`. The MCP tool is `atlas-link`. It is the second of the
two governed write paths (`WRITE_PATHS` in `packages/tools/src/handler.ts`); the other is
[`emit`](./emit.md).

## Invocation

```
atlas link <a> <b> [--retract]
```

- `<a>` `<b>` — required (arity 2). Two **nodeKeys** — the identifiers `atlas query` prints on its `inv`
  lines, _not_ the content addresses [`node`](./node.md) takes.
- `--retract` — the only flag this door accepts. Bare `--retract` or `--retract=true`; anything else is
  refused (see below). To assert, omit it.
- The same environment gates as `emit`: `ATLAS_ACTOR` for authorization, `ATLAS_RATIFY_TOKEN` for
  ratification.

## Worked example

```
$ ATLAS_RATIFY_TOKEN=lead atlas link bb4094b5aa8ca84d6d5d4e2c118c75980bb8a9aba3e84648993cdcd62a324555 f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532
status: ok
next: a rejected link failed a governance gate (two distinct known nodes, authorized on both scopes, ratified) or a pair-state gate (not-linked / already-retracted / retracted-pair) — fix and re-run; `retract:true` withdraws an asserted equivalence through the same gates
invariant: WP-SAMEAS / KNOW-11 / A-D3: sameAs is a governed symmetric edge — authz on BOTH scopes + a non-empty ratifier over the whole merged class (billy when any member is T0) — never a merge; retraction is a MODE of this door (WRITE_PATHS stays {emit,link}) and is an APPEND, never a delete
data:
  linked: bb4094b5aa8ca84d6d5d4e2c118c75980bb8a9aba3e84648993cdcd62a324555 ≡ f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532
# exit 0
```

The edge shows up on the next read, as its own line — both facts are still there:

```
$ atlas query src
[…]
data:
  inv T1 bb4094b5aa8ca84d6d5d4e2c118c75980bb8a9aba3e84648993cdcd62a324555 [FRESH]: add is total over numbers
  inv T1 f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532 [FRESH]: greet returns a non-empty string
  advisoryDropped: 0
  stale: false
  tokenEstimate: 57
  sameAs bb4094b5aa8ca84d6d5d4e2c118c75980bb8a9aba3e84648993cdcd62a324555 ≡ f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532
# exit 0
```

Retracting prints a different verb and a different symbol, so there is no way to misread which act
happened:

```
$ ATLAS_RATIFY_TOKEN=lead atlas link bb4094b5… f9517988… --retract
status: ok
[…]
data:
  retracted: bb4094b5aa8ca84d6d5d4e2c118c75980bb8a9aba3e84648993cdcd62a324555 ≢ f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532
# exit 0
```

After which the `sameAs` line is gone from the pack (the pack above, re-run, printed the two `inv` lines,
`advisoryDropped`, `stale`, `tokenEstimate` and nothing else).

## Exit codes

| code | meaning                                                                     |
| ---- | --------------------------------------------------------------------------- |
| `0`  | the relation changed — asserted or retracted                                |
| `1`  | usage error — too few positionals, an unknown flag, a bad `--retract` value |
| `2`  | a governance or pair-state gate refused the write. Nothing changed          |

## What it refuses, and why

Every block below is a real run; from here on the 64-hex nodeKeys are shortened to `bb4094b5…` /
`f9517988…` for width. You type them in full.

**Unratified** — a `sameAs` link needs a ratifier, and `billy` if either endpoint is `T0`:

```
$ atlas link bb4094b5… f9517988…
status: rejected
[…]
reason: unratified: a sameAs link requires a ratifier, and the billy token when either endpoint is T0 (KNOW-8)
# exit 2
```

**A node linked to itself**:

```
$ ATLAS_RATIFY_TOKEN=lead atlas link bb4094b5… bb4094b5…
status: rejected
[…]
reason: sameAs requires two distinct nodes
# exit 2
```

**Unauthorized — and an unknown nodeKey reports the same string, deliberately.** Because the relation is
transitive, the authorization boundary is the whole equivalence class, not the edge. A nodeKey with no row
carries no scope, so no authority over it can be established; reporting the two cases apart would let any
caller probe which nodeKeys exist. The refusal says so and tells you how to check:

```
$ ATLAS_RATIFY_TOKEN=lead atlas link bb4094b5… 1111111111111111111111111111111111111111111111111111111111111111
status: rejected
[…]
reason: unauthorized: the actor must be in the scope of BOTH endpoints AND of every node in the equivalence
class this link merges — the sameAs relation is transitive, so the boundary is the class, not the edge
(KNOW-11). An endpoint that is not a current node is refused with this SAME string, deliberately: […] If a
nodeKey here may simply be wrong, list the territory with `atlas query <scope>` and check it against that
before concluding a scope is missing.
# exit 2
```

**Any flag it does not recognise.** This is the one command that does _not_ inherit the parser's
"unknown flags fold in and are ignored" behaviour. `packages/cli/src/marshal.ts` records why, measured
through the real parser before the strictness was added: `--retract=1`, `--retract=TRUE`, `--retract=false`
and the typo `--retracted` each produced `retract: false` — i.e. an _assertion_ — so an operator who asked
to withdraw an equivalence got `linked: a ≡ b` on screen. A governed write door does not silently discard an
argument you supplied:

```
$ atlas link bb4094b5… f9517988… --hurry
status: error
next: link: unknown flag '--hurry'. The only flag this door accepts is '--retract' (withdraw a previously asserted equivalence); a governed write door does not ignore an argument you supplied
invariant: CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash
reason: link: unknown flag '--hurry'. […]
# exit 1

$ atlas link bb4094b5… f9517988… --retract=false
status: error
next: link: '--retract' is a bare flag — write '--retract' or '--retract=true'; got '--retract=false'. To assert (not retract), omit the flag entirely
invariant: CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash
reason: link: '--retract' is a bare flag — […]
# exit 1
```

**Pair-state gates.** Retraction is monotone, so the door refuses the two states that would require
un-erasing history. Both exit `2`:

```
$ ATLAS_RATIFY_TOKEN=lead atlas link bb4094b5… f9517988…
status: rejected
reason: retracted-pair: this sameAs equivalence was asserted and then RETRACTED, and a retraction is
monotone — re-asserting it would require deleting the retraction record, which is the evidence that the
withdrawal happened. Both the original assertion and its withdrawal stay on the rows. If the two nodes
really do name the same fact, that is a new claim and needs a new pair of keys, not a silent un-erase.

$ ATLAS_RATIFY_TOKEN=lead atlas link bb4094b5… f9517988… --retract=true
status: rejected
reason: already-retracted: this sameAs equivalence has already been withdrawn; the retraction is recorded
on both endpoints and the read fold already refuses to merge across it. Nothing to do.
```

(The two `reason:` lines are verbatim, re-wrapped for width.)

**A committed durable store** — the same provenance refusal every other command gets; see
[`query`](./query.md).

## Things worth knowing before you rely on it

- **An extra positional is still silently ignored.** `atlas link a b c` reads only the first two. The
  parser enforces a _minimum_ arity, and tightening that touches every command; it is recorded in
  `packages/cli/src/marshal.ts` as a follow-up rather than fixed.
- **Retraction is an append.** The edge is not deleted; the class splits on the next read.

## Related

- [`query`](./query.md) — where the nodeKeys come from and where the `sameAs` line appears.
- [`emit`](./emit.md) — the other governed write door.
