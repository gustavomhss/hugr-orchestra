# Q1 native-web source facts — 2

Future-tool source facts only. Not a live Orchestra integration, lane, no-exec or offline certificate, or redistribution approval. A license digest is not an artifact digest. A registry or previously stated checksum is not a local rehash unless those bytes were hashed again. No signature check is proved. A prerequisite hash is not an installable binary.

## CBMC cbmc-6.11.0

- Artifact: GitHub deb `ubuntu-22.04-cbmc-6.11.0-Linux.deb`, 70165834 bytes. Stated SHA-256 `de9fa1cc4cf51c493e708a1c7608b192ad4956717b684d9c4501e22fd22d88a0` was not re-downloaded or re-hashed. No checksum sidecar. MSI, Docker, and brew were not selected.
- License: BSD-4-Clause text; no SPDX id printed. LICENSE SHA-256 `858c0e744b9bab750f6b2801c6921db8c64076d90201977d6219666a75eba0f9` (https://raw.githubusercontent.com/diffblue/cbmc/cbmc-6.11.0/LICENSE) is LICENSE bytes only, not the deb hash. Deb, MSI, and embedded notices unread; bundling unqualified.
- Use: Bounded model checking: `cbmc [options] file.c ...` (man: `cbmc file.c`). Cached `.TH` still says cbmc-5.59.0; the pin is the tag. Do not substitute `--version`.
- Output/exits: Violable property: print a counterexample and stop; else check program properties. JSON, XML, GraphML, and Cobertura are optional; no SARIF stated in the man-page sections read. Header constants, not a captured exit: PASS 0, FAIL 10, UNKNOWN 5, ERROR 6, usage 1, parse 2, set-properties 7, preprocessor 8, internal or conversion 6 or 10. First-failure abort unconfirmed; stop-on-fail is opt-in.
- Effects: Config: CLI, verbosity 6, c11, standard pointer/bounds/shift/div0/overflow checks on from 6.0 unless disabled. Network unproved (HTTPS only in comments or a diagnostic). Children: Linux non-`.i` runs `gcc -E` via unread `run()`. Writes: stdout; TMPDIR temps; unlink unread.
- Limits: Deb digest unreproven. Spawn, unlink, whole-process network, and bundled notices stay open. Atom says Ubuntu 20 but names ubuntu-24.04; selected file is ubuntu-22.04. Windows note needs the Visual C++ redistributable.

Sources: https://raw.githubusercontent.com/diffblue/cbmc/cbmc-6.11.0/src/cbmc/cbmc_parse_options.cpp ; https://raw.githubusercontent.com/diffblue/cbmc/cbmc-6.11.0/src/util/exit_codes.h ; https://github.com/diffblue/cbmc/releases.atom

## Frama-C 33.0 (Arsenic)

- Artifact: Source tarball: https://www.frama-c.com/download/frama-c-33.0-Arsenic.tar.gz (9636049 bytes). Re-download matches opam SHA-256 `9c1cbffd28bb33c17a668107e39c96e4ae7378a3d8249f69b47afc7ee964e9b8`. VERSION 33.0, Arsenic.
- License: Opam LGPL-2.1-only; headers LGPL-2.1. LICENSE-member SHA-256 `1033e05e9be6519d12ddddce2aca0b47a0064e94a9aa24d06df002e393bf0f15` is extracted text, not the tarball hash. Also BSD, CC0, CDDL, GPL-2.0-with-linking-exception, QPL. LGPL text SHA-256 `72b672113d642cbb8ef5dcc76938db801983c56e50b1400ab930f1a64d6dc8d9`. Docs claim CC-BY-SA-4.0; `doc/LICENSE` absent. Per-file closure unqualified.
- Use: C static analysis: `frama-c [options] files`. Source-build only (ocaml >= 4.14.0, dune > 3.13.0, why3 >= 1.8.2 < 1.9.0, other opam depends). The tarball is not a binary. `.c` is preprocessed; `.i` already is. Entry `main`; machdep `x86_64` unless `FRAMAC_MACHDEP`. Autoload defaults on.
- Output/exits: Textual feedback (verbosity 1), not stable JSON or SARIF. Config JSON experimental; SARIF off unless requested. Exits: 0 success, 1 abort, 2 break, 3 unimplemented, 4 fatal, 5 hook error, 6 error-handling error, 125 other exception. Cleanup can exit 0 after a recorded error.
- Effects: Config: CLI/env, session `./.frama-c`, platform cache/config/state, cpp `$CPP` or `gcc -C -E -I.`, sandbox rejects unmarked options. Network: no kernel HTTP client; plugins, loads, custom cpp arbitrary; first Ivette dist downloads. Children: `.c` preprocesses via `Sys.command` (abort if nonzero); WP calls Why3 only if a prover is named. Save, print, logs, time, SARIF writes opt-in. No-option cache creation unclaimed.
- Limits: Open: Why3 argv, no-option dirs, full SARIF, `doc/LICENSE`, per-file notices. Mixed texts are not a redistribution closure.

Sources: https://www.frama-c.com/download/frama-c-33.0-Arsenic.tar.gz ; https://opam.ocaml.org/packages/frama-c/frama-c.33.0/opam

## RuboCop 1.92.2

- Artifact: Ruby gem https://rubygems.org/gems/rubocop-1.92.2.gem, created 2026-10-29T09:50:00.058Z. Publisher gem SHA-256 `14fb31eed143a0dc6f78186c550c1715e81cd38f59d05d1165050e445c1f5382`.
- License: MIT. Text SHA-256 `102cbdf7e36a90dea7e545c683cf457ea8b993bce627b417744609088fd8b377` (https://raw.githubusercontent.com/rubocop/rubocop/v1.92.2/LICENSE.txt). Gemspec also declares MIT. Runtime-dep notices are separate.
- Use: Ruby offense check: `rubocop` with no extra flags. The exe runs the CLI and exits with its status. Do not substitute a formatter or `--version`.
- Output/exits: Default formatter is progress unless `AllCops/DefaultFormatter` is set. Line shape uncopied. Exit 0 if every file passes or is excluded and errors are empty; 1 for offenses unless aborting (`SIGINT+128`); 2 for config, option, parse, or load errors.
- Effects: Config: upward `.rubocop.yml` search, then home; `--config` is an option name in `DEFAULT_PARALLEL_OPTIONS`; `inherit_from` may be a URL. Network: local file opens no socket; a remote inherit GETs that host (TLS only for HTTPS, 10 redirects); socket errors write nothing. Children: exe may run the server client first; parallel defaults on for MRI non-Windows. Writes: cache is `RUBOCOP_CACHE_ROOT`, else cache-root config, else `$XDG_CACHE_HOME/<uid>` or `$HOME/.cache`, then `rubocop_cache`. Fetched configs and checksum files land there. Autocorrect can edit sources. Cache defaults on.
- Limits: Remote inherit is an arbitrary-host trust constraint. Registry digest was not re-hashed. Dependency notices unqualified.

Sources: https://rubygems.org/api/v1/gems/rubocop.json ; https://raw.githubusercontent.com/rubocop/rubocop/v1.92.2/LICENSE.txt ; https://raw.githubusercontent.com/rubocop/rubocop/v1.92.2/lib/rubocop/cli.rb

## bundler-audit 0.9.3

- Artifact: Ruby gem https://rubygems.org/gems/bundler-audit-0.9.3.gem (50176 bytes, created 2025-11-28T23:57:52.375Z). Independent SHA-256 `81c8766c71e47d0d28a0f98c7eed028539f21a6ea3cd8f685eb6f42333c9b4e9` matches RubyGems. Needs Ruby >= 2.0.0, RubyGems >= 1.8.0, bundler >= 1.2.0, thor ~> 1.0.
- License: GPL-3.0-or-later. COPYING.txt SHA-256 `e79e9c8a0c85d735ff98185918ec94ed7d175efc377012787aebcf3b80f0d90b` (https://raw.githubusercontent.com/rubysec/bundler-audit/v0.9.3/COPYING.txt) is license text, not the gem hash. Tag `LICENSE.txt` was 404, not re-fetched. Third-party notices uncaptured. Invocation-only GPL is not a redistribution certificate.
- Use: Lockfile advisory check: `bundle-audit check [DIR]`.
- Output/exits: Text: advisory fields, then `Vulnerabilities found!` or, unless quiet, `No vulnerabilities found` (not the older unpatched line). JSON is `report.to_h` if asked. Exit 1 if dir or lock missing, format unknown, report vulnerable, download/update fails, or update lacks git. Clean check does not exit. Thor returns on success; `Thor::Error` uses `exit(false)`. Cited, unre-fetched Ruby 3.3.6 normal-exit success is not a literal `exit 0` here.
- Effects: Config: `.bundler-audit.yml` is an ignore list, not shown executable; a format name loads Ruby and can run arbitrary code. Database: `BUNDLER_AUDIT_DB` or `~/.local/share/ruby-advisory-db`. Network: present db needs none; missing db clones https://github.com/rubysec/ruby-advisory-db.git; `--update` pulls `origin master`. A first check is not offline. Children: git clone, pull, rev-parse, log. Writes: `--output` and the local checkout.
- Limits: Thor success-return read only on 1.0.0, 1.4.0, and 1.5.0, not every `~> 1.0` tag. Custom formats can open further hosts. Bundling unqualified.

Sources: https://rubygems.org/api/v1/gems/bundler-audit.json ; https://raw.githubusercontent.com/rubysec/bundler-audit/v0.9.3/COPYING.txt ; https://raw.githubusercontent.com/rubysec/bundler-audit/v0.9.3/lib/bundler/audit/cli.rb

## Sorbet 0.6.13672

- Artifact: Two RubyGems archives, locally SHA-256 checked against registry: `sorbet@0.6.13672` (Ruby >= 3.0.0), `ea2f3d4d20b928119c69110614810e6cf0ba9b47aa7e77313f8251c563be733f`; `sorbet-static@0.6.13672`, universal-darwin, `libexec/sorbet`, `41faabce1d9137bb753302727bc9897c0e7a549563e380d22f80e9ef32ac2eac`. Other platforms were not fetched.
- License: Apache-2.0. LICENSE SHA-256 `774055facbf2f1dfd1c48fd9c6f8818531ce19d7409386515196ea2ae48f0776` (https://raw.githubusercontent.com/sorbet/sorbet/0.6.13672.20261111164441-49d831e84/LICENSE) is a cached rehash of that file, not either gem hash. Neither gem ships LICENSE or NOTICE. Notices inside `libexec/sorbet` unread.
- Use: Ruby typecheck: `srb tc [paths]`. The default wrapper execs `libexec/sorbet`; `SRB_SORBET_EXE` runs a child and propagates its status. Discovery `.rb,.rbi`; typed auto; `sorbet/config` unless `--no-config`.
- Output/exits: Human diagnostics, not JSON or SARIF. JSON errors unsupported; LSP only with `--lsp`. Metrics JSON and most `--print` formats are unstable. Native: 0 start, 10 critical or null state, 100 if errors remain without `--suppress-non-critical`. Min-build exit 1 is not the release gem. Help, unknown subcommand, or no `sorbet/` with no args exits 1.
- Effects: Config files are argv, not a plugin host; `srb rbi` can require project Ruby. Network: default typecheck opens none; statsd UDP 8200 and `srb rbi sorbet-typed` (clone https://github.com/sorbet/sorbet-typed.git) are opt-in. Children: exec `libexec/sorbet`; cache miss may run `find-gem-rbis`. Threads in-process. Writes: miss may write `${XDG_CACHE_HOME:-$HOME/.cache}/sorbet/gem-rbis/<md5>`. `--cache-dir` defaults empty. Metrics, traces, state, autocorrect, and `./sorbet/` are flag-triggered.
- Limits: Binary notices and the `find-gem-rbis` body unread. Other platforms not fetched. Not every subcommand is offline.

Sources: https://rubygems.org/gems/sorbet-static-0.6.13672-universal-darwin.gem ; https://raw.githubusercontent.com/sorbet/sorbet/0.6.13672.20261111164441-49d831e84/main/realmain.cc ; https://raw.githubusercontent.com/sorbet/sorbet/0.6.13672.20261111164441-49d831e84/LICENSE

## Steep 2.1.0

- Artifact: Ruby gem https://rubygems.org/gems/steep-2.1.0.gem, created 2026-08-27T08:58:43.872Z, executable `exe/steep`. Publisher gem SHA-256 `1daf53573283b0e6d404a7273cca41fe5c15b14ece05167934f5ffc179e171d9`. Gemspec requires Ruby >= 3.3.0; README still says 2.6.
- License: MIT. Text SHA-256 `c4a168ba052554aebbe41da0443b6989fde9759a41edb74eb9b49adce16d7733` (https://raw.githubusercontent.com/soutaro/steep/v2.1.0/LICENSE). Runtime deps, including rbs ~> 4.2, are separate. Notice closure uncaptured.
- Use: Ruby typecheck: `steep check [paths]` or `steep check -e EXPR`. The exe exits with `CLI#run`.  `steep init` only scaffolds a Steepfile.
- Output/exits: Prints `.` or `F`, then `No type error detected.` or diagnostics plus `Detected N problem(s) from M file(s)`. Sample: `lib/phone.rb:46:0: MethodDefinitionMissing: ...`. Empty diagnostics return 0, else 1; EPIPE is 1; unknown command is 1; uncaught exception exits 2. `init` returns 1 without `--force` if Steepfile exists, else 0.
- Effects: Config: Steepfile is `instance_eval`'d Ruby; if missing, the current directory is checked. Network: default check has no documented HTTP client; unavailable RBS collection installs from its lockfile unless disabled (hosts config-defined). A Steepfile can do arbitrary network, process, and file effects. Children: `--jobs` and server start fork when possible; server refuses otherwise. Writes: `init` writes Steepfile; `--save-expectations` writes `steep_expectations.yml`. Missing lockfile is logged, not written. Installer writes untraced. Typecheck does not rewrite sources.
- Limits: Install gem and runtime deps. Steepfile is not data. Server start needs fork. Bundling unqualified. Collection install is not offline.

Sources: https://rubygems.org/api/v1/gems/steep.json ; https://raw.githubusercontent.com/soutaro/steep/v2.1.0/LICENSE ; https://raw.githubusercontent.com/soutaro/steep/v2.1.0/lib/steep/cli.rb

## strong_migrations 2.8.0

- Artifact: Library gem, created 2026-05-14T15:12:58.794Z. Publisher gem SHA-256 `cb9c0f8160e60f3e9c0e76098d57a6f61825b9618e8eb41cebbd1c1079874439`. Docs plus `lib/**` only; executables empty.  Requires Ruby >= 3.3 and ActiveRecord >= 7.2.
- License: MIT. Text SHA-256 `eed84d13969e6b9e12a5cc88b323f23a02d94b44bad3996f5ce11003b976f57a` (https://raw.githubusercontent.com/ankane/strong_migrations/v2.8.0/LICENSE.txt). ActiveRecord is separate. Notice closure uncaptured.
- Use: No CLI. `ActiveRecord::Migration` prepend runs in the host migrator, typically `rails db:migrate`.  Custom checks are `add_check` blocks.
- Output/exits: Dangerous SQL raises `UnsafeMigration`: blank line, then `=== Dangerous operation detected #strong_migrations ===` (custom header `Custom check`). Unsupported adapters raise `UnsupportedVersion`. No `exit()` or numeric code; host uncaught failure is the process status. `safety_assured` skips that block. Versions `<= start_after` count as safe.
- Effects: Config is Ruby constants. Defaults: `auto_analyze` false, `start_after` 0, `safe_by_default` false, `check_down` false. Template: lock timeout 10s, statement timeout 1h, `auto_analyze` true. Outside development/test, lock-timeout limit is 10. Network: no HTTP client; database host is the app's. Blocks can do arbitrary effects. Children: no spawn/fork; timeouts and analyze are SQL. Writes: passing migration still runs SQL; `auto_analyze` analyzes after an added index; `remove_invalid_indexes` (default false) can drop an invalid PostgreSQL index. No report file.
- Limits: Needs ActiveRecord >= 7.2 host migrator. Catch both exceptions. Migrations and the initializer are not data. Bundling unqualified.

Sources: https://rubygems.org/api/v1/gems/strong_migrations.json ; https://raw.githubusercontent.com/ankane/strong_migrations/v2.8.0/LICENSE.txt ; https://raw.githubusercontent.com/ankane/strong_migrations/v2.8.0/lib/strong_migrations.rb
