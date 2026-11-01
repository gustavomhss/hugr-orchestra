# 34-lang-integration

session ses_7f3b7f63f010190902d8960871278754c2899a386559c3f83cc1849bcc18c880

## Answer

**Conclusion.** Lucy can get language-specific analysis without a new execution model. Orchestra already has the three parts it needs: a confined launcher for running untrusted workspace code (`ToolSafetySandbox.confine`, already used for formatters and language servers), pinned, hash-verified tool packs (the backend toolkit), and a closed runner set that the host plans (`probe_run`). The recommendation is a host tool for Lucy, call it `review_analyze`. It detects the languages in the diff, runs the matching pinned analyzer packs through `confine` with no network, normalizes their output to SARIF-shaped findings with file:line refs, and caches the results by content. Skills carry only the per-language review judgment. MCP stays an optional bridge for SaaS backends such as SonarQube, never the main path. Today Lucy cannot run anything (`toolkit:false`), and `define()` limits toolkits to the backend seat, so a seat change is needed.

**Supporting claims**
- [read] Lucy is read-only and "cannot edit or run commands". It has `skills: []` and `toolkit: false` (modules/maestro/coordination/src/seats/lucy.ts:12-17).
- [read] The seat type has `toolkit` ("pinned engines") and `mcp` fields, and `define()` throws for any seat other than backend that sets `toolkit` (modules/maestro/coordination/src/seats/seat.ts:37-40, 64-65). The backend seat sets `toolkit: true, mcp: ["hugr-composer"]` (backend.ts:40-41).
- [read] Backend toolkit packs are pinned per platform by URL and integrity hash (packages/core/src/backend-toolkit/packs/ast-grep.ts). The registry already includes ast-grep, gitleaks, squawk, kubeconform and postgres-language-server (packages/core/src/backend-toolkit/packs/index.ts:26-47).
- [read] `ToolSafetySandbox.confine` treats language servers and formatters as workspace-controlled code. It allows no network, keeps credential paths (~/.ssh, ~/.aws, ~/.npmrc, Orchestra data) unreadable, and allows writes only to a fresh scratch directory that also holds the caches (TMPDIR, GOCACHE, CARGO_TARGET_DIR). It uses seatbelt on macOS and srt on Linux, and refuses elsewhere (packages/core/src/tool-safety-sandbox.ts:367-415). Formatters already launch through it (packages/core/src/format/format.ts:126).
- [read] It also classifies `npx`, `uv run`, `mise exec` and version-manager shims as running workspace code (tool-safety-sandbox.ts:~436-440). Toolchain provisioning therefore has to happen inside the confinement too.
- [read] The plain bash tool, by contrast, warns that it "runs with host-user filesystem, process, and network authority" (packages/core/src/tool/bash.ts:191). It is the wrong surface for a reviewer.
- [read] `probe_run` is a closed runner set where the host fixes the binary and arguments. It supports typecheck (tsc), one test file (bun, vitest, jest, pytest, go) and a ts/js/py script, with no network (packages/core/src/research-toolkit/probe/runners.ts:13-14, 27, 102-104). There is no lint or SARIF runner, and the tool belongs to jimmy.
- [read] LSP exists: config `lsp` enables built-in servers (packages/core/src/config.ts:63-64), and the edit and write tools attach LSP diagnostics only after a mutation (packages/core/src/tool/edit.ts:206). There is also a V2 TODO for this at packages/core/src/file-mutation.ts:210. A read-only reviewer therefore gets no diagnostics today.
- [read] `RelayCommands.detect` already reads manifests (package.json, pyproject, Cargo, go.mod, Makefile) to derive lint, typecheck and test commands without running anything (packages/core/src/relay-commands.ts:7-8, 25-60). This is a ready detector seed.
- [read] Seat skills are embedded at build time as text: seat id → path → file text (modules/maestro/coordination/src/seat-skills-module.ts:6-8). The reader accepts lossless UTF-8 text only: "neither symlinks nor binary companions are supported", and each directory must be a skill node or sit under `references/` (modules/maestro/coordination/src/seat-skill-content.ts). So a skill can ship text configs (semgrep rules, ruff.toml) or a script as text, but not binaries or executable tools.
- [read] Nothing in packages/ or modules/ handles SARIF.
- [read, external] CodeRabbit runs 50+ linters "in secure sandboxed environments". It invokes a tool only when "the repository contains files they understand", uses the repo's own config files as-is, and otherwise falls back to profile defaults (docs.coderabbit.ai/tools).
- [read, external] The standalone Semgrep MCP repo is deprecated; the server now ships in the `semgrep` binary, with `semgrep_scan` and custom-rule scans (github.com/semgrep/mcp).
- [read, external] SonarQube MCP exposes data from a SonarQube instance or cloud account (docs.sonarsource.com).
- [read, external] Serena bridges language servers over MCP and is GPL-3.0 as a combined distribution (github.com/oraios/serena).
- [read, external] GitHub ingests third-party SARIF into code-scanning alerts (docs.github.com).
- [read, external] `mise install` and `mise exec` auto-trust their active config, and that config can run code (mise.jdx.dev/cli/trust).

