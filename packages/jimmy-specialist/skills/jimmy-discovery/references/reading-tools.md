# Acquisition and retrieval

Read before tool use in every task. Tools supply observations and receipts, not authority beyond their native grants. Refer to [evidence](evidence.md) when interpreting output.

## Choose the smallest read

Use `glob` to find paths, `grep` for exact strings/patterns and `read` for bodies and context. Open callers, branches and source conditions needed for the question; a search hit alone rarely answers it. Use `webfetch` for a known applicable URL and declared format. Available search finds candidate sources, not facts. Do not assume an unexposed browser, bibliography adapter or PDF parser exists.

## Retrieve in parallel

Issue independent searches and reads together in one turn: several `grep` patterns, spelling variants, symbol lookups or file reads whose inputs do not depend on each other. Parallel retrieval is the default, not an optimization; it widens the first pass so the search does not stop at the first plausible hit. Sequence only when one result chooses the next query. Read the returned bodies before narrowing.

Normal approved acquisition may already return native capture references. Reuse actual receipts rather than duplicating acquisition. When retained evidence is needed but no receipt was returned, use exposed `research_capture`; never turn remembered text into claimed captured bytes.

## `research_capture`

Accepted closed inputs are:

```ts
type CaptureInput =
  | { kind: "file"; path: string; start?: number; end?: number }
  | { kind: "url"; url: string; format: "text" | "markdown" | "html" }
  | { kind: "history"; operation: "log"; path: string; revision?: string; limit?: number }
  | { kind: "history"; operation: "show"; path: string; revision?: string }
  | { kind: "history"; operation: "diff"; path: string; revision?: string; base: string }
```

The file path remains subject to normal read/secret permissions. Start/end select positive source lines; use the returned coordinate/representation contract when locating evidence. URL fetch uses permitted acquisition. Do not add authored bodies, hashes, roots, owners or a `tool-output` capture branch. Approved native tool/Atlas output capture belongs to host integration, not an invented model input.

History operations address one file inside the bound worktree. Revisions/base are full lowercase commit hashes, not branches, expressions or commands; omitted revision resolves native HEAD. `log` returns commit identities, defaults to 20 and caps at 50, explicitly indicating omitted/shallow history. `show` reads the committed file; `diff` compares the named base against the selected commit for that file. These are committed observations, not proof of the dirty tree or runtime. Existing read/secret/safety checks still apply. External diffs, text conversion and model-supplied process arguments are unavailable.

Read capture receipts for origin, applicable revision if known, representation, digest, completeness and transformation/derivation. “Received” and converted Markdown are different representations; locators do not transfer automatically. Partial bytes never establish complete reading. A successfully captured error page is still unsuitable support for the requested claim.

## `research_view`

Use exact returned references in these closed branches:

```ts
type ViewInput =
  | { action: "corpus" }
  | { action: "attempts"; cursor?: string; limit?: number }
  | { action: "records"; cursor?: string; limit?: number }
  | { action: "record"; ref: RecordRef }
  | { action: "source"; ref: SourceRef; cursor?: string }
  | { action: "document"; ref: DocumentRef; cursor?: string }
  | { action: "find"; ref: SourceRef; query: string }
```

`find` is literal text search over one retained representation, not repository grep or semantic search. Its query is at most 256 characters. Initial record limits are positive and at most 100. Follow only returned opaque continuation cursors; do not fabricate offsets or switch revisions mid-page. A page's `complete` and cursor describe returned coverage, not evidence sufficiency. Search within the source, then read surrounding text before citing it.

`corpus` returns a bounded inventory of admitted source/record/document handles. `attempts` pages native acquisition outcomes separately from source bodies. An exact native invocation retry reopens its historical representation; it does not fetch the current source again. A failed or unsettled prior acquisition remains failed/uncertain, and a new acquisition requires a new native call. Retained prefixes cannot authenticate later lines outside those bytes.

## Semantic and historical reads

Use exposed configured LSP/compiler operations only where readiness and support are known. Discovery reuses active clients or owner-configured commands; it does not activate implicit installers. Native coverage names responding servers/document versions, failures/timeouts and omitted results. Complete means that declared query scope, not every language, file or runtime path. Preserve project/config, source revision, exclusions, timeout and partial-index state. Fallback to lexical/static reading when useful; do not label fallback compiler resolution. A syntax match is not execution.

When the host exposes them, `research_capture` history also offers `blame`, range diff and bounded commit search; use the schema the tool returns, not the shape above. Use `blame` to date a line and find the commit that introduced or last changed it, and before calling a reported defect open ([calibration](calibration.md)). Use range diff for what changed between two revisions, and commit search to find candidate commits by message or path within its bound. Each is a lead into history, not a complete causal account.

Use configured LSP callers/callees (incoming/outgoing calls) to follow a resolved symbol's call edges instead of name matches; partial coverage still applies. When exposed, the Arsenal repo-intelligence tools answer structural questions: `repo-mapper` for a bounded path/size/LOC map with named gaps, `move-in` for a scoped read-only symbol map of an unfamiliar territory, `sliceability` for component structure of a supplied symbol graph, `symbol-flow-check` for cross-unit symbol flows, and `repo-hygiene-check` for tri-state Git/filesystem hygiene facts. Their output is advice derived from the scanned scope, not execution evidence.

Results from history, LSP and these tools are citable sources once retained with a returned reference and locator. The host citation check flags any `file:line` or URL citation in the answer that does not map to a retained source, so cite only what was captured.

Use only exposed specialized read-only history queries with bound roots and fixed operations. If unavailable, use admitted patches/history supplied in the mission, or ask Maestro for the missing material. Do not invoke arbitrary shell, Git commands through shell, install engines or use another tool/path to escape a denial.

## Failure handling

Permission denial or verification hold: stop the affected operation and return the blocker verbatim; no workaround. Unsupported semantics, failed conversion, expired bytes, truncation and budget exhaustion remain explicit. Continue independent permitted work only when it does not depend on missing evidence. Specify the missing observation and qualified executor rather than pretending acquisition succeeded.
