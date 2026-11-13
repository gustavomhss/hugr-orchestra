# Rag Studio — spec v1

Status: fix-first from the cold review, then corrected. Not started. Contract `17a340bf`.

The acceptance id is the requirement. This spec closes the forks that review found. It does not add a product feature.

## Charter, not suite

These are Orchestra rules. They are not acceptance items. An implementer still follows them.

One SQLite database. Drizzle `sqliteTable`, snake_case, no quoted column names. No new process. No import of `child_process`, `cross-spawn`, `bun-pty`, `@lydell/node-pty`, or `hugr-omni`. No write under `.atlas/`.

## Place

| Piece | Path | Who |
| --- | --- | --- |
| Behavior | `modules/rag-studio/src/<wp>.ts` | the WP in `work-packages.md` |
| Tables | `packages/core/src/rag-studio/sql.ts` | the lead, once |
| HTTP | `packages/protocol/src/groups/rag-studio.ts` plus one `.add` in `api.ts` | the lead |
| Chapter register | `chapter-route.tsx`, `navigation.ts`, `module-architecture.json` | the lead |
| Screens | `packages/app-shell/src/orchestra/chapters/rag-studio/{files,question,maintain}.tsx` | the three UI WPs |

## Frozen values

- `parser` default `"plain"`. `boundary` default `"document"`. `tokenizer` default `"utf16"`. `k` default `4`. `lexical` is `true`. `embedding` is `false` until a model is named.
- A plain-text or markdown file is UTF-8 text. Markdown is not a second parser. PDF text is `unpdf` page strings joined by `"\n"`. A PDF page with no text layer sets the source to `failed`.
- Offsets are UTF-16 code units in that string. `chunk.text` equals `admittedString.slice(start, end)`.
- Word match is a case-sensitive substring of `chunk.text`. Search returns every match, ordered by source path, then `start`.
- A byte change sets status to `not_yet_read`, not `failed`.
- Hash stale means `rag_source.content_hash !== rag_chunk.source_hash`. There is no order on a hash.
- `reasons` has all four light keys. Each value is that light's own name.
- Prompt block order is source path, then `start`.
- The English sentence for J04 is `Retrieval is unnecessary.` It is shown only when `retrievalOptional` is true.
- Snapshot membership is the rows in `rag_revision_source`. The snapshot hash is BLAKE3 of those rows sorted by `source_id`. Absent means no row for that source in that revision.

## Tables

`rag_source`: `id`, `location_id`, `path`, `content_hash`, `status`.

`rag_chunk`: `id`, `source_id`, `start`, `end`, `text`, `source_hash`.

`rag_revision`: `id`, `location_id`, `snapshot`, `pipeline_hash`, `fill`, `parser`, `boundary`, `tokenizer`, `k`, `embedding_model`.

`rag_revision_source`: `revision_id`, `source_id`, `content_hash`.

`rag_question`: `id`, `revision_id`, `text`, `span_source_id`, `span_start`, `span_end`.

`rag_trace`: `question_id`, `hits`, `dropped`, `k`. Both lists are JSON arrays of chunk ids. Missing list is not stored as the string `not_recorded`.

`rag_pipeline`: `location_id`, `parser`, `boundary`, `tokenizer`, `k`, `blocked`, `embedding_model`, `query_model`, `dimension`, `numeric_type`, `metric`.

`rag_vector`: `chunk_id`, `model`, `location_id`, `values`. Vectors are not written under `.atlas/`.

Every read joins to `rag_source.location_id` and filters by the request location.

## Calls

These names are closed. An implementer does not invent another.

