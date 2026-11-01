# 4-native-tools

session ses_d71cc5707300a343f460824c63ff851e004d71c7d540e279cba7bf22fc107f17

## Answer

Conclusion: Build the reviewer on tools you can legally ship and that already have a place in this repo. Pick tree-sitter (already bundled), ast-grep (MIT), oxlint/oxc (MIT, already the repo's linter) plus tsgo for TypeScript, OpenGrep (LGPL-2.1, run as a separate binary, with your own rules), gitleaks (MIT), OSV-Scanner (Apache-2.0), Syft (Apache-2.0), difftastic (MIT), jscpd (MIT, SARIF output) and SCIP (Apache-2.0). Keep Stryker (Apache-2.0), cargo-mutants (MIT) and mutmut (BSD-3) as tools you drive on the user's machine, never embedded. Do not ship CodeQL, TruffleHog (AGPL-3.0), Semgrep's own rule packs, or stack-graphs (archived).

Do not use (licence or status):
- CodeQL: its terms allow analysis only of open-source codebases, forbid using it on any other codebase, and forbid distributing it or offering it as a hosted service unless the user pays for GitHub Advanced Security. You cannot bundle it. At most it can be an option the user brings with their own GHAS licence. [read: codeql-cli-binaries LICENSE.md]
- Semgrep CE / OpenGrep: the engine is LGPL-2.1, which is fine as an unmodified separate binary. But Semgrep's maintained rules moved in Dec 2024 to the "Semgrep Rules License v1.0", which is not an open-source licence and bars use in competing products or SaaS. So use OpenGrep with rules you write; it has self-contained, Cosign-signed binaries and SARIF output with fingerprints. [read: semgrep.dev opengrep comparison page; api.github.com opengrep shows LGPL-2.1]
- TruffleHog is AGPL-3.0, so keep it out of the bundle. Gitleaks is MIT. [read: both LICENSE files]
- github/stack-graphs is Apache-2.0 but `archived: true`, so prefer SCIP (Apache-2.0, now scip-code/scip). [read: GitHub API]

Recommended set, with licences:
- **Engines:** ast-grep MIT, oxc/oxlint MIT [read]. Biome (MIT/Apache-2.0 dual), ESLint MIT, Pyright MIT, ruff MIT, mypy MIT, golangci-lint GPL-3.0 (drive it, don't bundle), clippy MIT/Apache [inferred, not checked].
- **Security:** gitleaks MIT, OSV-Scanner Apache-2.0, Syft Apache-2.0 [read]. Sigstore/cosign Apache-2.0; SLSA is a specification, not a library [inferred].
- **Test quality:** Stryker Apache-2.0, cargo-mutants MIT, mutmut BSD-3-Clause [read]. Hypothesis: GitHub reports "Other/NOASSERTION"; I believe it is MPL-2.0 (weak copyleft, fine as a user's test dependency) [inferred]. fast-check MIT, proptest MIT/Apache [inferred].
- **Diff and graph:** difftastic MIT, jscpd MIT (Rust engine, SARIF reporter), SCIP Apache-2.0 [read]. lizard (complexity, MIT) [inferred].

Turning results into SARIF:
- OpenGrep, jscpd and CodeQL write SARIF themselves [read].
- gitleaks, OSV-Scanner, ESLint and Biome can also write SARIF [inferred, from their documentation as I know it].
- oxlint, ast-grep, difftastic, mutation reports and Syft's SBOMs need a small adapter from their JSON output. This repository has no SARIF code today: the only hit is a code-highlight language keyword.

Already used in this repository [read]:
- oxlint 1.60.0 with oxlint-tsgolint, run by `bun run lint` (package.json:13, package.json:115-116).
- tsgo for typechecks.
- tree-sitter with Go, JavaScript, Python, Rust and TypeScript grammars (packages/core/package.json:569-579).
- fast-check in modules/atlas (modules/atlas/package.json:37).
- CodeQL for javascript-typescript and actions, but only as a weekly or manually started GitHub Action, not on every PR (.github/workflows/codeql.yml:1-30). That is GitHub's hosted use; it does not let you ship CodeQL.
- A secret-token guard written in Gitleaks style, which matches known key prefixes rather than measuring entropy (script/guards/rules/secret-token.toml:8).
- Not used: Semgrep, OpenGrep, ast-grep, gitleaks, TruffleHog, OSV-Scanner, Syft, Stryker, difftastic, jscpd.

Not checked: laptop speed and memory (the closest thing is the Semgrep page, which says it publishes no speed comparison and to measure yourself). Not licence-checked: Biome, ESLint, fast-check, proptest, cosign, Pyright, ruff, golangci-lint, lizard. No probes were run.

## Claims

[
 {
  "proposition": "CodeQL CLI terms permit analysis only of OSI-licensed codebases and forbid distributing it or offering it as a hosted solution, unless under a paid GitHub Advanced Security licence for the codebase restrictions",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_cf00aecf7ceeb042c5782b4c5d",
      "revision": 1
     },
     "representation": "text",
     "digest": "f4637e78a23b768634fad409599e72c81e288286fb0de0a086abe709583beb26"
    },
    "quote": "available the Software as a hosted solution"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_cf00aecf7ceeb042c5782b4c5d",
      "revision": 1
     },
     "representation": "text",
     "digest": "f4637e78a23b768634fad409599e72c81e288286fb0de0a086abe709583beb26"
    },
    "quote": "connection with any codebase that is not an Open Source Codebase"
   }
  ],
  "subquestion": {
   "id": "rque_8daa232ee6c0b12622eaebf1ec",
   "revision": 1
  }
 },
 {
  "proposition": "Opengrep and Semgrep CE engines are LGPL 2.1; Semgrep-maintained rules moved to the non-open-source Semgrep Rules License v1.0 barring competing products and SaaS; Opengrep emits SARIF with fingerprints",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_64eb0be9aaf8c2b1d019926686",
      "revision": 1
     },
     "representation": "text",
     "digest": "98e89609b294df757e201a6033391a8a8fd732c0ab69c25d9fcfa479f6f46282"
    },
    "quote": "Vendors may not use them in competing products or SaaS offerings."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_64eb0be9aaf8c2b1d019926686",
      "revision": 1
     },
     "representation": "text",
     "digest": "98e89609b294df757e201a6033391a8a8fd732c0ab69c25d9fcfa479f6f46282"
    },
    "quote": "SARIF with metavariable values and fingerprints"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c5287702882792cc84eaf650a6",
      "revision": 1
     },
     "representation": "text",
     "digest": "a7a9a78445bb262be5ef75d39181681e996315240a9ebdb1fd2074c6f36bb50b"
    },
    "quote": "\"spdx_id\": \"LGPL-2.1\""
   }
  ],
  "subquestion": {
   "id": "rque_8daa232ee6c0b12622eaebf1ec",
   "revision": 1
  }
 },
 {
  "proposition": "ast-grep and oxc (oxlint) are MIT licensed",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_2ab23d30710666895be67cc3f6",
      "revision": 1
     },
     "representation": "text",
     "digest": "81471889c77b2161a3e4dcdb1b2e6ca382e485766132d92d5fe1d7497e7dd2d9"
    },
    "quote": "Copyright (c) 2022 Herrington Darkholme"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f44e4e03024b0aac947c2abcf0",
      "revision": 1
     },
     "representation": "text",
     "digest": "9354761085ac91809e37e00967cd734ac5b90ea39eed932cb0ead40bb1680524"
    },
    "quote": "\"spdx_id\": \"MIT\""
   }
  ],
  "subquestion": {
   "id": "rque_8daa232ee6c0b12622eaebf1ec",
   "revision": 1
  }
 },
 {
  "proposition": "TruffleHog is AGPL-3.0; gitleaks is MIT; OSV-Scanner is Apache-2.0; Syft is Apache-2.0",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8ed4dd7bea2a7272f729c9a864",
      "revision": 1
     },
     "representation": "text",
     "digest": "33d580ea3d93edcb787c2fa826bbf5afcec3058ce4c894a6beaad3eb4f389d2b"
    },
    "quote": "Version 3, 19 November 2007"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_5169b08bd761f4f24e7dd654aa",
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
      "id": "cart_9447c2d180882b05eb1991c3e3",
      "revision": 1
     },
     "representation": "text",
     "digest": "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"
    },
    "quote": "Version 2.0, January 2004"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7c3a529f692e33a7322ef7f194",
      "revision": 1
     },
     "representation": "text",
     "digest": "e046a6ffa82cf7bad93aa2d946e676b5dad0809d5eeb72d08c9e403092beff9c"
    },
    "quote": "\"spdx_id\": \"Apache-2.0\""
   }
  ],
  "subquestion": {
   "id": "rque_0d114b6982d97e57dd49dcb063",
   "revision": 1
  }
 },
 {
  "proposition": "Stryker-js is Apache-2.0, cargo-mutants is MIT, mutmut is BSD-3-Clause; Hypothesis's licence is reported by GitHub as Other/NOASSERTION",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0a13a10e36a6bb04c6f2e7c835",
      "revision": 1
     },
     "representation": "text",
     "digest": "7acd5f671692366f359d3de59c6997605c7daed74c62e579e3ddece603d8331c"
    },
    "quote": "\"spdx_id\": \"Apache-2.0\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_67b4459d852328b00192eeb5c0",
      "revision": 1
     },
     "representation": "text",
     "digest": "37f44de54f5e46c1a0b03b172a9d2d2011c3e260808a3698a9d9d63104a3762b"
    },
    "quote": "\"spdx_id\": \"MIT\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0760f1ba4f851c03fd313d905e",
      "revision": 1
     },
     "representation": "text",
     "digest": "60273748ee1849979013c3002c5f4cd7d1936f1ac9cbdd25c9c5fc6f5b443704"
    },
    "quote": "\"spdx_id\": \"BSD-3-Clause\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_e94b17a78329b1cecba96f8cb9",
      "revision": 1
     },
     "representation": "text",
     "digest": "ce19a8aefa77ac876f2df0a47684c550f1ac9419aa02f7ed9b968e7805c77054"
    },
    "quote": "\"spdx_id\": \"NOASSERTION\""
   }
  ],
  "subquestion": {
   "id": "rque_02ebe8a58f74d763c5f7e5aed5",
   "revision": 1
  }
 },
 {
  "proposition": "difftastic is MIT, jscpd is MIT with a SARIF reporter, SCIP is Apache-2.0, and github/stack-graphs is Apache-2.0 but archived",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b676152761892450597a1088a5",
      "revision": 1
     },
     "representation": "text",
     "digest": "0442ef433f50e6aa61a5ed5d605fe934ed07e4bb5238c39156ee31f61103dcf4"
    },
    "quote": "\"spdx_id\": \"MIT\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1c8b3a7b36ed8ec163e2d0b30f",
      "revision": 1
     },
     "representation": "text",
     "digest": "51b1d9c46f97936a0d29d1351702c4425b149bfbcf06107bc3f6512ffc44ea89"
    },
    "quote": "SARIF/HTML/badge reporters"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_5cc40bbe790e23d3fbc969dd3a",
      "revision": 1
     },
     "representation": "text",
     "digest": "24074ebec9e7fa380b5a5fc5928ca8ee5cde6e3e22774ac748ac928254e2e738"
    },
    "quote": "\"spdx_id\": \"Apache-2.0\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_27b1809c2051aedd9d60ba2a56",
      "revision": 1
     },
     "representation": "text",
     "digest": "726697632c1b45c0223f39bf14294307480b7eaf6c326c16cfa6d3cca47ae96b"
    },
    "quote": "\"archived\": true"
   }
  ],
  "subquestion": {
   "id": "rque_7e6b4ab0c49165e13356a2daea",
   "revision": 1
  }
 },
 {
  "proposition": "The repository contains no SARIF producer or consumer; the only 'sarif' hit is a code-highlight language keyword, so normalization would be new work",
  "nature": "observation",
  "scope": "universal",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8589e1eedad182fe4d9d10ff4c",
      "revision": 1
     },
     "representation": "text",
     "digest": "d5d3a5d88329bb1577dcce9fef0c473f25f57e1b82786b34f638d0d2c984208f"
    },
    "quote": "markdown-inline-code-kind.ts:1064"
   }
  ],
  "subquestion": {
   "id": "rque_ddba6afae68c7c0064c2b18f25",
   "revision": 1
  }
 },
 {
  "proposition": "The repo already uses oxlint 1.60.0 with oxlint-tsgolint as `bun run lint`, tree-sitter grammars for Go, JavaScript, Python, Rust and TypeScript in core, fast-check in atlas, and CodeQL weekly/on-demand for javascript-typescript and actions",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_cc546063cc095c3f4d736b30e5",
      "revision": 1
     },
     "representation": "text",
     "digest": "c6c38de04de2fa433148aa5d28d3ac23ea378b7776c40e643be3b8af33cdd057"
    },
    "lines": {
     "start": 13,
     "end": 13
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f568fb5776fdc0d2b7643efa93",
      "revision": 1
     },
     "representation": "text",
     "digest": "e2174ba033482899f952d1a3d3b1f52cb99fe3fa3118b72087441914057774fb"
    },
    "lines": {
     "start": 115,
     "end": 116
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_237cef88d4abdcd630609c5be8",
      "revision": 1
     },
     "representation": "text",
     "digest": "4aa488f66486f5c862b794b520626f4b98a226839de1a79c39ff6c127675e344"
    },
    "lines": {
     "start": 569,
     "end": 579
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7ab66d78f14d1322f42a4277d8",
      "revision": 1
     },
     "representation": "text",
     "digest": "a340bab53d3abc124c24602eeea3cd16ee2404fe895dcd71a5bf19a773a19154"
    },
    "lines": {
     "start": 37,
     "end": 37
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_8993a5f34bffb21f561e03c189",
      "revision": 1
     },
     "representation": "text",
     "digest": "5df73d87bda3e0379ad7e919f6a4abd593509cfd28cbcc8b0237567808a57ea7"
    },
    "lines": {
     "start": 1,
     "end": 30
    }
   }
  ],
  "subquestion": {
   "id": "rque_520ecdd79cb240f776f2cb2391",
   "revision": 1
  }
 },
 {
  "proposition": "Secret detection in the repo today is a Gitleaks-style prefix guard rule, not gitleaks itself",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_e532b7feadcf77f630719bbfa0",
      "revision": 1
     },
     "representation": "text",
     "digest": "0c94a6e1d7db5eb0f5149ecdad0272c0217b29973f9f1042d3ca4d0a9ff37f7b"
    },
    "lines": {
     "start": 8,
     "end": 8
    }
   }
  ],
  "subquestion": {
   "id": "rque_520ecdd79cb240f776f2cb2391",
   "revision": 1
  }
 },
 {
  "proposition": "Shipping set: bundle MIT/Apache/LGPL-as-separate-binary tools (tree-sitter, ast-grep, oxlint, OpenGrep with own rules, gitleaks, OSV-Scanner, Syft, difftastic, jscpd, SCIP); drive mutation tools in the user's environment; exclude CodeQL, TruffleHog, Semgrep rule packs and archived stack-graphs",
  "nature": "inference",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_cf00aecf7ceeb042c5782b4c5d",
      "revision": 1
     },
     "representation": "text",
     "digest": "f4637e78a23b768634fad409599e72c81e288286fb0de0a086abe709583beb26"
    },
    "quote": "connection with any codebase that is not an Open Source Codebase"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_64eb0be9aaf8c2b1d019926686",
      "revision": 1
     },
     "representation": "text",
     "digest": "98e89609b294df757e201a6033391a8a8fd732c0ab69c25d9fcfa479f6f46282"
    },
    "quote": "Releases are self-contained binaries with no Python runtime dependency, signed with Cosign."
   }
  ],
  "subquestion": {
   "id": "rque_ddba6afae68c7c0064c2b18f25",
   "revision": 1
  }
 }
]
