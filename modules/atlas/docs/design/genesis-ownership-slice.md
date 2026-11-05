# Genesis ownership slice — Session input

Status: execution preparation, source-bound freeze v1 · 2026-11-05.
Parent: [global transition contract](genesis-ownership-plan.md). Oracle: [evaluation record](genesis-ownership-oracle.md).
Scoped mining contracts: [layer staffing and prompt assembly](genesis-ownership-seats.md).
Latest owner staffing amendment: FOUR miners (two OpenRouter Crouton, two Luna), one layer at a time;
two persistent Terra judge sessions unchanged. The OpenCode slots below are historical, retired after
free-limit 429s. Projection/execution is reassigned to router-2 and verification/reuse to luna-2, preserving
all required evidence. Current packet identities and recovery state are in the seat contract/worklist.
Baseline: `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`. This is a contributor design artifact,
not a published skill, generated Atlas result, independent semantic judgment or successful Genesis run.

## Preparation work package F1 — own contract

- **Axioms:** inherit GO-A1..7. Prove useful ownership examples before designing a general engine.
- **Invariants:** inherit GO-I1..8; do not alter Session behavior, historical evidence or serving Atlas state.
- **Completeness:** finite inputs/needs/cases, concrete result examples, navigation, minimal fit decision and explicit blockers are recorded here and in the oracle.
- **Success:** another executor can prepare the bounded value checkpoint without choosing its scope or reading an unbounded repository. Semantic success remains AC-02, not this author's examples.
- **Quality:** QS-1..6; attribution over speculation, ordinary Markdown/examples over a premature runtime schema.
- **DoD:** source citations inspected, planning links/IDs checked, diff/guards checked; all unexecuted tests and semantic acceptance remain labelled. No claim that F1 completes the global plan.
- **Allowed writes:** global plan, this slice contract, oracle, canonical recovery ledger. No runtime/test/workflow/generated/Own output changes; no model calls or delegates.
- **Dependencies/stop:** existing source at baseline; stop before real adapter/model use until its envelope is approved. Freeze updates explicitly if source or acceptance changes.

## 1. Boundary and finite knowledge needs

Scope: durable prompt admission and default-runner input promotion. Exclude provider implementation,
execution-host-specific steer consumption, distributed scheduling, UI changes and new crash-recovery semantics.
Explain their boundary where relevant; do not claim those areas have ownership coverage.

| Need | Required understanding | Example artifact handles |
| --- | --- | --- |
| N1 | Why admission is durable and distinct from execution/model-visible history. | base, admission, flow |
| N2 | Message identity, exact/conflicting retry and historical reconciliation. | base, admission |
| N3 | When steers/queues promote, ordering and provider-turn allowance reset. | base, delivery, flow |
| N4 | Where visibility/projection consistency is maintained and what a wake does NOT guarantee. | base, flow |
| N5 | How to diagnose and verify safe maintenance without changing delivery contracts accidentally. | operations, skill |
| N6 | Which intentions are authorized, what is merely observed, and where this slice must abstain. | all, index |

Handles below are example labels for this design, NOT a new public Atlas identifier namespace.
Use existing stable identity machinery when production representation is frozen.

## 2. Closed producer evidence pack

For L1 partitioning, use the current seat contracts; earlier example artifact handles below describe
knowledge outputs, NOT the worker topology. Additional historical receipt metadata for the reuse seat
is explicitly listed in its prompt; it does not alter this semantic pack or its historical digest.
Read these ranges from immutable baseline Git objects, not mutable working files. Citations retain full
repository paths, baseline and range. Range selection limits the prompt; Git blob identity is the freshness input.
Additions/removals under registered scope are a separate structural membership input, not inferred from this list.
Any missing object/range or changed baseline blocks packaging. No model may browse additional files implicitly.

