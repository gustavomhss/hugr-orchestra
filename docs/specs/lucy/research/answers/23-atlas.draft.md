# 23-atlas (DRAFT: close refused, claims not checked)

session ses_86f7da251c0944b8f3be9ddc8148164fb885fb5892a35a5a44d659f8564bb6e2

## Answer

**Conclusion.** Atlas has two layers, and lucy uses neither directly today. The first is a verified Own layer: the committed snapshot plus its guard. The second is Atlas Memory, per-seat records served through three host-bound tools. lucy is shut out of both: it has `atlasMemory: false`, and the closed owner list (`backend|jimmy|archie|live`) refuses it `atlas_context`, the memory tools and the running header. The tests pin that refusal. Atlas reaches a review only indirectly: lucy's plan-stage prompt asks it to judge the plan's "units and their Atlas grounding", which archie anchors.

**Premise correction.** A scoped search found no `foundation/atlas` in this worktree. Atlas lives in `modules/atlas` (with the `modules/atlas/boundary` bundle) plus Orchestra glue in `modules/maestro/coordination/src/v2/`.

**(1) What Atlas is**
- read: `modules/atlas/OWN-SNAPSHOT.json:1-35`. The snapshot has a `sourceRevision`, and each unit has `sourceBlobs`, invariants with tier, and an owner and tier. Today it holds a single unit, `packages/genesis` (owner `atlas-foundation`, T1).
- read: `modules/atlas/harness/gates/own-snapshot-guard.mjs:2-7`. The guard rejects stale blobs and drift, but "does not judge fact quality".
- read: `.github/workflows/atlas-guard.yml:3-7`. It runs on PRs that touch an anchored file, the snapshot or the Own skills. It is not required yet; that is a branch-protection setting the owner turns on.
- read: `.github/workflows/atlas-worklist.yml:3-6`. On each push to dev it uploads the stale-unit worklist. Repair (`atlas repair --worklist`) is manual, because CI has no Atlas store.
- read: `modules/maestro/coordination/src/v2/atlas-source.ts`. The runtime re-verifies the snapshot and holds explicitly (`source-revision-not-ancestor`, among others). A failure is never reported as an absence.

**(2) Atlas Memory**
- read: `modules/maestro/coordination/src/roster.ts:116`. `atlasMemory` grants `atlas_context`, `atlas_memory_recall` and `atlas_memory_emit`.
- read: `modules/maestro/coordination/src/seats/seat.ts:57-58`. Only backend, jimmy, archie and live may set the flag.
- read: `modules/maestro/coordination/src/v2/seats.ts:214-219`. The memory tools are hidden from every agent without the flag.
- read: `modules/maestro/coordination/src/v2/tools/atlas-memory.ts`. The host binds owner, project, root and the call.
  - Recall reaches only your own task or PR records, and the store state is complete, partial or unavailable.
  - Emit reconciles first, so an identical resubmission writes nothing new. A project rule is only proposed to the steward. Writes need gitleaks.
  - Entry templates: task `{attempted, failedWith, stoppedAt, lesson}` and PR `{prId, decisions, reviewOutcomes, knowledgeDelta}`.
- read: `modules/maestro/coordination/src/v2/atlas-header-source.ts`. A memory seat gets an `<atlas-header>` on every turn; every other agent gets none.
- Invalidation: no door removes a row (ownership skill, known limits).

**(3) How lucy appears today**
- read: `modules/maestro/coordination/src/seats/lucy.ts:5-17` (`profile: "review"`, `writeRoots: false`, `atlasMemory: false`).
- read: the v2-atlas tests use lucy only as the negative case:
  - `modules/maestro/coordination/test/v2-atlas-memory.test.ts:106-118`: memory tools return "not a supported native Atlas owner", with no permission ask.
  - `modules/maestro/coordination/test/v2-atlas-header.test.ts:119-124`: no header for lucy.
  - `modules/maestro/coordination/test/v2-atlas-restore.test.ts:99-102`: no Atlas Memory resume for lucy.
  - `modules/maestro/coordination/test/v2-atlas.test.ts:300-309`: `atlas_context` returns `native-atlas-owner-required`.
