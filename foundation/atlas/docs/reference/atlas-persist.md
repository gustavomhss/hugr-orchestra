# atlas-persist — Reference

> owner: charlie (FORGE) · grounding: claims checked against `spec/atlas.md` §7, §7.1, A-8, A-11, A-16, A-17, A-18 and the Maestro provenance model (`maestro/packages/core/src/provenance.ts`) · status: draft

## Purpose

The persistence layer makes the Atlas **git-native**: knowledge, memory, and per-agent provenance are a
living part of the repo's version control, not a sidecar database. They travel with every
commit/PR/branch/fork/merge by construction. State is a fold over an append-only event log; the source of
truth is the tracked git-native store; the git host's PR surface is a _projection_ rendered by a host
adapter. Nothing is ever deleted — superseded/decayed/closed entries are archived and re-spawnable.

## Data model

```
Trailer   = { WP, Model, Gates, Verdict, TranscriptSha }   // RFC-822-ish Key: value block on the commit (CANONICAL — travels in the commit object)
Note      = JSON dossier under refs/notes/orchestra         // MUTABLE OVERLAY — does not fetch/push by default; rebase/squash orphans it (PERSIST-13)
TranscriptRef = { sha, store:'lfs'|'partial-clone'|'cas' } // POINTER in git; body is a content-addressed large object, full+lossless, fetch-on-demand (PERSIST-10)
Checkpoint = { seatBrief, llmOutputs[], toolIO[] }          // re-invoke substrate = redispatch + replay; DISTINCT from the raw transcript (PERSIST-10b)
Metering  = { model, tokensIn, tokensOut, tokensCache, toolUses,
              wallTime, retries, reworks, gates, verdict, transcriptSha }
PrAttach  = { prId, prMemory, logbookEntry, knowledgeDelta } // rendered onto the host PR via adapter
HostAdapter = {
  attachToCommit(sha, payload), readCommit(sha),
  attachToPR(prId, payload),    readPR(prId),
}                                                            // one impl per forge (GitHub/GitLab/Gitea/…)
MergeDriver = { name:'orchestra-atlas', merge(ours, theirs, base): EventLog }
              // .gitattributes:  <atlas-log-path>  merge=orchestra-atlas  → set-union + re-fold
```

- The **attachment is the hashed index (pointers)**; the content lives in the CAS (`hash → object`). The
  git objects carry references, not inlined blobs.
- **On commits:** git notes (`refs/notes/orchestra`) + commit trailers carry per-commit provenance/metering
  and the knowledge-delta — pure git, portable.
- **On PRs:** the PR-memory, the orchestrator's logbook entry for that PR, and the ratified knowledge-delta
  are attached to the actual PR (body section / structured comment / metadata) via the host API.

## Invariants

- **PERSIST-1 Git-native source of truth.** The portable source MUST be the tracked store + commit
  **trailers** (with git notes as a mutable overlay, PERSIST-13). Trailer-carried data is present in any
  clone/fork by construction; note-carried data is present only once the refspec is configured (PERSIST-8).
  The PR attachment is a projection reconstructable from that source — never the sole home of any datum (§7.1).
- **PERSIST-2 State is a fold.** Atlas state MUST be reconstructable by folding the append-only event **set**
  from empty (A-11); the fold MUST be convergent (order-independent — KERNEL-11), so it does not depend on a
  linear commit history or a mutable in-place snapshot.
- **PERSIST-3 Provenance in git.** Every WP's provenance MUST be committed as a commit **trailer** block +
  a **git note** under `refs/notes/orchestra`, carrying `WP / Model / Gates / Verdict / Transcript-SHA`, so
  it moves with the commit automatically across clone/fork/machine (A-17).
- **PERSIST-4 Index-as-attachment.** What is attached to a commit/PR MUST be the hashed index (pointers);
  the content MUST live in the CAS. A git object MUST NOT be the canonical container of large content bodies.
- **PERSIST-5 Nothing dies — archive, not delete.** No memory or knowledge is ever deleted. Superseded /
  decayed / closed entries MUST be archived (deduped, merge-on-rerun-never-loses-data), retained, and
  re-spawnable. "Forgetting" means leaving the active/injected set only (A-16).
- **PERSIST-6 Per-agent metering, committed.** Every ephemeral agent's WP MUST record `model`, tokens
  (input/output/cache), tool-uses, wall-time, **retries/reworks**, gates, verdict, and `transcriptSha` in the
  event log + dossier (A-17).
