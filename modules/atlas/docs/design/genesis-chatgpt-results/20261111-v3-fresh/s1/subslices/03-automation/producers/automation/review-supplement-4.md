# Suplemento literal de revisão 4 — AUTOMATION-L1

```json
{
  "type": "documentary_transport_header",
  "review_batch": "automation-4",
  "body_ref": {
    "path": "body.md",
    "bytes": 60767,
    "sha256": "968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae",
    "git_blob_sha": "e26213eb2fc76dc843dca17d1111334c76f88890"
  },
  "recipe_ref": {
    "path": "recipe.json",
    "bytes": 35356,
    "sha256": "c769860c4a685cdbeaff94d471ca393078b74b275924048a996a6376fbeb61c6",
    "git_blob_sha": "96513c04a7d69233a2127315e6915152d485ebb8"
  },
  "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "body_sections": [
    10,
    11,
    12,
    13,
    14
  ],
  "body_utf8_byte_interval": [
    48200,
    60767
  ],
  "public_requests": [
    {
      "path": "../../relay/automation-4/j1-response.md",
      "bytes": 6667,
      "sha256": "bf7d7f1861cd44306931482f0322cd5f19da35bb4b1bf6568e0075d7cfa5415c",
      "git_blob_sha": "95e14d44f011e43fdae066928bd33f2c21c48b0e",
      "judge_id": "J1",
      "origin": "public_request_relay",
      "repository_commit": null
    },
    {
      "path": "../../relay/automation-4/j2-response.md",
      "bytes": 5380,
      "sha256": "9f27a6a9a5853fa58747d88c66f22a4fdd2024d3f550bb095f59363b037c8f0d",
      "git_blob_sha": "9cd2db49e4ac68de10ccb3933a39b28a89f2634d",
      "judge_id": "J2",
      "origin": "public_request_relay",
      "repository_commit": null
    }
  ],
  "canonical_request_namespace": "RE-AUT4-01..04 shared; J2-04 is the shared reconciliation only",
  "authorized_body_revision": {
    "receipt": {
      "path": "revisions/v4/delta.json",
      "bytes": 16136,
      "sha256": "8132046e50a17ec68c9620022bc49147ffc8dfb13cbab46da1c725161723fc33",
      "git_blob_sha": "c79d28f89e04f9fb87720f2dc55659ce908cfe3d"
    },
    "substitutions": [
      {
        "id": "AUT4-DELTA-01",
        "section": "12",
        "old_text": "Em capability, verifica owner e `holds` antes da Session e outra vez antes de prompt.",
        "new_text": "Em capability, verifica a presença/identidade do owner antes da Session; para claim ainda não admitida, verifica `holds` antes da Session e outra vez antes de prompt, sem reler a Session do owner.",
        "v3_byte_interval": [
          52110,
          52195
        ],
        "v4_byte_interval": [
          52110,
          52308
        ],
        "line_1_based": 304,
        "old_bytes": 85,
        "new_bytes": 198,
        "old_sha256": "39c1d613a2bdd472b4267ba7ab92a2a93488afe93924a51f64ff4c0a993c1f24",
        "new_sha256": "56ad5e5f1a5220eb028ee5f7f1cb3a6377a7b95d06c455ee73e948fe9eb35317",
        "sources": [
          {
            "path": "packages/core/src/scheduled-task.ts",
            "archive": "sources/packages/core/src/scheduled-task.ts",
            "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
            "git_blob_sha": "0a89bbdc576091ca01445e45e1500ed4008898a9",
            "sha256": "8c204bd55a8cf8fd1dbddc232f5dfa84b9190822d074ccc72e85594e457af12b",
            "bytes": 26123,
            "intervals": [
              {
                "first_line": 152,
                "last_line": 185,
                "source_byte_start": 7365,
                "source_byte_end_exclusive": 9670,
                "bytes": 2305,
                "sha256": "142fa50cc90f2fa8f479c7f6d6dd3787017f73b161520fdc71c6cf1a3fa5e5ac"
              }
            ]
          },
          {
            "path": "packages/core/src/scheduled-task/capability.ts",
            "archive": "sources/packages/core/src/scheduled-task/capability.ts",
            "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
            "git_blob_sha": "ab0410651446d3d1d98d9d8028a3ad79bb46aecb",
            "sha256": "d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e",
            "bytes": 21721,
            "intervals": [
              {
                "first_line": 121,
                "last_line": 157,
                "source_byte_start": 5595,
                "source_byte_end_exclusive": 6915,
                "bytes": 1320,
                "sha256": "b678c239a31ba99218b07e46a60c1206b07eb5ec6c082c42f9b2e82d63c5f461"
              }
            ]
          }
        ]
      },
      {
        "id": "AUT4-DELTA-02",
        "section": "12",
        "old_text": "Capability manualKey reutiliza Session somente depois de admissão; claim ainda starting retorna “retry shortly”; revoked não executa novamente com a mesma chamada.",
        "new_text": "No replay de capability manualKey, `running` sem SessionInput retorna “retry shortly” e `revoked` retorna erro; nos demais casos, o ramo devolve o SessionID retido com `reused:true`, sem exigir admissão para uma row já assentada.",
        "v3_byte_interval": [
          53944,
          54113
        ],
        "v4_byte_interval": [
          54057,
          54292
        ],
        "line_1_based": 318,
        "old_bytes": 169,
        "new_bytes": 235,
        "old_sha256": "2f5ab0de8b60b65a35583acf3d57db16c96a69053981dda5918e7bff30e9de4e",
        "new_sha256": "7bd31d66ace0d96ddd43147e7cf040cfc7990618bb5da1fd40a708e6ec8e19b7",
        "sources": [
          {
            "path": "packages/core/src/scheduled-task/capability.ts",
            "archive": "sources/packages/core/src/scheduled-task/capability.ts",
            "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
            "git_blob_sha": "ab0410651446d3d1d98d9d8028a3ad79bb46aecb",
            "sha256": "d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e",
            "bytes": 21721,
            "intervals": [
              {
                "first_line": 335,
                "last_line": 378,
                "source_byte_start": 14313,
                "source_byte_end_exclusive": 16627,
                "bytes": 2314,
                "sha256": "688e91325bd99978927834a0dcc09d1e5242c8f1a4cc07de8af724c8f8efb1b9"
              }
            ]
          },
          {
            "path": "packages/core/src/scheduled-task.ts",
            "archive": "sources/packages/core/src/scheduled-task.ts",
            "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
            "git_blob_sha": "0a89bbdc576091ca01445e45e1500ed4008898a9",
            "sha256": "8c204bd55a8cf8fd1dbddc232f5dfa84b9190822d074ccc72e85594e457af12b",
            "bytes": 26123,
            "intervals": [
              {
                "first_line": 187,
                "last_line": 218,
                "source_byte_start": 9671,
                "source_byte_end_exclusive": 11366,
                "bytes": 1695,
                "sha256": "eb6f8bba87a974a21c0fb37ecc67573000e0ce25ae97e5e8cc3e258eecc9f76d"
              },
              {
                "first_line": 272,
                "last_line": 302,
                "source_byte_start": 13674,
                "source_byte_end_exclusive": 15274,
                "bytes": 1600,
                "sha256": "00a85e47facdb694c567c88cedaf35058551ffaafecd9695be1d6ed12b07b029"
              }
            ]
          }
        ]
      }
    ],
    "inverse_to_v3_verified": true
  },
  "prior_literals": "S01–S06 in evidence-review.md; exact existing excerpts referenced, not copied",
  "shared_reconciliation": {
    "index": {
      "path": "review-supplement-1-index.json",
      "bytes": 246723,
      "sha256": "b3a190b8f1bc17ea7f35fc0c53c5bb0f0f134570ac78f62a020452c3818d8902",
      "git_blob_sha": "c42a17c0071f3c864f3e6eb11b5a7ae3fa0d37be"
    },
    "pointer": "/shared_population_reconciliation",
    "new_census": false,
    "new_rows": 0
  },
  "historical_evidence": {
    "index": {
      "path": "review-supplement-1-index.json",
      "bytes": 246723,
      "sha256": "b3a190b8f1bc17ea7f35fc0c53c5bb0f0f134570ac78f62a020452c3818d8902",
      "git_blob_sha": "c42a17c0071f3c864f3e6eb11b5a7ae3fa0d37be"
    },
    "pointer": "/history",
    "new_history_projection": false,
    "prior_literal_block_ids": [
      "AUT1-H01",
      "AUT1-H02",
      "AUT1-H03",
      "AUT1-H04"
    ]
  },
  "decisive_tests": {
    "archive": {
      "path": "evidence.md",
      "bytes": 953016,
      "sha256": "de46e809f97346c81701ee8af0144abbe8458386787a2598b2bc88b81ec2b400",
      "git_blob_sha": "a00e38106ddfe903960659b3bfa4cb3fc73e69d3"
    },
    "anchor": "T01",
    "index_pointer": "/existing_test_literal_references",
    "execution": "NOT_RUN",
    "new_test_literals": false
  },
  "new_population_census": false,
  "history_repeated": false,
  "tests": "NOT_RUN",
  "provider_execution": "NOT_RUN",
  "timezone_execution": "NOT_RUN",
  "oracle_access": false
}
```

## AUT4-C01

