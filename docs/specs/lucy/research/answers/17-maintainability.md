# 17-maintainability

session ses_0a9b508feb4105069a9ba1342be317f7282b48ae305381d2affa6d4a50db2641

## Answer

**Conclusion.** The evidence supports judging maintainability by *direction and measurable signals*, not taste. Google's standard is to approve once a change "definitely improves the overall code health… even if the CL isn't perfect", never to accept one that worsens it, and to treat style-guide rules as authority while anything else is a "Nit". Code-level signals have real but partial validity: Cognitive Complexity is the only code-only metric validated against comprehension time and ratings (meta-analysis of ~24,000 evaluations of 427 snippets), with mixed results on correctness. Antipatterns predict change- and fault-proneness beyond what size explains. Low-health code (CodeScene, 39 codebases) had 15× more defects and took 124% longer to resolve issues. This repository already turns much of its style into executable gates (guards, godfile, module boundaries, spawn imports). It runs **no** dead-code or unused-export tool: knip, ts-prune, deadcode and cargo-udeps are all absent.

**Supporting claims**
1. (read) Google review standard: favor approval when code health definitely improves; "no such thing as perfect code"; style guide is absolute authority; design is "almost never a pure style issue"; if nothing else applies, be consistent with the codebase. Source: google eng-practices standard.html.
2. (read) Google "What to look for": "too complex" means "can't be understood quickly by code readers" or that callers are likely to add bugs; be "especially vigilant about over-engineering" and solve today's problem; comments should explain *why*, not *what*; "Don't accept CLs that degrade the code health of the system." Source: looking-for.html.
3. (read) Cognitive Complexity correlates positively with comprehension time and subjective understandability, with mixed results for correctness and physiological measures (Muñoz Barón, Wyrich, Wagner, ESEM 2020, arXiv 2007.12520).
4. (read) Classes with antipatterns were more change-, issue- and unhandled-exception-prone in almost every one of 13 Eclipse releases (Khomh et al., tech report EPM-RT-2009-02; the EMSE 2012 version adds that size alone does not explain it: search snippet only, not captured).
5. (read) Tornhill & Borg (TechDebt 2022, arXiv 2203.04374): low-quality code had 15× more defects, 124% more development time per issue and 9× longer maximum cycle times. Caveat (inferred): the metric is the vendor's own Code Health score, so this shows association, not cause.
6. (read) Architecture erosion has many non-technical causes and lacks dedicated detection tools; practitioners spot it through symptoms (Li, Liang, Soliman, Avgeriou, ICPC 2021, arXiv 2103.11392). Inferred: a rule-based boundary check, like this repo's, is the objective substitute.
7. (read) "Prefer duplication over the wrong abstraction". The objective signal is a shared helper gaining parameters and conditional branches per caller. The fix is to inline it back into each caller and extract again (Sandi Metz, 2016). This matches AGENTS.md:31, "Do not extract single-use helpers preemptively…" (AGENTS.md:26-35).
8. (read) This repo's conventions are executable:
   - `check:guards`, `check:godfile`, `check:boundaries`, `check:spawn-imports` and `lint: oxlint` are scripts (package.json:13-17).
   - Guards are TOML rules that check only *added* lines and are read from the merge-base, so a PR cannot relax them. A suppression needs `guardrail-ignore: <rule id> <reason>`, and size limits stay in godfile.ts (script/guards/README.md:3-19).
   - There are 78 rules, among them ts-any-added, ts-double-cast, lint-disable, wip-marker, llm-elision, js-empty-catch, test-assertions-removed and rs-todo-macros.
   - The godfile check has a target of 500 non-blank LOC and a hard limit of 750 (script/godfile.ts:7-8).
   - The boundary gate checks rules R0–R15 against module-architecture.json, using a ledger that may only shrink (script/check-module-boundaries.ts:1-18).
