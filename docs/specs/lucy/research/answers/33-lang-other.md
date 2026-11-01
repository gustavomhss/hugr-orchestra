# 33-lang-other

session ses_a1077a888ef9c8523647b4b9f0abf5c126165bf36a3bff54f7639712d661af75

## Answer

**Conclusion.** Before choosing tools, one fact about lucy matters: today it cannot run any of them. Its seat uses the `review` profile with `skills: []`, and that profile allows only read, glob, grep and `maestro_record_review`, with no bash (claims 1–2). The best fit is to add one host-owned, allowlisted scan tool. It would run fixed analyzer commands through Orchestra's sandboxed process layer, using `ChildProcessSpawner`/`Process` with omni, on a read-only checkout with the network off, and hand back SARIF or JSON. Lucy would then judge the findings and stay read-only. MCP servers and LSP are secondary options; a seat skill only carries the checklists. Licensing decides what can ship inside the app. Permissive tools can be bundled. GPL and AGPL tools (ShellCheck, hadolint, Slither, Echidna) should be run if installed or fetched on demand as separate programs. Brakeman must never be bundled: its license forbids commercial redistribution and value-added product use (claims 3–5).

**Integration design (inferred).**
- **One tool for running analyzers.** Add a `review_scan` tool that runs only allowlisted analyzers, the same pattern jimmy's `probe_run` follows. Give lucy that tool rather than bash. A general bash grant would break its read-only "cannot run commands" contract (claim 1).
- **The tool's contract:** a fixed argument vector per analyzer, a temp output directory, a time and memory cap, and normalized SARIF out.
- **Seat skill for knowledge only.** The per-ecosystem checklists below would become a shipped lucy skill tree. Per the owner's earlier rule ("unbuilt seats get no trees"), the owner has to approve building lucy's tree first.
- **MCP servers are optional extras, not the base layer.** The Trivy MCP server (MIT, `trivy plugin install mcp`) and Semgrep's MCP server (now built into the `semgrep` binary) both exist (claims 8–9). They fit an external-tools panel but add a process and a model-facing surface per tool. SARIF from a single runner is more uniform.
- **LSP is for editors and not needed for review.** squawk ships `squawk server`, and Psalm has a language server (claim 7).

**Tool map (from memory except where a claim cites a source):**
| Ecosystem | Tools |
|---|---|
| C#/.NET | Built-in analyzers with nullable/`TreatWarningsAsErrors` + Roslynator; `dotnet list package --vulnerable`; Stryker.NET; Microsoft.CodeAnalysis.PublicApiAnalyzers for breaking changes. The analyzers need a build. |
| Swift | Compiler strict concurrency / Swift 6 mode; SwiftLint; Periphery (dead code, needs a build index); Muter (mutation); `swift package diagnose-api-breaking-changes`. |
| Ruby/Rails | RuboCop (+ rubocop-rails); Brakeman (invoke only, never ship); bundler-audit; Sorbet or Steep for types; strong_migrations; `mutant` (commercial license for non-OSS). |
| PHP | PHPStan at max level; Psalm with `--taint-analysis`; `composer audit`; Infection (mutation); Roave BackwardCompatibilityCheck. Psalm taint emits SARIF and has its own baseline (claim 6). |
| Solidity/EVM | Slither (AGPLv3; "less than 1 second per contract"); Mythril; Foundry fuzz and invariant tests; Echidna (AGPL); Certora Prover (said to be GPL-3 since Feb 2025, not captured). |
| SQL migrations | squawk (Postgres lock and downtime rules, JSON reporter, `--assume-in-transaction`, LSP) (claim 7); sqlfluff for style and dialects. |
| Shell | ShellCheck (GPLv3); shfmt for formatting. |
| IaC | tflint; Trivy (absorbed tfsec); Checkov; kube-linter; hadolint (GPLv3); actionlint; zizmor (SARIF output, offline mode). |
| Cross-cutting | gitleaks (secrets); osv-scanner / Trivy (dependencies); syft (SBOM); Semgrep CE (generic SAST). |

**Precision.** The only primary benchmark captured is SmartBugs (ICSE 2020). Nine tools together detected only 42% of annotated vulnerabilities; the best, Mythril, reached 27%; and 97% of 47,518 real contracts were flagged, implying heavy false positives (claim 10). Treat findings as leads to verify, not verdicts.

