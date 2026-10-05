# `atlas emit`

The governed write door for a grounded fact. You hand it a fact as a JSON file and the revision its citation
must re-derive at; it runs the truth gate, the authorization gate and the ratification gate, and either
persists the fact or tells you which gate said no.

This page describes the **CLI** command `atlas emit`. The MCP tool is `atlas-emit`. It is one of the three
governed write paths (`WRITE_PATHS` in `packages/tools/src/handler.ts`); the others are [`link`](./link.md)
and `memory-emit` (`packages/tools/src/handler.ts` — `WRITE_PATHS: ['atlas-emit', 'atlas-link',
'atlas-memory-emit']`).

## Invocation

```
atlas emit <factJsonPath> --at <sha>
```

- `<factJsonPath>` — required. A file holding one `GroundedFact` as JSON.
- `--at <sha>` — **required**. The anchor rev the citation must re-derive at. Both `--at <sha>` and
  `--at=<sha>` work (`at` is a valued flag in `packages/cli/src/parse.ts`); a bare `--at` with no value, or
  `--at=`, is refused as missing.
- Any other flag is folded into the argument bag and ignored.

Two environment variables reach the door (read by `composeRuntime`, never off the fact payload):

- `ATLAS_ACTOR` — the actor the authorization gate checks against `.atlas/policy.json`. Defaults to your
  `git config user.email`.
- `ATLAS_RATIFY_TOKEN` — the ratifier. A `tier≥T1` fact needs a non-empty token; a `T0` fact needs `billy`.

`ATLAS_ACTOR` is self-asserted and the policy file is writable by anyone who can run the CLI. This is an
anti-accident guardrail, not an adversarial control — `packages/adapter-io/src/policy.ts` says so in full.

## Worked example

The fact file (a real one, from the run below):

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

With `.atlas/policy.json` listing the actor under scope `src`, and a ratifier token:

```
$ ATLAS_RATIFY_TOKEN=lead atlas emit greet-fact.json --at 20ff947f42e7a2052326a59399a94a1864301b47
status: ok
next: a rejected write did not re-derive at source@sha — fix the citation and re-emit
invariant: TOOLS-1/7: atlas-emit is a governed fail-closed write door (WRITE_PATHS: atlas-emit, atlas-link — ADR-0003)
data:
  id: 20512b7622b0d8864f20311700f4091b991ea5317797ce6158371d06adca0b06
  nodeKey: f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532
# exit 0
```

The CLI prints **both handles** on a successful emit (`EmitOut` carries both; `packages/cli/src/render.ts`
renders them in this fixed order — `id`, then `nodeKey`).

- `data.id` is the **content address** (CAS hash) of the persisted fact — the address
  [`node`](./node.md) takes, and what resolves to the fact's own `node:` line.
- `data.nodeKey` is the **nodeKey** — the same value as the `id` field inside the fact file, and what
  [`link`](./link.md), [`query`](./query.md) and [`doctor`](./doctor.md) take.

They are different values and neither resolves in the other's place.

Note the `next:` line still reads "a rejected write…" on a successful emit — the guidance is a constant per
tool, not a description of the outcome. Read `status:`, not `next:`.

## Exit codes

| code | meaning                                                               |
| ---- | --------------------------------------------------------------------- |
| `0`  | the fact was admitted and persisted; `data.id` is its content address |
| `1`  | usage error — missing `--at`, unreadable file, malformed JSON         |
| `2`  | a governance gate refused the write. Nothing was persisted            |

## What it refuses, and why

The refusals are the product. Each one names the gate that fired.

**Unauthorized** — no `.atlas/policy.json`, or the actor is not listed under the fact's `scope`. The
conservative default is empty scopes, so **no write is authorized until an admin declares one**:

```
$ atlas emit greet-fact.json --at 20ff947f42e7a2052326a59399a94a1864301b47
status: rejected
next: a rejected write did not re-derive at source@sha — fix the citation and re-emit
invariant: TOOLS-1/7: atlas-emit is a governed fail-closed write door (WRITE_PATHS: atlas-emit, atlas-link — ADR-0003)
reason: unauthorized: actor not in fact scope (KNOW-11)
# exit 2
```

**Unratified** — authorized, but a `tier≥T1` fact routes to full ratification and no `ATLAS_RATIFY_TOKEN`
was present:

```
$ atlas emit greet-fact.json --at 20ff947f42e7a2052326a59399a94a1864301b47
status: rejected
[…]
reason: unratified: T0/contested fact requires human+billy ratification (KNOW-8)
# exit 2
```

**Ungrounded** — the cited `subtreeHash` does not re-derive against the index at emit time. This is the
truth gate, and it is why the fact carries a hash at all (the same file with one digit changed in the
anchor):

```
$ ATLAS_RATIFY_TOKEN=lead atlas emit bad-fact.json --at 22b3ca01865aaa34fff93f050db9c7bd927b4546
status: rejected
[…]
reason: ungrounded: citation does not re-derive FRESH at source (TOOLS-7b / GROUND-6)
# exit 2
```

**A committed durable store** — the same provenance refusal every other command gets; see
[`query`](./query.md).

Usage errors are a different class and exit `1`, not `2`:

```
$ atlas emit greet-fact.json
status: error
next: emit requires --at <sha>: the anchor rev the fact must re-derive at
invariant: CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash
reason: emit requires --at <sha>: the anchor rev the fact must re-derive at
# exit 1

$ atlas emit missing.json --at 20ff947f42e7a2052326a59399a94a1864301b47
status: error
next: emit: cannot read fact file 'missing.json'
invariant: CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash
reason: emit: cannot read fact file 'missing.json'
# exit 1
```

## Getting the `subtreeHash`

`emit` re-derives the citation against the built structural index, so the `subtreeHash` in your fact file
must be the one that index computes for that path. **`atlas anchors <path>` prints it** — the read-only
discovery planner (ADR-0004 / AUTHOR-3, [`anchors`](./anchors.md)) lists every groundable unit under `path`
with its **current** `subtreeHash`, the `rev` the set was computed at, and every declared language hole.
`atlas anchors src` over a two-file repo lists `unit file src/greet.ts [<subtreeHash>]`,
`unit symbol src/greet.ts::function_declaration:0:greet [<subtreeHash>]`, and so on — see `anchors.md` for
the block shape.

[`mine`](./mine.md) still does not fill the gap (it abstains until the repository is SCIP-indexed), but the
anchor hash is no longer unobtainable: the campaign-10 authoring surface this page used to mark "decomposed
but not built" is shipped, and the product-door path to a hash is `atlas anchors <path>` → `atlas draft` →
`atlas emit`.

## Related

- [`query`](./query.md) — read the fact back.
- [`doctor`](./doctor.md) — `reground` proposes the emit payload for a drifted fact.
- [`link`](./link.md) — the other governed write door.
- How-to: [emit a grounded fact](../../how-to/emit-a-grounded-fact.md).
