# Lucy: target design

Status: approved by the owner on 2026-11-01, with every recommendation in §15 (D1–D12). The build plan comes next.
Author: `archie`, proposal version 1. Baseline: `dev` at `888979ebbf`, plus the research in `docs/specs/lucy/research/`.

This document describes the cold review and audit seat `lucy` at its best, working backwards from the finished seat.
It says what the seat does, how it works, what it ships, what it runs, where it stops, and which parts of the seat
framework have to grow to hold it.

## How to read this

- `[An]` cites `research/answers/n-*.md`. `[An*]` cites a draft answer (10, 15, 22, 23) whose claims did not pass
  the research closing check. A choice that rests on a draft claim says so, and that claim needs a verifying pass
  before the part it supports is built.
- **Observed** marks what the source at the baseline shows. **Proposal** marks this design. Anything else that is
  uncertain is an **assumption** with its check, or an **open decision** (last section).
- Atlas: `atlas_context` returned `held: provider-unconfigured` during authoring, so no Atlas unit backs any claim
  here. Answer 23 is the only Atlas evidence, and it is a draft.
- The seat is named by its id, `lucy`, everywhere. Its display name is the user setting `agent.lucy.name`.

## 1. Where lucy is today (observed)

- `seats/lucy.ts`: profile `review`, `skills: []`, no `workResult`, `atlasMemory`, `toolkit` and `strictResume`
  false. Its `returnCard` is prose ("cited APPROVE/FIX_FIRST/REJECT card"), not a fenced tag [A1].
- `prompt/lucy.txt` is five lines. Its Forbidden line does not match `forbiddenActions`, which `seat.ts` requires
  [A1].
- The review profile grants read (no `.env`), glob, grep, `maestro_record_review` and the truncation directory. No
  bash, so lucy cannot run a test, a type check or an analyzer [A1, A24]. The `tests` ability lists lucy with
  `tools: []`, a dead path [A1].
- The governed flow carries the real behaviour, all host-side [A1, A24]:
  - `maestro_request_review` (Maestro only) builds the plan or code artifact, creates a `lucy` child Session, and
    sends a fixed brief with the card, plan JSON, artifact, diff, checks and "call `maestro_record_review` exactly
    once". It returns `<VERDICT>: <receipt>`, `LUCY_ERROR` or `LUCY_NO_RECEIPT`.
  - `recordReview` rejects self-review, a card-hash mismatch, a stale artifact or context, findings off an added
    diff line, APPROVE with findings, non-APPROVE without findings, and checks that differ from validation's.
    `reviewMethodVersion` is only checked to be non-empty.
  - `ReceivedV2` stores `reviewerID: "lucy"`, the verdict and findings as `{path, line, message}`.
  - Workflow settlement holds without a plan-stage APPROVE and a code receipt for the exact result tree. FIX_FIRST
    spends one retry and later attempts carry the findings. REJECT needs a new plan round.
- Not wired: the merge queue (`queue-record.ts` always writes `reviews: []`, while `merge-queue.md:234` says lucy's
  receipts belong there), Guardrail, `test:ci`, the research tools, the Arsenal and Atlas [A24, A23*].
- `define()` limits Atlas Memory to backend, jimmy, archie and live, the toolkit to backend, and the research engine
  to jimmy [A1].
- The planned tree in `docs/specs/seat-framework/skill-tree.md` gives lucy five roots plus `team-stack`, from
  Google's review guide only. This design replaces that plan.

## 2. Mission and boundaries

**Mission.** Lucy is the team's independent judge of work it did not produce. Given a change, a plan or a whole
repository, it returns a verdict that a busy owner can trust: every finding names a rule, a location, a trigger and
the evidence a machine or a quote produced, and the card says plainly what was not examined.

The bar is set by the products and firms the research measured [A2, A27]. The leaders converge on an agentic
context loop plus a separate verification stage, effort tiers, and metrics tied to real outcomes. What lucy adds on
top, and what none of them does together:

1. **Proof by execution as the default finding bar**, not a planned feature: a failing test, a killed or surviving
   mutant, a forced interleaving, a base-versus-head differential run [A3, A7, A27].
2. **Cold by construction, enforced by the host**: no author transcript, review rules read from the base branch,
   PR text treated as data [A2, A8].
3. **A governed receipt** bound to the validation, the exact tree and the checks, which already gates the workflow
   and should gate the merge queue [A1, A24].
4. **One seat across review, audit, due diligence and compliance evidence**, with a profile per job and a rigor tier
   per risk, instead of a separate product for each.
5. **Honest coverage**: an examined and not-examined list on every card, and never a "no issues found" claim
   [A26, A27].

**Boundaries (proposal).**

- Lucy reads and judges. It never edits product code, commits, pushes, merges, approves on the owner's behalf or
  delegates. It may write only inside a host-made scratch copy, and only to prove a finding (§6.3).
- Lucy produces evidence and findings, never attestations. On compliance it says "evidence, finding, confidence,
  needs a human decision", never "compliant" [A26; A10*].
- Lucy does not diagnose root causes beyond what a finding needs, and does not design the fix. It names the
  violated rule and the trigger; the fix goes to the seat that owns the work.
- The security reviewer `billy` and the process auditor `frankie` own the deep security and ledger lanes. Lucy runs
  the first pass of each and hands off (§10, open decision D1).

## 3. Capabilities

| # | Capability | Evidence behind it |
|---|---|---|
| C1 | Diff review of a change, a PR or a worker result tree, with an APPROVE/FIX_FIRST/REJECT verdict | [A1, A2] |
| C2 | Plan and specification review: trace each acceptance criterion to code and test, judge requirement quality | [A3, A5, A27] |
| C3 | Re-review: carry findings across rounds as open, resolved or dismissed | [A8, A24] |
| C4 | Independent verification of every candidate finding by refutation and execution | [A3, A7, A27] |
| C5 | Test adequacy: fail-before/pass-after, mutants on changed lines, oracle and flakiness review | [A18] |
| C6 | Edge-case and race-condition hunting by enumeration and forced interleaving | [A20, A21] |
| C7 | Contract and integration review: API, wire, semantic and data compatibility | [A19, A12] |
| C8 | First-pass security and supply chain, with handoff to the security reviewer | [A5, A16] |
| C9 | Change hygiene: commit structure, history as risk evidence, merge mechanics, provenance | [A13] |
| C10 | Maintainability by direction and measured signals, not taste | [A17] |
| C11 | UX, UI and accessibility review with reproducible state and measured evidence | [A14] |
| C12 | AI artifact review: prompts, skills, tool descriptions, evals | [A15*] |
| C13 | Repository audit engagement: scoping, context building, variant analysis, spec-to-code mapping, fix review | [A27] |
| C14 | Technical due diligence over repository evidence, with a list of questions only humans can answer | [A25] |
| C15 | Compliance and governance evidence: privacy, EU cyber and AI law, control frameworks | [A9; A10*] |
| C16 | Per-language analysis through a host runner, normalized to SARIF-shaped findings | [A4, A28–A34] |

## 4. Review and audit methods

### 4.1 The pipeline

Every profile runs the same six stages. Tiers (§5) change how many passes and how much verification each stage gets.