**Detecting the toolchain without changing the repo (inferred).**
- **Detect from manifests:**
  - .NET: `*.sln`, `*.csproj`, `global.json`
  - Swift: `Package.swift`, `*.xcodeproj`
  - Ruby: `Gemfile.lock`, `.ruby-version`
  - PHP: `composer.lock`
  - Solidity: `foundry.toml`, `hardhat.config.*`
  - SQL: migration directories, matched to the database engine
  - Shell: shebangs
  - Terraform: `*.tf`, `.terraform.lock.hcl`
  - Kubernetes: YAML files with `kind:`
  - Docker: `Dockerfile`
  - GitHub Actions: `.github/workflows`
- **Run without mutating:** use a disposable worktree or copy and write outputs only to temp. Never run `bundle install` or `composer install` into the tree; cache dependencies outside it.
- **Prefer tools that parse without building:** RuboCop, Brakeman, ShellCheck, hadolint, actionlint, zizmor, squawk, tflint, Checkov.
- **Gate build-dependent tools** (Roslyn analyzers, Periphery, Slither, PHPStan with autoload) on an available toolchain.
- **Missing toolchain:** report "not run: X absent" in the review card and fall back to parse-only tools plus reading the code. Never install silently.

**Expert checklist, things no tool catches (inferred):**
- **.NET:** async-over-sync and deadlocks; misused `IDisposable`; EF N+1 queries and tracking; `DateTime.Now` vs UTC.
- **Swift:** retain cycles in closures; `@MainActor` and Sendable gaps; force-unwraps on I/O.
- **Rails:** mass assignment and strong params; authorization (scoping `find` to `current_user`); callbacks with side effects; migrations that lock large tables.
- **PHP:** loose `==` comparisons; `unserialize` on input; inconsistent framework escaping.
- **Solidity:**
  - access control on initializers and upgrades;
  - oracle and price manipulation, rounding direction, ERC-4626 inflation;
  - reentrancy across functions;
  - storage layout on upgrade.
- **SQL:**
  - backfills inside a transaction;
  - `NOT NULL` or default on big tables;
  - non-concurrent indexes;
  - irreversible down-migrations.
- **Shell:** `set -euo pipefail` semantics; unquoted globs; `curl | sh`.
- **IaC:**
  - wildcard IAM;
  - public buckets and security groups;
  - `:latest` tags and running as root;
  - `pull_request_target` combined with checkout of the PR head;
  - unpinned actions;
  - broad `GITHUB_TOKEN` permissions.

**Highest signal per minute:**
- **First pass (seconds):** actionlint + zizmor, hadolint, ShellCheck, squawk, tflint/Trivy config, gitleaks, RuboCop/Brakeman, PHPStan, Slither.
- **Deep audit:** Psalm taint, Roslyn analyzers at full strictness, Periphery, Echidna or Foundry invariants, Certora, mutation testing.

**Supporting claims:**
- (read) lucy's seat definition, `modules/maestro/coordination/src/seats/lucy.ts:4-18`: `profile: "review"`, `skills: []`, "cannot edit or run commands".
- (read) `modules/maestro/coordination/src/roster.ts:39-57`: the `review` profile has no bash; the `execution` profile does.
- (read) Brakeman's LICENSE.md lists "Distributing the Software as a commercial product or as part of one" as Commercial Use.
- (read) Slither's README states the AGPLv3 license; the ShellCheck and hadolint licenses are GPLv3; Echidna's is AGPLv3.
- (read) Psalm's docs show `--taint-analysis` and SARIF output.
- (read) The squawk README shows the json reporter and the `server` LSP.
- (read) The Trivy MCP README; the Semgrep MCP deprecation notice.
- (read) The SmartBugs abstract.

**Not examined:** Licenses, laptop speed and memory, and false-positive rates for most tools in the table. These are from memory, not captured sources, and need checking before shipping. The squawk LICENSE fetch failed and the Certora license was not captured. I did not benchmark any tool.

## Claims

