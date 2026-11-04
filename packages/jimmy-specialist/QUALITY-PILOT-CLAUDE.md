# Jimmy quality pilot on the claude-code engine

> Path note: `packages/orchestra` was the V1 monolith and no longer exists (see `docs/architecture/monolith-map.md`). Paths below under `packages/orchestra` are historical; the live code is in `packages/core`, `modules/*` and `apps/cli`.

This records the Claude-engine pilot against the frozen candidate. It is a **separate configuration**. It does not replace the gpt-6.1-sol records in `QUALITY-PILOT.md` (that pilot was blocked by a provider 429 with zero slots consumed).

R05 ran three times and R08 ran three times. R14 is recorded as unsupported on this engine. There were no retries, no best-of selection and no criteria changes, and the other 33 slots stay held.

This file contains only identities, counts, classes and durations. Questions, answers, oracle text, rubric wording and grader reasoning stay in the evaluator's private ledgers.

## Result

| Case | Slots | Pass | Fail | Inconclusive | Unsupported |
|---|---|---|---|---|---|
| R05 | 3 | 3 | 0 | 0 | 0 |
| R08 | 3 | 0 | 3 | 0 | 0 |
| R14 | 3 | 0 | 0 | 0 | 3 |

The family rule requires all three repetitions to pass. **R05 qualifies, R08 does not, and R14 is unsupported.**

## Per slot

| Slot | Execution | Provider calls (of 24) | Verdict | Public failure class |
|---|---|---|---|---|
| R05-rep1 | task returned, 207 s | 6 | pass | none |
| R05-rep2 | task returned, 191 s | 4 | pass | none |
| R05-rep3 | task returned, 229 s | 7 | pass | none |
| R08-rep1 | task returned, 264 s | 12 | fail | material obligation unmet; published document not closed; critical violation |
| R08-rep2 | task returned, 267 s | 14 | fail | material obligation unmet; published document not closed; critical violation |
| R08-rep3 | task returned, 192 s | 11 | fail | material obligation unmet; published document not closed; critical violation |
| R14-rep1..3 | not run | n/a | unsupported | `unsupported: claude-code engine (compaction/Atlas resume not bridged)` |

Across all six admitted slots:
- Every provider response was HTTP 200.
- No slot hit an allowance, deadline or quota limit.
- Every native evaluation was present.
- Each cold grade was one grader request in a fresh context.

The graders judged the parent-visible handoff in every R05 and R08 slot as closed. The R08 failures come from what the answer says (it misses a material obligation) and from the absence of a published research document, which R08 requires as a separate channel. **No slot published a research document.**

## Identities

| Item | Value |
|---|---|
| Candidate | `jimmy-claude-candidate` @ `3ba386b2c3f7f8216fb9d6724250a107f8eb7093`, tree `7b1ed0b6f0a5262e8d8eb9606c8bfe51a4ca9ab5`; clean runtime clone with frozen lockfile |
| Loaded roster hash (computed with the real `rosterHash`) | `9a00703e9ba953b12ae6bb03d5f5ce47dff0c1b7b63997a0b23183c6e97fb912` |
| Engine | claude-code, `@anthropic-ai/claude-agent-sdk` 0.3.289, bundled `claude` 2.1.289 (`358aa0e31666c48b2340ad9fa4003436105086ca12e1ecd4c5266d18598c2f7f`) |
| Models | Jimmy `anthropic/claude-opus-5-5`; Maestro `opencode/big-pickle` (made no model calls; the pilot dispatches Task directly) |
| Grader | `claude -p`, `claude-opus-5-5`, effort medium, no tools, no settings, no session persistence |
| Grader calibration | 69/70 closed, seal `812f8ad87d169380e6ac2fe03ebb5ea111722fd85af32bb94f7a26bb55dd15c9`; the 15 pilot-case controls are 15/15 closed (`c7607fda…`). The one open control is not a pilot case. |
| Case version | `d797f5bc6857eaf20abbc28f3b609060f96439f121a246742a01a1687059d125` (fresh 14-family roster) |
| Setup / inputs / questions | `7e5b03a0…` / `e4765164…` / `a6ebd4cf…` |
| Seatbelt producer (unchanged) | `f7337359f2f8aefad749734ffab40c871f2d89b3254105bcde9e07edcb81c92b` |
| Claude proxy | `9b3708c11ae166c9…` (prefix) |
| Pilot freeze | `d9eea0b70002b4cbc522e8978f34dab9cc26215f861aa9ea6ce7996107dae28d` |
| Generated driver | `ac5278ace70a5a203db01562e4ae0a7a843e119b45981fd3422216b383c11554` |

