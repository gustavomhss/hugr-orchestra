# Independent engagement: durable evidence contract

Status: frozen by lead review before production changes. The acceptance baseline is
`89c6147a344ae455e69d7e3e81f430685df1feb1` on `dev`, after the lead reviewed
the concurrent activity-monitor and Claude host integrations since `5b2c840`.
Those merges did not change the independent engagement implementation. This
document and the compiling public acceptance tests
must be frozen before production changes. A qualifying RED is a hosted
assertion failure after the real graph, typecheck and positive controls work.
An unknown new reader is an expected assertion failure; a broken fixture or
missing native prerequisite is not.

This slice retains completed independent-engagement evidence, adds an
authorized reader, and qualifies one existing native analyzer path. It is a
bounded part of C12–C14 and the evidence prerequisites for A03/A04. It does
not implement audit variants, fix review, confined history, engagement probes,
compliance, or a governed verdict. The existing engagement request schema and
`review-engagement-result-v1` envelope stay unchanged.

## 1. Authority and public reader

Register the native read-only tool `maestro_read_review_evidence`. Its strict
input is exactly this union; excess properties are refused:

```ts
type Input =
  | { op: "manifest"; reportID: Digest }
  | { op: "read"; reportID: Digest; artifactID: Digest; cursor?: string }
```

`Digest` is 64 lowercase hexadecimal characters. There is no caller-supplied
Session, project, Location, source, URI, filesystem path, command, executable,
receipt, output limit or permission override. Only the actual Maestro caller
may use the reader. Lucy children do not gain this tool.

Resolve the terminal lead using the actual caller's parent Session, project
and normalized Location, including workspace identity when present. The
stored lead identity and terminal report ID must agree. A report from another
parent, project or Location is unavailable even if its report ID, receipt ID
or body digest is known. A digest identifies bytes; it does not grant access.
Reader admission never creates a Session or engagement and never prompts a
child.

Authorize the report, validate its terminal record and receipt binding, then
check artifact membership before reading a body. Neither a `review:` URI nor
an arbitrary body hash can be resolved directly. A report ID lookup is scoped
to the current namespace before considering matching lead records. Do not
turn cross-namespace failures into an existence oracle.

The tool uses the ordinary registry permission, safety, output-bound and Lean
settlement path. Responses are a single JSON object with no Markdown fence.
Index and page responses use the same canonical JSON encoding defined below.
The fixed page size below keeps the normal response small; it does not disable
user output policies or claim that a separately truncated native response is
a complete page.

### Manifest index response

```ts
type Index = {
  schema: "review-engagement-evidence-index-v1"
  reportID: Digest
  receiptID: Digest
  manifest: {
    artifactID: Digest
    sha256: Digest
    bytes: number
    mime: "application/json"
  }
  counts: { operations: number; artifacts: number; hostProofs: number }
}
```

The full canonical receipt is a durable JSON body. Its SHA-256 is `receiptID`;
`manifest.artifactID` and `manifest.sha256` both equal that value. The receipt
does not contain its own receipt ID or its own artifact descriptor. This
avoids a self-hash cycle and an unbounded manifest response. Read the full
receipt through `op: "read"` using the index's manifest artifact ID.

`manifest` validates the receipt and every required body before returning its
index. Its counts come from the validated receipt, not model text or cached
process state.

### Byte page response

```ts
type Page = {
  schema: "review-engagement-evidence-page-v1"
  reportID: Digest
  receiptID: Digest
  artifactID: Digest
  sha256: Digest
  bytes: number
  mime: string
  offset: number
  encoding: "base64"
  data: string
  next?: string
}
```

`bytes` and `sha256` describe the entire original body. `offset` is a byte
offset into that body; `data` is canonical padded base64 of at most **4,096
original bytes**. A page is never UTF-8-decoded and re-encoded. Empty bodies
return offset 0 and empty data. Omit `next` exactly when the page reaches the
end. Concatenating decoded pages yields the exact original body and its
declared digest. Read validates the receipt and the complete requested body
before slicing its bytes; it does not validate a pathname and reopen it for
the answer.

An omitted cursor means offset 0. A cursor is unpadded base64url of the UTF-8
canonical JSON below:

```ts
type Cursor = {
  schema: "review-engagement-evidence-cursor-v1"
  reportID: Digest
  receiptID: Digest
  artifactID: Digest
  sha256: Digest
  offset: number
}
```

