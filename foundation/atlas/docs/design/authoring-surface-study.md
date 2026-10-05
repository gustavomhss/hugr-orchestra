# Study — the Atlas AUTHORING surface

> **Status:** study / proposal. Nothing here is ratified. It ends in a door set + a list of owner decisions.
> **Trigger:** the 2026-07-25 dogfood on `corelink-runners` — no fact could be authored through any
> user-facing door. See `atlas-dogfood-findings`.
> **Method:** `/functional-surface` (L0–L3 nesting + the six completeness lenses + the closure predicates).
> **Ground truth:** read off `master` @ `3496d6f`. Every claim below cites the file it was read from.

---

## 1. The question

Atlas's engine is validated: governance, fail-closed gates, grounding, drift, watermark, sameAs — all
CI-green, all black-box proven. But the dogfood asked a different question and got a different answer:

> _Can a human — or an agent over MCP — put a fact INTO Atlas?_

**No.** Every fact Atlas has ever held was authored by `packages/e2e-blackbox/test/author.ts`, a test
helper that imports `@atlas/index` / `@atlas/adapter-io` / `@atlas/knowledge` to compute the grounding.
Its own header calls itself _"the stand-in for the authoring tool a real user would reach for."_ There is
no such tool.

This study enumerates the complete authoring surface — **both transports, CLI and MCP** — that closes
that gap, and does so **without amending the write governance**.

---

## 2. Ground truth — the surface that exists today

### 2.1 CLI (`packages/cli/src/parse.ts:27-38`)

| command                                           | arity | writes?    | authoring role                      |
| ------------------------------------------------- | ----- | ---------- | ----------------------------------- |
| `init <path>`                                     | 1     | no         | structural move-in                  |
| `query <scope> [--by scope\|dependency\|trigger]` | 1     | no         | read a bounded pack                 |
| `emit <fact.json> --at <sha>`                     | 1     | **YES**    | the governed write door             |
| `reconcile <mergeBase> [--accept-reground]`       | 1     | via emit   | drift gate                          |
| `doctor <archive\|why\|hotset\|reground>`         | 1     | no         | read/advisory                       |
| `mine <repo>`                                     | 1     | candidates | model-gated; abstains with no model |
| `node <addr>`                                     | 1     | no         | per-node read                       |
| `link <a> <b>`                                    | 2     | **YES**    | governed sameAs                     |

There is **no `help` command and no `--help` flag** — `parse.ts` has no help path at all. A first-time
user has no in-product way to learn the surface.

### 2.2 MCP (`packages/mcp-server/src/server.ts:advertisedTools`)

The advertised tool list is **exactly `GOVERNANCE_SURFACE`** — the five governance tools
(`atlas-init`, `atlas-query`, `atlas-emit`, `atlas-reconcile`, `atlas-link`).

