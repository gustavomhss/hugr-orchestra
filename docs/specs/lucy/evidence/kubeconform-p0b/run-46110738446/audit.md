# Kubeconform P0B: five-distribution static inventory

The dedicated Linux x64 measurement passed. It observed four real foreign-target
prefetches and read those executables as data, then combined them with the exact
retained Linux x64 observation from P0A2. This qualifies the bounded inventory in
[`kubeconform-p0b-contract.md`](../../../kubeconform-p0b-contract.md), not foreign
native execution, analyzer behavior, redistribution or the Lucy public route.

All tests, typechecks, acquisitions and executable invocations ran in GitHub
Actions. Local work was limited to source authoring, review, Git metadata and
inspection of the downloaded hosted artifact. No foreign kubeconform executable
was launched by this measurement.

## Execution identity

| Role | Commit | Tree |
| --- | --- | --- |
| Retained P0A parent | `3de68057c5b1da3697dfff4e0c165ae510753d9e` | `0074c33df44a10de178554b9c97d96f6138ee9f1` |
| P0B source | `981014c7fcada4995ebddd3ebeec8efdb71c4060` | `e701fef7cefdb5696d9d49766c86cac05866a2bb` |
| Direct-child CI snapshot | `cb188f6dcb5cf3d0830fb6b46d08634b875faa6d` | `7bdcdb59136670ba2fd1576a92b850db44986553` |

The source adds only the contract, test and input inventory. The two P0A fixtures
and all 48 retained documents are unchanged. The snapshot changes only
`.ci-run.json` and 15 additive workflow lines for Core typecheck and always-run
upload of the dedicated evidence directory. Product, fixture and inventory
blobs are identical to the source. The original matrix, test command, native
Omni control and cleanup remain intact.

| Input | Git blob | SHA256 |
| --- | --- | --- |
| P0B test | `30f0810732fab60315575e599d2b46b9a969a95f` | `e4a1715075e9a6f0bc92139a3fb485b8e778b898b6b65b8e55fe111625150c04` |
| P0B source inventory | `8fac2818fd4e7942dbd86d855a1045f5be101deb` | `01f1fc0bc8cd7bf3695108fdc1b7d9ab913b8cf4978023ab9a7617c60876c586` |
| Frozen contract | `baa704c6724b17aad073cdae03f62b19d22c242e` | `a62a47cb5a8c5115c8ab1b9afe2a2d1f4f6cad23ade53e743ab4f89f43a14412` |
| CI request | `930bcc1cd5afbe2872a3b0ff1d4d7b42006bbbcd` | `f10d353bfa82c3c684c1efd92b3d3ecbd3bfbc079c1fcce05b2cb7008acdde93` |
| Snapshot workflow | `def353032e9fbe0384a2f957ed1aa0af13157299` | `f8f491bc48257985c8c4e930bc21118e1abbb34999317f76028eb101d26ad382` |

[Run 46110738446, attempt 1](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46110738446)
and Linux job `140873474722` passed: Core types, **1 pass / 0 fail / 433
assertions / 0 test skips**, and native Omni positive control with **22 spawns
and 0 delegated**. The single test took 4.976 seconds; the test command took
5.29 seconds. Upload and cleanup passed. This was a new measurement, with no
rerun or changed assertion after an observed failure.

## Retained artifact

Artifact `15249328709` contains exactly **120 textual files**, totaling
**421,268 uncompressed bytes**. The downloaded ZIP is **149,593 bytes**, SHA256
`443cba2f7b636bb4bb87018c6866d67030c6e44d2d969b670902773615290718`.
The ZIP is not committed. Its files are preserved byte-for-byte under
[`artifact/`](artifact/); [`inventory.json`](inventory.json) records each path,
length, SHA256 and Git blob.

The lead and an independent reader inspected the downloaded evidence. The
independent reader recomputed the ZIP identity and all 120 per-file lengths,
hashes and Git blobs; checked the prior Linux records, five BuildInfo objects,
module/compiler memberships, notice origins, headers, floors and all 17 named
process records; and found no inconsistency. This is an independent artifact
audit, not the campaign's pending authenticated adversarial model review.

[`measurement.json`](artifact/measurement.json) is 45,921 bytes, SHA256
`31e4c893a66c1a8c5842b8c69afb450bc4950c663dbd758f2435f65bd615f492`.
It records the actual workflow SHA/run/attempt separately from the source
inventory's historical planning base and the reused P0A2 observation. Raw
BuildInfo, source and notice bodies, prefetch results, headers, floors, member
lists, process outcomes and stream hashes remain in the artifact.

There are no executables or release archives in the retained payload. Executable
member stdout is represented only by its observed byte count and digest, which
the hosted test compared with the separately installed file. Exact notices and
other textual stdout/stderr are retained.

