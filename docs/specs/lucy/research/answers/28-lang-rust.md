# 28-lang-rust

session ses_818c1517bd4378fb28494d4b4f4d90d6f171d0267265bee51894740cd112e059

## Answer

**Conclusion.** The premise only half-holds. `lucy` exists, but today it is a read-only review seat with no skills, no toolkit and no bash, so it cannot run any Rust tool. Here is how I'd set it up:
- **Two lanes.** A no-build lane reads only lockfiles and sources and is safe on untrusted repos: cargo-audit `--file`, cargo-deny, cargo-geiger, cargo-machete. An opt-in build lane runs clippy, Miri, careful, mutants and semver-checks, because building executes `build.rs` and proc-macros.
- **Where it runs.** Both lanes run through Orchestra's sandboxed process layer from pinned binaries, with JSON→SARIF output going into `maestro_record_review`.
- **What ships in the skill.** The *method* ships as a lucy seat skill: tool selection, flags, how to triage findings and the human checklist. Third-party MCP servers are not needed.

**Supporting claims**
1. read — lucy is `profile: "review"`, `skills: []`, `toolkit: false`, and its description says it "cannot edit or run commands" (`modules/maestro/coordination/src/seats/lucy.ts:11-17`).
2. read — the review base profile grants only read, glob, grep and `maestro_record_review`, with no bash (`modules/maestro/coordination/src/roster.ts:49-56`).
3. read — the pinned-engine toolkit throws for any seat other than `backend` (`modules/maestro/coordination/src/seats/seat.ts:64-67`). Lucy needs a new confined, read-only runner, like jimmy's `probe_run`, rather than `toolkit: true`.
4. read — clippy (MIT/Apache):
   - 800+ lints.
   - `pedantic` "occasional false positives".
   - `restriction` must "emphatically" not be enabled whole, so pick lints one by one (`unwrap_used`, `indexing_slicing`, `undocumented_unsafe_blocks`…).
   - `clippy-sarif`/`miri-sarif` (MIT) give SARIF output.
5. read — Miri (MIT/Apache, nightly) detects UB, data races and aliasing violations, but only in the executions it runs. It has no FFI or networking support, and it compiles N+1 times under nextest. It defers complicated atomics to loom. cargo-careful is faster, supports FFI and offers sanitizers, but catches less.
6. read — cargo-semver-checks (Apache/MIT):
   - aims at zero false positives;
   - exit codes 0/100/101;
   - `--baseline-rev` for a git baseline;
   - misses type and generics breaks.
7. read — cargo-audit (Apache/MIT) warns that Cargo can execute project code. For untrusted repos it says to use `cargo audit --file path/Cargo.lock` from outside the repo.
8. read — supply chain:
   - cargo-deny (Apache/MIT) covers licenses, bans, advisories and sources.
   - cargo-vet (Apache/MIT) records audit attestations.
   - crates.io has had OIDC Trusted Publishing since July 2025.
9. read — cargo-geiger only counts unsafe usage, as input to an audit rather than a verdict. Use it to scope the manual unsafe review.
10. read — cargo-mutants has `--in-diff` for diff-scoped runs. Its maintainer says it is semi-actively maintained as of August 2026.
11. read — cargo-machete (MIT) is "fast (yet imprecise)" and has `--json`. Its `--with-metadata` flag "may modify Cargo.lock", so lucy must not use that flag.
12. read — formal tools: Kani (MIT/Apache) is a bit-precise model checker driven by harnesses. MIRAI (MIT) offers panic linting and taint analysis; I did not verify its maintenance state.
13. read — SAST: CodeQL Rust has been GA since 2025-10-14 (CLI 2.23.3) and covers the OWASP Top 10 except vulnerable components. CodeQL's licence limits use to OSS or GHAS, so invoke it only if the user has it.
14. read — MCP: the community rust-mcp-server wraps clippy, deny and machete, but it also exposes mutating tools (cargo-add, cargo-update, rustup-toolchain-add) that must be disabled one by one. It adds nothing over direct confined CLI runs.
15. read — rustup obeys a repo's `rust-toolchain.toml` unless the caller sets `+toolchain` or `RUSTUP_TOOLCHAIN`.
   - inferred: to detect the build system, look for `Cargo.toml`/`Cargo.lock`/workspace and `rust-toolchain.toml`, and treat `BUCK`/`BUILD.bazel`/`flake.nix` as non-cargo.
   - inferred: to keep the repo untouched, pin `RUSTUP_TOOLCHAIN`, use `--locked --offline` and a temporary `CARGO_TARGET_DIR`.
   - inferred: if the toolchain is missing, report "not run: toolchain X absent" instead of installing it.
