# S2 → S4: observed full-package preparation blocker

This is a concrete local request for the shared runtime owner. It is not an applied S4 patch, a remote message, a successful import or permission to publish. It supplements the earlier `runtime-compatibility-note.md`, whose historical evidence remains unchanged.

## Exact attempted package and observed result

S2's thirteen required bodies now have actual PASS decisions from the same J1/J2 pair, with all four layer manifests preserved. The final package is 332,594 bytes, SHA256 `9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b`. Its root is `{"entry":"s2.l4.entry"}`.

The isolated native implementation was candidate `e3a8ab8cf56dbff1ee91272df51ffa398d882aa1`, discovered through release `20261111-v3-fresh-s4-r3`. The latest pre-operation discovery was S4 commit `c4a2992369f2309cbb5ffb8f166abbd7c3b81a4c`, release SHA256 `6de0b5f7a8911eb40c7fbcf74e74210805175ee580c0c8482249c016af1c0016`. No Git checkout or observed local HEAD is invented.

One actual `prepare` ran from 2026-11-11T20:48:51.158507Z to 20:48:52.041873Z and exited **1**. Complete stderr:

```json
{"kind":"error","error":"native-input-unavailable: file:modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/inputs/app-session-tree.json"}
```

The operation produced no candidate output or binding. Thirteen partial CAS files remain preserved. There was no automatic retry, cleanup, publish, consumer execution or update. The actual receipt is `evidence/native-final-prepare/prepare-execution-receipt.json`, SHA256 `234d2a18c572b19bbc6cdc1df01a3e89f4e911ab446a403ff6905c01eb91a410`; complete source/staging/CAS bytes are archived with a hash-verified preservation manifest.

## Required complete inputs and the two different limits

| Required input | Actual bytes | SHA256 |
|---|---:|---|
| S2 `inputs/app-session-tree.json` | 369,462 | `3eac99a7e7873be6d75df40bd8f0d40ce0b1b54a2aca2be246efe60a14377cd6` |
| S2 `inputs/design-tui-tree.json` | 390,775 | `371c3bc1b43acf10ab06d87c9128ea4e5caf6b612e682da2e78c84aece1521d9` |
| `schema/tui.json` | 1,131,057 | `16c4dd2d51f4b32b397cb9effa31cfc9c48dd7aa546f28b149f106e64d01d0e2` |

The native document reader's general **8 MiB** allowance does not resolve the independent **256,000-byte** direct-source/live-input limit. The pinned observer returns `unavailable` when its accumulated read exceeds that limit; the adapter also supplies 256000 to direct source and file-input reads. All three inputs exist and their complete hashes were verified. Only the first row was observed as the failing input in this actual invocation; the latter two are remaining static incompatibilities, not separately executed failures. Exact code excerpts and their hashes are in `evidence/native-final-input-cap-diagnosis.json`.

## Exact requested unblock condition

S4 must provide a new pinned compatible implementation and release whose source/input observation and native source reads consistently admit all three legitimate complete inputs across preparation, binding, publication, current reads and updates, while retaining bounded reads, immutable content identity, race checks, unsafe-path/symlink refusal and a real distinction between absent and unavailable. A valid S4 solution may choose its bounded policy, but it cannot silently omit, truncate, reclassify or replace these S2 inputs with transport digests or synthetic observations.

S2 will preserve this failed attempt and use a new isolated operation for the compatible implementation. Required local work after that dependency is available remains: complete preparation and binding, actual Atlas index/read consumers with the frozen budgets, S2-U1 update/restoration/reuse, compatible control bindings, and applicable CI. Public GitHub payload publication also has a separate unresolved automatic approval rejection; changing the runtime does not authorize disclosure.

The successful common-controls CI run at `7102f2e3a1a9a3822bcd0ae054b36ecffe9da553` does not change the native candidate retained in this release or supply a successful S2 import. Both the historical native-candidate CI failure and current scoped common-controls success remain visible in the final evidence.