**⇒ `doctor`, `node`, `mine` and `diff` are CLI-ONLY.** An agent over MCP cannot reach any of them. This
already contradicts the TOOLS-3 "one contract, two transports" framing (which is stated for the
_governance_ legs only, so it is not a broken invariant — but it _is_ a real transport asymmetry, and it
is the direct obstacle to the owner's requirement that every new door exist on both transports).

### 2.3 What `atlas emit` actually demands

`marshalEmit` (`packages/cli/src/marshal.ts:72`) reads a JSON file into `node: GroundedFact`. The shape
(`packages/knowledge/src/types.ts:81-93`) requires the author to hand-produce:

| field                                                                    | hand-authorable?   | why not                                                                                                                                                |
| ------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kind`, `tier`, `claimNorm`, `freshness`, `claims`, `authoring`, `scope` | ✅                 | plain values                                                                                                                                           |
| `predicateSlot`                                                          | ⚠️                 | a **closed 13-member vocabulary** (`types.ts:166-178`) discoverable only by reading source                                                             |
| `grounding.entries[].anchor.qualifiedPath`                               | ❌                 | must match a **real index node key**; for a symbol it is the folded `file::<start>:<kind>:<name>` unit path (`adapter-io/src/ast.ts`)                  |
| `grounding.entries[].anchor.subtreeHash`                                 | ❌                 | the **drift oracle** — the hash the emit gate re-derives. Only obtainable by running `build(foldAstUnits(walkFileTree(repo)), …)`                      |
| `id`                                                                     | ❌ **and ignored** | must be `nodeKey(candidate)`; but `governed-emit.ts:118` **mints its own and never trusts the payload** (WP-F3). A required field that is dead weight. |

Plus two undocumented environment channels: `ATLAS_ACTOR` (authz, `governed-emit.ts:87`) and
`ATLAS_RATIFY_TOKEN` (KNOW-8 ratification, `:105`). Unset actor ⇒ **every write denied**.

**This is the wall.** Two of the fields are computable only by running Atlas's own indexer, and there is
no door that runs it for you.

---

## 3. L0 — the Actor × Goal census

Actors, including the non-human and event-triggered ones (lens 1):

| #   | actor                                                                 | human? |
| --- | --------------------------------------------------------------------- | ------ |
| A1  | Author (developer / tech lead)                                        | yes    |
| A2  | Agent author (LLM seat over MCP)                                      | no     |
| A3  | Ratifier (lead; `billy` for T0 — `knowledge/src/ratify/ratify.ts:47`) | yes    |
| A4  | Admin / owner (policy, scopes, territories)                           | yes    |
| A5  | Miner model (`atlas mine` proposer)                                   | no     |
| A6  | CI merge gate (`atlas reconcile <mergeBase>`)                         | no     |
| A7  | HEAD-moved trigger (watermark → `stale`)                              | event  |
| A8  | Consumer (reads packs)                                                | either |

Authoring goals × the door that serves them today:

| #   | goal (sea-level)                                                  | actors | door today                                                                                                 | gap                                                                  |
| --- | ----------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| G1  | Discover WHERE I can anchor a fact                                | A1 A2  | —                                                                                                          | ❌                                                                   |
| G2  | Obtain the grounding for a chosen anchor                          | A1 A2  | —                                                                                                          | ❌                                                                   |
| G3  | Learn the slot vocabulary + what each slot means                  | A1 A2  | —                                                                                                          | ❌                                                                   |
| G4  | Draft a complete, valid fact payload                              | A1 A2  | test helper only                                                                                           | ❌                                                                   |
| G5  | Dry-run a draft before writing (which gate would reject, and why) | A1 A2  | —                                                                                                          | ❌                                                                   |
| G6  | Persist the fact                                                  | A1 A2  | `emit`                                                                                                     | ✅                                                                   |
| G7  | Reword / correct an existing fact (UPDATE at same nodeKey)        | A1 A2  | `emit` (if you can re-draft)                                                                               | ⚠️ blocked by G4                                                     |
| G8  | Retire / supersede a fact                                         | A1 A3  | — (`authoring:'SUPERSEDED'` exists as a _shape_; `doctor reground` produces it only for **drifted** facts) | ❌                                                                   |
| G9  | Equate two facts                                                  | A1     | `link`                                                                                                     | ⚠️ needs nodeKeys — see F4                                           |
| G10 | Re-ground a drifted fact                                          | A1 A6  | `doctor reground` → `emit`                                                                                 | ✅                                                                   |
| G11 | Ratify a fact that routed to full-ratify                          | A3     | env token only                                                                                             | ⚠️ no queue — see F3                                                 |
| G12 | Understand why a write was rejected                               | A1 A2  | raw `TypeError` on malformed shape                                                                         | ❌                                                                   |
| G13 | Author a PREDICATE (with a `check`)                               | A1     | —                                                                                                          | ❌                                                                   |
| G14 | Retract a wrong `sameAs`                                          | A1 A3  | `link --retract`                                                                                           | ✅ **BUILT** (task #83) — a MODE of the existing door, not a new one |
| G15 | Batch-author / import many facts                                  | A1 A2  | loop over `emit`                                                                                           | ⚠️                                                                   |
| G16 | See the current policy / my writable scopes                       | A1 A4  | —                                                                                                          | ❌                                                                   |

**Closure check — no empty row, no empty column:** A5 (miner) and A7 (HEAD trigger) own no _authoring_
goal in this census; they are producers of candidates and drift respectively, and roll up to G4 and G10.
A8 (consumer) is out of scope by construction — recorded so the row is not silently empty.

---

## 4. L1 — the authoring journey (the backbone)

```
  move in        find a place        say it            check it        record it       keep it true
  ─────────      ─────────────       ────────          ─────────       ──────────      ────────────
  init      →    G1 anchors     →    G3 slots    →     G5 check   →    G6 emit    →    G10 reground
                 G2 grounding        G4 draft          (dry-run)       G11 ratify      G7 reword
                                     G13 predicate                                     G8 retire
                                                                                       G9/G14 link/unlink
```

Every ❌ in §3 sits in the **middle three columns** — the span between "I have a repo" and "I have a
persisted fact". The two ends (`init`, and everything from `emit` rightward) are built. The middle is
absent. That is the whole finding, stated as a journey.

Re-walked per persona (lens 3): the **agent (A2)** journey is strictly worse than the human's — every
missing door is missing on MCP _and_ the built read doors (`doctor`, `node`) are missing there too, so
an agent cannot even inspect what it wrote.

---

## 5. L2 — the core use case, with per-step extensions

**UC-1 — Author a grounded advisory fact** (sea-level; actor A1/A2)

Main success scenario:

1. Author picks a code location worth recording a fact about.
2. Author asks Atlas which groundable units exist there. → **G1**
3. Atlas returns the unit's `qualifiedPath`, kind, and current `subtreeHash`. → **G2**
4. Author picks a slot from the closed vocabulary. → **G3**
5. Author writes the claim; Atlas assembles the complete fact payload. → **G4**
6. Author dry-runs it and sees which gates pass. → **G5**
7. Author emits it at `--at <sha>`; the write is governed and persisted. → **G6**
8. Author reads it back to confirm. → `query` / `node`

Extensions (per-step negative space — lens 4; this is where completeness is earned):

| step | condition                                    | required behavior                                                                                                                                                                            |
| ---- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2a   | path is not tracked by git                   | honest empty + say so (`walkFileTree` derives from `git ls-files`)                                                                                                                           |
| 2b   | path is in a **non-TypeScript** language     | return **file-level units only, and say so** — `ast.ts` loads only the TS/TSX grammars, so a Rust/Python repo has no `::` symbol anchors. Silent file-level fallback is the dishonest option |
| 2c   | repo is not a git repo                       | fail closed to empty, not a throw (`fs.ts:38` already does this)                                                                                                                             |
| 3a   | the anchor is a directory                    | permitted (a spatial node); flag that its hash moves whenever any child moves                                                                                                                |
| 4a   | slot not in the closed 13                    | reject with the full list, not a type error                                                                                                                                                  |
| 5a   | claim is empty                               | reject                                                                                                                                                                                       |
| 5b   | a fact already exists at this (anchor, slot) | say so — this will be an **UPDATE**, not a CREATE (same `nodeKey`)                                                                                                                           |
| 5c   | tier is T0                                   | warn: this will route to full-ratify and needs the `billy` token                                                                                                                             |
| 6a   | actor unset / outside scope                  | name the authz gate + the scope required, not "malformed args"                                                                                                                               |
| 6b   | grounding will not re-derive                 | name the anchor whose hash moved                                                                                                                                                             |
| 6c   | routes to full-ratify with no token          | name the token channel                                                                                                                                                                       |
| 7a   | HEAD moved between draft and emit            | the draft's `subtreeHash` is stale ⇒ rejected. **Draft must stamp the rev it was computed at** so the failure is legible                                                                     |
| 8a   | author uses the id `emit` returned           | it will not resolve — see **F4**                                                                                                                                                             |

---

## 6. The six lenses — findings

Lenses 1 (actor), 2 (actor×goal) and 3 (journey) produced §3–§4. Lens 4 (extensions) produced §5.
Lenses 5 and 6 produced the following, which none of the others caught:

### Lens 5 — reactive / policy (system-initiated behavior)

**F1 — there is no notification path from "fact needs a human" to a human.** Events without consumers:

| event                            | producer               | consumer today                          |
| -------------------------------- | ---------------------- | --------------------------------------- |
| a write routes to `full-ratify`  | `governed-emit.ts:105` | **none** — it is simply rejected        |
| HEAD moves ⇒ packs go `stale`    | N11 watermark          | none (surfaced only if someone queries) |
| `reconcile` finds semantic drift | `exitCode 2`           | CI blocks; no per-author routing        |

**F2 — `sameAs` had no retraction. RESOLVED (task #83, owner-authorized).** As surveyed, `governed-link.ts`
only created edges and there was no `unlink` in the tree. `deriveSameAs` is a **union-find**, so one wrong
link merged an entire equivalence class on every read, permanently.

Retraction now ships as a **MODE of the existing `atlas-link` door** — `link --retract` / `retract:true` —
so the finding is closed **without** the third write door it looked like it needed. The measurement that
made that cheap: `deriveSameAs` is **rebuild-per-read** (a fresh `parent` map per call; the only persisted
state is the per-node edge list), so filtering a withdrawn edge out of the fold input splits the class on
the next read. Union-find's missing DELETE was never on the critical path. Retraction is an APPEND
(`sameAsRetracted`), and it runs the same gate ladder an assertion does.

**F3 — `stage()` is not a staging area — and the survey under-stated it.** `knowledge/src/ratify/ratify.ts`
returns `{ node }`, a pure in-memory wrapper; `governed-emit.ts` calls `ratify(stage(view), token)` and, on
failure, **returns rejected and persists nothing**. So authoring a T0 / predicate / contested fact is
_all-or-nothing_: you either already hold the ratifier token or your work is discarded. There is **no
propose-for-review flow**.

**Sharpened by measurement (task #83, probe with stack attribution over the whole suite incl. the real CLI
subprocesses) — the finding is not the one this survey wrote down:**

- `stage()` is not the explorer's write path _at all_. Its only production callers are the two governed write
  doors (`governed-emit.ts`, `governed-link.ts`) — the LEAD's doors. `atlas mine` never calls it.
- Durable staging **is built and is driven**: `atlas mine` writes candidates to its own sidecar through
  `DiskStore.commitStaging` (80 probe hits, all from `cli/src/mine.ts`). The medium is not missing.
- What was missing is the **promotion path**. Nothing read staging back — `loadStaging` had ZERO production
  callers (deleted in task #83) and there was no `promote` command. A staged candidate had no route into
  governed knowledge, ratified or otherwise.

So KNOW-8's measurable ("0 explorer writes reach the store except via a ratifier") **held, and held
vacuously**: 0 explorer writes reached the store by any route, and the separation was enforced by
**severance, not ratification** — `cli/src/mine.ts` put it exactly: _"mining cannot mutate governed knowledge
because it cannot REACH it, not because a check says no."_

**BUILT (WP-PROMOTE).** `atlas promote` is the route: it reads the staging sidecar through the store's own
read-only decision, rehydrates each candidate's whole fact from CAS, and presents it to the EXISTING
`atlas-emit` door — no new surface (ADR-0008: a curator door is an ordinary use of that door). The door
derives `origin:'promoted'`, which removes the KNOW-18 fast path: a mined candidate is T2 ∧ advisory ∧
grounded, so without it the write would have auto-accepted and the ratifier would have been bypassed on the
one path built to run through it. The measurable is therefore no longer vacuous. Severance still describes
what protects the EXPLORER (`atlas mine` names no projection door); ratification describes the CURATOR.

### Lens 6 — resource / CRUD

| entity             | Create                                                              | Read                 | Update                         | Delete                         | List                                |
| ------------------ | ------------------------------------------------------------------- | -------------------- | ------------------------------ | ------------------------------ | ----------------------------------- |
| Fact               | `emit` ✅ · `promote` (staged candidate → knowledge, WP-PROMOTE) ✅ | `node` / `query` ✅  | `emit` @ same nodeKey ✅       | supersede — **no door** ❌     | `query` (bounded: tier≥T1, ≤~2K) ⚠️ |
| sameAs edge        | `link` ✅                                                           | query envelope ✅    | n/a                            | `link --retract` ✅ (task #83) | envelope ✅                         |
| Territory / policy | `init` ✅                                                           | **no door** ❌ (G16) | hand-edit `.atlas/policy.*` ⚠️ | n/a                            | `init` output ⚠️                    |
| Projection         | derived                                                             | ✅                   | —                              | —                              | —                                   |

**F4 — the identity vocabulary breaks the authoring loop.** `emit` returns
`id = contentHash` (`governed-emit.ts:141`, the CAS address), but `atlas node <addr>` and
`atlas link <a> <b>` both consume a **`NodeKey`** (`tools/src/types.ts:261`, `marshal.ts:59`), and the
pack surfaces `nodeId = node.nodeKey` (`pack-shape.ts:14`). **The receipt you get back is not the handle
the other doors take.** After emitting, you must go query to find the thing you just wrote.

**F5 — `init` renders 2 of its 3 fields.** `InitOut` carries `territories`, `blastRadius`,
`t0Candidates` (`types.ts:70-74`); `render.ts:99-104` returns after `territories`. Confirmed present over
MCP, dropped on CLI.

---

## 7. The proposed authoring surface

### 7.1 The architectural key — authoring ≠ writing

The instinct is "add write doors." That would re-open the constitution. It is also unnecessary.

**Every missing door is a read-only PLANNER.** It computes a payload and persists nothing. The precedent
is already in the product and already ratified: `atlas doctor reground` returns a `RegroundPlan` carrying
an `emit: GroundedFact` and is explicitly _"a PROPOSAL only; persists nothing. Run through atlas-emit to
persist."_ (`cli/src/doctor.ts:47`, `tools/src/types.ts:178-182`).

⇒ **`GOVERNANCE_SURFACE` stays five. `WRITE_PATHS` stays `['atlas-emit','atlas-link']`. INV-TOOLS-1 is
untouched.** The spec-conformance gate's CODE-SURFACE PIN keeps passing unchanged.

### 7.2 The door set

| #       | door        | CLI                                                                                                         | MCP tool                                             | writes  | closes          |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------- | --------------- |
| **D-A** | **anchors** | `atlas anchors <path> [--kind file\|symbol\|dir]`                                                           | `atlas-anchors`                                      | no      | G1 G2           |
| **D-B** | **slots**   | `atlas slots`                                                                                               | `atlas-slots`                                        | no      | G3              |
| **D-C** | **draft**   | `atlas draft --anchor <qp> --slot <s> --claim "…" [--tier][--scope][--check <expr>][--supersede <nodeKey>]` | `atlas-draft`                                        | no      | G4 G7 G8 G13    |
| **D-D** | **check**   | `atlas check <fact.json> --at <sha>`                                                                        | `atlas-check`                                        | no      | G5 G12          |
| **D-E** | **help**    | `atlas help [<cmd>]`, `--help`                                                                              | (MCP: descriptions already published via `schema()`) | no      | discoverability |
| —       | emit        | ✅ exists                                                                                                   | ✅ exists                                            | **YES** | G6              |
| —       | link        | ✅ exists                                                                                                   | ✅ exists                                            | **YES** | G9              |

**D-A `anchors`** — the load-bearing one. Walks the same built `Axes` the emit gate re-derives against and
lists `{qualifiedPath, kind, subtreeHash}` under a path. Without it nobody can name a citation. Must
report honestly when a language has no symbol grammar (extension 2b).

**D-C `draft`** — takes an anchor + slot + claim, computes `subtreeHash`, mints `id` via the real
`nodeKey` formula, fills `freshness`/`authoring`/`kind`, stamps **the rev it was computed at**, and prints
a complete `GroundedFact` JSON. It also _reports the route_: "T2 advisory ⇒ auto-accept" or "T0 ⇒
full-ratify, needs ATLAS_RATIFY_TOKEN=billy". `--supersede <nodeKey>` emits the same fact tagged
`authoring:'SUPERSEDED'` — which is why retire needs **no new write door**.

**D-D `check`** — runs truth → authz → ratify **in dry-run** and names the first gate that would refuse
and the exact remedy. This is what replaces `Cannot read properties of undefined (reading 'length')`.

### 7.3 The one invariant this design must carry

> **INV-AUTHOR-1 (proposed): there is exactly ONE grounding computer.** `atlas anchors` / `atlas draft`
> MUST derive the anchor set through the _same_ composition seam the emit truth-gate re-derives against —
> `build(foldAstUnits(walkFileTree(repo)), scip)` — never a second implementation.

If draft and the gate ever compute differently, every draft is rejected, and Atlas would ship the exact
class of drift it exists to prevent. `author.ts` already learned this the hard way: it needs a top-level
`await initAst()` purely so its fold matches the runtime's (`author.ts:24-31`). That warmup requirement is
a seam smell and belongs inside the shared computer, not in each caller.

### 7.4 Non-door fixes (same wave)

1. `emit` returns `nodeKey` alongside `id` — closes **F4**.
2. `render.ts` renders `blastRadius` + `t0Candidates` — closes **F5**.
3. `emit` validates payload shape structurally before touching the gates (structured reason, never a raw
   `TypeError`) — even with D-D present, the door itself must be legible.
4. Document `ATLAS_ACTOR` / `ATLAS_RATIFY_TOKEN` in `help` and in the reference.
5. Drop or default the required-but-ignored `id` field on the authoring path.

---

## 8. Owner decisions — this study cannot resolve these

| #      | decision                                                                                                                                                                                              | why it is the owner's                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **May the MCP server advertise a second, non-governance `READ_SURFACE`** (`atlas-anchors`, `atlas-slots`, `atlas-draft`, `atlas-check`, and — separately — the already-built `doctor`/`node`/`diff`)? | The owner's requirement is "via MCP tool _and_ via CLI". `server.ts` advertises exactly `GOVERNANCE_SURFACE`. Publishing more does **not** change `WRITE_PATHS` or the governance count, but it _does_ falsify the documented claim "the MCP surface is exactly the five governance tools" ⇒ **spec change + ADR**, in the same class as ADR-0003.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **D2** | **`sameAs` retraction (F2).**                                                                                                                                                                         | **DECIDED + BUILT (task #83).** None of the three options as framed: retraction is a **MODE of the existing `atlas-link` door**, so there is no third write door and no constitution amendment to trade — `GOVERNANCE_SURFACE` stays 5, `WRITE_PATHS` stays `{emit, link}`, INV-TOOLS-15's store-row medium is untouched. Permanence is **not** accepted for merges; it IS accepted for retraction (the marker latches), because un-retracting means deleting the evidence, and permanence in the _splitting_ direction costs one bounded equivalence while permanence in the _merging_ direction is the unbounded contagion this finding is about.                                                                                                                                                                                                                                                                  |
| **D3** | **Propose-for-review queue (F3).**                                                                                                                                                                    | **BUILT (WP-PROMOTE).** The dichotomy was false — neither "the code is wrong" nor "the prose is wrong" described it. Durable staging WAS built and driven (`commitStaging`, from `atlas mine`); `stage()` was never the explorer's path; what did not exist was the **promotion** path out of staging, so KNOW-8's measurable held **vacuously** (severance, not ratification). The governed promotion door now exists: `atlas promote`, a CLI-only curator command that reads staging and runs every candidate through the existing `atlas-emit` gate ladder under a ratify context in which the KNOW-18 fast path does not apply. `GOVERNANCE_SURFACE` stays 5; `WRITE_PATHS` stays `{emit, link}`. What remains OWNER-gated is not the door but the GRANT: `atlas:mined` is unowned until an admin appoints a curator in `.atlas/policy.json`, and until then every promotion refuses `unauthorized` — correctly. |
| **D4** | **Scope of v1.** D-A + D-C + D-D is the minimum that makes authoring possible. D-B and D-E are cheap. Do the CRUD/List gaps (G15 batch, G16 policy-show) ship now or later?                           | Scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

---

## 9. Closure predicates (the gate — reported honestly)

| predicate                                               | verdict                                                                                                                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actor×Goal matrix has no empty row / column             | ⚠️ **PASS with a stated exception** — A5/A7/A8 own no authoring goal; recorded in §3, not hidden                                                                        |
| Every sea-level use case has per-step Extensions        | ⚠️ **PARTIAL** — done exhaustively for UC-1 (§5). UC-2 (author a predicate), UC-3 (retire), UC-4 (ratify) are enumerated as goals but **not yet expanded step-by-step** |
| Every kite decomposes; every fish rolls up              | ✅ PASS — G1–G16 all sea-level or rolled up                                                                                                                             |
| Every backbone activity re-walked per persona           | ✅ PASS — human + agent (§4); the agent walk is strictly worse and produced D1                                                                                          |
| Every domain event has a producer **and** a consumer    | ❌ **FAIL** — F1: three events have no consumer. This is a _product_ finding, not a study defect                                                                        |
| Every entity has CRUD accounted for                     | ✅ PASS — §6 lens 6; two ❌ cells are findings F2/G8, both named                                                                                                        |
| A full lens sweep surfaced nothing new (loop-until-dry) | ❌ **NOT REACHED** — one sweep run. Lens 4 on UC-2/3/4 is the known-outstanding pass                                                                                    |

**Honest bottom line:** the catalog is complete enough to _decide the door set_ and to slice D-A/D-C/D-D,
and it is **not** complete enough to freeze a requirement set. Closing the two ❌ predicates (expand
extensions for UC-2/3/4; resolve F1) is the remaining work before this feeds S1.

---

## 10. Proposed slicing — **SUPERSEDED**

> This section was the pre-method estimate. The full pipeline has since run: the design rubric
> ([`authoring.md`](./authoring.md)), the normative reference
> ([`reference/atlas-authoring.md`](../reference/atlas-authoring.md)), two ADRs, and S0→S4
> (18 INVs → 73 REQs → 18 method-tags → 73 goldens → 7 properties → 6 epics → **16 WPs**).
> **The authoritative slice is [`wp-campaign-10.md`](../requirements/work-packages/wp-campaign-10.md).**
> The estimate below is kept for the record, not for execution — it named 8 WPs where the mechanical
> (epic × module) slice produced 16.
>
> Also resolved since: **D1** (§8) — the owner directed that every door exist on both transports, which
> ADR-0005 records. **D2** (task #83) and **D3** (WP-PROMOTE) are now BUILT, and are carried as `A-D3`/`A-D4` in
> [`reference/atlas-authoring.md`](../reference/atlas-authoring.md) §Decisions.

### The original estimate (historical)

| WP          | scope                                                                                                                    | depends on    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ | ------------- |
| WP-AUTH-0   | the shared grounding computer + INV-AUTHOR-1 (one seam, warmup folded in)                                                | —             |
| WP-AUTH-A   | `atlas anchors` — CLI leg + render, honest per-language reporting                                                        | AUTH-0        |
| WP-AUTH-C   | `atlas draft` — CLI leg, rev-stamped, route-reporting, `--supersede`                                                     | AUTH-0        |
| WP-AUTH-D   | `atlas check` — dry-run of all gates + structured remedies                                                               | AUTH-0        |
| WP-AUTH-B/E | `atlas slots` + `atlas help`                                                                                             | —             |
| WP-AUTH-MCP | the `READ_SURFACE` advertisement + all four legs on MCP + CLI≡MCP parity goldens                                         | **D1**, A/C/D |
| WP-AUTH-FIX | the five §7.4 non-door fixes                                                                                             | —             |
| WP-AUTH-E2E | black-box story: a user authors + emits a fact using ONLY product doors, on both transports — and `author.ts` is deleted | all           |

**WP-AUTH-E2E is the real acceptance test of this whole study:** a user authors + emits a fact using ONLY
product doors, on both transports. [AMENDED 2026-08-25, owner-decided — see ADR-0004 §Consequences] The
acceptance is that product-door PROOF, not the physical deletion of `author.ts`: measurement showed the file
also carries a legitimate, irreplaceable ADVERSARIAL-fixture role (facts the product must refuse, which no
door can produce by design). Its authoring-stand-in role is retired; the file is kept for the adversarial
role; re-pointing the happy-path consumers is hygiene follow-up.