The supplied token is at most 1,024 characters. Decode strictly and require
exact canonical re-encoding, no excess fields, equality with the authorized
report/receipt/artifact/body digest, and a positive safe-integer offset that
is a multiple of 4,096 and less than the body's length. A cursor supplies no
authority and needs no secret or model-selected page size. A token copied to
another artifact/report, an altered digest, traversal-like input or a skipped
non-page boundary fails before returning bytes.

## 2. Canonical receipt and artifact identities

All receipt objects below are strict. Optional absent fields are omitted.
Canonical encoding uses the existing engagement report canonicalizer:
recursively sorted object keys, preserved array order, JSON-only finite
values, UTF-8 and no insignificant whitespace. Hashes use SHA-256. Original
producer bodies are retained byte-for-byte, even when their existing JSON
serialization is not canonical.

```ts
type Receipt = {
  schema: "review-engagement-evidence-v1"
  reportID: Digest
  inputHash: Digest
  sessionID: string
  sourceSha256: Digest
  budget: { startedAt: number; deadlineAt: number }
  finalAnalysisOperationID: Digest
  operations: (CodeOperation | AnalysisOperation)[]
  artifacts: Artifact[]
  citations: { uri: string; artifactID: Digest }[]
  hostProofs: OxlintProof[]
  notExamined: { item: string; reason: string }[]
}

type Artifact = {
  artifactID: Digest
  kind:
    | "code-result" | "code-snapshot" | "citation"
    | "analysis-result" | "analysis-retained" | "analysis-debt"
    | "analyzer-stdout" | "analyzer-stderr" | "analyzer-path-map"
    | "analyzer-inputs" | "analyzer-config" | "analyzer-recipe"
  sha256: Digest
  bytes: number
  mime: string
  complete: boolean
  uri?: string
}
```

The receipt binds the existing terminal's report ID, exact input hash, durable
lead, captured source digest and original budget. Its source digest is the
existing prepared source digest, including the complete admitted file/OID
manifest; do not invent a partial Git tree. The terminal report remains the
authority for full source metadata, findings, classifications and citations.
The receipt's `notExamined` equals the final terminal's host-owned
`notExamined`; it cannot omit producer refusals or add a completeness claim.

`artifactID` hashes the canonical descriptor with only `artifactID` omitted.
`sha256` hashes the body itself, and `bytes` is its byte length. Descriptors
with identical identity may be deduplicated; conflicting duplicate IDs are
invalid. Every listed descriptor is required for a completed receipt. A body
is not optional merely because no final finding cites it.

`complete` means that this descriptor contains the whole producer body for
its stated kind. It is not a statement that a check passed or an audit was
exhaustive. For a truncated stdout/stderr capture it is false; the proof must
retain both the observed byte count and retained byte count. The descriptor
still names the complete bytes of that bounded capture, with an exact digest.
Do not call a captured tail the full process output.

Each existing report citation has exactly one receipt entry with the same
URI. Its `citation` body is the exact UTF-8 `citation.text`, and its body hash
equals the report's citation SHA-256. Citation paths, ranges and OIDs remain
validated against the captured source. Citation artifacts are not synthesized
from a later worktree or child explanation.

Array order is deterministic: operations in host observation/admission order,
artifact descriptors sorted by artifact ID, citation links in report citation
order, proofs in actual invocation order, and deduplicated gaps in stable host
order. Strict decode verifies all referenced IDs, expected kinds, uniqueness,
scope bindings and the absence of unused descriptors or dangling references.

## 3. CODE operations and native settlement

```ts
type CodeOperation = {
  operationID: Digest
  kind: "code"
  status: "captured"
  sessionID: string
  assistantMessageID: string
  toolCallID: string
  name: "code_search" | "code_locate" | "code_query"
  input: Json
  sourceSha256: Digest
  evidence: { uri: string; sha256: Digest; artifactID: Digest }
  snapshots: { uri: string; sha256: Digest; artifactID: Digest }[]
  nativeSettlement:
    | { status: "completed"; messageID: string }
    | { status: "not-observed" }
}
```

`Json` is ordinary JSON, validated against the selected existing CODE input
schema. It is the actual normalized request passed to the captured adapter,
including its existing path and negative-glob normalization. `operationID`
is the canonical digest of
`{schema:"review-engagement-code-operation-v1", inputHash, sessionID,
assistantMessageID, toolCallID, name, sourceSha256}`. The owned Session,
assistant message and native tool call supply the IDs; a model cannot name
someone else's operation. Tool call IDs can repeat across provider turns,
so the assistant message is required. Exact duplicate observations reconcile;
reuse with different normalized input or body bytes fails closed.

