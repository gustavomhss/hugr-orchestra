# Code review

The code review seat, `lucy`, reviews a plan before work starts and the work when it comes back. Maestro asks for the
review; `lucy` returns a card with a verdict, the findings behind it and a plain list of what it did not check. Read
this to know what a card says, how deep a review goes and which settings change it.

`lucy` never edits your files, commits, merges or approves on your behalf. It reads the change cold: it gets the
request, the acceptance criteria, the plan and the diff, never the author's conversation. Proofs that need to run
code run in a throwaway copy of the tree, which is deleted when the review ends.

The committed PR workflow described below is for the PR-capable campaign build, pending lead acceptance with the
campaign bundle. This guide does not mean your installed app has already been updated.

## The card

Every review ends with one `review-result` card:

| Field | What it holds |
| --- | --- |
| `outcome` | `done`, or `blocked` when `lucy` could not judge |
| `verdict` | `APPROVE`, `FIX_FIRST` or `REJECT`, only when `outcome` is `done` |
| `profile`, `tier`, `overlays` | What kind of review ran and how deep (below) |
| `routing` | The routing record: what Orchestra chose before `lucy` read anything |
| `findings` | Each problem found, with its evidence |
| `questions` | Suspicions `lucy` could not prove |
| `checks` | Each analyzer and project gate, with `pass`, `fail` or `not-run` and the reason |
| `coverage` | What was examined and what was not, each with a reason |
| `handoffs` | Questions for another reviewer, and whether anyone covered them |

Maestro receives the card. When the review is part of a governed run, the same findings are stored in the review
record, whose method reads like `review-v2/code/standard`. A committed PR review has no such receipt; see below.

## Verdicts

| Verdict | Means | What Maestro does |
| --- | --- | --- |
| `APPROVE` | No confirmed P0 or P1, and every check the review requires ran or is a lane you accepted as unavailable | Continues |
| `FIX_FIRST` | At least one confirmed P0 or P1 that a fix inside the current plan can address | Sends the findings back to the seat that did the work, for one retry |
| `REJECT` | The approach or plan is wrong; a fix needs a new plan | Sends it back to `archie` for a new plan round |
| `blocked` | `lucy` could not judge: missing intent or acceptance, a change too large to slice, or a required check that could not run | Brings the blocker to you |

The review method requires a `blocked` card when `lucy` cannot judge; a verdict is never a vote across passes.
For committed PR reviews, the current card validator does not independently verify check completeness or accepted
lanes. Inspect the reported checks and coverage; `APPROVE` alone is not evidence that required lanes ran. Maestro
never edits a finding.

Severities: **P0** data loss, a security breach, a crash or corruption on a main path; **P1** wrong behavior a user or
caller will hit, a missing test for a stated behavior, or a broken written rule; **P2** a real defect with a narrow
trigger; **P3** an observation. An `APPROVE` may carry P2 and P3 findings.

## What counts as a finding

A finding needs all four:

