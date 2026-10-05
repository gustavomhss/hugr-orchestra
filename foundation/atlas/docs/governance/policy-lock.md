# Governance policy lock

`.atlas/policy.json` externalizes Atlas's governance tunables (near-dup τ, the T0-candidate keyword set,
and the KNOW-11 owner-scoped write map) as **data the engine reads**. Because these rules decide who may
write what — and how facts merge — the file is **admin-owned by intent** and its edits are _meant_ to be
locked. This mirrors Atlas's own T0 rule: a governance change is a **human-ratified** act, not an automatic
one. **Both mechanisms are now built, and the lock still cannot bind the one actor it was written for** —
for a reason that is about identity, not settings. See "What the lock actually binds" below.

## The lock (two mechanisms, both required — both now BUILT as of 2026-08-02)

1. **Ownership — CODEOWNERS. IN FORCE.** The repo-root `CODEOWNERS` assigns `/.atlas/policy.json`,
   `/CODEOWNERS` **itself**, `/.github/workflows/`, `/harness/gates/` and `/harness/lib/` to
   `@HuGR-Labs/atlas-admins`
   (step 3 below, landed 2026-08-02; the fifth path added 2026-08-03 with the directory it names).
   **The team now exists** — measured 2026-08-02:
   `gh api orgs/HuGR-Labs/teams` returns one team, `atlas-admins`, `privacy: closed` (visible, which is
   required — GitHub will not resolve a _secret_ team in CODEOWNERS), holding `role: write` on the repo,
   with `gmhelmold` as its member. Consequently
   `gh api repos/HuGR-Labs/atlas/codeowners/errors --jq '.errors'` returns **`[]`** — every one of the
   rules resolving was measured on the four rules that existed then. This paragraph previously said the
   team did not exist and every rule reported `Unknown owner`; that was true when written and is now
   false. The fifth rule (`/harness/lib/`) is the same team on the same syntax as the fourth, so it
   resolves for the same reason — but the endpoint reads the DEFAULT BRANCH, so that is an inference and
   not a measurement until this lands on `master`, and it is written as one.
2. **Enforcement — branch protection. PARTIALLY IN FORCE, and the gap is deliberate.** A rule now exists on
   `master`. Measured 2026-08-02:

   | field                             | value       | verdict                                       |
   | --------------------------------- | ----------- | --------------------------------------------- |
   | pull request required             | `true`      | ✅ no direct pushes                           |
   | `enforce_admins`                  | `true`      | ✅ applies to admins — the load-bearing field |
   | `allow_force_pushes`              | `false`     | ✅                                            |
   | `allow_deletions`                 | `false`     | ✅                                            |
   | `dismiss_stale_reviews`           | `true`      | ✅                                            |
   | `required_approving_review_count` | **`0`**     | ⚠️ deliberate — see below                     |
   | `require_code_owner_reviews`      | **`false`** | ⚠️ deliberate — see below                     |

   The two `⚠️` rows are not oversights and turning them on would not add safety today. **The agent and the
   owner are the same GitHub identity** (`gh api user` ⇒ `gmhelmold`, the sole member of `atlas-admins`).
   GitHub does not let an author approve their own pull request, so `required_approving_review_count: 1`
   **deadlocks every PR the fleet opens** — which is exactly what happened when it was first set, and why it
   was lowered. Requiring code-owner review has the same effect for the same reason.

## What the lock actually binds — state this before trusting any of the above

- **Against an outside contributor: WRITE ACCESS is the control, not the approval count.** Nobody outside
  `gmhelmold` holds write on this repo, so an outsider cannot push a branch or merge anything regardless of
  how the review fields are set. Their only route is a fork PR, which a human merges. That is the owner's
  stated requirement and it is met.
- **Against the agent/owner identity: nothing binds, and no setting can change that** while one identity is
  both the sole admin and the sole ratifier. The protection rule stops the _accident_ (a stray force-push, a
  branch deletion, a direct commit to `master`) and it does apply to admins. It does not stop a deliberate
  act by the one account, because ratification requires a **second** identity to exist.
- **So the remaining step is not a settings change — it is adding a second human to `atlas-admins`.** Once a
  second member exists, set `required_approving_review_count: 1` and `require_code_owner_reviews: true` and
  the design in step 4 becomes real rather than self-referential. Until then, recording that honestly is
  worth more than a `true` in a field that would only deadlock the fleet.

## Who may do what

