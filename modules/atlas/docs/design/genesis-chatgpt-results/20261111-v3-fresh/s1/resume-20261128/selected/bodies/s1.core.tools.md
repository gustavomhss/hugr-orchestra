# Canonical tools, settlement and output retention

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

`Tool.make` produces an opaque value whose private runtime derives a definition, decodes input, executes the leaf, validates/encodes output and produces structured/model content. Invalid input or output becomes `ToolFailure`. `Tool.dynamic` deliberately passes input through undecoded because its external owner, such as an MCP server, owns JSON Schema validation. A dynamic definition therefore is not evidence of local input decoding. Tool names must match the declared 1–64-character identifier pattern. On-demand and whole-tool permission metadata affect catalog presentation; they do not grant execution authority. [1]

Application registrations are process-scoped. Location registrations overlay them; the latest active registration for a name wins. Scope cleanup removes only its own token. Materialization captures eligible registration identities and derived definitions. Settlement checks the current identity against the captured identity and returns a stale-call error after replacement/removal, instead of dispatching to a different tool under an old definition. It captures the selected executable at settlement start. [2,3]

`ToolRegistry` wraps canonical settlement in `ToolSafety`, inspects outputs, bounds contextual output through `ToolOutputStore`, then applies optional Lean projection only where the generic bound left the result whole. Declared typed tool failures become tool results; mixed interruption/defect causes are preserved. Failed text is bounded through the same managed-output path. Registry code does not acquire `PermissionV2.Service`; resource/action permission remains the leaf's responsibility, distinct from the registry's safety wrapper and catalog filtering. [3,4]

The output store defaults to 2,000 lines and 50 KiB of contextual text, with configuration overrides. It keeps a bounded head/tail preview and saves full contextual text under the managed `tool-output` directory when exceeded. Structured output and file parts are retained in the returned output shape; this is not a global cap on every possible payload. Retention scans delete old `tool_*` files after seven days, with an hourly globally composed cleanup layer. Managed paths remain observable in public settlement results. [5]

`read` resolves paths through `LocationMutation`, authorizes an external directory when required, inspects the target, then asks the `read` permission before content retrieval. It pages text/directories and supports JPEG/PNG/GIF/WebP attachments; other base64 binary content is rejected. Its own advertised description refuses PDFs, Office files, archives and non-UTF-8 text. The older Session spec's broad “base64 binary content” description is not the current leaf contract. [6,8]

`apply_patch` parses all hunks, rejects moves, resolves all targets, approves external directories and one `edit` batch, and preflights existing update/delete targets. Commits are sequential; updates use `writeIfUnchanged`. A later failure reports the earlier applied resources. This is intentionally not an atomic multi-file rollback API. [7]

## Normative intent and limits

The nested tool AGENTS requires one canonical representation, scoped registration, captured leaf policy and generic output bounding at settlement. It identifies plugin canonical registration and Session-scoped MCP registrations as unfinished designs, and an opaque replacement for exposed managed paths as future work. [4]

These sources establish the dispatch and representative leaf boundaries. Other tool leaves, Lean producer attestation/recall and platform-specific file mutation remain separately owned leaf detail. Producer capture loss, generic model truncation and Lean summarization are different operations; a model preview is not proof of complete original capture. No tool invocation or tool test ran here.

## Source anchors

- **1.** `packages/core/src/tool/tool.ts:2ecde42373ef59b1bf2352e6272141a610feea16` — Tool.make, dynamic, registration and metadata, lines 11–77,82–177,180–216.
- **2.** `packages/core/src/tool/application-tools.ts:1633897cd6c71cc3abdd22901829b95af2dd96aa` — process-scoped register, lines 21–57.
- **3.** `packages/core/src/tool/registry.ts:ab6a6dc2f8c993aec804ebdfc73d89885e8a1453` — settleWith and materialize, lines 90–180,243–296,314–337.
- **4.** `packages/core/src/tool/AGENTS.md:98ab3e6cc58259a418b7ab80d939295a21eeba2e` — architecture, permission/output boundaries and gaps, lines 1–63.
- **5.** `packages/core/src/tool-output-store.ts:605a99e72e0482a998e2521a26f025589f81da68` — limits, bound and retention, lines 16–59,126–140,156–238.
- **6.** `packages/core/src/tool/read.ts:1e38e74b7231691a31d2ba217267326e74189558` — advertised contract and leaf execution, lines 17–29,41–109.
- **7.** `packages/core/src/tool/apply-patch.ts:c8ba6c68abbd121db47475f17163d72c381f55f9` — preflight, permission and sequential commit, lines 93–219.
- **8.** `docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — earlier tool slice descriptions, lines 193–210.
