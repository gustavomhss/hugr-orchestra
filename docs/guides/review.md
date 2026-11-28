# Code review

The code review seat, `lucy`, reviews a plan before work starts and the work when it comes back. Maestro asks for the
review; `lucy` returns a card with a verdict, the findings behind it and a plain list of what it did not check. Read
this to know what a card says, how deep a review goes and which settings change it.

`lucy` never edits your files, commits, merges or approves on your behalf. It reads the change cold: it gets the
request, the acceptance criteria, the plan and the diff, never the author's conversation. Proofs that need to run
code run in a throwaway copy of the tree, which is deleted when the review ends.

The committed PR, captured-CODE and independent engagement workflows described below are for the campaign build, pending lead
acceptance with the campaign bundle. This guide does not mean your installed app has already been updated.

## Reading the reviewed code

During a review, `lucy` can search the captured source with `code_search`, consult a compatible prepared index with
`code_query`, or locate relevant original file ranges with `code_locate`. These reads stay on the captured revision
while you continue editing your working folder. Every successful call returns retained evidence with a URI and
SHA-256 digest. The URI and digest identify the retained bytes behind the tool result.

A search preserves valid matches when a matching binary file was only partly searched or the binary coverage probe
reaches its output ceiling, but reports incomplete coverage. A page cut by its result limit is also incomplete.
Zero matches establish absence only within the selected scope when `coverage.complete` is true; a zero binary count
from an incomplete probe is only a lower bound. A failed binary probe returns a named search error.

A review that captures a tree without a semantic commit can still search and locate its code; index queries return
`index_unavailable`. A missing or incompatible prepared index also stays unavailable. Locate can continue with
lexical results and reports incomplete coverage when the index cannot serve it. Review CODE calls never download a
missing tool or rebuild an index.

These tools require the review's active host binding. Calls after it closes return `review-code-binding-missing`.
Source acquisition failures return `review-code-source-unavailable`, and a call that reaches its 60-second deadline
returns `review-code-timeout`. An unavailable read does not establish that the code contains no matches.

## Prepare local review checks

Ask Maestro explicitly: “Prepare `shfmt`, `cargo-machete`, or both for review.” Maestro asks for one-time permission
before downloads, licence notices or version probes. If permission is declined, preparation does not proceed.

Analysis with these checks is supported only on Linux x64. After a host restart, ask Maestro to prepare them again.
Preparation does not enable every check for every project or review. Review cards report actual check statuses and
reasons, including checks that could not run; a partial preparation is not reported as fully ready.

To opt in for a project, commit `.orchestra/lucy-local-checks.json` at the review base:

```json
{
  "version": 1,
  "shfmt": { "indent": 2, "language": "bash" },
  "cargoMachete": { "enabled": true }
}
```

`shfmt` checks each selected shell file as a whole, not only changed lines. `cargo-machete` requires workspace scope;
a `files` request is refused rather than widened to a workspace. Cargo's native ignore metadata is honored, and the
projected tree excludes detected dependency directories such as `node_modules`, `.venv` and `target`. Cards show the
actual `pass`, `fail`, `not-run` or `acquisition-error` status, its reason, and a raw evidence URI. Coverage is tool-level:
it does not claim per-file completion, new-only results or review findings. Unsupported platforms and unavailable read
supervision are reported as unavailable, not as successful checks.

## The card

Governed and committed PR reviews end with one `review-result` card. Independent engagements return a durable
report envelope containing a card without a verdict, as described below.

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
For committed PR reviews, the host validates the card against its retained check facts. The card must include
exactly those checks: missing, additional, altered or duplicate checks are refused. Only host settings can accept
an unavailable check or lane; model text cannot grant that exception. Acquisition errors in required checks remain blockers.
A host blocker requires a `blocked` card, and a failed required repository command prevents `APPROVE`. A failed
optional diagnostic or verifier probe remains evidence without automatically vetoing approval. Read the checks
and coverage to see what actually ran and what remained unavailable. Maestro never edits a finding.

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
| `audit` | An independent review of captured repository files | Deep |
| `diligence` | An independent review framed around diligence concerns | Deep |
| `artifact` | An independent review of captured artifact files | Standard |

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

## Independent engagement reports

