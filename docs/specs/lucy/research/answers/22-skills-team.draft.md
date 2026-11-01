# 22-skills-team (DRAFT: close refused, claims not checked)

session ses_f49e755434c07a35f7677e29710caf097e0cf5bcb41638501a89c1b7ca04a54d

## Answer

**Conclusion.** A rebuilt `lucy` plugs into a seat framework that already exists: a `define()` seat file plus its charter, a skill tree at `packages/lucy-specialist/skills` (no such tree exists today), and permissions that `roster.ts` derives from `seat.skills`. The cold review itself is fully host-enforced. `maestro_request_review` creates a `lucy` child Session with a fixed prompt, only `lucy` may call `maestro_record_review`, and `recordReview` checks the verdict against the validation, artifact, findings and checks. Some premises in the question are wrong. `script/seat-skills.ts` does not exist; `seat-skills-module.ts` does that work. There are no `governance/approval.ts`, `governance/settlement.ts` or `governance/verification-plan.ts` files. No playbook names billy or frankie.

**Premise corrections**
- read: `script/seat-skills.ts` is not a file. The embed is built by `modules/maestro/coordination/src/seat-skills-module.ts:9-37` and called from `apps/cli/script/build.ts:48-49`. `AGENTS.md:150` and `.orchestra/skills/maestro-ownership/SKILL.md:19` still point to the old path. `.orchestra/skills/seat-skill-tree-maintenance/SKILL.md:19` names `apps/cli/script/packaged-skills.ts`, which handles a different skill embed (`build.ts:46`).
- read: the governance folder has evidence, records, work-result, dispatch, reservation, workflow and others, but no approval, settlement or verification-plan module. Settlement lives in `v2/workflow/settlement.ts`. `lifecycle-fold.ts` sits at the `src` root. "verification-plan" is only a `requiredConfig` string (`ability-descriptors.ts:31`).

**(1) Seat skills system**
- read: `Seat.skills` holds root skills. `skillSource(id)` resolves to `modules/specialists/<id>/skills` for backend and archie, and to `packages/<id>-specialist/skills` for every other seat. `team-*` roots live in `sharedSource()` (`seats/seat.ts:27-28, 93-101`). `define()` requires every root to start with `<id>-` or `team-` (`seat.ts:74-76`). A review-profile seat with skills does not need write roots, because the "entry skills require write roots" check applies only to execution seats (`seat.ts:70-71`).
- read: `seatProfile()` grants `skill: {"*":deny, <name>:allow, <name>-*:allow}`. It also adds an `external_directory` allow for the seat's root, and for the shared root when the seat lists a `team-*` skill. A review seat keeps the review base `external_directory` (`roster.ts:110-142`). The review base profile already allows `maestro_record_review` (`roster.ts:47-55`).
- read: `SeatSkillRoot.roots` is built only for seats with skills. A compiled build validates and extracts the embedded tree; a source run reads the tree in place. A seat id embedded without declared skills fails as a "Foreign embedded seat skill tree" (`seat-skill-root.ts:34-53`).
- read: `SeatSkillContent.validate` enforces these tree rules:
  - root nodes must exactly equal the declared skills;
  - frontmatter `name` must equal the path joined with `-`;
  - depth at most 4, at most 10 children per node;
  - every non-root node needs `when` and `not-when`;
  - only `references/` folders may sit outside nodes;
  - links may not escape their node.
  (`seat-skill-content.ts:35-110`.) `v2/seats.ts:56-70` reads the node index through `describe`.
- read: current trees:
  - archie: 3 roots with sub-nodes;
  - backend: 7 own roots plus `team-stack`;
  - jimmy: 2 flat roots (`jimmy-calibration`, `jimmy-web-research`);
  - lucy: `skills: []` (`lucy.ts:13`).
- read: tests that pin this: `test/seat-framework.test.ts`, `test/seat-skill-root.test.ts`, `test/seat-skills-build.test.ts` and `test/specialist-name-guard.test.ts`. The tree gate also names `test/v2-skills.test.ts` (`seat-skill-tree-maintenance/SKILL.md:44-45`).

