# 18-test-review

session ses_780e50cbb24335feabc1d8e512aa11a7c543c2b1bbd7d1c32d8504c2d0096fa8

## Answer

**Conclusion.** Review tests for what they would catch, not for how much code they run. Expect four things: (1) proof the test fails without the change and passes with it; (2) mutants on the changed lines that the tests kill, with coverage used only to find untested code; (3) assertions about public, observable state, which is where the oracle problem actually shows up; (4) determinism. On top of that, a reviewer here must enforce this repository's own rules: no mocks or `globalThis` patching, no logic duplicated into tests, tests run only through `test:ci`, and `expectSpawn` for tests that spawn through omni.

**Checklist and evidence**

1. **Adequacy**
   - *Coverage is a floor, not a target* (read). Once suite size is controlled for, coverage correlates only low to moderately with fault detection. Inozemtseva & Holmes (ICSE 2014) say it "should not be used as a quality target" (claim-1). Software Engineering at Google (SWE@G) ch. 11 warns that an 80% bar "becomes a ceiling" and that coverage "only measures that a line was invoked, not what happened as a result" (ch11 lines 228-232).
   - *Use mutants on the diff* (read). Mutant detection correlates with real-fault detection "independently of code coverage" (Just et al., FSE 2014). Google mutates "only changed code during code review", and found that developers shown mutants write more tests and that mutants are "coupled with real faults" (Petrović et al. 2021; ICSE 2021) (claims 2-3).
   - *Fail-before/pass-after* (inferred). Revert the production change, run the new test, and confirm it goes red. This is the cheapest single-mutant check. Then ask which mutants of the changed lines stay alive.
   - *Requirements and failure paths* (read). "If you liked it, then you shoulda put a test on it", and SWE@G explicitly calls for tests that simulate failures: injected errors, RPC errors, latency (ch11 lines 218-224). Map each behavior in the PR description to a test. Flag any missing negative, error, boundary or timeout case.
2. **Quality and smells**
   - Test smells are a distinct catalogue from production-code smells (van Deursen et al. 2001): Assertion Roulette, Eager Test, Mystery Guest, General Fixture, and others (claim-5).
   - Test through public APIs, and check *state, not interactions*. Interaction checks are how over-mocking and "testing the mock" happen (SWE@G ch12 lines 164-168).
   - *No logic in tests*: one string concatenation in a test hid a double-slash bug (ch12 lines 408-436). This is the same rule as AGENTS.md "do not duplicate logic into tests".
   - The other smells a reviewer should flag are sleeps, shared or global state, order dependence and snapshot overuse (inferred).
3. **Oracle problem**
   - Barr et al. (TSE 2015) list the ways to automate an oracle: models, specifications, contracts and metamorphic testing. When none fits, the oracle is the human (claim-7).
   - Metamorphic relations are "necessary properties … in relation to multiple inputs and their expected outputs" (Chen et al., CSUR 2018) (claim-8).
   - What to ask in review (inferred):
     - Was the expected value derived independently of the code under test?
     - Could a property or metamorphic relation (round-trip, idempotence, permutation invariance) replace a single hand-picked example?
     - For golden files and snapshots: is every diff to a golden file reviewed as a behavior change? Is the snapshot narrow enough that an update cannot be rubber-stamped?
4. **Flakiness**
   - Luo et al. (FSE 2014) studied 201 flaky-test-fix commits across 51 projects (claim-9). In Python, order dependency causes 59% of flaky tests, and 95% confidence that a passing test is not flaky takes about 170 reruns, so a few reruns prove little (Gruber et al., ICST 2021) (claim-10).
   - SWE@G: tests lose value as flakiness approaches 1%. Automatic rerun "is only delaying the need to address the root cause" (ch11 lines 166-172). For review: look at static signals (sleeps, wall clock, network, randomness, shared state, unawaited async). Quarantine only with an owner and a fix deadline (inferred).