- **Anyone may propose.** Open a PR editing `.atlas/policy.json`. The loader is fail-closed, so a bad
  proposal cannot degrade safety even if it lands: an absent or malformed policy resolves to the
  conservative `defaultPolicy()` (exact-match near-dup, empty T0 keywords, **empty scopes ⇒ no write
  authorized**; reads stay universal).
- **Only admins ratify — INTENDED, still not enforced, and this bullet is itself a worked example.** The
  design is that a merge requires a `@HuGR-Labs/atlas-admins` review, the same shape as Atlas T0
  human-ratification. The ownership half is now real (the team resolves, `codeowners/errors` is `[]`) and
  direct pushes to `master` are blocked for admins too. The review itself is _not_ required, because the team
  has exactly one member and that member authors the PRs — see "What the lock actually binds". The
  fail-closed loader plus write-access scarcity are the controls carrying the weight today.

  _The worked example:_ this bullet previously read "INTENDED, and enforceable only once a second human
  exists", and `spec-conformance-guard` **failed the commit** — `DOC-DRIFT: policy-lock.md:61, stale
governance-count claim`. The rewrite had dropped the words "not enforced", which is what the ALLOW list
  keys on, and the ALLOW list is deliberately built from _words that negate or hypothesise, never words that
  assert_. That is not a false positive dodged by re-adding a magic phrase: "enforceable once X" reads as a
  property the system has, and the system does not have it. The gate caught the author of this document
  drifting toward asserting a lock that is not in force — in the document about that lock. Recorded rather
  than quietly reworded, because it is the only evidence in here that any of this is mechanically checked.

## The exact sequence that would make the lock real

Every step is a precondition for the next; skipping any one leaves the lock inert. **Steps 1, 2, 3 and 5 are
DONE, and step 4 is done except for its two review fields.** What remains is not a settings change at all —
it is adding a **second human** to `atlas-admins`, because a one-member ratifying team that also authors
every PR cannot ratify anything. That is the honest remaining blocker; everything mechanical is closed.

1. **Make the repo public** — **DONE 2026-08-02** (task #92, owner-authorized and owner-executed:
   `gh api -X PATCH repos/HuGR-Labs/atlas -f visibility=public`). The org is on plan `free` and the repo
   was `private`, which is precisely why protection 403'd. Public makes branch protection **and** rulesets
   available at no cost, so this resolved without money. (The alternative was paying for a plan; nothing
   else about the sequence changes.) _Precondition, met before publishing: the history had to be fit to
   publish — a full secret scan over the tree and all 307 history commits came back clean._
2. **Create the `atlas-admins` team** in `HuGR-Labs` — **DONE 2026-08-02, owner-executed.** Measured:
   `privacy: closed` (visible, as required — GitHub will not resolve a _secret_ team in CODEOWNERS),
   `role: write` on `HuGR-Labs/atlas`, members `["gmhelmold"]`. `codeowners/errors` went from three
   `Unknown owner` entries to `[]`. **Note what this moves, rather than removes: the root of trust becomes
   "who may change team membership", i.e. the org owners.** The file never was the root.
   ⚠️ **The step is done; its PURPOSE is not.** "Add the ratifying humans" was the point, and the team has
   one member who is also the author of every PR. A ratifying body of one that ratifies its own work is a
   rubber stamp with extra steps. Adding a second member is the only remaining thing standing between this
   document and a lock that actually ratifies.
3. **Widen CODEOWNERS beyond `policy.json`** — **DONE 2026-08-02**, and it was a gap in the plan as
   originally written. Owning only
   `/.atlas/policy.json` is defeated by two ordinary PRs: the first edits `CODEOWNERS` itself (no owner
   ⇒ no review required), the second edits the policy freely. The same holds for any workflow that can
   commit. So the file must own **itself** and the CI that enforces it:

   ```
   /.atlas/policy.json   @HuGR-Labs/atlas-admins
   /CODEOWNERS           @HuGR-Labs/atlas-admins
   /.github/workflows/   @HuGR-Labs/atlas-admins
   /harness/gates/       @HuGR-Labs/atlas-admins
   /harness/lib/         @HuGR-Labs/atlas-admins
   ```

   The fourth line was itself missed on the first cut, and found by a cold review — the same shape of gap
   one level down. Owning `/.github/workflows/` protects only the line that INVOKES a gate, not what the
   gate DOES: an author who rewrites `harness/gates/layer-guard.mjs` to `process.exit(0)` touches no owned
   path, and CI runs the neutered check and reports green. The workflow and the script it runs are one
   control and are owned together. The lesson generalizes: after adding an owned path, ask what the
   _content_ of that path delegates to, and own that too.

   The fifth line is that lesson applied one level further down, and it was added by the change that
   created the directory it names (`work-packages/wp-gates-that-cannot-fail.md`). `harness/lib/` holds
   what the gates DELEGATE to: the shared comment stripper, the reachability analyser, the drift
   vocabulary, and layer-guard's workspace scanner. Every one of them is load-bearing for a gate's
   verdict — `stripComments` returning `''` makes layer-guard see zero imports and print OK — so the same
   argument that owns the gate owns its library. Note the direction of the risk: this line was not
   closing a pre-existing hole but preventing one, because the extraction that moved that code from
   `harness/gates/` to `harness/lib/` would otherwise have moved it silently OUT of the lock. A
   refactor that relocates owned content is an ownership change even when it is a behaviour no-op.

4. **Protect `master`** — **DONE 2026-08-02 except the two review fields, and the exception is deliberate.**
   - _Require a pull request before merging_ — ✅ **on**, no direct pushes.
   - _Block force pushes_ and _block deletions_ — ✅ both **on**.
   - _Dismiss stale approvals on new commits_ — ✅ **on**, so an approved PR cannot be force-updated with
     different content after review.
   - **Do not allow bypassing — apply to administrators too** — ✅ `enforce_admins: true`. This is the
     load-bearing field; without it the whole sequence is decorative, because any repo admin pushes straight
     to `master`.
   - _Require review from Code Owners_ — ❌ **off**, and _Require approvals ≥ 1_ — ❌ **`0`**.
     **Not an oversight.** GitHub forbids self-approval, and the only member of `atlas-admins` is the account
     that authors every PR, so `1` **deadlocks the whole fleet** — measured, not predicted: it was set to `1`,
     every open PR became unmergeable, and it was lowered. These two flip to `true`/`1` the day a second human
     joins the team, and not before. Turning them on today would buy zero safety and stop all work.
5. **Verify mechanically, not by reading the settings page.** Re-run these; do not trust this document.
   - `gh api repos/HuGR-Labs/atlas/codeowners/errors --jq '.errors'` ⇒ **`[]`** (measured 2026-08-02, after
     the team was created and the widened file reached the default branch — the endpoint reads the DEFAULT
     BRANCH, which is why it reported `Unknown owner` until both were true).
   - `gh api repos/HuGR-Labs/atlas/branches/master/protection` ⇒ **200**, with `enforce_admins.enabled ==
