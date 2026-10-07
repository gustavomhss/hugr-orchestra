# ast-grep

## Applicability

The packet assigns a bounded syntax rewrite: a pattern, its rewrite, the language and the explicit files or expected match spans. The engine is ast-grep `0.45.3`, provided by the host and run only as `"$BACKEND_TOOLKIT_BIN/ast-grep"`. It works on any language the packet names that ast-grep parses (`--lang ts`, `py`, `go`, ...).

## Non-trigger

- A symbol-aware change: ast-grep matches syntax and resolves no bindings, so a shadowed name or a same-named receiver also matches. Use the language's own rename tooling or edit by hand.
- Finding targets: the packet decides the occurrences; never sweep the repository for more.
- The `sg` command or any other copy of ast-grep. The toolkit exposes only `ast-grep`.

## Inputs

- Language, pattern and rewrite, with metavariables (`$X`, `$$$ARGS`) as the packet gives them.
- The file list and the expected match count or spans.
- The checks to run after the rewrite.

## Steps

1. Preview without writing. `run` with `--rewrite` prints a diff and changes nothing:
   ```sh
   "$BACKEND_TOOLKIT_BIN/ast-grep" run --lang ts --pattern 'legacy.send($X)' --rewrite 'modern.send($X)' --color never src/handler.ts
   ```
2. Record the match evidence and compare it with the packet:
   ```sh
   "$BACKEND_TOOLKIT_BIN/ast-grep" run --lang ts --pattern 'legacy.send($X)' --json=compact src/handler.ts
   ```
   Each entry names the file and range. A missing expected match, an extra match or a file outside the write paths is a `packet` blocker; never narrow the pattern on your own to make the count fit.
3. Apply with the same arguments plus `--update-all`. Pass explicit files only; a directory argument traverses everything under it.
4. Read the diff. The matched region is rebuilt from the rewrite template, so a comment inside it that no metavariable captured is lost; restore it by hand when the packet requires it.
5. Rerun step 2: the old pattern must no longer match.
6. Run the packet's checks: typecheck, then the assigned tests.

## Tools and outputs

- The host fetches the engine on first use; the seat's shell has no network. Never install, download or substitute it (`npx`, `cargo install`, `brew`, a copy on `PATH`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.
- ast-grep generates nothing: it edits handwritten files in place, and the result is yours to review like any edit. Never run it on generated files; regenerate them from their inputs instead.

## Limits and checks

- `run` exits 0 when something matched and 1 when nothing matched. An error on stderr (bad pattern, unreadable file, unknown language) is `engine-failure:ast-grep:<exit>` whatever the exit code, not a no-match. An unexpected zero-match is a `packet` blocker, never a finished rewrite.
- Parsing tolerates broken code, so a successful rewrite is not a compile. Only the package typecheck and tests are evidence.
- A string or comment that spells the pattern does not match; a nested call does. Checks cover one expected rewrite, one look-alike left untouched, and an already-rewritten file with no match.
