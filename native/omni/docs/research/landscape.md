# Landscape survey: does anything already cover hugr-omni?

**Access date:** 2026-10-01 (all repository, registry and documentation facts below were read on this date; no candidate was installed or executed). **Work package:** R1, research only, no code, no architecture proposals.

## Verdict

**Yes by the brief's own gate:** processkit (Rust crate 3.3.4) and its Python binding processkit-py (1.5.0) each score 81.8% on 3 OS (16 Y + 4 P of 22; the only N cells are B03 and B22), so >=80% in 2 of the 3 target languages is already met by one young project with one principal maintainer, while TypeScript has no candidate above 61.4% even as an unintegrated union of libraries, and no library combines the full process-lifecycle surface (PTY, streaming, graceful kill, cancel, scope exit) with an OS sandbox on all 3 OS.

What is genuinely missing in the ecosystem (statements of fact, not proposals):

1. **TypeScript has no kernel-contained tree kill.** The best JS tools do snapshot or process-group kills: execa's `killDescendants` uses a Unix process group and `taskkill /T /F` on Windows (which needs the root alive), and @a5omic/kill-tree states there is 'no hidden native Job Object addon'. processkit has no npm package ('reserved as a courtesy only, no package planned'). Best TS union: 61.4% (execa + node-pty + @anthropic-ai/sandbox-runtime).
2. **No library joins the full lifecycle surface with an OS sandbox on all 3 OS.** The closest is a3s-sandbox (Rust, 0.2.0, 2 stars, CI on ubuntu/macos/windows): sandbox on all three OS and a deadline that kills the descendant tree, but it is command-string oriented (PowerShell 7 on Windows) and its README documents no PTY, stdin, cancellation or PATHEXT/argv semantics. The other sandbox libraries are TS-only with a Windows alpha that needs a one-time elevated install and a dedicated user account (srt), macOS+Linux with Windows 'planned' (zerobox) or Go and beta (agentbox). processkit states it 'is not a sandbox'; Node's permission model and Deno's permissions do not confine spawned children.
3. **Whole-tree cleanup after abrupt host death exists only on Windows.** Job Objects (processkit, process-wrap) survive a crashed host; on Linux only the direct child can be covered (`PR_SET_PDEATHSIG`, thread-scoped; processkit docs, trexec README) and macOS has no equivalent. processkit documents this honestly (`kill_on_parent_death_scope`); no other candidate documents more, and Ctrl-C/SIGTERM cleanup always needs caller wiring.
4. **The 'boring' cross-OS semantics are unevenly solved.** Relative-program + cwd (B03) is normalised only by duct and execa (cross-spawn partially); Rust std and Python document it as platform-dependent and processkit declines it as a non-goal. A normalised exit result (B16) does not exist: Windows has no signals, so processkit reports a killed process as `Exited(1)` (documented) and execa documents that only a few signals work on Windows and that SIGTERM and SIGKILL both terminate immediately.
5. **PTY on Windows is the weakest corner.** node-pty, portable-pty, bun-pty and zigpty document no no-loss/no-hang guarantee at ConPTY exit (Bun documents a hang-prone `terminal.close()` before Windows 11 24H2). For killing a PTY child's tree only processkit documents containment (Job Object / cgroup / process group around the PTY child, ConPTY EOF handled in source); node-pty's Windows `kill()` walks the console process list, portable-pty signals or terminates the root only, and Bun kills only the attached process. Python's PTY libraries are split by OS (pexpect/ptyprocess Unix only, pywinpty Windows only).

---

## 1. How to read this

The 22 behaviours (the denominator) are fixed by the brief:

| ID | Behaviour |
|---|---|
| B01 | spawn by bare name, identical on 3 OS incl. PATHEXT (npm -> npm.cmd) |
| B02 | args round-trip exactly incl. .cmd/.bat on Windows, safe, no shell |
| B03 | relative program path + cwd semantics identical on 3 OS |
| B04 | typed, actionable errors (not found / not executable / invalid cwd / invalid arg) |
| B05 | env merge/remove/clean incl. Windows case-insensitive PATH |
| B06 | live separate stdout/stderr streaming, UTF-8 split-safe decoding |
| B07 | unread output never blocks the child (bounded buffer, counted drops) |
| B08 | stdin write/end; writes after child exit never crash host |
| B09 | no output lost at exit; root exits while grandchild holds pipe does not hang |
| B10 | run-and-collect with timeout, closed stdin by default, bounded output capture |
| B11 | kill whole process tree (grandchildren too), incl. after root already exited |
| B12 | graceful then forced termination |
| B13 | timeout kills the tree |
| B14 | cancellation (AbortSignal / task cancel / token) kills the tree |
| B15 | scope exit (await using / with / drop) kills the tree |
| B16 | normalized exit result (code, signal, reason) across OS |
| B17 | host exit (normal, exit(), crash, Ctrl-C/SIGTERM) cleans up child trees |
| B18 | PTY on 3 OS incl. Windows ConPTY: isatty, size, resize |
| B19 | PTY interactive I/O + Ctrl-C |
| B20 | PTY output not lost and no hang at exit (ConPTY EOF) |
| B21 | kill tree of a PTY process |
| B22 | OS sandbox for the child (fs allowlist + network off) on macOS/Linux/Windows |

**Cell codes.** Every Y/P cell links to the primary source it rests on (README, official docs, or source file on GitHub).

- **Y** - documented or implemented (source read) for ordinary use on all three OS. Deliberate escapes that the library documents (a descendant that calls `setsid` or joins its own Job) are not held against it.
- **P** - partial: the behaviour exists but with a named gap, or on all three OS only through caller-side assembly. Each P is explained in the candidate notes (section 6).
- **N** - not provided, or explicitly refused by the project. **?** - cannot be decided from the primary sources I read (honest unknown, scored 0).
- **†** after a code (e.g. `Y†`) - the behaviour works on fewer than three OS (Unix-only pexpect, Windows-only pywinpty, POSIX-only process-wrap PTY, zerobox without Windows). **Scored 0 in the strict column**, counted by its base letter in the 'any-OS' column.