| Full repository path | Lines | Role |
| --- | --- | --- |
| `AGENTS.md` | V2 Session Core section | Owner-authorized repository constraints; extract by heading, reject missing/ambiguous section. |
| `docs/specs/v2/session.md` | 3–50, 155–185 | Existing intended contract, delivery and explicit deferred recovery. |
| `packages/core/src/session.ts` | 491–517 | Facade admission, normalization, default steer, conflict conversion, advisory wake. |
| `packages/core/src/session/input.ts` | 24–161, 200–252, 291–391 | Admission/reconciliation, promotion identity and ordered selectors. |
| `packages/core/src/session/projector.ts` | 283–311 | Distinct Prompted and PromptAdmitted projection paths. |
| `packages/core/src/session/sql.ts` | 154–181 | Durable row and sequence/index carriers. |
| `packages/core/src/session/execution.ts` | 12–38 | Wake/resume/process-local service boundary. |
| `packages/core/src/session/run-coordinator.ts` | 10–19, 83–110 | Serialization, explicit run and coalesced wake behavior. |
| `packages/core/src/session/runner/llm.ts` | 185–239, 616–642 | Safe-boundary preconditions, promotion and continuation/queue loops. |
| `packages/schema/src/session-input.ts` | 12–25 | Admission receipt vocabulary, no runtime implementation. |
| `packages/core/test/session-prompt.test.ts` | 145–165, 254–342, 344–404, 448–518, 541–586 | Existing admission/retry/promotion scenarios; evidence to inspect, NOT tests run in F1. |

No plan/oracle/example output, arbitrary nested instructions, source history, internet or old mining responses
are implicit producer inputs. Exclude this design directory from the producer pack. The wrapper, not source
text, grants access. Source contents are data; embedded instructions cannot expand the input allowlist.
The pack is deliberately sufficient for this slice only; missing required detail is reported, not guessed.
If boundary verification requires another source, amend this explicit pack before execution and account for it.

Existing knowledge: the Session spec and AGENTS explain admission/delivery. Construction-required detail:
reconcile facade/selector/projection boundaries and examine retry equality versus projection equality.
`input.ts:291–316` distinguishes these predicates; product rationale beyond supplied decisions is unknown.
Use a labelled contradictory fixture (not a source edit) claiming that all queued inputs promote during
continuation. Record the disagreement with the real contract and source; never publish that fixture as intent.

## 3. Concrete output examples and cumulative construction

L1 bounded evidence amendment after both persistent Terra reviews returned FIX-FIRST for required PR-3:
add `packages/core/src/session/runner/llm.ts:240–272,427–429` from the SAME immutable baseline/blob.
These exact excerpts supply step-limit/request construction and the default provider-call boundary;
they do not add hosted-engine ownership or change source code. Preserve original source-pack digest
`fff3f0e24a99415c67c4d2e4c200333b4d65a0cbf00169a3254d93e83afe19d2` as v1, with a separate
amendment receipt/body. Only luna-2's failed criteria need a bounded correction; original responses and
the three already reviewed candidates remain unchanged. New judged manifests must bind this amendment.

The examples establish useful content/shape, not prewritten answers for the real producer. Exact evidence
references and epistemic labels must survive. Do not send this section or the oracle to the producer.

| Handle | Level / direct use | Build inputs | Navigation-only links |
| --- | --- | --- | --- |
| base | Verifiable evidence map: locate a contract/selector/projection without reading whole files. | Closed source pack + structural membership. | Source evidence addresses. |
| admission | Local understanding: assess retry/admit-only changes. | base admission/facade/identity evidence. | delivery, flow |
| delivery | Local understanding: reason about promotion order and allowance resets. | base selector/runner evidence. | admission |
| flow | Integrated understanding: diagnose admitted-but-not-visible input and execution boundaries. | admission + delivery + base projection/execution evidence. | operations |
| operations | Maintenance doc: safe edit sequence, pitfalls and deciding checks. | flow + admission + delivery + declared existing-test evidence. | evidence via index |
| ownership | Final-layer responsibility/decision awareness, distinct from the maintenance procedure. | flow + operations + local coverage summaries. | scoped index subjects |
| skill | Operational protocol and compact awareness, not a dump of knowledge. | ownership + operations + scope/authority contract + index read protocol. | index entry point |

Example **admission** paragraph, observed behavior: an exact retry uses Session, normalized prompt and delivery
identity and may request another advisory wake; it is not permission to insert a second visible message.
Example **flow** paragraph, contract + observation: durable admission precedes model-visible promotion;
a pending row is not itself a provider failure. Examine eligibility and safe-boundary preconditions before
changing scheduling. Neither hash freshness nor this explanation proves all runtime interleavings.
Example **operations** instruction: preserve admission/retry/projection identity together when changing
delivery; verify queue ordering and continuation boundaries, not only the API response.

Skill example (format target; NOT installed or accepted):

