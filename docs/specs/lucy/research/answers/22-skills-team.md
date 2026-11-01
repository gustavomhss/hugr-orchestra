# 22-skills-team

session ses_fdea57208bd4893feac8ed6373b7f75c5fe27627b49806245eb89c1e7c528387

## Answer

Lucy already exists, but only as a charter: it has a review profile, `skills: []`, and no `workResult`. Its real integration point is the governed chain, not the generic `task` card. `maestro_request_review` creates the `lucy` child session itself, and lucy must call `maestro_record_review` exactly once. The host then enforces the verdict rules and checks the receipt again at settlement. A rebuilt lucy adds a skill tree at `packages/lucy-specialist/skills/lucy-*`, which ships. Its maintenance, ownership and usage knowledge goes in `.orchestra/skills`, which stays in the repo.

One premise correction: there is no `script/seat-skills.ts`. Embedding is done by modules/maestro/coordination/src/seat-skills-module.ts:9-37, which apps/cli/script/build.ts:48 calls.

**(1) Seat skills**
- read: `seat.skills` holds the root skills. Each root lives under `skillSource(id)`, or under `sharedSource()` for a `team-*` root (modules/maestro/coordination/src/seats/seat.ts:27). Every name must be scoped to the seat (modules/maestro/coordination/src/seats/seat.ts:74-76).
- read: `skillSource` maps backend and archie to `modules/specialists/<id>/skills` and every other seat, lucy included, to `packages/<id>-specialist/skills`. The shared tree is `modules/specialists/team/skills` (modules/maestro/coordination/src/seats/seat.ts:93-102).
- read: modules/maestro/coordination/src/roster.ts:110-142 grants permissions. The `skill` rule denies `*` and allows `<name>` and `<name>-*` for each declared root. `external_directory` allows the seat's own root, plus the shared root when the seat declares a `team-*` skill.
- read: build and load.
  - `seatSkillsModule` embeds each seat tree, the `team` tree once, and the `maestro` playbooks.
  - `SeatSkillRoot` extracts them to the cache in compiled builds, or reads the folders in place from source (modules/maestro/coordination/src/seat-skill-root.ts:36-65).
  - `Seats.shared()` collects the declared `team-*` roots (modules/maestro/coordination/src/seats/index.ts:37-40).
- read: `SeatSkillContent.validate` enforces the tree layout (modules/maestro/coordination/src/seat-skill-content.ts:46-117):
  - a node is a directory with a `SKILL.md`, and its `name` must equal its path joined with `-`;
  - the roots must equal the declared skills;
  - depth is at most 4 and each node has at most 10 children;
  - every node below a root needs `when` and `not-when`;
  - a leaf may have a `references/` folder, and links stay inside their node.
- read: the trees as they stand:
  - jimmy has two flat roots, `jimmy-calibration` and `jimmy-web-research`;
  - archie has nested children, for example `archie-plan-briefs`;
  - backend declares 7 own roots plus `team-stack` (modules/maestro/coordination/src/seats/backend.ts:26-35).
- read: tests that pin this:
  - modules/maestro/coordination/test/seat-framework.test.ts:13-50 pins definitions, prompts, root directories and frontmatter names;
  - the gate for tree changes is in .orchestra/skills/seat-skill-tree-maintenance/SKILL.md:44-45.

**(2) Playbooks**
- read: the playbook inventory is fixed at 5 roots and 7 sub-files, including `maestro-repo/maintenance/reviewer-brief` and `maestro-run/verify/review-checks`, and validated the same way (modules/maestro/coordination/src/playbook-content.ts:5-23).
- read: "A cold review" is routed to `lucy`, or to `explore` when lucy cannot be dispatched (modules/maestro/coordination/playbooks/maestro-orchestra/SKILL.md:51).
- read: the governed playbook sets these requirements:
  - lucy's plan-stage review judges the plan, its workflow and the committed diff, never prose;
  - `routedMemberID` is never `lucy`;
  - a receipt is `APPROVE`, `FIX_FIRST` or `REJECT` plus an `evt_maestro_review_` id; `LUCY_ERROR` and `LUCY_NO_RECEIPT` mean there is none (modules/maestro/coordination/playbooks/maestro-run/governed/SKILL.md:50-55);
  - the code stage reviews the workers' uncommitted tree (modules/maestro/coordination/playbooks/maestro-run/governed/SKILL.md:71-84).
