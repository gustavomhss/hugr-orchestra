# 24-runtime-surfaces

session ses_6914cad6f92ff6953219ba19a8a0d35499bba71d96d1775edc1c7d80b79b9c55

## Answer

**Premise:** `lucy` already exists. It is a native read-only cold-review seat with a 5-line charter and no skill tree. It is wired into the governed workflow: the plan and code reviews depend on it, and the approval step will not proceed without its APPROVE. It is not yet wired into the merge queue, Guardrail, test:ci, the research toolkit or the Arsenal.

**1. Workflows (read)**
- `modules/maestro/coordination/src/v2/workflow/review.ts:23-28` defines the three holds: `WORKFLOW_CODE_REVIEW_REQUIRED`, `NOT_APPROVED` and `UNADDRESSED`.
- `review.ts:29-36` builds the workers' uncommitted result as a Git tree. It must stay inside the approved writePaths (`.atlas/members` is always allowed). Files matched by `.gitignore` are not reviewed.
- `review.ts:166-197` picks the code-stage receipt that matches both the validation and that exact tree.
- `settlement.ts:48-84` `settle`:
  - With no receipt, it holds `REQUIRED` before grading, so no retry is spent.
  - If the tree is one that a FIX_FIRST already graded, it holds `UNADDRESSED`.
- `settlement.ts:94-122` `gradeReviewedHold`:
  - FIX_FIRST spends one retry, and later attempts carry the findings.
  - REJECT holds `WORKFLOW_CODE_REVIEW_REJECTED`, which needs a new plan round.
- `settlement.ts:150-282` `coldReview` needs two receipts: a lucy APPROVE on the plan stage, bound to validation, roster, grant and policy hashes, and a lucy code receipt for the current tree. Otherwise it holds MISSING or STALE.
- Calling lucy:
  - `v2/tools/review.ts:153-160` and `:232-265`: only Maestro can call `maestro_request_review`. It creates a lucy child Session and sends it the plan or code brief, the diff and the checks.
  - `review.ts:311-334`: `maestro_record_review` only accepts lucy in a child Session.
- `v2/tools/approval.ts:123-125`: approval cannot be presented without a lucy APPROVE.
- `playbooks/maestro-run/governed/SKILL.md:71-85` describes the code-review loop.

**2. Delivery (read)**
- Merge queue:
  - `packages/core/src/board/queue.ts:98-135`: queueing a card is refused for many reasons, but never because of a review.
  - `board/record.ts:35-43` has a field for reviews in the PR record, but `queue-record.ts:274-276` always fills it with `reviews: []`.
  - The spec says lucy's receipts should show there (`docs/specs/maestro-lead/merge-queue.md:234`) and that queueing should be refused while FIX_FIRST/REJECT findings are open (§4.5 rules). That is the natural place for lucy's verdict to gate or annotate.
- Guardrail:
  - `.github/workflows/guards.yml:29-53` runs the base branch's engine. A `guardrail-approved[:rule]` label counts only if someone with write access applied it.
  - `queue.ts:650-653` copies those labels onto the bundle PR.
- test:ci: `script/test-ci-request.ts:273` fails a job without a passing omni positive control verdict.
- None of these read a reviewer verdict.

**3. Tools a read-only reviewer may call (read)**
- `roster.ts:47-57`: the review profile denies everything except read (not `.env`), glob, grep, `maestro_record_review` and the truncated-output directory.
- The research toolkit belongs to jimmy only (`packages/core/src/research/seat-tools.ts:6-13`).
- `seats/seat.ts:54-67` throws if any seat other than backend uses the toolkit, or any seat other than jimmy uses research. Atlas Memory is limited to backend, jimmy, archie and live.
- The Arsenal is Maestro and archie only (`v2/seats.ts:185-231`).
- So lucy cannot use code_locate, code_query, probe_run, inquiry, the Arsenal or Atlas Memory without changes to those guards.

**4. What the owner sees (read)**
- Session view, in `orchestra-governance-data.ts`:
  - `:74-79`: `maestro_record_review` appears as a "review" record with APPROVE/FIX_FIRST/REJECT, and `maestro_request_review` as a "lucy" record.
  - `:252-258`: lucy's verdict is parsed only from the output line `<VERDICT>: <receipt>`. Anything else shows as a hold, for example `LUCY_NO_RECEIPT`.
