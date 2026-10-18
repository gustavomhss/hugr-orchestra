# Q2 · Cold users, v0.1 (TypeScript) — 2026-10-05

Three fresh agents (Claude Sonnet), each with only the README, the recipes guide and an install note (the package is
not on npm yet, so it was installed from the packed tarballs), on macOS x64, Node 22 (Node 24 through npx where a task
needed `await using`). They never saw code, plan or conversation. Each did 5 of 15 typical agent tasks and timed itself.

## Result

| # | Task | Minutes to first success | Success | Friction |
|---|---|---|---|---|
| 1 | run `git --version`, print the output | 0.3 (install and all reading included) | yes | annoyance |
| 2 | a never-ending command with a 2 s timeout | 0.03 | yes | none |
| 3 | exit code 3 without throwing | < 0.02 | yes | none |
| 4 | a program that does not exist: catch, print the code | < 0.02 | yes | none |
| 5 | env var added, then a clean environment | < 0.02 | yes | annoyance |
| 6 | dev server: wait for "ready", list processes, stop, `ps` shows none left | 0.4 (install and all reading included) | yes | annoyance |
| 7 | stream the first 5 lines, then stop | < 0.1 | yes | none |
| 8 | cancel with an AbortSignal after 500 ms | < 0.1 | yes | none |
| 9 | write to stdin, read the echo | < 0.1 | yes | annoyance |
| 10 | stdout and stderr apart, then merged | < 0.1 | yes | annoyance |
| 11 | bash in a terminal: `echo hi`, read it, exit | 0.4 (install and all reading included) | yes | annoyance |
| 12 | terminal 100x30, `stty size`, resize to 120x40, `stty size` | 0.2 | yes | annoyance |
| 13 | `sleep 30` in the terminal, Ctrl-C, prompt back at once | 0.25 | yes | none |
| 14 | run in `/tmp` through `cwd` | 0.1 | yes | annoyance |
| 15 | `await using` a dev server; `ps` shows it and its helper gone | 0.2 | yes | none |

**15/15 succeeded, every one on its first run; median time to first success ≈ 0.1 min (target ≤ 5 min). No blocker.**
Verified by the users with `ps`: no process left after stop, cancel or scope exit; Ctrl-C reached `sleep` through bash
in about 1 ms; the abort landed about 7 ms after 500 ms.

## Frictions (all "annoyance") → fixes

| Friction | Fix |
|---|---|
| `stdout` is typed `string \| Uint8Array` whatever `text` says, so `r.stdout.trim()` fails `tsc` | type the result by `text` (W18b) |
| `env`, `inheritEnv`, `cwd`, `stdin: "pipe"`/`closeStdin()`, `mergeStderr` are only in `index.d.ts` | one short recipe each (W18b) |
| a clean environment (`inheritEnv: false`) drops PATH, so `run("node")` is NOT_FOUND; the error says so, the docs do not | a note in the env recipe (W18b) |
| what `exitCode`/`signal`/`reason` are after a timeout or a `stop()` (`reason: "killed"`, `success: false`) | a short "reading the result" section (W18b) |
| the examples assume ESM and `await using`; a fresh Node 22 project is CommonJS | a CommonJS + `try`/`finally` line in the README (W18b) |
| no recipe drives a real shell (prompt detection, telling the echo from the output, several steps) | a shell recipe (W18b) |
| `resize()` effect and `stty` row/column order; macOS `/tmp` is `/private/tmp` | one line each (W18b) |
| the README's relative links pointed to files the test workspace did not have | test setup, not the product: the npm README uses absolute links |

## Rerun after W18b (three new agents, strict TypeScript)

Three more fresh agents did the same 15 tasks, this time in TypeScript type-checked with `tsc --strict`
(`nodenext`) and run with `tsx` (and bun for `await using`): **15/15 succeeded, each in about a minute or less, no
blocker.** Their install note (the lead's test setup) pointed at the previous main tarball, so their `stdout` typing
friction came from the old `index.d.ts`; the lead re-checked the new package with strict `tsc`: `r.stdout.trim()`
compiles and `text: false` gives `Uint8Array`. Real frictions left, all fixed in the docs (747c8c0 and the shell
recipe): a fresh `npm init -y` project is CommonJS, so top-level `await` needs `npm pkg set type=module` or `.mts`;
TypeScript needs `@types/node` for `process`; a Ctrl-C to a silent command in a shell should wait until
`processes()` lists it.

The full user reports and their scripts are kept with the lead's review records.

Signed by the owner on 2026-10-06 ("assino o relatório", in the session chat).
