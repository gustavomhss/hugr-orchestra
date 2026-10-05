# R10 — Semantic navigation and change safety for Charlie

Research date: **2026-10-03**. Primary documentation and source inspection only. Runtime controls below are proposed acceptance tests, not executed results. Source revisions pinned; branch snapshots do not imply released package versions.

## Verdict

**Adopt semantic evidence contracts; adapt symbol-oriented workflows; keep Atlas as shared structural Knowledge/Memory foundation.** Charlie remains independent OpenCode/Orchestra backend plugin. Maestro consumes same capabilities through optional integration.

Highest value: distinguish binding identity, syntax shape, textual occurrence, and unknown coverage. Existing host already exposes definition, references, hover, document/workspace symbols, implementation, and call hierarchy operations. Repackaging those as another generic LSP toolkit adds little. Charlie should compose existing capabilities into bounded, revision-bound evidence and edit plans. [O1]

### Ranked mechanisms

Costs are relative engineering/operational judgments, not measured estimates. **Low:** host composition. **Medium:** provider contracts and cross-language controls. **High:** ingestion/schema or multi-file consistency work.

| Rank | Decision / mechanism | Integration seam / cost | Concrete failure → control |
| --- | --- | --- | --- |
| 1 | **ADOPT coverage-qualified semantic reads**, with Serena-style outline → exact symbol → selective body disclosure | Charlie result envelope over existing LSP and Atlas reads; **low–medium** | Unsupported references or ignored callers become empty success → known caller fixture must resolve; unsupported/filtered cases retain explicit unknown/partial coverage. Budget exhaustion must retain truncation metadata. [S2] [S3] [S5] |
| 2 | **ADAPT revision-bound semantic edit plans**: exact symbol, compiler/LSP rename proposal, full-definition range when appropriate | Existing host edit/write and validation primitives; capability extension only where host lacks operation; **medium**, **high** if host lacks multi-file consistency | File changes between lookup and apply; overload identity shifts → precondition failure before writes. Unicode/decorator fixtures prove correct range. Fault during second file cannot return whole-plan success. [S2] [S4] [S8] |
| 3 | **ADOPT bounded impact dossiers**, combining typed references/implementations, owning symbols, and explicit blind spots | Atlas relationships plus live LSP overlay and existing text search for strings/config; **medium** | Interface call missed when changing implementation; reflection consumer invisible → preserve relationship kind, include relevant interface references, label runtime/external impact unknown. Never derive “safe delete” from empty references alone. [P2] [S3] [S5] |
| 4 | **ADAPT ast-grep as scoped structural candidate/patch provider** | Existing search/edit execution seam; ephemeral parsing, pinned grammar/rules; **low–medium** | Same call spelling names unrelated bindings; invalid file skipped → syntax-only label, semantic identity check when needed, positive/negative rule fixtures, per-file error/skip evidence. [A1] [A2] [A4] [A5] |
| 5 | **ADAPT SCIP ingestion only for demonstrated Atlas coverage gaps** | Atlas-owned import/provenance/relationship normalization; Charlie queries Atlas; **high** | Structurally valid but incomplete index; stale revision; mixed range encodings → expected-document coverage, indexer-error manifest, revision/config identity, legacy/typed-range and Unicode fixtures. [P1] [P2] [P4] [T2] |

**REJECT:** Charlie-owned parallel symbol/reference DB, SCIP SQLite sidecar, duplicate LSP server fleet, copied Serena memory system, embeddings/chunk stores/RAG, syntax-only semantic rename, unconditional reference-empty safe deletion. These either duplicate named foundations or claim stronger evidence than providers supply. SCIP itself explicitly delegates efficient querying to consumers and excludes code modification from its design goals. [P1] [P3] [S1]

## 1. Repository identities, exact revisions, copying terms

Identity verified through GitHub repository API before source citations. Important redirect: request for `sourcegraph/scip` returned canonical `full_name: scip-code/scip`. Current SCIP README also links releases under `scip-code/scip`; older Sourcegraph docs retain historical URL. [I2] [P0] [D1]

