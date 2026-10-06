# R2 - Pain evidence from open-source AI agents (issue trackers)

Access date: **2026-10-01** (GitHub data fetched live between about 18:50 and 20:20 local time, UTC-3; issue states, comment counts and search rankings are as of that day).

Scope: read-only `gh search issues` (65 queries x 10 repositories = 650 runs; an 11th repository was queried and then excluded, see section 1), then classification of the issue text into 7 categories (C1-C7) by reading. No comment, reaction or contact was made on any issue.

## 0. Headline numbers (data only)

- Issues counted (one primary category each, deduplicated by repo+issue number): **1592** across **10** repositories.
- Per ecosystem: **TypeScript 659**, **Python 104**, **Rust 829**.
- Per category: C1 253, C2 97, C3 200, C4 323, C5 192, C6 156, C7 371.
- Counted issues whose title/body mention Windows (regex, see section 4): **873 of 1592 = 54.8%**.
- Open/closed among counted: 855 open / 737 closed.

## 1. Repositories

Verified with `gh repo view <owner/name> --json nameWithOwner,...` on 2026-10-01. Three of the eight requested repos have been renamed/transferred; the current names were used.

| Requested | Current name used | Ecosystem | Role | Note |
|---|---|---|---|---|
| google-gemini/gemini-cli | google-gemini/gemini-cli | TS | core | unchanged |
| cline/cline | cline/cline | TS | core | unchanged |
| sst/opencode | **anomalyco/opencode** | TS | core | renamed |
| continuedev/continue | continuedev/continue | TS | core | unchanged |
| Aider-AI/aider | Aider-AI/aider | Python | core | unchanged |
| All-Hands-AI/OpenHands | **OpenHands/OpenHands** | Python | core | renamed |
| openai/codex | openai/codex | Rust | core | unchanged; tracker covers the CLI and the ChatGPT/Codex desktop app |
| block/goose | **aaif-goose/goose** | Rust | core | renamed |
| SWE-agent/SWE-agent | SWE-agent/SWE-agent | Python | extra | Python agent whose core loop runs shell commands through the SWE-ReX runtime; added to widen the thin Python sample |
| microsoft/autogen | microsoft/autogen | Python | extra | Python agent framework that ships LocalCommandLineCodeExecutor / Docker code executors; added to widen the thin Python sample |

Extras considered and NOT used (one line each):

- anthropics/claude-code (TypeScript, tracker only): queried (all 65 queries run, 3,705 unique raw hits, 2,846 passed the stage-1 screen, 2,310 of them Tier 1+2) but **excluded from every count and table** because its volume exceeded the review budget; 87 items were read before the decision and are discarded, not counted. Its classification results are not reported anywhere in this file.
- openinterpreter/open-interpreter: now `openinterpreter/openinterpreter` with GitHub primary language Rust, so its ecosystem label is ambiguous; not used.
- RooCodeInc/Roo-Code: archived and a fork of Cline (not an independent sample); not used.
- zed-industries/zed: editor, not an agent repo; not used.

