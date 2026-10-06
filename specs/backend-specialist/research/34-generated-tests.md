# R34 — Generated tests for the backend specialist's assigned work

Research snapshot: **2026-10-03**. Evidence: current primary docs, release metadata, package metadata, source. **No installation or execution; snippets unexecuted.** “Guarantee” below means evidence obtainable from executed assertions over exercised cases, never universal correctness.

## Remit and selection

- Other owners supply acceptance properties, scope, API/schema, expected behavior and prescribed cases. The backend specialist implements/executes only explicitly assigned tests; failures return with reproducer, not diagnosis, security audit or newly invented scope.
- Handoff: requirement/test IDs, target entrypoints/operations, schema revision, input domain, preconditions, oracle/goldens, fixture/fault semantics, existing runner/cwd and bounded execution budget. Unclear supplied requirement goes back to owner.
- Choose **four mechanisms**: schema-derived requests; generated property inputs; prescribed state-machine sequences; parser round-trip/corpus tests. Select by assigned stack/task rather than adopting whole toolkit.
- Kernels below illustrate hypothetical owner-supplied contracts, not acceptance added to this repository. Fixture/codec names denote project adapters to actual implementation; adapters supply reset/cleanup, transport and independent state reads, never replacement business logic.

## Current versions, source and licenses