| Component | Confirmed canonical repository / inspected revision | Confirmed copying license |
| --- | --- | --- |
| Serena | [oraios/serena][I1], `d0f7f92631c23dc4c5ed0b5ccd35bc623b19a809`, commit date 2026-09-30 | **GPL-3.0-or-later** for application, tools, application tests, docs; **MIT** for SolidLSP and enumerated SolidLSP test/resource paths. Actual overview and file SPDX headers inspected. GitHub's aggregate `NOASSERTION` is not license determination. [SL1] [S2] [S5] |
| Historical Serena cutoff | `74c38a65f03fc0764d7ee4b3016ef6a07572ed64` | Actual historical `LICENSE` is **MIT**. Current overview identifies this cutoff, `mit-final`, and last MIT release `v1.7.0`. Current v2-era application code cannot inherit that permission by name association. [SL1] [SL2] |
| SCIP protocol/CLI | [scip-code/scip][I2], `f07c097d9b5d952c50eecde328200e454937fa09`, commit date 2026-10-02 | **Apache-2.0**, root license inspected. CLI reference at this revision identifies `v0.10.0`; schema pin remains exact commit, not inferred protocol feature version. [PL1] [P3] |
| Compiler-backed example | [sourcegraph/scip-typescript][I3], `6d054474cbb328cecb3e188b3808c4ff5ca38a84`, commit date 2026-10-01 | **Apache-2.0**, actual root license inspected. [TL1] |
| ast-grep implementation | [ast-grep/ast-grep][I4], `ef4f4fd3535fa76c59f7c7f5e9f4c7f319ab948a`, commit date 2026-10-03 | **MIT**, actual root license inspected. [AL1] |
| ast-grep documentation | [ast-grep/ast-grep.github.io][I5], `47a2c45821c05e8d8ec820cbab03f46c54ce3aa5`, commit date 2026-09-19 | **MIT**, documentation repository license inspected separately. [AL2] |
| Sourcegraph product docs | [sourcegraph/docs][I6], `7689773148160b66f4d000667d4c0f3b824f9adc`, commit date 2026-10-03 | Repository API supplied no license classification; copying permission **not established** here. Citation/paraphrase only. SCIP's Apache license does not license this separate docs repository. [D1] |

Copying consequence: prefer own implementation of mechanisms over copying Serena application source. SolidLSP MIT copying requires retained notices, including original OLSP notices where present. Historical MIT copying requires exact historical files and notices. Current Serena application copying requires GPL-compatible handling; do not represent it as permissive. MIT ast-grep copying requires copyright/permission notice. Apache SCIP/indexer copying requires license/attribution retention, change notices, and applicable NOTICE material. External language servers, tree-sitter grammars, and paid JetBrains plugin retain their own terms; licenses above do not establish bundle-wide permission. [SL1] [SL2] [PL1] [TL1] [AL1] [AL2]

## 2. Serena: useful workflow design, narrower guarantees

### Navigation and symbol identity

`GetSymbolsOverviewTool` returns structure first; `FindSymbolTool` supports file/directory restriction, kind filters, depth, optional body/info, and name paths. Absolute name path is exact **within file**, not globally unique. Overloads can use positional `[i]` suffix. `FindReferencingSymbolsTool` returns referencing owners plus short context. These interfaces reduce ambiguous text selection and unnecessary full-file reads. [S2]

Charlie adaptation: use display name paths for navigation, but edit handles bind repository/worktree, file, provider symbol identity, signature/disambiguator where available, source revision/hash, and exact range. Re-resolve after change. An overload's ordinal or same spelling elsewhere must not authorize editing.

### Bounds: presentation limits are not work limits

Current source is more nuanced than some tool docstrings:

- `LspSymbolsOverviewRenderer`: full overview → depth-zero overview → kind counts.
- `LspReferenceCollectionRenderer`: references with context → without context → per-file counts → total count.
- `find_symbol`: resolves symbols and optional hover information before checking `max_matches`; over-limit branch raises error with name-path map. This is ambiguity/result handling, not early query-work ceiling.
- Reference snippets are eagerly retrieved before rendering budget is applied. `max_answer_chars` constrains representation, not provider CPU, memory, file enumeration, or initial payload. [S3] [S7]

Adapt progressive disclosure, then add host-enforced work limits and machine-readable truncation. Summaries must preserve result type and completeness qualifications. A count of observed references cannot become total program impact.

### Editing: symbol range helps; transaction still needs contract

`ReplaceSymbolBodyTool` means whole definition, including signature; docstrings/decorators may fall inside or outside provider range. Tool asks caller to retrieve body first. Inspected `EditApi.replace_symbol_body` delegates to editor; `CodeEditor.replace_body` finds symbol, deletes range, inserts replacement. Caller-read warning is not a revision/hash precondition. [S2] [S4] [S6]