Use a host-only optional binding observer, with no default change to Research,
PR or governed review. Observe the actual captured source, normalized request,
result, snapshot and retained URI/hash, inside the original CODE timeout and
binding lifetime. Retain the exact existing capture body supplied by the
adapter, not its display rendering or reconstructed model output. A locate
snapshot and its enclosing result are separate required bodies when both
were captured. `evidence.sha256` and every snapshot hash equal the original
capture bytes' hashes and their referenced descriptors.

The observer runs after actual retention and projection cleanup with an
active-binding check before and after asynchronous observation work. It proves
capture, not model-visible delivery. The later native registry may still
reject, bound or transform output.

Set `nativeSettlement.status` to `completed` only by matching the owned
Session's actual typed `SessionMessage.AssistantTool` on Session ID, tool call
ID, exact assistant message ID and name, with `state.status === "completed"` and no
`provider.executed === true` shortcut. `messageID` is the enclosing assistant
message's actual ID and must equal the operation's `assistantMessageID`; the
tool part's `id` must equal `toolCallID`. The controller already reads the real
Session messages after its drain.
This acknowledgement does not parse tool text or claim that a subsequent
provider consumed the content. Otherwise record `not-observed`. Future
variant witnesses require the completed acknowledgement; raw telemetry is
insufficient.

Every captured CODE operation admitted by this request is accounted for in
the sealed receipt. Evidence outside the captured exact-file authority must
be refused before retention, as in the existing CODE contract. A closed,
expired or replaced binding cannot append a successful operation or publish
new reachable evidence.

## 4. Host analysis, checks and qualified native proof

```ts
type AnalysisOperation = {
  operationID: Digest
  kind: "analysis"
  status: "completed"
  ordinal: number
  sourceSha256: Digest
  routingDigest: Digest
  catalogDigest: Digest
  resultArtifactID: Digest
  retainedArtifactID: Digest
  debtArtifactID: Digest
  checks: {
    id: string
    pack: string
    version: string
    lane: string
    status: "pass" | "fail" | "not-run" | "acquisition-error"
    workspaceExecuted: boolean
    reason?: string
    uri?: string
    artifactIDs: Digest[]
    proofIDs: Digest[]
  }[]
}
```

The analysis operation ID is the canonical digest of
`{schema:"review-engagement-analysis-operation-v1",inputHash,sourceSha256,
ordinal,routingDigest,catalogDigest}`. Ordinals are consecutive positive
integers reserved by the host for this request's actual analysis calls.
`routingDigest` hashes the exact routing record passed to this call;
`catalogDigest` hashes the exact effective catalog passed to execution.
`completed` means the host analysis returned its actual checks and items;
it does not change their individual statuses. The result body is the actual
host analysis result wrapped with this call's exact routing and effective
catalog JSON, including checks, items, retained/debt identities and counts.
The wrapper is exactly
`{schema:"review-engagement-analysis-result-v1",operationID,routing,catalog,result}`.
Strict decode recomputes `routingDigest` and `catalogDigest` from those actual
captured objects and validates their equality with the operation. The result
is the actual Core return value, not a model reconstruction.
Retained/debt bodies are the exact normalized bytes after filtering
to the admitted files. Preserve the host result before any prompt projection
discards URIs or check details. No model statement supplies a check outcome.

Preserve the existing initial analysis and legitimate entry-triggered
reanalysis when new packs are added. Retain every actual call and all its raw
artifacts; do not overwrite the first call, collapse two calls into one or
refuse reanalysis to simplify evidence. `finalAnalysisOperationID` identifies
the actual analysis whose checks/items reached the final report. Validate
that binding against the host final facts, not the model's chosen operation.
An existing valid cache reuse may refer to its actual earlier proof when the
recipe/source remains applicable; it is not a new native invocation.

### Qualification barrier

Independent engagements may execute a producer only if its inputs and raw
outputs are confined to the captured admitted files. This slice qualifies
only the existing curated `oxlint-host-sarif` path on Linux x64. It reuses the
actual pinned backend, host staging, sandbox and AppProcess/omni execution.
It does not install, download or acquire a runtime during the engagement.
That restriction also covers the sandbox supervisor/runtime resolver: a
normal confinement path that can acquire a missing runtime is insufficient.
Use a narrow host-only no-acquire policy for this engagement path; the normal
PR/governed default stays unchanged. Missing preprepared confinement support
is an honest not-run result, never an implicit installation.

