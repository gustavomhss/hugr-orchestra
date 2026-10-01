# How to emit a grounded fact

Put one invariant into the Atlas through the governed write door, and read it back. This is the **CLI**
route (`atlas emit`); the MCP tool is `atlas-emit` and takes the same fact through the same gates.

Read the ceiling first: **there is no shipped command that produces a fact file for you.** Authoring is
campaign 10, which is decomposed and not built. This guide covers the door, the gates and the readback —
the parts that exist — and says plainly where the gap is.

## Prerequisites

- A repository that has been moved in ([how-to](./move-a-repo-in.md)).
- `.atlas/policy.json` declaring your actor under the scope you intend to write. Without it, the default is
  empty scopes and **no write is authorized**.
- A ratifier token for a `tier≥T1` fact (`ATLAS_RATIFY_TOKEN`, any non-empty value; `billy` for `T0`).
- A fact file. See step 1, and the ceiling under it.

## Steps

1. **Author the fact as JSON.** One `GroundedFact`, citing a real structural unit:

   ```json
   {
     "kind": "advisory",
     "id": "f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532",
     "tier": "T1",
     "claimNorm": "greet returns a non-empty string",
     "grounding": {
       "entries": [
         {
           "anchor": {
             "kind": "file",
             "qualifiedPath": "src/greet.ts",
             "subtreeHash": "ff0f2674ae3fde2702932c07aeb61ecb5108e9cd575d5788e3a85c02a2bca99d"
           },
           "path": "src/greet.ts"
         }
       ]
     },
     "freshness": "FRESH",
     "claims": [],
     "authoring": "ADVISORY",
     "scope": "src",
     "predicateSlot": "invariant"
   }
   ```

   **The ceiling.** `subtreeHash` must be the hash the structural index computes for that path, and no
   shipped command prints it. Today you either compute it the way the index does — which is what the
   black-box suite's authoring helper `packages/e2e-blackbox/test/author.ts` exists to do — or you take it
   from a `doctor reground` plan for a fact that already exists. `atlas mine` does not fill this gap; see
   its [reference page](../reference/commands/mine.md).

2. **Emit it, naming the anchor rev.** `--at` is required and takes both `--at <sha>` and `--at=<sha>`.

   ```
   $ ATLAS_RATIFY_TOKEN=lead atlas emit greet-fact.json --at 20ff947f42e7a2052326a59399a94a1864301b47
   status: ok
   next: a rejected write did not re-derive at source@sha — fix the citation and re-emit
   invariant: TOOLS-1/7: atlas-emit is a governed fail-closed write door (WRITE_PATHS: atlas-emit, atlas-link — ADR-0003)
   data:
     id: 20512b7622b0d8864f20311700f4091b991ea5317797ce6158371d06adca0b06
   # exit 0
   ```

   Read `status:`, not `next:` — the guidance line is a constant per tool and still talks about rejection on
   a successful write.

3. **Keep the `data.id`.** That is the fact's **content address**, and it is the only thing
   [`atlas node`](../reference/commands/node.md) accepts. It is _not_ the `id` inside your JSON file — that
   one is the nodeKey, which is what `query` prints and what `link` takes.

4. **Read it back.**

   ```
   $ atlas query src
   status: ok
   next: re-ground stale packs before trusting; an advisory row is a machine proposal no ratifier saw — check its per-row freshness; scope must be a path string
   invariant: TOOLS-6: bounded read projection, two bands (governing tier>=T1 + separately capped advisory T2), every row carrying its own freshness
   data:
     inv T1 f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532 [FRESH]: greet returns a non-empty string
     advisoryDropped: 0
     stale: false
     tokenEstimate: 32
   # exit 0
   ```

   ```
   $ atlas node 20512b7622b0d8864f20311700f4091b991ea5317797ce6158371d06adca0b06
   status: ok
   next: a node is reached as a drill-down within its pack; the same address resolves byte-identically over MCP | poke | CLI
   invariant: TOOLS-10: one read-only oracle, no divergence across transports, no write path
   data:
     node: f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532
     tier: T1
     kind: advisory
     claim: greet returns a non-empty string
   # exit 0
   ```

## Reading a refusal

A refusal exits `2` and names the gate that fired. All three below are real runs of the same fact file,
with one precondition removed each time.

| you see                                                                         | which gate    | what to do                                                                                         |
| ------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| `unauthorized: actor not in fact scope (KNOW-11)`                               | authorization | add your actor to the fact's `scope` in `.atlas/policy.json`, or set `ATLAS_ACTOR` to a listed one |
| `unratified: T0/contested fact requires human+billy ratification (KNOW-8)`      | ratification  | set `ATLAS_RATIFY_TOKEN` (any non-empty value for `T1`; `billy` for `T0`)                          |
| `ungrounded: citation does not re-derive FRESH at source (TOOLS-7b / GROUND-6)` | truth         | your `subtreeHash` is not what the index computes for that path — recompute it                     |

Exit `1` is a different class entirely: a usage error, like a missing `--at` or an unreadable file. `1`
means _your invocation was wrong_; `2` means _your invocation was fine and a gate declined it_, so
re-running it unchanged will not help.

## How to verify you got the right thing

- `atlas query <scope>` lists your claim on an `inv` line with `stale: false`.
- `atlas doctor archive` includes the content address `emit` printed.
- Emitting the **same bytes** again returns the same `data.id` — the write deduplicates rather than
  creating a second node. Emitting a _different_ claim at the same anchor and slot updates the same node:
  measured, the pack line became `greet never returns an empty string; greet always returns a non-empty
string` — one node, a set-union of claims.
- A refused write left nothing behind: the claim is absent from the pack.

## Notes

- **`ATLAS_ACTOR` is self-asserted**, and `.atlas/policy.json` is writable by anyone who can run the CLI.
  This is an anti-accident guardrail, not an adversarial control, and
  `packages/adapter-io/src/policy.ts` says so in its own header. Do not build a security story on it.
- **`emit` is one of the two governed write doors** (`WRITE_PATHS`, ADR-0003). The other is
  [`link`](../reference/commands/link.md). Reads carry no write authority anywhere.

## Related

- Command reference: [`emit`](../reference/commands/emit.md), [`query`](../reference/commands/query.md),
  [`node`](../reference/commands/node.md).
- Next: [find and fix drifted knowledge](./find-and-fix-drift.md).
