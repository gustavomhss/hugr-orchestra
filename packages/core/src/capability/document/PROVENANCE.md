# Native document and spreadsheet adapters

## Construction and authority

`CapabilityDocuments.make(options?)` returns the frozen `document_read` and `document_edit` canonical `Tool.make` values. `CapabilitySheets.make(options?)` returns the frozen `sheet_read` and `sheet_edit` values. The host supplies optional artifact-store fixture options; model inputs never accept paths. Registration remains the producer's responsibility.

Each invocation requires a host-issued `CapabilityInvocation` whose exact root name matches the executing native tool, a persisted pending/running root tool part, current native-tool policy, and separate artifact read/write policy. Native policy resources are `artifact:<id>:<revision>`, or `capability:native:pdf` / `capability:native:sheet` for creation. Policy is rechecked after worker completion and before each publication. These checks use separate short transactions, not one transaction spanning worker execution or multiple publications.

Inputs are copied before the first authorization yield. Revision-changing operations require `expectedRevision` equal to the input ref's revision and use Artifact's SQL compare-and-swap. Previous bytes remain immutable. Read output contains bounded document content and operation metadata, not private artifact-record metadata, storage paths, worker errors or binary/base64 payloads. Raster and edited bytes are published as opaque verified ArtifactRefs.

These synchronous, bounded workers do not create durable Job rows. A process restart does not resume a worker. Interruption terminates the owned worker and propagates through settlement.

## Supported operations

PDF format is `localpdf`. Read returns title/author/subject, page dimensions/rotation, field values and per-page text. Optional raster publishes PNG artifacts for up to four selected pages. Blank or image-only pages return `partial` with an explicit no-OCR statement; empty text is not proof that a page was scanned.

PDF edit operations are `create`, `fill`, `flatten`, `merge`, `split`, `rotate`, `stamp`. Creation uses finite page dimensions and explicit bottom-left text coordinates, in PDF points. Text must fit the selected page and be encodable by Helvetica/WinAnsi. Fill supports actual text, checkbox, dropdown, option-list and radio fields; unknown fields and unsupported values fail. Merge/split reject interactive forms because copying pages does not preserve their field trees. Encryption and encrypted inputs are unsupported.

Flatten calls `pdf-lib`'s actual appearance-burning `form.flatten()`. In 1.17.1, `removeField` removes appearance references from annotations rather than widget references and then deletes widget objects. The adapter captures positively identified widgets before flattening and removes those references afterward. Reopened raw AcroForm Fields and page Widget annotations must be absent. PDFium independently parses and renders every output page; existing per-page text and requested created/stamped/flattened text are checked. Exotic appearance layout is not a pixel-equivalence claim.

Spreadsheet formats are `xlsx` and `csv`. XLSX supports create, cell edit, a bounded style subset, new workbook-scoped A1 names, and limited row/column insertion/deletion. `sheet_read` separates literal display/type from formula expression and cached-result presence. Cached values are observations, never recalculated results. All edited formula caches are cleared, and `fullCalcOnLoad` is a request to a future viewer, not evidence of calculation. `recalculate` explicitly fails; formula-bearing results are `partial`.

The closed formula grammar accepts local A1 refs and ranges, absolute `$` markers, decimal numbers, arithmetic, parentheses and SUM/AVERAGE/MIN/MAX/COUNT. Structural deletion contracts surviving ranges and emits `#REF!` for deleted references. String literals, cross-sheet/3D/external refs, names in formulas, structured references, dynamic arrays and other functions are unsupported. Restructure rejects names, merges, filters, frozen views, validations, conditional formatting, charts and related reference-bearing features before mutation. Other edits also reject unsupported formula grammar and package features that cannot be preserved safely.

CSV uses strict UTF-8 and explicit comma, semicolon, tab or pipe delimiters. RFC-style quoted delimiters, quotes, CRLF and embedded newlines survive readback. Import keeps all cells literal by default, including leading `=`, numeric-looking strings and ISO-date strings. `formulas: true` explicitly opts into the closed formula grammar. A header option splits read output into header/body or styles the imported first row. Export includes the selected first row by default; `header: false` omits it. Formula export is explicit, or exports existing caches with an uncalculated-result limitation; absent caches fail rather than invent values. Ranges are inclusive and 1-based.

## Bounds and resource packaging

The implementation admits at most four worker requests and runs one compute worker at a time per process. Each request has 8 MiB aggregate input/output bytes, 64 KiB operation JSON, 100 PDF pages, 20 worksheets, 10,000 cells, 256 columns, 10,000 rows, 32 MiB ZIP inflation, 1,024 ZIP entries, 16,000 captured PDF characters, 48 KiB model metadata and one million aggregate raster pixels. The 15-second work deadline includes the compute queue. ZIP inflation, coordinates, named-range expansion and external relationships are checked before ExcelJS decoding. Model read captures are explicitly truncated or fail the metadata budget.

