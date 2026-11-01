# 12-systems-engineering

session ses_4ec34e5280abec5ddc61cae37fea9c520576a279e8900287829175cba8dc7fdb

## Answer

An expert reviewer in these areas mostly asks what happens on the failure path. They check error handling, interleavings, rollout and schema changes. An AI reviewer can only claim a finding when it produced the evidence: a race-instrumented or model-checked run, a recorded history checked by a history checker, a profile or a benchmark on adversarial input, or a migration rehearsal. In this repo, the guards cover migrations, unsafe Rust and generated SDK drift. Nothing in CI checks concurrency or performance regressions dynamically.

**Concurrency and distributed systems**
- Race detectors only catch races on code paths that actually run. Go `-race` costs 5–10x memory and 2–20x time; TSan costs 5–15x time and needs every module instrumented. A green normal suite proves nothing here: the evidence is a race-enabled run of a test that drives the concurrent path. (read: go.dev race_detector; clang ThreadSanitizer docs)
- Model and history checkers settle what tests can't:
  - loom permutes executions under the C11 memory model, but it is not sound for load buffering.
  - Porcupine checks a recorded history against an executable spec for linearizability.
  - Elle infers Adya dependency graphs and returns counterexamples for isolation anomalies. (read: loom README, Porcupine README, arXiv 2003.10554)

