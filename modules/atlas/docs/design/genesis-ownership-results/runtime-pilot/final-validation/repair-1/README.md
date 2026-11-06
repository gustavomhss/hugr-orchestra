# Integrated repair checkpoint

The first integrated run failed; its evidence and the consumer v3 decisions remain unchanged.

- Scoped Atlas run [42146218143](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42146218143)
  passed at `7b3230ee50e04443201419298f2677e049dd078c`: all 80 tests and four named rejecting mutations.
- `scoped-evidence-v1.json` binds the actual reports, the original technical judgment and corrected
  commit-to-commit workflow diff. `artifact-verification-v1.json` records the lead's source/report checks.
- Downloaded generated outputs were reconciled byte-for-byte. Only `boundary/src/generated/mine.js`
  differed from the prior local outputs, matching the already-authoritative multi-fact proposal template.
- Recursive archive exceptions were rejected. The replacement uses exact path/SHA-256 pins; new paths
  and changed bytes are not exempt. Existing product-copy and adjacent-path controls remain.
- Terra 1's second judgment accepts that boundary and actual mutation evidence. The first judgment
  remains immutable, including the workflow-deletion finding caused by the lead's bad working-tree diff;
  `actual-workflow-diff.patch.txt` corrects that evidence without rewriting the original judgment.

The previous Linux/Windows PASS covered the rejected recursive exception, **not** the replacement.
The new exact-pin core run is pending at this checkpoint. No follow-up integrated PASS, merge,
production installation, additional consumer run or global campaign closure is implied.

The frozen recovery worklist is not edited to record later status. This separate receipt supersedes
its then-open technical-review status without changing its historical bytes or regenerating its pin.

## Hygiene correction after technical review

`agent-scratch` rejected three duplicate raw logs copied into `attempt-1/`. The originals remain in the
external campaign directory, byte-identical to the unchanged recorded digests. The three repository
copies and only their three pin entries were removed, with no remaining pin changed or added.
`pin-shrink-v1.json` records that monotone reduction; `attempt-1/raw-log-disposition.md` explains why
the original manifest names external raw files rather than claiming they remain in this tree.
The technical boundary remains the reviewed exact-path/hash mechanism. The 65-pin focused run
`42147454288` is not evidence for the final 62-pin snapshot; focused validation must follow it.

## Cross-platform checkout correction

That 65-pin run passed Linux but failed three byte-related checks on Windows. The evidence paths had
no checkout text attributes. Following the repository's existing raw-record pattern, `.gitattributes`
now disables text conversion for the bounded evidence/contracts, rather than normalizing hashes.
The focused test additionally requires real Git to report `text: unset` for every pin. Exact bytes,
changed-byte rejection and unknown-path rejection remain required. `exact-pin-run-v1.json` preserves
the failed run; `windows-checkout-correction-v1.json` binds the diagnosis and external raw-log digest.
The final focused result is still pending here; no failed result has been relabelled successful.
