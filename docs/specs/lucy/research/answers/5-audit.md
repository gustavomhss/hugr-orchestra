# 5-audit

session ses_81f55753fc661122e0791b548a365a762f8599e4742bd0bb228f4b8dc8b0f150

## Answer

**Conclusion.** Each discipline has a primary-source method, and each one reads different material and accepts different evidence.
- **Security review:** model the system's data flows, trust boundaries and threats, then check numbered requirements such as OWASP ASVS.
- **Process or evidence audit:** check who proposed, approved, tested and recorded each change, and whether those records can be tampered with.
- **Architecture and plan review:** judge tradeoffs and requirement quality against named quality attributes.

**Proposed split** (inferred from the sources below):
- The cold code reviewer owns whether the diff is correct and the change-type profiles.
- The security reviewer owns the threat model and the ASVS checks for any diff that crosses a trust boundary.
- The process auditor owns change records, separation of duties and evidence integrity.
- A seat that did not produce a finding verifies it, and verdicts rest on external, reproducible evidence rather than self-assessment.

**1. Security review**
- read: OWASP's Threat Modeling Cheat Sheet structures the work as four questions: what are we working on, what can go wrong, what will we do, did we do enough.
- read: The system model must give "a clear view of trust boundaries, data flows, data stores, processes, and the external entities".
- read: STRIDE pairs each threat with the property it violates:
  - Spoofing → authentication
  - Tampering → integrity
  - Repudiation → accounting
  - Information disclosure → confidentiality
  - Denial of service → availability
  - Elevation of privilege → authorization
- read: OWASP recommends other techniques for other targets: attack trees for multi-step attacker goals, abuse cases for business-logic misuse, LINDDUN for privacy.
- read: Validation asks: "Can the agreed upon mitigations be tested?"
- read: ASVS 5.0.0 is the checkable layer. Its requirements carry versioned numbers, such as v5.0.0-1.2.5.
- read: LLMs give "non-deterministic responses, incorrect and unfaithful reasoning" on security bugs (Ullah et al., IEEE S&P 2024).
- read: On the PrimeVul benchmark, GPT-3.5 and GPT-4 scored "akin to random guessing" in the strictest settings (Ding et al., ICSE 2025).
- inferred: An LLM security reviewer is good at listing threats along the model and mapping them to ASVS. Treat its findings as hypotheses that need a probe (a test, a type check or a proof of concept). A finding-free report is not a pass.

**2. Process and evidence audit**
- read: NIST SP 800-53 CM-3 asks for:
  - review and approval of changes "with explicit consideration for security and privacy impact analyses";
  - documented decisions and retained records;
  - testing before a change is finalized (CM-3(2));
  - no change until approvals are received (CM-3(1)).
- read: AC-5 separates duties so that abuse would need collusion, and keeps access-control administrators out of audit functions.
- read: AU-9 protects audit information from modification and deletion. Its enhancements add cryptographic integrity, storage on a separate system and dual authorization.
- read: SLSA v1.0 provenance identifies the artifact by cryptographic digest. At Build L2 the build platform's control plane generates it; at Build L3 it must be "strongly resistant to forgery by tenants".
- read: Sigstore's Rekor transparency log lets auditors check that "entries are never mutated or removed".
- inferred: The process auditor checks four things:
  - every merged change maps to an approved record;
  - the approver is not the author;
  - the tests the record names ran against the merged digest;
  - third parties can verify the consistency of the evidence ledger.

**3. Architecture and plan review**
- read: SEI's ATAM (CMU/SEI-2000-TR-004) analyzes whether decisions that affect performance, availability, security and modifiability "appropriately mitigate risks".
- read: Nygard's ADRs record Context, Decision, Status and Consequences, including negative consequences. A reversed decision is marked superseded rather than deleted.
- read: Fitness functions make architectural characteristics automated, continual checks (Thoughtworks Radar).
- read: For plans and specs, NASA SE Handbook Appendix C covers clarity, completeness, consistency, traceability, correctness and verifiability. It bans unverifiable terms such as "fast", "robust" and "user-friendly", and asks: "Can the criteria for verification be stated?"

**4. Profiles by change type**
- read: For API changes, Google's AIP-180 covers source, wire and semantic compatibility:
  - no new required request fields;
  - no removal or rename within a major version;
  - defaults, and how they are serialized, must not change.
- read: Migrations and deploys follow expand/migrate/contract. The contract phase must actually happen, or the system can end up "in a worse state than you started".
- inferred: I found no captured primary source for these profiles; they are my proposals:
  - UI: WCAG plus visual diff.
  - Performance: benchmark against a baseline.
  - Concurrency: interleavings and races.
  - Infrastructure and config: blast radius and rollback.
  - Docs: accuracy against the code.
  - Dependency bump: provenance or SLSA plus changelog and advisory review.

