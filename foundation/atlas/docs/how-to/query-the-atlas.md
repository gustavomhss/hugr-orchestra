# How to get a territory's knowledge

Get the invariants the Atlas holds for the code you are touching — by file, folder, module, or crate —
either by asking (the `atlas-query` tool) or by letting the Atlas push it to you (the poke).

## Prerequisites

- The repo has been moved in (`atlas-init` has run, so territories exist). If not, run it first:
  `atlas-init <repo-root>`.
- `atlas-query` is reachable over your transport — the CLI binary or the MCP tool (they are identical by
  contract; use whichever you have).
- You know a **scope** to ask about: a path to a file, folder, module, or crate.

## Option A — pull it with `atlas-query`

1. **Pick the scope.** Any path works; the tool resolves it up the hierarchy. A file query also surfaces
   its module's and crate's invariants, so start as narrow as you like.
2. **Run the query.**
   - CLI: `atlas-query packages/atlas-kernel/src/cas.ts`
   - MCP: call the `atlas-query` tool with `{ "scope": "packages/atlas-kernel/src/cas.ts" }`
     You may pass a folder (`packages/atlas-kernel/`), a module, or a crate name just as well.
3. **Read the pack.** You get a pack: the territory's `tier≥T1` invariants as 1-line entries, `≤ ~2K`
   tokens, plus a `stale` flag and `next + invariant` guidance.
4. **Check `stale` before you trust it.** If `stale:true`, a grounding behind the pack has drifted — do
   **not** treat it as current. Re-ground first (fix or re-emit the drifted fact), then re-query.
5. **Drill deeper if needed.** While you are in the scope, the covering nodes are exposed as tools; call the
   node-tool to go from scope → node → grounding and inspect the cited structural unit.

## Option B — let the poke push it to you

You often do not need to ask at all — the Atlas offers the pack when you enter the scope.

1. **Start working in the territory.** Open or edit a file under it; the poke keys off the paths in your
   tool calls.
2. **Receive the poke.** Crossing into a new scope fires a poke: a compact notice (`≤ ~150` tokens) plus
   that scope's pack, injected unasked. You did not call anything.
3. **Use it, then move on.** Only the current scope's nodes are exposed as tools; when you leave the scope
   they retract, so the tool list never floods with the whole graph.
4. **Same `stale` rule.** A poked pack obeys the same trust rule as a queried one — `stale:true` means
   re-ground before relying on it.

## How to verify you got the right thing

- The pack's invariants all belong to the scope you named (a crate query rolls up its modules; a file query
  rolls up its module and crate).
- Two identical queries return byte-identical packs — retrieval is deterministic (no embeddings, no RAG).
- Every result carries `next + invariant` guidance; if it is empty, you passed a malformed or unknown scope
  (the tool fails closed to an empty pack, it does not throw) — re-check the path.

## Notes

- **Whole-graph dumps are not a thing.** By design only the current scope is surfaced; if you need another
  territory, query or navigate to it.
- **The orchestrator's kit is `PODIUM`** (ratified 2026-07-16) — the podium the conductor works from.
  (Earlier drafts said "BATON"; that name is superseded.)

## Related

- Tool contract + schemas: [`reference/atlas-tools.md`](../reference/atlas-tools.md).
- Packs, the poke, the injection ceiling and caps: [`reference/atlas-retrieval.md`](../reference/atlas-retrieval.md).
- Why retrieval is deterministic and git-native: [`explanation/versioning.md`](../explanation/versioning.md).
