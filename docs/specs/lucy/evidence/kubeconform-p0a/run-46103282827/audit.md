# Kubeconform P0A2 — independent measurement audit

Status: **hosted preparation measurement completed for Linux x64**. This evidence qualifies the existing provisioner and the inspected distribution identity. It does not qualify a Lucy analyzer, a sandboxed review route, Kubernetes schema validation, another operating system/architecture, or license/distribution closure.

## Tested source and hosted gate

The authoritative checkout is the workflow SHA, corroborated by the GitHub run and commit parent/tree records. The `baseline` value retained in `artifact/provenance.json` and `artifact/sources.json` is historical inventory provenance; it is not the checkout used for this run.

| Identity | Commit | Tree / relationship |
| --- | --- | --- |
| Integrated repository base | `66cfef285979adee36168e62010e8788f510db3d` | Parent of the first measurement source |
| First measurement source | `2e10273556afb946ee9518e0e788893a165ea75d` | `56919bc524a45ec6cff0632b6b905dabb9433004` |
| Corrected measurement source | `432c8415bb657c0041fd6b0fba084fa8e1d7a07d` | `cfa170b66306328dcf69f931514b6ade851007ac`; direct child of the first source |
| Tested CI snapshot | `a82102da6f1e531821ab6d5ac31f0b6eacc51633` | `3893c9d29e7699a6562def9e1be77c2bc57e6df5`; direct child of corrected source |
| Historical inventory baseline | `66371f666132cfa78006b50fc98cdc7800c2e044` | Preserved only as the original inventory's baseline |

