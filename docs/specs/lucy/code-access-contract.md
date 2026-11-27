# Lucy public CODE access contract

Status: frozen acceptance target for block 1; implementation and hosted proof are pending.

Baseline: `5e0807b5ff953508f792b8a965883985b05a7066`. The public tools are the existing
`code_search`, `code_query` and `code_locate`. This contract adds the review-seat
route without changing the research-seat dispatch, allowance or retained records.

## Authority and lifetime

- A native review seat must pass the existing tool gate and permission assertion.
  A tool name in its floor is insufficient without the active `ReviewTools`
  binding. Other agents do not borrow that binding by reusing its Session ID.
- The binding belongs to the host review scope. Source acquisition and every
  asynchronous read must still belong to the same binding before evidence is
  retained and before output is delivered. Closing or replacing the binding
  refuses the call with `review-code-binding-missing`.
- Missing, failed or timed-out source acquisition is a named refusal, never a
  fallback to the open Location, live HEAD, a research allowance or an empty
  successful result. A public CODE call, including source acquisition, reads and
  evidence retention, has a 60-second host deadline (`review-code-timeout`). This
  is the existing captured-Git read ceiling, applied to the whole call. Caller
  cancellation interrupts pending work and prevents successful delivery.
- The registered `maestro_request_review` PR path creates the binding before a
  review child runs and removes it when the request scope closes. The public
  regression invokes CODE within that actual child callback and repeats after
  closure. The fixture provider is a control-flow double, not an LLM or durable
  Session-execution proof.
- Standalone PR review preserves its private Unix-store requirement and its
  explicit Windows refusal. Direct registered CODE tools and primitive cache
  reads are exercised on both declared test hosts.

## Source identity

- The captured full commit is the semantic identity of a committed review.
  Reading or committing subsequent worktree edits cannot alter CODE output.
- A captured worktree or tree without a semantic commit may be searched
  lexically, but `code_query` returns `index_unavailable`. It must not label a
  tree object or current HEAD as the captured commit.
- `CodeSource.tree`, when present, is the host-owned full Git tree identity.
  It is validated as a tree separately from the existing commit-only captured
  Git API. Tree-only search/locate output has semantic commit `unversioned` and
  retains the actual tree identity with its evidence. It remains immutable when
  both the live worktree and the shared probe directory change.
- Probe scratch copies are mutable. CODE cannot observe a temporary reverted
  hunk or probe-created file. Committed CODE reads use an independent immutable
  source, or verify against the captured Git blobs; copying a probe-mutated
  directory is not a source capture.
- Returned ranges, snippets, enclosing symbols and retained text all refer to
  the captured source. A path from a cache is untrusted until it is confined and
  verified. Traversal, foreign absolute paths, NULs and symlink escapes do not
  disclose bytes or return successful absence. Negative search globs only narrow
  the captured source; they cannot widen the session's authority.

## Prepared cache and execution

- `code_query` uses the captured Git view, `readOnly: true`, no dirty overlay and
  no extractor. It never calls the live research engine or launches an indexer.
- A ready cache must match the planned shard key, indexer identity and version.
  Cached document paths and byte hashes must match the captured blobs. Missing,
  corrupt or incompatible caches return `index_unavailable`; they never trigger
  stale fallback, download, dependency installation or background rebuild.
- Reusing a byte-identical shard across commits remains valid. The stored
  producer commit alone is not a reason to reject a matching shard: shard keys
  deliberately permit reuse when source/configuration/lockfile bytes agree.
- Reading a prepared index requires no executable indexer or sandbox capable of
  running it. Platform support for producing an index is separate from support
  for reading the prepared SQLite file. Cache reads do not rewrite its manifest.
- Cache validation and answers use the same immutable cache bytes or open
  read-only connection. Validating a filename and then reopening replacement
  bytes is insufficient. This checks source identity and compatibility of
  host-produced caches; it does not authenticate arbitrary symbol facts forged
  by a malicious cache producer merely because their document hashes match.
- Lexical search uses the review's non-downloading `ReviewCodeBinary` and the
  existing `CodeSearch`/AppProcess path. Unavailable ripgrep is explicit. Locate
  may use lexical-only evidence when the compatible index is unavailable; its
  coverage remains incomplete and says which capability was absent.

## Output and evidence

The first line of every successful review CODE output is JSON:

```json
{"result":{},"evidence":{"uri":"review-code:SESSION/DIGEST","sha256":"64 lowercase hex characters"}}
```

`result` is the existing search/query/locate result with captured-source basis
and honest coverage. Extra following lines may show bounded retained ranges.
The SHA-256 identifies the UTF-8 text retained under that URI by the actual
review binding. That text includes the result and, for locate, the original-line
snapshot. The tool does not issue a `Research.SourceRef` for an artifact it never
created. Sharing the locate algorithm may generalize its evidence type while
preserving the research caller's existing default and actual artifact references.

Success is not a merge verdict, governed receipt, research admission or an
assertion that every file was examined. Host check and receipt authority remain
unchanged.

## Acceptance gates

The first gate compiles and runs the new registered-tool tests against the
baseline plus the isolated PR-scope/index-preservation fixes. Expected RED must
be assertion failures for the absent review CODE route, not failed imports,
type errors or fixture setup errors. No CODE behavior is implemented before
that observation.

Named public scenarios: immutable search and locate after worktree changes;
compatible prepared cache and byte-identical cross-commit reuse; unchanged
cache manifests; incompatible indexer metadata and document digest;
missing cache without creation; omitted semantic commit; traversal and symlink
confinement; tree-only lexical reads; actor and permission denial before source
or retention; probe-copy mutation; source acquisition failure; missing/closed
binding; closure and replacement during retention; actual deferred-source
cancellation and deadline expiry; a cumulative source-plus-retention deadline
and cancellation during retention; live public Maestro PR-child invocation and
post-request refusal; Windows PR refusal. Existing research tool tests remain
the regression control for their own route.

Hosted recipes (not execution claims):

```sh
bun run test:ci maestro test/lucy-code-public.test.ts test/lucy-code-pr.test.ts test/lucy-code-binding.test.ts test/v2-research-tools.test.ts --os both
bun run test:ci core test/review-code-cache.test.ts test/review-code-source.test.ts test/review-code-binary.test.ts --os both
```

The source-identity, type, guard, boundary and spawn gates must pass on the
implementation candidate. A green primitive test alone does not close the
public route. Timeout, cancellation and asynchronous closure gates must name
the tested boundary in the final receipt; an unexecuted scenario remains open.