**5. Multi-agent split and verdicts**
- read: LLMs struggle to self-correct "without external feedback" and sometimes get worse (Huang et al., ICLR 2024).
- read: LLM evaluators recognize their own outputs and favor them (Panickssery et al., 2024).
- read: Step-level process supervision "significantly outperforms" outcome-only supervision (Lightman et al., 2023).
- inferred: Rules for combining verdicts:
  - The finder and the verifier are different seats, and ideally different models.
  - Mandates do not overlap, and handoffs are explicit. For example, the code reviewer flags a diff that crosses a trust boundary to the security reviewer.
  - A finding counts only with a probe or a ref behind it.
  - A confirmed blocker from any lane blocks. Approval needs each lane the change-type profile requires; it is not a majority vote.
  - The process auditor audits the ledger of verdicts but does not approve code.

**Not examined.** Sources I did not capture:
- OWASP Code Review Guide text.
- ISO 27001 Annex A and SOC 2 CC8.1 (licensed).
- ISO/IEC/IEEE 29148 (paywalled; NASA Appendix C used instead).
- SEI's threat-modeling survey.
- Primary sources for the UI, performance, concurrency, infrastructure, docs and dependency profiles.
- Empirical studies of multi-agent review quorum.

The NIST 800-53 controls are quoted from csf.tools, a mirror of Rev 5.2.0. No claim here is behavioral, so there is no reproduce command.

## Claims

