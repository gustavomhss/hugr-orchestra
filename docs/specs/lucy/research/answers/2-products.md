# 2-products

session ses_7bcaf3a22d9d98596adc5a1707b931b99d16dc4a91818ae5f99419d7f61e8a47

## Answer

**Conclusion.** By late 2026 the leading AI reviewers have converged on one design: an agent that pulls the context it needs with tools, then a verification or judge stage that filters findings. Most now sell more thorough review for more money (Claude Quick/Standard/Deep, Greptile Base/Plus/Apex, Qodo exhaustive mode). What still sets products apart is how they measure precision and resolution against real outcomes, whether they can run code to verify a finding, how far context reaches (PR history, linked issues, other repos), and whether they hand a finding off to an autofix agent. The weaknesses users report are consistent across products: noise and false positives, plus cost. An independent study of CodeRabbit found 56.3% of its reviews were rejected.

**Per-product capabilities and published numbers** (read = I read the vendor's primary page)
- **Anthropic Claude Code Review** (read): several agents search in parallel, then a verification step filters false positives, then findings are deduplicated and ranked by severity. Results post as inline comments plus a check run that never fails the PR. Instructions come from REVIEW.md/CLAUDE.md read from the base branch, never from the PR itself. Levels are Quick, Standard (the default) and Deep; it is triggered with `@claude review`, GitHub only, Team/Enterprise plans. Internal numbers: under 1% of findings marked incorrect; the share of PRs getting substantive comments went from 16% to 54%; average cost $15–25 and about 20 minutes per review. Other ways to run it: `/code-review` locally, Ultrareview in the cloud, GitHub Actions or GitLab CI. **security-review** (read): an open-source GitHub Action plus the `/security-review` command. It includes a false-positive filter that by default drops DoS, rate-limit and open-redirect findings, and the filter instructions can be customized. It is not hardened against prompt injection.
- **Cursor Bugbot** (read): the launch version ran 8 parallel passes over randomized diff order, kept bugs by majority vote, then ran a validator model and deduplicated. It later moved to a fully agentic design with dynamic context. Teams write their own invariants as Bugbot rules. Autofix (beta) spawns a Cloud Agent to patch the issue. Its metric is resolution rate: an LLM judges at merge time whether each flagged bug was fixed. That rate rose from 52% to over 70% across 11 versions, and resolved bugs per PR went from about 0.2 to 0.5. The offline benchmark is BugBench, real diffs with human-annotated bugs. Volume: over 2 million PRs per month. Planned: running code to verify bugs, and an always-on scanner.
- **Greptile** (read): v3 is an agentic loop with codebase search, learned rules and git history, and shows a confidence score on findings. Against v2, the action rate went from 34.75% to 59.24% and the upvote/downvote ratio from 1.44 to 5.13. With v4, the share of comments addressed went from 30% to 43%, judged by an LLM. Plus and Apex tiers (Sept 2026) cost 3 and 10 credits and run more subagents. Correct P0/P1 findings per PR rise with tier and PR size (Apex 0.67 to 2.55). All of these are vendor production A/B tests.
- **GitHub Copilot code review** (read): agentic tool calling became generally available in March 2026. It reads linked issues and PRs, plans long reviews, keeps memory across reviews, and clusters repeated comments. It blends CodeQL and ESLint results and offers batch autofix and handoff to the coding agent. It runs on Actions runners, self-hosted runners needing a one-time setup. Numbers: 60 million reviews, more than 1 in 5 GitHub reviews; 29% of reviews post no comments; about 5.1 comments per review. **ReviewBench** (read) is GitHub's open benchmark: 219 PRs across 19 languages, a multi-source golden set, Claude Sonnet 5 as grader, and 96.6% agreement with senior engineers. In one ensemble experiment its offline prediction matched the online direction: addressed rate +8.0% and recall +13.6%.
- **OpenAI Codex** (read): triggered with `@codex review`. On GitHub it posts only P0 and P1 findings. Rules live in a `## Code Review Rules` section of the nearest AGENTS.md. A separate `@codex security review` is in research preview, and `@codex fix the P1 issue` pushes a fix. It also integrates with GitLab (beta), Slack and Linear.
- **Qodo 2.0 / PR-Agent** (read): Qodo runs specialist agents (bugs, quality, security, tests) and a judge agent that deduplicates and filters by confidence. It uses PR history as context and attaches a remediation prompt to each finding. On Qodo's own benchmark (real PRs with injected bugs) it reports F1 60.1% and recall 56.7%. The site now advertises Qodo 3.0. PR-Agent has been donated to the community. It makes one LLM call per tool (`/review`, `/improve`, `/ask`), runs on GitHub, GitLab, Bitbucket, Azure DevOps and Gitea, and works with any model through LiteLLM.
- **CodeRabbit** (read): learnings come from replies in chat, with scope local, global or auto and an optional admin approval delay. It reads CLAUDE.md, .cursorrules and copilot-instructions automatically, supports path instructions in `.coderabbit.yaml`, and can analyze several repos together. Independent study (read, 31,073 reviews across 239 repos): 36.4% accepted, 7.3% led to discussion, 56.3% rejected, mostly as false positive, redundant or out of scope.
- **Google** (read, 2023 work): ML-suggested edits that resolve reviewer comments, calibrated to 50% precision. They address about 52% of comments offline, and authors apply 40–50% of the edits they preview. **Meta MetaMateCR** (read): fine-tuned Llama models reach 19.7% ActionableToApplied, 9.2 points above GPT-4o. A safety trial showed reviews got more than 5% slower, which was fixed by showing patches only to authors.

**Differentiating vs. table stakes** (inferred): table stakes are inline comments with suggested fixes, PR chat, config-as-code rules or instruction files, severity labels, summaries, GitHub and GitLab support, and an agentic context loop. What differentiates is a verify or judge stage with measured precision, metrics tied to real outcomes (resolution or addressed rate), effort tiers, runtime verification (Bugbot planned, Greptile TREX beta), cross-repo and PR-history context, deterministic analyzers fused with the LLM (Copilot with CodeQL), and handoff to an autofix agent. Watch the measurement method: every vendor number uses its own denominator and an LLM judge, so they are not comparable across products. Only ReviewBench, Martian's benchmark and the CodeRabbit study are independent of the product being scored.

**Not examined:** I did not capture primary pages for Graphite Diamond/Agent (fetch failed), Sourcery or Ellipsis. Search snippets only say Graphite has stack-aware merge queues and Ellipsis turns comments into code, so treat those as unverified. Same for Martian's Code Review Bench results (search snippet: Qodo Extended 64.3% precision / 62.3% recall), Baz, Macroscope, Augment, and Bitbucket/Jira coverage per product.

No local command reproduces these numbers; they come from the cited pages.

## Claims

[
 {
  "subquestion": {
   "id": "rque_e0bc7d233b68db953c745fff9b",
   "revision": 1
  },
  "proposition": "Claude Code Review runs parallel finding agents, a verification step that filters false positives, then dedup and severity ranking, posting inline comments and a non-failing check run.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d04daff55811c557c12e475629",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "78ff48627f8e08e5551e254a963356b6988160a6b0edc873fc8772e3f301e06a"
    },
    "quote": "a verification step checks the candidate findings against the code and filters out false positives"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d04daff55811c557c12e475629",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "78ff48627f8e08e5551e254a963356b6988160a6b0edc873fc8772e3f301e06a"
    },
    "quote": "The check run doesn't conclude as a failure."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_b7c9256d4cbe82d589558fdb7f",
   "revision": 1
  },
  "proposition": "Claude Code Review offers Quick, Standard (default) and Deep review levels set per org or repo; REVIEW.md is read from the base branch, never the PR.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d04daff55811c557c12e475629",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "78ff48627f8e08e5551e254a963356b6988160a6b0edc873fc8772e3f301e06a"
    },
    "quote": "**Standard**: balanced depth, speed, and cost. The default level."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_3d13ceb63b78a9a4d9777ea7cf",
   "revision": 1
  },
  "proposition": "Anthropic reports under 1% of Code Review findings marked incorrect internally, 16%→54% of PRs with substantive comments, and $15–25 average cost.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_20a99a6d40951e7495f72edebd",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "bce86468b78d09c86fa63110ed1f0b11c34bf22a0cb16192e90f64c216c82736"
    },
    "quote": "less than 1% of findings are marked incorrect"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_20a99a6d40951e7495f72edebd",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "bce86468b78d09c86fa63110ed1f0b11c34bf22a0cb16192e90f64c216c82736"
    },
    "quote": "Before, 16% of PRs got substantive review comments. Now 54% do."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_c8f4e71e0006c17533b5a887fd",
   "revision": 1
  },
  "proposition": "Claude Code Review is GitHub-only on Team/Enterprise; alternatives include local /code-review, Ultrareview, and GitHub Actions or GitLab CI/CD.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d04daff55811c557c12e475629",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "78ff48627f8e08e5551e254a963356b6988160a6b0edc873fc8772e3f301e06a"
    },
    "quote": "Anyone with a Claude API key or cloud provider credentials, on GitHub or GitLab"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e0bc7d233b68db953c745fff9b",
   "revision": 1
  },
  "proposition": "Claude Code security-review Action has default false-positive exclusions, customizable filter instructions, and is not hardened against prompt injection.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8f5e64a88f2e55cb7cae32ce90",
      "revision": 1
     },
     "representation": "text",
     "digest": "c1196d0afd277b37da423b17043723e7c0fa21517504cc554e62971a4fedef51"
    },
    "quote": "This action is not hardened against prompt injection attacks"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e0bc7d233b68db953c745fff9b",
   "revision": 1
  },
  "proposition": "Bugbot's launch pipeline used eight parallel randomized-diff passes, majority voting, a validator model and dedup.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_aa8dae5462c081e04339d8a903",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "063dad66346ff5792dccb08dfdc95a1a6759e847ac9dd38c4756bc99c183c9af"
    },
    "lines": {
     "start": 88,
     "end": 94
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_3d13ceb63b78a9a4d9777ea7cf",
   "revision": 1
  },
  "proposition": "Bugbot's resolution rate, an LLM judgment at merge time of whether flagged bugs were fixed, rose from 52% to over 70%; BugBench is its human-annotated offline benchmark.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_aa8dae5462c081e04339d8a903",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "063dad66346ff5792dccb08dfdc95a1a6759e847ac9dd38c4756bc99c183c9af"
    },
    "lines": {
     "start": 72,
     "end": 72
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_aa8dae5462c081e04339d8a903",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "063dad66346ff5792dccb08dfdc95a1a6759e847ac9dd38c4756bc99c183c9af"
    },
    "lines": {
     "start": 116,
     "end": 116
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e0bc7d233b68db953c745fff9b",
   "revision": 1
  },
  "proposition": "Greptile v3 runs an agentic loop with codebase search, learned rules and git history.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8829ccde592d23201a503059c1",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "9e7c8c2392a15006772a7b6b05bed0b689efd9649db1394b1353ec0b701e038a"
    },
    "quote": "The agent checks git history and discovers this helper was created during an old hotfix and never refactored."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_3d13ceb63b78a9a4d9777ea7cf",
   "revision": 1
  },
  "proposition": "Greptile reports v4 raised the share of comments addressed from 30% to 43%, with addressed determined by an LLM judge.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_61cee82ef0be17099c9c693610",
      "revision": 1
     },
     "representation": "text",
     "digest": "3ee7b48e1745e12958bc32d6ed3133eedf27f2aac14176835f4b0a361dd70c2c"
    },
    "quote": "Percentage of Greptile comments addressed by the author increased from 30% to 43%."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_b7c9256d4cbe82d589558fdb7f",
   "revision": 1
  },
  "proposition": "Greptile offers Base (1 credit), Plus (3) and Apex (10) review tiers.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_34c2132961b7b14eb7f6db9042",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "af89a55577b6530d41c52d38cbfaaa66657749cbbc2eb0bc7e7a67b71de46b15"
    },
    "quote": "Our most intensive review for large, complex PRs."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e0bc7d233b68db953c745fff9b",
   "revision": 1
  },
  "proposition": "Copilot code review is agentic (GA March 2026): it reads linked issues and PRs and keeps memory across reviews.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b41c94d8c31182f2a860fa2d20",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "7ef937f108fd487b410eea4db6160edc1fb533aa342fd5764bf373fff6295851"
    },
    "quote": "It reads linked issues and pull requests"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b41c94d8c31182f2a860fa2d20",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "7ef937f108fd487b410eea4db6160edc1fb533aa342fd5764bf373fff6295851"
    },
    "quote": "It can maintain memory across reviews"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_3d13ceb63b78a9a4d9777ea7cf",
   "revision": 1
  },
  "proposition": "GitHub reports that in 29% of reviews Copilot posts nothing.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b41c94d8c31182f2a860fa2d20",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "7ef937f108fd487b410eea4db6160edc1fb533aa342fd5764bf373fff6295851"
    },
    "quote": "In the remaining 29%, the agent says nothing at all."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_c8f4e71e0006c17533b5a887fd",
   "revision": 1
  },
  "proposition": "Agentic Copilot code review runs on GitHub Actions.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a1982b045f721ade53e96a5143",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "05341c5d3a5da70c9870e4c4570d3becc4bc7a31821a9dffbf6b6192e70319e9"
    },
    "quote": "Agentic Copilot code review runs on GitHub Actions."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_3d13ceb63b78a9a4d9777ea7cf",
   "revision": 1
  },
  "proposition": "GitHub's ReviewBench uses Claude Sonnet 5 as grader, with 96.6% agreement with senior engineers.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0778228f880648236db2a8614a",
      "revision": 1
     },
     "representation": "text",
     "digest": "8a61bfa0fbb91d5b6a06ba3448a5a8847d3aea9237e8eeff95a1a7c6f5eeb854"
    },
    "quote": "We use Claude Sonnet 5 as the LLM grader"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0778228f880648236db2a8614a",
      "revision": 1
     },
     "representation": "text",
     "digest": "8a61bfa0fbb91d5b6a06ba3448a5a8847d3aea9237e8eeff95a1a7c6f5eeb854"
    },
    "quote": "Their true/false-positive judgments agreed with ReviewBench 96.6% of the time."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_b7c9256d4cbe82d589558fdb7f",
   "revision": 1
  },
  "proposition": "Codex code review flags only P0/P1 issues on GitHub and has a separate security review.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8f96176849858ced4e55414a51",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "4bab7102fc39683cb01b47f18ef58edae2d6f4322429aff57d63277320b66bb0"
    },
    "quote": "In GitHub, Codex flags only P0 and P1 issues so review comments stay focused on high-priority risks."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_8f96176849858ced4e55414a51",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "4bab7102fc39683cb01b47f18ef58edae2d6f4322429aff57d63277320b66bb0"
    },
    "quote": "To request a Security Review manually, add this comment to a pull request:"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e0bc7d233b68db953c745fff9b",
   "revision": 1
  },
  "proposition": "Qodo 2.0 uses specialist agents plus a judge agent.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_70512c493a921e7461a265fa75",
      "revision": 1
     },
     "representation": "text",
     "digest": "950242cec15e3f65ae944a4f9c0441a5287f098a7bd11cf4f3e01e97f87fb7f7"
    },
    "quote": "Qodo includes a judge agent that evaluates findings across agents."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_3d13ceb63b78a9a4d9777ea7cf",
   "revision": 1
  },
  "proposition": "Qodo reports F1 60.1% on its own vendor-built benchmark.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_70512c493a921e7461a265fa75",
      "revision": 1
     },
     "representation": "text",
     "digest": "950242cec15e3f65ae944a4f9c0441a5287f098a7bd11cf4f3e01e97f87fb7f7"
    },
    "quote": "achieving the highest overall F1 score at 60.1%"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_c8f4e71e0006c17533b5a887fd",
   "revision": 1
  },
  "proposition": "Open-source PR-Agent supports GitHub, GitLab, BitBucket, Azure DevOps and Gitea.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_216c8ee95783c23e768fed2f74",
      "revision": 1
     },
     "representation": "text",
     "digest": "47903df85332f845ef43bd64b20cb1af027241170036d4844a0a1bc5bfbfd401"
    },
    "quote": "**Git Providers**: GitHub, GitLab, BitBucket, Azure DevOps, Gitea"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e0bc7d233b68db953c745fff9b",
   "revision": 1
  },
  "proposition": "CodeRabbit learnings are scoped local/global/auto.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_fa6ae2db1f5606287736a832c4",
      "revision": 1
     },
     "representation": "text",
     "digest": "f2b5c1edceececa601b367130a2cc4c56595ac46c004ea4a926315c634f1ad84"
    },
    "quote": "Choose scope: 'local' (repo), 'global' (org), or 'auto' (local for public repos, global for private repos)."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_f341bf42daccb47bb672d7fabf",
   "revision": 1
  },
  "proposition": "An independent study of 31,073 CodeRabbit reviews found 36.4% accepted and 56.3% rejected, mainly as false positive, redundant or out of scope.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3d6bcabb077e5737a4d16db727",
      "revision": 1
     },
     "representation": "text",
     "digest": "31451e31500237a3c9a53b1ee19342d99f59d56e1ed67c6830e9b35fbbcb6921"
    },
    "lines": {
     "start": 11,
     "end": 15
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_3d13ceb63b78a9a4d9777ea7cf",
   "revision": 1
  },
  "proposition": "Meta's MetaMateCR reached a 19.7% ActionableToApplied rate in production.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_457461b4ecbc6eebc481ab7860",
      "revision": 1
     },
     "representation": "text",
     "digest": "fbda62fb69353dd656dca4d98af54361916ced85ef4111a049f7bc291e77e62a"
    },
    "quote": "we see an ActionableToApplied rate of 19.7%"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_3d13ceb63b78a9a4d9777ea7cf",
   "revision": 1
  },
  "proposition": "Google calibrated its ML comment-resolution model to a 50% target precision.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_4ba4ba1f15038738a1827eeaa3",
      "revision": 1
     },
     "representation": "text",
     "digest": "ed584ace19e75aaf7dfee3b4b8e27edf09d4aa5173955f55a5feba34b2275498"
    },
    "quote": "calibrated for a target precision of 50%"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_f341bf42daccb47bb672d7fabf",
   "revision": 1
  },
  "proposition": "Table stakes are an agentic context loop, inline fixes, rules files and chat. What differentiates is a verification/judge stage with outcome-based metrics, effort tiers, runtime verification, PR-history or cross-repo context, and autofix-agent handoff. Vendor metrics are not comparable across products.",
  "nature": "inference",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_aa8dae5462c081e04339d8a903",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "063dad66346ff5792dccb08dfdc95a1a6759e847ac9dd38c4756bc99c183c9af"
    },
    "lines": {
     "start": 136,
     "end": 136
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0778228f880648236db2a8614a",
      "revision": 1
     },
     "representation": "text",
     "digest": "8a61bfa0fbb91d5b6a06ba3448a5a8847d3aea9237e8eeff95a1a7c6f5eeb854"
    },
    "quote": "Addressed rate, our online counterpart to precision"
   }
  ]
 }
]