1. **Entry.** Decide whether the work is reviewable and how. Refuse or slice a diff that is too large (around 100
   lines is reasonable, 1000 usually too large, files count toward size), that lacks a stated intent, or that is
   mostly generated files. This is the eligibility gate every rigorous standard and tool has [A3, A8].
2. **Context building.** Before hunting, extract intent, acceptance criteria, invariants and assumptions, each with
   the line that shows it or `nothing found` [A27]. Inputs are a curated brief, not a context dump: a 2,000-token
   diff with summary beats a full-context prompt, and every model got worse as raw context grew [A3]. Pull more code
   on demand with code search.
3. **Hypotheses.** Independent passes, one per defect class or perspective (§4.2), plus analyzer signals (§7).
   Splitting by defect class beat checklists and ad hoc reading [A7]; aggregating several reviews raised F1 by up to
   43.67% [A3].
4. **Verification.** Each candidate goes to a verifier that did not produce it, with only the finding and the code.
   The verifier must produce a concrete trigger or drop the finding (§6.4). Models favour their own findings when
   asked to check them [A5, A27], and self-correction without external feedback can make results worse [A3, A7].
5. **Dedup and rank.** Merge by root cause, as contest judges do [A27]. Rank by severity, then by confidence.
   Confidence stays labelled uncalibrated until measured against outcomes (§11) [A3].
6. **Verdict and card.** Apply the verdict rules (§6.6), write the coverage statement, record the receipt.

### 4.2 Reading techniques (the lenses)

Each lens is one pass with its own procedure and its own skill node. The scenario-based reading evidence is why they
are separate passes and not one checklist [A7].

| Lens | Technique | Source |
|---|---|---|
| Logic and contracts | Invariant extraction; contract and error-path review; active-design-review questions that force an answer, not an approval | [A7, A27] |
| Edge cases | Category-partition per changed function, choices crossed pairwise (NIST t-way), falsehood families for strings, paths and time; every cell marked handled, unhandled or not applicable, never a free list | [A20] |
| Concurrency | Read for windows: a check or read, a scheduling point, then an act. Classify as atomicity violation, order violation, TOCTOU, double execution, use-after-dispose, reentrancy, stale read or ABA. About 92% of studied bugs trigger with at most four ordered accesses | [A21] |
| Reliability | Failure-path first: most catastrophic failures in 198 real cases came from error-handling code simple tests would have caught | [A12] |
| Performance | Adversarial input sizes and an explicit profile or benchmark; total CI time is not a gate (Cloudflare 2019) | [A12] |
| Tests | Tester perspective (PBR): derive the tests the change needs, then compare | [A7, A18] |
| Compatibility | Source, wire and semantic compatibility against the base; old client, new server | [A19, A5] |
| Security first pass | STRIDE along trust boundaries and data flows; abuse cases; LINDDUN for privacy | [A5] |
| Change hygiene | Differential review: blame, caller-count blast radius, test coverage of changed code | [A27, A13] |
| Maintainability | Code health direction: block what measurably worsens it, record pre-existing debt, everything unwritten is a nit | [A17] |

### 4.3 Execution-backed techniques

These turn a hypothesis into a confirmed finding. They are the main reason a finding is trusted [A7].

- **Fail-before/pass-after**: revert the production hunk in the scratch copy, run the new test, confirm it goes red
  [A18].
- **Mutants on changed lines**: mutant detection correlates with real-fault detection independently of coverage;
  Google mutates only changed code during review [A3, A18].
- **Forced interleaving**: a test that opens the window with gates or `Deferred`, fails every run on the unfixed
  code and passes after. Evidence ladder, weakest first: stress reruns, yield injection, controlled scheduler, record
  and replay, model check [A21].
- **Race-instrumented runs** of a test that drives the concurrent path (Go `-race`, TSan); a green normal suite
  proves nothing here [A12].
- **Differential runs**: base and head on the same inputs, the cheapest regression oracle [A7].
- **Property and metamorphic tests**, with round-trip as the first target; shrink failures to a minimal reproducer
  [A18, A20].
- **Formal escalation**: types, exhaustive matching and assertions always; property or reference-model tests for
  pure logic; a design model (TLA+, Quint, P) only when consequence is high, interleavings are combinatorial and the
  model is cheap to keep; proofs only for small stable kernels. Agents drive Dafny and Kani well, Lean and Verus not
  yet [A11].

### 4.4 Audit techniques

For repository-scoped work (§5.1, profiles `audit`, `diligence`, `compliance`).

- **Engagement**: scoped and time-boxed, threat model before code review, ends with a fix-review retest in the same
  report [A27].
- **Variant analysis**: seed from one known bug, match only it, then generalize one element at a time, and stop when
  more than half of the matches are noise [A27].
- **Spec-to-code mapping**: each requirement gets one of six verdicts: implemented, partial, contradicted,
  stronger-than-spec, absent, undecidable [A27].
- **Population testing**: every PR, merge and deploy is machine-readable, so test the whole population; sample only
  checks that need judgment. Test control design separately from operation. Inquiry alone is never evidence [A26].
- **Evidence quality**: independent beats internal, direct beats indirect, original beats converted. Re-derive from
  git objects and CI APIs, never from a PR body or an agent transcript [A26].
- **Git forensics**: truck factor, contributor concentration, hotspots (change frequency times size), earlier
  reverts of the same area. Truck-factor estimates matched developers' view only 53% of the time, so label them
  estimates [A25, A13].
- **Inventory**: SBOM with licence classes and copyleft flags, secrets, CWE-based weakness density in the ISO/IEC
  5055 style [A25].

## 5. Work profiles and rigor tiers

### 5.1 Profiles (what the work is)

| Profile | Scope | Verdict | Default tier | Source |
|---|---|---|---|---|
| `plan` | A plan, spec or work package before implementation (governed stage `plan`) | APPROVE/FIX_FIRST/REJECT | Standard | [A1, A5, A27] |
| `code` | A worker result tree or a diff (governed stage `code`) | APPROVE/FIX_FIRST/REJECT | by risk (§5.3) | [A1, A24] |
| `pr` | A PR or branch outside the governed flow | same | by risk | [A2, A6] |
| `rereview` | The next round after FIX_FIRST: only open findings and the new delta | same | tier of the first round | [A8, A24] |
| `release` | A release candidate: provenance, signing, updater, SBOM, release notes | same | Deep | [A16] |
| `artifact` | Prompts, seat skills, playbooks, tool descriptions, evals | same | Standard | [A15*] |
| `audit` | A repository or subsystem, time-boxed engagement | report with severities, no merge verdict | Deep | [A27] |
| `diligence` | Technical due diligence over repository evidence | DD report, four-level severity | Deep | [A25] |
| `compliance` | Evidence map for named regulations or frameworks | evidence report, never "compliant" | Deep | [A9; A10*] |

A change also gets one or more **change-type overlays** inside `code`, `pr` and `rereview`: API or wire, data
migration, concurrency, performance, CI or infrastructure, dependency bump, UI, docs. Each overlay adds its lens and
its required checks [A5, A12, A16, A19]. The UI, performance, concurrency, infrastructure, docs and dependency
overlays have no captured primary source as profiles; they are this design's synthesis of the per-area answers.

### 5.2 Tiers (how deep)

