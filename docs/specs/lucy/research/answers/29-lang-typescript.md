# 29-lang-typescript

session ses_cf35fec2af29f9043994199545da6572be8fe36ea64790e8b77a60233f09f8ce

## Answer

**Conclusion.** `lucy` cannot run any analyzer today. Its profile is `review` (read, glob, grep, record_review; everything else denied), and its description says it "cannot edit or run commands". Any integration therefore needs a host-side change. I recommend a host-owned "analyze" tool that runs a fixed allowlist of tools through `ChildProcessSpawner`/omni, read-only and offline, and returns normalized SARIF/JSON. Pair it with one shipped seat skill (`lucy-ts-audit`) that teaches how to read the output and the human checklist. Giving lucy `bash` is the wrong fix, and MCP servers should be optional extras. Ship only permissively licensed engines. Invoke Semgrep CE, CodeQL and TruffleHog only if the user installed them, and never ship CodeQL or the Semgrep registry rules.

**Supporting claims**
- read: lucy is `profile: "review"`, `skills: []`, "cannot edit or run commands" (modules/maestro/coordination/src/seats/lucy.ts:4-18). The review profile denies `*` and has no bash (modules/maestro/coordination/src/roster.ts:49-56). Seat skill trees are embedded at build time (seat-skills-module.ts:9-37). All spawning must go through ChildProcessSpawner/Process (AGENTS.md:170).
- read (licenses):
  - Can be embedded: oxc/oxlint (MIT), gitleaks (MIT), StrykerJS (Apache-2.0), knip (ISC).
  - Semgrep engine is LGPL-2.1. The Semgrep registry rules are under the Semgrep Rules License: "only for your own internal business purposes… not distribute… or make them available to others as a service". So never bundle the rules.
  - CodeQL CLI: allowed only on OSI open-source codebases unless the user has paid for GitHub Advanced Security, and it may not be redistributed. Invoke it only if installed and licensed.
  - TruffleHog is AGPL-3.0. Invoke it, never link it.
- read (speed, diff scope, output):
  - Typed linting in typescript-eslint is "roughly the same as your build times" and can run out of memory on large types.
  - oxlint `--type-aware` uses tsgolint on typescript-go: 59 of 61 typed rules, requires TS 7.0+, and `--type-check` can replace `tsc --noEmit`. Its docs warn of high memory on very large codebases.
  - Stryker `--incremental` and `--mutate file:5-7` give diff-scoped mutation testing. Full test-change detection works only with Jest, Vitest and Cucumber.
  - knip has `--reporter sarif|json`, `--cache` and `--production`. It ships an MCP server and a language server.
  - OSV-Scanner `scan source -r` reads lockfiles. It has `--offline`, `--licenses` and call analysis that cuts false positives. Its `fix` command can run package scripts on untrusted repos, so never let lucy call it.
- read (precision): Brito et al. (IEEE TR 2023) tested 9 JS SAST tools on 957 Node.js vulnerabilities. The 3 best tools together detect at most 57.6%, "at a very low precision of 0.11%". Treat SAST hits as leads that need triage, not as verdicts.
- read (MCP): the official Semgrep MCP server (tools: `semgrep_scan`, `semgrep_scan_with_custom_rule`, `get_abstract_syntax_tree`) moved into the main semgrep binary and is labeled beta. Knip ships both an MCP server and an LSP.
- read (supply chain): npm trusted publishing uses OIDC, needs npm ≥11.5.1, supports GitHub, GitLab and CircleCI cloud runners only, and auto-generates provenance only for public repos and packages.
- inferred, tool map by dimension:
  - types: `tsc --noEmit` with strict, noUncheckedIndexedAccess and exactOptionalPropertyTypes, or tsgo/oxlint `--type-check`
  - lint: oxlint (fast first pass), then typescript-eslint strict-type-checked plus react-hooks for the deep pass. Biome is an alternative.
  - SAST/taint: Semgrep CE (pattern rules), CodeQL JS (deep taint, licence-gated)
  - dangerous APIs: eslint-plugin-security, or plain grep for eval, `new Function`, child_process, `dangerouslySetInnerHTML`, prototype-pollution sinks
  - dependencies: OSV-Scanner offline, `npm audit --json`
  - supply chain: lockfile-lint, `npm sbom`, `npm audit signatures`, Socket (SaaS)
  - secrets: gitleaks
  - mutation: Stryker incremental
  - property-based testing: fast-check
  - coverage: c8/istanbul through the repo's own runner
  - API/semver: api-extractor, publint, arethetypeswrong
  - dead code: knip (ts-prune and depcheck are superseded by it)
  - duplication: jscpd
  - architecture and cycles: dependency-cruiser, madge, knip `--cycles`
  - performance: size-limit
  - formal verification: practically none for TS/JS
  - concurrency and memory safety: no dedicated checkers. Use the no-floating-promises and no-misused-promises rules, plus human review.
