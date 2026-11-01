# 23-atlas

session ses_9623892f9358a2438c111719f35af33b2716029abcce55533c09bb3bb73be1c7

## Answer

Premise correction: `foundation/atlas` does not exist in this worktree (no files there); Atlas lives in `modules/atlas` (CLI, packages, `harness/gates`, a generated `boundary` bundle) plus the Orchestra-side wiring in `modules/maestro/coordination/src/v2`. And `lucy` is NOT an Atlas Memory seat today: `lucy.ts` sets `atlasMemory: false`, `define()` refuses `atlasMemory` for any seat other than backend, jimmy, archie and live, and the v2-atlas tests use `lucy` only as the negative case (no header, no resume fold, recall/emit refused, `atlas_context` refused). So today lucy gets nothing from Atlas; giving it Atlas means changing code and the owner list, not configuration.

**(1) What Atlas guarantees**
- [read] `atlas-guard.yml` runs on PRs. It runs the Own snapshot guard only when the diff touches a path that `OWN-SNAPSHOT.json` anchors (`sourceBlobs`), the snapshot itself, or `modules/atlas/.orchestra/skills/own/`. Otherwise it stops after one `git diff` and passes. It is not a required check unless the owner turns that on in branch protection (`.github/workflows/atlas-guard.yml:3-7`, `:45-57`).
- [read] `own-snapshot-guard.mjs` recomposes every byte. It rejects missing or empty snapshots, output drift, stale source blobs and files outside the snapshot. It "does not judge fact quality" (`modules/atlas/harness/gates/own-snapshot-guard.mjs:1-7`). Its `--worklist` mode writes `{units:[{unit, stale:[path]}]}` for units whose anchored file is gone or whose blob changed (`:100-113`).
- [read] `atlas-worklist.yml` runs on every push to dev. CI has no Atlas store, so it only uploads that worklist as an artifact. A maintainer runs `atlas repair --worklist`; a stale unit is normal output, and only a missing worklist fails the job (`.github/workflows/atlas-worklist.yml:3-6`, `:51-64`).
- [read] At read time, `atlas-source.ts` `read()` verifies the provider config, the repository and the snapshot, and requires `sourceRevision` to be an ancestor of HEAD. It re-hashes the current source blobs and holds (never claims absence) on any mismatch or change during the read. `catalog` returns unit metadata plus territories with `owner`, `tier` and `globs`; `unit` returns complete, fresh, verified bytes.
- [read] The running header (`atlas-header-source.ts`) carries Awareness, Orientation and the seat's own project rules. It is added only when `owner()` resolves the turn's agent. It degrades to `rules-partial` or `unavailable` and never fails the turn.

**(2) Atlas Memory**
- [read] Grants: `roster.ts:116` allows `atlas_context`, `atlas_memory_recall` and `atlas_memory_emit` to any seat with `atlasMemory`. `v2/seats.ts:213-218` hides recall and emit from every other agent.
- [read] Each call checks the caller again: `owner()` admits only native seats whose definition has `atlasMemory` and whose id is in the closed list. `bind` refuses everyone else before any permission ask.
- [read] Storage is bound by the host, not the model: the project directory (or the Location directory) at HEAD, with owner and call identity. Writes are scanned with gitleaks.
- [read] `emit` reconciles first, so an identical entry is not written twice. A project rule is only *proposed* to the steward. Outcomes are admitted, proposed, refused, unavailable or uncertain.
- [read] `recall` reaches only the caller's own task or PR records. Other owners' records, project rules and the logbook are unreachable through it.
- I found no explicit invalidation path in this code. Freshness applies to Own units (blob checks), not to memory entries.
- [read] Tests pin this:
  - `v2-atlas-memory.test.ts`: maestro and lucy are refused before any permission ask (`:105-118`); backend writes once, a resubmission is reconciled, then backend recalls it (`:120-159`).
  - `v2-atlas.test.ts:300-308`: `atlas_context` is refused for `lucy` with `native-atlas-owner-required`.
  - `v2-atlas-header.test.ts:119-123`: no header for maestro, lucy or general.
  - `v2-atlas-restore.test.ts:99-102`: the resume fold never reaches lucy.

**(3) What lucy gets today**
- [read] Its only governed tool is `maestro_record_review` (`v2/seats.ts:212`).
- [read] Its prompt is a cold diff review, with no Atlas guidance (`seats/prompt/lucy.txt:1-5`).
- [read] Atlas design docs give cold reviewers (lucy, bobby) a veto at wave-close ratification, and a T0 territory also requires billy (`modules/atlas/docs/design/atlas.md:213-214`). That is design text, not a runtime gate.

