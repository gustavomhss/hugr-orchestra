# Source qualification checkpoint

This checkpoint preserves partial results without closing the nine remaining findings. The campaign still has one PR, #1463, targeting `dev`: 55 new verified fixes, one previously fixed finding and nine open findings.

## L11: joint memory receipt source

Five source commits from `memory-receipts` were integrated through `45b6a69443`. Root and the independent reviewer read the complete implementation. The receipt publishes the decision and indexed memory together through one immutable create-only link; the same validator feeds both projections. It binds the receipt to the actual raw proposal, preserves legacy records, reconciles exact retries and refuses partial or inconsistent inputs.

The Linux boundary run [43331830032](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43331830032) passed 60 tests with 508 assertions. The Core run [43331830533](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43331830533) passed five tests with 138 assertions and 39 Omni spawns. Both test and cleanup jobs succeeded. These include independent-process contention, restart retries and Git conflict behavior at both repository locations.

Root fetched the actual jobs, logs and snapshots independently: 68 snapshot file hashes matched the source manifest. After integration, all 34 source/test/generated hashes matched; the complete Atlas packages and boundary trees match the qualified source. The actual adapter-io package's canonical `bun typecheck` passed, compiling 11 projects with private dependencies and the existing conditional SCIP metadata shim. No local tests or runtime build ran.

The 18 generated boundary artifacts remain unchanged and still contain the old installed implementation. L11 remains open until official hosted generation, repeat idempotence, the generated guard and installed-bundle tests pass. Linux source tests do not establish Windows, NFS, power-loss, global-cap serialization or old-binary coordination guarantees.

## E10: native process capability

The repaired full-lifecycle run [43330836910](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43330836910) passed five cases and 177 assertions on each of Linux and Windows. The source and compiled CPU cases settled their owned child scopes and independently observed OS PID absence in approximately 1.509–1.515 seconds. All ten cases needed zero additional PID polls. Root integrated the exact two files through `4e4beaab61`; the entire Core tree matched the typed and tested source at that checkpoint.

The earlier Linux failures and their pre-Scope PID observations remain recorded. No process state was inspected that would justify calling those PIDs zombies. The successful capability does not qualify production parser wiring, a wire codec, interpreter deadline behavior, macOS or Electron. The private parser utility remains unwired as well.

## E6 and M13: partial runtime results

E6's repaired App bundle passed 109 tests and failed four per OS in [43332023004](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43332023004). The native ACK-loss test now reaches actual HTTP and SQL checks. The remaining native control failure was an execution-stage fixture whitelist; the approved correction preserves the Session RPC order and all SQL checks. The two-waiter Stop fixture now uses two distinct real prompts, preserving E1's intended same-action coalescence. Other popover, callback, wrapper, key/frame and Windows persistence failures remain under diagnosis. The focused TUI context run [43332080659](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43332080659) passed all 14 cases per OS. No AFTER benchmark is claimed.

M13's first 108-case Node run [43328346012](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43328346012) passed 106 cases on Linux and 107 on Windows. The failures were an immediate peer-close observation on both platforms and a Linux oversized-response deadline witness. The three Core cases passed on both platforms in [43328345986](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43328345986). A bounded peer-close observation and seven-file test extraction were independently reviewed; production code remains unchanged. A dedicated two-case Linux run diagnoses the response-byte limit before another full manager run.
