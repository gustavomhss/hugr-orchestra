# SURFACE — L2 notes, author wave v1

## Scope and evidence level

Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocol pin: `ee2521a5b966bd505cc95bd1c733e09e12f33531`.

This author owns 112 paths: Node bindings and their tests, packaging/build/maintenance scripts, configuration, skills, historical plans/research, licenses and the Cargo lockfile. All 112 exact blobs were fetched through GitHub MCP and checked against the assigned Git blob SHA and size. The captured files total 1,139,526 bytes and 16,615 lines; each was read in full in finite chunks. Ten immutable v1 record arrays contain 112 file-specific records and 336 exact excerpts. `capture.json`, `read-ledger.json` and `mechanical-validation.json` preserve the capture and read accounting. Sixteen early complete reads were entered retrospectively into the ledger with an explicit note because they preceded the ledger helper.

These are static observations and documented claims. **Runtime status is NOT_RUN throughout.** No product test, analyzed script, workflow, installation, build or publication was executed. Mechanical consistency is not independent semantic acceptance. Support-only context is not counted as owned source. No private cases or other authors’ records were consulted. All source references below are relative to `native/omni/` at the pinned commit.

## 1. Binding boundary: loading, conversion and lifecycle are separate concerns

The JavaScript facade first resolves a configured addon path, then `HUGR_OMNI_ADDON`, then an installed platform package. A checkout build is a fallback only when configuration has not become explicit. A configured supervisor alone makes configuration explicit; an environment supervisor override alone does not have that effect. `configure()` eagerly loads, validates nonempty path strings, rejects replacement of an already loaded addon, and refuses calls after execution has started. The flag is set before invoking native spawn/run, so a failed native invocation can still close configuration. Unsupported or unavailable addon loading produces ordinary loader errors; invalid configuration uses the facade’s Omni error construction. Sources: `bindings/node/index.js:76–142,299–310`.

The facade snapshots current JavaScript `process.env`, including Bun-visible mutations, before applying explicit environment changes. Windows names are folded for replacement; invalid caller values are retained for native validation rather than silently repaired. Nullish optional values and omitted arguments are normalized at the boundary. The native conversion module delegates command/number/environment validation to the core’s public binding seam; it is not an independent command launcher. One WeakMap entry and one listener connect each AbortSignal to native cancellation. Sources: `bindings/node/index.js:160–209`, `bindings/node/src/convert.rs`.

There is an intentional error-shape distinction: `spawn()` throws startup/conversion errors synchronously, while `run()` and the promise-returning wrappers turn synchronous failures into rejections. The child wrapper requests its native exit promise immediately, caches it, and attaches a rejection sink; later `wait()` calls observe that promise. Output is claimed at first iteration, and the generator’s finally block detaches it. Chunks are batched natively in groups of up to 8192; an error encountered after useful batch data is deferred to a subsequent call. Sources: `bindings/node/index.js:185–232,299–310`, `bindings/node/src/child.rs:27,214–300`.

Garbage collection and environment teardown have different contracts. A collected NativeChild transfers an Arc to a keeper, which waits for root exit and polls inventory approximately once a second until empty. An inventory error also ends keeping; it is not affirmative proof of an empty tree. Environment cleanup uses weak ownership entries, issues force stops and waits under one shared five-second bound, without calling JavaScript. A timeout or ignored stop error is not proof that every tree has gone. Host death cleanup is a separate supervisor responsibility. The binding’s executor is one process-wide polling thread, not a second Tokio runtime; its first future poll occurs on the JavaScript caller thread. Sources: `bindings/node/src/child.rs:171–197`, `bindings/node/src/teardown.rs:1–21` and its cleanup implementation, `bindings/node/src/exec.rs:1–7,69–106`.

## 2. Contract-runner strictness does not imply complete API vocabulary

The runner validates the whole scenario before deciding whether an item is pending. Pending status can absorb a product failure, but cannot hide malformed input, harness/oracle failure, duplicate or unknown ledger items, or a pending item that now passes. Its matchers distinguish exact keys, unordered one-to-one process matches, Unicode code-point lengths and byte hex. The OS oracle is separate from the product’s `processes()`: Linux zombie/dead states are treated as no longer running; unknown inspection results fail closed, and Windows tasklist parsing checks CSV structure. Sources: `bindings/node/test/runner/{schema,ledger,suite,expect,pattern,os}.mjs`.