16. inferred — **first pass** (minutes):
   1. audit/deny on the lockfile
   2. clippy (default plus selected pedantic/restriction lints) as SARIF
   3. semver-checks for libraries
   4. geiger to find the unsafe hot spots

   **Deep audit:** Miri/careful on tests, mutants `--in-diff`, then loom/shuttle/Kani on concurrency or unsafe kernels.
   **Human checklist** that tools miss:
   - `// SAFETY:` invariants on every `unsafe` and every `unsafe impl Send/Sync`;
   - panics across FFI and `extern "C"`;
   - drop order and leak amplification (`mem::forget`);
   - panic safety in unsafe code that holds partial state;
   - `as` truncation and casts;
   - lock held across `.await`, blocking calls in async, and cancellation safety;
   - `Ordering::Relaxed` misuse;
   - `build.rs`/proc-macro side effects;
   - feature unification;
   - `unwrap` on untrusted input;
   - `Deref` abuse and leaking public API types.

**Not examined** (deadline):
- loom, shuttle, proptest, cargo-fuzz/libFuzzer, llvm-cov/tarpaulin, Prusti/Creusot/Verus, cargo-udeps, Semgrep, gitleaks/trufflehog, cargo-auditable/cyclonedx, and rust-analyzer MCP quality.
- Laptop speed and memory, and measured false-positive rates for clippy, Miri and machete: none of the captured sources publish numbers.
- A follow-up dispatch on those sources would decide them.

**Reproduce:** `cargo audit --file <repo>/Cargo.lock` from outside the repo, then `cargo clippy --message-format=json --locked | clippy-sarif`.

## Claims

