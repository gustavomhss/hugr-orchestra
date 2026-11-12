# Q1 native-web source facts — 1

Prospective source facts for seven native analysis tools. Not an Orchestra integration, lane, no-exec, offline, or redistribution approval. No invented binary for a runtime or library. A license digest is not an artifact digest. A publisher digest is not a local rehash unless stated. Unverified signatures stay unverified.

## clang-tidy llvmorg-23.1.5

- Artifact: No standalone asset. Selected official `clang+llvm-23.1.5-aarch64-pc-windows-msvc.tar.zst` (published 2026-11-03T21:35:47Z), size 257889937. Archive sha256 `cb523582d9fe00862c5584ce5f7715f963037c11bba95181fa98425f48e06863` is the GitHub digest matched by a local sha256. Listed member `clang+llvm-23.1.5-aarch64-pc-windows-msvc/bin/clang-tidy.exe` and `bin/run-clang-tidy`. macOS/Linux members unlisted. `.jsonl` is sigstore/in-toto, not a member list; signature unverified.
- License: Apache-2.0 WITH LLVM-exception. Text sha256 `8d85c1057d742e597985c7d4e6320b015a9139385cff4cbae06ffc0ebe89afee` is monorepo LICENSE.TXT, not the archive and not a clang-tidy-only grant. https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-23.1.5/LICENSE.TXT
- Use: Check C/C++ sources: `clang-tidy [options] <source0> [...]`, compiler flags after `--`.
- Output/exits: Terminal diagnostics; `--export-fixes` YAML; `--dump-config` YAML on stdout; `--store-check-profile` JSON. Exit 1 on response-file, parser, VFS/config, or export-open failure; empty checks unless `--allow-no-checks`; invalid `--verify-config`; no checks or inputs; warnings-as-errors; compiler errors unless `--fix-errors`. Exit 0 for `--explain-config`, successful list/dump, valid verify, or no compiler errors and no warnings-as-errors. Ordinary warnings alone do not fail.
- Effects: Config: `.clang-tidy`, `compile_commands.json`, `--config`, `--config-file`, `--vfsoverlay`, `--load`. Network unstated in usage and `main()`; `--load` can run plugin code, so no hostnames claimed. Children: in-process LibTooling, optional plugin, and archive helper `run-clang-tidy` (not a second invented binary). Writes: `--fix/--fix-errors/--fix-notes` can edit sources; export and profile flags write files.
- Limits: macOS/Linux members unknown. Plugin load is arbitrary code. License text does not certify redistribution.

Sources: https://github.com/llvm/llvm-project/releases/download/llvmorg-23.1.5/clang+llvm-23.1.5-aarch64-pc-windows-msvc.tar.zst https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-23.1.5/LICENSE.TXT https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-23.1.5/clang-tools-extra/clang-tidy/tool/ClangTidyMain.cpp

## cppcheck 2.22.0

- Artifact: Selected `cppcheck-2.22.0-x64-Setup.msi`, publisher digest `sha256:3929162bab7e71d1b9b18708ec054fb0188bfc8ea1660979ed95837f5a9f547b` (published 2026-09-19T18:47:28Z), not recomputed from bytes. MSI members unlisted; facts are from tag 2.22.0. No non-Windows binary in that payload, so none is invented.
- License: GPL-3.0-or-later. COPYING sha256 `8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903` is GPL-3 text, not the MSI. `cli/main.cpp` says GPL-3.0 or any later version. Invocation-only, not a redistribution certificate. picojson, simplecpp, and tinyxml2 unhashed. https://raw.githubusercontent.com/cppcheck-opensource/cppcheck/2.22.0/COPYING
- Use: Analyze files or paths: `cppcheck [OPTIONS] [files or paths]`, including `--enable`, `--error-exitcode`, addon/clang hooks, and `--output-file`.
- Output/exits: Text on stderr unless redirected; XML, errorlist, preprocessor stop, dump XML, or a result file. Bad args, no inputs, or critical safety errors fail. Help-style stop succeeds. Findings return exitCode (default 0; `--error-exitcode` sets n). OS truncation can turn 256 into 0.
- Effects: Config from library/addon files and suppression lists. Network: tag cli/lib has no HTTP client; addon, Python, and `--clang` are arbitrary programs, so no hostnames claimed (GUI is not the CLI). Children: addon scripts, python3 then python, and the given Clang. Writes: build-dir cache, report, dump, and output files.
- Limits: MSI contents unknown. Publisher digest is not a local rehash. Addon/Clang are arbitrary code. Externals unhashed. Not a redistribution approval.