`LanguageServerCodeEditor.rename_symbol` obtains LSP `WorkspaceEdit`; conversion supports text edits and file rename operations. Conversion passes document URI and edits, not `textDocument.version`, into its operation object. `_apply_workspace_edit` then applies operations sequentially. Per-file `write_file_atomic` is useful, but does not establish all-files transaction. Null rename or zero applied operations becomes error. Charlie should borrow semantic targeting while using host-owned snapshot checks and write semantics. [S4]

Existing source tests document real boundary pitfalls: Go declaration keyword duplication, Nix semicolon duplication, Vue duplicate symbol ranges, and language/platform-dependent skips. These are concrete fixture ideas, not proof all supported languages share safe edit boundaries. [S8]

### Empty references do not prove unused

Pinned `safe_delete_symbol` calls references and deletes when resulting file map is empty. SolidLSP reference normalization maps `None` to empty list. Location conversion filters outside-repository paths, absent generated files, and ignored paths. Those transformations narrow evidence before deletion logic sees it. Source also includes cross-file-indexing waits; readiness behavior remains server-specific. This is source-level evidence of a contract risk, not a reproduced deletion incident. [S3] [S5]

Charlie must retain exclusion and readiness evidence before normalization. If host only exposes flattened results, coverage stays unknown; adding wrapper cannot reconstruct discarded evidence. Semantic empty result can support “no references observed in declared scope,” never unrestricted “safe to delete.”

### Language coverage is operation-specific

Primary language docs explicitly distinguish:

- Angular template features can silently return empty without resolvable `@angular/core`.
- Documented Ansible server version lacks document/workspace symbols, references, and rename.
- Crystal backend lacks find-references; Wolfram references are within-file only.
- C/C++ quality depends on compilation configuration; docs recommend `compile_commands.json`.
- Kotlin backend is pre-alpha; framework support can require companion servers and project setup. [S9]

Serena README separates free LSP backend from paid JetBrains backend. Dependency search, richer refactorings, hierarchy, and debugging differ by backend; generic “Serena supports it” is insufficient. This research inspected public LSP/application source, not JetBrains plugin implementation. [S1]

## 3. SCIP: interchange for Atlas, not another Charlie index

### What schema contributes

SCIP design calls it transmission format, not query-storage format. Bidirectional navigation belongs to consumer query engine. Code modifications are non-goal. This fits Atlas ingestion far better than Charlie-local index or experimental SQLite conversion. [P1] [P3]

Useful records from `scip.proto`:

- Documents with canonical repository-relative regular-file paths.
- Global symbol IDs containing scheme, package manager/name/version, and descriptors/disambiguators; `local` IDs scoped to document.
- Occurrences with definition/import/read/write/generated/test role bits.
- Separate `is_reference`, `is_implementation`, `is_type_definition`, `is_definition` relationships.
- Optional external symbol information, signatures, diagnostics, enclosing ranges.
- Producer name/version/arguments, project root, text encoding, per-document position encoding. [P2]

Schema example relates `Animal.sound` and `Dog.sound` for reference discovery, while class implementation does not automatically mean class reference equivalence. Atlas normalization must preserve these semantics rather than collapsing everything into generic “depends-on.” Reference occurrence also does not automatically mean executable call. [P2]

**Current-version trap:** pinned schema prefers typed single-/multi-line ranges over deprecated integer arrays; typed form takes precedence when both supplied. Coordinates are zero-based, half-open, with UTF-8/16/32 code-unit interpretation per document. File text encoding is separate. Consumer needs old/new compatibility, correct Unicode conversion, and enclosing-definition range distinct from identifier range. `UnspecifiedProtocolVersion` alone is insufficient feature negotiation. [P2]

### Compiler-backed does not mean complete

Protocol explicitly permits compiler-backed and heuristic indexers. Language enum permits names; it is not operational coverage list. Sourcegraph product docs list producers for Go, TypeScript/JavaScript, C/C++/CUDA, Java/Kotlin/Scala, Rust, Python, Ruby, and C#/Visual Basic; they recommend existing CI build environment for complex builds. Product precise navigation falls back to search-based navigation; Charlie should expose that downgrade. [P2] [D1]

Concrete compiler example: `scip-typescript` creates `ts.Program` and obtains `TypeChecker`; `FileIndexer.getTSSymbolAtLocation` uses compiler symbol lookup and import de-aliasing. This improves imported aliases, shadowing, and package identity beyond literal search. README requires project/dependency setup and notes JavaScript quality improves with type declarations. [T1] [T2] [T3]