9. (read) In CI: test.yml runs `check:godfile`, `check:spawn-imports` and `check:boundaries --base origin/dev`, and guards.yml runs the guard engine. No workflow runs `oxlint` (search over 27 workflow and husky files, coverage complete).
10. (read) Dead-code tooling: a search for knip|ts-prune|deadcode|cargo-udeps|depcheck over 13,626 files finds only one i18n string (coverage complete), so the repo does not run any of these tools. `.oxlintrc.json` enables only the suspicious category plus a few type-aware rules; its own rule list has no unused-vars or unused-exports entry (.oxlintrc.json:1-53).
11. (read) Licenses and limits:
    - knip: ISC license (package.json of v6.17.1). Covers unused files, exports and dependencies, and ships a `knip-bun` binary.
    - ts-prune: MIT license, Node ≥22.18. Its README says it was "resurrected after a long hiatus", which contradicts older "deprecated" claims. It cannot see uses made through framework conventions or wildcard re-exports.
    - Go `deadcode` (golang.org/x/tools): uses Rapid Type Analysis, sound for reported functions except assembly/linkname; `-test` covers libraries. License not captured; x/tools is BSD-3 (inferred).
    - cargo-udeps: MIT/Apache-2.0, needs nightly to run (`cargo +nightly udeps`).
12. (inferred) A rubric for "objective, not taste":
    - **Block** when the change makes code health measurably worse: it breaks a written rule (AGENTS.md or a guard), crosses a boundary, pushes a file past the godfile hard limit, or raises cognitive complexity or nesting in a hotspot (a file with high churn and high complexity).
    - **Record debt** (a TODO with a reason, or a ledger entry) when the debt is pre-existing or off the change's path.
    - **Nit** for anything not written down.
    - Learn conventions from the repo itself: the written rules, the rules files and ledgers, and the patterns the surrounding code already follows.

**Not examined:** Potdar & Shihab (2014: SATD in 2.4–31% of files, only 26–63% removed), Wehaibi et al. (SANER 2016) and Scalabrino et al. (ASE 2017: no metric captured understandability) were seen only in search snippets; their pages could not be fetched. The SATD evidence I captured is the 2023 systematic review (arXiv 2312.15020), which covers detection, not interest. Hotspot churn × complexity primary papers and interest models were not captured. I did not run any tool on this repo, so I have no count of dead exports here.

**Reproduce:** `rg -n "knip|ts-prune|cargo-udeps|deadcode" --glob '!**/node_modules/**' .` (expect only the i18n hit); `rg -n "oxlint" .github/workflows` (expect none).

## Claims

