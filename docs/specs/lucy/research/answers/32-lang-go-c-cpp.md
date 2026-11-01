# 32-lang-go-c-cpp

session ses_9f35aa9dcf41432a818b5c0d24f05cdc82d2859f8d50d7d62e6dc7f64cd35a40

## Answer

**Conclusion.** The seat that fits Go/C/C++ review best combines three layers. First, a shipped seat skill holding the ecosystem checklist and the exact commands to run. Second, the official gopls MCP server for Go semantics. Third, a small fixed set of analyzers that Orchestra runs read-only through its own spawn layer (ChildProcessSpawner/omni plus the OS sandbox), writing SARIF or JSON into a scratch directory. Two blockers today. `lucy` cannot run any command: its skills list is empty and it has no toolkit. And licenses split the tools: MIT, BSD and Apache tools can ship with the app, the GPL-3 tools (golangci-lint, cppcheck) should only be run if the user already has them installed, and CodeQL's terms bar private code and redistribution unless the user has a paid GitHub Advanced Security license.

**Integration.**
- **What `lucy` is today (read).**
  - It is "read-only artifact review" with `skills: []` and `toolkit: false`, and its description says it "cannot edit or run commands" (modules/maestro/coordination/src/seats/lucy.ts:7-16).
  - The README calls the review seats "Partial: no skill tree yet". The backend seat is the one with "a pinned toolkit of engines" (README.md:52,56).
  - Process rule: every spawn goes through ChildProcessSpawner/Process and omni (AGENTS.md:169-171).
- **Recommendation (inferred).** Add a read-only "analyze" capability to `lucy`:
  - Each run happens in a throwaway worktree or copy, with caches pointed at a temp directory (GOCACHE, GOMODCACHE, `-mod=readonly`, `infer -o /tmp/...`).
  - Network is off, except module download when the reviewer opts in.
  - Results are SARIF or JSON only, and findings come back as cited claims.
  - The checklist goes in a shipped `lucy` seat skill, not in `.orchestra/skills`.
- **Go semantics through gopls MCP (read).** gopls has an experimental built-in MCP server; `gopls mcp` speaks MCP over stdio. Its docs warn that it runs `go`, which can download modules and write to caches. So it must start under the same sandbox.

**Tool map by review dimension.** "(read)" means I captured the source this session; anything else is unverified.
- **Compiler and type-checker strictness**
  - Go: `go vet`; staticcheck, MIT (read).
  - C/C++: `-Wall -Wextra -Werror`, clang `-Weverything` triage, clang-tidy (page captured, details not cited).
- **Linters**
  - Go: golangci-lint, GPL-3 (read). It writes SARIF via `--output.sarif.path` and has diff-scoped modes `--new-from-rev` and `--new-from-merge-base` (read).
  - C/C++: clang-tidy; cppcheck, GPL-3 (read).
- **SAST and taint analysis**
  - Go: gosec, Apache-2.0 (read). It has taint rules (G7xx), SARIF and JSON output, `#nosec` directives with a justification-required mode, and suppression tracking. Never pass its `-ai-api-*` flags: they send findings to an external AI service.
  - C/C++: Infer, MIT (read), with a differential `--reactive` mode (read). Clang Static Analyzer (CodeChecker for SARIF). CodeQL C/C++ only when the code is open source or the user has GHAS (read).
- **Dependency vulnerabilities**
  - Go: govulncheck, BSD-3 (read). It checks reachability through the call graph and outputs JSON, SARIF or OpenVEX. Exit code is 0 in those modes, so parse the output instead of trusting the exit status. It misses calls made through reflect and through unsafe (read).
  - C/C++: no package-manager equivalent. Read the lockfile or SBOM (vcpkg, Conan) and check the vendored copies by hand.
- **Concurrency and memory safety**
  - Go: race detector. It finds only races that actually happen at runtime, and costs 5–10x memory and 2–20x time (read).
  - C/C++: ASan has a typical slowdown of 2x, and its docs say it is not expected to give false positives, except container-overflow checks, which "are prone to false positives" (read). UBSan, TSan, MSan and Valgrind not captured.
- **Fuzzing**
  - Go: native fuzzing since Go 1.18, which OSS-Fuzz supports (read). Caution: a failing input is written into `testdata/fuzz/` in the repo (read), so fuzz only in a scratch copy.
  - C/C++: libFuzzer, AFL++ and OSS-Fuzz (not captured).
- **Not verified this session:** mutation testing (gremlins, go-mutesting), apidiff and gorelease, include-what-you-use, Frama-C, CBMC, MISRA and CERT checkers, secrets scanners, SBOM and provenance tools, duplication and complexity tools, benchmark regression (benchstat).

