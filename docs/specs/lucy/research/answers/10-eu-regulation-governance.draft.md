# 10-eu-regulation-governance (DRAFT: close refused, claims not checked)

session ses_6cff87404aba0d67637ff69650febb529eec5756667d70ff581b7c23000960b9

## Answer

**Conclusion.** For a reviewer of software changes, the EU rules that matter most are the Cyber Resilience Act (CRA), the AI Act (as changed by the AI Omnibus, Regulation (EU) 2026/1744), NIS2 and DORA. Each turns into evidence a reviewer can check per change: a risk assessment, vulnerability handling, an SBOM and provenance, logs, human oversight and a record of who approved the change. The European Accessibility Act (EAA), the revised Product Liability Directive (PLD), the Data Act and the DSA add narrower checks. ISO 27001/27002, SOC 2, NIST SSDF and SLSA supply the control vocabulary auditors test against. Most mechanical checks can be automated (policy-as-code, SBOM, license, accessibility and provenance scanners). Classifying a system, judging residual risk, deciding conformity and giving any compliance *verdict* must stay with an accountable human or legal function. The AI should produce evidence and findings, not attestations.

**Important correction to the premise (dates).** The AI Act's high-risk obligations no longer start on 2 August 2026. The AI Omnibus moved Annex III systems to **2 December 2027** and Annex I (product-embedded) systems to **2 August 2028**. It was published in the Official Journal on 24 July 2026.

---

### 1. EU regulations: what each asks of development and change control

- **CRA (Reg. (EU) 2024/2847)** [read: Commission summary]
  - Dates: in force 10 Dec 2024. Reporting under Art. 14 applies from **11 Sep 2026**. The main obligations apply from **11 Dec 2027**.
  - Manufacturers must do a cybersecurity risk assessment that covers planning through maintenance, apply due diligence to third-party components, and keep technical documentation.
  - They must set a support period and handle vulnerabilities during it, as Annex I Part II requires.
  - Reporting deadlines: 24h early warning, 72h notification, and a final report 14 days after a fix (exploited vulnerabilities) or one month after the 72h notice (severe incidents). Reports go to the national CSIRT and ENISA.
  - Products already on the market before Dec 2027 are covered only after a "substantial modification". So the reviewer must flag changes that could count as a substantial modification.
  - SBOM: Annex I Part II requires an SBOM. I did not capture that text (inferred).

- **AI Act (Reg. (EU) 2024/1689 + 2026/1744)** [read: FPF timeline and AI Act Explorer mirror]
  - Already applicable: prohibited practices and AI literacy (2 Feb 2025), GPAI obligations (2 Aug 2025).
  - Art. 50 transparency applies from 2 Aug 2026, except Art. 50(2) (marking synthetic content), which applies from **2 Dec 2026**.
  - High-risk systems: Art. 12 requires automatic logging over the system's lifetime, for traceability and post-market monitoring.
  - Other high-risk requirements, not captured here (inferred): Art. 11 and Annex IV technical documentation, Art. 14 human oversight, Art. 17 quality management system, and Art. 19 log retention of at least 6 months.

- **NIS2 (Dir. (EU) 2022/2555)** [read: Commission page]
  - Transposition deadline was 17 Oct 2024.
  - Covers risk-management measures, reporting of significant incidents, and accountability of top management.
  - Art. 21(2)(e) (security in acquisition, development and maintenance, including vulnerability handling) and the Art. 23 deadlines (24h/72h/1 month) come from my knowledge (inferred).
  - The Commission proposed targeted amendments on 20 Jan 2026.

- **DORA (Reg. (EU) 2022/2554)** [read: EIOPA page]
  - Applies since **17 Jan 2025** to financial entities.
  - Pillars: an ICT risk-management framework, digital operational resilience testing including threat-led penetration testing (TLPT), incident reporting, and third-party risk.
  - Detailed ICT change-management rules sit in the Level-2 RTS on the ICT risk management framework. Their article numbers are not verified (inferred).

- **EAA (Dir. (EU) 2019/882)** [read: Commission page]
  - Covers computers and operating systems, smartphones, banking services, e-books and e-commerce, among others. Transposition was due June 2022.
  - Application from 28 Jun 2025 and the technical baseline EN 301 549 (which references WCAG 2.1 AA) are inferred, not captured.

- **Not captured, from knowledge only (inferred, verify before relying on them):**
  - **PLD (Dir. (EU) 2024/2853):** software counts as a product, and missing security updates can make it defective. Transposition by 9 Dec 2026.
  - **Data Act (Reg. (EU) 2023/2854):** applies since 12 Sep 2025. Design obligations for connected products follow from 12 Sep 2026. It also sets switching and interoperability duties for data-processing services.
  - **DSA (Reg. (EU) 2022/2065):** relevant only to intermediary services and platforms (notice-and-action, recommender transparency).

