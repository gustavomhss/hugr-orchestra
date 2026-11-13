# Third cold integration repairs

Run43479893813 checks immutable source `c9ffb56cb19050f65946b54ff9c5f799d0e6becb`,
against integrated dev `5804b4f794ba31f49890b79565cff62b65e37725`.
All70 jobs are allowed to finish. Later Root edits are separate source and are not qualified by this run.
The original ledger remains63/65; E10/M13 are not closed by partial results.

## Frozen, disjoint repairs

1. Core control wiring: Linux4/15 and Windows3/12 reject four declaring App browser files because
   the static guard recognizes direct Bun preload commands only. Keep the runtime control unchanged;
   recognize the exact audited app-shell wrapper, target and both tracked files, with seven negative
   cases. Contract details remain in `remediation-isolated-suite-plan.md`. Memory implements; UI
   independently approved. Root commit `f0d708da6d`.
2. App lane wiring: both unit lanes stop at the obsolete manifest-contains-browser-condition assertion.
   Preserve plain test discovery, require the exact package command, and verify the actual root-to-Core
   entry chain, browser/isolation flags and control preload from their source. Runtime CLI acceptance
   remains separate. UI implements; Root reviews. Root commit `1a09f93183`.
3. Thinking-menu fixture: E2E4/8 runs61P/1F; the existing locator `high` does not match the current
   `Reasoning: high` menu label already observed in the real V2 menu. Change that locator only; keep
   idle, hover, focus and control visibility assertions. IO implements; Root reviews. Root `5d5e1a5d33`.
4. Windows admission-limit fixture: Core4/12 runs594P/1F; the100000-record case exceeds its unchanged
   30000ms budget at32489.87ms. The fixture currently autocommits500 existing seed batches. Commit
   those same batches in one real transaction; retain200-row batch bounds, the full100000-row count,
   executed positive template, actual maintenance refusal, exact retry ID and final count. Actual
   operations remain outside the committed seed transaction. No PRAGMA, limit, timeout or skip changes.
   Memory implements; UI independently approved. Root `17c014b1f2`; runtime improvement is pending.
5. Independent writer diagnostics: Linux Core12/15 runs570P/1F; the writer never reaches observed READY
   within20s. The old helper joins the captured child only after READY, hiding early exit/stderr.
   Race READY against the actual scoped child's exit and preserve `requireSuccess`; successful premature
   exit must also fail. Add a genuine missing-descriptor-file negative case. Keep process30s, READY20s,
   ACK20s, actor bytes and all five-write/open-descriptor retention assertions unchanged. UI implements;
   IO independently approved. Root `921ac7b901`. This improves diagnostics; it does not establish the
   cause or resolution of the original READY failure. Follow actual hosted evidence before claiming closure.

No production runtime code changes are authorized by these packets. Root owns integration and verdicts.
No agent may change allowlists, runtime scope assignment, preload enforcement or retry configuration.
The E2E full workflow actually uses two configured retries; focused Playwright requests use zero. The
third full E2E result is570P/1F/3skip across574 cases, with no reported flaky passes. The stronger
canonical DOM part identity assertion executed successfully in bin8 before ACK abort, on retry0.

## Gates and source boundaries

Root uses hosted Core guard plus actual browser CLI controls on both OS; hosted MoveSession plus
operations recovery with an explicit30000ms budget on both OS; the exact App wiring unit; and the exact
thinking-menu E2E. Local Core/App/E2E checks use package typecheck scripts only. Tests, builds and
generation remain hosted. The scoped requests wait for runner room; no queue bypass is authorized.
Complete static guards and source checks, then qualify the final integration. Preserve every failed
snapshot and actual source vector. One draft PR1463 remains the only external delivery.