Sources: https://raw.githubusercontent.com/cppcheck-opensource/cppcheck/2.22.0/COPYING https://raw.githubusercontent.com/cppcheck-opensource/cppcheck/2.22.0/cli/cppcheckexecutor.cpp https://raw.githubusercontent.com/cppcheck-opensource/cppcheck/2.22.0/cli/cmdlineparser.cpp

## Infer v1.3.0

- Artifact: Selected `infer-linux-x86_64-v1.3.0.tar.xz` (v1.3.0, published 2026-05-12T15:44:13Z, not draft/prerelease), size 275901768. Integrity is Releases API digest `sha256:02be62ba931cb43e2d42bbf7abf4bd9a410cf8464cce5453934e25c90a825850`, not a local rehash. osx-arm64 not selected. No macOS x86_64 asset.
- License: MIT. Root LICENSE sha256 `52412d7bc7ce4157ea628bbaacb8829e0a9cb3c58f57f99176126bc8cf2bfc85` is the license text (MIT header, Facebook copyright), not the tarball. README: MIT-licensed; Java support may require a user GPL download. Tarball notices unextracted, so bundling is not qualified. https://raw.githubusercontent.com/meta/infer/v1.3.0/LICENSE
- Use: `infer run`, or `infer [options] -- <compile command>` (capture, analyze, report unless `--no-report`). Options from `.inferconfig`, then `INFER_ARGS`, then argv.
- Output/exits: Default `./infer-out`. Report JSON (`report.json` main; text form too). SARIF/PMD only with those flags. Success exits 0. User 1, other exception 2, external 3, internal 4. `--fail-on-issue` (default off) exits 2 if anything is reported. `INFER_STRICT_MODE=1` can error with an unnamed code.
- Effects: Config equals argv, including the build after `--` (execute and network). Packaged-binary network on its own was not established. Children: the user build; `--run-as-child` worker; integration tools not always spawned. Writes: may delete then recreate the results directory. Not read-only.
- Limits: Tarball not rehashed. Notices unextracted, so redistribution is not qualified. Independent binary network unknown.

Sources: https://api.github.com/repos/meta/infer/releases/tags/v1.3.0 https://raw.githubusercontent.com/meta/infer/v1.3.0/LICENSE https://raw.githubusercontent.com/meta/infer/v1.3.0/infer/src/base/Die.ml

## CodeChecker v6.29.3

- Artifact: PyPI sdist `codechecker-6.29.3.tar.gz`, size 11327833, sha256 `13a01fd7250ebf107af9c3f338745654c5efe0320c3db9e5f8744d4db0510b02` (sdist digest, not an installed binary). GitHub v6.29.3 (published 2026-11-05T19:44:05Z) has empty assets. Requires Python >= 3.9, clang, clang-tidy, and a C/C++ build; those are not hashed and not an auto-install binary.
- License: Apache-2.0 WITH LLVM-exception. LICENSE.TXT sha256 `49055936f2b20c958728491fb04bb1cf06def759714756b9df650635768b91c6` is the text, not the sdist. Exception appendix was not a separate file. Bundling not qualified. https://raw.githubusercontent.com/Ericsson/codechecker/v6.29.3/LICENSE.TXT
- Use: `CodeChecker analyze <db> --output <dir>` after `log --build <cmd>`; also parse, store, and fixit.
- Output/exits: Text defect listings; HTML, JSON (`reports.json`), or `reports.baseline` on export. Wrapper returns the child status. Exit 1: missing data, interrupt, or uncaught exception; 128+signum on SIGINT/SIGTERM. analyze: 3 if any failed-count is non-zero, else 0; findings alone do not change it. parse: 2 if report count is true after print/export; other captured failures 1. No-report return unread.
- Effects: Config via `--config`, skip files, and compile commands. Network: store and diff `--url` are HTTP; missing `analyzer_statistics` only logs and does not connect (external module unread). Children: `cli.py`, clang/clang-tidy, and the wrapped build (unbounded). Writes: report dir, exports, workspace, source edits, metadata; temp pickle removed on exit.
- Limits: Empty GitHub assets are not a binary. Sdist hash is not an executable. Schema unread. Wrapped tools are separately licensed.