But `ProjectIndexer.index` emits only program files also present in configured `fileNames`; it catches/logs per-file visitor exceptions and continues, and writes documents only when occurrences exist. An artifact can therefore contain useful data without representing every intended file or successful analysis. Compiler lookup can also fail to resolve symbol and traversal continues. Successful transport or parse is not completeness certificate. [T2] [T3]

Atlas ingestion needs independent provenance envelope: repository revision, dirty-overlay relation, indexed project/build target, compiler/indexer versions, config/dependency identity, expected file scope, exclusions, per-file outcome, and errors. Files intentionally lacking occurrences must remain distinguishable from files omitted by failure. Charlie must not invent these fields from SCIP metadata alone.

### Validation reach

`scip lint` checks supplied data for problems including symbol consistency, relationship flags, duplicate documents/occurrences, and malformed ranges. Its input is index content; it does not establish intended source-file coverage. `scip test --check-documents` adds directory/document comparison; option defaults false. Test runner checks explicit assertions, and source permits success paths with zero assertions. Consumers need known nonempty fixtures and expected-file checks, plus mutation controls that remove document/reference and must fail. Relationship metadata needs explicit assertions or reviewed snapshots; do not assume every snapshot comment is asserted by test runner. [P4] [P5] [P6]

## 4. ast-grep: structural precision without semantic identity

Primary README describes tree-sitter AST pattern matching, metavariables, lint, rewriting. FAQ explicitly excludes scope/type/control-flow/data-flow/taint analysis and constant propagation. Structural match answers “this shape exists,” not “this occurrence resolves to target symbol.” [A0] [A1]

Use when whitespace, nesting, argument structure, or declaration kind make regex brittle: locate calls of given shape, distinguish code from same text in strings, constrain edits to selected AST nodes. Prefer ordinary search for config keys, comments, string registrations, docs, unsupported grammars, or initial discovery when symbol identity is unknown.

**Semantic counterexample by reasoning, not executed benchmark:** README's `$A && $A()` → `$A?.()` rewrite is not valid for arbitrary JavaScript values. With `callback = false`, original short-circuits; optional call attempts calling non-nullish `false`. Complex `$A` can also change evaluation count. AST consistency is not behavior preservation. Restrict domain and validate semantics before applying such rewrite. [A0]

### Provider integration and bounds

Use scoped paths, explicit language, pinned strictness, and structured JSON. `--json=stream` emits newline-delimited objects; replacement output includes replacement text and offsets, suitable for host preview/patch pipeline. Avoid separate write authority when host already owns edits. [A2] [A4]

Pinned `run.rs` collects matches/diffs for each file; JSON processor builds byte buffers. Stream output is not constant-memory proof or execution budget. Shared worker has termination facilities, but command-specific wiring matters; do not assume flags from another subcommand apply to `run`. [A3] [A4] [A5]

Worker source also converts traversal errors to printed errors and skips failed `produce_item` calls. Therefore exit code and stdout alone can hide partial search. Docs' `--inspect` exposes scan/skip observations, but format is informal. Reliable adaptation needs pinned parser for that trace or per-file library/provider errors; unknown omissions remain unknown. [A2] [A5]

### Coverage and rule validation

Grammar/version, language inference, ignore settings, and embedded-language configuration affect search scope. FAQ documents CLI/playground parser and UTF-8/UTF-16 differences, error recovery, and JS/TS AST differences. Pinned docs table and newer implementation are not identical: implementation `SupportLang` includes Dart and Zig; inspected docs table does not list those entries. Probe installed provider capabilities rather than copying static marketing list. [A1] [A6] [A7]

Rule tests supply positive `invalid` cases, negative `valid` cases, and snapshots for reported spans/messages. Reuse mechanism for codemod matching and replacement goldens, then run project compiler/tests. Parser accepting source or replacement does not prove semantic correctness. [A8]

## 5. Charlie integration contract

### Ownership boundaries

- **Atlas:** durable structural/Knowledge/Memory foundation, symbol relationships, imported SCIP provenance and shared evidence pointers.
- **Host OpenCode/Orchestra:** existing LSP/search/read/edit services, workspace state, permissions, process lifecycle, build/test execution.
- **Charlie:** task-specific query composition, evidence grading, bounds, impact dossier, revision-bound edit plan, validation record. Session-local handles/cursors can be ephemeral; reuse Atlas/host durability for retained evidence.
- **Maestro:** optional consumer of same plugin result contract; not required orchestration/runtime owner.

