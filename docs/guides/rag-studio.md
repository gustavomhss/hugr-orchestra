# Rag Studio

Rag Studio is for documents you admit. It is not a second chat, and it does not index the project source. That stays in Atlas.

## What you can see

The Files section lists every admitted file as exactly one of read, failed, or not yet read. Open a file and the cut is painted on the source text.

The Question section turns on exactly one of four lights: not in the documents, search missed it, dropped before the model, or sent. Sent means the span was in the block that would go to a model. It does not mean the model used it. When fewer matches than the limit, the screen says retrieval is unnecessary.

Maintain has four separate controls: read again, cut again, redo numbers, and remove pieces. None of them runs two. There is no reindex button. Redo numbers does not write anything.

## What does not enter

A path inside the project source tree is refused, including a path that only becomes project source after it is made canonical. Nothing is written under `.atlas/`. Embedding stays off.