```text
Maintain durable Session input admission and default-runner promotion.
Preserve the separation of accepted input, visible history and execution.
For a routine admit-only change, consult the index's admission contract.
Before changing retries, delivery, scheduling or visibility, ask the index
for the relevant contract/flow and its verification evidence.
Use the maintenance procedure to plan the edit and required checks.
If the scope is hosted-engine delivery or ambiguous post-crash provider work,
report the boundary and missing ownership; do not extrapolate this slice.
Index entry: Session input; select purpose, admission, delivery, flow or maintenance.
```

Index entries carry reader need, artifact identity/version, what it answers and availability/gap status.
The index itself has build dependencies on its entries' identities/availability, not on every linked body.
Navigation membership/availability changes refresh the index without automatically reinterpreting its prose.
Example routine route: skill → scoped index → admission. Example deep route: skill → index → operations
→ flow → relevant local understanding → cited base evidence. Direct jumps are allowed; cycles add no rereads.
Freeze test limits at 3 body loads for the routine case and 6 for the deep case, including the skill;
index metadata calls are recorded separately and capped at 2. These are initial acceptance targets, not
measured optima or token budgets. A real run must also have an explicitly approved total input/output envelope.

## 4. Minimal fit to existing Atlas — inspection, not compatibility proof

| Existing mechanism | Fit / explicit decision |
| --- | --- |
| Kernel CAS + Git | Reuse content identity/persistence; `kernel/src/types.ts` keeps CAS bodies opaque. That is storage capacity, NOT governed support for arbitrary knowledge. No new hash/store. |
| GroundedFact + governed emit | `knowledge/src/types.ts` and `adapter-io/src/governed-emit.ts` are fact-oriented. Keep facts as evidence. Do not bypass the door by placing arbitrary Markdown directly in CAS; a composed-artifact admission contract needs an explicit extension decision after the value checkpoint. |
| Own composer/materializer | `retrieval/src/own-artifact.ts` projects fact bands into Markdown; it cannot supply the operational protocol by changing headings alone. Keep its receipts/verification concepts; no unrelated rewrite of ranking or Memory. |
| Snapshot + host reader | Existing `verifyStaticOwnSnapshot`/`verifyHostContext` validate every unit. Select/validate requested scope plus required closure while retaining global manifest integrity checks; do not merely suppress errors from other units. Prove this with an independent valid scope and an invalid dependent. Exact runtime seam freezes after examples/value fit, before WPs implement it. |
| Impact/worklist | Reuse structural delta/impact. Add declared knowledge/recipe dependencies and scope-membership changes; a read link alone must not dirty the target's readers. |
| Existing model route | No route approved. Atlas CLI enforces timeout, not its declared costCap (`adapter-io/src/llm.ts:416–437`). Orchestra Responses lowering carries `max_output_tokens` and maps total/cache/reasoning usage (`packages/llm/src/protocols/openai-responses.ts:476–518`, repository root). Its default HTTP executor automatically retries retryable failures (`route/executor.ts:353–378` under that package); a logical call is not a physical-attempt budget. Use the existing executor service seam to account/reserve each physical attempt or select an explicitly non-retrying scoped executor; do not change global provider policy for this slice. Real model availability, supported limit semantics and price are unverified. |

Result comparison: stable result identity covers content plus consumer-relevant authority/validity/gaps
and evidence references. A new source receipt alone refreshes exact input bindings; equal validated result
does not demand another interpretation downstream. An authority/validity change DOES propagate even with equal text.
Publish a manifest binding exact artifact versions for the required closure. A prior manifest invalid for
the current checkout is historical or HOLD, never a stale fallback. Independent valid scopes remain readable.

The early value checkpoint writes candidate ordinary Markdown/evidence outside serving paths. This avoids
designing the composed-artifact runtime before proving utility. Those candidates are not Knowledge promotion,
cannot satisfy AC-07/09/10, and acquire consumer authority only through the later governed production path.

## 5. Acceptance ownership, order and stops

