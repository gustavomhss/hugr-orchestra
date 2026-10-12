# Native record inputs

Read before creating or revising research records/documents. These are input contracts, not a claim that a tool is installed. Use only tools exposed and permitted in the actual task. Missing capability is a named blocker; a skill cannot install it.

## `research_record`

The closed input is one of four branches. Do not add binding, owner, project, root, Session, status, acceptance or receipt fields.

```ts
type RecordInput =
  | {
      action: "question"
      question: string
      selection: Selection
      id?: QuestionID
      baseRevision?: number
    }
  | {
      action: "finding"
      proposition: string
      nature: "extraction" | "observation" | "inference" | "hypothesis"
      conditions: string[]
      evidence: EvidenceRef[]
      contrary: EvidenceRef[]
      reason?: string
      id?: FindingID
      baseRevision?: number
    }
  | {
      action: "relation"
      from: RecordRef
      to: RecordRef
      relation: "supports" | "refutes" | "depends-on" | "related" | "answers"
      reason: string
    }
  | {
      action: "document"
      document: {
        genre: Genre
        title: string
        body: string
        findingRefs: RecordRef[]
        citations: Record<string, EvidenceRef>
      }
      id?: DocumentID
      baseRevision?: number
    }
```

This notation describes shape; IDs and references must come from real host receipts. On create, omit `id` and `baseRevision`. On material update, use the admitted identity and current base revision. Relation inputs have no authored `id` or `baseRevision`. `conditions`, `evidence` and `contrary` are required arrays even when empty. Empty evidence cannot make a hypothesis an observation.

`Selection` contains required `profile`, `depth`, `genre`, optional `specialization` and optional `modality`. Profiles: `locate`, `understand`, `investigate`, `evaluate`, `research`. Depths: `quick`, `focused`, `deep`. Genres: `answer`, `map`, `explanation`, `comparison`, `evidence-review`, `opportunity`. Modalities: `exploratory`, `analytical`, `comparative`, `evidence`, `applied`, `opportunities`; omit outside research and for simple facts.

## References and citations

`RecordRef` is `{ id, revision }` for a question, finding or relation. `DocumentRef` is `{ id, revision }` for a document. `SourceRef` is `{ artifact: { id, revision }, representation, digest }`. `EvidenceRef` is `{ source: SourceRef, locator }`. They are distinct; a file path, URL or Memory reference is not one of these handles.

Representation is `received`, `text`, `markdown`, `html` or `structured-json`. Locators are `{ kind: "lines", start, end }`, `{ kind: "quote", exact, prefix?, suffix? }`, or `{ kind: "json", pointer }`. Use positive line coordinates and ordered inclusive bounds in the admitted representation, exact contextual quotes, or a valid structural pointer. Do not reuse LSP character offsets as these locators.

For a document, citation labels in Markdown must resolve to the `citations` map's admitted evidence values. Use a readable label convention such as `[E1]` consistently. A document is nested under `document`; `genre`, `title`, `body`, `findingRefs` and `citations` are not top-level action fields. Native reference validation does not check every inference's correctness.

## Outcomes and bounds

Use returned references only after actual admission. On uncertain publication, inspect committed state through [retrieval](reading-tools.md); do not create a replacement document and call it the missing original. On conflict, reopen and reconcile before revising. Preserve exact refusals and unavailable-source details.

Lists have a maximum of 32 items; record-view pages can request at most 100. Proposition/question, condition/reason, quote, event, document and acquisition limits are additionally host-enforced. Split substantive questions/documents when needed; never strip decisive evidence to make an oversized claim appear complete. [Closure](closure.md) uses only admitted returned handles.