**Precision (read).** Lipp et al. (ISSTA 2022) found that state-of-the-art static C/C++ analyzers miss 47–80% of real vulnerabilities. Combining analyzers brings that down to 30–69%, at the cost of 15 percentage points more functions flagged. So static tools are a first filter, not proof that code is safe.

**First pass vs deep audit (inferred).**
- **First pass, in minutes.** Start with the compiler warnings and the build itself. For Go, run `go vet`, staticcheck, `govulncheck ./...`, `gosec -fmt sarif` and `golangci-lint run --new-from-merge-base=<base>`. For C/C++, run clang-tidy on the changed files using `compile_commands.json`, plus cppcheck.
- **Deep audit, in hours.** `go test -race`, ASan+UBSan test runs, Infer, CodeChecker/CSA with cross-translation-unit analysis, fuzzing time-boxed in a copy, CodeQL where the license allows, and CBMC or Frama-C for small critical modules.

**Checklist no tool catches (inferred, from ecosystem knowledge, not captured).**
- **Go:**
  - Errors that are dropped, or wrapped without `%w`.
  - Goroutine leaks, and a missing cancel or a request context not passed along.
  - Typed-nil values inside interfaces.
  - Changes to the meaning of loop variables in older go.mod versions.
  - Maps and slices aliasing each other through append.
  - `defer` inside loops.
  - `unsafe` and cgo pointer rules.
  - Time zones and monotonic clocks.
- **C/C++:**
  - Ownership and lifetime: dangling views, `string_view` and spans, iterators invalidated after the container changes.
  - Integer promotion and signedness, and undefined behavior the optimizer relies on.
  - Exception safety and RAII gaps.
  - ABI and ODR breaks.
  - Macro hygiene.
  - Thread safety of static locals and singletons.

**Detecting the toolchain (inferred).**
- Read the marker files: `go.mod` and `go.work` (the `go` and `toolchain` lines); for C/C++, CMakeLists, Meson, Bazel, Makefile, `compile_commands.json`, vcpkg.json and conanfile.
- When a toolchain is missing, report the dimension as "not examined", with the install command. Never install anything silently.

**Not examined, and why.** Time budget:
- Community MCP servers for clangd, CodeQL or sanitizers were not evaluated, so only gopls has a confirmed official MCP server.
- Speed and memory figures for the static analyzers, false-positive rates for each Go tool, and licenses for clang-tidy (Apache-2.0 with LLVM exceptions), Valgrind, AFL++, Frama-C, CBMC and IWYU were not captured.
- I did not run any probe, so no behavioral claim here was reproduced locally.

## Claims