- inferred, how to run on an unknown repo: detect the toolchain from the lockfile (bun.lock, pnpm-lock.yaml, yarn.lock, package-lock.json), from `packageManager`/`engines`, and from tsconfig and eslint/biome/oxlint configs. Run in a throwaway worktree copy with network denied and caches redirected to a temp dir. Never run `install` or lifecycle scripts. Prefer the repo's own pinned binaries in node_modules, then fall back to Orchestra's pinned engines. Report "not run: missing toolchain" instead of installing anything.
- inferred, what to run first: oxlint → gitleaks → OSV offline → knip → tsc/tsgo, which takes seconds to a few minutes. The deep audit adds typed lint, Semgrep, CodeQL, Stryker on the diff, dependency-cruiser, and api-extractor/attw.
- inferred, human checklist (no tool catches these): unawaited promises across transaction boundaries, `any` leaking through `JSON.parse` and fetch without schema validation, prototype pollution in merges, ReDoS, SSRF and path traversal in handlers, ESM/CJS dual-package hazards, `exports` map and types mismatches, stale closures in React effects, abort/cleanup leaks, Date and timezone bugs, float money arithmetic, postinstall scripts, and dependency confusion.

**Not examined:** I did not capture primary sources for licenses, benchmarks or MCP servers of Biome, eslint-plugin-security, madge, dependency-cruiser, lockfile-lint, Socket MCP, jscpd, size-limit, api-extractor, publint, attw or fast-check. Their placement in the map above is inferred. Reason: time budget. I ran no tool locally, so every speed figure comes from vendor documentation.

**Reproduce:** `knip --reporter sarif --output-file knip.sarif` and `osv-scanner scan source -r . --offline` (commands quoted from the cited docs; not run here).

## Claims

