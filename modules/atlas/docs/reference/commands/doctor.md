# `atlas doctor`

Diagnose the knowledge base: browse the archive, explain why a fact broke, check the hot set against a
budget, get a proposed repair, audit the CAS bytes — and find out whether this repository is SCIP-indexed at
all. Read-only and advisory — the five knowledge legs are built over a port with no write method, `index`
reads the file tree and runs nothing, so `doctor` **cannot** persist anything, including its own repair plans.

This page describes the **CLI** command `atlas doctor`. There **is** an `atlas-doctor` MCP tool, carrying
every leg except `index` — see _Transport differences_.

## Invocation

```
atlas doctor archive  [scope]
atlas doctor why      <nodeKey>
atlas doctor hotset   <budget>
atlas doctor reground <nodeKey>
atlas doctor cas
atlas doctor index
```

- Six subcommands (`DOCTOR_SUBCOMMANDS` in `packages/cli/src/doctor.ts`). Anything else is refused.
- `archive`'s `[scope]` is optional and filters on the fact's declared `scope` field, not on a path.
- `why` and `reground` take a **nodeKey** — the identifier `atlas query` prints on its `inv` lines.
- `hotset` takes a number.
- `cas` takes nothing — its subject is the whole store. Narrowing it to one hash would let a caller ask
  only about the object they already trust.
- `index` takes nothing — it reports on the repository you are standing in.
- No flags on any subcommand.

The first five read the durable store through the frozen `DoctorApi` — **five** read legs since ADR-0022
added `casIntegrity`. `index` is not one of them: it reads the git-tracked file tree and the SCIP dump, and
needs no store, which is why it works on a repository that has never had a fact emitted into it.

`cas` is the only leg that reads the store's **bytes** rather than its facts. A content-addressed object's
filename is the hash of its content, so corruption is decidable locally with no index and no network:

| bucket                                                                                                   | meaning                                                                                 |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `objects` / `referenced`                                                                                 | value files on disk / distinct hashes the projection points at                          |
| `corrupt`                                                                                                | the bytes do **not** hash to the address they are filed under                           |
| `unreadable`                                                                                             | the bytes do not parse as a CAS object at all (a torn write, not a tampered one)        |
| `missing`                                                                                                | a referenced hash with no value file — a dangling pointer into the store                |
| `orphan`                                                                                                 | a value file nothing references. **Counted, never a fault**: the CAS is append-only and |
| content-keyed, so a superseded object outliving its sidecar is ordinary. `orphan` does not feed `sound`. |

`sound` is `corrupt ∪ unreadable ∪ missing` being empty. Exit code stays **0** either way — `doctor` is
advisory on every leg; `verify-store` is the command whose exit code is a governance signal.