[
 {
  "proposition": "lucy is a read-only review seat with no skill tree and no toolkit; it cannot run commands today.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_cae8dc4445921a533156f4a3b8",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_80c4f8f7481ed7d8471420065d",
      "revision": 1
     },
     "representation": "text",
     "digest": "061f813eee88736ec5683c8d25a06727ac82c2cffb7b1661a53b21d8d48c5c4f"
    },
    "lines": {
     "start": 7,
     "end": 16
    }
   }
  ]
 },
 {
  "proposition": "Review seats are partial with no skill tree, while the backend seat has a pinned toolkit of engines.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_cae8dc4445921a533156f4a3b8",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c9260b1d5bf3777f989fe916fb",
      "revision": 1
     },
     "representation": "text",
     "digest": "552b5310daab4f17666cd69613846377e78ca2d39820b6bb8c120b6a70576a10"
    },
    "lines": {
     "start": 52,
     "end": 56
    }
   }
  ]
 },
 {
  "proposition": "Orchestra starts child processes only through ChildProcessSpawner/Process and omni, so analyzer runs must go through that layer.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_cae8dc4445921a533156f4a3b8",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_572ac744fa5954b7663f66025a",
      "revision": 1
     },
     "representation": "text",
     "digest": "a43e11c0c835dbc44d0bf19f8592a8d1d2659009958e2732249004e361b0286c"
    },
    "lines": {
     "start": 169,
     "end": 171
    }
   }
  ]
 },
 {
  "proposition": "gopls ships an experimental built-in MCP server with a stdio detached mode, and it may run the go command which can download modules and write caches.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_6f4e4046268993148380c4cb2f",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b98f471f73b77615852e7fce1e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "2d0ae12cdcc3c536dd71d4cab14003ad08b4fdb7388865569670d5664bc9e9ec"
    },
    "quote": "This runs a standalone gopls instance that speaks MCP over stdin/stdout."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b98f471f73b77615852e7fce1e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "2d0ae12cdcc3c536dd71d4cab14003ad08b4fdb7388865569670d5664bc9e9ec"
    },
    "quote": "allowing it to expose a subset of its functionality to AI assistants in the form of MCP tools."
   }
  ]
 },
 {
  "proposition": "golangci-lint is GPL-3 licensed.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_612910f72f6126e542084322cc",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8234b5f9830fa06bbdd25b8aed",
      "revision": 1
     },
     "representation": "text",
     "digest": "8b1ba204bb69a0ade2bfcf65ef294a920f6bb361b317dba43c7ef29d96332b9b"
    },
    "quote": "Version 3, 29 June 2007"
   }
  ]
 },
 {
  "proposition": "golangci-lint emits SARIF and supports diff-scoped runs against a merge base.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_964d060d134d2c5de180266dc0",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c29fc82714ea54c74acf0ba8b6",
      "revision": 1
     },
     "representation": "text",
     "digest": "6627aefe8f43340a5394c647395b556e902fbd7e8b067fa2c51d3c268b622257"
    },
    "quote": "Show only new issues created after the best common ancestor (merge-base against HEAD)"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c29fc82714ea54c74acf0ba8b6",
      "revision": 1
     },
     "representation": "text",
     "digest": "6627aefe8f43340a5394c647395b556e902fbd7e8b067fa2c51d3c268b622257"
    },
    "quote": "--output.sarif.path"
   }
  ]
 },
 {
  "proposition": "CodeQL CLI terms permit analysis only of open-source codebases (absent a paid GHAS license) and forbid redistributing or embedding it.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_612910f72f6126e542084322cc",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3675bf4d637ba3c0fbb2940937",
      "revision": 1
     },
     "representation": "text",
     "digest": "f4637e78a23b768634fad409599e72c81e288286fb0de0a086abe709583beb26"
    },
    "quote": "Perform analysis on the Open Source Codebase."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_3675bf4d637ba3c0fbb2940937",
      "revision": 1
     },
     "representation": "text",
     "digest": "f4637e78a23b768634fad409599e72c81e288286fb0de0a086abe709583beb26"
    },
    "quote": "share, publish, distribute or lend the Software, provide or make"
   }
  ]
 },
 {
  "proposition": "cppcheck is GPL-3 licensed.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_612910f72f6126e542084322cc",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a94a73753f5c20595bdec9daae",
      "revision": 1
     },
     "representation": "text",
     "digest": "8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903"
    },
    "quote": "Version 3, 29 June 2007"
   }
  ]
 },
 {
  "proposition": "Infer is MIT licensed and has a differential (--reactive) workflow.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_964d060d134d2c5de180266dc0",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_85db8874100b29173f64bfe934",
      "revision": 1
     },
     "representation": "text",
     "digest": "52412d7bc7ce4157ea628bbaacb8829e0a9cb3c58f57f99176126bc8cf2bfc85"
    },
    "quote": "MIT License"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1aa8988b1b2f8502276dd199ef",
      "revision": 1
     },
     "representation": "text",
     "digest": "2f308972c1de3641206eaa9b18eca4ce02af63133e21631fbb8bc4618e247402"
    },
    "quote": "Passing --reactive (or -r) to Infer prevents it from deleting"
   }
  ]
 },
 {
  "proposition": "staticcheck (dominikh/go-tools) is MIT-style licensed and can ship.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_612910f72f6126e542084322cc",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_6bf0f8f360b8e9db864a77f4b7",
      "revision": 1
     },
     "representation": "text",
     "digest": "f221780eca6d16dc9dce29ce46cd089ce1ca1178998b31ebbcc89ff822c6072b"
    },
    "quote": "Permission is hereby granted, free of charge, to any person obtaining"
   }
  ]
 },
 {
  "proposition": "govulncheck is BSD-3, emits JSON/SARIF/OpenVEX, and misses calls made through reflect.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_964d060d134d2c5de180266dc0",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7e58f941a1e0a06daf5b39670a",
      "revision": 1
     },
     "representation": "text",
     "digest": "af180aaeec0c598e8ae2a2edc6d0ec5b113cac205c30d7c85d9931c2464b0355"
    },
    "quote": "License: BSD-3-Clause"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7e58f941a1e0a06daf5b39670a",
      "revision": 1
     },
     "representation": "text",
     "digest": "af180aaeec0c598e8ae2a2edc6d0ec5b113cac205c30d7c85d9931c2464b0355"
    },
    "quote": "Govulncheck supports streaming JSON."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7e58f941a1e0a06daf5b39670a",
      "revision": 1
     },
     "representation": "text",
     "digest": "af180aaeec0c598e8ae2a2edc6d0ec5b113cac205c30d7c85d9931c2464b0355"
    },
    "quote": "Calls to functions made using package reflect are not visible to static"
   }
  ]
 },
 {
  "proposition": "gosec is Apache-2.0, has taint analysis, and emits SARIF.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_61dfe5751577bee2aa73c3eabf",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_4e6244b9dbf378e04a8ad0178f",
      "revision": 1
     },
     "representation": "text",
     "digest": "f7fd978d75881fb57156bc6c30c56ca229036bce2307abc8017618d58bd92cec"
    },
    "quote": "Licensed under the Apache License, Version 2.0 (the \"License\")."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_4e6244b9dbf378e04a8ad0178f",
      "revision": 1
     },
     "representation": "text",
     "digest": "f7fd978d75881fb57156bc6c30c56ca229036bce2307abc8017618d58bd92cec"
    },
    "quote": "gosec -fmt sarif -out results.sarif ./..."
   }
  ]
 },
 {
  "proposition": "ASan typically slows programs 2x and its container-overflow checks are prone to false positives.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_61dfe5751577bee2aa73c3eabf",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_5f039371f12c91ad1aad9f9571",
      "revision": 1
     },
     "representation": "text",
     "digest": "4a29cdbcf48f8ca27a85e5285c42997c445267df3a353b0e2dd143177cac6f72"
    },
    "quote": "Typical slowdown introduced by AddressSanitizer is 2x."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_5f039371f12c91ad1aad9f9571",
      "revision": 1
     },
     "representation": "text",
     "digest": "4a29cdbcf48f8ca27a85e5285c42997c445267df3a353b0e2dd143177cac6f72"
    },
    "quote": "Note that this feature is prone to false positives:"
   }
  ]
 },
 {
  "proposition": "The Go race detector only finds races on executed paths and costs 5-10x memory and 2-20x time.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_61dfe5751577bee2aa73c3eabf",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_902e2e21163913bf20996d5883",
      "revision": 1
     },
     "representation": "text",
     "digest": "7e671df5d2a9f2760c92e6006a1428f45208804e686b4180ff13d614d095980f"
    },
    "quote": "The race detector only finds races that happen at runtime, so it can't find"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_902e2e21163913bf20996d5883",
      "revision": 1
     },
     "representation": "text",
     "digest": "7e671df5d2a9f2760c92e6006a1428f45208804e686b4180ff13d614d095980f"
    },
    "quote": "usage may increase by 5-10x and execution time by 2-20x."
   }
  ]
 },
 {
  "proposition": "Native Go fuzzing exists since Go 1.18 and writes failing inputs into the repository seed corpus, so it must run in a scratch copy to avoid mutating the repo.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_61dfe5751577bee2aa73c3eabf",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_463260e6f0f4255fa62e0fd78b",
      "revision": 1
     },
     "representation": "text",
     "digest": "42e980daf73230237e14c919eded490e8db905b646c5d83beb9e63f75f2c2e9d"
    },
    "quote": "Go supports fuzzing in its standard toolchain beginning in Go 1.18. Native Go fuzz tests are"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_463260e6f0f4255fa62e0fd78b",
      "revision": 1
     },
     "representation": "text",
     "digest": "42e980daf73230237e14c919eded490e8db905b646c5d83beb9e63f75f2c2e9d"
    },
    "quote": "The fuzzing engine wrote this failing input to the seed"
   }
  ]
 },
 {
  "proposition": "Real-world evaluation shows static C/C++ analyzers miss 47-80% of vulnerabilities, so static passes cannot certify safety.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_e2b337a8bc86d549356026350b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_2352278c3a9ec28f8cb7a28ee3",
      "revision": 1
     },
     "representation": "text",
     "digest": "4ef33ce7ada833b26637a27cc9f859ff72132a1cd457f6ec45a46b0ed390b1ec"
    },
    "quote": "our results indicate that state-of-the-art tools miss in-between 47% and 80% of the vulnerabilities in a benchmark set of real-world programs"
   }
  ]
 },
 {
  "proposition": "Recommended order: fast diff-scoped static passes (vet, staticcheck, govulncheck, gosec, golangci-lint --new-from-merge-base; clang-tidy, cppcheck) first, then dynamic tools (race, sanitizers, fuzzing) and Infer/CodeQL in a deep audit, because static passes are minutes and diff-scoped while dynamic tools carry 2-20x runtime cost and only cover executed paths.",
  "nature": "inference",
  "subquestion": {
   "id": "rque_e2b337a8bc86d549356026350b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c29fc82714ea54c74acf0ba8b6",
      "revision": 1
     },
     "representation": "text",
     "digest": "6627aefe8f43340a5394c647395b556e902fbd7e8b067fa2c51d3c268b622257"
    },
    "quote": "Show only new issues created after the best common ancestor (merge-base against HEAD)"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_902e2e21163913bf20996d5883",
      "revision": 1
     },
     "representation": "text",
     "digest": "7e671df5d2a9f2760c92e6006a1428f45208804e686b4180ff13d614d095980f"
    },
    "quote": "usage may increase by 5-10x and execution time by 2-20x."
   }
  ]
 }
]