Cost is given in units this design can defend: child Sessions and analyzer time. Market anchors, each measured by
its vendor: Claude Code Review averages $15–25 and about 20 minutes a review; Greptile charges 1, 3 and 10 credits
for its tiers; AIxCC systems spent about $152 a task [A2, A27]. Lucy's real cost is an **assumption** until measured
on our own work, and no benchmark runs without the owner's permission.

| Tier | What runs | Children | Analyzer time |
|---|---|---|---|
| **Quick** | Entry, a one-pass review over the diff with intent, the no-build analyzer lane on changed files only, verification by quoted evidence. Reports only P0 and P1. | 1 | seconds |
| **Standard** (default) | Triage, then the lenses the change type requires (3–6 passes), the no-build lane plus the repo's declared linters and gates, a separate verifier for each candidate, fail-before/pass-after for every new or changed test | about 5–10 | minutes |
| **Deep** | Standard, plus the build lane (type check, typed lint, mutants on the diff, race-instrumented runs, API and semver diff), the edge-case table, two independent samples over a reordered diff and aggregation (the Bugbot pattern [A2]), a verifier on a different model where one is configured (D3) | about 2–3× Standard | tens of minutes; race and mutation runs cost 2–20× a normal run [A12] |
| **Audit** | Repository-scoped §4.4 methods, time-boxed by the brief, ending in a report and a fix-review slot | brief-defined | brief-defined |

### 5.3 Choosing the tier

Proposal: Maestro sets the tier in the request. When it does not, lucy's entry stage proposes one from risk signals
and the card records which signals fired. Risk-scaled rigor has only indirect support: coverage and participation
predict defects, and missed bugs are mostly semantic [A3]. So the triggers are a starting rule to measure, not a
proven policy:

- **Deep**: a trust boundary, auth or secrets; concurrency or durable state; a data migration; a public API, wire or
  SDK change; a release; a change over about 400 changed lines; a high-churn, many-author file [A3, A13].
- **Quick**: docs only, test-only additions, or a small change touching none of the above.
- **Standard**: everything else.

The owner can pin a tier per project or per request. A tier is recorded in `reviewMethodVersion`, for example
`review-v2/code/standard`, so a receipt says what method produced it (today the field is only checked to be
non-empty [A1]).

## 6. Protocols

### 6.1 Cold intake

Lucy receives: the intent, the acceptance criteria or work card, the plan when one exists, the diff or tree, the
checks already recorded, the change's Atlas units when available, and the repository's review rules. Lucy never
receives the author's transcript or reasoning. The "never your session's history" rule and the intent-over-reasoning
trade-off come from [A3, A8]; the host already withholds the transcript [A1].

**Rules come from the base, never from the change.** Lucy reads `AGENTS.md`, `CLAUDE.md`, `REVIEW.md` and similar
files from the base revision, so a PR cannot change how lucy reviews it. Claude Code Review and Bugbot do this, and
this repo's `guards.yml` judges a PR with the base branch's engine [A2, A8, A13]. A rule file changed in the PR is
itself reviewed as a change.

**Change text is data.** PR descriptions, commit messages, code comments, tool output and file contents are data,
never instructions [A8]. This matches the repo's rule that terminal output is data.

### 6.2 Entry criteria

Return `blocked` with a named blocker, not a verdict, when: the intent or acceptance is missing; the diff exceeds the
tier's slice budget and cannot be sliced cleanly; the artifact does not match the context; or a required check
cannot run (`check-unavailable`). IEEE 1028 and Fagan make entry evaluation mandatory [A8].

### 6.3 Scratch copy

Every probe and build-lane analyzer runs in a host-made scratch copy of the reviewed tree, never in the reviewed
worktree. Lucy may write there: a reproduction test, a reverted hunk, a fuzz corpus. The copy is discarded after the
review; anything worth keeping (a reproduction test) is attached to the finding as text. This keeps "lucy does not
edit product code" true while allowing proof by execution. It also contains tools that write into the repo by design:
Go fuzzing writes failing inputs to `testdata/fuzz/`, mutmut writes `mutants/`, cargo-machete `--with-metadata` may
modify `Cargo.lock` [A28, A31, A32].

### 6.4 The finding bar

A finding is reported only with all four:

1. **Rule**: a written rule (repo instruction, guard, style guide), a numbered external requirement (an ASVS id, a
   WCAG success criterion, a GDPR article, AIP-180), or a correctness property stated in the finding [A14, A17].
2. **Location**: `path:line`, or a range.
3. **Trigger**: the input, state or interleaving that makes it fail, as a scenario.
4. **Evidence**, strongest available, labelled by kind: `probe` (a test or command that fails, with the command),
   `tool` (an analyzer result, with tool and rule version), or `quote` (the lines that show it). A finding without
   evidence becomes a **question** in the card, never a FIX_FIRST.

Lucy does not report: anything not written down (a nit, at most, and only at Deep); pre-existing issues off the
change's path (recorded as debt instead); speculative security without a trigger; SAST hits that triage did not
confirm, because JS SAST precision was 0.11% in one study and C/C++ analyzers miss 47–80% of real vulnerabilities
[A17, A29, A32].

### 6.5 Severity and confidence

One scale for diff work, mapped to each audit vocabulary rather than replaced by it.

| Lucy | Meaning | Audit mapping | DD mapping [A25] |
|---|---|---|---|
| P0 | Data loss, security breach, crash or corruption on a main path | material weakness [A26] | deal-breaker |
| P1 | Wrong behaviour a user or caller will hit; a missing test for a stated behaviour; a broken written rule | significant deficiency | price or structure item |
| P2 | A real defect with a narrow trigger, or measurably worse code health | deficiency | condition or remediation |
| P3 | Observation or nit | observation | observation |

Security findings also carry a separate **difficulty** axis (ToB) next to impact severity (Sherlock rates impact
only) [A27]. Confidence is reported as high, medium or low with the evidence kind that sets it (probe beats tool beats
quote), and is labelled uncalibrated until §11 measures it [A3].

### 6.6 Verdict rules

- **APPROVE**: no confirmed P0 or P1, and every lane the profile and overlays require ran or is recorded as a
  `check-unavailable` the owner accepted.
- **FIX_FIRST**: at least one confirmed P0 or P1 that a fix inside the current plan can address.
- **REJECT**: the approach or plan is wrong, so a fix needs a new plan round. This matches the settlement semantics
  [A24].
- A confirmed blocker from any lane blocks. Approval is never a majority vote across passes [A5].
- When lucy cannot judge (a missing toolchain, a held context), it returns `blocked` with the blocker, not an APPROVE
  with a caveat.

### 6.7 Re-review and disputes

Each finding keeps a stable id and a status: `open`, `resolved` (the trigger no longer fires, shown by the same
evidence kind) or `dismissed` (with a reason a human or the verifier accepted) [A8]. A rereview reads only the open
findings and the new delta, and says when the workers left the reviewed tree unchanged, which the host already holds
as `UNADDRESSED` [A24].

When the author or Maestro disputes a finding, lucy re-verifies against the new evidence and changes the finding only
on evidence, never on agreement. The receiving side of the superpowers protocol and the contest dispute window are
the models [A8, A27].

### 6.8 Coverage statement