For every other routed analyzer, return a real host check with
`status: "not-run"`, `workspaceExecuted: false` and reason exactly
`engagement-evidence-scope-unqualified` **before** selecting its scratch,
locating/running its binary, invoking repository code or producing raw bytes.
Also record `{item: "analyze:<check-id>", reason:
"engagement-evidence-scope-unqualified"}` in host report and receipt
`notExamined`. These checks have empty artifact/proof arrays. Cover the
local-check, build and generic branches before their dispatch, not only the
last generic scanner branch.

Apply the same barrier before Deep impact and LSP diagnostic side-runners.
When those capabilities would otherwise be requested, produce their honest
not-run checks and named gaps. Preserve the existing eligibility semantics;
do not invent an LSP run or add a not-requested check merely to fill a receipt.
PR, governed and ordinary Research execution without the engagement policy
retain their current behavior.

This rule prevents whole-tree raw production followed by cosmetic output
filtering. A whole-tree temporary snapshot may remain an internal source for
the existing oxlint selector; only its verified selected bytes enter the
native projection and public artifacts. Never scan a temporary directory to
discover files to ingest into the durable store.

### Oxlint proof

```ts
type OxlintProof = {
  proofID: Digest
  kind: "oxlint"
  analysisOperationID: Digest
  invocationID: string
  side: "head" | "base"
  sourceSha256: Digest
  runtime: {
    id: "oxlint"
    pinnedVersion: "1.91.0"
    target: "linux-x64"
    executableSha256: Digest
  }
  inputsArtifactID: Digest
  configArtifactID: Digest
  recipeArtifactID: Digest
  pathMapArtifactID: Digest
  stdoutArtifactID: Digest
  stderrArtifactID: Digest
  outcome: {
    exitCode: number | null
    durationMs: number
    timedOut: boolean
    overflow: boolean
    memoryExceeded: boolean
    failure?: string
    stdout: { bytes: number; retainedBytes: number; truncated: boolean }
    stderr: { bytes: number; retainedBytes: number; truncated: boolean }
  }
}
```

`proofID` is the digest of this canonical proof with only `proofID` omitted.
Its `analysisOperationID` is the actual call that executed the producer; carry
that host identity through the preparation and outcome observer. Artifacts
from an earlier call cannot silently become a later invocation's output.
`invocationID` is a host-generated canonical lowercase UUID, with the usual
8-4-4-4-12 hexadecimal grouping. It is identical in its prepared/outcome
events and recipe. Every distinct actual invocation has a distinct ID, so
equal byte output or millisecond timing cannot collapse two executions.
The existing pinned version is a host configuration fact; do not describe it
as a version subprocess that never ran. Hash the actual prepared executable
file and verify its regular-file identity around use. A changed or unverifiable
runtime cannot acquire a valid proof. This is a host observation of the
selected runtime, not an absolute defense against a malicious same-user OS
race.

The input body is canonical JSON with schema
`review-engagement-analyzer-inputs-v1`, `sourceSha256`, and sorted `files`:
`{path,oid,sha256,bytes,encoding:"base64",data}`. These are the actual staged
eligible JS/TS file bytes, matched to the original captured Git blobs before
launch. The host may verify their Git blob object IDs directly using the
captured repository object format and bytes; this need not perform a second
Git source read. Their declared sizes and admitted paths must also agree.
No excluded source or repository config is captured. Preserve all
eligible selected inputs, even when they produce no diagnostic. The separate
config body is the exact host-authored oxlint config bytes. The path-map body
is the exact existing `oxlint-projection-v1` JSON written by the producer.

The recipe body is canonical JSON of this strict shape:

```ts
type Recipe = {
  schema: "review-engagement-analyzer-recipe-v1"
  analysisOperationID: Digest
  invocationID: string
  pack: "oxlint"
  template: "oxlint-host-sarif"
  sourceSha256: Digest
  side: "head" | "base"
  runtime: OxlintProof["runtime"]
  files: { path: string; oid: string; sha256: Digest; bytes: number }[]
  rules: string[]
  config: { sha256: Digest; bytes: number }
  invocation: {
    argv: (
      | { kind: "runtime" }
      | { kind: "literal"; value: string }
      | { kind: "source"; path: string }
      | { kind: "config"; path: ".host/oxlint.json" }
    )[]
    cwd: "projection"
    environment: "oxlint-host-sanitized-v1"
    network: false
    repositoryExecution: false
    write: []
  }
  limits: { timeoutMs: number; maxBytes: number; maxRssBytes: number }
}
```

