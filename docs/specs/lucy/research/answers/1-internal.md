# 1-internal

session ses_2ee0a36425bf06c5df02f826b48ecfd37dcbefbbaa95be356d91c8a744303e21

## Answer

**Conclusion.** Lucy today is a thin stub seat: an 18-line definition and a 5-line prompt, with no skills, no workResult, no Atlas Memory, no research engine, no toolkit and no bash. All of its real behavior lives on the host: in `maestro_request_review`, which builds lucy's child Session and the whole review brief; in `maestro_record_review`/`recordReview`, which checks the receipt; and in the workflow `coldReview` settlement. A rebuild has to change the `define()` guards in `seat.ts`, which today hard-code which seat may have Atlas Memory, the research engine and the toolkit. One premise is false: there are no techlead or verify skills under `.orchestra/skills`. The verify material is Maestro playbooks, which seats are denied.

**(1) Seat, prompt, roster, permissions**
- read: `seats/lucy.ts:4-17`: profile `review`, `skills: []`, no `workResult`, and `atlasMemory`, `toolkit` and `strictResume` all false. Its `returnCard` is prose, not a fenced tag.
- read: `seats/prompt/lucy.txt:1-5`: five lines. It never mentions `maestro_record_review`, plan/code stages, the artifact or the checks.
- read: `roster.ts:49-56`: the review profile is `*` deny plus read (no .env), glob, grep, `maestro_record_review` and the truncation directory. No bash, so lucy cannot run tests, typecheck or `check:guards`. `roster.ts:89-91` keeps lucy on the historical profile hash.
- read: `v2/seats.ts:212`: `maestro_record_review` belongs only to lucy, and every other agent is denied it by rule.
- read: `ability-descriptors.ts:28-35`: the `tests` ability lists lucy, but with `tools: []`. Its profile has no bash.
- Host-enforced: the tool ownership, the profile floor, the gate in `review.ts:317`, and the brief in `review.ts:244-270`, which carries the stage text, the diff, the artifact JSON and the "MUST call `maestro_record_review` exactly once" line. Prompt-only: "correctness, regressions, security, missing tests" and "reject author transcript".

**(2) Governed flow**
- read: `review.ts:94-152`: validation is Maestro-only, needs a work-package contract and a current context, and returns its Bindings.
- read: `review.ts:154-310`: the request checks validation, session and context. For stage `code` it also requires an APPROVE plan review and the plan's writePaths. It builds the artifact (`planArtifact`: committed delta; `codeArtifact`: the workers' uncommitted tree), creates the lucy child, writes card threads, and returns `<VERDICT>: <id>` or one of the two failures. `LUCY_ERROR` (lines 282, 287) means the context changed or the run failed. `LUCY_NO_RECEIPT` (line 308) means lucy finished without recording.
- read: `review-records.ts:263-357`: the receipt is rejected for an invalid validation, self-review, a card-hash mismatch, a stale artifact or context, findings not on an added diff line (lines 506-519), APPROVE with findings, non-APPROVE without findings, or checks that differ from validation's. It is keyed per validation (plan) or per validation+tree (code); a conflicting second receipt fails.
- read: `review-records.ts:327`: `reviewMethodVersion` is only checked to be non-empty. `review-v1` is playbook prose (`governed/SKILL.md:50`), and a test uses `"v1"`.
- read: `maestro-event.ts:492-530`: `ReceivedV2` stores the artifact by digest, `reviewerID: "lucy"` as a literal, findings as `{path, line, message}`, and an optional stage.
- read: `settlement.ts:144-266`: `coldReview` holds the workflow with `WORKFLOW_COLD_REVIEW_MISSING/STALE`, `REQUIRED` (no code review yet) or `NOT_APPROVED` (FIX_FIRST or REJECT).

**(3) How the built seats are structured**
- read: `jimmy.ts:4-19`: 2 skills, `workResult: discovery-work-result-v1`, `strictResume`, `atlasMemory`, `research: true`.
- read: `archie.ts:4-31`: 3 skills, `upstream-work-result-v1`, `writeRoots`, `profileKey`.
- read: `backend.ts:5-41`: 8 skills including `team-stack`, `toolkit`, `mcp`.
- read: `seat.ts:60-73`: `define()` allows `atlasMemory` only for backend, jimmy, archie and live; `toolkit` only for backend; `research` only for jimmy.
- read: `seat.ts:93-97`: `skillSource` for lucy resolves to `packages/lucy-specialist/skills`.
- read: skill embedding goes through `seat-skills-module.ts` and `seat-skill-root.ts`. `script/seat-skills.ts`, which `maestro-ownership` cites, could not be read as a file.