Two stated limits. **Staging is not in the referenced set**: `loadStaging` was deliberately removed (task
#83, "there is exactly one staging door"), so an object referenced only by staging counts as `orphan`. It
can never make `sound` false. And **the audit is over addresses, not semantics**: an object whose bytes hash
correctly but whose content is wrong is `ok` here and always will be — that is `verify-store`'s question.

## Worked examples

```
$ atlas doctor archive
status: ok
doctor: archive
archive: [20512b7622b0d8864f20311700f4091b991ea5317797ce6158371d06adca0b06, 87ab346d3bd8dacdb87e9594ee8cc9f2649fc25706421d80619e8bf278e02153]
next: doctor is read-only — run any proposed RegroundPlan through atlas-emit to persist it
invariant: TOOLS-12: read/advisory-only diagnosis, persists nothing, carries no write authority
# exit 0
```

Those are **content addresses**, which is what [`atlas node`](./node.md) takes. `archive` is the only
shipped command that hands you one for a fact you did not just emit.

After `src/greet.ts` was edited under a fact grounded at it:

```
$ atlas doctor why f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532
status: ok
doctor: why
whyBroken: fact=f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532 class=semantic anchorWas=ff0f2674ae3fde2702932c07aeb61ecb5108e9cd575d5788e3a85c02a2bca99d anchorNow=9e8d370d77f682bee731b20b6ae1dc35c48c8a16cf96f58df2d1929c032bef6f
next: doctor is read-only — run any proposed RegroundPlan through atlas-emit to persist it
invariant: TOOLS-12: read/advisory-only diagnosis, persists nothing, carries no write authority
# exit 0
```

`class=semantic` means the claim's anchor content is gone from the tree entirely — the fact rotted.
`class=mechanical` would mean the same content moved and the fact can be re-grounded.

```
$ atlas doctor reground f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532
status: ok
doctor: reground
plan: action=retire fact=f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532 — PROPOSAL only; persists nothing. Run through atlas-emit to persist.
next: doctor is read-only — run any proposed RegroundPlan through atlas-emit to persist it
invariant: TOOLS-12: read/advisory-only diagnosis, persists nothing, carries no write authority
# exit 0
```

`action` is `reground` for mechanical drift and `retire` for semantic drift. Either way nothing has changed
on disk; the plan becomes real only through [`emit`](./emit.md).

```
$ atlas doctor hotset 2000
status: ok
doctor: hotset
hotSet: size=1 budget=2000 over=false
next: doctor is read-only — run any proposed RegroundPlan through atlas-emit to persist it
invariant: TOOLS-12: read/advisory-only diagnosis, persists nothing, carries no write authority
# exit 0
```

A fact that is fine reports so rather than erroring — `whyBroken: none`, `plan: none`.

## `doctor index` — why `mine` found nothing

`axes.edges` is derived from SCIP occurrences and from nothing else, and the structural frontier ranks by
dependency-graph degree. So a repository with no `.atlas/index.scip` has zero edges, zero seeds and zero
sites, and [`mine`](./mine.md) reports `0 sites visited` no matter what model you wire. Atlas consumes that
index; it does not produce one. `doctor index` is where it tells you so, and hands you the command.

Run against **this repository** (Atlas itself), after the index had been built:

```
$ atlas doctor index
status: ok
doctor: index
scip: present at .atlas/index.scip — 470 indexed document(s)
lang: ts — 485 tracked file(s) — indexer scip-typescript, pinned 0.4.0
  verify: scip-typescript --version    # must print 0.4.0
  run:    scip-typescript index --output .atlas/index.scip
next: Atlas does NOT run indexers — run the command(s) above yourself from the repository root, then re-run atlas mine
invariant: TOOLS-12: read/advisory-only diagnosis, persists nothing, carries no write authority
# exit 0
```

Before that index existed, the same repository reported `scip: ABSENT` and `atlas mine .` visited **0**
sites. After running exactly the `run:` line above, it visited **200**. That is the whole point of the leg.

The languages are **derived**, never asked for — from `git ls-files`, so an ignored or untracked file counts
in neither the plan nor the index. A four-language repository with nothing indexed yet:

```
$ atlas doctor index
status: ok
doctor: index
scip: ABSENT at .atlas/index.scip — axes.edges is derived from SCIP occurrences and nothing else, so this repository has 0 edges, 0 structural seeds and `atlas mine` visits 0 sites
lang: py — 1 tracked file(s) — indexer scip-python, pinned 0.6.6
  verify: scip-python --version    # must print 0.6.6
  run:    scip-python index --output .atlas/index.scip
lang: ts — 1 tracked file(s) — indexer scip-typescript, pinned 0.4.0
  verify: scip-typescript --version    # must print 0.4.0
  run:    scip-typescript index --output .atlas/index.scip
lang: go — 1 tracked file(s) — honest-hole: NO indexer is configured for this language. Its files are in the FileTree; it contributes NO edges, and nothing you install changes that
lang: rb — 1 tracked file(s) — honest-hole: NO indexer is configured for this language. Its files are in the FileTree; it contributes NO edges, and nothing you install changes that
note: Atlas reads exactly ONE dump (.atlas/index.scip), so the second command above OVERWRITES the first — no shipped path merges per-language dumps (mergeScip has no production caller)
next: Atlas does NOT run indexers — run the command(s) above yourself from the repository root, then re-run atlas mine
invariant: TOOLS-12: read/advisory-only diagnosis, persists nothing, carries no write authority
# exit 0
```

Read that output as four separate statements:

- **`honest-hole` is a diagnosis, not an error.** Atlas has an indexer for TypeScript/JavaScript and Python
  and for nothing else. Go and Ruby files are in the `FileTree` — they are grounded, they can carry facts —
  and they contribute **no edges**, so nothing in them will ever be a structural seed. Nothing you install
  changes that; only a new entry in `REAL_INDEXER` would. It is printed by name precisely so that "Atlas has
  no indexer for this language" cannot be mistaken for "Atlas found nothing here".
- **The pin is half the requirement.** REQ-INDEX-3a asks for "a separate installed, **version-pinned** binary
  per language". The `pinned` field is the release the plan was written against and measured with; the
  `verify:` line is how you check the one you have. Install them yourself —
  `npm i -g @sourcegraph/scip-typescript@0.4.0` and `npm i -g @sourcegraph/scip-python@0.6.6` are the
  releases these pins name. A mismatch is not refused anywhere; the output is your only warning.
- **The `note:` is a real limitation.** There is one dump, so in a repository with two indexed languages the
  second command overwrites the first. `mergeScip` exists in the adapter and no shipped path calls it.
- **`--output` is relative to the working directory** in both binaries, so run them from the repository root
  or the dump lands where nothing reads it.
- **Build declarations FIRST (`tsc -b`) before `scip-typescript index`.** In a monorepo, `scip-typescript`
  resolves a cross-package reference to a `dist/*.d.ts` descriptor only when the target package's built
  declarations exist; index a repo whose `dist/` is absent and every cross-package ref collapses to an opaque
  `local` symbol the index cannot resolve. This does not affect SOUNDNESS — the negation door abstains over an
  opaque local (0-false-admit either way, #178) — but it CRATERS recall: negation recall measured **32.5% on a
  dist-form index vs 4.25% on a dist-absent rebuild** (2026-08-17). Cross-package dependency/count edges likewise
  vanish. So the recipe is `tsc -b` (or `npm run build`) then `scip-typescript index --output .atlas/index.scip`.

### Atlas does not run the indexer, on purpose

The leg prints a command and stops. Two reasons, both load-bearing:

**Security.** Shelling out to an external binary over your repository is the same class as the model-command
path, where Atlas's rule is that it names no vendor command of its own and runs only what the operator
explicitly configured. Printing the line keeps what executes on your machine your decision.

**Honesty.** The claim is `$0`-LLM, deterministic, operator-owns-the-environment. A visible SCIP dependency
is truer than one hidden behind an automatic invocation that fails opaquely the moment the binary is absent.

This is observable, not just asserted: run `doctor index` on an unindexed repository on a machine where
`scip-typescript` is installed, and `.atlas` is byte-identical afterwards and still has no dump
(`packages/e2e-blackbox/test/s26-doctor-index.blackbox.test.ts`, story 3).

`index` also reports a dump it cannot read, rather than folding it into "absent" — the readers degrade a
corrupt dump to a files-only index silently, and a diagnosis is the one place that must not:

```
scip: UNREADABLE at .atlas/index.scip — illegal tag: field no 12 wire type 7; the readers degrade to a files-only index (0 edges)
```

## Exit codes

| code | meaning                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------- |
| `0`  | the diagnostic ran (including `none` results)                                                                        |
| `1`  | usage error — no subcommand, an unknown subcommand, a missing or non-numeric argument, or no wired diagnostic source |
| `2`  | a governance gate refused the invocation (the committed-store tripwire)                                              |

## What it refuses, and why

**An unknown subcommand** — the surface is the five legs (`DOCTOR_SUBCOMMANDS`) and it names them:

```
$ atlas doctor bogus
status: error
next: unknown doctor subcommand 'bogus': expected one of archive|why|hotset|reground|cas|index
invariant: TOOLS-12: read/advisory-only diagnosis, persists nothing, carries no write authority
reason: unknown doctor subcommand 'bogus': expected one of archive|why|hotset|reground|cas|index
# exit 1
```

**No subcommand at all** — caught one layer earlier, by the parser's arity rule:

```
$ atlas doctor
status: error
next: command 'doctor' requires 1 positional argument(s), got 0
invariant: CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash
reason: command 'doctor' requires 1 positional argument(s), got 0
# exit 1
```

**A missing or non-numeric argument** — `doctor why requires a <fact>`, `doctor hotset requires a numeric
<budget>`; both exit `1`.

**A committed durable store.** This one matters: without it, `atlas doctor hotset` would report
`size=0 … over=false` — "your knowledge base is empty and healthy" — about a store the read doors had just
refused to serve. Reporting health for state you have declined to read is worse than reporting nothing, so
the refusal is raised at the entrypoint and exits `2`. See [`query`](./query.md) for the full text. Note that
it is raised before dispatch, so it takes `doctor index` down with the rest even though that leg reads no
store at all — `init` is the only exemption. Stated because it is a real edge, not a claim that it is ideal.

**Writing anything.** Not a runtime check — a structural one. The four knowledge legs never touch the wired
handler and their source port exposes no mutation; `index` holds neither, and spawns no process either. There
is no write path to refuse.

### Audit the CAS bytes

Appended AFTER every other example on this page ON PURPOSE: `doc-transcript-guard`'s unverifiable ledger is
keyed by a block's ORDINAL within its file, so inserting a block anywhere earlier silently re-assigns the
stated reasons of every block after it. Placing a new example last is the only position that cannot do that.

```
$ atlas doctor cas
status: ok
doctor: cas
casIntegrity: objects=0 referenced=0 corrupt=0 unreadable=0 missing=0 orphan=0 sound=true
next: doctor is read-only — run any proposed RegroundPlan through atlas-emit to persist it
invariant: TOOLS-12: read/advisory-only diagnosis, persists nothing, carries no write authority
```

A repository with no governed write yet: nothing stored, nothing referenced, and `sound=true` **because
the two are consistent**, not because the audit skipped. `objects=0` beside `referenced=0` is what makes
that zero readable; `objects=0` beside a non-zero `referenced` would be seventeen dangling pointers and a
loud `sound=false`, which is exactly what this repository's own store reported on the first run of this leg.

## Transport differences

`atlas-doctor` **is** advertised over MCP. It is a `READ_SURFACE` member (ADR-0006), exposed by
`advertisedAuthoringTools` (`packages/mcp-server/src/server-read-tools.ts`) and routed through the same
shared verdict body the CLI drives, so the two transports cannot drift in what a leg answers.

Verified against the real stdio server (`tools/list`, 2026-08-31): **18** tools —
`atlas-init`, `atlas-query`, `atlas-emit`, `atlas-reconcile`, `atlas-link`, `atlas-memory-emit`,
`atlas-relations`, `atlas-negations`, `atlas-anchors`, `atlas-slots`, `atlas-draft`, `atlas-check`,
**`atlas-doctor`**, `atlas-node`, `atlas-memory-recall`, `atlas-memory-header`, `atlas-memory-awareness`,
`atlas-memory-orientation`.

**One leg is CLI-only: `index`.** The MCP tool's `sub` enum is `archive | why | hotset | reground | cas`.
`index` is excluded on purpose — it reads the file tree and the SCIP dump rather than the durable store, so
it answers about the machine the server runs on, not about the store a client is asking after.

**This section was wrong for two campaigns**, and it is worth saying how rather than quietly editing it. It
claimed `doctor` was CLI-only because "`READ_SURFACE` has no export site yet" and that closing the gap "is
campaign 10, which is not built". Campaign 10 shipped, exported `READ_SURFACE`, and put `atlas-doctor` on
MCP; campaign 11 added five more tools. The paragraph even carried a `tools/list` transcript as evidence —
a real measurement, taken once, that then went stale while reading as freshly verified. A dated transcript
is evidence of what was true on its date, and nothing else.

## Related

- [`node`](./node.md) — read a fact whole, using an address `doctor archive` printed.
- [`mine`](./mine.md) — the command whose `0 sites visited` sends you to `doctor index`.
- [`reconcile`](./reconcile.md) — the merge-gate view of the same drift.
- How-to: [find and fix drifted knowledge](../../how-to/find-and-fix-drift.md).
