# R43 — executable business kernels against supplied properties

Research date: 2026-10-03. Primary release sources, docs, implementation and test bodies inspected. All snippets, commands and control outcomes below are **unexecuted proposals**; checked-in test expectations are upstream evidence, not local results. No tool installation or compiler/solver/test execution performed.

## Ranked role fit / adoption cost
| Rank | Mechanism | Verdict | Cost / prerequisite |
|---|---|---|---|
| 1 | Kani: symbolic verification of production Rust | **Ready niche** | Lowest source disruption: handwritten kernel plus harness; pinned Rust/Kani/CBMC toolchain. Path/heap/loop growth can exhaust solver resources. |
| 2 | Verus: deductive Rust, including verified functional-spec compilation | **Conditional; strongest generation niche** | Existing/approved Verus lane and supported Rust fragment. Functional specs can generate executable counterparts; relational contracts still need implementation/proof work. |
| 3 | Dafny: verify implementation, then generate target-language source | **Conditional** | Dafny source plus generated runtime/ABI already permitted. Otherwise adoption changes architecture outside Charlie's assignment. |

Charlie receives immutable properties, chosen algorithm/design, authorized paths, language/runtime, assigned proof/test obligations and resource budget. Charlie writes implementation and necessary proof terms/invariants inside that packet. Requirements, architecture, stronger preconditions and weaker acceptance remain owner decisions. Existing harness owns persistence/cache/permissions.

## Fixed assignment fixture
Inputs `used, cap, qty ∈ [0, 2^32−1]`; precondition **`used <= cap`**. Return `(ok, next)` with **P**: `ok ⇔ used + qty <= cap`; `next = (ok ? used + qty : used)`; `next <= cap`. Specification sums use mathematical integers. Chosen implementation checks remaining capacity before machine addition. Pure transition only; DB commit/concurrency are outside this assigned property.
Fixed witnesses: `(7,10,3) → (true,10)`; `(7,10,4) → (false,7)`; `(4294967294,4294967295,2) → (false,4294967294)`. Zero quantity remains admissible, including full capacity. These fixtures illustrate supplied acceptance, not requirements discovery.

## 1. Kani — prove actual Rust over symbolic inputs
**Input → work:** P maps to harness assertions; precondition maps exactly to `kani::assume`. Charlie writes this production body and assigned harness in authorized Rust module [K1].
```rust
pub fn reserve(used: u32, cap: u32, qty: u32) -> (bool, u32) {
    if qty > cap - used { return (false, used); }
    (true, used + qty)
}

#[cfg(kani)]
#[kani::proof]
fn reservation_contract() {
    let used: u32 = kani::any();
    let cap: u32 = kani::any();
    let qty: u32 = kani::any();
    kani::assume(used <= cap);
    let r = reserve(used, cap, qty);
    let sum = u64::from(used) + u64::from(qty);
    assert_eq!(r.0, sum <= u64::from(cap));
    assert_eq!(u64::from(r.1), if r.0 { sum } else { u64::from(used) });
    assert!(r.1 <= cap);
    kani::cover!(used == 7 && cap == 10 && qty == 3);
}
```
**CLI → artifact:** `cargo kani --harness reservation_contract` produces per-property verdicts/counterexamples; optional `-Z concrete-playback --concrete-playback=print` emits failing Rust playback tests [K4]. Ordinary `cargo build --release` builds Charlie's kernel; Kani does not generate business implementation.
**Reach:** loop-free fixture quantifies over every admitted `u32` triple, not sampled values. This is full coverage of this finite input domain, conditional on encoding/tool soundness—not whole-service correctness. Preconditions constrain callers; harness assumptions add no production validation.
**Bounds/trust:** parser/inbox extensions need owner-specified maximum lengths/history plus unwind bounds; every unwinding assertion must pass. Length-N proof says nothing about N+1; insufficient unwind, timeout or unsupported feature is inconclusive, not success [K2], [K3]. Trust Rust lowering, Kani models, CBMC/backend solver and production compiler. Sequential only; aliasing UB is not fully checked; some validity/uninitialized checks are opt-in. System calls/I/O need models; print overrides skip I/O [K2], [K6].
**Source teeth:** upstream `reachable_pass/test.rs` exercises safe subtraction; `reachable_fail/test.rs` calls `cond_reduce(40,42)` then subtracts 50; expected file records `"attempt to subtract with overflow"` [K5]. Cover example explicitly expects `SATISFIED` [K7].