Ask Maestro for an audit, diligence or artifact report over committed files. For example:

```json
{
  "kind": "engagement",
  "requestID": "audit-42",
  "profile": "audit",
  "brief": "Inspect the captured src files for correctness and control gaps.",
  "timeBoxMinutes": 5,
  "revision": "HEAD",
  "paths": ["src"]
}
```

`timeBoxMinutes` is an integer from 1 to 120. Omitted `revision` means `HEAD`; omitted `paths` means the captured
repository. Paths are literal repository-relative files or directory prefixes. Symlinks and submodules are listed
as not examined. The request captures one commit and an exact regular-file manifest. Later edits do not change
its CODE reads or report citations, and an omitted CODE path or a broad search glob cannot widen that manifest.

These requests require no validation ID or governed work card. They return one JSON envelope with the original
budget, captured source, terminal status and `reportID`. A completed envelope also includes the validated card,
exact source quotations, citation digests and severity classifications. It has no `APPROVE`, `FIX_FIRST` or `REJECT`
verdict and creates no governed review receipt. A completed report may still have a `blocked` card when required
checks or evidence were unavailable. Read its checks and `notExamined` entries before relying on a conclusion.

Audit classifications are material weakness (P0), significant deficiency (P1), deficiency (P2) and observation
(P3). Diligence classifications are deal-breaker (P0), price or structure item (P1), condition or remediation (P2)
and observation (P3). Artifact reports retain the P0–P3 labels. These labels classify supported findings; they do
not establish a legal obligation or supply missing evidence.

Keep the same `requestID` and exact input when retrying under the same parent Session. A completed retry verifies
its required evidence before returning the same saved bytes, including after reopening the application or moving
HEAD. It does not rerun a model, CODE query or analyzer to repair missing evidence. Changing a supplied field,
including an optional default or path order, returns `engagement-request-conflict`. Use a new request ID for a
deliberately new engagement. Another parent Session has its own request namespace.

One host deadline covers capture, analysis, provider turns, tools and final publication. Expiry returns `expired`
with the remaining work marked `time-box`. Cancelling the owner stops its review Sessions, waits for cleanup and
persists `cancelled`; cancelling a concurrent waiter leaves the owner running. A retry replays either terminal
outcome. If the process ended before publishing one, the first retry fails closed as `engagement-interrupted`
(or records expiry if the original deadline passed); it does not resume a provider with a fresh budget.

The engagement route exposes captured CODE and scoped analyzer pages. Native file reads, Atlas context,
history and general verifier probes remain outside engagement scope. Reports record their coverage gaps.
Diligence reports can qualify a host-run TypeScript probe for an eligible contract finding.
Compliance requests refuse before source capture. Artifact behavioral evaluation remains unexamined
without owner permission. Those limits remain open even when an individual report completes successfully.

### Retesting findings after a fix

Use a new request ID in the original Maestro Session. Keep the profile of the original report, choose a local
Git revision, and set `fixReview` to the original `reportID` and the selected open `findingIDs`. Lucy captures
only the files required by those findings and their retained evidence. Removed or renamed required files
stop the request with a source error.

The retest keeps the original review tier and returns a disposition for each selected finding. An independent
verifier evaluates the current source and any matching analyzer observation. The native oxlint route requires
a prepared Linux x64 runtime and equivalent execution settings. The scoped TypeScript probe also requires a
prepared Linux x64 runtime. It checks one captured TypeScript file with host compiler settings and retains
the original diagnostic and the new compiler outcome. Source imports and directives that suppress diagnostics
are outside this probe's authority. Unchanged source or unavailable evidence cannot establish resolution.
Examine the result's questions and coverage gaps before relying on it.

Keep the exact same input for a retry. A completed result has its own report ID and includes the original
evidence closure in its receipt. Use the retained evidence reader below to inspect it after the review ends.
The original report and finding status remain available separately.

### Audit variants

Standard and Deep audit reports can expand independently confirmed findings through at most three generations.
The host validates every initial seed against the captured source and actual verifier reply before admitting a
proposal Session. It selects one seed by severity, path, line and finding ID. Other initial seeds remain explicitly
unexpanded. Each continued generation uses a newly confirmed finding from the immediately preceding generation.
Diligence and artifact reports have zero generations. Quick audit records independent verification as unavailable;
a blocked entry or a review without a confirmed finding records that no confirmed seed was available.