These are proposed seams, not claims of existing public APIs. Baseline Atlas seam register identifies bounded ownership reads and structural/runtime snapshot identity needs; it describes adapters as candidates. R10 does not promote that historical register into proof of shipped Charlie/Atlas integration. [O2]

### Result shape, conceptually

Every result carries independent dimensions:

1. **Basis:** repository/worktree, revision plus overlay identity, provider/version, build/config/dependency scope, observation identity.
2. **Execution:** succeeded, unsupported, error, timed out, or cancelled. Empty findings are not execution failure and do not erase failures.
3. **Coverage:** declared file/project/relationship scope, exclusions, unresolved files/targets, readiness evidence; partial/unknown remain explicit.
4. **Freshness:** current for stated basis, stale, or unknown. Changing build flags can stale semantics without changing source file.
5. **Findings:** typed semantic references versus syntax/text candidates, original locations, owner if resolved, source evidence.
6. **Bounds:** returned amount, exact total only when known, lower bound otherwise, truncation reason, continuation tied to same snapshot.

Do not merge different revisions silently. Dirty local files may use live LSP while Atlas carries committed snapshot; expose split basis and supersede stale file evidence explicitly. A reference cache hit must include relevant workspace/config identity. Unknown fields cannot become fabricated confidence scores.

### Operational limits

Budget paths/files, result rows, body bytes, response bytes, traversal depth/edges, deadline, and provider process resources separately. Start with file-scoped overview, exact symbol, then one-hop references. Further impact expansion must be explicit and bounded; cyclic relationships need visited-set handling.

Reserve response space for status/provenance/truncation even when single body exceeds budget. Continuation must be stable for snapshot; where provider cannot resume safely, return narrowed-query suggestion, not fake cursor. Cancelling output consumption does not prove provider stopped: propagate cancellation through existing host lifecycle. For cross-file patches, an omitted preview section cannot silently authorize additional writes.

### Edit and validation record

Resolve exact target and capability; read actual edit range; obtain compiler/LSP proposal where semantics require it. Check file versions/hashes, path scope, coordinate encoding, and overlapping edits before host apply. Multi-file behavior must state supported transaction/partial-failure semantics. Return actual applied paths and invalidated evidence.

Then validate through existing host: parse/format affected files, obtain fresh version-correlated diagnostics, run relevant package typecheck/build/tests, inspect final diff. Record commands, scope, skipped/unavailable checks, failures, and source basis. Empty asynchronous diagnostics alone is not compilation proof. Failed validation is distinct from failed application; neither permits inaccurate success summary.

## 6. Concrete acceptance controls for future implementation

All controls below **unexecuted in R10**. Use actual providers in relevant project environments; fixture-only checks supplement, not replace integration behavior.

| Control | Positive case | Failure/negative case and required result |
| --- | --- | --- |
| Binding identity | Exported `process` imported under alias resolves to same declaration | Unrelated local `process` plus same text in comment/string must not join semantic rename; text search may still list candidates |
| Coverage honesty | Known cross-file caller found after backend ready | Remove caller project from config, ignore caller, or use unsupported reference capability → partial/unknown/unsupported; never unrestricted unused claim |
| Symbol boundaries | Replace Go declaration, decorated function, Vue function using retrieved full range | Duplicate keyword/semicolon, lost decorator, ambiguous overload, or malformed source → detected by exact diff/parse/typecheck |
| Snapshot safety | Exact pre-read hashes permit intended patch | Change second target file or reorder overload before apply → stale-plan rejection; injected write failure must expose actual partial effects unless host guarantees rollback |
| Coordinate safety | Same target located with non-BMP character earlier on line | UTF-8, UTF-16, UTF-32, legacy and typed SCIP ranges plus CRLF map to correct bytes; inconsistent range/text rejects plan |
| Impact relationships | Interface call appears in implementation-change dossier; unrelated method excluded | Reflection/string registration or external consumer → explicit residual unknown, with targeted text evidence when available |
| Structural rewrite | AST pattern survives whitespace/nesting changes and excludes string literal lookalike | Shadowed binding, false-valued optional-call example, side-effectful receiver, malformed pattern/file → no unsupported semantic guarantee; provider skip cannot mean clean |
| Bounds | Scoped query returns navigable results with preserved provenance | Dense file, huge body, cyclic graph, timeout, output cut mid-JSON → bounded response, named failure/truncation, truthful counts, provider cleanup |
| Index validation | Known document/reference fixture imports and queries correctly | Drop expected document, corrupt symbol/range, or preserve partial index after per-file error → coverage/lint/assertion failure as appropriate; zero-assertion run rejected by acceptance harness |