**Recommended architecture (inferred)**
1. **Detector (host, read-only).** Manifest detection plus diff file extensions pick the languages and the repo's declared linters and configs.
2. **Tool packs (host).** Extend the pinned-pack manifest with a `review` fit: semgrep, ruff, eslint/biome, golangci-lint, clippy, shellcheck, gitleaks, ast-grep. Prefer static binaries. Tools that load repo code (eslint plugins, clippy and proc macros, mypy plugins) run only under `confine` with scratch caches, and their findings are tagged "workspace-executed".
3. **Normalize (host).** Convert native JSON or SARIF into one finding record: rule, severity, path:line, a snippet digest and the tool version. Keep the raw output as a retained, citable artifact.
4. **Cache.** Key results by (pack version, config digest, file digest).
5. **Budgets by rigor.** Quick runs static pinned tools on changed files only. Standard adds the repo-declared linters, confined. Deep adds semgrep custom rules and an LSP diagnostics pass.
6. **Where each part lives.** Execution and normalization are a host tool, because they need authority and must be trustworthy. Per-language review knowledge, rule files and config templates are text in `lucy-*` skills. MCP is reserved for optional SaaS backends (SonarQube, Semgrep AppSec), configured through the seat's `mcp` list.

**Not examined, for time:** the CodeQL MCP server, Greptile, Qodo, GitHub Copilot review, Graphite Diamond, Sourcery, Nix and devcontainers, sarif-tools, mcp-language-server, the MCP Dock code, and the omni and `ChildProcessSpawner` internals. I captured no primary source for them. The npm ignore-scripts page was blocked by a secret-output hold.

**Reproduce:** none; these are static reads. Check the toolkit restriction with `grep -n "toolkit" modules/maestro/coordination/src/seats/seat.ts`.

## Claims

