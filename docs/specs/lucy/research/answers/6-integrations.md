# 6-integrations

session ses_9147bd7112c7df7a379564babba9eb1265113a62f2e55351dfa5cd1200227b35

## Answer

**Conclusion.** A top AI reviewer on GitHub should be a GitHub App. It posts inline review comments that can span several lines, uses a Checks run with annotations as its gate, uploads SARIF only for findings that look like a static-analysis tool's, and reports `merge_group` checks when a merge queue is required. It should also offer a local CLI or agent mode built on the same engine. The leading products learn from explicit feedback: reactions, chat replies that become stored "learnings", and rules files such as AGENTS.md or copilot-instructions. They measure quality as the share of comments the author actually resolved, and they post comments by default rather than block. Blocking is opt-in and severity-gated, and any approval is dismissed when new commits arrive.

**Claims**
1. Read: GitHub review comments take `line`, `side` and an optional `start_line` for a range, and trigger secondary rate limits if posted too fast (docs.github.com/rest/pulls/comments).
2. Read: content creation is limited to 80 requests per minute and 500 per hour. A GitHub App installation's limit grows by 50 requests per hour per repository past 20 (GitHub REST rate-limits doc).
3. Read: only a GitHub App can create check runs. Annotations are limited to 50 per request, appended over several updates, and a run can show at most 3 action buttons (docs.github.com/rest/checks/runs).
4. Read: SARIF upload needs the `security-events: write` permission. A second upload with the same category from the same tool overwrites the earlier results (GitHub SARIF upload doc).
5. Read: a merge queue waits for required checks on `merge_group` events or on `gh-readonly-queue/*` branches. A reviewer that is a required check must report there too (GitHub merge queue doc).
6. Read: GitLab suggestions are written in Markdown inside diff threads and can replace up to 201 lines. Applying one creates a commit and resolves the thread (GitLab suggestions doc).
7. Read: the CodeRabbit CLI reviews committed, staged and untracked changes. `--gate` exits with code 2 at a chosen severity, the docs suggest capping the agent's fix-and-review loop ("Only run the loop twice"), and they note CLI and PR reviews differ. Copilot code review also runs in the GitHub CLI and in IDEs.
8. Read: CodeRabbit stores learnings from chat replies. An admin approval delay can hold them before they apply, path instructions take priority over learnings, and it reads CLAUDE.md, .cursorrules and copilot-instructions automatically.
9. Read: Greptile trains on 👍/👎 reactions, where 👎 means "stop making these comments". Copilot reads instructions, AGENTS.md and skills from the PR's head branch. Bugbot dedupes against bugs it posted in earlier runs.
10. Read: Bugbot measures a resolution rate, judged by an LLM at merge time, which went from 52% to over 70%. It also uses BugBench, a set of real diffs with bugs annotated by humans (cursor.com/blog/building-bugbot).
11. Read: Atlassian measures a code resolution rate: did the author change the commented line afterwards? Their human baseline is about 45%, and the rate fell from ~40% to ~33% on new repos until they retrained the ranker.
12. Read: Google tuned its model to 50% precision as the balance point. 40–50% of previewed suggested edits were applied.
13. Read: Copilot reviews do not count toward required approvals by default. Approvals are opt-in and are dismissed on new commits. It reviews only once unless set to review every push.
14. Inferred: build the offline eval set from historical PRs. Label as true positives the human comments whose lines changed afterwards, plus fixes of bugs that escaped to production. Score precision and recall per category, and use the online resolution rate as the main metric.

**Not examined:** GitHub's ```suggestion``` syntax, the review `event` values (APPROVE / REQUEST_CHANGES / COMMENT), GitLab's discussions and code-quality APIs, stacked PRs and pre-commit hooks, and formal appeal flows. None of these were captured within the time budget.

**Reproduce:** none of these are behavioural claims. Each one is backed by its captured doc.

## Claims