A proposal makes exactly one native `code_search` attempt over the complete captured authority, using
`paths:["**"]`, `offset:0`, `limit:200` and `context:0`. That same generalized search must find the known seed at
its primary path and line. Explicit paths can include admitted files excluded by repository ignore rules; they
cannot expand the captured authority. Pagination, omitted files, reported skipped binaries or another incomplete search stop
the generation. A successful tool display alone is insufficient: the host requires the captured operation and
its matching native completion.

Every new distinct path-and-line match enters the denominator, including a location omitted from the proposal.
The host excludes the selected seed, already confirmed findings of the same class and locations processed in
earlier generations. It selects at most four proposed candidates within the pinned verifier budget, then reads
their captured regions and creates a fresh independent verifier. An unreadable selected region does not free a
slot for another candidate. Omitted, over-budget, unreadable and invalid-return candidates remain not examined;
questions remain separate from confirmed findings.

Variant expansion stops when verification is incomplete, no new matches remain, noise is at least half the new
matches, or the third generation settles. Exactly half noise stops expansion. Counts come from native matches
and verified dispositions. One original deadline and the existing two-Session running limit cover the whole
engagement, including variants and final publication. Cancelled, expired or failed requests publish no partial report or evidence receipt.

The report's host-owned `audit:variants` coverage records the actual stop, unexpanded initial seeds and unexamined
matches. Newly completed evidence receipts also retain the generation journal, native replies and captured regions.
Replay checks their identities, accounting, lineage and decisions against retained bodies without rerunning Git,
a model, a search or an analyzer. This evidence supports the report; it grants no execution or merge authority.

### Reading retained engagement evidence

A newly completed report has a durable evidence receipt in the same application's data storage. Ask Maestro to
call `maestro_read_review_evidence` with `op: "manifest"` and the envelope's `reportID`. The response identifies the
receipt body and gives counts of operations, artifacts and native proofs. Use `op: "read"`, that report ID and the
returned manifest `artifactID` to read the receipt; then use its artifact descriptors to read the individual bodies.
The receipt binds the captured source, original budget and exact report. It retains actual CODE captures, source
quotations, every host analysis and the final analysis identity.

Each read returns at most 4,096 original bytes encoded as base64, with a continuation `next` cursor when more bytes
remain. Pass that cursor unchanged on the next read. Concatenate decoded bytes before interpreting UTF-8, since a
page can end inside a character. An artifact's size and SHA-256 describe the complete body. A truncated process
capture is explicitly incomplete and records both observed and retained byte counts; storing it cannot make its
check pass.

Only Maestro in the report's original parent Session, project and Location can read it. Knowing a report ID, body
hash or evidence URI grants no access. The reader accepts report/artifact IDs and cursors; it does not accept a
filesystem path or a command. It uses the ordinary permission and output-policy checks.

Engagement analysis currently qualifies the prepared oxlint 1.91.0 host path on Linux x64. Its proof records the
actual selected source and host config, runtime digest, invocation recipe and original stdout/stderr. Other routed
producers, including eligible Deep impact and LSP readers, return `engagement-evidence-scope-unqualified` before
execution. Other oxlint platforms report `oxlint unsupported: native-runtime-unqualified`. Missing runtimes stay
unavailable; an engagement never installs one. Read the report's host `notExamined` entries for these limitations.

| Retention or read bound | Limit |
| --- | ---: |
| One producer body | 16 MiB |
| Sum of distinct artifact descriptor sizes | 64 MiB |
| Artifact descriptors | 256 |
| Captured CODE operations | 128 |
| Receipt body | 1 MiB |
| One byte page | 4,096 bytes |
| One continuation cursor | 1,024 characters |
| One later read or replay integrity operation | 60 seconds |

These are logical limits per engagement and receipt, not a physical disk quota. Unpublished bodies may remain
after a failed or interrupted request; they grant no read authority without a published receipt.

Exceeding a publication bound fails the request; it does not silently drop evidence. Retention and final receipt
publication use the original review deadline. Cancelled, expired and failed reports have no public receipt and
name the evidence-publication gap. Their retries retain the same stopped result.