GitHub primary records: [corrected source](https://github.com/gustavomhss/hugr-orchestra/commit/432c8415bb657c0041fd6b0fba084fa8e1d7a07d), [snapshot](https://github.com/gustavomhss/hugr-orchestra/commit/a82102da6f1e531821ab6d5ac31f0b6eacc51633), [source correction](https://github.com/gustavomhss/hugr-orchestra/compare/2e10273556afb946ee9518e0e788893a165ea75d...432c8415bb657c0041fd6b0fba084fa8e1d7a07d), [source-to-snapshot comparison](https://github.com/gustavomhss/hugr-orchestra/compare/432c8415bb657c0041fd6b0fba084fa8e1d7a07d...a82102da6f1e531821ab6d5ac31f0b6eacc51633).

The source correction changes only the measurement fixture and its source inventory. The snapshot adds the single-file CI request and 15 workflow lines for Core typecheck plus evidence upload. The request selects `packages/core`, Bun, `test/review-toolkit/kubeconform-p0a.test.ts`, timeout `600000`, and an empty requested environment. It does not alter production code or replace the provisioner/process services.

[Run 46103282827](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46103282827), attempt 1, and [Linux job 140850316267](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46103282827/job/140850316267) completed successfully on `ubuntu-24.04`. Core `tsgo --noEmit` passed before the test. The one active test passed with **197 expect calls, 8 Omni spawns, and 0 delegated spawns**; native test duration was 4553.81 ms. This is not a full Core or Maestro suite result. The independently fetched job log is byte-identical to the original downloaded log: 64,266 bytes, SHA-256 `f1bc60db1a4cf15176dee28c9e7b3b2e69831bf38db57a11702834e725f09a90`.

## Retained artifact and independent byte audit

[Artifact 15246202661](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46103282827/artifacts/15246202661) is the exact uploaded ZIP: **75,086 bytes**, SHA-256 **`8820f721fda093fc75a8af63650ac176a48718dc2893b99ccf4d9a538744aafd`**. Its recorded expiry is **2026-12-05 03:33:52 UTC**. The 44 extracted files total 198,747 bytes. `artifact-inventory.json` records every path, byte length and SHA-256. The ZIP and executables are not included in this documentation directory.

The independent audit compared every ZIP member to its extracted file and the inventory, rejected duplicate/escaping member paths, and checked all 21 pinned upstream source files plus the two reader and two compiler notices by byte length, SHA-256 and Git blob identity. It also compared seven retained raw streams with their process counters/digests, the six recorded process outcomes, report-to-source bindings, exact source/snapshot Git identities, and dependency inventory mappings. The 154 static comparisons found no mismatch. These are byte/provenance checks on hosted artifacts, not locally executed project tests, typechecks, native binaries or analyzer runs.

## Observed executable and process facts

| Observation | Actual retained result |
| --- | --- |
| Release | Kubeconform `v0.8.0`, Linux amd64 archive; 7,534,236 bytes; SHA-256 `9bc2bffbf71f261128533edaf912153948b7ff238f9a531ae6d34466ec287883` |
| Installed executable | 13,944,911 bytes; SHA-256 **`457722b36e98d7bdbc91525e594951ef5d7ea3a29da2d13b9b28a2fb8a5097b7`** |
| Format | ELF, machine 62; existing static floor scanner reports `needs: {}` and `static` |
| Native version | `-v` exits 0; stdout is exactly `v0.8.0\n` (7 bytes), stderr empty |
| Archive equality | Real `tar -xOf` returns the same 13,944,911-byte executable digest as the installed executable |
| Compiler recorded in binary | `go1.26.3`, CGO disabled, `GOOS=linux`, `GOARCH=amd64`, `GOAMD64=v1` |
| VCS recorded in binary | `02374e583d700721f57300fae78e11acd27ee539`, `vcs.modified=false`; matches the pinned upstream source |
| Inspection tool | Separately provisioned Go `1.25.14`; actual stdout `go version go1.25.14 linux/amd64\n` |

The six recorded native outcomes all exit 0 with no failure, timeout, overflow, memory limit event or truncated stream. Each retained-byte count equals its observed-byte count. The records cover the version probe, archive listing, archive executable extraction, release notice extraction, inspection-tool version and binary build-info read. Eight total Omni spawns are witnessed by the hosted test control; the six named process records are not presented as a complete one-to-one inventory of all provisioner subprocesses.

The archive and executable binary bytes were deliberately not uploaded. Their hashes are actual hosted measurements, supported by the exact test source, process outcome records and passing assertions; this audit does not claim to have rehashed either binary locally.

### Warm ensure witness

The [tested fixture](https://github.com/gustavomhss/hugr-orchestra/blob/432c8415bb657c0041fd6b0fba084fa8e1d7a07d/packages/core/test/review-toolkit/kubeconform-p0a.test.ts) calls real `BackendToolkit.ensure("kubeconform")` again after acquiring the compiler notices. Its assertions require the same executable path and unchanged executable SHA-256. The final report is written only after those assertions. The successful complete test therefore witnesses this narrow re-entry behavior.

`measurement.json` has no warm field or separate warm process record. The fixture does not count HTTP requests around the second ensure, so this evidence does not establish that the warm call made zero network requests or performed no internal acquisition checks.

## Notices and linked-source inventory

The release member listing contains exactly `LICENSE` and `kubeconform`. Its sole notice is 11,346 bytes, SHA-256 `1294f9be73faeda3987cb554c1597f599641eebdcd4d4fa88f97bdb6241be275`, byte-identical to the pinned upstream root license. Separately, the retained source inventory contains **17 notice files**, three source-lock files and one release configuration file at [upstream commit 02374e58](https://github.com/yannh/kubeconform/tree/02374e583d700721f57300fae78e11acd27ee539). These source-side notices must not be described as present in the downloaded release or installed by production.

The real binary build information lists eight module path/version pairs. Each maps to the retained source inventory and its notice paths. None carries a binary `Sum`; the `sourceSum` values are corroborated by the pinned source lockfile, not by a missing binary field. The build information and VCS match do not constitute a reproducible-build or supply-chain attestation.

Two of those dependencies, `github.com/hashicorp/go-cleanhttp@v0.5.2` and `github.com/hashicorp/go-retryablehttp@v0.7.8`, have retained upstream files headed **Mozilla Public License, version 2.0**. The inventory preserves that fact; it makes no disposition about distribution obligations or license-policy approval. Primary files: [go-cleanhttp LICENSE](https://github.com/yannh/kubeconform/blob/02374e583d700721f57300fae78e11acd27ee539/vendor/github.com/hashicorp/go-cleanhttp/LICENSE), [go-retryablehttp LICENSE](https://github.com/yannh/kubeconform/blob/02374e583d700721f57300fae78e11acd27ee539/vendor/github.com/hashicorp/go-retryablehttp/LICENSE).

The actual compiler version is pinned separately to Go commit `2dc996f71b0ebafb77e64433e58333e049488a3c`. Both [LICENSE](https://github.com/golang/go/blob/2dc996f71b0ebafb77e64433e58333e049488a3c/LICENSE) and [PATENTS](https://github.com/golang/go/blob/2dc996f71b0ebafb77e64433e58333e049488a3c/PATENTS) were downloaded during this successful run and checked against pinned length, SHA-256 and Git blob identities. Their bytes equal the corresponding reader notices, but their compiler and reader provenance remain distinct. `compiler-source-pin.json` records the earlier primary-source tag resolution; it is not a fabricated tag API response from this run.

## Prior failure and remaining boundaries

[Run 46101713306](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46101713306) remains a separate incomplete attempt: Core types passed, **0 passed / 1 failed**, 186 assertions, 8 Omni and 0 delegated. It failed with HTTP 403 at the compiler tag API lookup after measuring the native executable/build information. There was no compiler-notice acquisition, warm-ensure witness or final measurement report in that artifact. The response did not retain enough detail to attribute the 403 to a specific cause such as rate limiting.

P0A2 adds four files to that earlier artifact set: the two compiler notices, their pinned-source metadata and the final measurement report. Thirty-two previous files remain byte-identical, including native version/build-info bytes and the retained upstream/reader notices; eight metadata/process files legitimately change with the new run, temporary paths, durations or compiler pin. The previous artifact's own audit and manifest preserve its SHA identities and incomplete status without duplicating all 40 files.

The final measurement explicitly leaves `installedProductionNoticesDeclared`, `signatureAttestationVerified`, `noticeDistributionClosed` and `analysisQualified` false. No owner waiver, shipping approval, other-host native qualification, schema/network-confinement proof or engagement analyzer permission follows from this gate. The measurement-only test asserts Linux x64 and remains unsuitable for merging into the ordinary multihost Core suite. Static inspection of other archives, if later authorized, must remain distinct from native execution on those hosts.
