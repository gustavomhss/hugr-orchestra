# 25-due-diligence

session ses_f10ac1f55c3ec3215999740d5c906602da2d69d7b66b8dcc2dad892e73e357f6

## Answer

**Conclusion.** Expert tech DD looks at the people and process around the code as much as the code itself. A typical audit combines interviews with a code review across about five pillars: team, delivery, codebase, security/compliance and fit with the business. The report rates each finding by severity, puts a cost on it where possible, and ties it to a deal mechanism. An Orchestra review seat could run the repository-evidence half on its own: git forensics, the dependency and license inventory, secrets and static weakness scans, and delivery proxies. It would need humans for interviews, judgement on production and legal questions, pentests, pricing and fact-checking. Today's review seats only look at diffs, so a DD mode would be a new repository-scoped job.

**Claims**
- (read) Scope: a five-pillar checklist covers team and key-person risk, delivery (DORA), codebase health including OSS licences, security/compliance, and roadmap/TCO fit. Code is "one pillar out of five". madewithlove reports key-person risk in about 91% of its audits and secrets in about 51% (madewithlove checklist and report pages).
- (read) DORA now uses five metrics: lead time, deployment frequency, failed-deployment recovery time, change fail rate and rework rate. They are measured per application and should not be compared across unlike systems (dora.dev).
- (read) Scoring: ISO/IEC 5055 (from CISQ) covers 4 of the 8 ISO 25010 characteristics. It counts CWE-based structural weaknesses with static analysis and reports them as a density, and CISQ says it can be used to estimate technical debt and cost of ownership (it-cisq.org).
- (read) Forensics: truck factor can be estimated from git history. 65% of 133 GitHub projects had TF≤2, but developers agreed with only 53% of the estimates (Avelino et al., ICPC 2016). A hotspot is change frequency × size, and CodeScene's docs say hotspots correlate strongly with defects and maintenance cost.
- (read) OSS/IP: the OpenChain M&A checklist audits practices as well as files: discovery, approval, obligations, inventory and tooling. Black Duck's 2026 M&A data found license conflicts in 94% of transactions and unpatched vulnerabilities in 97%.
- (read) Deliverable: executive summary → scope and limitations → findings with evidence, severity and action → price and structure → appendices. Severity has four levels: deal-breaker, price/structure item, condition/remediation, observation (BD Emerson). Not everyone scores: madewithlove gives no score, has the target fact-check its observations and labels its concerns as judgement. It also says no red flag is automatically a deal-breaker; remediation cost and time decide.
- (read) AI today: vendors such as KMS market AI code scanning and SDLC process mining. These are claims, not evidence. Independent studies find LLMs detect up to 90–100% of vulnerabilities but with high false positives (arXiv 2407.16235). At project scale both LLM and SAST tools have very high false-discovery rates, caused by shallow interprocedural reasoning, and take hours to days to run (arXiv 2601.19239). Combining SAST and LLMs reduces the problem.
- (read) Orchestra: `modules/maestro/coordination/src/seats/prompt/lucy.txt:1-3` (target diff → APPROVE/FIX_FIRST/REJECT) and `billy.txt:1-3` (regressions in a target change) are both diff-scoped.
- (inferred) What a seat could do alone vs with humans: see the last claim. A proposed DD-mode report:
  1. The deal questions answered yes/no.
  2. Scope and what could not be tested.
  3. Observations, each with a file:line or command, kept separate from labelled concerns.
  4. Forensics: truck factor, contributor concentration, hotspots.
  5. SBOM with licence classes and copyleft flags.
  6. Secrets, plus CWE/ISO 5055-style weakness density.
  7. Delivery proxies from git/CI, marked as proxies.
  8. Severity on the four-level scale, with remediation effort as ranges.
  9. A list of questions for humans: interviews, pentest, legal, production.

**Not examined:** the SIG maintainability model. The primary PDFs (Heitlager/Kuipers/Visser 2007, SIG/TÜViT criteria) failed to fetch, so its 1–5 star rating and its properties (volume, duplication, unit size and complexity, unit interfacing, coupling, component independence) are unverified here. Also not examined: the ISO 25010 text itself (paywalled), and data/privacy and cloud-cost practice beyond the checklist mentions.

