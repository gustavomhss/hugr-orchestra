# 13-git-change-hygiene

session ses_d898d532bb34888397cf577e6058e30a90365da06f958b7f1f7b3fe639cca692

## Answer

**Conclusion.** A strong reviewer also checks *how* a change was made. Five things to check: (1) each commit does one logical thing, can be bisected, and is small enough to review; (2) the history of the touched lines and files, used as risk evidence; (3) whether the result is still correct on the *current* base, not only the base it was tested on; (4) whether the author and approvals are real and attributable; (5) whether the diff contains only what it claims to. This repository already gates most of (5) and part of (3) with automation. It does not check (1) or (4), and only partly covers (2).

**What a reviewer checks, with the primary source behind each:**

1. **Structure**
   - One logical change per commit. Each patch in a series must build and run, because `git bisect` can stop at any of them (read: kernel submitting-patches, "Separate your changes").
   - Code that is moved must not also be modified in the same patch (read: kernel).
   - Fixes carry `Fixes: <12-char sha> ("subject")`, and messages explain *why*, in the imperative mood (read: kernel).
   - Size: about 100 lines is reasonable and 1000 is usually too large. Spread across files counts toward size. Refactors go in a separate CL from behavior changes. Stacking is the endorsed way to split work without blocking (read: Google eng-practices, small CLs).
   - Conventional Commits: if a commit fits more than one type, split it (read: conventionalcommits.org).
   - Why tangling matters: up to 15% of bug fixes in five Java projects were tangled, which corrupts history-based analysis (read: Herzig & Zeller, MSR 2013).
   - How to detect tangling (inferred): the message needs "and", a refactor and a behavior change are mixed, or one commit touches unrelated modules. Split with `git add -p` and `git rebase -i`, then confirm each step builds.
2. **History as evidence**
   - Diffuse ownership and many low-expertise contributors correlate with pre-release faults and post-release failures (read: Bird et al., FSE 2011).
   - So a reviewer should (inferred):
     - run `git log --follow` and `git blame -w -C` on the touched lines;
     - use `git log -S`/`-G` to find when a symbol appeared;
     - look for earlier reverts of the same area;
     - ask for a stronger review where a file has high churn and many authors.
3. **Merge mechanics**
   - A merge queue re-tests each PR "applied to the latest version of the target branch and any pull requests already in the queue". Its checks need the `merge_group` trigger (read: GitHub docs).
   - "Green" only means something for the exact base+head pair that was tested (inferred). That is the "rerun at old head" trap, and it is how semantic conflicts that compile still land.
   - Review the conflict resolution itself (`git show --remerge-diff` on the merge). Backports should be `cherry-pick -x` with the `Fixes:` lineage (inferred).
4. **Integrity and provenance**
   - With gitsign, `git verify-commit` "only verif[ies] cryptographic integrity … but not who". Identity has to be checked with `gitsign verify --certificate-identity` (read: gitsign README).
   - For a leaked secret, revoke or rotate it first. Rewriting history needs branch protection lifted, breaks commit signatures, and still leaves copies in forks and clones (read: GitHub docs).
5. **Scope discipline.** Check for unrelated edits, hand-edited generated files, lockfile drift, vendored code, and changes that are only whitespace or formatting (section below).