[
 {
  "subquestion": {
   "id": "rque_e9f2dc1aa845859ec7199d8d2e",
   "revision": 1
  },
  "proposition": "lucy is read-only, cannot run commands, has no skills and toolkit false.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0015b6f6ab72dc823642538f0a",
      "revision": 1
     },
     "representation": "text",
     "digest": "061f813eee88736ec5683c8d25a06727ac82c2cffb7b1661a53b21d8d48c5c4f"
    },
    "lines": {
     "start": 12,
     "end": 17
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e9f2dc1aa845859ec7199d8d2e",
   "revision": 1
  },
  "proposition": "The Seat type has toolkit and mcp fields; define() rejects toolkit on any seat other than backend; backend sets toolkit true and mcp hugr-composer.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_360cd372b8ca7e85c5be91ef58",
      "revision": 1
     },
     "representation": "text",
     "digest": "2b9f4b5e747dc06d1380f94f8aab39138a2018ccc886c0434825cb844937ac51"
    },
    "lines": {
     "start": 37,
     "end": 40
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_360cd372b8ca7e85c5be91ef58",
      "revision": 1
     },
     "representation": "text",
     "digest": "2b9f4b5e747dc06d1380f94f8aab39138a2018ccc886c0434825cb844937ac51"
    },
    "lines": {
     "start": 64,
     "end": 65
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_65bccaa24fbf30c4657c7b86e2",
      "revision": 1
     },
     "representation": "text",
     "digest": "6414e3330a80a2d41c62fdcdd6cdf4837042d0d72883d7e769c349cdc4cbd903"
    },
    "lines": {
     "start": 40,
     "end": 41
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e9f2dc1aa845859ec7199d8d2e",
   "revision": 1
  },
  "proposition": "Backend toolkit packs are integrity-pinned per platform and already include analyzers such as ast-grep, gitleaks, squawk, kubeconform and postgres-language-server.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d75f6cbeebeffb345971835eed",
      "revision": 1
     },
     "representation": "text",
     "digest": "4c38bf4a298cdc6d68db78893a13cdf8279a768487de6e0e44af29e7e0b08846"
    },
    "quote": "npm pins are the registry's `dist.integrity`"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_06b1aaddf8f3bb1630c1f1a669",
      "revision": 1
     },
     "representation": "text",
     "digest": "84ae51f15fced0c14efd44917c698366de7b65b33228208ff147ed452646ed51"
    },
    "lines": {
     "start": 26,
     "end": 47
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e9f2dc1aa845859ec7199d8d2e",
   "revision": 1
  },
  "proposition": "ToolSafetySandbox.confine runs workspace-controlled programs (language servers, formatters) with no network, credential paths unreadable and writes only to a scratch that hosts caches, refusing where no backend exists; formatters already launch through it.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_e739c921a96497f3843f361e20",
      "revision": 1
     },
     "representation": "text",
     "digest": "3f3d8d35584552c92aa4cc2fa6ea18b44f10bb61f42d953e4dd6b13cf2c920ca"
    },
    "lines": {
     "start": 367,
     "end": 373
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7c0c523f1302caf003847fa852",
      "revision": 1
     },
     "representation": "text",
     "digest": "82dda3e792ad207404588c1e7e5d272f91af0845da0e3ebe3d6f9abd93c320cd"
    },
    "quote": "GOCACHE: path.join(scratch, \"go-build\"), CARGO_TARGET_DIR: path.join(scratch, \"target\"),"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_48b4761ab4675614baa6a4b4af",
      "revision": 1
     },
     "representation": "text",
     "digest": "0297092a4ce0e5d77317c22f5c9ecee9742565390a0d92f143000ece4c940369"
    },
    "quote": "const launch = yield* ToolSafetySandbox.confine({"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_bfd5da5254032c3a6023d208dc",
   "revision": 1
  },
  "proposition": "Orchestra already treats version-manager runners such as mise exec and uv run as running workspace code, so toolchain provisioning must happen under confinement.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7c0c523f1302caf003847fa852",
      "revision": 1
     },
     "representation": "text",
     "digest": "82dda3e792ad207404588c1e7e5d272f91af0845da0e3ebe3d6f9abd93c320cd"
    },
    "quote": "it is a package or version-manager runner (`npx`, `uv run`, `mise exec`"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_bfd5da5254032c3a6023d208dc",
   "revision": 1
  },
  "proposition": "mise install/exec auto-trust their active config, which can run code, so letting mise provision from a repo's config executes repo-controlled code.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c9fcfca16fc05eb605bd30a832",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "0422c89402e5180e709649e807f947804e41ba09146f7b8de6a1f35fc332ee6c"
    },
    "quote": "trust their active config automatically"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e9f2dc1aa845859ec7199d8d2e",
   "revision": 1
  },
  "proposition": "The bash tool runs with host-user filesystem, process and network authority, unsuitable for a cold reviewer.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1f0c809cff961a9f0988cbb3ec",
      "revision": 1
     },
     "representation": "text",
     "digest": "2f782031dd4ba35f50609567b9fb31b1e89b7e38f0a126f23ffbb3f972b0c3dd"
    },
    "quote": "Bash runs with host-user filesystem, process, and network authority; this scan is advisory only."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e9f2dc1aa845859ec7199d8d2e",
   "revision": 1
  },
  "proposition": "probe_run is a closed host-planned runner set (typecheck, one test file for bun/vitest/jest/pytest/go, a script) in a jail without network; it has no lint or SARIF runner.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7ab355a55266101c15955dffeb",
      "revision": 1
     },
     "representation": "text",
     "digest": "6006d729c422acd58be9ad7e81bf32f28d84f4617ebdf7e3ffb1d49d5ffc3378"
    },
    "quote": "J4.3: the closed runner set. The host fixes every binary and argument"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7ab355a55266101c15955dffeb",
      "revision": 1
     },
     "representation": "text",
     "digest": "6006d729c422acd58be9ad7e81bf32f28d84f4617ebdf7e3ffb1d49d5ffc3378"
    },
    "quote": "export type TestRunner = \"bun\" | \"vitest\" | \"jest\" | \"pytest\" | \"go\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7ab355a55266101c15955dffeb",
      "revision": 1
     },
     "representation": "text",
     "digest": "6006d729c422acd58be9ad7e81bf32f28d84f4617ebdf7e3ffb1d49d5ffc3378"
    },
    "quote": "the jail has no network anyway"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e9f2dc1aa845859ec7199d8d2e",
   "revision": 1
  },
  "proposition": "LSP is configurable and the edit/write tools return LSP diagnostics only after a mutation (with a V2 TODO in file-mutation), so a read-only reviewer gets none today.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d2e26eaa9d25a7cda0ac1b3cae",
      "revision": 1
     },
     "representation": "text",
     "digest": "ed13f9fcda4154163af2777d75d9d4c8c9aeda0a10987a42b2a9b4464fad8319"
    },
    "quote": "Enable built-in language servers or configure server overrides"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d2e26eaa9d25a7cda0ac1b3cae",
      "revision": 1
     },
     "representation": "text",
     "digest": "ed13f9fcda4154163af2777d75d9d4c8c9aeda0a10987a42b2a9b4464fad8319"
    },
    "quote": "TODO: Notify LSP and collect diagnostics after V2 LSP runtime exists."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_20916183e06b2e002814efd0a1",
   "revision": 1
  },
  "proposition": "RelayCommands.detect already derives lint/typecheck/test commands from manifests without running anything, a ready detector seed.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_173dbf29922193fceafa32e0f7",
      "revision": 1
     },
     "representation": "text",
     "digest": "576a7098a0d6c315cda1644ad7a0a1ca333fd69f80a5316190c413ff0344b5e3"
    },
    "lines": {
     "start": 7,
     "end": 8
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_fb6e319f4ddbaac87a412e80f2",
   "revision": 1
  },
  "proposition": "Seat skills are embedded at build time as UTF-8 text keyed by path; symlinks and binary companions are unsupported, so a skill can carry text configs or script text but not binaries or executable tools.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0fd89bf20fd0b1c6eaa0e27226",
      "revision": 1
     },
     "representation": "text",
     "digest": "f468d2d52a9d5c7007dd938ad7d41fe9f9b312637c2ba173f1a447de4ab88d11"
    },
    "lines": {
     "start": 6,
     "end": 8
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_acf8912f1b29a80d738aaaa180",
      "revision": 1
     },
     "representation": "text",
     "digest": "7aaebead2a68c47dd89f2e86541d53114039d5a1b38cb00ec6c455827fcb087f"
    },
    "quote": "neither symlinks nor binary companions are supported"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_acf8912f1b29a80d738aaaa180",
      "revision": 1
     },
     "representation": "text",
     "digest": "7aaebead2a68c47dd89f2e86541d53114039d5a1b38cb00ec6c455827fcb087f"
    },
    "quote": "Every directory on a file's path is a node until a node's `references/` folder; anything else is an orphan."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_20916183e06b2e002814efd0a1",
   "revision": 1
  },
  "proposition": "No SARIF handling exists in packages/ or modules/; the only hit is a markdown language-name list.",
  "nature": "observation",
  "scope": "universal",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d563733dc0c809b7daf01a4cbf",
      "revision": 1
     },
     "representation": "text",
     "digest": "20c8fdddf4c89f13927eef0152b52c13ce5a8c7f62440a5cd1acb2f94d667ba7"
    },
    "quote": "markdown-inline-code-kind.ts:1064"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_ec3f4d069d94c72222773b7f36",
   "revision": 1
  },
  "proposition": "CodeRabbit runs 50+ linters in sandboxes, only for languages present, using repo configs as-is and profile defaults otherwise.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_63da3849ad2be0cefa3154ff87",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "c84cc1d42f360610a9c772837c4ce7f564e750333aed9c8a31081466fdfc2cb9"
    },
    "quote": "Tools are only invoked when the repository contains files they understand."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_63da3849ad2be0cefa3154ff87",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "c84cc1d42f360610a9c772837c4ce7f564e750333aed9c8a31081466fdfc2cb9"
    },
    "quote": "most tools fall back to a profile-based default configuration"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_ec3f4d069d94c72222773b7f36",
   "revision": 1
  },
  "proposition": "The standalone Semgrep MCP repo is deprecated in favor of the semgrep binary; SonarQube MCP surfaces data from a SonarQube instance; Serena bridges LSP servers over MCP.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_108e799e8c39006e021a5d6798",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "0b35b9cbbccd0249f6cc133c4e19ac9af7b4d15b9fb62843a578c56b33ff7f20"
    },
    "quote": "further updates to the Semgrep MCP server will be made via the official `semgrep` binary"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0dfea360ab8098474d6fd9ee55",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "3b362a1647d23377fc412ca1ece3bbfddf0da1cffe20dc9768750080986c579d"
    },
    "quote": "connects your AI coding agent to SonarQube's code quality and security data"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_e1533ef145c325b02923d8b5f7",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "0cd427ed84382a57413ded411506e9f032e1171007d5084de7583de440c9888e"
    },
    "quote": "Serena incorporates a powerful abstraction layer for the integration of language servers that implement the language server protocol (LSP)."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_ec3f4d069d94c72222773b7f36",
   "revision": 1
  },
  "proposition": "GitHub ingests third-party SARIF as code-scanning alerts, making SARIF the common interchange format.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3677cfb9d1b4147aaf3e40199d",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "d894cf3a0a25710c4cedc800737bf9f75de2d3e252649c65927a3216f6fd0a39"
    },
    "quote": "GitHub can parse SARIF files produced by third-party tools to display code scanning alerts in repositories."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_20916183e06b2e002814efd0a1",
   "revision": 1
  },
  "proposition": "Recommended: a host review tool for lucy (manifest+diff detector, integrity-pinned analyzer packs run via ToolSafetySandbox.confine without network, SARIF-shaped normalized findings with retained raw output, content-digest cache, rigor-tiered budgets), lucy-* skills carrying per-language review knowledge and rule/config text, MCP only for optional SaaS backends; requires relaxing the backend-only toolkit rule.",
  "nature": "inference",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_360cd372b8ca7e85c5be91ef58",
      "revision": 1
     },
     "representation": "text",
     "digest": "2b9f4b5e747dc06d1380f94f8aab39138a2018ccc886c0434825cb844937ac51"
    },
    "lines": {
     "start": 64,
     "end": 65
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_e739c921a96497f3843f361e20",
      "revision": 1
     },
     "representation": "text",
     "digest": "3f3d8d35584552c92aa4cc2fa6ea18b44f10bb61f42d953e4dd6b13cf2c920ca"
    },
    "lines": {
     "start": 367,
     "end": 373
    }
   }
  ]
 }
]
