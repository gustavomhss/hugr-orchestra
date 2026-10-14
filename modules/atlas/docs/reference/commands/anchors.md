# `atlas anchors`

List the **groundable units** the built index carries under a tree `path` — the read-only **discovery planner**
(ADR-0004, **AUTHOR-3/4**). Each unit carries its `qualifiedPath`, `kind` (`file` / `dir` / `symbol`) and its
**current `subtreeHash`** (the drift oracle the [`atlas emit`](./emit.md) truth-gate re-derives against), plus
every declared **language hole** and the `rev` the set was computed at. It reads the **same single grounding
seam** the emit truth-gate uses (`createAnchors` over the one `GroundingComputer`), so a unit listed here grounds
against the gate by construction.

It is a **planner**, not a governed door: it **persists nothing** (AUTHOR-2) and carries **no** write authority.

## Invocation

```
atlas anchors <path>
```

- `<path>` — required. The repo-relative tree path (e.g. `src`, `core`, `.` for the repo root) whose groundable
  units to list. A path **outside the tracked set**, a **non-git** directory, or an **unreadable** path is not an
  error — it yields the **honest empty listing WITH a reason** (AUTHOR-3), never a throw.

## Outcome

- **exit 0** — the listing succeeded. The verdict's `status:` is `ok`; the `next:` line reports the counts and the
  `rev`; the `data:` block carries a header line (the `rev` and both counts) followed by one
  `unit <kind> <qualifiedPath> [<subtreeHash>]` line per unit and one `hole <ext> — <fileCount> file(s): <reason>`
  line per declared language hole. An **empty** listing is a **measured** fact and carries a trailing `reason:`
  line naming why nothing was groundable.
- **exit 1** — a malformed invocation (missing path) or an uncomposed runtime — a structured error with guidance,
  never a crash.

The `data:` block for `atlas anchors src` over a repo whose `src` holds two `.ts` files is shaped like this
(the `<subtreeHash>` values are the index's real per-unit hashes, and `<rev>` is the live HEAD — both vary by
repo and revision, so this is illustrative, not a fixed transcript):

```
data:
  anchors: rev <rev> — 5 unit(s), 0 hole(s)
  unit file src/app.ts [<subtreeHash>]
  unit symbol src/app.ts::function_declaration:0:run [<subtreeHash>]
  unit symbol src/app.ts::function_declaration:0:helper [<subtreeHash>]
  unit file src/util.ts [<subtreeHash>]
  unit symbol src/util.ts::function_declaration:0:greet [<subtreeHash>]
```

A **grammar-less** source file (e.g. `.rs`, `.py`) still anchors at **file** level and **declares** a hole
rather than silently degrading (AUTHOR-4) — the `fileCount` is the **real census** of grammar-less files with
that extension under the path, never a constant:

```
data:
  anchors: rev <rev> — 2 unit(s), 1 hole(s)
  unit file core/engine.rs [<subtreeHash>]
  unit file core/mod.rs [<subtreeHash>]
  hole .rs — 2 file(s): Rust — no configured tree-sitter grammar, so no sub-file (symbol) units are anchored
```

An **untracked / non-git / unreadable** path is the honest-empty answer — `units` is empty and a `reason:` line
states why (AUTHOR-3):

```
data:
  anchors: rev <rev> — 0 unit(s), 0 hole(s)
  reason: no groundable units under path — outside the tracked set, a non-git directory, or unreadable (AUTHOR-3)
```

## Authority

`atlas anchors` binds **`atlas-query`** — a READ authority oracle. It opens **no** governed surface
(`GOVERNANCE_SURFACE` stays 5), it is **not** a member of `WRITE_PATHS`, and it writes nothing (AUTHOR-2 /
PROP-AUTH-2). It is the first step of the authoring flow: pick a unit here, then draft a fact against it.
