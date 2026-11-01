# 26-audit-techniques

session ses_ff605f49cb635000d90e134186c395caea91c1a836ffe2edbfd1abd49e1466ee

## Answer

**Conclusion.** The PCAOB standards I captured give an AI process auditor a complete method. It should plan by risk, top-down. It should test each control's design separately from its operation, using inspection and re-performance, never inquiry alone. It should pick items by testing the whole population, choosing specific items, or sampling. It should rate evidence with a reliability hierarchy and grade findings as deficiency, significant deficiency or material weakness. Orchestra's `frankie` seat is the right home: it is a 5-line process-auditor charter with no skills yet. Premise correction: there is no "lucy audit mode". `lucy` is a cold code reviewer.

**Claims**
- (read) AS 1105 lists the procedures: inspection, observation, inquiry, confirmation, recalculation, reperformance, analytical procedures. It splits further work into tests of controls and substantive procedures, and says inquiry "by itself, does not provide sufficient audit evidence" for a control. Source: PCAOB AS 1105 .13–.21.
- (read) AS 2201 tests design effectiveness separately from operating effectiveness, uses a top-down approach and re-performance, and says "Inquiry alone does not provide sufficient evidence". Source: AS 2201 .21, .42, .44, .50.
- (read) Sampling: AS 1105 .22–.24 gives three ways to select items: all items, specific items, or sampling. Testing all items (100 percent) fits significant risks. AS 2315 allows "nonstatistical and statistical" sampling, with a tolerable rate for tests of controls. For an AI auditor, every PR, merge and deploy is machine-readable, so testing the whole population is the default. Sampling remains for checks that need judgment, such as whether a review was substantive.
- (read) Evidence quality, AS 1105 .05–.10A:
  - More evidence of poor quality cannot make up for its quality.
  - Evidence from an independent source beats internal evidence, direct beats indirect, and original beats converted.
  - Company-produced information is reliable only when its ITGCs are effective. Test its accuracy and completeness, and test whether it was modified.
  - For software: re-derive from Git objects and the CI provider's API instead of trusting a PR body or an agent transcript.