- read: `modules/maestro/coordination/src/v2/tools/review.ts:352`. The plan-stage prompt asks lucy to judge "units and their Atlas grounding".

**(4) How Own anchors could drive review (inferred)**
- Map each changed path to the unit whose `sourceBlobs` contains it. That gives the owner, the tier and the invariants, which become review checks.
- A changed anchored path whose snapshot was not refreshed is what atlas-guard blocks, so the same rule could become a lucy finding.
- The tier could choose required reviewers.
- Coverage is currently one unit, so this is mostly potential.

**(5) Gaps and constraints**
- Atlas keeps no reviewer-findings memory. `.atlas/project/review.jsonl` records curator holds, proposals and ratify decisions, not code-review findings (read: `modules/atlas/packages/adapter-io/src/review-log.ts:1-6`).
- Atlas has no hot-spot view.
- Enabling lucy needs a code change: add lucy to `seat.ts:57` and to `owner()` in `atlas-source.ts`, since `reader()` also refuses non-owners (read: `.orchestra/skills/atlas-maintenance/SKILL.md:70-72`).
- Memory writes land in the project directory and need gitleaks, which does not fit lucy's read-only role. A read-only `atlas_context` grant for lucy, like Maestro's `reader()`, is the lightest path.

**Not examined:** the Atlas CLI and MCP doors, the `native-header.d.ts` internals, `TERRITORY-CATALOG.json` contents, and the Atlas UI. Every behavioral claim here comes from reading code and tests; nothing was run.

**Reproduce:** `bun run test:ci maestro test/v2-atlas-memory.test.ts test/v2-atlas-header.test.ts test/v2-atlas-restore.test.ts test/v2-atlas.test.ts`

## Claims

