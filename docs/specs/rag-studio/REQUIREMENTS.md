# Rag Studio — requirements

The requirement is the acceptance item. This file groups them. It does not restate them in looser words. The statement that must go red to green is the line in `ACCEPTANCE.md` with the same id. A second paraphrase would drift.

Contract: `CONTRACT.md` @ `7c2ae7a5`. Seam: `seam.ts`, emitted by `stub-gen`. Critic: two consecutive covers. Nothing is built.

## R1 Admit

The person admits a file. The studio does not admit the project, a path that only canonicalizes into it, or a path outside the location without permission. Nothing is created on open.

A76 A01 A02 A03 A77 A04 A95

## R2 Read

A new file is `not_yet_read`. A successful plain-text parse is `read`. A PDF page with no text layer is `failed`. The stored chunk text is the admitted slice. Invented chunk text is rejected.

A05 A51 A07 A08 A12

## R3 Revision

A revision is snapshot, pipeline hash, and fill. A display name is not an id. Diagnosis without an id is rejected. The pipeline values are readable. Changing K, the parser, or the boundary changes the hash. A byte or membership change changes the snapshot and rejects comparison against the previous revision.

A15 A16 A70 A93

## R4 Search

Word search returns only chunks whose stored text contains the word, and never a chunk from an unread, failed, or stale source. The span is `start`/`end`, not the FTS snippet. An empty corpus invents nothing.

A52 A74 A79 A19 A48

## R5 Embedding stays off

No path invokes an embedding model or writes a vector. A request to turn it on is rejected. Redo-numbers returns `not_applicable` and writes nothing.

A65 A83 A87 A92

## R6 Question

A completed question records hits and the dropped list. If either is missing, no light turns on. Exactly one light is on when the relevant files are read. The span names the file and the coordinates, and the bytes there contain the sentence. The prompt text equals the stored slices, at most K of them. The result does not say the model used the span, does not create a chat, and does not change the corpus.

A20 A75 A21 A59 A22 A23 A24 A25 A26 A27 A58 A61 A62 A63 A71 A78

## R7 Proof

A saved question stores text, span, and revision. Retrieval proof passes only when that span is in the prompt block. Citation proof passes only when the stored text contains the known sentence. A one-stage comparison, after a separate rechunk, lists which saved questions changed span, including one that changed and one that did not. `retrievalOptional` is true only when the matching chunks fit in K.

A28 A29 A30 A31 A33 A73 A60 A82

## R8 Maintain

Four passes, one per call. Changing bytes, the boundary, or membership does not run a pass. Opening a screen does not run a pass. Before the pass, stale cuts are not served. Reparse updates the hash and does not cut. Rechunk of bytes that were not reparsed writes nothing eligible. After both, the new sentence can be sent and the old one cannot. A partial failure leaves fill failed and does not light `sent`. Orphan-delete removes that source's chunks and does not recreate them or touch the other file. The person's file on disk is unchanged.

A84 A66 A89 A91 A67 A85 A96 A55 A81 A68 A88 A94 A35 A36 A69 A80 A49 A56 A72 A97 A86

## R9 Place

A corpus in one location is not listed in another.

A47

## R10 Screen, judged by the owner

These do not auto-green.

J01 J02 J03 J04 J05 J06 J07 J08 J09 J10

## Coverage

Every id in `ACCEPTANCE.md` is named above. If a new id appears there and not here, this file is wrong. Do not add a requirement that has no id.