## 7. Source limitations and what framing missed

**Source limitations:** inspected pinned source, not installed binaries; no performance or reliability benchmarks. Upstream tests were read, not run. Other SCIP indexers and external language servers were not implementation-audited. Sourcegraph product docs describe its hosted/self-hosted product behavior, not guarantees attached to every SCIP artifact. Paid JetBrains behavior remains documentation-only. Main-branch code and docs can differ from release consumers. Cost judgments need host/Atlas capability confirmation.

**Framing missed:**

1. **Current ownership and licensing changed.** SCIP moved canonical repository; Serena's application changed license. Old project summaries can misdirect copying decisions.
2. **Evidence strength is multidimensional.** Binding precision, coverage, freshness, and execution success are separate; “semantic” is not single trust level.
3. **Build scope is part of meaning.** Compiler flags, dependency graph, target, generated sources, and dirty overlays can invalidate otherwise exact symbol facts.
4. **Impact is broader than references.** Runtime registration, reflection, public consumers, schemas/config, and behavior changes need residual-unknown reporting and relevant tests.
5. **Edit granularity is not edit correctness.** Whole-symbol replacement can be worse than small exact patch for local changes; semantic rename is different operation from definition-body replacement.
6. **Bounded presentation is not bounded computation.** Eager references, per-file match vectors, and partial-error normalization need provider-level controls.
7. **Charlie advantage is decision quality.** Compose existing Atlas/LSP/search/edit evidence into defensible action and validation. Another index, memory store, or retrieval pipeline spends effort on already-owned infrastructure.

## Sources

External citations above link primary sources. Blob links pin exact reviewed revision. API links record identity-check endpoints; identity observations are dated 2026-10-03.

