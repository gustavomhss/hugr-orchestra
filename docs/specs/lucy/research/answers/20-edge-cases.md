# 20-edge-cases

session ses_701b7e24ada03170ac67074dc6c71f20b01d218abd1baf1c94e3ae94fb69d1e8

## Answer

**Conclusion.** Expert reviewers don't find edge cases by recall. They enumerate them: model the changed code's inputs and environment as categories and choices (category-partition, plus equivalence partitioning and boundary values on each choice), cross those choices pairwise (NIST t-way), and treat ordering and state as an extra dimension (sequence covering arrays). Next they run every string, path and time input against the known falsehood families. Any gap they suspect becomes a failing test or property, shrunk to a minimal reproducer. LLMs listing edge cases unaided are measurably incomplete; they become reliable only inside a feedback loop (coverage, mutants killed).

**Supporting claims**
- [read] Category-partition: categories → choices → constraints and [error]/[single] annotations. The FIND example drops from 1944 to 678 to 125 frames; all-pairs keeps 20×4 choices tractable. (SFU notes on Ostrand & Balcer, CACM 1988)
- [read] NIST: most failures involve 1–2 parameters, never more than about 6. t-way suites matched exhaustive testing with 20×–700× fewer tests. Sequence covering arrays extend this to event order. (csrc.nist.gov ACTS)
- [read] Catalog: awesome-falsehood indexes the primary articles on time (leap seconds, DST, time zones), text (normalization, surrogates, graphemes), Windows and POSIX paths, mtime, floating point, CSV and networks, plus the Big List of Naughty Strings.
- [read] Fuzzing: libFuzzer keeps inputs that reach new coverage, saves the crash input and minimizes it; a target "must tolerate any kind of input (empty, huge, malformed, etc)".
- [read] Property-based testing: in Hypothesis's own tutorial a sort test that passed on integers fails on `[1.0, nan, 0]`. Round-trip properties are its recommended first target.
- [read] Minimal reproductions: delta debugging reduces `x = 1 + 2 * 3 / 0` to `3/0`. Grammar-based reduction took 10 tests where delta debugging took 900.
- [read] LLM limits: TestPilot reached a median of 52.8% branch coverage; the best model wrote correct property tests for only 21% of documented properties (Vikram et al.).
- [read] What works: Fuzz4All's coverage-fed LLM loop found 98 bugs; Meta's ACH generates mutants the tests miss, then tests that kill them, and engineers accepted 73% of those tests.
- [inferred] Recipe for an AI reviewer:
  1. Derive the category/choice table for each changed function.
  2. Mark every cell handled, unhandled or not applicable; never return a free-form list.
  3. Cross the choices pairwise.
  4. Run every string, path and time input against the falsehood families.
  5. Emit one failing test per gap, then shrink it.
  6. Score the review by mutants killed.
- [read] Repo, PTY and UTF-16: the ring trim uses `PtyProtocol.cut` so it never splits a surrogate pair (`packages/core/src/pty.ts:320-324`, `packages/core/src/pty/protocol.ts:35-44`). The first line after a cut is dropped because it can start inside an escape sequence.
- [read] Repo, other cases:
  - SSE parsing handles CR, LF and CRLF, UTF-8 split across chunks, a BOM and multiline data (`packages/core/src/capability/mcp/http.ts:172`).
  - The output inspector holds back 64 UTF-16 units, 65 across a surrogate pair (`packages/core/src/output-inspector.ts:51`).
  - A test rejects symlink roots and uses a junction on win32 (`apps/desktop/src/main/cli-artifacts.test.ts:147-152`).
- [read] Repo, recorded incidents:
  - First run: macOS scans a new unsigned executable (about 30s), which broke a 20s readiness cap (`.orchestra/skills/desktop-startup-maintenance/SKILL.md:18`).
  - File watcher: a server started in home watched the whole home and cost about 3.4s (`.orchestra/skills/desktop-startup-maintenance/SKILL.md:21`).
  - PTY: bash 3.2 fires the DEBUG trap on PROMPT_COMMAND, and bun-pty and omni deliver the first read differently (`.orchestra/skills/terminal-maintenance/SKILL.md:40-41`).