Reports saved before durable evidence retain exact report replay and return explicit `legacy-record` evidence
unavailability. Historical state-v2 / receipt-v1 records retain exact report and evidence replay. New ordinary admissions
use state-v3 / receipt-v2, including an explicit zero-generation section for diligence and artifact reports.
A newer completed report with a missing reference, missing body or corrupt bytes fails by name.
The reader and retry preserve that terminal record and do not rebuild a receipt from model messages or temporary
files. The evidence receipt carries no governed approval or execution permission.

## Tiers

The tier is how deep the review goes.

| Tier | What runs |
| --- | --- |
| **Quick** | One pass over the diff with its intent; findings are backed by a quote. Reports only P0 and P1. |
| **Standard** (default) | Separate reading passes for routed concerns and candidates checked by a second Session that did not find them. New or changed tests need fail-before/pass-after evidence when the required lane is available. |
| **Deep** | Two independent hunt samples, graph-backed caller context when available, and class-specific advanced proofs under larger bounded budgets. |

When nobody sets a tier, Orchestra chooses one from the change: Quick for documentation only, test-only additions or
a small change with none of the risks below; Deep for a trust boundary, authentication or secrets, concurrency or
stored state, a data migration, a public API or wire change, a release, more than about 400 changed lines, or a file
many people change often; Standard for everything else. `lucy` may raise the tier one step and must quote the line
that justifies it. It can never lower it.

Quick and Standard cap the number of reading passes. A routed lens over the cap is listed in `routing.deviations`,
not silently examined; even the privacy lens can be capped at Quick. Routing `personal-data` does not grant a full
audit. Check the card's coverage and deviations for what actually ran.

Deep runs its own tier and records its actual method. Two independently ordered hunt samples provide agreement only for ranking; agreement cannot confirm a finding. Caller context widens changed-line filtering only when an existing index supplies complete, fresh, revision-bound evidence. Missing or ambiguous index data stays explicitly unavailable. Individual missing adapters remain `not-run`, and findings still require independent proof. A catalog that genuinely lacks Deep adapters records the requested tier and falls back to Standard.

A trusted review at Standard or Deep also typechecks a TypeScript change with the project's own `tsc`, confined in a
scratch copy. It does not install a compiler. A missing one is unavailable. Approval waits until that check is listed
in `review.acceptedUnavailable`, or the compiler is present. In this repository the card cites `typecheck.yml`
instead, and that citation does not block approval. Quick does not run it.

The same trusted review asks the project's own language server, if the repository already has one, for diagnostics on
the changed TypeScript and JavaScript files. It opens them in the scratch copy and does not write them, and it does
not install a server. A missing one is recorded and does not block approval. An error it publishes is on the card; it
does not by itself refuse approval.

A trusted review at Standard or Deep also runs `go vet` on each changed Go package, in the scratch copy. The host fixes that command. It does not install Go, and it does not add a vet flag. A missing Go is unavailable, and approval waits until that check is listed in `review.acceptedUnavailable` or Go is present. Quick does not run it.

If `golangci-lint` is already installed, the same review runs `golangci-lint run --new-from-merge-base` against the review base and writes SARIF into the copy. It does not install that tool. A missing one is recorded and does not block approval.

If `shellcheck` or `hadolint` is already installed, Standard or Deep runs it on the changed shell scripts or Dockerfiles. The host passes those files and no flag. It does not install either tool. A missing one is recorded as `not run: <tool> absent` and does not block approval. Quick does not run them.

When a lockfile changes, Standard or Deep runs pinned osv-scanner 2.7.1 as `scan source -r` with `--offline` in the scratch copy. It does not download that database, and it does not run `fix`. The host refreshes it outside the review with `orchestra toolkit osv`, which runs `osv-scanner --offline-vulnerabilities --download-offline-databases` against a host directory, not the review copy. A missing database is recorded as `not run: osv advisory database absent` and does not block approval. When the database is present, the card states its age. Quick does not run the scan. On a machine that is not the qualified Linux x64 runtime the card records that and does not block approval. A missing pin on Linux still does.