Sources: https://pypi.org/pypi/codechecker/json https://raw.githubusercontent.com/Ericsson/codechecker/v6.29.3/LICENSE.TXT https://raw.githubusercontent.com/Ericsson/codechecker/v6.29.3/docs/usage.md

## ASan llvmorg-23.1.5 compiler-rt runtime; no independent release

- Artifact: Not an independent CLI. Selected host `LLVM-23.1.5-Linux-X64.tar.xz`. Cached digest `sha256:f72edb0b36580ece7f52e23858f00c18fad4e87395ea7ad05d7e55c39f8fc78a` was not recomputed from bytes. Linked names include `clang_rt.asan`, `clang_rt.asan_cxx`, `clang_rt.asan_static`, `clang_rt.asan-preinit`, and shared `clang_rt.asan` on the non-AIX path. Exact tar member not extracted. `.jsonl` is a sigstore bundle, not a manifest; signature unverified.
- License: Apache-2.0 WITH LLVM-exception. Text sha256 `8d85c1057d742e597985c7d4e6320b015a9139385cff4cbae06ffc0ebe89afee` is a root audit match of LICENSE.TXT, not re-fetched this session and not the archive. No ASan-only license file. https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-23.1.5/LICENSE.TXT
- Use: Not a standalone analyzer. `clang -fsanitize=address`, then run the binary. Final link must be clang, not ld.
- Output/exits: Bug text on stderr (example `ERROR: AddressSanitizer heap-use-after-free`). halt_on_error defaults true. exitcode defaults to 1 only when abort_on_error is false; Apple and Android default abort() instead of _exit. ASAN_OPTIONS can override.
- Effects: Config via ASAN_OPTIONS and ASAN_SYMBOLIZER_PATH (can execute a symbolizer). Network: no telemetry host; intercept_send is not a client; program network remains possible. Children: optional old-OS-X re-exec; no ASan CLI. Writes: stderr unless log_path is set (`log_path.pid`); coverage off by default; syslog on Android/Apple defaults.
- Limits: Member path unknown. Digest not locally rehashed. Signature unverified. Exit 1 is not universal. Not every non-Apple platform is claimed to build all five names. Host clang is not a hashed auto-install.

Sources: https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-23.1.5/clang/docs/AddressSanitizer.md https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-23.1.5/LICENSE.TXT https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-23.1.5/compiler-rt/lib/sanitizer_common/sanitizer_termination.cpp

## UBSan llvmorg-23.1.5 compiler-rt runtime; no independent release