## 2. Verus — deductive proof, with real spec-to-exec generation
**Input → code:** when supplied design includes executable-shaped functional spec, `exec_spec_verified!` generates `exec_<name>` and verifies equivalence, arithmetic safety and generated obligations [V1]. Implementation source maps `recommends` into generated `requires`, with `res.deep_view() =~~= spec(...)` postcondition [V2]. This is restricted compilation, not synthesis from arbitrary postconditions.
```rust
use vstd::contrib::exec_spec::exec_spec_verified;
use vstd::prelude::{DeepView, int, verus};
verus! {
exec_spec_verified! {
    pub open spec fn reservation(used: u32, cap: u32, qty: u32) -> (bool, u32)
        recommends used <= cap
    {
        if qty > cap - used { (false, used) }
        else { (true, (used + qty) as u32) }
    }
}
pub fn reserve(used: u32, cap: u32, qty: u32) -> (r: (bool, u32))
    requires used <= cap,
    ensures
        r.0 == (used as int + qty as int <= cap as int),
        r.1 as int == (if r.0 { used as int + qty as int } else { used as int }),
        r.1 <= cap,
{
    exec_reservation(used, cap, qty)
}
fn main() {
    let r = reserve(7, 10, 3);
    assert(r.0 && r.1 == 10);
}
}
```
**Charlie writes:** supplied-model transcription, wrapper binding generated function to independent P, necessary proofs and approved integration. With only relational P supplied, Charlie writes chosen algorithm in `exec` Rust and discharges `requires/ensures`, invariants and lemmas instead.
**CLI → artifact:** `verus reservation.rs` gives verification diagnostics; `verus reservation.rs --compile` additionally emits native executable with ghost/spec/proof code erased [V5]. Generated function is executable Rust inside macro expansion, not separately hand-maintained translation.
**Reach/cost:** deductive proofs can establish invariants for arbitrary sizes through induction, without selecting loop-unwind depth. Rust subset, proof maintenance, quantifier triggers and solver sensitivity remain real costs. General executable-code termination needs care; lightweight decreases checks assume callees terminate [V6].
**Trust:** verifier/encoding, Z3, vstd assumptions, Rust/LLVM and foreign callers. `assume`, `external_body` and external specifications can bypass body proofs [V4]. Crucially, even `exec_spec_verified!` has documented **unverified translations** for many Map/Set/Seq operations; `exec_spec_unverified!` explicitly trusts equivalence [V1]. Primitive fixture avoids those collection adapters. DB/FFI contracts still require separate evidence; generated `requires` are not automatic boundary checks.
**Source teeth:** `test_exec_spec_arith` supplies bounds and expects `Ok(())`; `test_exec_spec_error_span` omits overflow precondition for `p.0[0] + 10` and expects a verification failure. Tuple/interop bodies exercise generated executable calls [V3]. Expectations inspected, suite not run.
**Creusot alternative within this mechanism:** viable when project already chose it. Same handwritten Rust body can carry `#[requires(used <= cap)]`, `#[ensures(result.0 == (used@ + qty@ <= cap@))]`, `#[ensures(result.1@ == if result.0 { used@ + qty@ } else { used@ })]`, `#[ensures(result.1 <= cap)]`. `cargo creusot` translates Rust to Coma and invokes Why3find/provers; Coma files and proof records are evidence, ordinary Cargo build supplies executable [C1]. Charlie owns annotations/lemmas, not synthesized implementation. Binary-search example has real body, functional postconditions and loop invariants [C2].
Creusot adds pinned compiler plus Why3/Why3find/OCaml/prover maintenance [C4]; trust includes translation, logical library, Why3/provers, Rust compiler and `#[trusted]`/external contracts [C3]. **Reject introducing a second Rust proof stack for this small task**; existing Creusot lane can outrank migration to Verus. Same P and fixed mutants below apply.