**(4) Anchors driving review (inferred)**
For a changed file, a reviewer could:
1. Match the file against the snapshot's `sourceBlobs` and the territory `globs` from `catalog`, to get the unit, owner and tier.
2. Load that unit's verified body with `unit`, to check the diff against the invariants it states.
3. Report stale anchors the way the guard or worklist computes them, as findings.

None of this is wired today. There is no per-anchor reviewer or required-check field in the Atlas, boundary or maestro sources (a search for `reviewers` found nothing).

**(5) Gaps and constraints**
- [read] lucy has `writeRoots: false` and `atlasMemory: false`; enabling memory needs edits to `seat.ts` `define()`, the `Owner` type and `owner()`.
- [inferred] Even as an owner, recall is self-scoped. There is no read of other seats' findings, no record of accepted or dismissed findings, and no hot-spot or churn view.
- [inferred] `atlas_context` read-only access (catalog and unit) is the low-risk entry point, because `reader()` already extends it to Maestro.

Not examined: the Atlas CLI and MCP-server doors in `modules/atlas/packages`, the boundary sources behind `native-memory` and `native-header`, and `v2/tools/review.ts`. I narrowed scope after the earlier rerun failed its check. I ran no probe: behavior is read from code and tests. To reproduce: `bun run test:ci maestro test/v2-atlas-memory.test.ts test/v2-atlas.test.ts test/v2-atlas-header.test.ts test/v2-atlas-restore.test.ts`.

## Claims

