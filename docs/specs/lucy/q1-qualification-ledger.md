# Q1 source-fact ledger

Q1 records pinned source facts for the 83 tools below. A card describes a bounded analysis invocation, its evidence, and its remaining limits. Independent review applies to the claims stated in that card; it does not fill unread fields or establish runtime safety.

No tool in this Q1 batch is added to a review lane. Runtime integrations from Q1: **0**. Invocation design, platform qualification, confinement, output binding, and redistribution clearance remain separate work. A source-build requirement, executable project config, network dependency, plugin, or mixed license is a design constraint, not a blanket exclusion or a demonstrated safe mode.

Artifact hashes identify the selected bytes or the explicitly named publisher digest. License-text hashes identify license text, not executable integrity. Cards distinguish publisher metadata, local byte checks, signatures not verified, and toolchain or notice gaps. Libraries, compiler components, plugins, and metapackages are kept in their actual form.

## Source cards

### rust

| Tool | Pinned version | Source facts |
| --- | --- | --- |
| cargo-geiger | 0.14.0 | [Card](q1-rust-tools-facts.md) |
| cargo-machete | 0.9.2 | [Card](q1-rust-tools-facts.md) |
| clippy | rust 1.99.1 component clippy-preview | [Card](q1-rust-tools-facts.md) |
| clippy-sarif | 0.8.0 | [Card](q1-rust-tools-facts.md) |
| cargo-semver-checks | 0.51.0 | [Card](q1-rust-tools-facts.md) |
| Miri | 0.1.0-nightly (channel 2026-11-12, rustc 3ef0c22cdb86ac42dc6b8f0f1ec36857daa6f2a1) | [Card](q1-rust-tools-facts.md) |
| cargo-careful | 0.4.10 | [Card](q1-rust-tools-facts.md) |
| loom | 0.7.3 | [Card](q1-rust-tools-facts.md) |
| shuttle | 0.9.10 | [Card](q1-rust-analysis-facts.md) |
| Kani | 0.68.0 | [Card](q1-rust-analysis-facts.md) |
| cargo-deny | 0.20.2 | [Card](q1-rust-analysis-facts.md) |
| govulncheck | 1.9.0 | [Card](q1-rust-analysis-facts.md) |
| difftastic | 0.72.0 | [Card](q1-rust-analysis-facts.md) |
| SCIP | 0.10.0 | [Card](q1-rust-analysis-facts.md) |
| OpenGrep | 1.33.1 | [Card](q1-rust-analysis-facts.md) |

### js-python

| Tool | Pinned version | Source facts |
| --- | --- | --- |
| tsgo | typescript/v7.0.2 | [Card](q1-js-python-1-facts.md) |
| typescript-eslint | 8.72.2 | [Card](q1-js-python-qualification.md) |
| api-extractor | 7.60.1 | [Card](q1-js-python-qualification.md) |
| publint | 0.3.25 | [Card](q1-js-python-qualification.md) |
| arethetypeswrong | 0.18.5 | [Card](q1-js-python-qualification.md) |
| dependency-cruiser | 18.7.2 | [Card](q1-js-python-1-facts.md) |
| knip | 6.45.1 | [Card](q1-js-python-1-facts.md) |
| bandit | 1.9.4 | [Card](q1-js-python-1-facts.md) |
| pip-audit | 2.10.1 | [Card](q1-js-python-qualification.md) |
| diff-cover | 11.0.1 | [Card](q1-js-python-1-facts.md) |
| pyright | 1.1.414 | [Card](q1-js-python-1-facts.md) |
| mypy | 2.4.1 | [Card](q1-js-python-2-facts.md) |
| pylint | 4.1.3 | [Card](q1-js-python-2-facts.md) |
| Pysa | pyre-check 0.10.0 (PyPI); GitHub tags stop at v0.9.25 | [Card](q1-js-python-2-facts.md) |
| griffe | 2.4.1 | [Card](q1-js-python-2-facts.md) |
| atheris | 3.1.0 | [Card](q1-js-python-2-facts.md) |
| Django check | Django 6.1.3 | [Card](q1-js-python-2-facts.md) |

### jvm-mobile