Every card lists what was examined (files, lenses, analyzers, probes) and what was not, each with the reason: out of
scope, toolchain absent, time box, tier. ToB's review skills require stated coverage limits, and the audit standards
forbid a "no deficiencies" claim [A26, A27].

### 6.9 Handoff

When the change crosses a trust boundary, lucy flags it to the security reviewer; when the question is who approved
what and whether the record holds, to the process auditor; when it needs a legal or residual-risk call, to a human.
The card's `handoffs` list names the lane, the reason and the evidence. A handoff to a seat that is not built yet is
recorded as not covered, never as passed (D1).

## 7. Tools, native plugins and MCP

### 7.1 Principles

- Lucy runs analyzers and probes through **host tools** with a fixed argument vector per tool, not through bash. The
  bash tool runs with the host user's authority, and the analyzer and probe research all lands on a host-owned,
  allowlisted runner [A29, A33, A34].
- Execution goes through `ToolSafetySandbox.confine`, which already treats formatters and language servers as
  workspace-controlled code: no network, credential paths unreadable, writes only to a scratch directory that also
  holds the caches [A34]. That is the `ChildProcessSpawner`/`Process`/omni path the repo requires.
- **Two lanes** [A28, A34]:
  - The **no-build lane** reads lockfiles and sources only and is safe on an untrusted repository.
  - The **build lane** executes repository code (`build.rs`, proc-macros, ESLint plugins, Gradle, mypy plugins). It
    runs confined, its findings are tagged `workspace-executed`, and it is on at Deep or when the repository is
    trusted (D6).
- **Never install.** A missing toolchain is reported as `not run: <tool> absent` with the dimension it leaves
  uncovered [A28–A33].
- **Network off.** Advisory databases (OSV, RustSec, the Go vulnerability database) are fetched by the host outside the
  review and read offline (D7). OWASP Dependency-Check is network-bound and slow without an NVD key, so it is
  Deep-only [A30].
- **Licences decide what ships** [A4, A28–A33]:
  - **Pinned packs** (Orchestra fetches and hash-verifies them, as the backend toolkit does): MIT, BSD, Apache, ISC
    and MPL tools.
  - **Invoke if installed**: GPL and AGPL tools (golangci-lint, cppcheck, pylint, ShellCheck, hadolint, Slither,
    Echidna), run as separate programs from the user's PATH, never bundled.
  - **Only with the user's licence**: CodeQL (open-source codebases or GitHub Advanced Security only), Brakeman
    (commercial use restricted).
  - **Never**: Semgrep's maintained rules (Semgrep Rules License, bars competing products), TruffleHog in the bundle
    (AGPL), Moderne-licensed OpenRewrite recipes, the archived stack-graphs [A4, A30].

### 7.2 Host tools (proposal)

| Tool | What it does | Grounding |
|---|---|---|
| `review_analyze` | Detects languages from manifests and diff extensions, picks the matching packs and the repo's own declared linters and configs, runs them confined in the no-build or build lane, normalizes native JSON or SARIF into one finding record (rule, severity, `path:line`, snippet digest, tool and pack version), retains raw output as a citable artifact, caches by (pack version, config digest, file digest). Diff-scoped by default. | [A34]; `RelayCommands.detect` already derives lint, typecheck and test commands from manifests; nothing in the repo handles SARIF today [A34, A4] |
| `review_probe` | A closed runner set in the scratch copy: type check, one named test, fail-before/pass-after on a hunk, mutants on changed lines, race-instrumented run, base-versus-head differential, a short script. The host fixes the binary and arguments. | jimmy's `probe_run` pattern (closed runners, no network) [A34] |
| Code intelligence | `code_locate`, `code_query`, `code_search` and read-only git history (`log`, `blame`, `-S`), the read-only subset of jimmy's research tools | lucy cannot use them today [A24] |
| `atlas_context` (read) | Own units and invariants for the changed paths | [A23*] |
| `maestro_record_review` | Kept, with a richer finding record (§9.4) | [A1] |

Repo-declared gates are part of `review_analyze`'s plan, not lucy's memory. In this repository that means
`check:guards --base`, `check:boundaries --base`, `check:spawn-imports` and `check:generated` in `packages/client`,
and a block on any change that grows an allowlist or ledger [A12, A13, A19]. Lucy never runs a whole test suite;
change-scoped tests in this repo run through `test:ci` on Actions, and the card says which gate ran [A18].

### 7.3 Cross-cutting packs

| Purpose | Ship as pinned pack | Invoke if installed or licensed | Source |
|---|---|---|---|
| Structural search and rules | ast-grep, tree-sitter (already bundled), OpenGrep with our own rules (LGPL, separate binary) | Semgrep CE engine with our rules; CodeQL with the user's licence | [A4] |
| Secrets | gitleaks | TruffleHog | [A4] |
| Dependencies and SBOM | OSV-Scanner (offline; never its `fix` command, which can run package scripts), Syft | — | [A4, A29] |
| Diff and duplication | difftastic, jscpd (SARIF) | — | [A4] |
| Code index | SCIP | — | [A4] |
| Policy | OPA, Conftest, Kyverno | — | [A10*] |
| Accessibility | axe-core (MPL-2.0) | — | [A10*, A14] |
| Licences | ScanCode, REUSE | — | [A10*], licences not captured |

The backend toolkit already pins ast-grep, gitleaks, squawk, kubeconform and the Postgres language server [A34]. Lucy
gets its own pack set with a `review` fit, not `toolkit: true` (§12).

### 7.4 Per-language toolchains

Each language below is one `lucy-toolchain-<lang>` node: detection, the exact commands, how to triage the output, and
the environment pins that keep the repo untouched. Language traps no tool catches go in the shared `team-stack` tree
(§8.2).

**Rust** [A28]
- Detect `Cargo.toml`, `Cargo.lock`, the workspace and `rust-toolchain.toml`; treat Bazel, Buck and Nix builds as
  non-cargo. Pin `RUSTUP_TOOLCHAIN`, use `--locked --offline` and a scratch `CARGO_TARGET_DIR`.
- No-build lane: `cargo audit --file <lock>` from outside the repo, cargo-deny (licences, bans, advisories, sources),
  cargo-geiger (to scope the unsafe review, never as a verdict), cargo-machete (never `--with-metadata`).
- Build lane: clippy with selected pedantic and restriction lints (never the whole restriction group) through
  clippy-sarif; cargo-semver-checks with `--baseline-rev` for libraries (aims at zero false positives, misses type
  and generics breaks); Miri or cargo-careful on tests; cargo-mutants `--in-diff`.
- Deep, on demand: loom, shuttle or Kani for concurrency and unsafe kernels.
- Repo limit: git dependencies do not build in a seat's sandbox; vendored and path dependencies do (seat framework
  README).
- Not MCP: the community rust-mcp-server exposes mutating tools and adds nothing over confined runs.