[
 {
  "subquestion": {
   "id": "rque_c97bd918f40a41f931bf53f659",
   "revision": 1
  },
  "proposition": "GitHub PR review comments support multi-line ranges via line/side/start_line and creating them too fast triggers secondary rate limiting.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7ad34ede748e80a5c7f5d5b87e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "dc2f197a206d9acc79a5b4d9d57d4ded5331a8a469511c878fdf9dc937fe296d"
    },
    "quote": "If your comment applies to more than one line in the pull request diff, you should use the parameters line, side, and optionally start"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_c97bd918f40a41f931bf53f659",
   "revision": 1
  },
  "proposition": "GitHub caps content creation at 80/min and 500/hour; App installation limits scale with repositories.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3a40ee10cb66717422559b926f",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "3d474f020551d863520a006d85a12a9004f04ff14dfbd15af25331e38a9d562f"
    },
    "quote": "In general, no more than 80 content-generating requests per minute and no more than 500 content-generating requests per hour are allowed."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_3a40ee10cb66717422559b926f",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "3d474f020551d863520a006d85a12a9004f04ff14dfbd15af25331e38a9d562f"
    },
    "quote": "Installations that have more than 20 repositories receive another 50 requests per hour for each repository."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_c97bd918f40a41f931bf53f659",
   "revision": 1
  },
  "proposition": "Check runs require a GitHub App, annotations are limited to 50 per request, and at most three action buttons are accepted.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f5217991cce351d7c23b886268",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "a2917072fa76572b777bc0b33091c5c9e39b0a7af28cd85b0e90d3627b56c93b"
    },
    "quote": "To create a check run, you must use a GitHub App."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f5217991cce351d7c23b886268",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "a2917072fa76572b777bc0b33091c5c9e39b0a7af28cd85b0e90d3627b56c93b"
    },
    "quote": "Displays a button on GitHub that can be clicked to alert your app to do additional tasks."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_c97bd918f40a41f931bf53f659",
   "revision": 1
  },
  "proposition": "SARIF upload needs security-events write, and same tool+category uploads overwrite earlier results.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c8710633e1756a690ba45881c7",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "54491bc35049ce2afca537c0586bc247db3886420bccbaa28a9462200dfc14dc"
    },
    "quote": "If you upload a second SARIF file for a commit with the same category and from the same tool, the earlier results are overwritten."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_c97bd918f40a41f931bf53f659",
   "revision": 1
  },
  "proposition": "Merge queues wait for required checks reported on merge_group events or gh-readonly-queue branches.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_88b2058f11369a3983f37d2f1b",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "dfc305acbe9b417bd0b4ff504a5efb90b4a3d7e93137bc4436283d806e4043af"
    },
    "quote": "A merge queue will wait for required checks to be reported before it can proceed with merging."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_88b2058f11369a3983f37d2f1b",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "dfc305acbe9b417bd0b4ff504a5efb90b4a3d7e93137bc4436283d806e4043af"
    },
    "quote": "gh-readonly-queue/{base_branch}"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_c97bd918f40a41f931bf53f659",
   "revision": 1
  },
  "proposition": "GitLab suggestions are Markdown in diff threads, up to 201 lines, and applying them creates a commit.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_14874dadfe6a709984d0974498",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "b48d03b4e00d851552c3366992cf0cddf2f5062330578626455c71a7e7dd8e08"
    },
    "quote": "Reviewers can suggest code changes with a Markdown syntax in merge request diff threads."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_14874dadfe6a709984d0974498",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "b48d03b4e00d851552c3366992cf0cddf2f5062330578626455c71a7e7dd8e08"
    },
    "quote": "This allows for up to 201 changed lines per suggestion."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_11d5c6fa809107c0e1fd20ab34",
   "revision": 1
  },
  "proposition": "CodeRabbit's CLI reviews local changes, has a severity gate exit code, and recommends capped fix/re-review loops; CLI and PR reviews differ.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7d64da23202905e7af26dc67a4",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "1e1fcc347206266550fb0232fa86474f3ec4480bc2478177be475b8e6658c805"
    },
    "quote": "By default, it reviews tracked changes: committed changes, staged changes"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7d64da23202905e7af26dc67a4",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "1e1fcc347206266550fb0232fa86474f3ec4480bc2478177be475b8e6658c805"
    },
    "quote": "when it reports findings at or above a severity"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7d64da23202905e7af26dc67a4",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "1e1fcc347206266550fb0232fa86474f3ec4480bc2478177be475b8e6658c805"
    },
    "quote": "PR reviews and CLI reviews will differ, even if run on the same code."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7d64da23202905e7af26dc67a4",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "1e1fcc347206266550fb0232fa86474f3ec4480bc2478177be475b8e6658c805"
    },
    "quote": "Only run the loop twice."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_11d5c6fa809107c0e1fd20ab34",
   "revision": 1
  },
  "proposition": "Copilot code review is available beyond GitHub.com, including the GitHub CLI and IDEs.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d81f3b03730ceb6daadb26497d",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "27b321607b044b95e9d55452f91672ec0a79dafaab123612e29ea558c5cea5a7"
    },
    "quote": "Copilot code review is supported in:"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_cdf880d58795aad90336988020",
   "revision": 1
  },
  "proposition": "CodeRabbit learns preferences from chat, supports an admin approval delay, ranks path instructions above learnings, and auto-applies agent rules files.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a7ae7adc6b173b904182c36afd",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f2b5c1edceececa601b367130a2cc4c56595ac46c004ea4a926315c634f1ad84"
    },
    "quote": "it learns your team's code-review preferences based on chat interactions"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a7ae7adc6b173b904182c36afd",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f2b5c1edceececa601b367130a2cc4c56595ac46c004ea4a926315c634f1ad84"
    },
    "quote": "Days admins have to approve or reject a learning before it is automatically applied."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a7ae7adc6b173b904182c36afd",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f2b5c1edceececa601b367130a2cc4c56595ac46c004ea4a926315c634f1ad84"
    },
    "quote": "Path instructions precede learnings."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a7ae7adc6b173b904182c36afd",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f2b5c1edceececa601b367130a2cc4c56595ac46c004ea4a926315c634f1ad84"
    },
    "quote": "CodeRabbit automatically detects and applies these files without manual import."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_cdf880d58795aad90336988020",
   "revision": 1
  },
  "proposition": "Greptile trains on thumbs reactions; Copilot reads instructions/AGENTS.md/skills from the head branch; Bugbot dedupes against prior runs.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_4d74f98f28f1ecafeca2e6e7f2",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "213ccbca492684352ef52d319f4731d710e1bc22c94394613b59b19247fec075"
    },
    "quote": "This isn't helpful - stop making these comments"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d81f3b03730ceb6daadb26497d",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "27b321607b044b95e9d55452f91672ec0a79dafaab123612e29ea558c5cea5a7"
    },
    "quote": "Copilot reads repository custom instructions, agent instructions, and agent skills from the head branch"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_93b351e6a17681e3cd46e3be4c",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "063dad66346ff5792dccb08dfdc95a1a6759e847ac9dd38c4756bc99c183c9af"
    },
    "lines": {
     "start": 72,
     "end": 124
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_3c6d42b5c4b7c32923c99e897e",
   "revision": 1
  },
  "proposition": "Bugbot measures an LLM-judged resolution rate at merge time (52% to over 70%) plus an offline human-annotated BugBench.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_93b351e6a17681e3cd46e3be4c",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "063dad66346ff5792dccb08dfdc95a1a6759e847ac9dd38c4756bc99c183c9af"
    },
    "lines": {
     "start": 72,
     "end": 124
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_3c6d42b5c4b7c32923c99e897e",
   "revision": 1
  },
  "proposition": "Atlassian defines code resolution rate by subsequent author edits on the commented line, with a ~45% human benchmark and drift when scope expanded.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_be23eb19302f9227c48aea9eef",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "6fce33bdd2228bad42a43d36b36abd9517a68ad5ab43720b34ce7774902a8d72"
    },
    "quote": "made code changes after the comment was created on the line of code where the comment was made"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_be23eb19302f9227c48aea9eef",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "6fce33bdd2228bad42a43d36b36abd9517a68ad5ab43720b34ce7774902a8d72"
    },
    "quote": "very close to the human benchmark which is about 45%"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_be23eb19302f9227c48aea9eef",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "6fce33bdd2228bad42a43d36b36abd9517a68ad5ab43720b34ce7774902a8d72"
    },
    "quote": "CRR dropped from ~40% to ~33%"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_3c6d42b5c4b7c32923c99e897e",
   "revision": 1
  },
  "proposition": "Google calibrated its comment-resolution model to 50% precision and saw 40-50% of previewed edits applied.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_58a8cff240308ee6b58303d142",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "c54c1c2f50639513b6e02d342393f5bf2fb754eeee0d5ea58031428f77d15cfa"
    },
    "quote": "We found that a target precision of 50% provides a good balance."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_58a8cff240308ee6b58303d142",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "c54c1c2f50639513b6e02d342393f5bf2fb754eeee0d5ea58031428f77d15cfa"
    },
    "quote": "40% to 50% of all previewed suggested edits are applied by code authors."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_015f7c531f82026495647dbb2f",
   "revision": 1
  },
  "proposition": "Copilot reviews do not count toward required approvals by default; opt-in approvals are dismissed on new commits; it reviews once unless configured per push.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d81f3b03730ceb6daadb26497d",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "27b321607b044b95e9d55452f91672ec0a79dafaab123612e29ea558c5cea5a7"
    },
    "quote": "By default, Copilot's reviews do not count toward required approvals for the pull request."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d81f3b03730ceb6daadb26497d",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "27b321607b044b95e9d55452f91672ec0a79dafaab123612e29ea558c5cea5a7"
    },
    "quote": "If new commits are pushed after Copilot approves, the approval is dismissed, and you can re-request a review."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d81f3b03730ceb6daadb26497d",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "27b321607b044b95e9d55452f91672ec0a79dafaab123612e29ea558c5cea5a7"
    },
    "quote": "Unless Copilot has been configured to review each push to a pull request, it will only review a pull request once."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_3c6d42b5c4b7c32923c99e897e",
   "revision": 1
  },
  "proposition": "An offline eval set can be mined from historical PRs: label resolved-comment lines and escaped bugs as positives, score per-category precision/recall, and track online resolution rate as the north star (CodeReviewer shows mined benchmarks are standard).",
  "nature": "inference",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d63f635441de55d5dbcb86c419",
      "revision": 1
     },
     "representation": "text",
     "digest": "259f4ba78a403688e47e18f4668c458b73eda77dbc42994cee4bd6eaed9aa17b"
    },
    "quote": "we establish a high-quality benchmark dataset based on our collected data for these three tasks"
   }
  ]
 }
]