Budgets were unchanged: 24 provider calls, 64 tool calls and 64 MiB per dispatch, with a 600 s maximum per dispatch.

## Evaluator transport (owner-approved)

Each slot ran confined under the unchanged seatbelt and held only a dummy token. A loopback proxy read the owner's existing Claude Code login from the Keychain into its own memory and attached it only to `POST /v1/messages` on `api.anthropic.com`. It refused everything else, including CONNECT, and never refreshed the login.

The generated wrapper overrides the candidate's claude-mode environment for the Claude Code child. The candidate default would read the Keychain from inside the slot via the real HOME. The wrapper replaces that with:
- an isolated HOME;
- Claude Code state under an owned directory;
- the dummy token;
- the loopback base URL and capability header.

The native source is unedited. A pre-admission chain diagnostic, using a fake upstream with a fake token, confirmed that the engine exposed only Orchestra MCP tools (no Claude Code built-ins).

A scan of slot directories, transport records and logs found no credential value.

## Private ledger (retained, not committed)

`45175135b80b75fdab2ac1aa626a899e21fff3ee4ecc514c5593c5d1cb08153b`

## Durations

- Materialization plus pre-admission diagnostic: about 3 min.
- Execution: 399.8 s from first launch to last slot end, with up to 5 concurrent slots and no memory-pressure reduction.
- Grading tail after execution: 30.4 s (grading rolled as slots finished).

## Limitations

- **Self-grading bias.** Claude grades Claude-authored answers, and calibration controls cannot detect self-preference. A cross-model regrade would need provider access.
- **Unknown costs.** Usage, billing and raw-read bytes are unknown. Proxy request counts are the only provider measure.
- **Count-tokens refusal.** In one R08 slot the proxy refused one Claude Code `count_tokens` helper call because it is not allowlisted. The task still returned.
- **R14 untested.** Native continuation on this engine is not bridged.
- **Not a comparison.** This is a candidate-only system result, with no superiority claim and no baseline rerun. Host load was high during preparation.

## Pilot 2 — union-schema fix (2026-10-11)

Pilot 2 re-runs R05 and R08 on the candidate that carries the union-parameter fix. In Pilot 1, every R08 failure traced to one engine bug: tools whose parameters are a union (such as `research_record`) reached Claude with an empty schema, so no document could be published. The R14 status is unchanged and R14 was not re-run.

There were no retries, no best-of selection and no criteria changes after the freeze. This section contains only identities, counts, classes and durations.

### Result

| Case | Slots | Pass | Fail | Inconclusive |
|---|---|---|---|---|
| R05 | 3 | 3 | 0 | 0 |
| R08 | 3 | 3 | 0 | 0 |

**Both families pass 3/3 on the fixed candidate.** Pilot 1's R08 failure class ("no published research document") did not recur: every R08 slot has at least one `research.document.published` event.

### Per slot

The provider-call and tool counts come from the dispatch allowance ledger (`research.allowance.charged`, kind `provider` / `tool`) in each slot's native DB. The `research_record` and document counts come from the native `part` and `event` tables.

| Slot | Execution | Provider calls (of 24) | Tool charges (of 64) | `research_record` completed / error | `research.document.published` | Verdict | Failure class |
|---|---|---|---|---|---|---|---|
| R05-1 | task returned, 183 s | 10 | 27 | 5 / 0 | 1 | pass | none |
| R05-2 | task returned, 141 s | 8 | 25 | 3 / 0 | 0 | pass | none |
| R05-3 | task returned, 149 s | 8 | 28 | 5 / 0 | 0 | pass | none |
| R08-1 | task returned, 246 s | 10 | 28 | 10 / 6 | 1 | pass | none |
| R08-2 | task returned, 166 s | 9 | 28 | 8 / 0 | 1 | pass | none |
| R08-3 | task returned, 259 s | 11 | 31 | 10 / 0 | 2 | pass | none |

No slot hit a deadline, allowance or crash. Every native evaluation was present. R05 does not require a document, so R05-2 and R05-3 are not penalized for having none.

