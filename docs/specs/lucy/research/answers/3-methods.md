# 3-methods

session ses_05788298fe2b57b0e6231179ee909c7de1a07aff21ef4d585afa9091489b6b69

## Answer

**Conclusion.** Evidence for human review: it works when changes are small and read slowly, when the reviewer actually understands the change, and when review covers the code with real participation. Most of what humans find is understanding and maintainability; the bugs that slip through are mostly semantic. LLM reviewers on realistic PR benchmarks still have low recall: 15-31% of human-flagged issues in SWE-PRBench, and "current systems underperform" in SWR-Bench. The measured gains come from aggregating several reviews, from a separate verification and filter stage, and from external oracles (execution, mutants), not from self-correction. A best-in-class cold reviewer should therefore:
- work from a curated brief, not a context dump;
- fan out independent passes and aggregate them;
- verify each finding in a separate stage, preferably by execution or a reproduction test;
- judge tests with mutants;
- treat its own confidence and severity labels as uncalibrated until checked against outcomes.

**Supporting claims** (all from captured sources, marked read; claim-11 is inferred):
- read: Bacchelli & Bird (Microsoft, ICSE 2013) found "reviews are less about defects than expected", and "code and change understanding is the key aspect of code reviewing".
- read: SmartBear/Cisco (a vendor study, not peer-reviewed): review 200-400 LOC at a time and stay under 500 LOC/hour, or defect density drops. Sessions run to about 60 minutes, and checklists target omissions, the hardest defects to find.
- read: Google's eng-practices guide: about 100 lines is usually reasonable and 1000 usually too large, the number of files counts toward size, and "the reviewer often has no context". From the Google ICSE-SEIP 2018 case study (9M reviewed changes) only the abstract was captured.
- read: Of 187 bugs that review missed (MSR 2022), 51.34% are semantic and 15.5% are build failures. Low review coverage and participation predict up to 2 and 5 more post-release defects (McIntosh et al., MSR 2014).
- read: SWE-PRBench (2026 preprint): 8 frontier models catch 15-31% of human-flagged issues. Every model gets worse as raw context is added, and a 2,000-token diff with summary beats a full-context prompt.
- read: SWR-Bench (1000 PRs, FSE 2026): aggregating several reviews raises F1 by up to 43.67%.
- read: ByteDance's BitsAI-CR adds a separate ReviewFilter "for precision verification" and reaches 75.0% precision. At Beko (ICSE-SEIP 2025), 73.8% of LLM comments were resolved, but PR closure time rose from 5h52 to 8h20 and developers reported "faulty reviews, unnecessary corrections, and irrelevant comments".
- read: Mutation testing as a test oracle: at Google (about 15M mutants), developers wrote more and better tests, and "mutants are indeed coupled with real faults". Meta's ACH targets mutants at one concern; engineers accepted 73% of its tests, and its LLM equivalent-mutant filter has precision 0.79 and recall 0.47.
- read: Judge reliability: LLM judges agree with humans over 80% of the time but show position, verbosity and self-enhancement bias (MT-Bench). Intrinsic self-correction without external feedback can degrade results (ICLR 2024). P(True) self-evaluation improves when the model sees several of its own samples, but calibration slips on new tasks (Kadavath 2022).
- inferred (claim-11): Cold review trades author context for independence. Feed the reviewer the intent, spec and acceptance criteria rather than the author's reasoning, and let it pull more code on demand.
- inferred (claim-11): Risk-scaled rigor is supported only indirectly (coverage and participation predict defects; missed bugs are semantic). No captured primary study tests risk-tiered review directly.

**Recommended method** (inferred from the above):
1. Work in diff-sized slices of at most a few hundred lines, with a structured intent summary.
2. Run N independent passes and aggregate them.
3. Send every candidate finding through a separate refutation or verification agent that must produce a concrete trigger, ideally a failing test or command; drop findings it cannot reproduce.
4. Review tests by mutation score on the changed lines, not by coverage.
5. Check specs and plans by tracing each acceptance criterion to code and test.
6. Scale the number of passes and the depth of verification with risk (security, concurrency, data, public API, size).
7. Report severity and confidence alongside the evidence, and calibrate them against later outcomes.

**Not examined.** Under the time budget I did not capture CodeReviewer (2022), the Mäntylä & Lassenius 2009 defect taxonomy (a search snippet reports 60-77% of review findings are evolvability issues; uncaptured, so not cited), Kamei's JIT defect-prediction work for risk classification, or primary studies of requirements traceability. No direct study of severity calibration for LLM review findings was found. Everything above comes from abstracts and guide pages, not full papers.

