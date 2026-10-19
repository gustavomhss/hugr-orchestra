# Lanes B-L and B-K · issues and the fixes the briefs assume

Each item: what does not work as written, and the fix the briefs already apply. Nothing here changes a decision's
intent; items 1, 3 and 4 change the task split, the rest pin details DECISIONS.md leaves open.

## 1. Every task must keep all Atlas guards green, so the split changed

The acceptance run (`gh workflow run test.yml`, the `atlas` job) runs typecheck and all thirteen guards BEFORE `npm test`;
one red guard skips the tests. Two guards make the README split impossible as written:

- `command-doc-guard` fails on a command in `COMMANDS` without its `docs/reference/commands/<name>.md` page, README row
  and transport-parity counts, and on a page without a command. So "B-R3-01 commands, then B-R3-02 docs" is red between
  the two tasks.
- `reference-model-guard` fails on a new module whose exported values have no production caller. So `review-log.ts`
  (B-L02) and `open-questions.ts` (B-R11-01) are red until their first reader lands.

Fix, applied in the briefs:

- B-L01 adds two lane command tables keyed by plain strings (`REVIEW_COMMANDS` in `cli/src/review-cli.ts` for B-K,
  `OPS_COMMANDS` in `cli/src/ops-cli.ts` for B-O). A runner registered there has a production caller but is unreachable
  until its name joins `COMMANDS` (`parse` refuses unknown commands). Each R therefore lands as a logic task (runner +
  tests, beam-free) followed by a surface task (map/parse/test pins/docs/README, flash) that publishes the names together.
  This also keeps every new command out of `cli.ts` (at its 625-line waiver).
- The reference-model ledger carries an explicit row for the one task between a module and its first caller, with the
  DECLARED COUNTS adjusted by delta (B-L-API.md §5): B-L02 adds the `review-log.ts` row, B-R2-01b removes it; B-R11-01
  adds the `open-questions.ts` row, B-R11-02a removes it together with the `align.ts` row (D17).

Resulting task files (suffixes per the brief rules): B-R2-01 → B-R2-01a (governed promote selection), B-R2-01b (CLI
positionals, held skip); B-R2-02 → B-R2-02a (hold/release runners), B-R2-02b (publish); B-R11-02 → B-R11-02a (feed +
interview/answer runners), B-R11-02b (publish). B-R3-01 is the logic half and B-R3-02 the publish half, as assigned
(B-R3-02 also carries the map/parse entries, which must ship with the docs). The README task index needs these IDs.

## 2. There is no repository `.gitignore` rule for `.atlas/` to mirror

