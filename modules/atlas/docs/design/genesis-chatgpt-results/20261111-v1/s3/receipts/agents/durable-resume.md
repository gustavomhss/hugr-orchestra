# S3 — durable completion and failed-rebuild preparation

Attempt: `s3-prep-durable-001`; agent: `/root/durable_resume`.
Source: `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocol: `2689c516d63488be37de678cc853dd4556fd5c13`.
Candidate: **not yet supplied**. Runtime/CI executions: **NOT_RUN**.
This is source-backed preparation for S3 and a concrete dependency request to S2/S5, not recovery proof.

## Observed baseline mechanisms

- `ownership-pilot.ts` implements only `prepare`, `publish`, `read`, `index`.
  Prepare puts objects in the existing CAS and writes an unpublished candidate with `flag: "wx"`.
  It does not resume or reconcile an existing candidate. Publish requires its exact two historical
  reviewer IDs plus fresh runtime-import-binding approvals; those cannot be replaced with invented approvals.
- `rebuildOwnershipUpdate` computes captured inputs, calls affected recipes, persists body/result,
  asks the evaluator for reviews, persists receipt/artifact and a partial manifest, validates each new
  artifact and finally validates a complete candidate. It does not publish.
- Its progress variables `candidateArtifacts`, `newResults`, `calls` are memory-only.
  Its request does not carry a durable completion journal, cursor, reservation or resume token.
  A returned HOLD contains a reason/evidence, not a durable list of completed recipe results.
  A recipe/evaluator throw is not caught at this seam.
- Durable CAS bytes alone are insufficient: without a durably selected completion identity, a second
  call against the old baseline can execute the same completed recipe again.
- A partially updated manifest is not automatically a resumable baseline. If A has a new result while
  dependent B still references old A, `planOwnershipUpdate` validates every root and entry with
  `historical:true`, and `readOwnership` still enforces dependency result equality in historical mode.
  That partial manifest can therefore HOLD for `ownership-dependency-changed`. This is a static
  counterexample preparation, not an observed failing execution.
- The pilot read path prints the entire `runtime.ownership.read(request)` result as JSON, preserving
  `historical`. It composes the real runtime. It does not select an arbitrary old manifest by CLI parameter.

## Minimal handoff needed to execute

S1 supplies an immutable finite scope/closure with an independent control, the applicable criterion
catalog and a concrete exclusive logical allocation/reservation policy for S3. S2/S5 supplies the
exact integrated code commit, actual general native importer/rebuild/restore entry points, original
producer output hashes and provenance, complete accepted manifest/review bindings, and a completion
identity that survives the chosen interruption boundary. Publication additionally needs existing
isolated-target policy/authority accepted by the governed check/emit door.

The completion-selection contract must distinguish (a) response produced but evaluation unresolved,
(b) reviewed artifact completed but final manifest unfinished, and (c) final candidate accepted but
not yet activated. It must bind current source/input/recipe/contract/dependency hashes and keep the
S1 reservation linked. These are required observations, not approval to add a second store or bypass
the public runtime reader. Shared-code changes belong in an S3 proposal and are applied serially by S5.

## Prepared cases

`prepared-cases.json` freezes three distinct scenarios: production complete/evaluation interrupted;
reviewed A complete/dependent B interrupted; and drift plus failed rebuild with affected/independent
readers. All remain NOT_RUN with null observed process outputs. No command is invented for a missing
restore API.

Each future run must capture child PIDs or equivalent process identities, before/after CAS and selected
manifest references, actual source versions, raw stdout/stderr, exit code or termination signal,
completed/request IDs, producer/evaluator invocation records, and final independent reader response.
An artifact count or a checkpoint file is not a substitute for those observations.

## Historical evidence retained

The G3 contract's G3-01 assertion is re-open plus a no-next commit observing already settled work;
its recorded disposition explicitly excludes real interruption, campaign resume and model-call dedup.
G3-02's post-commit second-store assertion does not prove overlapped concurrent reads. G3-03's
untrusted-sidecar distinction remains intact: preserving bytes is not authority to serve them.
No G3-01/02/03 control was rerun or rejudged here.

Legacy `checkpoint-restore.mjs` invokes `restoreChain` for the old remote envelope chain and
expects GitHub shell credentials; it is not invoked. `createContinuation` is source routing for the
specific original production population, requiring exactly one original in-flight request and the
frozen final snapshot. It is not a general new L1–L4 resume entry point.

The original request `be07949d-5cdc-48f1-9309-bddd4b32cd2b`, prompt
`ae9245cf01c3ea1c15aac6c077739194973a3c09a684ea799c21fd8462e7d9fe`, remains unresolved.
The old J1/R3 publication/Own obligations remain OPEN. The synthetic continuation retry does not
settle the original request. Old M1 is a retired execution route, not finished mining.
Physical attempts, tokens and charges remain UNKNOWN.

## Evidence and local materialization

`source-metadata.json` identifies the exact files fetched through the GitHub connector, with full
commit/path/blob, byte count and SHA-256. Local materialized bytes were compared to their Git blob
addresses. These are a verified source subset, not a Git checkout or an executed candidate.

No product shared file, branch, PR, workflow or policy was changed. No local test was run and no
external model API was called. The only executable operations here materialized and hashed source
files, and searched/read their text. Runtime conclusions remain pending.