For a changed `Cargo.lock`, Standard and Deep also run cargo-audit 0.23.0 on the qualified Linux x64 runtime. Prepare the installed pin with `orchestra toolkit prefetch cargo-audit`, then fetch a RustSec advisory database with `orchestra toolkit rustsec`. These are explicit host operations; a review does not install the tool or fetch a database. Each refresh publishes a new database generation, preserving the one an existing review is reading.

The scan reads captured head and base lockfiles from a private directory and ignores project and user Cargo audit configuration. It does not build the project or generate a lockfile. The card states the database revision, its commit time, and the time the host refreshed it, including when the data is stale. Missing data is recorded as `not run: RustSec advisory database absent`; an unavailable pin or unsupported runtime is also reported rather than passed. Registry yank status is not examined. Advisory reports are probation candidates tied to the actual package block; confirming a defect still requires checking the advisory against the dependency and its affected use. A broken head or base scan withholds candidates. Quick does not run this check.

Standard and Deep source reviews also route pinned jscpd 5.4.3 for exact duplicate code. Before reviewing, the host provisions it with `orchestra toolkit prefetch jscpd`; the review itself only uses an installed binary. It scans the head and base scratch copies with separate reports and an empty host working directory, so project configuration cannot enable extra passes. Either side of a new clone can intersect the changed lines. A clone is a probation candidate in `change.duplication`, never proof of a security or correctness defect; confirming it requires a written constraint or harmful divergence. Quick does not run it. The change lens still obeys the tier cap: if higher-priority routed lenses fill that cap, duplication items remain outside the model review and coverage reports the unexamined lens. Native execution is qualified on Linux x64 only. An unavailable base scan withholds candidates rather than treating all head clones as new.

The same lockfile change also runs pinned syft 1.57.1 as `scan dir:<copy> --base-path <copy> -o syft-json`. It does not enrich, and it does not scan an image or a registry. The result is an SBOM kept as an artifact, not a finding. Quick does not run it. On a machine that is not the qualified Linux x64 runtime the card records that and does not block approval. A missing pin on Linux still does.

The same review runs pinned staticcheck 2026.2.2 and pinned gosec 2.30.0 on those packages. The host names both binaries. staticcheck gets no flag. gosec gets only `-fmt sarif` and an output path in the copy. It does not send findings to an external service. On a machine that is not the qualified Linux x64 runtime the card records that and does not block approval. A missing pin on Linux still does.

A Go concurrency candidate can be probed with `go test -race` in the scratch copy. The host fixes that command. The verifier reads the result from the race proof leaf and does not name the command. It does not install Go. A missing Go is unavailable, and approval waits until that check is listed in `review.acceptedUnavailable` or Go is present. Other languages are not offered that probe, because they have no race detector in the catalog. Mutants, interleave and property still do not run.

The same trusted review also runs one pinned type-aware rule, `typescript(no-floating-promises)`, with the pinned
`oxlint` and `tsgolint`. It does not install a project tool and it does not search `PATH` for a binary. On a machine
that is not the qualified Linux x64 runtime the card records that and does not block approval. In this repository the
card cites `typecheck.yml` instead, and that citation does not block approval. A missing pin on Linux still does.

### Pinning a tier

- **Per request**: ask Maestro for the tier ("review this at Standard"). Maestro passes it with the review request.
- **Per project**: set the project's review tier (`review.tier`, in the board project settings) to `quick` or `standard`.

The order is: the request's tier, else the project pin, else the risk rule above.

## Languages and packs

The host picks the pack from the changed files. The reader does not choose the command.

A pinned pack is fetched and checked by hash. The licences that may be pinned are MIT, BSD, Apache-2.0, ISC and MPL.

GPL and AGPL tools are not bundled. If one is already installed, the host may run it. A missing one is recorded as `not run: <tool> absent` and does not block approval. `shellcheck` and `hadolint` are the examples.

A raw hit from a rule on probation is a candidate. It is not, by itself, a confirmed defect. The card keeps that label.

## The host routes, the model judges

Before `lucy` reads the change, Orchestra itself decides the review's shape from facts it can check: the profile, the
tier, the overlays that follow from changed paths, the languages, the reading passes, the analyzers, and how much each
Session may load and run. It writes these choices to the routing record. The same request on the same trees always
produces the same record.