[
 {
  "subquestion": {
   "id": "rque_b768de450547a73ed164f20b5b",
   "revision": 1
  },
  "nature": "inference",
  "proposition": "An LLM security reviewer is best used to enumerate threats along a system model and map them to ASVS, with each finding treated as a hypothesis needing a probe, and a finding-free report not treated as a pass.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_58e8b19e4352548d572a578f90",
      "revision": 1
     },
     "representation": "text",
     "digest": "b59bd4ca2de262c2d93aa9b65a01aafa9cd11d394595336b2a7ccf4106fdf3eb"
    },
    "quote": "further LLM advances are needed before LLMs can be used as general purpose security assistants"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_13aa5f2b3d1195eee7553dbc9a",
      "revision": 1
     },
     "representation": "text",
     "digest": "47c2133be02affdf776ee7a97b22509d53f08653793fbef1f2c65e578a4f567d"
    },
    "quote": "Use STRIDE's six categories as prompts while reviewing the system model."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_add72324267c71b3d00a3a7c13",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Sigstore Rekor is a transparency log whose consistency (entries appended, not mutated or removed) auditors can monitor.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b49e7dce9f190441c8667cba2b",
      "revision": 1
     },
     "representation": "text",
     "digest": "2f59c4b921dcc9f4f22a84f07062cc6b1e123c49f8ec3c88717fce3a3a057bf7"
    },
    "quote": "Auditors can monitor the log for consistency, meaning that the log remains append-only and entries are never mutated or removed."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_add72324267c71b3d00a3a7c13",
   "revision": 1
  },
  "nature": "inference",
  "proposition": "A process auditor seat should check that merged changes map to approved records, that the approver differs from the author, that named tests ran against the merged digest, and that the evidence ledger's consistency is third-party verifiable.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_20d4fb0c3e9c934bfa40b18589",
      "revision": 1
     },
     "representation": "text",
     "digest": "93f61769c8835fb018612e54e155678d4212172ef4eb717665dda72bef6b8bbd"
    },
    "quote": "Document configuration change decisions associated with the system"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_216ce9538b84fef47e4401038a",
      "revision": 1
     },
     "representation": "text",
     "digest": "142f33d108f460609550a3900d0ff9fba316da8aef63353ec9985ec3a849e43a"
    },
    "quote": "Separation of duties addresses the potential for abuse of authorized privileges and helps to reduce the risk of malevolent activity without collusion."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_01312b2aa3264d3316e4d94d6a",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Nygard ADRs record Context, Decision, Status and Consequences, include negative consequences, and keep reversed decisions marked superseded.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_836e98837af3d0939c5903018a",
      "revision": 1
     },
     "representation": "text",
     "digest": "c8d32abcc284687a2ccb7a84dcf2017dff3d9580e31ada16394b7041b2c37a7b"
    },
    "quote": "If a decision is reversed, we will keep the old one around, but mark"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_836e98837af3d0939c5903018a",
      "revision": 1
     },
     "representation": "text",
     "digest": "c8d32abcc284687a2ccb7a84dcf2017dff3d9580e31ada16394b7041b2c37a7b"
    },
    "quote": "A particular decision may have positive,"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_01312b2aa3264d3316e4d94d6a",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Architectural fitness functions provide automated, continual objective assessment of architectural characteristics (Thoughtworks Radar, Trial).",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_11993e94678eedbda4a343d0d7",
      "revision": 1
     },
     "representation": "text",
     "digest": "e1a00c5eef21a6bbf0e1756f941ab747e235fd3cb99cc98c858132317330df2d"
    },
    "lines": {
     "start": 19,
     "end": 23
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_01312b2aa3264d3316e4d94d6a",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "NASA SE Handbook Appendix C gives a requirements validation checklist covering clarity, completeness, consistency, traceability and verifiability, and lists unverifiable terms to avoid.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_e45ddf9d755a3c8a0efca6417d",
      "revision": 1
     },
     "representation": "text",
     "digest": "e8a9acee40b33ddff1548e568a1371a57f49460e57188f6f9a5bafd61dbe8352"
    },
    "quote": "Does a means exist to measure the accomplishment of the requirement and verify compliance? Can the criteria for verification be stated?"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_e45ddf9d755a3c8a0efca6417d",
      "revision": 1
     },
     "representation": "text",
     "digest": "e8a9acee40b33ddff1548e568a1371a57f49460e57188f6f9a5bafd61dbe8352"
    },
    "quote": "Is the requirement free from indefinite pronouns (this, these) and ambiguous terms"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_f88e59505868d0b6abc5456e43",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Google AIP-180 defines API-change review around source, wire and semantic compatibility; it forbids adding new required request fields and changing default values within a major version.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_e4611ba9b233f184c1eb4832bd",
      "revision": 1
     },
     "representation": "text",
     "digest": "7cbaec21800d028493a96139dad191d5e104643db1f02277c22a2dc7846e2bad"
    },
    "quote": "New required fields must not be added to existing request messages or"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_e4611ba9b233f184c1eb4832bd",
      "revision": 1
     },
     "representation": "text",
     "digest": "7cbaec21800d028493a96139dad191d5e104643db1f02277c22a2dc7846e2bad"
    },
    "quote": "Changing the default value is considered breaking and must not be done."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_f88e59505868d0b6abc5456e43",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Parallel change (expand/migrate/contract) is the safe pattern for incompatible interface and database migrations, and skipping the contract phase can leave the system worse off.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_89bcddc41ecbdcbf1cd1b3fb35",
      "revision": 1
     },
     "representation": "text",
     "digest": "8141f7808930339c9f55caaac7d7aef815c6e74b640d247c4c51e0a6c5e08596"
    },
    "quote": "database refactorings follow the parallel change pattern"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_89bcddc41ecbdcbf1cd1b3fb35",
      "revision": 1
     },
     "representation": "text",
     "digest": "8141f7808930339c9f55caaac7d7aef815c6e74b640d247c4c51e0a6c5e08596"
    },
    "quote": "If the contract phase is not executed you might end up in a worse state than you"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_4cb2c3a1e2d1b0aedebd35191f",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Huang et al. (ICLR 2024) found LLMs struggle to self-correct reasoning without external feedback and can degrade.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_576f6a71fa253a8264bfe74237",
      "revision": 1
     },
     "representation": "text",
     "digest": "81a85af1caddfb94fb8be242d4b3443537cd9823e52f49b389769f2d0572a850"
    },
    "quote": "LLMs struggle to self-correct their responses without external feedback, and at times, their performance even degrades after self-correction"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_4cb2c3a1e2d1b0aedebd35191f",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Panickssery et al. (2024) show LLM evaluators favor their own generations, correlated with self-recognition.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c20bda948d39dbf311ab46e8ce",
      "revision": 1
     },
     "representation": "text",
     "digest": "608c2cecd4f4e22873a96b56dffebd4a1de414bc3e9e41196ebc651613f93669"
    },
    "quote": "we discover a linear correlation between self-recognition capability and the strength of self-preference bias"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_4cb2c3a1e2d1b0aedebd35191f",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Lightman et al. (2023) found step-level process supervision significantly outperforms outcome supervision.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_be4b7a7dbf9eecc0a6107b7d18",
      "revision": 1
     },
     "representation": "text",
     "digest": "9a1a6897d5761b8879d963ff359d7f4905ef114134bd102f8edaab9674250ea9"
    },
    "quote": "process supervision significantly outperforms outcome supervision for training models to solve problems from the challenging MATH dataset"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_4cb2c3a1e2d1b0aedebd35191f",
   "revision": 1
  },
  "nature": "inference",
  "proposition": "A review family should separate finder and verifier seats (ideally different models), give disjoint mandates with explicit handoffs, gate verdicts on external evidence, and combine verdicts so that a confirmed blocker from any lane blocks rather than by majority vote; the process auditor audits the verdict ledger and does not approve code.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c20bda948d39dbf311ab46e8ce",
      "revision": 1
     },
     "representation": "text",
     "digest": "608c2cecd4f4e22873a96b56dffebd4a1de414bc3e9e41196ebc651613f93669"
    },
    "quote": "new biases are introduced due to the same LLM acting as both the evaluator and the evaluatee"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_576f6a71fa253a8264bfe74237",
      "revision": 1
     },
     "representation": "text",
     "digest": "81a85af1caddfb94fb8be242d4b3443537cd9823e52f49b389769f2d0572a850"
    },
    "quote": "without the crutch of external feedback"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_216ce9538b84fef47e4401038a",
      "revision": 1
     },
     "representation": "text",
     "digest": "142f33d108f460609550a3900d0ff9fba316da8aef63353ec9985ec3a849e43a"
    },
    "quote": "dividing mission or business functions and support functions among different individuals or roles"
   }
  ]
 }
]
