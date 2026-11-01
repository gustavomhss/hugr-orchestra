# 15-ai-agent-artifacts (DRAFT: close refused, claims not checked)

session ses_6b29213913138cfe38c9d8941397df4927142818cae0157fff993d28c877f610

## Answer

**Conclusion.** Review an AI artifact like code that has no compiler. Read the diff for contradictions, cost and lost guarantees. Check any safety boundary in code, never in prose. Judge behavior only by repeated eval runs, because one run of a nondeterministic model proves nothing. Orchestra already has strong structural checks: host gates, the claude_code preset guard, a sandbox, a check that prompt tool names are registered, and digest pins on some data. It has no automated review for changes to prompts, skills or tool descriptions, and no behavioral regression eval that runs when a prompt changes.

**1. Prompt and skill review**
- read: name an instruction's motive instead of shouting it, and test the prompt by asking whether "a colleague with minimal context" could follow it (Anthropic prompting guide).
- read: contradictory or vague instructions do more harm to models that follow instructions closely, which burn reasoning trying to reconcile them. OpenAI found contradictions in real prompt libraries just by reviewing them.
- read: context budget means "Does this paragraph justify its token cost?", a SKILL.md body under 500 lines, and references one level deep (Skills best practices).
- read: write deterministic operations as scripts, not prose: "Prefer scripts for deterministic operations". OWASP LLM06 adds that authorization belongs in downstream code "rather than relying on an LLM to decide".
- read: you cannot see a regression in the prompt diff itself. Build evals first and compare against a baseline, at least three evaluations, tested on every model you ship (Skills guide).

**2. Agent safety review**
- read: OWASP LLM01 says no foolproof prevention exists. It lists least privilege, human approval for high-risk actions, and keeping untrusted content separate and labeled. Its indirect-injection example leaks a conversation through an image URL.
- read: OWASP LLM06 lists three root causes (excessive functionality, permissions, autonomy) and fixes: minimal extensions, no open-ended extensions, complete mediation, user approval.
- read: MCP guidance: an MCP server must not accept tokens that were not issued to it. A local MCP server needs consent showing the exact command, plus a sandbox. Scopes should be progressive and least privilege.

**3. Eval review**
- read: Anthropic separates capability evals from regression evals and runs multiple trials. pass@k and pass^k measure different things: at least one success versus every trial passing. LLM judges must be calibrated against humans, and trials must be isolated.
- read: even temperature 0 is nondeterministic in practice, because server batch size changes the numerics (Thinking Machines: 80 distinct completions out of 1000).
- read: treat evals as experiments with error bars and a power plan (Miller, arXiv 2411.00640).

**4. LLM-calling code**
- read: the Claude SDK retries transient errors twice with exponential backoff and honors `retry-after`. A 429 caused by the spend cap has no retry-after and keeps failing. Errors can arrive after the 200 in a stream. Requests over about 10 minutes need streaming or batch.

**5. This repository**
- read: `modules/engine-adapters/claude-code/src/v2/host.ts:38-42`: governed `maestro_*` tools are refused until the session loads `maestro-run-governed`. That rule lives in code, not prose.
- read: `modules/engine-adapters/claude-code/src/sdk.ts:42-47`: a structural guard throws unless the system prompt is the `claude_code` preset. Billing refusals are never retried.
- read: `apps/cli/test/product-host-parity.test.ts:10-37`: every tool named in `maestro.txt` must be registered, and a second test keeps that check from passing on an empty list. This is structural, not behavioral.
- read: process launches go through `ToolSafetySandbox.wrap/confine`. `AgentTerminal.sanitize` strips escape sequences from terminal output before the model reads it. `seat-skills-build.test.ts` and `seat-skill-root.test.ts` check how seat skills are embedded and their digests.
- read: `specialist-name-guard.test.ts` pins a sha256 digest, but no test I found pins the hash of a seat prompt's text.
- read: none of the 78 rules in `script/guards/rules` names prompt, skill, playbook or tool-description paths (complete listing). `protected-paths` covers AGENTS.md but not `seats/prompt/*.txt`.
- read: `modules/relay/benchmark/calibrate_judge.py` tests whether a judge can say no on a labeled set. It belongs to Relay, not to prompt review.
- inferred: checks the repo lacks:
  - a guard rule for prompt, skill and playbook paths that demands an eval or an explicit waiver;
  - a multi-trial behavioral regression suite run when a seat prompt changes;
  - a token-budget check on prompts;
  - an automated scan for contradictions;
  - injection test cases (adversarial content in files, web pages and tool results);
  - a review of tool-description diffs.