The route recognizes .NET projects through `*.csproj`, `*.fsproj` and `*.vbproj`, and Swift packages through the exact filename `Package.swift`, including nested packages. These manifest names select the existing stack guidance even when only another file changes. Matching is case-sensitive. A solution file, a resolution record or a source file alone does not select either language; tool availability is recorded by each check.

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

Governed and PR review raw CODE, probe and history output stays in the review's OS-managed temporary analysis cache
after its Sessions and scratch copies close. Newly completed independent engagements additionally retain their
required CODE and analysis evidence in the durable receipt described above. History and executable verifier probes
remain unavailable in independent engagements.

A card states its limits; it never claims "no problems" for anything it did not look at.

- **Not examined** is a list under `coverage.notExamined`. Each entry names a file, reading pass, check or lane and the
  reason: out of scope, toolchain absent, time box, tier, `budget` (a Session reached its limit before it finished),
  or `not-built` (this release cannot do it yet). A finding that could not be proven within budget becomes a question
  marked `not verified: budget`.
- **Not read** is a count. Analyzer results are filtered before any model sees them: duplicates and issues already in
  the base are removed, and each reading pass gets only its top-ranked items. The rest are kept, and the card counts,
  per reading pass, how many no model read.

A long "not examined" list on an `APPROVE` is a reason to look closer, not a defect in the review. A catalog entry
for an analyzer is not proof that its adapter exists or that it ran. The host requires the PR card to repeat the
retained checks, including unavailable checks and their reasons, and validates any accepted exception against
host settings. Completeness of that check list does not establish that every file or capability was examined.
Inspect checks and coverage; the review never installs or downloads a missing tool.

## Advanced proofs

A built Deep review offers additional proofs for particular classes and languages. The verifier chooses an offered option and a structured target; the host fixes the executable and arguments. Each attempt runs in confined scratch space and retains its output. A missing target, tool, sandbox, or resource budget is `not-run` with a reason.

- JavaScript and TypeScript invariants can use a seeded integer property. The host tries fixed boundary values followed by a reproducible generated sequence and shrinks a failing value toward zero with a bounded budget. A pass covers that law and those generated cases.
- JavaScript and TypeScript atomicity candidates can use an explicit interleaving schedule. The same scenario and gates run twice on both base and head. The proof requires repeatable failure on base and success on head. This is separate from the Go race detector.
- Rust weak-oracle candidates can use an already installed cargo-mutants 27.1.0 on Linux x64. The host selects changed-line mutants, checks the baseline and runs offline with the existing lockfile. A surviving viable mutant fails the proof. An empty selection, all-unviable mutants, timeout or incomplete report cannot pass. The review never downloads this tool.

These adapters do not qualify other languages or native platforms. Formal and fuzz probes remain unavailable.

## Release candidate evidence

At the governed code stage, request profile `release` and supply `release.artifact`, a relative path in the opened project. Optional paths are `signature`, `provenance`, `updater`, `sbom` and `notes`. Signing policy is `signer: { publicKey, sha256 }`: a PEM public-key path and its lowercase SHA-256 SPKI DER fingerprint. Paths cannot traverse directories, dependencies or symlinks. The host reads candidate bytes once before selecting the review identity; changing any supplied bytes or policy produces a new identity. A release rereview requires a fresh release request with the proofs.

Capture requires atomic `O_NOFOLLOW` support. A host without it (including the current Windows runtime) refuses supplied files with `nofollow-unavailable`; the review records acquisition errors without reading their bytes.

The card always lists five checks and their retained evidence. Signing verifies a raw Ed25519 signature over candidate bytes under the caller's fingerprint policy. Provenance verifies a DSSE in-toto/SLSA v1 statement bound to the candidate hash. Updater checks the supplied electron-builder entry's literal filename and SHA-512 digest. SBOM checks only cryptographic co-signature of an attached Syft document and candidate hashes in that statement; it does not establish completeness or that Syft's source describes the candidate. Notes establish that nonempty text was supplied.

Absent evidence is `not-run`; a failed supplied proof or acquisition error blocks approval. The owner may explicitly accept unavailable proofs through the existing project setting. None of these checks certifies publisher identity, notarization, platform signing or a SLSA level. Behavioural evaluation remains not examined, reason `owner-permission`. Quick and Standard retain their existing lenses; Deep adds the release lens.

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
