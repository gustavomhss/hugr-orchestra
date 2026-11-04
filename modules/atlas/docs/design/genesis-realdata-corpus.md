# Genesis real-data corpus v1 — FIXED REAL-CLAIM INPUT

`script/atlas-genesis/realdata-corpus-v1.json` freezes data, not judgment.
It is **not** completed independent gold, judge calibration, an end-to-end evaluation,
or replay of historical raw model responses.

## Provenance and boundary

- Claims come verbatim from the literal tab-delimited `claim` fields in
  `modules/atlas/harness/probes/adjudicate/xrepo-zod-a1-verdicts.tsv`, Git blob
  `3ed2bf6bff4551384c4ffdd2ca3662a6b26663b3`.
- The 76 historical IDs are item identifiers, not source revisions. Sort them
  lexicographically: the first 24 are `calibration`, the remaining 52 `heldout`.
- Entries carry only `id`, `path`, `claim`, and `partition`. Historical votes and
  model provenance remain in existing artifacts; they are not independent labels.
- Sources are pinned to `colinhacks/zod` at
  `ca42965df46b2f7e2747db29c40a26bcb32a51d5`. The public GitHub recursive tree
  returned `truncated: false`; every claimed path and `LICENSE` was a regular
  `100644` blob. No source-code payload was downloaded for this freeze.
- Read-only provenance endpoint:
  `https://api.github.com/repos/colinhacks/zod/git/trees/ca42965df46b2f7e2747db29c40a26bcb32a51d5?recursive=1`.
- `sources` deduplicates claimed paths; `license` separately pins `LICENSE` to
  blob `2c93bb52b93391e665d01947afadde0d98e0ede5` for downstream source use.
- Paths identify files, not recovered historical unit extents. Raw prompts,
  answer envelopes, and independently justified gold labels are not supplied.

## Test-first packet and remaining proof

`script/atlas-genesis/realdata-corpus.test.mjs` was authored before the manifest.
Its one assertion body checks the actual committed TSV's Git blob and literal
fields, ordering, split, blinded entry keys, source coverage/hash syntax, and
license provenance. In-memory mutants reuse that body; they are not new claims
or calibration examples. The tests do not check truth or fetch remote sources.

Local tests were deliberately not run. After cold review, the lead owns grouped
remote execution (`node --test script/atlas-genesis/realdata-corpus.test.mjs`),
independent immutable-tree membership/mode checks, and source byte/Git-blob
verification before integration. Missing/nonregular sources must fail, never
substitute current source. Independent blind labeling, evidence-bearing reasons,
frozen judge settings, and held-out scoring remain separate future work.
The `heldout` name denotes a fixed split, not a claim that this public corpus has
never been seen by a model or reviewer.