- **PERSIST-7 Re-invokable anywhere.** Because the whole record is versioned git state, any ephemeral agent
  MUST be re-invokable — **idempotent redispatch** (same brief → same seat) **+ faithful replay** of the
  recorded transcript — on another machine / user / clone / fork, with no non-git state required. It is NOT
  a deterministic resume from where it stopped (PERSIST-10b, A-18).
- **PERSIST-8 Host adapter, forge-agnostic.** A host adapter MUST abstract the forge behind
  `attachToCommit` / `attachToPR` (+ reads), one implementation per host. It MUST configure the push refspec
  for `refs/notes/*` (git does not push notes by default) and MUST treat host-side PR data as a projection
  (a bare `git clone` does not fetch it).
- **PERSIST-9 Portable export.** The full store MUST still export to open JSON that replays 1:1 into a fresh
  store (A-8) — no lock-in layered on top of git.
- **PERSIST-11 Branch-merge = event-set union + re-fold.** Merging two branches MUST NOT line-merge the log.
  A registered git **merge driver** (`.gitattributes: <atlas-log> merge=orchestra-atlas`) MUST **union the two
  event sets by content-hash and re-fold** (KERNEL-9/11). Colliding positional `seq` MUST NOT surface as a
  conflict; a `nodeKey` written on both branches MUST resolve by the deterministic fold-merge (KERNEL-10),
  never by hand. The merged Atlas MUST be byte-identical regardless of merge direction (ours/theirs).
  The driver lives in `.git/config` and does **not** clone, so it MUST be **self-installing** — a setup
  hook (on init/clone) MUST register `merge=orchestra-atlas` + the `.gitattributes` entry. The log path
  MUST also **degrade safely**: its on-disk form MUST be an **append-only union** that a plain default
  3-way text merge cannot corrupt, so an un-configured clone whose merge silently bypasses the driver can
  never lose or corrupt an event (worst case = harmless duplicate lines the next re-fold dedupes by hash).
- **PERSIST-12 Rebase / cherry-pick safe.** Because event identity is content-hash, a rebase or cherry-pick
  that reorders or re-parents commits MUST leave `AtlasState` byte-identical — the fold is over the set, not
  the commit sequence. "Rewind a PR ⇒ Atlas rewinds" MUST therefore hold on **non-linear** history
  (branch/merge/rebase), not only a linear log.
- **PERSIST-13 Trailers canonical, notes are a mutable overlay.** `refs/notes/*` do **not** fetch or push
  by default, and rebase/squash/cherry-pick **orphan** them (a note keys on the commit SHA). Therefore any
  datum that MUST be present in any clone MUST live in a **commit trailer** — it travels inside the commit
  object itself and survives history rewrites onto the new SHA. Git notes are the **mutable overlay** (data
  that must change after commit) and are **perimeter-conditional**: present only once the adapter configures
  the fetch/push refspec (PERSIST-8), and not carried across a rewrite. This corrects the "present in any
  clone" wording of PERSIST-1/PERSIST-8 for **note-carried** data: only trailer-carried data is present by
  construction.
- **PERSIST-14 Version-delta = read-only fold-diff.** `diff(shaA,shaB)` MUST partition the facts into
  {**added**, **edited**, **superseded**, **decayed**}, each entry carrying its **provenance**. It MUST be
  computed by comparing the two folded AtlasStates (grounds on the KERNEL-5 / PERSIST-2 fold + the PERSIST-5
  archive/supersede/decay lifecycle) — a **PURE READ** (0 mutation), **byte-identical across runs**, and
  **well-defined regardless of fold/event order** (PERSIST-2/12). It MUST be a read-only fold-diff computed
  over the event log, **not** a stored/materialized diff (ADR-P14).

## Surface / API

```
attachToCommit(sha, dossier)         // trailer block + refs/notes/orchestra note (host adapter)
readCommit(sha): Dossier | null      // read back the note/trailer; absence ⇒ null, never throw
attachToPR(prId, prAttach)           // render PR-memory/logbook/knowledge-delta onto the host PR
readPR(prId): PrAttach | null        // read back the projection
meter(wp): Metering                  // the per-agent accounting record for a WP
redispatch(record): Seat             // idempotent redispatch from versioned git state (same brief → same seat) — NOT deterministic resume (PERSIST-10b)
replay(checkpoint): TranscriptView   // faithful replay of recorded LLM/tool I/O for audit (PERSIST-10b)
fetchTranscript(ref): Transcript     // resolve the content-addressed large object by hash, on demand (PERSIST-10)
mergeAtlas(ours, theirs, base): EventLog   // git merge driver: set-union the logs, re-fold (PERSIST-11)
```