- Board: `review.ts:292-299` writes a board thread note of kind `review`, author `lucy`, but only when a card was passed.
- Claude Code host: `v2/host.ts:42` blocks governed `maestro_*` tools until the governed playbook is loaded. `maestro_arsenal_*` and `maestro_workflows` are excluded.

**5. Configuration and extension points**
- Read:
  - `seat.ts:26-45` lists the seat fields: `skills` (a tree under `packages/lucy-specialist/skills`, set at `:89-95`), `mcp` (configured MCP servers), and `labelEnv` with `agent.<id>.name` for the display name only (`v2/seats.ts:122-146`).
  - `roster.ts:87-91`: lucy's profile hash keeps the historical name "review".
  - `project-config.ts:62-76` is only a GitHub Projects field map with a Seat option for lucy. It is not a place for review rules.
  - Board API endpoints are in `packages/protocol/src/groups/board.ts`.
- Inferred:
  - Review profiles and rigor levels belong in lucy's seat definition plus a shipped skill tree. Rules that must hold regardless of the model belong in `review.ts` and the settlement checks.
  - Changing lucy's prompt or profile changes the hashes that every validation and receipt binds (`settlement.ts:170-190`), so in-flight approvals would go stale.

**Not examined, for lack of time:** notifications, Live/Flight Engineer internals, the MCP Dock and plugin system, Relay internals, guard rule TOML for review rules, `typecheck.yml`, Lean beyond its `lean_recall` UI strings, and the epic CI workflow. The next step would be `code_locate` on each of these.

**Behavioural reproduction:** every claim here comes from reading code. Settlement behaviour is covered by `bun run test:ci maestro test/v2-workflow-host.test.ts`; line 103 of that file asserts `WORKFLOW_CODE_REVIEW_REJECTED`.

## Claims