| Call | Behavior |
| --- | --- |
| `admit` | Creates one source, or returns `{ refused: "atlas" }` or `{ refused: "permission" }`. Permission is `PermissionV2.evaluate("external_directory", path, location rules)`. Anything but `allow` is `permission`. |
| `listSources` | This is the inventory. No second list call. Rows for that location only. A removed source is absent. |
| `readRevision` | Returns snapshot, pipeline hash, and fill for that id. A missing id is rejected. A display name is not an id. |
| `removeSource` | Deletes the `rag_source` row. Does not delete chunks. Does not run `orphan_delete`. |
| `parseSource` | Plain text with extracted text becomes `read`. PDF with no text layer becomes `failed`. |
| `replaceChunkText` | Always returns `{ refused: "not_source_text" }`. Writes nothing. |
| `readPipeline` / `setPipeline` | `setPipeline` changes exactly one of `parser`, `boundary`, `tokenizer`, `k`, `embedding_model`, `query_model`, `dimension`, `numeric_type`, `metric`. That changes `pipeline_hash`. Naming `embedding_model` turns embedding on and does not write a vector. Other fields stay. A boundary change makes existing chunks ineligible for the new revision: `ask` does not light `sent` until `rechunk`. |
| `searchWords` | Substring match on current `read` chunks only. |
| `ask` | Requires a revision id. Rejected, no light, if the id is missing, fill is `failed`, or any hit chunk is hash-stale. Does not create a chat. Does not change source ids, hashes, chunk text, or the snapshot. |
| `saveQuestion` | Stores text, span coordinates, and revision id. |
| `retrievalProof` | True only when the saved span's chunk id is in that revision's prompt chunk ids. |
| `citationProof` | True only when the stored text of the resolved span contains the given sentence. |
| `compareRevisions` | Rejected unless the proof-set id and snapshot match and exactly one of `parser`, `boundary`, `tokenizer`, `k`, `embeddingModel` differs. Result rows are `{ id, text, startChanged, endChanged, textChanged }`. The text is the saved question, not a label kept in memory. A new span is a chunk whose stored text contains that sentence. |
| `enableEmbedding` | Always `{ refused: "embedding_off" }`. Writes nothing. |
| `runPass` | One pass. While no model is named, `redo_numbers` returns `{ pass: "redo_numbers", result: "not_applicable" }` and writes nothing. After a model is named, it writes vectors only when a key is present at that call. |
| `runPasses` | If `passes.length !== 1`, returns `{ refused: "one_pass" }` and writes nothing. |

`runPass("reparse")` reads the file, sets `content_hash` and status `read`, writes no chunks. `runPass("rechunk")` before that reparse writes nothing eligible. `runPass("orphan_delete")` deletes chunks whose source row is gone and does not recreate them.

No pass runs because bytes changed, the boundary changed, a source was removed, or a screen opened. A pass on one source does not change another. The file at the admitted path is not unlinked and its bytes are not rewritten.

## Lights

Computed only when both hit and dropped lists are recorded.

| Condition | Result |
| --- | --- |
| Sentence in no admitted file | `not_in_corpus`, no span, empty hits |
| Only copy is `not_yet_read` or `failed` | no light, that status, no chunk from that file |
| Sentence in a `read` file, span not in hits | `search_miss`, that span |
| Span in hits, not in the prompt block | `dropped_before_model`, span id in `dropped` |
| Span in the prompt block | `sent`, no claim the model used it |

Prompt block length is at most `k`. Fewer matches means the length equals the survivors. A proof whose K is not the revision's `k` is rejected.

## Screens

`files.tsx` lists admitted files with the true status and paints the cut on the source text. A removed source is not listed.

`question.tsx` shows exactly one light on, matching `ask`, without hover. The span is on the source text for `search_miss`, `dropped_before_model`, and `sent`. No span when the light is `not_in_corpus` or no light is on. The sentence `Retrieval is unnecessary.` appears only when `retrievalOptional` is true. The screen does not say the model used the span.

`maintain.tsx` has four controls: read again, cut again, redo numbers, remove pieces. No control runs two. There is no reindex button. After one boundary change and a separate rechunk, it lists every saved question and whether the span changed.

## Out

Chat session. Assistant answer. Node canvas. Graph. 3D view. Python parser. Generated screen. FTS5. A second parser for markdown. A dry-run preview. Turning embedding on with no model named.