true`. The `403 — Upgrade to GitHub Pro…` → `404 — Branch not protected` → `200` progression is the
     audit trail of steps 1 and 4.
   - `gh api orgs/HuGR-Labs/teams/atlas-admins/members --jq 'length'` ⇒ **1**. **This is the number that
     still says the lock does not ratify.** When it reads ≥ 2, re-run step 4's two review fields.

### The commands (verbatim — kept because they are the audit record, and step 4b is still owed)

All are **org/repo settings** writes; none is reachable from a commit.

```sh
# step 2 — DONE. The team, visible (`closed`, not `secret`), then write access on the repo.
gh api -X POST orgs/HuGR-Labs/teams -f name=atlas-admins -f privacy=closed \
  -f description='Ratifies governance policy, CODEOWNERS and CI workflows for atlas'
gh api -X PUT orgs/HuGR-Labs/teams/atlas-admins/repos/HuGR-Labs/atlas -f permission=push

# step 4a — DONE. Protect master, applying to admins. Note the two review fields are the SHIPPED values,
# not the aspirational ones: `0` and `false`, for the deadlock reason recorded above.
gh api -X PUT repos/HuGR-Labs/atlas/branches/master/protection --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "require_code_owner_reviews": false,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

# step 4b — STILL OWED. Run BOTH lines, in this order, the day a second ratifier exists.
# Running the second without the first re-creates the deadlock.
gh api -X POST orgs/HuGR-Labs/teams/atlas-admins/memberships/<second-human> -f role=member
gh api -X PATCH repos/HuGR-Labs/atlas/branches/master/protection/required_pull_request_reviews \
  -F required_approving_review_count=1 -F require_code_owner_reviews=true