## Claims

[
 {
  "subquestion": {
   "id": "rque_f18427d81199cbbbe9fa84cfd0",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Bacchelli & Bird (Microsoft, ICSE 2013): reviews find fewer defects than expected, and understanding the code and the change is the key part of reviewing.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f4868bcb109c0fcd2742b02c4c",
      "revision": 1
     },
     "representation": "text",
     "digest": "2dca7a8083e66dbd149df2976222820891ceca1cec5d263a793970739f24e2d8"
    },
    "quote": "reviews are less about defects than expected and instead provide additional benefits such as knowledge transfer, increased team awareness, and creation of alternative solutions to problems"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f4868bcb109c0fcd2742b02c4c",
      "revision": 1
     },
     "representation": "text",
     "digest": "2dca7a8083e66dbd149df2976222820891ceca1cec5d263a793970739f24e2d8"
    },
    "quote": "code and change understanding is the key aspect of code reviewing"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_f18427d81199cbbbe9fa84cfd0",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "SmartBear/Cisco (vendor study, not peer-reviewed): review at most 200-400 LOC at a time, keep the rate under 500 LOC/hour and sessions to about 60 minutes. Checklists target omissions, the hardest defects to find.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_4908422d133abd73f95d591fdf",
      "revision": 1
     },
     "representation": "text",
     "digest": "b351784f0e1f7215ff2e89b803672c875b186c2793b9a47378639c15949abd48"
    },
    "quote": "developers should review no more than 200 to 400 lines of code (LOC) at a time"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_4908422d133abd73f95d591fdf",
      "revision": 1
     },
     "representation": "text",
     "digest": "b351784f0e1f7215ff2e89b803672c875b186c2793b9a47378639c15949abd48"
    },
    "quote": "SmartBear research shows a significant drop in defect density at rates faster than 500 LOC per hour"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_4908422d133abd73f95d591fdf",
      "revision": 1
     },
     "representation": "text",
     "digest": "b351784f0e1f7215ff2e89b803672c875b186c2793b9a47378639c15949abd48"
    },
    "quote": "Omissions in particular are the hardest defects to find because it's difficult to review something that isn't there."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_f18427d81199cbbbe9fa84cfd0",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Google's guide treats about 100 lines as a usually reasonable change and 1000 as usually too large, counts the number of files toward size, and notes that the reviewer often has no context.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1ff58cd2d2c966a9c8f3a17100",
      "revision": 1
     },
     "representation": "text",
     "digest": "d90c52a568286f5abda215f06c49dacced1676e55c677acbf2ebadeae1941e04"
    },
    "quote": "100 lines is\nusually a reasonable size for a CL, and 1000 lines is usually too large"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1ff58cd2d2c966a9c8f3a17100",
      "revision": 1
     },
     "representation": "text",
     "digest": "d90c52a568286f5abda215f06c49dacced1676e55c677acbf2ebadeae1941e04"
    },
    "quote": "the reviewer often has no context"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_f18427d81199cbbbe9fa84cfd0",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Google's ICSE-SEIP 2018 case study rests on interviews, a survey and logs of 9 million reviewed changes. Only its abstract was captured.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a286e6ea3878a684f010d71295",
      "revision": 1
     },
     "representation": "text",
     "digest": "25ea65826ffcead359e466f395bbc6efda5eaad9356c0ab8cbc32aa49c8c3d06"
    },
    "quote": "review logs for 9 million reviewed changes"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_f18427d81199cbbbe9fa84cfd0",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "In 187 bugs that review missed (MSR 2022, SmartSHARK), semantic bugs dominate, followed by build failures. Review coverage and participation are linked to post-release defects (McIntosh et al., MSR 2014).",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_af39c227ce29129c00dd4d2ffd",
      "revision": 1
     },
     "representation": "text",
     "digest": "a47faef8cd5bfb1b02161cf6f9abcb6a2d2181fe1362289b290f9abe4b28b78c"
    },
    "quote": "semantic (51.34%), build (15.5%), analysis checks (9.09%), compatibility (7.49%), concurrency (4.28%)"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f3413a1c150552ee2c4d7efbc3",
      "revision": 1
     },
     "representation": "text",
     "digest": "1ac9b365e24ead108d51ebe22450248a4a109c13096a6fcb1c3f47c8a6c7a174"
    },
    "quote": "Low code review coverage and participation are estimated to produce components with up to two and five additional post-release defects respectively."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_89f601236d9e8ae2998661877b",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "SWE-PRBench (2026, preprint): 8 frontier models detect only 15-31% of the issues humans flagged, and every model gets worse as raw context is added. A structured diff plus summary beats a full-context prompt.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b978b3c673e30401fb23347dab",
      "revision": 1
     },
     "representation": "text",
     "digest": "0a2935916cf22a1620fc6eb87f059bca596d7b077f92e2c421d92a1d2be5b5a2"
    },
    "quote": "8 frontier models detect only 15-31% of human-flagged issues on the diff-only configuration"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b978b3c673e30401fb23347dab",
      "revision": 1
     },
     "representation": "text",
     "digest": "0a2935916cf22a1620fc6eb87f059bca596d7b077f92e2c421d92a1d2be5b5a2"
    },
    "quote": "All 8 models degrade monotonically from config_A to config_C"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b978b3c673e30401fb23347dab",
      "revision": 1
     },
     "representation": "text",
     "digest": "0a2935916cf22a1620fc6eb87f059bca596d7b077f92e2c421d92a1d2be5b5a2"
    },
    "quote": "a structured 2,000-token diff-with-summary prompt outperforms a 2,500-token full-context prompt"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_89f601236d9e8ae2998661877b",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "SWR-Bench (1000 PRs, FSE 2026): current systems underperform, and aggregating several independent reviews raises F1 by up to 43.67%.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3fb84a7e333b0e3b40e8df0dfd",
      "revision": 1
     },
     "representation": "text",
     "digest": "5e82407e3b2e50d73e88b2a801420674644ac4586aee472ceb554def2a14bc89"
    },
    "quote": "current systems underperform, and ACR tools are more adept at detecting functional errors"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_3fb84a7e333b0e3b40e8df0dfd",
      "revision": 1
     },
     "representation": "text",
     "digest": "5e82407e3b2e50d73e88b2a801420674644ac4586aee472ceb554def2a14bc89"
    },
    "quote": "multi-review aggregation strategy that significantly boosts ACR performance, increasing F1 scores by up to 43.67%"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_89f601236d9e8ae2998661877b",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "In industry, ByteDance's BitsAI-CR runs a separate ReviewFilter stage that verifies precision after detection and reaches 75.0% precision. At Beko, 73.8% of LLM comments were resolved, but PR closure time rose and developers reported faulty and irrelevant comments.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_718de44e03b10e85e1ba586168",
      "revision": 1
     },
     "representation": "text",
     "digest": "b3fbace8661b23772a976930835cbd5cba3ac42937d1337ac17574edace67273"
    },
    "quote": "two-stage approach combining RuleChecker for initial issue detection and ReviewFilter for precision verification"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_718de44e03b10e85e1ba586168",
      "revision": 1
     },
     "representation": "text",
     "digest": "b3fbace8661b23772a976930835cbd5cba3ac42937d1337ac17574edace67273"
    },
    "quote": "achieving 75.0% precision in review comment generation"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_fb24613871e7e8035c7b8744ab",
      "revision": 1
     },
     "representation": "text",
     "digest": "da61091fe3e41fdc90298ac3530fea8de316811140b27ceb1f9b5b4b277430dc"
    },
    "quote": "73.8% of automated comments were resolved. However, the average pull request closure duration increased from five hours 52 minutes to eight hours 20 minutes"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_fb24613871e7e8035c7b8744ab",
      "revision": 1
     },
     "representation": "text",
     "digest": "da61091fe3e41fdc90298ac3530fea8de316811140b27ceb1f9b5b4b277430dc"
    },
    "quote": "introduced drawbacks like faulty reviews, unnecessary corrections, and irrelevant comments"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_df4858e98c0d3dfb2fa1f8c26f",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Mutation testing works as a test-adequacy oracle. At Google, about 15M mutants led developers to write more and better tests, and mutants are coupled with real high-priority faults. Meta's ACH generates targeted mutants, writes tests that kill them, and filters equivalent mutants with an LLM agent; engineers accepted 73% of its tests.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d95ad0b38ed947c5600cdbc9ba",
      "revision": 1
     },
     "representation": "text",
     "digest": "1ac2971860beea342e26de2c36a77aee073cc485236ea8f1163da69efc0986b9"
    },
    "quote": "our analyses further provide evidence that mutants are indeed coupled with real faults"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d95ad0b38ed947c5600cdbc9ba",
      "revision": 1
     },
     "representation": "text",
     "digest": "1ac2971860beea342e26de2c36a77aee073cc485236ea8f1163da69efc0986b9"
    },
    "quote": "developers using mutation testing write more tests, and actively improve their test suites with high quality tests such that fewer mutants remain"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_2ac315922947566bc9c2c14c16",
      "revision": 1
     },
     "representation": "text",
     "digest": "1cb525301d1d68801766de315c73e8ae111e7fc1f158a7bb1a6447b2c50b9718"
    },
    "quote": "engineers accepted 73% of its tests"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_2ac315922947566bc9c2c14c16",
      "revision": 1
     },
     "representation": "text",
     "digest": "1cb525301d1d68801766de315c73e8ae111e7fc1f158a7bb1a6447b2c50b9718"
    },
    "quote": "LLM-based equivalent mutant detection agent that achieves a precision of 0.79 and a recall of 0.47"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_642af75070d3605756842e5d3e",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "LLM judges reach about 80% agreement with humans but show position, verbosity and self-enhancement biases (Zheng et al., NeurIPS 2023). Without external feedback, intrinsic self-correction can make reasoning worse (Huang et al., ICLR 2024). Self-evaluation P(True) is fairly well calibrated and improves when the model sees several of its own samples, but calibration degrades on new tasks (Kadavath et al. 2022).",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_25b5c44d3dc4a647b1ce46f16c",
      "revision": 1
     },
     "representation": "text",
     "digest": "7900769a79b94004511c216b5a5c0a42a6dcc833edd43eb70b72757fca542e6c"
    },
    "quote": "including position, verbosity, and self-enhancement biases, as well as limited reasoning ability"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_25b5c44d3dc4a647b1ce46f16c",
      "revision": 1
     },
     "representation": "text",
     "digest": "7900769a79b94004511c216b5a5c0a42a6dcc833edd43eb70b72757fca542e6c"
    },
    "quote": "achieving over 80% agreement, the same level of agreement between humans"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_53957efc4442849dc6daab0422",
      "revision": 1
     },
     "representation": "text",
     "digest": "81a85af1caddfb94fb8be242d4b3443537cd9823e52f49b389769f2d0572a850"
    },
    "quote": "LLMs struggle to self-correct their responses without external feedback, and at times, their performance even degrades after self-correction"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_3f135f46302f1ed20d0396e6ba",
      "revision": 1
     },
     "representation": "text",
     "digest": "857024cc77fa59999ed41c2db4e29a1c03c4e55ce6abeed13be9bd3f3c199bc7"
    },
    "quote": "Performance at self-evaluation further improves when we allow models to consider many of their own samples before predicting the validity of one specific possibility"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_3f135f46302f1ed20d0396e6ba",
      "revision": 1
     },
     "representation": "text",
     "digest": "857024cc77fa59999ed41c2db4e29a1c03c4e55ce6abeed13be9bd3f3c199bc7"
    },
    "quote": "they struggle with calibration of P(IK) on new tasks"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_6eba31e8fef746fd7c2fa78725",
   "revision": 1
  },
  "nature": "inference",
  "proposition": "Cold review trades author context for independence. Human evidence says understanding is the main cost of reviewing (Bacchelli & Bird), and Google's guide notes the reviewer often lacks context. LLM evidence says raw context dilutes attention while a structured diff plus summary helps (SWE-PRBench). So a cold reviewer should receive a curated brief of intent and spec, not the author's reasoning, and pull further code on demand. Scaling rigor with risk is supported only indirectly: review coverage and participation predict post-release defects (McIntosh), and missed bugs are mostly semantic. No captured primary source tested risk-tiered review directly.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b978b3c673e30401fb23347dab",
      "revision": 1
     },
     "representation": "text",
     "digest": "0a2935916cf22a1620fc6eb87f059bca596d7b077f92e2c421d92a1d2be5b5a2"
    },
    "quote": "consistent with attention dilution in long contexts"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f4868bcb109c0fcd2742b02c4c",
      "revision": 1
     },
     "representation": "text",
     "digest": "2dca7a8083e66dbd149df2976222820891ceca1cec5d263a793970739f24e2d8"
    },
    "quote": "developers employ a wide range of mechanisms to meet their understanding needs, most of which are not met by current tools"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f3413a1c150552ee2c4d7efbc3",
      "revision": 1
     },
     "representation": "text",
     "digest": "1ac9b365e24ead108d51ebe22450248a4a109c13096a6fcb1c3f47c8a6c7a174"
    },
    "quote": "both code review coverage and participation share a significant link with software quality"
   }
  ]
 }
]
