# Local check execution qualification

This is preparation for the local-check adapters tracked in #1558. It does not register an analyzer, alter the review dispatcher, or count the 83 candidates as integrated.

`ReviewLocalReadProcess.run` is a host-only literal-argv boundary. It requires a canonical projection directory and a canonical executable outside that directory. It accepts lower-only positive integer limits, capped at 30 seconds, 256 KiB per output stream and 512 MiB tree RSS, supervised by `ResearchProcess` through omni. The host must prepare the pinned sandbox before execution. A missing sandbox, an unverified PATH launcher, or an unsupported host refuses execution; there is no unconfined fallback or acquisition request on this path.

The existing sandbox's explicit read roots grant the projection, executable and a fresh home. Its existing trusted system/toolchain grants also apply; this is not a claim that every host path is unreadable. The sandbox denies source writes and network access, and allows writes to its disposable scratch directory. Linux can also accept new paths in its private `/tmp` mount; the host must observe no corresponding file creation. The child environment is constructed rather than inherited. This contract assumes a trusted host and private prepared cache; it does not defend against a hostile same-uid process replacing host-owned files during execution.

Initialization was qualified separately on Linux x64 and Windows x64. Analysis qualification here is Linux x64 only. Windows explicitly refuses this read-confined execution contract. macOS and ARM remain unqualified.

The hosted conformance fixtures use the actual prepared shfmt 3.14.1 and cargo-machete 0.9.2 executables. They exercise the existing base policy and independent scan projection. Source and projection bytes must remain unchanged. The jail probe first proves readable outside data, writable source/outside paths and live TCP/Unix sockets without confinement, then proves outside reads, source writes and both network connections denied with confinement while inside reads and scratch writes still succeed. Outside host data stays unchanged, and the private `/tmp` write attempt must create no host file. Output overflow, timeout and scratch cleanup are checked separately.

## Native results and adapter obligations

shfmt fixtures distinguish empty successful output, exit 1 with a unified formatting diff, and exit 1 with a syntax diagnostic. Explicit base-policy flags override head EditorConfig; only the selected shell file is passed. A future adapter must preserve syntax/launch/capture failures as acquisition errors rather than formatting results.

cargo-machete fixtures distinguish used and unused dependencies, prove that `--no-ignore` defeats a repository `.ignore`, and retain a malformed manifest's native error even when its exit code is zero. Parent workspace metadata and an escaped library source have unconfined positive controls and must not yield a native clean result through the jail. The future adapter must classify all nonroutine diagnostics, including errors printed with exit zero, as acquisition errors and retain bounded raw evidence. Its reviewed manifest metadata can suppress native findings; coverage must disclose that behavior.

Before invoking cargo-machete, the future adapter must validate manifest targets, dependency paths and workspace paths against the projection. An outside path must be refused even if it happens to fall within a trusted host toolchain grant. Paths resolving to another location inside the projection may remain supported. This preparation does not implement that adapter preflight, classify raw outcomes, or claim correctness for newly added dependencies.

The adapter must use the same executor and the prepared process-local identity from `ReviewLocalTools.locate`, without PATH fallback, Cargo builds, `--with-metadata`, `--fix`, network access or tool acquisition during analysis. Public routing and the full epic gate remain later steps.

Primary native behavior: [cargo-machete v0.9.2 command and exit handling](https://github.com/bnjbvr/cargo-machete/blob/v0.9.2/src/main.rs), [manifest source and workspace traversal](https://github.com/bnjbvr/cargo-machete/blob/v0.9.2/src/search_unused.rs), [shfmt v3.14.1 command](https://github.com/mvdan/sh/blob/v3.14.1/cmd/shfmt/main.go).