**Coverage** = (#Y + 0.5 x #P) / 22, counted only for cells that work on all three OS (strict column). The relaxed 'any-OS' column additionally counts † cells so near-misses are visible. Opt-in features count when documented (execa `killDescendants`). Two ecosystem-wide conventions apply to every candidate: (1) Windows `.cmd/.bat` arguments cannot round-trip exactly through cmd.exe, so B02 is capped at P for any library; (2) macOS has no kernel whole-tree primitive, so process-group tracking is accepted as Y for B11/B13-B15 when the escape (`setsid`) is documented.

**'Tested'.** No candidate code was run. The 'CI on 3 OS' column reports what each repository's own workflow files show (matrix read from the workflow YAML where available); a doc claim is not treated as a test result.

**Combinations** (section 4) take the best strict cell per behaviour across the members. They are an upper bound: they ignore integration friction (for example execa cannot spawn into node-pty, srt wraps a shell command string, and tree-kill logic is not applied to a PTY child). Per-OS libraries (pexpect/ptyprocess on Unix + pywinpty on Windows) are credited at P only, because the caller must switch APIs per OS.

## 2. Searches run

24 discovery searches in total (11 web, 6 crates.io, 5 npm registry, 2 GitHub). The first four are the mandatory ones from the brief.

| # | Where | Query | Mandatory |
|---|---|---|---|
| 1 | web | `cross-platform process tree kill library` | yes |
| 2 | web | `pty library windows conpty node python rust` | yes |
| 3 | web | `agent sandbox library macos linux windows` | yes |
| 4 | web | `kill process tree windows job object library` | yes |
| 5 | web | `rust crate async subprocess kill process tree timeout bounded output Windows job object` |  |
| 6 | web | `python library subprocess kill whole process tree timeout Windows job object asyncio cross-platform` |  |
| 7 | web | `node.js spawn library kill process tree on exit orphan child processes windows job object npm` |  |
| 8 | web | `node-pty alternative Bun Deno PTY ConPTY library` |  |
| 9 | web | `npm package child process runner kill process tree timeout Windows job object native Node Bun Deno` |  |
| 10 | web | `python package run subprocess no orphans process tree kill timeout Windows Job Object macOS Linux pty` |  |
| 11 | web | `open source library sandbox AI agent commands Windows AppContainer restricted token macOS Seatbelt Linux Landlock Rust Python TypeScript SDK` |  |
| 12 | crates.io | `process tree kill` |  |
| 13 | crates.io | `job object` |  |
| 14 | crates.io | `child process containment` |  |
| 15 | crates.io | `subprocess supervisor` |  |
| 16 | crates.io | `conpty pty` |  |
| 17 | crates.io | `codex sandbox` |  |
| 18 | npm | `tree kill process` |  |
| 19 | npm | `pty conpty` |  |
| 20 | npm | `cross platform spawn windows` |  |
| 21 | npm | `kill process tree job object` |  |
| 22 | npm | `child process sandbox agent` |  |
| 23 | GitHub | `repos 'process-wrap' --owner watchexec` |  |
| 24 | GitHub | `repos 'zerobox'` |  |

What the searches added beyond the mandatory list: processkit + processkit-py, tokio-process-tools, @a5omic/kill-tree, kill_tree (Rust), subprocess (Rust), a3s-sandbox, zerobox, agentbox, trexec, bun-pty, zigpty (all scored below) and the unscored list in section 7. Registry metadata (npm, PyPI JSON API, crates.io API, GitHub API) was used for release dates and archive flags.

## 3. Ranked coverage (strict = works on all 3 OS)

| Rank | Candidate | Languages | Latest release | Maintenance | CI on 3 OS | Y | P | Strict | Any-OS |
|---:|---|---|---|---|---|---:|---:|---:|---:|
| 1 | processkit (Rust crate) | Rust (tokio) | 3.3.4 2026-08-22 (first release 2026-05-31; 55 versions) | active (push 2026-09-29), 42 stars, ~39k downloads, one principal maintainer (ZelAnton 958 commits; TESTPERSONAL 201); not archived (GitHub flag) | Y (ubuntu x64/arm, windows x64/arm64, macos, musl container, FreeBSD VM) | 16 | 4 | **81.8%** | 81.8% |
| 2 | processkit-py (PyPI, import processkit) | Python 3.10+ (PyO3, abi3 wheels; free-threaded 3.14t wheel) | 1.5.0 2026-08-08 (repo created 2026-06-07) | active (push 2026-10-01), 4 stars, same principal maintainer as processkit (ZelAnton 671 commits); not archived (GitHub flag) | Y (ubuntu x64/arm, windows x64/arm64, macos) | 16 | 4 | **81.8%** | 81.8% |
| 3 | execa | TypeScript/JS (Node >=22, ESM) | 10.0.1 2026-07-31 | active (push 2026-07-31), not archived, 7.6k stars | Y (ubuntu, macos, windows) | 5 | 10 | **45.5%** | 45.5% |
| 4 | tokio-process-tools | Rust (tokio) | 0.11.2 2026-05-15 (repo created 2025-01-05) | low activity (push 2026-05-15), 6 stars; not archived (GitHub flag) | N (all 7 workflow jobs run on ubuntu-latest) | 3 | 8 | **31.8%** | 31.8% |
| 5 | portable-pty (wezterm) | Rust | 0.9.0 2025-02-11 (crates.io) | repo active (push 2026-09-29); crate release 20 months old; wezterm last tagged release 2024-02-03; not archived (GitHub flag) | ? | 4 | 5 | **29.5%** | 29.5% |
| 6 | trexec (Go) | Go | no releases (repo created 2026-08-22, one day of commits) | 1 star; not archived (GitHub flag) | ? (badge only) | 4 | 5 | **29.5%** | 29.5% |
| 7 | Bun.spawn | TypeScript (Bun) | bun-v1.4.2 2026-09-05 | active (push 2026-10-01); not archived (GitHub flag) | n/a | 2 | 8 | **27.3%** | 27.3% |
| 8 | node-pty | TypeScript/JS (Node >=16, Electron; native addon) | 1.1.0 stable 2025-12-22; 1.2.0-beta.15 2026-08-03 (npm tag beta) | active (push 2026-09-30), not archived, 2.0k stars | Y (ubuntu, macos, windows, arm legs) | 2 | 6 | **22.7%** | 22.7% |
| 9 | Deno (Deno.Command + permissions) | TypeScript (Deno) | v2.9.7 2026-09-17 | active (push 2026-10-01), not archived | n/a | 0 | 9 | **20.5%** | 20.5% |
| 10 | duct | Rust (and a Python port, duct.py) | 1.1.2 2026-09-03 | active, 1.0k stars; not archived (GitHub flag) | ? | 1 | 7 | **20.5%** | 20.5% |
| 11 | Python subprocess + asyncio.subprocess | Python (stdlib) | stdlib (docs 3.14.x) | active (CPython push 2026-10-01); not archived (GitHub flag) | n/a | 0 | 8 | **18.2%** | 18.2% |
| 12 | tokio::process | Rust | tokio 1.53.1 2026-07-20 | active; not archived (GitHub flag) | n/a | 0 | 8 | **18.2%** | 18.2% |
| 13 | zx | JS/TS (Node >=12.17, Bun, Deno) | 8.8.5 2025-10-19 | active (push 2026-08-14), not archived, 45.8k stars | ? | 0 | 8 | **18.2%** | 18.2% |
| 14 | a3s-sandbox | Rust (tokio) | 0.2.0 2026-09-25 | active (push 2026-09-28), 2 stars; not archived (GitHub flag) | Y (ubuntu-latest, macos-14, windows-latest) | 2 | 3 | **15.9%** | 15.9% |
| 15 | Rust std::process | Rust | Rust 1.99.0 2026-10-01 | active; not archived (GitHub flag) | n/a | 0 | 7 | **15.9%** | 15.9% |
| 16 | cross-spawn | JS (Node) | 7.0.6 2024-11-18 | low activity (last push 2024-11-18), not archived, 1.2k stars | ? (Linux matrix in ci.yaml; AppVeyor badge for Windows) | 1 | 4 | **13.6%** | 13.6% |
| 17 | subprocess (Rust crate) | Rust | 1.2.1 2026-08-05 | active, 452 stars; not archived (GitHub flag) | ? | 0 | 6 | **13.6%** | 13.6% |
| 18 | process-wrap | Rust (std + Tokio frontends) | 10.0.1 2026-09-23 | active (push 2026-10-01), not archived, 48 stars | Y (macos, ubuntu, windows) | 1 | 3 | **11.4%** | 22.7% |
| 19 | command-group | Rust | 5.0.1 2023-11-18 | deprecated ('use process-wrap'); not archived; last push 2024-04-21 | ? | 1 | 3 | **11.4%** | 11.4% |
| 20 | bun-pty | TypeScript (Bun, FFI to Rust portable-pty) | 0.4.11 2026-09-30 (package created 2025-05-14) | active, 72 stars; not archived (GitHub flag) | ? | 2 | 0 | **9.1%** | 9.1% |
| 21 | zigpty | TypeScript (Node drop-in for node-pty; Zig core; also a Zig package) | 0.2.1 2026-06-22 (package created 2026-03-21) | active, 128 stars; not archived (GitHub flag) | ? | 2 | 0 | **9.1%** | 9.1% |
| 22 | @a5omic/kill-tree | TypeScript/JS (Node >=18, no native addon) | 0.1.1 2026-08-28 (package created 2026-08-28) | new, 0 stars; not archived (GitHub flag) | Y (README: Linux, macOS, Windows CI) | 0 | 2 | **4.5%** | 4.5% |
| 23 | psutil | Python (C extension) | 7.2.2 2026-01-28 | active (push 2026-10-01), 11.3k stars; not archived (GitHub flag) | Y (large matrix) | 0 | 2 | **4.5%** | 4.5% |
| 24 | @anthropic-ai/sandbox-runtime | TypeScript (CLI + library) | 0.0.78 2026-09-30 | active (push 2026-10-01), pre-1.0, 5.4k stars; not archived (GitHub flag) | ? | 0 | 1 | **2.3%** | 2.3% |
| 25 | agentbox (Go) | Go | no releases (repo created 2026-02-16) | last push 2026-04-09, 7 stars (read via mirror Alan-123185/agentbox); not archived (GitHub flag) | ? | 0 | 1 | **2.3%** | 2.3% |
| 26 | kill_tree (Rust crate) | Rust (sync + tokio) and CLI | 0.2.4 2024-02-12 | dormant (last push 2024-04-07), 22 stars; not archived (GitHub flag) | ? | 0 | 1 | **2.3%** | 2.3% |
| 27 | tree-kill | JS (Node) | 1.2.2 2019-12-11 | dormant (last push 2020-06-17), not archived, 359 stars | ? | 0 | 1 | **2.3%** | 2.3% |
| 28 | pexpect | Python | 4.9.0 2023-11-25 | low activity (push 2025-04-11), not archived, 2.9k stars | ? | 0 | 0 | **0.0%** | 13.6% |
| 29 | ptyprocess | Python | 0.7.0 2020-12-28 | stale release (5.8 y); repo still receives commits (push 2026-08-26); not archived | ? | 0 | 0 | **0.0%** | 11.4% |
| 30 | pywinpty | Python (PyO3 over Rust `winpty-rs`) | 3.0.5 2026-06-10 | active (push 2026-06-23), not archived, 165 stars | Windows-only CI | 0 | 0 | **0.0%** | 9.1% |
| 31 | zerobox (Rust crate, npm, PyPI) | Rust, TypeScript and Python SDKs ('consistent API across languages') | 0.3.3 2026-05-17 | no commits since 2026-05-17 (4.5 months), 718 stars; not archived (GitHub flag) | ? | 0 | 0 | **0.0%** | 4.5% |
| 32 | Node.js permission model | Node.js | documented 'Stability 2 - Stable' | part of Node.js; not archived (GitHub flag) | n/a | 0 | 0 | **0.0%** | 0.0% |

Only single candidates at or above 80%: processkit (Rust crate) (81.8%), processkit-py (PyPI, import processkit) (81.8%).

## 4. Best combination per language

| Language | Combination | Coverage (strict) | Y/P cells credited |
|---|---|---:|---|
| TypeScript | execa + node-pty + @anthropic-ai/sandbox-runtime | **61.4%** | 7Y + 13P |
| TypeScript | execa + node-pty + @anthropic-ai/sandbox-runtime + @a5omic/kill-tree | **61.4%** | 7Y + 13P |
| TypeScript | cross-spawn + tree-kill + node-pty (the 'classic' trio) | **31.8%** | 3Y + 8P |
| TypeScript (Bun) | Bun.spawn alone | **27.3%** | 2Y + 8P |
| TypeScript (Deno) | Deno.Command alone | **20.5%** | 0Y + 9P |
| Python | processkit-py (single library) | **81.8%** | 16Y + 4P |
| Python | stdlib subprocess + psutil + pexpect/ptyprocess (Linux, macOS) + pywinpty (Windows) | **27.3%** | 0Y + 12P |
| Rust | processkit (single crate) | **81.8%** | 16Y + 4P |
| Rust | processkit + a3s-sandbox (adds B22; not integrated with processkit) | **86.4%** | 17Y + 4P |
| Rust | without processkit: std + tokio-process-tools + process-wrap + portable-pty + duct + subprocess + a3s-sandbox | **65.9%** | 10Y + 9P |

Languages with a combination >= 80%: Python, Rust. Languages without: TypeScript (best 61.4%). The brief's gate ('>= 80% on 3 OS in >= 2 languages') is therefore met by Rust and Python, both through the same project.

Without processkit the best Python assembly is 27.3% and the best Rust assembly is 65.9%.

## 5. Full matrix (B01 to B22)

Rows are candidates (mandatory first, then those found by the searches). Click a letter to open the source behind it.

| Candidate | B01 | B02 | B03 | B04 | B05 | B06 | B07 | B08 | B09 | B10 | B11 | B12 | B13 | B14 | B15 | B16 | B17 | B18 | B19 | B20 | B21 | B22 | Strict | Any-OS |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---:|---:|
| **Mandatory candidates** | | | | | | | | | | | | | | | | | | | | | | ||  |  |
| node-pty | [N][np_path] | [P][np_wpa] | N | [P][np_conpty] | [P][np_term] | N | N | N | N | N | N | N | N | N | N | [P][np_ut] | N | [Y][np_rd] | [Y][np_rd] | [P][np_ut] | [P][np_wpa] | N | 22.7% | 22.7% |
| execa | [Y][ex_win] | [P][ex_cf] | [Y][ex_cf] | [P][ex_err] | [P][ex_api] | [Y][ex_enc] | [P][ex_out] | [P][ex_in] | N | [P][ex_api] | [P][ex_kd] | [P][ex_term] | [Y][ex_term] | [Y][ex_term] | N | [P][ex_err] | [P][ex_term] | N | N | N | N | N | 45.5% | 45.5% |
| tree-kill | N | N | N | N | N | N | N | N | N | N | [P][tk_src] | N | N | N | N | N | N | N | N | N | N | N | 2.3% | 2.3% |
| cross-spawn | [Y][xs_res] | [P][xs_esc] | [P][xs_res] | [P][xs_enoent] | [P][xs_res] | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | 13.6% | 13.6% |
| zx | [P][zx_rd] | [N][zx_core] | N | [P][zx_core] | [P][zx_core] | N | N | N | N | [P][zx_core] | [P][zx_core] | N | [P][zx_core] | [P][zx_core] | N | [P][zx_core] | N | N | N | N | N | N | 18.2% | 18.2% |
| @anthropic-ai/sandbox-runtime | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | [P][srt_rd] | 2.3% | 2.3% |
| Node.js permission model | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | [N][node_perm] | 0.0% | 0.0% |
| Deno (Deno.Command + permissions) | N | N | N | N | [P][dn_dts] | [P][dn_dts] | N | [P][dn_dts] | N | [P][dn_dts] | N | N | [P][dn_dts] | [P][dn_dts] | [P][dn_js] | [P][dn_dts] | [P][dn_proc] | N | N | N | N | [N][dn_perm] | 20.5% | 20.5% |
| Bun.spawn | N | N | N | N | [P][bun_doc] | [P][bun_doc] | N | [P][bun_doc] | N | [P][bun_doc] | N | N | [P][bun_doc] | [P][bun_doc] | N | [P][bun_doc] | N | [Y][bun_doc] | [Y][bun_doc] | [P][bun_doc] | N | N | 27.3% | 27.3% |
| Python subprocess + asyncio.subprocess | [N][py_sub] | [P][py_sub] | [N][py_sub] | [P][py_sub] | [P][py_sub] | [P][py_async] | N | [P][py_sub] | N | [P][py_sub] | N | N | [P][py_sub] | N | N | [P][py_async] | N | N | N | N | N | N | 18.2% | 18.2% |
| pexpect | N | N | N | N | N | N | N | N | N | N | N | [P†][pe_api] | N | N | N | N | N | [Y†][pe_api] | [Y†][pe_api] | [?†][pe_ov] | [P†][pe_api] | N | 0.0% | 13.6% |
| pywinpty | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | [Y†][pw_src] | [Y†][pw_src] | ?† | ?† | N | 0.0% | 9.1% |
| ptyprocess | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | [Y†][pp_src] | [Y†][pp_src] | ?† | [P†][pp_src] | N | 0.0% | 11.4% |
| psutil | N | N | N | N | N | N | N | N | N | N | [P][ps_rec] | [P][ps_rec] | N | N | N | N | N | N | N | N | N | N | 4.5% | 4.5% |
| Rust std::process | [N][rs_proc] | [P][rs_mod] | [N][rs_proc] | [P][rs_proc] | [P][rs_proc] | [P][rs_proc] | N | [P][rs_proc] | N | [P][rs_proc] | N | N | N | N | N | [P][rs_proc] | N | N | N | N | N | N | 15.9% | 15.9% |
| tokio::process | [N][tk_cmd] | [P][tk_cmd] | [N][tk_cmd] | [P][tk_cmd] | [P][tk_cmd] | [P][tk_proc] | N | [P][tk_proc] | N | [P][tk_proc] | N | N | N | N | [P][tk_proc] | [P][tk_proc] | N | N | N | N | N | N | 18.2% | 18.2% |
| portable-pty (wezterm) | [Y][pty_cb] | N | [P][pty_cb] | [P][pty_cb] | [Y][pty_cb] | N | N | [P][pty_lib] | N | N | N | [P][pty_lib] | N | N | N | [P][pty_lib] | N | [Y][pty_docs] | [Y][pty_docs] | ? | N | N | 29.5% | 29.5% |
| process-wrap | N | N | N | N | N | N | N | N | N | N | [Y][pw2_rd] | [P][pw2_rd] | N | N | [P][pw2_win] | N | [P][pw2_win] | [Y†][pw2_rd] | [Y†][pw2_rd] | ?† | [P†][pw2_rd] | N | 11.4% | 22.7% |
| command-group | N | N | N | N | N | N | N | N | N | N | [Y][cg_rd] | [P][cg_unix] | N | N | [P][cg_win] | N | [P][cg_win] | N | N | N | N | N | 11.4% | 11.4% |
| duct | N | N | [Y][du_lib] | [P][du_lib] | [P][du_lib] | [P][du_rd] | [P][du_lib] | [P][du_lib] | [N][du_lib] | [P][du_rd] | N | N | N | N | N | [P][du_lib] | N | N | N | N | N | N | 20.5% | 20.5% |
| **Found by the searches** | | | | | | | | | | | | | | | | | | | | | | ||  |  |
| processkit (Rust crate) | [Y][pk_cmp] | [P][pk_cmds] | [N][pk_cmds] | [Y][pk_err] | [Y][pk_cmdsrc] | [Y][pk_cmds] | [Y][pk_cmds] | [Y][pk_stream] | [Y][pk_cmds] | [Y][pk_cmds] | [Y][pk_plat] | [P][pk_plat] | [Y][pk_tc] | [Y][pk_tc] | [Y][pk_pg] | [P][pk_plat] | [P][pk_plat] | [Y][pk_plat] | [Y][pk_stdin] | [Y][pk_ptysrc] | [Y][pk_plat] | [N][pk_untr] | 81.8% | 81.8% |
| processkit-py (PyPI, import processkit) | [Y][pkpy_cmds] | [P][pkpy_readme] | [N][pkpy_cmds] | [Y][pkpy_readme] | [Y][pkpy_readme] | [Y][pkpy_readme] | [Y][pkpy_readme] | [Y][pkpy_readme] | [Y][pkpy_readme] | [Y][pkpy_readme] | [Y][pkpy_plat] | [P][pkpy_plat] | [Y][pkpy_readme] | [Y][pkpy_plat] | [Y][pkpy_readme] | [P][pkpy_readme] | [P][pkpy_plat] | [Y][pkpy_readme] | [Y][pkpy_readme] | [Y][pk_ptysrc] | [Y][pkpy_readme] | [N][pkpy_sand] | 81.8% | 81.8% |
| tokio-process-tools | N | N | N | [P][tpt_rd] | N | [P][tpt_rd] | [P][tpt_rd] | [P][tpt_rd] | [Y][tpt_rd] | [P][tpt_rd] | [P][tpt_rd] | [Y][tpt_rd] | [Y][tpt_rd] | N | [P][tpt_rd] | N | [P][tpt_rd] | N | N | N | N | N | 31.8% | 31.8% |
| @a5omic/kill-tree | N | N | N | N | N | N | N | N | N | N | [P][a5_rd] | [P][a5_rd] | N | N | N | N | N | N | N | N | N | N | 4.5% | 4.5% |
| kill_tree (Rust crate) | N | N | N | N | N | N | N | N | N | N | [P][ktr_rd] | N | N | N | N | N | N | N | N | N | N | N | 2.3% | 2.3% |
| subprocess (Rust crate) | N | N | N | N | N | [P][sp_rd] | [P][sp_rd] | [P][sp_rd] | N | [P][sp_rd] | N | [P][sp_rd] | N | N | N | [P][sp_rd] | N | N | N | N | N | N | 13.6% | 13.6% |
| a3s-sandbox | N | N | N | N | N | [P][a3s_rd] | N | N | N | [P][a3s_rd] | [P][a3s_rd] | N | [Y][a3s_rd] | N | N | N | N | N | N | N | N | [Y][a3s_rd] | 15.9% | 15.9% |
| zerobox (Rust crate, npm, PyPI) | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | [Y†][zb_rd] | 0.0% | 4.5% |
| agentbox (Go) | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | [P][ab_rd] | 2.3% | 2.3% |
| trexec (Go) | N | N | N | N | N | [P][trx_rd] | N | [P][trx_rd] | N | [P][trx_rd] | [Y][trx_rd] | [Y][trx_rd] | [Y][trx_rd] | [Y][trx_rd] | N | [P][trx_rd] | [P][trx_rd] | N | N | N | N | N | 29.5% | 29.5% |
| bun-pty | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | [Y][bp_rd] | [Y][bp_rd] | ? | N | N | 9.1% | 9.1% |
| zigpty | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | [Y][zp_rd] | [Y][zp_rd] | ? | ? | N | 9.1% | 9.1% |

## 6. Candidate notes (evidence, gaps, status)

### node-pty

- **Languages:** TypeScript/JS (Node >=16, Electron; native addon). **OS:** Win10 1809+ (ConPTY only; winpty dropped), macOS, Linux.
- **Latest release:** 1.1.0 stable 2025-12-22; 1.2.0-beta.15 2026-08-03 (npm tag beta). **Maintenance:** active (push 2026-09-30), not archived, 2.0k stars. **CI on 3 OS:** Y (ubuntu, macos, windows, arm legs) ([workflow files][np_ci]).
- **Coverage:** 22.7% strict (2Y + 6P), 22.7% any-OS.
- B01 N: Windows lookup scans PATH for the exact file name; no PATHEXT list is consulted, so `spawn('npm')` needs `npm.cmd` spelled out.
- B02 P: MSVC-style quoting in `argsToCommandLine`, but an argument that starts and ends with a quote is treated as already quoted (not round-trip exact) and `.cmd/.bat` get no cmd.exe-aware escaping.
- B04 P: Windows spawn failure is a plain `File not found: <path>` error; no typed classes.
- B05 P: caller passes a complete env object (default process.env); no merge/remove helpers, no Windows case-folding.
- B06/B07 N: a PTY has one merged stream; unread output fills the kernel buffer and blocks the child (node-pty offers pause/resume flow control only).
- B16 P: `onExit({exitCode, signal})`; no cross-OS normalization.
- B20 P: 'exit' is deferred until the output socket closes ([windowsTerminal.ts][np_wt], [unixTerminal.ts][np_ut]), with a destroy-timeout fallback on Unix; no documented no-loss guarantee.
- B21 P: Windows `kill()` terminates every PID in the console process list (when not using the conpty DLL); Unix `kill()` sends SIGHUP to the root pid only.
- No run-and-collect, timeout, cancel, scope-exit, host-exit or sandbox features (B08-B15, B17, B22 N/?).

### execa

- **Languages:** TypeScript/JS (Node >=22, ESM). **OS:** Windows, macOS, Linux.
- **Latest release:** 10.0.1 2026-07-31. **Maintenance:** active (push 2026-07-31), not archived, 7.6k stars. **CI on 3 OS:** Y (ubuntu, macos, windows) ([workflow files][ex_ci]).
- **Coverage:** 45.5% strict (5Y + 10P), 45.5% any-OS.
- B01 Y: resolves bare names through PATHEXT itself (`which-command`), plus shebang support, so `npm` runs `npm.cmd` with no shell.
- B02 P: for `.cmd/.bat` it wraps in `cmd.exe /d /s /c` with caret + qntm-style escaping and double-escaping for cmd-shims; it rejects CR/LF in arguments on Windows (safe, but not exact round-trip).
- B03 Y: `resolvePath` resolves relative programs against the `cwd` option on Windows; cwd is normalised to an absolute path and invalid-cwd errors are rewritten to be actionable ([cwd.js][ex_cwd]).
- B04 P: a single `ExecaError` with flags (`failed`, `timedOut`, `isCanceled`, `isMaxBuffer`, `isTerminated`, `code`); not distinct classes for not-found / not-executable / invalid-cwd.
- B05 P: `env` + `extendEnv:false` give merge and clean; Windows PATH/PATHEXT lookup is case-insensitive in `resolvePath`; removing a single inherited variable is not documented.
- B06 Y: separate streams/iterables; `StringDecoder` used for decoding.
- B07 P: `maxBuffer` (default 100 MB) bounds memory, but overflow fails the run with `isMaxBuffer` (truncated output kept) rather than counting drops; with `buffer:false` an unread stream applies backpressure to the child.
- B08 P: input via `input`/`stdin` option or `subprocess.stdin`; behaviour of writes after child exit is not documented.
- B09 ?: grandchild-holds-pipe behaviour is not documented.
- B10 P: timeout + maxBuffer yes; stdin defaults to `'inherit'` with `$` and `'pipe'` otherwise (not closed by default).
- B11 P: opt-in `killDescendants` - Unix: own process group + `kill(-pid)`; Windows: `taskkill /pid /T /F`, which needs the root alive (code comment: killing the root first would orphan descendants). setsid/own-group escapees are not reached (documented).
- B12 P: SIGTERM then SIGKILL after `forceKillAfterDelay` (5 s) on Unix; the option is a no-op on Windows (windows.md).
- B13/B14 Y (opt-in): timeout and `cancelSignal` route through the same kill function, so they reach the tree only when `killDescendants:true`.
- B15 N: no `await using`/dispose support found in docs or lib.
- B16 P: `exitCode`, `signal`, `isTerminated`, `timedOut`; windows.md: only SIGTERM, SIGKILL, SIGINT and SIGQUIT work on Windows and `forceKillAfterDelay` is a no-op there, so the result is not identical across OS.
- B17 P: `cleanup:true` kills the child (and descendants with `killDescendants`) on normal exit/SIGTERM; not on abrupt death (documented).

### tree-kill

- **Languages:** JS (Node). **OS:** Windows (`taskkill /T /F`), macOS (`pgrep -P`), Linux (GNU `ps --ppid`).
- **Latest release:** 1.2.2 2019-12-11. **Maintenance:** dormant (last push 2020-06-17), not archived, 359 stars. **CI on 3 OS:** ?.
- **Coverage:** 2.3% strict (0Y + 1P), 2.3% any-OS.
- B11 P ([repo][tk_rd]): snapshot walk (ps/pgrep recursion) then kill; races with forks; nothing to find once the root has exited on Unix; Windows delegates to `taskkill /T /F`. Single signal, no escalation, no timeout/cancel API; everything else N.

### cross-spawn

- **Languages:** JS (Node). **OS:** Windows parity layer; passthrough on Unix.
- **Latest release:** 7.0.6 2024-11-18. **Maintenance:** low activity (last push 2024-11-18), not archived, 1.2k stars. **CI on 3 OS:** ? (Linux matrix in ci.yaml; AppVeyor badge for Windows).
- **Coverage:** 13.6% strict (1Y + 4P), 13.6% any-OS.
- B01 Y: `which` + PATHEXT resolution; shebang detection ([parse.js][xs_parse]).
- B02 P: non-.exe/.com files are run through `cmd.exe /d /s /c` with caret-escaping (qntm algorithm); no documented guarantee that every argument round-trips (cmd `%`/`!` expansion).
- B03 P: `resolveCommand` temporarily `process.chdir()`s to the custom cwd to resolve; not available in worker threads.
- B04 P: only Windows ENOENT parity (`enoent.js`).
- B05 P: case-insensitive PATH key lookup (`path-key`); no merge/remove helpers. Thin wrapper: B06-B22 N.

### zx

- **Languages:** JS/TS (Node >=12.17, Bun, Deno). **OS:** Linux, macOS, Windows (needs Bash or PowerShell).
- **Latest release:** 8.8.5 2025-10-19. **Maintenance:** active (push 2026-08-14), not archived, 45.8k stars. **CI on 3 OS:** ?.
- **Coverage:** 18.2% strict (0Y + 8P), 18.2% any-OS.
- B01 P / B02 N: commands go through a shell (`shell:true`, bash or PowerShell) and are quoted with `quote()`; that is the opposite of 'no shell' and PATHEXT behaviour is whatever the chosen shell does.
- B04 P: nonexistent cwd is reported with a clear message; no typed spawn errors.
- B05 P: `$.env` object (defaults to process.env); no remove/clean helpers.
- B10 P: `timeout` option; stdio default `pipe`; no output cap.
- B11 P: `kill()` = `taskkill /pid /t /f` on Windows, `ps.tree` + `kill(-pid)` on Unix (snapshot-based).
- B13/B14 P: timeout and AbortSignal call `kill`; `signal` is also passed to `spawn`, which signals only the root.
- B16 P: `ProcessOutput.exitCode/signal`. B03, B06-B09, B15 unverified (?); B12, B17-B22 N.

### @anthropic-ai/sandbox-runtime

- **Languages:** TypeScript (CLI + library). **OS:** macOS (Seatbelt), Linux (bubblewrap), Windows (alpha).
- **Latest release:** 0.0.78 2026-09-30. **Maintenance:** active (push 2026-10-01), pre-1.0, 5.4k stars; not archived (GitHub flag). **CI on 3 OS:** ?.
- **Coverage:** 2.3% strict (0Y + 1P), 2.3% any-OS.
- B22 P: all three OS are present but Windows is labelled alpha: it needs a one-time elevated `windows-install` (UAC), runs the child as a dedicated `srt-sandbox` local user with WFP egress block + NTFS ACEs, per-user tool installs are not reachable, per-exec allow overrides throw, and DNS via the system resolver is not fenced.
- Library surface is `SandboxManager.wrapWithSandbox(cmdString)` returning a shell command string that the caller spawns (`shell:true` in its own example); no lifecycle, PTY, streaming or kill features (B01-B21 N).

### Node.js permission model

- **Languages:** Node.js. **OS:** all Node platforms.
- **Latest release:** documented 'Stability 2 - Stable'. **Maintenance:** part of Node.js; not archived (GitHub flag). **CI on 3 OS:** n/a.
- **Coverage:** 0.0% strict (0Y + 0P), 0.0% any-OS.
- B22 N: the docs call it a 'seat belt' for trusted code that gives no guarantees against malicious code; it restricts the Node process (fs, net, env, child_process, workers...). A child that is allowed to spawn is not itself confined. No process-lifecycle features.

### Deno (Deno.Command + permissions)

- **Languages:** TypeScript (Deno). **OS:** Windows, macOS, Linux.
- **Latest release:** v2.9.7 2026-09-17. **Maintenance:** active (push 2026-10-01), not archived. **CI on 3 OS:** n/a.
- **Coverage:** 20.5% strict (0Y + 9P), 20.5% any-OS.
- B05 P: `env` + `clearEnv`; no remove helper. B06 P: separate `ReadableStream<Uint8Array>`s; decoding is left to the caller.
- B10 P: `output()` collects; there is no `timeout`/`maxBuffer` option and stdin defaults to `inherit`.
- B13/B14 P: `AbortSignal` (incl. `AbortSignal.timeout`) sends SIGTERM to the child only; `process_group(0)` + group kill exists only in the node:child_process compat path with a timeout.
- B15 P: `[Symbol.asyncDispose]` sends SIGTERM and awaits the child (child only).
- B17 P: `ChildResource` drop kills the child by pid (SIGKILL / Windows `process_kill`); `unref`/`detached` opt out; no tree.
- B22 N: subprocesses 'run independently from the permissions granted to the parent' (permissions doc). B01-B04, B07, B09 not documented (?).

### Bun.spawn

- **Languages:** TypeScript (Bun). **OS:** Windows, macOS, Linux.
- **Latest release:** bun-v1.4.2 2026-09-05. **Maintenance:** active (push 2026-10-01); not archived (GitHub flag). **CI on 3 OS:** n/a.
- **Coverage:** 27.3% strict (2Y + 8P), 27.3% any-OS.
- B05 P: `env: {...process.env, X}` (caller-side merge). B06 P: ReadableStreams, decoding left to caller. B08 P: `stdin:'pipe'` FileSink write/flush/end.
- B10 P: `timeout`/`killSignal` and an `await proc.exited` flow; `maxBuffer` exists for `spawnSync` only; stdin defaults to undefined (no input).
- B13/B14 P: `timeout` and `signal` kill the child; no tree semantics documented.
- B16 P: `exitCode`/`signalCode`.
- B18 Y / B19 Y: `terminal` option = openpty on Linux/macOS, ConPTY on Windows; write/resize/ref/close; the doc lists real divergences (no termios on Windows, ConPTY re-encodes output, no SIGWINCH to libuv children).
- B20 P: `exit` callback is PTY EOF/lifecycle; on Windows before 11 24H2 `terminal.close()` may not terminate a running child promptly (documented).
- B21 N: only the attached process can be killed; no tree.
- B17 ?: 'the parent bun process does not terminate until all child processes have exited' (different semantics, not cleanup). B01-B04, B07, B09, B15 not documented (?). Linux-only `cgroup` option exists.

### Python subprocess + asyncio.subprocess

- **Languages:** Python (stdlib). **OS:** Windows, macOS, Linux.
- **Latest release:** stdlib (docs 3.14.x). **Maintenance:** active (CPython push 2026-10-01); not archived (GitHub flag). **CI on 3 OS:** n/a.
- **Coverage:** 18.2% strict (0Y + 8P), 18.2% any-OS.
- B01 N / B03 N: docs state that executable resolution is platform dependent; on Windows with shell=False `cwd` does not override the lookup directory and `env` cannot override PATH; use `shutil.which` or a full path.
- B02 P: argv lists are safe (no shell), but 'batch files (*.bat or *.cmd) may be launched by the operating system in a system shell regardless of the arguments', so arguments are parsed by shell rules without escaping.
- B04 P: OS exceptions (FileNotFoundError, PermissionError, NotADirectoryError) + SubprocessError; not uniform across OS.
- B05 P: `env` mapping; see the Windows PATH caveat above.
- B06 P: separate pipes, `text=True` decoding, asyncio streams.
- B07 N: unread pipes block the child (the docs steer to `communicate()`).
- B08 P: stdin write/close; broken pipe raises an exception.
- B10 P: `run(capture_output, timeout, input)` kills the child on timeout; stdin inherited by default; capture unbounded.
- B11 N: `Popen.kill()` signals the child only (Windows `kill` = `terminate`); `process_group` is POSIX-only.
- B12 N / B15 N (`with Popen` waits, does not kill) / B17 N / B18-B22 N. B09, B14 ?.

### pexpect

- **Languages:** Python. **OS:** Unix only for PTY (Linux, macOS); Windows only PopenSpawn (pipes).
- **Latest release:** 4.9.0 2023-11-25. **Maintenance:** low activity (push 2025-04-11), not archived, 2.9k stars. **CI on 3 OS:** ?.
- **Coverage:** 0.0% strict (0Y + 0P), 13.6% any-OS.
- 'pexpect.spawn and pexpect.run() are not available on Windows, as they rely on Unix pseudoterminals' (overview) - so every PTY cell is capped at 2 of 3 OS and scores 0 in the strict column.
- B18/B19: get/setwinsize, sendcontrol, sendintr (api). B12 P†: `terminate(force)` = SIGHUP, SIGINT, then SIGKILL. B21 P†: child only; no statement about grandchildren.

### pywinpty

- **Languages:** Python (PyO3 over Rust `winpty-rs`). **OS:** Windows only (ConPTY + winpty fallback).
- **Latest release:** 3.0.5 2026-06-10. **Maintenance:** active (push 2026-06-23), not archived, 165 stars. **CI on 3 OS:** Windows-only CI.
- **Coverage:** 0.0% strict (0Y + 0P), 9.1% any-OS.
- B18 Y†/B19 Y†: `isatty`, `setwinsize`, `sendintr`, read/write on `PtyProcess`; Windows only (PyPI classifier, [README][pw_rd]). EOF/exit and tree-kill behaviour not documented.

### ptyprocess

- **Languages:** Python. **OS:** Unix only (Linux, macOS).
- **Latest release:** 0.7.0 2020-12-28. **Maintenance:** stale release (5.8 y); repo still receives commits (push 2026-08-26); not archived. **CI on 3 OS:** ?.
- **Coverage:** 0.0% strict (0Y + 0P), 11.4% any-OS.
- PyPI classifiers: POSIX / macOS only; see the [README][pp_rd]. `getwinsize/setwinsize`, `sendintr`, `sendeof`, `terminate(force)`, `kill(sig)` exist; terminate/kill address the child pid; no tree semantics.

### psutil

- **Languages:** Python (C extension). **OS:** Windows, macOS, Linux (+BSD, Solaris, AIX).
- **Latest release:** 7.2.2 2026-01-28. **Maintenance:** active (push 2026-10-01), 11.3k stars; not archived (GitHub flag). **CI on 3 OS:** Y (large matrix).
- **Coverage:** 4.5% strict (0Y + 2P), 4.5% any-OS.
- B11 P / B12 P: the documented `kill_proc_tree` recipe = `children(recursive=True)`, signal bottom-up, `wait_procs(timeout)`, then kill survivors; snapshot-based (races), and after the root has exited on Unix its children are re-parented. A recipe, not an API for timeout/cancel/scope-exit.

### Rust std::process

- **Languages:** Rust. **OS:** Windows, macOS, Linux (tier-1).
- **Latest release:** Rust 1.99.0 2026-10-01. **Maintenance:** active; not archived (GitHub flag). **CI on 3 OS:** n/a.
- **Coverage:** 15.9% strict (0Y + 7P), 15.9% any-OS.
- B01 N: on Windows 'the .exe extension may be omitted. Files with other extensions must include the extension'.
- B02 P: `.bat` goes through cmd.exe with escaping ([source][rs_src]); 'it might not be possible to safely escape some special characters' and spawn then returns an error.
- B03 N: for a relative program plus `current_dir` the behaviour is 'platform specific and unstable'.
- B05 P: Windows env names are case-insensitive, but after `env_clear/env_remove` of PATH Windows still searches the parent PATH 'unlike on Unix'.
- B04/B06/B08/B10/B16 P: io::ErrorKind, byte pipes, ChildStdin, `output()` (stdin not inherited), ExitStatus - no unified cross-OS result.
- B07 N / B11 N (`Child::kill` = one process) / B12-B15, B17-B22 N; B09 ?.

### tokio::process

- **Languages:** Rust. **OS:** Windows, macOS, Linux.
- **Latest release:** tokio 1.53.1 2026-07-20. **Maintenance:** active; not archived (GitHub flag). **CI on 3 OS:** n/a.
- **Coverage:** 18.2% strict (0Y + 8P), 18.2% any-OS.
- Same semantics as std (it wraps `std::process::Command`). B05 P: docs note Windows env names are case-insensitive. B15 P: `kill_on_drop(true)` kills the direct child only; zombie reaping is 'best-effort'. No tree kill, graceful escalation, timeout, PTY or sandbox.

### portable-pty (wezterm)

- **Languages:** Rust. **OS:** Windows (ConPTY), macOS, Linux.
- **Latest release:** 0.9.0 2025-02-11 (crates.io). **Maintenance:** repo active (push 2026-09-29); crate release 20 months old; wezterm last tagged release 2024-02-03; not archived (GitHub flag). **CI on 3 OS:** ?.
- **Coverage:** 29.5% strict (4Y + 5P), 29.5% any-OS.
- B01 Y: Windows search honours PATHEXT (`cmdbuilder.rs`). B05 Y: env keys are case-folded on Windows. B03 P: `search_path` anchors cwd-relative programs to `cwd`.
- B04 P: distinct error strings for not found / not executable / is a directory (anyhow, untyped).
- B08 P: `take_writer`, dropping it sends EOF. B12 P: Unix `kill()` = SIGHUP, grace, then SIGKILL (child only). B16 P: portable ExitStatus.
- B18/B19 Y: `PtySize`, resize, writer; Ctrl-C is a written 0x03. B20 ?: no ConPTY EOF handling seen beyond `ClosePseudoConsole` on drop. B21 N: kills the child, not the tree.

### process-wrap

- **Languages:** Rust (std + Tokio frontends). **OS:** Windows (JobObject), POSIX (ProcessGroup/Session); PTY feature POSIX only.
- **Latest release:** 10.0.1 2026-09-23. **Maintenance:** active (push 2026-10-01), not archived, 48 stars. **CI on 3 OS:** Y (macos, ubuntu, windows) ([workflow files][pw2_ci]).
- **Coverage:** 11.4% strict (1Y + 3P), 22.7% any-OS.
- B11 Y: JobObject (suspended spawn, assign, resume) on Windows; process group/session on POSIX; 'doesn't implement a single cross-platform API' - the caller picks wrappers per platform.
- B12 P: `signal()` on POSIX and `start_kill`, no built-in graceful-then-forced policy. B15 P: the Job Object gets KILL_ON_JOB_CLOSE only when the `KillOnDrop` wrapper is also applied (windows.rs), and on POSIX `KillOnDrop` is Tokio's direct-child behaviour that 'does not promise to kill an entire group'. B17 P: only the Windows job survives abrupt death.
- B18/B19 Y†: Tokio PTY transport (`pty` feature) on Linux/Android/macOS/BSD only; merges stdout/stderr; macOS needs concurrent draining. No Windows ConPTY.

### command-group

- **Languages:** Rust. **OS:** Windows (job object), POSIX (process group).
- **Latest release:** 5.0.1 2023-11-18. **Maintenance:** deprecated ('use process-wrap'); not archived; last push 2024-04-21. **CI on 3 OS:** ?.
- **Coverage:** 11.4% strict (1Y + 3P), 11.4% any-OS.
- Predecessor of process-wrap with one cross-platform `group_spawn()`; README: 'No further work will be done on command-group'.
- B12 P: `signal()` exists on Unix only (unix_ext.rs), no escalation policy. B15/B17 P: Windows Job Object gets KILL_ON_JOB_CLOSE only when `kill_on_drop(true)` is set (Tokio frontend); the whole-tree kill otherwise needs an explicit call.

### duct

- **Languages:** Rust (and a Python port, duct.py). **OS:** Windows, macOS, Linux.
- **Latest release:** 1.1.2 2026-09-03. **Maintenance:** active, 1.0k stars; not archived (GitHub flag). **CI on 3 OS:** ?.
- **Coverage:** 20.5% strict (1Y + 7P), 20.5% any-OS.
- B03 Y: documents the Unix-vs-Windows difference for relative exe paths and canonicalizes them when `dir` is used so Windows behaviour applies everywhere.
- B05 P: env functions 'do whatever the platform does with respect to case sensitivity' (so `env_remove("foo")` removes FOO on Windows only).
- B07 P: capture threads drain pipes, but unbounded. B09 N: documented hazard - after `kill`, `wait` can hang if a grandchild inherited the pipes.
- B11 N: `Handle::kill` does not kill grandchildren (documented). B12-B15, B17-B22 N. B01/B02 not documented (?).

### processkit (Rust crate)

- **Languages:** Rust (tokio). **OS:** Windows (x64+ARM64), macOS, Linux (glibc x64/ARM64, musl), FreeBSD.
- **Latest release:** 3.3.4 2026-08-22 (first release 2026-05-31; 55 versions). **Maintenance:** active (push 2026-09-29), 42 stars, ~39k downloads, one principal maintainer (ZelAnton 958 commits; TESTPERSONAL 201); not archived (GitHub flag). **CI on 3 OS:** Y (ubuntu x64/arm, windows x64/arm64, macos, musl container, FreeBSD VM) ([workflow files][pk_ci]).
- **Coverage:** 81.8% strict (16Y + 4P), 81.8% any-OS.
- B01 Y: resolves bare names across PATH x PATHEXT itself (including `.cmd/.bat`), with a spawn-free `resolve_program` preflight (project [README][pk_rd]).
- B02 P: argv array, no shell, 'no injection surface'; `.cmd/.bat` are spawned by resolved path through Rust std (cmd.exe escaping rules above); no test of exotic argument round-trips was found (one `.cmd` shim test with exit 0).
- B03 N: stated non-goal - the program name reaches the OS verbatim and 'whether `Command::new("./tool").current_dir(dir)` resolves relative to dir is the platform's behavior (Unix: yes; Windows: the parent's directory may win)'.
- B04 Y: `ErrorReason::NotFound{searched}`, `Spawn`, permission/transient classifiers, `OutputTooLarge`, `Cancelled`, `Unsupported`.
- B05 Y: `env`, `env_remove`, `env_clear`, `inherit_env` allow-list; Windows keys compared case-insensitively (`WindowsEnvKey`).
- B06 Y: decoded lines per stream via a persistent `encoding_rs` decoder; any encoding, UTF-16 safe.
- B07 Y: 'the pipe is always fully drained, so the child never blocks'; `OutputBufferPolicy` bounded/DropOldest/DropNewest/fail_loud, over-cap lines counted, `truncated()` flag.
- B08 Y: `ProcessStdin::write/finish`; BrokenPipe after exit is an `Err`, never a panic.
- B09 Y: pipes drained to EOF; 'a leaked pipe held open past the child's death is cut off after a bounded teardown grace'; ConPTY EOF handled in `sys/pty/windows.rs`.
- B10 Y: stdin is closed at spawn by default; timeouts, buffer policies, `ProcessResult` with `timed_out`.
- B11 Y: Windows Job Object (suspended-spawn handshake), Linux cgroup v2 (fallback process group), macOS process group; descendants that call `setsid` escape the macOS/pgroup mechanisms (documented, mechanism reported via `mechanism()`), the same escape hatch every non-kernel approach has.
- B12 P: TERM -> grace -> KILL on Unix; on Windows a windowless child collapses to the atomic Job kill unless `windows_graceful_ctrl_break()` is opted into (console children only) or the child has windows (`WM_CLOSE`).
- B13/B14/B15 Y: `timeout` ('kills the whole process tree'), `cancel_on(token)` (+ optional `cancel_grace`), drop of future/handle/group; documented gap: per-run timeout/cancel inside a shared `ProcessGroup` reaches only that run's direct child (an own-group run tears down the whole tree).
- B16 P: `Outcome::{Exited, Signalled, TimedOut}` + `ErrorReason::Cancelled`; on Windows termination is `Exited(1)`, never `Signalled` (documented 'D18').
- B17 P: normal exit/panic/`?` drop reaps the tree; abrupt owner death is whole-tree only on Windows, direct-child-only on Linux (`PR_SET_PDEATHSIG`, thread-scoped), unsupported on macOS; a Ctrl-C handler must be wired by the app (`cancel_on`).
- B18-B21 Y: `use_pty()` = openpty / ConPTY, `pty_size`, `resize_pty`, `send_control('c')`, same containment path as pipes (Job Object / cgroup / pgroup). PTY output is merged; ConPTY has no echo control or SIGWINCH.
- B22 N: 'processkit is not a sandbox'; offers cgroup/Job Object resource limits (memory, process count, CPU) only, and only where the kernel allows (cgroup-v2 root on Linux; none on macOS).
- Languages: only Rust ships from this repo; a Python binding is listed separately (next row). No npm package: the processkit-py [ROADMAP][pkpy_road] says `processkit` is reserved on npm as a courtesy, 'no package planned'. Other-language siblings (Go, Kotlin, F#) exist as repos but are template-stage.

### processkit-py (PyPI, import processkit)

- **Languages:** Python 3.10+ (PyO3, abi3 wheels; free-threaded 3.14t wheel). **OS:** Windows (x64, ARM64), macOS, Linux (x64, ARM64).
- **Latest release:** 1.5.0 2026-08-08 (repo created 2026-06-07). **Maintenance:** active (push 2026-10-01), 4 stars, same principal maintainer as processkit (ZelAnton 671 commits); not archived (GitHub flag). **CI on 3 OS:** Y (ubuntu x64/arm, windows x64/arm64, macos) ([workflow files][pkpy_ci]).
- **Coverage:** 81.8% strict (16Y + 4P), 81.8% any-OS.
- Thin typed Python layer over the same native Rust core, so cell values mirror the Rust row; Python-surface parity was read from the README/docs (PATHEXT, `env_clear`, `send_control('c')`, `resize_pty`, `task.cancel()` reaps the tree, `with`/`async with` reap) and not executed.
- B17 P: 'surviving a hard kill of the Python process itself is a Windows-only property'; 'lean on the context managers, not __del__/atexit'.
- B20 Y: relies on the shared core's ConPTY EOF handling (indirect evidence).
- B22 N: the sandboxing guide is a composition of resource limits + env + timeout and states what it does not buy; no fs/network confinement.

### tokio-process-tools

- **Languages:** Rust (tokio). **OS:** Windows, macOS, Linux (code paths for all three; CI is ubuntu-only).
- **Latest release:** 0.11.2 2026-05-15 (repo created 2025-01-05). **Maintenance:** low activity (push 2026-05-15), 6 stars; not archived (GitHub flag). **CI on 3 OS:** N (all 7 workflow jobs run on ubuntu-latest) ([workflow files][tpt_ci]).
- **Coverage:** 31.8% strict (3Y + 8P), 31.8% any-OS.
- B07 P: `lossy_without_backpressure()` never pauses the reader and bounded collectors exist, but drop counting is not documented. B06 P: raw chunk streams + line parser; UTF-8 handling not documented.
- B09 Y: output EOF timeout (`DEFAULT_OUTPUT_EOF_TIMEOUT`, 3 s) on every wait. B12/B13 Y: `GracefulShutdown` (SIGTERM then SIGKILL; Windows CTRL_BREAK then `TerminateJobObject`), `wait_for_completion(timeout).or_terminate`.
- B11 P: new process group on Unix; on Windows a Job Object assigned after spawn (tokio does not expose CREATE_SUSPENDED), so grandchildren forked in the gap escape (documented).
- B15/B17 P: dropping an armed handle runs best-effort cleanup and then panics (by design). No cancellation token, PTY, sandbox, PATHEXT or cwd handling.

### @a5omic/kill-tree

- **Languages:** TypeScript/JS (Node >=18, no native addon). **OS:** Linux, macOS, Windows (CI on all three per README).
- **Latest release:** 0.1.1 2026-08-28 (package created 2026-08-28). **Maintenance:** new, 0 stars; not archived (GitHub flag). **CI on 3 OS:** Y (README: Linux, macOS, Windows CI).
- **Coverage:** 4.5% strict (0Y + 2P), 4.5% any-OS.
- Snapshot-and-signal leaf-first with PID identity checks, grace period and escalation (SIGTERM -> SIGKILL), structured `TerminationReport`. Windows 'containment is honestly reported as snapshot; there is no hidden native Job Object addon'; a process that daemonizes between snapshots can escape. `spawnGuarded` adds a POSIX process group. Windows signals are 'not POSIX-equivalent'.

### kill_tree (Rust crate)

- **Languages:** Rust (sync + tokio) and CLI. **OS:** Windows, macOS, Linux.
- **Latest release:** 0.2.4 2024-02-12. **Maintenance:** dormant (last push 2024-04-07), 22 stars; not archived (GitHub flag). **CI on 3 OS:** ?.
- **Coverage:** 2.3% strict (0Y + 1P), 2.3% any-OS.
- Native-API process-tree walk and kill 'operating independently of other commands like kill or taskkill'; snapshot-based; kill only (no timeout/cancel/graceful policy).

### subprocess (Rust crate)

- **Languages:** Rust. **OS:** Linux, macOS, Windows ('tested on' all three).
- **Latest release:** 1.2.1 2026-08-05. **Maintenance:** active, 452 stars; not archived (GitHub flag). **CI on 3 OS:** ?.
- **Coverage:** 13.6% strict (0Y + 6P), 13.6% any-OS.
- Deadlock-free `capture()`/`communicate()` with optional time and size limits, `wait_timeout` + `terminate()` recipe, its own `ExitStatus` enum (Exited/Signaled/Other/Undetermined), `setpgid` on Unix. No tree kill, no PATHEXT/cwd normalization documented.

### a3s-sandbox

- **Languages:** Rust (tokio). **OS:** macOS (Seatbelt), Linux (bubblewrap+seccomp), Windows (AppContainer + ACLs + Job Object; needs PowerShell 7).
- **Latest release:** 0.2.0 2026-09-25. **Maintenance:** active (push 2026-09-28), 2 stars; not archived (GitHub flag). **CI on 3 OS:** Y (ubuntu-latest, macos-14, windows-latest).
- **Coverage:** 15.9% strict (2Y + 3P), 15.9% any-OS.
- B22 Y: network and host sockets denied, writes limited to workspace + scratch, credentials protected, 'Gate 0 ... shipped and tested on macOS, Linux, and Windows'; default policy is fail-closed.
- B13 Y: 'deadlines terminate the complete descendant tree'; B11 P: tree-wide guarantees stated, behaviour after root exit not described. B06 P: `OutputObserver` live deltas, separate stdout/stderr; B10 P: `exec_command` returns bounded (100 KiB) `CommandOutput` with `timed_out`.
- Command-string oriented (`exec_command("echo ...")`; PowerShell 7 on Windows), Windows executions are serialized; no PTY, PATHEXT, argv/escaping, stdin or cancellation API documented.

### zerobox (Rust crate, npm, PyPI)

- **Languages:** Rust, TypeScript and Python SDKs ('consistent API across languages'). **OS:** macOS (Seatbelt), Linux (bubblewrap+seccomp); Windows 'planned'.
- **Latest release:** 0.3.3 2026-05-17. **Maintenance:** no commits since 2026-05-17 (4.5 months), 718 stars; not archived (GitHub flag). **CI on 3 OS:** ?.
- **Coverage:** 0.0% strict (0Y + 0P), 4.5% any-OS.
- Repackages OpenAI Codex's sandbox runtime behind a CLI and three SDKs; the only candidate with sandbox SDKs in all three target languages, but Windows is not shipped (platform table: 'Planned'). No lifecycle/PTY features.

### agentbox (Go)

- **Languages:** Go. **OS:** macOS (Seatbelt), Linux (namespaces + Landlock), Windows (restricted token + Job Object + ACLs); all marked beta.
- **Latest release:** no releases (repo created 2026-02-16). **Maintenance:** last push 2026-04-09, 7 stars (read via mirror Alan-123185/agentbox); not archived (GitHub flag). **CI on 3 OS:** ?.
- **Coverage:** 2.3% strict (0Y + 1P), 2.3% any-OS.
- B22 P: three OS claimed 'Tested (beta)' with a pre-1.0 API; Go only, so outside the three target languages. Not source-audited.

### trexec (Go)

- **Languages:** Go. **OS:** Linux, macOS, Windows.
- **Latest release:** no releases (repo created 2026-08-22, one day of commits). **Maintenance:** 1 star; not archived (GitHub flag). **CI on 3 OS:** ? (badge only).
- **Coverage:** 29.5% strict (4Y + 5P), 29.5% any-OS.
- README claims only (source not audited): process group / Job Object tree ownership, two-phase graceful-then-force kill, context cancellation, interactive I/O streaming, PR_SET_PDEATHSIG on Linux. Go is outside the three target languages.

### bun-pty

- **Languages:** TypeScript (Bun, FFI to Rust portable-pty). **OS:** Windows, macOS, Linux ('fully supported').
- **Latest release:** 0.4.11 2026-09-30 (package created 2025-05-14). **Maintenance:** active, 72 stars; not archived (GitHub flag). **CI on 3 OS:** ?.
- **Coverage:** 9.1% strict (2Y + 0P), 9.1% any-OS.
- Thin wrapper over portable-pty, so it inherits that crate's gaps (no tree kill, EOF behaviour unverified). Bun only.

### zigpty

- **Languages:** TypeScript (Node drop-in for node-pty; Zig core; also a Zig package). **OS:** Linux, macOS, Android, Windows (ConPTY).
- **Latest release:** 0.2.1 2026-06-22 (package created 2026-03-21). **Maintenance:** active, 128 stars; not archived (GitHub flag). **CI on 3 OS:** ?.
- **Coverage:** 9.1% strict (2Y + 0P), 9.1% any-OS.
- `resize`, `kill(signal)` (default SIGHUP), terminal callbacks; EOF and tree-kill behaviour not documented in the README.

## 7. Seen in the searches but not scored

- **fkill (npm 10.0.3, 2026-01-14)** - kill-by-name/pid CLI/library with a `tree` option; tree-kill class, not read in depth.
- **ps-tree, @apify/ps-tree, pidtree (1.0.0 2026-06-08), simple-tree-kill, @magda/tree-kill, taskkill, kill-with-style, kill-port** - snapshot-walk or taskkill helpers (npm); same class as tree-kill; not scored.
- **@lydell/node-pty (1.2.0-beta.15, 2026-08-08), node-pty-prebuilt-multiarch (2022), @theia/node-pty (2020)** - node-pty distributions/forks; same behaviours as node-pty.
- **winpty-rs 1.0.6 (2026-06-10), conpty 0.7.0, rust-pty/rust-expect 0.6.1 (2026-09-13), expectrl 0.9.0 (README: 'works on windows'), rexpect 0.7.1, pty-process 0.5.3, xpty 0.3.6, nativelite-pty** - Rust PTY crates; PTY-only (B18-B21 class); not scored in depth.
- **procciao, ofenaus (PyPI)** - ad-hoc Windows-oriented kill/timeout helpers (last releases 2024/2023); not libraries to build on.
- **anyio, trio, sh (PyPI)** - Python subprocess front-ends on the same OS primitives as stdlib; not scored.
- **foreground-child (npm), horust (Rust, Linux init/supervisor), UltimateProcessKiller (C#)** - adjacent, not matching the brief.
- **@deepseek-ai/dsh-win32-process, dsh-sandbox-local (npm, 2026-08)** - pre-release internal packages of one agent harness (Win32 Job Object primitives, bwrap backend); read only via the npm search description.
- **OpenAI Codex workspace crates (windows-sandbox-rs, linux-sandbox, sandboxing, process-hardening in openai/codex)** - no standalone crate surfaced in the crates.io search 'codex sandbox'; zerobox repackages Codex's sandbox runtime (its README).
- **Docker Sandboxes, E2B, OpenSandbox, sandbox0, sandboxai, agent-sandbox.nix, Agent Safehouse** - container/VM or macOS/Linux-only wrappers found via the sandbox search; different product class (not an in-process 3-OS child sandbox); not read.

## 8. Limits of this survey

- Documentation- and source-based only: nothing was installed or run, so every Y is 'documented/implemented', not 'verified identical'. Where a CI matrix is missing or Linux-only (tokio-process-tools is ubuntu-only), the cell is still scored from the docs but flagged in the CI column.
- processkit was read most deeply because it is the closest match: its README, platform-support, commands, streaming, timeouts, process-group and untrusted-children docs, plus `src/sys/pty/windows.rs`, `src/stdin.rs`, `src/command.rs` and the CI workflow. processkit-py parity was read from its README and docs only.
- processkit is young: first crates.io release 2026-05-31, 55 versions in under four months, 42 stars, ~39k downloads, one maintainer; processkit-py is from 2026-06-07. Its docs are unusually explicit about gaps, which is why its P/N cells are specific rather than hidden.
- Some small or new projects (agentbox, trexec, zerobox's Windows plans, a5omic/kill-tree) were scored from README claims without auditing source.
- Search-result snippets were used only to discover candidates; every scored cell rests on a document or source file read directly.

## References

[a3s_rd]: https://github.com/A3S-Lab/Sandbox/blob/main/README.md
[a5_rd]: https://github.com/Atomics-hub/kill-tree/blob/main/README.md
[ab_rd]: https://github.com/Alan-123185/agentbox/blob/main/README.md
[bp_rd]: https://github.com/sursaone/bun-pty
[bun_doc]: https://github.com/oven-sh/bun/blob/main/docs/runtime/child-process.mdx
[cg_rd]: https://github.com/watchexec/command-group/blob/main/README.md
[cg_unix]: https://github.com/watchexec/command-group/blob/main/src/unix_ext.rs
[cg_win]: https://github.com/watchexec/command-group/blob/main/src/winres.rs
[dn_dts]: https://github.com/denoland/deno/blob/main/cli/tsc/dts/lib.deno.ns.d.ts
[dn_js]: https://github.com/denoland/deno/blob/main/ext/process/40_process.js
[dn_perm]: https://docs.deno.com/runtime/reference/permissions/
[dn_proc]: https://github.com/denoland/deno/blob/main/ext/process/lib.rs
[du_lib]: https://github.com/oconnor663/duct.rs/blob/master/src/lib.rs
[du_rd]: https://github.com/oconnor663/duct.rs/blob/master/README.md
[ex_api]: https://github.com/sindresorhus/execa/blob/main/docs/api.md
[ex_cf]: https://github.com/sindresorhus/execa/blob/main/lib/arguments/command-file.js
[ex_ci]: https://github.com/sindresorhus/execa/blob/main/.github/workflows/main.yml
[ex_cwd]: https://github.com/sindresorhus/execa/blob/main/lib/arguments/cwd.js
[ex_enc]: https://github.com/sindresorhus/execa/blob/main/lib/transform/encoding-transform.js
[ex_err]: https://github.com/sindresorhus/execa/blob/main/docs/errors.md
[ex_in]: https://github.com/sindresorhus/execa/blob/main/docs/input.md
[ex_kd]: https://github.com/sindresorhus/execa/blob/main/lib/terminate/kill-descendants.js
[ex_out]: https://github.com/sindresorhus/execa/blob/main/docs/output.md
[ex_term]: https://github.com/sindresorhus/execa/blob/main/docs/termination.md
[ex_win]: https://github.com/sindresorhus/execa/blob/main/docs/windows.md
[ktr_rd]: https://github.com/oneofthezombies/kill-tree/blob/main/README.md
[node_perm]: https://nodejs.org/api/permissions.html
[np_ci]: https://github.com/microsoft/node-pty/tree/main/.github/workflows
[np_conpty]: https://github.com/microsoft/node-pty/blob/main/src/win/conpty.cc
[np_path]: https://github.com/microsoft/node-pty/blob/main/src/win/path_util.cc
[np_rd]: https://github.com/microsoft/node-pty/blob/main/README.md
[np_term]: https://github.com/microsoft/node-pty/blob/main/src/terminal.ts
[np_ut]: https://github.com/microsoft/node-pty/blob/main/src/unixTerminal.ts
[np_wpa]: https://github.com/microsoft/node-pty/blob/main/src/windowsPtyAgent.ts
[np_wt]: https://github.com/microsoft/node-pty/blob/main/src/windowsTerminal.ts
[pe_api]: https://pexpect.readthedocs.io/en/stable/api/pexpect.html
[pe_ov]: https://pexpect.readthedocs.io/en/stable/overview.html
[pk_ci]: https://github.com/ZelAnton/ProcessKit-rs/blob/main/.github/workflows/ci.yml
[pk_cmds]: https://github.com/ZelAnton/ProcessKit-rs/blob/main/docs/commands.md
[pk_cmdsrc]: https://github.com/ZelAnton/ProcessKit-rs/blob/main/src/command.rs
[pk_cmp]: https://github.com/ZelAnton/ProcessKit-rs/blob/main/docs/comparison.md
[pk_err]: https://github.com/ZelAnton/ProcessKit-rs/blob/main/docs/errors.md
[pk_pg]: https://github.com/ZelAnton/ProcessKit-rs/blob/main/docs/process-groups.md
[pk_plat]: https://github.com/ZelAnton/ProcessKit-rs/blob/main/docs/platform-support.md
[pk_ptysrc]: https://github.com/ZelAnton/ProcessKit-rs/blob/main/src/sys/pty/windows.rs
[pk_rd]: https://github.com/ZelAnton/ProcessKit-rs/blob/main/README.md
[pk_stdin]: https://github.com/ZelAnton/ProcessKit-rs/blob/main/src/stdin.rs
[pk_stream]: https://github.com/ZelAnton/ProcessKit-rs/blob/main/docs/streaming.md
[pk_tc]: https://github.com/ZelAnton/ProcessKit-rs/blob/main/docs/timeouts-and-cancellation.md
[pk_untr]: https://github.com/ZelAnton/ProcessKit-rs/blob/main/docs/untrusted-children.md
[pkpy_ci]: https://github.com/ZelAnton/processkit-py/blob/main/.github/workflows/ci.yml
[pkpy_cmds]: https://github.com/ZelAnton/processkit-py/blob/main/docs/commands.md
[pkpy_plat]: https://github.com/ZelAnton/processkit-py/blob/main/docs/platforms.md
[pkpy_readme]: https://github.com/ZelAnton/processkit-py/blob/main/README.md
[pkpy_road]: https://github.com/ZelAnton/processkit-py/blob/main/ROADMAP.md
[pkpy_sand]: https://github.com/ZelAnton/processkit-py/blob/main/docs/sandboxing.md
[pp_rd]: https://github.com/pexpect/ptyprocess/blob/master/README.rst
[pp_src]: https://github.com/pexpect/ptyprocess/blob/master/ptyprocess/ptyprocess.py
[ps_rec]: https://github.com/giampaolo/psutil/blob/master/docs/recipes.rst
[pty_cb]: https://github.com/wezterm/wezterm/blob/main/pty/src/cmdbuilder.rs
[pty_docs]: https://docs.rs/portable-pty/latest/portable_pty/
[pty_lib]: https://github.com/wezterm/wezterm/blob/main/pty/src/lib.rs
[pw2_ci]: https://github.com/watchexec/process-wrap/blob/main/.github/workflows/test.yml
[pw2_rd]: https://github.com/watchexec/process-wrap/blob/main/README.md
[pw2_win]: https://github.com/watchexec/process-wrap/blob/main/src/windows.rs
[pw_rd]: https://github.com/spyder-ide/pywinpty/blob/main/README.md
[pw_src]: https://github.com/spyder-ide/pywinpty/blob/main/winpty/ptyprocess.py
[py_async]: https://docs.python.org/3/library/asyncio-subprocess.html
[py_sub]: https://docs.python.org/3/library/subprocess.html
[rs_mod]: https://doc.rust-lang.org/std/process/index.html
[rs_proc]: https://doc.rust-lang.org/std/process/struct.Command.html
[rs_src]: https://github.com/rust-lang/rust/blob/master/library/std/src/process.rs
[sp_rd]: https://github.com/hniksic/rust-subprocess/blob/HEAD/README.md
[srt_rd]: https://github.com/anthropic-experimental/sandbox-runtime/blob/HEAD/README.md
[tk_cmd]: https://docs.rs/tokio/latest/tokio/process/struct.Command.html
[tk_proc]: https://docs.rs/tokio/latest/tokio/process/index.html
[tk_rd]: https://github.com/pkrumins/node-tree-kill
[tk_src]: https://github.com/pkrumins/node-tree-kill/blob/HEAD/index.js
[tpt_ci]: https://github.com/lpotthast/tokio-process-tools/tree/main/.github/workflows
[tpt_rd]: https://github.com/lpotthast/tokio-process-tools/blob/main/README.md
[trx_rd]: https://github.com/Chokqu/trexec/blob/HEAD/README.md
[xs_enoent]: https://github.com/moxystudio/node-cross-spawn/blob/HEAD/lib/enoent.js
[xs_esc]: https://github.com/moxystudio/node-cross-spawn/blob/HEAD/lib/util/escape.js
[xs_parse]: https://github.com/moxystudio/node-cross-spawn/blob/HEAD/lib/parse.js
[xs_res]: https://github.com/moxystudio/node-cross-spawn/blob/HEAD/lib/util/resolveCommand.js
[zb_rd]: https://github.com/afshinm/zerobox/blob/main/README.md
[zp_rd]: https://github.com/pithings/zigpty
[zx_core]: https://github.com/google/zx/blob/HEAD/src/core.ts
[zx_rd]: https://github.com/google/zx/blob/HEAD/README.md

## Lead verification (2026-10-01)

Codex fact-checked 20 Y/P cells across 11 candidates against their cited sources: **12 supported, 8 partial, 0 unsupported**.
Three **Y** cells are overstated by their own sources — processkit B11 (kill after the root exited is not explicit),
processkit-py B07 (no evidence that unread output is continuously drained with counted drops) and portable-pty B01
(PATHEXT search exists, `.cmd` execution semantics do not). The 81.8% headline is therefore an upper bound; the measured
fit (`processkit-fit.md`: 1 of 24 contract items as-is) is what the G0 used.