1. **Rule**: a written rule (your repository's instructions, a guard, a style guide) or a correctness property stated
   in the finding.
2. **Location**: file and line, or a range.
3. **Trigger**: the input or sequence that makes it fail.
4. **Evidence**, labelled by kind: `probe` (a test or command that fails, with the command), `tool` (an analyzer
   result, with tool and rule), or `quote` (the lines that show it).

A suspicion without evidence goes under `questions`, never into a `FIX_FIRST`. Issues that were already there before
the change, off its path, are not reported. Each finding keeps a stable id and a status (`open`, `resolved`,
`dismissed`) across rounds; `lucy` changes a finding only on new evidence, never because someone disagrees.
For a Quick committed PR review, Orchestra binds a quote citation to actual lines in the reviewed head. That is not
an automated proof that the finding's logical claim is correct.

## Profiles

The profile is what is being reviewed. Maestro picks it.

| Profile | Reviews | Default tier |
| --- | --- | --- |
| `plan` | A plan, spec or work package before anyone builds it | Standard |
| `code` | The work a teammate returned: a diff or a result tree | By risk |
| `pr` | A finished, committed diff outside the governed flow | By risk |
| `rereview` | The round after a `FIX_FIRST`: only the open findings and what changed since | The first round's |

A `rereview` says so when the work came back unchanged.

Governed rereview continues the newest `FIX_FIRST` code receipt, using the host's
saved route and validated findings, not a previous assistant card. It keeps the
tier that actually ran, including Standard when Deep was requested but unavailable.
If that retained tier is no longer built, the request refuses explicitly instead
of switching tiers. An older receipt without host-round data cannot anchor this
continuation; ask Maestro for a new review.

Plain pull-request reviews currently require a Unix private replay store and
refuse Windows before creating a review Session. Governed plan and code receipts
do not use that store. On Windows or an otherwise unsupported host the request
fails as `pr-facts-unsupported`; this security refusal is not a lane that
`review.acceptedUnavailable` can override.

Inside `code`, `pr` and `rereview`, Orchestra may add an **overlay** for the kind of change. The catalog names nine:
`docs`, `concurrency`, `api-wire`, `data-migration`, `performance`, `ci-infra`, `dependency`, `ui` and
`personal-data`. Changed GitHub workflows can also route the pinned zizmor check. Changed paths bind matching
overlays; added-line content can suggest an overlay for `lucy` to confirm or decline. The overlay record alone does
not mean its reading pass was examined.

## Committed PR review

Ask Maestro to review two commit references that already exist locally. For example, Maestro can call
`maestro_request_review` with:

```json
{ "kind": "pr", "baseRef": "origin/dev", "headRef": "HEAD", "tier": "standard" }
```

Both refs must resolve locally to commits; supported commit-ish expressions work too. Orchestra reviews the committed
diff from their unique merge base to the resolved head, not dirty worktree changes. It reads review rules from that
merge base: the PR description and head cannot rewrite them. Optional `prText` is untrusted data. Do not mix this
request with `profile`, validation or governed-review fields. The review does not fetch, check out, post to a forge,
or change the branch.

The response reports host identity, including the resolved commits and diff digest, followed by one validated card.
It creates no review receipt, Board note or forge post. The card is neither governed authorization nor permission to
merge. A completed retry of the same candidate reuses host facts and the completed reply. If the previous run is
incomplete or crashed, the retry fails as `pr-retry-incomplete` before another provider run; it is not an automatic
recovery. Do not change inputs merely to bypass that hold.

## Tiers

The tier is how deep the review goes.

| Tier | What runs |
| --- | --- |
| **Quick** | One pass over the diff with its intent; findings are backed by a quote. Reports only P0 and P1. |
| **Standard** (default) | Separate reading passes for routed concerns and candidates checked by a second Session that did not find them. New or changed tests need fail-before/pass-after evidence when the required lane is available. |
| **Deep** | Can be requested, but is not built yet. It runs as Standard. |

When nobody sets a tier, Orchestra chooses one from the change: Quick for documentation only, test-only additions or
a small change with none of the risks below; Deep for a trust boundary, authentication or secrets, concurrency or
stored state, a data migration, a public API or wire change, a release, more than about 400 changed lines, or a file
many people change often; Standard for everything else. `lucy` may raise the tier one step and must quote the line
that justifies it. It can never lower it.

Quick and Standard cap the number of reading passes. A routed lens over the cap is listed in `routing.deviations`,
not silently examined; even the privacy lens can be capped at Quick. Routing `personal-data` does not grant a full
audit. Check the card's coverage and deviations for what actually ran.

When a review asks for Deep, the card shows `tier.requested: "deep"` in the routing record, runs Standard, records the
method as `standard`, and lists every Deep lane under "not examined" with the reason `not-built`. Read that as "this
change deserved more than this release can do", not as a pass.

### Pinning a tier

- **Per request**: ask Maestro for the tier ("review this at Standard"). Maestro passes it with the review request.
- **Per project**: set the project's review tier (`review.tier`, in the board project settings) to `quick` or `standard`.

The order is: the request's tier, else the project pin, else the risk rule above.

## The host routes, the model judges

Before `lucy` reads the change, Orchestra itself decides the review's shape from facts it can check: the profile, the
tier, the overlays that follow from changed paths, the languages, the reading passes, the analyzers, and how much each
Session may load and run. It writes these choices to the routing record. The same request on the same trees always
produces the same record.

`lucy` then judges inside that shape: which code to read, what to raise, how to prove it. It may only **add** rigor:
raise the tier one step, confirm or decline an overlay Orchestra suggested from added lines, or add up to two overlays.
Each addition appears in the routing record marked `"source": "model"` with the quote that justified it, and each
declined suggestion stays on the card with its reason.

For you, this means:

- Text inside the change (a pull request description, a comment saying "docs only, no concurrency here") cannot make
  the review lighter. It is read as data, never as an instruction.
- Your repository's review rules (`AGENTS.md`, `CLAUDE.md`, `REVIEW.md`) are read from the base revision, so a change
  cannot rewrite the rules that judge it.
- `routing.deviations` lists every place a Session left its route, for example a budget it ran out of.

A changed `.py` or `.pyi` file on Standard or Deep can route the pinned Ruff check. It reports only `F821` (an undefined name) and `F823` (a local used before assignment). Orchestra provisions that binary with the host toolkit, outside the review, and does not install it during the review. The scanner's default target is Python 3.11; that is not the version the project deploys. Windows is unsupported for this check. A raw Ruff report is a diagnostic, not by itself a confirmed blocker.

Changed `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts` or `.cts` files on Standard or Deep can route the pinned oxlint check. It reports only `eslint(no-debugger)` and `typescript(no-explicit-any)`, both on probation. Orchestra copies selected source bytes into a separate host-owned project with its own curated config; oxlint does not load the repository's `.oxlintrc` or project plugins, and it runs with `--no-ignore` and `--disable-nested-config`. The check is qualified on Linux x64 only; other platforms return `not-run`. A raw oxlint report is a candidate, not a confirmed defect.

Changed `.github/workflows/*.yml` and `.yaml` files bind the pinned actionlint check.
Orchestra copies selected workflow bytes into a separate host-owned project with
its own empty configuration; actionlint does not load the repository's configuration.
ShellCheck and Pyflakes subprocess integrations are disabled. Diagnostics are
mapped back to the original workflow path and still need evidence before confirmation.

This check does not run workflows or install tools during a review. Workflows
requiring local action or reusable-workflow metadata return an explicit `not-run`,
not a clean result. If a native rule is dropped, the check refuses rather than
pretending actionlint can disable that rule by identity. Windows remains
`windows-api-unqualified`; static binary-header inspection is not native runtime proof.

Changed `.github/workflows/*.yml` and `.yaml` files on Standard or Deep can route the pinned zizmor check. It is on probation. Orchestra copies the selected workflow bytes into a separate host-owned projection and runs the pinned binary with `--offline`, `--no-config` and `--no-ignores`; it does not load the repository's zizmor config or ignore comments, and it does not run during the review install. The check is admitted on Linux x64 only. Other platforms, a missing binary, a symlink, a path outside the copy, or a dropped native rule return `not-run`, not a clean pass. A missing or unmapped finding level is an acquisition error and keeps the raw report. A raw zizmor diagnostic is a candidate, not a confirmed defect, and this integration does not qualify the review tip or any other platform.

## "Not examined" and "not read"

Verifier probes may use only the options offered for that specific candidate; another candidate's options do not
grant permission, and invented candidate IDs are refused. Probes run against a host-made copy of the reviewed Git
commit or tree, not the current working directory. If entry adds an analyzer, paging and the final checks use the
latest retained analysis rather than the earlier run.

Raw probe and history output stays in the review's analysis cache after its Sessions and scratch copies close.
That cache is OS-managed temporary storage, not a permanent evidence archive.

A card states its limits; it never claims "no problems" for anything it did not look at.

- **Not examined** is a list under `coverage.notExamined`. Each entry names a file, reading pass, check or lane and the
  reason: out of scope, toolchain absent, time box, tier, `budget` (a Session reached its limit before it finished),
  or `not-built` (this release cannot do it yet). A finding that could not be proven within budget becomes a question
  marked `not verified: budget`.
- **Not read** is a count. Analyzer results are filtered before any model sees them: duplicates and issues already in
  the base are removed, and each reading pass gets only its top-ranked items. The rest are kept, and the card counts,
  per reading pass, how many no model read.

A long "not examined" list on an `APPROVE` is a reason to look closer, not a defect in the review. A catalog entry
for an analyzer is not proof that its adapter exists or that it ran. The review method requires unavailable checks
and their reasons to be reported, but the current PR card validator does not independently verify that the list is
complete. Inspect checks and coverage; the review never installs or downloads a missing tool.

## Lanes you accept as unavailable

Some checks cannot run in some projects: tests may be blocked locally, the sandbox may be unavailable on your
platform, or a tool may be missing. The review policy requires a `blocked` card when a required check cannot run,
unless the owner has accepted that unavailable lane where acceptance is allowed.

To accept a lane where allowed, list it in the project setting `review.acceptedUnavailable` (board project settings).
The method expects the card to report it as `not-run` with its reason, list it under "not examined", and cite other
recorded checks, such as CI results. The current PR card validator does not independently verify those decisions or
the completeness of the checks list; an `APPROVE` alone does not establish that this policy was satisfied.

Accept a lane only when you rely on another check for it, such as CI. Security and private-cache refusals are not
lanes that this setting can accept.

## Handoffs

When a change crosses a trust boundary, or needs a legal or residual-risk call, `lucy` lists a handoff naming the
lane, the reason and the evidence. The security review and process audit seats are not built yet, so those handoffs
show `"covered": false`: nobody checked them.
