# External ast-grep utility experiment

**Pending remote execution; not a dependency-adoption recommendation.** This repo-only
probe asks whether external `@ast-grep/cli@0.51.1` usefully distinguishes two real
TypeScript syntax claims in `packages/adapter-io/src/llm.ts`:

1. The production `execFileSync` call has `stdio: ["pipe", "pipe", "pipe"]` (line 427/432
   at baseline `ab27d260db5e3700f5c4af6214d2cf593b508ae4`). Its mutant changes **only**
   stderr's `"pipe"` to `"inherit"`.
2. The fenced-block guard returns the tagged malformed abstention for
   `blocks.length > 1` (line 494). Its mutant changes **only** `> 1` to `> 2`.

`script/atlas-genesis/ast-utility.mjs` never spawns or fetches. `prepare` reads actual
source, requires exactly one occurrence of each pinned target, writes full-source
fixtures and a manifest, and refuses a nonempty or checkout-internal output directory.
Its exact-text substitutions are fixture preparation, **not** the syntax oracle.
The manifest freezes these TypeScript queries:

```text
execFileSync($CMD,$ARGS,{ $$$BEFORE,stdio:["pipe","pipe","pipe"],$$$AFTER });
if($BLOCKS.length>1) return {claim:null,abstainReason:'answer-malformed:multi-response'}
```

| Query / expected match count | baseline | control | stdio-mutant | splice-mutant |
| --- | ---: | ---: | ---: | ---: |
| stdio | 1 | 1 | 0 | 1 |
| splice | 1 | 1 | 1 | 0 |

The control changes whitespace in both targets and prepends an inert comment.
Each query must survive that control and the **other** query's mutant. An
always-matching, never-matching, duplicated-match, or cross-query-loss matrix fails.

## Remote-only recipe (Bash, Node, npm, jq)

Run from this checkout's root on the authorized remote runner. Do **not** install
or execute the tool locally. No workflow, dependency manifest, runtime code, model,
or credential setup is part of this packet. Keep the output and tool directories
as evidence, including stdout, stderr, exit codes, source copies and version receipt.

```bash
set -euo pipefail
: "${RUNNER_TEMP:?run only on the authorized remote runner}"
tool="$(mktemp -d "$RUNNER_TEMP/atlas-ast-tool.XXXXXX")"
out="$(mktemp -d "$RUNNER_TEMP/atlas-ast-utility.XXXXXX")"
node --test script/atlas-genesis/ast-utility.test.mjs
node script/atlas-genesis/ast-utility.mjs prepare "$out"
npm install --prefix "$tool" --no-save --package-lock=false @ast-grep/cli@0.51.1 \
  > "$tool/install.stdout" 2> "$tool/install.stderr"
binary="$tool/node_modules/.bin/ast-grep"
if "$binary" --version > "$out/version.txt" 2> "$out/version.stderr"; then
  code=0
else
  code=$?
fi
printf '%s\n' "$code" > "$out/version.code"
while IFS= read -r query; do
  id="$(jq -r '.id' <<< "$query")"
  pattern="$(jq -r '.pattern' <<< "$query")"
  while IFS= read -r variant; do
    if (cd "$out" && "$binary" run --lang ts --pattern "$pattern" \
      --json=compact "$out/$variant.ts") \
      > "$out/$id.$variant.json" 2> "$out/$id.$variant.stderr"; then
      code=0
    else
      code=$?
    fi
    printf '%s\n' "$code" > "$out/$id.$variant.code"
  done < <(jq -r '.variants[].id' "$out/manifest.json")
done < <(jq -c '.queries[]' "$out/manifest.json")
node script/atlas-genesis/ast-utility.mjs check "$out"
printf 'retain evidence: %s\nretain installation receipt: %s\n' "$out" "$tool"
```

The `if` blocks retain the binary's real exits despite `set -e`; no `|| true` or
pipeline replaces them. Running from the external output directory avoids loading
the checkout's ast-grep project config. `check` requires the frozen, nonempty
manifest/matrix, every variant unchanged from preparation against current source,
all eight JSON/code pairs, successful exact version receipt, and the printed JSON
array schema. Every positive match must name the requested absolute variant path,
cover the target expression's exact UTF-8 byte range, reproduce its source text,
and have consistent zero-based character positions and context counts.

Exit `0` means nonempty matches; exit `1` means an empty array. Any other status is
`tool-error`, never `BROKEN`. Missing evidence, invalid JSON/schema, wrong file,
range/text/position/context mismatch, manifest drift and matrix mismatch are named
failures, not negative syntax verdicts. The checker tests fabricate CLI-shaped
receipts to exercise the actual `prepare`/`check` exports; they do **not** establish
that ast-grep emits those receipts or that the patterns work. In-memory module
mutations remove the matrix check and tool-status check separately and require
their corresponding bad evidence to escape, calibrating those checker assertions.

## Decision boundary

A successful **real-binary remote** matrix supports only these two syntax queries
on these full-source fixtures, with this tool version and formatting control.
Failure is useful evidence against this candidate/query pair; do not weaken the
matrix to manufacture success. No persistent Atlas `Check`, GEN-12 compile/teeth
implementation, dependency adoption, multi-fact behavior, or identity amendment
is implemented. **Malformed TypeScript is not certified by this probe**: tree-sitter
can recover syntax errors. A query match is not execution, reachability, value-flow,
or whole-program safety proof (including stderr isolation or universal splice
rejection). Existing dynamic/semantic verification remains a separate obligation.

Read-only references: [CLI run/exit contract](https://ast-grep.github.io/reference/cli/run.html),
[pinned 0.51.1 JSON printer schema and UTF-8 ranges](https://github.com/ast-grep/ast-grep/blob/0.51.1/crates/cli/src/print/json_print.rs).