The typed argv is the actual analyzer argv expressed with host-controlled
runtime/projection roles, including literal flags in their actual order. It
is not a model command or the sandbox wrapper command. Rules and host config
must match the qualified catalog selection, including dropped rules. Record
the fixed sanitized-environment policy rather than inherited environment
values or credentials. A future fix review may rebuild this exact qualified
recipe against a newly admitted source; possession of a recipe grants no
execution authority.

Observe preparation and outcomes at `ReviewOxlintAnalyze.run`, where selected
files, prepared paths/config/rules, built argv and `ResearchProcess.Outcome`
still exist. Check staged bytes against captured Git **before**
`hooks.confine`. A copied-file mutation or source/path mismatch returns
`not-run` with `engagement-evidence-source-mismatch`, no native launch, no
unverified input/raw artifacts, and a named host not-examined entry. Continue
through the original confinement/process path after a valid preparation.
Any asynchronous preparation observation/publication is followed by a fresh
staged-file, config and runtime identity/digest check before launch. Verify
the same identities around actual use; an intervening legitimate replacement
must fail rather than bind the earlier bytes to a later process. This does
not add an absolute malicious same-user race guarantee.

Retain actual stdout and stderr buffers before text parsing. Stdout may be
invalid SARIF or non-UTF-8; use a byte-preserving MIME such as
`application/octet-stream`, and keep the actual failure/truncation outcome.
The bounded process capture counts every chunk it actually observes, including
the chunk that crosses the output limit, before stopping execution. It retains
only the bounded suffix and marks that capture truncated when observed bytes
exceed retained bytes. These counters do not claim bytes the host never read
after stopping the process. A real subprocess positive and overflow fixture
must qualify this accounting; invented outcomes cannot do so.
Retain path-map, input, config and recipe bytes for each actual invocation.
Only a real process invocation has an `OxlintProof`; a refused sandbox or
missing runtime does not invent an outcome.

Both head and base invocations are accounted for when the current analyzer
actually runs both, even though an independent engagement uses the same
captured commit on both sides. Do not pretend a cache hit was a new process.
The native `fail`, timeout, overflow, memory failure or invalid-report result
never becomes `pass` because its bounded bytes were durably stored. Such
limitations remain in checks and host `notExamined`.

Windows, macOS and other unqualified targets preserve the exact oxlint
`not-run` reason `oxlint unsupported: native-runtime-unqualified`, with empty
raw/proof arrays and an explicit `analyze:<check-id>` gap. Missing prepared
runtime or sandbox is also honest not-run. These are active refusal paths,
not skipped tests or native-positive claims.

Current oxlint rules are candidate-producing probation rules. A real
diagnostic and retained SARIF do not independently establish a confirmed
finding. Existing verifier, quote, trigger, source and report validation still
apply; fabricated tool evidence must not bypass them. Any tool-evidence URI
accepted in a completed engagement finding must resolve to the matching
qualified host analysis item/check and receipt artifact. Unobserved model
URIs, wrong pack/rule/version and outside source references are refused.

### Frozen internal producer observation port

The optional host-only Core `ReviewAnalyze.RunInput.evidence` has this exact
shape. Omission preserves every existing PR/governed default. Core owns the
structural types and imports no Maestro module.

```ts
type Evidence = {
  analysisID: Digest
  source: {
    sha256: Digest
    files: {
      path: string
      oid: string
      mode: "100644" | "100755"
      size: number
    }[]
  }
  observe: (event: EvidenceEvent) => Effect<void, ReviewAnalyze.Failed>
}

type EvidenceEvent =
  | {
      phase: "prepared"
      analysisID: Digest
      invocationID: string
      side: "head" | "base"
      sourceSha256: Digest
      runtime: OxlintProof["runtime"]
      inputs: { path: string; oid: string; sha256: Digest; data: Uint8Array }[]
      config: Uint8Array
      pathMap: Uint8Array
      recipe: Recipe
    }
  | {
      phase: "outcome"
      analysisID: Digest
      invocationID: string
      side: "head" | "base"
      outcome: ResearchProcess.Outcome
      stdoutURI: string
      pathMapURI: string
    }
  | {
      phase: "analysis"
      analysisID: Digest
      sourceSha256: Digest
      result: ReviewAnalyze.Result
      retained: { uri: string; data: Uint8Array }
      debt: { uri: string; data: Uint8Array }
    }
```