**(2) Playbooks**
- read: `PlaybookContent` pins exactly 5 roots and 12 files; a missing or added file fails packaging (`playbook-content.ts:6-23`). The playbooks are embedded under the `maestro` key (`seat-skills-module.ts:25-34`).
- read: three playbooks name `lucy`:
  - `maestro-orchestra` routes "A cold review" to `lucy`, or `explore` as a fallback (`SKILL.md:51`);
  - `maestro-run-governed` runs plan-stage and code-stage `lucy` reviews with `APPROVE`/`FIX_FIRST`/`REJECT` receipts (`SKILL.md:25, 47-55, 71-84, 106`);
  - the `reviewer-brief` sub-playbook defines the generic brief and a `RETURN {verdict: approve|request_changes|reject|unknown, blocking[], …}` shape (`reviewer-brief/SKILL.md:13-29`).
- read: `maestro-plan`, `maestro-repo-maintenance` and `maestro-run-verify` (with `review-checks`) ask for an independent cold reviewer generically. No playbook mentions billy or frankie (search over `playbooks/**`).

**(3) Team protocol**
- read: `lookupRouteGrant` projects role, abilityClass, returnCard and forbiddenActions from the roster, and holds when the target is `maestro` (`route-grant.ts:9-22`).
- read: `ability-descriptors.ts:28-35` lists `lucy` only under "tests", with phase "verify" and required config "verification-plan".
- read: a work card must have the five sections (`work-contract.ts:29-35`).
- read: `workResult` kinds today are `backend-work-result-v1`, `upstream-work-result-v1` (archie) and `discovery-work-result-v1` (jimmy). `lucy` has none, so a plain `task` to lucy returns free text with no parsed card.
- read: the governed review path:
  - `maestro_request_review` checks the validation and context, builds a plan or code artifact, creates a `lucy` child Session and sends it a fixed prompt with the card, plan JSON, artifact JSON, diff, checks and context skills, ordering exactly one `maestro_record_review` call (`v2/tools/review.ts:149-310`);
  - it returns `VERDICT: evt_maestro_review_…`, `LUCY_ERROR` or `LUCY_NO_RECEIPT` (`review.ts:290-308`).
- read: tool ownership: only `lucy` may call `maestro_record_review`, and only Maestro may call `maestro_request_review` (`v2/seats.ts:189-212`).
- read: Atlas TEAM.md describes billy, frankie and lucy as VERIFY evaluators and backend and patty as generators; rosie is SUPPORT (`TEAM.md:136-152`). Their charters exist (`seats/prompt/{billy,frankie,patty,rosie}.txt`) with `skills: []`. TEAM.md itself says it does not prove runtime enforcement.

**(4) Governance records**
- read: `recordReview` is host-enforced. It requires a VALID validation in the same Session and refuses `routedMemberID === "lucy"` as self-review. It also checks:
  - the work card hash;
  - for the code stage, that an APPROVE plan review exists;
  - that the artifact matches the context;
  - that APPROVE has no findings and other verdicts have at least one;
  - that the checks deep-equal the validation's checks.
  It then publishes an immutable `evt_maestro_review_*`, and a second, different receipt is a conflict (`review-records.ts:262-366`).
- read: `WorkflowSettlementV2.coldReview` and `gradeReviewedHold` enforce the code-review gate: `WORKFLOW_CODE_REVIEW_REQUIRED`, `NOT_APPROVED`, `UNADDRESSED` and `REJECTED` (`v2/workflow/settlement.ts:55-150`, `v2/workflow/review.ts:23-28`).
- read: `lifecycle-fold` covers only admission, clarification, scope and hold, not review (`lifecycle-fold.ts:39-40`).
- read: `GovernanceRecordsV2` reads validation, context, plan revision and authorization; `GovernanceEvidenceV2.contextIsCurrent` checks freshness (`v2/governance/records.ts`, `v2/governance/evidence.ts`).

**(5) Repo-only material and the ship rule**
- read: what ships is the prompts, the trees listed in `seat.skills`, and the playbooks. What stays in the repo is `.orchestra/skills`, `docs/` and AGENTS.md. Never put a maintenance or ownership skill in a seat's `skills` (`AGENTS.md:147-154`).
- read: the repo-only skills about seats or review are `maestro-ownership` (which lists lucy as "charter only"), `maestro-usage`, `maestro-maintenance`, `seat-skill-tree-maintenance` and `claude-mode-maintenance`. There are no lucy-specific repo skills.
- inferred: any lucy method knowledge must therefore go in `packages/lucy-specialist/skills/lucy-*` or the charter. A lucy maintenance or ownership skill goes under `.orchestra/skills/lucy-*`.