| Tool | Pinned version | Source facts |
| --- | --- | --- |
| Error Prone | 2.52.0 | [Card](q1-jvm-mobile-1-facts.md) |
| NullAway | 0.14.3 | [Card](q1-jvm-mobile-1-facts.md) |
| detekt | 1.23.8 | [Card](q1-jvm-mobile-1-facts.md) |
| SpotBugs | 4.10.5 | [Card](q1-jvm-mobile-1-facts.md) |
| FindSecBugs | 1.14.0 | [Card](q1-jvm-mobile-1-facts.md) |
| Checkstyle | 14.4.0 | [Card](q1-jvm-mobile-1-facts.md) |
| PMD | 7.29.0 | [Card](q1-jvm-mobile-2-facts.md) |
| CPD | 7.29.0 | [Card](q1-jvm-mobile-2-facts.md) |
| japicmp | 0.27.0 | [Card](q1-jvm-mobile-2-facts.md) |
| OWASP Dependency-Check | 13.0.0 | [Card](q1-jvm-mobile-2-facts.md) |
| Roslynator | 5.0.1 | [Card](q1-jvm-mobile-2-facts.md) |
| dotnet list package | SDK 10.0.404 (channel 10.0 latest-sdk; also active channel 11.0 latest-sdk 11.0.100) | [Card](q1-jvm-mobile-2-facts.md) |
| Stryker.NET | 5.1.0 | [Card](q1-jvm-mobile-3-facts.md) |
| PublicApiAnalyzers | 5.6.0 | [Card](q1-jvm-mobile-3-facts.md) |
| SwiftLint | 0.65.1 | [Card](q1-jvm-mobile-3-facts.md) |
| Periphery | 3.8.0 | [Card](q1-jvm-mobile-3-facts.md) |
| swift package diagnose-api-breaking-changes | swift-6.4.2-RELEASE checkout scheme names swiftpm branch release/6.4.2; branch tip commit seen 8054c59f07a9c8cc8e67b3ec57870710c7154854. APIDiff.swift bytes identical at that tip and at last file commit 7f95f588ad40a748522e7be928daadc079a66c3c (sha256 bc432d7e199263b2e99085ce7dde8a5279c7367dab634d496423ea3309578a75). Exact tag gitlink not captured. | [Card](q1-jvm-mobile-3-facts.md) |

### native-web

| Tool | Pinned version | Source facts |
| --- | --- | --- |
| clang-tidy | llvmorg-23.1.5 | [Card](q1-native-web-1-facts.md) |
| cppcheck | 2.22.0 | [Card](q1-native-web-1-facts.md) |
| Infer | v1.3.0 | [Card](q1-native-web-1-facts.md) |
| CodeChecker | v6.29.3 | [Card](q1-native-web-1-facts.md) |
| ASan | llvmorg-23.1.5 compiler-rt runtime; no independent release | [Card](q1-native-web-1-facts.md) |
| UBSan | llvmorg-23.1.5 compiler-rt runtime; no independent release | [Card](q1-native-web-1-facts.md) |
| libFuzzer | llvmorg-23.1.5 compiler-rt/lib/fuzzer; no independent release | [Card](q1-native-web-1-facts.md) |
| CBMC | cbmc-6.11.0 | [Card](q1-native-web-2-facts.md) |
| Frama-C | 33.0 (Arsenic) | [Card](q1-native-web-2-facts.md) |
| RuboCop | 1.92.2 | [Card](q1-native-web-2-facts.md) |
| bundler-audit | 0.9.3 | [Card](q1-native-web-2-facts.md) |
| Sorbet | 0.6.13672 | [Card](q1-native-web-2-facts.md) |
| Steep | 2.1.0 | [Card](q1-native-web-2-facts.md) |
| strong_migrations | 2.8.0 | [Card](q1-native-web-2-facts.md) |
| PHPStan | 2.3.5 | [Card](q1-native-web-3-facts.md) |
| Psalm | 7.3.1 | [Card](q1-native-web-3-facts.md) |
| composer audit | Composer 2.11.2 | [Card](q1-native-web-3-facts.md) |
| Infection | 0.35.10 | [Card](q1-native-web-3-facts.md) |
| Roave | dev-latest@9fb1049dda127f1732cac541e68f8e490db77825 | [Card](q1-native-web-3-facts.md) |

### infra

| Tool | Pinned version | Source facts |
| --- | --- | --- |
| shfmt | v3.14.1 | [Card](q1-infra-qualification.md) |
| sqlfluff | 4.5.0 | [Card](q1-infra-qualification.md) |
| Trivy | v0.76.2 | [Card](q1-infra-qualification.md) |
| Checkov | 3.4.4 | [Card](q1-infra-qualification.md) |
| tflint | v0.66.0 | [Card](q1-infra-qualification.md) |
| kube-linter | v0.8.3 | [Card](q1-infra-1-facts.md) |
| kubeconform | v0.8.0 | [Card](q1-infra-qualification.md) |
| OpenTofu | v1.13.9 | [Card](q1-infra-1-facts.md) |
| Slither | 0.11.6 | [Card](q1-infra-1-facts.md) |
| Echidna | v2.4.0 | [Card](q1-infra-1-facts.md) |
| Mythril | 0.24.8 | [Card](q1-infra-1-facts.md) |
| Foundry | v1.9.0 | [Card](q1-infra-2-facts.md) |
| Conftest | 0.71.1 | [Card](q1-infra-2-facts.md) |
| ScanCode | 32.5.0 | [Card](q1-infra-2-facts.md) |
| REUSE | 6.2.0 | [Card](q1-infra-2-facts.md) |

## Next gate

Choose one bounded invocation and platform at a time. Preserve the card's executable-config, network, child-process, write, and licensing constraints in that contract. Prove that invocation with change-scoped hosted tests and independent review before adding it to a runtime lane. This ledger grants no installation, packaging, or lane availability.
