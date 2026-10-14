# Versioning — why the Atlas is git-native and nothing dies

## The idea

The Atlas does not keep its knowledge, memory, and per-agent history in a database beside the repo. It
keeps them _inside_ version control — as content-addressed objects, commit trailers, and git notes under
`refs/notes/orchestra` — so that everything an agent knew and did travels with the code at every
commit, PR, branch, fork, and merge. State is a fold over an append-only event **set** (keyed by
content-hash, not position), and nothing is ever deleted: superseded facts, decayed memories, and closed
tasks are archived and stay re-spawnable.

## Why it's this way

A sidecar knowledge store fails the moment the repo moves. Clone it onto another machine and the sidecar
is gone; fork it and the fork starts amnesiac; hand it to a teammate and the provenance evaporates. The
knowledge that mattered most — _why this code is the way it is, what an agent tried, what a WP cost_ — is
exactly the knowledge a separate database strands.

Git already solved distributed, verifiable, portable history. The Atlas rides it instead of reinventing a
worse copy. Because identity is content-addressed and state is a **fold over an append-only log**, the
Atlas is reconstructable anywhere the git objects are — which is everywhere the repo is. That is what
makes an ephemeral agent **re-spawnable**: its brief, model, tokens, tools, gates, verdict, and transcript
SHA are committed, so the same brief re-spawns the same seat and idempotently reproduces the WP, on any
clone, for any user. No non-git state is required, so no non-git state can be lost.

**Nothing dies** follows from the same instinct. Deleting knowledge is how a map rots silently — a fact
that was true is quietly gone, and no one can tell whether it was wrong or merely archived. So the Atlas
never deletes. "Forgetting" is defined narrowly as _leaving the active/injected set_ — the hot, poked,
in-context slice stays lean, but the archived entry is deduped, retained, and retrievable. The append-only
log accretes; the folded knowledge evolves by supersede-with-lineage. History is never destroyed.

## The honest reconciliation — "lives in GitHub" **and** "survives a clone"

There is a real tension worth stating plainly. Two things are both wanted, and they pull apart:

- **Lives inside the git host.** Memory and knowledge should be _attached to the actual objects the user
  works with_ — this commit, this PR — visible in GitHub/GitLab/Gitea, not hidden in a tool's private store.
- **Survives a bare clone.** The Atlas must reconstruct from git alone on another machine, with no API call
  to any host, or the re-spawn guarantee is a lie.

These cannot both be the _source of truth_, because two facts of the host make it plain:

1. `git push` does **not** push `refs/notes/*` by default — notes need an explicit refspec.
2. Host-side PR data (comments, body sections) does **not** arrive with a bare `git clone` — it lives behind
   the forge's API.

The resolution is a deliberate split. **The git-native store is the source of truth** — the tracked
content-addressed objects plus `refs/notes/orchestra`, present in any clone/fork (the adapter configures the
notes refspec so push actually carries them). **The PR surface is a first-class _projection_** — a host
adapter renders the PR-memory, the orchestrator's logbook entry, and the ratified knowledge-delta onto the
real PR, so it genuinely lives inside GitHub and is visible there. But the projection is reconstructable
from the git-native source; it is never the only home of a datum. So the claim "it's on GitHub" is true
without becoming the trap where a re-spawn on a fresh clone finds the knowledge missing.

## Branches, merges, and rebases — the fold is over a set, not a line

"Rewind a PR ⇒ the Atlas rewinds" is only obvious on a _linear_ log. Real repos branch, merge, and rebase —
and a positional `seq` would collide the instant two branches both appended, while a rebase rewrites every
position outright. So the event log is not a line-ordered file; it is an **append-only, commutative set keyed
by each event's content-hash** (`seq` is a local ordering _hint_, never identity — `reference/atlas-kernel.md`
KERNEL-9).

Merging two branches is therefore a **set-union, then a re-fold** — the CRDT move, not a textual 3-way merge.
A registered git merge driver (`.gitattributes: <atlas-log> merge=orchestra-atlas`) unions the two event sets
and re-folds; because the fold is convergent (KERNEL-11), the merged Atlas is byte-identical no matter which
side is "ours". When both branches wrote a fact for the same slot (`nodeKey`), the fold-merge resolves them
deterministically (KERNEL-10): concurrent **advisory** writes converge by **claim-set union** — both seats'
claims land on one node; concurrent **predicate** writes take last-writer-wins under a total
`(seq, contentHash)` order, the superseded node retained with lineage (nothing dies). This is exactly the
concurrent-writer case — two WPs mining a shared dependency both proposing facts for the same territory — and
it converges instead of forking. A **rebase** or cherry-pick is safe for the same reason: identity is
content-hash, so re-parenting commits cannot change the set and cannot change the fold (`reference/atlas-persist.md`
PERSIST-12).

## Trade-offs

- **A host adapter per forge.** Rendering onto PRs means one implementation per host (GitHub/GitLab/Gitea/
  Bitbucket/plain-git). That is real surface area — the cost of the knowledge being where the user works.
- **Notes are easy to leave behind.** The default-off push refspec is a footgun; the adapter must configure
  it or provenance silently stops travelling. Mechanized, not assumed.
- **The merge driver must be registered.** Branch-merge correctness depends on `.gitattributes` wiring the
  `orchestra-atlas` driver; without it git falls back to a line merge and can conflict on `seq`. Like the
  notes refspec, it is mechanized by the adapter, not assumed.
- **Nothing-dies means monotone growth.** Archives only grow. The mitigation is dedup + keeping the hot set
  lean, not deletion — a storage cost accepted deliberately so the map can never rot by omission.
- **The transcript body is an unresolved call.** Committing MB of possibly-secret-bearing transcript into
  git history is irreversible. Whether the raw body lives in-tree or in a CAS sidecar that travels with the
  repo is an **open owner decision** — see `spec/atlas.md` §9. This document does not pre-empt it.

## Where it fits

- The normative rules: `spec/atlas.md` §7, §7.1 and invariants A-11, A-16, A-17, A-18.
- The dry contract — commit notes/trailers, the host adapter, metering, re-spawn, and the open transcript
  calibration: [`reference/atlas-persist.md`](../reference/atlas-persist.md) (invariants `PERSIST-1..9`).
- The retrieval side of "nothing floods the context": [`reference/atlas-retrieval.md`](../reference/atlas-retrieval.md).
