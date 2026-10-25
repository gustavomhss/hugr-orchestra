# Artifacts (session panel)

New surface. Agents produce artifacts through `image_create`, `video_create`, `document_edit`, `sheet_edit` and
`artifact_show`. Today the user sees only tool-call text in the transcript.

## Contract

`server.capability.artifacts` (`packages/protocol/src/groups/capability-artifacts.ts`), all under
`/api/capability/sessions/:sessionID/artifacts`:

- `artifact.list`: page of at most 32, `after` cursor `<artifactID>:<revision>`, `coverage: live`.
- `artifact.get` and `artifact.content` take `:artifactID/:revision`. Content is served with attachment, sandbox and
  no-store headers. It supports one `bytes=` range (206) and answers 416 for an unsatisfiable range.
- `artifact.share`: `{ targetSessionID }`. `artifact.pin`: `{ pinned }`. `artifact.removeReference` (DELETE). Each
  needs an `idempotency-key` header and returns a `Receipt`.
- `Artifact`: `artifact` ref (id, revision), `mime`, `kind`, `hash` (sha-256 hex), `bytes`, `verification`
  (`acknowledged`, `observed`, `verified`), `timeCreated`, `pinned`.

## Requirements

- A01. The session view has an Artifacts panel listing the session's artifacts, newest first, with pinned items on top.
  Each row shows kind icon, mime, size and relative time.
- A02. Selecting an artifact previews it inline by mime. Images and video use the content URL. PDFs use the
  platform viewer. Spreadsheets show the first sheet as a read-only table. Any other mime offers Download only.
- A03. Video and large files load through range requests. The panel never buffers a whole video before playing it.
- A04. The preview shows the verification level. `verified` gets no badge; `observed` and `acknowledged` get a quiet
  "Not verified" note with a tooltip explaining it.
- A05. When a tool result in the transcript carries `artifactRefs`, each ref renders as a chip that opens the panel at
  that artifact and revision.
- A06. Pin toggles `pinned`. Remove calls `removeReference` after a confirm that says the artifact leaves this session
  only.
- A07. Share opens a picker of the location's other sessions (D2). It sends one request per target and reports the
  receipt.
- A08. Every mutation reuses its idempotency key on retry and shows "Original request reused" when `reused` is true, as
  the Integrations model does.
- A09. An empty session shows nothing. The panel toggle appears only once the session has at least one artifact.

## Out of scope

A global artifacts chapter (D1), editing artifact contents, public links.

## Tests

Model tests for paging, pin and remove ordering, and retry receipts. One browser test previews an image and opens a
transcript chip.