[
 {
  "subquestion": {
   "id": "rque_dbdb4f439ddbb9cfeac38f2769",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "lucy exists but today is read-only: review profile, no skills, no toolkit, and its description says it cannot run commands.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a34351b35e8c5a972e39c7ee2f",
      "revision": 1
     },
     "representation": "text",
     "digest": "061f813eee88736ec5683c8d25a06727ac82c2cffb7b1661a53b21d8d48c5c4f"
    },
    "lines": {
     "start": 11,
     "end": 17
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_dbdb4f439ddbb9cfeac38f2769",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "The review base profile denies everything except read, glob, grep and maestro_record_review, so bash is not granted.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7ebf226d0d9f5038720026f876",
      "revision": 1
     },
     "representation": "text",
     "digest": "5753f8000a7f0c17f46ee3bad4f2152fa986254a3235810afa01f8b508d6a65c"
    },
    "lines": {
     "start": 49,
     "end": 56
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_dbdb4f439ddbb9cfeac38f2769",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "The pinned-engine toolkit is restricted to the backend seat by a define-time check, so lucy cannot simply set toolkit: true.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_da56e7b666a2b2b6bfc04e3306",
      "revision": 1
     },
     "representation": "text",
     "digest": "9326a2e5f7533d2c86db706ef307480a48b936fa0723beb47f97b16da8132199"
    },
    "lines": {
     "start": 64,
     "end": 67
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e609b86c33c1f8d09db30f546d",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Clippy has 800+ lints; pedantic is documented as prone to occasional false positives, and restriction must not be enabled as a whole. Clippy is MIT OR Apache-2.0.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7e46014b791c30f2c8cc85d4d8",
      "revision": 1
     },
     "representation": "text",
     "digest": "4908aae9be494e56e4839a1a93a1e99a721c59ce080cb931528b750a3e6da7d3"
    },
    "quote": "The `restriction` category should, *emphatically*, not be enabled as a whole."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7e46014b791c30f2c8cc85d4d8",
      "revision": 1
     },
     "representation": "text",
     "digest": "4908aae9be494e56e4839a1a93a1e99a721c59ce080cb931528b750a3e6da7d3"
    },
    "quote": "lints which are rather strict or have occasional false positives"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_d41d6a66a89cfb573641caf4ca",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "clippy-sarif and miri-sarif (sarif-rs, MIT) convert clippy JSON and Miri diagnostics to SARIF.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3cb4d75819961b9aa735e659f6",
      "revision": 1
     },
     "representation": "text",
     "digest": "96c66d19718ead7d5735eb54ed50157f715032173d8239b60ca438ed08422639"
    },
    "quote": "$ cargo clippy --message-format=json | clippy-sarif | sarif-fmt"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_3cb4d75819961b9aa735e659f6",
      "revision": 1
     },
     "representation": "text",
     "digest": "96c66d19718ead7d5735eb54ed50157f715032173d8239b60ca438ed08422639"
    },
    "quote": "License: MIT"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e609b86c33c1f8d09db30f546d",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Miri (MIT/Apache, nightly) finds UB such as OOB, use-after-free, invalid values, data races and aliasing violations, but it checks only the executions it runs, so a clean run does not prove soundness. It has no FFI or networking support. For complicated atomics it points to loom.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_60899229a095da998703b512f3",
      "revision": 1
     },
     "representation": "text",
     "digest": "2a49a1cfdceaaa53d3ee7a51249796f95fe1dc5dddb755962ed0845814d2376c"
    },
    "quote": "When Miri finds\nUB, your code is definitely unsound, but when Miri does not find UB, then you may just have to test\nmore inputs or more possible non-deterministic choices."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_60899229a095da998703b512f3",
      "revision": 1
     },
     "representation": "text",
     "digest": "2a49a1cfdceaaa53d3ee7a51249796f95fe1dc5dddb755962ed0845814d2376c"
    },
    "quote": "To be really sure about complicated atomic\n  code, use specialized tools such as [loom](https://github.com/tokio-rs/loom)."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e609b86c33c1f8d09db30f546d",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "cargo-careful runs tests against a debug-assertion std with extra UB checks and optional sanitizers. It is faster than Miri and supports FFI, but catches less.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_6bfc62cc3d690a5958ce404f3e",
      "revision": 1
     },
     "representation": "text",
     "digest": "09eb27180f0e690bc79e2cd52cd9fb00496a4e9f95d99ad623e2334662aa1b7a"
    },
    "quote": "The advantage of `cargo careful` over Miri is that it works on all code, supports using arbitrary system and C FFI functions, and is much faster."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_d41d6a66a89cfb573641caf4ca",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "cargo-semver-checks (Apache/MIT) treats false positives as bugs, uses distinct exit codes 0/100/101 and accepts a git baseline via --baseline-rev. It does not catch every break, for example type changes or generics.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_774806fa9247d40139390574b4",
      "revision": 1
     },
     "representation": "text",
     "digest": "b65c60a3afa19016ff3213ca047282c0be3046652e3139097596932066a72607"
    },
    "quote": "A design goal of `cargo-semver-checks` is to not have false positives."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_774806fa9247d40139390574b4",
      "revision": 1
     },
     "representation": "text",
     "digest": "b65c60a3afa19016ff3213ca047282c0be3046652e3139097596932066a72607"
    },
    "quote": "- breaking type changes, for example in the type of a field or function parameter"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_9efc494a26686acc4de6469aad",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "cargo-audit (Apache/MIT) warns that Cargo can execute project code. For untrusted repos it says to pass the lockfile with --file and run outside the project dir, which avoids generating a lockfile and reading project config.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_e61f725d375ea5ece80e2022f1",
      "revision": 1
     },
     "representation": "text",
     "digest": "7f34b558e58682bc7c543736e9b4ab5b58eeacfa3aee6016e89f25e76d48cfa0"
    },
    "quote": "If `Cargo.lock` is missing, `cargo audit` runs `cargo update --workspace` to generate one, and Cargo can execute code from the project it runs in"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_e61f725d375ea5ece80e2022f1",
      "revision": 1
     },
     "representation": "text",
     "digest": "7f34b558e58682bc7c543736e9b4ab5b58eeacfa3aee6016e89f25e76d48cfa0"
    },
    "quote": "$ cargo audit --file path/to/Cargo.lock"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e609b86c33c1f8d09db30f546d",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "cargo-deny (Apache/MIT) checks licenses, bans/duplicates, advisories and sources. cargo-vet (Apache/MIT) checks that dependencies have been audited by a trusted entity.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_407454e32e26e476880e755aad",
      "revision": 1
     },
     "representation": "text",
     "digest": "444efde034b8e4a854b964d81f7a1a3ccfa2bfaa16f3b1524d590c4d521c76d8"
    },
    "quote": "The sources check ensures crates only come from sources you trust."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7deef70465d50abf07bd89a16d",
      "revision": 1
     },
     "representation": "text",
     "digest": "3b8f1497d669f72d4a9fb1df1d22db5f9467c36da250abfb9f0268f0fed3a62e"
    },
    "quote": "ensure that third-party Rust dependencies have been audited by a trusted entity"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e609b86c33c1f8d09db30f546d",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "cargo-geiger only counts unsafe usage across a crate and its dependencies. It is statistical input to an audit, not a verdict.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d217029896ba84a0bd9a1a46dd",
      "revision": 1
     },
     "representation": "text",
     "digest": "18fc77a89131c4abaf6f55d299a70acab87902d3533bdf7a8a0c646218c2b26e"
    },
    "quote": "This tool is not meant to advise directly whether the code ultimately is truly insecure or not."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_d41d6a66a89cfb573641caf4ca",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "cargo-mutants has a diff-scoped mode (--in-diff) that only tests mutants overlapping the changed regions. Its maintainer calls it a semi-actively maintained spare-time project as of August 2026.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_9d1c99379a62a6b04e4412ca91",
      "revision": 1
     },
     "representation": "text",
     "digest": "e0cd5fc1ef93a0dffd67f67d2244706f6d36f7db3fe5d3128af3bcbcac04ffb2"
    },
    "quote": "The --in-diff DIFF_FILE option tests only mutants that overlap with regions changed in the diff."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c618a5bb72cfeb7c9d81cb887c",
      "revision": 1
     },
     "representation": "text",
     "digest": "3557af492ba011955d14c51972b29d97c2b33797c5ebfefc107dd259ffe7782e"
    },
    "quote": "As of August 2026 this is an semi-actively-maintained spare time project"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_d41d6a66a89cfb573641caf4ca",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "cargo-machete (MIT) is fast but imprecise. It has a --json mode, and its --with-metadata flag (fewer false positives) may modify Cargo.lock.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_194ba82833c02a8dcd8920b1a0",
      "revision": 1
     },
     "representation": "text",
     "digest": "bf99e499267a54c347e3d70e6344662ed568fbdb76522de094796182ee1f3ca0"
    },
    "quote": "in a fast (yet imprecise) way"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_194ba82833c02a8dcd8920b1a0",
      "revision": 1
     },
     "representation": "text",
     "digest": "bf99e499267a54c347e3d70e6344662ed568fbdb76522de094796182ee1f3ca0"
    },
    "quote": "This may modify the\n`Cargo.lock` files in your projects."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e609b86c33c1f8d09db30f546d",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Kani (MIT/Apache) is a bit-precise model checker for UB, panics, overflow and contracts, driven by #[kani::proof] harnesses. MIRAI (MIT) is a MIR abstract interpreter offering panic linting, taint analysis and diagnostic levels.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0a05b37f16b04cd685bfe8f5ac",
      "revision": 1
     },
     "representation": "text",
     "digest": "6e4a517a521ed4eb648f4f47176e7d2d6f242144dd4b6028832e3cbdd7e19fa8"
    },
    "quote": "The Kani Rust Verifier is a bit-precise model checker for Rust."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_776f4e5f648f47ea2151850b25",
      "revision": 1
     },
     "representation": "text",
     "digest": "dd7ff3bc32ffa7cc914d40df73eda8e2403ae34709c111e56846f858b64b39ec"
    },
    "quote": "MIRAI can be used to look for security bugs via taint analysis"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e609b86c33c1f8d09db30f546d",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "CodeQL Rust support has been GA since 2025-10-14 (CLI 2.23.3) and covers OWASP Top 10 except vulnerable components.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_82570678b2032319ee407e7c7d",
      "revision": 1
     },
     "representation": "text",
     "digest": "cc530740988329340043a4f9b95c63b88b60221f60df8c7cd37085929be14876"
    },
    "quote": "We now identify issues for all OWASP Top 10 categories, except A06:2021-Vulnerable and Outdated Components"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e609b86c33c1f8d09db30f546d",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "crates.io has supported OIDC Trusted Publishing since July 2025, initially for GitHub Actions only.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f2cc1cec34b92850d17301e926",
      "revision": 1
     },
     "representation": "text",
     "digest": "c65bfca9dda50e4d28a1db7d5c6e4829e121af1d514ca36747a43eb8fd7bcd40"
    },
    "quote": "That repository is then allowed to request a short-lived API token for publishing in a secure way using OpenID Connect (OIDC)."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_1d27587ad0abb42ab48ce38486",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "The community rust-mcp-server exposes cargo check/clippy/test, cargo-deny and cargo-machete as MCP tools. It also exposes mutating tools (cargo-add, cargo-update, rustup-toolchain-add) that can be disabled one by one with --disable-tool.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_e6ec3ab6dcd6b3c3d1e830c546",
      "revision": 1
     },
     "representation": "text",
     "digest": "81fb5a093046cfab358c9653fcd913e7b49c5af24454a4390a2e3b2a20028765"
    },
    "quote": "**`cargo-deny-check`**: Check for security advisories, license compliance, and banned crates"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_e6ec3ab6dcd6b3c3d1e830c546",
      "revision": 1
     },
     "representation": "text",
     "digest": "81fb5a093046cfab358c9653fcd913e7b49c5af24454a4390a2e3b2a20028765"
    },
    "quote": "Disables a specific tool by name."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_9efc494a26686acc4de6469aad",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "rustup picks the toolchain from +toolchain, RUSTUP_TOOLCHAIN, directory override, rust-toolchain.toml, then the default, so a repo's rust-toolchain.toml decides the toolchain unless the caller pins it with + or RUSTUP_TOOLCHAIN.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c43e015fde89637a67aad28381",
      "revision": 1
     },
     "representation": "text",
     "digest": "ff7de5d3cb77aeacb2058a634788c321161ece5890a1bb495de933dbbe13b9df"
    },
    "quote": "The toolchain is chosen in the order listed above, using the first one that is\nspecified."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_0db1b163b6c01c266b8d5185c6",
   "revision": 1
  },
  "nature": "inference",
  "proposition": "First-pass audit order by signal per minute: lockfile-only cargo audit/deny, then clippy default + selected pedantic with JSON->SARIF, then semver-checks on libraries, then geiger to scope the unsafe review. The deep audit adds Miri/careful on tests, mutants --in-diff, and Kani or loom on the hot spots. This follows from each tool's documented cost and precision above.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_60899229a095da998703b512f3",
      "revision": 1
     },
     "representation": "text",
     "digest": "2a49a1cfdceaaa53d3ee7a51249796f95fe1dc5dddb755962ed0845814d2376c"
    },
    "quote": "Miri will [re-compile the test crate every time it is\ninvoked](https://github.com/rust-lang/miri/issues/5013), which means a crate with N tests will be\ncompiled N+1 times."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_e61f725d375ea5ece80e2022f1",
      "revision": 1
     },
     "representation": "text",
     "digest": "7f34b558e58682bc7c543736e9b4ab5b58eeacfa3aee6016e89f25e76d48cfa0"
    },
    "quote": "$ cargo audit --file path/to/Cargo.lock"
   }
  ]
 }
]