[
 {
  "proposition": "Google's standard: approve once a CL definitely improves overall code health even if not perfect; style guide is absolute authority; design is almost never pure style; otherwise consistency with the codebase.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_836833039f4fb768f42187599e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_ce1cff806b4eecb32d5098af90",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "b4e49cd92b72ba836359e2ce160d57860ab660c8f51884d2b8b0a9cb42b44292"
    },
    "quote": "reviewers should favor approving a CL once it is in a state where it definitely improves the overall code health of the system being worked on, even if the CL isn’t perfect."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_ce1cff806b4eecb32d5098af90",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "b4e49cd92b72ba836359e2ce160d57860ab660c8f51884d2b8b0a9cb42b44292"
    },
    "quote": "Aspects of software design are almost never a pure style issue or just a personal preference."
   }
  ]
 },
 {
  "proposition": "Google defines too complex as can't be understood quickly by readers, warns against over-engineering, and says comments should explain why.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_836833039f4fb768f42187599e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_5abca2614a948d31fd6213779b",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "a4a592b8fd36c3aafb30f0a8eaf190e8375f34fc368a53fb6dbe60cf757547eb"
    },
    "quote": "Reviewers should be especially vigilant about over-engineering."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_5abca2614a948d31fd6213779b",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "a4a592b8fd36c3aafb30f0a8eaf190e8375f34fc368a53fb6dbe60cf757547eb"
    },
    "quote": "Don’t accept CLs that degrade the code health of the system."
   }
  ]
 },
 {
  "proposition": "Cognitive Complexity positively correlates with comprehension time and subjective understandability; mixed for correctness.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_582fe210839c68cd02690c81d7",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b097693786539ea356c0508a0b",
      "revision": 1
     },
     "representation": "text",
     "digest": "505ce1e812e772373f0fa14ed4ee393d6ad30c8cc3edd888bf47120eaac3ac8b"
    },
    "quote": "Cognitive Complexity positively correlates with comprehension time and subjective ratings of understandability. The metric showed mixed results for the correlation with the correctness of comprehension tasks and with physiological measures."
   }
  ]
 },
 {
  "proposition": "Classes in antipatterns are more change-, issue- and unhandled-exception-prone across Eclipse releases.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_a8936e40722105554226b3270f",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a2e4f9216b21e92908f7d6336b",
      "revision": 1
     },
     "representation": "text",
     "digest": "7d6d3c62219907220d27c0fc7f5b717c216b034748c7d58764b8c7ea8e797383"
    },
    "quote": "We show that, in almost all releases of Eclipse, classes with antipatterns are more change-, issue-, and unhandled-exception-prone than others."
   }
  ]
 },
 {
  "proposition": "Low quality code had 15x more defects and 124% more development time across 39 codebases (CodeScene).",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_0fcfcdd7bcabfd36ce2460a72e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_de9b2595d5b201ca6050e94b59",
      "revision": 1
     },
     "representation": "text",
     "digest": "7f5d163421fb96e4a22c636bc0a8102b3c8a7f94bc0f8bd400d25e82af8ad1e8"
    },
    "quote": "we find that low quality code contains 15 times more defects than high quality code. Furthermore, resolving issues in low quality code takes on average 124% more time in development."
   }
  ]
 },
 {
  "proposition": "Architecture erosion is largely caused by non-technical factors and lacks dedicated detection tools; developers identify it via symptoms.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_0fcfcdd7bcabfd36ce2460a72e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a0a7d2c88bd921a8b325264464",
      "revision": 1
     },
     "representation": "text",
     "digest": "10792a329372079f3d8cd459724f64f39a181c1db74b538b8071e601f1e24b1e"
    },
    "quote": "despite the lack of dedicated tools for detecting architecture erosion, developers usually identify erosion through a number of symptoms"
   }
  ]
 },
 {
  "proposition": "Wrong abstraction signal: added parameters and conditionals in shared code; repo style guide forbids preemptive single-use helpers.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_e7bd971ddf7ba81560e2ea4ee3",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a042126da66eedb2e5d9d2d6b8",
      "revision": 1
     },
     "representation": "text",
     "digest": "225f1b7a4cec66c16c1de5afeb627b0a2bbdd2f3cd51c7e56817690c5eeb219a"
    },
    "quote": "If you find yourself passing parameters and adding conditional paths through shared code, the abstraction is incorrect."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_dc82267917fba9b273950e7cde",
      "revision": 1
     },
     "representation": "text",
     "digest": "6dfabd3febb459538ed50fe539b76825ccc66811213cce301ace73720f386818"
    },
    "lines": {
     "start": 30,
     "end": 31
    }
   }
  ]
 },
 {
  "proposition": "The repository encodes conventions as executable gates: guards on added lines read from merge-base, godfile 500/750 LOC, module-boundary rules with a ledger.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_e7bd971ddf7ba81560e2ea4ee3",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c3d3c0a3e6e7a827c36930627f",
      "revision": 1
     },
     "representation": "text",
     "digest": "59a4667e57b347e6584326738de2c234d765d6f22c762509a97bdd64b0dc977a"
    },
    "lines": {
     "start": 13,
     "end": 17
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1b06699b8e48908c0fc597e62b",
      "revision": 1
     },
     "representation": "text",
     "digest": "91ca66ab9f4e842195c214baaad375978928e3c93fce9213bb020188411982b0"
    },
    "lines": {
     "start": 5,
     "end": 9
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_cf76b2f5c552cb5d4025e58860",
      "revision": 1
     },
     "representation": "text",
     "digest": "6154e1ee9ba8a3401af5d2c310ae821d28985e65ee66c320d0015da4f41ff079"
    },
    "lines": {
     "start": 7,
     "end": 8
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d88f624d169fa56de92b47a351",
      "revision": 1
     },
     "representation": "text",
     "digest": "543d72a1c4566d7c3e3900b89edf3db60109f4b22e90e3b583c4b8482645be2f"
    },
    "lines": {
     "start": 2,
     "end": 10
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_150a440c18f10064fddf6d42f8",
      "revision": 1
     },
     "representation": "text",
     "digest": "69cd77200a6cd93a2bee1dc742dbfdef385e58ad29f8e28bcb091fdd262420c7"
    },
    "quote": "78 hit(s)"
   }
  ]
 },
 {
  "proposition": "CI runs godfile, spawn-imports and boundaries in test.yml and guards in guards.yml; no workflow runs oxlint.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_e7bd971ddf7ba81560e2ea4ee3",
   "revision": 1
  },
  "scope": "universal",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_96351f788d51f0582834f5bd95",
      "revision": 1
     },
     "representation": "text",
     "digest": "7e63443555b3cb60380b1f813f54af9299ee09909ed4529d28be17dcfbb5bde1"
    },
    "quote": "run: bun run check:boundaries --base origin/dev"
   }
  ]
 },
 {
  "proposition": "The repository runs no knip, ts-prune, deadcode, cargo-udeps or depcheck; oxlint config has no unused-exports rule.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_e376af165160bc5a5385afa868",
   "revision": 1
  },
  "scope": "universal",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_ed2768684921ea312f42556d59",
      "revision": 1
     },
     "representation": "text",
     "digest": "7d60a83cf9551959053bf1d7baf5e779aaed8ef9cb6586e7284e1da48e75e4be"
    },
    "quote": "1 hit(s)"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7c21904cd2d58e6e2013700ee2",
      "revision": 1
     },
     "representation": "text",
     "digest": "047ffb42ce8d09e184665fa351dfe23de695582a853789b13fd5358bb0a053a6"
    },
    "lines": {
     "start": 6,
     "end": 43
    }
   }
  ]
 },
 {
  "proposition": "knip is ISC; ts-prune is MIT and resurrected; cargo-udeps is MIT/Apache-2.0 and needs nightly; Go deadcode uses RTA and is sound for reported functions.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_e376af165160bc5a5385afa868",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_406f92fcd46125cffcb6502d82",
      "revision": 1
     },
     "representation": "text",
     "digest": "2b349d7e8ec0bb88aa52f77b8f55bd92ed46ce38c97de8c2e84a3c21c7b524c6"
    },
    "quote": "\"license\": \"ISC\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_59d1ece0cdc2f4146e8bec1309",
      "revision": 1
     },
     "representation": "text",
     "digest": "311df0fc9cf8b0ab034bd623fbcc1319d48ef1730a5e4c85dcb8255852027bc5"
    },
    "quote": "This project has been resurrected after a long hiatus."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1c7960f5f340320176a24caf95",
      "revision": 1
     },
     "representation": "text",
     "digest": "9b77dd17f473a216c9cbf354fd2963a70c19a8c308ab6ec93ae7cf63a787549b"
    },
    "quote": "it needs Rust nightly to actually run."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1ec933c798eee42b897feee926",
      "revision": 1
     },
     "representation": "text",
     "digest": "e78c6d99ae03f34625488440ea048f8386b0d4fca096d557437d79782e654941"
    },
    "quote": "In this respect, the tool is sound. In other words, if it reports a\nfunction as dead code, it means the function cannot be called even\nthrough these dynamic mechanisms."
   }
  ]
 },
 {
  "proposition": "SATD (debt acknowledged in comments) is an established research area with detection approaches from heuristics to transformers; a reviewer can treat new SATD markers as recorded debt rather than a block.",
  "nature": "inference",
  "subquestion": {
   "id": "rque_0fcfcdd7bcabfd36ce2460a72e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_5a624a6f5c16e6ba19ab6b8994",
      "revision": 1
     },
     "representation": "text",
     "digest": "6be7b383287e504f98aa7653dba261d514085c77e3aef4af4e6ee947f7aecbc3"
    },
    "quote": "Self-Admitted Technical Debt (SATD) occurs when developers explicitly acknowledge these trade-offs in the codebase, typically through comments or annotations."
   }
  ]
 }
]
