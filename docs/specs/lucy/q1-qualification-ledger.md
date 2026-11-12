# Remaining tool qualification ledger

Q1 covers the 83 named tools below. This ledger separates source-fact review from runtime integration. None of these rows adds a tool to a review lane. Versions and evidence for the first eleven reviewed rows are in the linked qualification notes. Other captured facts still need independent review; incomplete rows retain their research gaps.

Status: **reviewed** = independent primary-source fact review complete; **captured** = researcher reports complete, cold review pending; **incomplete** = research gaps remain.

- [JavaScript and Python reviewed facts](q1-js-python-qualification.md) (5 tools).
- [Infrastructure reviewed facts](q1-infra-qualification.md) (6 tools).

## rust

| Tool | Fact review | Remaining work |
| --- | --- | --- |
| cargo-geiger | incomplete | named network endpoints when --offline is absent |
| cargo-machete | captured | Independent fact review, then invocation design. |
| clippy | incomplete | tarball members; clippy_lints::explain return codes; lint diagnostic schema; cargo network when clippy runs |
| clippy-sarif | incomplete | published checksum of the GitHub native binaries |
| cargo-semver-checks | incomplete | default baseline network; rustdoc child argv; lint line schema; tarball members |
| Miri | incomplete | component checksum; miri git pin; argv; exit; effects |
| cargo-careful | incomplete | exit codes; stdout schema; aarch64 binary |
| loom | captured | Independent fact review, then invocation design. |
| shuttle | captured | Independent fact review, then invocation design. |
| Kani | incomplete | tarball members; full argv; exit; network |
| cargo-deny | incomplete | exit codes; output schema; network behavior; tarball members |
| govulncheck | incomplete | binary asset; argv; exit; network to vuln.go.dev |
| difftastic | captured | Independent fact review, then invocation design. |
| SCIP | incomplete | release assets; whether a separate scip CLI was intended |
| OpenGrep | incomplete | argv; exit; network; which asset is the runtime to invoke |

## js-python

| Tool | Fact review | Remaining work |
| --- | --- | --- |
| tsgo | incomplete | network and children outside the CLI entry files |
| typescript-eslint | reviewed | Define and prove an invocation and runtime lane. |
| api-extractor | reviewed | Define and prove an invocation and runtime lane. |
| publint | reviewed | Define and prove an invocation and runtime lane. |
| arethetypeswrong | reviewed | Define and prove an invocation and runtime lane. |
| dependency-cruiser | incomplete | exitSemantics; network |
| knip | incomplete | output schema; network; config execution; writes |
| bandit | captured | Independent fact review, then invocation design. |
| pip-audit | reviewed | Define and prove an invocation and runtime lane. |
| diff-cover | captured | Independent fact review, then invocation design. |
| pyright | captured | Independent fact review, then invocation design. |
| mypy | captured | Independent fact review, then invocation design. |
| pylint | captured | Independent fact review, then invocation design. |
| Pysa | incomplete | 0.10.0 LICENSE; exit codes; watchman on 0.10.0; wheel is not a pure-python proof |
| griffe | captured | Independent fact review, then invocation design. |
| atheris | incomplete | 3.1.0 LICENSE; 3.1.0 argv/exit; native prerequisite versions |
| Django check | incomplete | numeric exit code; network; writes |

## jvm-mobile