`node:worker_threads` is the actual installed runtime API; OpenClaw's worker pool is not installed as a runtime dependency. The worker requests a 128 MiB old-generation limit and 16 MiB young-generation limit. **This is not a proven total-RSS or PDFium WASM-memory ceiling under Bun.** The lead must qualify OS/process-level memory enforcement before claiming a hard process-memory bound. Byte/inflation/page/cell/pixel limits and single-worker concurrency are implemented independently of that limit. Thread isolation is an execution boundary, not an OS security sandbox.

The producer/package must preserve or build `document/worker.ts` and its operation-local imports. The current source entry URL targets Bun TypeScript execution; a compiled distribution must supply a corresponding resolvable worker entry. Preserve `clawpdf/dist/vendor/pdfium.esm.js`, `pdfium.esm.wasm`, clawpdf LICENSE and THIRD_PARTY_NOTICES.md, plus dependency/transitive notices. The installed PDFium release is 7902 and its package-declared WASM SHA-256 is `f3fe52ae7f150e912a8379ec4478cac9c11b4135dc56fdc039b0ff885f1c0981`. This work does not independently re-qualify that binary hash or a bundled desktop executable.

Multiple output publications are separate immutable Artifact transactions, not an atomic batch. A late storage failure or interruption can retain earlier output artifacts. No exactly-once retry or post-crash recovery is claimed.

## Source evidence and intentional changes

This is a first-party TypeScript adaptation, not an embedded Python runner. No upstream runtime script was copied verbatim.

The inspected Hermes source is [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent/tree/134e08ca6d272c9b9610ce5889e2ecff9c73adf0), commit `134e08ca6d272c9b9610ce5889e2ecff9c73adf0`, MIT:

- `skills/productivity/pdf/scripts/pdf_read.py`: page metadata, field inventory and explicit no-text/OCR distinction.
- `pdf_create.py`, `pdf_stamp.py`: finite page layout and bottom-left point coordinates, adapted to direct pdf-lib drawing rather than ReportLab/Python/host paths.
- `pdf_fill_form.py`: field existence and actual checkbox on-states. Its `--flatten` path only sets `ReadOnly` (`flags=1`) and reports `flattened=true`; that algorithm is deliberately **not** used.
- `skills/productivity/xlsx/scripts/xlsx_read.py`: formula/cache distinction, adapted to ExcelJS's separate formula/result properties.
- `xlsx_edit.py`: cell/styles/names operation vocabulary; implicit type/formula inference is deliberately replaced with explicit literal/formula schema variants.
- `xlsx_restructure.py`: point/span shifting, absolute-marker preservation, deleted-reference handling and supporting-feature inventory. The adapter uses a closed parsed grammar and rejects unsupported supporting features instead of claiming broad reference rewriting.
- `csv_to_xlsx.py`: delimiter/header import mappings; default type inference is deliberately disabled.
- `xlsx_recalc.py`: evidence that openpyxl cannot calculate and an absent LibreOffice can still exit zero. No LibreOffice installation, success-by-exit-code or calculated-results claim is inherited.

The inspected OpenClaw source is [openclaw/openclaw](https://github.com/openclaw/openclaw/tree/2a305612539ccbb63a19b2030a05158dddd42a64/extensions/document-extract), commit `2a305612539ccbb63a19b2030a05158dddd42a64`, MIT:

- `document-extractor.runtime.ts`: lazy clawpdf engine creation, page/text selection, aggregate rendering budget and resource destruction.
- `document-extractor.worker.ts`, `document-extractor.ts`: private worker messages, cancellation/deadline ownership and one compute heap. Adapted to first-party Effect-scoped worker termination and byte-only messages, without depending on OpenClaw's pool or plugin SDK.

Source notices are included in `NOTICES`. Runtime pins come from the lead's dependency commit: pdf-lib 1.17.1, clawpdf 0.3.2 and ExcelJS 4.4.0. Their installed declarations, rather than remembered APIs, were used.

## Local evidence

The owned tests use real PDF forms, workbooks and CSV bytes; actual Artifact SQL, root binding, current policy and canonical `Tool.settle`; library reopening, PDFium parsing/rendering and raw field/widget inspection. They cover immutable revisions/CAS, literal/formula/cache distinctions, unsupported external relationships, coordinate bounds, missing calculation, root/Session scope and interruption without publication.

Two mutation probes were run: replacing flatten with `enableReadOnly()` failed the form test; promoting leading-`=` CSV literals without opt-in failed the import/export test. Both mutations were reverted. These are local conformance checks, not CI or bundled-worker acceptance.

Full `bun typecheck` is blocked at this baseline by `test/capability-connections.test.ts` exposing `NotFoundError | Capability.Failure` where its helpers require `Capability.Failure`. Source plus the two owned tests can be checked separately with a temporary config extending Core's config and including `src/**/*.ts` and these exact tests; that temporary file is not shipped. No shared test, package manifest, lock, SQL, registry or public API was edited by this adapter work.
