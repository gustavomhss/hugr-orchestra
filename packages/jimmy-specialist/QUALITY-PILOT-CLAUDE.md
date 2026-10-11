# Jimmy quality pilot on the claude-code engine

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