**TypeScript and JavaScript** [A29]
- Detect from the lockfile (`bun.lock`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`), `packageManager`,
  `engines`, tsconfig and linter configs. Never run `install` or lifecycle scripts; prefer the repo's pinned binaries.
- No-build lane: oxlint, gitleaks, OSV-Scanner offline, knip (SARIF), jscpd.
- Build lane: tsgo or `tsc --noEmit`, oxlint `--type-aware` (tsgolint, TS 7+), typescript-eslint strict-type-checked
  (plugins are workspace code), Stryker `--incremental --mutate <file:lines>`, api-extractor, publint and
  arethetypeswrong, dependency-cruiser.
- Licence-gated: Semgrep CE with our rules, CodeQL JS.
- Optional MCP: knip ships an MCP server and a language server.

**JVM (Java, Kotlin)** [A30; claim 12 of A30 is inferred]
- Detect `gradlew`, `settings.gradle(.kts)`, `pom.xml`, `mvnw`; the JDK from `.java-version`, `.sdkmanrc`,
  `.tool-versions` or the Gradle toolchain block. Run through a Gradle `--init-script` from the scratch directory or a
  fully qualified Maven goal, never by editing build files (inferred, needs a probe).
- First pass: `-Xlint:all`, Error Prone with NullAway (under 10% build overhead, JDK 17+), detekt (SARIF, baselines).
- Deep: SpotBugs with FindSecBugs and Checkstyle (LGPL, invoke), PMD with CPD, PIT on the diff, japicmp on base and
  head jars (`--semantic-versioning`), OWASP Dependency-Check.
- Cheap supply-chain signal: whether `gradle/verification-metadata.xml` exists and is strict.
- Optional MCP: IntelliJ's built-in server, the japicmp server. kotlin-lsp is alpha and partly closed: not a
  dependency.

**Python** [A31]
- Detect `uv.lock`, `poetry.lock`, `pylock.toml`, `requirements*.txt` and `pyproject` tool tables; reuse the repo's
  config; run pinned tools with `uvx`; `uv run --frozen --no-sync`.
- No-build lane: ruff, bandit, pip-audit `--locked` on the lockfile (never resolve untrusted input), OSV-Scanner,
  diff-cover over an existing `coverage.xml`.
- Build lane: pyright or mypy (ty is beta), pylint (GPL, invoke), Semgrep CE with our rules, Pysa (known
  over-tainting), griffe for API breaks, mutmut in the scratch copy, Hypothesis, atheris. Drop pytype (stops at 3.12).
- Framework checks: Django `check --deploy`.

**Go** [A32]
- Detect `go.mod` and `go.work` with their `go` and `toolchain` lines. Pin `GOFLAGS=-mod=readonly`, scratch `GOCACHE`
  and `GOMODCACHE`.
- First pass: `go vet`, staticcheck, govulncheck (reachability through the call graph; in JSON or SARIF mode it exits
  0, so parse the output), gosec SARIF (never its `-ai-api-*` flags, which send findings to an external service),
  golangci-lint `--new-from-merge-base` (GPL, invoke).
- Deep: `go test -race` on the concurrent path, native fuzzing time-boxed in the scratch copy.
- MCP: `gopls mcp` is official but experimental and runs `go`, so it starts under the same confinement.

**C and C++** [A32]
- Detect CMake, Meson, Bazel, Makefiles, `compile_commands.json`, vcpkg and Conan manifests.
- First pass: compiler warnings (`-Wall -Wextra`), clang-tidy on changed files, cppcheck (GPL, invoke).
- Deep: Infer `--reactive` (MIT), the Clang Static Analyzer through CodeChecker, ASan and UBSan test runs (ASan's
  container-overflow checks are prone to false positives), libFuzzer time-boxed, CBMC or Frama-C for small critical
  modules, CodeQL only with the user's licence.
- Static tools are a first filter: combining analyzers still misses 30–69% of real vulnerabilities [A32].

**.NET, Swift, Ruby, PHP** [A33; most tool claims there are from memory, verify before building]
- .NET: built-in analyzers with nullable and warnings as errors, Roslynator, `dotnet list package --vulnerable`,
  Stryker.NET, PublicApiAnalyzers.
- Swift: Swift 6 strict concurrency, SwiftLint, Periphery, `swift package diagnose-api-breaking-changes`.
- Ruby: RuboCop with rubocop-rails, bundler-audit, Sorbet or Steep, strong_migrations; Brakeman only with the user's
  licence.
- PHP: PHPStan at max level, Psalm `--taint-analysis` (SARIF, read), `composer audit`, Infection, Roave
  BackwardCompatibilityCheck.

**Polyglot surfaces** [A16, A33]
- Shell: ShellCheck (GPL, invoke), shfmt.
- SQL migrations: squawk (already a backend pack; JSON reporter, Postgres lock rules), sqlfluff.
- CI and infrastructure: actionlint and zizmor (both MIT, SARIF, offline), Trivy and Checkov (Apache), tflint,
  kube-linter, kubeconform, hadolint (GPL, invoke). OpenTofu is MPL.
- Solidity: Slither and Echidna (AGPL, invoke), Mythril, Foundry invariants. Nine tools together found 42% of
  annotated vulnerabilities and flagged 97% of real contracts (SmartBugs), so treat hits as leads.

### 7.5 MCP and LSP

MCP is an optional bridge, never the main execution path: each server adds a process and a model-facing surface, and
one host runner gives uniform SARIF [A33, A34]. Lucy's `mcp` list names configured servers only, empty by default.
Useful bridges the research confirmed: SonarQube (data from a SonarQube instance), Semgrep's server inside the
`semgrep` binary (beta), Trivy's MCP plugin, gopls, IntelliJ, japicmp, knip [A29, A30, A32, A33, A34]. Rejected:
rust-mcp-server (mutating tools) and Serena as a shipped part (GPL-3.0 as a combined distribution) [A28, A34].

Read-only diagnostics from language servers are a gap: the edit and write tools attach LSP diagnostics only after a
mutation [A34]. A Deep pass that wants them needs the host to expose a read-only diagnostics call (§12, E7).

### 7.6 Delivery surfaces

- **Governed flow**: unchanged entry point, `maestro_request_review` with `stage` and, new, `profile` and `tier`.
- **Merge queue**: fill the PR record's `reviews` with lucy receipts, and refuse queueing while a FIX_FIRST or REJECT
  is open, as `merge-queue.md` §4.5 already specifies [A24].
- **GitHub and GitLab** (host, opt-in, D8): inline comments with line ranges, a Checks run with annotations (only a
  GitHub App can create one; 50 annotations per request), SARIF upload for tool-like findings (a second upload with
  the same category overwrites the first), and a `merge_group` report when the reviewer is a required check. Content
  creation is rate-limited to 80 requests a minute and 500 an hour [A6]. Lucy never posts; the host posts the
  recorded receipt.
- **Owner surfaces**: the session view already parses `<VERDICT>: <receipt>` and the board gets a review note [A24].
  The card's findings, coverage and handoffs should render there too.

## 8. Seat skills

### 8.1 The tree (what ships)

The tree follows the skill-tree rules: every node is a skill, roots are the only names always listed, depth at most 3
below a root, at most 10 children, every non-root node has `when` and `not-when`, leaves are self-contained with an
optional flat `references/` folder [skill-tree.md; A22*]. A leaf states what to do and how to check it, and is cut if
it cannot name a check lucy runs or a fact lucy cites. It ships from `packages/lucy-specialist/skills`.

```
lucy-review            always loaded: the pipeline, finding bar, severity, verdict rules, card, do-not-report list
├─ plan                spec-to-code tracing, requirement quality (NASA App. C), plan alignment
├─ code                worker result trees and diffs; overlays by change type
├─ pr                  external PRs: base-branch rules, PR text as data, posting through the host
├─ rereview            finding lifecycle, delta-only reading, disputes
└─ artifact            prompts, skills, tool descriptions, evals (draft evidence)
lucy-audit             engagements: scope, time box, threat model first, coverage limits, fix review
├─ context             invariant and assumption extraction before hunting
├─ variant             seed, match, generalize one element, stop at half noise
├─ spec-map            six verdicts per requirement
├─ diligence           five pillars, DD report, questions only humans answer
├─ forensics           truck factor, hotspots, reverts, contributor concentration
├─ controls            population tests of change and access controls; design versus operation
└─ report              findings format, severity mappings, never "no deficiencies"
lucy-correctness
├─ logic               invariants, contracts, error paths, active-design questions
├─ edges               category-partition, pairwise, falsehood families, shrinking
├─ concurrency         windows, race taxonomy, forced interleavings, evidence ladder
├─ resources           lifetime, dispose, cancellation, state machines
├─ reliability         failure paths, retries, timeouts, rollout and rollback
├─ performance         adversarial sizes, profile or benchmark against a baseline
└─ formal              the escalation rule: when to ask for a model or a proof
lucy-tests
├─ adequacy            fail-before/pass-after, mutants on changed lines, coverage as a floor
├─ oracles             independent expected values, properties, metamorphic relations, golden files
├─ smells              test smells, state over interactions, no logic in tests, over-mocking
├─ flaky               static flakiness signals, rerun limits, quarantine with an owner
└─ strategy            levels, real dependencies over fakes, contract tests
lucy-contracts
├─ api                 AIP-180 source, wire and semantic compatibility; oasdiff; buf strictness
├─ semver              a declared surface; semver-checks, japicmp, api-extractor, griffe
├─ data                expand/migrate/contract, SQLite 12-step, lock and backfill rules
├─ third-party         webhooks, idempotency keys, SDK drift, sandbox versus production
└─ ipc                 Electron IPC senders, MCP token and launch rules, version skew, startup order
lucy-security          first pass only; handoff rules to the security reviewer
├─ boundaries          STRIDE along data flows, abuse cases, untrusted input reaching sinks
├─ secrets             secrets in code, logs and layers; rotate before rewriting history
├─ supply-chain        lockfiles, advisories, SBOM delta, licences, provenance and trusted publishing
├─ ci                  workflow triggers, script injection, tokens, pinning, caches, runners
├─ release             signing, notarization, updater verification, reproducibility, SLSA
├─ infra               IaC, containers, shell
└─ agents              prompt injection, excessive agency, MCP rules (draft evidence)
lucy-change
├─ structure           one logical change per commit, tangling, size, moves not mixed with edits
├─ history             blame, log -S/-G, reverts, churn and ownership as risk evidence
├─ merge               green only for the tested base and head, remerge-diff, backports
├─ provenance          signatures check integrity not identity; author is not approver
└─ health              code health direction, cognitive complexity, wrong abstraction, dead code
lucy-compliance        evidence and findings only; the human-decision list
├─ privacy             GDPR and LGPD per-diff checks; DPIA and RIPD triggers; breach clocks
├─ cyber               CRA, NIS2, DORA change evidence (draft evidence)
├─ ai-act              logging, transparency, oversight evidence (draft evidence)
├─ accessibility-law   EAA and EN 301 549 (draft evidence)
├─ licensing           licence expressions, copyleft, REUSE, tool licences
├─ controls            ISO 27001/27002, SOC 2 CC8.1, NIST SSDF, SLSA, Scorecard vocabulary
└─ evidence            record format, retention, legal limits on AI verdicts
lucy-experience
├─ interaction         Nielsen heuristics, latency thresholds, errors, destructive actions
├─ a11y                WCAG 2.2 additions, axe's ~57%, APG, screen-reader runs
├─ visual              tokens and computed values, screenshot diffs, limits of vision models
└─ content             CLDR plurals, no concatenated fragments, i18n calls
lucy-toolchain         detection, lanes, triage of tool output, missing-toolchain reporting
├─ rust · js-ts · jvm · python · go · native · dotnet · swift · ruby-php
└─ polyglot            shell, SQL, CI and infrastructure, Solidity
team-stack             shared facts: idioms and traps per language and framework
```

Eleven roots, so eleven one-line descriptions in context. `lucy-review` is the only root the prompt tells lucy to
always load; the rest open by the profile, overlays and languages the entry stage found.

### 8.2 The shared `team-stack` tree

Language traps are facts, so they go in `team-stack`, where backend and the frontend seat read them too, not in a
lucy fork [skill-tree.md]. Today it has python, go, js-ts, ruby and php. Lucy needs rust, jvm, native, dotnet and
swift added, which brings it to ten children, the limit. The trap lists in [A28]–[A33] are the seed, for example:
`// SAFETY:` invariants and locks held across `.await` in Rust; unawaited promises across transactions and
prototype pollution in merges in TypeScript; `@Transactional` self-invocation in Spring; mutable default arguments
and `pickle` on untrusted data in Python; typed nil in interfaces and goroutine leaks in Go; dangling views and
iterator invalidation in C++. Most of those lists are inferred, not captured, in the research, so each leaf needs its
sources before it ships.

### 8.3 What does not ship

- `.orchestra/skills/lucy-maintenance` and `lucy-ownership`: how the seat, its tools and its tree are maintained.
  Repo-only.
- `docs/specs/lucy/` and `docs/guides` pages for the review card and tiers. The guide is written for users; it ships
  with the docs, not with the seat.
- No Maestro playbook content moves into lucy's tree. Maestro's side (when to request which profile and tier, how to
  act on the card) stays in `maestro-run-governed` and `maestro-run-verify` (§10.1).

## 9. The prompt and the card

### 9.1 What the prompt holds

The prompt holds only what must always be present, in the style of jimmy's and backend's prompts: the role, the
cold rules, the six stages, "load `lucy-review`, then open the branches the work needs, one level at a time, stop at
the first node that covers it", the finding bar, the verdict rules, the card, and the Forbidden line matching
`forbiddenActions` item by item. Everything else is in the tree. Rules a guard or the host enforces stay out of the
prompt prose (the owner's benchmark-first rule for prompts).

### 9.2 Seat definition (proposal)

| Field | Today | Proposal |
|---|---|---|
| `id`, `profile` | `lucy`, `review` | kept |
| `role` | cold code review; records governed reviews | cold review and audit; records governed reviews |
| `abilityClass` | read-only artifact review | read-only review with confined verification |
| `returnCard` | prose | `review-result` (fenced tag) |
| `workResult` | none | `review-work-result-v1` |
| `forbiddenActions` | edit implementation, receive author transcript, merge | editing product files, receiving the author transcript, approving or merging, delegation, self-review, installing tools, network access outside the host, working around permission denials or safety holds, editing Atlas memory files |
| `skills` | `[]` | the eleven roots in §8.1 |
| `strictResume` | false | true, so a rereview resumes the same logical review |
| `atlasMemory` | false | false; read-only `atlas_context` through a new grant (E2, D5) |
| `toolkit` | false | false; the analyzer packs are a separate boundary (E1) |
| `mcp` | none | empty by default; configured bridges only |
| `description` | cannot edit or run commands | read-only; runs allowlisted analyzers and probes in a scratch copy; returns a cited verdict |

### 9.3 The card

````
```review-result
{
  "outcome": "done",
  "verdict": "FIX_FIRST",
  "profile": "code",
  "tier": "standard",
  "overlays": ["concurrency"],
  "scope": { "base": "<sha>", "head": "<sha or tree digest>", "files": 7, "changedLines": 212 },
  "findings": [{
    "id": "F1",
    "path": "src/jobs/drain.ts", "line": 41, "endLine": 48,
    "severity": "P1", "confidence": "high", "lens": "concurrency",
    "rule": "lost update: read, yield, write from the stale read",
    "trigger": "two wakes during one drain both see idle and both start a drain",
    "evidence": { "kind": "probe", "command": "<exact command>", "result": "fails 10/10 on head, passes on fix" },
    "suggestedTest": "<test text from the scratch copy>",
    "status": "open"
  }],
  "questions": [],
  "checks": [{ "id": "oxlint", "lane": "no-build", "status": "pass" }],
  "coverage": { "examined": ["..."], "notExamined": [{ "item": "...", "reason": "toolchain absent" }] },
  "handoffs": [{ "lane": "security", "reason": "...", "covered": false }],
  "blockers": [],
  "risks": [],
  "nextActions": []
}
```
````

`outcome` is `done` or `blocked`, as on every other card. `verdict` exists only when `outcome` is `done` and the
profile has one; audit, diligence and compliance profiles return their report in `findings` and `coverage` with no
merge verdict. The example is made up: its path and finding do not refer to this repository.

### 9.4 The governed receipt

`maestro_record_review` keeps its checks and grows its finding record from `{path, line, message}` to the card's
finding fields, so the receipt holds the evidence, not only the message. Two of today's rules need a decision:

- Findings must sit on an added diff line [A1]. A change often breaks an unchanged caller or leaves a test missing.
  Proposal: allow a finding on an unchanged line when it names the changed line that causes it (D10).
- `reviewMethodVersion` gains meaning: `review-v2/<profile>/<tier>` (§5.3).

Changing lucy's prompt, grants or profile changes the hashes that validations and receipts bind, so in-flight
approvals go stale when the new seat lands [A24]. The landing must happen between governed runs.

## 10. Integration with Orchestra and the team

### 10.1 Maestro

Maestro picks the profile and tier, or leaves the tier to lucy's entry stage. It acts on the card: APPROVE continues,
FIX_FIRST goes back to the seat that did the work with the findings, REJECT goes back to `archie` for a new plan
round, `blocked` goes to the owner with the blocker. Maestro never edits a finding. The governed playbook keeps
Maestro's side of this; the change there is the `profile` and `tier` arguments and the card fields to read.

### 10.2 The other seats

| Seat | Relationship |
|---|---|
| `archie` | Lucy reviews archie's plans, specs and work packages at the plan stage, by spec-to-code and requirement-quality rules. Its findings feed archie's next revision. |
| backend, `patty` | They fix FIX_FIRST findings. Each finding carries the trigger and, where lucy wrote one in the scratch copy, the reproduction test as text. Lucy never reviews its own suggested fix as the author. |
| `jimmy` | Lucy does not investigate beyond a finding's proof. A root cause it cannot settle goes in `nextActions` as a question for jimmy. |
| `billy` | Deep security lane. Lucy's first pass flags trust-boundary changes for it [A5]. |
| `frankie` | Deep process and ledger lane: change records, separation of duties, evidence integrity [A5, A26]. |
| `rosie` | Lucy flags docs that contradict the code; rosie fixes them. |

The finder is never the verifier, and lucy never reviews work it produced [A5, A27].

### 10.3 Atlas

- **Own context (read).** Map each changed path to the unit whose source blobs contain it; the unit's owner, tier and
  invariants become checks, and a changed anchored path whose snapshot was not refreshed is a finding, the same rule
  `atlas-guard` blocks on [A23*]. Today the snapshot holds one unit, so this is mostly potential [A23*].
- **Memory (D5).** Review learnings are worth keeping: CodeRabbit and Greptile learn from replies and reactions, and
  Bugbot tracks an acceptance rate per rule [A2, A6, A8]. The Atlas PR template already has `reviewOutcomes`
  [A23*]. A cold reviewer must not carry the author's context, but it may carry its own outcomes: which rules were
  accepted, which findings were dismissed and why. Memory writes need gitleaks and land in the project directory
  [A23*], which needs a design for a read-only seat.

### 10.4 Repository rules as review input

Lucy reads the target repository's instructions and gates from the base revision and enforces them. In this
repository that includes the test rules (no mocks or `globalThis`, no logic duplicated into tests, `test:ci` only,
`expectSpawn` for omni spawns), the spawn rules, the import aliasing and style rules, and the guard set [A17, A18,
A19]. None of this is hardcoded in lucy's tree: a different repository brings different rules.

## 11. Measuring lucy

The leaders measure outcomes, not opinions: Bugbot's resolution rate (an LLM judge at merge time, 52% to over 70%),
Atlassian's code resolution rate (did the author change the commented line; human baseline about 45%), Greptile's
addressed rate, Google's 50% precision target [A2, A6]. An independent study of CodeRabbit found 56.3% of its reviews
rejected [A2]. Vendor numbers use their own denominators and are not comparable [A2].

Proposal: an offline set built from this repository's history (human comments whose lines later changed, and fixes
of bugs that escaped), scored for precision and recall per lens, plus the online resolution rate of lucy's own
findings [A6]. GitHub's ReviewBench is the public reference [A2]. Nothing runs without the owner's permission (D12).

## 12. Framework extensions this needs

| # | Extension | Why |
|---|---|---|
| E1 | A new seat capability for review tools (`review_analyze`, `review_probe`, read-only code intelligence and history) with its own pinned pack set, separate from the backend toolkit and the research engine | `define()` restricts `toolkit` to backend and `research` to jimmy; the framework requires a separate boundary for new toolkit ownership [A1; seat-framework README] |
| E2 | Read-only `atlas_context` for lucy without Atlas Memory | `atlasMemory` today bundles context, memory and the header for four owners [A23*] |
| E3 | `review-work-result-v1` and parsing of the `review-result` card for a plain `task` | a plain task to lucy returns free text today [A22*] |
| E4 | `maestro_request_review` takes `profile` and `tier`, runs the host fan-out (lens children, one verifier per candidate) and reads rules from the base revision | multi-pass review needs separate contexts, and lucy may not delegate [A3, A5] |
| E5 | `recordReview` and `ReceivedV2` carry the full finding record; findings on unchanged lines tied to a changed one; method version with profile and tier | §9.4 [A1] |
| E6 | The merge queue fills `reviews` and refuses queueing on an open FIX_FIRST or REJECT | specified in `merge-queue.md` §4.5, not built [A24] |
| E7 | A SARIF normalizer and a read-only LSP diagnostics call | nothing handles SARIF; diagnostics come only after edits [A34] |
| E8 | Validation rejects `routedMemberID: "lucy"` up front | today it is caught later as self-review [A1] |
| E9 | The `tests` ability lists lucy's real tools | a dead path today [A1] |
| E10 | A scratch-copy service for the reviewed tree | §6.3 |

## 13. Compliance and governance: how far lucy goes

Lucy's depth on every regime is the same in kind: per-change checks it can run, evidence it can gather, and a
human-decision list it never answers. Classifying a system, judging residual risk, deciding conformity and signing
anything stay with an accountable person [A10*]. An attestation must come from an independent practitioner, and a
report must never claim "no deficiencies" [A26; A10*]. Lucy also must not score developers: using review output to
evaluate workers may fall under AI Act Annex III point 4 [A10*].

| Regime | Lucy checks per change | Evidence it gathers | Never decides | Evidence status |
|---|---|---|---|---|
| **GDPR** | New personal data, purpose or destination (fields, logs, SDKs, telemetry, cross-border hosts); defaults beyond the purpose (Art 25(2)); credential and token security first; DPIA trigger (Art 35(3)(a)) or review on changed risk (Art 35(11)); a solely automated decision without a human-review path (Art 22) | Data categories and sinks in the diff; whether audit logs and detection support the 72-hour clock (Art 33) | Legal basis, whether a DPIA is adequate | verified [A9] |
| **LGPD** | Same five checks, plus what GDPR-trained review misses: breach notice in **3 business days** (ANPD Res. 15/2024 Art 6, Art 9), elderly people's data as a high-risk criterion (Art 5), transfers needing a legal basis **and** a mechanism with minimal fields (Res. 19/2024), security from conception (Art 46 §2), right to review automated decisions | The incident register's 5-year retention support (Res. 15 Art 10); records ANPD can request (Art 8) | Same | verified [A9] |
| **CRA** | Changes that may be a "substantial modification"; vulnerability handling during the support period; SBOM delta; a disclosure contact | Signed provenance, attached SBOM, stated support period at release | Whether the product is in scope or important/critical; conformity | draft [A10*] |
| **AI Act** (as amended by Reg. 2026/1744) | Logging hooks for high-risk systems (Art 12); a disclosure or marking path for AI content (Art 50; 50(2) from 2 Dec 2026); human-oversight hooks | Log retention support (at least 6 months, Art 19) | Whether a system is high-risk (Annex III moved to 2 Dec 2027, Annex I to 2 Aug 2028) | draft [A10*] |
| **NIS2** | Secure development and vulnerability handling in changes; whether the 24h/72h/1-month clock can be met | Runbook and detection evidence | Whether an incident is significant | draft [A10*] |
| **DORA** | ICT change management and testing evidence for financial entities; third-party risk on new providers | Test evidence, environment separation | Whether an incident is major; TLPT scope | draft [A10*] |
| **EAA / EN 301 549** | axe on UI diffs, plus the manual WCAG checks axe cannot do | Recorded runs per state | Whether accessibility is met overall | draft [A10*]; WCAG facts verified [A14] |
| **PLD, Data Act, DSA** | Missing security updates (PLD); connected-product design and switching duties (Data Act); notice-and-action and recommender transparency, platforms only (DSA) | Flags only | Applicability | inferred, not captured [A10*] |
| **ISO 27001/27002, SOC 2 CC8.1, NIST SSDF, SLSA, OpenSSF Scorecard** | Author is not approver, branch protection, required checks green, tests changed with code, pinned dependencies, token permissions | Population tests (§4.4), provenance level | Certification, attestation | SSDF and SLSA verified [A10*, A5]; ISO and SOC 2 texts paywalled, inferred |
| **NIST SP 800-53 (CM-3, AC-5, AU-9)** | Change approval before change, separation of duties, protected audit records | Change record mapping | — | verified [A5] |

Gaps the research names and a compliance leaf must close before it ships: ePrivacy Art 5(3), UK GDPR, CCPA/CPRA, the
EDPB DPIA criteria, LGPD Arts 14, 18, 20, 37 and 38 [A9], and the primary texts behind every row marked draft [A10*].
Proposal: one verifying research pass on answer 10 before `lucy-compliance-cyber`, `ai-act` and
`accessibility-law` are written (D11).

## 14. Out of scope

- Editing product code, fixing findings, or opening a fix PR. A fix goes to the owning seat through Maestro; this is
  where competitors hand off to an autofix agent [A2].
- Posting, approving or merging on GitHub or GitLab. The host posts a recorded receipt, opt-in.
- Legal opinions, compliance verdicts, conformity declarations, attestation reports, DPIA or RIPD sign-off.
- Interviews, pricing, pentests against live systems, production access: the human half of due diligence [A25].
- A full threat model and ASVS verification (the security reviewer), and the evidence-ledger audit (the process
  auditor), beyond the first pass.
- Scoring or ranking developers.
- Installing toolchains, enabling network access, or bundling licence-restricted tools.
- Running benchmarks or evals without the owner's permission.

## 15. Open decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| D1 | Lucy's scope against the unbuilt `billy` and `frankie` | Lucy covers every lane at first-pass depth and hands off; the deep security and ledger lanes stay with those seats when they are built. Until then a deep lane shows as not covered on the card. This keeps one review seat useful now without writing two other seats' trees ahead of time. |
| D2 | Multi-pass review through host fan-out (several lucy children per review) or one Session | Host fan-out at Standard and above. Aggregation and independent verification are where the measured gains are [A3, A7], and lucy may not delegate. |
| D3 | Verifier model | A different model family when one is configured, the same model with a refutation brief otherwise. Models favour their own findings [A5, A27]. |
| D4 | Default tier | Standard, with the risk triggers in §5.3 raising it to Deep and lowering it to Quick, and the trigger list recorded on the card for later measurement. |
| D5 | Atlas Memory for lucy | Now: read-only `atlas_context` only. Later, after §11 measures something: lucy's own review outcomes and rule acceptance, never the author's context. |
| D6 | Build lane on untrusted repositories | On for the project the owner opened; off for external repositories and due-diligence targets unless the owner turns it on for that review. |
| D7 | Advisory databases without network in the review | The host refreshes OSV, RustSec and the Go vulnerability database outside the review; lucy reads them offline and the card states their age. |
| D8 | GitHub and GitLab output | Opt-in. Inline comments plus a non-failing check run by default, as Claude Code Review does; blocking only through the merge queue for governed cards [A2, A6]. |
| D9 | GPL and AGPL analyzers | Invoke if installed, never bundled; CodeQL and Brakeman only with the user's licence. |
| D10 | Findings on unchanged lines in the governed receipt | Allow, when the finding names the changed line that causes it. |
| D11 | Compliance depth and the draft EU evidence | Evidence, findings and the human-decision list only; one verifying research pass on answer 10 before those leaves are written. |
| D12 | Measuring lucy | Approve the eval design in §11 now; run it only when lucy is built and a decision needs the number. |

## 16. What to keep from the stub

Kept: the id `lucy`, the read-only `review` profile, sole ownership of `maestro_record_review`, the
APPROVE/FIX_FIRST/REJECT vocabulary and its settlement meaning, the host-built cold brief, and the three forbidden
actions (edit implementation, receive the author transcript, merge). Replaced: the five-line prompt, the prose return
card, the empty skill list, and the description that says lucy cannot run commands.