Requested check of **ZelAnton/ProcessKit-rs** (Rust) and **ZelAnton/processkit-py** (Python): ProcessKit-rs has issues enabled with 3 issues in total (#21 closed, #26 open, #39 open: `Error` type size, non-tokio runtimes, cgroup `pids`/`cpu` controller spawn failure EOPNOTSUPP); none is an agent-command pain report in C1-C7 (#39 read as unclear). processkit-py has issues enabled and **0 issues**. Neither is part of the repo list or any count.

## 2. Counts: repository x category (open/closed)

Each cell is `open/closed` counted issues whose **primary** category is that column. Totals are issues, not distinct root causes (see section 7 for clusters).

| Repo | Eco | C1 | C2 | C3 | C4 | C5 | C6 | C7 | Total (open/closed) |
|---|---|---|---|---|---|---|---|---|---|
| google-gemini/gemini-cli | TS | 4/19 | 1/9 | 1/57 | 0/46 | 1/29 | 2/24 | 2/27 | **222** (11/211) |
| cline/cline | TS | 7/2 | 0/1 | 1/2 | 6/21 | 12/37 | 5/21 | 0/0 | **115** (31/84) |
| anomalyco/opencode | TS | 21/50 | 6/13 | 15/41 | 22/33 | 13/27 | 15/30 | 2/4 | **292** (94/198) |
| continuedev/continue | TS | 0/3 | 1/0 | 0/0 | 1/19 | 1/3 | 1/0 | 0/1 | **30** (4/26) |
| Aider-AI/aider | PY | 0/0 | 1/0 | 3/17 | 0/8 | 1/1 | 0/1 | 2/0 | **34** (7/27) |
| OpenHands/OpenHands | PY | 1/7 | 1/2 | 0/5 | 2/4 | 1/1 | 0/20 | 0/2 | **46** (5/41) |
| openai/codex | RS | 116/16 | 52/4 | 42/11 | 117/19 | 44/13 | 28/3 | 290/31 | **786** (689/97) |
| aaif-goose/goose | RS | 0/7 | 1/4 | 0/3 | 2/10 | 2/4 | 1/2 | 2/5 | **43** (8/35) |
| SWE-agent/SWE-agent (extra) | PY | 0/0 | 0/0 | 0/2 | 0/1 | 1/1 | 1/1 | 0/0 | **7** (2/5) |
| microsoft/autogen (extra) | PY | 0/0 | 0/1 | 0/0 | 1/11 | 0/0 | 0/1 | 3/0 | **17** (4/13) |
| **All repos** | | **149/104** | **63/34** | **62/138** | **151/172** | **76/116** | **53/103** | **301/70** | **1592** (855/737) |

Category key: C1 = orphan/zombie processes left running; C2 = kill/cancel/stop does not stop the command (or only the parent); C3 = PTY/terminal problems (ConPTY, isatty, resize, Ctrl-C, hang); C4 = Windows spawn problems (PATHEXT/.cmd, quoting, cmd vs PowerShell, ENOENT); C5 = output problems (encoding, lost/missing output, hang waiting for output, huge output); C6 = timeouts/hangs of executed commands (incl. waiting on stdin); C7 = sandboxing of executed commands.

## 3. Totals per ecosystem

| Ecosystem | Repos (core+extra) | C1 | C2 | C3 | C4 | C5 | C6 | C7 | Total | Open/closed |
|---|---|---|---|---|---|---|---|---|---|---|
| TypeScript | 4+0 | 106 | 31 | 117 | 148 | 123 | 98 | 36 | **659** | 140/519 |
| Python | 2+2 | 8 | 5 | 27 | 27 | 6 | 24 | 7 | **104** | 18/86 |
| Rust | 2+0 | 139 | 61 | 56 | 148 | 63 | 34 | 328 | **829** | 697/132 |

Python split: core repos (aider, OpenHands) 80; extras (SWE-agent, autogen) 24.

Repos with at least one counted issue per category (out of the repos in that ecosystem):

| Ecosystem | C1 | C2 | C3 | C4 | C5 | C6 | C7 |
|---|---|---|---|---|---|---|---|
| TypeScript | 4/4 | 4/4 | 3/4 | 4/4 | 4/4 | 4/4 | 3/4 |
| Python | 1/4 | 3/4 | 3/4 | 4/4 | 3/4 | 4/4 | 3/4 |
| Rust | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 |

Largest trackers by counted issues: openai/codex 786 (49%); anomalyco/opencode 292 (18%); google-gemini/gemini-cli 222 (14%).

Counted issues by creation year:

| Ecosystem | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|
| TypeScript | 1 | 9 | 174 | 475 |
| Python | 4 | 40 | 38 | 22 |
| Rust | 0 | 0 | 42 | 787 |

## 4. Share of counted issues that mention Windows

Definition (deterministic, applied to title + body of each counted issue): the issue states Windows as the reporter's environment, symptom or title. A line matches if it contains a Windows-only token (`win32`, `Windows 10/11`, `PowerShell`, `pwsh`, `cmd.exe`, `conpty`, `winpty`, `msys`, `git bash`, `cygwin`, `taskkill`, `C:\`, `conhost`, `MSIX`, `AppX`, `*.cmd`, `*.bat`, `CreateProcess*W`, `wsl.exe`, `PATHEXT`, `%USERPROFILE%`) or the word `Windows` in an OS context (`on/in/for/under/native/using Windows`, `Microsoft Windows`, `Windows 10/11/Server/desktop/app/sandbox/path/...`, `[Windows]`, an `OS:`/`Platform:` line, a title starting with `Windows`). Ignored: unchecked template checkboxes, `Windows / macOS / Linux` option lists, and `Windows` preceded by context/tmux/terminal/browser/popup/app/console/new/other (`context windows`, `tmux windows`). WSL alone does not count. A looser first version of the regex (any `\bwindows\b`) flagged 889 of 1,592 (55.8%); the stricter version used below removes 22 non-OS uses and adds 6.

- **All counted: 873 / 1592 = 54.8%**
- TypeScript: 343 / 659 = 52.0%
- Python: 46 / 104 = 44.2%
- Rust: 484 / 829 = 58.4%
- Excluding C7 (dominated by one tracker): 712 / 1221 = 58.3%

| Repo | Windows-mentioning / counted | % |
|---|---|---|
| google-gemini/gemini-cli | 96 / 222 | 43% |
| cline/cline | 65 / 115 | 57% |
| anomalyco/opencode | 160 / 292 | 55% |
| continuedev/continue | 22 / 30 | 73% |
| Aider-AI/aider | 22 / 34 | 65% |
| OpenHands/OpenHands | 9 / 46 | 20% |
| openai/codex | 466 / 786 | 59% |
| aaif-goose/goose | 18 / 43 | 42% |
| SWE-agent/SWE-agent | 3 / 7 | 43% |
| microsoft/autogen | 12 / 17 | 71% |

| Category | Windows-mentioning / counted | % |
|---|---|---|
| C1 | 91 / 253 | 36% |
| C2 | 46 / 97 | 47% |
| C3 | 94 / 200 | 47% |
| C4 | 312 / 323 | 97% |
| C5 | 112 / 192 | 58% |
| C6 | 57 / 156 | 37% |
| C7 | 161 / 371 | 43% |

Audit of the stricter flag: 45 randomly drawn flagged counted issues (seed 99) were re-read at the match: 41 state a Windows environment/symptom, 2 are clear false positives (openai/codex#11090: `freeze windows` is not the OS; openai/codex#48678: Windows only in a cross-reference to another issue) and 2 are code-reference-only mentions (OpenHands/OpenHands#16151: `process.platform !== "win32"` in a proposed fix; aaif-goose/goose#12566: `cmd /C on Windows` in a description of the shell tool). That is 91% to 96% precision, so the true share is roughly 51% to 55%. Recall check: the 22 issues removed by the stricter regex and 703 unflagged issues containing weaker indicators (WSL, .exe, CreateProcess, conhost, MSIX) were inspected; almost all are WSL/Linux/macOS issues or cross-references, 3 to 4 plausibly involve a Windows host (for example openai/codex#46703, a Windows desktop issue about `wsl.exe` probes). Note: C4 is 97% Windows by definition (it is the Windows spawn category).

## 5. Top-10 most representative issues

Selection rule (deterministic): among counted issues, take the one with the highest GitHub comment count in each of C1..C7 (7 issues); then add the 3 highest-comment issues not yet chosen, with at most 2 issues per repo overall, no duplicate titles, ties broken toward the ecosystem with fewer picks. Comment counts are from the search API at access time.

| # | Issue | Cat | State | Comments | OS | One-line summary |
|---|---|---|---|---|---|---|
| 1 | [google-gemini/gemini-cli#15874](https://github.com/google-gemini/gemini-cli/issues/15874) | C1 | closed | 51 | macOS (Darwin 24, arm64) | A gemini-cli process survives terminal closure and burns 100% CPU for 47+ days (orphaned process); a duplicate issue #15873 exists. |
| 2 | [openai/codex#33776](https://github.com/openai/codex/issues/33776) | C2 | open | 37 | Windows 10 | Codex Desktop on Windows leaves 287 live taskkill.exe and 302 conhost.exe children; WMI query failures and Desktop Window Manager degradation. |
| 3 | [google-gemini/gemini-cli#10258](https://github.com/google-gemini/gemini-cli/issues/10258) | C3 | closed | 27 | Windows (win32) | CLI crashes on Windows with `Cannot resize a pty that has already exited` after a short shell command (node-pty/ConPTY). |
| 4 | [openai/codex#40752](https://github.com/openai/codex/issues/40752) | C4 | open | 87 | Windows 11 x64 | Windows desktop app fails to start after update: bundled binary not found, then `spawn EINVAL` when CODEX_CLI_PATH points at the npm `codex.cmd` shim. |
| 5 | [cline/cline#3445](https://github.com/cline/cline/issues/3445) | C5 | closed | 103 | macOS client to Ubuntu 24.04 remote | Terminal output capture fails after upgrade (shell integration over a remote SSH host); commands run but output is not seen. |
| 6 | [cline/cline#1404](https://github.com/cline/cline/issues/1404) | C6 | closed | 31 | macOS 15.3 | Cline hangs after command execution; first command runs, second hangs every time, only workaround is closing the terminal. |
| 7 | [anomalyco/opencode#2242](https://github.com/anomalyco/opencode/issues/2242) | C7 | open | 94 | macOS referenced (seatbelt); OS not stated | Asks how to confine terminal commands of the agent to the project directory; notes Gemini CLI and Codex use macOS seatbelt and opencode has no equivalent. |
| 8 | [microsoft/autogen#7462](https://github.com/microsoft/autogen/issues/7462) | C7 | open | 19 | OS not stated | LocalCommandLineCodeExecutor runs LLM-generated code as a host subprocess with no sandboxing, filesystem isolation or network restriction. |
| 9 | [anomalyco/opencode#2447](https://github.com/anomalyco/opencode/issues/2447) | C4 | closed | 17 | Windows (PowerShell, Git Bash) | npm-installed `opencode` fails on Windows: the generated .ps1 wrapper calls `/bin/sh.exe`, and Git Bash cannot execute the Unix shell script. |
| 10 | [OpenHands/OpenHands#6218](https://github.com/OpenHands/OpenHands/issues/6218) | C6 | closed | 16 | macOS | Commands in the OpenHands terminal are executed with long delay and hit the 120 s timeout, then the agent loops. |

## 6. Pipeline: from raw hits to counted

Stage 0 = unique issues returned by the 65 queries per repo (dedup by repo+number). Stage 1 = deterministic screen (title+body mentions an execution-context term AND contains a word of at least one query that returned it; see section 8). Tier 1 = a process-specific term in the title; Tier 2 = such a term only in the body; Tier 3 = weak terms only (not read, see audit). Read = Tier 1 + Tier 2. Counted = primary category C1-C7. U = unclear (not counted). O = other command-execution issue outside C1-C7 (not counted). X = not about executing commands/processes.

| Repo | Stage 0 raw | Stage 1 passed | Tier 1 | Tier 2 | Tier 3 (not read) | Read | Counted | U | O | X |
|---|---|---|---|---|---|---|---|---|---|---|
| google-gemini/gemini-cli | 1750 | 1116 | 243 | 499 | 374 | 742 | 222 | 59 | 77 | 384 |
| cline/cline | 756 | 370 | 86 | 205 | 79 | 291 | 115 | 20 | 10 | 146 |
| anomalyco/opencode | 2291 | 1561 | 387 | 840 | 334 | 1227 | 292 | 54 | 38 | 843 |
| continuedev/continue | 522 | 223 | 18 | 125 | 80 | 165 | 30 | 5 | 0 | 130 |
| Aider-AI/aider | 427 | 147 | 14 | 78 | 55 | 92 | 34 | 3 | 1 | 54 |
| OpenHands/OpenHands | 788 | 357 | 22 | 188 | 147 | 210 | 46 | 3 | 5 | 156 |
| openai/codex | 3207 | 2240 | 525 | 1379 | 336 | 1904 | 786 | 77 | 16 | 1025 |
| aaif-goose/goose | 474 | 237 | 29 | 131 | 77 | 160 | 43 | 8 | 3 | 106 |
| SWE-agent/SWE-agent | 147 | 88 | 1 | 53 | 34 | 54 | 7 | 1 | 0 | 46 |
| microsoft/autogen | 192 | 67 | 7 | 43 | 17 | 50 | 17 | 4 | 0 | 29 |
| **Total** | 10554 | 6406 | 1332 | 3541 | 1533 | 4895 | 1592 | 234 | 150 | 2919 |

Stage 1 dropped 4148 raw hits without reading them (no execution-context term in the cleaned title/body, or none of the returning query's words found there after prefix-stemming).

Tier-3 audit: 70 Tier-3 issues drawn at random (seed 20261001) across the 10 repos were read; **5 clearly** (cline/cline#1064 C6, google-gemini/gemini-cli#27751 C4, openai/codex#17770 C1, anomalyco/opencode#28697 C6, google-gemini/gemini-cli#24796 C1) and 2 borderline (continuedev/continue#5542, Aider-AI/aider#3489) would have been counted, i.e. 7% to 10% of Tier 3. Extrapolated to the 1,533 unread Tier-3 issues that is roughly 100 to 150 counted-type issues missing (about 6 to 9% on top of 1592). Gemini-cli had a separate audit of 40: 3 possibly relevant, none countable without further reading.

## 7. Sensitivity: duplicate clusters and query caps

Many counted issues are repeated reports of one defect. Text-signature clusters (a counted issue can match more than one; regex over title+body):

| Signature | Counted issues matching | Repos |
|---|---|---|
| `ioctl(2) failed, EBADF` (node-pty resize crash) | 28 | gemini-cli 28 |
| `spawn EINVAL` | 15 | gemini-cli 9, cline 3, codex 2, continue 1 |
| `Cannot resize a pty that has already exited` | 10 | gemini-cli 10 |
| macOS `sandbox-exec: unbound variable TIOCSTI` | 13 | codex 13 |
| bwrap `mountinfo path is not absolute` | 12 | codex 12 |
| Windows sandbox `setup refresh had errors` / `helper_unknown_error` | 52 | codex 52 |
| Windows sandbox `CreateProcessAsUserW/WithLogonW failed` | 33 | codex 33 |
| aider `NoConsoleScreenBufferError` / `No Windows console found` | 10 | aider 10 |
| Windows `taskkill.exe`/`conhost.exe` storms | 20 | codex 20 |
| `spawn npx/npm/uvx/powershell.exe ENOENT` | 16 | cline 9, continue 5, opencode 2 |
| aider `pty_spawn.py` TypeError | 4 | aider 4 |
| PTY master (`ptmx`) leak | 11 | gemini-cli 8, codex 2, opencode 1 |

The union of these signatures covers 218 counted issues (Rust 129, TypeScript 75, Python 14). If each signature were collapsed to a single issue the total would be about **1386** instead of 1592, and every ecosystem and every category would still have counted issues (distinct-root-cause sensitivity, lower bound).

Query cap (`--limit 100`): queries that returned exactly 100 results (so results beyond rank 100 were not seen):

| Repo | Capped queries / 65 |
|---|---|
| google-gemini/gemini-cli | 20 / 65 |
| cline/cline | 7 / 65 |
| anomalyco/opencode | 27 / 65 |
| continuedev/continue | 4 / 65 |
| Aider-AI/aider | 1 / 65 |
| OpenHands/OpenHands | 8 / 65 |
| openai/codex | 41 / 65 |
| aaif-goose/goose | 1 / 65 |
| SWE-agent/SWE-agent | 0 / 65 |
| microsoft/autogen | 0 / 65 |
| **Total** | **109 / 650** |

## 8. Method

1. **Search.** For each of 65 queries and each repo: `gh search issues --repo <repo> <terms> --limit 100 --json number,title,state,url,createdAt,body,labels,commentsCount,repository`. gh searches title and body by default (checked on one term, `zombie` on gemini-cli: the default result set equals `--match title,body` and differs from `--match comments`; so comments are not searched). Multiple unquoted words are ANDed; a quoted phrase is a phrase search. Only issues are searched (not PRs). Relevance order, 100 results max per query.
2. **Dedup.** Results merged by (repo, issue number); the same issue from several queries counts once.
3. **Stage-1 screen (deterministic).** Keep an issue if (a) its title+body (template lines such as `Sandbox Environment: ...`, `Generate a shell command` config boilerplate and unchecked checkboxes stripped) contains an execution-context word (process, subprocess, spawn, shell, bash, powershell, cmd.exe, terminal, pty, stdin, stdout, sigint/sigterm/sigkill, sandbox, seatbelt, landlock, bwrap, isatty, run_shell/execute_command, etc.) and (b) it contains all (prefix-stemmed) words of at least one query that returned it. Tier 1: a process-specific term (orphan, zombie, pty, conpty, ENOENT/EINVAL/EAGAIN, PATHEXT, taskkill, SIGKILL/SIGTERM/SIGINT, child_process, subprocess, spawn, .cmd/.bat, cmd.exe, powershell, git bash, seatbelt, landlock, bwrap, sandbox-exec, chcp, mojibake, ctrl+c, stdin/stdout/stderr, shell tool/command, pid ...) in the title. Tier 2: such a term only in the body. Tier 3: neither (only weak words such as stuck/timeout/hang/kill/encoding/output). Tier 3 was not read (audit in section 6).
4. **Reading.** Tier 1 and Tier 2 issues were read as one line each (title, first ~100 to 150 characters of the body, and a ~115-character window around the first strong term); a few dozen ambiguous ones were re-read with up to 450 to 700 characters of body. This reads the issue's first message (the body); later comments were not read. When unsure the issue was marked U and not counted.
5. **Classification.** One primary category per issue, chosen by the root symptom described. Counted only if the issue describes a concrete defect or gap in how the tool spawns, controls, terminates, observes the output of, or isolates an external command/process or terminal session. Rules used: C1 includes leaked/unreaped children, leaked PTYs/handles, MCP/LSP child processes not stopped, desktop helper processes surviving app exit; C2 includes cancel/Ctrl+C/stop/SIGTERM that does not stop or only stops the parent, process-tree kill problems (taskkill /T storms, stale PID reuse), commands that keep running after abort; C3 includes PTY/node-pty/ConPTY failures, isatty/non-TTY stdin failures, interactive programs (sudo, pagers, REPLs) that cannot be driven, terminal modes left raw/mouse-tracking after exit, resize crashes; **not** pure TUI rendering/flicker, IME, clipboard or paste issues (those are X or O); C4 includes spawn ENOENT/EINVAL/EPERM, .cmd/.bat shims and PATHEXT, quoting/escaping, cmd.exe vs PowerShell vs Git Bash selection or syntax errors, WSL/UNC path handling in spawned shells, visible console windows from spawned children, and non-Windows shell-dialect/PATH/arg-length (E2BIG/ENAMETOOLONG) spawn failures; C5 includes mojibake/code-page problems in command output, missing/empty/truncated/duplicated output, 'Shell Integration Unavailable'-type output capture failure, hang waiting for completion/EOF, unbounded output; C6 includes hangs and missing/unbounded timeouts of executed commands and commands blocked on stdin or interactive prompts; C7 includes failures, gaps, or requests for sandboxing of executed commands (seatbelt/sandbox-exec, landlock, bubblewrap, Windows restricted-token/elevated sandbox, AppContainer, sandbox proxies). OpenHands' Docker-runtime provisioning problems were treated as X (not process semantics), except where the issue was about command execution inside it.
6. **Excluded as not about executing commands (X) or other (O).** X: model loops, auth/quota, UI rendering, file-edit tools, install/update problems, IDE/extension crashes, security/prompt-injection reports without a process or sandbox defect, etc. O (150 issues, not counted): feature requests or design notes about command execution that fit none of C1-C7 (for example background-task managers, tool-call plumbing, hook payloads, TUI terminal-state or cwd issues). U (234, not counted): relevant but not classifiable from the body.
7. **Windows flag.** See section 4.
8. **Repro.** Each counted issue is listed by number in Appendix B, so any count in section 2 can be rechecked against the query results of Appendix A. Because GitHub search is live and relevance-ranked, a rerun later will differ in ranking, states and comment counts.

## 9. Method limits

- **Cap and ranking.** Every query returns at most the 100 best-matching issues; 109 of 650 queries were capped (codex 41/65, opencode 27/65, gemini-cli 20/65). Large trackers are therefore undercounted more than small ones, and counts across repos are not comparable as rates.
- **Not rates.** Counts are numbers of issues, not users affected, severity or frequency; trackers differ in size, age, template and triage culture (openai/codex alone is 49% of all counted issues; its tracker covers the desktop app as well as the CLI; 321 of its 786 counted issues are C7 sandbox failures of that product's own sandbox).
- **Single reader.** Classification was done by one reader, from the first message of the issue, with no second rater; U/O handling reduces false positives but the boundaries between categories (notably C3 vs C5 for 'cannot read terminal output', C4 vs C7 for Windows sandbox launch errors, C1 vs C2 for leaked process trees) are judgment calls. Repeated reports of one defect are counted separately (section 7).
- **Unread tail.** Stage 1 dropped 4148 hits and Tier 3 (1533) was not read; the audit (section 6) estimates 6 to 9% additional counted-type issues in Tier 3. Comments after the first message were never read.
- **Query set history.** A first collector run used phrase quoting for multi-word terms and an invalid query (`"shell: true"` is parsed as a qualifier); that run was discarded and all 65 queries were rerun with the final form (`shell=true`, ANDed words, brief-style quoted phrases). Only the final results are used. The queries in Appendix A are verbatim.
- **Extras.** claude-code was queried but excluded (section 1); the ProcessKit repos have too few issues to count. Ecosystem labels follow the implementation language of each repository.
- **Python is the thinnest sample** (104 counted over 4 repos; OpenHands and SWE-agent execute commands in Docker containers by default), and 24 of the 104 come from the two extras.
- **Category definitions are mine** (the brief gives short labels); in particular C7 counts sandbox failures and requests, not only cross-platform sandbox abstractions, and C4 includes some non-Windows spawn/shell-dialect problems (97% of C4 issues still mention Windows).
- **Snapshot.** Issues are read as of 2026-10-01; later edits or issue deletions are not reflected. Issue dates run up to 2026-09/10, so numbers for recent products (codex desktop, opencode v2) include very recent reports.

## Appendix A. Full list of queries

Each query below was run with the command `gh search issues --repo <repo> <terms> --limit 100 --json number,title,state,url,createdAt,body,labels,commentsCount,repository` for each of the ten repositories in section 1 (`<terms>` is exactly the text shown; double-quoted parts are quoted phrases). The same 65 queries were also run on anthropics/claude-code (excluded). 65 queries x 10 repos = 650 counted runs.

Category the query was designed for -> terms:

- **C1** (orphan/zombie processes left running): `orphan`; `orphaned process`; `zombie`; `"still running"`; `"left running"`; `"leftover process"`; `"background process"`
- **C2** (kill/cancel/stop does not stop the command (or only the parent)): `kill process`; `kill`; `cancel command`; `cancel shell`; `stop command`; `"ctrl+c"`; `abort command`; `SIGKILL`; `SIGINT`; `SIGTERM`; `taskkill`; `"process tree"`; `"process group"`
- **C3** (PTY/terminal problems (ConPTY, isatty, resize, Ctrl-C, hang)): `pty`; `conpty`; `node-pty`; `isatty`; `"terminal resize"`; `winpty`; `pseudo-terminal`; `terminal hang`; `"interactive terminal"`
- **C4** (Windows spawn problems (PATHEXT/.cmd, quoting, cmd vs PowerShell, ENOENT)): `windows ENOENT`; `"spawn ENOENT"`; `"spawn EINVAL"`; `.cmd`; `PATHEXT`; `quoting shell`; `powershell command`; `cmd.exe`; `"git bash"`; `windows shell`; `shell=true`; `CreateProcess`
- **C5** (output problems (encoding, lost/missing output, hang waiting for output, huge output)): `encoding command output`; `garbled`; `mojibake`; `"output lost"`; `"large output"`; `"truncated output"`; `"missing output"`; `"no output" command`; `chcp`; `utf-8 windows terminal`
- **C6** (timeouts/hangs of executed commands (incl. waiting on stdin)): `command hangs`; `shell stuck`; `command timeout`; `"waiting for input"`; `stdin command`; `"interactive prompt"`; `"never returns"`; `command stuck`
- **C7** (sandboxing of executed commands): `sandbox command`; `seatbelt`; `landlock`; `sandbox-exec`; `bubblewrap`; `AppContainer`

Results returned per query and repo (`*` = 100, capped):

| Cat | Terms | gemini-cli | cline | opencode | continue | aider | OpenHands | codex | goose | SWE-agent | autogen |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | `orphan` | 53 | 49 | 100* | 4 | 3 | 24 | 100* | 23 | 1 | 7 |
| C1 | `orphaned process` | 25 | 34 | 100* | 0 | 0 | 9 | 100* | 9 | 1 | 2 |
| C1 | `zombie` | 21 | 4 | 96 | 3 | 1 | 4 | 100* | 4 | 0 | 2 |
| C1 | `"still running"` | 84 | 59 | 100* | 14 | 6 | 56 | 100* | 19 | 2 | 1 |
| C1 | `"left running"` | 5 | 3 | 10 | 1 | 0 | 1 | 51 | 0 | 0 | 0 |
| C1 | `"leftover process"` | 0 | 0 | 4 | 1 | 0 | 1 | 13 | 0 | 0 | 0 |
| C1 | `"background process"` | 54 | 8 | 90 | 7 | 2 | 7 | 100* | 11 | 2 | 2 |
| C2 | `kill process` | 100* | 75 | 100* | 41 | 10 | 66 | 100* | 56 | 7 | 10 |
| C2 | `kill` | 100* | 100* | 100* | 66 | 22 | 100* | 100* | 89 | 11 | 19 |
| C2 | `cancel command` | 100* | 86 | 100* | 36 | 9 | 29 | 100* | 27 | 6 | 15 |
| C2 | `cancel shell` | 100* | 31 | 100* | 11 | 4 | 10 | 100* | 19 | 3 | 4 |
| C2 | `stop command` | 100* | 100* | 100* | 100* | 68 | 100* | 100* | 87 | 64 | 35 |
| C2 | `"ctrl+c"` | 100* | 75 | 100* | 89 | 48 | 100* | 100* | 39 | 12 | 24 |
| C2 | `abort command` | 100* | 32 | 100* | 9 | 6 | 34 | 100* | 6 | 6 | 3 |
| C2 | `SIGKILL` | 16 | 17 | 64 | 3 | 1 | 4 | 100* | 11 | 0 | 1 |
| C2 | `SIGINT` | 37 | 3 | 55 | 1 | 1 | 23 | 46 | 4 | 1 | 4 |
| C2 | `SIGTERM` | 27 | 7 | 98 | 1 | 0 | 7 | 100* | 6 | 1 | 1 |
| C2 | `taskkill` | 6 | 8 | 27 | 2 | 0 | 0 | 100* | 1 | 0 | 0 |
| C2 | `"process tree"` | 11 | 7 | 71 | 2 | 2 | 6 | 100* | 3 | 1 | 1 |
| C2 | `"process group"` | 15 | 6 | 54 | 1 | 1 | 6 | 100* | 4 | 2 | 1 |
| C3 | `pty` | 100* | 21 | 100* | 6 | 8 | 5 | 100* | 7 | 4 | 1 |
| C3 | `conpty` | 15 | 5 | 34 | 4 | 0 | 0 | 68 | 0 | 0 | 0 |
| C3 | `node-pty` | 100* | 6 | 98 | 2 | 1 | 0 | 98 | 2 | 1 | 0 |
| C3 | `isatty` | 2 | 0 | 3 | 0 | 1 | 0 | 2 | 0 | 0 | 1 |
| C3 | `"terminal resize"` | 26 | 1 | 20 | 0 | 0 | 1 | 100* | 1 | 0 | 0 |
| C3 | `winpty` | 7 | 0 | 2 | 0 | 7 | 1 | 5 | 1 | 0 | 0 |
| C3 | `pseudo-terminal` | 55 | 3 | 30 | 0 | 2 | 1 | 27 | 1 | 0 | 1 |
| C3 | `terminal hang` | 100* | 74 | 100* | 7 | 6 | 13 | 100* | 8 | 0 | 1 |
| C3 | `"interactive terminal"` | 33 | 8 | 27 | 1 | 3 | 3 | 72 | 1 | 0 | 0 |
| C4 | `windows ENOENT` | 24 | 49 | 100* | 40 | 1 | 1 | 100* | 3 | 0 | 0 |
| C4 | `"spawn ENOENT"` | 2 | 0 | 12 | 1 | 0 | 0 | 7 | 0 | 0 | 0 |
| C4 | `"spawn EINVAL"` | 10 | 4 | 0 | 1 | 0 | 0 | 9 | 0 | 0 | 0 |
| C4 | `.cmd` | 100* | 100* | 100* | 100* | 100* | 100* | 100* | 100* | 21 | 40 |
| C4 | `PATHEXT` | 0 | 13 | 1 | 1 | 0 | 0 | 18 | 3 | 0 | 0 |
| C4 | `quoting shell` | 19 | 2 | 41 | 1 | 5 | 2 | 75 | 8 | 0 | 0 |
| C4 | `powershell command` | 100* | 100* | 100* | 44 | 19 | 36 | 100* | 29 | 2 | 12 |
| C4 | `cmd.exe` | 56 | 41 | 100* | 24 | 22 | 6 | 100* | 10 | 0 | 2 |
| C4 | `"git bash"` | 47 | 35 | 100* | 1 | 10 | 7 | 100* | 9 | 1 | 4 |
| C4 | `windows shell` | 100* | 100* | 100* | 100* | 49 | 52 | 100* | 68 | 6 | 16 |
| C4 | `shell=true` | 100* | 63 | 100* | 100* | 87 | 65 | 100* | 83 | 32 | 27 |
| C4 | `CreateProcess` | 0 | 5 | 3 | 10 | 8 | 3 | 100* | 1 | 1 | 3 |
| C5 | `encoding command output` | 39 | 14 | 55 | 11 | 60 | 13 | 100* | 7 | 5 | 5 |
| C5 | `garbled` | 43 | 26 | 100* | 16 | 0 | 1 | 73 | 1 | 0 | 1 |
| C5 | `mojibake` | 14 | 3 | 35 | 2 | 0 | 1 | 67 | 0 | 0 | 0 |
| C5 | `"output lost"` | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| C5 | `"large output"` | 24 | 11 | 58 | 2 | 1 | 2 | 58 | 2 | 0 | 0 |
| C5 | `"truncated output"` | 9 | 6 | 40 | 0 | 0 | 1 | 30 | 3 | 0 | 1 |
| C5 | `"missing output"` | 3 | 0 | 7 | 0 | 0 | 0 | 33 | 2 | 0 | 0 |
| C5 | `"no output" command` | 39 | 25 | 100* | 10 | 4 | 21 | 100* | 11 | 26 | 2 |
| C5 | `chcp` | 18 | 2 | 20 | 2 | 2 | 0 | 16 | 0 | 1 | 0 |
| C5 | `utf-8 windows terminal` | 33 | 9 | 74 | 8 | 9 | 4 | 100* | 0 | 1 | 1 |
| C6 | `command hangs` | 100* | 78 | 100* | 11 | 6 | 29 | 100* | 7 | 1 | 2 |
| C6 | `shell stuck` | 90 | 70 | 100* | 8 | 13 | 25 | 100* | 12 | 1 | 0 |
| C6 | `command timeout` | 100* | 100* | 100* | 31 | 52 | 100* | 100* | 68 | 60 | 50 |
| C6 | `"waiting for input"` | 12 | 7 | 20 | 0 | 1 | 2 | 45 | 3 | 0 | 5 |
| C6 | `stdin command` | 97 | 26 | 100* | 5 | 11 | 24 | 100* | 20 | 2 | 11 |
| C6 | `"interactive prompt"` | 81 | 2 | 35 | 2 | 3 | 7 | 43 | 5 | 0 | 0 |
| C6 | `"never returns"` | 14 | 6 | 82 | 1 | 1 | 4 | 81 | 0 | 0 | 3 |
| C6 | `command stuck` | 100* | 100* | 100* | 26 | 24 | 100* | 100* | 24 | 14 | 11 |
| C7 | `sandbox command` | 100* | 30 | 100* | 37 | 11 | 100* | 100* | 28 | 8 | 9 |
| C7 | `seatbelt` | 68 | 2 | 12 | 3 | 4 | 0 | 100* | 6 | 1 | 1 |
| C7 | `landlock` | 4 | 6 | 5 | 7 | 5 | 5 | 100* | 3 | 3 | 2 |
| C7 | `sandbox-exec` | 100* | 5 | 29 | 0 | 3 | 100* | 100* | 7 | 0 | 10 |
| C7 | `bubblewrap` | 3 | 1 | 13 | 0 | 2 | 0 | 100* | 3 | 0 | 1 |
| C7 | `AppContainer` | 100* | 0 | 2 | 2 | 1 | 0 | 48 | 0 | 0 | 0 |

Other read-only commands run (not part of any count):

- `gh repo view <owner/name> --json nameWithOwner,isArchived,stargazerCount,primaryLanguage,pushedAt,hasIssuesEnabled` for the 8 requested repos, claude-code, Roo-Code, open-interpreter, SWE-agent, mini-swe-agent, autogen, zed, ProcessKit-rs, processkit-py (repo verification, section 1).
- `gh issue list --repo ZelAnton/ProcessKit-rs --state all --limit 100 --json number,title,state,createdAt` and `gh issue view 39 --repo ZelAnton/ProcessKit-rs --json title,body`; `gh issue list --repo ZelAnton/processkit-py --state all --limit 100 ...` (0 issues); `gh search repos processkit-py --limit 5 --json fullName,description,language,hasIssues`.
- Exploratory searches used only to learn gh behaviour: `gh search issues --repo openai/codex zombie --limit 100`; `gh search issues --repo google-gemini/gemini-cli kill --limit 100` (with and without `--match title,body`); `... zombie --match title,body|comments` and `... zombie` on gemini-cli; `... "still running" --match title,body` and `... shell=true --match title,body` on gemini-cli; one `shell=True` query on Aider-AI/aider that hit the secondary rate limit and returned nothing.
- A first full collection run (about 90 query results on 1 to 2 repos) with phrase-quoted multi-word terms and the invalid `"shell: true"` query was discarded before the final run (section 9).

## Appendix B. Counted issues by repo and category

Issue numbers (open and closed) per repo and primary category; open issues are written with a trailing `o`. URL pattern: `https://github.com/<current repo name>/issues/<number>`.

### google-gemini/gemini-cli (222)

- C1 (23): 5318, 10978, 13391, 15873, 15874, 15945, 20804, 20810, 20941, 21692, 21767, 23344, 25583, 25590o, 26083, 26327, 26384, 27155, 27628, 27982, 29405o, 29424o, 29592o
- C2 (10): 973, 4956, 6066, 13225, 15399, 16007, 22612, 25996, 28091o, 29314
- C3 (58): 3195, 3258, 8304, 10258, 10523, 10585, 11093, 11272, 12019, 12060, 12294, 12878, 13359, 14555, 14557, 15424, 15744, 16003, 16052, 17423, 17729, 20675, 20792, 21073, 21835o, 22020, 24198, 25805, 26433, 26690, 26804, 27290, 27334, 27355, 27366, 27373, 27443, 27499, 27501, 27504, 27506, 27510, 27516, 27517, 27518, 27519, 27528, 27530, 27532, 27533, 27538, 27541, 27544, 27546, 27547, 27551, 27764, 28265
- C4 (46): 1818, 1839, 2353, 2457, 2701, 2846, 3015, 3126, 3829, 3996, 4279, 6413, 7075, 8820, 9539, 9601, 9746, 9755, 10147, 10394, 10450, 10813, 10936, 11480, 12373, 12678, 14979, 15480, 15493, 18022, 18112, 20545, 20697, 20773, 20965, 21340, 21399, 21997, 23870, 25859, 25932, 26318, 26365, 26567, 26754, 27097
- C5 (30): 1945, 4908, 4945, 10404, 10492, 10597, 10865, 11309, 12468, 12750, 14560, 14578, 14775, 15389, 16159, 17876, 18046, 19520, 20186, 20661, 20968, 21677, 22061, 22170, 24923, 25164, 27142, 27470, 27738, 28090o
- C6 (26): 1689, 2525, 3375o, 4322, 5171, 6715, 10909, 11494, 12362, 12817, 13590, 13594, 13604, 15071, 15233, 16567, 17897, 18761, 20719, 21052, 23480o, 24678, 24707, 25166, 27419, 29316
- C7 (29): 347, 850, 2035, 3216, 3261, 4775, 6137, 6146, 7738, 7748, 11402, 12052, 12821, 12907, 13848, 14732, 16363, 16940, 19187, 19275, 20780, 20851, 21619, 22536, 23959, 24991, 27125, 28598o, 28999o

### cline/cline (115)

- C1 (9): 5872, 7413o, 11550o, 12001o, 13197o, 14221, 14606o, 14622o, 14700o
- C2 (1): 4498
- C3 (3): 6074, 7938, 14544o
- C4 (27): 1160, 1878, 1948, 2157, 2886, 3358, 3665, 4480, 6247, 7574, 7587, 7644, 8366, 9971, 10145, 10149, 10444o, 11290, 11467o, 11620, 12437o, 13279, 13294o, 13619o, 13665, 14446, 14447o
- C5 (49): 299, 458, 611, 791, 1100, 1325, 1371, 1974, 2271, 3136, 3445, 3565, 3804, 3905, 4002, 4177, 4311, 4356o, 4638, 5176, 5990, 6603, 6708, 7043, 7110, 7898, 7906, 7985, 9859, 10066, 10122, 10235, 10378, 10537o, 10633, 11022o, 11295o, 11350, 11878, 12079o, 12198o, 12293o, 12389o, 12723, 12864o, 13272, 13346o, 13365o, 14126o
- C6 (26): 531, 644, 756, 1146, 1404, 2517, 3187, 4737, 5771, 6518, 7080, 7097, 7355o, 7853, 8109, 8154, 10063, 10446, 10549o, 10931, 11622o, 11669o, 12417, 13246o, 13284, 13285

### anomalyco/opencode (292)

- C1 (71): 1195, 5819, 6633, 7261, 10563, 11225, 11527, 11959, 12240, 12596, 12767, 13777, 14091, 14199, 14237, 14504, 15037, 15348, 15349, 15808, 17068, 17287, 18334, 18632, 19225, 20077, 20899, 21628, 25883, 26336, 26714, 29506, 29939, 30073, 30123, 30868, 30876, 31554o, 32335, 35089, 36558, 36840, 37521, 37844o, 37908, 38244, 39292, 40439o, 41066o, 41806o, 42270o, 42291, 42989o, 43084, 43845o, 46035o, 46174o, 46253o, 47727o, 50361o, 50363o, 50633o, 50699o, 50758o, 50780o, 51003o, 51731, 52020, 52203o, 52251, 52410o
- C2 (19): 3057, 9859, 20097, 24248, 24501, 24658, 28654, 33071, 33364, 37007o, 38291, 38564, 40829o, 41878o, 42162o, 45938o, 48838o, 51744, 52202
- C3 (56): 1180, 2373, 6375, 6912, 8097, 9505, 9808, 10610, 10719, 11748o, 12663, 12664, 13301, 15084, 16675, 17081, 17114, 18659, 18901, 20224, 20458, 20506, 21277, 23720, 24288, 24358, 26198, 26480, 27908, 29599, 29972, 30495, 31924, 32336, 32389o, 33168, 33570, 34878, 36271, 36671, 40043, 40712o, 41094, 41099o, 41483o, 41612o, 42234o, 45723, 45875o, 48688o, 48776o, 51167o, 51329o, 51397o, 51600o, 51796o
- C4 (55): 2447, 2812, 6703, 8160, 8378, 11043, 15810, 16479, 17458, 18043, 18792, 19413, 19473, 20007, 20527, 20573, 20762, 21597, 22533, 22586, 25703, 26356, 30615, 31904, 32249, 33224, 35335, 35718, 35934o, 36350, 37125o, 38376, 41321o, 41426o, 42402o, 42733o, 43036o, 43349o, 43997o, 44434, 48640, 49967o, 50040o, 50722o, 50868o, 50886o, 50924o, 50950o, 51051o, 51199o, 52266o, 52281o, 52299, 52306o, 52433o
- C5 (40): 2803, 9699, 10491, 11313, 15987, 16193, 17530, 20843, 23636o, 24080, 26882, 29291, 29330o, 30001, 30055, 30100, 30869, 31187, 31345, 31775, 34749, 35511, 35523, 36050, 36795, 36985, 37915, 38989, 39565o, 40728o, 41983o, 42277o, 42626, 45099o, 45881o, 48303o, 48439o, 50458o, 51092o, 51501o
- C6 (45): 1656, 5662, 14230, 20096, 20902, 21000, 21705, 22012, 23481, 24731, 24926, 25038, 25938, 26032, 29294, 29822, 30816, 31140, 31495, 32504, 36384, 37838, 39769, 41648o, 41753o, 41994, 42064o, 42191o, 42524, 42773o, 43697o, 43910, 47350o, 47546o, 48113, 48369o, 48414, 49169o, 50170o, 50278o, 50316o, 50424o, 51351o, 51816, 51832
- C7 (6): 2242o, 4667, 8225, 21733, 41241, 52458o

### continuedev/continue (30)

- C1 (3): 598, 2409, 9422
- C2 (1): 12701o
- C4 (20): 2464, 5342, 5589, 6030, 6699, 7952, 8732, 9151, 9661, 9731, 9735, 9736, 9737, 9812, 10007, 10462, 10842, 11960, 12079, 12410o
- C5 (4): 4503, 12314, 12315, 13335o
- C6 (1): 12699o
- C7 (1): 10067

### Aider-AI/aider (34)

- C2 (1): 3738o
- C3 (20): 733, 1244, 1276, 1279, 1302, 1304, 1326, 1345, 1434, 1474, 1546, 1561, 1570, 1863, 3326o, 3501, 4270o, 4281o, 4588, 4852
- C4 (8): 741, 1332, 1363, 1367, 2898, 2929, 4672, 5693
- C5 (2): 1873, 5624o
- C6 (1): 185
- C7 (2): 4679o, 4882o

### OpenHands/OpenHands (46)

- C1 (8): 95, 1791, 10191, 11801, 16151, 16238, 16850, 17732o
- C2 (3): 179, 6848, 15912o
- C3 (5): 226, 892, 3031, 6607, 13894
- C4 (6): 9210, 10355, 10989, 15488, 17733o, 17773o
- C5 (2): 517, 17198o
- C6 (20): 1895, 2918, 3143, 3176, 4158, 4877, 6010, 6115, 6218, 6429, 7422, 7767, 7869, 9197, 10059, 10063, 10189, 10350, 12265, 13665
- C7 (2): 13203, 14902

### openai/codex (786)

- C1 (132): 7852o, 10581o, 11090o, 11278o, 12491o, 13928o, 14548o, 14949o, 14950o, 14962o, 15379o, 15413o, 16144o, 16862o, 17133o, 17229o, 17322o, 17832o, 17911o, 19338o, 19516o, 19958o, 21008o, 22756o, 24347o, 25015o, 25259o, 25388o, 25744o, 25935o, 26293o, 26454o, 26773o, 26958o, 26984o, 28244o, 28352o, 28361o, 28794o, 29157o, 29408o, 29809o, 30056o, 30408o, 30429o, 30791o, 30992o, 31423, 32160o, 32222o, 32462o, 32797o, 33264o, 33319o, 33531o, 33894o, 34063o, 34178o, 34264o, 34410, 34474o, 34577o, 34614o, 35217o, 35482o, 35582o, 35726o, 36287o, 36330o, 37025o, 37084, 37223, 37236, 37240, 37244, 37247, 37249, 37295, 37311o, 37374o, 37426o, 37453o, 37672o, 37746o, 37770o, 37870o, 37969o, 38079o, 38105o, 38247o, 38505o, 38526o, 38537o, 38572o, 38574o, 38614o, 38693o, 38714o, 38769o, 38813o, 38841o, 38925o, 38948o, 38981o, 39031o, 39151o, 39345o, 40153o, 40579o, 40972o, 41783o, 41825o, 41849o, 42000o, 42087o, 43256o, 43766o, 44063o, 44525, 44917o, 44996o, 46234o, 46833o, 47519, 47735o, 47798o, 48554, 48618, 48640, 48666o, 48706, 49137o
- C2 (56): 10767o, 10860o, 13945o, 15868o, 16507o, 20888o, 21994o, 22396o, 24556o, 25369o, 25772o, 26380o, 26382o, 27758o, 29439o, 30802o, 32219, 32742o, 33776o, 33778o, 34001o, 34025o, 34260o, 34302o, 34579o, 34592o, 34691, 34730o, 34929o, 35393o, 36176, 36258o, 36658o, 36778o, 37402o, 38093o, 38444o, 39481o, 40231o, 41009o, 41201o, 41305o, 42717o, 43608, 43785o, 44503o, 44793o, 44846o, 45020o, 45172o, 46060o, 46397o, 46702o, 48375o, 48524o, 49066o
- C3 (53): 3646, 4960, 6108o, 9370o, 11077o, 11750, 13926o, 13973o, 14278, 14679, 15546, 15830o, 16892o, 17060o, 18578o, 18656o, 19553, 19790o, 19945o, 23679o, 23702o, 23740, 25272o, 25372o, 25415o, 25562o, 27019o, 28301o, 28315o, 28869o, 30367o, 30847o, 31865o, 33037, 33591o, 33825o, 34543o, 35471o, 37088o, 37104, 37821o, 39479o, 40454o, 41244o, 44625o, 44786o, 45377o, 46059o, 46843o, 47243o, 48716o, 48849o, 49899
- C4 (136): 4180, 6997, 7298, 7475, 7886, 9268, 9581, 10972, 11360o, 13199o, 14264o, 15174o, 16268o, 16296o, 16337o, 16579o, 16717, 17325o, 17326o, 18309o, 18937o, 18984o, 19100, 19171o, 19629o, 19844o, 20510o, 20770o, 20875, 21921o, 22176o, 22185o, 22492o, 22757o, 22799o, 23141, 23455o, 23773, 23892o, 24752o, 25370o, 25799o, 26030o, 26096o, 26164o, 26613o, 26853o, 26952o, 26998o, 27462o, 27474o, 27860o, 29015o, 29688o, 30288o, 30435o, 30473o, 30734o, 31413o, 31536o, 31548o, 31776o, 32315o, 32684o, 32690o, 33583o, 33673o, 33891o, 34266o, 34512o, 35374o, 35827o, 36179o, 36560o, 37153o, 37576o, 37962, 38168o, 38295o, 38301o, 38773o, 38985o, 39843o, 40328o, 40415o, 40516o, 40752o, 41138o, 41139o, 41534o, 41665o, 42211o, 43028o, 43082o, 44412o, 44856o, 44954o, 45476o, 45788o, 45917o, 46454, 46684o, 46703o, 46738o, 47004o, 47602o, 47810o, 48023o, 48039o, 48183o, 48336o, 48528o, 48601, 48678o, 48778, 48876, 48921, 48935o, 49264o, 49326o, 49352o, 49365o, 49371o, 49400o, 49431o, 49521o, 49630o, 49716o, 49731o, 49760o, 49777o, 49820o, 49897o, 49904o, 49969o, 49980o
- C5 (57): 4131, 4498, 6850, 6991, 7290, 9502o, 9504o, 9506, 9681o, 9758, 9767o, 11058o, 13234o, 14035o, 14423o, 15422, 18473o, 18538o, 18983, 20861, 20874o, 21658o, 21957o, 22050, 22379o, 23044o, 23784o, 24048o, 24215o, 24526o, 24582o, 25880o, 26980o, 27382o, 29066o, 29085o, 29247, 29871, 29929o, 32325o, 32645o, 33638o, 34742o, 35421o, 35527o, 35712o, 35735o, 36804o, 40897o, 41236o, 42339o, 43179o, 45540o, 46815o, 48346o, 49461o, 50041o
- C6 (31): 4592, 4775o, 5756, 6715, 6905o, 6965o, 7353o, 14220o, 15801o, 22541o, 27550o, 29176o, 33010o, 33049o, 33913o, 34325o, 35193o, 35551o, 36089o, 36827o, 38069o, 38459o, 39484o, 39517o, 39574o, 39580o, 40306o, 41984o, 43327o, 44623o, 48755o
- C7 (321): 2267o, 3141o, 4497o, 4773, 6224, 6665o, 6828o, 8031, 8217, 9236, 9254, 9292, 10090o, 10390o, 10797, 11316o, 12272, 13635, 14057o, 14338o, 14672, 14875o, 15016o, 15434, 15524o, 15534o, 15551, 15698o, 15769o, 15809o, 16334, 16438o, 16451o, 17337, 17644o, 18069, 18204o, 18243, 18448o, 18451o, 18620o, 18711o, 18800, 18845o, 18895, 19189o, 19676o, 20017o, 20346o, 20611o, 20716, 20720o, 20906o, 21081o, 21292o, 21470o, 21606o, 21715o, 22044o, 22367o, 22889o, 23468, 23505o, 23661o, 23712o, 23965o, 24416o, 24461o, 24490o, 24742o, 24854o, 24871, 24873o, 24933o, 25280o, 25322o, 25404o, 25416o, 25497o, 25991o, 26087, 26262o, 26416o, 27125o, 27137o, 27236o, 27354o, 28042o, 28649o, 28753o, 28878o, 28921, 29072o, 29797o, 29908o, 30024o, 30043o, 30153o, 30356o, 30540o, 30615o, 30691o, 31101o, 31134o, 31220o, 31264o, 31560o, 31599o, 31929o, 32184o, 32194o, 32227o, 32767o, 32808, 33178o, 33356o, 33688o, 33732o, 33793o, 33806o, 33958o, 34008o, 34062o, 34179o, 34207o, 34314o, 34530o, 34723o, 34842o, 35070o, 35380o, 35437o, 35547o, 35768o, 35841o, 35871o, 35940o, 36087o, 36348o, 36366o, 36386o, 37067o, 37076o, 37081o, 37082o, 37364o, 37415o, 37427o, 37430o, 37562o, 37592o, 37940o, 38028o, 38222o, 38286o, 38290o, 38318o, 38347o, 38523o, 38665o, 38672o, 38715o, 38779o, 38909o, 39276o, 39528o, 39626o, 39697o, 39841o, 39874o, 39996o, 40010o, 40116o, 40119o, 40121o, 40379o, 40433o, 40565o, 40685o, 40817o, 41042o, 41161o, 41175o, 41293o, 41351o, 41415o, 41492o, 41493o, 41507o, 41516o, 41715o, 41738o, 41809o, 41811o, 42172o, 42213o, 42233o, 42621o, 42688o, 42754o, 42873o, 42905o, 42925o, 43313o, 43362o, 43516o, 43518o, 43854o, 43929, 44185o, 44197o, 44304o, 44309o, 44329o, 44357o, 44495o, 44783o, 44816o, 44838o, 44840o, 44882o, 45057o, 45119, 45152o, 45153o, 45330o, 45485o, 45498o, 45657o, 45660o, 45697o, 45842o, 45871o, 45950o, 45953o, 45988o, 46062o, 46110o, 46246o, 46252o, 46388o, 46405o, 46412o, 46576o, 46656o, 46662o, 46668o, 46726o, 46787o, 46900o, 46951o, 47115o, 47345, 47367, 47368o, 47402o, 47415o, 47429o, 47430o, 47433o, 47455o, 47465o, 47479o, 47527o, 47547o, 47559o, 47640o, 47674o, 47681o, 47744o, 47766o, 47921o, 47941o, 47973o, 47987o, 48008o, 48049o, 48061, 48329o, 48408o, 48523o, 48593o, 48669o, 48681o, 48710o, 48721o, 48741o, 48758o, 48759o, 48766o, 48780o, 48856o, 48976o, 48987o, 49017o, 49113o, 49234o, 49250o, 49284o, 49288o, 49303o, 49340o, 49344o, 49433o, 49460o, 49498o, 49514o, 49515o, 49533o, 49580o, 49717o, 49732o, 49789o, 49791o, 49840o, 49851o, 49884o, 49889o, 50007o, 50025o, 50078

### aaif-goose/goose (43)

- C1 (7): 1163, 2205, 8229, 8882, 9755, 9822, 10063
- C2 (5): 2337, 2947, 9332, 9938, 12458o
- C3 (3): 6295, 8976, 10018
- C4 (12): 3004, 3942, 6010, 6701, 6816, 7781, 7836, 7837, 10872, 11259, 11338o, 12538o
- C5 (6): 1060, 7846, 9582, 11122o, 11835, 12464o
- C6 (3): 1075, 6871, 11740o
- C7 (7): 5943, 6040, 7705, 9118, 10895, 12513o, 12566o

### SWE-agent/SWE-agent (7)

- C3 (2): 968, 1204
- C4 (1): 1197
- C5 (2): 1269, 1516o
- C6 (2): 753, 1074o

### microsoft/autogen (17)

- C2 (1): 3156
- C4 (12): 111, 166, 1772, 1947, 1961, 2001, 2845, 3055, 5487, 5518, 6235o, 6425
- C6 (1): 19
- C7 (3): 7462o, 7475o, 8298o


## Lead verification (2026-10-01)

- **Raw hits reproduced 9/9** (`orphan`, `"spawn ENOENT"`, `conpty` × cline, opencode, codex): 49/100*/100*, 0/12/7, 5/34/68, identical to Appendix A.
- **Classification spot-check, 5 sampled counted issues:** 3 clearly in category (gemini-cli #15873 orphaned process; codex #11278 orphaned app-server; opencode #6703 is a Windows-shell request, plausible for C4), 2 loose (gemini-cli #22612 is children dying under Bun, not a failed stop; aider #1244 is a Windows console error in the agent's own UI, not a PTY of an executed command).
- **Reading for the G0:** pain exists in all three ecosystems and the Windows share is high, but the counts are an **upper bound** that tracks tracker size (openai/codex is 49% of the total) — use them as direction, not as a measure.