5. **Levels and strategy**
   - Google aims for roughly 80% unit, 15% integration and 5% end-to-end tests. It warns against the ice-cream cone and the hourglass, and says the right mix depends on the codebase (ch11 lines 196-214).
   - The testing trophy is a practitioner heuristic, not empirical evidence: "The more your tests resemble the way your software is used, the more confidence they can give you" (Dodds) (claim-12).
   - Neither shape has strong evidence behind it. Judge by behavior coverage, speed and reliability (inferred).
6. **This repository's rules a reviewer must enforce** (read)
   - AGENTS.md:158-166 sets the rules: avoid mocks and `globalThis`, test the actual implementation, and run tests only through `bun run test:ci`. Named test files run in the given order; directories are substring filters.
   - The omni positive control must print `pass` or `not applicable`. Tests that spawn through omni must call `expectSpawn(import.meta.path)` before spawning (`packages/core/test/fixture/omni-expect.ts:3-16`).
   - `script/test-guard.ts:6-15` stops a local `bun test` unless `CI=true` or the owner set `ORCHESTRA_LOCAL_TESTS=1`.
   - Guard rules warn on added lines that assign to `globalThis` (`script/guards/rules/test-globalthis.toml:1-11`) or raise a test timeout to 10s or more (`script/guards/rules/test-timeout-raised.toml:1-11`).
   - So the reviewer should demand:
     - a `test:ci` run that names the touched test files and is stated as such, not a local green;
     - no new mocks or global patches without a reason;
     - a fail-before/pass-after demonstration.

**Not examined:** I could not fetch the full PDFs (Luo 2014, Barr 2015, Parry 2022 survey). So the per-category flaky root-cause percentages (async wait about 45%, concurrency, order) and the full smell list come from abstracts and search snippets, not from the papers' tables. The Google flaky-test blog body was truncated on capture, and I did not quote SWE@G ch. 13 (test doubles) or ch. 14. I did not inspect `script/test-ci.ts` internals or measure mutation tooling for Bun.

**Reproduce the repo rules:** `bun run check:guards --base origin/dev` (test-globalthis and test-timeout-raised findings); `bun run test:ci <package> <test file>` (omni positive control line in the output).

## Claims

