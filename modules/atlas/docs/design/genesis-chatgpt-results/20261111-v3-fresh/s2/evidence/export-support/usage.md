# Complete deliverable review ZIP

`build_review_zip.py` uses only the Python standard library. It is prepared but has not been run. Its validation is mechanical and never issues a semantic or completion verdict.

## Required final inputs

The explicit deliverable directory must contain the actual `work.md`, `handoff.json`, current `native-package.json`, `accepted/l1.json` through `accepted/l4.json`, and all 13 bodies whose exact paths, sizes, and SHA-256 values agree with both the native package and accepted manifests. The four accepted manifests must have consistent execution, source, and protocol identities.

The final handoff must include these top-level fields, filled by ROOT from actual outcomes:

- `native_package_sha256`: the SHA-256 of the exact current `native-package.json` bytes.
- `completion_state`: the actual state, matching the explicit `--expected-completion-state` argument.
- `artifact_revision`: a recorded revision string or JSON `null`. `INCOMPLETE_BLOCKED` with `artifact_revision: null` is supported. This exporter assigns no commit and requires no invented publication.

Other handoff fields are retained verbatim within the ZIP. The exporter records the declared completion state without upgrading it. ROOT remains responsible for the handoff's factual state and final closure assessment.

## Invocation after prerequisites exist

Choose a new output directory whose parent already exists, outside the deliverable. For an actual blocked handoff:

```bash
python /workspace/scratch/7b5d6430f420/genesis-s2/closure-work/export-support/build_review_zip.py \
  --deliverable-root /workspace/scratch/7b5d6430f420/genesis-s2/deliverable \
  --output-dir /workspace/scratch/7b5d6430f420/genesis-s2/closure-work/review-export-01 \
  --expected-completion-state INCOMPLETE_BLOCKED
```

Use the actual handoff state for the last argument; it has no default. Stop concurrent edits to the deliverable before invoking. No export was produced while preparing this helper.

## Outputs and checks

The new directory contains:

1. `genesis-s2-resumed-review-package.zip` — every deliverable file, including existing archives, failed attempts, decision records, and dotfiles; empty directories are included. Paths are relative to the deliverable root. No file filters or exclusions exist.
2. `genesis-s2-review-manifest.json` — external complete file identities, source filesystem identities, accepted-body bindings, handoff state, and ZIP identity. It is outside the ZIP and does not hash itself.
3. `export-receipt.json` — observed export steps, ZIP and manifest hashes, declared handoff state, and the integrity result. `ARCHIVE_BYTES_VERIFIED` is an archive integrity observation, not a mission PASS.

The helper refuses symlinks, special files, missing or mismatched required inputs, changed input bytes or filesystem identities, an existing output directory, and an output inside the deliverable. It reads back every ZIP member, verifies its size and SHA-256, then rehashes the entire source tree and checks that names, directories, sizes, hashes, and tracked filesystem identities remain unchanged. ZIP timestamp fields use a fixed representable date; original nanosecond timestamps and modes are retained in the external manifest. ZIP contents preserve file bytes exactly.

It never edits canonical inputs, deletes history, executes runtime/tests/CI, uses remote tools, assigns Git commits, or judges closure. If an attempt fails after creating its output directory, partial outputs and a failure receipt are preserved where possible. Do not reuse or overwrite that directory; resolve the observed cause and choose a fresh output directory for an authorized later attempt. Only a zero exit code with an `ARCHIVE_BYTES_VERIFIED` receipt denotes completed export verification.

## Preparation validation

Only Python syntax parsing is authorized during helper preparation; do not invoke the builder or create a sample export:

```bash
python - <<'PY'
import ast
from pathlib import Path
p = Path('/workspace/scratch/7b5d6430f420/genesis-s2/closure-work/export-support/build_review_zip.py')
ast.parse(p.read_text(encoding='utf-8'), filename=str(p))
print('Syntax parsed; exporter not executed')
PY
```