- `mergeAtlas` MUST be the driver git invokes for `merge=orchestra-atlas` paths; it MUST NOT perform a
  line-wise 3-way merge — it unions event sets by id and re-folds (KERNEL-9/10/11).
- `readCommit` / `readPR` MUST be total: a missing note/attachment returns `null`, never an exception
  (mirrors the Maestro `readDossierNote` contract).

## Transcript body — decided: content-addressed large-object store (owner, 2026-07-16)

- **PERSIST-10 Full transcript as a content-addressed large object.** The transcript body MUST be retained
  **in full — the raw, unadulterated total context of the agent — never truncated or lossily compressed**
  (owner law). It is the transparency artifact: the complete, auditable record of what the agent saw and
  did. It MUST be stored as a **content-addressed large object** — full, lossless, versioned,
  **fetch-on-demand** — via **git-LFS / partial-clone (`blob:none`) semantics or an equivalent CAS
  large-object store**, with only a **pointer (its content hash)** in git (`Transcript-SHA` trailer,
  `TranscriptRef`). The body stays complete and **travels (fetchable everywhere)**, so transparency and
  re-invoke are preserved; a routine clone no longer drags every MB. This **REVISES** the earlier
  in-working-tree placement: full-in-tree creates unbounded `.git` bloat curable only by history-rewrite,
  which breaks the content-addressing that re-spawn depends on — a real dilemma. A content-addressed large
  object delivers the owner's actual requirement (full + transparent + re-spawnable) **losslessly** and
  dissolves the dilemma. **Stated honestly:** this trades "present in every default clone by construction"
  for "content-addressed + fetch-on-demand" — the accepted resolution. Any future size mitigation MUST stay
  **lossless and reversible**, never lossy.