- (read) AS 1305 .01–.08:
  - A deficiency is either in design (the control is missing or wrongly designed) or in operation (it doesn't run as designed, or the person running it lacks the authority).
  - A significant deficiency is less severe than a material weakness but merits the oversight body's attention.
  - A material weakness means a reasonable possibility that a material error is not prevented or detected in time.
  - The report must keep the categories separate, and must never say "no significant deficiencies found".
- (read) IIA GTAG Continuous Auditing and Monitoring, 3rd edition (Sept 2025): continuous auditing uses technology for ongoing assessment of risks and controls, coordinated with management's continuous monitoring. The full text is members-only.
- (read) `modules/maestro/coordination/src/seats/prompt/frankie.txt:1-5` gives the charter "process auditor … process, ledger, and evidence integrity risks", returning an "audit verdict". `lucy.txt:1-5` is a code-review card (APPROVE/FIX_FIRST/REJECT).
- (inferred) ITGC tests for change and access:
  - author ≠ approver (segregation of duties);
  - approval recorded before merge or deploy, and approval made stale by a later push;
  - emergency changes approved after the fact within a set window;
  - admin merges, force-pushes, bypassed rules and guardrail ignores tested over the whole population.
  - Typical deficiencies: self-approval, missing or stale approval, unreviewed emergency changes, standing admin access, and deployed artifacts that don't trace back to a reviewed commit.
- (inferred) Suggested design for frankie:
  - Checks: one per control, stating the control objective, its design, the population, the method (all items, specific items, or sample) and a reproducible query.
  - Evidence: each item is hashed when captured, records where it came from, and is re-hashed when the report is written. This is the chain of custody.
  - History manipulation: check for force-pushes and rewritten history (reflog, CI run SHAs that are not in the branch history), and for author or committer dates that don't match push or CI times.
  - Findings: each one gives condition, criteria, cause, effect and recommendation, and is classed as deficiency, significant deficiency or material weakness. Severity follows how likely and how large the risk is. Related deficiencies are grouped together.
  - Report: states scope, period, population counts and limits. It never claims that a control has "no deficiencies".

**Not examined:** I could not capture these sources: the IIA Global Internal Audit Standards text, ISACA ITAF/COBIT, the AICPA SOC 2 criteria (CC8.1 seen only in secondary search results), ISO 19011 (paywalled), IAASB ISA 500/530, NIST SP 800-86 (the PDF fetch failed; only the abstract was captured) and ISO/IEC 27037. They are paywalled, members-only, or failed to fetch. Statements drawn from them above are labelled inferred.

**Reproduce:** read PCAOB AS 1105, AS 1305, AS 2201 and AS 2315 at pcaobus.org/oversight/standards/auditing-standards/details/<ID>; `cat modules/maestro/coordination/src/seats/prompt/frankie.txt`.

## Claims

[
 {
  "subquestion": {
   "id": "rque_1b05bd827031e0003164352589",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "PCAOB AS 1105 lists the evidence procedures (inspection, observation, inquiry, confirmation, recalculation, reperformance, analytical procedures), splits further procedures into tests of controls and substantive procedures, and says inquiry alone is not sufficient to support a conclusion on a control.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a482b48e7a95c83be0d65fb759",
      "revision": 1
     },
     "representation": "text",
     "digest": "43264389451a517510d0c5578691bfd2d145bf173569349951179576e8877a43"
    },
    "quote": "Reperformance involves the independent execution of procedures or controls that were originally performed by company personnel."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a482b48e7a95c83be0d65fb759",
      "revision": 1
     },
     "representation": "text",
     "digest": "43264389451a517510d0c5578691bfd2d145bf173569349951179576e8877a43"
    },
    "quote": "Inquiry of company personnel, by itself, does not provide sufficient audit evidence to reduce audit risk to an appropriately low level for a relevant assertion or to support a conclusion about the effectiveness of a control."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a482b48e7a95c83be0d65fb759",
      "revision": 1
     },
     "representation": "text",
     "digest": "43264389451a517510d0c5578691bfd2d145bf173569349951179576e8877a43"
    },
    "quote": "Tests of controls, andSubstantive procedures"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_1b05bd827031e0003164352589",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "PCAOB AS 2201 separates testing design effectiveness from operating effectiveness, uses a top-down approach, uses re-performance of the control, and states inquiry alone does not provide sufficient evidence.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_04540b950b6a055c7da3a4ef92",
      "revision": 1
     },
     "representation": "text",
     "digest": "539d6a96324dacdc4491e884c178055f9ff92855713a42c7bddae09d92e72153"
    },
    "quote": "The auditor should test the design effectiveness of controls by determining whether"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_04540b950b6a055c7da3a4ef92",
      "revision": 1
     },
     "representation": "text",
     "digest": "539d6a96324dacdc4491e884c178055f9ff92855713a42c7bddae09d92e72153"
    },
    "quote": "The auditor should test the operating effectiveness of a control by determining whether the control is operating as designed"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_04540b950b6a055c7da3a4ef92",
      "revision": 1
     },
     "representation": "text",
     "digest": "539d6a96324dacdc4491e884c178055f9ff92855713a42c7bddae09d92e72153"
    },
    "lines": {
     "start": 523,
     "end": 523
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_04540b950b6a055c7da3a4ef92",
      "revision": 1
     },
     "representation": "text",
     "digest": "539d6a96324dacdc4491e884c178055f9ff92855713a42c7bddae09d92e72153"
    },
    "lines": {
     "start": 562,
     "end": 562
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_04540b950b6a055c7da3a4ef92",
      "revision": 1
     },
     "representation": "text",
     "digest": "539d6a96324dacdc4491e884c178055f9ff92855713a42c7bddae09d92e72153"
    },
    "quote": "Inquiry alone does not provide sufficient evidence"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_a13c74d7cd5a574677a7e43d65",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "AS 1105 names three ways to select items (all items, specific items, audit sampling) and allows 100 percent examination, for example for a significant risk; AS 2315 defines sampling as testing less than 100 percent and allows nonstatistical and statistical approaches, with a tolerable rate driving tests of controls.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a482b48e7a95c83be0d65fb759",
      "revision": 1
     },
     "representation": "text",
     "digest": "43264389451a517510d0c5578691bfd2d145bf173569349951179576e8877a43"
    },
    "lines": {
     "start": 488,
     "end": 494
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a482b48e7a95c83be0d65fb759",
      "revision": 1
     },
     "representation": "text",
     "digest": "43264389451a517510d0c5578691bfd2d145bf173569349951179576e8877a43"
    },
    "quote": "The audit procedure is designed to respond to a significant risk, and other means"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_83b8dc332aaad3a634170031ee",
      "revision": 1
     },
     "representation": "text",
     "digest": "5f69e8622e9c923f2b99bc22e2a482ca330a98ed48049f65d86541ba9d6089fe"
    },
    "quote": "Audit sampling is the application of an audit procedure to less than 100 percent of the items"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_83b8dc332aaad3a634170031ee",
      "revision": 1
     },
     "representation": "text",
     "digest": "5f69e8622e9c923f2b99bc22e2a482ca330a98ed48049f65d86541ba9d6089fe"
    },
    "quote": "There are two general approaches to audit sampling: nonstatistical and statistical."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_83b8dc332aaad3a634170031ee",
      "revision": 1
     },
     "representation": "text",
     "digest": "5f69e8622e9c923f2b99bc22e2a482ca330a98ed48049f65d86541ba9d6089fe"
    },
    "lines": {
     "start": 545,
     "end": 546
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_dc72fb07852b8a334e67cb5832",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "AS 1105 defines sufficiency as quantity and appropriateness as relevance plus reliability, says more of poor evidence cannot compensate, ranks reliability (independent source over internal, direct over indirect, original over converted), makes company-produced information reliable only when its ITGCs are effective, requires testing its accuracy and completeness, and requires extra procedures when a document may have been modified.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a482b48e7a95c83be0d65fb759",
      "revision": 1
     },
     "representation": "text",
     "digest": "43264389451a517510d0c5578691bfd2d145bf173569349951179576e8877a43"
    },
    "lines": {
     "start": 479,
     "end": 484
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a482b48e7a95c83be0d65fb759",
      "revision": 1
     },
     "representation": "text",
     "digest": "43264389451a517510d0c5578691bfd2d145bf173569349951179576e8877a43"
    },
    "quote": "company’s controls over that information"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_94dd2738c5b1789836450374e7",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "AS 1305 defines a control deficiency (design vs operation), a significant deficiency and a material weakness, requires the written report to distinguish the categories, and forbids reporting that no significant deficiencies were found.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_98662e0deb72d35dbe795cca4b",
      "revision": 1
     },
     "representation": "text",
     "digest": "be830ee9d5832ee76a9b6b49749c1fdd434b74c41ba99ade508a0f676896f067"
    },
    "quote": "A deficiency in operation exists when a properly designed control does not operate as designed"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_98662e0deb72d35dbe795cca4b",
      "revision": 1
     },
     "representation": "text",
     "digest": "be830ee9d5832ee76a9b6b49749c1fdd434b74c41ba99ade508a0f676896f067"
    },
    "quote": "that is less severe than a material weakness yet important enough to merit attention by those responsible for oversight"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_98662e0deb72d35dbe795cca4b",
      "revision": 1
     },
     "representation": "text",
     "digest": "be830ee9d5832ee76a9b6b49749c1fdd434b74c41ba99ade508a0f676896f067"
    },
    "quote": "such that there is a reasonable possibility that a material misstatement"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_98662e0deb72d35dbe795cca4b",
      "revision": 1
     },
     "representation": "text",
     "digest": "be830ee9d5832ee76a9b6b49749c1fdd434b74c41ba99ade508a0f676896f067"
    },
    "quote": "The auditor should not report in writing that no significant deficiencies were discovered"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_94dd2738c5b1789836450374e7",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "The IIA GTAG Continuous Auditing and Monitoring, 3rd edition (Sept 25, 2025) describes continuous auditing as technology-driven ongoing assessment of risks and controls, coordinated with management's continuous monitoring; the full text is members-only.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7a520cbe97ecf699664e941079",
      "revision": 1
     },
     "representation": "text",
     "digest": "ee61104ce374b9cd7f93404716e4beb16c30951806b027b3c559811b070a2d9b"
    },
    "quote": "Continuous auditing leverages technology to provide ongoing assessments of risks and controls"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_2af9e2b4e43451910679394cf4",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "The frankie seat exists as a process auditor whose charter is five lines: inspect a target change for process, ledger and evidence integrity risks, return an audit verdict, no edits. There is no lucy audit mode: lucy is a cold code reviewer with an APPROVE/FIX_FIRST/REJECT card.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_4ce407f587071d0a3778edb27e",
      "revision": 1
     },
     "representation": "text",
     "digest": "19664faedf69c99f972a4a41762e9fe95c6396041d27a411cc46f834f3763004"
    },
    "lines": {
     "start": 1,
     "end": 5
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6b9220f18ce40250214af03eda",
      "revision": 1
     },
     "representation": "text",
     "digest": "32a93ebeb62fcc2a17d9bac3c4306ba5604c78b193ee29630b622488b58e98e5"
    },
    "lines": {
     "start": 1,
     "end": 5
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_d174a8e07cad0e49cb51b54076",
   "revision": 1
  },
  "nature": "inference",
  "proposition": "For change and access ITGCs, an AI auditor should test author ≠ approver (segregation of duties), approval recorded before merge or deploy, emergency changes approved after the fact within a set window, and privileged or bypass actions (admin merges, force-pushes, rule overrides) tested over the whole population. This maps AS 1305's authority clause and AS 1105's dependence on ITGCs onto Git and CI evidence. The specific ITGC catalogs (SOC 2 CC8.1, COBIT BAI06) were not captured.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_98662e0deb72d35dbe795cca4b",
      "revision": 1
     },
     "representation": "text",
     "digest": "be830ee9d5832ee76a9b6b49749c1fdd434b74c41ba99ade508a0f676896f067"
    },
    "quote": "A deficiency in operation exists when a properly designed control does not operate as designed"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a482b48e7a95c83be0d65fb759",
      "revision": 1
     },
     "representation": "text",
     "digest": "43264389451a517510d0c5578691bfd2d145bf173569349951179576e8877a43"
    },
    "quote": "company’s controls over that information"
   }
  ]
 }
]
