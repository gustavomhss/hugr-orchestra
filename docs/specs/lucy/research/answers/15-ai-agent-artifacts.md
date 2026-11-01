# 15-ai-agent-artifacts

session ses_f8101eb22549f1f88340276ee27cac67e683f857494ae7ee43cfebe0fe9ac347

## Answer

Treat a change to an AI artifact as a change to behavior. Read the diff the way you read code, but don't trust a text review alone. Primary sources agree on four things. (1) Keep prompts and skills short and consistent, load detail only when needed, and put deterministic rules in scripts or host checks. (2) Treat every tool output, file or web page the agent reads as untrusted data. Grant least privilege, enforce authorization outside the model, and require human approval for high-impact actions. (3) Ship evals with the change. Run several trials, because output varies even at "deterministic" settings, and check any LLM judge against human grading. (4) LLM-calling code needs retries with backoff, handling for errors that arrive mid-stream, and spend-cap awareness. This repo already pins seat prompts to their .txt files, checks the jimmy prompt structurally, gates governed Maestro tools behind a playbook load, keeps the claude_code preset, sandboxes shell commands and has an SSE read timeout. It has no behavioral eval or regression suite for prompt changes in CI.

Premise check: `script/seat-skills.ts` does not exist. Seat skills are embedded by `modules/maestro/coordination/src/seat-skills-module.ts`. I found no "prompt hash pin": prompts are pinned by text equality (claim-15).

**1. Prompts and skills (read)**
- Cut every token that doesn't pay for itself ("Does this paragraph justify its token cost?"). Keep SKILL.md under 500 lines and split the rest into files loaded on demand. Only name and description are preloaded (claims 1–2).
- Use one term for one thing. Contradictory wording is a review defect (claim 3).
- Prefer scripts for deterministic operations: a rule that must always hold belongs in a tool or check, not in prose (claim 4).
- Write evals before writing extensive docs, and test on every model the skill will run on (claim 5). A prompt diff is a behavior change, so judge it by evals, not by how it reads.
- Instruction hierarchy: tool output and quoted text have no authority (OpenAI Model Spec, claim 6). Review whether a prompt lets data act as instructions.

**2. Agent safety (read)**
- Indirect injection comes from websites and files. One OWASP scenario leaks a private conversation through an injected image URL. Mark untrusted content clearly (claim 7).
- Excessive agency has three root causes: too much functionality, too many permissions, too much autonomy. Avoid open-ended tools such as shell or fetch, authorize in the downstream system, and put a human in the loop for high-impact actions (claim 8).
- MCP: proxies must get per-client consent to prevent confused deputy attacks. Token passthrough is forbidden. Local MCP servers should run sandboxed with minimal privileges (claim 9).

**3. Evals (read)**
- Run several trials per task. A regression suite should pass at nearly 100%. Use pass@k when one success is enough and pass^k when every run must succeed. Test both cases where a behavior should happen and where it should not (claim 10).
- Keep trials isolated: in one Anthropic eval, Claude scored better by reading git history left by earlier trials. Calibrate LLM judges against human experts (claim 11).
- LLM judges show position, verbosity and self-enhancement bias. They reached about 80% agreement with humans in Zheng et al. (claim 12).
- At "deterministic" settings, accuracy still varied by up to 15% across runs (Atil et al., claim 13). So a single-run pass or fail does not show significance.

**4. LLM-calling code (read)**
- Retry 5xx errors with exponential backoff. Errors can still arrive after a 200 on a stream. A tier spend-cap 429 has no retry-after and keeps failing, so blind retry loops waste calls (claim 14).
- Validate output formats in deterministic code (claim 7, OWASP mitigation 2).

**5. This repo (read)**
- `modules/maestro/coordination/test/seat-framework.test.ts:18-22` requires each seat prompt to equal its `prompt/<id>.txt` (claim 15).
- `modules/maestro/coordination/test/jimmy-method.test.ts:25-35` checks the jimmy prompt is under 400 words and never tells the seat to write the card. It also tests each check against a mutated input (claim 16).
- `modules/engine-adapters/claude-code/src/v2/host.ts:38-42` gates `maestro_*` tools until `maestro-run-governed` loads (claim 17). The query keeps `preset: "claude_code"`, which is the billing and terms constraint (claim 18).
- `packages/core/src/tool-safety-sandbox.ts:63-67` wraps shell commands after permission approval (claim 19).
- `packages/core/src/aisdk.ts:26-36` aborts an SSE read that stalls (claim 20).