A concrete baseline gap remains: the schema cannot express `maxRssBytes`, `backpressure`, or a `memory_exceeded` expectation even though those appear in the current declarations. This is a limitation of this scenario DSL, **not** a claim that all tests omit these features. The direct hardening test source separately exercises a 64 MiB stalled consumer with backpressure and byte equality. In the default dropping case it checks accounting without requiring loss to occur on every machine. Sources: `bindings/node/test/runner/schema.mjs:6–9,133–149`, `bindings/node/index.d.ts:64–67,98–103,147`, `bindings/node/test/hardening.mjs`.

**Exact source: `bindings/node/test/runner/schema.mjs:6–9`**

```text
const CODES = ["NOT_FOUND", "NOT_EXECUTABLE", "INVALID_CWD", "INVALID_ARGUMENT", "ABORTED", "OUTPUT_LIMIT", "CLOSED", "IO"];
const REASONS = ["exit", "signal", "killed", "timeout", "aborted"];
const EXIT = ["exitCode", "signal", "reason", "success"];
const STREAMS = ["stdout", "stderr", "pty"];
```

**Exact source: `bindings/node/test/runner/schema.mjs:133–149`**

```text
function options(v) {
  for (const [k, o] of Object.entries(object(v))) {
    try {
      if (k === "cwd" || k === "windowsVerbatimArgs") text(o);
      else if (k === "env") {
        if (!Object.values(object(o)).every((x) => typeof x === "string" || x === null)) fail("env values are text or null");
      } else if (["inheritEnv", "text", "mergeStderr"].includes(k)) boolean(o);
      else if (["timeoutMs", "graceMs", "maxOutputBytes"].includes(k)) {
        if (typeof o === "number") continue;
        if (!isObject(o) || Object.keys(o).length !== 1) fail('want a number or {"$number": ...}');
        oneOf(o.$number, ["NaN", "Infinity", "-Infinity"]);
      } else if (k === "input") data(o);
      else if (k === "stdin") oneOf(o, ["pipe", "closed"]);
      else if (k === "pty") {
        if (o === true) continue;
        for (const [d, n] of Object.entries(object(o))) if (!["cols", "rows"].includes(d) || typeof n !== "number") fail(`bad pty ${d}: ${show(n)}`);
      } else fail("unknown option");
```

**Exact source: `bindings/node/index.d.ts:64–67`**

```text
   * Memory cap for the whole tree: the resident memory (RSS) of every live process of the tree is summed every 250 ms,
   * and above this many bytes the tree is killed at once and `reason` is `"memory_exceeded"`. No cap by default.
   */
  maxRssBytes?: number;
```

**Exact source: `bindings/node/index.d.ts:98–103`**

```text
  /**
   * Pipe mode only, default `false` (amendment WP-H): while a consumer is attached and 16 MiB of a stream wait for it,
   * the library stops reading that stream, so the child blocks on its writes instead of output being dropped (no
   * `lostBefore`). `wait()` and `stop()` never wait for the consumer; with no consumer attached, the usual budget applies.
   */
  backpressure?: boolean;
```

**Exact source: `bindings/node/index.d.ts:147–147`**

```text
  reason: "exit" | "signal" | "killed" | "timeout" | "aborted" | "memory_exceeded";
```

## 3. Build, packing and installation proofs have distinct gates

The platform table contains eight native packages plus the JavaScript main package. All versions must agree, and platform packages carry an addon and adjacent supervisor with no install script. Linux GNU addons target a glibc 2.17 floor; Linux supervisors are static musl for both GNU and musl packages; musl addons link musl dynamically. Header inspection checks ELF/PE/Mach-O CPU identity, Linux supervisor staticness through absence of PT_INTERP and DT_NEEDED, and the addon’s libc family. A static PIE may retain PT_DYNAMIC for relocations. Sources: `bindings/node/npm/pack.mjs:21–115,125–156`.

Packing consumes existing binaries and deletes/recreates the entire selected output directory. It does not build or publish. Tarball content and supervisor executable bits are checked, but the executable-bit assertion is skipped on Windows. A Windows-generated main tarball therefore is not equivalent evidence for POSIX execute modes. Source: `bindings/node/npm/pack.mjs:137–156`.