```

**What still would not be true afterwards.** The lock governs how the file CHANGES IN THIS REPO. It does not
authenticate the actor the policy names (`docs/reference/atlas-architecture.md` §3.3 / ARCH-12 — `ATLAS_ACTOR`
is self-asserted), and it does not bind a CLONE: anyone who copies the repo edits their own `policy.json`
freely, because the policy is read from the working tree. The lock is a control over the shared branch, and
only that.

## The durable store is a separate root, and it is now checked

`.atlas/policy.json` is the only file under `.atlas/` that belongs in git. The rest — `projection.json`,
`staging.json`, `cas/**` — is the DURABLE STORE: knowledge produced by the governed doors. Committing it
publishes rows with any `nodeKey`, `scope`, `tier` and `contentHash` past every gate, because no gate runs
during a `git add`. Reproduced end to end in `packages/adapter-io/test/store-provenance.test.ts`: with
`authz.scopes = {}` (every write door denying every write), a committed projection was served as a ratified
`T0` pack invariant.

Two mechanisms, and they are not alternatives:

- **`.gitignore`** (`.atlas/*` + `!.atlas/policy.json`) stops the ACCIDENT, which is the common case. It is
  not a control: `git add -f` overrides it in one flag.
- **The provenance tripwire** (`packages/adapter-io/src/store-provenance.ts`) is the control. At load, it
  asks whether the durable store is TRACKED BY GIT — a door writes it to the working tree and never stages
  it, so tracking means it arrived by commit. A tracked store reads as EMPTY (serves nothing) and REFUSES
  every write (so it is not silently overwritten and laundered into door output).

**Note that content-verification would NOT have closed this**, which is worth recording because it is the
intuitive fix. The store already re-hashes every CAS object on read, and the emit door already requires a
row to corroborate its own bytes. Both pass for a committed store, _by construction_: the attacker who writes
the file computes the hashes with the product's own `id()`. Content-addressing authenticates **integrity**,
never **provenance**. Only a keyed construction (a MAC/signature under a key the committer lacks) would, and
this product has no key material and nowhere to put it that a committer could not also read.

## The hole this rewrite found, and closed the same day: CI is now a merge condition

`required_status_checks` on `master` was **`null`**. Measured 2026-08-02, **fixed 2026-08-02** (owner-executed):
it now reads `{ strict: false, contexts: ["gate"], checks: [{ context: "gate", app_id: 15368 }] }`.

**What it was.** Nothing stopped a pull request with a **red** `ci` run from being merged. Every mechanical
control this repo has — all seven gates, `tsc -b`, the whole 2100-test suite — runs _inside_ that workflow, so
a null `required_status_checks` meant none of them was a merge condition. They were advisory output a human
was trusted to read. **A gate is only as binding as the thing that requires it.**

Same shape as the CODEOWNERS gap that made this document necessary, one level further out: an enforcement
body whose _schedule_ is owned (`/.github/workflows/`) and whose _content_ is owned (`/harness/gates/` +
`/harness/lib/`), but
whose **verdict** was not consulted at the merge point. Owning all three is what closes it.

It was also the one item that needed **no second human** — unlike the two review fields, a required check
binds a solo author perfectly well, because what must be satisfied is the CI, not a reviewer.

### Three things about the fix that are worth keeping, because each was a trap

1. **`PATCH .../required_status_checks` returns `404 "Required status checks not enabled"`.** That endpoint
   edits an existing object; with `null` there is nothing to edit, and GitHub exposes no create verb for it.
   The full `PUT` on `/protection` is the only route.
2. **That `PUT` REPLACES the entire protection object.** Every field omitted is silently turned off. The
   payload below therefore restates `enforce_admins`, both push blocks and all three review fields — not for
   completeness, but because leaving any of them out would have quietly removed a control while appearing to
   add one. That was the real risk in this change, not the status check.
3. **`strict: false` is deliberate.** `strict: true` requires every branch to be up to date with `master`
   before merging, which under a parallel fleet means each merge invalidates every other open PR and
   serializes the whole wave. Near-zero safety gain, high cost. And **`contexts` takes the JOB name (`gate`),
   not the workflow name (`ci`)** — get that wrong and every PR deadlocks with no way out through the UI,
   because `enforce_admins: true` binds the author too. It was checked against two green runs first.

```sh
# what was run. The undo, if a wrong context name ever deadlocks the repo, is the same PUT with
# "required_status_checks": null — settings writes are NOT blocked by enforce_admins.
gh api -X PUT repos/HuGR-Labs/atlas/branches/master/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": ["gate"] },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "require_code_owner_reviews": false,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

**So every mechanical control is now binding, and exactly one thing is not: ratification.** The team has one
member. That remains the only open item in this document.