Readonly structural equivalents are permitted. `analysisID` is the
Maestro-owned analysis operation ID above. The `invocationID` is generated
inside the actual native scan and pairs exactly one preparation with its
outcome. `ReviewAnalyze.Result` names the existing return shape with checks,
items, retained and debt; it does not add model output. The analysis event
carries the exact retained/debt bytes already given to `context.write`, never
bytes recovered by opening a temporary URI or scanning the output directory.

Prepared input arrays carry verified actual bytes; their size is
`data.byteLength`. The path-map payload preserves the existing JSON encoding.
The outcome carries original process buffers and the real URIs written by
that producer. Stderr has no existing temporary URI and needs none: its exact
buffer is sufficient. Match source, side, runtime, recipe and invocation
identity across the pair before accepting proof/artifacts.

Keep a preparation pending until its real outcome arrives. If confinement
refuses, input integrity fails or cancellation intervenes, that preparation
cannot create reachable unused descriptors or an invented execution proof.
The final analysis event is the authority for the operation's actual returned
checks/items; the host's routing/catalog capture supplies its wrapper.
Observation failures use `ReviewAnalyze.Failed`; interruption and defects are
not translated into fake analyzer outcomes. No general process replacement
or model-facing observation input is added.

## 5. Storage, publication, replay and migration

Reuse the exported `CapabilityArtifacts.storage(...).blobs` primitive. Use a
dedicated host-owned root:

```text
join(Global.data, "lucy-evidence", sha256(database.storageID as UTF-8))
```

Persistent requests require a stable nonempty database storage identity.
Never call a random process/object fallback durable across reopen. Root paths
are not reader inputs. Preserve the primitive's private root marker,
regular-file, link-count, same-file and digest checks, including its existing
Windows behavior. Use narrow expected-error mapping; defects and interruption
retain their normal meaning. Do not reuse the Research task ledger or its
seat-specific policy. Do not let another artifact feature's cleanup own this
dedicated root.

Limits are fixed host bounds for this slice:

| Bound | Value |
| --- | ---: |
| One producer body | 16 MiB |
| Sum of distinct descriptor body sizes per receipt | 64 MiB |
| Artifact descriptors, excluding the receipt itself | 256 |
| CODE operations | 128 |
| Canonical receipt body | 1 MiB |
| Decoded page | 4,096 bytes |
| Supplied cursor | 1,024 characters |
| One later reader/replay integrity operation | 60 seconds |

Analysis operations are additional to the CODE count and remain bounded by
the common artifact/receipt limits. Byte counts use
actual original bytes, not JavaScript string length. Every finite count and
offset is a safe nonnegative integer. The blob primitive's individual limit
does not enforce aggregate admission: the engagement owner must enforce all
receipt limits explicitly. Exceeding a required bound fails closed; no
descriptor, operation or body silently disappears. This is a logical retained
limit, not a claim of a physical disk quota against orphan bursts.

Attach receipt authority to the same deterministic lead's owned metadata
record, preserving unrelated metadata keys. New admissions use private
`review-engagement-state-v2` with evidence policy `required-completed-v1`.
A running or stopped v2 record keeps
`evidence:{policy:"required-completed-v1"}` without a receipt reference.
A completed v2 record contains
`evidence:{policy:"required-completed-v1",receiptID,bytes}`, where bytes is
the canonical receipt body's size. The artifact root is derived from the
database/Global placement, never persisted as an authorized caller path.

Publish bounded bodies as the live owner produces them. Before completion,
build the validated report, seal the canonical receipt, publish its body,
verify every required body, then commit terminal output and receipt reference
together under the existing owner/status CAS. The transaction reads the clock
again and substitutes expiry at or beyond the original deadline. There is no
intermediate completed state without its receipt. Receipt body identity binds
the exact immutable report ID, not a later rendering.

All producer work, byte retention, integrity checks and successful publication
use the request's original admitted deadline. CODE also retains its existing
whole-call 60-second timeout. Cancellation drains owned native execution and
prevents late completion. Unreferenced bytes may remain after interruption or
a lost publication race; they convey no authority, are not listed by the
reader and are never called delivered evidence. Garbage collection or a
partial per-operation recovery journal is outside this slice.