**Not examined.** Git history (commits, blame, PRs) could not be read: the history tool is bound to the main checkout, which does not track this worktree, so every log, blame and search returned empty or failed. The repo evidence above comes from current code comments and maintenance-skill trap lists, not from fix commits. SQLite, git-operation and Electron/Windows-specific bug history is therefore not covered. Decision tables, cause-effect graphs and Unicode normalization (UAX #15) were not captured as separate sources; the UAX #29 page was captured but not cited. A behavioral repro isn't applicable: all claims are documentary or static reads.

## Claims

[
 {
  "subquestion": {
   "id": "rque_e8f5c0d5d980a65834659e2a31",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "The category-partition method (Ostrand & Balcer, CACM 1988) is a repeatable enumeration procedure: identify parameter and environment categories, split each into choices, then use property/if constraints and [error]/[single] annotations to cut contradictory or redundant frames (FIND example: 1944 -> 678 -> 125 frames); all-pairs cuts 20 categories x 4 choices from 4^20 to a few thousand pairs.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1e2d60f5a28b00ccb5eeb2c420",
      "revision": 1
     },
     "representation": "text",
     "digest": "bb8159358c9d83ec09b946fd4a778361d0b5a0b5524cf3bf5edd458816ff6335"
    },
    "quote": "As a result of these properties, the total number of generated cases reduces to 678."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1e2d60f5a28b00ccb5eeb2c420",
      "revision": 1
     },
     "representation": "text",
     "digest": "bb8159358c9d83ec09b946fd4a778361d0b5a0b5524cf3bf5edd458816ff6335"
    },
    "quote": "The total number of cases reduces to 125 using these techniques."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e8f5c0d5d980a65834659e2a31",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "NIST's empirical basis for combinatorial (t-way) testing: most failures are triggered by one or two parameters, few by three or more, and never more than about six; t-way suites matched exhaustive fault detection with 20x-700x fewer tests. ACTS generates the covering arrays, and sequence covering arrays extend the approach to event orderings (state-based systems).",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0e5ae8fbdb62cfa8bd3156ea5d",
      "revision": 1
     },
     "representation": "text",
     "digest": "1d8c8a7201dbe1d541f837ce3b2662da7d5886cceed7554ed3abf19140286f62"
    },
    "quote": "NIST research showed that most software bugs and failures are caused by one or two parameters, with progressively fewer by three or more"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0e5ae8fbdb62cfa8bd3156ea5d",
      "revision": 1
     },
     "representation": "text",
     "digest": "1d8c8a7201dbe1d541f837ce3b2662da7d5886cceed7554ed3abf19140286f62"
    },
    "quote": "Empirical finding that software failures are triggered by interactions of only a few variables (1 to 6)"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0e5ae8fbdb62cfa8bd3156ea5d",
      "revision": 1
     },
     "representation": "text",
     "digest": "1d8c8a7201dbe1d541f837ce3b2662da7d5886cceed7554ed3abf19140286f62"
    },
    "quote": "Developed sequence covering arrays, extending combinatorial methods to event sequence testing"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_af755a2e2259d259528fd63036",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "The curated 'Falsehoods Programmers Believe' index (kdeldycke/awesome-falsehood) collects primary falsehood articles by family: time (including Unix time and leap seconds, time zones and DST), names, text (normalization, surrogate pairs, grapheme clusters), file paths (including Windows paths), mtime, floating point, CSV, networks, and the Big List of Naughty Strings corpus.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_76ff068d240938f569a82446bc",
      "revision": 1
     },
     "representation": "text",
     "digest": "092197cd0eed0dfc09fc20c9e8fc2a1af3adab352ade3a62744049b163c1300d"
    },
    "quote": "Falsehoods about text - Practical examples illustrating Unicode normalization, ligatures, surrogate pairs, character widths, and grapheme cluster pitfalls in substring operations."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_76ff068d240938f569a82446bc",
      "revision": 1
     },
     "representation": "text",
     "digest": "092197cd0eed0dfc09fc20c9e8fc2a1af3adab352ade3a62744049b163c1300d"
    },
    "quote": "Falsehoods about Unix Time - Mind the leap second!"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_76ff068d240938f569a82446bc",
      "revision": 1
     },
     "representation": "text",
     "digest": "092197cd0eed0dfc09fc20c9e8fc2a1af3adab352ade3a62744049b163c1300d"
    },
    "quote": "Myths about File Paths - Diversity of file-systems and OSes makes file paths a little harder than we might think of."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_76ff068d240938f569a82446bc",
      "revision": 1
     },
     "representation": "text",
     "digest": "092197cd0eed0dfc09fc20c9e8fc2a1af3adab352ade3a62744049b163c1300d"
    },
    "quote": "Big List of Naughty Strings - 🆓 A huge corpus of strings which have a high probability of causing issues when used as user-input data."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_46b25ccf181167180d063f3175",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Coverage-guided fuzzing (libFuzzer) keeps any mutation that reaches new code in a corpus, writes the failing input to disk, and can minimize crashes (-minimize_crash) and corpora (-merge=1). A fuzz target must tolerate empty, huge and malformed input, which is itself a review checklist for a parser.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b358d6c93448db6f3dedfec2df",
      "revision": 1
     },
     "representation": "text",
     "digest": "5e51a89c3322fb5ef3a49a301584ad8dc1189f87622ea399b6d60a9d5f5418b9"
    },
    "quote": "It must tolerate any kind of input (empty, huge, malformed, etc)."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b358d6c93448db6f3dedfec2df",
      "revision": 1
     },
     "representation": "text",
     "digest": "5e51a89c3322fb5ef3a49a301584ad8dc1189f87622ea399b6d60a9d5f5418b9"
    },
    "quote": "If a mutation triggers execution of a previously-uncovered\npath in the code under test, then that mutation is saved to the corpus for\nfuture variations."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_46b25ccf181167180d063f3175",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Property-based testing finds edge cases a hand-written example misses: in Hypothesis's own tutorial a sort test that passed on integers fails once floats are allowed, with counterexample [1.0, nan, 0]. The tutorial also recommends round-trip properties and replacing parametrize tables with strategies.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_440185448da253bf82d525d626",
      "revision": 1
     },
     "representation": "text",
     "digest": "7123f724111d72439fa23fd2bab5476333d41da575621703aca8789654aa9e3a"
    },
    "quote": "For me, that counterexample is `[1.0, nan, 0]`."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_440185448da253bf82d525d626",
      "revision": 1
     },
     "representation": "text",
     "digest": "7123f724111d72439fa23fd2bab5476333d41da575621703aca8789654aa9e3a"
    },
    "quote": "Look for round-trip properties: encode/decode, serialize/deserialize, etc."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_46b25ccf181167180d063f3175",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Delta debugging (Zeller & Hildebrandt 2002) shrinks a failing input to a minimal reproducer (e.g. 'x = 1 + 2 * 3 / 0' -> '3/0'). Grammar-based reduction needed 10 tests where delta debugging needed 900 on a structured input, and PBT tools apply the same idea as shrinking.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_679b0e623e95d9b986bc7d2838",
      "revision": 1
     },
     "representation": "text",
     "digest": "7b19070374751ab3fcb11b36e5a8894dde59a436146995cb0a4d65723f3f1fbc"
    },
    "quote": "The input is reduced to the minimum: We get the essence of the division by zero."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_679b0e623e95d9b986bc7d2838",
      "revision": 1
     },
     "representation": "text",
     "digest": "7b19070374751ab3fcb11b36e5a8894dde59a436146995cb0a4d65723f3f1fbc"
    },
    "quote": "For syntactically complex inputs, grammar-based reduction is much faster and yields better results."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_433b4eeea6a9e5e9422ec5211e",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Measured LLM coverage of edge cases is incomplete. TestPilot (gpt-3.5) reached a median of 70.2% statement and 52.8% branch coverage on 25 npm packages. The best model synthesized correct property-based tests for only 21% of the properties extractable from API docs (Vikram et al.).",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0741cc78aab7c5285d2cb36ed7",
      "revision": 1
     },
     "representation": "text",
     "digest": "e2261326709f482a6c9d6bb2fc15f8f555f7d87fcb17cce471070b7aa0abd1fd"
    },
    "quote": "The generated tests achieve a median statement coverage of 70.2% and branch coverage of 52.8%"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_aaaa2316b0628b98e38a19a56f",
      "revision": 1
     },
     "representation": "text",
     "digest": "0f61317b11b0e5c7619c3a6540d12ef995e88fa27ae6656e23f996baf382ca1b"
    },
    "quote": "the best model (GPT-4) is able to automatically synthesize correct PBTs for 21% of properties extractable from API documentation"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_433b4eeea6a9e5e9422ec5211e",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Approaches that work put the LLM inside an objective feedback loop rather than trusting a one-shot list. Fuzz4All loops LLM generation against coverage and found 98 bugs (64 confirmed new). Meta's ACH generates concern-specific mutants the current tests miss, then tests that kill them; engineers accepted 73% of those tests.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1e9d7d2b5d4004ba00a08c7915",
      "revision": 1
     },
     "representation": "text",
     "digest": "9252da8aacb5f7cb9566b02c4def6f442e8f73ea2e1a7faa47f401f2b557f11b"
    },
    "quote": "a novel LLM-powered fuzzing loop, which iteratively updates the prompt to create new fuzzing inputs"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f3aed45a7354842f6693698a76",
      "revision": 1
     },
     "representation": "text",
     "digest": "1cb525301d1d68801766de315c73e8ae111e7fc1f158a7bb1a6447b2c50b9718"
    },
    "quote": "it focuses on generating currently undetected faults that are specific to an issue of concern"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f3aed45a7354842f6693698a76",
      "revision": 1
     },
     "representation": "text",
     "digest": "1cb525301d1d68801766de315c73e8ae111e7fc1f158a7bb1a6447b2c50b9718"
    },
    "quote": "engineers accepted 73% of its tests"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_433b4eeea6a9e5e9422ec5211e",
   "revision": 1
  },
  "nature": "inference",
  "proposition": "To make an AI reviewer's edge-case search exhaustive rather than anecdotal: (1) derive categories and choices from the changed function's inputs and environment (category-partition), and report every choice as handled, unhandled, or not applicable rather than a free list; (2) cross the choices pairwise; (3) run every string, path and time input against the falsehood families; (4) turn each suspected gap into a failing test or property, then shrink it; (5) score the review by mutants killed, not by findings listed.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1e2d60f5a28b00ccb5eeb2c420",
      "revision": 1
     },
     "representation": "text",
     "digest": "bb8159358c9d83ec09b946fd4a778361d0b5a0b5524cf3bf5edd458816ff6335"
    },
    "quote": "The first step in the category-partition method is categorize the inputs and environmental conditions"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f3aed45a7354842f6693698a76",
      "revision": 1
     },
     "representation": "text",
     "digest": "1cb525301d1d68801766de315c73e8ae111e7fc1f158a7bb1a6447b2c50b9718"
    },
    "quote": "From these currently uncaught faults, ACH generates tests that can catch them"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_7f77452ba0df387951c4d885e0",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "PTY text in this repository is UTF-16-indexed, and the code guards against splitting a surrogate pair: the ring trim calls PtyProtocol.cut, which steps back one unit when the index falls between a high and a low surrogate. afterFirstLine drops the first line because a cut can land inside an escape sequence.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_828f1b17aac0307abc24255ed3",
      "revision": 1
     },
     "representation": "text",
     "digest": "9421347fd5a0c63321739ae5535a002bfab484a24176a9480c98d1f2163bef94"
    },
    "lines": {
     "start": 320,
     "end": 324
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a2c4204e64132bcdc6049fecf2",
      "revision": 1
     },
     "representation": "text",
     "digest": "d3de1b4712ab51547ba8ddbd7b27621fd976bfd3396fe8feba5ecf2d9b5648bd"
    },
    "lines": {
     "start": 35,
     "end": 44
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_7f77452ba0df387951c4d885e0",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "Other stack-specific edge cases the code handles explicitly: SSE parsing covers CR, LF and CRLF line endings, UTF-8 split across chunks, a BOM and multiline data (mcp/http.ts); the output inspector quarantines 64 UTF-16 units (65 across a surrogate pair); a desktop test rejects symlink roots and uses a junction on win32.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_effd5eec4b79f5adcec99c416f",
      "revision": 1
     },
     "representation": "text",
     "digest": "ec74710d22c8937392e6440b6e1734ee90ac02eb94134a0ab43bc0799e19c8f1"
    },
    "lines": {
     "start": 172,
     "end": 172
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7af75a1659f4f35b1d9c310076",
      "revision": 1
     },
     "representation": "text",
     "digest": "e20c8d4d052818fa864aae40d371686d31bcfb6a1af0006b2a8a20f6064fb10f"
    },
    "lines": {
     "start": 51,
     "end": 51
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6bf50c077aaf40c0f168bc707c",
      "revision": 1
     },
     "representation": "text",
     "digest": "919c519ebe2bab536d5b89f9b654cb5a260012c6a4c1dbd5c09704f99dde53b5"
    },
    "lines": {
     "start": 147,
     "end": 152
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_7f77452ba0df387951c4d885e0",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "The maintenance skills record past incidents in the first-run, platform and file-watcher families. On first run macOS scans a new unsigned executable (about 30s on 0.3.1), so a 20s readiness cap failed launch. A server started in the home directory watched the whole home and cost about 3.4s. bash 3.2 on macOS fires the DEBUG trap on PROMPT_COMMAND. bun-pty and omni deliver the first read differently.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_61bab4089a6269009a41e85c64",
      "revision": 1
     },
     "representation": "text",
     "digest": "a42aabded339cb23e857d252d7843566850f1a58c8d8ef560a7f4fe795a6d6af"
    },
    "lines": {
     "start": 18,
     "end": 18
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_61bab4089a6269009a41e85c64",
      "revision": 1
     },
     "representation": "text",
     "digest": "a42aabded339cb23e857d252d7843566850f1a58c8d8ef560a7f4fe795a6d6af"
    },
    "lines": {
     "start": 21,
     "end": 21
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_5c307d643d7e25cbfe1979e4a0",
      "revision": 1
     },
     "representation": "text",
     "digest": "b46e97577fab9c811b2a1ebb8c25f92f2280cb2f00b1e20c95a9fe0e590ee557"
    },
    "lines": {
     "start": 40,
     "end": 41
    }
   }
  ]
 }
]