## 3. Dafny — verified source becomes callable backend code
**Input → work:** owner supplies P and permits Dafny → C# boundary. Charlie writes chosen algorithm body plus proof annotations; verifier does not invent method body. Equivalent input domain is explicit because `nat` is mathematical, not `u32`.
```dafny
method Reserve(used: nat, cap: nat, qty: nat) returns (ok: bool, next: nat)
  requires used <= cap <= 4294967295 && qty <= 4294967295
  ensures ok <==> used + qty <= cap
  ensures next == (if ok then used + qty else used)
  ensures next <= cap
{
  ok := qty <= cap - used;
  next := if ok then used + qty else used;
}
method Positive() {
  var ok, next := Reserve(7, 10, 3);
  assert ok && next == 10;
}
```
**CLI → artifacts:** `dafny verify Reservation.dfy`; `dafny translate cs Reservation.dfy --include-runtime --output Reservation.cs`; `dafny build --target:cs Reservation.dfy --output:Reservation`. Translation verifies by default and emits callable C# plus runtime; build produces .NET library when Main absent [D1]. Other supported release targets include Go, Java, JavaScript and Python. Generated target source is compiler output; Charlie edits Dafny and authorized adapters.
**Trust/cost:** Dafny → Boogie → Z3 establishes source obligations; compiler, target compiler/runtime, libraries and external implementations remain trusted. Ghost contracts erase; host callers must enforce preconditions and preserve integer representation/ranges. Proof over mathematical integers is not proof that arbitrary handwritten `uint` translation matches. Unbounded inductive proofs are possible; target memory/array limits and termination exceptions still matter [D1].
**Evidence:** verifier output plus generated-source provenance; `dafny audit Reservation.dfy` reports assumptions, skipped verification and extern contracts, but **exit 0 can include findings** [D1]. Upstream `Hello.dfy` invokes compiler test harness; `ensuresReporting.dfy` and its expected output exercise failing postconditions [D2], [D3].
**Synthesis rejection:** Dafny `{:synthesize}` generates C# mocking-framework calls for restricted fresh-object postconditions, requiring Moq [D4]. Unsuitable as general reservation/business-code synthesizer. Verus functional-spec compilation above is narrower but produces actual implementation.

## Fixed controls and handoff evidence
All outcomes below are expected obligations for later authorized execution, not measured passes/failures. Keep owner P/preconditions fixed; mutate disposable implementation copy only.
| Lane | Positive control | Fixed failing control / required diagnosis |
|---|---|---|
| Kani | Correct body + symbolic P verifies; literal witness cover is `SATISFIED`. | Change rejection guard `qty > cap - used` to `qty >= cap - used`; `(7,10,3)` violates acceptance assertion. |
| Verus | Generated body + independent wrapper P verifies; `main` proves fixed witness. | Replace wrapper call with `(false, used)`; `(7,10,3)` falsifies wrapper acceptance postcondition. |
| Creusot | Correct body with P annotations discharges; literal caller establishes precondition witness. | Same `>` → `>=` body mutation; acceptance VC cannot be proved. |
| Dafny | Correct body + P + `Positive` verifies and compiles. | Change `ok := qty <= cap - used` to strict `<`; `(7,10,3)` falsifies acceptance postcondition. |
Record contract/source revision, exact toolchain/solver/config/target, entrypoints checked, assumptions/bounds, complete diagnostics, expected failing obligation, generated artifact provenance and already-assigned integration results. A parse error, solver timeout, skipped declaration or compiler failure is not successful mutation detection. Never accept renamed/strengthened preconditions as a fix.

**Beyond existing tests:** where prescribed tests sample inputs, Kani adds exhaustive reasoning inside declared finite scope; deductive lanes discharge supplied invariants across arbitrary sizes; verified-source generation removes independent implementation/spec translation for supported fragments. If prescribed tests already execute these proof obligations, incremental value is generation/proof construction only. These tools provide a stronger implementation oracle, not missing requirements or DB/network/crash correctness. State-machine idempotency proof would cover supplied transition semantics; durable exactly-once effects still need assigned transaction/recovery obligations.