[I1]: https://api.github.com/repos/oraios/serena
[I2]: https://api.github.com/repos/sourcegraph/scip
[I3]: https://api.github.com/repos/sourcegraph/scip-typescript
[I4]: https://api.github.com/repos/ast-grep/ast-grep
[I5]: https://api.github.com/repos/ast-grep/ast-grep.github.io
[I6]: https://api.github.com/repos/sourcegraph/docs
[SL1]: https://github.com/oraios/serena/blob/d0f7f92631c23dc4c5ed0b5ccd35bc623b19a809/LICENSE
[SL2]: https://github.com/oraios/serena/blob/74c38a65f03fc0764d7ee4b3016ef6a07572ed64/LICENSE
[PL1]: https://github.com/scip-code/scip/blob/f07c097d9b5d952c50eecde328200e454937fa09/LICENSE
[TL1]: https://github.com/sourcegraph/scip-typescript/blob/6d054474cbb328cecb3e188b3808c4ff5ca38a84/LICENSE
[AL1]: https://github.com/ast-grep/ast-grep/blob/ef4f4fd3535fa76c59f7c7f5e9f4c7f319ab948a/LICENSE
[AL2]: https://github.com/ast-grep/ast-grep.github.io/blob/47a2c45821c05e8d8ec820cbab03f46c54ce3aa5/LICENSE
[S1]: https://github.com/oraios/serena/blob/d0f7f92631c23dc4c5ed0b5ccd35bc623b19a809/README.md
[S2]: https://github.com/oraios/serena/blob/d0f7f92631c23dc4c5ed0b5ccd35bc623b19a809/src/serena/tools/symbol_tools.py
[S3]: https://github.com/oraios/serena/blob/d0f7f92631c23dc4c5ed0b5ccd35bc623b19a809/src/serena/repl/api/lsp_api.py
[S4]: https://github.com/oraios/serena/blob/d0f7f92631c23dc4c5ed0b5ccd35bc623b19a809/src/serena/code_editor.py
[S5]: https://github.com/oraios/serena/blob/d0f7f92631c23dc4c5ed0b5ccd35bc623b19a809/src/solidlsp/ls.py#L1464-L1734
[S6]: https://github.com/oraios/serena/blob/d0f7f92631c23dc4c5ed0b5ccd35bc623b19a809/src/serena/repl/api/edit_api.py
[S7]: https://github.com/oraios/serena/blob/d0f7f92631c23dc4c5ed0b5ccd35bc623b19a809/src/serena/repl/representable.py
[S8]: https://github.com/oraios/serena/blob/d0f7f92631c23dc4c5ed0b5ccd35bc623b19a809/test/serena/test_symbol_editing.py
[S9]: https://github.com/oraios/serena/blob/d0f7f92631c23dc4c5ed0b5ccd35bc623b19a809/docs/01-about/020_programming-languages.md
[P0]: https://github.com/scip-code/scip/blob/f07c097d9b5d952c50eecde328200e454937fa09/README.md
[P1]: https://github.com/scip-code/scip/blob/f07c097d9b5d952c50eecde328200e454937fa09/docs/DESIGN.md
[P2]: https://github.com/scip-code/scip/blob/f07c097d9b5d952c50eecde328200e454937fa09/scip.proto
[P3]: https://github.com/scip-code/scip/blob/f07c097d9b5d952c50eecde328200e454937fa09/docs/CLI.md
[P4]: https://github.com/scip-code/scip/blob/f07c097d9b5d952c50eecde328200e454937fa09/cmd/scip/lint.go
[P5]: https://github.com/scip-code/scip/blob/f07c097d9b5d952c50eecde328200e454937fa09/cmd/scip/test.go
[P6]: https://github.com/scip-code/scip/blob/f07c097d9b5d952c50eecde328200e454937fa09/bindings/go/scip/testutil/test_runner.go
[T1]: https://github.com/sourcegraph/scip-typescript/blob/6d054474cbb328cecb3e188b3808c4ff5ca38a84/README.md
[T2]: https://github.com/sourcegraph/scip-typescript/blob/6d054474cbb328cecb3e188b3808c4ff5ca38a84/src/ProjectIndexer.ts
[T3]: https://github.com/sourcegraph/scip-typescript/blob/6d054474cbb328cecb3e188b3808c4ff5ca38a84/src/FileIndexer.ts
[D1]: https://github.com/sourcegraph/docs/blob/7689773148160b66f4d000667d4c0f3b824f9adc/docs/code-navigation/precise-code-navigation.mdx
[A0]: https://github.com/ast-grep/ast-grep/blob/ef4f4fd3535fa76c59f7c7f5e9f4c7f319ab948a/README.md
[A1]: https://github.com/ast-grep/ast-grep.github.io/blob/47a2c45821c05e8d8ec820cbab03f46c54ce3aa5/website/advanced/faq.md
[A2]: https://github.com/ast-grep/ast-grep.github.io/blob/47a2c45821c05e8d8ec820cbab03f46c54ce3aa5/website/reference/cli/run.md
[A3]: https://github.com/ast-grep/ast-grep/blob/ef4f4fd3535fa76c59f7c7f5e9f4c7f319ab948a/crates/cli/src/run.rs
[A4]: https://github.com/ast-grep/ast-grep/blob/ef4f4fd3535fa76c59f7c7f5e9f4c7f319ab948a/crates/cli/src/print/json_print.rs
[A5]: https://github.com/ast-grep/ast-grep/blob/ef4f4fd3535fa76c59f7c7f5e9f4c7f319ab948a/crates/cli/src/utils/worker.rs
[A6]: https://github.com/ast-grep/ast-grep.github.io/blob/47a2c45821c05e8d8ec820cbab03f46c54ce3aa5/website/reference/languages.md
[A7]: https://github.com/ast-grep/ast-grep/blob/ef4f4fd3535fa76c59f7c7f5e9f4c7f319ab948a/crates/language/src/lib.rs
[A8]: https://github.com/ast-grep/ast-grep.github.io/blob/47a2c45821c05e8d8ec820cbab03f46c54ce3aa5/website/guide/test-rule.md
[O1]: #local-host-source
[O2]: #local-architecture-evidence

### Local host source

**O1:** Git object `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0:packages/opencode/src/tool/lsp.ts`, inspected via `git show` in supplied metadata-only worktree. Operation list and execution path establish existing primitive surface, not plugin API stability or provider completeness.

### Local architecture evidence

**O2:** Git object `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0:specs/hugr-maestro/atlas-foundation-seam-register.md`, inspected via `git show`. Register references Atlas source snapshot `b319723`; its historical test claims were not re-run or independently endorsed by R10.