```json
{
  "block_id": "AUT4-C01",
  "type": "literal_source_chain",
  "requests": [
    "RE-AUT4-01",
    "RE-AUT4-02",
    "RE-AUT4-03",
    "RE-AUT4-04"
  ],
  "body_anchors": [
    "S01",
    "S02",
    "S04",
    "S06"
  ],
  "requested_subject": "Constants, construction/wake/binding, legacy routes and planning, dispatch/settle/pruning/takeover, tick and daemon",
  "path": "packages/core/src/scheduled-task.ts",
  "archive": "sources/packages/core/src/scheduled-task.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "0a89bbdc576091ca01445e45e1500ed4008898a9",
  "source_sha256": "8c204bd55a8cf8fd1dbddc232f5dfa84b9190822d074ccc72e85594e457af12b",
  "source_bytes": 26123,
  "required_source_line_ranges": [
    [
      23,
      32
    ],
    [
      80,
      558
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S04",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task.ts",
      "source_archive": "sources/packages/core/src/scheduled-task.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "0a89bbdc576091ca01445e45e1500ed4008898a9",
      "source_sha256": "8c204bd55a8cf8fd1dbddc232f5dfa84b9190822d074ccc72e85594e457af12b",
      "source_bytes": 26123,
      "first_line": 156,
      "last_line": 182,
      "source_byte_start": 7780,
      "source_byte_end_exclusive": 9637,
      "excerpt_bytes": 1857,
      "excerpt_sha256": "6faed758cfb62cba5f1849f441c03ad7cfa74204e5d877f0608e23b91f72089c",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 168533,
      "literal_content_byte_end_exclusive": 170390
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S04",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task.ts",
      "source_archive": "sources/packages/core/src/scheduled-task.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "0a89bbdc576091ca01445e45e1500ed4008898a9",
      "source_sha256": "8c204bd55a8cf8fd1dbddc232f5dfa84b9190822d074ccc72e85594e457af12b",
      "source_bytes": 26123,
      "first_line": 196,
      "last_line": 207,
      "source_byte_start": 10053,
      "source_byte_end_exclusive": 10928,
      "excerpt_bytes": 875,
      "excerpt_sha256": "0dfbe91720b43cfe31c27eb5af8c3f8812ecb3332b97bc7d6b9db8310ed127d2",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 170523,
      "literal_content_byte_end_exclusive": 171398
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S04",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task.ts",
      "source_archive": "sources/packages/core/src/scheduled-task.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "0a89bbdc576091ca01445e45e1500ed4008898a9",
      "source_sha256": "8c204bd55a8cf8fd1dbddc232f5dfa84b9190822d074ccc72e85594e457af12b",
      "source_bytes": 26123,
      "first_line": 285,
      "last_line": 302,
      "source_byte_start": 14585,
      "source_byte_end_exclusive": 15274,
      "excerpt_bytes": 689,
      "excerpt_sha256": "76bc5a87541218e37d4a882d6c8a1e7bfcaa89651409464deab1756074e33397",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 171531,
      "literal_content_byte_end_exclusive": 172220
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S06",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task.ts",
      "source_archive": "sources/packages/core/src/scheduled-task.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "0a89bbdc576091ca01445e45e1500ed4008898a9",
      "source_sha256": "8c204bd55a8cf8fd1dbddc232f5dfa84b9190822d074ccc72e85594e457af12b",
      "source_bytes": 26123,
      "first_line": 85,
      "last_line": 95,
      "source_byte_start": 4047,
      "source_byte_end_exclusive": 4696,
      "excerpt_bytes": 649,
      "excerpt_sha256": "acd69264fab22407c6a071a579a2d3c7ea9f4f04c7d593b913f90e75be50987f",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 177247,
      "literal_content_byte_end_exclusive": 177896
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S06",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task.ts",
      "source_archive": "sources/packages/core/src/scheduled-task.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "0a89bbdc576091ca01445e45e1500ed4008898a9",
      "source_sha256": "8c204bd55a8cf8fd1dbddc232f5dfa84b9190822d074ccc72e85594e457af12b",
      "source_bytes": 26123,
      "first_line": 339,
      "last_line": 347,
      "source_byte_start": 16896,
      "source_byte_end_exclusive": 17568,
      "excerpt_bytes": 672,
      "excerpt_sha256": "4bc19434c37a8375a5c59b753187934fddeb378585ccafe66eb038be0622bfeb",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 178029,
      "literal_content_byte_end_exclusive": 178701
    }
  ]
}
```

```json
{"first_line":23,"last_line":32,"source_byte_start":1018,"source_byte_end_exclusive":1595,"bytes":577,"sha256":"5a2ab1604f7021867fc7de41bf584ea0246dffc1feba184d019d8c6cb6355a54"}
```

~~~~typescript
// A running claim older than this belongs to a process that stopped mid-dispatch. Dispatch is a few local
// writes, so a live process settles long before.
export const LEASE = 120_000
export const TICK = Duration.seconds(15)
const TICK_MILLIS = Duration.toMillis(TICK)
// The daemon never sleeps longer than this while something is scheduled, so a clock that jumped or a machine that
// slept is noticed within a minute.
const SLEEP_LIMIT = 60_000
// Settled runs kept per task. Only the latest is shown; a slot can no longer run once the task moved past it.
const KEEP = 20
~~~~

```json
{"first_line":80,"last_line":84,"source_byte_start":3891,"source_byte_end_exclusive":4047,"bytes":156,"sha256":"a7b448ac5b3d796493313a2c88935f15c6667e8503fd3d7ad12046fa6e4bb66a"}
```

~~~~typescript
const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const sessions = yield* SessionV2.Service
~~~~

```json
{"first_line":96,"last_line":155,"source_byte_start":4696,"source_byte_end_exclusive":7780,"bytes":3084,"sha256":"1ff812636443a2f3d9414067c5e6b6444ae7a6c31e0545e5773583889a81ecf7"}
```

~~~~typescript

    const infos = Effect.fn("ScheduledTask.infos")(function* (tasks: LegacyTask[]) {
      const runs = yield* lastRuns(tasks)
      return tasks.map((task) =>
        toInfo(
          task,
          runs.find((run) => run.task_id === task.id),
        ),
      )
    })

    const get = Effect.fn("ScheduledTask.get")(function* (directory: AbsolutePath, id: ID) {
      const task = yield* find(id, directory).pipe(Effect.orDie)
      if (!task || !legacy(task)) return yield* new NotFoundError({ id })
      return (yield* infos([task]))[0]!
    })

    const write = (task: Task, timing: ScheduledTaskModel.Timing, now: number) =>
      db
        .update(ScheduledTaskTable)
        .set({ next: timing.next, enabled: timing.enabled, missed: timing.missed ?? null, time_updated: now })
        .where(eq(ScheduledTaskTable.id, task.id))
        .run()

    // Plans the task at `now` under the write lock. A skipped slot is recorded as missed, and a due slot is
    // claimed when no run holds it. `extra` (Run now) claims an extra run whenever the slot is not claimed.
    const begin = (id: ID, now: number, input: { directory?: AbsolutePath; extra: boolean }) =>
      immediate(
        Effect.gen(function* () {
          const task = yield* find(id, input.directory)
          if (!task) return { type: "missing" } as const
          if (task.policy === "capability") return yield* cap.plan(task, now)
          if (!legacy(task)) return { type: "idle" } as const
          const due = ScheduledTaskModel.plan(timing(task), now)
          if (due.type === "skip") yield* write(task, ScheduledTaskModel.skipRun(timing(task), due.slot, now), now)
          if (due.type === "run") {
            const held = yield* db
              .select({ state: ScheduledTaskRunTable.state })
              .from(ScheduledTaskRunTable)
              .where(and(eq(ScheduledTaskRunTable.task_id, task.id), eq(ScheduledTaskRunTable.slot, due.slot)))
              .get()
            if (!held) return { type: "claimed", claim: yield* claim(task, due.slot, now) } as const
            // A settled run of the slot the task points at means the slot was served before (the task was set
            // back to it); move past it without serving it again.
            if (held.state !== "running")
              yield* write(
                task,
                ScheduledTaskModel.recordRun(timing(task), { time: now, slot: due.slot, missed: due.missed }),
                now,
              )
          }
          if (input.extra) return { type: "claimed", claim: yield* claim(task, undefined, now) } as const
          return { type: "idle" } as const
        }),
      )

    // The path a user prompt takes: the Session (adopted when its ID exists), durable admission, then a wake.
    // Legacy runs are Maestro Sessions in the task's directory. A capability run uses its owner's agent and
    // placement, and only while the owner Session still exists there with that agent. `admitted` is a takeover
    // retrying a prompt that is already durable, which only reconciles and wakes.
~~~~

```json
{"first_line":183,"last_line":195,"source_byte_start":9637,"source_byte_end_exclusive":10053,"bytes":416,"sha256":"b2263cb5bb4a12f44976cb618c8baac37f08186955d7a422f7ef8fa7a6d130f6"}
```