## Release pins / project licenses
Latest releases returned by upstream GitHub release APIs on research date; SHAs resolved through commit API. Links below pin inspected source; license claims concern named projects, not every bundled dependency.
| Tool | Release | Commit SHA | License source |
|---|---|---|---|
| Kani | [0.68.0](https://github.com/model-checking/kani/releases/tag/kani-0.68.0) | `0d2328a93f0e0ff66132d6bfa1a7d884877cf862` | [Apache-2.0 OR MIT](https://github.com/model-checking/kani/blob/0d2328a93f0e0ff66132d6bfa1a7d884877cf862/README.md#license) |
| Verus | [0.2026.09.27.3cf1832](https://github.com/verus-lang/verus/releases/tag/release/0.2026.09.27.3cf1832) | `3cf18325f0fd0c3040fbdec8c0f2255c0504c91a` | [MIT](https://github.com/verus-lang/verus/blob/3cf18325f0fd0c3040fbdec8c0f2255c0504c91a/LICENSE) |
| Creusot | [0.13.0](https://github.com/creusot-rs/creusot/releases/tag/v0.13.0) | `318615be3b8bbc60d1f6d52469ba5c0bdebed4f1` | [LGPL-2.1-or-later](https://github.com/creusot-rs/creusot/blob/318615be3b8bbc60d1f6d52469ba5c0bdebed4f1/creusot/Cargo.toml); [creusot-std same](https://github.com/creusot-rs/creusot/blob/318615be3b8bbc60d1f6d52469ba5c0bdebed4f1/creusot-std/Cargo.toml) |
| Dafny | [4.11.0](https://github.com/dafny-lang/dafny/releases/tag/v4.11.0) | `fcb2042d6d043a2634f0854338c08feeaaaf4ae2` | [MIT](https://github.com/dafny-lang/dafny/blob/fcb2042d6d043a2634f0854338c08feeaaaf4ae2/LICENSE.txt) |

[K1]: https://github.com/model-checking/kani/blob/0d2328a93f0e0ff66132d6bfa1a7d884877cf862/docs/src/tutorial-nondeterministic-variables.md
[K2]: https://github.com/model-checking/kani/blob/0d2328a93f0e0ff66132d6bfa1a7d884877cf862/docs/src/soundness.md
[K3]: https://github.com/model-checking/kani/blob/0d2328a93f0e0ff66132d6bfa1a7d884877cf862/docs/src/tutorial-loop-unwinding.md
[K4]: https://github.com/model-checking/kani/blob/0d2328a93f0e0ff66132d6bfa1a7d884877cf862/docs/src/reference/experimental/concrete-playback.md
[K5]: https://github.com/model-checking/kani/tree/0d2328a93f0e0ff66132d6bfa1a7d884877cf862/tests/expected/reach/overflow
[K6]: https://github.com/model-checking/kani/blob/0d2328a93f0e0ff66132d6bfa1a7d884877cf862/docs/src/overrides.md
[K7]: https://github.com/model-checking/kani/tree/0d2328a93f0e0ff66132d6bfa1a7d884877cf862/tests/expected/cover/cover-pass
[V1]: https://github.com/verus-lang/verus/blob/3cf18325f0fd0c3040fbdec8c0f2255c0504c91a/source/docs/guide/src/exec_spec.md
[V2]: https://github.com/verus-lang/verus/blob/3cf18325f0fd0c3040fbdec8c0f2255c0504c91a/source/builtin_macros/src/contrib/exec_spec.rs#L841-L969
[V3]: https://github.com/verus-lang/verus/blob/3cf18325f0fd0c3040fbdec8c0f2255c0504c91a/source/rust_verify_test/tests/exec_spec_verified.rs
[V4]: https://github.com/verus-lang/verus/blob/3cf18325f0fd0c3040fbdec8c0f2255c0504c91a/source/docs/guide/src/tcb.md
[V5]: https://github.com/verus-lang/verus/blob/3cf18325f0fd0c3040fbdec8c0f2255c0504c91a/source/docs/guide/src/getting_started_cmd_line.md
[V6]: https://github.com/verus-lang/verus/blob/3cf18325f0fd0c3040fbdec8c0f2255c0504c91a/source/docs/guide/src/exec_termination.md
[C1]: https://github.com/creusot-rs/creusot/blob/318615be3b8bbc60d1f6d52469ba5c0bdebed4f1/guide/src/quickstart.md
[C2]: https://github.com/creusot-rs/creusot/blob/318615be3b8bbc60d1f6d52469ba5c0bdebed4f1/examples/binary_search.rs
[C3]: https://github.com/creusot-rs/creusot/blob/318615be3b8bbc60d1f6d52469ba5c0bdebed4f1/guide/src/trusted.md
[C4]: https://github.com/creusot-rs/creusot/blob/318615be3b8bbc60d1f6d52469ba5c0bdebed4f1/guide/src/installation.md
[D1]: https://github.com/dafny-lang/dafny/blob/fcb2042d6d043a2634f0854338c08feeaaaf4ae2/docs/DafnyRef/UserGuide.md
[D2]: https://github.com/dafny-lang/dafny/blob/fcb2042d6d043a2634f0854338c08feeaaaf4ae2/Source/IntegrationTests/TestFiles/LitTests/LitTest/ast/functions/ensuresReporting.dfy
[D3]: https://github.com/dafny-lang/dafny/blob/fcb2042d6d043a2634f0854338c08feeaaaf4ae2/Source/IntegrationTests/TestFiles/LitTests/LitTest/comp/Hello.dfy
[D4]: https://github.com/dafny-lang/dafny/blob/fcb2042d6d043a2634f0854338c08feeaaaf4ae2/docs/DafnyRef/Attributes.md#11227-synthesize