**Not examined** (the research deadline ran out): `governance.ts:292-346`, which settles the work result for seats without one; `v2/skill-sources.ts`, which holds the foreign/denied rules; the full `seat-framework.test.ts` assertions; `docs/specs/seat-framework/skill-tree.md`; and the `task` tool text. Reading these would decide whether lucy needs a `lucy-work-result-v1` schema.

**Reproduce** the tree gate: `bun run test:ci maestro test/seat-framework.test.ts test/seat-skills-build.test.ts`

## Claims

[
 {
  "subquestion": {
   "id": "rque_6fc90705bfaaaffd13fac934d7",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "Seat.skills declares root skills resolved under skillSource(id) (modules/specialists/<id>/skills for backend/archie, packages/<id>-specialist/skills otherwise) or sharedSource() for team-*; define() requires each root to start with `<id>-` or `team-`.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_80f99807d8f4825ef7a0c55d1f",
      "revision": 1
     },
     "representation": "text",
     "digest": "2b9f4b5e747dc06d1380f94f8aab39138a2018ccc886c0434825cb844937ac51"
    },
    "lines": {
     "start": 27,
     "end": 28
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_80f99807d8f4825ef7a0c55d1f",
      "revision": 1
     },
     "representation": "text",
     "digest": "2b9f4b5e747dc06d1380f94f8aab39138a2018ccc886c0434825cb844937ac51"
    },
    "lines": {
     "start": 70,
     "end": 76
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_80f99807d8f4825ef7a0c55d1f",
      "revision": 1
     },
     "representation": "text",
     "digest": "2b9f4b5e747dc06d1380f94f8aab39138a2018ccc886c0434825cb844937ac51"
    },
    "lines": {
     "start": 91,
     "end": 101
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_6fc90705bfaaaffd13fac934d7",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "roster.ts seatProfile grants skill {*:deny, <name>:allow, <name>-*:allow} per declared root plus external_directory allows for the seat root and the shared root when a team-* skill is declared; the review base profile allows maestro_record_review.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_23162fc7309976925231209833",
      "revision": 1
     },
     "representation": "text",
     "digest": "5a75024571efbb7edcb37ea0b50c27174439f48c69c00fefe3caa16e3eea2627"
    },
    "lines": {
     "start": 110,
     "end": 142
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_23162fc7309976925231209833",
      "revision": 1
     },
     "representation": "text",
     "digest": "5a75024571efbb7edcb37ea0b50c27174439f48c69c00fefe3caa16e3eea2627"
    },
    "lines": {
     "start": 47,
     "end": 55
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_6fc90705bfaaaffd13fac934d7",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "script/seat-skills.ts does not exist; the embed module is generated by seat-skills-module.ts seatSkillsModule/seatSkillsFiles and imported by apps/cli/script/build.ts.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b175dc72dbf5b8d6e1c2a1c6da",
      "revision": 1
     },
     "representation": "text",
     "digest": "f468d2d52a9d5c7007dd938ad7d41fe9f9b312637c2ba173f1a447de4ab88d11"
    },
    "lines": {
     "start": 9,
     "end": 42
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_3f0590eec8a09045e6e450795f",
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
      "id": "cart_070bfdd9352a5eb4a14b73c6ab",
      "revision": 1
     },
     "representation": "text",
     "digest": "e09331bbc81d4f4161afe6bebbb1200e9ac544a328a349409c414afed0be27ce"
    },
    "quote": "apps/cli/script/build.ts:48: const { seatSkillsFiles } = await import(\"@orchestra/maestro/seat-skills-module\")"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_6fc90705bfaaaffd13fac934d7",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "SeatSkillRoot.roots builds a root only for seats with skills, extracting embedded trees in compiled builds or reading source in place, and rejects embedded trees of seats without declared skills.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8443c8c330c5bc4b4629b06ff0",
      "revision": 1
     },
     "representation": "text",
     "digest": "35a9fa966932e18b22289561b2322e851627d6b75d9e9c17aab084628570fb0a"
    },
    "lines": {
     "start": 34,
     "end": 53
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_6fc90705bfaaaffd13fac934d7",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "SeatSkillContent.validate enforces roots equal declared skills, frontmatter name equals path joined by '-', depth <=4, <=10 children, when/not-when on non-root nodes, references-only orphans, and node-scoped links.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d998392b845ab661b95e9f4a06",
      "revision": 1
     },
     "representation": "text",
     "digest": "7aaebead2a68c47dd89f2e86541d53114039d5a1b38cb00ec6c455827fcb087f"
    },
    "lines": {
     "start": 35,
     "end": 110
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_6fc90705bfaaaffd13fac934d7",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "lucy is defined with profile review, skills [], no workResult; jimmy has two flat roots, archie three roots with sub-nodes, backend seven own roots plus team-stack.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_960c8eb76165ad31d1873d09ff",
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
      "id": "cart_bd3d6e1cd226d896b02fb3def6",
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
      "id": "cart_81a8affce114b7ea91c3fc338d",
      "revision": 1
     },
     "representation": "text",
     "digest": "4d583cb6fa9cb6a472453467eada6cf4b35c95ff99ff6f21e08af6ce53df895c"
    },
    "quote": "packages/jimmy-specialist/skills/jimmy-calibration/SKILL.md:2: name: jimmy-calibration"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_6fc90705bfaaaffd13fac934d7",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "Tests pinning the seat skill system are seat-framework.test.ts, seat-skill-root.test.ts, seat-skills-build.test.ts and specialist-name-guard.test.ts; the tree-maintenance gate also names v2-skills.test.ts.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_008e32485fcbbee1b5abb9de0e",
      "revision": 1
     },
     "representation": "text",
     "digest": "6d892ee39c63b212b831c6db3b41c8b234835e67a2e5d58a7602940b33ee0b59"
    },
    "quote": "modules/maestro/coordination/test/seat-framework.test.ts:13:   test(\"definitions correspond to registered files, charters and skill artifacts\", async () => {"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_53341c047cea6d5085ca6da912",
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
   "id": "rque_47d7f5292f1e5690bba8861c7a",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "PlaybookContent pins exactly five playbook roots and twelve files; the playbooks are embedded under the maestro key.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d50b49cde3e82fcfef78674d19",
      "revision": 1
     },
     "representation": "text",
     "digest": "f2dae7821b188df7e9d4084ee6bf040eba0117cc6a3b7172139bb080daa57299"
    },
    "lines": {
     "start": 6,
     "end": 23
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b175dc72dbf5b8d6e1c2a1c6da",
      "revision": 1
     },
     "representation": "text",
     "digest": "f468d2d52a9d5c7007dd938ad7d41fe9f9b312637c2ba173f1a447de4ab88d11"
    },
    "lines": {
     "start": 25,
     "end": 34
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_47d7f5292f1e5690bba8861c7a",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "maestro-orchestra routes a cold review to lucy (explore as fallback); maestro-run-governed runs plan- and code-stage lucy reviews with APPROVE/FIX_FIRST/REJECT receipts; reviewer-brief defines the generic cold-review brief and return shape.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_885b17c60987f79ed878d2b45d",
      "revision": 1
     },
     "representation": "text",
     "digest": "9727de9bc099b40b491c562299cab101851feb930de9a7087b3b646e90530b4e"
    },
    "lines": {
     "start": 51,
     "end": 51
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1f339bed752a47423cf976bcbb",
      "revision": 1
     },
     "representation": "text",
     "digest": "4e29ad3fd6e0791d83e8edd89721516a5f6082be5aef799b946378b6cf15b9ef"
    },
    "lines": {
     "start": 47,
     "end": 55
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1f339bed752a47423cf976bcbb",
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
      "id": "cart_3fb367e656ad3ec8399e132490",
      "revision": 1
     },
     "representation": "text",
     "digest": "db22f2884ec34811c4099fb2d4ceb2dd2282fb2c2d91f5d60d69bc7943e326fb"
    },
    "lines": {
     "start": 13,
     "end": 29
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_47d7f5292f1e5690bba8861c7a",
   "revision": 1
  },
  "nature": "observation",
  "scope": "universal",
  "proposition": "No playbook file mentions billy or frankie; the matches for review/audit name lucy or a generic independent reviewer.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_ea35a9ac436d13bd7863a90045",
      "revision": 1
     },
     "representation": "text",
     "digest": "e070f7ad2f1bf5d11b062485782779c2fb7c6ec92614ab953e66d634fe9121cc"
    },
    "quote": "86 hit(s)"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_8fd7dc2002174f4d5c5daf5bb4",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "lookupRouteGrant projects role/abilityClass/returnCard/forbiddenActions from the roster and holds on maestro; ability descriptors list lucy only under tests/verify with required config verification-plan; a work card needs five fixed sections.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f30345a34045f3e380d6a9bad0",
      "revision": 1
     },
     "representation": "text",
     "digest": "a536da9785f6912aa3e27011edeffa5c4e744822f97d1017c5ec7439557a4f39"
    },
    "lines": {
     "start": 9,
     "end": 22
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_77ae25a9311533edad5a01e667",
      "revision": 1
     },
     "representation": "text",
     "digest": "969c0b98198b6519331a7b99cfa5f6de89fcc92d86ac9c6080cf3f1bda62c39f"
    },
    "lines": {
     "start": 28,
     "end": 35
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_953f6e752de7cd283f85bc562a",
      "revision": 1
     },
     "representation": "text",
     "digest": "f28bd1c48d08470dba815a3909f0cdc9855e9d208ca2b28a7f9a0bb37dd3733e"
    },
    "lines": {
     "start": 29,
     "end": 35
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_8fd7dc2002174f4d5c5daf5bb4",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "workResult kinds today are backend-work-result-v1, upstream-work-result-v1 (archie) and discovery-work-result-v1 (jimmy); WorkResultV2.assemble parses the seat's fenced return card keyed workResult.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8e226980431142d6b63545234f",
      "revision": 1
     },
     "representation": "text",
     "digest": "ac8febb89e7dfef93fd2f96737084d939d9887183b9c3e9506054e0c52626530"
    },
    "quote": "modules/maestro/coordination/src/seats/archie.ts:27:   workResult: \"upstream-work-result-v1\","
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7663b113b68fb2a2d938ecfd7e",
      "revision": 1
     },
     "representation": "text",
     "digest": "dda672730a904598c09aa6cbd6c0052dc1074533ec13c90cad202c8262d82878"
    },
    "lines": {
     "start": 49,
     "end": 96
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_8fd7dc2002174f4d5c5daf5bb4",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "maestro_request_review (Maestro only) creates a lucy child Session with a fixed prompt carrying card, plan JSON, artifact JSON, diff, checks and context skills, requiring exactly one maestro_record_review call, and returns a verdict receipt, LUCY_ERROR or LUCY_NO_RECEIPT; only lucy owns maestro_record_review.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1ea2ea739699ad69b4c3f62e5c",
      "revision": 1
     },
     "representation": "text",
     "digest": "ac0a4b2001484891fdaac768baaef6814f5e865026c2fff49545605c9887cb2d"
    },
    "lines": {
     "start": 231,
     "end": 308
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1ea2ea739699ad69b4c3f62e5c",
      "revision": 1
     },
     "representation": "text",
     "digest": "ac0a4b2001484891fdaac768baaef6814f5e865026c2fff49545605c9887cb2d"
    },
    "lines": {
     "start": 310,
     "end": 334
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a44bd1e4b220d542323f87ff85",
      "revision": 1
     },
     "representation": "text",
     "digest": "b9a8373ef837451d7b5029b6d2300404ac65a7f29a23d08bd3a5b2a60e5c46a3"
    },
    "lines": {
     "start": 189,
     "end": 212
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_8fd7dc2002174f4d5c5daf5bb4",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "Atlas TEAM.md frames lucy, billy and frankie as VERIFY evaluators of the generators backend and patty, with rosie as SUPPORT; billy, frankie, patty and rosie have charters only.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a313466c9dc13a0e4c6c2d4b8d",
      "revision": 1
     },
     "representation": "text",
     "digest": "343d608c4effaa7de82ba73f9fdffb857f48a053d4e7c1670fde1abb29699c06"
    },
    "lines": {
     "start": 136,
     "end": 152
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_9f3c2f8cc354311f220c4bb6b2",
      "revision": 1
     },
     "representation": "text",
     "digest": "36611eab2fb3eb35ce54a42389d1dc43e92878eb68ef9fe2d9c8939fb901c324"
    },
    "lines": {
     "start": 32,
     "end": 46
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_ef28c6fb45020df110dc382e87",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "recordReview host-enforces VALID validation, no self-review, matching work card hash, APPROVE plan review before code stage, artifact/context binding, APPROVE-has-no-findings and findings-required, checks deep-equal to validation, and an immutable evt_maestro_review_* receipt.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b766a1e9d7e930048ed4241c84",
      "revision": 1
     },
     "representation": "text",
     "digest": "810d6a7fb50eabeed3908c160ba2b91b832876ff7303e296a5594be46a914373"
    },
    "lines": {
     "start": 262,
     "end": 366
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_ef28c6fb45020df110dc382e87",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "There is no governance/approval, governance/settlement or governance/verification-plan module; the code-review gate is enforced by v2/workflow/settlement.ts coldReview/gradeReviewedHold with the WORKFLOW_CODE_REVIEW_* holds, and lifecycle-fold covers only admission/clarification/scope/hold.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d7a8e27c969a72328e6449a2cd",
      "revision": 1
     },
     "representation": "text",
     "digest": "e71ab982b7cd221ee22c966f0f7c5578c62d81b40203335625cdfe652c213bfb"
    },
    "quote": "27 hit(s)"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c3ad60a974280303f5f0522a48",
      "revision": 1
     },
     "representation": "text",
     "digest": "88bfa88e3fe6d8da664be1119e91f86a8e23290182e13bce2dcbca1856c043a8"
    },
    "quote": "export const coldReview = Effect.fn(\"WorkflowSettlementV2.coldReview\")(function* ("
   },
   {
    "source": {
     "artifact": {
      "id": "cart_12e84c772f01dc958d47771474",
      "revision": 1
     },
     "representation": "text",
     "digest": "dd95a1a22f5d495961479125be8d607a1a21ed44b26623b19eec211add871ec0"
    },
    "lines": {
     "start": 32,
     "end": 40
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_005260087bad7fa94d9539f8f1",
   "revision": 1
  },
  "nature": "extraction",
  "proposition": "AGENTS.md ships prompts, seat.skills trees and playbooks, keeps .orchestra/skills, docs and AGENTS.md repo-only, and forbids adding a maintenance or ownership skill to a seat's skills.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f90e51e3a2013a55964833274e",
      "revision": 1
     },
     "representation": "text",
     "digest": "55342b61b7f3a579ee1f06295d665d35c3fe57525cada736386df825127ad7b3"
    },
    "lines": {
     "start": 147,
     "end": 154
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_005260087bad7fa94d9539f8f1",
   "revision": 1
  },
  "nature": "observation",
  "proposition": "Repo-only skills about seats are maestro-ownership, maestro-usage, maestro-maintenance, seat-skill-tree-maintenance and claude-mode-maintenance; none is lucy-specific, and seat-skill-tree-maintenance names apps/cli/script/packaged-skills.ts as the embed path.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b16e070aad6709fdb9c14c04d3",
      "revision": 1
     },
     "representation": "text",
     "digest": "f36cfefca2e85e3961d7e0c4f1bb343271721c52c6b89cebfe28708d4fe3973c"
    },
    "quote": ".orchestra/skills/seat-skill-tree-maintenance/SKILL.md:2: name: seat-skill-tree-maintenance"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_53341c047cea6d5085ca6da912",
      "revision": 1
     },
     "representation": "text",
     "digest": "7d7b0886016678c16138339e95ebebaa1d24c2944aaf6d3a395f6b7cffda4adb"
    },
    "lines": {
     "start": 11,
     "end": 20
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_005260087bad7fa94d9539f8f1",
   "revision": 1
  },
  "nature": "inference",
  "proposition": "Lucy runtime method knowledge belongs in packages/lucy-specialist/skills/lucy-* roots declared in lucy.ts or in its charter, while any lucy maintenance or ownership skill belongs under .orchestra/skills.",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_80f99807d8f4825ef7a0c55d1f",
      "revision": 1
     },
     "representation": "text",
     "digest": "2b9f4b5e747dc06d1380f94f8aab39138a2018ccc886c0434825cb844937ac51"
    },
    "lines": {
     "start": 93,
     "end": 96
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f90e51e3a2013a55964833274e",
      "revision": 1
     },
     "representation": "text",
     "digest": "55342b61b7f3a579ee1f06295d665d35c3fe57525cada736386df825127ad7b3"
    },
    "lines": {
     "start": 150,
     "end": 153
    }
   }
  ]
 }
]
