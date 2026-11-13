# Rag Studio

Rag Studio is for documents you admit. It is not a second chat, and it does not index the project source. That stays in Atlas.

## What you can see

The Files section lists every admitted file as exactly one of read, failed, or not yet read. Open a file and the cut is painted on the source text.

The Question section turns on exactly one of four lights: not in the documents, search missed it, dropped before the model, or sent. Sent means the span was in the block that would go to a model. It does not mean the model used it. When fewer matches than the limit, the screen says retrieval is unnecessary. The header says embedding is off until you name a model. After that, it names the model. It still does not claim the model used the span.

Maintain is the pipe. Parser and tokenizer are shown, stored, and hashed. They do not change the cut. Boundary, and how many pieces enter the block, do. Word search stays on. You name an OpenRouter model; nothing is chosen for you. Dimension, number type, and metric are on the same pipe. Fusion is by rank, and only once the numbers are in. Until you name a model, embedding stays off.

Four passes stay separate: read again, cut again, redo numbers, and remove pieces. None of them runs two. There is no reindex button. Read again does not recut. Cut again uses the current boundary. Redo numbers writes vectors for the named model, beside the pieces, not under `.atlas/`. Without a model it does not apply. Without an OpenRouter key it writes nothing. Remove pieces deletes pieces whose file left the corpus.

Compare saved questions only when one of parser, boundary, tokenizer, the piece count, or the embedding model changed.

## What does not enter

Opening a folder through a symbolic link and through its real path uses one corpus, including on Windows. Files in a neighboring folder need external-directory permission.

A folder outside any Git repository keeps that folder's own corpus. A path inside the project source tree is refused, including a path that only becomes project source after it is made canonical. Nothing is written under `.atlas/`. There is no preamble switch and no reranker.
