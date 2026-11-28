# Kubeconform P0A1 — preserved incomplete attempt

This document preserves the unsuccessful first measurement attempt. The later [P0A2 audit](../run-46103282827/audit.md) records a separate authorized source correction and a separate successful run; it does not change this attempt's result.

## Identity and observed result

| Item | Retained fact |
| --- | --- |
| Source | `2e10273556afb946ee9518e0e788893a165ea75d`, parent `66cfef285979adee36168e62010e8788f510db3d`, tree `56919bc524a45ec6cff0632b6b905dabb9433004` |
| Tested snapshot | `ec019df5164fc8ce769186a45512367018954974`, direct child of source, tree `25bf70b75c82209fc3c98875069758692386cb88` |
| Run / job | [46101713306](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46101713306), attempt 1; [Linux job 140845411771](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46101713306/job/140845411771) |
| Gate | Core types passed; 0 tests passed, 1 failed, 186 expect calls, 0 test skips |
| Native control | 8 Omni spawns, 0 delegated; positive control passed |
| Artifact | [15245686332](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46101713306/artifacts/15245686332), 40 files; expiry `2026-12-05T03:13:40Z` |
| Original ZIP | 68,640 bytes; SHA-256 `b712ab4d13d4048a3fac471ee0e1189fb9085c6cf764e7c475e02f461f874069` |

The single test failed when its real HTTP helper requested `https://api.github.com/repos/golang/go/git/ref/tags/go1.26.3` and received **403**. Response headers/body were not retained, so the cause of that HTTP rejection is unknown. There is no rate-limit diagnosis. The upload completed despite the test failure.

The native provisioner, executable/archive equality, version probe, pinned source inventory, Go inspection reader and binary build-info observations had already completed. The installed executable and real archive extraction agreed on **13,944,911 bytes**, SHA-256 **`457722b36e98d7bdbc91525e594951ef5d7ea3a29da2d13b9b28a2fb8a5097b7`**. Native `-v` returned exactly `v0.8.0\n`, exit 0 and empty stderr. The binary reported compiler `go1.26.3`, Linux amd64, CGO disabled, GOAMD64 v1 and VCS `02374e583d700721f57300fae78e11acd27ee539` with `vcs.modified=false`.

The eight recorded dependency path/version pairs map to the pinned upstream source inventory, including two HashiCorp dependency notices containing MPL-2.0 text. Binary module `Sum` fields are absent. The release member list contains only `LICENSE` and `kubeconform`; source-side notices are not evidence of production distribution closure. Go 1.25.14 reader notices do not substitute for acquiring the notices of the actually observed Go 1.26.3 compiler.

## Required steps not reached

The first artifact contains no compiler tag response, no acquired compiler notice bodies, no later warm-ensure witness and no final `measurement.json`. This attempt therefore remains **incomplete**, with no analyzer qualification, shipping approval, license closure, signature/attestation verification or other-platform claim.

The `baseline:66371f666132cfa78006b50fc98cdc7800c2e044` in its retained provenance is the historical source-inventory baseline. Its actual tested checkout is `workflowSHA:ec019df5164fc8ce769186a45512367018954974`, as shown by the run and commit records.

## Retention without duplicate artifact files

`manifest.json` lists the original 40 file paths, byte lengths and SHA-256 values plus the run/source/snapshot identities, original process outcomes and incomplete gate result. Thirty-two original files are byte-identical to P0A2 and reference the corresponding retained paths there. The other eight files are run-specific metadata/process records; the manifest retains their exact UTF-8 content inline, together with original lengths/digests. Thus the original textual payload is recoverable without adding another directory of 40 duplicate files.

No original artifact byte has been rewritten or silently replaced by P0A2 data. The previous ZIP and executable/archive binaries are not copied into this documentation directory. These are historical hosted observations; no native binary or project test was executed locally for the audit or retention.

The authorized P0A2 correction replaced only the dynamic compiler-tag lookup with previously resolved primary-source commit/content pins, while requiring the real binary still to report `go1.26.3`. The prior 403 remains recorded. The succeeding run's compiler notice, warm path/hash and final-report witnesses belong exclusively to that succeeding run.