The installation verifier serves local tarballs through a read-only localhost registry and builds a fresh project. It checks actual runtime identity and binary CPU, including musl linkage for Bun; Bun/Deno may install the alternate-libc package because they do not honor the libc selector. Windows PE import checking includes direct and delayed imports, denies VCRUNTIME/MSVCP families and requires KERNEL32 as a positive control. The verifier clears exactly `HUGR_OMNI_ADDON`, `HUGR_OMNI_SUPERVISOR` and `CARGO_TARGET_DIR`, not every conceivable ambient influence. Quickstart shell commands have 30-second bounds, runtime discovery 120 seconds, while TypeScript compilation has no explicit local timeout. Source: `bindings/node/npm/verify.mjs:118–122,162–200` and its compile/proof code.

The artifact builder requires the target’s native OS **and CPU**, even for the Zig GNU build. It records HEAD, root tree and Omni tree hashes, optionally checks `HUGR_PROOF_HEAD`, but does not assert a clean working tree. Those recorded committed hashes alone cannot establish that an arbitrary mutable checkout’s compiled bytes equal the commit. Existing-musl-guest mode accepts only value `1` and a musl target; its checks include Rust host, dynamic musl Node, ELF CPU, loaded-library maps and loader identity. The caller owns the guest/container lifecycle. Sources: `scripts/build-artifacts.mjs:42–74` and its existing-guest validator.

The main CI program’s fast gate already includes Bun contract and hardening, alongside Node 22 and Rust/static steps. Release mode adds Node 24, remaining Bun work, Deno, executed docs/skills examples, release K4, musl supervisor and K9 installation work. Static checks are Linux-selected. The legacy K9 branches in `ci.mjs` choose Linux x64 GNU and Windows x64, whereas the separate artifact workflow has eight native target rows. The manual release workflow uploads tarballs and proof artifacts; it does not publish packages. Sources: `scripts/ci.mjs:17,56–112`, `.github/workflows/release.yml:1–29,61–83`.

## 4. Static checks establish bounded properties

The current size guard counts raw physical lines in tracked code, including tests, with one ceiling of 400 and no exception list. Unknown code classifications or inability to enumerate inputs fail distinctly from an oversize file. Its older review prompt still asks for >600 as a split-plan finding and >650 as a P0, while current AGENTS also says 400. This is an observable maintenance inconsistency, not permission to adopt the old threshold. Sources: `scripts/file-size-guard.py:1–25`, `AGENTS.md:54–55`, `scripts/review-prompt.py:45–46`, `PLAN.md:765–766,869`.

The other checks have useful but narrow scopes:

- Guarantees checking validates structure, statuses, links and scenario-name references. A green CI URL shape is not a fetched result, and finding a scenario identifier does not prove its assertion.
- Surface parity compares the enumerated TypeScript/Rust concept paths. It does not prove equal values or Python parity. The TypeScript surface parser does not compare every literal-union member, which helps explain how a new reason can evade some forms of drift detection.
- Rust surface scanning is a bounded rustfmt-style parser: it refuses macros/include/path forms and unknown syntax rather than expanding every Rust language construct. It is not a compiler.
- Binding architecture checking combines source text with cargo metadata; computed aliases/macros can exceed its model, and development dependencies are not treated like runtime binding dependencies.
- Skill checking examines selected backticked identifiers plus a foreign-name ledger. It cannot establish that every prose claim and fenced example is current.
- README checks enforce recognizable quickstart forms and compile extracted TypeScript; the explicit pre-release install exception remains. The docs execution helper checks its known pidfile processes, not an independently enumerated universe of all descendants.
- Plan-section checking matches required labels. A comment about sandbox-link checking does not implement that check.

Sources: `scripts/guarantees-check/check.mjs`, `scripts/surface-check/{dts,rust,binding,parity}.mjs`, `scripts/skill-check/{check,markdown}.mjs`, `scripts/readme-check/{blocks,check,run}.mjs`, `scripts/plan-sections-check.py`. Their corresponding tests are assertions in source, not executed evidence here.

## 5. Concrete documentation drift to reconcile

These are directions for a future authorized maintenance change; this author changed no product file.