### 2. Frameworks
- **NIST SSDF (SP 800-218 v1.1, Feb 2022)** [read]: a core set of secure-development practices meant to be added to any SDLC.
- **SLSA v1.0 Build track** [read]:
  - L1: provenance exists.
  - L2: signed provenance from a hosted build platform.
  - L3: hardened builds, where secret signing material is kept away from user-defined build steps.
  - The site now shows v1.2 as the current version.
- **Not captured (inferred):**
  - ISO/IEC 27002:2022: 5.3 segregation of duties, 8.4 access to source code, 8.9 configuration management, 8.15 logging, 8.25–8.29 secure development, coding and testing, 8.30 outsourced development, 8.31 separation of environments, 8.32 change management.
  - ISO/IEC 27701 (privacy), ISO/IEC 42001 (AI management system), SOC 2 CC8.1 (authorise, design, test, approve, implement changes), NIST AI RMF (Govern/Map/Measure/Manage).
  - OpenSSF Scorecard checks (Branch-Protection, Code-Review, Signed-Releases, Pinned-Dependencies, Token-Permissions and others), SPDX/REUSE headers and copyleft obligations.
  - The ISO and AICPA texts are paywalled, so I could not quote them.

### 3. Mapping requirements to checks (automatic vs judgment)
**Can be automated on a diff or PR:**
- New or changed dependency → SBOM delta (SPDX/CycloneDX), known-vulnerability scan, license expression and copyleft compatibility, REUSE header present (CRA, SSDF PW.4, licensing).
- Secrets, unsafe APIs, SAST findings → SSDF PW.7, ISO 8.28.
- Author ≠ approver, branch protection on, required checks green → SOC 2 CC8.1, ISO 5.3/8.32, Scorecard.
- Tests changed with the code → ISO 8.29.
- UI diff → axe-core run against WCAG 2.1 AA rules. Automated rules catch only part of WCAG, so manual testing is still required (EAA/EN 301 549).
- AI feature diff → logging hooks present (AI Act Art. 12) and an AI-content disclosure or marking path (Art. 50).

**Can be automated on a release:**
- Signed SLSA provenance verified, SBOM attached, support-period end date stated, a vulnerability-disclosure contact published (CRA Annex II), release notes listing security fixes.

**Process checks (partly automatable):**
- A coordinated vulnerability disclosure (CVD) policy exists, and a runbook can meet the 24h/72h reporting clock (CRA/NIS2/DORA).
- Environments are separated, and DORA testing evidence exists.

**Needs human or legal judgment:**
- Is this a product with digital elements, or important/critical (CRA)? Is the system high-risk (AI Act Art. 6/Annex III)? Is a change a "substantial modification"? Is the residual risk acceptable? Are licenses compatible in the specific linking or distribution context? Is accessibility met beyond automated rules (screen-reader flows)? Does an incident count as significant or major for reporting? Should the conformity declaration be signed?

### 4. Tools and licenses
- OPA: **Apache-2.0** [read]
- Kyverno: **Apache-2.0** [read]
- axe-core: **MPL-2.0** [read; MPL is file-level copyleft, so modified axe files must stay open]
- Not captured (inferred): Conftest Apache-2.0, ScanCode Toolkit Apache-2.0 (its license data under CC-BY-4.0), OSS Review Toolkit (ORT) Apache-2.0, REUSE tool GPL-3.0+/Apache, OpenSSF Scorecard Apache-2.0, in-toto/Sigstore Apache-2.0.

### 5. Audit evidence and the legal limits on AI verdicts
Everything in this section is inferred; I did not capture a source for any of it.

**Making evidence acceptable to auditors:**
- Record each finding against the exact inputs: commit SHA, diff hash, policy and rule version, tool versions, model ID, prompt and config hash, timestamp.
- Store records in an append-only, hash-chained or signed log, for example in-toto/SLSA attestations signed with Sigstore and kept in a transparency log. Use WORM storage.
- Enforce separation of duties: the AI cannot approve or merge on its own authority, and the author is never the approver. Every gating decision names a human approver whose identity is logged.
- Make findings reproducible: rerunning the same rules on the same input gives the same deterministic result, and LLM judgments are labelled advisory.
- Retain records at least as long as the governing rule: CRA technical documentation 10 years or the support period, whichever is longer (Art. 13); AI Act documentation 10 years (Art. 18) and logs at least 6 months (Art. 19).

**Legal limits:**
- CRA conformity and the EU declaration of conformity are the manufacturer's legal acts.
- Attestation opinions (ISAE 3000 / AICPA SSAE, SOC 2) are issued by an independent practitioner and cannot come from the audited entity's own tool.
- Several Member States regulate legal advice.
- GDPR Art. 22 limits solely automated decisions with significant effects.
- If review outputs are used to evaluate developers, that use may fall under AI Act Annex III point 4 (employment, worker monitoring).
- So the system should output "evidence + finding + confidence + needs-human-decision", never "compliant".