| Tool | Version observed | License | Primary provenance |
|---|---|---|---|
| Schemathesis | 4.29.1 | MIT | [Release](https://github.com/schemathesis/schemathesis/releases/tag/v4.29.1), [Case source](https://github.com/schemathesis/schemathesis/blob/v4.29.1/src/schemathesis/generation/case.py), [license](https://raw.githubusercontent.com/schemathesis/schemathesis/v4.29.1/LICENSE) |
| fast-check | 4.10.2 | MIT | [Release](https://github.com/dubzzz/fast-check/releases/tag/v4.10.2), [exports source](https://github.com/dubzzz/fast-check/blob/v4.10.2/packages/fast-check/src/fast-check-default.ts), [license](https://raw.githubusercontent.com/dubzzz/fast-check/v4.10.2/LICENSE) |
| Hypothesis | 6.168.3 | MPL-2.0; Ghostwriter output CC0 | [Release](https://github.com/HypothesisWorks/hypothesis/releases/tag/v6.168.3), [source tree](https://github.com/HypothesisWorks/hypothesis/tree/v6.168.3), [license](https://raw.githubusercontent.com/HypothesisWorks/hypothesis/v6.168.3/LICENSE.txt), [output license](https://hypothesis.readthedocs.io/en/latest/reference/integrations.html#ghostwriter) |
| proptest | 1.11.0 | MIT OR Apache-2.0 | [Latest package docs](https://docs.rs/crate/proptest/latest), [registry version/license](https://crates.io/api/v1/crates/proptest/1.11.0), [published source/manifest](https://docs.rs/crate/proptest/1.11.0/source/Cargo.toml) |
| Go native fuzzing | Go 1.27.1; feature since 1.18 | BSD-3-Clause | [Current version](https://go.dev/VERSION?m=text), [testing/fuzz.go](https://github.com/golang/go/blob/go1.27.1/src/testing/fuzz.go), [license](https://raw.githubusercontent.com/golang/go/go1.27.1/LICENSE) |

Version caveat: proptest's [GitHub latest-release endpoint](https://api.github.com/repos/proptest-rs/proptest/releases/latest) returns 0.9.6; registry/package docs establish 1.11.0. Published manifest requires Rust 1.85 despite README's older MSRV text. Pin adopted versions; rolling docs can move.

## 1. Schema-derived HTTP contract cases — Schemathesis

**INPUT:** P-HTTP assigns `GET /items`, OpenAPI request/JSON-response schema, valid credentials and seeded fixture; valid first-page requests must return 200 with conforming JSON. Example request domain: integer `limit` 1–50, no cursor. **OUTPUT:** runtime-generated `Case` values inside ordinary pytest test; the backend specialist writes prescribed assertions.

```python
import schemathesis
from hypothesis import given
from schemathesis.checks import content_type_conformance, response_schema_conformance

schema = schemathesis.openapi.from_path("contracts/assigned.yaml")

@given(case=schema["/items"]["GET"].as_strategy())
def test_p_http(case):
    with assigned_api() as api:
        response = case.call(base_url=api.url, headers=api.auth)
        assert response.status_code == 200
        case.validate_response(response, checks=[content_type_conformance, response_schema_conformance])
```

**Evidence from executed, passing cases:** selected positive requests reached expected status; selected response checks held for those responses. Direct operation lookup avoids silently widening operation scope. **Limit:** schema conformance cannot establish pagination completeness, business rules or schema correctness; unconstrained schemas yield weak assertions. Negative cases need their separately supplied expected statuses/behavior.
**Stateful boundary:** `@schema.parametrize()` runs examples/coverage/fuzzing; workflow tests require separate `schema.as_state_machine().TestCase`. Current tool also infers links; explicit OpenAPI links do **not** disable inference. For exact assigned sequences use explicit orchestration/selected operation strategies; inferred relationships do not authorize extra scope. Full workflow reproducer must include setup and preceding calls.
Sources: [Python API](https://schemathesis.readthedocs.io/en/stable/reference/python/), [pytest phases](https://schemathesis.readthedocs.io/en/stable/tutorials/pytest/), [stateful inference](https://schemathesis.readthedocs.io/en/stable/explanations/stateful/), [link/auth reachability](https://schemathesis.readthedocs.io/en/stable/guides/stateful-testing/).

## 2. Supplied pagination invariant → generated fixtures — fast-check

**INPUT:** P-PAGE: stable snapshot, unique integer IDs, ascending order; each page ≤ requested limit; concatenation equals seeded IDs exactly; traversal terminates within `n + 1` requests. Domain here: 0–30 IDs in 0–1000, limits 1–10; prescribed empty and multi-page examples. **OUTPUT:** Bun test with generated datasets/limits; same property works inside existing Vitest/Jest tests.

```ts
import { expect, test } from "bun:test"
import { assert, asyncProperty, integer, uniqueArray } from "fast-check"

test("P-PAGE", async () => {
  await assert(asyncProperty(
    uniqueArray(integer({ min: 0, max: 1000 }), { maxLength: 30 }),
    integer({ min: 1, max: 10 }),
    async (ids, limit) => withCatalog(ids, async api => {
      const pages = await collectPages(api, { limit, maxRequests: ids.length + 1 })
      expect(pages.length).toBeGreaterThan(0)
      expect(pages.every(page => page.items.length <= limit)).toBe(true)
      expect(pages.flatMap(page => page.items.map(item => item.id))).toEqual(ids.toSorted((a, b) => a - b))
    }),
  ), { examples: [[[], 1], [[3, 1, 2], 1]] })
})
```

`withCatalog` resets actual store for every example/shrink. `collectPages` follows returned cursors verbatim, fails on repeated cursor/request cap and preserves response order/duplicates. It must not sort/deduplicate results or compute expected pages. Oracle uses seeded IDs plus supplied ordering rule.
**Evidence from executed, passing cases:** bounded sampled snapshots satisfy page-size, order, membership, uniqueness and termination assertions, including prescribed multi-page case. **Limit:** no evidence about concurrent mutation or other ordering semantics. Generators produce inputs, not acceptance or test source; await `assert` so failures reach runner. `check` alone returns results caller must inspect.
Sources: [properties](https://fast-check.dev/docs/core-blocks/properties/), [runners](https://fast-check.dev/docs/core-blocks/runners/), [explicit examples](https://fast-check.dev/docs/configuration/user-definable-values/).

## 3. Supplied retry protocol → stateful sequences — Hypothesis

**INPUT:** P-RETRY: first 1–2 commit attempts fail transiently before commit; service has three-attempt budget. Credit same key/amount must eventually commit once; later identical submission returns same receipt; durable ledger contains exactly that credit. Amount domain 1–1000. Owner supplies real transaction fixture/failpoint and independent ledger read. **OUTPUT:** generated legal submit/replay sequences plus shrinking, collected through pytest/unittest.

```python
from hypothesis import strategies
from hypothesis.stateful import RuleBasedStateMachine, initialize, invariant, precondition, rule

class Retry(RuleBasedStateMachine):
    @initialize(failures=strategies.integers(1, 2), amount=strategies.integers(1, 1000))
    def start(self, failures, amount):
        self.fx = transaction_fixture(fail_first_commits=failures, max_attempts=3)
        self.failures, self.amount, self.receipt = failures, amount, None

    @precondition(lambda self: self.receipt is None)
    @rule()
    def submit(self):
        self.receipt = self.fx.service.credit(key="K", amount=self.amount)
        assert self.receipt.status == "committed"
        assert self.fx.observed_transient_failures == self.failures

    @precondition(lambda self: self.receipt is not None)
    @rule()
    def replay(self):
        assert self.fx.service.credit(key="K", amount=self.amount) == self.receipt

    @invariant()
    def once(self):
        assert self.fx.ledger_credits("K") == ([] if self.receipt is None else [self.amount])

    def teardown(self):
        self.fx.close()

TestRetry = Retry.TestCase
```

**Preconditions:** establish action legality from supplied protocol/history; replay requires completed submit. Invariants check every step; do not hide failing assertions behind `assume`, guards or caught exceptions. Hypothesis bundles can retain actual created IDs; preconditions cannot access bundles directly. Keep model to inputs, handles and abstract lifecycle facts; fixture injects faults into real service, not fake retry algorithm.
**Evidence from executed, passing cases:** exercised fault sequences preserve specified ledger effect and replay result. Run owner's deterministic `submit → replay` case too: maximum step count does not ensure replay rule executes. **Limit:** this pre-commit scenario says nothing about ambiguous commit outcomes, crash recovery, exhausted retries or concurrent clients. Simpler assigned retry property can use `@given` without state machine.
TS equivalent when assignment is TS: `commands` + `asyncModelRun`; `check(model)` encodes legal preconditions, `run(model, real)` calls implementation and asserts owner property. `scheduledModelRun` only controls promises routed through scheduler; not arbitrary OS/DB interleavings.
Sources: [Hypothesis stateful API](https://hypothesis.readthedocs.io/en/latest/stateful.html), [fast-check commands/model/replay](https://fast-check.dev/docs/advanced/model-based-testing/), [scheduler boundaries](https://fast-check.dev/docs/advanced/race-conditions/).

## 4. Supplied parser laws → Rust properties / Go native fuzz target

**INPUT:** P-CODEC supplies `Record { key: [a-z]{1,8}, value: u16 }`, canonical wire grammar `key=decimal`, equality semantics and goldens. Valid records round-trip; arbitrary byte input returns value/error without panic; accepted input survives encode/decode. **OUTPUT:** proptest macro generates ordinary Rust test plus structured values; Go generates coverage-guided byte mutations when explicitly requested.

```rust
use proptest::{prop_assert_eq, proptest};

proptest! {
    #[test]
    fn p_roundtrip(key in "[a-z]{1,8}", value in proptest::num::u16::ANY) {
        let expected = Record { key, value };
        let actual = decode(&encode(&expected)).expect("valid record must decode");
        prop_assert_eq!(actual, expected);
    }
}
```

```go
func TestPCodecGolden(t *testing.T) {
    record, err := Decode([]byte("a=7"))
    if err != nil || record != (Record{"a", 7}) || string(Encode(record)) != "a=7" {
        t.Fatalf("golden mismatch: record=%v err=%v", record, err)
    }
}

func FuzzPCodec(f *testing.F) {
    f.Add([]byte("a=7"))
    f.Add([]byte(""))
    f.Fuzz(func(t *testing.T, input []byte) {
        record, err := Decode(input)
        if err != nil {
            return
        }
        again, err := Decode(Encode(record))
        if err != nil || again != record {
            t.Fatalf("round-trip mismatch: %v", err)
        }
    })
}
```

Go kernel assumes comparable Record fields and existing `testing` import. Golden asserts supplied acceptance and canonical encoding; retain owner's prescribed malformed-rejection cases too. Seed inclusion alone does not assert acceptance. Rust property constructs valid domain directly; separate assigned byte-input test covers panic/error contract.
**Evidence from executed, passing cases:** sampled valid Rust values preserve equality; Go executed bytes avoid panic, and accepted values satisfy relation. **Limit:** paired encoder/decoder can share same mistake; reject-all Go parser passes conditional fuzz relation but fails shown golden. Independent supplied goldens and acceptance checks matter. Coverage measures reached code, not semantic correctness; finite sampling misses cases.
**Optional source generation, same supplied law:** Python owner provides codec functions/types/domain → `ghostwriter.roundtrip(codec.encode, codec.decode, style="pytest")` returns test-source string → the backend specialist fills/reviews strategies and preserves `assert decode(encode(record)) == record`. This is actual source scaffolding; most other mechanisms generate data/sequences. Ghostwriter requires Black, emitted tests require Hypothesis; output CC0. `nothing()` placeholders, broad exception rejection or inferred `magic()` properties cannot substitute supplied acceptance.
Sources: [proptest generation/shrinking](https://docs.rs/proptest/1.11.0/proptest/), [Go native fuzzing/corpora](https://go.dev/doc/security/fuzz/), [Ghostwriter templates/output contract](https://hypothesis.readthedocs.io/en/latest/reference/integrations.html#ghostwriter).

## Shrinking, replay and runner integration

Shrinking repeatedly re-executes failing tests while simplifying inputs/action traces; minimum is relative to strategy, constraints and budget, not guaranteed globally smallest. Reset real state, IDs/clocks/fault schedules each trial. Preserve concrete failing value/trace plus requirement ID, code/schema/tool versions and fixture recipe; seed alone cannot restore external state.

| Tool | Shrink/replay artifact | Existing runner integration |
|---|---|---|
| Schemathesis | Hypothesis-reduced Case; validation failure cURL. Stateful replay needs full preceding sequence, not last cURL alone. | pytest assigned test/node; select operations/checks explicitly. Above `as_strategy` kernel uses positive generation, not every CLI phase. |
| fast-check | Reduced value; `seed` + `path`; commands additionally require `replayPath`. Retain concrete cases for durable regression. | Existing Bun/Vitest/Jest test; bounded runs. Explicit `examples` run first and count toward run budget. |
| Hypothesis | Reduced args/trace; database is cache. `@given` supports temporary version-bound `@reproduce_failure`; preserve `@example` or explicit stateful regression. | Existing pytest/unittest; `.TestCase` collects state machine. Report successful/invalid cases and executed actions. |
| proptest | Strategy/ValueTree shrinking; `proptest-regressions` stores seeds, not serialized values. Strategy changes can alter replay; preserve explicit input too. | Existing `cargo test` target/filter; retain assigned regression files. Published `Config` controls cases, rejects and shrink budget. |
| Go | Engine minimizes failure into `testdata/fuzz/FuzzPCodec/<hash>`; replay `go test -run='FuzzPCodec/<hash>'`. | Ordinary `go test` runs seeds/regressions only. Optional assigned `-fuzz='^FuzzPCodec$' -fuzztime=<budget>` explores new inputs. `$GOCACHE/fuzz` discovery corpus is not ordinary-test regression corpus. |

Replay sources: [Hypothesis persistence/version limits](https://hypothesis.readthedocs.io/en/latest/tutorial/replaying-failures.html), [fast-check command replay](https://fast-check.dev/docs/advanced/model-based-testing/#replay-model-based-tests), [proptest seed persistence](https://proptest-rs.github.io/proptest/proptest/failure-persistence.html), [proptest Config](https://docs.rs/proptest/1.11.0/proptest/test_runner/struct.Config.html), Go docs/source above.

## Useful evidence and delivery

- Deliver mapping `assigned requirement → test name → oracle → prescribed cases + generated domain → runner result/reproducer`. Execute exact assigned commands in package directories through existing project runner; retain its normal logs/artifacts and dependency policy.
- Generated happy-path green does not discharge prescribed negative/boundary/stateful tests. Documented 401s may satisfy response schemas while assigned success path never runs; confirm expected authenticated result and required workflow actions. Zero selected tests/cases, all skips/rejections or unsatisfied preconditions mean missing execution evidence, not acceptance.
- Concrete source warning: Go `runFuzzing` prints `"testing: warning: no fuzz tests to fuzz"` and returns success for zero matches. Inspect selected target/executed cases, not exit status alone. Keep generation health checks; record completion/interruption and generator rejection totals.
- Where test implementation is assigned, use owner's known-valid fixture and known-violating example/control to show assertion can pass/fail. Hand counterexample and replay to owning role; do not infer root cause or expand acceptance. No such controls or tests executed in this research.
- Recommendation: fast-check for assigned TS properties; Schemathesis when assigned API contract fits existing runner; Hypothesis for assigned Python stateful work; proptest/Go for assigned Rust/Go parser laws. Keep fuzzing bounded and task-specific. Integration needs no agent-evaluation platform, diagnostics service or mandatory fuzzing lane.