~~~~typescript
          }),
        ),
      )

    const settle = Effect.fn("ScheduledTask.settle")(function* (claimed: Claim, outcome: Outcome) {
      const now = yield* Clock.currentTimeMillis
      yield* immediate(
        Effect.gen(function* () {
          const run = yield* db
            .select()
            .from(ScheduledTaskRunTable)
            .where(eq(ScheduledTaskRunTable.id, claimed.id))
            .get()
~~~~

```json
{"first_line":208,"last_line":284,"source_byte_start":10928,"source_byte_end_exclusive":14585,"bytes":3657,"sha256":"aca72dc70cf5133905a9471558e9ca644563eb4d36d17aba38a96e85e04fc53c"}
```

~~~~typescript
          yield* db
            .update(ScheduledTaskRunTable)
            .set({
              state: outcome.type,
              error: outcome.type === "failed" ? outcome.error : outcome.type === "revoked" ? "owner-missing" : null,
              owner: null,
              time_settled: now,
            })
            .where(eq(ScheduledTaskRunTable.id, run.id))
            .run()
          const task = yield* find(claimed.task.id)
          if (!task) return
          if (task.policy === "capability")
            yield* advance(task, ScheduledTaskCapability.settledCapability(task, run, outcome), now)
          if (legacy(task)) {
            // The task still points at (or before) the served slot unless it was rescheduled while the run
            // started; then the run counts as an extra run and the task keeps its new time.
            const slot = run.slot !== null && task.next <= run.slot ? run.slot : undefined
            const missed =
              slot !== undefined && task.cadence !== "once" && task.next < slot
                ? ScheduledTaskModel.previous(task, task.cadence, slot)
                : undefined
            // A failed slot is consumed like a run, so it is never retried; a failure leaves a rescheduled task alone.
            const advanced =
              outcome.type === "started" || slot !== undefined
                ? ScheduledTaskModel.recordRun(timing(task), { time: now, slot, missed })
                : timing(task)
            yield* advance(
              task,
              {
                next: advanced.next,
                enabled: advanced.enabled,
                missed: advanced.missed ?? null,
                runs: outcome.type === "started" ? task.runs + 1 : task.runs,
              },
              now,
            )
          }
          const kept = db
            .select({ id: ScheduledTaskRunTable.id })
            .from(ScheduledTaskRunTable)
            .where(and(eq(ScheduledTaskRunTable.task_id, task.id), ne(ScheduledTaskRunTable.state, "running")))
            .orderBy(desc(ScheduledTaskRunTable.time_settled))
            .limit(KEEP)
          yield* db
            .delete(ScheduledTaskRunTable)
            .where(
              and(
                eq(ScheduledTaskRunTable.task_id, task.id),
                ne(ScheduledTaskRunTable.state, "running"),
                notInArray(ScheduledTaskRunTable.id, kept),
              ),
            )
            .run()
        }),
      )
    })

    const serve = Effect.fn("ScheduledTask.serve")(function* (id: ID, now: number) {
      const begun = yield* begin(id, now, { extra: false })
      if (begun.type !== "claimed") return
      yield* settle(begun.claim, yield* dispatch(begun.claim))
    })

    // Only a claim whose prompt was admitted happened. It is finished with the exact retry a client would send,
    // which reconciles the admitted prompt and wakes the Session. A claim that never reached admission is void,
    // and its slot is planned again.
    const takeOver = Effect.fn("ScheduledTask.takeOver")(function* (stale: RunRow, now: number) {
      const claimed = yield* immediate(
        Effect.gen(function* () {
          const run = yield* db.select().from(ScheduledTaskRunTable).where(eq(ScheduledTaskRunTable.id, stale.id)).get()
          if (run?.state !== "running" || run.owner !== stale.owner || run.time_claimed !== stale.time_claimed) return
          const task = yield* find(run.task_id)
          if (!task || !run.message_id || run.prompt === null) return
          yield* db
            .update(ScheduledTaskRunTable)
            .set({ owner: lease, time_claimed: now })
~~~~

```json
{"first_line":303,"last_line":338,"source_byte_start":15274,"source_byte_end_exclusive":16896,"bytes":1622,"sha256":"e77a79cd5e99b1c6a5eb8e46e2efc57b67904a1b01edd7a5cabe437b1a153bee"}
```

~~~~typescript

    const tick = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const stale = yield* db
        .select()
        .from(ScheduledTaskRunTable)
        .where(and(eq(ScheduledTaskRunTable.state, "running"), lt(ScheduledTaskRunTable.time_claimed, now - LEASE)))
        .all()
        .pipe(Effect.orDie)
      yield* Effect.forEach(stale, (run) => takeOver(run, now).pipe(Effect.catchCause(logFailure)), { discard: true })
      const due = yield* db
        .select({ id: ScheduledTaskTable.id })
        .from(ScheduledTaskTable)
        .where(and(eq(ScheduledTaskTable.enabled, true), lte(ScheduledTaskTable.next, now)))
        .all()
        .pipe(Effect.orDie)
      yield* Effect.forEach(due, (task) => serve(task.id, now).pipe(Effect.catchCause(logFailure)), { discard: true })
    }).pipe(Effect.withSpan("ScheduledTask.tick"))

    const untilDue = Effect.gen(function* () {
      // Writes the tick itself made are not news. A write that lands after the reads below leaves its wake in the
      // queue, and one that landed before them is read.
      yield* Queue.clear(woken)
      const now = yield* Clock.currentTimeMillis
      const next = yield* db
        .select({ at: min(ScheduledTaskTable.next) })
        .from(ScheduledTaskTable)
        .where(eq(ScheduledTaskTable.enabled, true))
        .get()
        .pipe(Effect.orDie)
      const claimed = yield* db
        .select({ at: min(ScheduledTaskRunTable.time_claimed) })
        .from(ScheduledTaskRunTable)
        .where(eq(ScheduledTaskRunTable.state, "running"))
        .get()
        .pipe(Effect.orDie)
~~~~

```json
{"first_line":348,"last_line":558,"source_byte_start":17568,"source_byte_end_exclusive":26123,"bytes":8555,"sha256":"d68e6d0e31b82e7d870954ce6f7b0a6184ab893c39619fa3ac5c25abafb1f045"}
```

~~~~typescript

    const capability = cap.api({ dispatch, settle })
    yield* ScheduledTaskPort.bind(capability)
    return Service.of({
      list: Effect.fn("ScheduledTask.list")(function* (directory) {
        const tasks = yield* db
          .select()
          .from(ScheduledTaskTable)
          .where(and(eq(ScheduledTaskTable.directory, directory), ScheduledTaskShared.LEGACY))
          .orderBy(asc(ScheduledTaskTable.time_created), asc(ScheduledTaskTable.id))
          .all()
          .pipe(Effect.orDie)
        return yield* infos(tasks.filter(legacy))
      }),
      create: Effect.fn("ScheduledTask.create")(function* (directory, input) {
        if (!ScheduledTaskModel.validZone(input.timezone))
          return yield* new InvalidError({ field: "timezone", message: `Unknown time zone: ${input.timezone}` })
        const now = yield* Clock.currentTimeMillis
        const id = input.id ?? ID.create()
        const last = input.history?.last
        const existing = yield* immediate(
          Effect.gen(function* () {
            const current = yield* find(id)
            if (current) return current
            yield* db
              .insert(ScheduledTaskTable)
              .values({
                id,
                directory,
                name: input.name,
                prompt: input.prompt,
                cadence: input.cadence,
                timezone: input.timezone,
                minute: input.minute ?? ScheduledTaskModel.localMinute(input.next, input.timezone),
                next: input.next,
                enabled: input.enabled ?? true,
                runs: input.history?.runs ?? 0,
                missed: input.history?.missed ?? null,
                time_created: now,
                time_updated: now,
              })
              .run()
            if (last)
              yield* db
                .insert(ScheduledTaskRunTable)
                .values({
                  id: crypto.randomUUID(),
                  task_id: id,
                  state: "started",
                  session_id: last.sessionID,
                  time_claimed: last.time,
                  time_settled: last.time,
                })
                .run()
          }),
        )
        // Reusing an ID adopts the task it names, unchanged; an ID from another directory is a conflict.
        if (existing && existing.directory !== directory) return yield* new ConflictError({ id })
        return yield* get(directory, id).pipe(Effect.orDie)
      }),
      update: Effect.fn("ScheduledTask.update")(function* (directory, id, input) {
        if (input.timezone !== undefined && !ScheduledTaskModel.validZone(input.timezone))
          return yield* new InvalidError({ field: "timezone", message: `Unknown time zone: ${input.timezone}` })
        const now = yield* Clock.currentTimeMillis
        const result = yield* immediate(
          Effect.gen(function* () {
            const task = yield* find(id, directory)
            if (!task || !legacy(task)) return "missing" as const
            const timed = input.next !== undefined || input.timezone !== undefined || input.cadence !== undefined
            const next = input.next ?? task.next
            const timezone = input.timezone ?? task.timezone
            const edited = {
              ...timing(task),
              cadence: input.cadence ?? task.cadence,
              timezone,
              next,
              // A new time re-anchors the time of day and clears the missed slot, as saving the editor does.
              ...(timed ? { minute: ScheduledTaskModel.localMinute(next, timezone), missed: undefined } : {}),
            }
            const enabled = toggle(edited, input.enabled, input.next !== undefined, now)
            if (!enabled) return "past" as const
            yield* db
              .update(ScheduledTaskTable)
              .set({
                name: input.name ?? task.name,
                prompt: input.prompt ?? task.prompt,
                cadence: enabled.cadence,
                timezone: enabled.timezone,
                minute: enabled.minute,
                next: enabled.next,
                enabled: enabled.enabled,
                missed: enabled.missed ?? null,
                time_updated: now,
              })
              .where(eq(ScheduledTaskTable.id, id))
              .run()
            return "updated" as const
          }),
        )
        if (result === "missing") return yield* new NotFoundError({ id })
        if (result === "past")
          return yield* new InvalidError({ field: "next", message: "A one-off task needs a future time to resume." })
        return yield* get(directory, id)
      }),
      remove: Effect.fn("ScheduledTask.remove")(function* (directory, id) {
        const removed = yield* db
          .delete(ScheduledTaskTable)
          .where(
            and(eq(ScheduledTaskTable.id, id), eq(ScheduledTaskTable.directory, directory), ScheduledTaskShared.LEGACY),
          )
          .returning({ id: ScheduledTaskTable.id })
          .all()
          .pipe(Effect.orDie)
        if (removed.length === 0) return yield* new NotFoundError({ id })
      }),
      run: Effect.fn("ScheduledTask.run")(function* (directory, id) {
        const begun = yield* begin(id, yield* Clock.currentTimeMillis, { directory, extra: true })
        if (begun.type !== "claimed") return yield* new NotFoundError({ id })
        const outcome = yield* dispatch(begun.claim)
        if (outcome.type !== "started") {
          yield* settle(begun.claim, { type: "void" })
          return yield* new RunError({ reason: outcome.type === "failed" ? outcome.error : "owner-missing" })
        }
        yield* settle(begun.claim, outcome)
        return { sessionID: outcome.sessionID }
      }),
      tick,
      untilDue,
      capability,
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node, SessionV2.node] })


/** Serves due slots on the server whether or not any client is open, starting with a pass at boot. */
export const daemonNode = makeGlobalNode({
  name: "scheduled-task-daemon",
  layer: Layer.effectDiscard(
    Effect.gen(function* () {
      const tasks = yield* Service
      // A failed pass (the database was busy, say) must not stop later passes.
      yield* tasks.tick.pipe(
        Effect.catchCause(logFailure),
        Effect.andThen(
          tasks.untilDue.pipe(
            Effect.catchCause((cause) => logFailure(cause).pipe(Effect.andThen(Effect.sleep(TICK)))),
          ),
        ),
        Effect.forever,
        Effect.forkScoped,
      )
    }),
  ),
  deps: [node],
})

function legacy(task: Task): task is LegacyTask {
  return task.policy === "legacy-browser" && task.cadence !== "interval" && task.cadence !== "cron"
}

function timing(task: LegacyTask): ScheduledTaskModel.Timing {
  return {
    cadence: task.cadence,
    minute: task.minute,
    timezone: task.timezone,
    next: task.next,
    enabled: task.enabled,
    missed: task.missed ?? undefined,
  }
}

// Turning a task on: a new time resumes it as given, a recurring task rolls to its next future slot, and a
// one-off whose time passed cannot resume (`undefined`).
function toggle(task: ScheduledTaskModel.Timing, enabled: boolean | undefined, retimed: boolean, now: number) {
  if (enabled === undefined || enabled === task.enabled) return task
  if (!enabled || retimed) return { ...task, enabled }
  if (!ScheduledTaskModel.canResume(task, now)) return undefined
  return ScheduledTaskModel.resume(task, now)
}

function toInfo(task: LegacyTask, run: RunRow | undefined): Info {
  return {
    id: task.id,
    name: task.name,
    prompt: task.prompt,
    cadence: task.cadence,
    timezone: task.timezone,
    minute: task.minute,
    next: task.next,
    enabled: task.enabled,
    runs: task.runs,
    ...(task.missed === null ? {} : { missed: task.missed }),
    ...(run ? { last: ScheduledTaskShared.toRun(run) } : {}),
  }
}

// The failure as the page shows it.
function reason(cause: Cause.Cause<unknown>) {
  const error = Cause.squash(cause)
  if (error instanceof SessionV2.PromptConflictError)
    return `Prompt ${error.messageID} conflicts with an earlier prompt in ${error.sessionID}`
  if (error instanceof SessionV2.NotFoundError) return `Session not found: ${error.sessionID}`
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

function logFailure(cause: Cause.Cause<unknown>) {
  return Effect.logError("Scheduled task failed", cause)
}
~~~~

## AUT4-C02

```json
{
  "block_id": "AUT4-C02",
  "type": "literal_source_chain",
  "requests": [
    "RE-AUT4-01",
    "RE-AUT4-02",
    "RE-AUT4-03",
    "RE-AUT4-04"
  ],
  "body_anchors": [
    "S01",
    "S03",
    "S04",
    "S05",
    "S06"
  ],
  "requested_subject": "Owner/operator API, claim planning, holds/present/revoke, create/list/placed/get/edit/manual replay, cadence encoding and settling",
  "path": "packages/core/src/scheduled-task/capability.ts",
  "archive": "sources/packages/core/src/scheduled-task/capability.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "ab0410651446d3d1d98d9d8028a3ad79bb46aecb",
  "source_sha256": "d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e",
  "source_bytes": 21721,
  "required_source_line_ranges": [
    [
      26,
      493
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S01",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task/capability.ts",
      "source_archive": "sources/packages/core/src/scheduled-task/capability.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "ab0410651446d3d1d98d9d8028a3ad79bb46aecb",
      "source_sha256": "d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e",
      "source_bytes": 21721,
      "first_line": 384,
      "last_line": 394,
      "source_byte_start": 16692,
      "source_byte_end_exclusive": 17109,
      "excerpt_bytes": 417,
      "excerpt_sha256": "c0ef15fab7ce45caf1bf6f0ea12dbebff6a76cc0ca84476bcca8559bf9a2cbef",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 161240,
      "literal_content_byte_end_exclusive": 161657
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S04",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task/capability.ts",
      "source_archive": "sources/packages/core/src/scheduled-task/capability.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "ab0410651446d3d1d98d9d8028a3ad79bb46aecb",
      "source_sha256": "d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e",
      "source_bytes": 21721,
      "first_line": 137,
      "last_line": 145,
      "source_byte_start": 6167,
      "source_byte_end_exclusive": 6460,
      "excerpt_bytes": 293,
      "excerpt_sha256": "d339c9448987bf0c71c326bfd0de45c58e29a91d369c77f3723cdd983e93bae2",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 172626,
      "literal_content_byte_end_exclusive": 172919
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S04",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task/capability.ts",
      "source_archive": "sources/packages/core/src/scheduled-task/capability.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "ab0410651446d3d1d98d9d8028a3ad79bb46aecb",
      "source_sha256": "d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e",
      "source_bytes": 21721,
      "first_line": 187,
      "last_line": 198,
      "source_byte_start": 8090,
      "source_byte_end_exclusive": 8568,
      "excerpt_bytes": 478,
      "excerpt_sha256": "fb78aed49fc2f26818e0445282063659adc717e7cf339f9548adbf91358f66a0",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 173052,
      "literal_content_byte_end_exclusive": 173530
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S05",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task/capability.ts",
      "source_archive": "sources/packages/core/src/scheduled-task/capability.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "ab0410651446d3d1d98d9d8028a3ad79bb46aecb",
      "source_sha256": "d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e",
      "source_bytes": 21721,
      "first_line": 335,
      "last_line": 364,
      "source_byte_start": 14313,
      "source_byte_end_exclusive": 16030,
      "excerpt_bytes": 1717,
      "excerpt_sha256": "80b4fd0d5c92c88f745bca334b92821e854805d700df9c7294210feffa0cd0ea",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 174069,
      "literal_content_byte_end_exclusive": 175786
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S05",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task/capability.ts",
      "source_archive": "sources/packages/core/src/scheduled-task/capability.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "ab0410651446d3d1d98d9d8028a3ad79bb46aecb",
      "source_sha256": "d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e",
      "source_bytes": 21721,
      "first_line": 455,
      "last_line": 466,
      "source_byte_start": 20046,
      "source_byte_end_exclusive": 20852,
      "excerpt_bytes": 806,
      "excerpt_sha256": "293f0c3d7328a3a34be4fbb7553c3c3f23c667397a2ed78565946651ec9d734f",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 175919,
      "literal_content_byte_end_exclusive": 176725
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S06",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task/capability.ts",
      "source_archive": "sources/packages/core/src/scheduled-task/capability.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "ab0410651446d3d1d98d9d8028a3ad79bb46aecb",
      "source_sha256": "d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e",
      "source_bytes": 21721,
      "first_line": 207,
      "last_line": 237,
      "source_byte_start": 8822,
      "source_byte_end_exclusive": 9929,
      "excerpt_bytes": 1107,
      "excerpt_sha256": "2f2fc041e6f5b956bb4dff5ef36d08a7ca0583c75eea95b04a8bf58040e5cee5",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 179107,
      "literal_content_byte_end_exclusive": 180214
    }
  ]
}
```

```json
{"first_line":26,"last_line":136,"source_byte_start":1154,"source_byte_end_exclusive":6167,"bytes":5013,"sha256":"1c7027887df0566ac130ac9c4ffb86651ea003d44a20b65d088c2623b624ffd8"}
```

~~~~typescript
/**
 * Capability schedules (schedule_manage). Every call is scoped to `owner`: a schedule owned by anyone else
 * is NotFound, exactly like an unknown ID. The legacy methods never see these rows.
 */
export interface Interface {
  readonly create: (
    owner: Capability.Owner,
    input: CapabilityCreate,
  ) => Effect.Effect<Schedule, ScheduledTaskShared.InvalidError>
  readonly list: (owner: Capability.Owner) => Effect.Effect<Schedule[]>
  /** Every capability schedule of the placement with its owner, for the operator surface; never a caller-scoped read. */
  readonly placed: (
    placement: Pick<Capability.Owner, "projectID" | "location">,
  ) => Effect.Effect<{ owner: Capability.Owner; schedule: Schedule }[]>
  readonly get: (owner: Capability.Owner, id: ID) => Effect.Effect<Schedule, ScheduledTaskShared.NotFoundError>
  /** Bumps the revision, recomputes `next`, and revokes claims of older revisions not yet admitted. */
  readonly update: (
    owner: Capability.Owner,
    id: ID,
    input: CapabilityUpdate,
  ) => Effect.Effect<Schedule, ScheduledTaskShared.NotFoundError | ScheduledTaskShared.InvalidError>
  readonly pause: (owner: Capability.Owner, id: ID) => Effect.Effect<Schedule, ScheduledTaskShared.NotFoundError>
  /** Rolls to the next future slot; a past once or an exhausted repeat cannot resume. */
  readonly resume: (
    owner: Capability.Owner,
    id: ID,
  ) => Effect.Effect<Schedule, ScheduledTaskShared.NotFoundError | ScheduledTaskShared.InvalidError>
  readonly remove: (owner: Capability.Owner, id: ID) => Effect.Effect<void, ScheduledTaskShared.NotFoundError>
  /** Manual run deduped on `manualKey`: a retry returns the same Session. Never moves `next` or counts. */
  readonly run: (
    owner: Capability.Owner,
    id: ID,
    manualKey: string,
  ) => Effect.Effect<
    { sessionID: SessionV2.ID; reused: boolean },
    ScheduledTaskShared.NotFoundError | ScheduledTaskShared.RunError
  >
}

// Capability halves of the Service layer. `plan`, `holds` and `present` serve the shared claim, dispatch and
// settle path; `api` builds the public methods once that path exists.
export function make(store: ScheduledTaskShared.Store, sessions: SessionV2.Interface) {
  const { db, lease, immediate, find, lastRuns, advance, claim } = store

  const owned = (owner: Capability.Owner, id: ID) =>
    find(id).pipe(Effect.map((task) => (task && sameOwner(task, owner) ? task : undefined)))

  const schedules = Effect.fn("ScheduledTask.schedules")(function* (tasks: Task[]) {
    const runs = yield* lastRuns(tasks)
    return tasks.map((task) =>
      toSchedule(
        task,
        runs.find((run) => run.task_id === task.id),
      ),
    )
  })

  const getOwned = Effect.fn("ScheduledTask.getOwned")(function* (owner: Capability.Owner, id: ID) {
    const task = yield* owned(owner, id).pipe(Effect.orDie)
    if (!task) return yield* new ScheduledTaskShared.NotFoundError({ id })
    return (yield* schedules([task]))[0]!
  })

  // Capability planning under the write lock. A run moves `next` to the claimed slot, so the overtaken slots are
  // counted once even when a stopped claim is voided and the slot planned again.
  const beginCapability = Effect.fn("ScheduledTask.beginCapability")(function* (task: Task, now: number) {
    const timing = capabilityTiming(task)
    const due = ScheduledTaskCapabilityModel.plan(timing, now)
    if (due.type === "wait") return { type: "idle" } as const
    const skipped = task.skipped + due.skipped
    if (due.type === "skip") {
      yield* advance(task, { skipped, ...following(timing, now) }, now)
      return { type: "idle" } as const
    }
    const held = yield* db
      .select({ state: ScheduledTaskRunTable.state })
      .from(ScheduledTaskRunTable)
      .where(
        and(
          eq(ScheduledTaskRunTable.task_id, task.id),
          eq(ScheduledTaskRunTable.revision, task.revision),
          eq(ScheduledTaskRunTable.slot, due.slot),
        ),
      )
      .get()
    if (held?.state === "running") return { type: "idle" } as const
    // Served before (the schedule was set back to it): move past it without serving it again.
    if (held) {
      yield* advance(task, { skipped, ...following(timing, due.slot) }, now)
      return { type: "idle" } as const
    }
    yield* advance(task, { skipped, next: due.slot }, now)
    return { type: "claimed", claim: yield* claim(task, due.slot, now) } as const
  })

  const holds = (claimed: Claim) =>
    db
      .select({
        state: ScheduledTaskRunTable.state,
        lease: ScheduledTaskRunTable.owner,
        slot: ScheduledTaskRunTable.slot,
        claimed: ScheduledTaskRunTable.revision,
        revision: ScheduledTaskTable.revision,
        enabled: ScheduledTaskTable.enabled,
      })
      .from(ScheduledTaskRunTable)
      .innerJoin(ScheduledTaskTable, eq(ScheduledTaskTable.id, ScheduledTaskRunTable.task_id))
      .where(eq(ScheduledTaskRunTable.id, claimed.id))
      .get()
      .pipe(
        Effect.orDie,
~~~~

```json
{"first_line":146,"last_line":186,"source_byte_start":6460,"source_byte_end_exclusive":8090,"bytes":1630,"sha256":"64320d4caa83cc36f8a38360975c890789fbdee73a6f4e2e6e233d93ed722e2e"}
```

~~~~typescript

  const present = (owner: Capability.Owner) =>
    sessions.get(owner.sessionID).pipe(
      Effect.map(
        (session) =>
          session.projectID === owner.projectID &&
          session.location.directory === owner.location.directory &&
          session.location.workspaceID === owner.location.workspaceID &&
          session.agent === owner.agentID,
      ),
      Effect.catchTag("Session.NotFoundError", () => Effect.succeed(false)),
    )

  // Runs `edit` on the owner's schedule under the write lock, then reads it back. Errors come back as values so
  // the transaction commits only what the edit wrote.
  const change = <E extends ScheduledTaskShared.InvalidError>(
    owner: Capability.Owner,
    id: ID,
    edit: (task: Task, now: number) => Effect.Effect<E | undefined, unknown>,
  ) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const failed = yield* immediate(
        Effect.gen(function* () {
          const task = yield* owned(owner, id)
          if (!task) return new ScheduledTaskShared.NotFoundError({ id })
          return yield* edit(task, now)
        }),
      )
      if (failed) return yield* failed
      return yield* getOwned(owner, id)
    })

  // Marks the task's running claims in `scope` whose prompt was never admitted as revoked.
  const revoke = (task: Task, now: number, scope: SQL) =>
    Effect.gen(function* () {
      const pending = yield* db
        .select()
        .from(ScheduledTaskRunTable)
        .where(and(eq(ScheduledTaskRunTable.task_id, task.id), eq(ScheduledTaskRunTable.state, "running"), scope))
        .all()
~~~~

```json
{"first_line":199,"last_line":206,"source_byte_start":8568,"source_byte_end_exclusive":8822,"bytes":254,"sha256":"1842c7bf1d7d2345a0c57e442e7de986d733a9a73c8e668c44d613822197fbc8"}
```

~~~~typescript
      )
    })

  // The public methods, over the shared dispatch and settle path.
  const api = (ops: {
    dispatch: (claimed: Claim) => Effect.Effect<Outcome>
    settle: (claimed: Claim, outcome: Outcome) => Effect.Effect<void>
  }): Interface => ({
~~~~

```json
{"first_line":238,"last_line":334,"source_byte_start":9929,"source_byte_end_exclusive":14313,"bytes":4384,"sha256":"6c43575547ff43f80cdda409a4ef7257ad63911f70b9d6dc52c56387b3de46e8"}
```

~~~~typescript
    list: Effect.fn("ScheduledTask.capability.list")(function* (owner) {
      const tasks = yield* db
        .select()
        .from(ScheduledTaskTable)
        .where(
          and(eq(ScheduledTaskTable.directory, owner.location.directory), eq(ScheduledTaskTable.policy, "capability")),
        )
        .orderBy(asc(ScheduledTaskTable.time_created), asc(ScheduledTaskTable.id))
        .all()
        .pipe(Effect.orDie)
      return yield* schedules(tasks.filter((task) => sameOwner(task, owner)))
    }),
    placed: Effect.fn("ScheduledTask.capability.placed")(function* (placement) {
      const tasks = yield* db
        .select()
        .from(ScheduledTaskTable)
        .where(
          and(eq(ScheduledTaskTable.directory, placement.location.directory), eq(ScheduledTaskTable.policy, "capability")),
        )
        .orderBy(asc(ScheduledTaskTable.time_created), asc(ScheduledTaskTable.id))
        .all()
        .pipe(Effect.orDie)
      const found = tasks.flatMap((task) => {
        const owner = task.policy === "capability" ? task.owner : null
        if (!owner || owner.projectID !== placement.projectID || owner.location.directory !== placement.location.directory ||
          owner.location.workspaceID !== placement.location.workspaceID) return []
        return [{ task, owner }]
      })
      const listed = yield* schedules(found.map((item) => item.task))
      return found.map((item, index) => ({ owner: item.owner, schedule: listed[index]! }))
    }),
    get: getOwned,
    update: (owner, id, input) =>
      change(owner, id, (task, now) =>
        Effect.gen(function* () {
          const current = capabilityTiming(task)
          const cadence = input.cadence ?? current.cadence
          const timezone = input.timezone ?? task.timezone
          const catchUp = input.catchUp ?? current.catchUp
          const next = firstSlot({ cadence, timezone, catchUp, enabled: task.enabled }, now)
          if (typeof next !== "number") return next
          const revision = task.revision + 1
          const repeat = input.repeat === undefined ? task.repeat_limit : input.repeat
          // A limit at or below the runs already admitted exhausts the schedule now.
          const exhausted = repeat !== null && task.runs >= repeat
          yield* advance(
            task,
            {
              ...(exhausted ? { enabled: false, disabled_reason: "exhausted" as const } : {}),
              name: input.name ?? task.name,
              prompt: input.prompt ?? task.prompt,
              ...encode(cadence),
              timezone,
              catch_up: catchUp,
              repeat_limit: repeat,
              next,
              revision,
            },
            now,
          )
          // Unstarted claims of older revisions never admit their prompt; an admitted one keeps its receipt.
          yield* revoke(task, now, lt(ScheduledTaskRunTable.revision, revision))
        }),
      ),
    // Pausing revokes unstarted slot claims; a manual run may still start while paused.
    pause: (owner, id) =>
      change<never>(owner, id, (task, now) =>
        Effect.gen(function* () {
          yield* advance(task, { enabled: false }, now)
          yield* revoke(task, now, isNotNull(ScheduledTaskRunTable.slot))
          return undefined
        }),
      ),
    resume: (owner, id) =>
      change(owner, id, (task, now) =>
        Effect.gen(function* () {
          if (task.enabled) return
          if (task.repeat_limit !== null && task.runs >= task.repeat_limit)
            return new ScheduledTaskShared.InvalidError({
              field: "repeat",
              message: "The schedule used all its runs; raise repeat first.",
            })
          const next = firstSlot({ ...capabilityTiming(task), enabled: true }, now)
          if (typeof next !== "number") return next
          yield* advance(task, { enabled: true, disabled_reason: null, next }, now)
        }),
      ),
    remove: Effect.fn("ScheduledTask.capability.remove")(function* (owner, id) {
      const removed = yield* immediate(
        Effect.gen(function* () {
          if (!(yield* owned(owner, id))) return false
          yield* db.delete(ScheduledTaskTable).where(eq(ScheduledTaskTable.id, id)).run()
          return true
        }),
      )
      if (!removed) return yield* new ScheduledTaskShared.NotFoundError({ id })
    }),
~~~~

```json
{"first_line":365,"last_line":383,"source_byte_start":16030,"source_byte_end_exclusive":16692,"bytes":662,"sha256":"09161e9144038bff39c188ff458f7d3ed370468d4ad800ecce624baa0f6a0e00"}
```

~~~~typescript
        yield* ops.settle(begun.claim, outcome)
        return { sessionID: outcome.sessionID, reused: false }
      }
      // Nothing was admitted, so the same call may retry; a missing owner disables the schedule.
      yield* ops.settle(begun.claim, outcome.type === "revoked" ? outcome : { type: "void" })
      return yield* new ScheduledTaskShared.RunError({
        reason:
          outcome.type === "failed"
            ? outcome.error
            : outcome.type === "void"
              ? "The schedule changed before the run started."
              : "owner-missing",
      })
    }),
  })

  return { plan: beginCapability, holds, present, api }
}

