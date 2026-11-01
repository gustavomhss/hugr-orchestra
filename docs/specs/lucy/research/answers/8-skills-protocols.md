# 8-skills-protocols

session ses_e724a9cdad121e4db34205d97fef3dd06a0a5707d60057e553cd4f668a90fda1

## Answer

Formal standards and agent review tools share one structure: entry criteria (a gate on whether to review at all), a scope limited to what changed, area checklists or rubrics, a severity scale, a confidence threshold with explicit "do not report" lists, evidence tied to file and line for each finding, an output schema, a verdict, and a separate check of each finding before it is reported. IEEE 1028 and Fagan inspection also add independence, recorded rework and follow-up. Today the lucy seat has a five-line prompt and no skills (`skills: []`). So almost none of this is packaged for it yet.

**Formal standards (subquestion 1)**
- IEEE 1028 (read, via Wikipedia's summary of the standard) defines one process for formal reviews: entry evaluation, management preparation, planning, overview, individual preparation, group examination, rework/follow-up, exit evaluation. Every step is mandatory for an inspection.
- Fagan inspection (read): the roles are Author, Moderator, Reader, Recorder and Inspector. A defect is "any part of the work product that will keep an inspector from approving it."
- IEEE 1028 audit (read): the Initiator sets the evaluation criteria. The Lead Auditor and Auditors must be "free from bias", and the audited organization carries out the corrective actions.
- Technical review (read): the Decision Maker "determines if the review objectives have been met". Unlike an inspection, this review type can recommend alternatives.
- ISO/IEC 20246: I saw only a search summary, not the standard (planning, individual review, issue analysis, reporting). It is not cited as a claim.

**Agent ecosystem (subquestion 2)**
- Anthropic's official code-review plugin (`claude-plugins-official/plugins/code-review/commands/code-review.md`, read) runs nine steps:
  1. a Haiku agent checks whether the PR is eligible;
  2. a Haiku agent lists the relevant CLAUDE.md paths;
  3. a Sonnet agent summarizes the change;
  4. four parallel reviewers: 2× CLAUDE.md compliance and 2× Opus bug agents;
  5. one subagent validates each issue;
  6. unvalidated issues are dropped;
  7. a terminal summary;
  8–9. optional inline comments.

  It also has a fixed list of false positives not to flag.
- `anthropics/claude-code-security-review` `prompts.py` (read) works in three phases: repository context, comparison with existing patterns, then vulnerability assessment. It uses HIGH/MEDIUM/LOW severity, a confidence score where anything below 0.7 is not reported (the objective line says >80%), JSON output with `exploit_scenario` and `confidence`, and a hard exclusion list.
- Qodo PR-Agent `pr_reviewer_prompts.toml` (read):
  - Focuses only on issues the PR introduces.
  - Treats the PR description and commit messages as untrusted data.
  - Is thorough on bugs and security, but must "be certain" before flagging lower-severity concerns.
  - Outputs a Pydantic/YAML schema (`key_issues_to_review`, `merge_recommendation`, `failure_modes`).
  - Tracks a finding's lifecycle across re-reviews as active, resolved or dismissed.
- obra/superpowers (read):
  - The requesting skill gives the reviewer crafted context, "never your session's history", and grades issues Critical, Important or Minor with a "Ready to merge? Yes | No | With fixes" verdict.
  - Its reviewer template requires a "Declined to judge" list and says "Do not mutate the working tree."
  - The receiving skill handles the author's side of a dispute: READ → UNDERSTAND → VERIFY → EVALUATE → RESPOND → IMPLEMENT, with technical pushback and no performative agreement.
- Configuration surfaces (read):
  - CodeRabbit: `path_instructions` and `path_filters` (glob-scoped).
  - Greptile: `strictness` 1–3, plus `commentTypes` logic/syntax/style.
  - Copilot: `.github/instructions/*.instructions.md` with `applyTo`/`excludeAgent`, read from the PR's head branch.
  - Bugbot: nested `.cursor/BUGBOT.md`, learned rules with an acceptance rate, a `resolution_status` per finding, and its config read from the base branch "so a PR cannot change how Bugbot reviews itself".

**Shared structure (subquestion 3)**
- This is inferred from the sources above. All of them include a scope restriction, explicit exclusions, a severity tier, a confidence gate, file:line evidence plus a trigger scenario, a schema, and a verdict.
- The stricter ones (the Anthropic plugin and PR-Agent) also re-check each finding or carry it across re-reviews.
- Areas the sources leave open: an escalation path and a stop rule beyond the eligibility gate.

**By work profile (subquestion 4)**
- Sourced: PR review (the plugin and PR-Agent), security review (`prompts.py`), and review of a plan or spec against requirements (the superpowers template's "Plan alignment" section and "spec is a vision document" rule).
- Not sourced: migration, release and incident/postmortem review playbooks. The superpowers template only mentions "Migration strategy if schema changed?".

**Packaging (subquestion 5)**
- Anthropic's skill authoring best practices (read):
  - Only each skill's name and description are pre-loaded; `SKILL.md` is read only when relevant.
  - Keep the body under 500 lines, with reference files one level deep.
  - Give low freedom to fragile steps and high freedom to code review.
  - "Build evaluations first": at least three scenarios measured against a baseline, tested on Haiku, Sonnet and Opus.
- Bugbot's per-rule acceptance rate is a field measure of rule quality.
- Inferred split for lucy:
  - Always loaded: the verdict vocabulary, independence and the evidence rule.
  - On-demand skills: profile playbooks and area checklists.
  - Host-enforced tools: read-only access, no author transcript, recording the review, and verdict schema validation. The review base profile already enforces part of this (`maestro_record_review: "allow"`, no edit or bash).

**Lucy today (subquestion 6)**
- Read in `modules/maestro/coordination/src/seats/lucy.ts:4-18`: `skills: []`, profile `review`, returns an APPROVE/FIX_FIRST/REJECT card.
- Read in `modules/maestro/coordination/src/seats/prompt/lucy.txt:1-5`: the prompt is five lines covering correctness, regressions, security and missing tests, and bans edits, self-review, merge and accepting the author transcript.

Not examined:
- The IEEE 1028 and ISO/IEC 20246 primary texts are paywalled, so I relied on Wikipedia's summary for IEEE 1028.
- OpenAI Codex's review prompt failed to fetch, so it is not cited.
- I found no sources for migration, release or postmortem review playbooks.

No probe ran; every claim comes from reading files and pages.

## Claims

[
 {
  "subquestion": {
   "id": "rque_84096e8e77399bb6b472613023",
   "revision": 1
  },
  "proposition": "IEEE 1028 defines a common formal review process (entry evaluation, management preparation, planning, overview, individual preparation, group examination, rework/follow-up, exit evaluation) derived from Fagan inspection, mandatory in full for inspection.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_9bd6fe69a65a961d8d8ec4cb3c",
      "revision": 1
     },
     "representation": "text",
     "digest": "54d4a6b25bb9543b4e36c0459360affad49e12ea48262fe22f16e80203cd9b4a"
    },
    "quote": "all activities are mandatory for inspection"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_9bd6fe69a65a961d8d8ec4cb3c",
      "revision": 1
     },
     "representation": "text",
     "digest": "54d4a6b25bb9543b4e36c0459360affad49e12ea48262fe22f16e80203cd9b4a"
    },
    "quote": "The review leader verifies that all action items are closed."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_84096e8e77399bb6b472613023",
   "revision": 1
  },
  "proposition": "Fagan inspection uses roles Author, Moderator, Reader, Recorder/Scribe, Inspector, entry criteria, and stages Planning, Overview, Preparation, Inspection meeting, Rework, Follow-up; a defect is anything that would keep an inspector from approving.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_eac58f155978e4ac4f5e6ddde0",
      "revision": 1
     },
     "representation": "text",
     "digest": "79e0aa67838bf251f33c1588f69f09b968a934a9ade1dbc300c24eb8897c7ed8"
    },
    "quote": "a defect is any part of the work product that will keep an inspector from approving it"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_eac58f155978e4ac4f5e6ddde0",
      "revision": 1
     },
     "representation": "text",
     "digest": "79e0aa67838bf251f33c1588f69f09b968a934a9ade1dbc300c24eb8897c7ed8"
    },
    "quote": "The stages in the inspections process are: Planning, Overview meeting, Preparation, Inspection meeting, Rework and Follow-up."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_84096e8e77399bb6b472613023",
   "revision": 1
  },
  "proposition": "IEEE 1028 audits require independent, unbiased auditors; the Initiator sets evaluation criteria and the audited organization implements corrective actions; technical reviews have a Decision Maker who judges whether objectives were met.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_ae5d676ff83d787ab592873e57",
      "revision": 1
     },
     "representation": "text",
     "digest": "e599c99fcc6ae861cd65b67c9cceb3854d38978f328e0c9154bca56e877e36f0"
    },
    "quote": "specifies the evaluation criteria, identifies the audit personnel, decides what follow-up actions will be required"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6304f75d5b88a4c8b7f18b8cc6",
      "revision": 1
     },
     "representation": "text",
     "digest": "9b7eb33fec9db55ecb6c0e6c2914dfb3cbce7c1eb59607d62082e3414ee86899"
    },
    "quote": "The Decision Maker (the person for whom the technical review is conducted) determines if the review objectives have been met."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e52283fccb06a48f0b94421983",
   "revision": 1
  },
  "proposition": "Anthropic's official code-review command gates eligibility with a haiku agent, runs 4 parallel reviewers (2 CLAUDE.md compliance, 2 Opus bug agents), validates each issue with a separate subagent, filters unvalidated issues, and lists explicit false positives.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_944cae2f20a3ab0ab971d5ca57",
      "revision": 1
     },
     "representation": "text",
     "digest": "3f02ea6eed996590348264777b2e324859a6e2c0c5f7dd298617ea21deb3b1b2"
    },
    "quote": "Launch 4 agents in parallel to independently review the changes."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_944cae2f20a3ab0ab971d5ca57",
      "revision": 1
     },
     "representation": "text",
     "digest": "3f02ea6eed996590348264777b2e324859a6e2c0c5f7dd298617ea21deb3b1b2"
    },
    "quote": "Filter out any issues that were not validated in step 5."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_944cae2f20a3ab0ab971d5ca57",
      "revision": 1
     },
     "representation": "text",
     "digest": "3f02ea6eed996590348264777b2e324859a6e2c0c5f7dd298617ea21deb3b1b2"
    },
    "quote": "If you are not certain an issue is real, do not flag it. False positives erode trust and waste reviewer time."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e52283fccb06a48f0b94421983",
   "revision": 1
  },
  "proposition": "Anthropic's security-review prompt uses three analysis phases, HIGH/MEDIUM/LOW severity, a confidence score with below-0.7 not reported, a JSON finding schema with exploit_scenario and confidence, and a hard exclusion list.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_df5cec6d66e2ef9865fab0caf0",
      "revision": 1
     },
     "representation": "text",
     "digest": "a779b599d3badeddff9d01f9a1cbe7828c03a4eb17b4717782131963c825d5d0"
    },
    "quote": "- Below 0.7: Don't report (too speculative)"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_df5cec6d66e2ef9865fab0caf0",
      "revision": 1
     },
     "representation": "text",
     "digest": "a779b599d3badeddff9d01f9a1cbe7828c03a4eb17b4717782131963c825d5d0"
    },
    "quote": "MINIMIZE FALSE POSITIVES: Only flag issues where you're >80% confident of actual exploitability"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e52283fccb06a48f0b94421983",
   "revision": 1
  },
  "proposition": "Qodo PR-Agent's reviewer prompt scopes to issues introduced by the PR, treats PR text as untrusted, demands certainty for lower-severity findings, outputs a typed YAML schema, and carries earlier findings as active/resolved/dismissed across re-reviews.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_aa9c749332d35315f8c9e826aa",
      "revision": 1
     },
     "representation": "text",
     "digest": "94add87cbdc7c9e45866fc05e547299ef9224787ad32132980f63bb3d3fb8eda"
    },
    "quote": "For lower-severity concerns, be certain before flagging."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_aa9c749332d35315f8c9e826aa",
      "revision": 1
     },
     "representation": "text",
     "digest": "94add87cbdc7c9e45866fc05e547299ef9224787ad32132980f63bb3d3fb8eda"
    },
    "quote": "\"dismissed\": a reviewer closed its thread without fixing it"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e52283fccb06a48f0b94421983",
   "revision": 1
  },
  "proposition": "obra/superpowers splits review into a requesting skill (crafted context, never session history; Critical/Important/Minor; merge verdict; declined-to-judge list; read-only) and a receiving skill (verify before implementing, reasoned pushback).",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_bedbe7b2a8ddbf91ef41ce3b6a",
      "revision": 1
     },
     "representation": "text",
     "digest": "2180e14a448e9410bec88e6646a2d1f0ce7fdd58de27388c1e052e929679d2bc"
    },
    "quote": "The reviewer gets precisely crafted context for evaluation — never your session's history."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_5fb1eb8350e6c0dff64f93d269",
      "revision": 1
     },
     "representation": "text",
     "digest": "82e370be6b3447523816286195571e4216ba56ba1ad6ad0e87862294c4c78dcb"
    },
    "quote": "**Ready to merge?** [Yes | No | With fixes]"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_cbadc5d476265a1765b23a83ad",
      "revision": 1
     },
     "representation": "text",
     "digest": "091df1629510af1b92fc4abd6f96732ebedb4cb2c0f3457e8f2740b0504a2438"
    },
    "quote": "**Core principle:** Verify before implementing. Ask before assuming. Technical correctness over social comfort."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e52283fccb06a48f0b94421983",
   "revision": 1
  },
  "proposition": "Commercial reviewers expose review policy as path-scoped instructions and noise controls: CodeRabbit path_instructions, Greptile strictness 1-3 and commentTypes, Copilot applyTo instructions read from the head branch, Bugbot nested BUGBOT.md with config read from the base branch and per-rule acceptance analytics.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_215cde2104eb6fbcd36a64f925",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "e6d1e04d63f46d4cac7f92e5108a5685554c291c471d2a8459d608a2dc059d3f"
    },
    "quote": "**Path instructions** apply targeted guidance to specific paths"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_311647e4c0f79a250358749a16",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "4f89bdf5e615fc7b26a686626aea4e64dc100e0d23c52f436fa18e197be97f20"
    },
    "quote": "| `strictness` | number | Filters comments by importance (1-3 scale) |"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_964f8647d703b58e6a60dc74cd",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "a7f25f9ffa4c37166add506ada0a4925dc31ebf2fcf7752e211f115ee799e0ee"
    },
    "quote": "Copilot reads repository custom instructions, agent instructions, and agent skills from the head branch"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a0a54008423398bfe16803a395",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "e9c1a2c61a3c71aadcd307f64b1a9e4ef9e88524637aed396f914b0fd4acdc50"
    },
    "quote": "Bugbot does not read the PR head version, so a PR cannot change how Bugbot reviews itself."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_ceac90877be8b65fa40d4d3d82",
   "revision": 1
  },
  "proposition": "Across the formal and agent sources, the shared review structure is: entry/eligibility gate, change-scoped focus, area checklist, severity tier, confidence threshold with exclusions, file:line evidence plus trigger scenario, a structured output schema, a verdict, and finding verification or follow-up; escalation and stop rules beyond the entry gate are weakly specified.",
  "nature": "inference",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_944cae2f20a3ab0ab971d5ca57",
      "revision": 1
     },
     "representation": "text",
     "digest": "3f02ea6eed996590348264777b2e324859a6e2c0c5f7dd298617ea21deb3b1b2"
    },
    "quote": "If any condition is true, stop and do not proceed."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_df5cec6d66e2ef9865fab0caf0",
      "revision": 1
     },
     "representation": "text",
     "digest": "a779b599d3badeddff9d01f9a1cbe7828c03a4eb17b4717782131963c825d5d0"
    },
    "quote": "You MUST output your findings as structured JSON with this exact schema:"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_5fb1eb8350e6c0dff64f93d269",
      "revision": 1
     },
     "representation": "text",
     "digest": "82e370be6b3447523816286195571e4216ba56ba1ad6ad0e87862294c4c78dcb"
    },
    "quote": "- File:line reference"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_9bd6fe69a65a961d8d8ec4cb3c",
      "revision": 1
     },
     "representation": "text",
     "digest": "54d4a6b25bb9543b4e36c0459360affad49e12ea48262fe22f16e80203cd9b4a"
    },
    "quote": "The review leader uses a standard checklist of entry criteria"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_9eb98c4a382773a70b13c98deb",
   "revision": 1
  },
  "proposition": "Profile-specific review playbooks were found for PR review, security review and plan/spec-alignment review; migration appears only as a checklist line, and no release or postmortem review playbook was captured.",
  "nature": "observation",
  "scope": "existential",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_5fb1eb8350e6c0dff64f93d269",
      "revision": 1
     },
     "representation": "text",
     "digest": "82e370be6b3447523816286195571e4216ba56ba1ad6ad0e87862294c4c78dcb"
    },
    "quote": "- Migration strategy if schema changed?"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_5fb1eb8350e6c0dff64f93d269",
      "revision": 1
     },
     "representation": "text",
     "digest": "82e370be6b3447523816286195571e4216ba56ba1ad6ad0e87862294c4c78dcb"
    },
    "quote": "## The spec is a vision document"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_df5cec6d66e2ef9865fab0caf0",
      "revision": 1
     },
     "representation": "text",
     "digest": "a779b599d3badeddff9d01f9a1cbe7828c03a4eb17b4717782131963c825d5d0"
    },
    "quote": "This is not a general code review - focus ONLY on security implications newly added by this PR."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_50319dc4fbbfe8d29310038095",
   "revision": 1
  },
  "proposition": "Anthropic's skill guidance prescribes progressive disclosure (only name/description preloaded, SKILL.md under 500 lines, references one level deep), low freedom for fragile operations, and evaluation-first development with at least three scenarios against a baseline across models.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a2c71ef5c502b48ba201bb961d",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cb3f49125d6716342b369145655ec8a129a2baeaff3dd56b3087758f9674bd54"
    },
    "quote": "At startup, only the metadata (name and description) from all Skills is pre-loaded."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a2c71ef5c502b48ba201bb961d",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cb3f49125d6716342b369145655ec8a129a2baeaff3dd56b3087758f9674bd54"
    },
    "quote": "**Create evaluations BEFORE writing extensive documentation.**"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a2c71ef5c502b48ba201bb961d",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cb3f49125d6716342b369145655ec8a129a2baeaff3dd56b3087758f9674bd54"
    },
    "quote": "**Keep references one level deep from `SKILL.md`**."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_ad572001a13c8ec3b2aa3596ad",
   "revision": 1
  },
  "proposition": "Orchestra's lucy seat exists as a read-only review-profile seat with an empty skills list and a five-line prompt returning a cited APPROVE/FIX_FIRST/REJECT card.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_453faee182e620627ca016200f",
      "revision": 1
     },
     "representation": "text",
     "digest": "061f813eee88736ec5683c8d25a06727ac82c2cffb7b1661a53b21d8d48c5c4f"
    },
    "lines": {
     "start": 4,
     "end": 18
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f8a64083a548134c1f301bdca7",
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
 }
]