For newly completed v2 records, exact `maestro_request_review` retry validates
the stored canonical report, required receipt and all required bodies before
returning the identical report bytes. This later validation has the bounded
60-second read timeout; it does not renew execution budget. Do not recapture
Git, reconfigure review, consult a new catalog, install a runtime, run an
analyzer/CODE query or prompt a provider to repair evidence. Missing/corrupt
evidence produces a named failure without rewriting the terminal record.

Legacy state-v1 records keep exact existing report replay behavior. A
legitimate missing receipt in v1 is explicit unavailable evidence, never
silently upgraded to retained-complete. Do not generate a receipt from model
messages or surviving temp files. A v2 completed record with missing required
receipt is invalid/missing evidence; it cannot use the legacy exception.

Cancelled, expired and failed requests keep their immutable v1 terminal
envelope, with no partial card or newly fabricated source. New stopped
requests include host gap `{item:"engagement:evidence-publication",reason}`
where reason is respectively `cancelled`, `time-box` or `failure`. They do not
publish a public receipt, even when some orphan bodies were written earlier.
The reader returns explicit `engagement-evidence-unavailable` with detail
`terminal-status`. Stopped retry returns the same durable terminal without
new work or a new deadline. This slice makes no completeness claim about
interrupted telemetry and never seals a new receipt after expiry/cancellation.

## 6. Named failures

Strict input-schema errors remain native input failures. For accepted inputs,
use `Tool.Failure` with the named reason in metadata and message:

| Reason | Meaning |
| --- | --- |
| `engagement-evidence-forbidden` | Actual caller is not Maestro. |
| `engagement-evidence-not-found` | No authorized terminal report or no artifact member. Cross-namespace lookup uses the same reason. |
| `engagement-evidence-unavailable` | Legitimate legacy absence or stopped terminal; details distinguish `legacy-record` and `terminal-status`. |
| `engagement-evidence-missing` | A required new v2 receipt reference is absent. |
| `engagement-evidence-corrupt` | A referenced body/root is missing, unreadable or corrupt, or canonical bytes, digest, size, MIME, root identity, membership, source/report binding or stored schema fails integrity. |
| `engagement-evidence-cursor-invalid` | Malformed, noncanonical, misbound or out-of-bounds cursor. |
| `engagement-evidence-bound-exceeded` | Required publication exceeds a fixed receipt/body/count bound. |
| `engagement-evidence-storage-unavailable` | Stable durable placement or required blob I/O is unavailable. |
| `engagement-evidence-timeout` | A later bounded read/replay integrity operation exceeds 60 seconds. |

`engagement-evidence-scope-unqualified` and
`engagement-evidence-source-mismatch` are host check/gap reasons defined
above, not a claim that an analyzer ran. Expected I/O failures are normalized
at the relevant boundary. Do not turn programming defects into successful
unavailable results, and do not swallow caller interruption. The first owner
retains its original failure while its failed terminal is persisted for
subsequent exact retry.

## 7. Frozen public acceptance requirements

Use the existing real engagement fixture and a new companion; do not replace
Session admission, registry settlement, permissions, Event/projector, SQLite,
execution, Git, native process or artifact storage with test doubles. Script
only provider transport and use genuine tool events for CODE operation and
native-settlement assertions. New tests compile against baseline APIs and
call the unknown reader by its registered name; no import of nonexistent
production modules is needed.

1. **Actual producer positive before new-reader RED.** Prepare the pinned
   oxlint backend outside admission, using the same test-owned
   `BackendToolkit.Root` around provisioning and the complete real graph
   open. Add a committed `src/broken.js` containing `debugger;`, preserve the
   existing `src/a.ts` quote fixture, and pass the new explicit revision.
   On Linux x64, require the real native/SARIF diagnostic and sandbox/spawn
   witness before asserting the new receipt. An unavailable prerequisite is
   `conformance-missing`, not a qualification pass. On Windows/macOS, assert
   the exact unsupported reason and absence of proof/raw output.
2. **Complete public retrieval.** Emit actual CODE search/locate/query calls
   with inside-source positives, obtain the completed report, read the index,
   read and validate canonical receipt pages, then read every required body.
   Prove exact hashes/counts, actual source citation bytes, actual native
   tool-state acknowledgement and real oxlint stderr/stdout/recipe/path map.
   Exercise a body longer than one page and exact boundary/empty bodies.
   A legitimate entry addition must exercise reanalysis: retain both analysis
   ordinals and original raw/proof sets, then prove the final analysis pointer
   matches the actual final host check facts. Repeated tool call IDs in two
   different assistant messages must retain distinct CODE operations and
   acknowledge the exact respective native message.
