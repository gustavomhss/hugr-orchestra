# `atlas query`

Ask what Atlas holds about a scope — a file, folder, module or crate — and get back a bounded pack in **two
separately bounded bands**: `tier≥T1` **governing** invariants, and a separately capped **advisory** band of
`T2` machine proposals no ratifier saw. Every row carries its own freshness verdict, and the pack carries a
`stale` flag of its own. Read-only: it opens no write door.

This page describes the **CLI** command `atlas query`. The MCP tool is `atlas-query`; both route through the
same handler, so the same input yields the same verdict — but see _Transport differences_ below, the two
argument surfaces are not identical.

## Invocation

```
atlas query <scope> [--by scope|dependency|trigger]
```

- `<scope>` — required. A path in the repository (`src`, `src/greet.ts`, a folder, a crate name).
- `--by <mode>` — optional, defaults to `scope`. Accepts `--by dependency` and `--by=dependency` alike
  (`by` is one of the two valued flags in `packages/cli/src/parse.ts`). An unrecognised mode is refused.
- Any other flag is folded into the argument bag and ignored.

## Worked example

After one grounded fact has been emitted against `src/greet.ts`:

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

- `inv <tier> <nodeKey> [<freshness>]: <claim>` — one line per **governing** invariant (`tier≥T1`). The
  identifier is the **nodeKey**, which is what [`link`](./link.md), [`doctor why`](./doctor.md) and
  `doctor reground` take. It is _not_ the address [`node`](./node.md) takes — see that page.
- `advisory <tier> <nodeKey> [<freshness>]: <claim>` — one line per row of the **advisory** band, which is
  exactly `T2` and separately capped ([ADR-0013](../../adr/ADR-0013-the-pack-has-two-bands-governing-and-advisory.md)).
  Its own verb, never interleaved with `inv`: an advisory row is a machine proposal no ratifier saw. This is
  where a promoted [`mine`](./mine.md) candidate surfaces — see [`promote`](./promote.md).
- `[<freshness>]` is that **row's own** `FRESH`/`DRIFTED`/`STALE` verdict, re-derived on the read. It is not
  the pack-level `stale` below and is not computed from it — two questions, two answers (ADR-0002 amended).
  A row from a door that predates the field renders `[?]`, never `[FRESH]`.
- `advisoryDropped: <n>` — how many advisory rows the advisory cap cut. Printed unconditionally, so `0` is a
  measured fact rather than a line you have to notice is missing.
- `stale: true` means _do not trust this pack until it is re-grounded_. Read the next section for exactly
  what it is computed from — it is a watermark, not a live re-derivation.
- `tokenEstimate` is an advisory size figure, not a budget the tool enforces.

## What `stale` actually means

`stale` is `true` when **either** the projection's persist-time watermark differs from live `HEAD`, **or**
some fact backing the pack is stored with `freshness: DRIFTED`
(`packages/adapter-io/src/projection-query-index.ts`). It is deliberately a read-model watermark: `query`
does no git I/O and re-derives no grounding. The authoritative per-fact drift oracle is
[`atlas doctor why`](./doctor.md) and [`atlas reconcile`](./reconcile.md).

Two consequences you should know before you trust a `false`:

- Any write re-stamps the watermark. Measured: re-emitting a fact whose claim text is unchanged deduplicates
  (nothing new is persisted, the old content address comes back), and `stale` still flips `true → false` —
  while `atlas doctor why` on the same nodeKey still reports it drifted, `class=semantic`, with the same
  `anchorWas`/`anchorNow`. See [find and fix drifted knowledge](../../how-to/find-and-fix-drift.md).
- Conversely the watermark never raises a false alarm: when the watermark or live `HEAD` is unknown
  (no git, an old sidecar), it does not flag.

A scope with nothing in it is an honest empty pack, not an error:

```
$ atlas query src
status: ok
next: re-ground stale packs before trusting; an advisory row is a machine proposal no ratifier saw — check its per-row freshness; scope must be a path string
invariant: TOOLS-6: bounded read projection, two bands (governing tier>=T1 + separately capped advisory T2), every row carrying its own freshness
data:
  advisoryDropped: 0
  stale: false
  tokenEstimate: 0
  territory: src
  axisHash: e1b2abbef0b33119ed2f03bad1965d2f89c4af0a33f803b93e0a0fd49a635c36
# exit 0
```

## Exit codes

| code | meaning                                                                                 |
| ---- | --------------------------------------------------------------------------------------- |
| `0`  | the pack was served (possibly empty — check `stale` and the `inv` lines)                |
| `1`  | usage error — missing `<scope>`, an unknown `--by` mode, or a scope no territory covers |
| `2`  | a governance gate refused the read                                                      |

## What it refuses, and why

**An unknown `--by` mode** — refused at the CLI marshaller rather than silently defaulting to `scope`:

```
$ atlas query src --by graph
status: error
next: query --by must be one of scope|dependency|trigger
invariant: CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash
reason: query --by must be one of scope|dependency|trigger
# exit 1
```

**A scope no territory covers** — fails closed with the scope named, rather than returning an empty pack
that would read as "nothing is known here":

```
$ atlas query does/not/exist
status: error
next: re-ground stale packs before trusting; an advisory row is a machine proposal no ratifier saw — check its per-row freshness; scope must be a path string
invariant: TOOLS-6: bounded read projection, two bands (governing tier>=T1 + separately capped advisory T2), every row carrying its own freshness
reason: cover: no covering territory for scope does/not/exist
# exit 1
```

**A durable store that is tracked by git** — the provenance tripwire. Knowledge that arrived by `git add`
never passed the truth, authz or ratification gates, so nothing is served (trimmed; the reason is one long
line and the repair instructions are in it verbatim):

```
$ atlas query src
status: rejected
next: untrusted-store: the durable Atlas store under `.atlas/` is TRACKED BY GIT, so it arrived by COMMIT
rather than through a governed door. […] To repair it, stop tracking the store and keep it out of the index
— `git rm -r --cached .atlas/projection*.json .atlas/staging*.json .atlas/cas` then commit, and add
`.atlas/` (with a `!.atlas/policy.json` exception) to `.gitignore`; `atlas init` writes that rule for you.
[…]
invariant: CLI-3b: a governed refusal exits 2 — the invocation was well-formed and a gate declined it, so
re-running it with different arguments will not help; exit 1 is reserved for a usage/wiring error
reason: untrusted-store: […]
# exit 2
```

## Transport differences

- `by` **is** in the published `atlas-query` schema, with its three modes as a JSON-Schema `enum`. It was
  not: the schema declared only `scope`, and `{"scope":"src","by":"dependency"}` worked anyway because
  nothing enforced `additionalProperties:false`. Both sides of that are now closed — the mode is declared,
  and an undeclared property (`{"scope":"src","bogusKey":1}`, which used to be accepted and routed) is
  refused as `malformed-args`.
- An unknown mode is refused on **both** doors. The CLI marshaller refuses `--by graph` (transcript above);
  over MCP `{"scope":"src","by":"graph"}` is now a `malformed-args` error result, where it previously
  slipped through the schema and was served as `by: scope`.
- Over MCP the pack arrives as JSON (`{"data":{"pack":{…},"subsumes":[],"sameAs":[]}}`); the CLI renders the
  same content as the `data:` block above.

## Related

- [`node`](./node.md) — read one fact whole, by content address.
- [`doctor`](./doctor.md) — why a pack went stale.
- How-to: [get a territory's knowledge](../../how-to/query-the-atlas.md) (tool-surface view),
  [find and fix drifted knowledge](../../how-to/find-and-fix-drift.md).