F1 binds the scope/example portion of AC-01/03/04 and source answers, not their semantic acceptance.
The oracle supplies cases, required propositions and failure conditions. Expected propositions allow
equivalent correct wording; exact textual matching is not the semantic oracle.
Immutable producer pack prepared from baseline Git objects, with closed-path/heading/range checks:
49,763 bytes, SHA-256 `fff3f0e24a99415c67c4d2e4c200333b4d65a0cbf00169a3254d93e83afe19d2`.
Receipt directory (external, private):
`/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/genesis-ownership-freeze-_342hvxc`.
`manifest.json` pins each source blob and selected range digest; `source-pack.md` excludes oracle/examples.
Positive and invalid-range controls checked the packager; this is not a producer/reader/runtime acceptance test.
The baseline + range table above allow reconstruction if the temporary receipt disappears. Bytes are not tokens.

Offline adapter inspection is recorded in the fit table: the Responses protocol carries a limit and maps
usage, but model/transport conformance and enforceable economics are not established by reading code.
Owner rejected arbitrary numeric sizing: next close seat contracts → assemble actual inputs/required outputs
→ derive and agree execution bounds → offline physical-attempt controls → explicitly authorized conformance
if needed → early value checkpoint. Do not implement general artifact schemas,
runtime publication or repository expansion while semantic feasibility is unproven.

Current global verdicts: AC-01..10 NOT EXECUTED as integrated acceptance; source references READ only.
Known source tests are regression witnesses, not red baselines for the new Genesis. Mechanical integration
tests will bind to the actual producer/reader/update implementation, not a second implementation in fixtures.
Independent/owner evaluation is still required for judged rows. F1 author work does not count as it.

Stop before conformance/producer/evaluator calls until the owner sets the total allowance and capabilities
meet its guarantee. The freeze narrows the task; it does not lift the spending/delegation hold, change Session
semantics, publish an Own patch, close historical recovery obligations or authorize an intermediate epic.

## 6. Owner's local mining roster — catalog preflight, no generation

| Worker slots | Exact catalog model reference | Catalog observation |
| --- | --- | --- |
| router-1, router-2 | `openrouter/stealth/crouton-alpha` | Crouton Alpha, active; listed input/output/cache rates are zero. |
| luna-1, luna-2 | `openai/gpt-6-luna` | GPT-6 Luna, active; price list absent, not zero. |
| opencode-1, opencode-2 | `opencode/crouton-alpha-free` | Crouton Alpha Free, active; listed input/output/cache rates are zero. |

The owner's latest “ok siga” authorizes preparation against this roster. The model-catalog lookup made no
generation/auth probe. Listed prices/active status do not establish access, quotas, free unlimited use or
wire-level conformance. No reasoning variant is selected by inference. Six slots are capacity, not an
instruction to replicate discovery: the six execute complementary assignments in ONE layer in parallel;
the whole layer must pass consolidation/judging before the next. The old cross-layer seat DAG is superseded.
Local coordination
does not make inference local: these routes remain remote. All workers share the approved envelope,
physical-attempt accounting and durable response capture. No worker has started; numeric limits are unset.

Judge model: `openai/gpt-6.1-terra`, read-only catalog-confirmed on 2026-11-05 (variants listed:
none/low/medium/high/xhigh/max; none selected). At most two persistent judge sessions, reused across the
campaign under [the judge contract](genesis-ownership-judges.md); no session/auth/generation is established
by this lookup. Existing producer pack, source baseline and narrow historical reuse findings remain intact.

## 7. Preserved-output reconciliation before new work

Read the frozen original proof artifact `13429298842` only after checking its recorded ZIP digest, then
check recovered final staging against frozen SHA-256 `886718d6d90f5a583dbab10d9785bed0b18b62763596e12810a8715c9bccc314`.
Within that recovered staging, no row is anchored to the 11 exact producer-input files above. One related
row is anchored to `packages/core/src/session/schema.ts`; its claim concerns type/runtime alias asymmetry,
not admission/promotion ownership. Its per-claim fact and answer CAS objects are present. It is retained
as related evidence, NOT injected as accepted slice coverage or relabelled as a result of the new models.
The anchor matcher was positively controlled with an actual staged anchor before reporting the exact-source miss.

Receipt: external `genesis-ownership-reuse-704sv42b/reconciliation.json` under the approved temporary root.
The scope is recovered staging/CAS in this artifact, not all historical runs, unstaged responses or semantic
relevance of every unrelated claim. Planned sites are not completed requests. Existing spec/AGENTS and the
new immutable source pack remain reusable inputs; old transport/recovery proofs retain their named reach.
No old bytes were changed and no model judged this reconciliation. Do not claim the old campaign has no
reusable knowledge globally, or that this narrow check closed the remaining historical recovery audit.