3. **Scope and producer controls.** Include an excluded source with a
   diagnostic/secret sentinel and hostile project configs. Inspect the actual
   oxlint projection through the existing host observation seam: only admitted
   eligible source and host config exist. No excluded bytes or project config
   appear in raw, inputs, recipe, normalized results or reader output. Real
   copied-stage mutation must refuse before launch. Nonqualified routed
   producers, Deep and LSP must have no execution/raw witness and exact gaps.
4. **Authority and forgery.** Another parent/project/Location, a non-Maestro
   caller, unknown descriptor, cross-report cursor and modified cursor cannot
   retrieve bytes. Actual positive retrieval in the same fixture prevents
   vacuous refusal tests. A forged model tool-evidence URI cannot become a
   confirmed receipt-backed finding.
5. **Reopen and immutable replay.** Close the graph, remove the temporary
   review cache, change live source/HEAD/config, reopen the same on-disk DB
   and durable Global root, and obtain identical report, receipt and body
   bytes. Observe no new review capture/config/catalog/provider/native work.
   Account for ordinary registry output-policy config reads using the
   established calibrated control; do not bypass the real registry.
6. **Required integrity.** After a valid completed positive, delete and
   corrupt a required body and the receipt in isolated cases. Reader and
   exact request retry fail by name, without rerun, replacement terminal,
   missing-evidence downgrade or new deadline. A required-body deletion after
   actual CODE completion but before final-card publication prevents a
   completed terminal. Use fixture-owned file operations; do not fake the
   blob service.
7. **Legacy marker distinction.** A genuine baseline-shaped v1 terminal can
   replay its old bytes and explicitly lacks retained evidence. The same
   absence in a v2 completed record fails closed. Tests may construct precise
   stored migration fixtures through the real DB, preserving canonical
   report identity and unrelated metadata keys.
8. **Deadline and cancellation.** After actual captured CODE work, suspend a
   later real provider or required retention step. Original expiry/owner
   cancellation drains native ownership, forbids receipt publication/late
   completion, and leaves identical stopped retry after reopen. A direct
   waiter never cancels the owner. No receipt means unavailable evidence,
   not a claim of no previously observed work.
9. **Bounds and negative native outcomes.** Prove fixed paging/cursor bounds,
   required publication limits and honest incomplete/native acquisition
   outcomes. Real failure/truncated capture must retain its actual outcome
   and cannot turn into a pass. If a bounded real native fixture cannot
   produce a specific outcome reliably, identify that unqualified branch
   explicitly rather than replacing the process with a fake outcome.

Keep the original engagement scope, classifications, zero diligence/artifact
variants, artifact R20/owner-permission, human questions and no-verdict guards.
The quote-positive fixture must still produce a genuine nonempty finding and
captured citation. Existing PR, governed, Core CODE and research regressions
remain required preservation gates. Tests and typechecks run only in hosted
lanes. Integration and complete C12–C14/A04 claims require the corresponding
observed gates; a source review or receipt schema alone does not close them.

## 8. Subsequent work and source boundaries

The later audit variant slice reuses CODE operation IDs and the typed native
settlement acknowledgement. Its host generation ledger belongs with durable
evidence under a separately frozen receipt extension; no `result.variants`
field is introduced here. The later fix-review slice uses the existing strict
`fixReview` input, an authorized prior report, immutable old finding identity
and a qualified host recipe. It must independently prove actual re-execution,
new source binding and disposition under its own admitted retry/deadline
contract. Probes and arbitrary commands remain unavailable. This receipt
does not authorize execution or establish a fixed finding by itself.

Implementation boundaries after observed RED are the Maestro engagement
store/controller and new evidence reader/store module; optional CODE binding
observation and adapter completion; the Core analysis policy barrier and
oxlint preparation/outcome observer; and the shipped guide/tool registration.
Reuse `packages/core/src/capability/artifact/index.ts` storage rather than
adding a second blob primitive. The authoritative existing mechanisms are
`review-engagement-store.ts`, `review-engagement-report.ts`,
`tools/review-code.ts`, Core `review-toolkit/analyze.ts`,
`review-toolkit/oxlint-analyze.ts`, `review-toolkit/packs/oxlint-input.ts`,
`research-toolkit/process.ts` and `packages/schema/src/session-message.ts`.
The existing bounded process capture also needs the observed-overflow accounting
correction above, qualified independently while preserving its stop policy.