**(4) What lucy could reuse**
- read: `review-checks/SKILL.md:1-44`: an L0–L10 review matrix that points to `maestro-repo-maintenance-reviewer-brief`. Both are Maestro playbooks, and seats are denied them (`v2/seats.ts` visibility).
- read: `.orchestra/skills` holds 33 entries, none named techlead or verify.
- read: `billy.ts` and `frankie.ts` are the same review-profile stub shape as lucy.

**(5) Gaps, contradictions and the tests that pin current behavior**
- read: the prompt's Forbidden line (`lucy.txt:5`) differs from `forbiddenActions` (`lucy.ts:9`), although `seat.ts` says the two must match item by item.
- read: validation rejects only `maestro` as `routedMemberID` (`review-records.ts:128`). A card routed to lucy is caught only later, as self-review (line 270).
- inferred: the `tests` ability for lucy is a dead path, because nothing grants it a runner.
- read: tests that pin the behavior: `test/v2-seats.test.ts:10-55`, `v2-tools.test.ts:222` and `:633`, `v2-chain.test.ts:441-463`, `v2-workflow-review.test.ts:213`, `v2-reservation.test.ts:54`, and `app-shell orchestra-governance-data.test.ts:147-204`.

**Not examined (time limit):** how Guardrail, test:ci, the merge queue and Atlas Memory internals would plug in; the Claude-host dispatch of lucy beyond `options.ts:13`; and whether a plain `task` dispatch of lucy could record a receipt.

**Reproduce:** `bun run test:ci maestro test/v2-seats.test.ts test/v2-tools.test.ts test/v2-chain.test.ts test/v2-workflow-review.test.ts`

## Claims