**Gaps (inferred)**
- No `.github/workflows` file runs a model-behavior eval, LLM-judge suite or golden set for prompt or skill diffs. "eval" there only means nix eval, and the relay benchmark runtime tests are manual (claim 21).
- Atlas has golden-set and LLM-judge methodology docs, but they are not wired to seat prompts (claim 22).
- Missing checks for a reviewer to add:
  - a behavioral regression suite for seat prompts, skills and playbooks, run with several trials and a pass^k threshold;
  - injection test cases for tool and web content;
  - a check that new tools follow least privilege;
  - a declared token budget for every seat prompt, not only jimmy.

**Not examined:** OWASP Agentic AI threats document, MCP tool-poisoning guidance, Anthropic and OpenAI model-versioning and caching docs, and the repo's provider fallback and retry code beyond aisdk.ts. I didn't capture these in the time budget, so model pinning, caching and fallbacks are unanswered here.

**Reproduce:** `bun run test:ci maestro test/seat-framework.test.ts test/jimmy-method.test.ts`

## Claims

[
 {
  "proposition": "Anthropic's skill guidance asks authors to justify each token's cost and to keep SKILL.md under 500 lines, splitting content into separate files.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_76a6ff9484c9afec27e2b6f83e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3346e9cc5f3ab0f172435f286e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cb3f49125d6716342b369145655ec8a129a2baeaff3dd56b3087758f9674bd54"
    },
    "quote": "Does this paragraph justify its token cost?"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_3346e9cc5f3ab0f172435f286e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cb3f49125d6716342b369145655ec8a129a2baeaff3dd56b3087758f9674bd54"
    },
    "quote": "If your content exceeds this, split it into separate files using the progressive disclosure patterns described earlier."
   }
  ]
 },
 {
  "proposition": "Skills use progressive disclosure: only name and description are preloaded at startup.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_76a6ff9484c9afec27e2b6f83e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3346e9cc5f3ab0f172435f286e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cb3f49125d6716342b369145655ec8a129a2baeaff3dd56b3087758f9674bd54"
    },
    "quote": "At startup, only the metadata (name and description) from all Skills is pre-loaded."
   }
  ]
 },
 {
  "proposition": "The guidance calls for consistent terminology because it helps the model follow instructions.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_76a6ff9484c9afec27e2b6f83e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3346e9cc5f3ab0f172435f286e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cb3f49125d6716342b369145655ec8a129a2baeaff3dd56b3087758f9674bd54"
    },
    "quote": "Consistency helps Claude parse and follow instructions."
   }
  ]
 },
 {
  "proposition": "The guidance prefers scripts over model-generated logic for deterministic operations.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_76a6ff9484c9afec27e2b6f83e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3346e9cc5f3ab0f172435f286e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cb3f49125d6716342b369145655ec8a129a2baeaff3dd56b3087758f9674bd54"
    },
    "quote": "Write `validate_form.py` rather than asking Claude to generate validation code."
   }
  ]
 },
 {
  "proposition": "The guidance says to build evaluations before extensive documentation and to test a skill with every model it will run on.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_76a6ff9484c9afec27e2b6f83e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3346e9cc5f3ab0f172435f286e",
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
      "id": "cart_3346e9cc5f3ab0f172435f286e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cb3f49125d6716342b369145655ec8a129a2baeaff3dd56b3087758f9674bd54"
    },
    "quote": "Test your Skill with all the models you plan to use it with."
   }
  ]
 },
 {
  "proposition": "The OpenAI Model Spec instruction hierarchy gives tool messages and quoted or untrusted text no authority.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_76a6ff9484c9afec27e2b6f83e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_437ab5b2c45ad22d54158468c2",
      "revision": 1
     },
     "representation": "text",
     "digest": "fea1128177b9573a354dededc6899c127695b49d763c400aba6cd8000a299e7d"
    },
    "quote": "No Authority: assistant and tool messages; quoted/untrusted text and multimodal data in other messages"
   }
  ]
 },
 {
  "proposition": "OWASP LLM01 defines indirect prompt injection via external content, gives an exfiltration scenario through an injected URL, and recommends segregating untrusted content and validating output formats in deterministic code.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_a918e0fa1214f3e88eabb6359e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1980fd7ed0b558569593e4a84a",
      "revision": 1
     },
     "representation": "text",
     "digest": "00c0ad91dcb5444ddf0875bcf1f9a18f2d6cf3da82c47d76741abda67daca945"
    },
    "quote": "Indirect prompt injections occur when an LLM accepts input from external sources, such as websites or files."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1980fd7ed0b558569593e4a84a",
      "revision": 1
     },
     "representation": "text",
     "digest": "00c0ad91dcb5444ddf0875bcf1f9a18f2d6cf3da82c47d76741abda67daca945"
    },
    "quote": "cause the LLM to insert an image linking to a URL, leading to exfiltration of the the private conversation"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1980fd7ed0b558569593e4a84a",
      "revision": 1
     },
     "representation": "text",
     "digest": "00c0ad91dcb5444ddf0875bcf1f9a18f2d6cf3da82c47d76741abda67daca945"
    },
    "quote": "Separate and clearly denote untrusted content to limit its influence on user prompts."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1980fd7ed0b558569593e4a84a",
      "revision": 1
     },
     "representation": "text",
     "digest": "00c0ad91dcb5444ddf0875bcf1f9a18f2d6cf3da82c47d76741abda67daca945"
    },
    "quote": "use deterministic code to validate adherence to these formats"
   }
  ]
 },
 {
  "proposition": "OWASP LLM06 Excessive Agency recommends avoiding open-ended extensions, enforcing authorization downstream rather than by the LLM, and requiring human approval for high-impact actions.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_a918e0fa1214f3e88eabb6359e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b15cbbd2ad8d54d9f52a3f4665",
      "revision": 1
     },
     "representation": "text",
     "digest": "655f23df5f26089c5d3c97661079cdb2662bed5a6e48f675dc37ceb44e23e238"
    },
    "quote": "Avoid the use of open-ended extensions where possible (e.g., run a shell command, fetch a URL, etc.)"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b15cbbd2ad8d54d9f52a3f4665",
      "revision": 1
     },
     "representation": "text",
     "digest": "655f23df5f26089c5d3c97661079cdb2662bed5a6e48f675dc37ceb44e23e238"
    },
    "quote": "Implement authorization in downstream systems rather than relying on an LLM to decide if an action is allowed or not."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b15cbbd2ad8d54d9f52a3f4665",
      "revision": 1
     },
     "representation": "text",
     "digest": "655f23df5f26089c5d3c97661079cdb2662bed5a6e48f675dc37ceb44e23e238"
    },
    "quote": "Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken."
   }
  ]
 },
 {
  "proposition": "MCP security best practices require per-client consent against confused deputy, forbid token passthrough, and recommend sandboxed least-privilege local servers.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_a918e0fa1214f3e88eabb6359e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_23a0ec9f1b74352299f83b503d",
      "revision": 1
     },
     "representation": "text",
     "digest": "021db7650cc0f47f2c16808680c9f8eeeccb55af485bf72c5550ed2f62c7c4d9"
    },
    "quote": "To prevent confused deputy attacks, MCP proxy servers **MUST** implement\nper-client consent"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_23a0ec9f1b74352299f83b503d",
      "revision": 1
     },
     "representation": "text",
     "digest": "021db7650cc0f47f2c16808680c9f8eeeccb55af485bf72c5550ed2f62c7c4d9"
    },
    "quote": "MCP servers **MUST NOT** accept any tokens that were not explicitly\nissued for the MCP server."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_23a0ec9f1b74352299f83b503d",
      "revision": 1
     },
     "representation": "text",
     "digest": "021db7650cc0f47f2c16808680c9f8eeeccb55af485bf72c5550ed2f62c7c4d9"
    },
    "quote": "Execute MCP server commands in a sandboxed environment with minimal\n  default privileges"
   }
  ]
 },
 {
  "proposition": "Anthropic's agent-eval guidance runs multiple trials because outputs vary, expects regression evals near 100%, defines pass^k for consistency, and warns that one-sided evals create one-sided optimization.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_6fd7c4e9e85b5416c5d640f9a5",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_10196fe38f52819930ec9318f2",
      "revision": 1
     },
     "representation": "text",
     "digest": "25fa0691c30e888f0412c948310adcb0c9a047feaca55dd3e4191aeb67f786fc"
    },
    "quote": "Because model outputs vary between runs, we run multiple trials to produce more consistent results."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_10196fe38f52819930ec9318f2",
      "revision": 1
     },
     "representation": "text",
     "digest": "25fa0691c30e888f0412c948310adcb0c9a047feaca55dd3e4191aeb67f786fc"
    },
    "quote": "should have a nearly 100% pass rate"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_10196fe38f52819930ec9318f2",
      "revision": 1
     },
     "representation": "text",
     "digest": "25fa0691c30e888f0412c948310adcb0c9a047feaca55dd3e4191aeb67f786fc"
    },
    "quote": "pass^k measures the probability that all k trials succeed."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_10196fe38f52819930ec9318f2",
      "revision": 1
     },
     "representation": "text",
     "digest": "25fa0691c30e888f0412c948310adcb0c9a047feaca55dd3e4191aeb67f786fc"
    },
    "quote": "One-sided evals create one-sided optimization."
   }
  ]
 },
 {
  "proposition": "The same guidance reports eval contamination via shared state (git history from previous trials) and requires LLM-as-judge graders to be calibrated with human experts.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_6fd7c4e9e85b5416c5d640f9a5",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_10196fe38f52819930ec9318f2",
      "revision": 1
     },
     "representation": "text",
     "digest": "25fa0691c30e888f0412c948310adcb0c9a047feaca55dd3e4191aeb67f786fc"
    },
    "quote": "we observed Claude gaining an unfair advantage on some tasks by examining the git history from previous trials"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_10196fe38f52819930ec9318f2",
      "revision": 1
     },
     "representation": "text",
     "digest": "25fa0691c30e888f0412c948310adcb0c9a047feaca55dd3e4191aeb67f786fc"
    },
    "quote": "LLM-as-judge graders should be closely calibrated with human experts"
   }
  ]
 },
 {
  "proposition": "Zheng et al. document position, verbosity and self-enhancement biases in LLM judges and report over 80% agreement with human preferences.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_6fd7c4e9e85b5416c5d640f9a5",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d925431a9cb496d756ef4ff40a",
      "revision": 1
     },
     "representation": "text",
     "digest": "7900769a79b94004511c216b5a5c0a42a6dcc833edd43eb70b72757fca542e6c"
    },
    "quote": "including position, verbosity, and self-enhancement biases"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d925431a9cb496d756ef4ff40a",
      "revision": 1
     },
     "representation": "text",
     "digest": "7900769a79b94004511c216b5a5c0a42a6dcc833edd43eb70b72757fca542e6c"
    },
    "quote": "achieving over 80% agreement"
   }
  ]
 },
 {
  "proposition": "Atil et al. measured accuracy variations up to 15% across runs of LLMs configured to be deterministic.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_6fd7c4e9e85b5416c5d640f9a5",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_14e4f8d2ad5338797fe95e095b",
      "revision": 1
     },
     "representation": "text",
     "digest": "6b7a3fd1ea26c46e6c6ffd65874283af9e3f493bbeb506cae25c7ce09294edef"
    },
    "quote": "We see accuracy variations up to 15% across naturally occurring runs"
   }
  ]
 },
 {
  "proposition": "Anthropic's API error docs say to retry 500s with exponential backoff, that streaming errors can arrive after a 200, and that a spend-cap 429 has no retry-after and keeps failing.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_115d04727bd31d2ac1367e8863",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f26a0100ef1cc56fd6f86bf9df",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "47fe2413900d447a711e786ea814c81491c29c783f13e389c19ea60bf3424856"
    },
    "quote": "Retry the request with exponential backoff; if the error persists"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f26a0100ef1cc56fd6f86bf9df",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "47fe2413900d447a711e786ea814c81491c29c783f13e389c19ea60bf3424856"
    },
    "quote": "an error can occur after the API returns a 200 response"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f26a0100ef1cc56fd6f86bf9df",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "47fe2413900d447a711e786ea814c81491c29c783f13e389c19ea60bf3424856"
    },
    "quote": "A tier spend-cap 429 has no `retry-after` header and keeps failing until access resumes"
   }
  ]
 },
 {
  "proposition": "seat-framework.test.ts pins each seat prompt to equal its prompt/<id>.txt file and to name its return card; no sha256 prompt pin was found (the sha256 in specialist-name-guard pins a name).",
  "nature": "observation",
  "subquestion": {
   "id": "rque_e77bb0b02c01c7c87725d3c50d",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7d085992726e59275678305ba8",
      "revision": 1
     },
     "representation": "text",
     "digest": "751cc62af499eddccfc11f7b2a994e33862fbad5a8fa4a48c23e0c0d9c7ea820"
    },
    "lines": {
     "start": 18,
     "end": 22
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6793d3359030eeceba802a4daa",
      "revision": 1
     },
     "representation": "text",
     "digest": "de596049bf4a97176826f891304b3fdc71570c827e46013d61d04221e94280b4"
    },
    "quote": "expect(createHash(\"sha256\").update(NAME).digest(\"hex\")).toBe(NAME_SHA256)"
   }
  ]
 },
 {
  "proposition": "jimmy-method.test.ts checks the jimmy prompt is under 400 words and never tells the seat to write the card, each check also run on a mutated input.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_e77bb0b02c01c7c87725d3c50d",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b58f5c129f5ee1738c967fe720",
      "revision": 1
     },
     "representation": "text",
     "digest": "efaf21853a65a0128bab44e228f19c93837488b207b0de5fb084fc7c54938fff"
    },
    "lines": {
     "start": 25,
     "end": 35
    }
   }
  ]
 },
 {
  "proposition": "The claude-code host refuses governed maestro_* tools (excluding maestro_arsenal_* and maestro_workflows) until the maestro-run-governed playbook loads in that session.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_e77bb0b02c01c7c87725d3c50d",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_e9248af3be104fd3ecd4e5cefa",
      "revision": 1
     },
     "representation": "text",
     "digest": "75c819398f30058fcec7e0a74595cbee5658019856c4ef97d90732a1103ead71"
    },
    "lines": {
     "start": 38,
     "end": 42
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6fb4739c9ea3975f198ec33a08",
      "revision": 1
     },
     "representation": "text",
     "digest": "4f57044f08a4029103931f8c2caa89f1b13901b05a1a4b02fa15e67fa735e133"
    },
    "quote": "if (isGoverned(name) && !governedLoaded.has(turn.session.id)) return { allow: false, reason: GOVERNED_DENIAL }"
   }
  ]
 },
 {
  "proposition": "The claude-code host keeps the claude_code system prompt preset and appends to it rather than replacing it.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_e77bb0b02c01c7c87725d3c50d",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_de87997d8fabd77689244008e1",
      "revision": 1
     },
     "representation": "text",
     "digest": "f8b38bb2897285a5fff4ad180c3280a8f5e5761723562f10dbfe0d61d1f38088"
    },
    "quote": "preset: \"claude_code\","
   }
  ]
 },
 {
  "proposition": "ToolSafetySandbox.wrap wraps shell commands, documented as used after the shell's permission approval.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_e77bb0b02c01c7c87725d3c50d",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8a60bcdb1f512c4fc51e1d43ba",
      "revision": 1
     },
     "representation": "text",
     "digest": "8f13e72b5ee04cdafd67f7fca3887dba9b7a564cff7c7bca2d611e2e3ec363e1"
    },
    "lines": {
     "start": 63,
     "end": 67
    }
   }
  ]
 },
 {
  "proposition": "packages/core/src/aisdk.ts wrapSSE aborts the request when an SSE read exceeds a timeout.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_115d04727bd31d2ac1367e8863",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_178f61cb72ce9e838b3dc5e619",
      "revision": 1
     },
     "representation": "text",
     "digest": "cc30fcf393f0e81d28e4fb650091b8db5b4439ce8a26ddf70f987a5007892a2b"
    },
    "lines": {
     "start": 26,
     "end": 36
    }
   }
  ]
 },
 {
  "proposition": "No GitHub workflow runs a model-behavior eval, LLM-judge suite or golden set for prompt or skill diffs; 'eval' hits in .github/workflows are nix eval, bun --eval and a manual relay benchmark runtime.",
  "nature": "inference",
  "scope": "universal",
  "conditions": [
   "Search covered all 27 files under .github/workflows with complete coverage; evals invoked outside workflows (local scripts) were not checked."
  ],
  "subquestion": {
   "id": "rque_5043a4f248b057b2f46824098b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_de83716ca0bffa4aa93a1e244c",
      "revision": 1
     },
     "representation": "text",
     "digest": "efe2720605906916cc2e113c08be4d0a4191da419fb66d2d1681e6645f15f8f7"
    },
    "quote": "Benchmark runtime tests nest real pytest campaigns and stay manual:"
   }
  ]
 },
 {
  "proposition": "Golden-set and LLM-judge methodology exists in the Atlas module's docs and skills, not applied to seat prompts; script/seat-skills.ts does not exist and embedding is in seat-skills-module.ts.",
  "nature": "inference",
  "subquestion": {
   "id": "rque_5043a4f248b057b2f46824098b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_721ef9717867f3308ae4b26dbc",
      "revision": 1
     },
     "representation": "text",
     "digest": "11589ef40e5e7871260be08622a483c0f0148bbcc59d6ba9e93a21029768d3e7"
    },
    "quote": "LLM-judge agreement with a _mechanical_ oracle on code-truth tasks is only κ≈0.10–0.21"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_13733e7a80f85f133066b1418f",
      "revision": 1
     },
     "representation": "text",
     "digest": "ba5b95a35157786fa1db999a8d965f3d7f99e31a0db5cbde6d16504d0a6f212c"
    },
    "quote": "\"./seat-skills-module\": \"./src/seat-skills-module.ts\","
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1e680267ce42b71c8a27835616",
      "revision": 1
     },
     "representation": "text",
     "digest": "f7f38fa5cb374afb2a43504b42af65bd6968969055dffb42f6f3b9e9872a0774"
    },
    "quote": "coverage: files=0"
   }
  ]
 }
]