## Observed targets

| Target | Executable bytes | Executable SHA256 | Format and static floor observation | Origin |
| --- | ---: | --- | --- | --- |
| Linux x64 | 13,944,911 | `457722b36e98d7bdbc91525e594951ef5d7ea3a29da2d13b9b28a2fb8a5097b7` | ELF64 LE, machine 62, static | Exact P0A2 reuse |
| Darwin ARM64 | 13,356,018 | `858ceb584915c256262090195eda2579299149050c5c6a9788d0985076832313` | Thin Mach-O64 LE, CPU 16777228, executable, macOS 12.0 load command | This run |
| Darwin x64 | 14,225,136 | `2138fc51a0b15efe827f49c1ded8eb63da049d59864ae74a9384715f9ab6f94d` | Thin Mach-O64 LE, CPU 16777223, executable, macOS 12.0 load command | This run |
| Linux ARM64 | 12,953,083 | `7e77b104b3ae696389f91971c60fd58c72f1f3dc218f139df67a1b070959c012` | ELF64 LE, machine 183, static | This run |
| Windows x64 | 14,132,224 | `642bf8ea0d614a8c75d2bd012eb6042a90589ff846c69f04863afa446b30f2c1` | PE32+, machine 34404; OS/subsystem metadata 6.1 | This run |

The four new archive sizes and hashes equal their independently pinned release
assets. Each archive contains exactly `LICENSE` and its executable member
(`kubeconform.exe` on Windows, `kubeconform` otherwise). Each extracted executable
member's observed size and hash match the installed file. Each distributed
LICENSE is 11,346 bytes with SHA256
`1294f9be73faeda3987cb554c1597f599641eebdcd4d4fa88f97bdb6241be275`.
Matching floor metadata is not a native-host compatibility qualification.

## Build metadata and notice association

All five observed BuildInfo objects identify compiler **go1.26.3**, the expected
target GOOS/GOARCH, CGO disabled, kubeconform v0.8.0, upstream revision
`02374e583d700721f57300fae78e11acd27ee539` and unmodified VCS state. Each reports
the same eight dependency identities:

| Module | Observed version |
| --- | --- |
| `github.com/hashicorp/go-cleanhttp` | `v0.5.2` |
| `github.com/hashicorp/go-retryablehttp` | `v0.7.8` |
| `github.com/santhosh-tekuri/jsonschema/v6` | `v6.0.2` |
| `go.yaml.in/yaml/v2` | `v2.4.4` |
| `golang.org/x/text` | `v0.37.0` |
| `k8s.io/kube-openapi` | `v0.0.0-20260603220949-865597e52e25` |
| `k8s.io/utils` | `v0.0.0-20260210185600-b8788abfbbc2` |
| `sigs.k8s.io/yaml` | `v1.6.0` |

All dependency `Sum` fields are absent in the binary metadata and remain null
in the derived association. Source-lock sums are retained as source facts; they
are not substituted for binary-provided sums. No replacement or unresolved
compiler/module association was observed.

The union retains 21 pinned source files, including 17 notice texts, plus the
two compiler notice files from Go commit
`2dc996f71b0ebafb77e64433e58333e049488a3c`. Its ten component origins distinguish
kubeconform, each of the eight dependencies and the compiler. Their target
membership comes from the actual five BuildInfo records. Identical notice bytes
do not erase distinct source paths or component origins.

The inspection reader is separately identified as Linux Go **1.25.14**, SHA256
`9347e73e5188af1ef4c2046cbc9c985473f0155c187d4005ae44c21b300062eb`, with its own
two notice files. It is not substituted for the embedded compiler identity.
The 17 named reader/list/member operations all completed with exit 0, empty
stderr, exact stream byte accounting, and no timeout, overflow, memory-exceeded
or truncation signal. Their command set is the Linux reader, `tar` and `unzip`.
The run's 22 Omni spawns also include preparation activity; named operations and
spawn-control counts are not asserted to be one-to-one.

## Scope of this evidence

The artifact keeps `foreignTargetsExecuted`, `nativeHostQualification`,
`nativeQualificationChanged`, `analysisQualified`, `productionNoticesInstalled`,
`noticeDistributionClosed` and `signatureAttestationVerified` false. The
unchanged production pack still declares no notices payload.

This evidence can inform a later reviewed notice payload and native analyzer
contract. It does not settle redistribution obligations, prove signatures,
qualify sandbox confinement or enable an analysis lane. MPL-bearing source
notices remain source facts, with their exact text and origin preserved. A
later production change needs its own frozen acceptance, compiling assertion
RED and hosted GREEN before merge.

This temporary measurement branch remains unsuitable for merging into the
ordinary multihost Core suite. Native platform qualification and the Lucy
public-route proof remain pending.