**What this repo already guards**
- `guards.yml` runs on every PR. It judges the change with the *base branch's* copy of the engine, so a PR cannot edit its own judge (read: .github/workflows/guards.yml:3-4, 44-53).
- `protected-paths` is a gate on AGENTS.md, CODEOWNERS, godfile-waivers, spawn-allowlist and script/guards/** (read: script/guards/rules/protected-paths.toml:1-14).
- `lockfile-stale`: a dependency changed in package.json without a lockfile change fails the gate (read: script/guards/rules/lockfile-stale.toml:1-12).
- `merge-outside-conveyor`: only `board/queue.ts` may merge (read: script/guards/rules/merge-outside-conveyor.toml:1-9).
- The queue dissolves a bundle when a member's head moved after assembly or when the base moved, then rebuilds and retests. This is the repo's defense against the old-head trap (read: packages/core/src/board/queue-settle.ts:245-261).
- Leftovers and silencing:
  - `conflict-markers`, which also reads generated files (read: script/guards/rules/conflict-markers.toml:1-9);
  - `hook-bypass` (read: script/guards/rules/hook-bypass.toml:1-7);
  - `migration-edited`: shipped migrations are immutable (read: script/guards/rules/migration-edited.toml:1-8).
- Other rules in the set of 78 include `secret-token`, `private-key`, `env-file`, `binary-added`, `large-file`, `submodule-added`, `os-junk` and `gha-unpinned-uses` (read: script/guards/rules/*.toml id list).
- Generated code is regenerated and diffed in CI (`check:generated`), alongside the godfile and spawn-import gates (read: .github/workflows/test.yml:289-320; packages/client/package.json:14).

**Gaps, inferred from absence:**
- No commit-signing or verified-author check.
- No lint for commit or PR titles (the convention lives only in AGENTS.md).
- No root CODEOWNERS (only modules/atlas/.github/CODEOWNERS).
- No tangled-change or size heuristic.
- `git diff --check` runs only in distribution-bundle.yml.
- `guards.yml` has no `merge_group` trigger, because the repo uses its own queue instead.

**Not examined:**
- GitHub branch rulesets and force-push settings. They live in repo settings, not the tree, and need `gh api repos/:o/:r/rulesets` to check.
- The bodies of the git-log/bisect/cherry-pick man pages and the stacked-diff tool docs (Graphite, ghstack, Sapling, jj) were not captured. The claims about them above are inferred.
- The absence searches had incomplete coverage.

Reproduce the guard set: `bun run check:guards --base origin/dev`.

## Claims

[
 {
  "proposition": "Kernel rules: separate each logical change into its own patch, and the tree must build and run after each patch so git bisect works.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_a4175efe0635e152109fc79b9b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d55f8b8cfc4485eb815249a000",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "ae645c963b2eb191930230400b00fc53644aca0845bc4cde46253d22ea54ae9f"
    },
    "quote": "take special care to ensure that the kernel builds and runs properly after each patch in the series"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d55f8b8cfc4485eb815249a000",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "ae645c963b2eb191930230400b00fc53644aca0845bc4cde46253d22ea54ae9f"
    },
    "quote": "you should not modify the moved code at all in the same patch which moves it"
   }
  ]
 },
 {
  "proposition": "Google eng-practices treats about 100 lines as reasonable and 1000 as usually too large, separates refactorings from behavior changes, and endorses stacking.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_a4175efe0635e152109fc79b9b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_9183e85ba7dd4b1099935416fd",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "ead5878d760c5c99b54fd889765bb9f772b61666830a6d57807df640e0cbbadf"
    },
    "quote": "100 lines is usually a reasonable size for a CL, and 1000 lines is usually too large"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_9183e85ba7dd4b1099935416fd",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "ead5878d760c5c99b54fd889765bb9f772b61666830a6d57807df640e0cbbadf"
    },
    "quote": "Stacking Multiple Changes on Top of Each Other"
   }
  ]
 },
 {
  "proposition": "Conventional Commits says to split a commit that fits more than one type.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_a4175efe0635e152109fc79b9b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b3be3505803f643cc0e7ec9ea6",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "a9814643dc5543c177d2be691776fbb38f35df4856e48884b78f06ea1ff88c2d"
    },
    "quote": "Go back and make multiple commits whenever possible."
   }
  ]
 },
 {
  "proposition": "Herzig & Zeller found up to 15% of bug fixes were tangled changes, which biases history-based analysis.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_a4175efe0635e152109fc79b9b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_e95b14d590d95df62f65b25aeb",
      "revision": 1
     },
     "representation": "text",
     "digest": "4a25bbd05c20f70708edde0cff4f2da1bf2d03657d7b7668487a9f5756a28b19"
    },
    "quote": "we found up to 15% of all bug fixes to consist of multiple tangled changes"
   }
  ]
 },
 {
  "proposition": "Ownership measures (low-expertise contributors, top-owner share) relate to pre- and post-release defects, so ownership and churn are valid review risk signals.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_33750ee16f74dfff73e3a4c707",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7a306e86fcbc1ec517aa352b5a",
      "revision": 1
     },
     "representation": "text",
     "digest": "5a3b89e7c540ec9e5980c3c66ff5a730ce6dd81d83085e15f862e90b7040a2db"
    },
    "quote": "the proportion of ownership for the top owner have a relationship with both pre-release faults and post-release failures"
   }
  ]
 },
 {
  "proposition": "Kernel ties history archaeology to review: a Fixes: tag names the commit that introduced a bug, e.g. one found with git bisect.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_33750ee16f74dfff73e3a4c707",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d55f8b8cfc4485eb815249a000",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "ae645c963b2eb191930230400b00fc53644aca0845bc4cde46253d22ea54ae9f"
    },
    "quote": "you found an issue using `git bisect`"
   }
  ]
 },
 {
  "proposition": "A merge queue re-tests each PR on the latest base plus the PRs ahead of it, and Actions checks need a separate merge_group trigger.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_d0e4d185585698fac5788cb98a",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c977e2a6c4410f1a65a9a7fe43",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "dfc305acbe9b417bd0b4ff504a5efb90b4a3d7e93137bc4436283d806e4043af"
    },
    "quote": "The merge queue will ensure the pull request's changes pass all required status checks when applied to the latest version of the target branch and any pull requests already in the queue."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c977e2a6c4410f1a65a9a7fe43",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "dfc305acbe9b417bd0b4ff504a5efb90b4a3d7e93137bc4436283d806e4043af"
    },
    "quote": "is separate from the `pull_request` and `push` events"
   }
  ]
 },
 {
  "proposition": "The repo's queue dissolves a bundle when a member head moved after assembly or when the base moved, so a stale green cannot land.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_d0e4d185585698fac5788cb98a",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b537bedd20f5b6ae116c6f0bde",
      "revision": 1
     },
     "representation": "text",
     "digest": "d576fed02e1026dfae19af672ca79bfecfffe82ae3754ecc230c1c7a6e22562a"
    },
    "lines": {
     "start": 245,
     "end": 261
    }
   }
  ]
 },
 {
  "proposition": "git verify-commit on gitsign signatures checks integrity but not signer identity; gitsign verify with an expected identity is needed.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_9cbd651b29d9522c7822f28906",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_253cbd1954c841cabc6aaaf73e",
      "revision": 1
     },
     "representation": "text",
     "digest": "7af48611229748609fd17ca3d2e05289efc196d3f2d217eff54d1da23fbe6ac4"
    },
    "quote": "only verify cryptographic integrity and that the data exists on Rekor, but not"
   }
  ]
 },
 {
  "proposition": "For a leaked secret GitHub says to revoke or rotate first; rewriting history needs branch protection lifted and drops commit and tag signatures.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_9cbd651b29d9522c7822f28906",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_9e31effb1c159b8f7e10c7603f",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "017abe343d5db3489313e5776794cce4904d5548d93c93c2baba0c1ed7cc1e16"
    },
    "quote": "then as a first step you need to revoke and/or rotate that secret"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_9e31effb1c159b8f7e10c7603f",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "017abe343d5db3489313e5776794cce4904d5548d93c93c2baba0c1ed7cc1e16"
    },
    "quote": "Lost signatures on commits and tags"
   }
  ]
 },
 {
  "proposition": "guards.yml runs on every PR using the base branch's copy of the guard engine, so a PR cannot edit its own judge.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_958a117d5bee3c2ca88d60d852",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c9d0aa1141c3a5ee4f7a7b03be",
      "revision": 1
     },
     "representation": "text",
     "digest": "7b24ac8a20405031afd6939a496ae0a3cf186eefd355f5db76a94596478dc7a5"
    },
    "lines": {
     "start": 44,
     "end": 53
    }
   }
  ]
 },
 {
  "proposition": "Gate rules cover protected rule files, lockfile drift, merges outside the queue, conflict markers (including in generated files), hook bypass and edited shipped migrations.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_958a117d5bee3c2ca88d60d852",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a8787d35986b9b2aab7594faf8",
      "revision": 1
     },
     "representation": "text",
     "digest": "bcbcfc0e480f91a55bca51ca13c69816b35c105227f253a3a5375d44977817d1"
    },
    "lines": {
     "start": 1,
     "end": 14
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7f8fc06111504d04f64cb162f3",
      "revision": 1
     },
     "representation": "text",
     "digest": "822554296e7d886bf24261e4e7075a66d5cb14c59a20a59a86cef643ec3d9f26"
    },
    "lines": {
     "start": 1,
     "end": 12
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_215245531b33ca302e5becceb5",
      "revision": 1
     },
     "representation": "text",
     "digest": "ba014bd78bebb9c135c992ae20ecef7dd7b7e7460233c5a239c44257bc8f4c89"
    },
    "lines": {
     "start": 1,
     "end": 9
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f430636ee75f413dd5de8310f5",
      "revision": 1
     },
     "representation": "text",
     "digest": "c46334fa1e21fa0093e84985501bf570fba91acb4fe69d50f613051089fae409"
    },
    "lines": {
     "start": 1,
     "end": 9
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_bfa7c4f613d3b70658d7f4af8a",
      "revision": 1
     },
     "representation": "text",
     "digest": "eacf229b1df233e2739e6a4c7dfc669597a445a72506b8d45b708daa4a9fa801"
    },
    "lines": {
     "start": 1,
     "end": 7
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_24890b8a0b8b036733a076e948",
      "revision": 1
     },
     "representation": "text",
     "digest": "a01dea8cd98fd87d7d956ed846b916ee8753d42ece394d30830e96e04bc9a6df"
    },
    "lines": {
     "start": 1,
     "end": 8
    }
   }
  ]
 },
 {
  "proposition": "Secret rules (secret-token, private-key, env-file) and hygiene rules (binary-added, large-file, submodule-added, os-junk) exist among the 78 guard rules.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_958a117d5bee3c2ca88d60d852",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_5853c44b268ca9725d61abeb53",
      "revision": 1
     },
     "representation": "text",
     "digest": "69cd77200a6cd93a2bee1dc742dbfdef385e58ad29f8e28bcb091fdd262420c7"
    },
    "quote": "script/guards/rules/private-key.toml:1: id = \"private-key\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_5853c44b268ca9725d61abeb53",
      "revision": 1
     },
     "representation": "text",
     "digest": "69cd77200a6cd93a2bee1dc742dbfdef385e58ad29f8e28bcb091fdd262420c7"
    },
    "quote": "script/guards/rules/secret-token.toml:1: id = \"secret-token\""
   }
  ]
 },
 {
  "proposition": "CI regenerates generated code and fails on a diff, and runs the godfile and spawn-import gates.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_958a117d5bee3c2ca88d60d852",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_ca120e1b7caed9683a7a6c5324",
      "revision": 1
     },
     "representation": "text",
     "digest": "35e89ee71c63d52fa0100ada76f6e790afbd0254cb01e966fa535159befbbfab"
    },
    "lines": {
     "start": 289,
     "end": 320
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f026051de608e66208edc56d67",
      "revision": 1
     },
     "representation": "text",
     "digest": "17e7d776b32730030c586e7470f929037a9b3a30ae8113661b5864003864beb7"
    },
    "lines": {
     "start": 14,
     "end": 14
    }
   }
  ]
 },
 {
  "proposition": "No commit-signing or PR-title lint was found in .github or script, git diff --check appears only in distribution-bundle.yml, and the only CODEOWNERS found is under modules/atlas; these look unguarded.",
  "nature": "inference",
  "subquestion": {
   "id": "rque_2eba777f71b6c7c67293939560",
   "revision": 1
  },
  "conditions": [
   "searches had coverage.complete=false; GitHub repo settings (rulesets, required signatures) were not inspected"
  ],
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_dbf5cbaa91b0f3b64dd78db8d7",
      "revision": 1
     },
     "representation": "text",
     "digest": "3abf5d7a8e7f26cc4009558b1e7845ee156f66391a037781b64373678c2bbe83"
    },
    "quote": ".github/workflows/distribution-bundle.yml:37:       - run: git diff --check origin/dev HEAD"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c509217a70cfea6801e6c54bde",
      "revision": 1
     },
     "representation": "text",
     "digest": "da34d13ad284eb8c33a0fdeff8af8fd744feeffc673c6420f97a37fc1a942b2e"
    },
    "quote": "modules/atlas/.github/CODEOWNERS:1: # Atlas — code owners for the ADMIN-OWNED governance surface."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c9d0aa1141c3a5ee4f7a7b03be",
      "revision": 1
     },
     "representation": "text",
     "digest": "7b24ac8a20405031afd6939a496ae0a3cf186eefd355f5db76a94596478dc7a5"
    },
    "lines": {
     "start": 5,
     "end": 7
    }
   }
  ]
 }
]
