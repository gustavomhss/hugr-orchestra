# Context Continuity: working memory and transcript archive

This supersedes the selector/exact-value memory design in the earlier contract.
The product remains V1 prompt continuity; the memory artifact format is version 2.

## User intent

Keep the result of discovery, its intent and why it matters. Do not preserve the
investigative journey in active memory. Details need not be reproduced from memory:
retain awareness and a location when they may be needed. Store the complete
conversation-visible transcript in smaller, organized, hashed Markdown files.
The fork decides which references remain relevant; removing an active reference
does not delete the archived fragment. Success means continuing work and recovering
needed details, rather than answering every historical trivia question unaided.

## Two representations

1. The durable session transcript remains authoritative. A session-owned Markdown
   archive preserves user/assistant text and tool observations, including failures,
   exact captured output and its availability qualifications. Model-private reasoning
   and worker-system prompts are not conversation-visible archive material. Media
   retains metadata and original locators; no claim of reconstructed binary content.
2. Active memory is readable Markdown: current objective, constraints, discoveries,
   decisions with intent/why, current state and pending work. It is allowed to omit
   the exact commands, hashes and intermediate attempts when a reference is enough.
   Important constraints remain in the memory itself; a reference cannot silently
   replace a currently applicable prohibition or approval requirement.

## Archive ownership

`Archive.Service` stores files below `Global.Path.data/continuity/<session-key>/`.
Session paths are host-derived. A SHA-256 of the exact UTF-8 Markdown bytes is each
fragment ID and filename. The Markdown includes owning session and source-message
identity so equal text in another session has a different archive identity.
Large source records are split deterministically at Unicode-safe boundaries; each
piece states continuation and source identity. Payload bytes are not silently cut.

Publishing is idempotent. A readable index is atomically replaced after immutable
fragment writes succeed. Existing references remain addressable when memory drops
them; lookup/search can rediscover them through the archive index. Reads verify the
content hash and session membership. Corrupt/missing fragments return a named
unavailable result, never a substitute file or forged receipt. The store owns paths,
not model text. No model-supplied filesystem path is opened.

Archive publication covers full available transcript. Producer input uses the same
active-history projection as the parent, respecting existing native compaction,
then previous valid working memory plus the newly displaced head. First maintenance
must not re-expand old raw history behind a native compacted summary.

## Producer and reader contract

The producer remains an isolated maintenance call, without tools or execution
authority. It receives a natural Markdown transcript, prior memory and an inventory
of archive references. It does not receive a scalar source catalogue or provenance
dictionary. Transport has only two fields: `memory` (Markdown) and `references`
(`id`, `why`). This wrapper supports reliable extraction; it is not the reader's
format and does not require per-fact schemas or exact-selector bookkeeping.

The host validates nonempty memory, closed transport, known own-session reference
IDs and complete stop termination. It appends reference titles/IDs and retrieval
instructions to the Markdown. Markdown describes historical data; parent role,
permissions, live instructions and newer turns prevail. Schema acceptance cannot
prove semantic accuracy. Native constrained JSON is used where supported.

The fork may drop prior references without replacement-source bookkeeping. The
archive keeps those fragments. It must retain unresolved work, live constraints,
corrections and uncertainty. Tool completion is not proof that the objective was
achieved. Citation validity is an integrity property, not entailment proof.

## Size, scheduling and recovery

Approximately 70% reduction is an initial soft target, not a fidelity gate. There
is no fixed 6,000-token semantic cap. Production requests and resulting active
context must fit the selected model's real input/context capacity with native tail
and output reserve. Oversized input is processed in whole-turn incremental batches;
unfinished coverage remains native context. No unseen history is claimed covered.
A separate operational timeout bounds a stalled call; it is not a quality metric.

The existing nonblocking scheduler, one active maintenance job per session, safe
completion boundary, stale-generation checks, cancellation and previous-context
fallback remain. Failed publication or generation never authorizes pruning. Recall
must be operational for archived detail to replace active context; revoked capability
restores native history. Edits/reverts invalidate memory coverage. Session deletion
forgets active memory; archive references never grant access to another session.

`context_recall` supports an own-session archive reference, listing/searching archive
awareness and bounded UTF-8 Markdown pages. Existing own-session message/part lookup
remains compatible. Dropping an active reference must not make the archive disappear.

## Acceptance spine

- Archive reassembles exact captured text/tool observations across Unicode splits;
  mutation changes the hash, cross-session references and foreign paths fail.
- Publishing twice is stable; interrupted publication does not expose a partial
  index; references remain readable after active-memory retirement.
- A long investigation is replaced by a discovery, intent, why and retrievable
  evidence. Live obligations/corrections survive while attempt logs leave memory.
- The producer sees prior memory plus displaced active turns, never all pre-native-
  compaction history. Whole tool exchanges and the native tail remain intact.
- Parent continuation uses the memory, identifies a needed detail and retrieves its
  exact archived evidence through the real tool; then makes the correct next move.
- Missing/corrupt archive, no recall, malformed/partial/tool-using output, timeout,
  stale results and cancelled jobs preserve usable parent context.
- Reader Markdown contains no scalar selector/provenance dictionary. Reference
  retirement is producer-selected, without deleting historical files.
- Repeat maintenance is incremental; model input/output capacity is respected and
  reduction is measured rather than imposed as an arbitrary 6,000-token ceiling.

Semantic continuation quality and relevance are judged through frozen scenarios,
independent grading and real provider results. Mechanical checks do not certify them.
Old trivia scores remain historical and cannot approve this new design.