- **PERSIST-10a Cred defense-in-depth — redact-at-source primary, scanner is a backstop (billy's domain).**
  Because the object is **immutable and content-addressed** (a captured secret would be permanent and hash-
  referenced), no raw credential may enter it. A single pre-commit scanner is insufficient for free-form
  agent prose. The **primary control MUST be redact-at-source**: the framework MUST NOT let a raw credential
  enter the transcript buffer in the first place. The scanner is a **backstop**, not the sole gate — it MUST
  also run **server-side as a pre-receive hook** (a client-side gate is bypassable) and MUST use **≥2
  detection engines** (pattern + entropy + a verification pass). The scrub redacts secrets but MUST NOT
  otherwise abridge the record. This is billy's security domain; redact-at-source-primary is the load-bearing
  rule.
  **SCOPE OF WHAT IS SHIPPED (narrower than the rule above, deliberately stated):** redact-at-source is a
  SHAPE-based control over an explicitly DECLARED list of credential families, not a general credential
  control. **Four** families are declared today — **GitHub tokens** (`ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_` + ≥6
  token characters), **Slack tokens** (`xoxb-`/`xoxa-`/`xoxp-`/`xoxr-`/`xoxs-` + ≥6 body characters),
  **GitHub fine-grained PATs** (`github_pat_` + ≥22 body characters, `_` included) and **AWS access key ids**
  (`AKIA` + exactly 16 uppercase/digit characters). **A secret of any other shape is NOT redacted and passes
  into the transcript buffer unchanged** — including **JWTs**, **PEM private keys** and the **AWS SECRET
  access key**, each of which was measured to break either chunk-independence or the no-over-abridgement rule
  under the current shape descriptor (the specific defect per family is recorded in
  `packages/persist/src/scrub-shapes.ts`): a JWT is multi-segment across a separator that is not a body
  character, PEM needs a terminator field plus a bound, and the AWS secret key has no distinctive prefix and
  would need a context field. Closing that gap is a matter of declaring more families, and for those three it
  requires extending the descriptor first. The scanner backstop is what covers everything not declared here —
  which is why it is a backstop and not optional.
  **Declared over-redactions (two, same class):** a family whose token is MULTI-SEGMENT must admit its
  separator as a body character, or the trailing entropy-bearing segment ships in the clear. Slack is
  `xoxb-<id>-<id>-<secret>`, so `-` is a Slack body character; a fine-grained PAT is
  `github_pat_<22>_<59>`, so `_` is a PAT body character. The cost is that separator-joined NON-secret text
  written immediately after such a token is absorbed into the redaction, up to the first non-body byte. This
  is the same class as the pre-existing absorption of trailing token characters (`ghp_XXXXXXfoo`), and it is
  accepted: for a credential control, over-redacting bounded adjacent text is preferred to shipping half a
  secret. **One consequence of the union lookahead, stated:** because a body stops at the start of ANY
  declared family prefix, a token whose body happens to spell another family's prefix is cut there —
  `ghp_AAAA` + `AKIA…` redacts the AWS key and leaves the eight-character fragment `ghp_AAAA` — four BODY
  characters, below the GitHub floor of six, therefore not a credential by this control's own definition —
  in the clear. That is pre-existing behaviour, and declaring more families widens it.
- **PERSIST-10b Re-invoke = redispatch + replay, NOT deterministic resume.** A hosted model is
  nondeterministic (even at temperature 0) and external side effects do not rewind, so "resume the agent
  from exactly where it stopped" is **NOT deliverable** and MUST NOT be claimed. Two things MUST be
  delivered instead: **(a) idempotent redispatch of the seat** (same brief → same seat, A-18) and **(b)
  faithful replay of the recorded transcript** (re-feed the recorded LLM/tool I/O for audit). The re-invoke
  substrate is a **structured `Checkpoint`** (recorded LLM outputs + tool I/O + seat brief), **distinct**
  from the full raw transcript (the transparency artifact). Replay ≠ resume.

## Acceptance

1. **PERSIST-1** — Clone the repo on another machine (no sidecar) ⇒ the git-native store + notes fully
   reconstruct Atlas state; the PR surface is regenerable from it.
2. **PERSIST-2** — Replaying the event log rebuilds a byte-identical Atlas (A-11).
3. **PERSIST-3** — After a WP seals, its `model`/gates/verdict/transcriptSha are readable from the commit
   trailer + `refs/notes/orchestra` note.
4. **PERSIST-4** — Inspect an attachment: it holds CAS pointers; the content resolves from the CAS by hash.
5. **PERSIST-5** — Supersede a fact / decay a memory / close a task ⇒ each is present in the archive and
   re-spawnable; grep confirms no code path deletes a knowledge/memory entry.
6. **PERSIST-6** — The metering record for a WP carries every field incl. retries/reworks and cache tokens.
7. **PERSIST-7** — On a clean clone, an ephemeral agent re-spawns from the versioned record and idempotently
   reproduces its WP.
8. **PERSIST-8** — With the adapter configured, `git push` carries `refs/notes/orchestra`; a bare clone plus
   `readPR` reconstructs the PR projection.
9. **PERSIST-9** — `export → import` yields a byte-identical store (A-8).
10. **PERSIST-10 / 10a / 10b** — The transcript resolves from its content-addressed large-object store by
    hash, **full and lossless** (no code path truncates or lossily abridges it), and is **fetch-on-demand**
    (a routine clone does not drag it, yet it is fetchable everywhere). A secret in the raw context never
    reaches the stored object — redact-at-source drops it and the ≥2-engine scanner (client + server-side
    pre-receive) backstops — yet the record is otherwise complete. Re-invoking a seat performs **idempotent
    redispatch + faithful replay of the recorded `Checkpoint`**; no path claims deterministic resume.
11. **PERSIST-11** — Two branches each emit Atlas events (incl. one shared `nodeKey`); `git merge` runs the
    driver ⇒ the merged log is the **union** and folds to the KERNEL-10 node (advisory claim-union /
    predicate LWW+lineage); no line-level conflict, no lost event, direction-independent. On a fresh clone
    the setup hook self-installs the driver; with the driver **absent**, a plain merge of the log path falls
    back to the append-only union and loses no event (worst case = duplicate lines the next re-fold dedupes).
12. **PERSIST-12** — Rebasing or cherry-picking those commits yields the identical merged `AtlasState`;
    reordering commits does not change the fold.
13. **PERSIST-13** — A datum required in any clone is readable as a commit **trailer** after a bare clone
    with no note refspec configured; a rebase that rewrites the commits orphans the `refs/notes/orchestra`
    note but the trailer survives on the new commit.