**Observed engine defect (non-fatal).** All six `research_record` errors in R08-1 were Claude Code `InputValidationError: ... could not be parsed as JSON`. These are tool inputs the model emitted as malformed JSON: an unquoted `conditions` value, repeated keys. The schema was not empty, and the model corrected itself within the same dispatch. Each error still counts against the tool allowance. The defect is worth tracking: the fix lists the merged `conditions` field to the model, but the model sometimes fails to emit it as a JSON string array.

### Identities

| Item | Value |
|---|---|
| Candidate | `jimmy-claude-candidate` @ `68de9a03d5daef064f64287e18fb91c007be22e5`, tree `6bf1571a1931d15055a3263b278db9addbafba22`. The product checkout was clean before and after; CI 38102023339 is green |
| Driver | unedited `packages/orchestra/script/research-pilot.ts --engine claude-code`, runner SHA-256 `662852763f9cbbf934d2a161dea76803ee55271ed9c71a86d62f01d04548c93f`; lock `5e313161…`; Jimmy prompt `ce43bfa0…`; config `b90ea29c…` |
| Engine | claude-code, `@anthropic-ai/claude-agent-sdk` 0.3.289, bundled `claude` 2.1.289 (`358aa0e31666c48b2340ad9fa4003436105086ca12e1ecd4c5266d18598c2f7f`) |
| Models | Jimmy `anthropic/claude-opus-5-5`; Maestro `opencode/big-pickle` (made no model calls; the driver dispatches Task directly) |
| Grader | the same bundled `claude -p`, `claude-opus-5-5`, effort medium, no tools, no setting sources, no session persistence; one fresh call per slot. Grader instruction SHA-256 `c718ce46f1f55ead75ff1515de2b3703065f191599cd2df31d37970e2cfb3bef` |
| Public input manifest | `ea828303187d4e0b14eb391d5d700948b913b7869390589b65cefc5f2202ddd4` |
| Questions | `99c0f8841a0dc20b530874ef1ad1a66420cec3e5e7ccd5683f8fb2af74654606` |
| R05 oracle and rubric | `01754443398d986a47184a37908ecf0406af9e937abde9b5d5e79d43bd88997c` |
| R08 oracle and rubric | `7fa8d43a098e4a351cbfaca6ce3a1ed0756d78d518739dbc44af4bdd01954076` |
| Private ledger (retained, not committed) | `05f70df23963919aec4d6ca3e99e4a473f32571bcf0be1ab091581bdcf67c9d1` |

All four case hashes were frozen before the first model run. The budgets are unchanged and enforced by the engine: 24 provider calls, 64 tool calls, 64 MiB and 600 s per dispatch.

### Isolation (lean, declared)

- Each slot had its own run root and its own native DB, data, config and Claude Code state directories.
- The slot-visible source directory held only that case's disclosed fixture files. The oracle, rubric and questions file live outside every slot root and outside every git repository.
- Every `read` in all six traces resolved to a disclosed input or a native skill file; zero paths were undisclosed.
- Claude Code built-ins are disabled for a research dispatch: Jimmy held only Orchestra tools under its permission floor.
- Claude Code used the machine's own login, through the driver's default path. The evaluator did not read, copy or print any credential.

### Durations

- Execution: 514 s from first launch to last slot end, with 3 concurrent slots.
- Grading tail after the last slot: 13 s (grading rolled as slots finished).
- Whole pilot including case authoring: about 12 min.

### Deviations from Pilot 1 (declared)

- **Rebuilt cases.** A host reboot erased Pilot 1's private material. Pilot 2 used one fresh synthetic question per family, written from the public R05/R08 prototypes (with their discriminating evidence and named traps) and frozen by SHA-256 before any run. Pilot 2 results are therefore not item-comparable with Pilot 1.
- **No seatbelt, no proxy.** Isolation came from the engine's tool floor and per-slot state placement, not from an OS sandbox or a credential-attaching proxy.
- **Claude grades Claude.** The self-preference bias noted in Pilot 1 still applies.
- **No calibration controls this round.** Grader calibration was not re-run, and no planted-wrong controls were graded.
- **No preflight tool listing.** The candidate's own schema test (`test/claude-code/research.test.ts`) cannot run locally under the repository's local-test guard. The fix is instead evidenced by CI 38102023339 and by the run itself: completed `research_record` document actions and published-document events.
