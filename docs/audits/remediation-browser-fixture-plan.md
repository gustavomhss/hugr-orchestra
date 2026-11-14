# Browser fixture qualification repair

Baseline: c54a5180d68899b2b5a94d67d5cc6dc0651f1681. These packets close actual failures from hosted run 43445796579. Linux: 612 pass / 32 fail; Windows: 641 pass / 3 fail. This is integration repair within PR1463, not another audit. Production behavior is frozen.

## Frozen packets

1. UI: await a cached asynchronous fixture-module initializer in the three consumer suites. Import the same seven modules in the same sequence and URLs; publish the module bundle only after success. Preserve all29 case bodies, assertions, timeouts and per-case owners. No swallowed errors, fallback or shared live SDK. Linux had29 TDZ failures; Windows did not.
2. IO: register the existing submit harness lifecycle once in submit-policy.suite.ts. Preserve all five policy assertions, existing stable SDK/server identity, and teardown. No getter fallback.
3. Memory: observe the actual post-prepare active-read transport rejection and require it alongside recovered messages. The direct reconnect read is outside the cached query. Preserve exact read counts, busy state, complete message replacement and timeouts; no production query change.
4. Selection (sequential after IO lifecycle): replace the obsolete silent-fallback expectations with the documented explicit-intent contract in docs/guides/models.md. Stable complete public SDK/server/prompt-ready fixtures, async settlement, controlled public eligibility verdicts. Retain canonical entries and explicit unavailable selection; assert readiness/reason, exact Maestro request, unrelated secondary-seat independence, and absence of persisted fallback writes. Do not copy Core eligibility logic or filter a fabricated response to force the old assertion. Exact scenarios undergo independent source review before execution.

Packets1–3 have disjoint write sets. Packet4 owns only model-execution-selection.test.ts. Agents use isolated worktrees; Root reviews and integrates serially. No local tests/build/generation; Root owns serial package typechecks, hosted focused tests and final complete CI. Completion requires actual green hosted evidence, not source review alone.
