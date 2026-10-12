# Detecting mutation evidence

Measured on 2026-10-09 against baseline `f6d80d742a3372aa8559c339668b4af44c885147`, in isolated branch `jimmy-mutation-gates`. Each mutant was applied separately to production source, exercised by existing tests on GitHub Actions, then restored with the inverse patch. Tests and fixtures were not changed.

## Preserved positive controls

These existing runs were inspected through their GitHub job logs; they were not rerun or replaced.

| Control | Prior snapshot | Observed Linux evidence |
| --- | --- | --- |
| Packaged native provider boundary | `8f5786da5fa49ebf232e0c92ef1106117c30e07e`, [run 37973737525](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37973737525), [job 113966621764](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37973737525/job/113966621764) | Both `bun` and `node` cases named `whole native registry and Maestro Task/provider/client proof with authored source unavailable` passed (job-log lines 365–367). The run succeeded. |
| Joined artifact scope and availability | `06ed2a6ce0bceaf9ec313898877e7d1fdc609ccf`, [run 37970558341](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37970558341), [job 113955775328](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37970558341/job/113955775328) | All nine `corpus-integration.test.ts` cases passed (job-log lines 466–475), including the document/HTTP/deletion case. The overall run failed other files; it is not an overall green. |

GitHub recursive trees and `git ls-tree -r f6d80d742a` showed identical source/test/fixture blobs for the relevant positive control and baseline:

| Path, relative to `packages/` | Baseline and prior-positive Git blob SHA |
| --- | --- |
| `orchestra/src/tool/registry.ts` | `5ec841ed316d9671b584cfa94eff626ee67ea9d7` |
| `orchestra/test/research/packaged-runtime.test.ts` | `139839b2d1d7e693cddbd3a79d72b8589004c059` |
| `orchestra/test/research/fixtures/packaged-proof.ts` | `733334bea033f67dc994afdccb356054b226781e` |
| `core/src/research/artifacts.ts` | `7c8bb90f269ad00d3779923dd1d8211e3d4edbd4` |
| `core/src/research/ledger.ts` | `35d442338c0d3ec3ee3967129c4c62ab7637974d` |
| `orchestra/test/research/corpus-integration.test.ts` | `9bf5bae93d638e8e339dddc3d0b15ec14180d34f` |

These are historical controls with matching relevant blobs, not a fresh full-baseline qualification.

## M1: remove immutable discovery-profile schema filter

Deleted only this disjunct from `packages/orchestra/src/tool/registry.ts:505–507`, leaving the configured-agent and merged-Session permission filters intact:

```diff
-          (input.agent.native === true &&
-            input.agent.id === "jimmy" &&
-            Permission.disabled([tool.id], Permission.fromConfig(nativeProfiles[input.agent.id])).has(tool.id)) ||
```

Invocation from the isolated repository root:

```sh
bun run test:ci orchestra test/research/packaged-runtime.test.ts --os linux
```

- Injected snapshot: `cf37444efcab0b672c31b10b5d26e17c470c05f3`, temporary branch `ci-run-linux-mv1fvotw-cf37444`.
- [Run 37989603615](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37989603615), [Linux job 114020099120](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37989603615/job/114020099120): workflow and test job concluded `failure`; setup succeeded and `Run tests` failed. Cleanup succeeded.
- Both compiled-runtime cases failed at `packaged-runtime.test.ts:244:31`: `expect(request.tools).not.toContain("edit")`.
- Exact diagnostic: `error: expect(received).not.toContain(expected)` and `Expected to not contain: "edit"`. Received provider tool arrays contained both `"edit"` and `"write"` (job-log lines 375–416).
- Bun summary: `0 pass`, `2 fail`, `204 expect() calls`, `Ran 2 tests across 1 file. [17.33s]` (lines 418–421). Both cases executed; neither skipped or failed during compilation/setup.
- Workflow timestamps: created `20:50:03Z`, completed/updated `20:51:44Z`.

**Reach:** detects this native discovery schema-floor deletion in the actual compiled Bun and Node Maestro → Task → provider path on Linux, with authored source unavailable. The assertion names `edit`; `write` exposure is observed in the same request array, not independently asserted here. This does not qualify every permission override, tool, OS, or model behavior.

## M2: remove Task aggregate restriction before artifact availability

Removed the execution-only argument from the ledger lookup in `packages/core/src/research/artifacts.ts:45`:

```diff
-  const entries = (binding: Research.Binding, id: string, scope?: "task") => ResearchLedger.entries(binding, id, scope === "task").pipe(Effect.provideService(Database.Service, database))
+  const entries = (binding: Research.Binding, id: string, scope?: "task") => ResearchLedger.entries(binding, id).pipe(Effect.provideService(Database.Service, database))
```

This lets an explicit artifact-ID lookup find another execution aggregate in the same project before checking retained bytes; the ledger, binding validation, HTTP route and tests remained unchanged.

```sh
bun run test:ci orchestra test/research/corpus-integration.test.ts --os linux
```

- Injected snapshot: `dbea9377eaeb3935d8f77eb1dd347130911df208`, temporary branch `ci-run-linux-mv1g0udi-dbea937`.
- [Run 37990045464](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37990045464), [Linux job 114021579006](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37990045464/job/114021579006): workflow and test job concluded `failure`; setup succeeded and `Run tests` failed. Cleanup succeeded.
- Named failed case: `native research vertical slice > ordinary read retains actual bytes and original range; publication, decoder and HTTP reopen same document`.
- Failure at `corpus-integration.test.ts:153:71`, after the actual artifact removal and the owner-read `503` assertion: `expect((yield* Effect.promise(() => request(foreign.id))).status).toBe(404)`.
- Exact diagnostic: `error: expect(received).toBe(expected)`, `Expected: 404`, `Received: 503` (job-log lines 367–401). The foreign Task therefore learns artifact unavailability instead of receiving the scope-preserving not-found result.
- Bun summary: `8 pass`, `1 fail`, `85 expect() calls`, `Ran 9 tests across 1 file. [12.73s]` (lines 411–414). All nine cases executed; none skipped or failed during compilation/setup.
- Workflow timestamps: created `20:54:04Z`, completed/updated `20:55:41Z`.

**Reach:** detects this Core lookup widening through the real joined HTTP/deletion test on Linux. It proves scope-before-availability ordering for a same-project foreign Task with missing admitted bytes. It does not establish that foreign callers receive intact bytes, or qualify every cross-project/seat/cursor path.

## Snapshot isolation and restoration

The CLI uploaded each snapshot on top of remote ancestor `73651a0e69`; its 158-file upload count includes baseline changes since that ancestor. A full recursive GitHub tree comparison against local baseline, rejecting truncated responses, verified the exact snapshot deltas:

| Snapshot | Only differences from baseline | Mutated source blob |
| --- | --- | --- |
| M1 | `packages/orchestra/src/tool/registry.ts`, generated `.ci-run.json` | `c78aba123e5d4904665c5d182d52237468a203e7` |
| M2 | `packages/core/src/research/artifacts.ts`, generated `.ci-run.json` | `d6807fcf8ccd7f232964784220e5b19e3ac5f6e3` |

After each inverse patch, `git diff --exit-code f6d80d742a` succeeded and status showed only branch `jimmy-mutation-gates`, with no pending files. After M2, `git hash-object` independently matched the baseline blobs for both restored production files listed above. The snapshot comparisons also verify unchanged tests and absence of the other mutant in each run. Both temporary snapshot branches were removed by successful cleanup jobs.

The only retained change is this public evidence document. These two detecting mutations calibrate their named controls; they do not close all Jimmy, Atlas, desktop, or independent research acceptance cases.