- read: the review briefs:
  - the cold coverage review returns `covers|gaps_found|unknown` (modules/maestro/coordination/playbooks/maestro-plan/SKILL.md:19-36);
  - the reviewer brief defines no new team role. It gives the reviewer the diff and spec, never the author transcript, and returns `approve|request_changes|reject|unknown` (modules/maestro/coordination/playbooks/maestro-repo/maintenance/reviewer-brief/SKILL.md:9-29).
- The playbook search found no file that names billy, frankie, patty or rosie.

**(3) Team protocol**
- read: route grants expose role, abilityClass, returnCard and forbiddenActions, and hold on `maestro` (modules/maestro/coordination/src/route-grant.ts:9-22).
- read: a `workResult` is assembled for backend, archie (upstream, parsed separately) and jimmy (discovery) (modules/maestro/coordination/src/v2/governance.ts:293-345). The card is parsed by the `returnCard` tag (modules/maestro/coordination/src/v2/governance/work-result.ts:56-90). Lucy declares no `workResult`, so a plain `task` to lucy returns text.
- read: how lucy gets an assignment:
  - `maestro_request_review` creates the child with `agent: lucy` and prompts it with the card, the plan JSON, the artifact, the diff and the checks. The prompt says it MUST call `maestro_record_review` once (modules/maestro/coordination/src/v2/tools/review.ts:233-271).
  - The verdict is returned and also written to the board thread with author `lucy` (modules/maestro/coordination/src/v2/tools/review.ts:287-308).
  - The record tool is gated to lucy (modules/maestro/coordination/src/v2/tools/review.ts:312-318), and its visibility owner is lucy (modules/maestro/coordination/src/v2/seats.ts:212).
- read: the other seats all have `skills: []`:
  - billy, security review (modules/maestro/coordination/src/seats/billy.ts:4-18);
  - frankie, process audit (modules/maestro/coordination/src/seats/frankie.ts:4-18);
  - patty, frontend execution (modules/maestro/coordination/src/seats/patty.ts:4-18);
  - rosie, documentation (modules/maestro/coordination/src/seats/rosie.ts:4-18).
  The seat table in .orchestra/skills/maestro-ownership/SKILL.md:34-48 marks them as charters. No code relates them to lucy.

**(4) Governance records**
- read: `recordReview` rejects a review when:
  - the routed member is lucy (`self-review`);
  - the card or the context does not match;
  - an `APPROVE` carries findings, or a non-APPROVE has none;
  - the check evidence is not exactly the validation's checks.
  It stamps `actor` and `reviewerID` as lucy (modules/maestro/coordination/src/v2/tools/review-records.ts:265-340).
- read: settlement holds with `WORKFLOW_COLD_REVIEW_MISSING` or `WORKFLOW_COLD_REVIEW_STALE` unless the lucy APPROVE receipt binds to the validation and the diff digest matches. The code stage needs its own receipt per result tree (modules/maestro/coordination/src/v2/workflow/settlement.ts:179-272).
- read: authorization records `reviewerID: "lucy"` (modules/maestro/coordination/src/v2/tools/approval.ts:558-560).
- read: `contextIsCurrent` re-hashes the git evidence (modules/maestro/coordination/src/v2/governance/evidence.ts:59-62).
- inferred: the importer search turned up no runtime importer for modules/maestro/coordination/src/lifecycle-fold.ts or modules/maestro/coordination/src/verification-plan.ts:38, so neither is enforced on a reviewer today.