~~~~

```json
{"first_line":395,"last_line":454,"source_byte_start":17109,"source_byte_end_exclusive":20046,"bytes":2937,"sha256":"f8756018e309db2da3257614bf3ffc3a98567199556837c6eb067b384a9e9f9e"}
```

~~~~typescript

// Storage of a capability cadence: once keeps its time in `next`; weekly packs `day * 1440 + minute of day`.
function encode(cadence: CapabilityScheduleContract.Cadence) {
  const columns = { minute: 0, interval_minutes: null, cron: null }
  if (cadence.kind === "interval")
    return { ...columns, cadence: "interval" as const, interval_minutes: cadence.minutes }
  if (cadence.kind === "daily") return { ...columns, cadence: "daily" as const, minute: clockMinute(cadence.time) }
  if (cadence.kind === "weekly")
    return { ...columns, cadence: "weekly" as const, minute: cadence.day * 1440 + clockMinute(cadence.time) }
  if (cadence.kind === "cron") return { ...columns, cadence: "cron" as const, cron: cadence.expression }
  return { ...columns, cadence: "once" as const }
}

function decode(task: Task): CapabilityScheduleContract.Cadence {
  const time = clock(task.minute % 1440)
  if (task.cadence === "interval") return { kind: "interval", minutes: task.interval_minutes ?? 0 }
  if (task.cadence === "daily") return { kind: "daily", time }
  if (task.cadence === "weekly") return { kind: "weekly", day: Math.floor(task.minute / 1440), time }
  if (task.cadence === "cron") return { kind: "cron", expression: task.cron ?? "" }
  return { kind: "once", at: task.next }
}