- Artifact: Not a standalone CLI or asset. Host `LLVM-23.1.5-Linux-X64.tar.xz`; HTML sha256 `f72edb0b36580ece7f52e23858f00c18fad4e87395ea7ad05d7e55c39f8fc78a` is a publisher digest, not a local rehash. Sidecar `.jsonl` sha256 `b2bb5d229cc071b00858b4ab0e414f4ba7218b7cdfa858b2cac281687769ed81` matches its digest but is sigstore, not a member list; signature unverified. Runtimes include `clang_rt.ubsan_standalone`, cxx, `clang_rt.ubsan_loop_detect`, and shared `clang_rt.ubsan`. Member path unknown. No UBSan binary invented.
- License: Apache-2.0 WITH LLVM-exception. LICENSE.TXT sha256 `8d85c1057d742e597985c7d4e6320b015a9139385cff4cbae06ffc0ebe89afee` is a rehash of cached license bytes, not the archive. No UBSan-only file. Notices not inventoried, so bundling is not qualified. https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-23.1.5/LICENSE.TXT
- Use: `clang++ -fsanitize=undefined`, then run `./a.out`. `-fno-sanitize-recover` exits; `-fsanitize-trap` needs no runtime. Link with clang unless every check traps.
- Output/exits: Text `runtime error:` lines, not JSON or SARIF. Most checks continue; the overflow example returns 0. halt_on_error defaults false. Die() aborts on Apple/Android, else exits with exitcode 1. Uncaught trap mode typically SIGILL or SIGTRAP. One host code is not claimed.
- Effects: Config: sanitize flags, recover/trap, and UBSAN_OPTIONS (halt, stacktrace, suppressions, log_path). Network unstated; the program can still use it. No hostname list. Children: none claimed; symbolizer spawn unread. Writes: stderr unless log_path is a real path.
- Limits: Member unknown. Archive hash is publisher-only. Signature unverified. Exit 1 is not universal. Recoverable checks can return 0.

Sources: https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-23.1.5/clang/docs/UndefinedBehaviorSanitizer.md https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-23.1.5/LICENSE.TXT https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-23.1.5/compiler-rt/lib/ubsan/ubsan_flags.inc

## libFuzzer llvmorg-23.1.5 compiler-rt/lib/fuzzer; no independent release

- Artifact: Not a standalone CLI. `-fsanitize=fuzzer` links libFuzzer main(). Selected `LLVM-23.1.5-macOS-ARM64.tar.xz`, size 1569733272. Independent sha256 `aba592b4a15e8f90c634c5367b51ec8418b8bcd2829865db331a17dc9418dcff` matches the GitHub release-page digest. `.sig` unverified. Listing, not an install, shows `bin/clang` and `LLVM-23.1.5-macOS-ARM64/lib/clang/23/lib/darwin/libclang_rt.fuzzer_osx.a` plus no-main and interceptors. No libFuzzer binary invented.
- License: Apache-2.0 WITH LLVM-exception. LICENSE.TXT sha256 `8d85c1057d742e597985c7d4e6320b015a9139385cff4cbae06ffc0ebe89afee` is the license text, an audit match of the pinned URL, not the tarball. No fuzzer-only license file. Notices not inventoried. https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-23.1.5/LICENSE.TXT
- Use: `clang -g -O1 -fsanitize=fuzzer mytarget.c`, then `./my_fuzzer CORPUS_DIR`. Target must provide `LLVMFuzzerTestOneInput` and not exit on input.
- Output/exits: Plain text progress, not JSON or SARIF. Bugs write `crash-<sha1>`, `leak-<sha1>`, or `timeout-<sha1>`. Jobs write `fuzz-<JOB>.log`. `-runs` defaults to -1 and `-max_total_time` to 0 (indefinite). Timeout and libFuzzer leak/OOM default to exit 77. On a limit, DONE then `exit(0)`. Sanitizer-crash code not stated.
- Effects: Config is argv plus corpus; a dictionary and the target can execute arbitrary code. Network: no libFuzzer client documented; the target can do arbitrary network. Children: one process by default; jobs/workers and experimental `-fork` spawn more. Writes: corpus, bug files, worker logs, and a merge-control file.
- Limits: Sanitizer exit unknown. Signature unverified. Notices missing, so not notice-qualified. Target I/O unbounded. Not an integration.

Sources: https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-23.1.5/llvm/docs/LibFuzzer.md https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-23.1.5/LICENSE.TXT https://github.com/llvm/llvm-project/releases/download/llvmorg-23.1.5/LLVM-23.1.5-macOS-ARM64.tar.xz