## Claims

[
 {
  "subquestion": {
   "id": "rque_c0f684d7cdeae230b7cf2de9a8",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "A practitioner TDD checklist (madewithlove, 190+ audits) covers five pillars: team and leadership with key-person risk; delivery process including DORA metrics; codebase health (architecture fit, tests, CI/CD, tech debt, OSS dependencies and licences, scalability); security and compliance (secrets, GDPR, vulnerabilities, SOC 2/ISO 27001); and technology–business/roadmap fit including total cost of ownership.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a8254ced16538852df8760353a",
      "revision": 1
     },
     "representation": "text",
     "digest": "3004d50af910ad645a596b8943830172753803933ed8fba4f077a57d99af52e3"
    },
    "quote": "Five areas: (1) team and leadership, including key-person risk; (2) processes and delivery flow; (3) engineering and code quality, including architecture, testing and technical debt; (4) security and compliance; and (5) problem and solution fit and roadmap."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a8254ced16538852df8760353a",
      "revision": 1
     },
     "representation": "text",
     "digest": "3004d50af910ad645a596b8943830172753803933ed8fba4f077a57d99af52e3"
    },
    "quote": "Delivery flow: cycle time, deployment frequency and how predictably work reaches production (DORA metrics)"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a8254ced16538852df8760353a",
      "revision": 1
     },
     "representation": "text",
     "digest": "3004d50af910ad645a596b8943830172753803933ed8fba4f077a57d99af52e3"
    },
    "quote": "Third-party and open-source dependencies, their licences, and supply-chain exposure"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_c0f684d7cdeae230b7cf2de9a8",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Practitioners weight people and process above code: madewithlove reports key-person risk in ~91% of audits, documentation debt ~91%, missing automated testing ~89%, secrets in the codebase ~51%, and treats code as one pillar of five.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a8254ced16538852df8760353a",
      "revision": 1
     },
     "representation": "text",
     "digest": "3004d50af910ad645a596b8943830172753803933ed8fba4f077a57d99af52e3"
    },
    "quote": "Secrets in the codebase~51% of auditsCredentials committed to source control are an immediate security and compliance exposure."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_583a7f4b27c1f0c8230d4055a2",
      "revision": 1
     },
     "representation": "text",
     "digest": "1e981249347a0bbce9bfcb67450777556d8bd487e777aa1621575e8e505dba85"
    },
    "quote": "Count again: code is one pillar out of five. That ratio is deliberate."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_c0f684d7cdeae230b7cf2de9a8",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "DORA's current delivery model has five metrics (change lead time, deployment frequency, failed deployment recovery time, change fail rate, deployment rework rate), and DORA warns they apply per application/service and must not be compared across disparate systems.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0cf823a5e175a77ec6af1faf8d",
      "revision": 1
     },
     "representation": "text",
     "digest": "885bf2a639e81c18c0b9476396c732e2dcfc6a737ac72bfadce7b74737acb651"
    },
    "quote": "Change lead time: The amount of time it takes for a change to go from committed to version control to deployed in production."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0cf823a5e175a77ec6af1faf8d",
      "revision": 1
     },
     "representation": "text",
     "digest": "885bf2a639e81c18c0b9476396c732e2dcfc6a737ac72bfadce7b74737acb651"
    },
    "quote": "Deployment rework rate: The ratio of deployments that are unplanned but happen as a result of an incident in production."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0cf823a5e175a77ec6af1faf8d",
      "revision": 1
     },
     "representation": "text",
     "digest": "885bf2a639e81c18c0b9476396c732e2dcfc6a737ac72bfadce7b74737acb651"
    },
    "quote": "Comparing metrics between vastly different applications (for example, a mobile app and a mainframe system) can be misleading."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_950901c57e2f9381dcc7a73ba3",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "ISO/IEC 5055 (from CISQ) measures four of the eight ISO/IEC 25010 characteristics — security, reliability, performance efficiency, maintainability — by counting CWE-based structural weaknesses found by static analysis, reportable as weakness density, and supports estimating technical debt.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_486f3cf19848415035ff87ecc4",
      "revision": 1
     },
     "representation": "text",
     "digest": "0060968e3781be1de3f1f68030baebaf380c41f42c276bb818b0a7b67790c3d9"
    },
    "quote": "The four measures in ISO 5055 evaluate 4 of the 8 quality  characteristics specified in ISO/IEC 25010"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_486f3cf19848415035ff87ecc4",
      "revision": 1
     },
     "representation": "text",
     "digest": "0060968e3781be1de3f1f68030baebaf380c41f42c276bb818b0a7b67790c3d9"
    },
    "quote": "Counts of the weaknesses are calculated for each of  the four factors that may then be transformed into comparative measures such as  the density of weaknesses or the sigma level achieved by the product."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_486f3cf19848415035ff87ecc4",
      "revision": 1
     },
     "representation": "text",
     "digest": "0060968e3781be1de3f1f68030baebaf380c41f42c276bb818b0a7b67790c3d9"
    },
    "quote": "Assess the level of       technical debt in their applications and estimate their future cost of       ownership"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_950901c57e2f9381dcc7a73ba3",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Repository forensics techniques have published methods: truck factor estimated automatically from version history (Degree-of-Authorship + greedy heuristic; 65% of 133 GitHub projects had TF<=2, developer agreement only partial), and hotspots = change frequency × size/complexity, which CodeScene states correlate with defects and maintenance cost.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_27d987ed677ba5c036bd3f0441",
      "revision": 1
     },
     "representation": "text",
     "digest": "0beec04a14400045108fd0747095ca9daee7d9b88aaa922aaae93ae473659719"
    },
    "quote": "Among others, we find that the majority of our target systems (65%) have TF <= 2."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_27d987ed677ba5c036bd3f0441",
      "revision": 1
     },
     "representation": "text",
     "digest": "0beec04a14400045108fd0747095ca9daee7d9b88aaa922aaae93ae473659719"
    },
    "quote": "in 53% we receive a positive or partially positive answer regarding our estimated truck factors."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_50bcfdb77d2830db45c2682006",
      "revision": 1
     },
     "representation": "text",
     "digest": "d70143b4c078957e24c399a2e86990b71798947ab73465b2d5dd7f6877419717"
    },
    "quote": "We use the change frequency of each file as a proxy for the effort\nyou’ve spent on that code."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_50bcfdb77d2830db45c2682006",
      "revision": 1
     },
     "representation": "text",
     "digest": "d70143b4c078957e24c399a2e86990b71798947ab73465b2d5dd7f6877419717"
    },
    "quote": "There’s a strong correlation\nbetween Hotspots, maintenance costs and software defects."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_950901c57e2f9381dcc7a73ba3",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Open-source assessment in M&A is both a code audit and a process audit: the Linux Foundation/OpenChain checklist covers discovery, approval, license obligations, inventory, policy and tooling; Black Duck's 2026 M&A audit data found open source in 98% of codebases, license conflicts in 94% of transactions and unpatched vulnerabilities in 97%.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_95dc9935975b774f27531c70b0",
      "revision": 1
     },
     "representation": "text",
     "digest": "1b7a00d7b673bc6c980d30ab6d23b05d035e2e059a7b3b449da0ea5a521ac49f"
    },
    "quote": "Discovery of open source software in code bases"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_95dc9935975b774f27531c70b0",
      "revision": 1
     },
     "representation": "text",
     "digest": "1b7a00d7b673bc6c980d30ab6d23b05d035e2e059a7b3b449da0ea5a521ac49f"
    },
    "quote": "Maintaining inventory of open source software"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6cf9a5fef9703bbbf523b36249",
      "revision": 1
     },
     "representation": "text",
     "digest": "4532dec063814069ee9dda0fb9d5315980668acdea795ddad8ab22103e33cc70"
    },
    "quote": "License conflicts were found in 94% of transactions"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6cf9a5fef9703bbbf523b36249",
      "revision": 1
     },
     "representation": "text",
     "digest": "4532dec063814069ee9dda0fb9d5315980668acdea795ddad8ab22103e33cc70"
    },
    "quote": "Ninety-seven percent of transactions included unpatched vulnerabilities"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_ae6aa1bf2a835349a58a9e3335",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "A DD report has executive summary, scope and limitations, findings with evidence/severity/action, a price-and-structure section and appendices; findings are rated on a four-level scale (deal-breaker, price/structure item, condition/remediation, observation), each quantified and mapped to a deal mechanism.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0e1b841c3acf14e50aea22bc5f",
      "revision": 1
     },
     "representation": "text",
     "digest": "6b2bcc8d3f409c906e4a73750e698b4d3437e617f914c8cfb892857198d484a1"
    },
    "quote": "A common scheme has four levels. Deal-breakers: findings that undermine the thesis or expose the buyer to liability it will not accept"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0e1b841c3acf14e50aea22bc5f",
      "revision": 1
     },
     "representation": "text",
     "digest": "6b2bcc8d3f409c906e4a73750e698b4d3437e617f914c8cfb892857198d484a1"
    },
    "quote": "The discipline is that each finding carries one rating, a dollar or risk quantification where possible, and a recommended mechanism"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0e1b841c3acf14e50aea22bc5f",
      "revision": 1
     },
     "representation": "text",
     "digest": "6b2bcc8d3f409c906e4a73750e698b4d3437e617f914c8cfb892857198d484a1"
    },
    "quote": "The technology report covers architecture, code quality, scalability, technical debt, and the cost to remediate."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_ae6aa1bf2a835349a58a9e3335",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Practitioners disagree on scoring: madewithlove deliberately gives no score, separates fact-checked observations from labelled concerns, and answers deal-specific questions yes/no; it says no single red flag is automatically a deal-breaker — remediation cost and time decide.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_583a7f4b27c1f0c8230d4055a2",
      "revision": 1
     },
     "representation": "text",
     "digest": "1e981249347a0bbce9bfcb67450777556d8bd487e777aa1621575e8e505dba85"
    },
    "quote": "Our reports contain no grade, no marks out of ten."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_583a7f4b27c1f0c8230d4055a2",
      "revision": 1
     },
     "representation": "text",
     "digest": "1e981249347a0bbce9bfcb67450777556d8bd487e777aa1621575e8e505dba85"
    },
    "quote": "Before the report is finalised, the audited company fact-checks every one of them. Concerns are the auditor's judgement about what those facts mean, and they are clearly labelled as judgement."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a8254ced16538852df8760353a",
      "revision": 1
     },
     "representation": "text",
     "digest": "3004d50af910ad645a596b8943830172753803933ed8fba4f077a57d99af52e3"
    },
    "quote": "No single red flag is automatically a deal-breaker, what matters is how much it will cost and how long it will take to fix."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_01d01c5b5d5d20cc37340bcb69",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Vendors market AI in TDD for code scanning, SDLC/process mining from timestamps, and risk pattern detection, and claim churn/velocity/bug-fix time quantify debt cost — these are vendor claims, not independent evidence.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_761f8b3fffb5685f978a81f1a9",
      "revision": 1
     },
     "representation": "text",
     "digest": "10417f6e628aad6525631d2717b2e64925b219b5844e1a05cf9d046354e93b7d"
    },
    "quote": "AI-driven code analysis now automates this process, scanning entire codebases in minutes to flag technical debt, detect inconsistent coding practices, and surface vulnerabilities that might otherwise be missed."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_761f8b3fffb5685f978a81f1a9",
      "revision": 1
     },
     "representation": "text",
     "digest": "10417f6e628aad6525631d2717b2e64925b219b5844e1a05cf9d046354e93b7d"
    },
    "quote": "Next-gen AI due diligence solutions adopt the process mining methodology"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_01d01c5b5d5d20cc37340bcb69",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Independent studies show LLM vulnerability detection fails on precision: LLMs detect up to 90–100% of vulnerabilities but with high false positives (Zhou et al. 2024, 15 SAST vs 12 LLMs); at project scale both LLM and SAST tools have very high false discovery rates, rooted in shallow interprocedural reasoning, at multi-hour to multi-day cost (Li et al. 2026).",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_aed367eada8130789099fb9129",
      "revision": 1
     },
     "representation": "text",
     "digest": "c72e600e48d8a3000bedaa11f3b9c5b3758e6b6273d3107129ee3043fff83efe"
    },
    "quote": "SAST tools obtain low vulnerability detection rates with relatively low false positives, while LLMs can detect up 90\\% to 100\\% of vulnerabilities but suffer from high false positives."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b4f9aa16907c00ff6497cd678c",
      "revision": 1
     },
     "representation": "text",
     "digest": "34c9549f9b22fd6a497107eeb09553a92b97a6b6c6f4ce080ab9e63b3f98d352"
    },
    "quote": "both LLM-based and traditional tools generate substantial warnings but suffer from very high false discovery rates, hindering practical use."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b4f9aa16907c00ff6497cd678c",
      "revision": 1
     },
     "representation": "text",
     "digest": "34c9549f9b22fd6a497107eeb09553a92b97a6b6c6f4ce080ab9e63b3f98d352"
    },
    "quote": "Our manual analysis further reveals shallow interprocedural reasoning and misidentified source/sink pairs as primary failure causes"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_a254976f06d42bdc66f1482dce",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "Orchestra's existing review seats are diff-scoped, not repository-scoped: the cold code reviewer inspects a target diff and returns APPROVE/FIX_FIRST/REJECT; the security reviewer inspects a target change for regressions. No seat prompt defines a whole-repository DD assessment.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c3852486f40eb6bd565c18e7be",
      "revision": 1
     },
     "representation": "text",
     "digest": "32a93ebeb62fcc2a17d9bac3c4306ba5604c78b193ee29630b622488b58e98e5"
    },
    "lines": {
     "start": 1,
     "end": 3
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_8db69ff093fc9f131384d68d15",
      "revision": 1
     },
     "representation": "text",
     "digest": "972a0927182354c19cd84b838d0f37a818f8068c61264053c934ee17afae7eb4"
    },
    "lines": {
     "start": 1,
     "end": 3
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_a254976f06d42bdc66f1482dce",
   "revision": 1
  },
  "nature": "inference",
  "proposition": "Autonomous with evidence on a repo: git forensics (truck factor, contributor concentration, churn, hotspots), dependency/SBOM and license inventory, secrets scan, CWE-style static weakness counts, CI/test presence and a proxy for lead time/deploy frequency from git/CI history. Needs humans: interviews, roadmap/product fit, production scalability and incident history, pentest, IP ownership/contracts, legal interpretation of copyleft, pricing remediation into deal mechanisms, and fact-checking with the target. LLM security findings must be verified or ensembled with SAST before they count.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_583a7f4b27c1f0c8230d4055a2",
      "revision": 1
     },
     "representation": "text",
     "digest": "1e981249347a0bbce9bfcb67450777556d8bd487e777aa1621575e8e505dba85"
    },
    "quote": "Those pages are built from two sources: interviews with the people who build the product, from the CEO down to individual engineers, and a deep review of the code they've built."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_aed367eada8130789099fb9129",
      "revision": 1
     },
     "representation": "text",
     "digest": "c72e600e48d8a3000bedaa11f3b9c5b3758e6b6273d3107129ee3043fff83efe"
    },
    "quote": "By further ensembling the SAST tools and LLMs, the drawbacks of both SAST tools and LLMs can be mitigated to some extent."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0e1b841c3acf14e50aea22bc5f",
      "revision": 1
     },
     "representation": "text",
     "digest": "6b2bcc8d3f409c906e4a73750e698b4d3437e617f914c8cfb892857198d484a1"
    },
    "quote": "A good report leads with conclusions, rates every finding by severity, separates what was verified from what was inferred, and states what it could not test."
   }
  ]
 }
]