[
 {
  "subquestion": {
   "id": "rque_7c9d452670d4922c7a1dda3f20",
   "revision": 1
  },
  "proposition": "Premise correction: `lucy` already exists as a native seat (role 'cold code review; records governed reviews', profile 'review', read-only, skills [], toolkit false, atlasMemory false, writeRoots false) with a 5-line charter returning a 'cited APPROVE/FIX_FIRST/REJECT card'. The README marks it Partial: no skill tree yet.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_edc69adbeea70640256d33a896",
      "revision": 1
     },
     "representation": "text",
     "digest": "061f813eee88736ec5683c8d25a06727ac82c2cffb7b1661a53b21d8d48c5c4f"
    },
    "lines": {
     "start": 1,
     "end": 18
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_cbb5b4045f92ff6b481a9cc335",
      "revision": 1
     },
     "representation": "text",
     "digest": "32a93ebeb62fcc2a17d9bac3c4306ba5604c78b193ee29630b622488b58e98e5"
    },
    "lines": {
     "start": 1,
     "end": 5
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_e30305c421075ccda26782b6b4",
      "revision": 1
     },
     "representation": "text",
     "digest": "6c58095e951b19fb88f2af6a30ec40fadfd505955b9938156f4b268aedba6a01"
    },
    "lines": {
     "start": 56,
     "end": 56
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_811acc878824c8711047ea8066",
   "revision": 1
  },
  "proposition": "The workflow code-review gate lives in modules/maestro/coordination/src/v2/workflow/review.ts (REQUIRED, NOT_APPROVED, UNADDRESSED holds; the workers' uncommitted result as a Git tree bounded by approved writePaths; receipts matched by validation and tree) and settlement.ts (settle holds REQUIRED before grading, UNADDRESSED on an already-graded tree; gradeReviewedHold spends one retry on FIX_FIRST and holds WORKFLOW_CODE_REVIEW_REJECTED on REJECT; coldReview requires a lucy APPROVE plan receipt and a lucy code receipt for the exact tree, otherwise MISSING/STALE).",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_61a59a39110b62c58866643ea2",
      "revision": 1
     },
     "representation": "text",
     "digest": "b9b34abbc5f736ea9b28c0263ca482920ce3a637cbbd56cc8113491cde008b21"
    },
    "lines": {
     "start": 17,
     "end": 36
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_61a59a39110b62c58866643ea2",
      "revision": 1
     },
     "representation": "text",
     "digest": "b9b34abbc5f736ea9b28c0263ca482920ce3a637cbbd56cc8113491cde008b21"
    },
    "lines": {
     "start": 166,
     "end": 197
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_45b9eb50f1085b9c7bc601bc67",
      "revision": 1
     },
     "representation": "text",
     "digest": "96b9a33e54dff29279e623ef195b4c36295ca6da8d79d1bb4486f82398530130"
    },
    "lines": {
     "start": 48,
     "end": 122
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_45b9eb50f1085b9c7bc601bc67",
      "revision": 1
     },
     "representation": "text",
     "digest": "96b9a33e54dff29279e623ef195b4c36295ca6da8d79d1bb4486f82398530130"
    },
    "lines": {
     "start": 150,
     "end": 282
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_811acc878824c8711047ea8066",
   "revision": 1
  },
  "proposition": "Only Maestro calls maestro_request_review, which creates a lucy child Session, prompts it with the plan- or code-stage brief, the diff and checks, and requires it to call maestro_record_review once; maestro_record_review is gated to lucy in a child Session. maestro_present_approval refuses without a lucy APPROVE. The governed playbook step 14 describes the code-stage loop.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_2df2619ac6d4302e54a83b608c",
      "revision": 1
     },
     "representation": "text",
     "digest": "2f36e43add069ed2d1bd6e0cd60b0d3fb7a945145a307e8d0bb18ea84bfa1c54"
    },
    "lines": {
     "start": 153,
     "end": 160
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_2df2619ac6d4302e54a83b608c",
      "revision": 1
     },
     "representation": "text",
     "digest": "2f36e43add069ed2d1bd6e0cd60b0d3fb7a945145a307e8d0bb18ea84bfa1c54"
    },
    "lines": {
     "start": 232,
     "end": 265
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_2df2619ac6d4302e54a83b608c",
      "revision": 1
     },
     "representation": "text",
     "digest": "2f36e43add069ed2d1bd6e0cd60b0d3fb7a945145a307e8d0bb18ea84bfa1c54"
    },
    "lines": {
     "start": 311,
     "end": 334
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_07976b905a685d5e2b9dd97bd1",
      "revision": 1
     },
     "representation": "text",
     "digest": "5f3681938e7e13a290f40b546334e8ac8ef1f497b8a2ebf4cf280f43d1f1952e"
    },
    "lines": {
     "start": 123,
     "end": 125
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_52fc38e919b937ed9f9491b427",
      "revision": 1
     },
     "representation": "text",
     "digest": "804c55e04b553d63e10a7041229329e62a0ba734974ab3f1a92aca6044beaf11"
    },
    "lines": {
     "start": 71,
     "end": 85
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_0521468abc48840bd303763b41",
   "revision": 1
  },
  "proposition": "The merge queue does not read lucy verdicts today: board_queue refuses on stage, PR, pause, conflict, dependencies, incomplete record, unknown follow-ups and scoped-red checks, but not on review; the PR record type has evidence.reviews, yet queue-record fills it with an empty array. The spec intends board_queue to refuse unclosed FIX_FIRST/REJECT findings and the Evidence section to show review records.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_71735b627dc98f03c71f29e340",
      "revision": 1
     },
     "representation": "text",
     "digest": "340cc5031c03b1c89f9e2dc94184aa1d37da1550ffe1d808e90aaf60e246f809"
    },
    "lines": {
     "start": 98,
     "end": 135
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_115d74d111a57371c45267ba16",
      "revision": 1
     },
     "representation": "text",
     "digest": "3ed8da644eb79729f8b6249c70d8f2d126a9275ac90d710bdbedb8d7f02ada5d"
    },
    "lines": {
     "start": 35,
     "end": 43
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_4c382dc6d16f292e41af4ce885",
      "revision": 1
     },
     "representation": "text",
     "digest": "82a0c4fe7ff294f68c68b67a8b5df90ed5c00fccce3eb0d704e654eb5bdbfe94"
    },
    "lines": {
     "start": 274,
     "end": 276
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_e29da82d4394354177716d2a7b",
      "revision": 1
     },
     "representation": "text",
     "digest": "b56e0e08b352e386610abb1c36bfcea7aa740ddbffbb997ca9f14b14d2e79654"
    },
    "lines": {
     "start": 234,
     "end": 234
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_0521468abc48840bd303763b41",
   "revision": 1
  },
  "proposition": "Guardrail runs on every PR via guards.yml from the base branch's engine; `guardrail-approved[:<rule>]` labels count only when a write/maintain/admin collaborator applied them, and the queue carries members' guardrail-approved labels onto the bundle PR. test:ci rejects a job without a passing omni positive control verdict line for its nonce. Neither consumes a reviewer verdict.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a8feca5646d3d8288d72408e46",
      "revision": 1
     },
     "representation": "text",
     "digest": "7b24ac8a20405031afd6939a496ae0a3cf186eefd355f5db76a94596478dc7a5"
    },
    "lines": {
     "start": 29,
     "end": 53
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1a232bffbb0d2a45bd73654202",
      "revision": 1
     },
     "representation": "text",
     "digest": "89956fad1612e97ab4158ba5e8835835efca6f17f7abe7e8d74b0a5d9db8d37b"
    },
    "lines": {
     "start": 650,
     "end": 653
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1bc29f937989b7e7e9f04e596b",
      "revision": 1
     },
     "representation": "text",
     "digest": "4ba5e90824636f374c7d88fa5e4f5e581338dea3f934a55702ddb6ebce3acb02"
    },
    "quote": "script/test-ci-request.ts:273:   if (!/^omni positive control: (?:pass|not applicable) \\(/.test(verdict))"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_f22fddf783fa00de11a913355c",
   "revision": 1
  },
  "proposition": "A read-only reviewer's legal tool set is code-defined: the review base profile denies '*' and allows read (not .env), glob, grep, maestro_record_review and the truncation directory. The research toolkit (code_locate, code_query, code_search, probe_run, inquiry, research_*) is owned by SEAT = 'jimmy', and seat.ts throws if any other seat sets research or toolkit; Arsenal tools are owned by maestro and archie only; atlasMemory is limited to backend, jimmy, archie and live. Giving lucy these tools needs code changes to these guards.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_4db94d37720e581f41eb9058d5",
      "revision": 1
     },
     "representation": "text",
     "digest": "01d8dcdedb30ce5a125d72d81871de24ce34e827ef8bd04c430b17564f254796"
    },
    "lines": {
     "start": 47,
     "end": 57
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7c6b90eeb16e19bc2ff9f8913b",
      "revision": 1
     },
     "representation": "text",
     "digest": "d88373a47e970593f281019269874b0cbe981e09b86d500604eaa4e24b29c36e"
    },
    "lines": {
     "start": 6,
     "end": 13
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_cecab3ec31542dc9936e6c1e3a",
      "revision": 1
     },
     "representation": "text",
     "digest": "2b9f4b5e747dc06d1380f94f8aab39138a2018ccc886c0434825cb844937ac51"
    },
    "lines": {
     "start": 54,
     "end": 67
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_03a3c72805bef800e52eda6d60",
      "revision": 1
     },
     "representation": "text",
     "digest": "9d399c92eddaf65ae1968bde7487c71df8f4875171f27613f6414f1ea51f403e"
    },
    "lines": {
     "start": 185,
     "end": 231
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_7c9d452670d4922c7a1dda3f20",
   "revision": 1
  },
  "proposition": "To the owner today a lucy review appears as (a) a governance record in the session view: maestro_request_review is kind 'lucy', its verdict parsed only from the server output '<VERDICT>: <receipt>', otherwise a hold such as LUCY_NO_RECEIPT; maestro_record_review is kind 'review' with APPROVE/FIX_FIRST/REJECT; and (b) a board thread note of kind 'review' authored 'lucy' when a card was passed. The Claude Code host gates governed maestro_* tools behind the maestro-run-governed playbook, excluding maestro_arsenal_* and maestro_workflows.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f04b9884ad5212cdb8d44c30ac",
      "revision": 1
     },
     "representation": "text",
     "digest": "8237ef7ae4958efeb4fbd46397c7e63dab4c0c327e016163505481240e6d477f"
    },
    "lines": {
     "start": 74,
     "end": 79
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_22bcd148f5ef4a4354d473cf53",
      "revision": 1
     },
     "representation": "text",
     "digest": "77c73bcd6b42ea6a1520cb2a3a09f6fef00aa7eed579cc775b89523e754f3bf8"
    },
    "lines": {
     "start": 252,
     "end": 258
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_2df2619ac6d4302e54a83b608c",
      "revision": 1
     },
     "representation": "text",
     "digest": "2f36e43add069ed2d1bd6e0cd60b0d3fb7a945145a307e8d0bb18ea84bfa1c54"
    },
    "lines": {
     "start": 292,
     "end": 299
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_540b51af12fd1a1379868f1797",
      "revision": 1
     },
     "representation": "text",
     "digest": "539638b1521558dbbe85ed1d414fd45cd1e56ffc67ca668543d3c0dabf6f6f43"
    },
    "quote": "modules/engine-adapters/claude-code/src/v2/host.ts:42: const isGoverned = (name: string) => name.startsWith(\"maestro_\") && !name.startsWith(\"maestro_arsenal_\") && name !== \"maestro_workflows\""
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e3d17d92c730f5f7eb46d7dee5",
   "revision": 1
  },
  "proposition": "Seat-level extension points exist in the Seat type: skills (skill tree under packages/lucy-specialist/skills via skillSource), mcp (configured MCP servers granted as <server>_*), labelEnv and agent.<id>.name for the label (presentation only), and the roster profile hash: lucy's profile hashes as the historical name 'review', and reviewPolicyHash binds review receipts. project-config.ts is only a GitHub Projects field map binding a Seat option to memberId lucy, not a place for review rules. Board HttpApi endpoints live in packages/protocol/src/groups/board.ts.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_cecab3ec31542dc9936e6c1e3a",
      "revision": 1
     },
     "representation": "text",
     "digest": "2b9f4b5e747dc06d1380f94f8aab39138a2018ccc886c0434825cb844937ac51"
    },
    "lines": {
     "start": 26,
     "end": 45
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_cecab3ec31542dc9936e6c1e3a",
      "revision": 1
     },
     "representation": "text",
     "digest": "2b9f4b5e747dc06d1380f94f8aab39138a2018ccc886c0434825cb844937ac51"
    },
    "lines": {
     "start": 89,
     "end": 95
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_2a26a00a10ce84f5d048be6e1b",
      "revision": 1
     },
     "representation": "text",
     "digest": "7f27327f1e31fa4e8b53e9f93af366dcebbe4b3e43c951b171d29eafafeb59f2"
    },
    "lines": {
     "start": 87,
     "end": 91
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_76a48f4346357a4fcc45b766b5",
      "revision": 1
     },
     "representation": "text",
     "digest": "7bc73a2f5a1cb19b4ddef52ce9b40dd98bc2e0bcb08fa38cbd8e0abb9e329d42"
    },
    "lines": {
     "start": 122,
     "end": 146
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_29db07ba21f8521e9c074be9ef",
      "revision": 1
     },
     "representation": "text",
     "digest": "1e35754f9ade10877cb0dc89167d6fa652528f70d83a049eff6deae134660549"
    },
    "lines": {
     "start": 62,
     "end": 76
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_e591dd0b32fdb6ba1963735638",
      "revision": 1
     },
     "representation": "text",
     "digest": "ed355b39ef3a68f05982badbf383ebded7a5612802511ade04ea01612de08863"
    },
    "quote": "packages/protocol/src/groups/board.ts:94:     HttpApiEndpoint.post(\"board.note\", \"/api/board/:key/issue/:number/note\", {"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_e3d17d92c730f5f7eb46d7dee5",
   "revision": 1
  },
  "proposition": "Inference for the design: review profiles and rigor levels belong in lucy's Seat definition plus a shipped skill tree (seat.skills), with any host-enforced rule in the review tool and settlement checks; changing lucy's prompt or profile changes reviewPolicyHash and rosterHash, which every validation and receipt binds, so in-flight validations go stale.",
  "nature": "inference",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_45b9eb50f1085b9c7bc601bc67",
      "revision": 1
     },
     "representation": "text",
     "digest": "96b9a33e54dff29279e623ef195b4c36295ca6da8d79d1bb4486f82398530130"
    },
    "lines": {
     "start": 170,
     "end": 190
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_cecab3ec31542dc9936e6c1e3a",
      "revision": 1
     },
     "representation": "text",
     "digest": "2b9f4b5e747dc06d1380f94f8aab39138a2018ccc886c0434825cb844937ac51"
    },
    "lines": {
     "start": 26,
     "end": 27
    }
   }
  ]
 }
]