**(5) Repo versus ship**
- read: AGENTS.md:150-153. Seat prompts, `seat.skills` trees and playbooks ship. `.orchestra/skills/*` stays in the repo. Runtime knowledge must live in a prompt or a shipped seat skill. A maintenance or ownership skill is never added to `seat.skills`.

Not examined: the Claude-mode host path for lucy, the app-shell governance UI, and `docs/specs`. I left them out to stay on the code that decides behavior.

Reproduce the static facts with `rg -n 'skills:' modules/maestro/coordination/src/seats` and `rg -n 'maestro_record_review' modules/maestro/coordination/src/v2`.

## Claims

[
 {
  "subquestion": {
   "id": "rque_2d32c56fa0fc18776de84c3cc8",
   "revision": 1
  },
  "proposition": "Seat skill roots live under skillSource(id) (packages/<id>-specialist/skills for seats other than backend and archie) or sharedSource() for team-* roots, and must be seat-scoped.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_40ea472efd0f9891aca3d471bf",
      "revision": 1
     },
     "representation": "text",
     "digest": "623af3bece7217333706d632b6bcbbfde975cd6ae09a25e3fb5a8cd4c652f675"
    },
    "lines": {
     "start": 93,
     "end": 102
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_40ea472efd0f9891aca3d471bf",
      "revision": 1
     },
     "representation": "text",
     "digest": "623af3bece7217333706d632b6bcbbfde975cd6ae09a25e3fb5a8cd4c652f675"
    },
    "lines": {
     "start": 27,
     "end": 28
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_40ea472efd0f9891aca3d471bf",
      "revision": 1
     },
     "representation": "text",
     "digest": "623af3bece7217333706d632b6bcbbfde975cd6ae09a25e3fb5a8cd4c652f675"
    },
    "lines": {
     "start": 74,
     "end": 76
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_2d32c56fa0fc18776de84c3cc8",
   "revision": 1
  },
  "proposition": "roster.ts grants skill permission <name> and <name>-* per declared root (deny *), and external_directory on the seat root plus the shared root when a team-* skill is declared.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_2befedc29ad36c40ae1632d2d2",
      "revision": 1
     },
     "representation": "text",
     "digest": "b947f7618786b6442fe61b80852d74c46245444b08b550c853dd64b4f8640751"
    },
    "lines": {
     "start": 110,
     "end": 142
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_2d32c56fa0fc18776de84c3cc8",
   "revision": 1
  },
  "proposition": "Embedding is done by seat-skills-module.ts (seat trees, team tree once, maestro playbooks), called from apps/cli/script/build.ts; SeatSkillRoot extracts or reads in place.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_e34cb02a53a56089dcb8954b31",
      "revision": 1
     },
     "representation": "text",
     "digest": "f468d2d52a9d5c7007dd938ad7d41fe9f9b312637c2ba173f1a447de4ab88d11"
    },
    "lines": {
     "start": 9,
     "end": 37
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f185f87a7c40be075207ba4c3e",
      "revision": 1
     },
     "representation": "text",
     "digest": "ce382e3b3bcfbfc4b124f8aab6636aa752742ef04cdc28fefbb77bf1e9d7cd3c"
    },
    "lines": {
     "start": 46,
     "end": 49
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_dd7aa309d3c636db0b28b5a3de",
      "revision": 1
     },
     "representation": "text",
     "digest": "8b058ab2613de32ba406943cdd982cfa1c55c3fb8e4c39fae2268af6606da58c"
    },
    "lines": {
     "start": 36,
     "end": 65
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f8e5909e4382823100b0f22628",
      "revision": 1
     },
     "representation": "text",
     "digest": "b5043861052ae6fc61258518d09cbb53343f6e153e90b5adc638f421f69637e9"
    },
    "lines": {
     "start": 37,
     "end": 40
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_2d32c56fa0fc18776de84c3cc8",
   "revision": 1
  },
  "proposition": "SeatSkillContent.validate checks node shape: name equals path joined by -, roots equal declared skills, depth at most 4, at most 10 children, when/not-when below roots, references folders on leaves, links scoped to their node.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_82630f9057ae2a40743a2725ff",
      "revision": 1
     },
     "representation": "text",
     "digest": "7aaebead2a68c47dd89f2e86541d53114039d5a1b38cb00ec6c455827fcb087f"
    },
    "lines": {
     "start": 46,
     "end": 117
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_2d32c56fa0fc18776de84c3cc8",
   "revision": 1
  },
  "proposition": "lucy has a review profile, skills [] and no workResult; backend declares team-stack; seat-framework.test pins definitions and skill frontmatter; the repo maintenance skill names the gate.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_89545b0c43dab0e53d3a836e06",
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
      "id": "cart_0841c1bdd7f2ef2d238741a76b",
      "revision": 1
     },
     "representation": "text",
     "digest": "6414e3330a80a2d41c62fdcdd6cdf4837042d0d72883d7e769c349cdc4cbd903"
    },
    "lines": {
     "start": 26,
     "end": 35
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_af18977e12687154304ba02eaf",
      "revision": 1
     },
     "representation": "text",
     "digest": "0617af85731b6e5331a390abda7af4bb438648832ba1eceae4e3bc9d97ecc9c1"
    },
    "lines": {
     "start": 13,
     "end": 50
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_8fb7491638a3762321d327fffd",
      "revision": 1
     },
     "representation": "text",
     "digest": "7d7b0886016678c16138339e95ebebaa1d24c2944aaf6d3a395f6b7cffda4adb"
    },
    "lines": {
     "start": 44,
     "end": 45
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_21e057055eedd9a44b84a165c8",
   "revision": 1
  },
  "proposition": "PlaybookContent fixes the playbook inventory and validates it; maestro-orchestra routes cold review to lucy, or explore when lucy cannot be dispatched.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a9dd4e569e9ff63d8d587bec4f",
      "revision": 1
     },
     "representation": "text",
     "digest": "f2dae7821b188df7e9d4084ee6bf040eba0117cc6a3b7172139bb080daa57299"
    },
    "lines": {
     "start": 5,
     "end": 23
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d01759e4b669c3bff5e5ec66c4",
      "revision": 1
     },
     "representation": "text",
     "digest": "9727de9bc099b40b491c562299cab101851feb930de9a7087b3b646e90530b4e"
    },
    "lines": {
     "start": 51,
     "end": 51
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_21e057055eedd9a44b84a165c8",
   "revision": 1
  },
  "proposition": "maestro-run-governed requires lucy's plan-stage review with receipts APPROVE/FIX_FIRST/REJECT plus an evt_maestro_review_ id, and a code-stage review; reviewer-brief and maestro-plan define cold briefs without author transcript.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_6e0a6914b04d8521ec3e6c363d",
      "revision": 1
     },
     "representation": "text",
     "digest": "4e29ad3fd6e0791d83e8edd89721516a5f6082be5aef799b946378b6cf15b9ef"
    },
    "lines": {
     "start": 50,
     "end": 55
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6e0a6914b04d8521ec3e6c363d",
      "revision": 1
     },
     "representation": "text",
     "digest": "4e29ad3fd6e0791d83e8edd89721516a5f6082be5aef799b946378b6cf15b9ef"
    },
    "lines": {
     "start": 71,
     "end": 84
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6a7fe86c396ccabebd29bc1731",
      "revision": 1
     },
     "representation": "text",
     "digest": "db22f2884ec34811c4099fb2d4ceb2dd2282fb2c2d91f5d60d69bc7943e326fb"
    },
    "lines": {
     "start": 9,
     "end": 29
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_db206b0cc158d1351edb7ff472",
      "revision": 1
     },
     "representation": "text",
     "digest": "d59f726af673d25d7939a9c4caa983459e2f9ac75d0f655e5a8c51b05002cf6d"
    },
    "lines": {
     "start": 19,
     "end": 36
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_4c2c9eb8e7fef4f53c10825b9c",
   "revision": 1
  },
  "proposition": "maestro_request_review creates the lucy child, prompts it with card, plan, artifact, diff and checks, and requires one maestro_record_review call; the record tool is gated to lucy and its visibility owner is lucy.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_238942ea2c56faf576a16fc9ff",
      "revision": 1
     },
     "representation": "text",
     "digest": "9497714cb65a83d4bdc0b001aec68480eaaf9864350f27c95297a8c60b0518a8"
    },
    "lines": {
     "start": 233,
     "end": 271
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_238942ea2c56faf576a16fc9ff",
      "revision": 1
     },
     "representation": "text",
     "digest": "9497714cb65a83d4bdc0b001aec68480eaaf9864350f27c95297a8c60b0518a8"
    },
    "lines": {
     "start": 287,
     "end": 318
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_139ee42267bc2b5155458b1f1d",
      "revision": 1
     },
     "representation": "text",
     "digest": "d54d556e95b068006c9961b9b8057e87a6b3556ca34580ae58bae489c2990c86"
    },
    "lines": {
     "start": 212,
     "end": 212
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_4c2c9eb8e7fef4f53c10825b9c",
   "revision": 1
  },
  "proposition": "Task settlement assembles a workResult for seats that declare a workResult schema (upstream parsed separately, discovery from inquiry); route grants expose role, returnCard and forbiddenActions.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c1be8a5abaa50a2887cc64c662",
      "revision": 1
     },
     "representation": "text",
     "digest": "7b87efa642d74d0f17ce1993d80afb0b6aebff0a77d93c71558942aa5e917161"
    },
    "lines": {
     "start": 293,
     "end": 345
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c062a6070c3317f20bcf6e0062",
      "revision": 1
     },
     "representation": "text",
     "digest": "9b7c4f0c29df8e88e24028d10bf4030f598e0815b17150c14d469c0bed2d4f31"
    },
    "lines": {
     "start": 56,
     "end": 90
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_710512dfb580865f0b15a3195d",
      "revision": 1
     },
     "representation": "text",
     "digest": "a536da9785f6912aa3e27011edeffa5c4e744822f97d1017c5ec7439557a4f39"
    },
    "lines": {
     "start": 9,
     "end": 22
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_4c2c9eb8e7fef4f53c10825b9c",
   "revision": 1
  },
  "proposition": "billy (security review), frankie (process audit), patty (frontend execution) and rosie (docs) each declare skills [] and are listed as charters in maestro-ownership.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_88e64cba4a0eed4554f57504a9",
      "revision": 1
     },
     "representation": "text",
     "digest": "568f168b9fc3de712bcfea2312342f7945c61359c5c51036287ffc5c46821b9c"
    },
    "lines": {
     "start": 4,
     "end": 18
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_2c27267943d96d95f11edb874c",
      "revision": 1
     },
     "representation": "text",
     "digest": "3a62105d69d98d889ea29bf6a192f7b2e5017c9e41c369404e0d40e0a23779ad"
    },
    "lines": {
     "start": 4,
     "end": 18
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_db5784dbd7cc776517566c519b",
      "revision": 1
     },
     "representation": "text",
     "digest": "fa3072acf28c98d70d65742ac604fcd85686d73fac3b466291f4a3af8b167bec"
    },
    "lines": {
     "start": 4,
     "end": 18
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_89daf077778c52349b02bfeb5b",
      "revision": 1
     },
     "representation": "text",
     "digest": "db31061b571d6a450c9af71f4dc5a6715070b4f9092a2df9a414509817307834"
    },
    "lines": {
     "start": 4,
     "end": 18
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_77a9065ce8dd3a74910f79ebca",
      "revision": 1
     },
     "representation": "text",
     "digest": "a22b47abe6f2734c05b691cb007e58a335807405dcae18aa3ae07c75a1bc3d03"
    },
    "lines": {
     "start": 34,
     "end": 48
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_af6522c14b18f46f3d2ca82fe5",
   "revision": 1
  },
  "proposition": "recordReview refuses self-review, card or context mismatch, APPROVE with findings, non-APPROVE without findings and mismatched check evidence, and stamps the lucy actor; settlement holds without a bound lucy APPROVE receipt and a per-tree code receipt; authorization stamps reviewerID lucy; contextIsCurrent re-hashes git evidence.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_28fcad994ac8d8624b89cb18d6",
      "revision": 1
     },
     "representation": "text",
     "digest": "d5152af557b6dd3aaed47b9a9f45c7c63a989267f03a6eef8b72c9244500aa5d"
    },
    "lines": {
     "start": 265,
     "end": 340
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_669687c26e47793aec93e9dfc7",
      "revision": 1
     },
     "representation": "text",
     "digest": "db302675e05c1723d6cbbfd6720d3479e55265f218cb3d09016c5a92e8e0394e"
    },
    "lines": {
     "start": 179,
     "end": 272
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_def3b81340038f6e9b0470210e",
      "revision": 1
     },
     "representation": "text",
     "digest": "64353d72d1298432109d61a38adb9fc1311ed9330a0a87ad4b9777069ad98fab"
    },
    "lines": {
     "start": 558,
     "end": 560
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_4836ecc484ad74af31f4649528",
      "revision": 1
     },
     "representation": "text",
     "digest": "b95817da981f01e8000b822c2df6e3ff5726450c87f52df1ea14465e0072e124"
    },
    "lines": {
     "start": 59,
     "end": 62
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_af6522c14b18f46f3d2ca82fe5",
   "revision": 1
  },
  "proposition": "The importer search found no runtime importer of lifecycle-fold.ts or compileVerificationPlan besides their own files, so they are not enforced on a reviewer today.",
  "nature": "inference",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_9e4f61fb2f5f3af08011938e57",
      "revision": 1
     },
     "representation": "text",
     "digest": "0d963f6e817239246c306660e21108a359561e7f64bf37ea6a24261406477571"
    },
    "quote": "modules/maestro/coordination/src/lifecycle-fold.ts:137: export * as MaestroLifecycleFold from \"./lifecycle-fold\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7a2b885178fb5411f981323f7b",
      "revision": 1
     },
     "representation": "text",
     "digest": "b7c4f2b0d0ba4ddb700d11da2101663edf5077fcd00a3d50fb139fe030e5798d"
    },
    "lines": {
     "start": 38,
     "end": 38
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_cf978288586cc7361078eba3f9",
      "revision": 1
     },
     "representation": "text",
     "digest": "a8e8cf9c42848a13bedf3c7a23b1da2efe320f1a40be980572c307004c28d7bc"
    },
    "lines": {
     "start": 39,
     "end": 40
    }
   }
  ],
  "conditions": [
   "code_search for lifecycle-fold|verification-plan\"|compileVerificationPlan over modules and packages src, tests excluded, coverage complete"
  ]
 },
 {
  "subquestion": {
   "id": "rque_8b86955a3d7857064a1613395c",
   "revision": 1
  },
  "proposition": "AGENTS.md ships seat prompts, seat.skills trees and playbooks; .orchestra/skills is repo-only and maintenance/ownership skills never join seat.skills; seat-skill-tree-maintenance documents tree locations and rules.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_5e97fb955dbee5d9f972fe557d",
      "revision": 1
     },
     "representation": "text",
     "digest": "0fb7a2e8326c0faf3f70615c914877c7feb808756a9072505c4b9fef1d01be07"
    },
    "lines": {
     "start": 150,
     "end": 153
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_8fb7491638a3762321d327fffd",
      "revision": 1
     },
     "representation": "text",
     "digest": "7d7b0886016678c16138339e95ebebaa1d24c2944aaf6d3a395f6b7cffda4adb"
    },
    "lines": {
     "start": 10,
     "end": 36
    }
   }
  ]
 }
]