function capabilityTiming(task: Task): ScheduledTaskCapabilityModel.Timing {
  return {
    cadence: decode(task),
    timezone: task.timezone,
    next: task.next,
    enabled: task.enabled,
    catchUp: task.catch_up ?? "latest",
  }
}

// The first slot of a new or edited definition; an enabled once must lie ahead. Errors come back as values.
function firstSlot(
  input: Omit<ScheduledTaskCapabilityModel.Timing, "next">,
  now: number,
): number | ScheduledTaskShared.InvalidError {
  if (!ScheduledTaskModel.validZone(input.timezone))
    return new ScheduledTaskShared.InvalidError({ field: "timezone", message: `Unknown time zone: ${input.timezone}` })
  if (input.cadence.kind === "cron" && !ScheduledTaskCapabilityModel.parseCron(input.cadence.expression))
    return new ScheduledTaskShared.InvalidError({
      field: "cadence",
      message: `Invalid cron expression: ${input.cadence.expression}`,
    })
  if (input.cadence.kind === "once")
    return input.enabled && input.cadence.at <= now
      ? new ScheduledTaskShared.InvalidError({ field: "cadence", message: "A one-off schedule needs a future time." })
      : input.cadence.at
  return (
    ScheduledTaskCapabilityModel.nextAfter({ ...input, next: now }, now) ??
    new ScheduledTaskShared.InvalidError({ field: "cadence", message: "The cadence never fires." })
  )
}

// The slot after `after`, or disabled once none is left (a once that ran or was skipped).
function following(timing: ScheduledTaskCapabilityModel.Timing, after: number) {
  const next = ScheduledTaskCapabilityModel.nextAfter(timing, after)
  return next === undefined ? { enabled: false } : { next }
}

~~~~

```json
{"first_line":467,"last_line":493,"source_byte_start":20852,"source_byte_end_exclusive":21721,"bytes":869,"sha256":"9bbd057398bf713606117e37efea9ed410c6385c32eedb91fec7659d92153eeb"}
```

~~~~typescript

function toSchedule(task: Task, run: RunRow | undefined): Schedule {
  return {
    id: task.id,
    revision: task.revision,
    name: task.name,
    prompt: task.prompt,
    cadence: decode(task),
    timezone: task.timezone,
    catchUp: task.catch_up ?? "latest",
    ...(task.repeat_limit === null ? {} : { repeat: task.repeat_limit }),
    enabled: task.enabled,
    ...(task.disabled_reason === null ? {} : { disabledReason: task.disabled_reason }),
    ...(task.enabled ? { next: task.next } : {}),
    runs: task.runs,
    skipped: task.skipped,
    ...(run ? { last: ScheduledTaskShared.toRun(run) } : {}),
  }
}

function clockMinute(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
}

function clock(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
}
~~~~

## AUT4-C03

```json
{
  "block_id": "AUT4-C03",
  "type": "literal_source_chain",
  "requests": [
    "RE-AUT4-01",
    "RE-AUT4-03"
  ],
  "body_anchors": [
    "S01",
    "S04",
    "S05"
  ],
  "requested_subject": "Errors, claim/outcome, immediate transaction, legacy filtering, deterministic IDs and persisted claim snapshot",
  "path": "packages/core/src/scheduled-task/shared.ts",
  "archive": "sources/packages/core/src/scheduled-task/shared.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "b997b9d2bb4246d3101c243fe0217ce9fcc30885",
  "source_sha256": "b7ca14671135a068909b9163fa8c21d1ce2487f5d54d08e09adcd7585acf5540",
  "source_bytes": 4949,
  "required_source_line_ranges": [
    [
      13,
      144
    ]
  ],
  "prior_literal_ranges": []
}
```