| Topic | Older or incomplete statement | Current counterpart and practical consequence |
|---|---|---|
| Output pressure | `skills/omni-processes/SKILL.md:84–94` and `skills/omni-migrate/SKILL.md:73–77` say output never blocks | `bindings/node/index.d.ts:98–103` declares opt-in `backpressure`; explain default dropping separately from a consumer-attached stream that can block its writer. |
| Exit reason | `skills/omni-lifecycle/SKILL.md:75–81` and `docs/guide/recipes.md:302–308` omit the memory limit reason | `bindings/node/index.d.ts:147` includes `memory_exceeded`; update result-reading examples and the scenario vocabulary together. |
| Explicit Windows command line | `skills/omni-processes/references/windows.md:28–31` calls the verbatim option planned; migration text also retains that wording | `bindings/node/index.d.ts:75–85` exposes `windowsVerbatimArgs`; the migration skill itself describes it later. Avoid steering readers around an implemented option. |
| Package count | `skills/omni-release/SKILL.md:81` says five optional dependencies | The same file says eight at lines 42–43 and names all eight at 67–69; `pack.mjs:25–33,125–134` enforces the eight-package table. |
| Bun gate | Conformance/gates skill text places Bun in release-only work | `scripts/ci.mjs:64–66` runs Bun contract/hardening in the fast gate; release still adds other Bun work. |
| Dependency allowlist | Core-change skill lists the earlier dependency set | Current `AGENTS.md:69` explicitly includes sysinfo for tree RSS; the lockfile’s presence of sysinfo is not by itself a forbidden dependency. |
| Integration default | `skills/omni-migrate/references/orchestra.md:9–10` describes unset selection as legacy | `docs/ux/WP9a-default-on.md:12–14` records default Omni with explicit fallback. Historical integration paths also retain the former `packages/omni` location. |

The new-target skill’s three-place checklist should also be compared with the current shared artifact target definitions before a target is added. It should not be treated as an exhaustive dependency map solely because it is a skill.

## 6. Historical research and review are evidence about decisions

ADRs 0001–0003 explicitly warn that they were rejected as a product baseline. Their host-side fork, watcher, registration-gap and console designs must not be reintroduced as current architecture. ADR-0005 is the adopted supervisor decision; source implementations still need their own evidence. The supervisor review is an accept-with-changes artifact, not a proof that each requested change exists in this baseline. Sources: `docs/adr/0001-process-model.md`, `0002-host-exit.md`, `0003-pty.md`; `docs/research/adr-reviews-s1-s2.md`, `supervisor-review.md`; `PLAN.md:851–856`.

The landscape’s 81.8% score is weighted documentary coverage across 22 behaviors, not measured compatibility. It installed or executed no candidate. Its later spot-check found 12 supported and eight partially supported cells, and identified overstated Y cells. The combined-library score ignores integration cost. Subsequent processkit fit was 1/24 without adaptation; G0 chose an owned core and TypeScript first. The practical evaluation preserves Windows non-execution and other local/cache/retry qualifications. These records explain why an early adopt recommendation was superseded; they do not provide a current library recommendation. Sources: `docs/research/landscape.md:3–5,48–59,627–633`, `processkit-fit.md`, `processkit-eval.md`, `docs/decisions/G0.md`.

The pain study’s 1,592 issue count comes from directed discovery. It is neither an incidence rate nor a count of uniquely proven root causes: only excerpts were read, 109/650 queries hit a cap, and the lead’s five-item check found two loose classifications. Cold-user and integration reports likewise preserve their own source revisions, local environments, failed attempts, reruns and acceptance/signature qualifications. Historical npm publication, Developer ID/notarization, or later integration work marked deferred remains deferred evidence, not new authorization. Sources: `docs/research/pain.md`, `docs/ux/{Q2-cold-users-v0.1,WP10-orchestra-integration,WP9a-default-on}.md`, `HANDOFF.md`.

## 7. Lockfile and legal-text disposition

Cargo.lock was read in full and treated as a pinned package/version/registry/checksum/dependency graph, including platform-specific transitive namespaces. That reading does not audit the implementations of every dependency. The MIT and Apache files were classified as license texts with their notice, permission, disclaimer and redistribution/patent conditions; the records do not offer a legal conclusion about downstream compliance.

## Handoff and remaining limits

Owned-path coverage and exact-source capture are complete. The mechanical report records zero metadata/excerpt/assignment/read-range errors; it does not issue a semantic verdict. Cross-layer implementation and real OS behavior require independent review and, only if later authorized, execution. Current concrete gaps above remain in the frozen product baseline. No formal L3/L4 artifact was created. Original v1 record arrays are preserved; any requested corrections must be separate v2 records plus a delta.