[
 {
  "subquestion": {
   "id": "rque_5cc144b5ed6b6469db3bcc93de",
   "revision": 1
  },
  "proposition": "Lucy's seat definition has profile review, no skills, no workResult, and atlasMemory/toolkit/strictResume false; its returnCard is prose, not a fenced tag.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7d4b2247b50fbc07e2122cb6cc",
      "revision": 1
     },
     "representation": "text",
     "digest": "061f813eee88736ec5683c8d25a06727ac82c2cffb7b1661a53b21d8d48c5c4f"
    },
    "lines": {
     "start": 4,
     "end": 17
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_5cc144b5ed6b6469db3bcc93de",
   "revision": 1
  },
  "proposition": "Lucy's prompt is five lines and never names maestro_record_review, the stages or the artifact; its Forbidden line differs from the seat's forbiddenActions.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_132a684eacbb2a678e72494ded",
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
      "id": "cart_7d4b2247b50fbc07e2122cb6cc",
      "revision": 1
     },
     "representation": "text",
     "digest": "061f813eee88736ec5683c8d25a06727ac82c2cffb7b1661a53b21d8d48c5c4f"
    },
    "lines": {
     "start": 9,
     "end": 9
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_5cc144b5ed6b6469db3bcc93de",
   "revision": 1
  },
  "proposition": "The review profile grants only read (no .env), glob, grep, maestro_record_review and the truncation directory; there is no bash.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_312143590275e5006fa5b74511",
      "revision": 1
     },
     "representation": "text",
     "digest": "ff4aef30aa50af3d3d4071d3666569e72b4307011aabf47b7d5dc12d2d612704"
    },
    "lines": {
     "start": 49,
     "end": 56
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_5cc144b5ed6b6469db3bcc93de",
   "revision": 1
  },
  "proposition": "maestro_record_review is owned only by lucy and denied to every other agent; the tests ability descriptor lists lucy with no tools.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_efd82a6463067f365da5d9fa9d",
      "revision": 1
     },
     "representation": "text",
     "digest": "c5ef3acf7edccf6d7ada6b2be4585fe8cd6ae748e2d456a318423d4a3224c451"
    },
    "lines": {
     "start": 212,
     "end": 212
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_551f7c38d81974ff43e20c633e",
      "revision": 1
     },
     "representation": "text",
     "digest": "969c0b98198b6519331a7b99cfa5f6de89fcc92d86ac9c6080cf3f1bda62c39f"
    },
    "lines": {
     "start": 28,
     "end": 35
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_45b68cc86447c43f2768703183",
   "revision": 1
  },
  "proposition": "maestro_request_review builds the plan or code artifact, creates the lucy child, injects the review brief that requires one maestro_record_review call, and returns a verdict, LUCY_ERROR or LUCY_NO_RECEIPT.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_ebdf238c88e062b132588c0534",
      "revision": 1
     },
     "representation": "text",
     "digest": "e36b1afc81eabb8f0b04c873b261b21a0b98e8c6024cc1da5ce19feae7eda534"
    },
    "lines": {
     "start": 154,
     "end": 310
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_45b68cc86447c43f2768703183",
   "revision": 1
  },
  "proposition": "recordReview rejects self-review, a work-card mismatch, findings not on added diff lines, APPROVE with findings, non-APPROVE without findings and check mismatches, and checks reviewMethodVersion only for non-emptiness.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_eeae1537a7dc782e9dd4d2ba31",
      "revision": 1
     },
     "representation": "text",
     "digest": "844deaab44192f9eb54d596f4be114f8bab7311ec3c8fa077686f7c10f36653b"
    },
    "lines": {
     "start": 266,
     "end": 357
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7faf9216a1667612fc9222fcb0",
      "revision": 1
     },
     "representation": "text",
     "digest": "feef6e379029487041036ecee5b8d8cb4cde4c0a23fdba4dbdf5f735681d1f02"
    },
    "lines": {
     "start": 506,
     "end": 519
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_45b68cc86447c43f2768703183",
   "revision": 1
  },
  "proposition": "The governed playbook prescribes review-v1, the plan stage then the code stage, and treats LUCY_ERROR/LUCY_NO_RECEIPT as no receipt.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_4c9c2684b18a1b54e730a54210",
      "revision": 1
     },
     "representation": "text",
     "digest": "d19f8c74fbfd10f537fdae37cab036d6e447c24284c85cf5712de44a308249c5"
    },
    "lines": {
     "start": 49,
     "end": 55
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_45b68cc86447c43f2768703183",
   "revision": 1
  },
  "proposition": "Workflow settlement coldReview holds without a bound lucy APPROVE plan receipt and a code receipt for the exact result tree.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0463a541a88e4936c55cc8ebc5",
      "revision": 1
     },
     "representation": "text",
     "digest": "c2cc10d1fe25f4d66b202684cc9bd743339355f64d0d6672ac7feadb66aa4231"
    },
    "lines": {
     "start": 144,
     "end": 266
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_45b68cc86447c43f2768703183",
   "revision": 1
  },
  "proposition": "The ReceivedV2 event stores reviewerID literal lucy, verdict, path/line findings, a digest-bound artifact and an optional stage.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_2746e15ad7132764bf34b2d16b",
      "revision": 1
     },
     "representation": "text",
     "digest": "c533241e6f1f55f3958c0ea766ad0df73fc61cf94ff88997f842de8d60dcf896"
    },
    "lines": {
     "start": 492,
     "end": 530
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_ed7b23bf41aff9a103380171bf",
   "revision": 1
  },
  "proposition": "The built seats declare skill roots, a workResult schema, strictResume and atlasMemory; jimmy adds research, backend adds toolkit/mcp, archie adds writeRoots/profileKey.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1e0dea937f55c1e6aee3b60d91",
      "revision": 1
     },
     "representation": "text",
     "digest": "9c94bd2f2bf33f0bbbdaf7930bad6dae2344e702d9b897548d6854ba06303de3"
    },
    "lines": {
     "start": 4,
     "end": 19
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_32ffab385bd51dbbe2029168cf",
      "revision": 1
     },
     "representation": "text",
     "digest": "6414e3330a80a2d41c62fdcdd6cdf4837042d0d72883d7e769c349cdc4cbd903"
    },
    "lines": {
     "start": 5,
     "end": 41
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_de2ad74ddd3be78a62044cda0c",
      "revision": 1
     },
     "representation": "text",
     "digest": "c570a75b68dca4caa4b0f914084eec3a44b9ecd48cd4b63e2a520f6d35b4ca54"
    },
    "lines": {
     "start": 4,
     "end": 31
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_ed7b23bf41aff9a103380171bf",
   "revision": 1
  },
  "proposition": "define() restricts atlasMemory to backend, jimmy, archie and live, toolkit to backend and research to jimmy; skillSource puts lucy's tree at packages/lucy-specialist/skills.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_4e90ba536fdc8e6db34d1584b5",
      "revision": 1
     },
     "representation": "text",
     "digest": "2b9f4b5e747dc06d1380f94f8aab39138a2018ccc886c0434825cb844937ac51"
    },
    "lines": {
     "start": 60,
     "end": 97
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_daad32b254917546dea8fd78a0",
   "revision": 1
  },
  "proposition": "The change-scoped review matrix and the reviewer brief are Maestro playbooks, not .orchestra skills; .orchestra/skills holds no techlead or verify skill.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f51ab73d16f206d8691f3b0bf5",
      "revision": 1
     },
     "representation": "text",
     "digest": "166185be52a683f1d67b4f80f0adb40b999567639ac0a5beb4b26fce2feb3a54"
    },
    "lines": {
     "start": 1,
     "end": 44
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_e4d3e1509a8d5eb99b8f16650f",
      "revision": 1
     },
     "representation": "text",
     "digest": "f36cfefca2e85e3961d7e0c4f1bb343271721c52c6b89cebfe28708d4fe3973c"
    },
    "quote": "33 hit(s)"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_daad32b254917546dea8fd78a0",
   "revision": 1
  },
  "proposition": "billy and frankie are the same review-profile stub shape as lucy, with no skills or memory.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_27993a3a932cb743b24958e172",
      "revision": 1
     },
     "representation": "text",
     "digest": "568f168b9fc3de712bcfea2312342f7945c61359c5c51036287ffc5c46821b9c"
    },
    "lines": {
     "start": 4,
     "end": 17
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_caf7b37474da3fe534d0ed68e4",
      "revision": 1
     },
     "representation": "text",
     "digest": "3a62105d69d98d889ea29bf6a192f7b2e5017c9e41c369404e0d40e0a23779ad"
    },
    "lines": {
     "start": 4,
     "end": 17
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_f6bc549d7d105668cf0224e7e6",
   "revision": 1
  },
  "proposition": "Validation rejects only the maestro member as routedMemberID; a card routed to lucy is caught only later as self-review in recordReview.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_eeae1537a7dc782e9dd4d2ba31",
      "revision": 1
     },
     "representation": "text",
     "digest": "844deaab44192f9eb54d596f4be114f8bab7311ec3c8fa077686f7c10f36653b"
    },
    "lines": {
     "start": 127,
     "end": 129
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_eeae1537a7dc782e9dd4d2ba31",
      "revision": 1
     },
     "representation": "text",
     "digest": "844deaab44192f9eb54d596f4be114f8bab7311ec3c8fa077686f7c10f36653b"
    },
    "lines": {
     "start": 270,
     "end": 270
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_f6bc549d7d105668cf0224e7e6",
   "revision": 1
  },
  "proposition": "Lucy's tests ability is a dead path: it is listed in the descriptor, but the review profile grants no runner.",
  "nature": "inference",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_551f7c38d81974ff43e20c633e",
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
      "id": "cart_312143590275e5006fa5b74511",
      "revision": 1
     },
     "representation": "text",
     "digest": "ff4aef30aa50af3d3d4071d3666569e72b4307011aabf47b7d5dc12d2d612704"
    },
    "lines": {
     "start": 49,
     "end": 56
    }
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_f6bc549d7d105668cf0224e7e6",
   "revision": 1
  },
  "proposition": "Lucy's floor and tool ownership are pinned by v2-seats.test.ts; the review flow is exercised in v2-tools, v2-chain, v2-workflow-review and the app-shell governance tests.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_85ee6ba1d513438933599d97f5",
      "revision": 1
     },
     "representation": "text",
     "digest": "77b7e436fbf3b64a5c050152c0aa11f20ff243e158e61021afe5e3ddcaa4b041"
    },
    "lines": {
     "start": 10,
     "end": 55
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_ead7990ece41d4e08252158cbd",
      "revision": 1
     },
     "representation": "text",
     "digest": "afa2089d743209036a5c47bfd1cf2452234d8a8d4c74a42992c94079fec6da25"
    },
    "quote": "23 hit(s)"
   }
  ]
 }
]