```json
{"first_line":13,"last_line":144,"source_byte_start":514,"source_byte_end_exclusive":4949,"bytes":4435,"sha256":"e94fc61db55616c640f9715ddf5fa66e4598c383b789b2602d14dbf4d8683305"}
```

~~~~typescript
export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("ScheduledTask.NotFoundError", {
  id: Schema.String,
}) {}

export class InvalidError extends Schema.TaggedErrorClass<InvalidError>()("ScheduledTask.InvalidError", {
  field: Schema.String,
  message: Schema.String,
}) {}

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()("ScheduledTask.ConflictError", {
  id: Schema.String,
}) {}

export class RunError extends Schema.TaggedErrorClass<RunError>()("ScheduledTask.RunError", {
  reason: Schema.String,
}) {}

export type Task = typeof ScheduledTaskTable.$inferSelect
export type LegacyTask = Task & { cadence: ScheduledTask.Cadence }
export type RunRow = typeof ScheduledTaskRunTable.$inferSelect
export type Claim = {
  readonly id: string
  readonly task: Task
  readonly sessionID: SessionV2.ID
  readonly messageID: SessionMessage.ID
  readonly prompt: string
}
export type Outcome =
  | { type: "started"; sessionID: SessionV2.ID }
  | { type: "failed"; error: string }
  | { type: "revoked" }
  | { type: "void" }

export const LEGACY = eq(ScheduledTaskTable.policy, "legacy-browser")

export type Store = ReturnType<typeof store>

// The rows both policies share. `lease` marks this process's claims: a restarted process takes its old claims
// over once their lease ends.
export function store(db: Database.Interface["db"], lease: string) {
  const immediate = <A, E>(effect: Effect.Effect<A, E>) =>
    db.transaction(() => effect, { behavior: "immediate" }).pipe(Effect.orDie)

  // A directory-scoped lookup serves the legacy routes, which never see capability rows.
  const find = (id: ScheduledTask.ID, directory?: AbsolutePath) =>
    db
      .select()
      .from(ScheduledTaskTable)
      .where(
        directory
          ? and(eq(ScheduledTaskTable.id, id), eq(ScheduledTaskTable.directory, directory), LEGACY)
          : eq(ScheduledTaskTable.id, id),
      )
      .get()

  const lastRuns = (tasks: Task[]) =>
    tasks.length === 0
      ? Effect.succeed([])
      : db
          .select()
          .from(ScheduledTaskRunTable)
          .where(
            and(
              inArray(
                ScheduledTaskRunTable.task_id,
                tasks.map((task) => task.id),
              ),
              inArray(ScheduledTaskRunTable.state, ["started", "failed"]),
            ),
          )
          .orderBy(desc(ScheduledTaskRunTable.time_settled))
          .all()
          .pipe(Effect.orDie)

  const advance = (task: Task, set: Partial<Task>, now: number) =>
    db
      .update(ScheduledTaskTable)
      .set({ ...set, time_updated: now })
      .where(eq(ScheduledTaskTable.id, task.id))
      .run()

  const claim = Effect.fn("ScheduledTask.claim")(function* (
    task: Task,
    slot: number | undefined,
    now: number,
    manualKey?: string,
  ) {
    // Capability IDs derive from (task, revision, slot) or the manual key, so an edit never reuses a Session.
    const ids =
      task.policy === "capability"
        ? ScheduledTaskModel.slotIDs(
            slot === undefined ? `${task.id}:manual:${manualKey}` : `${task.id}:${task.revision}`,
            slot ?? task.time_created,
          )
        : slot === undefined
          ? undefined
          : ScheduledTaskModel.slotIDs(task.id, slot)
    const claimed = {
      id: crypto.randomUUID(),
      task,
      sessionID: ids ? SessionV2.ID.make(ids.session) : SessionV2.ID.create(),
      messageID: ids ? SessionMessage.ID.make(ids.message) : SessionMessage.ID.create(),
      prompt: task.prompt,
    }
    yield* db
      .insert(ScheduledTaskRunTable)
      .values({
        id: claimed.id,
        task_id: task.id,
        slot: slot ?? null,
        revision: task.revision,
        manual_key: manualKey ?? null,
        state: "running",
        session_id: claimed.sessionID,
        message_id: claimed.messageID,
        prompt: claimed.prompt,
        owner: lease,
        time_claimed: now,
      })
      .run()
    return claimed
  })

  return { db, lease, immediate, find, lastRuns, advance, claim }
}

export function toRun(run: RunRow): ScheduledTask.Run {
  const time = run.time_settled ?? run.time_claimed
  const slot = run.slot === null ? {} : { slot: run.slot }
  if (run.state === "failed") return { outcome: "failed", time, ...slot, error: run.error ?? "" }
  return { outcome: "started", time, ...slot, sessionID: run.session_id }
}
~~~~

## AUT4-C04

```json
{
  "block_id": "AUT4-C04",
  "type": "literal_source_chain",
  "requests": [
    "RE-AUT4-01",
    "RE-AUT4-03"
  ],
  "body_anchors": [
    "S01"
  ],
  "requested_subject": "Both task policies and complete claim schema, cascade and unique dedupe indexes",
  "path": "packages/core/src/scheduled-task/sql.ts",
  "archive": "sources/packages/core/src/scheduled-task/sql.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "f7b58d09202d0eb4026623b587363798a0908874",
  "source_sha256": "822bcafeaf764d56be959c3c5184e2e3e76bbca52ae6c678477728e0df3899a7",
  "source_bytes": 3559,
  "required_source_line_ranges": [
    [
      1,
      76
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S01",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task/sql.ts",
      "source_archive": "sources/packages/core/src/scheduled-task/sql.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "f7b58d09202d0eb4026623b587363798a0908874",
      "source_sha256": "822bcafeaf764d56be959c3c5184e2e3e76bbca52ae6c678477728e0df3899a7",
      "source_bytes": 3559,
      "first_line": 70,
      "last_line": 75,
      "source_byte_start": 3273,
      "source_byte_end_exclusive": 3557,
      "excerpt_bytes": 284,
      "excerpt_sha256": "7cec1d85454e0ca448210594cb2a56a6b45ae4ab9a81c02406db33b000f428fc",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 160550,
      "literal_content_byte_end_exclusive": 160834
    }
  ]
}
```

```json
{"first_line":1,"last_line":69,"source_byte_start":0,"source_byte_end_exclusive":3273,"bytes":3273,"sha256":"d2577cae4e803dacec3727f13e77a1207e67fdbeb7ea78e5ede26f1ea1f7fcb8"}
```

~~~~typescript
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { Capability } from "@orchestra/schema/capability"
import type { ScheduledTask } from "@orchestra/schema/scheduled-task"
import { absoluteColumn } from "../database/path"
import { Timestamps } from "../database/schema.sql"
import type { SessionMessage } from "../session/message"
import type { SessionSchema } from "../session/schema"

export const ScheduledTaskTable = sqliteTable(
  "scheduled_task",
  {
    id: text().$type<ScheduledTask.ID>().primaryKey(),
    directory: absoluteColumn().notNull(),
    name: text().notNull(),
    prompt: text().notNull(),
    // Capability rows add interval and cron. Weekly capability rows encode `day * 1440 + minute of day` in `minute`.
    cadence: text().$type<ScheduledTask.Cadence | "interval" | "cron">().notNull(),
    timezone: text().notNull(),
    minute: integer().notNull(),
    next: integer().notNull(),
    enabled: integer({ mode: "boolean" }).notNull(),
    runs: integer().notNull(),
    missed: integer(),
    // Capability schedules (schedule_manage) carry an owner and a revision; legacy-browser tasks keep the
    // imported device semantics and stay invisible to the capability leaf.
    policy: text().$type<"legacy-browser" | "capability">().notNull().default("legacy-browser"),
    revision: integer().notNull().default(0),
    owner: text({ mode: "json" }).$type<Capability.Owner>(),
    interval_minutes: integer(),
    cron: text(),
    catch_up: text().$type<"latest" | "skip">(),
    repeat_limit: integer(),
    // Slots never run because a later slot overtook them or the catch-up policy skipped them.
    skipped: integer().notNull().default(0),
    disabled_reason: text().$type<"exhausted" | "owner-missing">(),
    ...Timestamps,
  },
  (table) => [
    index("scheduled_task_directory_idx").on(table.directory),
    index("scheduled_task_due_idx").on(table.enabled, table.next),
  ],
)

