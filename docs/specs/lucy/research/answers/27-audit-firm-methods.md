# 27-audit-firm-methods

session ses_f545c04dcf1b3e81fa76c6802e99d052794223c823812018b95215a8c73ae761

## Answer

**Conclusion.** Audit-grade review combines five layers: (1) a scoped, time-boxed engagement, usually threat-model-first, ending with a fix-review retest; (2) a context-building pass that extracts invariants and assumptions before any hunting; (3) targeted manual hunting (spec-to-code checks, entry points, differential review) run alongside tool-assisted variant analysis, taint analysis and fuzzing, with formal verification used only for a few critical invariants; (4) a strict finding bar: impact-based severity, a separate difficulty/likelihood axis, root cause plus attack path, and a PoC whenever the bug is not obvious; (5) for contests, adjudication by a judge, with deduplication by root cause and a dispute window. AI systems already replicate the mechanical parts with measured results: variant analysis from a seed bug, harness generation and crash triage, PoV-gated patching, spec-compliance checks and refutation by an independent agent. They do not replicate the judgment layers (scoping, threat modeling, severity adjudication). Every strong published result pairs the LLM with a fuzzer, a debugger or a checker that verifies its output.

**(1) Engagement structure**
- read: ToB runs threat modeling before code review so the code review "can start from the design-level findings". Fix review follows: Jetty got a lightweight threat model, then "a three-week-long code review", then a fix review (ToB/OSTIF blog).
- read: ToB reports put person-weeks of effort on the cover and append the fix-review retest to the same document (Anatomy of a report).
- read: ToB's review skills require explicit coverage limits. The diff skill says "Explicitly state coverage limits and confidence level"; the spec skill says to read `notChecked`/`unverified` "before treating the report as complete".

**(2) Techniques**
- read: Variant analysis means using "a known security vulnerability as a seed" (CodeQL docs). ToB's version: first match only the known instance, then generalize one element at a time, and "Stop when more than half" of the matches are noise.
- read: Invariant extraction: for each function, record "what must always be true (with the line that shows it)", and flag assumptions where nothing makes them true (`nothing found`) (audit-context-building).
- read: Spec-to-code mapping gives each requirement one of six verdicts (implemented, partial, contradicted, stronger-than-spec, absent, undecidable).
- read: Differential review uses git blame, a caller-count "blast radius" and test coverage of the changed code. Entry-point enumeration is a separate skill. The Testing Handbook covers fuzzing and taint analysis (Semgrep/CodeQL) and has per-language bug-class checklists.

**(3) Manual + fuzzing + formal verification**
- read: ToB uses fuzzing in most audits and formal verification only rarely. Their Echidna fuzzer rediscovered two bugs that had been publicized as formal-verification finds (the MakerDAO DAI invariant and Compound Comet) "in a matter of minutes". "Writing good invariants is 80% of the work."
- read: In the curl audit, fuzzing ran "in parallel with our manual secure code review" and found two high-severity memory-corruption bugs.

**(4) Finding quality**
- read: Code4rena: High means "Assets can be stolen/lost/compromised directly". A submission must be both valid and of sufficient quality. A PoC that fails the burden-of-proof test is insufficient. Duplicates share a root cause; full credit needs the root cause plus the maximum impact.
- read: Sherlock rates severity by impact only ("Likelihood is not considered"). A report without a PoC is invalid if the issue cannot be understood without one. It also lists categories that are never valid. ToB, by contrast, scores severity and difficulty separately.

**(5) Combining reviewers, and AI results**
- read: Contests run many independent wardens. A judge decides validity, severity and duplicates, and a 48-hour post-judging QA (PJQA) window lets the sponsor and wardens dispute decisions. Cantina sells "hybrid" audits: researchers plus AI review.
- read: ToB's spec workflow sends each divergence to agents that did not produce it, because "Claude favors findings it produced when asked to check" its own output.
- read: AIxCC finals: the systems found 54 of 63 synthetic vulnerabilities (86%), patched 43 of those (68%), found 18 real vulnerabilities, and spent about $152 per task. ToB's Buttercup found 28 vulnerabilities and applied 19 patches across 48 challenges, with >90% accuracy. It augments libFuzzer and Jazzer with LLM-generated test cases.
- read: Google's Big Sleep framed LLM work as variant analysis seeded by a commit diff. It found a SQLite bug that 150 CPU-hours of AFL fuzzing missed, but the team says a target-specific fuzzer is likely "at least as effective". OSS-Fuzz-gen's LLM-written harnesses added 370k+ lines of coverage and found 26 vulnerabilities, including CVE-2024-9143 in OpenSSL.
- inferred: An AI reviewer can replicate context building, spec mapping, checklist and variant hunting, differential review, harness writing and crash triage, refutation by a separate agent, and output formatted to these rubrics, as long as a probe verifies each finding. Scoping trade-offs, threat modeling with the client, and the final severity call still depend on humans or an adjudicator.