**Reliability**
- Error handling is the highest-yield thing to review. In 198 real failures across Cassandra, HBase, HDFS, MapReduce and Redis, most catastrophic ones could have been prevented by simple tests of error-handling code, and almost all failures reproduce with 3 nodes or fewer. (read: Yuan et al., OSDI'14)
- Cloudflare's 2 July 2019 outage passed PR review and CI. Its listed causes map to review items:
  - a backtracking regex
  - a CPU safeguard deleted by mistake in a refactor
  - no CPU check in the test suite
  - global rollout with no staging (read: Cloudflare postmortem)

**Performance**
- Total CI run time is not a performance gate. In the Cloudflare case, the test logs showed no increase in suite run time with the bad rule. The gate has to be an explicit profile or a benchmark on adversarial input sizes. (read: Cloudflare postmortem)

**Data and API evolution**
- SQLite `ALTER TABLE` supports only:
  - rename table
  - rename column
  - add column
  - drop column
  - SET/DROP NOT NULL, since 3.53.0

  `ADD COLUMN ... NOT NULL` needs a non-NULL default. Any other change needs the 12-step procedure: create the new table, copy, drop the old one, rename, inside a transaction, then run `foreign_key_check`. Renaming the old table first can corrupt references from triggers, views and foreign keys. (read: sqlite.org/lang_altertable.html)
- SemVer requires a declared public API. Any backward-incompatible change to it means a major version bump, and a released version must never be modified. A breaking-change check therefore needs a declared API surface to compare against. (read: semver.md)

**Existing repo guards**
- Migrations: `migration-destructive` is a gate on DROP TABLE/COLUMN, TRUNCATE and unbounded DELETE; `migration-edited` is a gate on edits to shipped migrations; `migration-add-required-column` is a warning. (read: script/guards/rules/migration-destructive.toml:1-14, migration-edited.toml:9, migration-add-required-column.toml:3)
- Rust (omni): the workspace lints deny undocumented `unsafe`, `unsafe_op_in_unsafe_fn`, `unwrap`, `expect` and `panic`; the CI gate runs `clippy -D warnings`; the qa crate forbids `unsafe_code`. (read: native/omni/Cargo.toml:26-35, native/omni/scripts/ci.mjs:51, native/omni/qa/Cargo.toml:22)
- No dynamic concurrency checking in CI: no workflow or omni Cargo/lib file mentions loom, miri, `-race` or a sanitizer. (read: search over 39 files, coverage complete)
- Generated SDK drift: `packages/client` has `check:generated` (regenerate, then fail on `git diff`), and the Atlas boundary's `check:generated` runs in the repo gates in `test.yml`. Process spawning is fenced by `check:spawn-imports`. (read: packages/client/package.json:14, .github/workflows/test.yml:289-293, package.json:16)
- None of the guard rule names covers concurrency, performance, retries/timeouts or API compatibility. Those are left to tests and human review. (inferred from the rule list)

**Not examined:**
- Not read: the SRE book's cascading-failures chapter (fetched only), the Postgres locking docs, benchstat and statistical benchmarking sources, and the Effect, Bun and Electron runtime docs. Advice on those topics is uncited here.
- Two items are still open: the last few guard rules alphabetically were not seen, and it's unclear whether the client's `check:generated` itself runs in CI.

**Reproduce:**
- `bun run check:guards --base origin/dev`
- `cd packages/client && bun run check:generated`
- `cd native/omni && node scripts/ci.mjs`

## Claims

[
 {
  "subquestion": {
   "id": "rque_3877932f575b685538663df4da",
   "revision": 1
  },
  "proposition": "Dynamic race detectors only find races on executed paths and are expensive: Go's -race finds races only in code that runs (memory 5-10x, time 2-20x); TSan costs about 5x-15x time and 5x-10x memory and needs all code instrumented. So an AI reviewer's evidence is a race-enabled run of a test that actually exercises the concurrent path, not a green ordinary suite.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_79439f83037dd7c2fc394d8a3e",
      "revision": 1
     },
     "representation": "text",
     "digest": "7e671df5d2a9f2760c92e6006a1428f45208804e686b4180ff13d614d095980f"
    },
    "quote": "The race detector only finds races that happen at runtime, so it can't find\nraces in code paths that are not executed."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_382eb2f6088f09c64bfca4fcb5",
      "revision": 1
     },
     "representation": "text",
     "digest": "03e22cd41e6bd7ce7073119c746ae9714740d7f06949143dbb6d88b5ec7dbcc1"
    },
    "quote": "Typical slowdown introduced by\nThreadSanitizer is about 5x-15x."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_3877932f575b685538663df4da",
   "revision": 1
  },
  "proposition": "Model checkers and history checkers decide what tests cannot: loom permutes executions under the C11 memory model (but is not sound for load buffering, and treats SeqCst as AcqRel); Porcupine checks a recorded concurrent history against an executable sequential spec for linearizability; Elle infers Adya-style dependency graphs to find isolation anomalies and give counterexamples.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0c5ba4a414e01476dcbd09b8e8",
      "revision": 1
     },
     "representation": "text",
     "digest": "1c0d0db3f1332c7a9591928d618b5ab35a7196f641c6da966b78753377e64a74"
    },
    "quote": "It runs a test many\ntimes, permuting the possible concurrent executions of that test under\nthe [C11 memory model][spec]."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0c5ba4a414e01476dcbd09b8e8",
      "revision": 1
     },
     "representation": "text",
     "digest": "1c0d0db3f1332c7a9591928d618b5ab35a7196f641c6da966b78753377e64a74"
    },
    "quote": "there can be a bug in the checked code even if Loom says\n  there is no bug (not sound)."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_044ff091a80692ce9579ce72b5",
      "revision": 1
     },
     "representation": "text",
     "digest": "4e79c7c7abe2ffc1d7888d7f24f91bf61f6f247d1041e54976c5045fbbdb3a58"
    },
    "quote": "It takes a\nsequential specification as executable Go code, along with a concurrent\nhistory, and it determines whether the history is linearizable with respect to\nthe sequential specification."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_55980f0ec9ec43926e2af0d7d3",
      "revision": 1
     },
     "representation": "text",
     "digest": "4eb917301ed2302a571eab0a718c1996038e7f2b8070c77ab3675bd33265a638"
    },
    "quote": "We present Elle: a novel checker which infers an Adya-style dependency graph between client-observed transactions."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_b05d80d869f7fdfee4d628810d",
   "revision": 1
  },
  "proposition": "Reviewing error-handling code is the highest-yield reliability check: in 198 user-reported failures of Cassandra, HBase, HDFS, MapReduce and Redis, most catastrophic failures could have been prevented by simple testing of error handling, and almost all failures reproduce with 3 or fewer nodes.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a0f28aa33ff97ea9cbe36e876c",
      "revision": 1
     },
     "representation": "text",
     "digest": "877a932e96bc728e26142db6a92bbf1118e5580650be5b26969ebdd8893bab0c"
    },
    "quote": "We found the majority of catastrophic failures could easily have been prevented by performing simple testing on error handling code"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a0f28aa33ff97ea9cbe36e876c",
      "revision": 1
     },
     "representation": "text",
     "digest": "877a932e96bc728e26142db6a92bbf1118e5580650be5b26969ebdd8893bab0c"
    },
    "quote": "almost all failures require only 3 or fewer nodes to reproduce"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_b05d80d869f7fdfee4d628810d",
   "revision": 1
  },
  "proposition": "The Cloudflare 2 July 2019 outage passed PR review and CI; its listed causes include a backtracking regex, a CPU protection removed by mistake in a refactor, no CPU check in the test suite, and an SOP allowing global rollout without staging. Each is a reviewable item: regex engine complexity, removed safeguards in a diff, performance gating, and staged rollout.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f268de1f47bdef45af3c342138",
      "revision": 1
     },
     "representation": "text",
     "digest": "7638b34da73f13ad1426739bc9a9cd19b6916d42ef7ec3bacf70b0937b7c37d0"
    },
    "quote": "A protection that would have helped prevent excessive CPU use by a regular expression was removed by mistake during a refactoring of the WAF weeks prior"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f268de1f47bdef45af3c342138",
      "revision": 1
     },
     "representation": "text",
     "digest": "7638b34da73f13ad1426739bc9a9cd19b6916d42ef7ec3bacf70b0937b7c37d0"
    },
    "quote": "The test suite didn’t have a way of identifying excessive CPU consumption."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f268de1f47bdef45af3c342138",
      "revision": 1
     },
     "representation": "text",
     "digest": "7638b34da73f13ad1426739bc9a9cd19b6916d42ef7ec3bacf70b0937b7c37d0"
    },
    "quote": "The SOP allowed a non-emergency rule change to go globally into production without a staged rollout."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_82c1f475d6a06f4de7321d95aa",
   "revision": 1
  },
  "proposition": "The Cloudflare postmortem says previous WAF test logs showed no increase in suite run time with the bad rule. So wall-clock CI time is not a performance gate; a reviewer needs an explicit profile or a benchmark on adversarial input sizes.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f268de1f47bdef45af3c342138",
      "revision": 1
     },
     "representation": "text",
     "digest": "7638b34da73f13ad1426739bc9a9cd19b6916d42ef7ec3bacf70b0937b7c37d0"
    },
    "quote": "examining the log files from previous WAF builds shows that no increase in test suite run time was observed with the rule that would ultimately cause CPU exhaustion on our edge"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_8f111bb9437416fd4cb9aa7435",
   "revision": 1
  },
  "proposition": "SQLite ALTER TABLE supports only rename table, rename column, add column and drop column (plus SET/DROP NOT NULL since 3.53.0). ADD COLUMN NOT NULL needs a non-NULL default. Any other change needs the 12-step create-new/copy/drop/rename procedure in a transaction, with foreign_key_check. The rename-old-first order can corrupt references.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_fdda132ef5b0fe235ed2b63c15",
      "revision": 1
     },
     "representation": "text",
     "digest": "8dcb6781057dc299d1bec9b28f710f6ce4c8ef5614b0335386788cf001cf6462"
    },
    "quote": "If a NOT NULL constraint is specified, then the column must have a\n    default value other than NULL."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_fdda132ef5b0fe235ed2b63c15",
      "revision": 1
     },
     "representation": "text",
     "digest": "8dcb6781057dc299d1bec9b28f710f6ce4c8ef5614b0335386788cf001cf6462"
    },
    "quote": "In the procedure on the right, the initial rename of the\ntable to a temporary name might corrupt references to that table in\ntriggers, views, and foreign key constraints."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_8f111bb9437416fd4cb9aa7435",
   "revision": 1
  },
  "proposition": "SemVer requires a declared public API; any backward-incompatible public API change requires a major bump, and a released version must never be modified. Breaking-change review is therefore relative to a declared API surface.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8b3ed195766754ccd3bf83eb23",
      "revision": 1
     },
     "representation": "text",
     "digest": "33ebae1a97845991d0b916f3295a88b499e2ec71a6c1fe84c12429077b19ce08"
    },
    "quote": "Software using Semantic Versioning MUST declare a public API."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_8b3ed195766754ccd3bf83eb23",
      "revision": 1
     },
     "representation": "text",
     "digest": "33ebae1a97845991d0b916f3295a88b499e2ec71a6c1fe84c12429077b19ce08"
    },
    "quote": "Major version X (X.y.z | X > 0) MUST be incremented if any backward\nincompatible changes are introduced to the public API."
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_67bcc1cfa64f67763f84be96e5",
   "revision": 1
  },
  "proposition": "Existing repo guards cover migrations: the gate migration-destructive flags DROP TABLE/COLUMN, TRUNCATE and unbounded DELETE in packages/core/src/database/migration; migration-edited gates edits to shipped migrations; a warn rule migration-add-required-column exists.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0055f7cc9c5f3d184b44201fcd",
      "revision": 1
     },
     "representation": "text",
     "digest": "36041496113b7321d55e6350dfc590b1a55875219a98d395a435a71a6057dc28"
    },
    "lines": {
     "start": 1,
     "end": 14
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_dafcb07f5f61480b56cbd18e67",
      "revision": 1
     },
     "representation": "text",
     "digest": "ff66825670c6081c156c30e9bdfacc4324ea7b7fd6aa4968f4563709740d390b"
    },
    "quote": "Existing migration modified, renamed or deleted. Shipped migrations are immutable; add a new one."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_8a99a86170e0feb31ee0b30b0a",
      "revision": 1
     },
     "representation": "text",
     "digest": "745554e4798a65116374c47421b19146531f70a529e54d48a90ef1d6834f5641"
    },
    "quote": "script/guards/rules/migration-add-required-column.toml:3: severity = \"warn\""
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_67bcc1cfa64f67763f84be96e5",
   "revision": 1
  },
  "proposition": "The Rust omni workspace denies undocumented unsafe blocks, unsafe_op_in_unsafe_fn, unwrap/expect/panic through workspace lints, and its CI gate runs clippy with -D warnings; the qa crate forbids unsafe_code.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_e891857aaa04bafc2642ab60c1",
      "revision": 1
     },
     "representation": "text",
     "digest": "97c7a9ccc6780c2f5d2ab1611daff2dcccd8a3f6daeddd57c39ad10361f0aa9c"
    },
    "lines": {
     "start": 26,
     "end": 35
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_9e980487224039967551e87720",
      "revision": 1
     },
     "representation": "text",
     "digest": "b9d580c93761a5437e794229d985eb0430a07ada45e84e91098d0c72a2b8ef53"
    },
    "lines": {
     "start": 51,
     "end": 51
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c9e8bc5405ba02b35efeb96383",
      "revision": 1
     },
     "representation": "text",
     "digest": "f4d281995524997c99f49371bf7d58975d8024832411e4ecd7036878b6d12ae2"
    },
    "quote": "native/omni/qa/Cargo.toml:22: unsafe_code = \"forbid\""
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_67bcc1cfa64f67763f84be96e5",
   "revision": 1
  },
  "proposition": "No workflow in .github/workflows and no omni Cargo/lib file searched mentions loom, miri, -race or a sanitizer; the only hits for the search were cargo test, clippy and check:generated. Within that scope, no dynamic concurrency checker runs in CI.",
  "nature": "observation",
  "scope": "universal",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c9e8bc5405ba02b35efeb96383",
      "revision": 1
     },
     "representation": "text",
     "digest": "f4d281995524997c99f49371bf7d58975d8024832411e4ecd7036878b6d12ae2"
    },
    "quote": "8 hit(s)\ncoverage: files=39 ignoreRespected=true binariesSkipped=0 complete=true"
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_67bcc1cfa64f67763f84be96e5",
   "revision": 1
  },
  "proposition": "Generated SDK drift has a check script: packages/client check:generated regenerates and fails on git diff in src/generated and src/generated-effect; the Atlas boundary's check:generated runs in test.yml repo gates. Process spawning is fenced by check:spawn-imports.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_dafcb07f5f61480b56cbd18e67",
      "revision": 1
     },
     "representation": "text",
     "digest": "ff66825670c6081c156c30e9bdfacc4324ea7b7fd6aa4968f4563709740d390b"
    },
    "quote": "\"check:generated\": \"bun run generate && git diff --exit-code -- src/generated src/generated-effect\","
   },
   {
    "source": {
     "artifact": {
      "id": "cart_48ac7ad89dac7b148773b43341",
      "revision": 1
     },
     "representation": "text",
     "digest": "f5d772b5a557e952fcea2ee1caf5d61b0f0e9f4fa93a4947032ab126dac47a67"
    },
    "lines": {
     "start": 289,
     "end": 293
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_dafcb07f5f61480b56cbd18e67",
      "revision": 1
     },
     "representation": "text",
     "digest": "ff66825670c6081c156c30e9bdfacc4324ea7b7fd6aa4968f4563709740d390b"
    },
    "quote": "\"check:spawn-imports\": \"bun run script/check-spawn-imports.ts\","
   }
  ]
 },
 {
  "subquestion": {
   "id": "rque_67bcc1cfa64f67763f84be96e5",
   "revision": 1
  },
  "proposition": "The guard rule groups visible are leftovers, hygiene, dependencies, secrets, workflows, silenced and tests; no rule id names a concurrency, performance, retry/timeout or API-compatibility concern, so those dimensions are left to tests and review.",
  "nature": "inference",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_8a99a86170e0feb31ee0b30b0a",
      "revision": 1
     },
     "representation": "text",
     "digest": "745554e4798a65116374c47421b19146531f70a529e54d48a90ef1d6834f5641"
    },
    "quote": "200 hit(s); more: offset 200"
   }
  ]
 }
]