[
 {
  "subquestion": {
   "id": "rque_69760975235281792bfd15e824",
   "revision": 1
  },
  "proposition": "Inozemtseva & Holmes (ICSE 2014) found low-to-moderate correlation between coverage and fault-detection effectiveness once suite size is controlled, and conclude coverage should not be a quality target.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7982a860d2be70e53bd4241950",
      "revision": 1
     },
     "representation": "text",
     "digest": "00aaa78b833231493a09115baa42677cc0101f05233d02f74a29307ed2d48442"
    },
    "quote": "it is not a good indicator of test suite effectiveness."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_57b703fb4864fd1f5e8a949174",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "2117652b624cdd8c8283f084c52958d06dd4f71858829ea0a44d48fc7bad9504"
    },
    "lines": {
     "start": 228,
     "end": 232
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_69760975235281792bfd15e824",
   "revision": 1
  },
  "proposition": "Mutant detection correlates with real-fault detection independently of code coverage (Just et al., FSE 2014).",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0a10ca9682924d31882a9e6895",
      "revision": 1
     },
     "representation": "text",
     "digest": "73be73f6bfb2577319eab3eea98a132424a8fa8d2d4be0730a44f66a6fdba8d4"
    },
    "quote": "real fault detection, independently of code coverage"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_69760975235281792bfd15e824",
   "revision": 1
  },
  "proposition": "Google applies mutation testing incrementally to changed code during code review, and found developers exposed to mutants write more tests and that mutants are coupled with real faults.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_71c43e51d4f9c6676ec53ee1bc",
      "revision": 1
     },
     "representation": "text",
     "digest": "b1964246473dee6e215a6c0b628058f26d1a1a9a25fdee22501751a8df4be9ff"
    },
    "quote": "Mutation testing is done incrementally, mutating only changed code during code review"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1d8863a6592c4395defe1c605a",
      "revision": 1
     },
     "representation": "text",
     "digest": "1ac2971860beea342e26de2c36a77aee073cc485236ea8f1163da69efc0986b9"
    },
    "quote": "evidence that mutants are indeed coupled with real faults"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_69760975235281792bfd15e824",
   "revision": 1
  },
  "proposition": "SWE at Google says test everything you don't want to break (Beyoncé Rule) and explicitly write tests that simulate failures (exceptions, RPC errors, latency).",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_57b703fb4864fd1f5e8a949174",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "2117652b624cdd8c8283f084c52958d06dd4f71858829ea0a44d48fc7bad9504"
    },
    "lines": {
     "start": 218,
     "end": 224
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_dc327c19e18ebde8c37924dac1",
   "revision": 1
  },
  "proposition": "van Deursen et al. (2001) established that test code has a distinct set of bad smells and test-specific refactorings.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_41fd3398f09ebc2e0308c10c17",
      "revision": 1
     },
     "representation": "text",
     "digest": "feedf5e20a1acb3bdf27e99da2a21ce94421661ae6caa6620e13b7d24c4931f9"
    },
    "quote": "there is a distinct set of bad smells involved"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_dc327c19e18ebde8c37924dac1",
   "revision": 1
  },
  "proposition": "SWE at Google recommends testing via public APIs, verifying state rather than interactions, and keeping logic out of tests because logic in tests can conceal bugs.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b9bceecf32facb059fe3c3b2c9",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "5e58bd3940e10881b25f4754eebe8c3d0cdf56503ae21e03fc169bac65070b54"
    },
    "lines": {
     "start": 164,
     "end": 168
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b9bceecf32facb059fe3c3b2c9",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "5e58bd3940e10881b25f4754eebe8c3d0cdf56503ae21e03fc169bac65070b54"
    },
    "lines": {
     "start": 408,
     "end": 436
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_8aac35e1237e8f9a3833ac3e85",
   "revision": 1
  },
  "proposition": "Barr et al. (TSE 2015) define the test oracle problem and list oracle automation via modelling, specifications, contracts and metamorphic testing, with the human as the fallback oracle.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_bb329f85f6c565b36d3eea47c7",
      "revision": 1
     },
     "representation": "text",
     "digest": "65620278d36cc8fceca72503494b3e32869aa1939d7f64570a648915d50831e8"
    },
    "quote": "including modelling, specifications, contract-driven development and metamorphic testing"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_8aac35e1237e8f9a3833ac3e85",
   "revision": 1
  },
  "proposition": "Metamorphic relations are necessary properties relating multiple inputs and their outputs, usable as oracles (Chen et al., ACM CSUR 2018).",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_647c4ceafdf265a0033ae237d2",
      "revision": 1
     },
     "representation": "text",
     "digest": "1a7cbfa821f8f115b46c188fb266708bdc0d5678736987848525e3992b95fb69"
    },
    "quote": "A central element is a set of metamorphic relations, which are necessary"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_1e192143a05ff151e6940503b5",
   "revision": 1
  },
  "proposition": "Luo et al. (FSE 2014) is the foundational flaky-test root-cause study, analysing 201 flaky-test-fixing commits in 51 open-source projects.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_aa148d5f1259e294a50939a18d",
      "revision": 1
     },
     "representation": "text",
     "digest": "a4ba596c72a7be0f500703bd9a44077f5865ad453d609a789699ac8083ff1182"
    },
    "quote": "a total of 201 commits that likely fix flaky tests in 51 open-source projects"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_1e192143a05ff151e6940503b5",
   "revision": 1
  },
  "proposition": "In Python, order dependency causes 59% of flaky tests, and ~170 reruns are needed for 95% confidence a passing test is not flaky, so few reruns are weak detection.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_06abe2f2f5f5a4eb955ec0832c",
      "revision": 1
     },
     "representation": "text",
     "digest": "5343acc366019af43e0ee54115e2d0d9e9e772b49c1b082d52f958d5989a984a"
    },
    "quote": "Order dependency is a much more dominant problem in Python, causing 59% of the 7571 flaky tests in our dataset"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_06abe2f2f5f5a4eb955ec0832c",
      "revision": 1
     },
     "representation": "text",
     "digest": "5343acc366019af43e0ee54115e2d0d9e9e772b49c1b082d52f958d5989a984a"
    },
    "quote": "A 95% confidence that a passing test case is not flaky on average would require 170 reruns"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_57b703fb4864fd1f5e8a949174",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "2117652b624cdd8c8283f084c52958d06dd4f71858829ea0a44d48fc7bad9504"
    },
    "lines": {
     "start": 166,
     "end": 172
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_b3663d8853eba8dc48029d23dd",
   "revision": 1
  },
  "proposition": "Google aims for roughly 80% unit / 15% integration / 5% end-to-end tests, warns against ice-cream-cone and hourglass shapes, and says the mix depends on local architecture.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_57b703fb4864fd1f5e8a949174",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "2117652b624cdd8c8283f084c52958d06dd4f71858829ea0a44d48fc7bad9504"
    },
    "lines": {
     "start": 196,
     "end": 214
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_b3663d8853eba8dc48029d23dd",
   "revision": 1
  },
  "proposition": "The testing trophy is a practitioner heuristic favouring integration tests, grounded in the principle that tests resembling real use give more confidence, not in empirical study.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_327133109282317284188be751",
      "revision": 1
     },
     "representation": "text",
     "digest": "b1705be36a5c87943c2d43086ac04209588ec19536ea9ef7fba0f795a1d59cac"
    },
    "quote": "The more your tests resemble the way your software is used, the more confidence they can give you."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_822072136f52748997c3b10347",
   "revision": 1
  },
  "proposition": "AGENTS.md requires avoiding mocks and globalThis, testing the actual implementation without duplicating logic, running tests only via bun run test:ci, the omni positive control with expectSpawn, and blocks local bun test via script/test-guard.ts unless the owner sets ORCHESTRA_LOCAL_TESTS=1.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_905e4d9d4d974522919e8cace0",
      "revision": 1
     },
     "representation": "text",
     "digest": "e0b4a4295e99a4961718df6d2608ee2fdc117cc4e14e51766a65b5436e4f300a"
    },
    "lines": {
     "start": 158,
     "end": 166
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_9f8fb00686e2f6c0433a07f62f",
      "revision": 1
     },
     "representation": "text",
     "digest": "9028f435539512533da5abaf84fc561d2699ee15602c05b81b1394d3915e5057"
    },
    "lines": {
     "start": 6,
     "end": 15
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_4d9ef452ab6b3287aeaaa8b657",
      "revision": 1
     },
     "representation": "text",
     "digest": "5bef5d0cca3a53dd7d4ce2af63d0a4a8c6ca2d4a5d1b941a1c0cfe2b9d37a850"
    },
    "lines": {
     "start": 3,
     "end": 16
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_822072136f52748997c3b10347",
   "revision": 1
  },
  "proposition": "Guardrail rules warn on added test lines that assign to globalThis and on test timeouts raised to 10s or more.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_43f804a647806eefa9638b298f",
      "revision": 1
     },
     "representation": "text",
     "digest": "f97ce87d54d1f9abfa00c4b9c4499de0045fd867e091e3551a2a2f743cebdac9"
    },
    "lines": {
     "start": 1,
     "end": 11
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_363b1f7dfb5d34ba7cbaf41db1",
      "revision": 1
     },
     "representation": "text",
     "digest": "bc535c87d2e77ffe8978de3b05c6280aa0d675f5a9717d5cf94c36320e848351"
    },
    "lines": {
     "start": 1,
     "end": 11
    }
   }
  ]
 }
]