**Not examined:** primary methodology documents from NCC Group, Cure53, Include Security, X41, OpenZeppelin and Semgrep. I could not extract text from the ToB/OSTIF PDF reports, so the exact wording of ToB's "Coverage Limitations" section comes from search snippets only. Spearbit's two-lead-researcher minimum is also unverified (search snippet only). No precision/recall data on false positives in LLM-assisted audits was found among the sources.

## Claims

[
 {
  "proposition": "Trail of Bits runs threat modeling before secure code review so the review starts from design-level findings, follows code review with a fix review, and time-boxed Jetty to a three-week code review after a lightweight threat model.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_65c26d270d4962c992cc0cafe8",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f3f0d9aaabd109f7137d8fca96",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "a473f0f4c5d5aad2eb1c6742ba0a69f6b30d68dfedae234793673b0eba023566"
    },
    "quote": "When we follow threat modeling work with secure code review, our code review can start from the design-level findings that our threat modeling work resulted in."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f3f0d9aaabd109f7137d8fca96",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "a473f0f4c5d5aad2eb1c6742ba0a69f6b30d68dfedae234793673b0eba023566"
    },
    "quote": "Following our secure code review with a fix review then gives our security engineers the chance to help guide and reassess the mitigations implemented based on our findings."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f3f0d9aaabd109f7137d8fca96",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "a473f0f4c5d5aad2eb1c6742ba0a69f6b30d68dfedae234793673b0eba023566"
    },
    "quote": "we conducted a three-week-long code review of Jetty"
   }
  ]
 },
 {
  "proposition": "Trail of Bits reports state level of effort in person-weeks on the cover and append a fix-review retest to the same report.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_65c26d270d4962c992cc0cafe8",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_2e66023e522620d515945be5a0",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "8d3e93ea91be8e5da64d11d306f4739ab9c7399dfc65124dab1f67635c0273e9"
    },
    "quote": "Every report we publish lists the person-weeks we spent, right on the cover."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_2e66023e522620d515945be5a0",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "8d3e93ea91be8e5da64d11d306f4739ab9c7399dfc65124dab1f67635c0273e9"
    },
    "quote": "When your patches land, we re-test and append the verification to the same document."
   }
  ]
 },
 {
  "proposition": "Trail of Bits' published review skills require explicit statements of coverage limits and of what was not checked.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_65c26d270d4962c992cc0cafe8",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_66ce6f585ef60e0cdd8e8cbea6",
      "revision": 1
     },
     "representation": "text",
     "digest": "f9af6a8193fc1a9f8ca3c54bb8d19095a5f20c9472ca6d014488bbde50b67da0"
    },
    "quote": "Explicitly state coverage limits and confidence level"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_3202abf314b1f4b73800f7fa2f",
      "revision": 1
     },
     "representation": "text",
     "digest": "eb0d91b50a9c06f50baf8763d1e23566897b9fa3e7ffcf13134eee4e1ccaefe5"
    },
    "quote": "before treating the report as complete"
   }
  ]
 },
 {
  "proposition": "Variant analysis uses a known vulnerability as a seed to find similar problems; Trail of Bits' method first writes a pattern matching only the known instance, then generalizes one element at a time, stopping when more than half of matches are noise.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_187a3d35cd2ce267e84fb3e30a",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c2c311f75c65215f1c6630fedf",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "c2645375945064f7954a9826aae673fbf05e4f8c4b40ce3a1e60174ae648bfd1"
    },
    "quote": "Variant analysis is the process of using a known security vulnerability as a seed to find similar problems in your code."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b939e5c7c2054c875bd5ef4bc1",
      "revision": 1
     },
     "representation": "text",
     "digest": "7b6b78e499bcb88d05c68254ffc91ebc28edabf4e9808adcc40e2628ebb9407e"
    },
    "quote": "Write a pattern matching ONLY the known instance and confirm"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b939e5c7c2054c875bd5ef4bc1",
      "revision": 1
     },
     "representation": "text",
     "digest": "7b6b78e499bcb88d05c68254ffc91ebc28edabf4e9808adcc40e2628ebb9407e"
    },
    "quote": "Stop when more than half"
   }
  ]
 },
 {
  "proposition": "Trail of Bits codifies invariant/assumption extraction per function before hunting, spec-to-code mapping with six verdicts per requirement, and differential review using git blame, caller-count blast radius and test coverage.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_187a3d35cd2ce267e84fb3e30a",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_97369b8a3e782c0f63b5bed7a8",
      "revision": 1
     },
     "representation": "text",
     "digest": "33fa693dc6e166cfa4919e4373cb6578c009d296234c2ae7cb3cd4e79b443765"
    },
    "quote": "Each record lists what must always be true (with the line that shows it)"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_3202abf314b1f4b73800f7fa2f",
      "revision": 1
     },
     "representation": "text",
     "digest": "eb0d91b50a9c06f50baf8763d1e23566897b9fa3e7ffcf13134eee4e1ccaefe5"
    },
    "quote": "Every requirement gets one of six verdicts"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_66ce6f585ef60e0cdd8e8cbea6",
      "revision": 1
     },
     "representation": "text",
     "digest": "f9af6a8193fc1a9f8ca3c54bb8d19095a5f20c9472ca6d014488bbde50b67da0"
    },
    "quote": "uses git blame for context, calculates blast radius by counting callers, checks test coverage of modified code"
   }
  ]
 },
 {
  "proposition": "Entry-point enumeration is a published Trail of Bits audit skill, and the Testing Handbook covers static taint analysis and fuzzing as audit techniques.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_187a3d35cd2ce267e84fb3e30a",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_19b72e7f27fb5f4f9351fe577c",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "0c63166337ec4da5f7f219b6b81ae9bcd38b694ef5dd8e3568c9904d74b64b60"
    },
    "quote": "Identify state-changing entry points in smart contracts for security auditing"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_47713c61cf9cf8be427277f75b",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "6f053a1ec57143c3492fdf55a76f53d8169e96fb7eb2c168d8c79a185fea4b90"
    },
    "quote": "demystify static and dynamic analysis techniques such as fuzzing and taint analysis"
   }
  ]
 },
 {
  "proposition": "Trail of Bits uses fuzzing in most audits and formal verification only in rare cases, reports that Echidna rediscovered two bugs publicized as formal-verification finds within minutes, holds that writing good invariants is most of the work, and ran fuzzing in parallel with manual review in the curl audit.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_c834c2b551df421017378d7e3b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c54b2a58e3b4f9a6f11dc8b7b5",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "611d385338dbcee713a67cd42a7ccc46b8d47fb6ddab94257e54ddfda4d898fe"
    },
    "quote": "We use fuzzing for most of our audits but have used formal verification methods in the past."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c54b2a58e3b4f9a6f11dc8b7b5",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "611d385338dbcee713a67cd42a7ccc46b8d47fb6ddab94257e54ddfda4d898fe"
    },
    "quote": "Our fuzzer found both bugs in a matter of minutes"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c54b2a58e3b4f9a6f11dc8b7b5",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "611d385338dbcee713a67cd42a7ccc46b8d47fb6ddab94257e54ddfda4d898fe"
    },
    "quote": "Writing good invariants is 80% of the work"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f3f0d9aaabd109f7137d8fca96",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "a473f0f4c5d5aad2eb1c6742ba0a69f6b30d68dfedae234793673b0eba023566"
    },
    "quote": "two high-severity memory corruption vulnerabilities identified through fuzzing, which we conducted in parallel with our manual secure code review efforts"
   }
  ]
 },
 {
  "proposition": "Code4rena defines High as direct asset loss/compromise, requires valid and sufficient-quality submissions where a PoC failing the burden of proof is insufficient, and has judges decide validity, severity and root-cause duplicates.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_902d578761f43fd9a6d13973cc",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_9b6228080e11d912fce3f256f0",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "4af69fb16da755509d1eee9edb66b45f7eeb7f33917abc12c40b6d9b4509ddbb"
    },
    "quote": "Assets can be stolen/lost/compromised directly"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6d64a3554627ab39af9c917d52",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "ed6335ee1122c75d996bb3ef95e1b5b73629a192b33c488b1887124b6bd58212"
    },
    "quote": "proof of concept does not pass the burden of proof test"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6d64a3554627ab39af9c917d52",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "ed6335ee1122c75d996bb3ef95e1b5b73629a192b33c488b1887124b6bd58212"
    },
    "quote": "Findings are duplicates if they share the same root cause."
   }
  ]
 },
 {
  "proposition": "Sherlock judges severity by impact without likelihood and treats a report lacking a PoC as invalid when it cannot be understood without one; Trail of Bits instead scores severity and difficulty separately.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_902d578761f43fd9a6d13973cc",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8b6406a5bd7d2aab12db152efb",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "45d9ca64d22f31e387f28801e11f588263870fcfde67f5aa4992dcedd0bf7d9f"
    },
    "quote": "Likelihood is not considered when identifying the severity and the validity of the report."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_8b6406a5bd7d2aab12db152efb",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "45d9ca64d22f31e387f28801e11f588263870fcfde67f5aa4992dcedd0bf7d9f"
    },
    "quote": "If the original report does not include a Proof of Concept (PoC), it will be considered invalid if the issue cannot be clearly understood without one."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_2e66023e522620d515945be5a0",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "8d3e93ea91be8e5da64d11d306f4739ab9c7399dfc65124dab1f67635c0273e9"
    },
    "quote": "Each finding gets two scores: severity, which is what could happen, and difficulty, which is how hard the bug is to reach."
   }
  ]
 },
 {
  "proposition": "Contest platforms combine many independent reviewers through judge adjudication, root-cause deduplication and a 48-hour post-judging QA dispute window; Cantina markets hybrid human-plus-AI audits.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_b721ba95a4f191e68d2f558eed",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_6d64a3554627ab39af9c917d52",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "ed6335ee1122c75d996bb3ef95e1b5b73629a192b33c488b1887124b6bd58212"
    },
    "quote": "Judges determine validity and severity of issues"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6d64a3554627ab39af9c917d52",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "ed6335ee1122c75d996bb3ef95e1b5b73629a192b33c488b1887124b6bd58212"
    },
    "quote": "there is a 48-hour period during which the sponsor team and certified wardens can raise questions or concerns for the judge's review"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_73abc4a6f17a1fab0259380be0",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "e5e8b4da8e001b43b754d836ef957ef84eb0f52064efe73805e19b41a7fc0e46"
    },
    "quote": "Elite researchers and AI-native analysis go over your code together"
   }
  ]
 },
 {
  "proposition": "Trail of Bits' AI spec-compliance workflow sends each divergence to agents that did not produce it, because the model favors its own findings when self-checking.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_b721ba95a4f191e68d2f558eed",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3202abf314b1f4b73800f7fa2f",
      "revision": 1
     },
     "representation": "text",
     "digest": "eb0d91b50a9c06f50baf8763d1e23566897b9fa3e7ffcf13134eee4e1ccaefe5"
    },
    "quote": "Claude favors findings it produced when asked to check"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_3202abf314b1f4b73800f7fa2f",
      "revision": 1
     },
     "representation": "text",
     "digest": "eb0d91b50a9c06f50baf8763d1e23566897b9fa3e7ffcf13134eee4e1ccaefe5"
    },
    "quote": "The workflow sends each divergence to agents that did not produce it"
   }
  ]
 },
 {
  "proposition": "In the AIxCC final, the competing systems found 54 synthetic vulnerabilities (86%), found 18 real vulnerabilities, and cost about $152 per task.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_c60bb3ca0bc82095a90f9fc31f",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_4bba5be627e16d965bbf729e75",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cdaae9563212d771f44777172623c0db48a0dd5a61010458d646d0b0e83068eb"
    },
    "quote": "discovered 54 unique synthetic vulnerabilities"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_4bba5be627e16d965bbf729e75",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cdaae9563212d771f44777172623c0db48a0dd5a61010458d646d0b0e83068eb"
    },
    "quote": "teams identified 86% of the competition"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_4bba5be627e16d965bbf729e75",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cdaae9563212d771f44777172623c0db48a0dd5a61010458d646d0b0e83068eb"
    },
    "quote": "teams also discovered 18 real, non-synthetic vulnerabilities"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_4bba5be627e16d965bbf729e75",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cdaae9563212d771f44777172623c0db48a0dd5a61010458d646d0b0e83068eb"
    },
    "quote": "average cost per competition task of about $152"
   }
  ]
 },
 {
  "proposition": "Buttercup worked across 48 challenges in 23 repositories with greater than 90% accuracy, augmenting libFuzzer and Jazzer with LLM-generated test cases.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_c60bb3ca0bc82095a90f9fc31f",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_ee6a8bb60d7d797cf05807e010",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "a8c965631fe9a08409ebb703c12ba30359e91669f4738857f6acd68f613dacf9"
    },
    "quote": "48 challenges across 23 open-source repositories"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_ee6a8bb60d7d797cf05807e010",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "a8c965631fe9a08409ebb703c12ba30359e91669f4738857f6acd68f613dacf9"
    },
    "quote": "Had greater than 90% accuracy"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_ee6a8bb60d7d797cf05807e010",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "a8c965631fe9a08409ebb703c12ba30359e91669f4738857f6acd68f613dacf9"
    },
    "quote": "It augments both libFuzzer and Jazzer with LLM-generated test cases."
   }
  ]
 },
 {
  "proposition": "Big Sleep framed LLM vulnerability research as variant analysis, found a SQLite bug that 150 CPU-hours of fuzzing missed, yet judged target-specific fuzzers likely at least as effective; OSS-Fuzz LLM harnesses found bugs in projects with hundreds of thousands of fuzzing hours.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_c60bb3ca0bc82095a90f9fc31f",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_bb442b4fdfacbaf22c7e6a2795",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "635903855dca42391b154baa705f3b52af5891d634ab4bf5844be9c3c8940638"
    },
    "quote": "We also feel that this variant-analysis task is a better fit for current LLMs than the more general open-ended vulnerability research problem."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_bb442b4fdfacbaf22c7e6a2795",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "635903855dca42391b154baa705f3b52af5891d634ab4bf5844be9c3c8940638"
    },
    "quote": "the issue remained undiscovered after 150 CPU-hours of fuzzing"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_bb442b4fdfacbaf22c7e6a2795",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "635903855dca42391b154baa705f3b52af5891d634ab4bf5844be9c3c8940638"
    },
    "quote": "a target-specific fuzzer would be at least as effective"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_3a4320898907f057e4bfa6cb1c",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "5549c4423ea71254ec52d538e74ec421ad564c09ff2c7a5809c7e22d96dff913"
    },
    "quote": "in projects on OSS-Fuzz that already had hundreds of thousands of hours of fuzzing"
   }
  ]
 },
 {
  "proposition": "An AI reviewer can replicate context building, spec mapping, variant hunting, differential review, harness generation, crash triage and independent refutation when a tool verifies each finding; scoping, client threat modeling and final severity adjudication remain human or adjudicator functions in the sources examined.",
  "nature": "inference",
  "subquestion": {
   "id": "rque_c60bb3ca0bc82095a90f9fc31f",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_19b72e7f27fb5f4f9351fe577c",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "0c63166337ec4da5f7f219b6b81ae9bcd38b694ef5dd8e3568c9904d74b64b60"
    },
    "quote": "Systematic false positive verification for security bug analysis with mandatory gate reviews"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6d64a3554627ab39af9c917d52",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "ed6335ee1122c75d996bb3ef95e1b5b73629a192b33c488b1887124b6bd58212"
    },
    "quote": "Judges determine validity and severity of issues"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_ee6a8bb60d7d797cf05807e010",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "a8c965631fe9a08409ebb703c12ba30359e91669f4738857f6acd68f613dacf9"
    },
    "quote": "It augments both libFuzzer and Jazzer with LLM-generated test cases."
   }
  ]
 }
]
