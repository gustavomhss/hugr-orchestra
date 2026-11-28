# Kubeconform P1: explicit preparation and no-acquire reads

Status: **frozen contract and tests-only predecessor, source review approved**.
Production work remains gated on hosted package types and the intended baseline
assertion failures. No runtime qualification is claimed by this source review.

Baseline is merged `dev` `2a9a60c0695e6bae5aaccf02000179307632faec`, tree
`ca30822f4e55b47262807374886003cc6e53ac53`. This packet specifies preparation,
observed distribution notices and one shared sandbox correction. It adds no
analyzer dispatch, schema policy, catalog capability, compliance result, durable
producer receipt, variants or fix-review integration. Preparation is a named
prerequisite, not delivery of the kubeconform qualification row.

## 1. Independent observed identities

The immutable expectation is [kubeconform-preparation-sources.json](kubeconform-preparation-sources.json).
It was transcribed from the actual P0A2/P0B1 bytes, independently of production
manifest changes. Both Core and Maestro tests read it as repository fixture data;
it is not a new cross-package module API.

Authoritative retained evidence is commit
[`2709944f940fddd5730d8fdb34dc263ae923d88f`](https://github.com/gustavomhss/hugr-orchestra/commit/2709944f940fddd5730d8fdb34dc263ae923d88f),
tree `3a9204a42b6623e7c88dcc3ddd831431f9823794`, under
`docs/specs/lucy/evidence/kubeconform-p0b/run-46110738446`.
The measurement SHA-256 is
`31e4c893a66c1a8c5842b8c69afb450bc4950c663dbd758f2435f65bd615f492`.
[P0A2](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46103282827)
executed Linux x64 `-v`; [P0B1](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46110738446)
inspected four foreign distributions without executing them and reused the exact
Linux evidence. The historical inventory baseline is not the checkout tested by
either workflow; their source/snapshot identities remain in the retained audit.

Keep existing version `0.8.0`, upstream, main package license, five release URLs,
archive digests, executable member names, target set and floor declarations.
Add these independently observed executable digests to the existing pack:

| Target | Executable bytes | SHA-256 |
| --- | ---: | --- |
| darwin-arm64 | 13,356,018 | `858ceb584915c256262090195eda2579299149050c5c6a9788d0985076832313` |
| darwin-x64 | 14,225,136 | `2138fc51a0b15efe827f49c1ded8eb63da049d59864ae74a9384715f9ab6f94d` |
| linux-arm64 | 12,953,083 | `7e77b104b3ae696389f91971c60fd58c72f1f3dc218f139df67a1b070959c012` |
| linux-x64 | 13,944,911 | `457722b36e98d7bdbc91525e594951ef5d7ea3a29da2d13b9b28a2fb8a5097b7` |
| win32-x64 | 14,132,224 | `642bf8ea0d614a8c75d2bd012eb6042a90589ff846c69f04863afa446b30f2c1` |

The global native notice set has **19 origin-preserving files**, **137,592 bytes**,
13 distinct body digests and 10 component origins. Equal body digests do not
collapse different component paths. Keep every filename, URL and digest from
the fixture; use the existing notice mapper and installer. The production data
uses `raw` entries and an empty `archives` array. No floating tags, runtime tag
API, concatenation, newly inferred notice text or separate downloader is needed.

All five measured binaries identify Go **1.26.3** and the same eight dependencies.
Compiler notices come from `golang/go` commit
`2dc996f71b0ebafb77e64433e58333e049488a3c`; application/vendored notices come
from `yannh/kubeconform` commit `02374e583d700721f57300fae78e11acd27ee539`.
The Go **1.25.14** inspection reader is not included. The transitive MPL notices
for go-cleanhttp and go-retryablehttp remain present; no owner waiver, license
closure, source-offer judgment or redistribution approval is implied. Native
module sums were absent; source-lock sums are not substituted for them.

## 2. Existing public preparation route

Extend only the existing registered `maestro_prepare_review_checks` tool. Input
remains an object `{ tools: [...] }` under the existing Tool decoder; the closed set becomes `shfmt`,
`cargo-machete`, `kubeconform`. The input length remains **1–2**, with duplicates
deduplicated in first-occurrence order. Reject unknown tool names and length 0
or 3. Preserve the decoder's existing handling of unrelated object properties;
do not change every tool's decoding policy or add a model command/path argument.

The existing Maestro seat gate runs first. Non-Linux-x64 hosts actively return
`{status:"not-run",reason:"read-sandbox-unsupported-host",tools:[]}` before
permission, preparation or probing. This is an exercised refusal, not a skip or
a native runtime success. The five distribution identities are a separate fact.

On Linux x64, require the existing explicit one-time owner permission even if a
general allow rule exists. The action is `review_checks_prepare`; resources are
`review-check:read-sandbox` followed by each deduplicated `review-check:<tool>`.
The request carries the real calling Session, agent, assistant message and tool
call identity. Before owner response, rejection or configured deny, no requested
runtime/tool cache may be written. Use real Permission/Event/registry services.

After permission, prepare the real sandbox by the existing explicit readiness
path and then each requested tool sequentially. Preserve the existing output:

```ts
type Identity = {
  id: "kubeconform"
  version: "0.8.0"
  target: "linux-x64"
  executable: string
  integrity: string // the observed executable's sha256 SRI, not its archive
  proof: "version-probe"
}
type ToolResult =
  | { tool: "kubeconform"; ok: true; identity: Identity }
  | { tool: "kubeconform"; ok: false; reason: string }
// Existing shfmt/cargo-machete result alternatives remain unchanged.
type Prepared = { status: "ready" | "not-run"; tools: ToolResult[] }
```

`ready` requires every requested result to succeed. Native failures remain
per-tool failures and cannot be returned as a preparation pass. A missing sandbox
retains its existing top-level `not-run` reason and empty tools list.

Kubeconform preparation requires the installed executable and all observed
notices. Use the actual existing process service and literal `[-v]`. The binary
must exit 0, print exactly `v0.8.0\n`, leave stderr empty, and have no failure,
timeout, memory-limit, overflow or stream-truncation flag. The version probe has
an empty host-owned temporary working directory, filtered environment, maximum
5,000 ms, 4,096 output bytes and 128 MiB RSS. No repository config, stdin-driven
command, shell, inherited preload or compiler/acquisition tool is invoked.

Read the physical regular executable through a descriptor with pre/post file
identity checks, one link, no symlink and at most 32 MiB. Match the frozen byte
digest before invocation and recheck the installed binary/notices after the
probe. Replacement or invalid payload cannot leave a successful result. These
checks protect observed replacement; they do not isolate a malicious same-UID
writer. P1 exposes no new locate API, process health stamp or restart claim.

## 3. Explicit cache compatibility decision

The generic old cache remains fail-closed and unchanged. A real completed
`kubeconform/0.8.0-<target>` install made under the old no-notice manifest becomes
`absent` under the augmented manifest; `ensure` fails with
`toolkit-not-ready:failed:kubeconform:notice-missing`. Neither the executable,
completion marker nor other old bytes are rewritten, and no notices are silently
installed into it. A modified required notice likewise refuses with the existing
`notice-modified` reason. This contract accepts that compatibility behavior.

Fresh Lucy preparation uses the existing host-owned `ReviewLocalTools.Root` and
a private content-derived namespace containing the id, version, target, complete
artifact/member identity, executable integrity and notice declarations. It may
prepare the exact current payload independently of an unchanged old generic
cache. A repeat explicit prepare probes again; cached file reuse is not a health
or restart claim. Do not implement a generic installer repair, reset API, new
version, owner waiver or a migration shortcut. The user guide must state that the
private Lucy cache **does not repair old global installs**.

## 4. No acquisition in an actual read execution

The host-only second options object of `ToolSafetySandbox.wrap` gains optional
`acquire:false`; absence/true preserves default behavior. The opt-out must reach
both ordinary selection and the pinned endpoint/socket selection, including
selection retries. With false, no path starts, retries or waits on acquisition;
an unavailable runtime remains a refusal and cannot fall back unconfined.
`ReviewLocalReadProcess.run` passes the opt-out after its first status/seccomp
check. No other sandbox policy, selection priority, endpoint handling, platform
branch or default acquisition semantics change.

The causal fixture uses the existing named span `ToolSafetySandbox.wrap` as an
observation cut. Effect is pinned to `4.0.0-beta.83`: its
[NativeSpan.end](https://github.com/Effect-TS/effect-smol/blob/effect%404.0.0-beta.83/packages/effect/src/Tracer.ts)
receives the actual Exit, and
[Effect.fn/useSpan](https://github.com/Effect-TS/effect-smol/blob/effect%404.0.0-beta.83/packages/effect/src/internal/effect.ts)
creates the span before evaluating the body and ends it with the returned Exit.
The fixture records a real successful `ToolSafetySandboxRuntime.resolve` return
with the exact private directory. Reaching wrap in LocalReadProcess is after its
actual seccomp prerequisite; the fixture also verifies the physical executable
helper at the cut before synchronously renaming the prepared directory.

Every test first prepares and runs the real pinned runtime. Its loopback mirror
serves original pinned archive bytes, checked against the original SHA-512/SHA-256
before serving; the actual downloader also verifies them. The mirror replaces
only transport, never a process result or runtime selection result. Runtime and
parked directories are private. Any missing native prerequisite, trace miss,
HTTP/pin failure or missing seccomp witness is a setup failure, never qualified
RED. The tracer adds no production hook and does not derive a return value from
the span name.

Controls and expected assertions are:

1. Default wrap after the same removal really downloads the pinned archives
   again and completes the native confined read. Keep this positive after repair.
2. The actual LocalReadProcess read succeeds before the cut; after the cut it
   returns `read-sandbox-unavailable`, executes no second command and performs no
   further acquisition. A subsequent already-absent read also refuses without it.
3. Direct structural `{prepareParents:false,acquire:false}` options exercise the
   ordinary read and pinned endpoint selection independently. Both refuse after
   the same prepared-to-removed transition and perform no new HTTP acquisition.
4. Other hosts actively refuse LocalReadProcess before source/execution work.
5. A separate real `ready()` begins acquisition with its first pinned HTTP request
   held by the fixture. An opt-out ordinary wrap must settle with the typed
   `shell-read-sandbox-unavailable: sandbox-runtime-acquiring` refusal within a
   five-second observation window started after wrap is entered, before the held
   response is released. A timeout is a behavior failure, not a refusal. Interrupt
   only the observing wrapper if it waits; release and join the independent
   preparation, then prove its runtime still completes a native confined read.

Direct missing-runtime refusals must be a single ordinary `ToolSafety.Denied`
failure: `shell-read-sandbox-unavailable: sandbox-runtime-not-acquired` for the
ordinary branch and `sandbox-loopback-endpoint-backend-unavailable` for the
endpoint branch. Defects, interruption, timeout and other error types cannot
satisfy these assertions.

The structural direct options compile against the unmodified baseline; the
baseline ignores the extra field. All acquisition is joined with the real
`settled()` before counters and cleanup, including failure finalizers. No blind
sleep, mock buffer/exit, fake runtime, global PATH edit or shell override is used.
This proves this actual observed cut, not an assertion about all possible races.

## 5. Frozen packet and later implementation boundary

Proposed acceptance files are the two contract/data documents, Core
`test/review-toolkit/kubeconform-artifacts.test.ts`,
`test/review-toolkit/local-read-no-acquire.test.ts`,
`test/fixture/review-sandbox-removal.ts`, Maestro
`test/lucy-kubeconform-prepare.test.ts` and
`test/fixture/lucy-kubeconform-prepare.ts`.
No existing assertions or fixture bodies are changed. The baseline must compile,
show real native prerequisites and fail the intended new behavior assertions
before any production edit is authorized.

The prospective production roster is the existing kubeconform manifest, adjacent
notice data, a narrow prepare-only kubeconform host, existing public toolkit
entry (one named namespace export), sandbox wrap, LocalReadProcess and Maestro
review-check preparation. The guide is updated with the bounded claims and cache
compatibility decision. Existing local-tool code, analyst/catalog dispatch,
engagement evidence barriers and receipt versions are preserved.

Run the acceptance packet and package types on Actions. Exercise Linux x64
native positives, macOS/Windows active public refusals, integrity checks and
unchanged shfmt/cargo preparation regressions. A compiled assertion RED authorizes
only the behavior it reached. Type, import, network, native prerequisite and trace
failures must be corrected or reported as blocked, never counted as RED. No
local execution is authorized. Only source review is possible before the hosted
evidence; no delivery or license-closure claim follows from this candidate.