// One row per run. A slot run is unique per task and slot, which is what keeps a slot to one run across
// ticks, Run now, processes sharing the database and restarts. Extra runs (Run now) have no slot.
export const ScheduledTaskRunTable = sqliteTable(
  "scheduled_task_run",
  {
    id: text().primaryKey(),
    task_id: text()
      .$type<ScheduledTask.ID>()
      .notNull()
      .references(() => ScheduledTaskTable.id, { onDelete: "cascade" }),
    slot: integer(),
    // Slot runs are unique per task, revision and slot; an edit starts a new revision.
    revision: integer().notNull().default(0),
    // Manual runs of capability schedules dedupe on the caller's key; they never consume a slot.
    manual_key: text(),
    state: text().$type<"running" | "started" | "failed" | "revoked">().notNull(),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    // What a running claim dispatches, so a claim taken over after a crash retries the exact prompt.
    // Runs imported from device storage do not know them.
    message_id: text().$type<SessionMessage.ID>(),
    prompt: text(),
    error: text(),
    // Process that holds a running claim; a claim older than its lease may be taken over.
    owner: text(),
    time_claimed: integer().notNull(),
    time_settled: integer(),
~~~~

```json
{"first_line":76,"last_line":76,"source_byte_start":3557,"source_byte_end_exclusive":3559,"bytes":2,"sha256":"fafba0527c3953c4b6e0e5b5739ba83612f8053bcdc9466730193cd1d590b408"}
```

~~~~typescript
)
~~~~

## AUT4-C05

```json
{
  "block_id": "AUT4-C05",
  "type": "literal_source_chain",
  "requests": [
    "RE-AUT4-01"
  ],
  "body_anchors": [
    "S01"
  ],
  "requested_subject": "Scope acquire/release, previous binding restoration, missing binding failure and forwarding",
  "path": "packages/core/src/scheduled-task/port.ts",
  "archive": "sources/packages/core/src/scheduled-task/port.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "8ea347436e18a93f8dc43926c7fb84108fc0a20c",
  "source_sha256": "5fb969a9e8a030b02e31ff1678e1e0c2887c4e30c3078a5016642131de95ead7",
  "source_bytes": 2092,
  "required_source_line_ranges": [
    [
      7,
      41
    ]
  ],
  "prior_literal_ranges": []
}
```

```json
{"first_line":7,"last_line":41,"source_byte_start":206,"source_byte_end_exclusive":2092,"bytes":1886,"sha256":"2a470da5a8694148251c1f3fb021e8cb6fbf862cdf98763e9b2d6d266a38cdf5"}
```

~~~~typescript
// Capability tools reach the scheduler through this port so the Location graph never imports the
// Session graph (Session -> LocationServiceMap -> capability tools would close a type cycle). Location
// graphs hoist their own global nodes, so the running scheduler binds itself here for the process.
export class Service extends Context.Service<Service, ScheduledTaskCapability.Interface>()("@orchestra/v2/ScheduledTaskPort") {}

const state: { bound?: ScheduledTaskCapability.Interface } = {}

/** Called by the scheduler layer; the previous binding is restored when that layer's Scope closes. */
export const bind = (api: ScheduledTaskCapability.Interface) => Effect.acquireRelease(
  Effect.sync(() => {
    const previous = state.bound
    state.bound = api
    return previous
  }),
  (previous) => Effect.sync(() => {
    state.bound = previous
  }),
)

const current = Effect.suspend(() => state.bound ? Effect.succeed(state.bound) : Effect.die("schedule_manage requires the host scheduler"))
export const node = makeGlobalNode({
  service: Service,
  layer: Layer.succeed(Service, Service.of({
    create: (owner, input) => Effect.flatMap(current, (api) => api.create(owner, input)),
    list: (owner) => Effect.flatMap(current, (api) => api.list(owner)),
    placed: (placement) => Effect.flatMap(current, (api) => api.placed(placement)),
    get: (owner, id) => Effect.flatMap(current, (api) => api.get(owner, id)),
    update: (owner, id, input) => Effect.flatMap(current, (api) => api.update(owner, id, input)),
    pause: (owner, id) => Effect.flatMap(current, (api) => api.pause(owner, id)),
    resume: (owner, id) => Effect.flatMap(current, (api) => api.resume(owner, id)),
    remove: (owner, id) => Effect.flatMap(current, (api) => api.remove(owner, id)),
    run: (owner, id, key) => Effect.flatMap(current, (api) => api.run(owner, id, key)),
  })),
  deps: [],
})
~~~~

## AUT4-C06

```json
{
  "block_id": "AUT4-C06",
  "type": "literal_source_chain",
  "requests": [
    "RE-AUT4-01",
    "RE-AUT4-02",
    "RE-AUT4-03"
  ],
  "body_anchors": [
    "S01",
    "S02"
  ],
  "requested_subject": "Complete legacy model: plan/record/skip/resume, local DST conversion and deterministic noncryptographic IDs",
  "path": "packages/core/src/scheduled-task/model.ts",
  "archive": "sources/packages/core/src/scheduled-task/model.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "a5560b15853e2941c31bf9e803560bbea0c24c4e",
  "source_sha256": "f29962a40bd89bca23cff892d3ff01fcfa8e660b390c4831c88ca7cc695f0b5d",
  "source_bytes": 6670,
  "required_source_line_ranges": [
    [
      1,
      140
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S02",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task/model.ts",
      "source_archive": "sources/packages/core/src/scheduled-task/model.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "a5560b15853e2941c31bf9e803560bbea0c24c4e",
      "source_sha256": "f29962a40bd89bca23cff892d3ff01fcfa8e660b390c4831c88ca7cc695f0b5d",
      "source_bytes": 6670,
      "first_line": 25,
      "last_line": 36,
      "source_byte_start": 818,
      "source_byte_end_exclusive": 1659,
      "excerpt_bytes": 841,
      "excerpt_sha256": "396f8792f9d53d1756f739a8758740254ba64242ac227d906eec867c9d95187c",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 162170,
      "literal_content_byte_end_exclusive": 163011
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S02",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task/model.ts",
      "source_archive": "sources/packages/core/src/scheduled-task/model.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "a5560b15853e2941c31bf9e803560bbea0c24c4e",
      "source_sha256": "f29962a40bd89bca23cff892d3ff01fcfa8e660b390c4831c88ca7cc695f0b5d",
      "source_bytes": 6670,
      "first_line": 66,
      "last_line": 82,
      "source_byte_start": 2970,
      "source_byte_end_exclusive": 4055,
      "excerpt_bytes": 1085,
      "excerpt_sha256": "c9d3d54dd1b8bb114196dabd09175f3ee2f81e21e406ed9c29d623adf0ba7e93",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 163142,
      "literal_content_byte_end_exclusive": 164227
    }
  ]
}
```

```json
{"first_line":1,"last_line":24,"source_byte_start":0,"source_byte_end_exclusive":818,"bytes":818,"sha256":"572b7ca99e6cbf93c8136828cf9bbc897e221f9d7e203f502130e984e3810224"}
```

~~~~typescript
export * as ScheduledTaskModel from "./model"

import { DateTime, Option } from "effect"
import type { ScheduledTask } from "@orchestra/schema/scheduled-task"

type Recurring = Exclude<ScheduledTask.Cadence, "once">

// The part of a task that decides when it runs. `minute` is the intended local time of day in `timezone`;
// daily and weekly slots are rebuilt from it, so a slot moved by a DST gap does not drag later slots with it.
export type Timing = {
  readonly cadence: ScheduledTask.Cadence
  readonly minute: number
  readonly timezone: string
  readonly next: number
  readonly enabled: boolean
  readonly missed?: number
}

export type Plan = { type: "wait" } | { type: "run"; slot: number; missed?: number } | { type: "skip"; slot: number }

const HOUR = 3_600_000
const DAY = 24 * HOUR
const LATE = DAY

~~~~

```json
{"first_line":37,"last_line":65,"source_byte_start":1659,"source_byte_end_exclusive":2970,"bytes":1311,"sha256":"3f9f7b3d9172712c657b57444280c24105bd201526d3fb52698b08da58c195f6"}
```

~~~~typescript

// A run whose prompt was admitted. A run that served `slot` moves the task past it; an extra run (Run now
// with no due slot, or a slot rescheduled while it ran) only rolls a slot that is already behind `time`.
// One-off tasks pause.
export function recordRun<T extends Timing>(task: T, run: { time: number; slot?: number; missed?: number }): T {
  const from = run.slot ?? task.next
  return {
    ...task,
    missed: run.slot === undefined ? task.missed : run.missed,
    enabled: task.cadence === "once" ? false : task.enabled,
    next: task.cadence === "once" ? task.next : following(task, task.cadence, from, run.time),
  }
}

export function skipRun<T extends Timing>(task: T, slot: number, now: number): T {
  if (task.cadence === "once") return { ...task, missed: slot, enabled: false }
  return { ...task, missed: slot, next: following(task, task.cadence, slot, now) }
}

// A one-off task whose time has passed cannot resume; it needs a new future time first.
export function canResume(task: Timing, now: number) {
  return task.cadence !== "once" || task.next > now
}

export function resume<T extends Timing>(task: T, now: number): T {
  if (task.cadence === "once") return { ...task, enabled: true }
  return { ...task, enabled: true, next: following(task, task.cadence, task.next, now) }
}

~~~~

```json
{"first_line":83,"last_line":140,"source_byte_start":4055,"source_byte_end_exclusive":6670,"bytes":2615,"sha256":"026a2c31781e7c3ed8780e55e34830c3ae3950208065ca44955daf1236ede18d"}
```

~~~~typescript

export function validZone(timezone: string) {
  return Option.isSome(DateTime.zoneMakeNamed(timezone))
}

// Local time of day, in minutes after midnight, of an instant in `timezone`.
export function localMinute(time: number, timezone: string) {
  const parts = DateTime.toParts(DateTime.makeZonedUnsafe(time, { timeZone: timezone }))
  return parts.hour * 60 + parts.minute
}

// Deterministic IDs for the run that serves `slot`, so a retry, a second process or a restart reconciles
// with the Session and prompt a first attempt already created instead of starting another run. The time
// prefix matches the ID layout of Sessions (descending) and messages (ascending).
export function slotIDs(taskID: string, slot: number) {
  const seed = `${taskID}:${slot}`
  return {
    session: `ses_${stamp(slot, true)}${digest(`session:${seed}`)}`,
    message: `msg_${stamp(slot, false)}${digest(`message:${seed}`)}`,
  }
}

// The calendar day `days` after the local day of `from`, at the task's minute, in the task's zone.
function local(zone: { minute: number; timezone: string }, from: number, days: number) {
  const parts = DateTime.toParts(DateTime.makeZonedUnsafe(from, { timeZone: zone.timezone }))
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day + days, Math.floor(zone.minute / 60), zone.minute % 60)
  return DateTime.toEpochMillis(
    DateTime.makeZonedUnsafe(wall, { timeZone: zone.timezone, adjustForTimeZone: true, disambiguation: "compatible" }),
  )
}

function stamp(time: number, descending: boolean) {
  const current = BigInt(time) * 0x1000n + 1n
  const value = descending ? ~current : current
  return Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn)
      .toString(16)
      .padStart(2, "0"),
  ).join("")
}

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

// 14 base62 characters from a non-cryptographic hash; IDs only need to be stable and well spread.
function digest(text: string) {
  return Array.from({ length: 14 }, (_, index) => BASE62[hash(text, index) % 62]).join("")
}

function hash(text: string, seed: number) {
  const codes = Array.from(text, (char) => char.charCodeAt(0))
  const [a, b] = codes.reduce(
    ([h1, h2], code) => [Math.imul(h1 ^ code, 2654435761), Math.imul(h2 ^ code, 1597334677)],
    [0xdeadbeef ^ seed, 0x41c6ce57 ^ seed],
  )
  const h1 = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909)
  const h2 = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}
~~~~

## AUT4-C07