**Not examined:** the OWASP Agentic AI threats document. I fetched no OWASP Agentic AI threats source and used the 2025 LLM Top 10 pages. I did not review packages/llm provider retry, caching and fallback code, model pinning in config, or the playbook text itself. Time ran short and the search did not surface them.

**Reproduce:** `bun run test:ci cli test/product-host-parity.test.ts`

## Claims

[
 {
  "proposition": "Anthropic's prompting guide recommends explaining the motivation behind instructions and testing a prompt by whether a colleague with minimal context could follow it.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_75a391b618a15851d9565c3de9",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_349b7c21a228c5e8cefd4d366b",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "c7174dc74dbcb155365a37d995a22d004c6618c28c8a948ea98cad5c656a4100"
    },
    "quote": "Show your prompt to a colleague with minimal context on the task and ask them to follow it. If they’d be confused, Claude will be too."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_349b7c21a228c5e8cefd4d366b",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "c7174dc74dbcb155365a37d995a22d004c6618c28c8a948ea98cad5c656a4100"
    },
    "quote": "Providing context or motivation behind your instructions, such as explaining to Claude why such behavior is important, can give Claude more information about your goals"
   }
  ]
 },
 {
  "proposition": "OpenAI's GPT-5 prompting guide states contradictory or vague instructions are more damaging to precise instruction followers and recommends reviewing prompt libraries for contradictions.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_75a391b618a15851d9565c3de9",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_5012d0768351577b6549966851",
      "revision": 1
     },
     "representation": "text",
     "digest": "9820a301821393fe8dcf5a6f52967f565c6e004070ea4e56f80125ffa7de3316"
    },
    "quote": "poorly-constructed prompts containing contradictory or vague instructions can be more damaging to GPT-5 than to other models, as it expends reasoning tokens searching for a way to reconcile the contradictions rather than picking one instruction at random."
   }
  ]
 },
 {
  "proposition": "Anthropic's Skills guide sets context-budget and progressive-disclosure criteria (justify token cost, SKILL.md under 500 lines, references one level deep), prefers scripts for deterministic operations, and asks for evaluations built first with a baseline and testing across models.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_75a391b618a15851d9565c3de9",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_549fa54b53f4880ccc39281345",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cb3f49125d6716342b369145655ec8a129a2baeaff3dd56b3087758f9674bd54"
    },
    "quote": "“Does this paragraph justify its token cost?”"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_549fa54b53f4880ccc39281345",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cb3f49125d6716342b369145655ec8a129a2baeaff3dd56b3087758f9674bd54"
    },
    "quote": "Keep the `SKILL.md` body under 500 lines for optimal performance."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_549fa54b53f4880ccc39281345",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cb3f49125d6716342b369145655ec8a129a2baeaff3dd56b3087758f9674bd54"
    },
    "quote": "**Keep references one level deep from `SKILL.md`**."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_549fa54b53f4880ccc39281345",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cb3f49125d6716342b369145655ec8a129a2baeaff3dd56b3087758f9674bd54"
    },
    "quote": "**Prefer scripts for deterministic operations:**"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_549fa54b53f4880ccc39281345",
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
      "id": "cart_549fa54b53f4880ccc39281345",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "cb3f49125d6716342b369145655ec8a129a2baeaff3dd56b3087758f9674bd54"
    },
    "quote": "* [ ] At least three evaluations created\n* [ ] Tested with Haiku, Sonnet, and Opus"
   }
  ]
 },
 {
  "proposition": "OWASP LLM01:2025 says there may be no foolproof prevention for prompt injection and lists mitigations including least privilege, human approval for high-risk actions, and segregating untrusted external content; it gives an indirect-injection exfiltration scenario via an image URL.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_adf0833e6e247924a81047ccdf",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c172c8621a0066dffb73762560",
      "revision": 1
     },
     "representation": "text",
     "digest": "00c0ad91dcb5444ddf0875bcf1f9a18f2d6cf3da82c47d76741abda67daca945"
    },
    "quote": "it is unclear if there are fool-proof methods of prevention for prompt injection"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c172c8621a0066dffb73762560",
      "revision": 1
     },
     "representation": "text",
     "digest": "00c0ad91dcb5444ddf0875bcf1f9a18f2d6cf3da82c47d76741abda67daca945"
    },
    "quote": "Implement human-in-the-loop controls for privileged operations to prevent unauthorized actions."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c172c8621a0066dffb73762560",
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
      "id": "cart_c172c8621a0066dffb73762560",
      "revision": 1
     },
     "representation": "text",
     "digest": "00c0ad91dcb5444ddf0875bcf1f9a18f2d6cf3da82c47d76741abda67daca945"
    },
    "quote": "hidden instructions that cause the LLM to insert an image linking to a URL, leading to exfiltration of the the private conversation."
   }
  ]
 },
 {
  "proposition": "OWASP LLM06:2025 names excessive functionality, permissions and autonomy as root causes and recommends minimizing extensions, avoiding open-ended extensions, complete mediation in downstream systems, and user approval for high-impact actions.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_adf0833e6e247924a81047ccdf",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c9552e1370922c47db13da0653",
      "revision": 1
     },
     "representation": "text",
     "digest": "655f23df5f26089c5d3c97661079cdb2662bed5a6e48f675dc37ceb44e23e238"
    },
    "quote": "excessive functionality;\nexcessive permissions;\nexcessive autonomy."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c9552e1370922c47db13da0653",
      "revision": 1
     },
     "representation": "text",
     "digest": "655f23df5f26089c5d3c97661079cdb2662bed5a6e48f675dc37ceb44e23e238"
    },
    "quote": "Implement authorization in downstream systems rather than relying on an LLM to decide if an action is allowed or not."
   }
  ]
 },
 {
  "proposition": "The MCP security best practices forbid accepting tokens not issued to the server, require consent showing the exact command before running a local server, recommend sandboxing, and recommend a progressive least-privilege scope model.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_adf0833e6e247924a81047ccdf",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b3bcc042380c1fdfdf3e3911b6",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "021db7650cc0f47f2c16808680c9f8eeeccb55af485bf72c5550ed2f62c7c4d9"
    },
    "quote": "MCP servers **MUST NOT** accept any tokens that were not explicitly\nissued for the MCP server."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b3bcc042380c1fdfdf3e3911b6",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "021db7650cc0f47f2c16808680c9f8eeeccb55af485bf72c5550ed2f62c7c4d9"
    },
    "quote": "* Show the exact command that will be executed, without truncation"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b3bcc042380c1fdfdf3e3911b6",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "021db7650cc0f47f2c16808680c9f8eeeccb55af485bf72c5550ed2f62c7c4d9"
    },
    "quote": "Implement a progressive, least-privilege scope model:"
   }
  ]
 },
 {
  "proposition": "Anthropic's agent-eval guidance distinguishes capability from regression evals, uses multiple trials with pass@k vs pass^k, requires LLM judges calibrated with humans, and isolated trials.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_8b796e8b58d12f7987e79b864c",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_045e94985b86e20ddcb5cefa87",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "b84b252c73eba6aa181d91c75f34a92edd47656bfdd398e3f482df28cf811534"
    },
    "quote": "**Regression evals** ask, “Does the agent still handle all the tasks it used to?” and should have a nearly 100% pass rate."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_045e94985b86e20ddcb5cefa87",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "b84b252c73eba6aa181d91c75f34a92edd47656bfdd398e3f482df28cf811534"
    },
    "quote": "pass@k for tools where one success matters, pass^k for agents where consistency is essential."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_045e94985b86e20ddcb5cefa87",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "b84b252c73eba6aa181d91c75f34a92edd47656bfdd398e3f482df28cf811534"
    },
    "quote": "LLM-as-judge graders should be closely calibrated with human experts"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_045e94985b86e20ddcb5cefa87",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "b84b252c73eba6aa181d91c75f34a92edd47656bfdd398e3f482df28cf811534"
    },
    "quote": "Each trial should be “isolated” by starting from a clean environment."
   }
  ]
 },
 {
  "proposition": "LLM inference is nondeterministic even at temperature 0 because batch size varies with server load; Miller's paper treats evals as experiments with formulas for error bars and planning.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_8b796e8b58d12f7987e79b864c",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_810f85e098b640dc0b92431d36",
      "revision": 1
     },
     "representation": "text",
     "digest": "5750c2cd995e748d55b9ded5f1464d1464744b3d869367671786cff798f32c6f"
    },
    "quote": "the primary reason nearly all LLM inference endpoints are nondeterministic is that the load (and thus batch-size) nondeterministically varies!"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_810f85e098b640dc0b92431d36",
      "revision": 1
     },
     "representation": "text",
     "digest": "5750c2cd995e748d55b9ded5f1464d1464744b3d869367671786cff798f32c6f"
    },
    "quote": "Surprisingly, we generate 80 unique completions"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7e6efe6c34962dae4631973e15",
      "revision": 1
     },
     "representation": "text",
     "digest": "9a76c34aa7fdb3b40536f625acee6a7b30f580b6a2717f897f145e2df7cab3a2"
    },
    "quote": "we present formulas for analyzing evaluation data, measuring differences between two models, and planning an evaluation experiment."
   }
  ]
 },
 {
  "proposition": "Anthropic's API error docs say the SDK retries transient failures twice with exponential backoff honoring retry-after, spend-cap 429s have no retry-after, streaming errors can arrive after a 200, and long requests should use streaming or batches.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_72321c3e35f9c3f34c5cabba1e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d66a7571c57715701ac960a97b",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "47fe2413900d447a711e786ea814c81491c29c783f13e389c19ea60bf3424856"
    },
    "quote": "The official SDK automatically retries transient failures (such as connection errors, rate limits, and 5xx server errors) with exponential backoff, twice by default, honoring the `retry-after` header when present."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d66a7571c57715701ac960a97b",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "47fe2413900d447a711e786ea814c81491c29c783f13e389c19ea60bf3424856"
    },
    "quote": "A tier spend-cap 429 has no `retry-after` header and keeps failing until access resumes"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d66a7571c57715701ac960a97b",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "47fe2413900d447a711e786ea814c81491c29c783f13e389c19ea60bf3424856"
    },
    "quote": "an error can occur after the API returns a 200 response"
   }
  ]
 },
 {
  "proposition": "The Claude Code host refuses governed maestro_* tools (excluding maestro_arsenal_* and maestro_workflows) until the session loads the maestro-run-governed playbook, and the SDK wrapper throws unless the system prompt is the claude_code preset; billing refusals are never retried.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_d5c98c5c10989d3cb49cbb0bc8",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_031cdad4e220089a5f9e9397c2",
      "revision": 1
     },
     "representation": "text",
     "digest": "3c6aff968db42ca34384d5ca9a5d7fc4408a435affc3dc955bb4b1a119996820"
    },
    "quote": "const isGoverned = (name: string) => name.startsWith(\"maestro_\") && !name.startsWith(\"maestro_arsenal_\") && name !== \"maestro_workflows\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_aed69d684ae012acb96237da4b",
      "revision": 1
     },
     "representation": "text",
     "digest": "54f4a7c3470bfbe91ad7d988ba675fd72084222461ab65cfefef11fdbe3119de"
    },
    "quote": "throw new Error(\"Claude Code turns must keep the claude_code system prompt preset\")"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_aed69d684ae012acb96237da4b",
      "revision": 1
     },
     "representation": "text",
     "digest": "54f4a7c3470bfbe91ad7d988ba675fd72084222461ab65cfefef11fdbe3119de"
    },
    "quote": "/** A billing refusal from Anthropic, repeated verbatim so the owner sees exactly what was returned. Never retried. */"
   }
  ]
 },
 {
  "proposition": "A test asserts every tool name the Maestro prompt references is registered in the composed V2 registry, with an anti-vacuity check; this is a structural, not behavioral, prompt test.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_d5c98c5c10989d3cb49cbb0bc8",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a8f8b96f9800975f81af62df85",
      "revision": 1
     },
     "representation": "text",
     "digest": "3d9752640e73b58157ae247c94e0b2b1e9869dd20ce838e361a9e315988a243c"
    },
    "lines": {
     "start": 5,
     "end": 37
    }
   }
  ]
 },
 {
  "proposition": "Process launches across core (process-control, relay, format, lsp, code index) go through ToolSafetySandbox.wrap/confine, and AgentTerminal.sanitize strips escape sequences and control characters from terminal text the model reads.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_d5c98c5c10989d3cb49cbb0bc8",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_fab985bcd50b0ade64bd0dcb33",
      "revision": 1
     },
     "representation": "text",
     "digest": "c11d5f5c9d63645e61a32cf1f8d492a4e54c14ae223f92ab0cc745c99d5b25b2"
    },
    "quote": "const prepare = (next: ChildProcess.Command) => ToolSafetySandbox.wrap(next).pipe("
   },
   {
    "source": {
     "artifact": {
      "id": "cart_31ef8ecded05708ea0a2ab6c59",
      "revision": 1
     },
     "representation": "text",
     "digest": "78a8cb466ae70177448a17f4258a5aa52940fadf65fc22b191806e619fd95215"
    },
    "quote": "What the model reads of terminal output: no escape sequences (OSC 52 clipboard writes and titles included)"
   }
  ]
 },
 {
  "proposition": "Seat skill embedding is tested (seat-skills-build.test.ts, seat-skill-root.test.ts with digest verification), and a sha256 digest pin exists in specialist-name-guard.test.ts.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_d5c98c5c10989d3cb49cbb0bc8",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0204545ba4cab4a1799a98d4fa",
      "revision": 1
     },
     "representation": "text",
     "digest": "aa677d0e39574e033ba9347e1bc799ac166c556fcdc15804d74373933b354b8d"
    },
    "quote": "modules/maestro/coordination/test/seat-skills-build.test.ts:4: import { seatSkillsFiles, seatSkillsModule } from \"@orchestra/maestro/seat-skills-module\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_9dbc4fb3c132414a1076160949",
      "revision": 1
     },
     "representation": "text",
     "digest": "f5f7ba3a5be916a515b46d822d24a800a409db48785ce989d0d2ffe2d8a2a176"
    },
    "quote": "modules/maestro/coordination/test/seat-skill-root.test.ts:117:   test(\"planted companion symlink cannot pass digest verification\", async () => {"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_9dbc4fb3c132414a1076160949",
      "revision": 1
     },
     "representation": "text",
     "digest": "f5f7ba3a5be916a515b46d822d24a800a409db48785ce989d0d2ffe2d8a2a176"
    },
    "quote": "expect(createHash(\"sha256\").update(NAME).digest(\"hex\")).toBe(NAME_SHA256)"
   }
  ]
 },
 {
  "proposition": "None of the 78 guardrail rules in script/guards/rules targets prompt, seat-skill, playbook or tool-description paths, and protected-paths covers AGENTS.md and guard scripts but not seat prompts.",
  "nature": "observation",
  "scope": "universal",
  "subquestion": {
   "id": "rque_615a0e23ca4bf863a7ede64677",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1c821f97430c5e778405199075",
      "revision": 1
     },
     "representation": "text",
     "digest": "69cd77200a6cd93a2bee1dc742dbfdef385e58ad29f8e28bcb091fdd262420c7"
    },
    "quote": "78 hit(s)\ncoverage: files=78 ignoreRespected=true binariesSkipped=0 complete=true"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a550509c03caa5353f22c6bafa",
      "revision": 1
     },
     "representation": "text",
     "digest": "bcbcfc0e480f91a55bca51ca13c69816b35c105227f253a3a5375d44977817d1"
    },
    "lines": {
     "start": 5,
     "end": 14
    }
   }
  ]
 },
 {
  "proposition": "An LLM-judge calibration harness exists only in Relay's benchmark, testing that the judge can say no on a labeled set.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_615a0e23ca4bf863a7ede64677",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8e21833a65acc8c03448819c66",
      "revision": 1
     },
     "representation": "text",
     "digest": "6888ca405e71b148972033c843b26841d313af56dae384684e15d518d9bff700"
    },
    "lines": {
     "start": 2,
     "end": 5
    }
   }
  ]
 },
 {
  "proposition": "Measured against the primary sources, the repository lacks: a guard requiring an eval or waiver on prompt/skill/playbook changes, a multi-trial behavioral regression suite for seat prompts, a prompt token-budget check, contradiction review, injection test cases, and tool-description diff review.",
  "nature": "inference",
  "subquestion": {
   "id": "rque_615a0e23ca4bf863a7ede64677",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1c821f97430c5e778405199075",
      "revision": 1
     },
     "representation": "text",
     "digest": "69cd77200a6cd93a2bee1dc742dbfdef385e58ad29f8e28bcb091fdd262420c7"
    },
    "quote": "78 hit(s)\ncoverage: files=78 ignoreRespected=true binariesSkipped=0 complete=true"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_045e94985b86e20ddcb5cefa87",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "b84b252c73eba6aa181d91c75f34a92edd47656bfdd398e3f482df28cf811534"
    },
    "quote": "Because model outputs vary between runs, we run multiple trials to produce more consistent results."
   }
  ]
 }
]