[
 {
  "proposition": "lucy is defined as a read-only review seat with writeRoots false and atlasMemory false, and its only governed tool is maestro_record_review.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_06fb55c4cf8bb9df908db19593",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_9e5620bb18431bb27ccf7f1f81",
      "revision": 1
     },
     "representation": "text",
     "digest": "061f813eee88736ec5683c8d25a06727ac82c2cffb7b1661a53b21d8d48c5c4f"
    },
    "lines": {
     "start": 5,
     "end": 17
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_5a5ea3003d437dd415b2e2a7af",
      "revision": 1
     },
     "representation": "text",
     "digest": "520af18d0a5cb0eaf353c10bf0003ca1005076864c87fc11edd45bc00e9b8a41"
    },
    "quote": "{ tools: [\"maestro_record_review\"], agents: [\"lucy\"] },"
   }
  ]
 },
 {
  "proposition": "Atlas Memory is restricted by define() and owner() to the closed list backend, jimmy, archie, live; any other seat with atlasMemory throws at definition time.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_4d547500270cfc2327a9fd9bbc",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_dbf1b32688b0f00887ddc66333",
      "revision": 1
     },
     "representation": "text",
     "digest": "11b4ddc01880c0efe2f3c233768be49255245982a4f9cb9ce7163b83ad7adeea"
    },
    "quote": "throw new Error(`Atlas Memory supports only backend, jimmy, archie and live owners: ${seat.id}`)"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_8874330762550d0575c63d9d14",
      "revision": 1
     },
     "representation": "text",
     "digest": "62fea869ed3107fbffadedc9ac6b8121f0c580f2d63cd913c1ab805eda8becc3"
    },
    "quote": "if (!seats.has(id) || Seats.all[id]?.atlasMemory !== true) return undefined"
   }
  ]
 },
 {
  "proposition": "Seats with atlasMemory are granted atlas_context, atlas_memory_recall and atlas_memory_emit in roster.ts, and recall/emit are hidden from every other agent by the visibility owners list.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_4d547500270cfc2327a9fd9bbc",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0c00b0b3f371bde82b76277150",
      "revision": 1
     },
     "representation": "text",
     "digest": "337d202b6370a9e932b9540c1b9e3f51608de4fd6257e953e1b84897c9e71a19"
    },
    "quote": "...(seat.atlasMemory ? { atlas_context: \"allow\" as const, atlas_memory_recall: \"allow\" as const, atlas_memory_emit: \"allow\" as const } : {}),"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_5a5ea3003d437dd415b2e2a7af",
      "revision": 1
     },
     "representation": "text",
     "digest": "520af18d0a5cb0eaf353c10bf0003ca1005076864c87fc11edd45bc00e9b8a41"
    },
    "quote": "tools: [\"atlas_memory_recall\", \"atlas_memory_emit\"],"
   }
  ]
 },
 {
  "proposition": "Memory storage and owner are bound by the host per call to the project worktree at HEAD; emit reconciles before writing, project rules are only proposed to the steward, and recall reaches only the caller's own task/PR records.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_4d547500270cfc2327a9fd9bbc",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0c8a4f3d47a96ffbce38fab221",
      "revision": 1
     },
     "representation": "text",
     "digest": "edb16abba8316fa77f7e6a0556551257023e737189daec925ca7e157bea14f0c"
    },
    "quote": "root: services.location.vcs?.type === \"git\" ? services.location.project.directory : services.location.directory,"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0c8a4f3d47a96ffbce38fab221",
      "revision": 1
     },
     "representation": "text",
     "digest": "edb16abba8316fa77f7e6a0556551257023e737189daec925ca7e157bea14f0c"
    },
    "quote": "// A project rule is proposed for the steward; the member never writes it itself."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0c8a4f3d47a96ffbce38fab221",
      "revision": 1
     },
     "representation": "text",
     "digest": "edb16abba8316fa77f7e6a0556551257023e737189daec925ca7e157bea14f0c"
    },
    "quote": "Only your own task and PR records are reachable; records of other memory owners, project rules and the logbook are not."
   }
  ]
 },
 {
  "proposition": "Tests pin lucy as the negative case: v2-atlas-memory refuses maestro and lucy before any permission ask; v2-atlas refuses atlas_context for lucy; v2-atlas-header gives lucy no header; v2-atlas-restore keeps the resume fold from lucy.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_06fb55c4cf8bb9df908db19593",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b5488006a7d41db3ae8bf45faa",
      "revision": 1
     },
     "representation": "text",
     "digest": "c9731f94bb8a3acbf90173bc405ef33a39f31a558525b64f7868d5de0fdbd142"
    },
    "lines": {
     "start": 105,
     "end": 118
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f82a7d597b1c908153dd2c0d67",
      "revision": 1
     },
     "representation": "text",
     "digest": "e360bd0d69bb6aead9aca42cfe1f9573fa3d87aed7d6c794822dbf19696eff12"
    },
    "lines": {
     "start": 300,
     "end": 308
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6db711acb72f85e61925da0cf8",
      "revision": 1
     },
     "representation": "text",
     "digest": "252a7e0571e8a75eb1a85923fef0bbcfa1dda2e3ed514cf455b2365068595c16"
    },
    "lines": {
     "start": 119,
     "end": 123
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7e9d31e320ffefc8bd948b6873",
      "revision": 1
     },
     "representation": "text",
     "digest": "6d6af4ca6df6e43e583442fa7f4244274ae974985dc2dd7c02609a08c2dcc1b1"
    },
    "lines": {
     "start": 99,
     "end": 102
    }
   }
  ]
 },
 {
  "proposition": "A backend memory seat writes a record once, an identical resubmission is reconciled to the same ref, and recall returns it.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_4d547500270cfc2327a9fd9bbc",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b5488006a7d41db3ae8bf45faa",
      "revision": 1
     },
     "representation": "text",
     "digest": "c9731f94bb8a3acbf90173bc405ef33a39f31a558525b64f7868d5de0fdbd142"
    },
    "lines": {
     "start": 120,
     "end": 159
    }
   }
  ]
 },
 {
  "proposition": "atlas-guard.yml runs the Own snapshot guard only on PRs touching OWN-SNAPSHOT.json anchored sourceBlobs, the snapshot, or static Own skills; required status is a branch-protection choice. atlas-worklist.yml runs on every dev push and only uploads the stale-source worklist for a maintainer to run atlas repair.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_b00336d5914d0c5ca433d0548e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3ef45f8c1d44dbc2db16a22170",
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
      "id": "cart_6c6e6a54c71162fa5ca0bf9bd4",
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
  "proposition": "The own-snapshot guard recomposes every byte, rejects stale source blobs and drift but does not judge fact quality; its worklist lists, per unit, anchored paths that are missing or whose current blob differs.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_32608b3e0604521f890c68f2ae",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_5f50b16c7d9cdd4f76cccfb881",
      "revision": 1
     },
     "representation": "text",
     "digest": "335632960a802626ed04b64c111a5598aff04013c6adb5f15da0a3bbc102bc1d"
    },
    "lines": {
     "start": 2,
     "end": 7
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_49818523ec01a172930068abf9",
      "revision": 1
     },
     "representation": "text",
     "digest": "8d12979fa067e7c0c48e59c47c568dba973595ff3f92f772dd3c1002ac5f1653"
    },
    "lines": {
     "start": 100,
     "end": 113
    }
   }
  ]
 },
 {
  "proposition": "The verified Own catalog exposes territories with owner, tier and globs, and read() holds unless the snapshot sourceRevision is an ancestor of HEAD and current blobs verify.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_32608b3e0604521f890c68f2ae",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8874330762550d0575c63d9d14",
      "revision": 1
     },
     "representation": "text",
     "digest": "62fea869ed3107fbffadedc9ac6b8121f0c580f2d63cd913c1ab805eda8becc3"
    },
    "quote": "      owner: territory.owner,\n      tier: territory.tier,\n      globs: territory.globs,"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_8874330762550d0575c63d9d14",
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
  "proposition": "The running header is added only to turns of a resolved Atlas Memory owner and degrades explicitly instead of failing the turn.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_b00336d5914d0c5ca433d0548e",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c8c28a380545c5c8fbe6fba95e",
      "revision": 1
     },
     "representation": "text",
     "digest": "454b4a1dd73c4d4dbf0383fc3fae3811e5dcf7d5bf15fdb7d8045cd1e1d89204"
    },
    "quote": "const member = turn && MaestroAtlasSourceV2.owner(turn.agent, seats)\n        if (!member) return SystemContext.empty"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c8c28a380545c5c8fbe6fba95e",
      "revision": 1
     },
     "representation": "text",
     "digest": "454b4a1dd73c4d4dbf0383fc3fae3811e5dcf7d5bf15fdb7d8045cd1e1d89204"
    },
    "quote": "degraded=\"unavailable\">Degraded: Atlas memory is unavailable (${reason}); no project rules are loaded.</atlas-header>"
   }
  ]
 },
 {
  "proposition": "atlas_context readers are the memory owners plus Maestro; anchor is archie-only; everyone else gets native-atlas-owner-required.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_23d6bfb1783f4498ff0bd306b4",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8874330762550d0575c63d9d14",
      "revision": 1
     },
     "representation": "text",
     "digest": "62fea869ed3107fbffadedc9ac6b8121f0c580f2d63cd913c1ab805eda8becc3"
    },
    "quote": "if (id === AgentV2.defaultID) return \"maestro\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_17a5389f37edaf91fc37c30afc",
      "revision": 1
     },
     "representation": "text",
     "digest": "ec5759c3cac99600d33bdeb7771841527d16bf133fa08a9d76a4c1351bbeb731"
    },
    "lines": {
     "start": 92,
     "end": 93
    }
   }
  ]
 },
 {
  "proposition": "Atlas design text gives cold reviewers lucy and bobby a veto at wave-close ratification, with billy additionally required for T0 territories; no runtime per-anchor reviewer or required-check field exists in Atlas, boundary or maestro sources.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_32608b3e0604521f890c68f2ae",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_2578d6b1a82b86445e82001170",
      "revision": 1
     },
     "representation": "text",
     "digest": "c2c286e550847409830525ac1e944111c2ddeb19e390c7079cf5626e2bec97c2"
    },
    "lines": {
     "start": 213,
     "end": 214
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_dd3f4f0338baf40f06954a0975",
      "revision": 1
     },
     "representation": "text",
     "digest": "f056a3abb6425b92dfedf1fe9c6584dee61cfdd8f72a4dfab9c5848e66a35847"
    },
    "quote": "0 hit(s)"
   }
  ]
 },
 {
  "proposition": "lucy's prompt is a cold diff review with no Atlas guidance, so a reviewer integration would need prompt plus seat changes; even as an owner, recall is self-scoped, so cross-seat findings history, accepted/dismissed findings and hot spots are not exposed.",
  "nature": "inference",
  "subquestion": {
   "id": "rque_23d6bfb1783f4498ff0bd306b4",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_02ced10e3f0d52377b7bb1d324",
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
      "id": "cart_0c8a4f3d47a96ffbce38fab221",
      "revision": 1
     },
     "representation": "text",
     "digest": "edb16abba8316fa77f7e6a0556551257023e737189daec925ca7e157bea14f0c"
    },
    "quote": "Only your own task and PR records are reachable; records of other memory owners, project rules and the logbook are not."
   }
  ]
 },
 {
  "proposition": "foundation/atlas does not exist in this worktree; Atlas sources are under modules/atlas.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_b00336d5914d0c5ca433d0548e",
   "revision": 1
  },
  "scope": "universal",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_1964fc706870b38908061c4182",
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
