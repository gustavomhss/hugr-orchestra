# WP-fix-sidecar-gen — an ad-hoc defect card, deliberately NOT an S0–S4 corpus WP

> This card does not carry a `source_reqs:`/`acceptance:` pointer set into `req-adp.md` /
> `goldens-adapters.md`, and on purpose: no requirement in the corpus names this behaviour, and authoring one
> would mean editing files this seat does not own while five other seats are live on the same tree. What
> follows is the honest shape available without that edit — a defect record with a verification pointer into
> the test suite instead of into a golden. `id-integrity.mjs`'s `OWNER.WP` still recognizes this file (it
> matches `requirements/work-packages/[a-z0-9.-]+\.md`), so `### WP-fix-sidecar-gen` is a legitimate WP
> definition; it introduces no new `REQ`/`SCN`/`INV` id, so ID-1/ID-3 have nothing new to check here.

### WP-fix-sidecar-gen — the sidecar read path must open the name it enumerated

**Component:** `packages/adapter-io/src/sidecar.ts` (`generations`, `readSidecarSet`)

**Defect (measured, not asserted):** `generations()` matched every on-disk `<base>.<digits>.json` name and
returned the **parsed integer** (`Number(m[1])`). `readSidecarSet` then **re-derived** the path to open from
that integer via `genPath(dir, base, g)` — the writer's canonical, unpadded namer (`` `${base}.${g}.json` ``).
For a non-canonical on-disk name whose digits are not the writer's own rendering of that integer — the
reproducing case is a **zero-padded** name, e.g. `projection.007.json` (`Number("007") === 7`, but
`genPath(dir, 'projection', 7)` renders `"projection.7.json"`, a different string) — the two derivations
disagree. `readFileSync` throws `ENOENT` on the re-derived path, `readOne` degrades to `undefined` (by design:
a torn read must never crash a bin at boot), and with no readable `projection.json` compat mirror to rescue
it, `readSidecarSet` falls all the way to `{ projection: undefined, unreadable: true }` — a store every byte
of which parses cleanly, reported unreadable. Downstream (`sidecar-commit.ts`, not touched by this WP)
`unreadable` becomes a standing write refusal that re-derives identically on every call.

**Precondition, stated because the original finding omitted it:** the compat mirror (`projection.json`)
rescues the common case — `readSidecarSet` falls back to it whenever no generation parses, and a healthy store
always has one. The defect needs BOTH a non-canonical generation filename AND a missing-or-corrupt mirror. The
two conditions are not independent (the mirror-fallback exists precisely because generation files get pruned
or hand-deleted), but "the sidecar bricks" overstates it — severity sits below a standing-brick class, and is
recorded here at that level on purpose.

**Fix:** one derivation, not two. `generations()`'s internal listing now carries the **matched filename**
alongside the parsed number (`listGenerations` → `{ g, name }`); `readSidecarSet` opens `join(dir,
entry.name)` — the exact name the regex just matched — and never recomputes a path from the number. The
class of "listing and opening can disagree" is removed, not one instance of it. `generations()`'s own public
signature (`number[]`) is unchanged, because `sidecar-commit.ts` (a different seat's file, not touched here)
calls it to order/prune ITS OWN canonical writes, where re-deriving `genPath` from the number is safe — the
writer is re-deriving its own naming convention, not an external one.

**Invariants preserved (checked against the file's own header, each with the test that pins it):**

- a corrupt generation still occupies its name, so the next commit aims above it — `read.top` still reports
  the highest matched number even when that generation is unparseable (pinned:
  `sidecar-generation-filename.test.ts` NEGATIVE case, and the pre-existing `sidecar.test.ts` LEG 2 cases,
  unmodified and still green).
- descending order — the highest-numbered matched entry is tried first, padded or not (pinned: the
  "HIGHER-numbered padded generation still wins ordering" case).
- total — an absent directory is still "no generations", never a throw (pinned: the "EMPTY directory" NEGATIVE
  case).
- the mirror's own counter keeps the sequence monotone — untouched; the mirror fallback path is unchanged.

**Verification (new file, not a golden — see the header):**
`packages/adapter-io/test/sidecar-generation-filename.test.ts` — 5 cases at first landing. 2 are the
regression pin (padded name readable, padded name wins ordering); 1 is the canonical-name control (no
regression on the common shape); 2 are the negative direction (genuinely unparseable generation still refuses;
a genuinely empty directory is not corruption). Confirmed RED on the pre-fix code by restoring the prior
`readOne(genPath(dir, base, g))` derivation byte-for-byte (`git show origin/master:…` diffed back in, verified
`diff -q` identical to the fixed file before and after) and watching the 2 padded-name cases fail with the
predicted `ENOENT`-shaped symptom (`unreadable: true` where `false` was expected); confirmed GREEN again after
restoring the fix, `diff -q` against the pre-restore fixed file reporting identical.

**COLD REVIEW FINDING (`cfde63f`) — a narrower defect of the same class, addressed in the same file:**
`listGenerations`'s sort, `(a, b) => b.g - a.g`, is a total order on the parsed number but not on the
`{g, name}` entry — two distinct on-disk names can share one number (`"projection.7.json"` and
`"projection.007.json"` both parse to `7`). On a tie the sort is stable, so which entry lands first — and
therefore which one `readSidecarSet` opens, since it returns the first that parses — was decided by
`readdirSync`'s return order: filesystem-dependent, not a property of the store. The pre-fix code did not have
this (it computed one deterministic path from the integer); the first fix's rewrite introduced it as a side
effect of carrying the name at all. Fixed by a lexicographic tiebreak on `name`, same shape as
`git-history.ts`'s `byPath`, so the array order — and the entry `readSidecarSet` opens — is a pure function of
the bytes on disk again. The tiebreak names no preference between the two filenames; it only fixes an answer
that was previously free to vary.

**Verification of the tiebreak — pins a property, does NOT reproduce a failure, stated plainly per the
reviewer's instruction:** a 6th case, `DETERMINISM: …`, writes `projection.7.json` and `projection.007.json`
with distinguishable content across 20 freshly-created directories, alternating the write order between the
two files, and asserts every one of the 20 reads returns the SAME winner. This case has no red/green proof: the
defect it guards is an _unspecified_ result, and an unspecified result can come out "right" by luck on any
given filesystem/run — confirmed empirically during authoring, where the pre-tiebreak sort passed this exact
case 5/5 times on the authoring machine despite being genuinely order-dependent. A single-directory,
single-read assertion could therefore pass on the buggy code by accident; running it across 20 directories with
the write order alternated is the closest available approximation to forcing the dependency to show, not a
guarantee that it would. The property itself — same input bytes, same answer, independent of `readdirSync`
order — is what is asserted and is what genuinely holds post-fix.

**Exclusions:** does not touch `sidecar-commit.ts` (the write-side retry/prune logic, another seat's file),
`git-history.ts`, `doctor-source.ts`, or any package outside `adapter-io`. Does not change the on-disk
filename convention the writer emits (`genPath` is unchanged and still unpadded) — only the reader's second
derivation is removed. Does not address generation names carrying more than 15 digits or names outside the
`^<base>\.(\d{1,15})\.json$` shape; those were already excluded from `generations()` before this fix and
remain excluded (not a generation name at all, by the pre-existing regex). Does not assert which of two
same-number filenames is "more correct" — the protocol has no such preference; only that the answer is fixed.

**Owner:** ad-hoc dispatch, branch `fix/sidecar-generation`.