[
 {
  "proposition": "OWN-SNAPSHOT.json pins a sourceRevision and per-unit sourceBlobs, invariants, owner and tier; it currently holds the packages/genesis unit, owned by atlas-foundation at T1.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_102a06596475fa06dd75b1818b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_895cbee02f37cb38523c84fab9",
      "revision": 1
     },
     "representation": "text",
     "digest": "81f5bd47c6f62521bb3e2bcafc527cef636d371269e6ade80b616bc262066935"
    },
    "lines": {
     "start": 1,
     "end": 35
    }
   }
  ]
 },
 {
  "proposition": "atlas-guard.yml runs the Own snapshot guard on PRs touching anchored sourceBlobs, the snapshot or Own skills, and making it required is an owner branch-protection setting; the guard rejects stale blobs and drift but does not judge fact quality.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_102a06596475fa06dd75b1818b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_63f381bed81102373f11fb2683",
      "revision": 1
     },
     "representation": "text",
     "digest": "4c3c46ece2975bee6301f8865353edaf70f2dcf75df2a543b8fd8b733659dfd8"
    },
    "lines": {
     "start": 3,
     "end": 7
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c97264a676cdea15e9b54dd051",
      "revision": 1
     },
     "representation": "text",
     "digest": "f123cfbb631d693fe1c1c4a9af068d9e37d8ce4983fbb20e70aea5a92714dfe6"
    },
    "lines": {
     "start": 2,
     "end": 7
    }
   }
  ]
 },
 {
  "proposition": "atlas-worklist.yml, on push to dev, uploads the stale-unit worklist; repair is a manual atlas repair --worklist where the store exists.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_102a06596475fa06dd75b1818b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b3ae888bcade2e8d8e47cbd4ca",
      "revision": 1
     },
     "representation": "text",
     "digest": "166939f3ae43d5275da41c520c840d5d577ba65f99ba963818f1e41b1d834ea7"
    },
    "lines": {
     "start": 3,
     "end": 6
    }
   }
  ]
 },
 {
  "proposition": "The Orchestra Own reader re-verifies the snapshot at runtime and fails with an explicit Held when the snapshot's sourceRevision is not an ancestor of HEAD.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_102a06596475fa06dd75b1818b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1ebbd4da43e424d8bc0dbbbaf6",
      "revision": 1
     },
     "representation": "text",
     "digest": "62fea869ed3107fbffadedc9ac6b8121f0c580f2d63cd913c1ab805eda8becc3"
    },
    "quote": "return yield* held(\"source-revision-not-ancestor\", [inspection.sourceRevision, head.text().trim()])"
   }
  ]
 },
 {
  "proposition": "A seat with atlasMemory gets atlas_context, atlas_memory_recall and atlas_memory_emit; seat definition refuses the flag for ids other than backend, jimmy, archie and live, and the memory tools are denied to agents without the flag.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_7beee3d629239d2ee1d27894cb",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8cb0acb3c8258d7e3d6d870a17",
      "revision": 1
     },
     "representation": "text",
     "digest": "23726b25161b8cbf19c214ddf85902f8c71970b2ec167e0ac99d1cc3b1c915cd"
    },
    "lines": {
     "start": 116,
     "end": 116
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_8490187f02f7cb10f5877c899e",
      "revision": 1
     },
     "representation": "text",
     "digest": "63254d1f75e18633caf00991ecb13afe560fde9c7d641564505ffb5fab6ca1d6"
    },
    "lines": {
     "start": 57,
     "end": 58
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_dd07c7ed75436f0bd89a82b0c2",
      "revision": 1
     },
     "representation": "text",
     "digest": "9832fa169cc4eca7c7ed119e0e13270bceda0843ce3f146d1b8c4a13177ce961"
    },
    "lines": {
     "start": 214,
     "end": 219
    }
   }
  ]
 },
 {
  "proposition": "Recall is scoped to the caller's own task/PR records; emit uses closed task/PR/project-rule templates, reconciles before writing, and proposes project rules to the steward rather than writing them.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_7beee3d629239d2ee1d27894cb",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d11fdf189d8a4b8369a6bf955b",
      "revision": 1
     },
     "representation": "text",
     "digest": "edb16abba8316fa77f7e6a0556551257023e737189daec925ca7e157bea14f0c"
    },
    "quote": "Only your own task and PR records are reachable; records of other memory owners, project rules and the logbook are not."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d11fdf189d8a4b8369a6bf955b",
      "revision": 1
     },
     "representation": "text",
     "digest": "edb16abba8316fa77f7e6a0556551257023e737189daec925ca7e157bea14f0c"
    },
    "quote": "const reconciled = memory.reconcile(entry)"
   }
  ]
 },
 {
  "proposition": "An Atlas Memory seat gets a running atlas-header (Awareness, Orientation, project rules) each turn, while a non-owner agent's turn gets an empty context source.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_7beee3d629239d2ee1d27894cb",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b32919ed76adcdf4ca18b76076",
      "revision": 1
     },
     "representation": "text",
     "digest": "454b4a1dd73c4d4dbf0383fc3fae3811e5dcf7d5bf15fdb7d8045cd1e1d89204"
    },
    "quote": "if (!member) return SystemContext.empty"
   }
  ]
 },
 {
  "proposition": "lucy is a read-only review seat with atlasMemory false and no write roots.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_ec7e10246ce25fa2d59e923c82",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_fc26ee1ae5c3a6d7cdfd176098",
      "revision": 1
     },
     "representation": "text",
     "digest": "061f813eee88736ec5683c8d25a06727ac82c2cffb7b1661a53b21d8d48c5c4f"
    },
    "lines": {
     "start": 5,
     "end": 17
    }
   }
  ]
 },
 {
  "proposition": "The v2-atlas tests use lucy as a refused case: memory tools return 'not a supported native Atlas owner', no header, no resume, and atlas_context returns native-atlas-owner-required.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_ec7e10246ce25fa2d59e923c82",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8b86d3a7ae9015ee6236fa115e",
      "revision": 1
     },
     "representation": "text",
     "digest": "5a300e546530b2cdb5b4fb2f481b29028abe98adf96872f88ee6514d946d52dc"
    },
    "lines": {
     "start": 106,
     "end": 118
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_35e3589b3e3b190cd33aef6638",
      "revision": 1
     },
     "representation": "text",
     "digest": "086de960e9fe6cdf1024db13e22037449142ad0eee2da2017a03ac63aaa9cbd4"
    },
    "lines": {
     "start": 119,
     "end": 124
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b7f8764c549e749bb547285658",
      "revision": 1
     },
     "representation": "text",
     "digest": "63f8bc2fb9de3fb8a34af78f1805796bb06e0fc39dddc9fe5502100e268074b7"
    },
    "lines": {
     "start": 99,
     "end": 102
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_1e5c029cf86be3678028db3d85",
      "revision": 1
     },
     "representation": "text",
     "digest": "08c2a260c6a6088ecbae2ddd425a28ea3a431dc1d29cd90427ef3c971d023bdc"
    },
    "lines": {
     "start": 300,
     "end": 309
    }
   }
  ]
 },
 {
  "proposition": "The plan-stage review prompt asks lucy to judge the plan's units and their Atlas grounding.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_ec7e10246ce25fa2d59e923c82",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_30d1456ceefbaaaf05076ea3b8",
      "revision": 1
     },
     "representation": "text",
     "digest": "6ba34980be77870f89a1f5695daf51e2746ee4312c3bd35d1382078584009264"
    },
    "lines": {
     "start": 352,
     "end": 352
    }
   }
  ]
 },
 {
  "proposition": "Own anchors could drive review by mapping each changed path to the unit whose sourceBlobs contains it, yielding owner, tier and invariants as checks, and treating an unrefreshed anchored change as a finding; with one anchored unit today the coverage is minimal.",
  "nature": "inference",
  "subquestion": {
   "id": "rque_47066a8388bcb5a7e40a13e92b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_895cbee02f37cb38523c84fab9",
      "revision": 1
     },
     "representation": "text",
     "digest": "81f5bd47c6f62521bb3e2bcafc527cef636d371269e6ade80b616bc262066935"
    },
    "lines": {
     "start": 12,
     "end": 35
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_63f381bed81102373f11fb2683",
      "revision": 1
     },
     "representation": "text",
     "digest": "4c3c46ece2975bee6301f8865353edaf70f2dcf75df2a543b8fd8b733659dfd8"
    },
    "lines": {
     "start": 3,
     "end": 7
    }
   }
  ]
 },
 {
  "proposition": "Atlas's review log records curator holds, tier proposals, ratify decisions, interview answers and memory proposals, not code-review findings.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_ad5e8fa1413897ff5d5e54d292",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_ff7300b16d5bbea44c6b18f5e7",
      "revision": 1
     },
     "representation": "text",
     "digest": "4c7dc9cd37a4c80d6a997f76a3bcf025a71e818d248e43e66c67778cce6e6083"
    },
    "lines": {
     "start": 1,
     "end": 6
    }
   }
  ]
 },
 {
  "proposition": "Enabling lucy requires changing the closed owner list: a seat with atlasMemory or an atlas_context grant but not in owner() is refused, and memory writes land in the project directory and need gitleaks.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_ad5e8fa1413897ff5d5e54d292",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d8876e649b3974e2d69f684149",
      "revision": 1
     },
     "representation": "text",
     "digest": "65ebd96ce852470e6629107f6dc685553831fde3da29ff33d811ca4f26a6ead3"
    },
    "lines": {
     "start": 70,
     "end": 72
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_4be649dd05a76aec38a3a3ffc1",
      "revision": 1
     },
     "representation": "text",
     "digest": "f1b8a43bb73b45727a7d36cf6c46cf6d02cd2019f8ce73ff4ef15b6030fd303e"
    },
    "lines": {
     "start": 46,
     "end": 46
    }
   }
  ]
 }
]