D14 says to add `!.atlas/review.jsonl` "to the repository `.gitignore` rule that mirrors it". The root `.gitignore` has no
`.atlas` rule: the root `.atlas/` (Orchestra's own store) is not ignored at all, so `review.jsonl` there already travels.
B-L03 edits only `modules/atlas/.gitignore`, adds `merge=union` to both `.gitattributes` files and `linguist-generated=true`
to the root one (where the memory logs carry it).

## 3. D15 names B-R2-01 as the cli.ts room task; the README names B-L01

The briefs follow the README: B-L01 moves the `promote`/`own` intercepts into `cli-dispatch.ts` and adds the lane tables
(cli.ts 624 → 615 lines); B-R2-01b then threads the positionals through `dispatchPromote`.

## 4. Lane order and branch hygiene

`run-task.sh` creates each lane worktree once, from `atlas-ui-study`. B-K and B-O need B-L. Order used by the briefs:

- B-L: B-L01 → B-L02 → B-L03.
- B-K: B-R6-01 → B-R8-01 → B-R8-02 (none needs B-L, so B-K can start at once) → **lead merges B-L into
  `atlas-ui-study`, then `git merge atlas-ui-study` in the B-K worktree** → B-R2-01a → B-R2-01b → B-R2-02a → B-R2-02b →
  B-R3-01 → B-R3-02 → B-R11-01 → B-R11-02a → B-R11-02b.
- R3 before R11 because a T1/T0 interview answer writes a proposal that `decide` (R3) ratifies; R6 before R3 and R11
  because both skip retired facts.

## 5. B-K and B-O edit the same lines in five places

Fixed anchors per lane are in B-L-API.md §4 and §6 (map.ts, parse.ts, the test pins, the README table, the adapter-io
barrel). Three single lines cannot get distinct anchors: the README transport-parity counts + CLI-only list, the README
package line (`cli … N commands`), and the `reference-model-guard.mjs` DECLARED COUNTS line. Proposed rule: merge lane
B-K into `atlas-ui-study` before B-O's first command-publishing task, and have B-O rebase (or merge `atlas-ui-study`)
first; if the lanes must run concurrently, the lead resolves those three lines on merge by re-counting —
`npm run command-doc-guard` and `npm run reference-model-guard` print the measured numbers.

## 6. Pinned details DECISIONS.md leaves open

- **`--by` on every review write.** D16 requires `--by` for `propose`; the briefs require it for `hold`, `release`,
  `propose`, `decide` and `answer`, because every D14 record has a `by` and the CLI may not read `ATLAS_ACTOR` itself
  (`help-cli.test.ts` pins that only `compose.ts` reads env).
- **Line format of `review.jsonl`.** Each line is a kernel `Event` whose payload is the record (the `memory.jsonl` form),
  so `durable-log.ts`'s torn-line and edit detection is reused instead of copied. The record id is the kernel `id()` of
  the record's known fields (D14's "content hash through the kernel hash seam").
- **Authority classification.** `hold`, `release`, `propose`, `proposals`, `interview`, `answer` bind `atlas-query`
  (they write only the review log — the `export` precedent: a file, never the store); `decide` binds `atlas-emit`
  (ratify publishes through the existing door). README kind column: `review` for the first six.
- **Promote.** A named nodeKey with no staged row is reported `not staged` and exits 2. A review log with any line that
  does not verify refuses the promote pass (exit 2): a held row must never be promoted because its hold was unreadable.
  `atlas promote some/path` used to ignore the positional; it now reports `not staged some/path` — documented in promote.md.
- **Ratify.** `decide … ratify` re-emits `{...fact, tier: toTier}` through `deps.handler.handle("atlas-emit", …)`; a
  decision record is written only when the door admits it, so a refused ratification leaves the proposal open. A
  proposal id may be given as a unique prefix of ≥ 8 characters (same for question ids).
- **Interview `--json`.** Prints `{"batch": RankedQuestion[], "deferred": number}` (C01/C04 consume this shape).
- **R8 scope.** `--replace` changes only an advisory same-tier UPDATE (a predicate re-emit already SUPERSEDEs); the
  `atlas-emit` schema gains an optional boolean `replace`, so MCP clients get it too; an odd `--replace=x` is refused.
- **No `compose.ts` edits.** The review commands open the store through adapter-io helpers (`review-store.ts`,
  `open-questions-source.ts`), the `awareness-store.ts` precedent; `ComposedRuntime` changes only by type
  (`promote(at, select?)`).

## 7. Open for Track C (not blocking B)

- **R11 unit grain is Atlas-specific.** D17 ports the mock's `unitOf`: `packages/<x>`, `docs/<x>`, `harness/<x>`; every
  other file is the root unit, which gets no owner/intent question. On Orchestra's own store most files sit under
  `packages/` so this works, but `modules/<x>` (Atlas itself, vendored) falls into the root unit. Track C may want the
  unit list from the index's own units instead.
- **R11 owner vs R4 territory.** The owner question reads the policy owner (`terrainOwner`, what `atlas own` prints). R4
  (lane B-O) writes Orchestra's `TERRITORY-CATALOG.json`, which the engine does not read, so declaring a territory does
  not yet answer an owner question. Track C should pick one source of "owner" for both screens.
- **Ratification drops a `proven` seal.** A ratifying re-emit is an authored write, so gate 0 strips a `seal: proven`
  the CAS fact carried. Not a regression of any R; flagged so the UI does not promise the seal survives.