[
 {
  "proposition": "Orchestra's lucy seat uses the review profile with no seat skills and is described as read-only, unable to edit or run commands.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_ff8fb46cd771c3962db53b8402",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_08e6704a37ddfaa4054a3cd2d2",
      "revision": 1
     },
     "representation": "text",
     "digest": "061f813eee88736ec5683c8d25a06727ac82c2cffb7b1661a53b21d8d48c5c4f"
    },
    "lines": {
     "start": 4,
     "end": 18
    }
   }
  ]
 },
 {
  "proposition": "The review base profile grants only read, glob, grep and maestro_record_review (no bash), while the execution profile allows bash.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_ff8fb46cd771c3962db53b8402",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0a8495ac211de3d7345b835863",
      "revision": 1
     },
     "representation": "text",
     "digest": "4b26f438a585fa3d5f8088d6da03611bf4ab12196133fda186c38fb07edd1be7"
    },
    "quote": "bash: Object.freeze({ \"*\": \"allow\", ...publishRules(\"deny\") }),"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0a8495ac211de3d7345b835863",
      "revision": 1
     },
     "representation": "text",
     "digest": "4b26f438a585fa3d5f8088d6da03611bf4ab12196133fda186c38fb07edd1be7"
    },
    "quote": "maestro_record_review: \"allow\","
   }
  ]
 },
 {
  "proposition": "Brakeman's license classifies distributing it as part of a commercial product, or as a component of a value-added product, as Commercial Use requiring a paid license, so it cannot ship inside a commercial desktop app.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_e06ba9ca64692e62e4c8fef398",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_72a83ece0af7b326af5072b744",
      "revision": 1
     },
     "representation": "text",
     "digest": "2b0196c05fef771ab071d34b346f9fa625a5faceed3ef4a541fe8f7c8af42c64"
    },
    "quote": "Distributing the Software as a commercial product or as part of one."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_72a83ece0af7b326af5072b744",
      "revision": 1
     },
     "representation": "text",
     "digest": "2b0196c05fef771ab071d34b346f9fa625a5faceed3ef4a541fe8f7c8af42c64"
    },
    "quote": "Using the Software as a component of a value-added service/product."
   }
  ]
 },
 {
  "proposition": "Slither and Echidna are AGPLv3, and ShellCheck and hadolint are GPLv3; Slither claims under 1 second per contract and low false positives.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_e06ba9ca64692e62e4c8fef398",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_ce1c9c87ee85fa44f00e3305ea",
      "revision": 1
     },
     "representation": "text",
     "digest": "f2065d562ac5f121a0509f35b0fa9d26d91fd0aa22bc2650a490557e4fd5ea87"
    },
    "quote": "Slither is licensed and distributed under the AGPLv3 license."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_ce1c9c87ee85fa44f00e3305ea",
      "revision": 1
     },
     "representation": "text",
     "digest": "f2065d562ac5f121a0509f35b0fa9d26d91fd0aa22bc2650a490557e4fd5ea87"
    },
    "quote": "Average execution time of less than 1 second per contract"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_54f971249c6d41ebb69cfa4614",
      "revision": 1
     },
     "representation": "text",
     "digest": "0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0"
    },
    "quote": "GNU AFFERO GENERAL PUBLIC LICENSE"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_ebaf2d8c1d921a6c00e6b07f2d",
      "revision": 1
     },
     "representation": "text",
     "digest": "3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986"
    },
    "quote": "Version 3, 29 June 2007"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a25b471e9fd3a472332a893256",
      "revision": 1
     },
     "representation": "text",
     "digest": "589ed823e9a84c56feb95ac58e7cf384626b9cbf4fda2a907bc36e103de1bad2"
    },
    "quote": "Version 3, 29 June 2007"
   }
  ]
 },
 {
  "proposition": "Because GPLv3 treats a separate program shipped alongside others as an aggregate, GPL tools could be shipped as separate executables, but invoking them if installed or fetching them on demand is the lower-risk default for a commercial app.",
  "nature": "inference",
  "subquestion": {
   "id": "rque_e06ba9ca64692e62e4c8fef398",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_ebaf2d8c1d921a6c00e6b07f2d",
      "revision": 1
     },
     "representation": "text",
     "digest": "3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986"
    },
    "quote": "Inclusion of a covered work\nin an aggregate does not cause this License to apply to the other\nparts of the aggregate."
   }
  ]
 },
 {
  "proposition": "Psalm offers taint analysis via --taint-analysis with a separate baseline and emits SARIF reports.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_e577927c3fb06c0b0f8b4c70a0",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_fdbfbb4eada47b0f493e5e4eb1",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "54b6b755517f064f1a7af253793020135d4b51c5bec4016294d6b775709d75f0"
    },
    "quote": "You can enable this mode with the `--taint-analysis` command line flag."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_fdbfbb4eada47b0f493e5e4eb1",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "54b6b755517f064f1a7af253793020135d4b51c5bec4016294d6b775709d75f0"
    },
    "quote": "To generate a SARIF report run Psalm with the `--report` flag and a `.sarif` extension."
   }
  ]
 },
 {
  "proposition": "squawk lints Postgres migrations for lock/downtime hazards, supports a JSON reporter, an assume-in-transaction mode, and ships a language server.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_e577927c3fb06c0b0f8b4c70a0",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_20d97940123f4915cdbfe5d430",
      "revision": 1
     },
     "representation": "text",
     "digest": "54fb4c84d7bb8d6752b189b327b300dbf1dec0e44a9cd88e925c11eee4151feb"
    },
    "quote": "[possible values: tty, gcc, json, gitlab]"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_20d97940123f4915cdbfe5d430",
      "revision": 1
     },
     "representation": "text",
     "digest": "54fb4c84d7bb8d6752b189b327b300dbf1dec0e44a9cd88e925c11eee4151feb"
    },
    "quote": "server            Run the language server"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_20d97940123f4915cdbfe5d430",
      "revision": 1
     },
     "representation": "text",
     "digest": "54fb4c84d7bb8d6752b189b327b300dbf1dec0e44a9cd88e925c11eee4151feb"
    },
    "quote": "--assume-in-transaction"
   }
  ]
 },
 {
  "proposition": "Aqua publishes an official MIT-licensed Trivy MCP server installed as a Trivy plugin.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_305af5598ee3192f4a6e8569a0",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_6361bb14c476a96e32d1d48679",
      "revision": 1
     },
     "representation": "text",
     "digest": "fb11046c588c851a74a055db696725b41f7810da2357b5c58098c595804cb6c4"
    },
    "quote": "trivy plugin install mcp"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6361bb14c476a96e32d1d48679",
      "revision": 1
     },
     "representation": "text",
     "digest": "fb11046c588c851a74a055db696725b41f7810da2357b5c58098c595804cb6c4"
    },
    "quote": "MIT License - see the [LICENSE](./LICENSE) file for details."
   }
  ]
 },
 {
  "proposition": "Semgrep's official MCP server has moved from its standalone repo into the main semgrep binary.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_305af5598ee3192f4a6e8569a0",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_cf9340760ece89fa3e2a570375",
      "revision": 1
     },
     "representation": "text",
     "digest": "b0e199fcbf1caef8ab794fa94ff176689d3da9010ad4f389aac8694f24fed376"
    },
    "quote": "This repository has been deprecated, and further updates to the Semgrep MCP server will be made via the official `semgrep` binary."
   }
  ]
 },
 {
  "proposition": "In the SmartBugs ICSE 2020 study of 9 Solidity analyzers, all tools together detected only 42% of annotated vulnerabilities, Mythril was best at 27%, and 97% of real contracts were flagged, implying many false positives.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_00949edfd0dc71ddc090c3c9b9",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_2aa3e9d3d8ca9a6e8720f10877",
      "revision": 1
     },
     "representation": "text",
     "digest": "8e66f415417193d829e19315406ac07c2dd62afde12354437065168bcc0686f9"
    },
    "quote": "We found that only 42% of the vulnerabilities from our annotated dataset are detected by all the tools, with the tool Mythril having the higher accuracy (27%). When considering the largest dataset, we observed that 97% of contracts are tagged as vulnerable, thus suggesting a considerable number of false positives."
   }
  ]
 },
 {
  "proposition": "A per-ecosystem expert checklist and a first-pass (parse-only linters) vs deep-audit (taint, build-dependent analyzers, fuzzing, formal verification, mutation) ordering can be stated, and is given in the answer as reasoned guidance.",
  "nature": "inference",
  "subquestion": {
   "id": "rque_3504fa4eb6ff0637579329f65c",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_ce1c9c87ee85fa44f00e3305ea",
      "revision": 1
     },
     "representation": "text",
     "digest": "f2065d562ac5f121a0509f35b0fa9d26d91fd0aa22bc2650a490557e4fd5ea87"
    },
    "quote": "Because slither requires the solc AST, it must have all dependencies available."
   }
  ]
 }
]