**Supporting claims:**
- read: digital-strategy.ec.europa.eu/en/policies/cra-summary (dates, reporting deadlines, support period)
- read: fpf.org AI Omnibus timeline (2026/1744 dates)
- read: artificialintelligenceact.eu/article/12 (Art. 12 logging)
- read: digital-strategy.ec.europa.eu NIS2 page
- read: eiopa.europa.eu DORA page
- read: commission.europa.eu EAA page
- read: csrc.nist.gov SP 800-218
- read: slsa.dev/spec/v1.0/levels
- read: GitHub license API for OPA, Kyverno, axe-core
- inferred: everything marked inferred above

**Not examined:** EUR-Lex returned empty bodies to every fetch, so no Official Journal text was quoted directly; I used official Commission, EIOPA and NIST pages instead. The ISO, AICPA and EN 301 549 texts are paywalled or were not fetched. The PLD, Data Act, DSA, NIST AI RMF, ISO 42001, Scorecard, Conftest, ScanCode and ORT were not captured because of the time limit.

**Reproduce the licenses:** `curl -s https://api.github.com/repos/open-policy-agent/opa/license | jq .license.spdx_id`

## Claims

[
 {
  "proposition": "CRA main provisions apply from 11 December 2027; Article 14 reporting from 11 September 2026; entered into force 10 December 2024.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_ac1ca8119f91c161e4075cb7a1",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_cbde011ee44c614a64f6468191",
      "revision": 1
     },
     "representation": "text",
     "digest": "631e964178e37c9788fdd89cd9e25d44ec2526b9590622393e01a584340d5f84"
    },
    "quote": "The CRA entered into force on 10 December 2024. Its main provisions will start applying from 11 December 2027."
   }
  ]
 },
 {
  "proposition": "CRA requires manufacturers to report actively exploited vulnerabilities and severe incidents with a 24h early warning and a 72h notification to the CSIRT and ENISA.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_ac1ca8119f91c161e4075cb7a1",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_cbde011ee44c614a64f6468191",
      "revision": 1
     },
     "representation": "text",
     "digest": "631e964178e37c9788fdd89cd9e25d44ec2526b9590622393e01a584340d5f84"
    },
    "quote": "24 hours for an early warning notification;"
   }
  ]
 },
 {
  "proposition": "CRA requires a defined support period during which vulnerabilities are handled per Annex I.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_ac1ca8119f91c161e4075cb7a1",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_cbde011ee44c614a64f6468191",
      "revision": 1
     },
     "representation": "text",
     "digest": "631e964178e37c9788fdd89cd9e25d44ec2526b9590622393e01a584340d5f84"
    },
    "quote": "The manufacturer needs to determine a support period for its product with digital elements"
   }
  ]
 },
 {
  "proposition": "The AI Omnibus postponed AI Act high-risk obligations to December 2027 (Annex III) and August 2028 (Annex I) and was published in the OJ on 24 July 2026.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_ac1ca8119f91c161e4075cb7a1",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_4b519f6f889807ecb723ef0807",
      "revision": 1
     },
     "representation": "text",
     "digest": "d205b23196e5b771e62b9ba023c4f2da6a2b4f3ec458e947bec3f3be1fa8e924"
    },
    "quote": "The AI Omnibus was published in the Official Journal of the EU on 24 July 2026."
   }
  ]
 },
 {
  "proposition": "AI Act Article 12 requires high-risk AI systems to allow automatic recording of events (logs) over their lifetime.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_ac1ca8119f91c161e4075cb7a1",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f1193192e7911afca366255ffe",
      "revision": 1
     },
     "representation": "text",
     "digest": "aaf30144fcf252733e481a2907e162cce0800a6738f3543599549a162c73b129"
    },
    "quote": "High-risk AI systems shall technically allow for the automatic recording of events (logs) over the lifetime of the system."
   }
  ]
 },
 {
  "proposition": "NIS2 had a transposition deadline of 17 October 2024 and imposes risk-management and incident-notification duties.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_ac1ca8119f91c161e4075cb7a1",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7f02042e43a05b8b5a5be4950e",
      "revision": 1
     },
     "representation": "text",
     "digest": "bcc25d1a663db0469f9395c5a157e65f139a27920a4ab53033e578934fb1bfd1"
    },
    "quote": "Member States had until 17 October 2024 to transpose the NIS2 Directive into national law."
   }
  ]
 },
 {
  "proposition": "DORA entered into application on 17 January 2025 and covers ICT risk management, resilience testing and incident reporting.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_ac1ca8119f91c161e4075cb7a1",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_864f33f99b52157832840d4ab8",
      "revision": 1
     },
     "representation": "text",
     "digest": "3cd340a00cfb9e5c7cdb6ba7bffcae8c1219c4f1cc56c1f4ccc1d1b4e8c9421b"
    },
    "quote": "It entered into application on 17 Jan 2025"
   }
  ]
 },
 {
  "proposition": "The European Accessibility Act covers e-commerce, banking services, computers and smartphones among others; transposition was due June 2022.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_ac1ca8119f91c161e4075cb7a1",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1cdad027a238af4e220c2230a4",
      "revision": 1
     },
     "representation": "text",
     "digest": "b56fea05ed6b438911681692ace957b7c9873bea5a47314b0df1ba7b944cbea5"
    },
    "quote": "Member States had to incorporate the European Accessibility Act into their national law by June 2022."
   }
  ]
 },
 {
  "proposition": "NIST SP 800-218 (SSDF v1.1, Feb 2022) defines a core set of secure software development practices to integrate into any SDLC.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_d090643fddaea6d4eff56691b8",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7a2bfab9bb6952c16348b23041",
      "revision": 1
     },
     "representation": "text",
     "digest": "cfedfacdc6626b7f6a15ee586531698f5ff00528c16a75e49bf17298596f4c59"
    },
    "quote": "a core set of high-level secure software development practices that can be integrated into each SDLC implementation"
   }
  ]
 },
 {
  "proposition": "SLSA Build L2 requires signed provenance generated by a hosted build platform; L3 requires a hardened build platform.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_d090643fddaea6d4eff56691b8",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f3098a95436938ecac64ca2ad0",
      "revision": 1
     },
     "representation": "text",
     "digest": "2fd2373432c148e1f4572404435e5a0de31838816f2903a426e2996fd19b4513"
    },
    "quote": "Signed provenance, generated by a hosted build platform"
   }
  ]
 },
 {
  "proposition": "OPA and Kyverno are licensed Apache-2.0; axe-core is MPL-2.0.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_e3fbdb28a25799dd2e3d873746",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_41afab9eace527a6b1399b9f1c",
      "revision": 1
     },
     "representation": "text",
     "digest": "a93046878719abbb5f2ed3fe83ea2bcd3e34459cce21e522b943661396e3da5a"
    },
    "quote": "\"spdx_id\": \"Apache-2.0\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_22abcd4991f2f1860fc9ac5a68",
      "revision": 1
     },
     "representation": "text",
     "digest": "df7c06e5d88c2278f155b9020c626406a1acbc3eb38062467e1ad0d5afa4672b"
    },
    "quote": "\"spdx_id\": \"Apache-2.0\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c8e0ec9548f13a22f3bc5a65a4",
      "revision": 1
     },
     "representation": "text",
     "digest": "8bf2d71227d5d2870dd2a126a33eb5aa1ddb4e5dafa9e85e9661348085e9ed19"
    },
    "quote": "\"spdx_id\": \"MPL-2.0\""
   }
  ]
 },
 {
  "proposition": "Requirements map to checks: dependency/SBOM/license/provenance/approver-separation/logging checks are automatable on diffs and releases, while classification (high-risk, important product, substantial modification), residual risk, reporting significance and conformity decisions need human or legal judgment.",
  "nature": "inference",
  "subquestion": {
   "id": "rque_674547cc4845450cc2943b32ae",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_cbde011ee44c614a64f6468191",
      "revision": 1
     },
     "representation": "text",
     "digest": "631e964178e37c9788fdd89cd9e25d44ec2526b9590622393e01a584340d5f84"
    },
    "quote": "Products with digital elements that have been placed on the market before 11 December 2027 are subject to the CRA only if, from that date, they are subject to a substantial modification."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f3098a95436938ecac64ca2ad0",
      "revision": 1
     },
     "representation": "text",
     "digest": "2fd2373432c148e1f4572404435e5a0de31838816f2903a426e2996fd19b4513"
    },
    "quote": "Provenance showing how the package was built"
   }
  ]
 },
 {
  "proposition": "An AI review system should emit traceable, tamper-evident evidence with named human approvers rather than compliance verdicts, because conformity declarations remain the manufacturer's legal act and logs must support traceability.",
  "nature": "inference",
  "subquestion": {
   "id": "rque_c671a104b6dfe4d7c60ce335a5",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_cbde011ee44c614a64f6468191",
      "revision": 1
     },
     "representation": "text",
     "digest": "631e964178e37c9788fdd89cd9e25d44ec2526b9590622393e01a584340d5f84"
    },
    "quote": "draw up the EU declaration of conformity and affix the CE marking to its product"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f1193192e7911afca366255ffe",
      "revision": 1
     },
     "representation": "text",
     "digest": "aaf30144fcf252733e481a2907e162cce0800a6738f3543599549a162c73b129"
    },
    "quote": "the identification of the natural persons involved in the verification of the results"
   }
  ]
 }
]