| Tool | Fact review | Remaining work |
| --- | --- | --- |
| Error Prone | incomplete | dataflow-errorprone-3.41.0-eisop1.jar sha256 and its license text; concrete javac argv (not in the tag; only an untagged website link); numeric host javac exit codes; patch file layout (PatchFileDestination.java not read) |
| NullAway | incomplete | jar sha256; diagnostic sentence templates; severity passed to Error Prone; fix-serialization write path |
| detekt | incomplete | official asset checksum (GitHub digest null; not hashed locally); network use |
| SpotBugs | incomplete | TextUICommandLine reporter/option names; report-file write flags |
| FindSecBugs | incomplete | zip checksum (API digest absent; not hashed); exact spotbugs plugin argv; whether the zip bundles a wrapper script |
| Checkstyle | captured | Independent fact review, then invocation design. |
| PMD | captured | Independent fact review, then invocation design. |
| CPD | captured | Independent fact review, then invocation design. |
| japicmp | captured | Independent fact review, then invocation design. |
| OWASP Dependency-Check | captured | Independent fact review, then invocation design. |
| Roslynator | captured | Independent fact review, then invocation design. |
| dotnet list package | incomplete | SDK license text and sha256; installer checksum; verb-first compatibility on 10.0.404; vulnerability exit code |
| Stryker.NET | incomplete | nupkg checksum; argv options; exit codes; report paths |
| PublicApiAnalyzers | incomplete | license file sha256; diagnostic IDs; official Microsoft docs for the two txt files |
| SwiftLint | incomplete | default reporter; numeric exit codes; child processes |
| Periphery | incomplete | exit codes; report format flags; whether scan --setup writes a yaml file |
| swift package diagnose-api-breaking-changes | incomplete | toolchain version; license text and sha256; argv; output; exit codes |

## native-web

| Tool | Fact review | Remaining work |
| --- | --- | --- |
| clang-tidy | incomplete | archive member path of the clang-tidy executable |
| cppcheck | incomplete | --output-file flag not in the fetched help slice; network |
| Infer | incomplete | bundled third-party license hashes; network |
| CodeChecker | incomplete | parse.py sys.exit(2) condition not captured; pip package checksum; statistics collect network |
| ASan | incomplete | numeric exit code; archive member name of the ASan runtime |
| UBSan | incomplete | numeric exit code for -fno-sanitize-recover; archive member name of the runtime |
| libFuzzer | incomplete | numeric code when DONE is printed; archive member name |
| CBMC | incomplete | network; deb/msi third-party notices |
| Frama-C | incomplete | license text sha256; argv; output; exitSemantics; archive bytes not hashed locally |
| RuboCop | incomplete | network; exact cache file path |
| bundler-audit | incomplete | explicit success exit 0 not written in cli.rb |
| Sorbet | incomplete | argv; output; exitSemantics; sorbet-static asset checksum; effects |
| Steep | incomplete | argv; output; exitSemantics; effects |
| strong_migrations | incomplete | argv; output; exitSemantics; effects; whether any executable is shipped |
| PHPStan | incomplete | argv; output; exitSemantics; default effects |
| Psalm | incomplete | analysis success path does not contain an explicit exit(0); the 0 is the tagged doc plus falling off the end |
| composer audit | incomplete | audit argv; output; exitSemantics; audit-specific effects |
| Infection | incomplete | argv; output; exitSemantics; effects; phar third-party notices |
| Roave | incomplete | exact published version; packagist dist checksum |

## infra

| Tool | Fact review | Remaining work |
| --- | --- | --- |
| shfmt | reviewed | Define and prove an invocation and runtime lane. |
| sqlfluff | reviewed | Define and prove an invocation and runtime lane. |
| Trivy | reviewed | Define and prove an invocation and runtime lane. |
| Checkov | reviewed | Define and prove an invocation and runtime lane. |
| tflint | reviewed | Define and prove an invocation and runtime lane. |
| kube-linter | captured | Independent fact review, then invocation design. |
| kubeconform | reviewed | Define and prove an invocation and runtime lane. |
| OpenTofu | captured | Independent fact review, then invocation design. |
| Slither | captured | Independent fact review, then invocation design. |
| Echidna | captured | Independent fact review, then invocation design. |
| Mythril | incomplete | wheel digest not printed in the first PyPI url; docker digest; sys.exit() numeric code |
| Foundry | incomplete | forge fmt/test exit integers |
| Conftest | captured | Independent fact review, then invocation design. |
| ScanCode | incomplete | release-bundle SHA256; full third-party licence expression beyond PyPI truncation |
| REUSE | captured | Independent fact review, then invocation design. |

## Checkpoint

Source facts: 11 reviewed, 22 captured, 50 incomplete. Runtime integrations from this Q1 batch: 0.

A missing standalone binary, build prerequisite, executable project config, network dependency, plugin, or mixed license is an invocation-design constraint. It is not a blanket exclusion or a demonstrated safe mode.