[
 {
  "proposition": "lucy has the review profile, no skills, and cannot run commands.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_ec975da717710af305107e4457",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0e3921bec706d91774bc91c0d6",
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
  "proposition": "The review base profile allows only read, glob, grep and maestro_record_review (and the truncation directory) and denies everything else, so it has no bash.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_ec975da717710af305107e4457",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_24f578d2f310557f9d8ddcc5fb",
      "revision": 1
     },
     "representation": "text",
     "digest": "79cd112316906be8a2f24c7d7150ceec364cc846e621e313f1533a33bc894b6d"
    },
    "quote": "maestro_record_review: \"allow\","
   }
  ]
 },
 {
  "proposition": "Orchestra code may start child processes only through ChildProcessSpawner, Process or Process.interactive.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_e5c25ce104d02f7dd8ac1749e3",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f41f7e82e280da370b238b1ccb",
      "revision": 1
     },
     "representation": "text",
     "digest": "c318d5817acf67fca4a86e5c6421fa1f9f7289eeb79742b9bddf8a359acb5a41"
    },
    "quote": "Orchestra code starts child processes only through `ChildProcessSpawner`, `Process`, or `Process.interactive`."
   }
  ]
 },
 {
  "proposition": "The Semgrep engine is LGPL-2.1.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_3bb4237dbb23d5d66b295398e1",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_244fd2fd5ed7f0978fb5a72461",
      "revision": 1
     },
     "representation": "text",
     "digest": "20c17d8b8c48a600800dfd14f95d5cb9ff47066a9641ddeab48dc54aec96e331"
    },
    "quote": "Version 2.1, February 1999"
   }
  ]
 },
 {
  "proposition": "Semgrep registry rules may be used only internally and may not be distributed or offered as a service.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_3bb4237dbb23d5d66b295398e1",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_9635cabb35729600b4ffb5e9de",
      "revision": 1
     },
     "representation": "text",
     "digest": "cdd7ecaa678b284bec67b587213e07c811c25bcafd28c65363e1e527086c384c"
    },
    "quote": "You may use the rules only for your own internal business purposes."
   }
  ]
 },
 {
  "proposition": "Without a paid GitHub Advanced Security license, the CodeQL CLI may not be used on codebases that are not OSI open source, and it may not be redistributed.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_3bb4237dbb23d5d66b295398e1",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1b26b6a5ded456829cc7e70fc1",
      "revision": 1
     },
     "representation": "text",
     "digest": "f4637e78a23b768634fad409599e72c81e288286fb0de0a086abe709583beb26"
    },
    "quote": "(e.g., code in a private repo in GitHub)."
   }
  ]
 },
 {
  "proposition": "oxc (oxlint) is MIT-licensed.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_3bb4237dbb23d5d66b295398e1",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8cb70a8200f9d228ec0e7953f2",
      "revision": 1
     },
     "representation": "text",
     "digest": "b58aa5654936d5eafabdb426d1822b8c076b16fe41b2e83a1fdd4686d0111f97"
    },
    "quote": "Copyright (c) 2024-present VoidZero Inc. & Contributors"
   }
  ]
 },
 {
  "proposition": "gitleaks is MIT-licensed, and TruffleHog is AGPL-3.0.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_3bb4237dbb23d5d66b295398e1",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_064652d0c11b41639773cc67d1",
      "revision": 1
     },
     "representation": "text",
     "digest": "e3884b252b3bfc045e55be43a34d1e80da070bc6f804ac95bf4660e97d62ebc6"
    },
    "quote": "Copyright (c) 2019 Zachary Rice"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_dd409fa73c7bd9ae622a83710c",
      "revision": 1
     },
     "representation": "text",
     "digest": "33d580ea3d93edcb787c2fa826bbf5afcec3058ce4c894a6beaad3eb4f389d2b"
    },
    "quote": "Version 3, 19 November 2007"
   }
  ]
 },
 {
  "proposition": "oxlint type-aware linting covers 59 of 61 typed rules, requires TypeScript 7.0+, and may use a lot of memory on very large codebases.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_3bb4237dbb23d5d66b295398e1",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_9bfc6c2b9a0f5c0530f7a40f20",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "d8d645be9fbe3decf8d118fa9f17e9aae8238912032a534357769848b63ddf3c"
    },
    "quote": "Type-aware linting currently supports [59 out of 61]"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_9bfc6c2b9a0f5c0530f7a40f20",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "d8d645be9fbe3decf8d118fa9f17e9aae8238912032a534357769848b63ddf3c"
    },
    "quote": "Very large codebases may encounter high memory usage"
   }
  ]
 },
 {
  "proposition": "typescript-eslint typed linting takes about as long as a build.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_3bb4237dbb23d5d66b295398e1",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8a46c62d3d9304453ae6f57f7a",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "bdae56b19f8ef353ad54e7cffbf7b064d5d795d7d4237ef4e72efb743f7fc59b"
    },
    "quote": "your lint times should be roughly the same as your build times"
   }
  ]
 },
 {
  "proposition": "StrykerJS supports incremental, line-scoped mutation runs.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_3bb4237dbb23d5d66b295398e1",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_5ac423999bad65db17a539570d",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "e3759655b465da8724852c7eac42236e64d3469f96d77c23d3c0b4af86988a33"
    },
    "quote": "npx stryker run --incremental --force --mutate src/app.js:5-7"
   }
  ]
 },
 {
  "proposition": "knip emits SARIF and ships an MCP server and a language server.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_07d5a3a7c7fb06a355178f6184",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_65cb581e66798c75a45a3ab146",
      "revision": 1
     },
     "representation": "text",
     "digest": "66860fbef76ee72fdc0df9b588ca3db15cdfb7bfd639e26968cabd17667bfb79"
    },
    "quote": "Implicitly enabled in the editor extension, MCP server and language server"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_65cb581e66798c75a45a3ab146",
      "revision": 1
     },
     "representation": "text",
     "digest": "66860fbef76ee72fdc0df9b588ca3db15cdfb7bfd639e26968cabd17667bfb79"
    },
    "quote": "knip --reporter sarif --output-file knip.sarif"
   }
  ]
 },
 {
  "proposition": "The official Semgrep MCP server moved into the main semgrep binary.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_07d5a3a7c7fb06a355178f6184",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_9c522e208aa63146c1c6af243e",
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
  "proposition": "OSV-Scanner supports offline scanning and warns that its fix command may run scripts on untrusted projects.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_e5c25ce104d02f7dd8ac1749e3",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1cb6177b1456489e4fa3450d67",
      "revision": 1
     },
     "representation": "text",
     "digest": "ae9d6a52e41fea4dad413bf20ef6097cba581891e139e918484c38cad8fcb751"
    },
    "quote": "osv-scanner --offline --download-offline-databases ./path/to/your/dir"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1cb6177b1456489e4fa3450d67",
      "revision": 1
     },
     "representation": "text",
     "digest": "ae9d6a52e41fea4dad413bf20ef6097cba581891e139e918484c38cad8fcb751"
    },
    "quote": "It may trigger the package manager to execute scripts or follow external registries specified in the project."
   }
  ]
 },
 {
  "proposition": "In a peer-reviewed study of JS SAST tools on Node.js vulnerabilities, the 3 best tools together detected at most 57.6% at 0.11% precision.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_436252452e2536661c97896c5e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b8e5b09de3c21b03821ce6596a",
      "revision": 1
     },
     "representation": "text",
     "digest": "50a59ed5ceb015c5aa66876c10aedaa1c78485c15859de351779d8e4914ebccb"
    },
    "quote": "The three best performing tools combined only detect up to 57.6% of all vulnerabilities in the dataset, but at a very low precision of 0.11%."
   }
  ]
 },
 {
  "proposition": "npm trusted publishing requires npm 11.5.1+ and Node 22.14.0+.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_436252452e2536661c97896c5e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_dceabd143b8cc60994d9351aa8",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "6d5a8764c8ee08e57b410cdabc1b09e458dc9049c06cbac4a5de5fb5d9cc5d99"
    },
    "quote": "version 11.5.1 or later and Node version 22.14.0 or higher"
   }
  ]
 },
 {
  "proposition": "Recommended integration: a host-owned analyze tool that runs pinned, permissively licensed engines through ChildProcessSpawner (offline, read-only, no install) and returns SARIF/JSON, plus one shipped seat skill (embedded by seatSkillsModule) with the triage method and human checklist. Not bash for lucy; MCP servers only as optional extras.",
  "nature": "inference",
  "subquestion": {
   "id": "rque_f102b23a552a99d94597b322ae",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_24f578d2f310557f9d8ddcc5fb",
      "revision": 1
     },
     "representation": "text",
     "digest": "79cd112316906be8a2f24c7d7150ceec364cc846e621e313f1533a33bc894b6d"
    },
    "quote": "export async function seatSkillsModule() {"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b8e5b09de3c21b03821ce6596a",
      "revision": 1
     },
     "representation": "text",
     "digest": "50a59ed5ceb015c5aa66876c10aedaa1c78485c15859de351779d8e4914ebccb"
    },
    "quote": "many important vulnerabilities appearing in the OWASP Top-10 are not detected by any tool"
   }
  ]
 }
]