```json
{
  "block_id": "AUT4-C07",
  "type": "literal_source_chain",
  "requests": [
    "RE-AUT4-02",
    "RE-AUT4-03"
  ],
  "body_anchors": [
    "S03"
  ],
  "requested_subject": "Complete capability timing: cron parsing, possible dates and OR, anchor/catchup, bounds/scan/countWalls and gap resolution",
  "path": "packages/core/src/scheduled-task/capability-model.ts",
  "archive": "sources/packages/core/src/scheduled-task/capability-model.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "b92983cab05a5cff1ae32f459378192d07ddfc0b",
  "source_sha256": "256620d07285f1e60c7e6023f4101e4f8738a565f43a6b859d8c1a7861230620",
  "source_bytes": 10649,
  "required_source_line_ranges": [
    [
      1,
      218
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S03",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task/capability-model.ts",
      "source_archive": "sources/packages/core/src/scheduled-task/capability-model.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "b92983cab05a5cff1ae32f459378192d07ddfc0b",
      "source_sha256": "256620d07285f1e60c7e6023f4101e4f8738a565f43a6b859d8c1a7861230620",
      "source_bytes": 10649,
      "first_line": 42,
      "last_line": 58,
      "source_byte_start": 1838,
      "source_byte_end_exclusive": 2738,
      "excerpt_bytes": 900,
      "excerpt_sha256": "90f9f24d6735968e84ff4c3d8a3d66adbe63e9a6d63986cad801c59bf1b3e927",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 164779,
      "literal_content_byte_end_exclusive": 165679
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S03",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task/capability-model.ts",
      "source_archive": "sources/packages/core/src/scheduled-task/capability-model.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "b92983cab05a5cff1ae32f459378192d07ddfc0b",
      "source_sha256": "256620d07285f1e60c7e6023f4101e4f8738a565f43a6b859d8c1a7861230620",
      "source_bytes": 10649,
      "first_line": 83,
      "last_line": 105,
      "source_byte_start": 4012,
      "source_byte_end_exclusive": 5326,
      "excerpt_bytes": 1314,
      "excerpt_sha256": "42e180a8a3fbb208c1f84c68aa1cea1fffd6f4ab9e79a2d2c3f08f942945bc47",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 165811,
      "literal_content_byte_end_exclusive": 167125
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "S03",
      "role": "previously_transported_implementation",
      "source_path": "packages/core/src/scheduled-task/capability-model.ts",
      "source_archive": "sources/packages/core/src/scheduled-task/capability-model.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "b92983cab05a5cff1ae32f459378192d07ddfc0b",
      "source_sha256": "256620d07285f1e60c7e6023f4101e4f8738a565f43a6b859d8c1a7861230620",
      "source_bytes": 10649,
      "first_line": 177,
      "last_line": 189,
      "source_byte_start": 8574,
      "source_byte_end_exclusive": 9320,
      "excerpt_bytes": 746,
      "excerpt_sha256": "22f04c2fa6b2c7439332a70975dfeb3edc166b8134a8cb4f24be2748548bca0c",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 167258,
      "literal_content_byte_end_exclusive": 168004
    }
  ]
}
```

```json
{"first_line":1,"last_line":41,"source_byte_start":0,"source_byte_end_exclusive":1838,"bytes":1838,"sha256":"b3ed2d7e2bfa64c3b5f2ee49a612eb9b78c1442592e8b0154d38ef279cc0ecb1"}
```

~~~~typescript
export * as ScheduledTaskCapabilityModel from "./capability-model"

import { DateTime, Option } from "effect"
import type { CapabilityScheduleContract } from "../capability/schedule/contract"

// Pure timing for capability schedules. Legacy-browser tasks keep model.ts unchanged.
export type Timing = Readonly<{
  cadence: CapabilityScheduleContract.Cadence
  /** IANA zone; daily/weekly/cron wall-clock fields are read in it. */
  timezone: string
  /** Epoch ms of the slot currently owed (the persisted `next`). */
  next: number
  enabled: boolean
  catchUp: "latest" | "skip"
}>

/** `skipped` counts slots that will never run because of this plan. Catch-up counts local wall times, so several
 * cron matches inside one DST gap count separately although they collapse into one run. */
export type Plan =
  | { readonly type: "wait" }
  | { readonly type: "run"; readonly slot: number; readonly skipped: number }
  | { readonly type: "skip"; readonly skipped: number }

export type Cron = Readonly<{ minutes: ReadonlySet<number>; hours: ReadonlySet<number>; days: ReadonlySet<number>;
  months: ReadonlySet<number>; weekdays: ReadonlySet<number>; dayRestricted: boolean; weekdayRestricted: boolean }>

const MINUTE = 60_000
const DAY = 86_400_000
// A once slot later than this is skipped; with catchUp "skip" a slot later than one tick is not run.
const LATE = DAY
const TICK = MINUTE
// Local days searched for the next match: 28 years covers the weekday cycle of any date and Feb 29 across 2100.
const HORIZON = 28 * 366
const LIMIT = 100_000
// Bounds of minute, hour, day-of-month, month and day-of-week (7 is also Sunday).
const LOW = [0, 0, 1, 1, 0]
const HIGH = [59, 23, 31, 12, 7]
const MONTH_DAYS = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

type Clock = { zone: DateTime.TimeZone; cron: Cron; times: number[] }

~~~~

```json
{"first_line":59,"last_line":82,"source_byte_start":2738,"source_byte_end_exclusive":4012,"bytes":1274,"sha256":"cdb65caf3f00d9539d02f10f23695c85fb29cd68287b5b91035da642e1977629"}
```

~~~~typescript
  // With both day fields restricted any matching weekday fires; otherwise some selected month must hold the day.
  const possible =
    (cron.dayRestricted && cron.weekdayRestricted) ||
    sets[3].some((month) => sets[2].some((day) => day <= MONTH_DAYS[month]))
  return possible ? cron : undefined
}

/** First slot strictly after `after`; DST gaps resolve to the next valid local instant; undefined for a past once. */
export function nextAfter(timing: Timing, after: number): number | undefined {
  const cadence = timing.cadence
  if (!inRange(after)) return undefined
  if (cadence.kind === "once") return cadence.at > after ? cadence.at : undefined
  if (cadence.kind === "interval") {
    const step = cadence.minutes * MINUTE
    const slot = timing.next > after ? timing.next : timing.next + (Math.floor((after - timing.next) / step) + 1) * step
    return inRange(slot) ? slot : undefined
  }
  const clock = wallClock(timing)
  if (!clock) return undefined
  // Wall times at or before `after`'s own map to instants at or before it; inside a repeated hour later wall
  // times can too, so the scan keeps going until an instant passes `after`.
  return scan(clock, Math.floor(localWall(clock.zone, after) / MINUTE) * MINUTE, 1, (instant) => instant > after)
}

~~~~

```json
{"first_line":106,"last_line":176,"source_byte_start":5326,"source_byte_end_exclusive":8574,"bytes":3248,"sha256":"7cdad15bff132d9982a3c4d46f371bddb17d3a5b509ebce738ec920fb96599ca"}
```

~~~~typescript

function wallClock(timing: Timing): Clock | undefined {
  const cadence = timing.cadence
  if (cadence.kind === "once" || cadence.kind === "interval") return undefined
  const zone = Option.getOrUndefined(DateTime.zoneMakeNamed(timing.timezone))
  // Daily and weekly are the cron rules "M H * * *" and "M H * * D".
  const cron = parseCron(
    cadence.kind === "cron"
      ? cadence.expression
      : `${cadence.time.split(":").map(Number).reverse().join(" ")} * * ${cadence.kind === "weekly" ? cadence.day : "*"}`,
  )
  if (!zone || !cron) return undefined
  const times = [...cron.hours].flatMap((hour) => [...cron.minutes].map((minute) => hour * 60 + minute))
  return { zone, cron, times: times.sort((a, b) => a - b) }
}

// The last slot at or before `now`. When `now` is in the second pass of a repeated hour, wall times up to one
// offset change past its own already ran, so the backward scan starts that much later.
function latestSlot(clock: Clock, now: number) {
  const repeat = Math.max(0, localWall(clock.zone, now - DAY) - (now - DAY) - (localWall(clock.zone, now) - now))
  const start = Math.floor((localWall(clock.zone, now) + repeat) / MINUTE) * MINUTE + MINUTE
  return scan(clock, start, -1, (instant) => instant <= now)
}

// The first accepted instant among matching wall times from `from`; resolution is monotone in wall time.
function scan(clock: Clock, from: number, step: 1 | -1, accept: (instant: number) => boolean) {
  let wall = seek(clock, from, step)
  for (let index = 0; wall !== undefined && index < LIMIT; index++) {
    const instant = resolve(clock.zone, wall)
    if (accept(instant)) return instant
    wall = seek(clock, wall, step)
  }
  return undefined
}

// The first matching local wall time after `bound` (step 1) or the last one before it (step -1).
function seek(clock: Clock, bound: number, step: 1 | -1) {
  const first = Math.floor(bound / DAY)
  for (let index = 0; index <= HORIZON; index++) {
    const day = first + index * step
    if (!matchesDay(clock.cron, day)) continue
    const walls = clock.times.map((time) => day * DAY + time * MINUTE)
    const wall = step === 1 ? walls.find((wall) => wall > bound) : walls.findLast((wall) => wall < bound)
    if (wall !== undefined) return wall
  }
  return undefined
}

function matchesDay(cron: Cron, day: number) {
  const date = new Date(day * DAY)
  if (!cron.months.has(date.getUTCMonth() + 1)) return false
  const dayOfMonth = cron.days.has(date.getUTCDate())
  const weekday = cron.weekdays.has(date.getUTCDay())
  return cron.dayRestricted && cron.weekdayRestricted ? dayOfMonth || weekday : dayOfMonth && weekday
}

// Matching wall times in (from, to].
function countWalls(clock: Clock, from: number, to: number) {
  const first = Math.floor(from / DAY)
  const last = Math.floor(to / DAY)
  return Array.from({ length: Math.min(Math.max(0, last - first + 1), LIMIT) }, (_, index) => first + index).reduce(
    (total, day) => {
      if (!matchesDay(clock.cron, day)) return total
      if (day > first && day < last) return total + clock.times.length
      const walls = clock.times.map((time) => day * DAY + time * MINUTE)
      return total + walls.filter((wall) => wall > from && wall <= to).length
    },
    0,
  )
}

~~~~

```json
{"first_line":190,"last_line":218,"source_byte_start":9320,"source_byte_end_exclusive":10649,"bytes":1329,"sha256":"e1bbd1e2a7d0410bb5383e661cae46c63013f4c0436523ce413bb0f9440000fa"}
```

~~~~typescript
}

// Local wall-clock time of an instant, encoded as UTC epoch ms.
function localWall(zone: DateTime.TimeZone, instant: number) {
  return instant + DateTime.zonedOffset(DateTime.makeZonedUnsafe(instant, { timeZone: zone }))
}

// Effect DateTime rejects instants near the edge of the Date range.
function inRange(instant: number) {
  return Math.abs(instant) < 8e15
}

function parseField(field: string, min: number, max: number) {
  const items = field.split(",").map((item) => parseItem(item, min, max))
  return items.every((item): item is number[] => item !== undefined) ? items.flat() : undefined
}

function parseItem(item: string, min: number, max: number) {
  const match = /^(?:(\*)|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(item)
  if (!match) return undefined
  // A step needs `*` or a range; `a/n` is not Vixie syntax.
  if (match[4] !== undefined && match[1] === undefined && match[3] === undefined) return undefined
  const low = match[1] ? min : Number(match[2])
  const high = match[1] ? max : Number(match[3] ?? match[2])
  const step = Number(match[4] ?? 1)
  // Like cronie, a step above the field maximum is rejected.
  if (low < min || high > max || low > high || step < 1 || step > max) return undefined
  return Array.from({ length: Math.floor((high - low) / step) + 1 }, (_, index) => low + index * step)
}
~~~~
