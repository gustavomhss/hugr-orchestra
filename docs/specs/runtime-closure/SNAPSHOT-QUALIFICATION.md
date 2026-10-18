# Task observation snapshot qualification — 2026-10-09

## Source identity

- Reviewed candidate: `5c6426d8f5bb0a473d15447dece6e205be7cc32c`.
- Composed source and successful prior Nix-request ancestry: `f48ed761aa23702ecea589628fd8a5c3929f6fa9`.
- Qualification base including the Windows compiler-acquisition repair: `905facae5508054e98f617f9345de8a3eaae9222`, tree `949c4cc0fa2ef4a4b861db1b92753a71e0a601ff`.
- Production updater blob: `9a863008a73a6f54ef8b67c5f69e48f19342f1d2`.
- Native workflow blob: `2cd60aac24191ef0e93f5cc49b0f52818ea11d6f`.

The candidate changes only the updater's representation at comparison time: `current(match.state)` supplies the current plain snapshot inside `produce`. Strict equality, stored ownership/placement/author facts, failure precedence and private receipt guards remain. The observation replaces only retained `metadata.workResult`.

## Measured first rejection

The previous actual runs failed on both operating systems: Core [37981431526](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37981431526) reported 73 passed / 8 failed across its selected files; Orchestra [37981431470](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37981431470) reported 88 passed / 2 failed. The eight Core failures were real eligible/restored host observations, including the live side of the fresh replay oracle. The two Orchestra failures were actual completed-native/dual Task delivery cases.

Temporary integrator instrumentation ran the unchanged real Core fixture and assertions through the actual database-backed projector and updater:

```sh
bun run test:ci core test/upstream-settlement-preservation.test.ts --os both --timeout 120000
```

Diagnostic [37988400717](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37988400717), head `18262711b544b006587ff07ba0e67191d2336679`, parent `f48ed761aa23702ecea589628fd8a5c3929f6fa9`: **24 passed / 0 failed / 251 assertions on each OS**, launcher exit 0. Linux job `114016065848`; Windows job `114016065380`.

For eligible native, legacy and dual authors, restored original/author/workspace facts, and live plus fresh replay:

| Measured value | Result on Linux and Windows |
|---|---|
| Database validation / observation present | true / true |
| Strict draft input versus validated input | false |
| Strict snapshot input versus validated input | true |
| Strict draft WorkResult versus validated previous WorkResult | false |
| Strict snapshot WorkResult versus validated previous WorkResult | true |
| Task/provider/agent/completed/receipt-free/parent/child predicates | all true |
| Original first false predicate | `input` |
| Snapshot first false predicate | none |
| `isDraft` on state / input / WorkResult | true |
| `isDraft` on snapshot / validated values | false |
| Constructor and object tags | `Object`, `[object Object]` for both representations |

Malformed and conflicting ownership/placement/author controls remained rejected; restored valid facts accepted. Positive assertions require the actual changed WorkResult and preservation of input, status, content and concurrent metadata. Replay reconstructs that same expected result in a fresh database. This establishes the representation mismatch in the measured Bun 1.3.14 environments; it does not assert a general comparator defect across engines or versions.

Instrumentation was removed before exact-source qualification; the production blob above was restored. No fixture, assertion, private facts, admission path or two-second Task timeout was relaxed.

## Exact-source qualification

- `bun typecheck` in `packages/core`: exit 0 on the exact production updater blob at `f48ed761aa23702ecea589628fd8a5c3929f6fa9`. The later base changes only the native workflow.
- Core guard [37988755149](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37988755149), head `d57ca4adf3dfb49c78938b02c2d7eb442bdb256f`, parent qualification base: **24 passed / 0 failed / 251 assertions on each OS**, launcher exit 0. Linux job `114017245712`; Windows job `114017245427`.
- Orchestra Task [37988830299](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37988830299), head `632db128c1bbdb80783cbdd061726dbba7c8d3a9`, parent qualification base: **35 passed / 0 failed / 78 assertions on each OS**, launcher exit 0. Linux job `114017503579`; Windows job `114017503305`. This includes the previously failing native/dual scheduler-to-private-settlement delivery cases with their unchanged two-second timeout.
- GitHub commit metadata confirms both exact-source test heads differ from the qualification base only by `.ci-run.json`.
- Core event/evaluator, the other four Orchestra selectors and Relay retain their prior unchanged-source results. They were not rerun for this representation-only repair.

The Orchestra command was:

```sh
bun run test:ci orchestra test/tool/task-backend-result.test.ts --os both --timeout 120000
```

## Windows x64 native repair

Native [37984603006](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37984603006), attempt 2, head `e2ec5a868f983da025e5eb3611589e1b39b2f986`: models, Linux x64/ARM64, Darwin Intel/ARM64 and Windows ARM64 producer/consumer succeeded. Windows x64 job `114008171552` failed in CLI build, before exporter or consumer qualification:

```text
error: Failed to extract executable for 'bun-windows-x64-baseline-v1.3.14'. The download may be incomplete.
```

The repair acquires the official `bun-v1.3.14/bun-windows-x64-baseline.zip`, release asset `418774449`, verifies SHA-256 `538f9c846355d9e847b2671bc00c47da4229a0befb24df3282b739770f3b475f`, extracts it and requires actual version `1.3.14` before placing that compiler on PATH. Bun's tagged `CompileTarget.zig` uses its current executable for a matching default target, avoiding the nondefault extraction path. The CLI still explicitly requests the baseline target; native host, exact version, exporter and consumer checks remain.

```sh
gh workflow run 379787522 --repo gustavomhss/hugr-orchestra --ref runtime-closure -f windows_x64_only=true
```

Failed-lane-only dispatch [37988853607](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37988853607), head qualification base: **success**, `gh run watch --exit-status` exit 0. Windows job `114017634907` executed verified baseline acquisition, matching native host, frozen/ignore-scripts installation, real model snapshot, actual CLI build, exporter/resource verification, compiled version, isolated daemon health, wrong-password and unauthenticated rejection, cleanup, report readback and upload. The actual report was independently downloaded:

```json
{"target":"windows-x64-baseline","version":"1.18.27","sha256":"f7071ab0f2a9ac16208bcce1b429fb754f3703197b8ffda9753b7e1bdc406742","healthy":true,"wrongPasswordRejected":true,"unauthenticatedRejected":true}
```

Report artifact `11644950455`, archive SHA-256 `d15c3726ea51f08f0d74c8898547a08354dc1aad2e5e76fc4d5fdc2141d1e245`, is bound by GitHub artifact metadata to that exact run/head. This explicit dispatch does not claim to qualify skipped lanes; their previous successful lane evidence remains separately identified. The default full matrix remains enabled. Independent static approval `ses_ede10b10bffeZj7Sr8S8b57wwj` covers the exact workflow delta and pinned publisher asset.

## Nix and operational boundaries

Nix [37981869304](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37981869304) successfully measured four native dependency outputs and completion controls on the earlier `9c76824c5ce27849f42685dc3579e3201e6103af` request. Its ancestry is preserved and `ready: false` remains. No candidate hashes were applied.

The updater changed from `3f4db93e7a` to the production blob above. All-package dependency input fingerprinting therefore requires a fresh four-platform measurement against the next qualified freeze, even if a resulting NAR happens to match. Relay remains the sole Nix capture/hash writer. Measurement success is not distribution/consumer acceptance.

OAuth, credentials, model inference, launcher and real Maestro pilot were not exercised by these checks. Desktop, WSL and remaining milestone acceptance stay open.
