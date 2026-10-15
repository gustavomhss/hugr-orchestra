# Scoped transformation

## Applicability

A prescribed transformation applied to exact files, symbols or occurrences: a move, extraction, rename or recipe over supplied sites, including edits that touch a generated-code boundary.

## Non-trigger

- Repository sweeps, glob-based scope growth or "modernize everything".
- A transformation whose bindings or target occurrences the packet has not decided.

## Inputs

- The exact transformation and the old and new symbols.
- The expected occurrences or spans, and the writable files.
- The base revision or input hashes, when supplied.
- The check commands and their expected results.

## Steps

1. Snapshot the inputs you will change.
2. Produce a preview without writing: a diff, a match list with ranges, or rename locations.
3. Compare the preview with the packet by path, span and symbol. Reject symlink escapes, and added, deleted or renamed files the packet does not allow.
4. Confirm the input bytes still match before editing, then apply the reviewed delta as bounded native edits. Do not apply a generated patch blindly.
5. Rerun the transformation: it must propose no further edits, or only the supplied after-state.
6. Run the supplied checks.

## Tools and outputs

- Native edit tools, plus a transformation engine only when the packet selects it.
- Output: the exact delta and the check evidence.

## Limits and checks

- Counts alone cannot tell correct targets from false positives.
- A package or module selection is not a file or symbol allowlist; any extra edit outside the permitted hunks rejects the whole delta.
- Generated code is never hand-edited. Regenerate through the project's generation entrypoint (project instructions may name it), and only when the generated outputs are inside the write paths; otherwise return a `packet` blocker.
- Controls, when the packet supplies them: the valid fixture yields the exact delta, the negative fixture behaves as specified, and an identical out-of-scope sentinel stays byte-identical.
- Missing input, a parse or type-context failure, an unexpected zero match, an ambiguous binding, an extra match or a scope escape is a `packet` blocker with the evidence.
