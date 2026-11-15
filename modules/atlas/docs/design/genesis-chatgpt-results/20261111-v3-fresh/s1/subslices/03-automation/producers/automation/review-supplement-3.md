# Suplemento literal de revisão 3 — AUTOMATION-L1

```json
{
  "type": "documentary_transport_header",
  "review_batch": "automation-3",
  "body_ref": {
    "path": "body.md",
    "bytes": 60588,
    "sha256": "b31d52e5bf25f6eca3807e9c1f418b70d865c9d63c5690125c530c54f8247d84",
    "git_blob_sha": "04c87b44543b6bde9713228c7b6fda0fc444a00a"
  },
  "recipe_ref": {
    "path": "recipe.json",
    "bytes": 32520,
    "sha256": "d42e72daa68af5354ddc50e8f7d03c3bb82b451b2732612fc4a4dbb87ed89a3a",
    "git_blob_sha": "a2bc0ec47c421abc4fa18ee6f0212213999606ad"
  },
  "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "body_sections": [
    6,
    7,
    8,
    9
  ],
  "body_utf8_byte_interval": [
    30198,
    48200
  ],
  "public_requests": [
    {
      "path": "../../relay/automation-3/j1-response.md",
      "bytes": 8441,
      "sha256": "906a155f0521df31c8b2be459aaae09df9e656663947257cd8e609e00fd3a790",
      "git_blob_sha": "cbe146adf53230ac56b7eb438fb5d6cbdcc315c2",
      "judge_id": "J1",
      "origin": "public_request_relay",
      "repository_commit": null
    },
    {
      "path": "../../relay/automation-3/j2-response.md",
      "bytes": 6448,
      "sha256": "a23c54ec037b21caebbba4a12a7ea5e21023d6cc53511ac57680afb0709c3626",
      "git_blob_sha": "c6d7f7e8138706929a7bdbd1977a52a187abcca8",
      "judge_id": "J2",
      "origin": "public_request_relay",
      "repository_commit": null
    }
  ],
  "canonical_request_namespace": "J1; J2 correspondence in index",
  "j2_mapping": {
    "RE-AUT3-01": [
      "RE-AUT3-01"
    ],
    "RE-AUT3-02": [
      "RE-AUT3-02",
      "RE-AUT3-03"
    ],
    "RE-AUT3-03": [
      "RE-AUT3-04",
      "RE-AUT3-05"
    ],
    "RE-AUT3-04": [
      "RE-AUT3-04",
      "RE-AUT3-05"
    ],
    "RE-AUT3-05": [
      "RE-AUT3-06"
    ]
  },
  "authorized_body_revision": {
    "receipt": {
      "path": "revisions/v3/delta.json",
      "bytes": 13658,
      "sha256": "f10e98f4211547e710c099aaa2827c79f44ee1b1cef583435c85b6298b1aeb0a",
      "git_blob_sha": "3f4f98e9e15b2a473e989b3a3e955f0025158ee0"
    },
    "substitutions": [
      {
        "id": "AUT3-DELTA-01",
        "section": "7.2",
        "old_text": "Estado scoped-red resulta de fail mais recente; scoped-green precisa de requisitos existentes e pass dos caminhos requeridos; sem requisito, retorna null. Um check error/pending não vira pass.",
        "new_text": "O estado usa o resultado mais recente por `(kind, command)` no tree: qualquer `fail` produz scoped-red e, sem requisito configurado, retorna null. Para scoped-green, basta algum check `scoped` com `pass` quando há scoped.tests, além de um `pass` por workflow exigido. Isso pode coexistir com outros checks scoped `pending`/`error`; não prova que todos os comandos scoped passaram.",
        "v2_byte_interval": [
          37127,
          37320
        ],
        "v3_byte_interval": [
          37127,
          37510
        ],
        "line_1_based": 218,
        "old_bytes": 193,
        "new_bytes": 383,
        "sources": [
          {
            "path": "packages/core/src/board/ci.ts",
            "archive": "sources/packages/core/src/board/ci.ts",
            "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
            "git_blob_sha": "77bc3370fc8a34249a2baf19ee10c7e8151cdc6b",
            "sha256": "7a67b182097690e957ec40cf04f753e2695047f7b2fa5f19b792d8db9e38c7dd",
            "bytes": 25362,
            "intervals": [
              {
                "first_line": 426,
                "last_line": 454,
                "bytes": 1376,
                "sha256": "58ae1526d9c8d4ac7d3f88a2ab84e7800b3cff54383d61bfc08b6a466f53ca61"
              }
            ]
          }
        ]
      },
      {
        "id": "AUT3-DELTA-02",
        "section": "7.2",
        "old_text": "Workflows são enviados uma vez por tree/arquivo no ledger observado.",
        "new_text": "Para o card, o ledger evita novo dispatch do mesmo workflow no mesmo tree quando já existe row com outcome diferente de `error`; se houver apenas rows em `error`, permite outra tentativa.",
        "v2_byte_interval": [
          37328,
          37397
        ],
        "v3_byte_interval": [
          37518,
          37706
        ],
        "line_1_based": 220,
        "old_bytes": 69,
        "new_bytes": 188,
        "sources": [
          {
            "path": "packages/core/src/board/ci.ts",
            "archive": "sources/packages/core/src/board/ci.ts",
            "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
            "git_blob_sha": "77bc3370fc8a34249a2baf19ee10c7e8151cdc6b",
            "sha256": "7a67b182097690e957ec40cf04f753e2695047f7b2fa5f19b792d8db9e38c7dd",
            "bytes": 25362,
            "intervals": [
              {
                "first_line": 284,
                "last_line": 334,
                "bytes": 2226,
                "sha256": "5d3e7d96176dbfdc57e2228ab8ca3b916e3e1176fd40ae1dd2703db200b3f74c"
              }
            ]
          }
        ]
      },
      {
        "id": "AUT3-DELTA-03",
        "section": "7.3",
        "old_text": "Subscription engine ou preço ausente é `not-metered`, e mistura de medido/não medido pode ser parcial.",
        "new_text": "`spend.card` considera medida a Session com custo positivo cujo provider não é `claude-code`; não medidas entram na outra classe apenas se têm tokens. O meter de modelos é `not-metered` sem Sessions vinculadas, ou se não houver Session medida e houver não medidas com tokens; nos demais casos retorna `usd`, inclusive `usd:0` com ambas as classes vazias. A coexistência de medidas e não medidas com tokens marca `partial`.",
        "v2_byte_interval": [
          38086,
          38191
        ],
        "v3_byte_interval": [
          38395,
          38826
        ],
        "line_1_based": 224,
        "old_bytes": 105,
        "new_bytes": 431,
        "sources": [
          {
            "path": "packages/core/src/board/spend.ts",
            "archive": "sources/packages/core/src/board/spend.ts",
            "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
            "git_blob_sha": "c5c82e700282b4ba2fad710a5a87daae0328b6f9",
            "sha256": "11d1284e196ac2f72708d88a47d7f839f5e380d0f4cc87e0a196d4b4c32d45ce",
            "bytes": 6301,
            "intervals": [
              {
                "first_line": 9,
                "last_line": 17,
                "bytes": 298,
                "sha256": "11e57701550c4f28d47e01b9f0573780adfd54725ef82c8f44632583672d3765"
              },
              {
                "first_line": 19,
                "last_line": 55,
                "bytes": 1836,
                "sha256": "c847abd79187739114d26ec4afb991658796afd94cc4f325adfe08ef4cf0cd2f"
              },
              {
                "first_line": 127,
                "last_line": 133,
                "bytes": 197,
                "sha256": "606d9fc0800f9cce0a5986f041c9f4c6f7a5518d4d7dbe98e8e0c669f62aede5"
              }
            ]
          },
          {
            "path": "packages/core/src/board/money.ts",
            "archive": "sources/packages/core/src/board/money.ts",
            "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
            "git_blob_sha": "2e898a1aaf5d8740ced0bcd0a8afe0baa3996bc9",
            "sha256": "30254e118087b0f8ac51e48b0c1f4a5f2e7bfd7a4bf2907267fe37c13a8a582b",
            "bytes": 9068,
            "intervals": [
              {
                "first_line": 21,
                "last_line": 64,
                "bytes": 2143,
                "sha256": "5aa187dd5ec8d182e9d79255cfffe71172f8594619da5fbed3eac67eade60244"
              }
            ]
          }
        ]
      }
    ],
    "inverse_to_v2_verified": true
  },
  "prior_literals": "evidence-review.md; existing B01–B13 ranges reused by exact byte offsets and hashes",
  "shared_population_reconciliation": "review-supplement-1-index.json#/shared_population_reconciliation",
  "new_population_census": false,
  "history_repeated": false,
  "tests": "NOT_RUN",
  "provider_execution": "NOT_RUN",
  "oracle_access": false
}
```

## AUT3-C01

```json
{
  "block_id": "AUT3-C01",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-01",
    "RE-AUT3-02",
    "RE-AUT3-04",
    "RE-AUT3-05",
    "RE-AUT3-06"
  ],
  "body_anchors": [
    "B01",
    "B02",
    "B03",
    "B07",
    "B10",
    "B13"
  ],
  "requested_subject": "Serviço completo desde constants/make: transações/projeções/trail/deps/CRUD/move/steps/questions/decisions/notes/attachments/undo/owner controls/polls/ports",
  "path": "packages/core/src/board/board.ts",
  "archive": "sources/packages/core/src/board/board.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "0488f3819c967df78abd4d6a5a94805e48b3213e",
  "source_sha256": "9b0f56eb1b4c8a78bec8b6af3ce16a71a25bfdcb4e3a3b581317b4126f99141d",
  "source_bytes": 83719,
  "required_source_line_ranges": [
    [
      149,
      1720
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B01",
      "source_path": "packages/core/src/board/board.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "0488f3819c967df78abd4d6a5a94805e48b3213e",
      "source_sha256": "9b0f56eb1b4c8a78bec8b6af3ce16a71a25bfdcb4e3a3b581317b4126f99141d",
      "first_line": 181,
      "last_line": 191,
      "excerpt_bytes": 695,
      "excerpt_sha256": "a5ea906ff67fe689af9f1e2f8544a4b7042bbfbe03dcc711b6334a6ffcd18ff6",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 116538,
      "literal_content_byte_end_exclusive": 117233
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B02",
      "source_path": "packages/core/src/board/board.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "0488f3819c967df78abd4d6a5a94805e48b3213e",
      "source_sha256": "9b0f56eb1b4c8a78bec8b6af3ce16a71a25bfdcb4e3a3b581317b4126f99141d",
      "first_line": 427,
      "last_line": 441,
      "excerpt_bytes": 765,
      "excerpt_sha256": "2d6dae25e7ea22c5f0361b45215fd328aa1f402d39dc49899cd0d90fb63a6941",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 118515,
      "literal_content_byte_end_exclusive": 119280
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B02",
      "source_path": "packages/core/src/board/board.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "0488f3819c967df78abd4d6a5a94805e48b3213e",
      "source_sha256": "9b0f56eb1b4c8a78bec8b6af3ce16a71a25bfdcb4e3a3b581317b4126f99141d",
      "first_line": 1062,
      "last_line": 1089,
      "excerpt_bytes": 2006,
      "excerpt_sha256": "d23bb3b4e4968535e1bddcf2f3d02a45da24959b480691f34ded27ce88ad91c7",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 119415,
      "literal_content_byte_end_exclusive": 121421
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B03",
      "source_path": "packages/core/src/board/board.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "0488f3819c967df78abd4d6a5a94805e48b3213e",
      "source_sha256": "9b0f56eb1b4c8a78bec8b6af3ce16a71a25bfdcb4e3a3b581317b4126f99141d",
      "first_line": 1421,
      "last_line": 1441,
      "excerpt_bytes": 1254,
      "excerpt_sha256": "fcf6abe6bcb809623543fadebcc2dcae7cbdbd4650fa4f5a866a451269a6912d",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 124407,
      "literal_content_byte_end_exclusive": 125661
    }
  ]
}
```

```json
{"first_line":149,"last_line":180,"bytes":1696,"sha256":"4d5ee50e69bdce0afba5fc1619c80964af7c3f84f4903d283a1aa5b2b76cfff6"}
```

~~~~typescript
const TRAIL_MS = 30_000
// Fields GitHub mirrors (slice B2); changing one marks the issue for the next push.
const MIRRORED = ["title", "body", "type", "epic_id", "stage", "steps"]
const UNDOABLE = ["issue.update", "issue.move", "steps.set", "epic.upsert", "question.withdraw"]
const ISSUE_COLUMNS = ["title", "body", "type", "epic_id", "estimate", "seat", "session_id", "branch", "pr_number", "stage", "position", "stage_entered_at", "attempts", "crash_reason", "guardrail_rule", "area", "order"]
const EPIC_COLUMNS = ["title", "goal", "position", "status"]

/**
 * `gh` replaces the GitHub runner (tests inject recorded responses); `scanner` replaces the toolkit's gitleaks with a command (executable and leading arguments); `poll`
 * starts the 60 second sync of every mirrored project and the 10 minute snapshot of every Building card. `record` binds
 * Atlas's PR record renderer for the merge queue.
 */
export const layerWith = (options: {
  readonly env?: NodeJS.ProcessEnv
  readonly gh?: BoardGithub.Gh
  readonly record?: BoardRecord.Port
  readonly scanner?: ReadonlyArray<string>
  readonly poll?: boolean
  /** Replaces the merge queue's `turbo` affected set; tests bind it so they need no installed workspace. */
  readonly affected?: BoardQueue.Deps["affected"]
}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      const credentials = yield* Credential.Service
      const proc = yield* AppProcess.Service
      const global = yield* Global.Service
      const db = database.db
      const cache = new Map<string, { readonly at: number; readonly trail: Board.Trail }>()

~~~~

```json
{"first_line":192,"last_line":426,"bytes":10932,"sha256":"35491ab5522d590ea6eb5f19af5f988d2ea762ecd425ce2a904df8cfeb043f9f"}
```

~~~~typescript

      const issueRecords = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, rows: IssueRow[]) {
        if (rows.length === 0) return []
        const ids = rows.map((row) => row.id)
        const known = yield* numbers(tx, project)
        const steps = yield* tx
          .select()
          .from(BoardStepTable)
          .where(inArray(BoardStepTable.issue_id, ids))
          .orderBy(asc(BoardStepTable.position))
          .all()
        const dependencies = yield* refs(tx, "depends", ids)
        const queued = yield* tx.select().from(BoardQueueTable).where(inArray(BoardQueueTable.issue_id, ids)).all()
        const cut = queued.length
          ? yield* tx
              .select({ issue: BoardBundleMemberTable.issue_id, n: BoardBundleTable.n })
              .from(BoardBundleMemberTable)
              .innerJoin(BoardBundleTable, eq(BoardBundleTable.id, BoardBundleMemberTable.bundle_id))
              .where(and(inArray(BoardBundleMemberTable.issue_id, ids), inArray(BoardBundleTable.status, ["open", "accepted"])))
              .all()
          : []
        const conflicted = queued.length
          ? yield* tx
              .select({ issue: BoardAttemptTable.issue_id })
              .from(BoardAttemptTable)
              .where(
                and(inArray(BoardAttemptTable.issue_id, ids), isNull(BoardAttemptTable.outcome), isNotNull(BoardAttemptTable.conflict_base)),
              )
              .all()
          : []
        return rows.map(
          (row): Board.Issue => ({
            id: row.id,
            number: row.number,
            ref: `${project.key}-${row.number}`,
            epic: row.epic_id ? (known.epics.get(row.epic_id) ?? null) : null,
            title: row.title,
            body: row.body,
            type: row.type,
            stage: row.stage,
            position: row.position,
            estimate: row.estimate,
            seat: row.seat,
            sessionID: row.session_id,
            branch: row.branch,
            prNumber: row.pr_number,
            holdBeforeMerge: row.hold_before_merge,
            paused: row.paused,
            stageEnteredAt: row.stage_entered_at,
            githubNumber: row.github_number,
            steps: steps
              .filter((step) => step.issue_id === row.id)
              .map((step) => ({ title: step.title, status: step.status, now: step.now })),
            dependsOn: dependencies.filter((item) => item.issue === row.id).map((item) => item.ref),
            area: row.area,
            order: row.order,
            queue: queueState(
              row,
              queued.find((item) => item.issue_id === row.id),
              cut.find((item) => item.issue === row.id)?.n,
              conflicted.some((item) => item.issue === row.id),
            ),
          }),
        )
      })

      // "depends": what each issue waits on. "blocks": which issues wait on each one.
      const refs = Effect.fnUntraced(function* (tx: Tx, direction: "depends" | "blocks", ids: Board.IssueID[]) {
        const self = direction === "depends" ? BoardDependencyTable.issue_id : BoardDependencyTable.depends_on_id
        const other = direction === "depends" ? BoardDependencyTable.depends_on_id : BoardDependencyTable.issue_id
        const rows = yield* tx
          .select({ issue: self, key: BoardProjectTable.key, number: BoardIssueTable.number })
          .from(BoardDependencyTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, other))
          .innerJoin(BoardProjectTable, eq(BoardProjectTable.id, BoardIssueTable.project_id))
          .where(inArray(self, ids))
          .orderBy(asc(BoardProjectTable.key), asc(BoardIssueTable.number))
          .all()
        return rows.map((row) => ({ issue: row.issue, ref: `${row.key}-${row.number}` }))
      })

      const questionRecords = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, rows: QuestionRow[]) {
        const known = yield* numbers(tx, project)
        return rows.map((row) => toQuestion(row, known))
      })

      // Read live through the pull-request plumbing and never stored. Only good reads are cached, briefly.
      const trail = Effect.fnUntraced(function* (issue: IssueRow, directory: string | null, fresh: boolean) {
        if (!issue.pr_number || !directory) return { state: "none", branch: issue.branch } satisfies Board.Trail
        const key = `${directory}#${issue.pr_number}`
        const now = yield* Clock.currentTimeMillis
        const hit = cache.get(key)
        if (!fresh && hit && now - hit.at < TRAIL_MS) return hit.trail
        cache.delete(key)
        const pulls = yield* PullRequest.make({ directory, env: options.env }).pipe(
          Effect.provideService(AppProcess.Service, proc),
        )
        return yield* pulls.read(issue.pr_number).pipe(
          Effect.map(
            (pr): Board.Trail => ({
              state: "ok",
              branch: pr.branch,
              pr,
              verifiedAt: now,
              commits: pr.commits.map((commit) => ({ hash: commit.hash, message: commit.message, seat: issue.seat })),
            }),
          ),
          Effect.tap((value) => Effect.sync(() => cache.set(key, { at: now, trail: value }))),
          Effect.catchTag("PullRequest.HostError", (error) =>
            Effect.succeed<Board.Trail>(
              error.kind === "not_authenticated"
                ? { state: "signed_out", message: "GitHub is signed out; sign in with gh to see the git trail." }
                : { state: "error", message: error.message },
            ),
          ),
        )
      })

      const snapshotOf = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow) {
        const epics = yield* tx
          .select()
          .from(BoardEpicTable)
          .where(eq(BoardEpicTable.project_id, project.id))
          .orderBy(asc(BoardEpicTable.position), asc(BoardEpicTable.number))
          .all()
        const issues = yield* tx
          .select()
          .from(BoardIssueTable)
          .where(eq(BoardIssueTable.project_id, project.id))
          .orderBy(asc(BoardIssueTable.stage), asc(BoardIssueTable.position), asc(BoardIssueTable.number))
          .all()
        const questions = yield* tx
          .select()
          .from(BoardQuestionTable)
          .where(and(eq(BoardQuestionTable.project_id, project.id), eq(BoardQuestionTable.status, "open")))
          .orderBy(asc(BoardQuestionTable.time_created))
          .all()
        const latest = yield* tx
          .select({ id: BoardActivityTable.id })
          .from(BoardActivityTable)
          .where(eq(BoardActivityTable.project_id, project.id))
          .orderBy(desc(BoardActivityTable.id))
          .limit(1)
          .get()
        const history = yield* tx
          .select({ issue: BoardActivityTable.issue_id, reason: BoardActivityTable.reason, after: BoardActivityTable.after, at: BoardActivityTable.time_created })
          .from(BoardActivityTable)
          .where(eq(BoardActivityTable.project_id, project.id))
          .orderBy(asc(BoardActivityTable.id))
          .all()
        const forecast = yield* forecastOf(tx, project)
        return {
          project: toProject(project),
          epics: epics.map((row) => toEpic(project.key, row)),
          issues: yield* issueRecords(tx, project, issues),
          questions: yield* questionRecords(tx, project, questions),
          cursor: latest?.id ?? null,
          forecast: forecast.project,
          epicForecasts: forecast.epics,
          scope: BoardForecast.scope(history),
          ledger: yield* BoardLedger.of(tx, project),
        } satisfies Board.Snapshot
      })

      const activityOf = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, rows: ActivityRow[]) {
        const known = yield* numbers(tx, project)
        return rows.map((row) => toActivity(row, known.issues))
      })

      const pageOf = Effect.fnUntraced(function* (key: string, number: number) {
        const loaded = yield* reading((tx) =>
          Effect.gen(function* () {
            const project = yield* loadProject(tx, key)
            const row = yield* loadIssue(tx, project, number)
            const known = yield* numbers(tx, project)
            const questions = yield* tx
              .select()
              .from(BoardQuestionTable)
              .where(eq(BoardQuestionTable.issue_id, row.id))
              .orderBy(asc(BoardQuestionTable.time_created))
              .all()
            const notes = yield* tx
              .select()
              .from(BoardNoteTable)
              .where(eq(BoardNoteTable.issue_id, row.id))
              .orderBy(asc(BoardNoteTable.time_created), asc(BoardNoteTable.id))
              .all()
            const attachments = yield* tx
              .select()
              .from(BoardAttachmentTable)
              .where(eq(BoardAttachmentTable.issue_id, row.id))
              .orderBy(asc(BoardAttachmentTable.time_created), asc(BoardAttachmentTable.id))
              .all()
            const activity = yield* tx
              .select()
              .from(BoardActivityTable)
              .where(eq(BoardActivityTable.issue_id, row.id))
              .orderBy(asc(BoardActivityTable.id))
              .all()
            const issue = (yield* issueRecords(tx, project, [row]))[0]
            return {
              row,
              directory: yield* worktree(tx, project),
              page: {
                issue,
                record: row.record,
                questions: questions.map((item) => toQuestion(item, known)),
                notes: notes.map((item) => toNote(item, number)),
                attachments: attachments.map((item) => toAttachment(item, number)),
                activity: activity.map((item) => toActivity(item, known.issues)),
                dependencies: {
                  dependsOn: issue.dependsOn,
                  blocks: (yield* refs(tx, "blocks", [row.id])).map((item) => item.ref),
                },
              },
            }
          }),
        )
        return {
          ...loaded.page,
          trail: yield* trail(loaded.row, loaded.directory, false),
          pushState: yield* snapshots.state(loaded.row.id).pipe(Effect.orElseSucceed(() => null)),
        } satisfies Board.IssuePage
      })

      // The plain-language summary of a guardrail rule from the checkout's own engine; null when it cannot be read.
      const ruleSummary = Effect.fnUntraced(function* (directory: string | null, rule: string) {
        if (!directory) return null
        const guard = yield* Guardrail.make({ directory, env: options.env }).pipe(Effect.provideService(AppProcess.Service, proc))
        return yield* guard.rules().pipe(
          Effect.map((found) => found.rules.find((item) => item.id === rule)?.summary ?? null),
          Effect.catchTag("Guardrail.EngineError", () => Effect.succeed(null)),
        )
      })

~~~~

```json
{"first_line":442,"last_line":1061,"bytes":29741,"sha256":"4730164ac2bd3437829cdc4014157e165790a5007f0bd88c885f32ba61d20ced"}
```

~~~~typescript
      }

      const resolveRepo = Effect.fnUntraced(function* (tx: Tx, repo: string) {
        const row = yield* tx
          .select({ id: ProjectTable.id })
          .from(ProjectTable)
          .where(
            path.isAbsolute(repo)
              ? eq(ProjectTable.worktree, AbsolutePath.make(path.resolve(repo)))
              : eq(ProjectTable.id, ProjectSchema.ID.make(repo)),
          )
          .get()
        if (!row) return yield* new NotFoundError({ message: `No Orchestra project matches the repo ${repo}; open it in Orchestra first.` })
        return row.id
      })

      const resolveDependencies = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, list: readonly string[]) {
        return yield* Effect.forEach(list, (ref) =>
          Effect.gen(function* () {
            const match = /^(?:([A-Z]{2,6})-)?(\d+)$/.exec(ref.trim())
            if (!match) return yield* new RefusedError({ message: `"${ref}" is not an issue ref; use ${project.key}-12 or 12.` })
            const owner = match[1] && match[1] !== project.key ? yield* loadProject(tx, match[1]) : project
            return (yield* loadIssue(tx, owner, Number(match[2]))).id
          }),
        )
      })

      const setDependencies = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, list: readonly string[]) {
        const ids = Array.from(new Set(yield* resolveDependencies(tx, project, list)))
        const edges = (yield* tx.select().from(BoardDependencyTable).all()).filter((edge) => edge.issue_id !== issue.id)
        const cycle = ids.find((id) => reaches(edges, id, issue.id, new Set()))
        if (cycle)
          return yield* new RefusedError({
            message:
              cycle === issue.id
                ? `${project.key}-${issue.number} cannot depend on itself.`
                : `That dependency would make a cycle: ${list.join(", ")} already waits on ${project.key}-${issue.number}.`,
          })
        yield* tx.delete(BoardDependencyTable).where(eq(BoardDependencyTable.issue_id, issue.id)).run()
        if (ids.length > 0)
          yield* tx
            .insert(BoardDependencyTable)
            .values(ids.map((id) => ({ issue_id: issue.id, depends_on_id: id })))
            .run()
      })

      const replaceSteps = Effect.fnUntraced(function* (tx: Tx, issue: Board.IssueID, steps: readonly Board.Step[]) {
        yield* tx.delete(BoardStepTable).where(eq(BoardStepTable.issue_id, issue)).run()
        if (steps.length > 0)
          yield* tx
            .insert(BoardStepTable)
            .values(
              steps.map((step, position) => ({
                id: Board.StepID.create(),
                issue_id: issue,
                position,
                title: step.title,
                status: step.status,
                now: step.now,
              })),
            )
            .run()
      })

      const stepsOf = Effect.fnUntraced(function* (tx: Tx, issue: Board.IssueID) {
        return (yield* tx
          .select()
          .from(BoardStepTable)
          .where(eq(BoardStepTable.issue_id, issue))
          .orderBy(asc(BoardStepTable.position))
          .all()).map((step): Board.Step => ({ title: step.title, status: step.status, now: step.now }))
      })

      const issueResult = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, id: Board.IssueID, activity: Board.ActivityID) {
        const row = yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, id)).get()
        const issue = row ? (yield* issueRecords(tx, project, [row]))[0] : undefined
        return {
          result: issue ? { activity, issue } : { activity },
          changed: changed(project.id, activity, id),
        }
      })

      // Applies an activity row's fields to the current state; used by undo.
      const apply = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, row: ActivityRow, fields: Fields | null) {
        if (row.action === "question.withdraw") {
          yield* tx
            .update(BoardQuestionTable)
            .set({ status: fields?.status === "withdrawn" ? "withdrawn" : "open" })
            .where(eq(BoardQuestionTable.id, String(row.after?.id ?? row.before?.id) as Board.QuestionID))
            .run()
          return
        }
        if (row.action === "epic.upsert") {
          const id = String(row.after?.id ?? row.before?.id) as Board.EpicID
          if (!fields) {
            const used = yield* tx.select({ id: BoardIssueTable.id }).from(BoardIssueTable).where(eq(BoardIssueTable.epic_id, id)).get()
            if (used) return yield* new RefusedError({ message: "Issues belong to that epic now; it cannot be uncreated." })
            yield* tx.delete(BoardEpicTable).where(eq(BoardEpicTable.id, id)).run()
            return
          }
          yield* tx
            .update(BoardEpicTable)
            .set(pick(fields, EPIC_COLUMNS) as Partial<typeof BoardEpicTable.$inferInsert>)
            .where(eq(BoardEpicTable.id, id))
            .run()
          return
        }
        const issue = row.issue_id
        if (!issue || !fields) return
        if (Array.isArray(fields.steps)) yield* replaceSteps(tx, issue, fields.steps as Board.Step[])
        if (Array.isArray(fields.depends_on)) {
          const current = yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, issue)).get()
          if (current) yield* setDependencies(tx, project, current, fields.depends_on as string[])
        }
        const columns = pick(fields, ISSUE_COLUMNS) as Partial<typeof BoardIssueTable.$inferInsert>
        const dirty = Object.keys(fields).some((key) => MIRRORED.includes(key)) && project.github_repo !== null
        if (Object.keys(columns).length > 0 || dirty)
          yield* tx
            .update(BoardIssueTable)
            .set({ ...columns, ...(dirty ? { github_dirty: true } : {}) })
            .where(eq(BoardIssueTable.id, issue))
            .run()
      })

      const github = BoardGithub.make({
        quiet: (work) => quiet(work).pipe(Effect.orDie),
        publish: (changed) => events.publish(Board.Event.Changed, changed),
        log,
        gh: options.gh ?? BoardGithub.runner(proc, options.env),
      })
      const ci = BoardCi.make({
        ...options,
        quiet: (work) => quiet(work).pipe(Effect.orDie),
        proc,
        gh: options.gh ?? BoardGithub.runner(proc, options.env),
      })
      const snapshots = BoardSnapshot.make({
        quiet: (work) => quiet(work).pipe(Effect.orDie),
        proc,
        scanner: options.scanner
          ? Effect.succeed(options.scanner)
          : BackendToolkit.ensure("gitleaks").pipe(
              Effect.map((ready) => [ready.executable]),
              Effect.orElseSucceed(() => undefined),
              Effect.provideService(AppProcess.Service, proc),
            ),
        remote: (directory, project) => ci.contract(directory, project).pipe(Effect.map((contract) => contract.snapshots.remote)),
        env: options.env,
      })

      const conflicts = BoardConflicts.make({
        quiet: (work) => quiet(work).pipe(Effect.orDie),
        git: gitRunner(proc, options.env),
        base: (directory, project) => ci.contract(directory, project).pipe(Effect.map((contract) => contract.base)),
        publish: (changed) => events.publish(Board.Event.Changed, changed),
      })

      const queue = BoardQueue.make({
        quiet: (work) => quiet(work).pipe(Effect.orDie),
        proc,
        env: options.env,
        gh: options.gh ?? BoardGithub.runner(proc, options.env),
        contract: ci.contract,
        publish: (changed) => events.publish(Board.Event.Changed, changed),
        record: options.record,
        affected: options.affected,
      })

      if (options.poll)
        yield* conflicts.sweep().pipe(Effect.ignore, Effect.repeat(Schedule.spaced("60 seconds")), Effect.forkScoped)

      if (options.poll) yield* queue.tick().pipe(Effect.ignore, Effect.repeat(Schedule.spaced("60 seconds")), Effect.forkScoped)

      if (options.poll)
        yield* snapshots.sweep().pipe(Effect.ignore, Effect.repeat(Schedule.spaced("10 minutes")), Effect.forkScoped)

      if (options.poll)
        yield* reading((tx) =>
          tx
            .select({ key: BoardProjectTable.key, id: BoardProjectTable.id, github: BoardProjectTable.github_repo })
            .from(BoardProjectTable)
            .where(ne(BoardProjectTable.status, "archived"))
            .all(),
        ).pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) =>
              Effect.gen(function* () {
                if (row.github) {
                  yield* github.sync(row.key)
                  yield* github.ci(row.key)
                }
                // CI minutes are spend too: a fetch can be what pushes the forecast past 90%.
                const raised = yield* quiet((tx) => BoardMoney.evaluate(tx, row.id))
                if (raised) yield* events.publish(Board.Event.Changed, { project: row.id, activity: raised })
              }),
            ),
          ),
          Effect.ignore,
          Effect.repeat(Schedule.spaced("60 seconds")),
          Effect.forkScoped,
        )

      return Service.of({
        summaries: Effect.fn("Board.summaries")(function* (options) {
          return yield* reading((tx) =>
            Effect.gen(function* () {
              const projects = yield* tx
                .select()
                .from(BoardProjectTable)
                .where(options?.archived ? undefined : ne(BoardProjectTable.status, "archived"))
                .orderBy(asc(BoardProjectTable.key))
                .all()
              const stages = yield* tx
                .select({ project: BoardIssueTable.project_id, stage: BoardIssueTable.stage, count: sql<number>`count(*)` })
                .from(BoardIssueTable)
                .groupBy(BoardIssueTable.project_id, BoardIssueTable.stage)
                .all()
              const open = yield* tx
                .select({ project: BoardQuestionTable.project_id, blocking: BoardQuestionTable.blocking })
                .from(BoardQuestionTable)
                .where(eq(BoardQuestionTable.status, "open"))
                .all()
              return yield* Effect.forEach(projects, (project) =>
                Effect.gen(function* () {
                  const questions = open.filter((item) => item.project === project.id)
                  return {
                    project: toProject(project),
                    stages: Object.fromEntries(
                      stages.filter((item) => item.project === project.id).map((item) => [item.stage, item.count]),
                    ),
                    openQuestions: questions.length,
                    health:
                      project.status === "paused"
                        ? "paused"
                        : project.forecast_late_streak >= 2
                          ? "at_risk"
                          : questions.some((item) => item.blocking)
                            ? "waiting_on_owner"
                            : "on_track",
                    forecast: (yield* forecastOf(tx, project)).project,
                  } satisfies Board.Summary
                }),
              )
            }),
          )
        }),

        snapshot: Effect.fn("Board.snapshot")(function* (key) {
          return yield* reading((tx) => loadProject(tx, key).pipe(Effect.flatMap((project) => snapshotOf(tx, project))))
        }),

        read: Effect.fn("Board.read")(function* (input) {
          const loaded = yield* reading((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              const snapshot = yield* snapshotOf(tx, project)
              const rows = yield* tx
                .select()
                .from(BoardActivityTable)
                .where(
                  and(
                    eq(BoardActivityTable.project_id, project.id),
                    input.since ? gt(BoardActivityTable.id, input.since) : undefined,
                    ne(BoardActivityTable.actor, "maestro"),
                  ),
                )
                .orderBy(desc(BoardActivityTable.id))
                .limit(100)
                .all()
              const ordered = rows.toReversed()
              const noteIDs = ordered.flatMap((row) =>
                (row.action === "note.add" || row.action === "note.edit") && row.after?.id ? [String(row.after.id) as Board.NoteID] : [],
              )
              const answerIDs = ordered.flatMap((row) =>
                row.action === "question.answer" && row.after?.id ? [String(row.after.id) as Board.QuestionID] : [],
              )
              const known = yield* numbers(tx, project)
              const notes = noteIDs.length > 0 ? yield* tx.select().from(BoardNoteTable).where(inArray(BoardNoteTable.id, noteIDs)).all() : []
              const answers =
                answerIDs.length > 0 ? yield* tx.select().from(BoardQuestionTable).where(inArray(BoardQuestionTable.id, answerIDs)).all() : []
              const attachments = yield* tx
                .select()
                .from(BoardAttachmentTable)
                .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardAttachmentTable.issue_id))
                .where(eq(BoardIssueTable.project_id, project.id))
                .orderBy(asc(BoardAttachmentTable.id))
                .all()
              return {
                ...snapshot,
                since: {
                  activity: ordered.map((row) => toActivity(row, known.issues)),
                  notes: notes.map((row) => toNote(row, known.issues.get(row.issue_id) ?? 0)),
                  answers: answers.map((row) => toQuestion(row, known)),
                },
                attachments: attachments.map((row) => toAttachment(row.board_attachment, row.board_issue.number)),
              }
            }),
          )
          if (input.issue === undefined) return loaded satisfies Board.Read
          return { ...loaded, issue: yield* pageOf(input.project, input.issue) } satisfies Board.Read
        }),

        issuePage: Effect.fn("Board.issuePage")(function* (key, number) {
          return yield* pageOf(key, number)
        }),

        spend: Effect.fn("Board.spend")(function* (key) {
          return yield* reading((tx) => BoardMoney.report(tx, key))
        }),

        decisions: Effect.fn("Board.decisions")(function* (key) {
          return yield* reading((tx) => BoardDecision.list(tx, key))
        }),

        proof: Effect.fn("Board.proof")(function* (key, number) {
          const loaded = yield* reading((tx) => BoardProof.load(tx, key, number))
          const live = yield* trail(loaded.row, loaded.directory, false)
          const summary = loaded.row.guardrail_rule ? yield* ruleSummary(loaded.directory, loaded.row.guardrail_rule) : null
          return BoardProof.build(key, loaded, live, summary)
        }),

        activity: Effect.fn("Board.activity")(function* (key, since) {
          return yield* reading((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const rows = yield* tx
                .select()
                .from(BoardActivityTable)
                .where(
                  and(
                    eq(BoardActivityTable.project_id, project.id),
                    since ? gt(BoardActivityTable.id, since as Board.ActivityID) : undefined,
                  ),
                )
                .orderBy(asc(BoardActivityTable.id))
                .all()
              return yield* activityOf(tx, project, rows)
            }),
          )
        }),

        project: Effect.fn("Board.project")(function* (input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const existing = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, input.key)).get()
              const repo = input.repo === undefined ? undefined : input.repo === null ? null : yield* resolveRepo(tx, input.repo)
              const next = {
                name: input.name,
                goal: input.goal,
                target_date: input.target_date,
                repo_project_id: repo,
                github_repo: input.github_repo,
              }
              if (!existing) {
                if (!input.name) return yield* new RefusedError({ message: `A new project needs a name; give ${input.key} one.` })
                const id = Board.ProjectID.create()
                const row = {
                  id,
                  key: input.key,
                  name: input.name,
                  goal: input.goal ?? "",
                  target_date: input.target_date ?? null,
                  budget_usd: null,
                  repo_project_id: repo ?? null,
                  github_repo: input.github_repo ?? null,
                  status: "active" as const,
                  github_state: "off" as const,
                  next_issue_number: 1,
                  next_epic_number: 1,
                }
                yield* tx.insert(BoardProjectTable).values(row).run()
                const activity = yield* log(tx, {
                  project: id,
                  actor: "maestro",
                  action: "project.upsert",
                  reason: input.reason,
                  after: pick(row, ["key", "name", "goal", "target_date", "repo_project_id", "github_repo"]),
                })
                return { result: { activity }, changed: changed(id, activity) }
              }
              yield* requireActive(existing)
              const change = diff(existing, next)
              if (!change) return yield* new RefusedError({ message: `Nothing to change on ${input.key}.` })
              yield* tx.update(BoardProjectTable).set(change.after).where(eq(BoardProjectTable.id, existing.id)).run()
              const activity = yield* log(tx, {
                project: existing.id,
                actor: "maestro",
                action: "project.upsert",
                reason: input.reason,
                ...change,
              })
              return { result: { activity }, changed: changed(existing.id, activity) }
            }),
          )
          return done.result
        }),

        epic: Effect.fn("Board.epic")(function* (input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              yield* requireActive(project)
              if (input.number === undefined) {
                if (!input.title) return yield* new RefusedError({ message: "A new epic needs a title." })
                const id = Board.EpicID.create()
                const last = yield* tx
                  .select({ position: sql<number | null>`max(${BoardEpicTable.position})` })
                  .from(BoardEpicTable)
                  .where(eq(BoardEpicTable.project_id, project.id))
                  .get()
                const row = {
                  title: input.title,
                  goal: input.goal ?? "",
                  position: input.position ?? (last?.position ?? 0) + 1,
                  status: input.status ?? ("open" as const),
                }
                yield* tx
                  .insert(BoardEpicTable)
                  .values({ id, project_id: project.id, number: project.next_epic_number, ...row })
                  .run()
                yield* tx
                  .update(BoardProjectTable)
                  .set({ next_epic_number: project.next_epic_number + 1 })
                  .where(eq(BoardProjectTable.id, project.id))
                  .run()
                const activity = yield* log(tx, {
                  project: project.id,
                  actor: "maestro",
                  action: "epic.upsert",
                  reason: input.reason,
                  after: { id, number: project.next_epic_number, ...row },
                })
                return { result: { activity }, changed: changed(project.id, activity) }
              }
              const epic = yield* loadEpic(tx, project, input.number)
              const change = diff(epic, { title: input.title, goal: input.goal, position: input.position, status: input.status })
              if (!change) return yield* new RefusedError({ message: `Nothing to change on ${project.key}-E${epic.number}.` })
              yield* tx.update(BoardEpicTable).set(change.after).where(eq(BoardEpicTable.id, epic.id)).run()
              const activity = yield* log(tx, {
                project: project.id,
                actor: "maestro",
                action: "epic.upsert",
                reason: input.reason,
                before: { id: epic.id, ...change.before },
                after: { id: epic.id, ...change.after },
              })
              return { result: { activity }, changed: changed(project.id, activity) }
            }),
          )
          return done.result
        }),

        issue: Effect.fn("Board.issue")(function* (input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              yield* requireActive(project)
              const epic =
                input.epic === undefined ? undefined : input.epic === null ? null : (yield* loadEpic(tx, project, input.epic)).id
              const now = yield* Clock.currentTimeMillis
              const fields = {
                title: input.title,
                body: input.body,
                type: input.type,
                epic_id: epic,
                estimate: input.estimate,
                seat: input.seat,
                session_id: input.session,
                branch: input.branch,
                pr_number: input.pr,
                attempts: input.attempts,
                crash_reason: input.crash_reason,
                guardrail_rule: input.guardrail_rule,
                area: input.area,
                order: input.order,
              }
              if (input.number === undefined) {
                if (!input.title) return yield* new RefusedError({ message: "A new issue needs a title." })
                const id = Board.IssueID.create()
                const row = {
                  id,
                  project_id: project.id,
                  number: project.next_issue_number,
                  title: input.title,
                  body: input.body ?? "",
                  type: input.type ?? ("feature" as const),
                  epic_id: epic ?? null,
                  stage: "backlog" as const,
                  position: yield* endOf(tx, project.id, "backlog"),
                  estimate: input.estimate ?? null,
                  seat: input.seat ?? null,
                  session_id: input.session ?? null,
                  branch: input.branch ?? null,
                  pr_number: input.pr ?? null,
                  attempts: input.attempts ?? 0,
                  crash_reason: input.crash_reason ?? null,
                  guardrail_rule: input.guardrail_rule ?? null,
                  area: input.area ?? null,
                  order: input.order ?? null,
                  record: input.record ?? null,
                  stage_entered_at: now,
                  github_dirty: project.github_repo !== null,
                }
                yield* tx.insert(BoardIssueTable).values(row).run()
                yield* tx
                  .update(BoardProjectTable)
                  .set({ next_issue_number: project.next_issue_number + 1 })
                  .where(eq(BoardProjectTable.id, project.id))
                  .run()
                const created = yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, id)).get()
                if (created && input.depends_on) yield* setDependencies(tx, project, created, input.depends_on)
                if (created?.session_id) yield* BoardSnapshot.dispatch(tx, created, {})
                const activity = yield* log(tx, {
                  project: project.id,
                  issue: id,
                  actor: "maestro",
                  action: "issue.create",
                  reason: input.reason,
                  after: {
                    ...pick(row, [
                      "number",
                      "title",
                      "body",
                      "type",
                      "epic_id",
                      "stage",
                      "position",
                      "estimate",
                      "seat",
                      "session_id",
                      "branch",
                      "pr_number",
                      "stage_entered_at",
                      "crash_reason",
                      "guardrail_rule",
                      "area",
                      "order",
                      "record",
                    ]),
                    ...(input.depends_on ? { depends_on: input.depends_on } : {}),
                  },
                })
                return yield* issueResult(tx, project, id, activity)
              }
              const issue = yield* loadIssue(tx, project, input.number)
              yield* requireActive(project, issue)
              if (issue.stage === "review" && input.pr === null)
                return yield* new RefusedError({
                  message: `${project.key}-${issue.number} is in Review, which needs its PR; move it out of Review before unlinking the PR.`,
                })
              if (issue.stage === "queue" && ((input.pr !== undefined && input.pr !== issue.pr_number) || input.branch !== undefined))
                return yield* new RefusedError({
                  message: `${project.key}-${issue.number} is queued at its PR head; take it out with board_dequeue before changing its PR or branch.`,
                })
              // The record merges field by field so Maestro can fill it in over several calls; risk merges one level down.
              const record = input.record
                ? {
                    ...issue.record,
                    ...input.record,
                    ...(input.record.risk ? { risk: { ...issue.record?.risk, ...input.record.risk } } : {}),
                  }
                : undefined
              const change = diff(issue, { ...fields, record })
              const before = input.depends_on ? (yield* refs(tx, "depends", [issue.id])).map((item) => item.ref) : undefined
              // Compare as full refs so "12" and "LCH-12" are the same dependency.
              const wanted = input.depends_on
                ?.map((ref) => (/^\d+$/.test(ref.trim()) ? `${project.key}-${ref.trim()}` : ref.trim()))
                .toSorted()
              const dependencies =
                wanted && before && JSON.stringify(before.toSorted()) !== JSON.stringify(wanted)
                  ? { before: { depends_on: before }, after: { depends_on: wanted } }
                  : undefined
              if (!change && !dependencies)
                return yield* new RefusedError({ message: `Nothing to change on ${project.key}-${issue.number}.` })
              if (dependencies) yield* setDependencies(tx, project, issue, dependencies.after.depends_on)
              const dirty = Object.keys(change?.after ?? {}).some((key) => MIRRORED.includes(key)) && project.github_repo !== null
              if (change || dirty)
                yield* tx
                  .update(BoardIssueTable)
                  .set({ ...change?.after, ...(dirty ? { github_dirty: true } : {}) })
                  .where(eq(BoardIssueTable.id, issue.id))
                  .run()
              yield* BoardSnapshot.follow(tx, issue, change?.after ?? {})
              const activity = yield* log(tx, {
                project: project.id,
                issue: issue.id,
                actor: "maestro",
                action: "issue.update",
                reason: input.reason,
                before: { ...change?.before, ...dependencies?.before },
                after: { ...change?.after, ...dependencies?.after },
              })
              return yield* issueResult(tx, project, issue.id, activity)
            }),
          )
          return done.result
        }),

        move: Effect.fn("Board.move")(function* (input) {
          if (input.stage === "intake")
            return yield* new RefusedError({ message: "Intake holds only GitHub-born issues; Maestro cannot move an issue into it." })
          if (input.stage === "queue")
            return yield* new RefusedError({ message: "Only the host moves a card into Queue; verify it and call board_queue." })
          const ref = `${input.project}-${input.number}`
          // A Shipped move with a PR needs a live, uncached proof that the PR is merged, read before the write lock.
          const checked = yield* reading((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              const issue = yield* loadIssue(tx, project, input.number)
              return { issue, directory: yield* worktree(tx, project) }
            }),
          )
          const proof =
            input.stage === "shipped" && checked.issue.pr_number && !checked.issue.hold_before_merge
              ? yield* trail(checked.issue, checked.directory, true)
              : undefined
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              const issue = yield* loadIssue(tx, project, input.number)
~~~~

```json
{"first_line":1090,"last_line":1420,"bytes":16065,"sha256":"a4ade48dbd87c1be554c189c943afe13ed8cd79b6be4d25250d11489a49d2338"}
```

~~~~typescript
              const now = yield* Clock.currentTimeMillis
              const moved = issue.stage !== input.stage
              const next = {
                stage: input.stage,
                position:
                  input.position ?? (moved ? yield* endOf(tx, project.id, input.stage) : issue.position),
                stage_entered_at: moved ? now : issue.stage_entered_at,
              }
              const change = diff(issue, next)
              if (!change) return yield* new RefusedError({ message: `${ref} is already there.` })
              yield* tx
                .update(BoardIssueTable)
                .set({ ...change.after, ...(moved && project.github_repo !== null ? { github_dirty: true } : {}) })
                .where(eq(BoardIssueTable.id, issue.id))
                .run()
              const activity = yield* log(tx, {
                project: project.id,
                issue: issue.id,
                actor: "maestro",
                action: "issue.move",
                reason: input.reason,
                ...change,
              })
              return yield* issueResult(tx, project, issue.id, activity)
            }),
          )
          return done.result
        }),

        steps: Effect.fn("Board.steps")(function* (input) {
          if (input.steps.filter((step) => step.status === "active").length > 1)
            return yield* new RefusedError({ message: "Only one step can be active at a time." })
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              const issue = yield* loadIssue(tx, project, input.number)
              yield* requireActive(project, issue)
              const before = yield* stepsOf(tx, issue.id)
              const after = input.steps.map((step): Board.Step => ({ title: step.title, status: step.status, now: step.now ?? null }))
              if (JSON.stringify(before) === JSON.stringify(after))
                return yield* new RefusedError({ message: `${project.key}-${issue.number} already has these steps.` })
              yield* replaceSteps(tx, issue.id, after)
              if (project.github_repo !== null)
                yield* tx.update(BoardIssueTable).set({ github_dirty: true }).where(eq(BoardIssueTable.id, issue.id)).run()
              const activity = yield* log(tx, {
                project: project.id,
                issue: issue.id,
                actor: "maestro",
                action: "steps.set",
                reason: input.reason,
                before: { steps: before },
                after: { steps: after },
              })
              return yield* issueResult(tx, project, issue.id, activity)
            }),
          )
          return done.result
        }),

        // Questions stay open to Maestro while paused: asking is how it reaches the owner.
        question: Effect.fn("Board.question")(function* (input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              if (project.status === "archived") return yield* archived(project)
              if (input.action === "withdraw") {
                const question = yield* tx
                  .select()
                  .from(BoardQuestionTable)
                  .where(and(eq(BoardQuestionTable.id, input.id), eq(BoardQuestionTable.project_id, project.id)))
                  .get()
                if (!question) return yield* new NotFoundError({ message: `Question ${input.id} is not on ${project.key}.` })
                if (question.status !== "open")
                  return yield* new RefusedError({ message: `Question ${input.id} is already ${question.status}.` })
                yield* tx.update(BoardQuestionTable).set({ status: "withdrawn" }).where(eq(BoardQuestionTable.id, question.id)).run()
                const activity = yield* log(tx, {
                  project: project.id,
                  issue: question.issue_id,
                  actor: "maestro",
                  action: "question.withdraw",
                  reason: input.reason,
                  before: { id: question.id, status: "open" },
                  after: { id: question.id, status: "withdrawn" },
                })
                return { result: { activity }, changed: changed(project.id, activity, question.issue_id) }
              }
              const ids = input.options.map((option) => option.id)
              if (new Set(ids).size !== ids.length) return yield* new RefusedError({ message: "Option ids must be unique." })
              if (!ids.includes(input.recommended))
                return yield* new RefusedError({ message: `The recommended option must be one of: ${ids.join(", ")}.` })
              const issue = input.issue === undefined ? null : (yield* loadIssue(tx, project, input.issue)).id
              const epic = input.epic === undefined ? null : (yield* loadEpic(tx, project, input.epic)).id
              const id = Board.QuestionID.create()
              yield* tx
                .insert(BoardQuestionTable)
                .values({
                  id,
                  project_id: project.id,
                  issue_id: issue,
                  epic_id: epic,
                  text: input.text,
                  options: input.options,
                  recommended: input.recommended,
                  cost_of_waiting: input.cost_of_waiting ?? null,
                  blocking: input.blocking ?? false,
                  status: "open",
                })
                .run()
              const activity = yield* log(tx, {
                project: project.id,
                issue,
                actor: "maestro",
                action: "question.ask",
                reason: input.reason,
                after: {
                  id,
                  epic_id: epic,
                  text: input.text,
                  options: input.options,
                  recommended: input.recommended,
                  cost_of_waiting: input.cost_of_waiting ?? null,
                  blocking: input.blocking ?? false,
                  kind: null,
                },
              })
              return { result: { activity }, changed: changed(project.id, activity, issue) }
            }),
          )
          return done.result
        }),

        answer: Effect.fn("Board.answer")(function* (key, id, input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const question = yield* tx
                .select()
                .from(BoardQuestionTable)
                .where(and(eq(BoardQuestionTable.id, id as Board.QuestionID), eq(BoardQuestionTable.project_id, project.id)))
                .get()
              if (!question) return yield* new NotFoundError({ message: `Question ${id} is not on ${key}.` })
              if (question.status !== "open") return yield* new RefusedError({ message: `That question is already ${question.status}.` })
              if (!question.options.some((option) => option.id === input.option))
                return yield* new RefusedError({
                  message: `Pick one of: ${question.options.map((option) => option.id).join(", ")}.`,
                })
              const now = yield* Clock.currentTimeMillis
              yield* tx
                .update(BoardQuestionTable)
                .set({ status: "answered", answer_option: input.option, answer_text: input.text ?? null, answered_at: now })
                .where(eq(BoardQuestionTable.id, question.id))
                .run()
              const decision = yield* BoardDecision.record(tx, project, question, input, now)
              const activity = yield* log(tx, {
                project: project.id,
                issue: question.issue_id,
                actor: "owner",
                action: "question.answer",
                before: { id: question.id, status: "open" },
                after: {
                  id: question.id,
                  status: "answered",
                  answer_option: input.option,
                  answer_text: input.text ?? null,
                  decision,
                },
              })
              return { result: { activity }, changed: changed(project.id, activity, question.issue_id) }
            }),
          )
          return done.result
        }),

        changeDecision: Effect.fn("Board.changeDecision")(function* (key, id, input) {
          return (yield* write((tx) => BoardDecision.change(tx, key, id, input))).result
        }),

        decisionOutcome: Effect.fn("Board.decisionOutcome")(function* (input) {
          return (yield* write((tx) => BoardDecision.outcome(tx, input))).result
        }),

        settings: Effect.fn("Board.settings")(function* (key, input, actor) {
          return (yield* write((tx) => BoardMoney.settings(tx, key, input, actor))).result
        }),

        note: Effect.fn("Board.note")(function* (key, number, input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const issue = yield* loadIssue(tx, project, number)
              const id = Board.NoteID.create()
              yield* tx.insert(BoardNoteTable).values({ id, issue_id: issue.id, author: "owner", body: input.body }).run()
              const activity = yield* log(tx, {
                project: project.id,
                issue: issue.id,
                actor: "owner",
                action: "note.add",
                after: { id, author: "owner", body: input.body },
              })
              return { result: { activity }, changed: changed(project.id, activity, issue.id) }
            }),
          )
          return done.result
        }),

        // A secret's value goes only to the credential store, inside the same transaction; the board keeps its label.
        attach: Effect.fn("Board.attach")(function* (key, number, input) {
          const id = Board.AttachmentID.create()
          const content = input.kind === "secret" ? input.value : input.data
          if (!content)
            return yield* new RefusedError({
              message: input.kind === "secret" ? "A secret needs a `value`." : "A file needs base64 `data`.",
            })
          const file =
            input.kind === "secret"
              ? undefined
              : { bytes: Buffer.from(content, "base64"), path: path.join(global.data, "board", id, path.basename(input.name)) }
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const issue = yield* loadIssue(tx, project, number)
              if (input.kind === "secret") {
                const credential = yield* credentials.create({
                  integrationID: Integration.ID.make("board"),
                  label: input.name,
                  value: { type: "key", key: content },
                })
                yield* tx
                  .insert(BoardAttachmentTable)
                  .values({ id, issue_id: issue.id, kind: "secret", name: input.name, credential_id: credential.id })
                  .run()
              }
              if (input.kind !== "secret" && file) {
                yield* Effect.promise(() => Bun.write(file.path, file.bytes))
                yield* tx
                  .insert(BoardAttachmentTable)
                  .values({
                    id,
                    issue_id: issue.id,
                    kind: input.kind,
                    name: input.name,
                    mime: input.mime ?? null,
                    size: file.bytes.length,
                    path: file.path,
                  })
                  .run()
              }
              const activity = yield* log(tx, {
                project: project.id,
                issue: issue.id,
                actor: "owner",
                action: "attachment.add",
                after: { id, kind: input.kind, name: input.name },
              })
              return { result: { activity }, changed: changed(project.id, activity, issue.id) }
            }),
          )
          return done.result
        }),

        editNote: Effect.fn("Board.editNote")(function* (key, number, id, input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const found = yield* ownerNote(tx, key, number, id, "edited")
              if (found.note.body === input.body) return yield* new RefusedError({ message: "That note already says this." })
              yield* tx.update(BoardNoteTable).set({ body: input.body }).where(eq(BoardNoteTable.id, found.note.id)).run()
              const activity = yield* log(tx, {
                project: found.project.id,
                issue: found.issue.id,
                actor: "owner",
                action: "note.edit",
                before: { id: found.note.id, body: found.note.body },
                after: { id: found.note.id, body: input.body },
              })
              return { result: { activity }, changed: changed(found.project.id, activity, found.issue.id) }
            }),
          )
          return done.result
        }),

        deleteNote: Effect.fn("Board.deleteNote")(function* (key, number, id) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const found = yield* ownerNote(tx, key, number, id, "deleted")
              yield* tx.delete(BoardNoteTable).where(eq(BoardNoteTable.id, found.note.id)).run()
              const activity = yield* log(tx, {
                project: found.project.id,
                issue: found.issue.id,
                actor: "owner",
                action: "note.delete",
                before: { id: found.note.id, body: found.note.body },
              })
              return { result: { activity }, changed: changed(found.project.id, activity, found.issue.id) }
            }),
          )
          return done.result
        }),

        // The activity row keeps the label only; a secret's value never leaves the credential store, which loses it here.
        removeAttachment: Effect.fn("Board.removeAttachment")(function* (key, number, id) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const issue = yield* loadIssue(tx, project, number)
              const attachment = yield* tx
                .select()
                .from(BoardAttachmentTable)
                .where(and(eq(BoardAttachmentTable.id, id as Board.AttachmentID), eq(BoardAttachmentTable.issue_id, issue.id)))
                .get()
              if (!attachment) return yield* new NotFoundError({ message: `Attachment ${id} is not on ${key}-${number}.` })
              yield* tx.delete(BoardAttachmentTable).where(eq(BoardAttachmentTable.id, attachment.id)).run()
              if (attachment.credential_id)
                yield* tx.delete(CredentialTable).where(eq(CredentialTable.id, attachment.credential_id)).run()
              const activity = yield* log(tx, {
                project: project.id,
                issue: issue.id,
                actor: "owner",
                action: "attachment.remove",
                before: { id: attachment.id, kind: attachment.kind, name: attachment.name },
              })
              return { result: { activity }, changed: changed(project.id, activity, issue.id), file: attachment.path }
            }),
          )
          const file = done.file
          if (file) yield* Effect.promise(() => fs.rm(path.dirname(file), { recursive: true, force: true }))
          return done.result
        }),

        undo: Effect.fn("Board.undo")(function* (key, id) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
~~~~

```json
{"first_line":1442,"last_line":1720,"bytes":11945,"sha256":"a99caf4d9a2707bdc26ba84853acfd007c576c4747e8646fe6b865224bc26101"}
```

~~~~typescript
                (row) =>
                  !row.undone_by &&
                  !(row.undoes && row.undoes > target.id) &&
                  entity(row) === entity(target) &&
                  touched(row).some((item) => keys.includes(item)),
              )
              if (conflict)
                return yield* new RefusedError({
                  message: `Changed since: a later ${conflict.action} touched the same fields, so this undo would clobber newer work.`,
                })
              yield* apply(tx, project, target, target.before)
              const activity = yield* log(tx, {
                project: project.id,
                issue: target.issue_id,
                actor: "owner",
                action: "undo",
                before: target.after,
                after: target.before,
                undoes: target.id,
              })
              yield* tx.update(BoardActivityTable).set({ undone_by: activity }).where(eq(BoardActivityTable.id, target.id)).run()
              return { result: { activity }, changed: changed(project.id, activity, target.issue_id) }
            }),
          )
          return done.result
        }),

        pause: Effect.fn("Board.pause")(function* (key, input) {
          return yield* setProjectPause(key, true, input.reason)
        }),

        resume: Effect.fn("Board.resume")(function* (key) {
          return yield* setProjectPause(key, false)
        }),

        archive: Effect.fn("Board.archive")(function* (key) {
          return yield* setArchived(key, true)
        }),

        unarchive: Effect.fn("Board.unarchive")(function* (key) {
          return yield* setArchived(key, false)
        }),

        pauseIssue: Effect.fn("Board.pauseIssue")(function* (key, number) {
          return yield* ownerIssue(key, number, "pause.set", (issue) =>
            issue.paused ? `${key}-${number} is already paused.` : { paused: true },
          )
        }),

        resumeIssue: Effect.fn("Board.resumeIssue")(function* (key, number) {
          return yield* ownerIssue(key, number, "pause.set", (issue) =>
            issue.paused ? { paused: false } : `${key}-${number} is not paused.`,
          )
        }),

        hold: Effect.fn("Board.hold")(function* (key, number, input) {
          return yield* ownerIssue(key, number, "hold.set", (issue) =>
            issue.hold_before_merge === input.hold
              ? `${key}-${number} ${input.hold ? "is already on hold" : "has no hold"}.`
              : { hold_before_merge: input.hold },
          )
        }),

        accept: Effect.fn("Board.accept")(function* (key, number) {
          return yield* intake(key, number, "intake.accept", "backlog")
        }),

        decline: Effect.fn("Board.decline")(function* (key, number) {
          return yield* intake(key, number, "intake.decline", "cut")
        }),

        ciRun: Effect.fn("Board.ciRun")(function* (input) {
          return yield* ci.run(input)
        }),

        snapshotPush: Effect.fn("Board.snapshotPush")(function* (key, number) {
          const issue = yield* reading((tx) => loadProject(tx, key).pipe(Effect.flatMap((project) => loadIssue(tx, project, number))))
          return yield* snapshots.push(issue.id)
        }),

        pushState: Effect.fn("Board.pushState")(function* (key, number) {
          const issue = yield* reading((tx) => loadProject(tx, key).pipe(Effect.flatMap((project) => loadIssue(tx, project, number))))
          return yield* snapshots.state(issue.id)
        }),

        conflictSweep: Effect.fn("Board.conflictSweep")(function* () {
          return yield* conflicts.sweep()
        }),

        queue: Effect.fn("Board.queue")(function* (input) {
          return yield* queue.enqueue(input).pipe(dieOnStorage)
        }),

        dequeue: Effect.fn("Board.dequeue")(function* (input) {
          return yield* queue.dequeue(input).pipe(dieOnStorage)
        }),

        bundle: Effect.fn("Board.bundle")(function* (input) {
          return yield* queue.decide(input).pipe(dieOnStorage)
        }),

        queueTick: Effect.fn("Board.queueTick")(function* () {
          return yield* queue.tick()
        }),

        sync: Effect.fn("Board.sync")(function* (key) {
          const done = yield* github.sync(key)
          if (done.status === "missing") return yield* new NotFoundError({ message: `There is no board project ${key}.` })
          if (done.status === "off") return yield* new RefusedError({ message: `${key} has no GitHub repository to mirror.` })
          return { state: done.state, error: done.error }
        }),
      })

      function setProjectPause(key: string, paused: boolean, reason?: string) {
        return write((tx) =>
          Effect.gen(function* () {
            const project = yield* loadProject(tx, key)
            if (project.status === "archived") return yield* archived(project)
            if ((project.status === "paused") === paused)
              return yield* new RefusedError({ message: `${key} is ${paused ? "already paused" : "not paused"}.` })
            const next = paused
              ? { status: "paused" as const, paused_reason: reason ?? null }
              : { status: "active" as const, paused_reason: null }
            yield* tx.update(BoardProjectTable).set(next).where(eq(BoardProjectTable.id, project.id)).run()
            const activity = yield* log(tx, {
              project: project.id,
              actor: "owner",
              action: "pause.set",
              reason: reason ?? null,
              before: { status: project.status, paused_reason: project.paused_reason },
              after: next,
            })
            return { result: { activity }, changed: changed(project.id, activity) }
          }),
        ).pipe(Effect.map((done) => done.result))
      }

      function setArchived(key: string, archive: boolean) {
        return write((tx) =>
          Effect.gen(function* () {
            const project = yield* loadProject(tx, key)
            if (archive && project.status !== "shipped" && project.status !== "paused")
              return yield* new RefusedError({
                message:
                  project.status === "archived"
                    ? `${key} is already archived.`
                    : `${key} is ${project.status}; only a shipped or paused project can be archived.`,
              })
            if (!archive && project.status !== "archived") return yield* new RefusedError({ message: `${key} is not archived.` })
            const next = archive ? ("archived" as const) : ("paused" as const)
            yield* tx.update(BoardProjectTable).set({ status: next }).where(eq(BoardProjectTable.id, project.id)).run()
            const activity = yield* log(tx, {
              project: project.id,
              actor: "owner",
              action: "archive.set",
              before: { status: project.status },
              after: { status: next },
            })
            return { result: { activity }, changed: changed(project.id, activity) }
          }),
        ).pipe(Effect.map((done) => done.result))
      }

      function ownerNote(tx: Tx, key: string, number: number, id: string, verb: "edited" | "deleted") {
        return Effect.gen(function* () {
          const project = yield* loadProject(tx, key)
          const issue = yield* loadIssue(tx, project, number)
          const note = yield* tx
            .select()
            .from(BoardNoteTable)
            .where(and(eq(BoardNoteTable.id, id as Board.NoteID), eq(BoardNoteTable.issue_id, issue.id)))
            .get()
          if (!note) return yield* new NotFoundError({ message: `Note ${id} is not on ${key}-${number}.` })
          if (note.author !== "owner")
            return yield* new RefusedError({ message: `Only your own notes can be ${verb}; GitHub and Maestro notes stay as written.` })
          return { project, issue, note }
        })
      }

      function ownerIssue(
        key: string,
        number: number,
        action: Board.Action,
        next: (issue: IssueRow) => string | Partial<Pick<IssueRow, "paused" | "hold_before_merge">>,
      ) {
        return write((tx) =>
          Effect.gen(function* () {
            const project = yield* loadProject(tx, key)
            const issue = yield* loadIssue(tx, project, number)
            const fields = next(issue)
            if (typeof fields === "string") return yield* new RefusedError({ message: fields })
            yield* tx.update(BoardIssueTable).set(fields).where(eq(BoardIssueTable.id, issue.id)).run()
            const activity = yield* log(tx, {
              project: project.id,
              issue: issue.id,
              actor: "owner",
              action,
              before: pick(issue, Object.keys(fields)),
              after: fields,
            })
            return { result: { activity }, changed: changed(project.id, activity, issue.id) }
          }),
        ).pipe(Effect.map((done) => done.result))
      }

      function intake(key: string, number: number, action: "intake.accept" | "intake.decline", stage: "backlog" | "cut") {
        return write((tx) =>
          Effect.gen(function* () {
            const project = yield* loadProject(tx, key)
            const issue = yield* loadIssue(tx, project, number)
            if (issue.stage !== "intake") return yield* new RefusedError({ message: `${key}-${number} is not in Intake.` })
            const now = yield* Clock.currentTimeMillis
            const next = { stage, position: yield* endOf(tx, project.id, stage), stage_entered_at: now }
            yield* tx
              .update(BoardIssueTable)
              .set({ ...next, ...(project.github_repo !== null ? { github_dirty: true } : {}) })
              .where(eq(BoardIssueTable.id, issue.id))
              .run()
            const activity = yield* log(tx, {
              project: project.id,
              issue: issue.id,
              actor: "owner",
              action,
              before: pick(issue, ["stage", "position", "stage_entered_at"]),
              after: next,
            })
            return { result: { activity }, changed: changed(project.id, activity, issue.id) }
          }),
        ).pipe(Effect.map((done) => done.result))
      }
    }),
  )

export const layer = layerWith({ poll: true, record: recordPort })

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Database.node, EventV2.node, Credential.node, AppProcess.node, Global.node],
})

// Storage failures are defects: the board has no recovery for a broken database.
function dieOnStorage<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.catchIf(
      (error): error is Extract<E, SqlError | EffectDrizzleQueryError> =>
        error instanceof SqlError || error instanceof EffectDrizzleQueryError,
      Effect.die,
    ),
  )
}

function pick(row: Fields, keys: readonly string[]) {
  return Object.fromEntries(keys.filter((key) => key in row).map((key) => [key, row[key]]))
}

function reaches(
  edges: ReadonlyArray<{ readonly issue_id: string; readonly depends_on_id: string }>,
  from: string,
  to: string,
  seen: Set<string>,
): boolean {
  if (from === to) return true
  if (seen.has(from)) return false
  seen.add(from)
  return edges.filter((edge) => edge.issue_id === from).some((edge) => reaches(edges, edge.depends_on_id, to, seen))
}

/** The card's place in the merge queue, derived from the queue, bundle and attempt rows; null outside the queue. */
function queueState(
  row: IssueRow,
  queued: typeof BoardQueueTable.$inferSelect | undefined,
  bundle: number | undefined,
  conflict: boolean,
): Board.QueueState | null {
  if (!queued) return null
  const status = row.hold_before_merge ? "held" : conflict ? "conflict" : bundle ? "running" : "waiting"
  return { status, bundle: bundle ?? null, urgent: queued.urgent, queuedAt: queued.queued_at }
}
~~~~

## AUT3-C02

```json
{
  "block_id": "AUT3-C02",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-01"
  ],
  "body_anchors": [
    "B01"
  ],
  "requested_subject": "Porta de tools e guard Maestro",
  "path": "packages/core/src/board/tools.ts",
  "archive": "sources/packages/core/src/board/tools.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "d1ba07e4231da173fb5aa5478375cba7f99c00b4",
  "source_sha256": "87638e1e13b803490987df2a5d33fd39e9c899ad7208a7b9d54d6f0635463eb5",
  "source_bytes": 8288,
  "required_source_line_ranges": [
    [
      1,
      161
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B01",
      "source_path": "packages/core/src/board/tools.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "d1ba07e4231da173fb5aa5478375cba7f99c00b4",
      "source_sha256": "87638e1e13b803490987df2a5d33fd39e9c899ad7208a7b9d54d6f0635463eb5",
      "first_line": 153,
      "last_line": 161,
      "excerpt_bytes": 401,
      "excerpt_sha256": "c580a703b01bd6731a21bd72896e18eadee5fb848d05516ef9c1304bfaf8f6e9",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 117610,
      "literal_content_byte_end_exclusive": 118011
    }
  ]
}
```

```json
{"first_line":1,"last_line":152,"bytes":7887,"sha256":"72f91aa17f2572b502f2802cd3566bbc8eb273469b88f08e9ff518dc573e5f5d"}
```

~~~~typescript
export * as BoardTools from "./tools"

import { Effect, Layer } from "effect"
import {
  BundleInput,
  BundleResult,
  CiRunInput,
  CiRunResult,
  DecisionOutcomeInput,
  DequeueInput,
  DequeueResult,
  EpicInput,
  IssueInput,
  MoveInput,
  ProjectInput,
  QueueInput,
  QueueResult,
  QuestionInput,
  ReadToolInput,
  ReadToolOutput,
  SettingsToolInput,
  StepsInput,
  WriteResult,
} from "@orchestra/schema/board"
import { AgentV2 } from "../agent"
import { makeGlobalNode } from "../effect/app-node"
import { ApplicationTools } from "../tool/application-tools"
import { Tool } from "../tool/tool"
import { Board } from "./board"

// The board tools are Maestro's only way to read and plan the board (contract section 4). Seats other than Maestro get a
// failure even when a profile would let them call the tool.

export const node = makeGlobalNode({
  name: "board/tools",
  layer: Layer.effectDiscard(
    Effect.gen(function* () {
      const tools = yield* ApplicationTools.Service
      const board = yield* Board.Service
      yield* tools
        .register({
          board_read: Tool.make({
            description:
              "Read a board project: epics, issues with steps, open questions, what the owner did since `since` (notes, answers, undos, pauses, holds), attachment names and, with `issue`, that issue's page with its live git trail. Pass the returned `cursor` as `since` next time. Without `project`, list the projects and their keys.",
            input: ReadToolInput,
            output: ReadToolOutput,
            execute: (input, context) => {
              const project = input.project
              if (project === undefined)
                return guard(
                  context,
                  board.summaries().pipe(
                    Effect.map((summaries) => ({
                      projects: summaries.map((summary) => ({
                        key: summary.project.key,
                        name: summary.project.name,
                        goal: summary.project.goal,
                        status: summary.project.status,
                        githubRepo: summary.project.githubRepo,
                      })),
                    })),
                  ),
                )
              return guard(context, board.read({ ...input, project }))
            },
          }),
          board_project: Tool.make({
            description:
              "Create a board project (needs `name`) or update one by `key`. `repo` is the repo directory the agents work in.",
            input: ProjectInput,
            output: WriteResult,
            execute: (input, context) => guard(context, board.project(input)),
          }),
          board_epic: Tool.make({
            description: "Create an epic (omit `number`; needs `title`) or update one by `number`.",
            input: EpicInput,
            output: WriteResult,
            execute: (input, context) => guard(context, board.epic(input)),
          }),
          board_issue: Tool.make({
            description:
              "Create an issue in Backlog (omit `number`; needs `title`) or update one by `number`, including linking its branch, PR, session and seat, `attempts`, `crash_reason` and the `guardrail_rule` that blocked it. `depends_on` replaces the list. `area` (the workspace packages the card should affect, as turbo names them) and `order` (landing order among cards sharing an area) come from archie's plan; null clears.",
            input: IssueInput,
            output: WriteResult,
            execute: (input, context) => guard(context, board.issue(input)),
          }),
          board_move: Tool.make({
            description:
              "Move an issue to a stage. Review needs a linked PR; Shipped needs that PR merged (or no PR and a reason) and no owner hold. Intake is the owner's.",
            input: MoveInput,
            output: WriteResult,
            execute: (input, context) => guard(context, board.move(input)),
          }),
          board_steps: Tool.make({
            description: "Replace an issue's step list. At most one step is active; `now` is the live line on the card.",
            input: StepsInput,
            output: WriteResult,
            execute: (input, context) => guard(context, board.steps(input)),
          }),
          board_question: Tool.make({
            description:
              "Ask the owner a question with 2-4 options and a recommended one, or withdraw an open question by `id`. Works while the project is paused.",
            input: QuestionInput,
            output: WriteResult,
            execute: (input, context) => guard(context, board.question(input)),
          }),
          board_settings: Tool.make({
            description:
              "Set a project's target date (epoch milliseconds) and budget in dollars. Omitted fields stay; null clears one. At 100% of the budget the board starts no new work.",
            input: SettingsToolInput,
            output: WriteResult,
            execute: (input, context) =>
              guard(context, board.settings(input.project, { target_date: input.target_date, budget_usd: input.budget_usd, reason: input.reason }, "maestro")),
          }),
          board_decision: Tool.make({
            description:
              "Record the outcome of an answered decision, by decision id or the answered question's id. Say what came of it; until then it reads \"applied, no result yet\".",
            input: DecisionOutcomeInput,
            output: WriteResult,
            execute: (input, context) => guard(context, board.decisionOutcome(input)),
          }),
          ci_run: Tool.make({
            description:
              "Run a card's scoped checks from .orchestra/ci.json on its worktree's current tree and report scoped-green, scoped-red or null. A tree that already has a result is not run again, so a commit that keeps the tree keeps its green. When scoped.tests takes {package} and none is given, a card that changes no workspace package (docs only) records an explicit passing `none: no workspace package affected` check instead of running tests, and a card that changes packages is refused with their names. run: false only reports.",
            input: CiRunInput,
            output: CiRunResult,
            execute: (input, context) => guard(context, board.ciRun(input)),
          }),
          board_queue: Tool.make({
            description:
              "Queue a verified Review card for merge. Needs its PR record (intent, decisions, not covered, risk level) written with board_issue, its PR head scoped-green, and every card it depends on shipped or queued. The host bundles queued cards, runs the full gate on the bundle and merges it; Maestro never merges.",
            input: QueueInput,
            output: QueueResult,
            execute: (input, context) => guard(context, board.queue(input)),
          }),
          board_dequeue: Tool.make({
            description:
              "Take a queued card back to Review with a reason. An open bundle it is in is dissolved; the other members stay queued.",
            input: DequeueInput,
            output: DequeueResult,
            execute: (input, context) => guard(context, board.dequeue(input)),
          }),
          board_bundle: Tool.make({
            description:
              "Decide a held bundle, by its number (KEY-B<n>). merge ships a flaky bundle as tested: its failing tests passed three scoped reruns. retry closes a flaky bundle, or releases a paused one, so the queue cuts its cards into a new bundle. release, with card, lets one held card of a dissolved bundle ride a bundle alone. Give the reason.",
            input: BundleInput,
            output: BundleResult,
            execute: (input, context) => guard(context, board.bundle(input)),
          }),
        })
        .pipe(Effect.orDie)
    }),
~~~~

## AUT3-C03

```json
{
  "block_id": "AUT3-C03",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-01",
    "RE-AUT3-06"
  ],
  "body_anchors": [
    "B01",
    "B03"
  ],
  "requested_subject": "Projeções públicas, decisão vigente e anexos sem path/credentialID",
  "path": "packages/core/src/board/rows.ts",
  "archive": "sources/packages/core/src/board/rows.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "10ebc542ef2fedcb6498be9379b77bd0e314471c",
  "source_sha256": "3814113d4826f52c72bdede0c437837caca0a2f7de53af0ca0b960b156d4efcb",
  "source_bytes": 3810,
  "required_source_line_ranges": [
    [
      1,
      113
    ]
  ],
  "prior_literal_ranges": []
}
```

```json
{"first_line":1,"last_line":113,"bytes":3810,"sha256":"3814113d4826f52c72bdede0c437837caca0a2f7de53af0ca0b960b156d4efcb"}
```

~~~~typescript
import { Board } from "@orchestra/schema/board"
import type { BoardAttachmentTable, BoardEpicTable, BoardNoteTable } from "./sql"
import type { ActivityRow, DecisionRow, ProjectRow, QuestionRow } from "./shared"

// Row to wire-shape mappers, with no database access.

/** Epics and questions are named by an `id` key in the row; issue changes by the row's issue. */
export function entity(row: ActivityRow) {
  return String(row.before?.id ?? row.after?.id ?? row.issue_id ?? "")
}

export function touched(row: ActivityRow) {
  return [...Object.keys(row.before ?? {}), ...Object.keys(row.after ?? {})].filter((key) => key !== "id")
}

export function toProject(row: ProjectRow): Board.Project {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    goal: row.goal,
    targetDate: row.target_date,
    budgetUsd: row.budget_usd,
    repoProjectID: row.repo_project_id,
    githubRepo: row.github_repo,
    status: row.status,
    pausedReason: row.paused_reason,
    autoAcceptIntake: row.auto_accept_intake,
    githubState: row.github_state,
    githubError: row.github_error,
    githubSyncedAt: row.github_synced_at,
  }
}

export function toEpic(key: string, row: typeof BoardEpicTable.$inferSelect): Board.Epic {
  return {
    id: row.id,
    number: row.number,
    ref: `${key}-E${row.number}`,
    title: row.title,
    goal: row.goal,
    position: row.position,
    status: row.status,
    githubMilestone: row.github_milestone,
  }
}

export function toQuestion(
  row: QuestionRow,
  known: { readonly issues: Map<string, number>; readonly epics: Map<string, number> },
): Board.Question {
  return {
    id: row.id,
    issue: row.issue_id ? (known.issues.get(row.issue_id) ?? null) : null,
    epic: row.epic_id ? (known.epics.get(row.epic_id) ?? null) : null,
    text: row.text,
    options: row.options,
    recommended: row.recommended,
    costOfWaiting: row.cost_of_waiting,
    blocking: row.blocking,
    status: row.status,
    answerOption: row.answer_option,
    answerText: row.answer_text,
    answeredAt: row.answered_at,
    timeCreated: row.time_created,
  }
}

export function toDecision(row: DecisionRow, known: { readonly issues: Map<string, number>; readonly epics: Map<string, number> }): Board.Decision {
  const chosen = row.options.find((option) => option.id === row.chosen)
  return {
    id: row.id,
    issue: row.issue_id ? (known.issues.get(row.issue_id) ?? null) : null,
    epic: row.epic_id ? (known.epics.get(row.epic_id) ?? null) : null,
    date: row.answered_at,
    question: row.question,
    options: row.options,
    recommended: row.recommended,
    chosen: row.chosen,
    chosenLabel: chosen?.label ?? row.chosen,
    text: row.chosen_text,
    answeredBy: row.answered_by,
    outcome: row.outcome ?? "applied, no result yet",
    outcomeAt: row.outcome_at,
    supersedes: row.supersedes_id,
    overturnedBy: row.overturned_by_id,
  }
}

export function toNote(row: typeof BoardNoteTable.$inferSelect, issue: number): Board.Note {
  return { id: row.id, issue, author: row.author, kind: row.kind, body: row.body, timeCreated: row.time_created }
}

// Never the stored path or credential id.
export function toAttachment(row: typeof BoardAttachmentTable.$inferSelect, issue: number): Board.Attachment {
  return { id: row.id, issue, kind: row.kind, name: row.name, mime: row.mime, size: row.size, timeCreated: row.time_created }
}

export function toActivity(row: ActivityRow, issues: Map<string, number>): Board.Activity {
  return {
    id: row.id,
    issue: row.issue_id ? (issues.get(row.issue_id) ?? null) : null,
    actor: row.actor,
    action: row.action,
    reason: row.reason,
    before: row.before,
    after: row.after,
    undoes: row.undoes,
    undoneBy: row.undone_by,
    timeCreated: row.time_created,
  }
}

~~~~

## AUT3-C04

```json
{
  "block_id": "AUT3-C04",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-01",
    "RE-AUT3-02",
    "RE-AUT3-04",
    "RE-AUT3-06"
  ],
  "body_anchors": [
    "B01",
    "B05"
  ],
  "requested_subject": "Helpers de loads/authority/log/worktree/forecast/waits e runner Git",
  "path": "packages/core/src/board/shared.ts",
  "archive": "sources/packages/core/src/board/shared.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "6ef7b42006697e252dcf6b4542e8a36354591ce4",
  "source_sha256": "7372c16b39f3077dddddfdfec7555bd5008cd489c90ce3546126fc38289ae2de",
  "source_bytes": 9436,
  "required_source_line_ranges": [
    [
      1,
      239
    ]
  ],
  "prior_literal_ranges": []
}
```

```json
{"first_line":1,"last_line":239,"bytes":9436,"sha256":"7372c16b39f3077dddddfdfec7555bd5008cd489c90ce3546126fc38289ae2de"}
```

~~~~typescript
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm"
import { Clock, Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Board } from "@orchestra/schema/board"
import type { Database } from "../database/database"
import type { AppProcess } from "../process"
import { ProjectTable } from "../project/sql"
import {
  BoardActivityTable,
  BoardDecisionTable,
  BoardDependencyTable,
  BoardEpicTable,
  BoardIssueTable,
  BoardProjectTable,
  BoardQuestionTable,
} from "./sql"
import { BoardForecast } from "./forecast"

// What the board service and its slice modules (money, decision, proof) share: errors, row types and the lookups that
// need nothing but a transaction.

/** A board project, epic, issue, question or activity row that does not exist. */
export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("Board.NotFoundError", {
  message: Schema.String,
}) {}

/** A write the contract refuses. The message says what to do instead. */
export class RefusedError extends Schema.TaggedErrorClass<RefusedError>()("Board.RefusedError", {
  message: Schema.String,
}) {}

/** The project spent its whole budget: the board starts no new work until the owner raises it. In-flight work continues. */
export class BudgetPausedError extends Schema.TaggedErrorClass<BudgetPausedError>()("Board.BudgetPausedError", {
  message: Schema.String,
}) {}

export type Tx = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
export type ProjectRow = typeof BoardProjectTable.$inferSelect
export type IssueRow = typeof BoardIssueTable.$inferSelect
export type ActivityRow = typeof BoardActivityTable.$inferSelect
export type QuestionRow = typeof BoardQuestionTable.$inferSelect
export type DecisionRow = typeof BoardDecisionTable.$inferSelect
export type Fields = Record<string, unknown>
export type Changed = { readonly project: string; readonly issue?: string; readonly activity: string }
export type Git = ReturnType<typeof gitRunner>

/** Runs git in `cwd` and never fails: a git that could not start reads as exit 1 with its message on `err`. */
export function gitRunner(proc: AppProcess.Interface, base?: NodeJS.ProcessEnv) {
  return (cwd: string, args: ReadonlyArray<string>, env?: Record<string, string>) =>
    proc
      .run(
        ChildProcess.make("git", ["--no-optional-locks", "-C", cwd, "-c", "core.fsmonitor=false", ...args], {
          cwd,
          env: { ...base, ...env },
          extendEnv: true,
          stdin: "ignore",
        }),
        { maxOutputBytes: 4 * 1024 * 1024, maxErrorBytes: 16 * 1024, timeout: "120 seconds" },
      )
      .pipe(
        Effect.map((result) => ({ code: result.exitCode, out: result.stdout.toString("utf8").trim(), err: result.stderr.toString("utf8").trim() })),
        Effect.catch((error) => Effect.succeed({ code: 1, out: "", err: error.message })),
      )
}


/** The position after the last card in `stage`. */
export const endOf = Effect.fnUntraced(function* (tx: Tx, project: Board.ProjectID, stage: Board.Stage) {
  const row = yield* tx
    .select({ position: sql<number | null>`max(${BoardIssueTable.position})` })
    .from(BoardIssueTable)
    .where(and(eq(BoardIssueTable.project_id, project), eq(BoardIssueTable.stage, stage)))
    .get()
  return (row?.position ?? 0) + 1
})

export function archived(project: ProjectRow) {
  return new RefusedError({ message: `${project.key} is archived; the owner unarchives it before anything changes.` })
}

export function changed(project: string, activity: string, issue?: string | null): Changed {
  return issue ? { project, issue, activity } : { project, activity }
}

/** The changed fields of `next` against `row`, or undefined when nothing changes. Undefined in `next` means untouched. */
export function diff<T extends Fields>(row: Fields, next: T) {
  const keys = Object.keys(next).filter((key) => next[key] !== undefined && !Object.is(row[key], next[key]))
  if (keys.length === 0) return undefined
  return {
    before: Object.fromEntries(keys.map((key) => [key, row[key]])) as Fields,
    after: Object.fromEntries(keys.map((key) => [key, next[key]])) as Partial<T>,
  }
}

export const loadProject = Effect.fnUntraced(function* (tx: Tx, key: string) {
  const row = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, key)).get()
  if (!row) return yield* new NotFoundError({ message: `There is no board project ${key}.` })
  return row
})

export const loadIssue = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, number: number) {
  const row = yield* tx
    .select()
    .from(BoardIssueTable)
    .where(and(eq(BoardIssueTable.project_id, project.id), eq(BoardIssueTable.number, number)))
    .get()
  if (!row) return yield* new NotFoundError({ message: `${project.key}-${number} does not exist.` })
  return row
})

export const loadEpic = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, number: number) {
  const row = yield* tx
    .select()
    .from(BoardEpicTable)
    .where(and(eq(BoardEpicTable.project_id, project.id), eq(BoardEpicTable.number, number)))
    .get()
  if (!row) return yield* new NotFoundError({ message: `${project.key}-E${number} does not exist.` })
  return row
})

export const log = Effect.fnUntraced(function* (
  tx: Tx,
  input: {
    readonly project: Board.ProjectID
    readonly issue?: Board.IssueID | null
    readonly actor: Board.Actor
    readonly action: Board.Action
    readonly reason?: string | null
    readonly before?: Fields | null
    readonly after?: Fields | null
    readonly undoes?: Board.ActivityID
  },
) {
  const id = Board.ActivityID.create()
  yield* tx
    .insert(BoardActivityTable)
    .values({
      id,
      project_id: input.project,
      issue_id: input.issue ?? null,
      actor: input.actor,
      action: input.action,
      reason: input.reason ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      undoes: input.undoes ?? null,
    })
    .run()
  return id
})

export const numbers = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow) {
  const issues = yield* tx
    .select({ id: BoardIssueTable.id, number: BoardIssueTable.number })
    .from(BoardIssueTable)
    .where(eq(BoardIssueTable.project_id, project.id))
    .all()
  const epics = yield* tx
    .select({ id: BoardEpicTable.id, number: BoardEpicTable.number })
    .from(BoardEpicTable)
    .where(eq(BoardEpicTable.project_id, project.id))
    .all()
  return {
    issues: new Map<string, number>(issues.map((row) => [row.id, row.number])),
    epics: new Map<string, number>(epics.map((row) => [row.id, row.number])),
  }
})

export const worktree = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow) {
  if (!project.repo_project_id) return null
  const row = yield* tx
    .select({ worktree: ProjectTable.worktree })
    .from(ProjectTable)
    .where(eq(ProjectTable.id, project.repo_project_id))
    .get()
  return row?.worktree ?? null
})

export const forecastOf = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow) {
  const issues = yield* tx
    .select({
      id: BoardIssueTable.id,
      number: BoardIssueTable.number,
      epic: BoardIssueTable.epic_id,
      stage: BoardIssueTable.stage,
      enteredAt: BoardIssueTable.stage_entered_at,
      paused: BoardIssueTable.paused,
    })
    .from(BoardIssueTable)
    .where(eq(BoardIssueTable.project_id, project.id))
    .all()
  const epics = yield* tx
    .select()
    .from(BoardEpicTable)
    .where(and(eq(BoardEpicTable.project_id, project.id), ne(BoardEpicTable.status, "cut")))
    .orderBy(asc(BoardEpicTable.position), asc(BoardEpicTable.number))
    .all()
  const known = yield* numbers(tx, project)
  const blocked = yield* tx
    .select({ issue: BoardQuestionTable.issue_id })
    .from(BoardQuestionTable)
    .where(
      and(
        eq(BoardQuestionTable.project_id, project.id),
        eq(BoardQuestionTable.status, "open"),
        eq(BoardQuestionTable.blocking, true),
      ),
    )
    .all()
  const upstream =
    issues.length === 0
      ? []
      : yield* tx
          .select({ issue: BoardDependencyTable.issue_id, key: BoardProjectTable.key, number: BoardIssueTable.number, stage: BoardIssueTable.stage })
          .from(BoardDependencyTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardDependencyTable.depends_on_id))
          .innerJoin(BoardProjectTable, eq(BoardProjectTable.id, BoardIssueTable.project_id))
          .where(inArray(BoardDependencyTable.issue_id, issues.map((row) => row.id)))
          .orderBy(asc(BoardProjectTable.key), asc(BoardIssueTable.number))
          .all()
  return BoardForecast.plan({
    items: issues.map((row) => {
      const dependency = upstream.find((item) => item.issue === row.id && item.stage !== "shipped" && item.stage !== "cut")
      return {
        epic: row.epic ? (known.epics.get(row.epic) ?? null) : null,
        stage: row.stage,
        enteredAt: row.enteredAt,
        waitsOn: dependency
          ? `${dependency.key}-${dependency.number}`
          : row.paused || blocked.some((item) => item.issue === row.id)
            ? `${project.key}-${row.number}`
            : null,
      }
    }),
    epics: epics.map((row) => ({ number: row.number, ref: `${project.key}-E${row.number}` })),
    targetDate: project.target_date,
    now: yield* Clock.currentTimeMillis,
  })
})
~~~~

## AUT3-C05

```json
{
  "block_id": "AUT3-C05",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-01",
    "RE-AUT3-02",
    "RE-AUT3-03",
    "RE-AUT3-04",
    "RE-AUT3-05",
    "RE-AUT3-06"
  ],
  "body_anchors": [
    "B01",
    "B12"
  ],
  "requested_subject": "Tabelas/índices de plano, checks, attempts, queue/bundles e activity; disposição operacional distinta",
  "path": "packages/core/src/board/sql.ts",
  "archive": "sources/packages/core/src/board/sql.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "2784e4042e5d383f2f19250ed9efc3c388623cde",
  "source_sha256": "752ca66b251fbe7691755f5bace14b5848112bb8da759570f7276637265464e4",
  "source_bytes": 16144,
  "required_source_line_ranges": [
    [
      1,
      430
    ]
  ],
  "prior_literal_ranges": []
}
```

```json
{"first_line":1,"last_line":430,"bytes":16144,"sha256":"752ca66b251fbe7691755f5bace14b5848112bb8da759570f7276637265464e4"}
```

~~~~typescript
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { Board } from "@orchestra/schema/board"
import type { Credential } from "../credential"
import { CredentialTable } from "../credential/sql"
import { Timestamps } from "../database/schema.sql"
import { ProjectTable } from "../project/sql"
import type { ProjectSchema } from "../project/schema"

export const BoardProjectTable = sqliteTable("board_project", {
  id: text().$type<Board.ProjectID>().primaryKey(),
  key: text().notNull().unique(),
  name: text().notNull(),
  goal: text().notNull(),
  target_date: integer(),
  budget_usd: real(),
  repo_project_id: text()
    .$type<ProjectSchema.ID>()
    .references(() => ProjectTable.id, { onDelete: "set null" }),
  github_repo: text(),
  status: text().$type<Board.ProjectStatus>().notNull(),
  paused_reason: text(),
  auto_accept_intake: integer({ mode: "boolean" }).notNull().default(false),
  github_state: text().$type<Board.GithubState>().notNull(),
  github_error: text(),
  github_issues_etag: text(),
  github_comments_etag: text(),
  github_since: integer(),
  github_synced_at: integer(),
  // When the CI minutes were last fetched from GitHub Actions.
  ci_synced_at: integer(),
  next_issue_number: integer().notNull(),
  next_epic_number: integer().notNull(),
  // Consecutive forecast evaluations with P50 past target_date; health turns at_risk at 2.
  forecast_late_streak: integer().notNull().default(0),
  // Where the base branch stood at the last conflict sweep; a move from here is a base advance (section 8.4).
  base_sha: text(),
  ...Timestamps,
})

export const BoardEpicTable = sqliteTable(
  "board_epic",
  {
    id: text().$type<Board.EpicID>().primaryKey(),
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    title: text().notNull(),
    goal: text().notNull(),
    position: real().notNull(),
    status: text().$type<Board.EpicStatus>().notNull(),
    github_milestone: integer(),
    ...Timestamps,
  },
  (table) => [uniqueIndex("board_epic_number_idx").on(table.project_id, table.number)],
)

export const BoardIssueTable = sqliteTable(
  "board_issue",
  {
    id: text().$type<Board.IssueID>().primaryKey(),
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    epic_id: text()
      .$type<Board.EpicID>()
      .references(() => BoardEpicTable.id, { onDelete: "set null" }),
    number: integer().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    type: text().$type<Board.IssueType>().notNull(),
    stage: text().$type<Board.Stage>().notNull(),
    position: real().notNull(),
    estimate: text().$type<Board.Estimate>(),
    seat: text(),
    session_id: text(),
    branch: text(),
    pr_number: integer(),
    hold_before_merge: integer({ mode: "boolean" }).notNull().default(false),
    paused: integer({ mode: "boolean" }).notNull().default(false),
    stage_entered_at: integer().notNull(),
    github_number: integer(),
    github_node_id: text(),
    // Proof signals the agent reports: attempts out of 3, why it stopped, the guardrail rule that blocked it.
    attempts: integer().notNull().default(0),
    crash_reason: text(),
    guardrail_rule: text(),
    // Mirrored fields changed since the last push to GitHub (slice B2 flushes these).
    github_dirty: integer({ mode: "boolean" }).notNull().default(false),
    // The PR record's Maestro fields (merge-queue spec section 4.5); the host renders it into the PR body.
    record: text({ mode: "json" }).$type<Board.PrRecord>(),
    // Plan shape (merge-queue spec section 4.4): the packages the card means to touch, in turbo's terms, and its landing
    // order among cards that share an area.
    area: text({ mode: "json" }).$type<ReadonlyArray<string>>(),
    order: integer(),
    ...Timestamps,
  },
  (table) => [
    uniqueIndex("board_issue_number_idx").on(table.project_id, table.number),
    index("board_issue_stage_idx").on(table.project_id, table.stage, table.position),
  ],
)

export const BoardDependencyTable = sqliteTable(
  "board_dependency",
  {
    issue_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    depends_on_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    ...Timestamps,
  },
  (table) => [primaryKey({ columns: [table.issue_id, table.depends_on_id] })],
)

export const BoardStepTable = sqliteTable(
  "board_step",
  {
    id: text().$type<Board.StepID>().primaryKey(),
    issue_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    title: text().notNull(),
    status: text().$type<Board.StepStatus>().notNull(),
    now: text(),
    ...Timestamps,
  },
  (table) => [index("board_step_issue_idx").on(table.issue_id, table.position)],
)

export const BoardQuestionTable = sqliteTable(
  "board_question",
  {
    id: text().$type<Board.QuestionID>().primaryKey(),
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    issue_id: text()
      .$type<Board.IssueID>()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    epic_id: text()
      .$type<Board.EpicID>()
      .references(() => BoardEpicTable.id, { onDelete: "cascade" }),
    text: text().notNull(),
    options: text({ mode: "json" }).$type<ReadonlyArray<Board.Option>>().notNull(),
    recommended: text().notNull(),
    cost_of_waiting: text(),
    // "budget" for the pre-emptive budget question Maestro raises from the forecast; null otherwise.
    kind: text(),
    blocking: integer({ mode: "boolean" }).notNull(),
    status: text().$type<Board.QuestionStatus>().notNull(),
    answer_option: text(),
    answer_text: text(),
    answered_at: integer(),
    ...Timestamps,
  },
  (table) => [index("board_question_project_idx").on(table.project_id, table.status)],
)

// One row per answered question; overturning an answer adds a row that supersedes the old one, which stays.
export const BoardDecisionTable = sqliteTable(
  "board_decision",
  {
    id: text().$type<Board.DecisionID>().primaryKey(),
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    issue_id: text()
      .$type<Board.IssueID>()
      .references(() => BoardIssueTable.id, { onDelete: "set null" }),
    epic_id: text()
      .$type<Board.EpicID>()
      .references(() => BoardEpicTable.id, { onDelete: "set null" }),
    question_id: text().$type<Board.QuestionID>().notNull(),
    question: text().notNull(),
    options: text({ mode: "json" }).$type<ReadonlyArray<Board.Option>>().notNull(),
    recommended: text().notNull(),
    chosen: text().notNull(),
    chosen_text: text(),
    answered_by: text().$type<Board.Actor>().notNull(),
    answered_at: integer().notNull(),
    outcome: text(),
    outcome_at: integer(),
    supersedes_id: text().$type<Board.DecisionID>(),
    overturned_by_id: text().$type<Board.DecisionID>(),
    ...Timestamps,
  },
  (table) => [index("board_decision_project_idx").on(table.project_id, table.answered_at)],
)

// GitHub Actions runs of a card's PR with the billable time, fetched on the poll and never per render.
export const BoardCiRunTable = sqliteTable(
  "board_ci_run",
  {
    run_id: integer().primaryKey(),
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    issue_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    name: text().notNull(),
    attempt: integer().notNull(),
    // Billable milliseconds across runner kinds, and what they cost at GitHub's per-minute rates.
    billable_ms: integer().notNull(),
    cost_usd: real().notNull(),
    ...Timestamps,
  },
  (table) => [index("board_ci_run_issue_idx").on(table.issue_id)],
)

// The pass or fail ledger (merge-queue spec section 5.2): one row per check, keyed by the tree it ran on, so a result
// stays valid on any commit with the same tree and drops after an edit.
export const BoardCheckTable = sqliteTable(
  "board_check",
  {
    id: text().$type<Board.CheckID>().primaryKey(),
    issue_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    attempt: integer().notNull(),
    kind: text().$type<Board.CheckKind>().notNull(),
    // The scoped command after substitution, or the workflow file: same tree and same command is the same check.
    command: text().notNull(),
    tree_sha: text().notNull(),
    commit_sha: text(),
    outcome: text().$type<Board.CheckOutcome>().notNull(),
    url: text(),
    failing: text({ mode: "json" }).$type<string[]>().notNull(),
    started_at: integer().notNull(),
    ended_at: integer(),
    ...Timestamps,
  },
  (table) => [index("board_check_issue_tree_idx").on(table.issue_id, table.tree_sha)],
)

// One row per dispatch of a card (merge-queue spec section 4.2). The host writes it; `board_issue.attempts` is max(n).
export const BoardAttemptTable = sqliteTable(
  "board_attempt",
  {
    issue_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    n: integer().notNull(),
    seat: text(),
    session_id: text(),
    worktree: text(),
    branch: text(),
    pr_number: integer(),
    // The Task's declared write set, matched against base advances (section 8.4).
    write_paths: text({ mode: "json" }).$type<string[]>().notNull(),
    // The last snapshot commit pushed to refs/orchestra/wip/<KEY>/a<n>, and its tree.
    snapshot_sha: text(),
    snapshot_tree: text(),
    snapshot_at: integer(),
    // Why the last snapshot was not pushed (a scanner hit, no scanner, a refused push); cleared by the next push.
    snapshot_blocked: text(),
    // The base commit the card last failed to merge with, and the conflicting files; cleared when it merges clean.
    conflict_base: text(),
    conflict_files: text({ mode: "json" }).$type<string[]>(),
    cause: text(),
    outcome: text().$type<Board.AttemptOutcome>(),
    ...Timestamps,
  },
  (table) => [primaryKey({ columns: [table.issue_id, table.n] })],
)

export const BoardNoteTable = sqliteTable(
  "board_note",
  {
    id: text().$type<Board.NoteID>().primaryKey(),
    issue_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    author: text().notNull(),
    kind: text().$type<Board.NoteKind>(),
    body: text().notNull(),
    github_comment_id: integer(),
    ...Timestamps,
  },
  (table) => [index("board_note_issue_idx").on(table.issue_id)],
)

// Exactly one of `path` (a copy under the app data dir) and `credential_id` (a secret) is set.
export const BoardAttachmentTable = sqliteTable(
  "board_attachment",
  {
    id: text().$type<Board.AttachmentID>().primaryKey(),
    issue_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    kind: text().$type<Board.AttachmentKind>().notNull(),
    name: text().notNull(),
    mime: text(),
    size: integer(),
    path: text(),
    credential_id: text()
      .$type<Credential.ID>()
      .references(() => CredentialTable.id, { onDelete: "cascade" }),
    ...Timestamps,
  },
  (table) => [index("board_attachment_issue_idx").on(table.issue_id)],
)

export const BoardActivityTable = sqliteTable(
  "board_activity",
  {
    id: text().$type<Board.ActivityID>().primaryKey(),
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    issue_id: text().$type<Board.IssueID>(),
    actor: text().$type<Board.Actor>().notNull(),
    action: text().$type<Board.Action>().notNull(),
    reason: text(),
    before: text({ mode: "json" }).$type<Record<string, unknown>>(),
    after: text({ mode: "json" }).$type<Record<string, unknown>>(),
    undoes: text().$type<Board.ActivityID>(),
    undone_by: text().$type<Board.ActivityID>(),
    ...Timestamps,
  },
  (table) => [index("board_activity_project_idx").on(table.project_id, table.id)],
)

// One row per card in the queue stage (merge-queue spec section 6). `head_sha` is the PR head the scoped checks passed on.
export const BoardQueueTable = sqliteTable(
  "board_queue",
  {
    issue_id: text()
      .$type<Board.IssueID>()
      .primaryKey()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    head_sha: text().notNull(),
    urgent: integer({ mode: "boolean" }).notNull().default(false),
    flush: integer({ mode: "boolean" }).notNull().default(false),
    hold: text().$type<"held" | "alone">(),
    queued_at: integer().notNull(),
    ...Timestamps,
  },
  (table) => [index("board_queue_project_idx").on(table.project_id, table.queued_at)],
)

// A bundle PR: queued cards merged onto one base tip and tested together (section 6.2). `merged_on` is the base tip it
// merged onto when that differs from `base_sha` (merge-if-disjoint).
export const BoardBundleTable = sqliteTable(
  "board_bundle",
  {
    id: text().$type<Board.BundleID>().primaryKey(),
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    n: integer().notNull(),
    branch: text().notNull(),
    pr_number: integer(),
    base_sha: text().notNull(),
    head_sha: text().notNull(),
    tree_sha: text().notNull(),
    rebuilds: integer().notNull().default(0),
    status: text().$type<"open" | "merged" | "dissolved" | "red" | "base-red" | "probing" | "probe-green" | "infra" | "paused" | "flaky" | "accepted" | "isolated">().notNull(),
    merged_on: text(),
    culprit: text(),
    failing: text({ mode: "json" }).$type<ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>>(),
    fix_issue_id: text().$type<Board.IssueID>(),
    // The lane's affected packages (section 7); null runs the whole suite.
    packages: text({ mode: "json" }).$type<ReadonlyArray<string>>(),
    ...Timestamps,
  },
  (table) => [uniqueIndex("board_bundle_number_idx").on(table.project_id, table.n)],
)

export const BoardBundleMemberTable = sqliteTable(
  "board_bundle_member",
  {
    bundle_id: text()
      .$type<Board.BundleID>()
      .notNull()
      .references(() => BoardBundleTable.id, { onDelete: "cascade" }),
    issue_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    head_sha: text().notNull(),
    position: integer().notNull(),
    ...Timestamps,
  },
  (table) => [primaryKey({ columns: [table.bundle_id, table.issue_id] })],
)

// Section 6.4: a test that failed in a bundle and then passed three scoped reruns of its head. `count` grows each time
// another bundle sees the same test go flaky; `bundle_id` is the latest one.
export const BoardFlakeTable = sqliteTable(
  "board_flake",
  {
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    test: text().notNull(),
    bundle_id: text()
      .$type<Board.BundleID>()
      .notNull()
      .references(() => BoardBundleTable.id, { onDelete: "cascade" }),
    first_seen: integer().notNull(),
    count: integer().notNull(),
    ...Timestamps,
  },
  (table) => [primaryKey({ columns: [table.project_id, table.test] })],
)
~~~~

## AUT3-C06

```json
{
  "block_id": "AUT3-C06",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-01"
  ],
  "body_anchors": [
    "B03"
  ],
  "requested_subject": "Criação, supersession e outcome narrado completos",
  "path": "packages/core/src/board/decision.ts",
  "archive": "sources/packages/core/src/board/decision.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "4b219f5b62517b2c4f9749a1a99e6257cfeff167",
  "source_sha256": "7fdd5f2d2d0dfa0414b70b870e4ff75ca62fe7af36c62c90e583663af8833b43",
  "source_bytes": 5365,
  "required_source_line_ranges": [
    [
      1,
      129
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B03",
      "source_path": "packages/core/src/board/decision.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "4b219f5b62517b2c4f9749a1a99e6257cfeff167",
      "source_sha256": "7fdd5f2d2d0dfa0414b70b870e4ff75ca62fe7af36c62c90e583663af8833b43",
      "first_line": 54,
      "last_line": 75,
      "excerpt_bytes": 988,
      "excerpt_sha256": "4624cb63c8ab9da5a9954a17bcabd126e7b140384e6c9c1d860f1df66bb94ce6",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 121932,
      "literal_content_byte_end_exclusive": 122920
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B03",
      "source_path": "packages/core/src/board/decision.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "4b219f5b62517b2c4f9749a1a99e6257cfeff167",
      "source_sha256": "7fdd5f2d2d0dfa0414b70b870e4ff75ca62fe7af36c62c90e583663af8833b43",
      "first_line": 101,
      "last_line": 118,
      "excerpt_bytes": 974,
      "excerpt_sha256": "3ecd85c8a12fd38074c1d56a26e3f7633234ff84ff1176570ed585a0d6a59ee7",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 123053,
      "literal_content_byte_end_exclusive": 124027
    }
  ]
}
```

```json
{"first_line":1,"last_line":53,"bytes":2025,"sha256":"8a40a9c8b54b4b00f14797ee6c40aeb8a0f10161d834993b608cda50c6757073"}
```

~~~~typescript
export * as BoardDecision from "./decision"

import { and, desc, eq, isNull, or } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { Board } from "@orchestra/schema/board"
import { BoardDecisionTable, BoardQuestionTable } from "./sql"
import { toDecision } from "./rows"
import { NotFoundError, RefusedError, changed, loadProject, log, numbers } from "./shared"
import type { ProjectRow, QuestionRow, Tx } from "./shared"

// Every answered question is kept as a decision; overturning one links the old to the new instead of editing it.

export const list = Effect.fnUntraced(function* (tx: Tx, key: string) {
  const project = yield* loadProject(tx, key)
  const known = yield* numbers(tx, project)
  const rows = yield* tx
    .select()
    .from(BoardDecisionTable)
    .where(eq(BoardDecisionTable.project_id, project.id))
    .orderBy(desc(BoardDecisionTable.answered_at), desc(BoardDecisionTable.id))
    .all()
  return rows.map((row) => toDecision(row, known))
})

/** The decision row an answer leaves behind. */
export const record = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, question: QuestionRow, input: Board.AnswerInput, now: number) {
  const id = Board.DecisionID.create()
  yield* tx
    .insert(BoardDecisionTable)
    .values({
      id,
      project_id: project.id,
      issue_id: question.issue_id,
      epic_id: question.epic_id,
      question_id: question.id,
      question: question.text,
      options: question.options,
      recommended: question.recommended,
      chosen: input.option,
      chosen_text: input.text ?? null,
      answered_by: "owner",
      answered_at: now,
    })
    .run()
  return id
})

export const change = Effect.fnUntraced(function* (tx: Tx, key: string, id: string, input: Board.DecisionChangeInput) {
  const project = yield* loadProject(tx, key)
  const old = yield* tx
    .select()
    .from(BoardDecisionTable)
    .where(and(eq(BoardDecisionTable.id, id as Board.DecisionID), eq(BoardDecisionTable.project_id, project.id)))
~~~~

```json
{"first_line":76,"last_line":100,"bytes":980,"sha256":"dd2cca3accc506fb812d4d87a47bdf5b42085957f64a989def084a52027ff97a"}
```

~~~~typescript
      chosen: input.option,
      chosen_text: text,
      answered_by: "owner",
      answered_at: now,
      supersedes_id: old.id,
    })
    .run()
  yield* tx.update(BoardDecisionTable).set({ overturned_by_id: next }).where(eq(BoardDecisionTable.id, old.id)).run()
  // Maestro reads the question's answer, so it carries the current one.
  yield* tx
    .update(BoardQuestionTable)
    .set({ answer_option: input.option, answer_text: text, answered_at: now })
    .where(eq(BoardQuestionTable.id, old.question_id))
    .run()
  const activity = yield* log(tx, {
    project: project.id,
    issue: old.issue_id,
    actor: "owner",
    action: "question.answer",
    before: { id: old.question_id, answer_option: old.chosen, answer_text: old.chosen_text },
    after: { id: old.question_id, status: "answered", answer_option: input.option, answer_text: text, decision: next },
  })
  return { result: { activity }, changed: changed(project.id, activity, old.issue_id) }
})

~~~~

```json
{"first_line":119,"last_line":129,"bytes":398,"sha256":"a1855c8c5e157e439215536af46b72dd4deb522e2b1b0a2a05e73596040152df"}
```

~~~~typescript
  const activity = yield* log(tx, {
    project: project.id,
    issue: row.issue_id,
    actor: "maestro",
    action: "question.answer",
    reason: input.reason,
    before: { id: row.question_id, outcome: row.outcome },
    after: { id: row.question_id, decision: row.id, outcome: input.outcome },
  })
  return { result: { activity }, changed: changed(project.id, activity, row.issue_id) }
})
~~~~

## AUT3-C07

```json
{
  "block_id": "AUT3-C07",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-01",
    "RE-AUT3-06"
  ],
  "body_anchors": [
    "B03"
  ],
  "requested_subject": "Thread de host readonly, identidade determinística e insert idempotente",
  "path": "packages/core/src/board/thread.ts",
  "archive": "sources/packages/core/src/board/thread.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "8c6fd3f62aeabca7d652f38cdc8740fbbd1abeba",
  "source_sha256": "e3cb87f165438aba44cf9cde3ab49be59975fed42d45d4d71317016dfec60ad9",
  "source_bytes": 2142,
  "required_source_line_ranges": [
    [
      1,
      57
    ]
  ],
  "prior_literal_ranges": []
}
```

```json
{"first_line":1,"last_line":57,"bytes":2142,"sha256":"e3cb87f165438aba44cf9cde3ab49be59975fed42d45d4d71317016dfec60ad9"}
```

~~~~typescript
export * as BoardThread from "./thread"

import { and, desc, eq, isNotNull } from "drizzle-orm"
import { Effect } from "effect"
import { Board } from "@orchestra/schema/board"
import { BoardIssueTable, BoardNoteTable, BoardProjectTable } from "./sql"
import type { Database } from "../database/database"

// Callers pass either the database or an open transaction.
type Tx = Pick<Database.Interface["db"], "select" | "insert">

// Thread notes are written by the host only; they are read-only to people. Their ids are deterministic, so an exact
// retry of the same work hits the primary key and writes nothing twice.

export const card = Effect.fnUntraced(function* (tx: Tx, key: string) {
  if (!/^[A-Z][A-Z0-9]*-\d+$/.test(key)) return undefined
  const dash = key.lastIndexOf("-")
  const project = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, key.slice(0, dash))).get()
  if (!project) return undefined
  return yield* tx
    .select()
    .from(BoardIssueTable)
    .where(and(eq(BoardIssueTable.project_id, project.id), eq(BoardIssueTable.number, Number(key.slice(dash + 1)))))
    .get()
})

export const bySession = Effect.fnUntraced(function* (tx: Tx, sessionID: string) {
  return yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.session_id, sessionID)).get()
})

export const last = Effect.fnUntraced(function* (tx: Tx, issue: Board.IssueID) {
  const note = yield* tx
    .select()
    .from(BoardNoteTable)
    .where(and(eq(BoardNoteTable.issue_id, issue), isNotNull(BoardNoteTable.kind)))
    .orderBy(desc(BoardNoteTable.time_created), desc(BoardNoteTable.id))
    .limit(1)
    .get()
  return note?.kind ?? undefined
})

export const write = Effect.fnUntraced(function* (
  tx: Tx,
  input: { readonly id: string; readonly issue: Board.IssueID; readonly kind: Board.NoteKind; readonly author: string; readonly body: string },
) {
  yield* tx
    .insert(BoardNoteTable)
    .values({
      id: Board.NoteID.make(input.id),
      issue_id: input.issue,
      author: input.author,
      body: input.body,
      kind: input.kind,
    })
    .onConflictDoNothing()
    .run()
})
~~~~

## AUT3-C08

```json
{
  "block_id": "AUT3-C08",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-02"
  ],
  "body_anchors": [
    "B04"
  ],
  "requested_subject": "Mirror/CI semaphore, imports/ETag/pagination/comments/overwrite/state questions/PR progression/labels/dirty/cache/minutes",
  "path": "packages/core/src/board/github.ts",
  "archive": "sources/packages/core/src/board/github.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "7a29abd5907dfb6f0443756ad8b2a6f7e7cf133e",
  "source_sha256": "15775b713425cb60f68003099198918a4b567431e426bd351c50ba4971d36702",
  "source_bytes": 32508,
  "required_source_line_ranges": [
    [
      1,
      688
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B04",
      "source_path": "packages/core/src/board/github.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "7a29abd5907dfb6f0443756ad8b2a6f7e7cf133e",
      "source_sha256": "15775b713425cb60f68003099198918a4b567431e426bd351c50ba4971d36702",
      "first_line": 126,
      "last_line": 135,
      "excerpt_bytes": 524,
      "excerpt_sha256": "8aadddffaa7d99d54cb9522a9dfa7b2372e165d5b9ad6994cae158d08a12bc78",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 126171,
      "literal_content_byte_end_exclusive": 126695
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B04",
      "source_path": "packages/core/src/board/github.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "7a29abd5907dfb6f0443756ad8b2a6f7e7cf133e",
      "source_sha256": "15775b713425cb60f68003099198918a4b567431e426bd351c50ba4971d36702",
      "first_line": 323,
      "last_line": 341,
      "excerpt_bytes": 856,
      "excerpt_sha256": "d89f100bd92d5071d2c6fb1c0369bf4a4da025b2d93af1ba600e32501b8272b7",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 126828,
      "literal_content_byte_end_exclusive": 127684
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B04",
      "source_path": "packages/core/src/board/github.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "7a29abd5907dfb6f0443756ad8b2a6f7e7cf133e",
      "source_sha256": "15775b713425cb60f68003099198918a4b567431e426bd351c50ba4971d36702",
      "first_line": 595,
      "last_line": 611,
      "excerpt_bytes": 751,
      "excerpt_sha256": "890502dbffb1f7e01a44f0160c2626604db773bb3e8b6515381be5ad3cc60ea4",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 127817,
      "literal_content_byte_end_exclusive": 128568
    }
  ]
}
```

```json
{"first_line":1,"last_line":125,"bytes":5388,"sha256":"5d5a1e60401c7f01af14cd24abdad0d406e8a7f185c3b0f6c473011b61e87a0a"}
```

~~~~typescript
export * as BoardGithub from "./github"

import { and, asc, eq, isNull, or, sql } from "drizzle-orm"
import { Clock, Effect, Option, Schema, Semaphore } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Board } from "@orchestra/schema/board"
import type { Database } from "../database/database"
import { AppProcess } from "../process"
import { which } from "../util/which"
import {
  BoardCiRunTable,
  BoardEpicTable,
  BoardIssueTable,
  BoardNoteTable,
  BoardProjectTable,
  BoardQuestionTable,
  BoardStepTable,
} from "./sql"
import { endOf } from "./shared"

// The GitHub Issues mirror (docs/specs/projects-board/CONTRACT.md section 6). Transport is the signed-in `gh` CLI, so
// there is no token here to store or log. Every call goes through an injected `Gh` runner, which tests replace with
// recorded responses.

export type GhResult = { readonly exitCode: number; readonly stdout: string; readonly stderr: string }
/** Runs `gh <args>`. It never fails: a missing or crashing CLI is a nonzero exit code with the reason on stderr. */
export type Gh = (args: ReadonlyArray<string>, stdin?: string) => Effect.Effect<GhResult>

type Tx = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
type ProjectRow = typeof BoardProjectTable.$inferSelect
type IssueRow = typeof BoardIssueTable.$inferSelect
type Changed = { readonly project: string; readonly issue?: string; readonly activity: string }

export type Outcome =
  | { readonly status: "missing" }
  | { readonly status: "off" }
  | { readonly status: "done"; readonly state: Board.GithubState; readonly error: string | null }

export interface Deps {
  /** One immediate transaction; storage failures are defects. */
  readonly quiet: <A>(work: (tx: Tx) => Effect.Effect<A, unknown>) => Effect.Effect<A>
  /** Publishes `board.changed` after a committed write. */
  readonly publish: (changed: Changed) => Effect.Effect<void>
  readonly log: (
    tx: Tx,
    input: {
      readonly project: Board.ProjectID
      readonly issue?: Board.IssueID | null
      readonly actor: Board.Actor
      readonly action: Board.Action
      readonly reason?: string | null
      readonly before?: Record<string, unknown> | null
      readonly after?: Record<string, unknown> | null
    },
  ) => Effect.Effect<Board.ActivityID, unknown>
  readonly gh: Gh
}

/** The real runner: the user's `gh`, with its own sign-in, never prompting. */
export function runner(proc: AppProcess.Interface, env?: NodeJS.ProcessEnv): Gh {
  return (args, stdin) =>
    Effect.suspend(() => {
      const executable = which("gh", env ?? process.env)
      if (!executable) return Effect.succeed({ exitCode: 127, stdout: "", stderr: "gh is not installed on this server" })
      return proc
        .run(
          ChildProcess.make(executable, [...args], {
            env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1" },
            extendEnv: true,
            stdin: "ignore",
          }),
          { maxOutputBytes: 4 * 1024 * 1024, maxErrorBytes: 16 * 1024, timeout: "30 seconds", stdin },
        )
        .pipe(
          Effect.map((result) => ({
            exitCode: result.exitCode,
            stdout: result.stdout.toString("utf8"),
            stderr: result.stderr.toString("utf8"),
          })),
          Effect.catch((error) => Effect.succeed({ exitCode: 1, stdout: "", stderr: error.message })),
        )
    })
}

class Failure extends Schema.TaggedErrorClass<Failure>()("Board.GithubFailure", {
  kind: Schema.Literals(["signed_out", "rate_limited", "error"]),
  message: Schema.String,
  status: Schema.optional(Schema.Int),
}) {}

const Label = Schema.Struct({ name: Schema.String })
const Login = Schema.NullOr(Schema.Struct({ login: Schema.String }))
const Issue = Schema.Struct({
  number: Schema.Int,
  node_id: Schema.String,
  title: Schema.String,
  body: Schema.NullOr(Schema.String),
  state: Schema.String,
  updated_at: Schema.String,
  user: Login,
  labels: Schema.Array(Label),
  pull_request: Schema.optional(Schema.Unknown),
})
const Comment = Schema.Struct({ id: Schema.Int, issue_url: Schema.String, body: Schema.String, updated_at: Schema.String, user: Login })
const Created = Schema.Struct({ number: Schema.Int, node_id: Schema.optional(Schema.String) })
const decodeIssues = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Issue)))
const decodeIssue = Schema.decodeUnknownOption(Schema.fromJsonString(Issue))
const decodeComments = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Comment)))
const decodeCreated = Schema.decodeUnknownOption(Schema.fromJsonString(Created))

const Pull = Schema.Struct({
  head: Schema.Struct({ sha: Schema.String }),
  state: Schema.optional(Schema.String),
  merged: Schema.optional(Schema.Boolean),
})
const Runs = Schema.Struct({
  workflow_runs: Schema.Array(
    Schema.Struct({ id: Schema.Int, name: Schema.NullOr(Schema.String), status: Schema.String, run_attempt: Schema.optional(Schema.Int) }),
  ),
})
const Timing = Schema.Struct({ billable: Schema.optional(Schema.Record(Schema.String, Schema.Struct({ total_ms: Schema.Finite }))) })
const decodePull = Schema.decodeUnknownOption(Schema.fromJsonString(Pull))
const decodeRuns = Schema.decodeUnknownOption(Schema.fromJsonString(Runs))
const decodeTiming = Schema.decodeUnknownOption(Schema.fromJsonString(Timing))

~~~~

```json
{"first_line":136,"last_line":322,"bytes":9074,"sha256":"a99cff1a0421a01bfce692f6fedd4795f02a8b3917ee8a13f9cdf22a0c6333f5"}
```

~~~~typescript

export function make(deps: Deps) {
  const gate = Semaphore.makeUnsafe(1)

  /** Pulls from GitHub, then pushes dirty cards. Manual retry and the 60 second poll both come here. */
  const sync = (key: string): Effect.Effect<Outcome> =>
    gate.withPermits(1)(
      Effect.gen(function* () {
        const project = yield* deps.quiet((tx) => tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, key)).get())
        if (!project) return { status: "missing" } as const
        if (!project.github_repo) return { status: "off" } as const
        const failed = yield* pull(project, project.github_repo).pipe(
          Effect.andThen(follow(project, project.github_repo)),
          Effect.andThen(push(project, project.github_repo)),
          Effect.as(undefined),
          Effect.catch((failure: Failure) => Effect.succeed(failure)),
        )
        const state = failed ? failed.kind : "ok"
        const error = failed ? failed.message : null
        yield* settle(project, state, error)
        return { status: "done", state, error } as const
      }),
    )

  /**
   * Fetches the Actions runs of every card's PR and caches their billable minutes in `board_ci_run`. Spend reads that
   * cache, never GitHub, so a render never waits on the network. Runs are fetched once they complete and never again.
   */
  const ci = (key: string, force = false): Effect.Effect<Outcome> =>
    gate.withPermits(1)(
      Effect.gen(function* () {
        const project = yield* deps.quiet((tx) => tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, key)).get())
        if (!project) return { status: "missing" } as const
        if (!project.github_repo) return { status: "off" } as const
        const repo = project.github_repo
        const now = yield* Clock.currentTimeMillis
        if (!force && project.ci_synced_at !== null && now - project.ci_synced_at < CI_TTL)
          return { status: "done", state: project.github_state, error: project.github_error } as const
        const issues = yield* deps.quiet((tx) =>
          tx
            .select()
            .from(BoardIssueTable)
            .where(and(eq(BoardIssueTable.project_id, project.id), sql`${BoardIssueTable.pr_number} is not null`, sql`${BoardIssueTable.stage} != 'cut'`))
            .all(),
        )
        const failed = yield* Effect.forEach(issues, (issue) => runs(project, repo, issue), { discard: true }).pipe(
          Effect.as(undefined),
          Effect.catch((failure: Failure) => Effect.succeed(failure)),
        )
        if (!failed)
          yield* deps.quiet((tx) => tx.update(BoardProjectTable).set({ ci_synced_at: now }).where(eq(BoardProjectTable.id, project.id)).run())
        const state = failed ? failed.kind : "ok"
        const error = failed ? failed.message : null
        yield* settle(project, state, error)
        return { status: "done", state, error } as const
      }),
    )

  const runs = Effect.fnUntraced(function* (project: ProjectRow, repo: string, issue: IssueRow) {
    const pull = Option.getOrUndefined(decodePull((yield* get(`repos/${repo}/pulls/${issue.pr_number}`, null)).body))
    if (!pull) return
    const found = Option.getOrUndefined(
      decodeRuns((yield* get(`repos/${repo}/actions/runs?head_sha=${encodeURIComponent(pull.head.sha)}&per_page=${PAGE}`, null)).body),
    )
    const known = new Set(
      (yield* deps.quiet((tx) =>
        tx.select({ id: BoardCiRunTable.run_id }).from(BoardCiRunTable).where(eq(BoardCiRunTable.issue_id, issue.id)).all(),
      )).map((row) => row.id),
    )
    const fresh = (found?.workflow_runs ?? []).filter((run) => run.status === "completed" && !known.has(run.id))
    yield* Effect.forEach(
      fresh,
      (run) =>
        Effect.gen(function* () {
          const timing = Option.getOrUndefined(decodeTiming((yield* get(`repos/${repo}/actions/runs/${run.id}/timing`, null)).body))
          const billable = Object.entries(timing?.billable ?? {})
          const ms = billable.reduce((all, [, value]) => all + value.total_ms, 0)
          const cost = billable.reduce((all, [runner, value]) => all + (value.total_ms / 60_000) * (RATES[runner.toUpperCase()] ?? RATES.UBUNTU), 0)
          yield* deps.quiet((tx) =>
            tx
              .insert(BoardCiRunTable)
              .values({
                run_id: run.id,
                project_id: project.id,
                issue_id: issue.id,
                name: run.name ?? "workflow",
                attempt: run.run_attempt ?? 1,
                billable_ms: Math.round(ms),
                cost_usd: cost,
              })
              .onConflictDoNothing()
              .run(),
          )
        }),
      { discard: true },
    )
  })

  /**
   * The PR is the fact a card follows on every sync: an open PR moves a Building card to Review, a merged one moves it
   * from Building or Review to Shipped and clears its crash reason. Maestro still moves every other stage; a paused
   * project or card, and an owner hold before merge, keep the card where it is.
   */
  const follow = Effect.fnUntraced(function* (project: ProjectRow, repo: string) {
    if (project.status !== "active") return
    const issues = yield* deps.quiet((tx) =>
      tx
        .select()
        .from(BoardIssueTable)
        .where(
          and(
            eq(BoardIssueTable.project_id, project.id),
            sql`${BoardIssueTable.pr_number} is not null`,
            sql`${BoardIssueTable.stage} in ('building', 'review')`,
          ),
        )
        .all(),
    )
    yield* Effect.forEach(issues, (issue) => advance(project, repo, issue), { discard: true })
  })

  const advance = Effect.fnUntraced(function* (project: ProjectRow, repo: string, issue: IssueRow) {
    // One unreadable PR (deleted, renamed repo, a blip) leaves its card alone; it must not stop the rest of the sync.
    const read = yield* get(`repos/${repo}/pulls/${issue.pr_number}`, null).pipe(Effect.option)
    const pull = Option.getOrUndefined(Option.flatMap(read, (result) => decodePull(result.body)))
    const stage = pull?.merged ? ("shipped" as const) : pull?.state === "open" ? ("review" as const) : undefined
    if (!stage || issue.paused) return
    const from: ReadonlyArray<Board.Stage> = stage === "shipped" ? ["building", "review"] : ["building"]
    if (!from.includes(issue.stage) || (stage === "shipped" && issue.hold_before_merge)) return
    const changed = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const next = {
          stage,
          position: yield* endOf(tx, project.id, stage),
          stage_entered_at: now,
          ...(stage === "shipped" ? { crash_reason: null } : {}),
        }
        yield* tx.update(BoardIssueTable).set({ ...next, github_dirty: true }).where(eq(BoardIssueTable.id, issue.id)).run()
        const activity = yield* deps.log(tx, {
          project: project.id,
          issue: issue.id,
          actor: "github",
          action: "issue.move",
          reason: stage === "shipped" ? `PR #${issue.pr_number} merged on GitHub.` : `PR #${issue.pr_number} is open on GitHub.`,
          before: {
            stage: issue.stage,
            position: issue.position,
            stage_entered_at: issue.stage_entered_at,
            ...(stage === "shipped" ? { crash_reason: issue.crash_reason } : {}),
          },
          after: next,
        })
        return { project: project.id, issue: issue.id, activity }
      }),
    )
    yield* deps.publish(changed)
  })

  const settle = Effect.fnUntraced(function* (project: ProjectRow, state: Board.GithubState, error: string | null) {
    const now = yield* Clock.currentTimeMillis
    const set = { github_state: state, github_error: error, ...(state === "ok" ? { github_synced_at: now } : {}) }
    const changed = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        yield* tx.update(BoardProjectTable).set(set).where(eq(BoardProjectTable.id, project.id)).run()
        if (project.github_state === state && project.github_error === error) return undefined
        const activity = yield* deps.log(tx, {
          project: project.id,
          actor: "github",
          action: "github.state",
          before: { github_state: project.github_state, github_error: project.github_error },
          after: { github_state: state, github_error: error },
        })
        return { project: project.id, activity }
      }),
    )
    if (changed) yield* deps.publish(changed)
  })

  // ---- GitHub to board ----

  const pull = Effect.fnUntraced(function* (project: ProjectRow, repo: string) {
    const now = yield* Clock.currentTimeMillis
    // The mirror starts now: issues that were already on GitHub are not imported into Intake.
    const start = project.github_since ?? now
    const issues = yield* pages(repo, "issues", "state=all&sort=updated&direction=asc", start, project.github_issues_etag, decodeIssues)
    for (const item of issues.items) if (!item.pull_request) yield* ingest(project, item)
~~~~

```json
{"first_line":342,"last_line":594,"bytes":11477,"sha256":"d4510459353412ca1ee44b395ab44b9b536a1e94edf77f073a6459f0cba4b488"}
```

~~~~typescript
    path: string,
    query: string,
    since: number,
    etag: string | null,
    decode: (text: string) => Option.Option<ReadonlyArray<T>>,
  ) =>
    Effect.gen(function* () {
      const items: T[] = []
      let cursor = since
      let seen = etag
      let latest: string | null = null
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = yield* get(`repos/${repo}/${path}?${query}&per_page=${PAGE}&since=${new Date(cursor).toISOString()}`, seen)
        if (res.status === 304) break
        const batch = decode(res.body)
        if (Option.isNone(batch)) return yield* new Failure({ kind: "error", message: `GitHub returned ${path} in a shape the board does not read.` })
        items.push(...batch.value)
        latest = res.etag ?? latest
        seen = null
        const last = batch.value.at(-1)?.updated_at
        const next = last ? Date.parse(last) : cursor
        if (batch.value.length < PAGE || !(next > cursor)) break
        cursor = next
      }
      return { items, etag: latest }
    })

  const ingest = Effect.fnUntraced(function* (project: ProjectRow, item: typeof Issue.Type) {
    const changed = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const marker = MARKER.exec(item.body ?? "")
        const rows = yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.project_id, project.id)).all()
        const known =
          rows.find((row) => row.github_number === item.number) ??
          (marker?.[1] === project.key ? rows.find((row) => row.number === Number(marker[2]) && row.github_number === null) : undefined)
        if (!known) {
          // Closed issues are history; a marker with no matching card is another board's.
          if (item.state !== "open" || marker) return undefined
          return yield* intake(tx, project, item)
        }
        if (known.github_number === null)
          yield* tx.update(BoardIssueTable).set({ github_number: item.number, github_node_id: item.node_id }).where(eq(BoardIssueTable.id, known.id)).run()
        // A pending push or an issue the owner has not accepted yet is not compared.
        if (known.github_dirty || known.stage === "intake") return undefined
        return yield* compare(tx, project, known, item)
      }),
    )
    if (changed) yield* deps.publish(changed)
  })

  const intake = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, item: typeof Issue.Type) {
    const fresh = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.id, project.id)).get()
    const stage = project.auto_accept_intake ? ("backlog" as const) : ("intake" as const)
    const id = Board.IssueID.create()
    const number = fresh?.next_issue_number ?? project.next_issue_number
    const names = item.labels.map((label) => label.name.toLowerCase())
    const row = {
      id,
      project_id: project.id,
      number,
      title: item.title,
      body: item.body ?? "",
      type: names.includes("bug") ? ("bug" as const) : names.includes("chore") ? ("chore" as const) : ("feature" as const),
      stage,
      position: yield* endOf(tx, project.id, stage),
      stage_entered_at: yield* Clock.currentTimeMillis,
      github_number: item.number,
      github_node_id: item.node_id,
      // An accepted card still needs its stage label and footer on GitHub.
      github_dirty: stage !== "intake",
    }
    yield* tx.insert(BoardIssueTable).values(row).run()
    yield* tx.update(BoardProjectTable).set({ next_issue_number: number + 1 }).where(eq(BoardProjectTable.id, project.id)).run()
    const activity = yield* deps.log(tx, {
      project: project.id,
      issue: id,
      actor: "github",
      action: "issue.create",
      reason: `Opened on GitHub as #${item.number} by ${item.user?.login ?? "someone"}.`,
      after: {
        number,
        title: row.title,
        body: row.body,
        type: row.type,
        stage,
        position: row.position,
        stage_entered_at: row.stage_entered_at,
        github_number: row.github_number,
      },
    })
    return { project: project.id, issue: id, activity } as Changed
  })

  // Board wins for stage and steps; GitHub's edits to title or body are overwritten, but the owner can undo that.
  const compare = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, item: typeof Issue.Type) {
    const ref = `${project.key}-${issue.number}`
    const text = item.body ?? ""
    let last: Board.ActivityID | undefined
    if (MARKER.test(text)) {
      const theirs: Record<string, string> = {}
      const ours: Record<string, string> = {}
      const body = unmirrored(text)
      if (item.title !== issue.title) {
        theirs.title = item.title
        ours.title = issue.title
      }
      if (body !== issue.body.trim()) {
        theirs.body = body
        ours.body = issue.body
      }
      if (Object.keys(theirs).length > 0) {
        last = yield* deps.log(tx, {
          project: project.id,
          issue: issue.id,
          actor: "github",
          action: "github.overwrite",
          reason: `GitHub had a different ${Object.keys(theirs).join(" and ")} for ${ref}; the next push restores the board's.`,
          before: theirs,
          after: ours,
        })
        yield* tx.update(BoardIssueTable).set({ github_dirty: true }).where(eq(BoardIssueTable.id, issue.id)).run()
      }
    }
    const shut = issue.stage === "shipped" || issue.stage === "cut"
    if ((item.state === "closed") !== shut) {
      const said = item.state === "closed" ? "closed" : "reopened"
      const asked = `GitHub #${item.number} (${ref}) was ${said} on GitHub, but the board has it in ${issue.stage}.`
      const open = yield* tx
        .select({ id: BoardQuestionTable.id })
        .from(BoardQuestionTable)
        .where(and(eq(BoardQuestionTable.issue_id, issue.id), eq(BoardQuestionTable.status, "open"), eq(BoardQuestionTable.text, asked)))
        .get()
      if (!open) {
        const id = Board.QuestionID.create()
        const options = [
          { id: "keep", label: "Keep the board's stage", consequence: "The next push puts the GitHub issue back the way the board has it." },
          { id: "follow", label: "Follow GitHub", consequence: "Move the card to match GitHub, then the two agree." },
        ]
        yield* tx
          .insert(BoardQuestionTable)
          .values({
            id,
            project_id: project.id,
            issue_id: issue.id,
            text: asked,
            options,
            recommended: "keep",
            cost_of_waiting: null,
            blocking: false,
            status: "open",
          })
          .run()
        last = yield* deps.log(tx, {
          project: project.id,
          issue: issue.id,
          actor: "github",
          action: "question.ask",
          reason: `GitHub #${item.number} was ${said}; the board does not apply that on its own.`,
          after: {
            id,
            epic_id: null,
            text: asked,
            options,
            recommended: "keep",
            cost_of_waiting: null,
            blocking: false,
            kind: null,
          },
        })
      }
      // The next push restores the board's state unless the plan changes first.
      yield* tx.update(BoardIssueTable).set({ github_dirty: true }).where(eq(BoardIssueTable.id, issue.id)).run()
    }
    return last ? ({ project: project.id, issue: issue.id, activity: last } as Changed) : undefined
  })

  const comment = Effect.fnUntraced(function* (project: ProjectRow, item: typeof Comment.Type) {
    const number = Number(item.issue_url.split("/").at(-1))
    const changed = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const issue = yield* tx
          .select()
          .from(BoardIssueTable)
          .where(and(eq(BoardIssueTable.project_id, project.id), eq(BoardIssueTable.github_number, number)))
          .get()
        if (!issue) return undefined
        const have = yield* tx.select({ id: BoardNoteTable.id }).from(BoardNoteTable).where(eq(BoardNoteTable.github_comment_id, item.id)).get()
        if (have) return undefined
        const id = Board.NoteID.create()
        const author = `github:${item.user?.login ?? "unknown"}`
        yield* tx.insert(BoardNoteTable).values({ id, issue_id: issue.id, author, body: item.body, github_comment_id: item.id }).run()
        const activity = yield* deps.log(tx, { project: project.id, issue: issue.id, actor: "github", action: "note.add", after: { id, author, body: item.body } })
        return { project: project.id, issue: issue.id, activity } as Changed
      }),
    )
    if (changed) yield* deps.publish(changed)
  })

  // ---- board to GitHub ----

  const push = Effect.fnUntraced(function* (project: ProjectRow, repo: string) {
    const due = yield* deps.quiet((tx) =>
      tx
        .select()
        .from(BoardIssueTable)
        .where(
          and(
            eq(BoardIssueTable.project_id, project.id),
            sql`${BoardIssueTable.stage} != 'intake'`,
            or(eq(BoardIssueTable.github_dirty, true), isNull(BoardIssueTable.github_number)),
          ),
        )
        .orderBy(asc(BoardIssueTable.time_updated))
        .all(),
    )
    const labels = new Set<string>()
    for (const issue of due) yield* pushOne(project, repo, issue, labels)
  })

  const pushOne = Effect.fnUntraced(function* (project: ProjectRow, repo: string, issue: IssueRow, labels: Set<string>) {
    const ref = `${project.key}-${issue.number}`
    const { steps, epic } = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const steps = yield* tx.select().from(BoardStepTable).where(eq(BoardStepTable.issue_id, issue.id)).orderBy(asc(BoardStepTable.position)).all()
        const epic = issue.epic_id ? yield* tx.select().from(BoardEpicTable).where(eq(BoardEpicTable.id, issue.epic_id)).get() : undefined
        return { steps, epic }
      }),
    )
    const milestone = epic ? yield* milestoneOf(project, repo, epic) : null
    const ours = [`stage:${issue.stage}`, `type:${issue.type}`]
    for (const name of ours) {
      if (labels.has(name)) continue
      yield* send("POST", `repos/${repo}/labels`, { name, color: COLORS[name.startsWith("stage") ? "stage" : "type"] }, [422])
      labels.add(name)
    }
    const shut = issue.stage === "shipped" || issue.stage === "cut"
    const state = shut ? { state: "closed", state_reason: issue.stage === "cut" ? "not_planned" : "completed" } : { state: "open" }
    const content = { title: issue.title, body: render(project.key, issue, steps) }

    const existing = issue.github_number
    const created =
      existing === null
        ? Option.getOrUndefined(decodeCreated((yield* send("POST", `repos/${repo}/issues`, { ...content, labels: ours, ...(milestone ? { milestone } : {}) })).body))
        : undefined
    if (existing === null && !created) return yield* new Failure({ kind: "error", message: `GitHub did not return the new issue for ${ref}.` })
    const number = (created?.number ?? existing) as number
    // Keep labels people added; only the board's stage and type labels are replaced.
    const theirs =
      existing === null
        ? []
        : Option.match(decodeIssue((yield* get(`repos/${repo}/issues/${number}`, null)).body), {
            onNone: () => [],
            onSome: (found) => found.labels.map((label) => label.name).filter((name) => !/^(stage|type):/.test(name)),
~~~~

```json
{"first_line":612,"last_line":688,"bytes":4438,"sha256":"22604cd1ae08629706d239a8d99219d2ef117117c66610ae60450a70de1359c8"}
```

~~~~typescript

  const milestoneOf = Effect.fnUntraced(function* (project: ProjectRow, repo: string, epic: typeof BoardEpicTable.$inferSelect) {
    if (epic.github_milestone !== null) return epic.github_milestone
    const made = Option.getOrUndefined(
      decodeCreated((yield* send("POST", `repos/${repo}/milestones`, { title: `${project.key}-E${epic.number}: ${epic.title}`, description: epic.goal })).body),
    )
    if (!made) return yield* new Failure({ kind: "error", message: `GitHub did not return the milestone for ${project.key}-E${epic.number}.` })
    yield* deps.quiet((tx) => tx.update(BoardEpicTable).set({ github_milestone: made.number }).where(eq(BoardEpicTable.id, epic.id)).run())
    return made.number
  })

  // ---- gh ----

  /** GET with headers, so the ETag and a 304 are visible. */
  const get = Effect.fnUntraced(function* (endpoint: string, etag: string | null) {
    const result = yield* deps.gh(["api", "-i", endpoint, ...(etag ? ["-H", `If-None-Match: ${etag}`] : [])])
    const head = /^HTTP\/\S+\s+(\d{3})/.exec(result.stdout)
    const status = head ? Number(head[1]) : undefined
    if (status === 304) return { status, body: "", etag }
    if (status !== undefined && status >= 200 && status < 300 && result.exitCode === 0) {
      const split = /\r?\n\r?\n/.exec(result.stdout)
      const headers = result.stdout.slice(0, split?.index ?? 0)
      return { status, body: result.stdout.slice((split?.index ?? 0) + (split?.[0].length ?? 0)), etag: /^etag:\s*(.+)$/im.exec(headers)?.[1]?.trim() ?? null }
    }
    return yield* fail(result, status)
  })

  const send = Effect.fnUntraced(function* (method: "POST" | "PATCH", endpoint: string, payload: unknown, tolerate: ReadonlyArray<number> = []) {
    const result = yield* deps.gh(["api", "-X", method, endpoint, "--input", "-"], JSON.stringify(payload))
    if (result.exitCode === 0) return { body: result.stdout }
    const status = Number(/HTTP (\d{3})/.exec(result.stderr)?.[1] ?? NaN)
    if (tolerate.includes(status)) return { body: result.stdout }
    return yield* fail(result, Number.isNaN(status) ? undefined : status)
  })

  const fail = (result: GhResult, status: number | undefined) => {
    const line = result.stderr.split(/\r?\n/).find((text) => text.trim()) ?? `gh exited with ${result.exitCode}`
    const code = status ?? (Number(/HTTP (\d{3})/.exec(result.stderr)?.[1]) || undefined)
    const signedOut =
      result.exitCode === 4 || /auth login|not logged in|not authenticated|HTTP 401|401 Unauthorized|Bad credentials/i.test(result.stderr) || code === 401
    const limited = code === 429 || /rate limit/i.test(result.stderr) || (code === 403 && /x-ratelimit-remaining:\s*0/i.test(result.stdout))
    return new Failure({
      kind: signedOut ? "signed_out" : limited ? "rate_limited" : "error",
      message: redact(signedOut ? `GitHub is not signed in on this server: ${line}` : line).slice(0, 300),
      status: code,
    })
  }

  return { sync, ci }
}

/** The issue body GitHub shows: the card body, the steps as a task list, and the footer with the hidden marker. */
export function render(key: string, issue: Pick<IssueRow, "number" | "body">, steps: ReadonlyArray<{ readonly title: string; readonly status: Board.StepStatus }>) {
  const list = steps.map((step) => `- [${step.status === "done" || step.status === "skipped" ? "x" : " "}] ${step.status === "skipped" ? `~~${step.title}~~` : step.title}`)
  return [
    issue.body.trim(),
    list.length > 0 ? `### Steps\n${list.join("\n")}` : "",
    `---\nTracked on the Orchestra board as ${key}-${issue.number}. <!-- orchestra-board:${key}-${issue.number} -->`,
  ]
    .filter(Boolean)
    .join("\n\n")
}

/** The card's own text inside a mirrored body: without the steps list and the footer the mirror appends. */
export function unmirrored(text: string) {
  const plain = text.replace(/\r\n/g, "\n")
  const cut = plain.lastIndexOf(FOOTER)
  const head = cut >= 0 ? plain.slice(0, cut) : plain.replace(/^---\nTracked on the Orchestra board as .*$/m, "")
  const steps = head.lastIndexOf("### Steps\n")
  const tail = steps >= 0 ? head.slice(steps + "### Steps\n".length) : ""
  const listed = steps >= 0 && tail.split("\n").every((line) => /^- \[[ x]\] /.test(line))
  return (listed ? head.slice(0, steps) : head).trim()
}

function redact(text: string) {
  return text.replace(/\b(gh[pousr]_[A-Za-z0-9_]{10,}|github_pat_[A-Za-z0-9_]{10,})/g, "[token]")
}
~~~~

## AUT3-C09

```json
{
  "block_id": "AUT3-C09",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-02"
  ],
  "body_anchors": [
    "B05"
  ],
  "requested_subject": "Sessions/filhos/tokens/custos CI, thresholds, evaluate/settings e entrada building",
  "path": "packages/core/src/board/money.ts",
  "archive": "sources/packages/core/src/board/money.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "2e898a1aaf5d8740ced0bcd0a8afe0baa3996bc9",
  "source_sha256": "30254e118087b0f8ac51e48b0c1f4a5f2e7bfd7a4bf2907267fe37c13a8a582b",
  "source_bytes": 9068,
  "required_source_line_ranges": [
    [
      1,
      191
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B05",
      "source_path": "packages/core/src/board/money.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "2e898a1aaf5d8740ced0bcd0a8afe0baa3996bc9",
      "source_sha256": "30254e118087b0f8ac51e48b0c1f4a5f2e7bfd7a4bf2907267fe37c13a8a582b",
      "first_line": 163,
      "last_line": 169,
      "excerpt_bytes": 611,
      "excerpt_sha256": "2ef7090c698e3ef827e2a8c3cdc12c38b04a191a44688881ab5ce51eea5392d3",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 129081,
      "literal_content_byte_end_exclusive": 129692
    }
  ]
}
```

```json
{"first_line":1,"last_line":162,"bytes":7584,"sha256":"cf1c065df23a26b7974cffe89a4fed9c9a78a842ab612da9c5ea6cfc0e60d57f"}
```

~~~~typescript
export * as BoardMoney from "./money"

import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { Board } from "@orchestra/schema/board"
import { SessionTable } from "../session/sql"
import { BoardCiRunTable, BoardIssueTable, BoardProjectTable, BoardQuestionTable } from "./sql"
import { BoardForecast } from "./forecast"
import { BoardSpend } from "./spend"
import { BudgetPausedError, RefusedError, archived, changed, diff, forecastOf, loadProject, log, numbers } from "./shared"
import type { IssueRow, ProjectRow, Tx } from "./shared"

// Money on the board: spend, the 90% budget question, the budget pause and the project settings.

export const report = Effect.fnUntraced(function* (tx: Tx, key: string) {
  const project = yield* loadProject(tx, key)
  const forecast = yield* forecastOf(tx, project)
  return yield* spendOf(tx, project, forecast.project.forecast)
})

// Spend reads rows only: session cost and the CI minutes the poll cached. `forecast` null leaves the finish unknown.
export const spendOf = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, forecast: Board.Forecast | null) {
  const issues = yield* tx
    .select()
    .from(BoardIssueTable)
    .where(and(eq(BoardIssueTable.project_id, project.id), ne(BoardIssueTable.stage, "cut")))
    .orderBy(asc(BoardIssueTable.number))
    .all()
  const known = yield* numbers(tx, project)
  const linked = issues.flatMap((row) => (row.session_id ? [row.session_id] : []))
  const ids = linked as (typeof SessionTable.$inferSelect)["id"][]
  const sessions =
    linked.length === 0
      ? []
      : yield* tx
          .select({
            id: SessionTable.id,
            parent: SessionTable.parent_id,
            cost: SessionTable.cost,
            model: SessionTable.model,
            tokens:
              sql<number>`${SessionTable.tokens_input} + ${SessionTable.tokens_output} + ${SessionTable.tokens_reasoning} + ${SessionTable.tokens_cache_read} + ${SessionTable.tokens_cache_write}`,
          })
          .from(SessionTable)
          .where(or(inArray(SessionTable.id, ids), inArray(SessionTable.parent_id, ids)))
          .all()
  const runs = yield* tx
    .select({ issue: BoardCiRunTable.issue_id, usd: sql<number>`sum(${BoardCiRunTable.cost_usd})` })
    .from(BoardCiRunTable)
    .where(eq(BoardCiRunTable.project_id, project.id))
    .groupBy(BoardCiRunTable.issue_id)
    .all()
  const spends = issues.map((row) => {
    const own = sessions.filter((item) => row.session_id !== null && (item.id === row.session_id || item.parent === row.session_id))
    const ci: BoardSpend.Ci =
      !row.pr_number || !project.github_repo
        ? { kind: "none" }
        : project.ci_synced_at === null
          ? { kind: "pending" }
          : { kind: "ok", usd: runs.find((item) => item.issue === row.id)?.usd ?? 0 }
    return BoardSpend.card({
      sessions: own.map((item) => ({ model: item.model?.id ?? null, provider: item.model?.providerID ?? null, cost: item.cost, tokens: item.tokens })),
      ci,
    })
  })
  const epicOf = (row: IssueRow) => (row.epic_id ? (known.epics.get(row.epic_id) ?? null) : null)
  const flagged = BoardSpend.flags(issues.map((row, index) => ({ epic: epicOf(row), spend: spends[index]! })))
  const cards = issues.map(
    (row, index): Board.CardSpend => ({
      ...spends[index]!,
      issue: row.number,
      ref: `${project.key}-${row.number}`,
      epic: epicOf(row),
      seat: row.seat,
      flagged: flagged[index]!.flagged,
      epicMedianUsd: flagged[index]!.median,
    }),
  )
  const epics = Array.from(new Set(cards.flatMap((card) => (card.epic === null ? [] : [card.epic]))))
    .toSorted((a, b) => a - b)
    .map((number): Board.EpicSpend => ({ ...BoardSpend.total(cards.filter((card) => card.epic === number)), epic: number, ref: `${project.key}-E${number}` }))
  const seats = Array.from(new Set(cards.flatMap((card) => (card.seat === null ? [] : [card.seat]))))
    .toSorted()
    .map((seat): Board.SeatSpend => ({ ...BoardSpend.total(cards.filter((card) => card.seat === seat)), seat }))
  const total = BoardSpend.total(spends)
  const now = yield* Clock.currentTimeMillis
  return {
    project: total,
    budget: BoardSpend.budget({
      budgetUsd: project.budget_usd,
      spentUsd: total.usd,
      forecastUsd: forecast ? BoardSpend.finish({ spentUsd: total.usd, since: project.time_created, now, forecast }) : null,
    }),
    cards,
    epics,
    seats,
    infraSyncedAt: project.ci_synced_at,
  } satisfies Board.SpendReport
})

// Persists how many evaluations in a row put P50 past the target date, and raises the one pre-emptive budget
// question when the forecast finish crosses 90% of the budget. Returns the activity of a question it raised.
export const evaluate = Effect.fnUntraced(function* (tx: Tx, id: string) {
  const project = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.id, id as Board.ProjectID)).get()
  if (!project) return undefined
  const forecast = yield* forecastOf(tx, project)
  const streak = BoardForecast.late(forecast.project) ? project.forecast_late_streak + 1 : 0
  if (streak !== project.forecast_late_streak)
    yield* tx.update(BoardProjectTable).set({ forecast_late_streak: streak }).where(eq(BoardProjectTable.id, project.id)).run()
  if (project.budget_usd === null || project.status === "archived" || forecast.project.forecast.kind === "done") return undefined
  const budget = (yield* spendOf(tx, project, forecast.project.forecast)).budget
  if (budget.forecastUsd === null || budget.forecastPercent === null || budget.forecastPercent < BoardSpend.QUESTION * 100) return undefined
  // One question per budget figure: raising the budget makes a new one possible, answering never re-asks.
  const kind = `budget:${project.budget_usd}`
  const asked = yield* tx
    .select({ id: BoardQuestionTable.id })
    .from(BoardQuestionTable)
    .where(and(eq(BoardQuestionTable.project_id, project.id), eq(BoardQuestionTable.kind, kind)))
    .get()
  if (asked) return undefined
  const question = Board.QuestionID.create()
  const text = `${project.key} is forecast to spend about $${budget.forecastUsd.toFixed(2)} by its finish, ${Math.round(budget.forecastPercent)}% of its $${project.budget_usd.toFixed(2)} budget. What should happen?`
  const options = [
    { id: "raise", label: "Raise the budget", consequence: "Work continues; set the new amount in the project settings." },
    { id: "cut", label: "Cut scope to fit", consequence: "Maestro proposes which cards to cut; the budget stays." },
    { id: "continue", label: "Keep going as is", consequence: "Work continues until 100%, then new work stops." },
  ]
  yield* tx
    .insert(BoardQuestionTable)
    .values({
      id: question,
      project_id: project.id,
      issue_id: null,
      epic_id: null,
      text,
      options,
      recommended: "cut",
      cost_of_waiting: "At 100% of the budget the board stops starting new work.",
      kind,
      blocking: false,
      status: "open",
    })
    .run()
  return yield* log(tx, {
    project: project.id,
    actor: "maestro",
    action: "question.ask",
    reason: "The forecast finish crossed 90% of the budget.",
    after: {
      id: question,
      epic_id: null,
      text,
      options,
      recommended: "cut",
      cost_of_waiting: "At 100% of the budget the board stops starting new work.",
      kind,
      blocking: false,
    },
  })
})

/** A project at its whole budget starts no new work; a card already building keeps going. */
~~~~

```json
{"first_line":170,"last_line":191,"bytes":873,"sha256":"99ea21162f22ccd394a1f73d219b5b3d0c4d4df346dfe4ccb7e0d73b68fc3266"}
```

~~~~typescript
})

export const settings = Effect.fnUntraced(function* (
  tx: Tx,
  key: string,
  input: { readonly target_date?: number | null; readonly budget_usd?: number | null; readonly reason?: string },
  actor: "owner" | "maestro",
) {
  const project = yield* loadProject(tx, key)
  if (project.status === "archived") return yield* archived(project)
  const change = diff(project, { target_date: input.target_date, budget_usd: input.budget_usd })
  if (!change) return yield* new RefusedError({ message: `Nothing to change on ${key}.` })
  yield* tx.update(BoardProjectTable).set(change.after).where(eq(BoardProjectTable.id, project.id)).run()
  const activity = yield* log(tx, {
    project: project.id,
    actor,
    action: "project.upsert",
    reason: input.reason ?? null,
    ...change,
  })
  return { result: { activity }, changed: changed(project.id, activity) }
})
~~~~

## AUT3-C10

```json
{
  "block_id": "AUT3-C10",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-02"
  ],
  "body_anchors": [
    "B05"
  ],
  "requested_subject": "Metered/unmetered/card/total, thresholds, peers e budget/forecast arithmetic",
  "path": "packages/core/src/board/spend.ts",
  "archive": "sources/packages/core/src/board/spend.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "c5c82e700282b4ba2fad710a5a87daae0328b6f9",
  "source_sha256": "11d1284e196ac2f72708d88a47d7f839f5e380d0f4cc87e0a196d4b4c32d45ce",
  "source_bytes": 6301,
  "required_source_line_ranges": [
    [
      1,
      143
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B05",
      "source_path": "packages/core/src/board/spend.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "c5c82e700282b4ba2fad710a5a87daae0328b6f9",
      "source_sha256": "11d1284e196ac2f72708d88a47d7f839f5e380d0f4cc87e0a196d4b4c32d45ce",
      "first_line": 30,
      "last_line": 49,
      "excerpt_bytes": 1223,
      "excerpt_sha256": "26ef2f8eaebf6d6335d3e53da76a6aa6fa31c44016f0856bd38fccbff16bb214",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 130067,
      "literal_content_byte_end_exclusive": 131290
    }
  ]
}
```

```json
{"first_line":1,"last_line":29,"bytes":1109,"sha256":"e0356f6b58ff26f3b962f14ff153467ca4b74864a21074d37fa9b30ea6735e9c"}
```

~~~~typescript
export * as BoardSpend from "./spend"

import type { Board } from "@orchestra/schema/board"

// What a card, epic, seat and project cost (docs/specs/projects-board/CONTRACT.md). Pure arithmetic over rows the board
// service reads: a figure comes from a real meter or says it has none. A missing meter is never counted as zero.

const DAY = 86_400_000
/** Providers whose engine runs on a subscription: they report no per-token price. */
const SUBSCRIPTION = ["claude-code"]

export const WARN = 0.8
export const PAUSE = 1
export const QUESTION = 0.9
export const FLAG = 3
/** Peers an epic needs before its median means anything. */
const PEERS = 2

export type Session = {
  readonly model: string | null
  readonly provider: string | null
  readonly cost: number
  readonly tokens: number
}

/** `none`: no PR, nothing to attribute. `pending`: a PR whose runs have not been fetched yet. */
export type Ci = { readonly kind: "none" } | { readonly kind: "pending" } | { readonly kind: "ok"; readonly usd: number }

/** One card's spend. Subagent sessions of the card's session are included by the caller. */
~~~~

```json
{"first_line":50,"last_line":143,"bytes":3969,"sha256":"c81f03dfbd33e2a8357a6a551ac2b4a37fd6e4dec75c16b1257b941fe52f1daf"}
```

~~~~typescript
    infra,
    byModel,
    usd: usd(models) + usd(infra),
    partial: (metered.length > 0 && unmetered.length > 0) || input.ci.kind === "pending",
  }
}

/** Adds spends together: a part is metered when any member of it is. */
export function total(items: readonly Board.Spend[]): Board.Spend {
  const part = (pick: (item: Board.Spend) => Board.Meter): Board.Meter => {
    const meters = items.map(pick)
    const first = meters.find((meter) => meter.kind === "not-metered")
    return meters.some((meter) => meter.kind === "usd") || !first ? { kind: "usd", usd: sum(meters.map(usd)) } : first
  }
  const models = part((item) => item.models)
  const infra = part((item) => item.infra)
  const merged = items
    .flatMap((item) => item.byModel)
    .reduce<Record<string, number>>((all, item) => ({ ...all, [item.model]: (all[item.model] ?? 0) + item.usd }), {})
  return {
    models,
    infra,
    byModel: Object.entries(merged)
      .map(([model, value]) => ({ model, usd: value }))
      .toSorted((a, b) => b.usd - a.usd || a.model.localeCompare(b.model)),
    usd: usd(models) + usd(infra),
    partial:
      items.some((item) => item.partial) ||
      items.some((item) => item.models.kind === "not-metered") && items.some((item) => item.models.kind === "usd" && item.models.usd > 0),
  }
}

/** Flags a card at 3 times the median of its epic peers; cards outside an epic are never flagged. */
export function flags(cards: readonly { readonly epic: number | null; readonly spend: Board.Spend }[]) {
  return cards.map((item) => {
    if (item.epic === null || item.spend.models.kind !== "usd" || item.spend.usd <= 0) return { flagged: false, median: null }
    const peers = cards
      .filter((other) => other !== item && other.epic === item.epic && other.spend.models.kind === "usd" && other.spend.usd > 0)
      .map((other) => other.spend.usd)
    if (peers.length < PEERS) return { flagged: false, median: null }
    const middle = median(peers)
    return { flagged: item.spend.usd >= FLAG * middle, median: middle }
  })
}

export function budget(input: {
  readonly budgetUsd: number | null
  readonly spentUsd: number
  readonly forecastUsd: number | null
}): Board.Budget {
  if (input.budgetUsd === null)
    return { budgetUsd: null, spentUsd: input.spentUsd, percent: null, state: "none", forecastUsd: input.forecastUsd, forecastPercent: null }
  const share = (value: number) => (input.budgetUsd! > 0 ? (value / input.budgetUsd!) * 100 : 100)
  return {
    budgetUsd: input.budgetUsd,
    spentUsd: input.spentUsd,
    percent: share(input.spentUsd),
    state: input.spentUsd >= input.budgetUsd * PAUSE ? "paused" : input.spentUsd >= input.budgetUsd * WARN ? "warn" : "ok",
    forecastUsd: input.forecastUsd,
    forecastPercent: input.forecastUsd === null ? null : share(input.forecastUsd),
  }
}

/** Spend at the forecast finish: what is spent plus the burn rate over the time left to the forecast P50. */
export function finish(input: {
  readonly spentUsd: number
  /** When the project started spending. */
  readonly since: number
  readonly now: number
  readonly forecast: Board.Forecast
}) {
  if (input.forecast.kind === "done") return input.spentUsd
  if (input.forecast.kind !== "dates") return null
  const burn = input.spentUsd / Math.max(1, (input.now - input.since) / DAY)
  return input.spentUsd + burn * Math.max(0, (input.forecast.p50 - input.now) / DAY)
}

function subscription(item: Session) {
  return item.provider !== null && SUBSCRIPTION.includes(item.provider)
}

function usd(meter: Board.Meter) {
  return meter.kind === "usd" ? meter.usd : 0
}

function sum(values: readonly number[]) {
  return values.reduce((all, value) => all + value, 0)
}

function median(values: readonly number[]) {
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}
~~~~

## AUT3-C11

```json
{
  "block_id": "AUT3-C11",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-02"
  ],
  "body_anchors": [
    "B05"
  ],
  "requested_subject": "Throughput com zeros, seed, simulação, percentis, horizon/waits/late",
  "path": "packages/core/src/board/forecast.ts",
  "archive": "sources/packages/core/src/board/forecast.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "8c5aa204de45ec477861b3c5ea3c37aa1fe78eab",
  "source_sha256": "4c30459dd7de865d5536d9a24a842b19a14bbeffd5ae4597a8df5f0b76fa06fd",
  "source_bytes": 6656,
  "required_source_line_ranges": [
    [
      1,
      162
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B05",
      "source_path": "packages/core/src/board/forecast.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "8c5aa204de45ec477861b3c5ea3c37aa1fe78eab",
      "source_sha256": "4c30459dd7de865d5536d9a24a842b19a14bbeffd5ae4597a8df5f0b76fa06fd",
      "first_line": 8,
      "last_line": 14,
      "excerpt_bytes": 195,
      "excerpt_sha256": "6c95730368bd0e73b52b90435eec1b52f9534a3393fd6f62742e5ff853ac7d7c",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 131670,
      "literal_content_byte_end_exclusive": 131865
    }
  ]
}
```

```json
{"first_line":1,"last_line":7,"bytes":323,"sha256":"40569294765aa6d6bc92c08fc5e7cc39ba406a28ab84b1e60bfe9d0c39fedcf5"}
```

~~~~typescript
export * as BoardForecast from "./forecast"

import type { Board } from "@orchestra/schema/board"

// Forecasts from the board's own history (CONTRACT.md section 3): the daily shipped throughput since the first ship
// day, resampled in a seeded Monte Carlo, so the same board on the same day always gives the same dates.

~~~~

```json
{"first_line":15,"last_line":162,"bytes":6138,"sha256":"0211225471f65ff50901a24b01ed3652e428ab547a11f8395e06c49fd409d962"}
```

~~~~typescript
export type Item = {
  readonly epic: number | null
  readonly stage: Board.Stage
  /** For a shipped issue, the moment it shipped. */
  readonly enteredAt: number
  /** The issue ref this one is blocked on: an unshipped dependency, or itself when paused or asked a blocking question. */
  readonly waitsOn: string | null
}

/** The project forecast and, in position order, one per epic; an epic's dates include the open epics before it. */
export function plan(input: {
  readonly items: readonly Item[]
  readonly epics: readonly { readonly number: number; readonly ref: string }[]
  readonly targetDate: number | null
  readonly now: number
}) {
  const shipped = input.items.filter((item) => item.stage === "shipped")
  const open = input.items.filter((item) => OPEN.includes(item.stage))
  const openOf = (epic: number) => open.filter((item) => item.epic === epic)
  const cumulative = input.epics.map((_, index) =>
    input.epics.slice(0, index + 1).reduce((sum, epic) => sum + openOf(epic.number).length, 0),
  )
  const today = Math.floor(input.now / DAY)
  const runs =
    shipped.length >= NEEDED
      ? simulate(
          throughput(
            shipped.map((item) => item.enteredAt),
            today,
          ),
          [...cumulative, open.length],
          today,
        )
      : []
  const forecast = (items: readonly Item[], shippedHere: number, run?: { readonly p50: number; readonly p85: number }): Board.Forecast => {
    if (items.length === 0 && (shippedHere > 0 || shipped.length >= NEEDED)) return { kind: "done" }
    const waits = items.every((item) => item.waitsOn !== null) ? items[0]?.waitsOn : undefined
    if (waits) return { kind: "waits", on: waits }
    if (!run) return { kind: "insufficient", shipped: shipped.length, needed: NEEDED }
    return {
      kind: "dates",
      p50: run.p50,
      p85: run.p85,
      vsTarget:
        input.targetDate === null
          ? null
          : { p50: Math.round((run.p50 - input.targetDate) / DAY), p85: Math.round((run.p85 - input.targetDate) / DAY) },
    }
  }
  const epics = input.epics.map((epic, index) => ({
    epic: epic.number,
    ref: epic.ref,
    shipped: shipped.filter((item) => item.epic === epic.number).length,
    remaining: openOf(epic.number).length,
    forecast: forecast(
      openOf(epic.number),
      shipped.filter((item) => item.epic === epic.number).length,
      runs[index],
    ),
  }))
  const pole = epics.reduce<number | undefined>((best, epic) => {
    if (epic.forecast.kind !== "dates") return best
    const current = best === undefined ? undefined : epics[best]?.forecast
    if (current?.kind === "dates" && current.p85 >= epic.forecast.p85) return best
    return epics.indexOf(epic)
  }, undefined)
  return {
    project: {
      shipped: shipped.length,
      remaining: open.length,
      targetDate: input.targetDate,
      forecast: forecast(open, shipped.length, runs.at(-1)),
    } satisfies Board.ProjectForecast,
    epics: epics.map((epic, index): Board.EpicForecast => ({ ...epic, setsDate: index === pole })),
  }
}

/** P50 past the target date; two consecutive evaluations like this turn the project's health to at_risk. */
export function late(forecast: Board.ProjectForecast) {
  return forecast.forecast.kind === "dates" && forecast.forecast.vsTarget !== null && forecast.forecast.vsTarget.p50 > 0
}

/** Replays the stage of every issue through the activity log; a point each time the scope or shipped count changes. */
export function scope(
  rows: readonly {
    readonly issue: string | null
    readonly reason: string | null
    readonly after: Record<string, unknown> | null
    readonly at: number
  }[],
) {
  const stages = new Map<string, unknown>()
  return rows.reduce<Board.ScopePoint[]>((points, row) => {
    if (!row.issue || typeof row.after?.stage !== "string") return points
    stages.set(row.issue, row.after.stage)
    const values = [...stages.values()]
    const total = values.filter((stage) => stage !== "intake" && stage !== "cut").length
    const done = values.filter((stage) => stage === "shipped").length
    const last = points.at(-1)
    if (last && last.scope === total && last.shipped === done) return points
    return [...points, { at: row.at, scope: total, shipped: done, reason: !last || last.scope !== total ? row.reason : null }]
  }, [])
}

/** Issues shipped per UTC day, from the first ship day through today, zero days included. */
function throughput(shippedAt: readonly number[], today: number) {
  const first = Math.min(today, ...shippedAt.map((at) => Math.floor(at / DAY)))
  const counts = Array.from({ length: today - first + 1 }, () => 0)
  shippedAt.forEach((at) => {
    counts[Math.min(Math.floor(at / DAY), today) - first]++
  })
  return counts
}

/** For each target count, the P50 and P85 day (UTC midnight epoch ms) by which that many more issues ship. */
function simulate(samples: readonly number[], targets: readonly number[], today: number) {
  const random = mulberry32(SEED)
  const goal = Math.max(...targets)
  const trials = Array.from({ length: TRIALS }, () => {
    const progress: number[] = []
    // Cumulative issues shipped after each simulated day.
    while ((progress.at(-1) ?? 0) < goal && progress.length < HORIZON)
      progress.push((progress.at(-1) ?? 0) + (samples[Math.floor(random() * samples.length)] ?? 0))
    return progress
  })
  return targets.map((target) => {
    const days = trials
      .map((progress) => {
        const index = progress.findIndex((count) => count >= target)
        return index === -1 ? HORIZON : index + 1
      })
      .toSorted((a, b) => a - b)
    return {
      p50: (today + (days[Math.ceil(TRIALS * 0.5) - 1] ?? HORIZON)) * DAY,
      p85: (today + (days[Math.ceil(TRIALS * 0.85) - 1] ?? HORIZON)) * DAY,
    }
  })
}

function mulberry32(seed: number) {
  const state = { value: seed >>> 0 }
  return () => {
    state.value = (state.value + 0x6d2b79f5) >>> 0
    const a = Math.imul(state.value ^ (state.value >>> 15), state.value | 1)
    const b = a ^ (a + Math.imul(a ^ (a >>> 7), a | 61))
    return ((b ^ (b >>> 14)) >>> 0) / 4294967296
  }
}
~~~~

## AUT3-C12

```json
{
  "block_id": "AUT3-C12",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-02",
    "RE-AUT3-05",
    "RE-AUT3-06"
  ],
  "body_anchors": [
    "B13"
  ],
  "requested_subject": "Origem das métricas derivadas de rows e ausência como null",
  "path": "packages/core/src/board/ledger.ts",
  "archive": "sources/packages/core/src/board/ledger.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "282e862105def593673fa404ca9ce87991b31fe2",
  "source_sha256": "07f029330ac42176b6bac035d8fdbc2d81d72decd6b83004b6a9627e02351b2c",
  "source_bytes": 3914,
  "required_source_line_ranges": [
    [
      1,
      94
    ]
  ],
  "prior_literal_ranges": []
}
```

```json
{"first_line":1,"last_line":94,"bytes":3914,"sha256":"07f029330ac42176b6bac035d8fdbc2d81d72decd6b83004b6a9627e02351b2c"}
```

~~~~typescript
export * as BoardLedger from "./ledger"

import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm"
import { Effect } from "effect"
import type { Board } from "@orchestra/schema/board"
import { BoardActivityTable, BoardAttemptTable, BoardCheckTable, BoardIssueTable } from "./sql"
import type { ProjectRow, Tx } from "./shared"

// The conveyor's numbers for one project's pool (merge-queue spec section 12). Each is null until its rows exist.
export const of = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow) {
  const merges = yield* tx
    .select({ issue: BoardActivityTable.issue_id, at: BoardActivityTable.time_created })
    .from(BoardActivityTable)
    .where(
      and(eq(BoardActivityTable.project_id, project.id), eq(BoardActivityTable.action, "bundle.merge"), isNotNull(BoardActivityTable.issue_id)),
    )
    .all()
  const adds = yield* tx
    .select({ issue: BoardActivityTable.issue_id, at: BoardActivityTable.time_created })
    .from(BoardActivityTable)
    .where(and(eq(BoardActivityTable.project_id, project.id), eq(BoardActivityTable.action, "queue.add"), isNotNull(BoardActivityTable.issue_id)))
    .orderBy(asc(BoardActivityTable.time_created))
    .all()
  const checks = yield* tx
    .select({ issue: BoardCheckTable.issue_id, ended: BoardCheckTable.ended_at })
    .from(BoardCheckTable)
    .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardCheckTable.issue_id))
    .where(
      and(
        eq(BoardIssueTable.project_id, project.id),
        eq(BoardCheckTable.kind, "scoped"),
        eq(BoardCheckTable.outcome, "pass"),
        isNotNull(BoardCheckTable.ended_at),
      ),
    )
    .all()
  const outcomes = yield* settled(tx, project.id)
  const shipped = yield* tx
    .select({ id: BoardIssueTable.id })
    .from(BoardIssueTable)
    .where(and(eq(BoardIssueTable.project_id, project.id), eq(BoardIssueTable.stage, "shipped")))
    .all()
  const attempts =
    shipped.length === 0
      ? []
      : yield* tx
          .select({ issue: BoardAttemptTable.issue_id })
          .from(BoardAttemptTable)
          .where(inArray(BoardAttemptTable.issue_id, shipped.map((row) => row.id)))
          .all()

  const queueWait = median(
    merges.flatMap((merge) => {
      const added = adds.filter((add) => add.issue === merge.issue && add.at <= merge.at).at(-1)
      return added ? [merge.at - added.at] : []
    }),
  )
  const leadTime = median(
    merges.flatMap((merge) => {
      const passed = checks.flatMap((check) =>
        check.issue === merge.issue && check.ended !== null && check.ended <= merge.at ? [check.ended] : [],
      )
      return passed.length === 0 ? [] : [merge.at - Math.min(...passed)]
    }),
  )
  const ejected = outcomes.filter((outcome) => outcome === "ejected").length
  return {
    queueWait,
    redRate: outcomes.length === 0 ? null : ejected / outcomes.length,
    reworkRate: attempts.length === 0 ? null : attempts.length / shipped.length,
    leadTime,
  } satisfies Board.Ledger
})

/** The outcomes of the project's last 50 settled attempts: the red rate and the bundle size both read them. */
export const settled = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow["id"]) {
  const rows = yield* tx
    .select({ outcome: BoardAttemptTable.outcome })
    .from(BoardAttemptTable)
    .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardAttemptTable.issue_id))
    .where(and(eq(BoardIssueTable.project_id, project), inArray(BoardAttemptTable.outcome, ["merged", "ejected"])))
    .orderBy(desc(BoardAttemptTable.time_updated))
    .limit(50)
    .all()
  return rows.map((row) => row.outcome)
})

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]!
  return (sorted[middle - 1]! + sorted[middle]!) / 2
}
~~~~

## AUT3-C13

```json
{
  "block_id": "AUT3-C13",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-02",
    "RE-AUT3-06"
  ],
  "body_anchors": [
    "B13"
  ],
  "requested_subject": "Leitura viva e composição de proof com attempts/recorded facts",
  "path": "packages/core/src/board/proof.ts",
  "archive": "sources/packages/core/src/board/proof.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "6bd1374e707dd7f80975f37e2c03e02a9ee97a95",
  "source_sha256": "6451c593372c579f0a2e116adc25fc824b1240519ad9110b6637d63935ba2608",
  "source_bytes": 2553,
  "required_source_line_ranges": [
    [
      1,
      65
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B13",
      "source_path": "packages/core/src/board/proof.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "6bd1374e707dd7f80975f37e2c03e02a9ee97a95",
      "source_sha256": "6451c593372c579f0a2e116adc25fc824b1240519ad9110b6637d63935ba2608",
      "first_line": 31,
      "last_line": 48,
      "excerpt_bytes": 687,
      "excerpt_sha256": "359d8a4cbf38030ea04bf0aaab741690d8c97ae9dcf2aeeb6abda6ac527f382e",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 159339,
      "literal_content_byte_end_exclusive": 160026
    }
  ]
}
```

```json
{"first_line":1,"last_line":30,"bytes":1187,"sha256":"f11fd0816dfa68470a19ed1c53b62eaf91e3ee12a58079a62735b225acfa569e"}
```

~~~~typescript
export * as BoardProof from "./proof"

import { and, desc, eq, isNull } from "drizzle-orm"
import { Effect } from "effect"
import { Board } from "@orchestra/schema/board"
import { BoardDecisionTable } from "./sql"
import { toDecision } from "./rows"
import { loadIssue, loadProject, numbers, worktree } from "./shared"
import type { Tx } from "./shared"

// What backs a card's status. The stored half is read in a transaction; the live half (PR, checks) comes from the trail.

const ATTEMPTS = 3

export const load = Effect.fnUntraced(function* (tx: Tx, key: string, number: number) {
  const project = yield* loadProject(tx, key)
  const row = yield* loadIssue(tx, project, number)
  const known = yield* numbers(tx, project)
  const decided = yield* tx
    .select()
    .from(BoardDecisionTable)
    .where(and(eq(BoardDecisionTable.issue_id, row.id), isNull(BoardDecisionTable.overturned_by_id)))
    .orderBy(desc(BoardDecisionTable.answered_at), desc(BoardDecisionTable.id))
    .limit(1)
    .get()
  return { project, row, directory: yield* worktree(tx, project), decided: decided ? toDecision(decided, known) : null }
})

type Loaded = Effect.Success<ReturnType<typeof load>>

~~~~

```json
{"first_line":49,"last_line":65,"bytes":679,"sha256":"f1f8af48b9329f6a8385ace10e09a1df4b4bb53f96c8e7e169e251a4c7779432"}
```

~~~~typescript
        : null,
    ci:
      live.state === "ok"
        ? { checks: live.pr.checks, failing: live.pr.checks.find((check) => failed(check.conclusion))?.name ?? null }
        : null,
    attempts: { n: loaded.row.attempts, of: ATTEMPTS },
    guardrail: rule ? { rule, summary } : null,
    crashReason: loaded.row.crash_reason,
    verifiedAt: live.state === "ok" ? (live.verifiedAt ?? null) : null,
    decidedBy: loaded.decided,
  } satisfies Board.Proof
}

/** A check conclusion that is neither a pass nor a skip. */
export function failed(conclusion: string | null) {
  return conclusion !== null && !["success", "neutral", "skipped"].includes(conclusion.toLowerCase())
}
~~~~

## AUT3-C14

```json
{
  "block_id": "AUT3-C14",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-03",
    "RE-AUT3-04"
  ],
  "body_anchors": [
    "B06"
  ],
  "requested_subject": "Contrato/base/defaults, índice temporário, commands/packages/none, ledger/dedupe/dispatch/settle/state completos",
  "path": "packages/core/src/board/ci.ts",
  "archive": "sources/packages/core/src/board/ci.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "77bc3370fc8a34249a2baf19ee10c7e8151cdc6b",
  "source_sha256": "7a67b182097690e957ec40cf04f753e2695047f7b2fa5f19b792d8db9e38c7dd",
  "source_bytes": 25362,
  "required_source_line_ranges": [
    [
      1,
      520
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B06",
      "source_path": "packages/core/src/board/ci.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "77bc3370fc8a34249a2baf19ee10c7e8151cdc6b",
      "source_sha256": "7a67b182097690e957ec40cf04f753e2695047f7b2fa5f19b792d8db9e38c7dd",
      "first_line": 336,
      "last_line": 359,
      "excerpt_bytes": 1355,
      "excerpt_sha256": "a308b3f559db72dc82f04d56b15e590847482d88fb0f0b0e5b63e3f9d0bb44ce",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 132371,
      "literal_content_byte_end_exclusive": 133726
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B06",
      "source_path": "packages/core/src/board/ci.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "77bc3370fc8a34249a2baf19ee10c7e8151cdc6b",
      "source_sha256": "7a67b182097690e957ec40cf04f753e2695047f7b2fa5f19b792d8db9e38c7dd",
      "first_line": 440,
      "last_line": 454,
      "excerpt_bytes": 975,
      "excerpt_sha256": "c2f9f407d1e28687c85c5366d4b9f065535b74dbc16684fd716f87ec36510752",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 133859,
      "literal_content_byte_end_exclusive": 134834
    }
  ]
}
```

```json
{"first_line":1,"last_line":335,"bytes":16278,"sha256":"24e1a9173b6022e25336a6932ed6b6222528adb2318947f3e280c4216401e1c4"}
```

~~~~typescript
export * as BoardCi from "./ci"

import fs from "fs/promises"
import os from "os"
import path from "path"
import { and, eq } from "drizzle-orm"
import { Clock, Effect, Option, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Board } from "@orchestra/schema/board"
import type { AppProcess } from "../process"
import { which } from "../util/which"
import type { BoardGithub } from "./github"
import { global } from "./queue-lanes"
import { affected, AUTHOR } from "./queue-shared"
import type { BoardQueue } from "./queue"
import { BoardCheckTable } from "./sql"
import { loadIssue, loadProject, NotFoundError, RefusedError, worktree } from "./shared"
import type { IssueRow, ProjectRow, Tx } from "./shared"

// CI facts (docs/specs/maestro-lead/merge-queue.md section 5): the `.orchestra/ci.json` contract, `ci_run`, and the
// `board_check` ledger keyed by tree. The scoped state is derived from that ledger on every read and never stored.

export interface Deps {
  readonly quiet: <A>(work: (tx: Tx) => Effect.Effect<A, unknown>) => Effect.Effect<A>
  readonly proc: AppProcess.Interface
  readonly gh: BoardGithub.Gh
  readonly env?: NodeJS.ProcessEnv
  /** Replaces `turbo`'s affected set, as in the queue; tests bind it so they need no installed workspace. */
  readonly affected?: BoardQueue.Deps["affected"]
}

/** The scoped check a card that touches no workspace package records instead of running the tests. */
export const UNTOUCHED = "none: no workspace package affected"

export type Contract = {
  readonly base: string
  readonly scoped: { readonly tests: string | null; readonly workflows: ReadonlyArray<string> }
  readonly full: {
    readonly label: string | null
    readonly checks: ReadonlyArray<string>
    /** A line the named jobs (name prefixes) always print; such a job that failed with no failing file and without it never ran its tests. */
    readonly control: { readonly line: string; readonly jobs: ReadonlyArray<string> } | null
  }
  readonly bundle: {
    readonly size: number
    readonly max: number
    readonly waitMinutes: number
    readonly onBaseMoved: "merge-if-disjoint" | "retest"
  }
  readonly budget: { readonly jobs: number | null }
  /**
   * Lanes (merge-queue spec section 7): cards whose turbo affected sets do not overlap land in parallel bundles that
   * run only their packages. Null, or no `turbo.json` on the base, keeps one bundle at a time.
   */
  readonly lanes: {
    readonly by: "turbo"
    /** Globs whose change has no lane: such a card overlaps everything and runs the whole suite alone. */
    readonly global: ReadonlyArray<string>
    /** Every Nth lane bundle runs the whole suite anyway; 0 never. */
    readonly fullEvery: number
    /** Jobs one lane bundle's gate uses; with `budget.jobs` it caps lanes in flight. Null leaves them uncapped. */
    readonly jobs: number | null
    /** The workflows a lane bundle dispatches with a `packages` input instead of applying the full label. */
    readonly workflows: ReadonlyArray<string>
  } | null
  /** The remote snapshot refs go to; a private one keeps a public repository's work in progress private. */
  readonly snapshots: { readonly remote: string }
  readonly merge: "merge"
  /** Where the contract came from: the file, or the default for a repository with or without required PR checks. */
  readonly source: "file" | "required-checks" | "no-ci"
}

const Positive = Schema.Int.check(Schema.isGreaterThan(0))
const File = Schema.Struct({
  base: Schema.optional(Schema.String),
  scoped: Schema.optional(
    Schema.Struct({ tests: Schema.optional(Schema.NullOr(Schema.String)), workflows: Schema.optional(Schema.Array(Schema.String)) }),
  ),
  full: Schema.optional(
    Schema.Struct({
      label: Schema.optional(Schema.NullOr(Schema.String)),
      checks: Schema.optional(Schema.Array(Schema.String)),
      control: Schema.optional(Schema.NullOr(Schema.Struct({ line: Schema.String, jobs: Schema.Array(Schema.String) }))),
    }),
  ),
  bundle: Schema.optional(
    Schema.Struct({
      size: Schema.optional(Positive),
      max: Schema.optional(Positive),
      waitMinutes: Schema.optional(Positive),
      onBaseMoved: Schema.optional(Schema.Literals(["merge-if-disjoint", "retest"])),
    }),
  ),
  budget: Schema.optional(Schema.Struct({ jobs: Schema.optional(Positive) })),
  lanes: Schema.optional(
    Schema.Struct({
      by: Schema.Literal("turbo"),
      global: Schema.optional(Schema.Array(Schema.String)),
      fullEvery: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
      jobs: Schema.optional(Positive),
      workflows: Schema.optional(Schema.Array(Schema.String)),
    }),
  ),
  snapshots: Schema.optional(Schema.Struct({ remote: Schema.optional(Schema.String) })),
  // Squash or rebase would rewrite member SHAs and GitHub would stop marking member PRs merged.
  merge: Schema.optional(Schema.Literal("merge")),
})
const decodeFile = Schema.decodeUnknownResult(Schema.fromJsonString(File))
const Rules = Schema.Array(Schema.Struct({ type: Schema.String }))
const decodeRules = Schema.decodeUnknownOption(Schema.fromJsonString(Rules))
const Branch = Schema.Struct({ commit: Schema.Struct({ sha: Schema.String, commit: Schema.Struct({ tree: Schema.Struct({ sha: Schema.String }) }) }) })
const decodeBranch = Schema.decodeUnknownOption(Schema.fromJsonString(Branch))
const Runs = Schema.Array(
  Schema.Struct({ headSha: Schema.String, status: Schema.String, conclusion: Schema.String, url: Schema.String, createdAt: Schema.String }),
)
const decodeRuns = Schema.decodeUnknownOption(Schema.fromJsonString(Runs))

const RUN_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+/g

export function make(deps: Deps) {
  const git = (cwd: string, args: ReadonlyArray<string>, env?: Record<string, string>) =>
    deps.proc
      .run(
        ChildProcess.make("git", ["--no-optional-locks", "-C", cwd, "-c", "core.fsmonitor=false", ...args], {
          cwd,
          env,
          extendEnv: true,
          stdin: "ignore",
        }),
        { maxOutputBytes: 4 * 1024 * 1024, maxErrorBytes: 16 * 1024, timeout: "60 seconds" },
      )
      .pipe(
        Effect.map((result) => ({ code: result.exitCode, out: result.stdout.toString("utf8").trim(), err: result.stderr.toString("utf8").trim() })),
        Effect.catch((error) => Effect.succeed({ code: 1, out: "", err: error.message })),
      )

  /** The contract read from the base branch: a change to it goes through a PR like any other change. */
  const contract = Effect.fnUntraced(function* (directory: string, project: ProjectRow) {
    const origin = yield* git(directory, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
    const ref = origin.code === 0 ? origin.out : "HEAD"
    const shown = yield* git(directory, ["show", `${ref}:.orchestra/ci.json`])
    const base = origin.code === 0 ? origin.out.replace(/^origin\//, "") : (yield* git(directory, ["rev-parse", "--abbrev-ref", "HEAD"])).out
    if (shown.code !== 0) return yield* defaults(base, project)
    const decoded = decodeFile(shown.out)
    if (decoded._tag === "Failure")
      return yield* new RefusedError({
        message: `.orchestra/ci.json on ${ref} is invalid, so CI is not run: ${decoded.failure.message.split("\n")[0]}. Fix the file on the base branch.`,
      })
    const file = decoded.success
    return {
      base: file.base ?? base,
      scoped: { tests: file.scoped?.tests ?? null, workflows: file.scoped?.workflows ?? [] },
      full: { label: file.full?.label ?? null, checks: file.full?.checks ?? [], control: file.full?.control ?? null },
      bundle: {
        size: file.bundle?.size ?? 4,
        max: file.bundle?.max ?? 16,
        waitMinutes: file.bundle?.waitMinutes ?? 45,
        onBaseMoved: file.bundle?.onBaseMoved ?? "retest",
      },
      budget: { jobs: file.budget?.jobs ?? null },
      lanes: file.lanes
        ? {
            by: "turbo",
            global: file.lanes.global ?? [],
            fullEvery: file.lanes.fullEvery ?? 0,
            jobs: file.lanes.jobs ?? null,
            workflows: file.lanes.workflows ?? [],
          }
        : null,
      snapshots: { remote: file.snapshots?.remote ?? "origin" },
      merge: "merge",
      source: "file",
    } satisfies Contract
  })

  const defaults = Effect.fnUntraced(function* (base: string, project: ProjectRow) {
    const rules = project.github_repo ? yield* deps.gh(["api", `repos/${project.github_repo}/rules/branches/${base}`]) : undefined
    const required =
      rules?.exitCode === 0 &&
      Option.getOrElse(decodeRules(rules.stdout), () => []).some((rule) => rule.type === "required_status_checks")
    return {
      base,
      scoped: { tests: null, workflows: [] },
      full: { label: null, checks: [], control: null },
      bundle: { size: required ? 4 : 1, max: 16, waitMinutes: 45, onBaseMoved: "retest" },
      budget: { jobs: null },
      lanes: null,
      snapshots: { remote: "origin" },
      merge: "merge",
      source: required ? "required-checks" : "no-ci",
    } satisfies Contract
  })

  /** The tree of the worktree as it stands, from a temporary index so the worktree and its index stay untouched. */
  const snapshot = Effect.fnUntraced(function* (directory: string) {
    const index = yield* git(directory, ["rev-parse", "--path-format=absolute", "--git-path", "index"])
    return yield* Effect.acquireUseRelease(
      Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "orchestra-check-"))),
      (temporary) =>
        Effect.gen(function* () {
          const env = { GIT_INDEX_FILE: path.join(temporary, "index") }
          // The copy keeps the index's mtime: git trusts an entry's stat only when it is older than the index file, so a
          // fresh mtime would hide an edit of the same size made in the same second as the last index write.
          yield* Effect.promise(() => fs.cp(index.out, env.GIT_INDEX_FILE, { preserveTimestamps: true }).catch(() => undefined))
          const added = yield* git(directory, ["add", "-A"], env)
          const tree = yield* git(directory, ["write-tree"], env)
          if (added.code !== 0 || tree.code !== 0)
            return yield* new RefusedError({ message: `Could not read the tree of ${directory}: ${added.err || tree.err}` })
          return tree.out
        }),
      (temporary) => Effect.promise(() => fs.rm(temporary, { recursive: true, force: true })),
    )
  })

  const cardWorktree = Effect.fnUntraced(function* (directory: string, issue: IssueRow, ref: string) {
    if (!issue.branch) return yield* new RefusedError({ message: `${ref} has no branch; link one with board_issue first.` })
    const listed = yield* git(directory, ["worktree", "list", "--porcelain"])
    const found = listed.out
      .split("\n\n")
      .map((block) => block.split("\n"))
      .find((lines) => lines.includes(`branch refs/heads/${issue.branch}`))
      ?.find((line) => line.startsWith("worktree "))
      ?.slice("worktree ".length)
    if (!found) return yield* new RefusedError({ message: `${ref}'s branch ${issue.branch} is checked out in no worktree of ${directory}.` })
    return found
  })

  const rows = (issue: Board.IssueID) =>
    deps.quiet((tx) => tx.select().from(BoardCheckTable).where(eq(BoardCheckTable.issue_id, issue)).all())

  const insert = (row: typeof BoardCheckTable.$inferInsert) =>
    deps.quiet((tx) => tx.insert(BoardCheckTable).values(row).run())

  const runTests = Effect.fnUntraced(function* (input: {
    readonly issue: IssueRow
    readonly cwd: string
    readonly argv: ReadonlyArray<string>
    readonly tree: string
  }) {
    const startedAt = yield* Clock.currentTimeMillis
    const executable = which(input.argv[0] ?? "", deps.env ?? process.env) ?? input.argv[0] ?? ""
    const result = yield* deps.proc
      .run(ChildProcess.make(executable, input.argv.slice(1), { cwd: input.cwd, env: deps.env, extendEnv: true, stdin: "ignore" }), {
        combineOutput: true,
        maxOutputBytes: 16 * 1024 * 1024,
        timeout: "90 minutes",
      })
      .pipe(Effect.result)
    const output = result._tag === "Success" ? (result.success.output?.toString("utf8") ?? "") : ""
    const outcome: Board.CheckOutcome =
      result._tag === "Failure" ? "error" : result.success.exitCode === 0 ? "pass" : "fail"
    const commit = yield* git(input.cwd, ["rev-parse", "HEAD"])
    const row = {
      id: Board.CheckID.create(),
      issue_id: input.issue.id,
      attempt: input.issue.attempts,
      kind: "scoped" as const,
      command: input.argv.join(" "),
      tree_sha: input.tree,
      commit_sha: commit.code === 0 ? commit.out : null,
      outcome,
      url: output.match(RUN_URL)?.at(-1) ?? null,
      failing: result._tag === "Failure" ? [result.failure.message] : outcome === "fail" ? failing(output) : [],
      started_at: startedAt,
      ended_at: yield* Clock.currentTimeMillis,
    }
    yield* insert(row)
    return row
  })

  // The workspace packages a card's tree changes against base, by turbo's affected set: the root `//` alone is no
  // package, and a file the lanes call global counts as one. Undefined when turbo cannot tell.
  const packages = Effect.fnUntraced(function* (cwd: string, tree: string, terms: Contract) {
    const base = yield* git(cwd, ["merge-base", "HEAD", `origin/${terms.base}`])
    const from = base.code === 0 ? base.out : (yield* git(cwd, ["merge-base", "HEAD", terms.base])).out
    // turbo compares commits, so the tree, which may hold uncommitted edits, gets a commit of its own that no ref keeps.
    const to = (yield* git(cwd, [...AUTHOR, "commit-tree", tree, "-p", "HEAD", "-m", "ci_run tree"])).out
    if (!from || !to) return undefined
    const files = (yield* git(cwd, ["diff", "--name-only", from, to])).out.split("\n").filter(Boolean)
    if (terms.lanes && global(files, terms.lanes.global)) return ["the whole repository"]
    return (yield* affected(deps, cwd, from, to))?.filter((name) => name !== "//")
  })

  /** Dispatches each workflow once per pushed tree, and settles pending dispatches from `gh run list`. */
  const workflows = Effect.fnUntraced(function* (input: {
    readonly project: ProjectRow
    readonly issue: IssueRow
    readonly files: ReadonlyArray<string>
    readonly dispatch: boolean
    readonly notes: string[]
  }) {
    if (input.files.length === 0) return
    const repo = input.project.github_repo
    if (!repo || !input.issue.branch) {
      input.notes.push("The contract's workflows need a GitHub repository and a branch; none was dispatched.")
      return
    }
    const known = yield* rows(input.issue.id)
    yield* Effect.forEach(
      known.filter((row) => row.kind === "workflow" && row.outcome === "pending"),
      (row) => settle(repo, input.issue.branch ?? "", row),
    )
    if (!input.dispatch) return
    const head = yield* deps.gh(["api", `repos/${repo}/branches/${input.issue.branch}`])
    const branch = head.exitCode === 0 ? Option.getOrUndefined(decodeBranch(head.stdout)) : undefined
    if (!branch) {
      input.notes.push(`${input.issue.branch} is not pushed, so the contract's workflows wait for the push.`)
      return
    }
    const tree = branch.commit.commit.tree.sha
    const fresh = input.files.filter(
      (file) => !known.some((row) => row.kind === "workflow" && row.command === file && row.tree_sha === tree && row.outcome !== "error"),
    )
    yield* Effect.forEach(fresh, (file) =>
      Effect.gen(function* () {
        const startedAt = yield* Clock.currentTimeMillis
        const sent = yield* deps.gh(["workflow", "run", file, "--ref", input.issue.branch ?? "", "-R", repo])
        yield* insert({
          id: Board.CheckID.create(),
          issue_id: input.issue.id,
          attempt: input.issue.attempts,
          kind: "workflow",
          command: file,
          tree_sha: tree,
          commit_sha: branch.commit.sha,
          outcome: sent.exitCode === 0 ? "pending" : "error",
          url: null,
          failing: sent.exitCode === 0 ? [] : [sent.stderr.trim() || `gh workflow run ${file} failed`],
          started_at: startedAt,
          ended_at: sent.exitCode === 0 ? null : startedAt,
        })
      }),
    )
  })

~~~~

```json
{"first_line":360,"last_line":439,"bytes":3766,"sha256":"d07dc1a549ceba24d13ad68a22087855559b3d318b06f4bca4c5d822ead193ad"}
```

~~~~typescript

  return {
    contract,
    snapshot,
    run: Effect.fnUntraced(function* (input: Board.CiRunInput) {
      const found = yield* deps.quiet((tx) =>
        Effect.gen(function* () {
          const project = yield* loadProject(tx, input.project)
          const issue = yield* loadIssue(tx, project, input.issue)
          return { project, issue, directory: yield* worktree(tx, project) }
        }),
      )
      const ref = `${found.project.key}-${found.issue.number}`
      if (!found.directory) return yield* new RefusedError({ message: `${found.project.key} has no repo; set one with board_project.` })
      const terms = yield* contract(found.directory, found.project)
      const cwd = yield* cardWorktree(found.directory, found.issue, ref)
      const tree = yield* snapshot(cwd)
      const notes: string[] = []
      const dispatch = input.run !== false

      if (terms.scoped.tests === null)
        notes.push(
          terms.source === "required-checks"
            ? "No .orchestra/ci.json: the scoped gate is the PR's own checks."
            : terms.source === "no-ci"
              ? "No .orchestra/ci.json and no required checks: the scoped gate is land's verification only."
              : "The contract has no scoped.tests command.",
        )
      // A contract that tests per package and a card that changes none, such as a docs-only card: nothing is there to
      // test, so the ledger records an explicit `none` check instead of refusing or running the whole suite.
      const bare = terms.scoped.tests?.includes("{package}") === true && !input.package
      if (bare) {
        const touched = yield* packages(cwd, tree, terms)
        if (touched === undefined)
          return yield* new RefusedError({ message: `The contract's scoped.tests needs \`package\` for ${ref}, and turbo could not tell which packages it changes.` })
        if (touched.length > 0)
          return yield* new RefusedError({ message: `The contract's scoped.tests needs \`package\` for ${ref}: it changes ${touched.join(", ")}.` })
        notes.push(`${ref} changes no workspace package, so there is nothing to test: the scoped tests record \`${UNTOUCHED}\`.`)
        const done = (yield* rows(found.issue.id)).some((row) => row.kind === "scoped" && row.tree_sha === tree && row.command === UNTOUCHED)
        if (dispatch && !done) {
          const now = yield* Clock.currentTimeMillis
          yield* insert({
            id: Board.CheckID.create(),
            issue_id: found.issue.id,
            attempt: found.issue.attempts,
            kind: "scoped",
            command: UNTOUCHED,
            tree_sha: tree,
            commit_sha: null,
            outcome: "pass",
            url: null,
            failing: [],
            started_at: now,
            ended_at: now,
          })
        }
      }
      if (terms.scoped.tests !== null && !bare) {
        const argv = yield* command(terms.scoped.tests, input, ref)
        const done = (yield* rows(found.issue.id)).some(
          (row) => row.kind === "scoped" && row.tree_sha === tree && row.command === argv.join(" ") && row.outcome !== "error",
        )
        if (dispatch && !done) yield* runTests({ issue: found.issue, cwd, argv, tree })
      }
      yield* workflows({ project: found.project, issue: found.issue, files: terms.scoped.workflows, dispatch, notes })

      const checks = (yield* rows(found.issue.id)).filter((row) => row.tree_sha === tree).sort((a, b) => a.started_at - b.started_at)
      return {
        tree,
        state: state(checks, terms),
        checks: checks.map(toCheck),
        notes,
      } satisfies Board.CiRunResult
    }),
  }
}

export type Interface = ReturnType<typeof make>
export type Error = NotFoundError | RefusedError

~~~~

```json
{"first_line":455,"last_line":520,"bytes":2988,"sha256":"7cb20390a441a2146c72e822f1bed13c645bb7a1e0b150f8b5c31394b3590c11"}
```

~~~~typescript

// Split on whitespace with no shell: `{files}` becomes one argument per file and `{package}` is filled in place.
export function command(template: string, input: { readonly package?: string; readonly files?: ReadonlyArray<string> }, ref: string) {
  if (template.includes("{package}") && !input.package)
    return Effect.fail(new RefusedError({ message: `The contract's scoped.tests needs \`package\` for ${ref}.` }))
  return Effect.succeed(
    template
      .split(/\s+/)
      .filter(Boolean)
      .flatMap((token) => (token === "{files}" ? [...(input.files ?? [])] : [token.replaceAll("{package}", input.package ?? "")])),
  )
}

// Bun prints each test file as a header line and `(fail)` under it; vitest prints `FAIL |project| <file> > <test>`; tsc and
// tsgo print each type error with its file path; test:ci prints a failed job as `=== name: failure ===`. Colors are stripped.
export function failing(colored: string) {
  const output = colored.replace(/\x1b\[[0-9;]*m/g, "")
  const bun = output
    .split("\n")
    .reduce(
      (acc, line) => {
        const header = line.trim().match(/^(\S+\.test\.[cm]?[jt]sx?):$/)
        if (header) return { file: header[1], found: acc.found }
        if (line.includes("(fail)") && acc.file) return { file: acc.file, found: acc.found.add(acc.file) }
        return acc
      },
      { file: undefined as string | undefined, found: new Set<string>() },
    ).found
  const types = output.split("\n").flatMap((line) => line.trim().match(/^(\S+\.[cm]?tsx?)(?:\(\d+,\d+\)|:\d+:\d+)(?::| -) error TS\d+/)?.[1] ?? [])
  const vitest = output.split("\n").flatMap((line) => line.trim().match(/^FAIL\s+(?:\|[^|]+\|\s+)?(\S+\.[cm]?[jt]sx?)\b/)?.[1] ?? [])
  const files = [...new Set([...bun, ...vitest, ...types])]
  if (files.length > 0) return files
  return [...output.matchAll(/^=== (.+): failure ===$/gm)].map((match) => match[1] ?? "").filter(Boolean)
}

// A turbo run prints each package's output between `##[group]<package>:test` and `##[endgroup]`; the bun test files
// that failed inside a group belong to that package. Windows paths come back with forward slashes.
export function packaged(colored: string) {
  return colored
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split(/^##\[group\]/m)
    .slice(1)
    .flatMap((section) => {
      const name = section.match(/^(\S+):test\r?$/m)?.[1]
      const files = failing(section.split(/^##\[endgroup\]/m)[0] ?? "")
        .filter((file) => /\.test\.[cm]?[jt]sx?$/.test(file))
        .map((file) => file.replaceAll("\\", "/"))
      return name && files.length > 0 ? [{ package: name, files }] : []
    })
}

function toCheck(row: typeof BoardCheckTable.$inferSelect): Board.Check {
  return {
    id: row.id,
    attempt: row.attempt,
    kind: row.kind,
    command: row.command,
    treeSha: row.tree_sha,
    commitSha: row.commit_sha,
    outcome: row.outcome,
    url: row.url,
    failing: row.failing,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  }
}
~~~~

## AUT3-C15

```json
{
  "block_id": "AUT3-C15",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-04",
    "RE-AUT3-05"
  ],
  "body_anchors": [
    "B07",
    "B08",
    "B09",
    "B10"
  ],
  "requested_subject": "Admissão/head/tree/record/followups/dequeue, owner bundle actions, tick/cut/lanes/globs/capacity/full safety/PR/adaptive size",
  "path": "packages/core/src/board/queue.ts",
  "archive": "sources/packages/core/src/board/queue.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "5194680fdf6bd598ececadf5f63c3339a945357d",
  "source_sha256": "dd50c583530d4b6dd5de417fcd8b0e0abd0774e792ba7806c507b58e8386188f",
  "source_bytes": 38106,
  "required_source_line_ranges": [
    [
      1,
      733
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B07",
      "source_path": "packages/core/src/board/queue.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "5194680fdf6bd598ececadf5f63c3339a945357d",
      "source_sha256": "dd50c583530d4b6dd5de417fcd8b0e0abd0774e792ba7806c507b58e8386188f",
      "first_line": 98,
      "last_line": 117,
      "excerpt_bytes": 1419,
      "excerpt_sha256": "98ca2205c183960b350f8f3edbf32a0dc8be7b5aefea7f03f0ac2082e789fec6",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 135334,
      "literal_content_byte_end_exclusive": 136753
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B07",
      "source_path": "packages/core/src/board/queue.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "5194680fdf6bd598ececadf5f63c3339a945357d",
      "source_sha256": "dd50c583530d4b6dd5de417fcd8b0e0abd0774e792ba7806c507b58e8386188f",
      "first_line": 134,
      "last_line": 150,
      "excerpt_bytes": 1105,
      "excerpt_sha256": "ba17230008c1b32f67c5bfd7448cd75a84cacac56fb913cddad2847db639d676",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 136886,
      "literal_content_byte_end_exclusive": 137991
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B08",
      "source_path": "packages/core/src/board/queue.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "5194680fdf6bd598ececadf5f63c3339a945357d",
      "source_sha256": "dd50c583530d4b6dd5de417fcd8b0e0abd0774e792ba7806c507b58e8386188f",
      "first_line": 271,
      "last_line": 287,
      "excerpt_bytes": 777,
      "excerpt_sha256": "712e28361338a54ac39d707fddaf568bb898f828efb974df170e8c69db9b8ee3",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 138486,
      "literal_content_byte_end_exclusive": 139263
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B10",
      "source_path": "packages/core/src/board/queue.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "5194680fdf6bd598ececadf5f63c3339a945357d",
      "source_sha256": "dd50c583530d4b6dd5de417fcd8b0e0abd0774e792ba7806c507b58e8386188f",
      "first_line": 315,
      "last_line": 335,
      "excerpt_bytes": 967,
      "excerpt_sha256": "1b383069ce69ad137d7ad5575063ac2f88bc4d691a4833f07be768adf410d8ab",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 149852,
      "literal_content_byte_end_exclusive": 150819
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B10",
      "source_path": "packages/core/src/board/queue.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "5194680fdf6bd598ececadf5f63c3339a945357d",
      "source_sha256": "dd50c583530d4b6dd5de417fcd8b0e0abd0774e792ba7806c507b58e8386188f",
      "first_line": 584,
      "last_line": 595,
      "excerpt_bytes": 763,
      "excerpt_sha256": "3265802a77bd8427365ed7b1af1c899e757e0e9dcba0db3d9b981dba063df32a",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 150952,
      "literal_content_byte_end_exclusive": 151715
    }
  ]
}
```

```json
{"first_line":1,"last_line":97,"bytes":4210,"sha256":"d723ad4140d64dc060d3076272b24d5bab858bd6d374776891ce3921a3ca55aa"}
```

~~~~typescript
export * as BoardQueue from "./queue"

import fs from "fs/promises"
import os from "os"
import path from "path"
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, notInArray } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { Board } from "@orchestra/schema/board"
import { BoardCi } from "./ci"
import { BoardLedger } from "./ledger"
import {
  BoardAttemptTable,
  BoardBundleMemberTable,
  BoardBundleTable,
  BoardCheckTable,
  BoardDependencyTable,
  BoardIssueTable,
  BoardProjectTable,
  BoardQueueTable,
} from "./sql"
import { changed, gitRunner, loadIssue, loadProject, log, RefusedError, worktree } from "./shared"
import type { IssueRow, ProjectRow } from "./shared"
import { affected, AUTHOR, dispatched, isMember, nextBundle, openBundles, place, release } from "./queue-shared"
import type { Deps } from "./queue-shared"
import { drift } from "./queue-drift"
import { capacity, global, lanes } from "./queue-lanes"
import type { Lane } from "./queue-lanes"
import { makeRecord } from "./queue-record"
import { makeRed } from "./queue-red"
import { makeSettle } from "./queue-settle"

export type { Deps } from "./queue-shared"

// The merge queue (docs/specs/maestro-lead/merge-queue.md sections 6.1 to 6.6, phase 1). Only the host moves a card
// into or out of the `queue` stage: `board_queue` enqueues a verified Review card, and the tick cuts one bundle per
// project, waits for its full gate, and pushes base to the tested head. A red bundle is halved until one card fails
// alone and is ejected into a new attempt; infrastructure failures rerun once and then pause the queue; the size follows
// the red rate; the failed jobs' logs give the failing files; a red whose failing files are bun tests in package groups runs them scoped on base and on the bundle head (base
// red, code red, or flaky); Maestro merges or retries a flaky bundle, and retries a paused one, with `board_bundle`.
// Projects settle concurrently, and a project still settling is skipped, never run twice. With `lanes` in the contract
// (section 7, phase 2) a project cuts one bundle per lane of disjoint affected packages and runs them side by side.

export function make(deps: Deps) {
  const git = gitRunner(deps.proc, deps.env)
  const record = makeRecord({ deps, git })
  const red = makeRed({ deps, git, note: record.note })
  const settlement = makeSettle({
    deps,
    git,
    head: record.head,
    moved: record.moved,
    note: record.note,
    describe: record.describe,
    failures: red.failures,
    baseState: red.baseState,
    scope: red.scope,
    tryOn: red.tryOn,
    isolate: red.isolate,
    bisect: red.bisect,
    fixCard: red.fixCard,
    probe: red.probe,
    flaky: red.flaky,
  })
  const head = record.head
  const moved = record.moved
  const note = record.note
  const describe = record.describe
  const recordBundle = record.recordBundle
  const recordOf = record.recordOf
  const settle = settlement.settle
  const dissolve = settlement.dissolve
  const close = settlement.close
  const probe = red.probe

  const enqueue = Effect.fnUntraced(function* (input: Board.QueueInput) {
    const ref = `${input.project}-${input.number}`
    const found = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const project = yield* loadProject(tx, input.project)
        const issue = yield* loadIssue(tx, project, input.number)
        const attempt = yield* tx
          .select()
          .from(BoardAttemptTable)
          .where(and(eq(BoardAttemptTable.issue_id, issue.id), isNull(BoardAttemptTable.outcome)))
          .orderBy(desc(BoardAttemptTable.n))
          .get()
        const waits = yield* tx
          .select({ number: BoardIssueTable.number, stage: BoardIssueTable.stage })
          .from(BoardDependencyTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardDependencyTable.depends_on_id))
          .where(eq(BoardDependencyTable.issue_id, issue.id))
          .all()
        return { project, issue, attempt, waits, directory: yield* worktree(tx, project) }
      }).pipe(Effect.result),
    )
    if (found._tag === "Failure") return yield* found.failure
    const { project, issue } = found.success
~~~~

```json
{"first_line":118,"last_line":133,"bytes":905,"sha256":"1f8878c72640c0d6db02b8498a85f82862444614cbadb54d33f1fa858ec595f5"}
```

~~~~typescript
        tx.select({ number: BoardIssueTable.number }).from(BoardIssueTable).where(eq(BoardIssueTable.project_id, project.id)).all(),
      )
      const unknown = follow.filter((key) => !known.some((row) => key === `${input.project}-${row.number}`))
      if (unknown.length > 0)
        return yield* new RefusedError({ message: `${ref}'s follow-ups ${unknown.join(", ")} are not cards on ${input.project}.` })
    }
    const directory = found.success.directory
    const contract = yield* deps.contract(directory, project).pipe(Effect.mapError((error) => new RefusedError({ message: error.message })))
    const pr = yield* head(directory, project.github_repo, issue.pr_number)
    const checks = yield* deps.quiet((tx) =>
      tx
        .select()
        .from(BoardCheckTable)
        .where(and(eq(BoardCheckTable.issue_id, issue.id), eq(BoardCheckTable.tree_sha, pr.tree)))
        .all(),
    )
~~~~

```json
{"first_line":151,"last_line":270,"bytes":6306,"sha256":"793e9f3a251b111f40ae63e1be6e93c9b38197223ccac12a285962385f450767"}
```

~~~~typescript
        const moved = yield* place(tx, project, current, "queue")
        const activity = yield* log(tx, {
          project: project.id,
          issue: issue.id,
          actor: "maestro",
          action: "queue.add",
          reason: input.reason,
          before: moved.before,
          after: { ...moved.after, head: pr.sha, urgent: input.urgent ?? false },
        })
        return changed(project.id, activity, issue.id)
      }).pipe(Effect.result),
    )
    if (done._tag === "Failure") return yield* done.failure
    yield* deps.publish(done.success)
    yield* drift(deps, project, issue, directory, contract.base, pr.sha)
    yield* describe(project, issue.id, contract.base)
    return { head: pr.sha, tree: pr.tree, state }
  })

  const dequeue = Effect.fnUntraced(function* (input: Board.DequeueInput) {
    const ref = `${input.project}-${input.number}`
    const done = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const project = yield* loadProject(tx, input.project)
        const issue = yield* loadIssue(tx, project, input.number)
        if (issue.stage !== "queue") return yield* new RefusedError({ message: `${ref} is not queued.` })
        const open = yield* openBundles(tx, project.id)
        const members = yield* Effect.forEach(open, (bundle) => isMember(tx, bundle.id, issue.id))
        const back = yield* release(tx, project, issue, "maestro", "queue.remove", input.reason)
        return { project, back, bundle: open.find((_, index) => members[index]) }
      }).pipe(Effect.result),
    )
    if (done._tag === "Failure") return yield* done.failure
    yield* deps.publish(done.success.back)
    if (done.success.bundle) yield* dissolve(done.success.project, done.success.bundle, `${ref} left the queue.`)
    return { dissolved: done.success.bundle?.n ?? null }
  })

  /** Section 6.4: Maestro's verdict on a flaky or paused bundle. */
  const decide = Effect.fnUntraced(function* (input: Board.BundleInput) {
    const ref = `${input.project}-B${input.bundle}`
    const done = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const project = yield* loadProject(tx, input.project)
        const bundle = yield* tx
          .select()
          .from(BoardBundleTable)
          .where(and(eq(BoardBundleTable.project_id, project.id), eq(BoardBundleTable.n, input.bundle)))
          .get()
        if (!bundle) return yield* new RefusedError({ message: `${ref} is not a bundle.` })
        const members = yield* tx
          .select({ issue: BoardIssueTable })
          .from(BoardBundleMemberTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardBundleMemberTable.issue_id))
          .where(eq(BoardBundleMemberTable.bundle_id, bundle.id))
          .orderBy(asc(BoardBundleMemberTable.position))
          .all()
        return { project, bundle, issues: members.map((member) => member.issue) }
      }).pipe(Effect.result),
    )
    if (done._tag === "Failure") return yield* done.failure
    const bundle = done.success.bundle
    const issues = done.success.issues
    if (input.verdict === "merge") {
      if (bundle.status !== "flaky") return yield* new RefusedError({ message: `${ref} is ${bundle.status}; only a flaky bundle merges.` })
      yield* deps.quiet((tx) => tx.update(BoardBundleTable).set({ status: "accepted" }).where(eq(BoardBundleTable.id, bundle.id)).run())
      yield* Effect.forEach(
        issues,
        (issue) => note(done.success.project, issue, `Maestro accepted flaky bundle ${ref}: ${input.reason}. It merges as tested on the next tick.`),
        { discard: true },
      )
      yield* Effect.logInfo(`integration: ${ref} ${input.verdict} by Maestro: ${input.reason}`)
      return { status: "accepted" as const }
    }
    if (input.verdict === "release") {
      if (bundle.status !== "dissolved" || input.card === undefined)
        return yield* new RefusedError({ message: `${ref} is ${bundle.status}; release names a held card of a dissolved bundle.` })
      const issue = issues.find((item) => item.number === input.card)
      const held = issue
        ? yield* deps.quiet((tx) =>
            tx
              .select()
              .from(BoardQueueTable)
              .where(and(eq(BoardQueueTable.issue_id, issue.id), eq(BoardQueueTable.hold, "held")))
              .get(),
          )
        : undefined
      if (!issue || !held) return yield* new RefusedError({ message: `${input.project}-${input.card} is not held in ${ref}.` })
      yield* deps.quiet((tx) => tx.update(BoardQueueTable).set({ hold: "alone", flush: true }).where(eq(BoardQueueTable.issue_id, issue.id)).run())
      yield* note(done.success.project, issue, `Maestro released this card from ${ref}: ${input.reason}. It rides a bundle alone next.`)
      yield* Effect.logInfo(`integration: ${ref} ${input.verdict} by Maestro: ${input.reason}`)
      return { status: "released" as const }
    }
    if (bundle.status !== "flaky" && bundle.status !== "paused")
      return yield* new RefusedError({ message: `${ref} is ${bundle.status}; only a flaky or paused bundle retries.` })
    yield* deps.quiet((tx) =>
      tx
        .update(BoardQueueTable)
        .set({ flush: true })
        .where(inArray(BoardQueueTable.issue_id, issues.map((issue) => issue.id)))
        .run(),
    )
    yield* Effect.forEach(
      issues,
      (issue) => note(done.success.project, issue, `Maestro retried bundle ${ref}: ${input.reason}. The queue cuts its cards into a new bundle.`),
      { discard: true },
    )
    if (bundle.status === "paused") {
      yield* deps.quiet((tx) => tx.update(BoardBundleTable).set({ status: "infra" }).where(eq(BoardBundleTable.id, bundle.id)).run())
      yield* Effect.logInfo(`integration: ${ref} ${input.verdict} by Maestro: ${input.reason}`)
      return { status: "infra" as const }
    }
    const repo = done.success.project.github_repo
    if (repo) yield* close(done.success.project, repo, bundle, `retried by Maestro: ${input.reason}`)
    if (!repo) yield* deps.quiet((tx) => tx.update(BoardBundleTable).set({ status: "dissolved" }).where(eq(BoardBundleTable.id, bundle.id)).run())
    yield* Effect.logInfo(`integration: ${ref} ${input.verdict} by Maestro: ${input.reason}`)
    return { status: "dissolved" as const }
  })

~~~~

```json
{"first_line":288,"last_line":314,"bytes":1492,"sha256":"85231454643923706058118ea96de27012207c654b7aa2cd11838499f50a774f"}
```

~~~~typescript

  const project = Effect.fnUntraced(function* (row: ProjectRow) {
    const directory = yield* deps.quiet((tx) => worktree(tx, row))
    if (!directory || !row.github_repo) return
    const repo = row.github_repo
    const contract = yield* deps.contract(directory, row)
    const open = yield* deps.quiet((tx) => openBundles(tx, row.id))
    yield* Effect.forEach(open, (bundle) => settle(row, repo, directory, contract, bundle), { discard: true })
    if (contract.lanes) return yield* spread(row, repo, directory, contract, contract.lanes)
    if (open.length > 0) return
    yield* cut(row, repo, directory, contract)
  })

  /**
   * Section 7.2: the queued cards that may go, grouped into lanes, each cut into its own bundle beside the bundles in
   * flight. Affected sets are recomputed against the current tip at every cut. A repository with no workspace graph,
   * a paused or flaky bundle, and a red base with no failing tests keep the whole project on phase 1's single conveyor.
   * Section 7.3: a closed epic is cut as one global lane, so the epic bundle runs the whole suite; every `fullEvery`
   * lane landings a safety run tests the whole suite on base; and a base red with failing tests F pauses only the lanes
   * that touch F's packages while its fix card rides alone.
   */
  const spread = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    directory: string,
    contract: BoardCi.Contract,
    config: NonNullable<BoardCi.Contract["lanes"]>,
~~~~

```json
{"first_line":336,"last_line":583,"bytes":13706,"sha256":"810c2f247788e5d993b88327091ec3af78bba6677aad1f7f79e683b37a88cc11"}
```

~~~~typescript
          .from(BoardBundleTable)
          .where(and(eq(BoardBundleTable.project_id, row.id), notInArray(BoardBundleTable.status, ["open", "accepted", "probe-green"])))
          .orderBy(desc(BoardBundleTable.n))
          .get()
        const cards = yield* tx
          .select({ queue: BoardQueueTable, issue: BoardIssueTable })
          .from(BoardQueueTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardQueueTable.issue_id))
          .where(eq(BoardQueueTable.project_id, row.id))
          .all()
        const ids = cards.map((card) => card.issue.id)
        const waits = ids.length
          ? yield* tx
              .select({ issue: BoardDependencyTable.issue_id, stage: BoardIssueTable.stage })
              .from(BoardDependencyTable)
              .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardDependencyTable.depends_on_id))
              .where(inArray(BoardDependencyTable.issue_id, ids))
              .all()
          : []
        const attempts = ids.length
          ? yield* tx
              .select()
              .from(BoardAttemptTable)
              .where(and(inArray(BoardAttemptTable.issue_id, ids), isNull(BoardAttemptTable.outcome)))
              .all()
          : []
        const epics = [...new Set(cards.map((card) => card.issue.epic_id).filter((id) => id !== null))]
        const epicOpen = epics.length
          ? yield* tx
              .select({ epic: BoardIssueTable.epic_id, stage: BoardIssueTable.stage })
              .from(BoardIssueTable)
              .where(and(inArray(BoardIssueTable.epic_id, epics), notInArray(BoardIssueTable.stage, ["shipped", "cut"])))
              .all()
          : []
        // The base red still open: the latest bundle whose fix card has neither shipped nor been cut.
        const active = yield* tx
          .select({ failing: BoardBundleTable.failing, fix_issue_id: BoardBundleTable.fix_issue_id })
          .from(BoardBundleTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardBundleTable.fix_issue_id))
          .where(and(eq(BoardBundleTable.project_id, row.id), isNotNull(BoardBundleTable.failing), notInArray(BoardIssueTable.stage, ["shipped", "cut"])))
          .orderBy(desc(BoardBundleTable.n))
          .get()
        // Landings are counted from the bundle rows: a bundle with no first member is a base probe or a safety run.
        const history =
          config.fullEvery > 0
            ? yield* tx
                .select({ status: BoardBundleTable.status, packages: BoardBundleTable.packages, member: BoardBundleMemberTable.issue_id })
                .from(BoardBundleTable)
                .leftJoin(
                  BoardBundleMemberTable,
                  and(eq(BoardBundleMemberTable.bundle_id, BoardBundleTable.id), eq(BoardBundleMemberTable.position, 0)),
                )
                .where(eq(BoardBundleTable.project_id, row.id))
                .orderBy(desc(BoardBundleTable.n))
                .all()
            : []
        return {
          open,
          stopped: stopped !== undefined,
          baseRed: closed?.status === "base-red" && closed.base_sha === tip && !closed.failing,
          cards: cards.filter((card) => !members.some((member) => member.issue === card.issue.id)),
          waits,
          attempts,
          epicOpen,
          red: active?.failing && active.fix_issue_id ? { failing: active.failing, fix_issue_id: active.fix_issue_id } : undefined,
          history,
        }
      }),
    )
    if (found.stopped) return
    const graph = (yield* git(directory, ["cat-file", "-e", `${tip}:turbo.json`])).code === 0
    if (!graph || found.baseRed) {
      if (found.open.length > 0) return
      return yield* cut(row, repo, directory, contract)
    }
    const cards = yield* Effect.forEach(found.cards, (card) =>
      Effect.gen(function* () {
        const bundleable =
          card.queue.hold !== "held" &&
          !card.issue.hold_before_merge &&
          !card.issue.paused &&
          !found.attempts.some((item) => item.issue_id === card.issue.id && item.conflict_base) &&
          found.waits.filter((dep) => dep.issue === card.issue.id).every((dep) => dep.stage === "shipped")
        const shape = { id: card.issue.id, bundleable, urgent: card.queue.urgent, order: card.issue.order, queuedAt: card.queue.queued_at }
        if (!bundleable) return { ...shape, affected: [] }
        // Section 6.1 rule c: the bundle that closes an epic runs the whole suite, whatever its cards touch.
        const closing = card.issue.epic_id !== null && found.epicOpen.filter((item) => item.epic === card.issue.epic_id).every((item) => item.stage === "queue")
        if (closing) return { ...shape, affected: null }
        // The queued head is fetched only when this clone lacks it; a head that moved goes back to Review, as in `cut`.
        const present = (yield* git(directory, ["cat-file", "-e", `${card.queue.head_sha}^{commit}`])).code === 0
        const current = present ? undefined : yield* head(directory, repo, card.issue.pr_number ?? 0).pipe(Effect.orElseSucceed(() => undefined))
        if (!present && current?.sha !== card.queue.head_sha) {
          yield* moved(row, card.issue, current?.sha)
          return undefined
        }
        const files = (yield* git(directory, ["diff", "--name-only", `${tip}...${card.queue.head_sha}`])).out.split("\n").filter(Boolean)
        if (global(files, config.global)) return { ...shape, affected: null }
        return { ...shape, affected: (yield* affected(deps, directory, tip, card.queue.head_sha)) ?? null }
      }),
    )
    // Section 7.3: the whole suite runs on base after every `fullEvery` lane landings since it last ran (0 is off).
    const since = found.history.findIndex((bundle) =>
      bundle.member === null ? bundle.status !== "open" && bundle.status !== "dissolved" : bundle.status === "merged" && bundle.packages === null,
    )
    const landings = found.history
      .slice(0, since === -1 ? undefined : since)
      .filter((bundle) => bundle.member !== null && bundle.status === "merged" && bundle.packages !== null).length
    const safety = config.fullEvery > 0 && landings >= config.fullEvery && !found.history.some((bundle) => bundle.member === null && bundle.status === "open")
    if (safety)
      yield* probe(
        row,
        repo,
        directory,
        contract,
        tip,
        `Safety run: ${landings} lane bundles landed since ${contract.base} last ran the whole suite; this runs it on ${contract.base} at ${tip.slice(0, 10)}.`,
        [],
      )
    const shaped = cards.filter((card) => card !== undefined)
    const broken = found.red
    // The fix card rides alone in its own lane; F's packages count as in flight, so overlapping lanes wait behind it.
    const fix = broken ? shaped.find((card) => card.id === broken.fix_issue_id && card.bundleable) : undefined
    const room = capacity(contract.budget.jobs, config.jobs) - found.open.length - (safety ? 1 : 0) - (fix ? 1 : 0)
    if (fix) yield* cut(row, repo, directory, contract, { ids: [fix.id], packages: fix.affected }, broken)
    const going = lanes(
      shaped.filter((card) => card.id !== broken?.fix_issue_id),
      [...found.open.map((bundle) => bundle.packages), ...(broken ? [broken.failing.map((group) => group.package)] : [])],
      room,
    )
    yield* Effect.forEach(going, (lane) => cut(row, repo, directory, contract, lane), { discard: true })
  })

  /**
   * Phase 1's cut (section 6.1); with a lane, only that lane's cards, in the lane's order, and its own last bundle. With
   * `broken`, the lane is the fix card of that base red, cut now and judged only on its failing tests.
   */
  const cut = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    directory: string,
    contract: BoardCi.Contract,
    lane?: Lane<Board.IssueID>,
    broken?: Pick<typeof BoardBundleTable.$inferSelect, "failing" | "fix_issue_id">,
  ) {
    const now = yield* Clock.currentTimeMillis
    const queued = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const all = yield* tx
          .select({ queue: BoardQueueTable, issue: BoardIssueTable })
          .from(BoardQueueTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardQueueTable.issue_id))
          .where(eq(BoardQueueTable.project_id, row.id))
          .orderBy(desc(BoardQueueTable.urgent), asc(BoardQueueTable.queued_at))
          .all()
        const cards = lane
          ? lane.ids.flatMap((id) => all.filter((card) => card.issue.id === id))
          : all
        const ids = cards.map((card) => card.issue.id)
        const waits = ids.length
          ? yield* tx
              .select({ issue: BoardDependencyTable.issue_id, on: BoardDependencyTable.depends_on_id, stage: BoardIssueTable.stage })
              .from(BoardDependencyTable)
              .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardDependencyTable.depends_on_id))
              .where(inArray(BoardDependencyTable.issue_id, ids))
              .all()
          : []
        const attempts = ids.length
          ? yield* tx
              .select()
              .from(BoardAttemptTable)
              .where(and(inArray(BoardAttemptTable.issue_id, ids), isNull(BoardAttemptTable.outcome)))
              .all()
          : []
        const epics = [...new Set(cards.map((card) => card.issue.epic_id).filter((id) => id !== null))]
        const open = epics.length
          ? yield* tx
              .select({ epic: BoardIssueTable.epic_id, stage: BoardIssueTable.stage })
              .from(BoardIssueTable)
              .where(and(inArray(BoardIssueTable.epic_id, epics), ne(BoardIssueTable.stage, "shipped"), ne(BoardIssueTable.stage, "cut")))
              .all()
          : []
        // A green base probe only clears base: the red bundle it was probing for still decides the next cut. A lane's last
        // bundles are the closed ones that share a card with it, so a red in one lane splits only that lane.
        const closed = lane
          ? (yield* tx
              .select({ bundle: BoardBundleTable })
              .from(BoardBundleTable)
              .innerJoin(BoardBundleMemberTable, eq(BoardBundleMemberTable.bundle_id, BoardBundleTable.id))
              .where(
                and(
                  eq(BoardBundleTable.project_id, row.id),
                  notInArray(BoardBundleTable.status, ["open", "accepted"]),
                  inArray(BoardBundleMemberTable.issue_id, lane.ids),
                ),
              )
              .orderBy(desc(BoardBundleTable.n))
              .all())
              .map((item) => item.bundle)
              .filter((bundle, index, list) => list.findIndex((other) => other.id === bundle.id) === index)
              .slice(0, 2)
          : yield* tx
              .select()
              .from(BoardBundleTable)
              .where(and(eq(BoardBundleTable.project_id, row.id), ne(BoardBundleTable.status, "open")))
              .orderBy(desc(BoardBundleTable.n))
              .limit(2)
              .all()
        const last = closed[0]?.status === "probe-green" ? closed[1] : closed[0]
        const lastMembers = last
          ? yield* tx.select().from(BoardBundleMemberTable).where(eq(BoardBundleMemberTable.bundle_id, last.id)).all()
          : []
        return { cards, waits, attempts, open, settled: yield* BoardLedger.settled(tx, row.id), last: last && { status: last.status, base_sha: last.base_sha, members: lastMembers.length, rebuilds: last.rebuilds, fix: last.fix_issue_id, failing: last.failing } }
      }),
    )
    if (queued.cards.length === 0) return
    if (queued.last?.status === "paused" || queued.last?.status === "flaky") return
    const full = size(queued.settled, contract.bundle)
    const alone = queued.cards.find((card) => card.queue.hold === "alone")
    const split = (queued.last?.status === "red" && queued.last.members > 1) || queued.last?.status === "probing"
    const cap = alone ? 1 : split && queued.last ? Math.max(1, Math.floor(queued.last.members / 2)) : full
    const due =
      alone !== undefined ||
      broken !== undefined ||
      queued.last?.status === "base-red" ||
      split ||
      queued.cards.length >= full ||
      queued.cards.some((card) => card.queue.flush) ||
      now - Math.min(...queued.cards.map((card) => card.queue.queued_at)) >= contract.bundle.waitMinutes * 60_000 ||
      queued.cards.some(
        (card) => card.issue.epic_id !== null && queued.open.filter((item) => item.epic === card.issue.epic_id).every((item) => item.stage === "queue"),
      )
    if (!due) return
    const base = contract.base
    yield* git(directory, ["fetch", "--quiet", "--no-tags", "origin", base])
    const tip = (yield* git(directory, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${base}`])).out
    if (!tip) return
    // Section 6.8 phase 1: while base stays red, only its fix card is cut, alone. With lanes, `spread` hands the fix card in.
    const fixing = lane
      ? broken
      : queued.last?.status === "base-red" && tip === queued.last.base_sha
        ? { failing: queued.last.failing, fix_issue_id: queued.last.fix }
        : undefined
    const fix = fixing ? queued.cards.find((card) => card.issue.id === fixing.fix_issue_id) : undefined
    if (fixing && !fix) return
    const scratch = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), `orchestra-bundle-${row.key}-`)))
    const added = yield* git(directory, ["worktree", "add", "--quiet", "--detach", scratch, tip])
    if (added.code !== 0) return
    const ejections: Array<{ readonly card: string; readonly cause: string }> = []
~~~~

```json
{"first_line":596,"last_line":733,"bytes":6456,"sha256":"09a421bc0f63aabc886bb80890d6e98c19965aac252c8899843198d54229d32a"}
```

~~~~typescript
        const current = yield* head(directory, repo, card.issue.pr_number ?? 0).pipe(Effect.orElseSucceed(() => undefined))
        const key = `${row.key}-${card.issue.number}`
        if (current?.sha !== card.queue.head_sha) {
          yield* moved(row, card.issue, current?.sha)
          ejections.push({ card: key, cause: "head moved after it queued" })
          continue
        }
        const message = [
          `Merge ${key}: ${card.issue.title}`,
          ...(deps.record ? ["", deps.record.trailer({ WP: key, Attempt: `a${attempt?.n ?? 0}` })] : []),
        ].join("\n")
        const merged = yield* git(scratch, [...AUTHOR, "merge", "--no-ff", "--quiet", "-m", message, card.queue.head_sha])
        if (merged.code === 0) {
          taken.push({ issue: card.issue, head: card.queue.head_sha, labels: current.labels })
          continue
        }
        const files = (yield* git(scratch, ["diff", "--name-only", "--diff-filter=U"])).out.split("\n").filter(Boolean)
        yield* git(scratch, ["merge", "--abort"])
        ejections.push({ card: key, cause: "conflicts with the bundle" })
        yield* note(row, card.issue, `conflicts-with-queue: merging onto the bundle so far conflicts in ${files.join(", ") || "its changes"}; it stays queued.`)
      }
      return taken
    })
    const n = yield* deps.quiet((tx) => nextBundle(tx, row.id))
    if (members.length > 0) yield* recordBundle(row, scratch, members.map((member) => member.issue), `${row.key}-B${n}`)
    const bundleHead = (yield* git(scratch, ["rev-parse", "HEAD"])).out
    const tree = (yield* git(scratch, ["rev-parse", "HEAD^{tree}"])).out
    yield* git(directory, ["worktree", "remove", "--force", scratch])
    if (members.length === 0) return
    const branch = `bundle-${row.key}-${n}`
    const lanePackages = lane?.packages && dispatched({ packages: lane.packages }, contract) ? lane.packages : null
    const pushed = yield* git(directory, ["push", "--quiet", "--force", "origin", `${bundleHead}:refs/heads/${branch}`])
    if (pushed.code !== 0) return
    const records = deps.record
      ? (yield* Effect.forEach(members, (member) => recordOf(row, member.issue.id, base))).filter((item) => item !== undefined)
      : []
    const body = deps.record
      ? deps.record.bundle({ members: records, testedOn: tip, skew: 0, ciRuns: 0, ciMinutes: 0, ejections })
      : `Bundle ${row.key}-B${n}, assembled by Orchestra's merge queue: ${members.map((member) => `${row.key}-${member.issue.number}`).join(", ")}.`
    const opened = yield* deps.gh(
      [
        "pr",
        "create",
        "--repo",
        repo,
        "--base",
        base,
        "--head",
        branch,
        "--title",
        `chore(queue): bundle ${row.key}-B${n}`,
        "--body-file",
        "-",
        ...(contract.full.label && !lanePackages ? ["--label", contract.full.label] : []),
        // A guard approval a member carries covers its change in the bundle too; the bundle PR is what the guard reads.
        ...[...new Set(members.flatMap((member) => member.labels))]
          .filter((label) => label === "guardrail-approved" || label.startsWith("guardrail-approved:"))
          .flatMap((label) => ["--label", label]),
      ],
      body,
    )
    const number = Number(opened.stdout.match(/\/pull\/(\d+)/)?.[1] ?? 0) || null
    // Section 7.2: a lane's full gate runs only its packages, dispatched by hand: a label would start the whole suite.
    if (lanePackages)
      yield* Effect.forEach(
        contract.lanes?.workflows ?? [],
        (workflow) => deps.gh(["workflow", "run", workflow, "--repo", repo, "--ref", branch, "-f", `packages=${lanePackages.join(",")}`]),
        { discard: true },
      )
    const published = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const id = Board.BundleID.create()
        yield* tx
          .insert(BoardBundleTable)
          .values({
            id,
            project_id: row.id,
            n,
            branch,
            pr_number: number,
            base_sha: tip,
            head_sha: bundleHead,
            tree_sha: tree,
            status: "open",
            rebuilds: queued.last?.status === "isolated" ? queued.last.rebuilds + 1 : 0,
            failing: fix ? fixing?.failing ?? null : null,
            fix_issue_id: fix ? fix.issue.id : null,
            packages: lane?.packages ?? null,
          })
          .run()
        yield* tx
          .insert(BoardBundleMemberTable)
          .values(members.map((member, position) => ({ bundle_id: id, issue_id: member.issue.id, head_sha: member.head, position })))
          .run()
        yield* tx
          .update(BoardQueueTable)
          .set({ flush: false, hold: null })
          .where(inArray(BoardQueueTable.issue_id, members.map((member) => member.issue.id)))
          .run()
        return yield* Effect.forEach(members, (member) =>
          log(tx, {
            project: row.id,
            issue: member.issue.id,
            actor: "github",
            action: "bundle.cut",
            after: { bundle: n, pr: number, base: tip, head: bundleHead },
          }).pipe(Effect.map((activity) => changed(row.id, activity, member.issue.id))),
        )
      }),
    )
    yield* Effect.forEach(published, deps.publish, { discard: true })
    yield* Effect.forEach(members, (member) => describe(row, member.issue.id, base), { discard: true })
  })

  return { enqueue, dequeue, decide, tick }
}

export type Interface = ReturnType<typeof make>

/** The record fields section 4.5 requires before a card queues. */
export function incomplete(record: Board.PrRecord | null) {
  const blank = (text: string | undefined) => !text?.trim()
  return [
    ...(blank(record?.intent) ? ["Intent"] : []),
    ...(blank(record?.decisions) ? ["Decisions"] : []),
    ...(blank(record?.not_covered) ? ["Not covered"] : []),
    ...(record?.risk?.level ? [] : ["Risk level"]),
  ]
}

/** Section 6.3: once 50 bundled cards have settled, the size is the largest n with (1 - p)^n >= 0.75, p the share ejected. */
export function size(outcomes: ReadonlyArray<string | null>, bundle: BoardCi.Contract["bundle"]) {
  if (outcomes.length < 50) return bundle.size
  const p = outcomes.filter((outcome) => outcome === "ejected").length / outcomes.length
  if (p === 0) return bundle.max
  if (p >= 1) return 1
  return Math.min(bundle.max, Math.max(1, Math.floor(Math.log(0.75) / Math.log(1 - p))))
}
~~~~

## AUT3-C16

```json
{
  "block_id": "AUT3-C16",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-04"
  ],
  "body_anchors": [
    "B08"
  ],
  "requested_subject": "Overlap/unknown-global/predecessors/order/capacity",
  "path": "packages/core/src/board/queue-lanes.ts",
  "archive": "sources/packages/core/src/board/queue-lanes.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "f9d68042af8b19bf79e155818f940dbf5c828d08",
  "source_sha256": "62429a1b7a77a627622ce5a9e7dd4d74c9b04b51cb1856058f6a124cb5c2cdb1",
  "source_bytes": 4203,
  "required_source_line_ranges": [
    [
      1,
      85
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B08",
      "source_path": "packages/core/src/board/queue-lanes.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "f9d68042af8b19bf79e155818f940dbf5c828d08",
      "source_sha256": "62429a1b7a77a627622ce5a9e7dd4d74c9b04b51cb1856058f6a124cb5c2cdb1",
      "first_line": 25,
      "last_line": 44,
      "excerpt_bytes": 1100,
      "excerpt_sha256": "106031dd7943d1c74f1f7676c704380673a9cdedd378d8f251b443c89a1e2164",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 139650,
      "literal_content_byte_end_exclusive": 140750
    }
  ]
}
```

```json
{"first_line":1,"last_line":24,"bytes":1272,"sha256":"373d9baf6e6f7a03ff87f025610862cd74f26f7bf8ea789941e59a480ee774f3"}
```

~~~~typescript
// Section 7.2 of docs/specs/maestro-lead/merge-queue.md: which queued cards may be cut, and into which lanes. Lanes
// are not stored; they are recomputed at every cut from each card's affected set. Pure: no database, git or turbo.

/** A card's affected set: package names, or null for a card with a global path, which overlaps everything. */
export type Affected = ReadonlyArray<string> | null

export type Card<Id> = {
  readonly id: Id
  readonly affected: Affected
  /** False for a card on hold, `held`, conflicting or waiting on an unshipped dependency: it neither goes nor blocks. */
  readonly bundleable: boolean
  readonly urgent: boolean
  readonly order: number | null
  readonly queuedAt: number
}

export type Lane<Id> = { readonly ids: ReadonlyArray<Id>; readonly packages: Affected }

/**
 * The lanes to cut now, earliest first. Rule 1: a card goes only when it overlaps no bundle in flight. Rule 2: it never
 * goes ahead of an earlier bundleable card that overlaps it and waits. A global card goes only alone or with other
 * global cards, so once the bundles in flight land it runs the whole suite; every card behind it waits. The cards that
 * go are grouped into connected components of overlapping sets, and at most `room` lanes are returned.
 */
~~~~

```json
{"first_line":45,"last_line":85,"bytes":1831,"sha256":"5ad0ffcac1885ae9e40f22aec0f39d20841f4beb545ea0c0c85d981f38b223de"}
```

~~~~typescript
      (groups, card) => {
        const joined = groups.filter((group) => group.some((member) => linked(member.affected, card.affected)))
        return [...groups.filter((group) => !joined.includes(group)), [...joined.flat(), card]]
      },
      [] as Array<Array<Card<Id>>>,
    )
    .toSorted((a, b) => first(a) - first(b))
    .slice(0, Math.max(0, room))
    .map(
      (group): Lane<Id> => ({
        ids: group.toSorted((a, b) => sorted.indexOf(a) - sorted.indexOf(b)).map((card) => card.id),
        packages: group.some((card) => card.affected === null)
          ? null
          : [...new Set(group.flatMap((card) => card.affected ?? []))].toSorted(),
      }),
    )
}

/** Earlier means urgent first, then `order` when both cards have one, then time queued (spec section 4.4). */
export function earlier<Id>(a: Card<Id>, b: Card<Id>) {
  if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
  if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order
  return a.queuedAt - b.queuedAt
}

export function overlaps(a: Affected, b: Affected) {
  if (a === null || b === null) return true
  return a.some((name) => b.includes(name))
}

/** Whether a diff touches a global path: a changed file that matches one of the contract's `lanes.global` globs. */
export function global(files: ReadonlyArray<string>, globs: ReadonlyArray<string>) {
  const patterns = globs.map((glob) => new Bun.Glob(glob))
  return files.some((file) => patterns.some((pattern) => pattern.match(file)))
}

/** Section 7.5: at most floor(budget.jobs / J) lanes in flight, J the jobs one lane gate uses; uncapped when either is unknown. */
export function capacity(budget: number | null, jobs: number | null) {
  if (budget === null || jobs === null) return Infinity
  return Math.max(1, Math.floor(budget / jobs))
}
~~~~

## AUT3-C17

```json
{
  "block_id": "AUT3-C17",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-04",
    "RE-AUT3-05"
  ],
  "body_anchors": [
    "B08",
    "B09"
  ],
  "requested_subject": "Judge/rollup, affected integrated tree/turbo, open bundles, dispatch newest-run correlation e holds",
  "path": "packages/core/src/board/queue-shared.ts",
  "archive": "sources/packages/core/src/board/queue-shared.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "108a40f374649e7498dad8f1d0033d3c8a984d41",
  "source_sha256": "8382123484f1557dbff529a7c291d1aadf4b6ee435357a8a9e27db91e7d04cea",
  "source_bytes": 11579,
  "required_source_line_ranges": [
    [
      1,
      216
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B08",
      "source_path": "packages/core/src/board/queue-shared.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "108a40f374649e7498dad8f1d0033d3c8a984d41",
      "source_sha256": "8382123484f1557dbff529a7c291d1aadf4b6ee435357a8a9e27db91e7d04cea",
      "first_line": 54,
      "last_line": 74,
      "excerpt_bytes": 1293,
      "excerpt_sha256": "30c1633439fa3aba20fb03a1b87f4e80890eb8eaca8984974a25dbac7d5eb354",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 141140,
      "literal_content_byte_end_exclusive": 142433
    }
  ]
}
```

```json
{"first_line":1,"last_line":53,"bytes":2736,"sha256":"5ca10a9dd00daa866a5bdb78b6493ea8b3c85e6aacd638df4b6ed21e492efb03"}
```

~~~~typescript
import fs from "fs/promises"
import os from "os"
import path from "path"
import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { Clock, Effect, Option, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Board } from "@orchestra/schema/board"
import type { AppProcess } from "../process"
import { which } from "../util/which"
import type { BoardCi } from "./ci"
import type { BoardGithub } from "./github"
import type { BoardRecord } from "./record"
import { BoardBundleMemberTable, BoardBundleTable, BoardIssueTable, BoardNoteTable, BoardQueueTable } from "./sql"
import { changed, endOf, gitRunner, log } from "./shared"
import type { Changed, IssueRow, ProjectRow, Tx } from "./shared"

export interface Deps {
  readonly quiet: <A>(work: (tx: Tx) => Effect.Effect<A, unknown>) => Effect.Effect<A>
  readonly proc: AppProcess.Interface
  readonly env?: NodeJS.ProcessEnv
  readonly gh: BoardGithub.Gh
  readonly contract: (directory: string, project: ProjectRow) => Effect.Effect<BoardCi.Contract, { readonly message: string }>
  readonly publish: (changed: Changed) => Effect.Effect<void>
  /** Atlas's record renderer and trailer writer; `Board.layer` binds it, tests may leave it unbound. */
  readonly record?: BoardRecord.Port
  /** Replaces `turbo`'s affected set; tests bind it so they need no installed workspace. */
  readonly affected?: (directory: string, from: string, to: string) => Effect.Effect<ReadonlyArray<string> | undefined>
}

/** What every queue module shares: the injected dependencies and the git runner built from them. */
export type Context = { readonly deps: Deps; readonly git: ReturnType<typeof gitRunner> }

export const Rollup = Schema.Struct({
  headRefOid: Schema.String,
  statusCheckRollup: Schema.Array(
    Schema.Struct({
      name: Schema.optional(Schema.String),
      context: Schema.optional(Schema.String),
      status: Schema.optional(Schema.String),
      conclusion: Schema.optional(Schema.NullOr(Schema.String)),
      state: Schema.optional(Schema.String),
      workflowName: Schema.optional(Schema.String),
      detailsUrl: Schema.optional(Schema.String),
    }),
  ),
})
export const decodeRollup = Schema.decodeUnknownOption(Schema.fromJsonString(Rollup))
export const decodeRuns = Schema.decodeUnknownOption(Schema.fromJsonString(Rollup.fields.statusCheckRollup))
export const FAILED = new Set(["FAILURE", "TIMED_OUT", "CANCELLED", "STARTUP_FAILURE", "ACTION_REQUIRED", "ERROR"])
export const PASSED = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"])
export const INFRA = new Set(["CANCELLED", "TIMED_OUT", "STARTUP_FAILURE"])
export const AUTHOR = ["-c", "user.name=Orchestra", "-c", "user.email=orchestra@users.noreply.github.com"]

~~~~

```json
{"first_line":75,"last_line":216,"bytes":7550,"sha256":"a54ba88e18a8f7d0090ff996a016d6906f393ac60c6e2f969d1097927b19e10b"}
```

~~~~typescript

const Dry = Schema.Struct({ packages: Schema.Array(Schema.String) })
const decodeDry = Schema.decodeUnknownOption(Schema.fromJsonString(Dry))

/**
 * Section 7.1's affected set from `turbo`: the packages a commit range touches and every package that depends on them.
 * Turbo reads the workspace graph from its working tree, so it runs in a detached checkout of `to` merged onto `from`,
 * the tree that lands: the project's own checkout may sit on any branch, and its stale package list once sent a lane
 * gate a package base no longer has. A range that does not merge cleanly has no affected set.
 */
export const affected = Effect.fnUntraced(function* (deps: Pick<Deps, "affected" | "proc" | "env">, directory: string, from: string, to: string) {
  if (deps.affected) return yield* deps.affected(directory, from, to)
  const bun = which("bun", deps.env ?? process.env)
  if (!bun) return undefined
  const git = gitRunner(deps.proc, deps.env)
  const merged = yield* git(directory, ["merge-tree", "--write-tree", from, to])
  if (merged.code !== 0) return undefined
  const landed = (yield* git(directory, [...AUTHOR, "commit-tree", merged.out.split("\n")[0] ?? "", "-p", from, "-p", to, "-m", "chore(queue): affected"])).out
  if (!landed) return undefined
  const checkout = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "orchestra-affected-")))
  const added = yield* git(directory, ["worktree", "add", "--quiet", "--detach", checkout, landed])
  const result = added.code !== 0 ? undefined : yield* deps.proc
    .run(
      ChildProcess.make(bun, ["x", "turbo", "run", "typecheck", `--filter=...[${from}...${landed}]`, "--dry=json"], {
        cwd: checkout,
        env: { ...deps.env, TURBO_TELEMETRY_DISABLED: "1" },
        extendEnv: true,
        stdin: "ignore",
      }),
      { maxOutputBytes: 8 * 1024 * 1024, maxErrorBytes: 16 * 1024, timeout: "120 seconds" },
    )
    .pipe(Effect.orElseSucceed(() => undefined))
  if (added.code === 0) yield* git(directory, ["worktree", "remove", "--force", checkout])
  yield* Effect.promise(() => fs.rm(checkout, { recursive: true, force: true }))
  if (!result || result.exitCode !== 0) return undefined
  return Option.getOrUndefined(decodeDry(result.stdout.toString("utf8")))?.packages
})

/** The project's bundles in flight, oldest first: one in phase 1, one per lane in phase 2. */
export const openBundles = Effect.fnUntraced(function* (tx: Tx, project: Board.ProjectID) {
  return yield* tx
    .select()
    .from(BoardBundleTable)
    .where(and(eq(BoardBundleTable.project_id, project), inArray(BoardBundleTable.status, ["open", "accepted"])))
    .orderBy(asc(BoardBundleTable.n))
    .all()
})

/** The next bundle number of the project; lanes cut several bundles, so it is never derived from one bundle. */
export const nextBundle = Effect.fnUntraced(function* (tx: Tx, project: Board.ProjectID) {
  const last = yield* tx
    .select({ n: BoardBundleTable.n })
    .from(BoardBundleTable)
    .where(eq(BoardBundleTable.project_id, project))
    .orderBy(desc(BoardBundleTable.n))
    .get()
  return (last?.n ?? 0) + 1
})

/** A lane bundle's gate dispatches the lane workflows with its packages instead of applying the full label. */
export function dispatched(bundle: { readonly packages: ReadonlyArray<string> | null }, contract: BoardCi.Contract) {
  return bundle.packages !== null && (contract.lanes?.workflows.length ?? 0) > 0
}

const Runs = Schema.Array(Schema.Struct({ databaseId: Schema.Number, workflowName: Schema.String, headSha: Schema.String, createdAt: Schema.String }))
const decodeDispatches = Schema.decodeUnknownOption(Schema.fromJsonString(Runs))
const Jobs = Schema.Struct({
  jobs: Schema.Array(Schema.Struct({ name: Schema.String, status: Schema.String, conclusion: Schema.NullOr(Schema.String), url: Schema.String })),
})
const decodeJobs = Schema.decodeUnknownOption(Schema.fromJsonString(Jobs))

/**
 * A lane bundle's checks in rollup shape. A workflow_dispatch run never shows in its PR's status rollup, so the jobs
 * come from the newest dispatched run of each workflow on the bundle head.
 */
export const dispatchRollup = Effect.fnUntraced(function* (deps: Deps, repo: string, branch: string, head: string) {
  const listed = yield* deps.gh([
    "run", "list", "--repo", repo, "--branch", branch, "--event", "workflow_dispatch",
    "--json", "databaseId,workflowName,headSha,createdAt", "--limit", "20",
  ])
  const runs = Option.getOrElse(decodeDispatches(listed.exitCode === 0 ? listed.stdout : ""), () => [])
    .filter((run) => run.headSha === head)
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const latest = runs.filter((run, index) => runs.findIndex((other) => other.workflowName === run.workflowName) === index)
  const jobs = yield* Effect.forEach(latest, (run) =>
    deps.gh(["run", "view", String(run.databaseId), "--repo", repo, "--json", "jobs"]).pipe(
      Effect.map((viewed) =>
        Option.getOrElse(decodeJobs(viewed.exitCode === 0 ? viewed.stdout : ""), () => ({ jobs: [] })).jobs.map((job) => ({
          name: job.name,
          workflowName: run.workflowName,
          status: job.status.toUpperCase(),
          conclusion: job.conclusion ? job.conclusion.toUpperCase() : null,
          detailsUrl: job.url,
        })),
      ),
    ),
  )
  return jobs.flat()
})

export const isMember = Effect.fnUntraced(function* (tx: Tx, bundle: Board.BundleID, issue: Board.IssueID) {
  const row = yield* tx
    .select({ issue: BoardBundleMemberTable.issue_id })
    .from(BoardBundleMemberTable)
    .where(and(eq(BoardBundleMemberTable.bundle_id, bundle), eq(BoardBundleMemberTable.issue_id, issue)))
    .get()
  return row !== undefined
})

/** Moves a card to the end of `stage`, the way `move` does, and returns what changed for the activity row. */
export const place = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, stage: Board.Stage) {
  const next = { stage, position: yield* endOf(tx, project.id, stage), stage_entered_at: yield* Clock.currentTimeMillis }
  yield* tx
    .update(BoardIssueTable)
    .set({ ...next, ...(project.github_repo !== null ? { github_dirty: true } : {}) })
    .where(eq(BoardIssueTable.id, issue.id))
    .run()
  return { before: { stage: issue.stage, position: issue.position, stage_entered_at: issue.stage_entered_at }, after: next }
})

/** Takes a card out of the queue and back to Review. */
export const release = Effect.fnUntraced(function* (
  tx: Tx,
  project: ProjectRow,
  issue: IssueRow,
  actor: Board.Actor,
  action: Board.Action,
  reason: string,
) {
  yield* tx.delete(BoardQueueTable).where(eq(BoardQueueTable.issue_id, issue.id)).run()
  const current = (yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, issue.id)).get()) ?? issue
  const moving = yield* place(tx, project, current, "review")
  const activity = yield* log(tx, { project: project.id, issue: issue.id, actor, action, reason, before: moving.before, after: moving.after })
  return changed(project.id, activity, issue.id)
})

export const insertNote = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, body: string) {
  const id = Board.NoteID.create()
  yield* tx.insert(BoardNoteTable).values({ id, issue_id: issue.id, author: "orchestra", body }).run()
  const activity = yield* log(tx, { project: project.id, issue: issue.id, actor: "github", action: "note.add", after: { id, author: "orchestra", body } })
  return changed(project.id, activity, issue.id)
})
~~~~

## AUT3-C18

```json
{
  "block_id": "AUT3-C18",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-04"
  ],
  "body_anchors": [
    "B08"
  ],
  "requested_subject": "Plan drift apenas registra desvio entre area e affected",
  "path": "packages/core/src/board/queue-drift.ts",
  "archive": "sources/packages/core/src/board/queue-drift.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "95761efe467c8f318cad7200ea7787fc15cdb10c",
  "source_sha256": "6c3ccc9eee3cc220ac01e8a0a92c6c1fe4fd06ddf03f9780e4f218d46aaf338c",
  "source_bytes": 1233,
  "required_source_line_ranges": [
    [
      1,
      21
    ]
  ],
  "prior_literal_ranges": []
}
```

```json
{"first_line":1,"last_line":21,"bytes":1233,"sha256":"6c3ccc9eee3cc220ac01e8a0a92c6c1fe4fd06ddf03f9780e4f218d46aaf338c"}
```

~~~~typescript
import { Effect } from "effect"
import type { IssueRow, ProjectRow } from "./shared"
import { affected, insertNote } from "./queue-shared"
import type { Deps } from "./queue-shared"

/**
 * Section 4.4's plan drift: a card whose real affected set left its planned `area` raises one `integration` line for
 * Maestro to send to `archie` as a plan revision. It never refuses: the card queues under its real set. Without an
 * `area`, or without `turbo`, there is nothing to compare and no line.
 */
export const drift = Effect.fnUntraced(function* (deps: Deps, project: ProjectRow, issue: IssueRow, directory: string, base: string, head: string) {
  if (!issue.area) return
  const real = yield* affected(deps, directory, `origin/${base}`, head)
  const extra = real?.filter((name) => !issue.area?.includes(name)) ?? []
  if (extra.length === 0) return
  const ref = `${project.key}-${issue.number}`
  const text = `${ref} left its planned area: it also affects ${extra.join(", ")}, which its plan did not list. Send it to archie as a plan revision; the card still queues.`
  const done = yield* deps.quiet((tx) => insertNote(tx, project, issue, text))
  yield* deps.publish(done)
  yield* Effect.logWarning(`integration: ${text}`)
})
~~~~

## AUT3-C19

```json
{
  "block_id": "AUT3-C19",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-04",
    "RE-AUT3-05"
  ],
  "body_anchors": [
    "B09",
    "B10"
  ],
  "requested_subject": "Cadeia gate/head→infra/red/probe/isolation/accepted→heads/base/skew/push→rows/cleanup; helpers de dissolve/eject/held",
  "path": "packages/core/src/board/queue-settle.ts",
  "archive": "sources/packages/core/src/board/queue-settle.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "a0165ce506ae7c07a7a79e9793e8b09f3cda0fcb",
  "source_sha256": "3dac27cec16c0d5003485753de4a132110a6251f628e040f49304a357d7f4ae5",
  "source_bytes": 27575,
  "required_source_line_ranges": [
    [
      1,
      493
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B09",
      "source_path": "packages/core/src/board/queue-settle.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "a0165ce506ae7c07a7a79e9793e8b09f3cda0fcb",
      "source_sha256": "3dac27cec16c0d5003485753de4a132110a6251f628e040f49304a357d7f4ae5",
      "first_line": 99,
      "last_line": 110,
      "excerpt_bytes": 828,
      "excerpt_sha256": "3d7cdcb39e2d3549295cf77ed1ec399a2aa8ed07b1294b1bbfb21a0f3698dc72",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 142946,
      "literal_content_byte_end_exclusive": 143774
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B09",
      "source_path": "packages/core/src/board/queue-settle.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "a0165ce506ae7c07a7a79e9793e8b09f3cda0fcb",
      "source_sha256": "3dac27cec16c0d5003485753de4a132110a6251f628e040f49304a357d7f4ae5",
      "first_line": 451,
      "last_line": 463,
      "excerpt_bytes": 483,
      "excerpt_sha256": "16e183e67753df9253f34bd234be93127035e0c62eaf20e6cd2c0a556e0ae5a7",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 143907,
      "literal_content_byte_end_exclusive": 144390
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B10",
      "source_path": "packages/core/src/board/queue-settle.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "a0165ce506ae7c07a7a79e9793e8b09f3cda0fcb",
      "source_sha256": "3dac27cec16c0d5003485753de4a132110a6251f628e040f49304a357d7f4ae5",
      "first_line": 238,
      "last_line": 271,
      "excerpt_bytes": 1992,
      "excerpt_sha256": "dbbc9c90793a1627cb7fc335f20f3bcbff1ed1c66d7ebd2fb89499ff11e64a55",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 147482,
      "literal_content_byte_end_exclusive": 149474
    }
  ]
}
```

```json
{"first_line":1,"last_line":98,"bytes":5517,"sha256":"fea5d0656e8a1399f84807832d892ccb8b4538cd8bf07095cdf4ded1637f6f86"}
```

~~~~typescript
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import type { BoardCi } from "./ci"
import {
  BoardAttemptTable,
  BoardBundleMemberTable,
  BoardBundleTable,
  BoardIssueTable,
  BoardQueueTable,
} from "./sql"
import { BoardSnapshot } from "./snapshot"
import { changed, log } from "./shared"
import type { IssueRow, ProjectRow } from "./shared"
import { AUTHOR, affected, decodeRollup, dispatched, dispatchRollup, insertNote, judge, place, release } from "./queue-shared"
import type { Context } from "./queue-shared"
import type { makeRecord } from "./queue-record"
import type { makeRed } from "./queue-red"

const decodeAttempt = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({ attempt: Schema.Number, status: Schema.String })))

/** Settling and closing a bundle: merge when green, give the members back when red. The red path and the record helpers come in from their modules. */
export function makeSettle(
  ctx: Context &
    Pick<ReturnType<typeof makeRecord>, "head" | "moved" | "note" | "describe"> &
    Pick<ReturnType<typeof makeRed>, "failures" | "baseState" | "scope" | "tryOn" | "isolate" | "bisect" | "fixCard" | "probe" | "flaky">,
) {
  const deps = ctx.deps
  const git = ctx.git
  const head = ctx.head
  const moved = ctx.moved
  const note = ctx.note
  const describe = ctx.describe
  const failures = ctx.failures
  const baseState = ctx.baseState
  const scope = ctx.scope
  const tryOn = ctx.tryOn
  const isolate = ctx.isolate
  const bisect = ctx.bisect
  const fixCard = ctx.fixCard
  const probe = ctx.probe
  const flaky = ctx.flaky

  /** The open bundle's next step: wait, merge when green, or give its members back when red. */
  const settle = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    directory: string,
    contract: BoardCi.Contract,
    bundle: typeof BoardBundleTable.$inferSelect,
  ) {
    if (!bundle.pr_number) return yield* dissolve(row, bundle, "The bundle PR was not opened.")
    const viewed = yield* deps.gh(["pr", "view", String(bundle.pr_number), "--repo", repo, "--json", "statusCheckRollup,headRefOid"])
    const viewedRollup = viewed.exitCode === 0 ? Option.getOrUndefined(decodeRollup(viewed.stdout)) : undefined
    if (!viewedRollup) return
    if (viewedRollup.headRefOid !== bundle.head_sha) return yield* dissolve(row, bundle, "Someone pushed to the bundle branch.")
    const rollup = dispatched(bundle, contract)
      ? { ...viewedRollup, statusCheckRollup: yield* dispatchRollup(deps, repo, bundle.branch, bundle.head_sha) }
      : viewedRollup
    const judged = judge(rollup.statusCheckRollup, contract)
    if (judged === "pending") return
    // Section 6.8: the fix card rides alone and is judged only on F, so a gate red elsewhere on base does not block it.
    const fixed =
      judged === "red" && bundle.failing && bundle.fix_issue_id && contract.scoped.tests !== null
        ? yield* tryOn(directory, contract.scoped.tests, bundle, bundle.failing, [bundle.head_sha])
        : undefined
    if (judged === "red" && bundle.failing && bundle.fix_issue_id && contract.scoped.tests !== null && fixed === undefined) return
    // Section 6.4: Maestro accepted this flaky bundle, so its red gate ships as tested.
    const verdict = bundle.status === "accepted" || fixed === true ? "green" : judged
    const members = yield* deps.quiet((tx) =>
      tx
        .select({ member: BoardBundleMemberTable, issue: BoardIssueTable })
        .from(BoardBundleMemberTable)
        .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardBundleMemberTable.issue_id))
        .where(eq(BoardBundleMemberTable.bundle_id, bundle.id))
        .orderBy(asc(BoardBundleMemberTable.position))
        .all(),
    )
    // A bundle with no members is a base probe: it never merges, it only says whether base is green. A red probe or safety
    // run (section 7.3, packages set) is read like any base red, so only the lanes touching its failing packages pause.
    if (members.length === 0 && verdict === "green")
      return yield* close(row, repo, bundle, `probed ${contract.base} at ${bundle.base_sha.slice(0, 10)}`, "probe-green")
    if (members.length === 0) return yield* safety(row, repo, directory, contract, bundle, rollup.statusCheckRollup)
    if (fixed === false) {
      yield* eject(row, bundle, members.map((item) => item.issue), `Bundle ${row.key}-B${bundle.n} carried this fix alone and ${bundle.failing?.flatMap((group) => group.files).join(", ")} still fail; it is back in Review.`, "fix did not turn its tests green")
      return yield* close(row, repo, bundle, "is red; the fix did not turn its tests green", "base-red")
    }
    if (verdict === "red") {
      const found = yield* failures(repo, rollup.statusCheckRollup, contract)
      const cause = found.files.length > 0 ? ` Failing: ${found.files.join(", ")}.` : ""
      const paused = Effect.gen(function* () {
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} failed on infrastructure twice; the ${row.key} queue is paused until Maestro retries it, and this card stays queued.`),
          { discard: true },
        )
        yield* Effect.logWarning(`integration: ${row.key} queue paused, bundle ${row.key}-B${bundle.n} failed on infrastructure twice`)
        return yield* close(row, repo, bundle, "failed on infrastructure twice; the queue is paused", "paused")
      })
~~~~

```json
{"first_line":111,"last_line":237,"bytes":7938,"sha256":"911c2cf53044f414d8146250ce47b2272e33938c3da5787d216010108b08e9f7"}
```

~~~~typescript
      if (rerunnable && attempts.some((attempt) => attempt?.status !== "completed")) return
      if (rerunnable && attempts.some((attempt) => (attempt?.attempt ?? 1) > 1)) return yield* paused
      const rerun = rerunnable ? yield* Effect.forEach(found.runs, (run) => deps.gh(["run", "rerun", run, "--failed", "--repo", repo])) : []
      if (rerunnable && rerun.every((result) => result.exitCode === 0)) {
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} failed on infrastructure, not code; the queue reruns its failed jobs once and this card stays queued.`),
          { discard: true },
        )
        return
      }
      // A red the gate cannot pin on a failing test, on a base that is red too, has nothing to wait for: base-red would
      // hold the queue until base turns green on its own. Read it as infrastructure instead: rebuild once, then pause.
      const infra = Effect.gen(function* () {
        const previous = yield* deps.quiet((tx) =>
          tx
            .select({ status: BoardBundleTable.status })
            .from(BoardBundleTable)
            .where(and(eq(BoardBundleTable.project_id, row.id), ne(BoardBundleTable.status, "open"), ne(BoardBundleTable.id, bundle.id)))
            .orderBy(desc(BoardBundleTable.n))
            .get(),
        )
        if (previous?.status === "infra") return yield* paused
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} failed on infrastructure, not code; the queue reruns it once and this card stays queued.`),
          { discard: true },
        )
        yield* deps.quiet((tx) =>
          tx.update(BoardQueueTable).set({ flush: true }).where(inArray(BoardQueueTable.issue_id, members.map((item) => item.issue.id))).run(),
        )
        return yield* close(row, repo, bundle, "failed on infrastructure; the queue reruns it", "infra")
      })
      if (found.infra) return yield* infra
      const sha10 = bundle.base_sha.slice(0, 10)
      const scoped = runnable(contract, found) && contract.scoped.tests !== null ? yield* scope(directory, contract.scoped.tests, bundle, found.groups) : undefined
      if (scoped === "flaky") return yield* flaky(row, bundle, members.map((item) => item.issue), found.groups.flatMap((group) => group.files))
      const based = scoped ? (scoped === "base" ? "red" : "green") : yield* baseState(row, repo, directory, bundle.base_sha, contract)
      if (based === "unknown") {
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} went red and ${contract.base} at ${sha10} has no checks; the queue tests ${contract.base} alone first and this card stays queued.`),
          { discard: true },
        )
        yield* deps.quiet((tx) =>
          tx.update(BoardQueueTable).set({ flush: true }).where(inArray(BoardQueueTable.issue_id, members.map((item) => item.issue.id))).run(),
        )
        yield* close(row, repo, bundle, `is red; the queue tests ${contract.base} alone first`, "probing")
        return yield* probe(
          row,
          repo,
          directory,
          contract,
          bundle.base_sha,
          `Bundle ${row.key}-B${bundle.n} went red and ${contract.base} at ${sha10} has no checks; this runs the full gate on ${contract.base} alone.`,
          null,
        )
      }
      if (based === "red" && found.groups.length === 0) return yield* infra
      if (based === "red") {
        // Section 6.8: F fails on base itself, so its culprit is bisected and a fix card opens; the bundle is not blamed.
        if (scoped === "base" && contract.scoped.tests !== null) {
          const culprit = yield* bisect(row, directory, contract.scoped.tests, bundle, found.groups)
          const fix = yield* fixCard(row, contract.base, culprit, found.groups)
          yield* deps.quiet((tx) => tx.update(BoardBundleTable).set({ culprit: culprit ?? null, failing: found.groups, fix_issue_id: fix }).where(eq(BoardBundleTable.id, bundle.id)).run())
          yield* Effect.logWarning(`integration: ${row.key} ${contract.base} is red at ${sha10}${culprit ? `, first failing at ${culprit.slice(0, 10)}` : ""}; ${pausing(contract, found.groups)}`)
        }
        yield* Effect.forEach(
          members,
          (item) =>
            note(row, item.issue, `Bundle ${row.key}-B${bundle.n} went red, and so does ${contract.base} at ${sha10}; this card stays queued until ${contract.base} is green.`),
          { discard: true },
        )
        return yield* close(row, repo, bundle, `is red because ${contract.base} at ${sha10} is red`, "base-red")
      }
      // Section 6.3 steps 3-6: a code red that ran scoped is searched with scoped runs, not halved through full gates.
      if (scoped === "code" && members.length > 1 && contract.scoped.tests !== null) {
        if (bundle.rebuilds >= 2) return yield* hold(row, repo, bundle, members, "went red after two rebuilds")
        const isolated = yield* isolate(directory, contract.scoped.tests, bundle, found.groups, members)
        if (isolated?.culprits.length === 0) return yield* hold(row, repo, bundle, members, "went red and halving found no culprit")
        if (isolated) {
          const culprits = isolated.culprits
          const fileList = found.groups.flatMap((group) => group.files).join(", ")
          // A culprit found by halving fails only once merged after earlier members, never alone.
          const where =
            isolated.after.length > 0
              ? `once merged after ${isolated.after.map((issue) => `${row.key}-${issue.number}`).join(", ")}`
              : `on ${contract.base} alone`
          yield* eject(
            row,
            bundle,
            culprits,
            `Bundle ${row.key}-B${bundle.n} went red, and this card fails ${fileList} ${where}; it is back in Review.`,
            isolated.after.length > 0 ? "failed its scoped tests after earlier members" : "failed its scoped tests alone",
          )
          const keys = culprits.map((issue) => `${row.key}-${issue.number}`).join(", ")
          const rest = members.filter((item) => !culprits.some((culprit) => culprit.id === item.issue.id))
          yield* deps.quiet((tx) =>
            tx
              .update(BoardQueueTable)
              .set({ flush: true })
              .where(inArray(BoardQueueTable.issue_id, rest.map((item) => item.issue.id)))
              .run(),
          )
          yield* Effect.forEach(
            rest,
            (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} went red; ${keys} failed alone and left it, and the queue rebuilds it with this card.`),
            { discard: true },
          )
          return yield* close(row, repo, bundle, `is red; ${keys} ejected, the queue rebuilds it`, "isolated")
        }
      }
      if (members.length > 1) {
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} went red on its full gate; the queue splits it to find the cause and this card stays queued.${cause}`),
          { discard: true },
        )
        // Flush keeps the surviving half due next tick, even after its first half merges and the rest is below full size.
        yield* deps.quiet((tx) =>
          tx.update(BoardQueueTable).set({ flush: true }).where(inArray(BoardQueueTable.issue_id, members.map((item) => item.issue.id))).run(),
        )
        return yield* close(row, repo, bundle, "is red; the queue splits it to find the cause", "red")
      }
      yield* eject(row, bundle, members.map((item) => item.issue), `Bundle ${row.key}-B${bundle.n} went red with only this card on ${contract.base} at ${sha10}; it is back in Review.${cause}`, "red alone on the full gate")
      return yield* close(row, repo, bundle, "is red", "red")
    }
~~~~

```json
{"first_line":272,"last_line":450,"bytes":9354,"sha256":"37858b911eb62896a02509a64bfc5e8f29968fc43812533525f845caa7be2995"}
```

~~~~typescript
    const shipped = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        yield* tx
          .update(BoardBundleTable)
          .set({ status: "merged", merged_on: landed.on })
          .where(eq(BoardBundleTable.id, bundle.id))
          .run()
        return yield* Effect.forEach(members, (item) =>
          Effect.gen(function* () {
            yield* tx
              .update(BoardAttemptTable)
              .set({ outcome: "merged" })
              .where(and(eq(BoardAttemptTable.issue_id, item.issue.id), isNull(BoardAttemptTable.outcome)))
              .run()
            yield* tx.delete(BoardQueueTable).where(eq(BoardQueueTable.issue_id, item.issue.id)).run()
            const moving = yield* place(tx, row, item.issue, "shipped")
            const activity = yield* log(tx, {
              project: row.id,
              issue: item.issue.id,
              actor: "github",
              action: "bundle.merge",
              before: moving.before,
              after: { ...moving.after, bundle: bundle.n, merged: landed.target, ...(landed.on ? { on: landed.on } : {}) },
            })
            return changed(row.id, activity, item.issue.id)
          }),
        )
      }),
    )
    yield* Effect.forEach(shipped, deps.publish, { discard: true })
    yield* git(directory, ["push", "--quiet", "origin", "--delete", bundle.branch])
    // Snapshot refs go only once the merge is on the remote, and only for shipped cards.
    yield* Effect.forEach(
      members,
      (item) =>
        Effect.gen(function* () {
          const remote = contract.snapshots.remote
          const refs = (yield* git(directory, ["ls-remote", remote, `refs/orchestra/wip/${row.key}-${item.issue.number}/*`])).out
            .split("\n")
            .map((line) => line.split("\t")[1])
            .filter((name): name is string => Boolean(name))
          if (refs.length > 0) yield* git(directory, ["push", "--quiet", remote, "--delete", ...refs])
          yield* describe(row, item.issue.id, contract.base)
        }),
      { discard: true },
    )
  })

  /**
   * Section 6.5 `merge-if-disjoint`: the merge commit of the tested head onto the new tip, when the two merge clean and
   * what moved base does not overlap what the bundle changed. Undefined means retest. A lane bundle always takes this
   * path (section 7.3): lanes in flight are disjoint by construction, so retesting every lane behind the first to land
   * would serialize them again.
   */
  const skew = Effect.fnUntraced(function* (
    directory: string,
    contract: BoardCi.Contract,
    bundle: typeof BoardBundleTable.$inferSelect,
    tip: string,
    row: ProjectRow,
  ) {
    if (contract.bundle.onBaseMoved !== "merge-if-disjoint" && bundle.packages === null) return undefined
    const merged = yield* git(directory, ["merge-tree", "--write-tree", tip, bundle.head_sha])
    if (merged.code !== 0) return undefined
    // Every bundle's record commit appends to the union-merged logs under `.atlas/`, so two lanes always share those
    // paths; a clean merge-tree already proves they combine, and they hold no code.
    const paths = (range: string) =>
      git(directory, ["diff", "--name-only", range]).pipe(
        Effect.map((diffed) => diffed.out.split("\n").filter((file) => file && !file.startsWith(".atlas/"))),
      )
    const theirs = yield* paths(`${bundle.base_sha}..${tip}`)
    const ours = yield* paths(`${bundle.base_sha}..${bundle.head_sha}`)
    if (theirs.some((file) => ours.includes(file))) return undefined
    const graph = (yield* git(directory, ["cat-file", "-e", `${tip}:turbo.json`])).code === 0
    if (graph) {
      const left = yield* affected(deps, directory, bundle.base_sha, tip)
      const right = yield* affected(deps, directory, bundle.base_sha, bundle.head_sha)
      if (!left || !right || left.some((name) => right.includes(name))) return undefined
    }
    const commit = yield* git(directory, [
      ...AUTHOR,
      "commit-tree",
      merged.out.split("\n")[0] ?? "",
      "-p",
      tip,
      "-p",
      bundle.head_sha,
      "-m",
      `Merge bundle ${row.key}-B${bundle.n} onto ${contract.base}\n\nTested on ${bundle.base_sha}, merged on ${tip}.`,
    ])
    if (commit.code !== 0 || !commit.out) return undefined
    return { target: commit.out, on: tip }
  })

  /** Closes the bundle PR and branch; its members stay queued and the next tick cuts again. */
  const dissolve = Effect.fnUntraced(function* (row: ProjectRow, bundle: typeof BoardBundleTable.$inferSelect, reason: string) {
    const published = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const members = yield* tx
          .select({ issue: BoardBundleMemberTable.issue_id })
          .from(BoardBundleMemberTable)
          .where(eq(BoardBundleMemberTable.bundle_id, bundle.id))
          .all()
        return yield* Effect.forEach(members, (member) =>
          log(tx, { project: row.id, issue: member.issue, actor: "github", action: "bundle.dissolve", reason, after: { bundle: bundle.n } }).pipe(
            Effect.map((activity) => changed(row.id, activity, member.issue)),
          ),
        )
      }),
    )
    yield* Effect.forEach(published, deps.publish, { discard: true })
    if (row.github_repo) yield* close(row, row.github_repo, bundle, "dissolved")
  })

  /**
   * Section 7.3: a red base probe or safety run. Infrastructure closes it as `infra`; F that passes on base when rerun
   * closes it green; F that fails on base is bisected and gets a fix card, and only the lanes touching F's packages pause.
   * A red whose failures are not scoped tests pauses the whole project until Maestro retries it.
   */
  const safety = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    directory: string,
    contract: BoardCi.Contract,
    bundle: typeof BoardBundleTable.$inferSelect,
    rollup: Parameters<typeof failures>[1],
  ) {
    const found = yield* failures(repo, rollup, contract)
    const sha10 = bundle.base_sha.slice(0, 10)
    if (found.infra) return yield* close(row, repo, bundle, `failed on infrastructure on ${contract.base} at ${sha10}`, "infra")
    const template = contract.scoped.tests
    const scoped = runnable(contract, found) && template !== null ? yield* scope(directory, template, bundle, found.groups) : undefined
    if (scoped === "flaky" || scoped === "code")
      return yield* close(row, repo, bundle, `found ${found.files.join(", ")} passing on ${contract.base} at ${sha10} when rerun`, "probe-green")
    // A red with no scoped failing tests has no fix card to cut, and a `base-red` without one waits for a base that only
    // the queue moves, so it pauses for Maestro instead.
    if (scoped === undefined || template === null) {
      yield* Effect.logWarning(`integration: ${row.key} probe found ${contract.base} red at ${sha10}, and its failures are not scoped tests; the queue is paused until Maestro retries it`)
      return yield* close(row, repo, bundle, `found ${contract.base} red at ${sha10}; the queue is paused`, "paused")
    }
    const culprit = yield* bisect(row, directory, template, bundle, found.groups)
    const fix = yield* fixCard(row, contract.base, culprit, found.groups)
    yield* deps.quiet((tx) => tx.update(BoardBundleTable).set({ culprit: culprit ?? null, failing: found.groups, fix_issue_id: fix }).where(eq(BoardBundleTable.id, bundle.id)).run())
    yield* Effect.logWarning(`integration: ${row.key} safety run found ${contract.base} red at ${sha10}${culprit ? `, first failing at ${culprit.slice(0, 10)}` : ""}; ${pausing(contract, found.groups)}`)
    return yield* close(row, repo, bundle, `found ${contract.base} red at ${sha10}`, "base-red")
  })

  const close = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    why: string,
    status: typeof BoardBundleTable.$inferSelect.status = "dissolved",
  ) {
    yield* deps.quiet((tx) => tx.update(BoardBundleTable).set({ status }).where(eq(BoardBundleTable.id, bundle.id)).run())
    if (bundle.pr_number)
      yield* deps.gh(["pr", "close", String(bundle.pr_number), "--repo", repo, "--delete-branch", "--comment", `Bundle ${row.key}-B${bundle.n} ${why}.`])
  })

  /** Gives each issue back to Review with `text` and releases its queue row; the caller decides the bundle's fate. */
  const eject = Effect.fnUntraced(function* (row: ProjectRow, bundle: typeof BoardBundleTable.$inferSelect, issues: ReadonlyArray<IssueRow>, text: string, reason: string) {
    const back = yield* deps.quiet((tx) =>
      Effect.forEach(issues, (issue) =>
        Effect.gen(function* () {
          yield* insertNote(tx, row, issue, text)
          yield* tx
            .update(BoardAttemptTable)
            .set({ outcome: "ejected" })
            .where(and(eq(BoardAttemptTable.issue_id, issue.id), isNull(BoardAttemptTable.outcome)))
            .run()
          yield* BoardSnapshot.dispatch(tx, issue, { cause: `ejected:${row.key}-B${bundle.n}` })
          return yield* release(tx, row, issue, "github", "bundle.dissolve", reason)
        }),
      ),
    )
    yield* Effect.forEach(back, deps.publish, { discard: true })
  })

  /** Section 6.3: a dissolved bundle's cards stay held until Maestro releases them one at a time with `board_bundle`. */
~~~~

```json
{"first_line":464,"last_line":493,"bytes":1463,"sha256":"919b24722e32009eafe7dcf7b55de419e1eb0104c7cf518f43fefb0bd1e82b97"}
```

~~~~typescript
    )
    yield* Effect.forEach(
      members,
      (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} ${why}; it dissolved and this card is held until Maestro releases it with board_bundle.`),
      { discard: true },
    )
    yield* Effect.logWarning(`integration: ${row.key}-B${bundle.n} ${why}; its cards are held. Release them one at a time with board_bundle, dequeue a suspect, or send F to jimmy.`)
    return yield* close(row, repo, bundle, why)
  })

  return { settle, dissolve, close }
}

// F runs scoped only when every failing file is a bun test file under a package group; otherwise base is judged by its checks or a probe.
function runnable(
  contract: BoardCi.Contract,
  found: { readonly files: ReadonlyArray<string>; readonly groups: ReadonlyArray<{ readonly files: ReadonlyArray<string> }> },
) {
  return (
    contract.scoped.tests !== null &&
    found.groups.length > 0 &&
    found.files.every((file) => found.groups.some((group) => group.files.includes(file.replaceAll("\\", "/"))))
  )
}

// Section 7.3: with lanes a base red pauses only the lanes whose packages overlap the failing ones.
function pausing(contract: BoardCi.Contract, groups: ReadonlyArray<{ readonly package: string }>) {
  if (!contract.lanes) return "only its fix card is cut until it is green"
  return `lanes touching ${[...new Set(groups.map((group) => group.package))].join(", ")} pause until its fix card lands; disjoint lanes keep landing`
}
~~~~

## AUT3-C20

```json
{
  "block_id": "AUT3-C20",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-05"
  ],
  "body_anchors": [
    "B09"
  ],
  "requested_subject": "Classificação logs/base, 2 falhas base/3 passes head, prefix/isolation/bisect/fix/probes/flaky",
  "path": "packages/core/src/board/queue-red.ts",
  "archive": "sources/packages/core/src/board/queue-red.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "57bcf02fe9c1eea69282f53a0c97799a89aacb5f",
  "source_sha256": "c9a29e07575731d8becdcfea5e2571c018b294c4c4e88b1de078a17c1d61e5c8",
  "source_bytes": 23316,
  "required_source_line_ranges": [
    [
      1,
      472
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B09",
      "source_path": "packages/core/src/board/queue-red.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "57bcf02fe9c1eea69282f53a0c97799a89aacb5f",
      "source_sha256": "c9a29e07575731d8becdcfea5e2571c018b294c4c4e88b1de078a17c1d61e5c8",
      "first_line": 48,
      "last_line": 82,
      "excerpt_bytes": 2179,
      "excerpt_sha256": "1f852f823862a62a06c724d64e758869d4d65d02e994101c520ea8da4f7f2fe5",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 144774,
      "literal_content_byte_end_exclusive": 146953
    }
  ]
}
```

```json
{"first_line":1,"last_line":47,"bytes":2529,"sha256":"5fe8bce02b9b8dfb76eb244b0a2e06951a741a423b595d6e8e57d3a9d61de6c2"}
```

~~~~typescript
import fs from "fs/promises"
import os from "os"
import path from "path"
import { and, desc, eq, inArray, isNull, ne, notExists, or, sql } from "drizzle-orm"
import { Clock, Effect, Option } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Board } from "@orchestra/schema/board"
import { which } from "../util/which"
import { BoardCi } from "./ci"
import {
  BoardBundleMemberTable,
  BoardBundleTable,
  BoardDependencyTable,
  BoardFlakeTable,
  BoardIssueTable,
  BoardProjectTable,
} from "./sql"
import { changed, endOf, log } from "./shared"
import type { IssueRow, ProjectRow } from "./shared"
import { AUTHOR, decodeRuns, dispatched, FAILED, gating, INFRA, judge, nextBundle } from "./queue-shared"
import type { Context, Rollup } from "./queue-shared"
import type { makeRecord } from "./queue-record"

/** The red path of a bundle: what failed, whether base is red, the scoped reruns, the culprit search, the fix card and the base probe. `note` comes from the record module. */
export function makeRed(ctx: Context & Pick<ReturnType<typeof makeRecord>, "note">) {
  const deps = ctx.deps
  const git = ctx.git
  const note = ctx.note

  /**
   * Section 6.3: the failing set F from the failed jobs' logs and the failing bun files of each turbo package group, and
   * whether the red is infrastructure. A job counts as
   * infrastructure when it was cancelled, timed out or never started, when its log names no failing file and shows a step
   * that timed out or was cancelled (GitHub reports a step's `timeout-minutes` as a plain failure), or when its log has no
   * failing file and lacks the contract's control line, which only the jobs it names print; a job whose log cannot be
   * read counts as code.
   */
  const failures = Effect.fnUntraced(function* (repo: string, rollup: typeof Rollup.Type["statusCheckRollup"], contract: BoardCi.Contract) {
    const failed = gating(rollup, contract).filter((check) => check.done && FAILED.has(check.result))
    const read = yield* Effect.forEach(failed, (check) =>
      Effect.gen(function* () {
        if (INFRA.has(check.result)) return { files: [] as string[], groups: [], infra: true }
        const job = check.url.match(/\/job\/(\d+)/)?.[1]
        const log = job ? yield* deps.gh(["api", `repos/${repo}/actions/jobs/${job}/logs`]) : undefined
        const text = log?.exitCode === 0 ? log.stdout.replace(/^\S+Z /gm, "") : ""
        const files = text ? BoardCi.failing(text) : []
        const control = contract.full.control
~~~~

```json
{"first_line":83,"last_line":472,"bytes":18608,"sha256":"5fe8b542c0eda402f8793e807873173ae6800ac78965120c6e36f4d0591a17eb"}
```

~~~~typescript

  /**
   * Whether `sha`'s tree is one the whole suite already passed on: the head of a merged bundle that ran the whole suite,
   * or a green base probe or safety run. A fast-forward lands the bundle head itself, so base then carries the tree its
   * gate tested and needs no probe. A fix card's bundle was judged only on F, and an accepted flaky bundle shipped red, so
   * neither counts. The newest twenty runs are enough: an older tree is rarely base again.
   */
  const greenTree = Effect.fnUntraced(function* (row: ProjectRow, directory: string, sha: string) {
    const runs = yield* deps.quiet((tx) =>
      tx
        .select({ status: BoardBundleTable.status, base_sha: BoardBundleTable.base_sha, tree_sha: BoardBundleTable.tree_sha })
        .from(BoardBundleTable)
        .where(
          and(
            eq(BoardBundleTable.project_id, row.id),
            or(
              and(
                eq(BoardBundleTable.status, "merged"),
                isNull(BoardBundleTable.packages),
                isNull(BoardBundleTable.fix_issue_id),
                notExists(tx.select({ id: BoardFlakeTable.bundle_id }).from(BoardFlakeTable).where(eq(BoardFlakeTable.bundle_id, BoardBundleTable.id))),
              ),
              eq(BoardBundleTable.status, "probe-green"),
            ),
          ),
        )
        .orderBy(desc(BoardBundleTable.n))
        .limit(20)
        .all(),
    )
    if (runs.length === 0) return false
    const probes = runs.filter((run) => run.status === "probe-green").map((run) => `${run.base_sha}^{tree}`)
    const read = yield* git(directory, ["rev-parse", `${sha}^{tree}`, ...probes])
    if (read.code !== 0) return false
    const trees = read.out.split("\n")
    const tree = trees[0]
    return trees.slice(1).includes(tree) || runs.some((run) => run.status === "merged" && run.tree_sha === tree)
  })

  /** Runs F's groups with the scoped command in `cwd`; true when every group passes. */
  const runGroups = (cwd: string, template: string, branch: string, groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>) =>
    Effect.forEach(groups, (group) =>
      Effect.gen(function* () {
        const argv = yield* BoardCi.command(template, group, branch).pipe(Effect.orElseSucceed(() => [] as string[]))
        if (argv.length === 0) return false
        const result = yield* deps.proc
          .run(ChildProcess.make(which(argv[0] ?? "", deps.env ?? process.env) ?? argv[0] ?? "", argv.slice(1), { cwd, env: deps.env, extendEnv: true, stdin: "ignore" }), {
            combineOutput: true,
            maxOutputBytes: 16 * 1024 * 1024,
            timeout: "90 minutes",
          })
          .pipe(Effect.result)
        return result._tag === "Success" && result.success.exitCode === 0
      }),
    ).pipe(Effect.map((passes) => passes.every(Boolean)))

  /**
   * Section 6.3 step 2: runs F on base and on the bundle head in parallel. F belongs to base when it fails there twice;
   * three passes on the head make the bundle flaky; a head failure is code. Undefined when a checkout fails.
   */
  const scope = Effect.fnUntraced(function* (
    directory: string,
    template: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>,
  ) {
    // Checkouts are added one at a time: concurrent `git worktree add` on one repository can race on its lock files.
    const checkouts = yield* Effect.forEach([bundle.base_sha, bundle.head_sha], (sha) =>
      Effect.gen(function* () {
        const scratch = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), `orchestra-scope-${bundle.n}-`)))
        const added = yield* git(directory, ["worktree", "add", "--quiet", "--detach", scratch, sha])
        if (added.code === 0) return scratch
        yield* Effect.promise(() => fs.rm(scratch, { recursive: true, force: true }))
        return undefined
      }),
    )
    const base = checkouts[0]
    const head = checkouts[1]
    const outcome =
      base && head
        ? yield* Effect.all(
            [
              runGroups(base, template, bundle.branch, groups).pipe(Effect.flatMap((pass) => (pass ? Effect.succeed(true) : runGroups(base, template, bundle.branch, groups)))),
              runGroups(head, template, bundle.branch, groups).pipe(
                Effect.flatMap((pass) => (pass ? runGroups(head, template, bundle.branch, groups) : Effect.succeed(false))),
                Effect.flatMap((pass) => (pass ? runGroups(head, template, bundle.branch, groups) : Effect.succeed(false))),
              ),
            ],
            { concurrency: 2 },
          )
        : undefined
    yield* Effect.forEach(checkouts, (scratch) => (scratch ? git(directory, ["worktree", "remove", "--force", scratch]) : Effect.void), { discard: true })
    if (!outcome) return undefined
    return !outcome[0] ? ("base" as const) : outcome[1] ? ("flaky" as const) : ("code" as const)
  })

  /** Runs F on base plus `heads` merged in order; false when a merge conflicts or a group fails, undefined when the checkout fails. */
  const tryOn = Effect.fnUntraced(function* (
    directory: string,
    template: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>,
    heads: ReadonlyArray<string>,
  ) {
    const scratch = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), `orchestra-isolate-${bundle.n}-`)))
    const added = yield* git(directory, ["worktree", "add", "--quiet", "--detach", scratch, bundle.base_sha])
    if (added.code !== 0) {
      yield* Effect.promise(() => fs.rm(scratch, { recursive: true, force: true }))
      return undefined
    }
    return yield* Effect.gen(function* () {
      for (const head of heads) {
        const merged = yield* git(scratch, [...AUTHOR, "merge", "--no-ff", "--quiet", "-m", "isolate", head])
        if (merged.code !== 0) return false
      }
      return yield* runGroups(scratch, template, bundle.branch, groups)
    }).pipe(Effect.ensuring(git(directory, ["worktree", "remove", "--force", scratch])))
  })

  /**
   * Section 6.3 steps 3-6: the culprits of a code red whose failing tests F ran scoped. Each candidate runs alone on base
   * with its in-bundle dependencies; when none fails alone, a binary search over the member prefixes finds the member
   * whose addition turns red, with the members merged before it in `after`. Undefined when a checkout fails; an empty
   * `culprits` means no culprit.
   */
  const isolate = Effect.fnUntraced(function* (
    directory: string,
    template: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>,
    members: ReadonlyArray<{ issue: IssueRow; member: typeof BoardBundleMemberTable.$inferSelect }>,
  ) {
    const failing = groups.flatMap((group) => group.files)
    const ids = members.map((item) => item.issue.id)
    const links = yield* deps.quiet((tx) =>
      tx
        .select()
        .from(BoardDependencyTable)
        .where(and(inArray(BoardDependencyTable.issue_id, ids), inArray(BoardDependencyTable.depends_on_id, ids)))
        .all(),
    )
    const diffs = yield* Effect.forEach(members, (item) =>
      git(directory, ["diff", "--name-only", bundle.base_sha, item.member.head_sha]).pipe(
        Effect.map((diff) => ({ item, touches: diff.out.split("\n").some((file) => failing.includes(file)) })),
      ),
    )
    const touching = diffs.flatMap((entry) => (entry.touches ? [entry.item] : []))
    const candidates = touching.length > 0 ? touching : members
    // One at a time: concurrent `git worktree add` on one repository races on its lock files.
    const singles = yield* Effect.forEach(
      candidates,
      (item) => {
        const after = members.filter((dep) => links.some((link) => link.issue_id === item.issue.id && link.depends_on_id === dep.issue.id))
        return tryOn(directory, template, bundle, groups, [...after.map((dep) => dep.member.head_sha), item.member.head_sha])
      },
      { concurrency: 1 },
    )
    if (singles.includes(undefined)) return undefined
    const culprits = candidates.filter((_, index) => singles[index] === false)
    if (culprits.length > 0) return { culprits: culprits.map((item) => item.issue), after: [] }
    let lo = 1
    let hi = members.length
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      const prefix = yield* tryOn(directory, template, bundle, groups, members.slice(0, mid).map((item) => item.member.head_sha))
      if (prefix === undefined) return undefined
      if (prefix === false) hi = mid
      if (prefix === true) lo = mid + 1
    }
    // The full prefix was never run by the search: when the search reaches it, it decides whether there is a culprit at all.
    if (lo === members.length) {
      const whole = yield* tryOn(directory, template, bundle, groups, members.map((item) => item.member.head_sha))
      if (whole === undefined) return undefined
      if (whole) return { culprits: [], after: [] }
    }
    return { culprits: members.slice(lo - 1, lo).map((item) => item.issue), after: members.slice(0, lo - 1).map((item) => item.issue) }
  })

  /**
   * Section 6.8: the first-parent commit between the last green whole-suite run and the red base where F starts failing:
   * a merged bundle that ran the whole suite, or a green base probe or safety run. A lane bundle ran only its packages,
   * so it is never the good point. Undefined when there is no such run to start from or a checkout fails.
   */
  const bisect = Effect.fnUntraced(function* (
    row: ProjectRow,
    directory: string,
    template: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>,
  ) {
    const found = yield* deps.quiet((tx) =>
      tx
        .select({ status: BoardBundleTable.status, base_sha: BoardBundleTable.base_sha, head_sha: BoardBundleTable.head_sha })
        .from(BoardBundleTable)
        .where(
          and(
            eq(BoardBundleTable.project_id, row.id),
            or(and(eq(BoardBundleTable.status, "merged"), isNull(BoardBundleTable.packages)), eq(BoardBundleTable.status, "probe-green")),
          ),
        )
        .orderBy(desc(BoardBundleTable.n))
        .get(),
    )
    if (!found) return undefined
    const good = found.status === "merged" ? found.head_sha : found.base_sha
    if ((yield* git(directory, ["merge-base", "--is-ancestor", good, bundle.base_sha])).code !== 0) return undefined
    const commits = (yield* git(directory, ["rev-list", "--first-parent", "--reverse", `${good}..${bundle.base_sha}`])).out.split("\n").filter(Boolean)
    if (commits.length === 0) return undefined
    const scratch = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), `orchestra-bisect-${bundle.n}-`)))
    const added = yield* git(directory, ["worktree", "add", "--quiet", "--detach", scratch, bundle.base_sha])
    if (added.code !== 0) {
      yield* Effect.promise(() => fs.rm(scratch, { recursive: true, force: true }))
      return undefined
    }
    return yield* Effect.gen(function* () {
      // The last commit is known to fail, so the search only narrows within the list.
      let lo = 0
      let hi = commits.length - 1
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2)
        if ((yield* git(scratch, ["checkout", "--quiet", "--detach", commits[mid] ?? ""])).code !== 0) return undefined
        const passes = yield* runGroups(scratch, template, bundle.branch, groups)
        if (passes) lo = mid + 1
        if (!passes) hi = mid
      }
      return commits[lo]
    }).pipe(Effect.ensuring(git(directory, ["worktree", "remove", "--force", scratch])))
  })

  /** Section 6.8: the open fix card for a red base, reused while an earlier one has not shipped. */
  const fixCard = Effect.fnUntraced(function* (
    row: ProjectRow,
    base: string,
    culprit: string | undefined,
    groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>,
  ) {
    const open = yield* deps.quiet((tx) =>
      tx
        .select({ id: BoardIssueTable.id })
        .from(BoardBundleTable)
        .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardBundleTable.fix_issue_id))
        .where(and(eq(BoardBundleTable.project_id, row.id), ne(BoardIssueTable.stage, "shipped"), ne(BoardIssueTable.stage, "cut")))
        .orderBy(desc(BoardBundleTable.n))
        .get(),
    )
    if (open) return open.id
    const files = groups.flatMap((group) => group.files).join(", ")
    const title = `Fix ${base}: ${files} fail${culprit ? ` since ${culprit.slice(0, 10)}` : ""}`
    const body = `${base} fails ${files}.${culprit ? ` Bisect found ${culprit} as the first failing commit.` : " The queue has no green point to bisect from."} The queue cuts only this card until ${base} is green; it rides alone and merges when these tests pass.`
    const created = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        // `row` may be stale: the next issue number comes from a fresh read.
        const project = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.id, row.id)).get()
        if (!project) return yield* Effect.die(`${row.key} has no project row to file its fix card in.`)
        const id = Board.IssueID.create()
        const position = yield* endOf(tx, row.id, "backlog")
        const entered = yield* Clock.currentTimeMillis
        yield* tx
          .insert(BoardIssueTable)
          .values({
            id,
            project_id: row.id,
            number: project.next_issue_number,
            title,
            body,
            type: "bug",
            epic_id: null,
            stage: "backlog",
            position,
            estimate: null,
            seat: null,
            session_id: null,
            branch: null,
            pr_number: null,
            attempts: 0,
            crash_reason: null,
            guardrail_rule: null,
            record: null,
            stage_entered_at: entered,
            github_dirty: project.github_repo !== null,
          })
          .run()
        yield* tx
          .update(BoardProjectTable)
          .set({ next_issue_number: project.next_issue_number + 1 })
          .where(eq(BoardProjectTable.id, row.id))
          .run()
        const activity = yield* log(tx, {
          project: row.id,
          issue: id,
          actor: "github",
          action: "issue.create",
          reason: "base is red",
          after: {
            number: project.next_issue_number,
            title,
            body,
            type: "bug",
            stage: "backlog",
            position,
            stage_entered_at: entered,
          },
        })
        return { id, changed: changed(row.id, activity, id) }
      }),
    )
    yield* deps.publish(created.changed)
    return created.id
  })

  /**
   * Runs the whole suite on base itself: an empty commit on `sha`, opened as a bundle with no members. A phase 1 probe
   * (packages null) gates on the full label; a safety run (section 7.3, packages []) dispatches the lane workflows with
   * no package filter, which run every package, and overlaps no lane while it runs.
   */
  const probe = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    directory: string,
    contract: BoardCi.Contract,
    sha: string,
    body: string,
    packages: ReadonlyArray<string> | null,
  ) {
    const head = (yield* git(directory, [...AUTHOR, "commit-tree", `${sha}^{tree}`, "-p", sha, "-m", "chore(queue): base probe"])).out
    if (!head) return
    const n = yield* deps.quiet((tx) => nextBundle(tx, row.id))
    const branch = `bundle-${row.key}-${n}`
    const pushed = yield* git(directory, ["push", "--quiet", "--force", "origin", `${head}:refs/heads/${branch}`])
    if (pushed.code !== 0) return
    const dispatch = dispatched({ packages }, contract)
    const opened = yield* deps.gh(
      [
        "pr",
        "create",
        "--repo",
        repo,
        "--base",
        contract.base,
        "--head",
        branch,
        "--title",
        `chore(queue): base probe ${row.key}-B${n}`,
        "--body-file",
        "-",
        ...(contract.full.label && !dispatch ? ["--label", contract.full.label] : []),
      ],
      body,
    )
    const number = Number(opened.stdout.match(/\/pull\/(\d+)/)?.[1] ?? 0) || null
    if (dispatch)
      yield* Effect.forEach(contract.lanes?.workflows ?? [], (workflow) => deps.gh(["workflow", "run", workflow, "--repo", repo, "--ref", branch]), {
        discard: true,
      })
    yield* deps.quiet((tx) =>
      tx
        .insert(BoardBundleTable)
        .values({ id: Board.BundleID.create(), project_id: row.id, n, branch, pr_number: number, base_sha: sha, head_sha: head, tree_sha: "", status: "open", packages })
        .run(),
    )
  })

  /** Section 6.4: a flaky bundle keeps its PR open and its members queued until Maestro merges or retries it. */
  const flaky = Effect.fnUntraced(function* (row: ProjectRow, bundle: typeof BoardBundleTable.$inferSelect, issues: ReadonlyArray<IssueRow>, tests: ReadonlyArray<string>) {
    const now = yield* Clock.currentTimeMillis
    yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        yield* tx.update(BoardBundleTable).set({ status: "flaky" }).where(eq(BoardBundleTable.id, bundle.id)).run()
        yield* Effect.forEach(
          tests,
          (test) =>
            tx
              .insert(BoardFlakeTable)
              .values({ project_id: row.id, test, bundle_id: bundle.id, first_seen: now, count: 1 })
              .onConflictDoUpdate({ target: [BoardFlakeTable.project_id, BoardFlakeTable.test], set: { bundle_id: bundle.id, count: sql`${BoardFlakeTable.count} + 1` } })
              .run(),
          { discard: true },
        )
      }),
    )
    yield* Effect.forEach(
      issues,
      (issue) => note(row, issue, `Bundle ${row.key}-B${bundle.n} went red, and ${tests.join(", ")} then passed three scoped reruns of its head: it is flaky. Maestro merges it or retries it; this card stays queued.`),
      { discard: true },
    )
    yield* Effect.logWarning(`integration: ${row.key}-B${bundle.n} flaky: ${tests.join(", ")} failed, then passed on rerun. Merge or retry.`)
  })

  return { failures, baseState, scope, tryOn, isolate, bisect, fixCard, probe, flaky }
}
~~~~

## AUT3-C21

```json
{
  "block_id": "AUT3-C21",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-06"
  ],
  "body_anchors": [
    "B11"
  ],
  "requested_subject": "Índice/scanner/remote/ref/push/registro/restoreworktree e lifecycle de attempts",
  "path": "packages/core/src/board/snapshot.ts",
  "archive": "sources/packages/core/src/board/snapshot.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "cc39cdec652c05bf969da8543335da1703a663fc",
  "source_sha256": "8939a3de7e1123e7e650144adb79dfe5828706c73e6b34ab942bcc2edb626012",
  "source_bytes": 15010,
  "required_source_line_ranges": [
    [
      1,
      309
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B11",
      "source_path": "packages/core/src/board/snapshot.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "cc39cdec652c05bf969da8543335da1703a663fc",
      "source_sha256": "8939a3de7e1123e7e650144adb79dfe5828706c73e6b34ab942bcc2edb626012",
      "first_line": 75,
      "last_line": 93,
      "excerpt_bytes": 949,
      "excerpt_sha256": "3e59c45a4ca740ced13176f39a76d87a9adab7d8553784101cd6a0a2b1621795",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 152210,
      "literal_content_byte_end_exclusive": 153159
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B11",
      "source_path": "packages/core/src/board/snapshot.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "cc39cdec652c05bf969da8543335da1703a663fc",
      "source_sha256": "8939a3de7e1123e7e650144adb79dfe5828706c73e6b34ab942bcc2edb626012",
      "first_line": 208,
      "last_line": 220,
      "excerpt_bytes": 860,
      "excerpt_sha256": "e29646c08bdeb2e59e665f7aa8ad4a6c2be83c1ab315923a4402b334128884db",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 153292,
      "literal_content_byte_end_exclusive": 154152
    }
  ]
}
```

```json
{"first_line":1,"last_line":74,"bytes":3728,"sha256":"0595617a6025ff64a17462aa90b820e0900bd1ec1246a35deadf8df40e61061a"}
```

~~~~typescript
export * as BoardSnapshot from "./snapshot"

import { existsSync } from "fs"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { and, desc, eq, isNull } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import type { Board } from "@orchestra/schema/board"
import type { AppProcess } from "../process"
import { BoardAttemptTable, BoardIssueTable, BoardProjectTable } from "./sql"
import { gitRunner, worktree } from "./shared"
import type { Fields, IssueRow, ProjectRow, Tx } from "./shared"
import { BoardThread } from "./thread"

// Push early (docs/specs/maestro-lead/merge-queue.md section 8.1): the host writes a card's worktree to a snapshot
// commit through a temporary index and pushes it to refs/orchestra/wip/<KEY>/a<n>. The worktree, its index and its
// HEAD stay untouched, so seats still never commit.

export interface Deps {
  readonly quiet: <A>(work: (tx: Tx) => Effect.Effect<A, unknown>) => Effect.Effect<A>
  readonly proc: AppProcess.Interface
  /** The gitleaks command (executable and leading arguments), or undefined when none can be had; then no snapshot is pushed. */
  readonly scanner: Effect.Effect<ReadonlyArray<string> | undefined>
  /** The project's snapshot remote from its CI contract; a failure blocks the push rather than guess a remote. */
  readonly remote: (directory: string, project: ProjectRow) => Effect.Effect<string, { readonly message: string }>
  readonly env?: NodeJS.ProcessEnv
}

export type Attempt = typeof BoardAttemptTable.$inferSelect

/**
 * What one snapshot did. `blocked` says why nothing was pushed. `missing` means the worktree is gone with no snapshot
 * to restore it from; `restored` means a gone worktree was re-created at its snapshot commit (spec 8.5).
 */
export type Result =
  | { readonly status: "pushed" | "unchanged"; readonly ref: string; readonly sha: string }
  | { readonly status: "blocked"; readonly ref: string; readonly reason: string }
  | { readonly status: "missing"; readonly ref: string; readonly worktree: string | null }
  | { readonly status: "restored"; readonly ref: string; readonly worktree: string; readonly sha: string }
  | { readonly status: "none" }

const IDENTITY = {
  GIT_AUTHOR_NAME: "Orchestra",
  GIT_AUTHOR_EMAIL: "orchestra@localhost",
  GIT_COMMITTER_NAME: "Orchestra",
  GIT_COMMITTER_EMAIL: "orchestra@localhost",
}

export function make(deps: Deps) {
  const git = gitRunner(deps.proc, deps.env)
  /** The cards already warned about a gone worktree, so the 10 minute sweep says it once, not on every pass. */
  const warned = new Set<Board.IssueID>()

  /** The worktree's tree as it stands, written from a copy of its index so the real index stays untouched. */
  const tree = Effect.fnUntraced(function* (cwd: string) {
    const index = yield* git(cwd, ["rev-parse", "--path-format=absolute", "--git-path", "index"])
    return yield* Effect.acquireUseRelease(
      Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "orchestra-snapshot-"))),
      (temporary) =>
        Effect.gen(function* () {
          const env = { GIT_INDEX_FILE: path.join(temporary, "index") }
          yield* Effect.promise(() => fs.copyFile(index.out, env.GIT_INDEX_FILE).catch(() => undefined))
          const added = yield* git(cwd, ["add", "-A"], env)
          const written = yield* git(cwd, ["write-tree"], env)
          if (added.code !== 0 || written.code !== 0) return undefined
          return written.out
        }),
      (temporary) => Effect.promise(() => fs.rm(temporary, { recursive: true, force: true })),
    )
  })

  /** Scans the commits `from..to` with gitleaks; anything but a clean exit blocks the push. */
~~~~

```json
{"first_line":94,"last_line":207,"bytes":5980,"sha256":"861feb2349b087a4fd1c7dc52ed2be2718ba4924897dcb44500e91492fd65807"}
```

~~~~typescript

  const update = (attempt: Attempt, set: Partial<typeof BoardAttemptTable.$inferInsert>) =>
    deps.quiet((tx) =>
      tx
        .update(BoardAttemptTable)
        .set(set)
        .where(and(eq(BoardAttemptTable.issue_id, attempt.issue_id), eq(BoardAttemptTable.n, attempt.n)))
        .run(),
    )

  const find = (issue: Board.IssueID) =>
    deps.quiet((tx) =>
      Effect.gen(function* () {
        const row = yield* tx
          .select({ issue: BoardIssueTable, project: BoardProjectTable })
          .from(BoardIssueTable)
          .innerJoin(BoardProjectTable, eq(BoardIssueTable.project_id, BoardProjectTable.id))
          .where(eq(BoardIssueTable.id, issue))
          .get()
        if (!row) return undefined
        const attempt = yield* open(tx, issue)
        return { ...row, attempt, directory: yield* worktree(tx, row.project) }
      }),
    )

  /** The card's worktree: the one recorded on the attempt, else the worktree that has the card's branch checked out. */
  const locate = Effect.fnUntraced(function* (directory: string | null, issue: IssueRow, attempt: Attempt) {
    if (attempt.worktree) return attempt.worktree
    if (!directory || !issue.branch) return null
    const listed = yield* git(directory, ["worktree", "list", "--porcelain"])
    // git lists Windows paths with forward slashes; resolve keeps the recorded path in the platform's form.
    const listedPath = listed.out
      .split("\n\n")
      .map((block) => block.split("\n"))
      .find((lines) => lines.includes(`branch refs/heads/${issue.branch}`))
      ?.find((line) => line.startsWith("worktree "))
      ?.slice("worktree ".length)
    const found = listedPath && path.resolve(listedPath)
    if (found) yield* update(attempt, { worktree: found })
    return found ?? null
  })

  /**
   * Re-creates a gone worktree on the card's branch, then writes the snapshot's tree over its files only, so HEAD and
   * index are the branch's again and the work in progress shows as uncommitted, as before the loss (section 8.1).
   * The branch is checked out detached when another worktree holds it.
   */
  const restore = Effect.fnUntraced(function* (directory: string, project: ProjectRow, branch: string, cwd: string, sha: string, ref: string) {
    const remote = yield* deps.remote(directory, project).pipe(Effect.orElseSucceed(() => undefined))
    if (!remote) return false
    yield* git(directory, ["worktree", "prune"])
    const fetched = yield* git(directory, ["fetch", "--quiet", "--no-tags", remote, ref])
    if (fetched.code !== 0) return false
    const added =
      (yield* git(directory, ["worktree", "add", cwd, branch])).code === 0 ||
      (yield* git(directory, ["worktree", "add", "--detach", cwd, branch])).code === 0
    if (!added) return false
    // No-overlay restore also deletes the files the snapshot lacks.
    return (yield* git(cwd, ["restore", `--source=${sha}`, "--worktree", "--", "."])).code === 0
  })

  const push = Effect.fnUntraced(function* (issue: Board.IssueID) {
    const found = yield* find(issue)
    const attempt = found?.attempt
    if (!found || !attempt) return { status: "none" } satisfies Result
    const ref = `refs/orchestra/wip/${found.project.key}-${found.issue.number}/a${attempt.n}`
    const cwd = yield* locate(found.directory, found.issue, attempt)
    if (!cwd || !existsSync(cwd)) {
      const sha = attempt.snapshot_sha
      const branch = found.issue.branch
      if (cwd && sha && branch && found.directory && (yield* restore(found.directory, found.project, branch, cwd, sha, ref)))
        return { status: "restored", ref, worktree: cwd, sha } satisfies Result
      // A card with no worktree on record never had one to lose (not started, or works outside one): nothing drifted.
      if (!cwd) return { status: "missing", ref, worktree: cwd } satisfies Result
      if (!warned.has(issue)) {
        warned.add(issue)
        yield* Effect.logWarning(`drift: ${found.project.key}-${found.issue.number} worktree ${cwd} is gone and has no snapshot to restore`)
      }
      return { status: "missing", ref, worktree: cwd } satisfies Result
    }
    warned.delete(issue)
    const current = yield* tree(cwd)
    if (!current) return { status: "blocked", ref, reason: `could not read the tree of ${cwd}` } satisfies Result
    if (current === attempt.snapshot_tree && attempt.snapshot_sha)
      return { status: "unchanged", ref, sha: attempt.snapshot_sha } satisfies Result
    // The first snapshot's parent is the worktree's HEAD, so the scan and the push carry only the seat's change.
    const parent = attempt.snapshot_sha ?? (yield* git(cwd, ["rev-parse", "HEAD"])).out
    const commit = yield* git(
      cwd,
      ["commit-tree", current, ...(parent ? ["-p", parent] : []), "-m", `orchestra snapshot ${found.project.key}-${found.issue.number} a${attempt.n}`],
      IDENTITY,
    )
    const blocked = (reason: string) =>
      update(attempt, { snapshot_blocked: reason }).pipe(Effect.as({ status: "blocked", ref, reason } satisfies Result))
    if (commit.code !== 0) return yield* blocked(`could not write the snapshot commit: ${commit.err}`)
    const hit = yield* scan(cwd, parent ? `${parent}..${commit.out}` : commit.out)
    if (hit) return yield* blocked(hit)
    const remote = yield* deps.remote(found.directory ?? cwd, found.project).pipe(Effect.result)
    if (remote._tag === "Failure") return yield* blocked(remote.failure.message)
    const pushed = yield* git(cwd, ["push", "--no-verify", "--force", remote.success, `${commit.out}:${ref}`])
    if (pushed.code !== 0) return yield* blocked(`the push to ${remote.success} failed: ${pushed.err.split("\n").at(-1)}`)
    yield* update(attempt, {
      snapshot_sha: commit.out,
      snapshot_tree: current,
      snapshot_at: yield* Clock.currentTimeMillis,
      snapshot_blocked: null,
    })
    return { status: "pushed", ref, sha: commit.out } satisfies Result
  })

  return {
    tree,
    push,
    /**
~~~~

```json
{"first_line":221,"last_line":309,"bytes":3493,"sha256":"dfec2e197515d6f61bffc82e9158723742c86228bd7da9e48f14c907d1f39b33"}
```

~~~~typescript
      const issues = yield* deps.quiet((tx) =>
        tx
          .selectDistinct({ id: BoardIssueTable.id })
          .from(BoardIssueTable)
          .innerJoin(BoardAttemptTable, eq(BoardAttemptTable.issue_id, BoardIssueTable.id))
          .where(and(eq(BoardIssueTable.stage, "building"), isNull(BoardAttemptTable.outcome)))
          .all(),
      )
      return yield* Effect.forEach(issues, (row) => push(row.id))
    }),
  }
}

export type Interface = ReturnType<typeof make>

/** The card's open attempt: the latest one with no outcome. */
export const open = Effect.fnUntraced(function* (tx: Tx, issue: Board.IssueID) {
  const latest = yield* tx
    .select()
    .from(BoardAttemptTable)
    .where(eq(BoardAttemptTable.issue_id, issue))
    .orderBy(desc(BoardAttemptTable.n))
    .limit(1)
    .get()
  return latest && latest.outcome === null ? latest : undefined
})

/**
 * Records a dispatch of `issue`: the open attempt ends (`failed` when the card has a crash reason, else `superseded`)
 * and attempt n+1 opens with what it runs on. `board_issue.attempts` becomes the new n.
 */
export const dispatch = Effect.fnUntraced(function* (
  tx: Tx,
  issue: IssueRow,
  input: { readonly worktree?: string; readonly writePaths?: ReadonlyArray<string>; readonly cause?: string },
) {
  const latest = yield* tx
    .select()
    .from(BoardAttemptTable)
    .where(eq(BoardAttemptTable.issue_id, issue.id))
    .orderBy(desc(BoardAttemptTable.n))
    .limit(1)
    .get()
  if (latest && latest.outcome === null)
    yield* tx
      .update(BoardAttemptTable)
      .set({ outcome: issue.crash_reason ? "failed" : "superseded" })
      .where(and(eq(BoardAttemptTable.issue_id, issue.id), eq(BoardAttemptTable.n, latest.n)))
      .run()
  const n = (latest?.n ?? 0) + 1
  const cause = input.cause ?? (n === 1 ? null : `failed:${issue.crash_reason ?? "redispatched"}`)
  yield* tx
    .insert(BoardAttemptTable)
    .values({
      issue_id: issue.id,
      n,
      seat: issue.seat,
      session_id: issue.session_id,
      worktree: input.worktree ?? null,
      branch: issue.branch,
      pr_number: issue.pr_number,
      write_paths: [...(input.writePaths ?? [])],
      cause,
    })
    .run()
  yield* tx.update(BoardIssueTable).set({ attempts: n }).where(eq(BoardIssueTable.id, issue.id)).run()
  if (n > 1)
    yield* BoardThread.write(tx, { id: `bno_rework_${issue.id}_${n}`, issue: issue.id, kind: "rework", author: "orchestra", body: cause ?? "redispatched" })
  return n
})

/**
 * Keeps attempts in step with an issue update: a new Session opens the next attempt, and a changed seat, branch or PR
 * is written to the open one. The crash reason the card had before the update decides how the old attempt ended.
 */
export const follow = Effect.fnUntraced(function* (tx: Tx, before: IssueRow, after: Fields) {
  const updated = yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, before.id)).get()
  if (!updated) return
  if (typeof after.session_id === "string" && after.session_id !== before.session_id) {
    yield* dispatch(tx, { ...updated, crash_reason: before.crash_reason ?? updated.crash_reason }, {})
    return
  }
  if (!["seat", "branch", "pr_number"].some((key) => key in after)) return
  yield* tx
    .update(BoardAttemptTable)
    .set({ seat: updated.seat, branch: updated.branch, pr_number: updated.pr_number })
    .where(and(eq(BoardAttemptTable.issue_id, before.id), isNull(BoardAttemptTable.outcome)))
    .run()
})
~~~~

## AUT3-C22

```json
{
  "block_id": "AUT3-C22",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-06"
  ],
  "body_anchors": [
    "B11"
  ],
  "requested_subject": "Base fetch/write sets/merge-tree/conflict notices, sem rebase no caminho",
  "path": "packages/core/src/board/conflicts.ts",
  "archive": "sources/packages/core/src/board/conflicts.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "06e450683e7c3428b8d466cd91696806c9ef5419",
  "source_sha256": "c27c266af8e4461d76d253f6d13f8cc8ac4d1edeb7780e9726bb445fbab8a7ba",
  "source_bytes": 8573,
  "required_source_line_ranges": [
    [
      1,
      165
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B11",
      "source_path": "packages/core/src/board/conflicts.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "06e450683e7c3428b8d466cd91696806c9ef5419",
      "source_sha256": "c27c266af8e4461d76d253f6d13f8cc8ac4d1edeb7780e9726bb445fbab8a7ba",
      "first_line": 35,
      "last_line": 43,
      "excerpt_bytes": 578,
      "excerpt_sha256": "72b4c99b953a0ee38fbf4cc3d533aa8bae1433c8f98e82f452e02a26c8d0d66b",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 154535,
      "literal_content_byte_end_exclusive": 155113
    }
  ]
}
```

```json
{"first_line":1,"last_line":34,"bytes":1449,"sha256":"0436d61afd9f89d710f2979ac36857a3ed1dee20da6e269ff085286de35b901b"}
```

~~~~typescript
export * as BoardConflicts from "./conflicts"

import { and, eq, inArray, isNull, ne } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { Board } from "@orchestra/schema/board"
import { BoardAttemptTable, BoardIssueTable, BoardNoteTable, BoardProjectTable } from "./sql"
import { changed, log, worktree } from "./shared"
import type { Changed, Git, ProjectRow, Tx } from "./shared"

// Targeted rebase notices (docs/specs/maestro-lead/merge-queue.md section 8.4): when base advances, only cards whose
// write set the merge touched are checked with `git merge-tree`, and only they get a note. The host never rebases or
// merges into a seat's worktree.

export interface Deps {
  readonly quiet: <A>(work: (tx: Tx) => Effect.Effect<A, unknown>) => Effect.Effect<A>
  readonly git: Git
  /** The project's base branch from its CI contract. */
  readonly base: (directory: string, project: ProjectRow) => Effect.Effect<string, { readonly message: string }>
  readonly publish: (changed: Changed) => Effect.Effect<void>
}

/**
 * What one base advance meant for one card: `clean` merges, `conflict` names the files that do not. `cleared` marks a
 * card that conflicted before and merges clean now.
 */
export type Notice = {
  readonly issue: Board.IssueID
  readonly base: string
  readonly touched: ReadonlyArray<string>
  readonly verdict: "clean" | "conflict"
  readonly files: ReadonlyArray<string>
  readonly cleared: boolean
}

~~~~

```json
{"first_line":44,"last_line":165,"bytes":6546,"sha256":"df72ba7f26f38bdbf4e4cbbb1cc4474744ec3158bd11940ef22b24795f272312"}
```

~~~~typescript

export function make(deps: Deps) {
  // When each project's remote base was last fetched, in process memory: a restart fetches once on the first sweep.
  const fetched = new Map<string, number>()

  const project = Effect.fnUntraced(function* (row: ProjectRow) {
    const directory = yield* deps.quiet((tx) => worktree(tx, row))
    if (!directory) return []
    const base = yield* deps.base(directory, row).pipe(Effect.orElseSucceed(() => undefined))
    if (!base) return []
    // The ref read below is local and cheap, so every sweep sees a base that any other fetch already moved.
    const now = yield* Clock.currentTimeMillis
    const last = fetched.get(row.id)
    if (last === undefined || now - last >= IDLE_FETCH || (yield* watching(row))) {
      fetched.set(row.id, now)
      yield* deps.git(directory, ["fetch", "--quiet", "--no-tags", "origin", base])
    }
    const head = (yield* deps.git(directory, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${base}`])).out
    if (!head || head === row.base_sha) return []
    // The first sighting only records where base stands: there is no earlier merge to compare with.
    if (!row.base_sha) {
      yield* deps.quiet((tx) => tx.update(BoardProjectTable).set({ base_sha: head }).where(eq(BoardProjectTable.id, row.id)).run())
      return []
    }
    const touched = (yield* deps.git(directory, ["diff", "--name-only", `${row.base_sha}..${head}`])).out.split("\n").filter(Boolean)
    const cards = yield* deps.quiet((tx) =>
      tx
        .select({ issue: BoardIssueTable, attempt: BoardAttemptTable })
        .from(BoardIssueTable)
        .innerJoin(BoardAttemptTable, eq(BoardAttemptTable.issue_id, BoardIssueTable.id))
        .where(and(eq(BoardIssueTable.project_id, row.id), inArray(BoardIssueTable.stage, [...WATCHED]), isNull(BoardAttemptTable.outcome)))
        .all(),
    )
    const notices = yield* Effect.forEach(cards, (card) =>
      Effect.gen(function* () {
        const tip = card.issue.branch
          ? (yield* deps.git(directory, ["rev-parse", "--verify", "--quiet", `refs/heads/${card.issue.branch}`])).out
          : ""
        const target = tip || card.attempt.snapshot_sha
        if (!target) return undefined
        // The declared write set plus what the card really changed, so a card with no declared set is still covered.
        const writes = [
          ...card.attempt.write_paths,
          ...(yield* deps.git(directory, ["diff", "--name-only", `${head}...${target}`])).out.split("\n").filter(Boolean),
        ]
        const overlap = touched.filter((file) => writes.some((site) => covers(site, file)))
        // A card that conflicted before is checked again on every advance, so a fix on base clears it.
        if (overlap.length === 0 && !card.attempt.conflict_base) return undefined
        const merged = yield* deps.git(directory, ["merge-tree", "--write-tree", "--name-only", "--no-messages", head, target])
        if (merged.code > 1) return undefined
        const files = merged.code === 1 ? merged.out.split("\n").slice(1).filter(Boolean) : []
        return {
          issue: card.issue.id,
          base: head,
          touched: overlap,
          verdict: files.length > 0 ? "conflict" : "clean",
          files: [...new Set(files)],
          cleared: files.length === 0 && card.attempt.conflict_base !== null,
        } satisfies Notice
      }),
    ).pipe(Effect.map((all) => all.filter((notice) => notice !== undefined)))
    const published = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        yield* tx.update(BoardProjectTable).set({ base_sha: head }).where(eq(BoardProjectTable.id, row.id)).run()
        return yield* Effect.forEach(notices, (notice) => record(tx, row, base, notice))
      }),
    )
    yield* Effect.forEach(published, (item) => (item ? deps.publish(item) : Effect.void))
    return notices
  })

  /** Whether a card in Review or Queue has an open attempt: the only reason to fetch on every sweep. */
  const watching = Effect.fnUntraced(function* (row: ProjectRow) {
    const found = yield* deps.quiet((tx) =>
      tx
        .select({ id: BoardIssueTable.id })
        .from(BoardIssueTable)
        .innerJoin(BoardAttemptTable, eq(BoardAttemptTable.issue_id, BoardIssueTable.id))
        .where(and(eq(BoardIssueTable.project_id, row.id), inArray(BoardIssueTable.stage, [...WATCHED]), isNull(BoardAttemptTable.outcome)))
        .limit(1)
        .get(),
    )
    return found !== undefined
  })

  /** Writes the card's conflict state and one note. */
  const record = Effect.fnUntraced(function* (tx: Tx, row: ProjectRow, base: string, notice: Notice) {
    const conflict = notice.verdict === "conflict"
    yield* tx
      .update(BoardAttemptTable)
      .set({ conflict_base: conflict ? notice.base : null, conflict_files: conflict ? [...notice.files] : null })
      .where(and(eq(BoardAttemptTable.issue_id, notice.issue), isNull(BoardAttemptTable.outcome)))
      .run()
    const at = `${base} at ${notice.base.slice(0, 10)}`
    const body = conflict
      ? `${at} conflicts with this card in ${notice.files.join(", ")}. Merge ${base} in the card's worktree on its next dispatch.`
      : notice.cleared
        ? `${at} merges clean with this card again.`
        : `${at} touched ${notice.touched.join(", ")}; merges clean.`
    const id = Board.NoteID.create()
    yield* tx.insert(BoardNoteTable).values({ id, issue_id: notice.issue, author: "orchestra", body }).run()
    const activity = yield* log(tx, { project: row.id, issue: notice.issue, actor: "github", action: "note.add", after: { id, author: "orchestra", body } })
    return changed(row.id, activity, notice.issue)
  })

  return {
    /** Checks every active project's base; the poll runs it every minute. A project with no watched card fetches at most every 5 minutes. */
    sweep: Effect.fnUntraced(function* () {
      const rows = yield* deps.quiet((tx) => tx.select().from(BoardProjectTable).where(ne(BoardProjectTable.status, "archived")).all())
      return (yield* Effect.forEach(rows, project, { concurrency: CONCURRENCY })).flat()
    }),
  }
}

export type Interface = ReturnType<typeof make>

/** The arsenal's `conflictVerdict` site semantics against a changed file: line ranges drop, patterns are globs. */
function covers(site: string, file: string) {
  const bare = site.replace(/:L\d+(?:-\d+)?$/, "").replace(/^\.\//, "")
  if (/(?<!\\)[*?]/.test(bare)) return new Bun.Glob(bare).match(file)
  return bare.replace(/\\([\\*?])/g, "$1") === file
}
~~~~

## AUT3-C23

```json
{
  "block_id": "AUT3-C23",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-04",
    "RE-AUT3-05",
    "RE-AUT3-06"
  ],
  "body_anchors": [
    "B07",
    "B12"
  ],
  "requested_subject": "Fetch head, record completo, Atlas writer/visibilidade/redaction/fatos host e campos ausentes",
  "path": "packages/core/src/board/queue-record.ts",
  "archive": "sources/packages/core/src/board/queue-record.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "7ade81c640d6524360161d2c018ba1038c471f2e",
  "source_sha256": "1414c1df2d7b08fc0027fe108275d4b07e343a56a56ded5f2119f196101f92d4",
  "source_bytes": 15266,
  "required_source_line_ranges": [
    [
      1,
      307
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B12",
      "source_path": "packages/core/src/board/queue-record.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "7ade81c640d6524360161d2c018ba1038c471f2e",
      "source_sha256": "1414c1df2d7b08fc0027fe108275d4b07e343a56a56ded5f2119f196101f92d4",
      "first_line": 271,
      "last_line": 296,
      "excerpt_bytes": 1090,
      "excerpt_sha256": "09447f1bc62d22d68e69c07e77ee0e85c7f2a7cee0abbcbb1aea1d3e30822d23",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 155628,
      "literal_content_byte_end_exclusive": 156718
    }
  ]
}
```

```json
{"first_line":1,"last_line":270,"bytes":13886,"sha256":"1fbb443a759bc05f72d923518b57b44e523cf2a0e2a44c1193d190090af0c1c7"}
```

~~~~typescript
import { createHash } from "crypto"
import { asc, desc, eq, inArray } from "drizzle-orm"
import { Clock, Effect, Option, Schema } from "effect"
import {
  appendAttempt,
  appendBoardEvent,
  appendCardEvent,
  appendLogbookEntry,
  appendMilestone,
  attemptNumbers,
  readBoard,
  readCard,
} from "@orchestra/atlas-boundary/record-log"
import { Board } from "@orchestra/schema/board"
import { PartTable, SessionTable } from "../session/sql"
import type { BoardRecord } from "./record"
import {
  BoardActivityTable,
  BoardAttemptTable,
  BoardBundleMemberTable,
  BoardBundleTable,
  BoardCheckTable,
  BoardDependencyTable,
  BoardEpicTable,
  BoardIssueTable,
  BoardNoteTable,
  BoardQueueTable,
} from "./sql"
import { BoardTree } from "./tree"
import { RefusedError, worktree } from "./shared"
import type { IssueRow, ProjectRow } from "./shared"
import { AUTHOR, insertNote, release } from "./queue-shared"
import type { Context } from "./queue-shared"

const Pull = Schema.Struct({
  head: Schema.Struct({ sha: Schema.String, ref: Schema.String }),
  labels: Schema.optional(Schema.Array(Schema.Struct({ name: Schema.String }))),
})
const decodePull = Schema.decodeUnknownOption(Schema.fromJsonString(Pull))

/** The PR reads and the notes and records written about a card: head, note, moved, describe, recordBundle, recordOf. */
export function makeRecord(ctx: Context) {
  const deps = ctx.deps
  const git = ctx.git

  /** Reads a PR's head through the API, fetches it, and checks the fetched commit is that head. */
  const head = Effect.fnUntraced(function* (directory: string, repo: string, pr: number) {
    const pulled = yield* deps.gh(["api", `repos/${repo}/pulls/${pr}`])
    const pull = pulled.exitCode === 0 ? Option.getOrUndefined(decodePull(pulled.stdout)) : undefined
    if (!pull) return yield* new RefusedError({ message: `PR #${pr} could not be read: ${pulled.stderr.trim() || "no head"}.` })
    yield* git(directory, ["fetch", "--quiet", "--no-tags", "origin", pull.head.ref])
    const fetched = (yield* git(directory, ["rev-parse", "--verify", "--quiet", `${pull.head.sha}^{commit}`])).out
    if (fetched !== pull.head.sha)
      return yield* new RefusedError({ message: `PR #${pr}'s head ${pull.head.sha.slice(0, 10)} is not on origin/${pull.head.ref}.` })
    return {
      sha: pull.head.sha,
      tree: (yield* git(directory, ["rev-parse", `${pull.head.sha}^{tree}`])).out,
      labels: (pull.labels ?? []).map((label) => label.name),
    }
  })

  /** A queued card whose PR head moved since it queued goes back to Review: its new head is not verified. */
  const moved = Effect.fnUntraced(function* (row: ProjectRow, issue: IssueRow, sha: string | undefined) {
    const back = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const why = `The PR head moved${sha ? ` to ${sha.slice(0, 10)}` : ""} after it queued; verify it and queue it again.`
        yield* insertNote(tx, row, issue, why)
        return yield* release(tx, row, issue, "github", "queue.remove", why)
      }),
    )
    yield* deps.publish(back)
  })

  const note = Effect.fnUntraced(function* (row: ProjectRow, issue: IssueRow, body: string) {
    const done = yield* deps.quiet((tx) => insertNote(tx, row, issue, body))
    yield* deps.publish(done)
  })

  /** Rewrites the card's PR body through the record port; unbound, the body stays as the seat wrote it. */
  const describe = Effect.fnUntraced(function* (row: ProjectRow, issue: Board.IssueID, base: string) {
    if (!deps.record || !row.github_repo) return
    const found = yield* recordOf(row, issue, base)
    if (!found?.pr) return
    yield* deps.gh(["pr", "edit", String(found.pr), "--repo", row.github_repo, "--body-file", "-"], deps.record.pr(found.record))
  })

  /**
   * Section 4.7: the commit on top of a bundle that carries the board log since the tree's last record, and each
   * member's thread, attempts, logbook entry and Orientation milestone, all through Atlas's writers. The bundle is
   * assembled from base's tip on every rebuild, so an ejected card leaves nothing behind.
   */
  const recordBundle = Effect.fnUntraced(function* (row: ProjectRow, scratch: string, issues: ReadonlyArray<IssueRow>, label: string) {
    const now = yield* Clock.currentTimeMillis
    // An unknown visibility is treated as public, so free text never reaches a tree that might be.
    const visibility = yield* deps.gh(["api", `repos/${row.github_repo}`, "--jq", ".private"])
    const redact = visibility.exitCode !== 0 || visibility.stdout.trim() !== "true"
    const ids = issues.map((issue) => issue.id)
    const found = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const attempts = yield* tx.select().from(BoardAttemptTable).where(inArray(BoardAttemptTable.issue_id, ids)).all()
        const sessions = attempts.flatMap((attempt) => (attempt.session_id ? [attempt.session_id as (typeof SessionTable.$inferSelect)["id"]] : []))
        return {
          attempts,
          activity: yield* tx
            .select()
            .from(BoardActivityTable)
            .where(eq(BoardActivityTable.project_id, row.id))
            .orderBy(asc(BoardActivityTable.time_created), asc(BoardActivityTable.id))
            .all(),
          numbers: yield* tx.select({ id: BoardIssueTable.id, number: BoardIssueTable.number }).from(BoardIssueTable).where(eq(BoardIssueTable.project_id, row.id)).all(),
          notes: yield* tx
            .select()
            .from(BoardNoteTable)
            .where(inArray(BoardNoteTable.issue_id, ids))
            .orderBy(asc(BoardNoteTable.time_created), asc(BoardNoteTable.id))
            .all(),
          checks: yield* tx.select().from(BoardCheckTable).where(inArray(BoardCheckTable.issue_id, ids)).all(),
          sessions: sessions.length ? yield* tx.select().from(SessionTable).where(inArray(SessionTable.id, sessions)).all() : [],
          parts: sessions.length
            ? yield* tx
                .select({ session: PartTable.session_id, id: PartTable.id, data: PartTable.data })
                .from(PartTable)
                .where(inArray(PartTable.session_id, sessions))
                .orderBy(asc(PartTable.id))
                .all()
            : [],
        }
      }),
    )
    const iso = (ms: number) => new Date(ms).toISOString()
    const keyOf = (issue: Board.IssueID) => found.numbers.find((item) => item.id === issue)?.number
    yield* Effect.sync(() => {
      const written = new Set(readBoard(scratch).events.map((event) => event.activity))
      found.activity
        .filter((item) => !written.has(item.id))
        .forEach((item) => {
          const number = item.issue_id ? keyOf(item.issue_id) : undefined
          appendBoardEvent(scratch, BoardTree.event(row.key, number ? `${row.key}-${number}` : undefined, item), { redact })
        })
      issues.forEach((issue) => {
        const key = `${row.key}-${issue.number}`
        // readCard's events omit text, which collapses the union; narrow on the fields themselves.
        const seen = new Set(
          readCard(scratch, key).events.flatMap((event) =>
            "thread" in event && "from" in event ? [`${event.at} ${event.thread} ${event.from}`] : [],
          ),
        )
        found.notes
          .filter((note) => note.issue_id === issue.id)
          .forEach((note) => {
            const at = iso(note.time_created)
            if (!note.kind || seen.has(`${at} ${note.kind} ${note.author}`)) return
            appendCardEvent(scratch, key, { kind: "message", thread: note.kind, from: note.author, text: note.body, at }, { redact })
          })
        const own = found.attempts.filter((attempt) => attempt.issue_id === issue.id)
        const recorded = new Set(attemptNumbers(scratch, key))
        const last = Math.max(0, ...own.map((attempt) => attempt.n))
        own
          .filter((attempt) => !recorded.has(attempt.n))
          .forEach((attempt) => {
            const session = found.sessions.find((item) => item.id === attempt.session_id)
            if (!session) return
            const parts = found.parts.filter((part) => part.session === session.id)
            appendAttempt(
              scratch,
              key,
              attempt.n,
              {
                seat: attempt.seat ?? "",
                session: session.id,
                engine: session.model?.providerID ?? "",
                model: session.model?.id ?? "",
                tokensIn: session.tokens_input,
                tokensOut: session.tokens_output + session.tokens_reasoning,
                tokensCache: session.tokens_cache_read + session.tokens_cache_write,
                toolUses: parts.filter((part) => part.data.type === "tool").length,
                wallTime: session.time_updated - session.time_created,
                retries: 0,
                reworks: attempt.n - 1,
                gates: found.checks.filter((check) => check.issue_id === issue.id).map((check) => `${check.kind} ${check.command}`),
                verdict: attempt.n === last ? "landed" : "reworked",
                // The digest of the stored transcript parts; the transcript itself travels with the session archive.
                transcriptSha: createHash("sha256").update(JSON.stringify(parts)).digest("hex") as Parameters<typeof appendAttempt>[3]["transcriptSha"],
                costMicroUsd: Math.round(session.cost * 1_000_000),
              },
              { redact, at: iso(session.time_updated) },
            )
          })
        const record = issue.record
        if (!issue.pr_number || !record) return
        appendLogbookEntry(
          scratch,
          {
            prId: String(issue.pr_number),
            at: iso(now),
            territories: [],
            shipped: record.change?.trim() || record.intent?.trim() || issue.title,
            decisions: record.decisions ?? "",
            tradeoffs: record.not_covered ?? "",
            risks: [record.risk?.level, record.risk?.breaks, record.risk?.undo && `Undo: ${record.risk.undo}`].filter(Boolean).join(". "),
            openThreads: record.follow_ups?.length ? record.follow_ups.join(", ") : "None.",
            links: [key],
          },
          { redact },
        )
        appendMilestone(scratch, { card: key, pr: issue.pr_number })
      })
    })
    yield* git(scratch, ["add", "--", ".atlas"])
    if ((yield* git(scratch, ["diff", "--cached", "--quiet"])).code === 0) return
    yield* git(scratch, [...AUTHOR, "commit", "--quiet", "-m", `chore(queue): record ${label}`])
  })

  /** The card's record as Atlas reads it: Maestro's fields plus the host's facts, checks, cost, lineage and integration. */
  const recordOf = Effect.fnUntraced(function* (row: ProjectRow, issue: Board.IssueID, base: string) {
    const now = yield* Clock.currentTimeMillis
    const found = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const card = yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, issue)).get()
        const checks = yield* tx.select().from(BoardCheckTable).where(eq(BoardCheckTable.issue_id, issue)).all()
        const attempts = yield* tx.select().from(BoardAttemptTable).where(eq(BoardAttemptTable.issue_id, issue)).orderBy(asc(BoardAttemptTable.n)).all()
        const queued = yield* tx.select().from(BoardQueueTable).where(eq(BoardQueueTable.issue_id, issue)).get()
        const bundle = yield* tx
          .select({ n: BoardBundleTable.n, status: BoardBundleTable.status, base: BoardBundleTable.base_sha, head: BoardBundleMemberTable.head_sha })
          .from(BoardBundleMemberTable)
          .innerJoin(BoardBundleTable, eq(BoardBundleTable.id, BoardBundleMemberTable.bundle_id))
          .where(eq(BoardBundleMemberTable.issue_id, issue))
          .orderBy(desc(BoardBundleTable.n))
          .get()
        const epic = card?.epic_id
          ? yield* tx.select({ number: BoardEpicTable.number }).from(BoardEpicTable).where(eq(BoardEpicTable.id, card.epic_id)).get()
          : undefined
        const depends = yield* tx
          .select({ number: BoardIssueTable.number })
          .from(BoardDependencyTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardDependencyTable.depends_on_id))
          .where(eq(BoardDependencyTable.issue_id, issue))
          .all()
        return { card, checks, attempts, queued, bundle, epic, depends, directory: yield* worktree(tx, row) }
      }),
    )
    const card = found.card
    const record = card?.record
    if (!card || !record?.risk?.level) return undefined
    const head = found.bundle?.head ?? found.queued?.head_sha
    // Against the bundle's base once bundled: after it ships, base already contains the card.
    const numstat =
      head && found.directory
        ? (yield* git(found.directory, ["diff", "--numstat", `${found.bundle?.base ?? `refs/remotes/origin/${base}`}...${head}`])).out
            .split("\n")
            .filter(Boolean)
            .map((line) => line.split("\t"))
        : []
    const state =
      card.stage === "shipped" ? "merged" : found.bundle?.status === "open" ? "bundled" : found.queued ? "queued" : "not queued"
    return {
      pr: card.pr_number,
      title: card.title,
      head: head ?? "",
      record: {
        intent: record.intent ?? "",
        change: { text: record.change ?? "", start: [] },
        decisions: record.decisions?.trim() ? [record.decisions] : [],
        notCovered: record.not_covered ?? "",
        risk: { level: record.risk.level, breaks: record.risk.breaks ?? "", notice: "", undo: record.risk.undo ?? "" },
        followUps: record.follow_ups ?? [],
        facts: {
          files: numstat.length,
          added: numstat.reduce((sum, item) => sum + (Number(item[0]) || 0), 0),
          removed: numstat.reduce((sum, item) => sum + (Number(item[1]) || 0), 0),
~~~~

```json
{"first_line":297,"last_line":307,"bytes":290,"sha256":"771b4938647448bbc48f3a156297cd5242d91cab0ce37ecc5b6ada21160c2bda"}
```

~~~~typescript
        },
        integration: {
          state,
          ...(found.bundle ? { bundle: `${row.key}-B${found.bundle.n}`, testedOn: found.bundle.base } : {}),
        },
      } satisfies BoardRecord.PrRecord,
    }
  })

  return { head, moved, note, describe, recordBundle, recordOf }
}
~~~~

## AUT3-C24

```json
{
  "block_id": "AUT3-C24",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-06"
  ],
  "body_anchors": [
    "B12"
  ],
  "requested_subject": "Port e fallback sem implementação Atlas",
  "path": "packages/core/src/board/record.ts",
  "archive": "sources/packages/core/src/board/record.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "754a3d0e90e3fc92349d3080f37ff1d9c4f1a96a",
  "source_sha256": "919161b5e11cf65f1fc0a2f857a63d45b54d56d1bd5b211d13b10794db87faed",
  "source_bytes": 2988,
  "required_source_line_ranges": [
    [
      1,
      67
    ]
  ],
  "prior_literal_ranges": []
}
```

```json
{"first_line":1,"last_line":67,"bytes":2988,"sha256":"919161b5e11cf65f1fc0a2f857a63d45b54d56d1bd5b211d13b10794db87faed"}
```

~~~~typescript
export * as BoardRecord from "./record"

// The PR record port (docs/specs/maestro-lead/merge-queue.md sections 4.5 and 6.2). Atlas renders records and writes
// commit trailers; core only gathers the facts and calls the port. The shapes and keys below are Atlas's
// (`@orchestra/atlas-boundary/record`), so its adapter binds `renderPrRecord`, `renderBundleRecord` and the trailer
// helpers without mapping. Unbound, the queue still runs: card bodies stay as they are, bundle PRs get one fixed line
// and merge commits carry no trailer.

export interface Port {
  readonly pr: (record: PrRecord) => string
  readonly bundle: (record: BundleRecord) => string
  readonly trailer: (trailer: Trailer) => string
}

/** The trailer on a card's merge commit inside a bundle; Atlas's `Trailer` keys the host knows. */
export type Trailer = { readonly WP: string; readonly Attempt: string }

export type RiskLevel = "low" | "medium" | "high"

/** Strings are Markdown written by Maestro; every other field is a host fact. Facts core has no source for stay empty. */
export type PrRecord = {
  readonly intent: string
  readonly change: { readonly text: string; readonly start: ReadonlyArray<string> }
  readonly decisions: ReadonlyArray<string>
  readonly notCovered: string
  readonly risk: { readonly level: RiskLevel; readonly breaks: string; readonly notice: string; readonly undo: string }
  readonly followUps: ReadonlyArray<string>
  readonly facts: {
    readonly files: number
    readonly added: number
    readonly removed: number
    readonly packages: ReadonlyArray<string>
    readonly ownUnits: ReadonlyArray<{ readonly unit: string; readonly skill: string }>
  }
  readonly evidence: {
    readonly doneWhen: ReadonlyArray<{ readonly line: string; readonly command: string; readonly result: string }>
    readonly reviews: ReadonlyArray<{
      readonly kind: string
      readonly verdict: string
      readonly findings: ReadonlyArray<{ readonly at: string; readonly text: string; readonly closed?: string }>
    }>
    readonly checks: ReadonlyArray<{ readonly name: string; readonly state: string; readonly url?: string }>
    readonly used: "as-user" | "unseen"
  }
  readonly cost: {
    readonly attempts: ReadonlyArray<{ readonly n: number; readonly cause: string }>
    readonly ciRuns: number
    readonly ciMinutes: number
    readonly wallMs: number
  }
  readonly lineage: {
    readonly card: string
    readonly epic?: string
    readonly dependsOn: ReadonlyArray<string>
    readonly seats: ReadonlyArray<string>
  }
  readonly integration: { readonly state: string; readonly bundle?: string; readonly testedOn?: string }
}

export type BundleRecord = {
  readonly members: ReadonlyArray<{ readonly title: string; readonly head: string; readonly record: PrRecord }>
  readonly testedOn: string
  readonly skew: number
  readonly ciRuns: number
  readonly ciMinutes: number
  readonly ejections: ReadonlyArray<{ readonly card: string; readonly cause: string }>
}
~~~~

## AUT3-C25

```json
{
  "block_id": "AUT3-C25",
  "type": "literal_source_chain",
  "canonical_request_namespace": "J1",
  "requests": [
    "RE-AUT3-06"
  ],
  "body_anchors": [
    "B12"
  ],
  "requested_subject": "Import vazio, catálogo/aplicação de eventos, exclusões, dependências e lacuna de prosa redigida",
  "path": "packages/core/src/board/tree.ts",
  "archive": "sources/packages/core/src/board/tree.ts",
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "source_git_blob_sha": "9a14e96aa37e6135380b730025756b0e80bfe661",
  "source_sha256": "68edc94c79b05a0225c269efd0a8550ba05def07d4b8f9492766676eef99a8ed",
  "source_bytes": 19770,
  "required_source_line_ranges": [
    [
      1,
      472
    ]
  ],
  "prior_literal_ranges": [
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B12",
      "source_path": "packages/core/src/board/tree.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "9a14e96aa37e6135380b730025756b0e80bfe661",
      "source_sha256": "68edc94c79b05a0225c269efd0a8550ba05def07d4b8f9492766676eef99a8ed",
      "first_line": 21,
      "last_line": 24,
      "excerpt_bytes": 453,
      "excerpt_sha256": "a313be9cf9e4f495d77f1cb8673a2816e021be21a5f753c4b6426479eb734668",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 157092,
      "literal_content_byte_end_exclusive": 157545
    },
    {
      "type": "prior_literal_range_reference",
      "anchor_id": "B12",
      "source_path": "packages/core/src/board/tree.ts",
      "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "source_git_blob_sha": "9a14e96aa37e6135380b730025756b0e80bfe661",
      "source_sha256": "68edc94c79b05a0225c269efd0a8550ba05def07d4b8f9492766676eef99a8ed",
      "first_line": 59,
      "last_line": 73,
      "excerpt_bytes": 1149,
      "excerpt_sha256": "c1110e37a157591e8856078fe88ea4c9f1af96ad139e58f9e11ee02903685761",
      "prior_document": "evidence-review.md",
      "prior_document_sha256": "3c6c199a81000e2a08d1b215c23e8cbb04e69a47aea014a046ce62e4407b2f4c",
      "literal_content_byte_start": 157676,
      "literal_content_byte_end_exclusive": 158825
    }
  ]
}
```

```json
{"first_line":1,"last_line":20,"bytes":623,"sha256":"29c4babdd9643f3cb23c6696ec7c87b6bf51bba5a105ef9ef4c5e67cc547642e"}
```

~~~~typescript
export * as BoardTree from "./tree"

import { and, eq, isNull, max } from "drizzle-orm"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Effect, Schema } from "effect"
import { Board } from "@orchestra/schema/board"
import { readBoard, type BoardEvent, type BoardEventInput } from "@orchestra/atlas-boundary/record-log"
import {
  BoardActivityTable,
  BoardDecisionTable,
  BoardDependencyTable,
  BoardEpicTable,
  BoardIssueTable,
  BoardNoteTable,
  BoardProjectTable,
  BoardQuestionTable,
  BoardStepTable,
} from "./sql"
import type { ActivityRow, Fields, Tx } from "./shared"

~~~~

```json
{"first_line":25,"last_line":58,"bytes":1476,"sha256":"0d3396c1233010c2200b7b7bc73a529f6cf32e9995e21d19620e7ea6dc41880a"}
```

~~~~typescript

export class UnknownActionError extends Schema.TaggedErrorClass<UnknownActionError>()("BoardTree.UnknownActionError", {
  activity: Schema.String,
  action: Schema.String,
}) {}

export class ReplayError extends Schema.TaggedErrorClass<ReplayError>()("BoardTree.ReplayError", {
  activity: Schema.String,
  message: Schema.String,
}) {}

// Free text a board write may hold; the log keeps it out of `before` and `after` so a public tree can drop it.
const PROSE = ["description", "body", "reason", "text", "question", "answer", "answer_text", "record", "cause", "options", "cost_of_waiting", "paused_reason", "crash_reason"]
// A prose value that is not a string travels as JSON under this suffix, so import can parse it back.
const JSON_SUFFIX = ".json"

/** The board event for one activity row; `issue` is the card key when the row names an issue. */
export function event(project: string, issue: string | undefined, row: ActivityRow): BoardEventInput {
  const text = prose(row)
  return {
    activity: row.id,
    project,
    ...(issue ? { issue } : {}),
    actor: row.actor,
    action: row.action,
    at: new Date(row.time_created).toISOString(),
    ...(row.before ? { before: structure(row.before) } : {}),
    ...(row.after ? { after: structure(row.after) } : {}),
    ...(row.undoes ? { undoes: row.undoes } : {}),
    ...(Object.keys(text).length > 0 ? { text } : {}),
  }
}

/** Rebuilds the board of an empty database from the record tree at `repoPath`. */
~~~~

```json
{"first_line":74,"last_line":472,"bytes":16069,"sha256":"4c44241aef6cff7e055746eb577dd0027f79f5a22ea9b43375ac8e6e58b1e001"}
```

~~~~typescript
    if (!project) return yield* new ReplayError({ activity: item.activity, message: `Project ${item.project} does not exist.` })
    yield* tx
      .insert(BoardActivityTable)
      .values({
        id: item.activity as Board.ActivityID,
        project_id: project.id,
        issue_id: item.issue ? (cards.get(item.issue) ?? null) : null,
        actor: item.actor as Board.Actor,
        action: item.action as Board.Action,
        // A public tree carries only the prose's hash; the gap stays visible in the log.
        reason: redacted ? `[redacted ${item.textHash}]` : (item.text?.reason ?? null),
        before,
        after,
        undoes: (item.undoes as Board.ActivityID | undefined) ?? null,
        time_created: ctx.at,
      })
      .run()
    if (item.undoes)
      yield* tx
        .update(BoardActivityTable)
        .set({ undone_by: item.activity as Board.ActivityID })
        .where(eq(BoardActivityTable.id, item.undoes as Board.ActivityID))
        .run()
  }
  return events.length
})

type Context = {
  readonly tx: Tx
  readonly item: BoardEvent
  readonly before: Fields | null
  readonly after: Fields | null
  readonly at: number
  readonly cards: Map<string, Board.IssueID>
  project: typeof BoardProjectTable.$inferSelect | undefined
}

const PROJECT_COLUMNS = ["name", "goal", "target_date", "github_repo", "budget_usd", "status", "paused_reason"]
const EPIC_COLUMNS = ["title", "goal", "position", "status"]
const ISSUE_COLUMNS = [
  "title",
  "body",
  "type",
  "epic_id",
  "estimate",
  "seat",
  "session_id",
  "branch",
  "pr_number",
  "stage",
  "position",
  "stage_entered_at",
  "attempts",
  "crash_reason",
  "guardrail_rule",
  "area",
  "order",
  "record",
  "hold_before_merge",
  "paused",
  "github_number",
]

const nothing = (_: Context) => Effect.void

// One applier per action. An action missing here fails the import by name; none is skipped.
const APPLIERS: Record<Board.Action, (ctx: Context) => Effect.Effect<void, ReplayError | EffectDrizzleQueryError>> = {
  "project.upsert": Effect.fnUntraced(function* (ctx) {
    if (ctx.project) return yield* updateProject(ctx)
    yield* ctx.tx
      .insert(BoardProjectTable)
      .values({
        id: Board.ProjectID.create(),
        key: ctx.item.project,
        name: String(ctx.after?.name ?? ctx.item.project),
        goal: String(ctx.after?.goal ?? ""),
        target_date: (ctx.after?.target_date as number | null | undefined) ?? null,
        github_repo: (ctx.after?.github_repo as string | null | undefined) ?? null,
        status: "active",
        github_state: "off",
        next_issue_number: 1,
        next_epic_number: 1,
      })
      .run()
  }),
  "epic.upsert": Effect.fnUntraced(function* (ctx) {
    const project = yield* requireProject(ctx)
    const id = String(ctx.after?.id ?? ctx.before?.id) as Board.EpicID
    if (ctx.before) {
      yield* ctx.tx.update(BoardEpicTable).set(pick(ctx.after, EPIC_COLUMNS)).where(eq(BoardEpicTable.id, id)).run()
      return
    }
    const number = Number(ctx.after?.number)
    yield* ctx.tx
      .insert(BoardEpicTable)
      .values({
        id,
        project_id: project.id,
        number,
        title: String(ctx.after?.title ?? ""),
        goal: String(ctx.after?.goal ?? ""),
        position: Number(ctx.after?.position ?? number),
        status: (ctx.after?.status as Board.Epic["status"] | undefined) ?? "open",
      })
      .run()
    yield* ctx.tx
      .update(BoardProjectTable)
      .set({ next_epic_number: Math.max(project.next_epic_number, number + 1) })
      .where(eq(BoardProjectTable.id, project.id))
      .run()
  }),
  "issue.create": Effect.fnUntraced(function* (ctx) {
    const project = yield* requireProject(ctx)
    const number = Number(ctx.after?.number)
    const id = Board.IssueID.create()
    const stage = (ctx.after?.stage as Board.Stage | undefined) ?? "backlog"
    const last = yield* ctx.tx
      .select({ position: max(BoardIssueTable.position) })
      .from(BoardIssueTable)
      .where(and(eq(BoardIssueTable.project_id, project.id), eq(BoardIssueTable.stage, stage)))
      .get()
    yield* ctx.tx
      .insert(BoardIssueTable)
      .values({
        title: "",
        body: "",
        type: "feature",
        position: (last?.position ?? 0) + 1,
        stage_entered_at: ctx.at,
        ...pick(ctx.after, ISSUE_COLUMNS),
        id,
        project_id: project.id,
        number,
        stage,
      } as typeof BoardIssueTable.$inferInsert)
      .run()
    yield* ctx.tx
      .update(BoardProjectTable)
      .set({ next_issue_number: Math.max(project.next_issue_number, number + 1) })
      .where(eq(BoardProjectTable.id, project.id))
      .run()
    ctx.cards.set(`${project.key}-${number}`, id)
    if (Array.isArray(ctx.after?.depends_on)) yield* dependencies(ctx, id, ctx.after.depends_on)
  }),
  "issue.update": (ctx) => issueFields(ctx),
  "issue.move": (ctx) => issueFields(ctx),
  "intake.accept": (ctx) => issueFields(ctx),
  "intake.decline": (ctx) => issueFields(ctx),
  "hold.set": (ctx) => issueFields(ctx),
  "queue.add": (ctx) => issueFields(ctx),
  "queue.remove": (ctx) => issueFields(ctx),
  "bundle.merge": (ctx) => issueFields(ctx),
  // A dissolve by eject sends the card back to review; a plain dissolve names only the bundle.
  "bundle.dissolve": (ctx) => issueFields(ctx),
  "bundle.cut": nothing,
  "pause.set": (ctx) => (ctx.item.issue ? issueFields(ctx) : updateProject(ctx)),
  "archive.set": (ctx) => updateProject(ctx),
  "steps.set": Effect.fnUntraced(function* (ctx) {
    yield* steps(ctx, yield* requireIssue(ctx), ctx.after?.steps)
  }),
  "question.ask": Effect.fnUntraced(function* (ctx) {
    const project = yield* requireProject(ctx)
    yield* ctx.tx
      .insert(BoardQuestionTable)
      .values({
        id: String(ctx.after?.id) as Board.QuestionID,
        project_id: project.id,
        issue_id: ctx.item.issue ? yield* requireIssue(ctx) : null,
        epic_id: (ctx.after?.epic_id as Board.EpicID | null | undefined) ?? null,
        text: String(ctx.after?.text ?? ""),
        options: (ctx.after?.options as Board.Question["options"] | undefined) ?? [],
        recommended: String(ctx.after?.recommended ?? ""),
        cost_of_waiting: (ctx.after?.cost_of_waiting as string | null | undefined) ?? null,
        kind: (ctx.after?.kind as string | null | undefined) ?? null,
        blocking: Boolean(ctx.after?.blocking),
        status: "open",
      })
      .run()
  }),
  "question.withdraw": Effect.fnUntraced(function* (ctx) {
    yield* ctx.tx
      .update(BoardQuestionTable)
      .set({ status: ctx.after?.status === "withdrawn" ? "withdrawn" : "open" })
      .where(eq(BoardQuestionTable.id, String(ctx.after?.id ?? ctx.before?.id) as Board.QuestionID))
      .run()
  }),
  // One action, three writes: a first answer, a changed answer that supersedes the standing decision, and Maestro
  // recording a decision's outcome.
  "question.answer": Effect.fnUntraced(function* (ctx) {
    const question = String(ctx.after?.id) as Board.QuestionID
    const decision = String(ctx.after?.decision) as Board.DecisionID
    if (ctx.after && "outcome" in ctx.after) {
      yield* ctx.tx
        .update(BoardDecisionTable)
        .set({ outcome: (ctx.after.outcome as string | null) ?? null, outcome_at: ctx.at })
        .where(eq(BoardDecisionTable.id, decision))
        .run()
      return
    }
    const row = yield* ctx.tx.select().from(BoardQuestionTable).where(eq(BoardQuestionTable.id, question)).get()
    if (!row) return yield* new ReplayError({ activity: ctx.item.activity, message: `Question ${question} does not exist.` })
    const chosen = String(ctx.after?.answer_option ?? "")
    const chosenText = (ctx.after?.answer_text as string | null | undefined) ?? null
    const standing = yield* ctx.tx
      .select({ id: BoardDecisionTable.id })
      .from(BoardDecisionTable)
      .where(and(eq(BoardDecisionTable.question_id, question), isNull(BoardDecisionTable.overturned_by_id)))
      .get()
    yield* ctx.tx
      .update(BoardQuestionTable)
      .set({ status: "answered", answer_option: chosen, answer_text: chosenText, answered_at: ctx.at })
      .where(eq(BoardQuestionTable.id, question))
      .run()
    yield* ctx.tx
      .insert(BoardDecisionTable)
      .values({
        id: decision,
        project_id: row.project_id,
        issue_id: row.issue_id,
        epic_id: row.epic_id,
        question_id: question,
        question: row.text,
        options: row.options,
        recommended: row.recommended,
        chosen,
        chosen_text: chosenText,
        answered_by: "owner",
        answered_at: ctx.at,
        supersedes_id: standing?.id ?? null,
      })
      .run()
    if (standing)
      yield* ctx.tx.update(BoardDecisionTable).set({ overturned_by_id: decision }).where(eq(BoardDecisionTable.id, standing.id)).run()
  }),
  "note.add": Effect.fnUntraced(function* (ctx) {
    yield* ctx.tx
      .insert(BoardNoteTable)
      .values({
        id: String(ctx.after?.id) as Board.NoteID,
        issue_id: yield* requireIssue(ctx),
        author: String(ctx.after?.author ?? "owner"),
        body: String(ctx.after?.body ?? ""),
      })
      .run()
  }),
  "note.edit": Effect.fnUntraced(function* (ctx) {
    yield* ctx.tx
      .update(BoardNoteTable)
      .set({ body: String(ctx.after?.body ?? "") })
      .where(eq(BoardNoteTable.id, String(ctx.after?.id) as Board.NoteID))
      .run()
  }),
  "note.delete": Effect.fnUntraced(function* (ctx) {
    yield* ctx.tx
      .delete(BoardNoteTable)
      .where(eq(BoardNoteTable.id, String(ctx.before?.id) as Board.NoteID))
      .run()
  }),
  // Attachment bytes and secrets stay out of the log on purpose, so there is nothing to restore.
  "attachment.add": nothing,
  "attachment.remove": nothing,
  // An overwrite only marks the issue for the next push; the board's own fields did not change.
  "github.overwrite": nothing,
  // Sync state is re-derived by the next GitHub sync.
  "github.state": nothing,
  // An undo carries the target's earlier fields in `after`; it restores them the way the board's own undo does.
  undo: Effect.fnUntraced(function* (ctx) {
    const target = yield* ctx.tx
      .select({ action: BoardActivityTable.action, before: BoardActivityTable.before, after: BoardActivityTable.after })
      .from(BoardActivityTable)
      .where(eq(BoardActivityTable.id, String(ctx.item.undoes) as Board.ActivityID))
      .get()
    if (!target) return yield* new ReplayError({ activity: ctx.item.activity, message: `Undo target ${ctx.item.undoes} is not in the log.` })
    if (target.action === "question.withdraw") {
      yield* ctx.tx
        .update(BoardQuestionTable)
        .set({ status: ctx.after?.status === "withdrawn" ? "withdrawn" : "open" })
        .where(eq(BoardQuestionTable.id, String(target.after?.id ?? target.before?.id) as Board.QuestionID))
        .run()
      return
    }
    if (target.action === "epic.upsert") {
      const id = String(target.after?.id ?? target.before?.id) as Board.EpicID
      if (!ctx.after) return yield* Effect.asVoid(ctx.tx.delete(BoardEpicTable).where(eq(BoardEpicTable.id, id)).run())
      yield* ctx.tx.update(BoardEpicTable).set(pick(ctx.after, EPIC_COLUMNS)).where(eq(BoardEpicTable.id, id)).run()
      return
    }
    if (!ctx.item.issue || !ctx.after) return
    const issue = yield* requireIssue(ctx)
    if (Array.isArray(ctx.after.steps)) yield* steps(ctx, issue, ctx.after.steps)
    if (Array.isArray(ctx.after.depends_on)) yield* dependencies(ctx, issue, ctx.after.depends_on)
    yield* issueFields(ctx)
  }),
}

const issueFields = Effect.fnUntraced(function* (ctx: Context) {
  if (!ctx.item.issue) return
  const issue = yield* requireIssue(ctx)
  if (Array.isArray(ctx.after?.depends_on) && ctx.item.action === "issue.update") yield* dependencies(ctx, issue, ctx.after.depends_on)
  const columns = pick(ctx.after, ISSUE_COLUMNS)
  if (Object.keys(columns).length === 0) return
  yield* ctx.tx.update(BoardIssueTable).set(columns).where(eq(BoardIssueTable.id, issue)).run()
})

const updateProject = Effect.fnUntraced(function* (ctx: Context) {
  const project = yield* requireProject(ctx)
  const columns = pick(ctx.after, PROJECT_COLUMNS)
  if (Object.keys(columns).length === 0) return
  yield* ctx.tx.update(BoardProjectTable).set(columns).where(eq(BoardProjectTable.id, project.id)).run()
})

const steps = Effect.fnUntraced(function* (ctx: Context, issue: Board.IssueID, value: unknown) {
  yield* ctx.tx.delete(BoardStepTable).where(eq(BoardStepTable.issue_id, issue)).run()
  const list = Array.isArray(value) ? (value as Board.Step[]) : []
  if (list.length === 0) return
  yield* ctx.tx
    .insert(BoardStepTable)
    .values(
      list.map((step, position) => ({
        id: Board.StepID.create(),
        issue_id: issue,
        position,
        title: step.title,
        status: step.status,
        now: step.now ?? null,
      })),
    )
    .run()
})

const dependencies = Effect.fnUntraced(function* (ctx: Context, issue: Board.IssueID, refs: ReadonlyArray<unknown>) {
  const project = yield* requireProject(ctx)
  yield* ctx.tx.delete(BoardDependencyTable).where(eq(BoardDependencyTable.issue_id, issue)).run()
  // Older rows logged a bare number; the board resolved it inside the card's own project.
  const targets = refs.flatMap((ref) => {
    const key = /^\d+$/.test(String(ref)) ? `${project.key}-${ref}` : String(ref)
    const id = ctx.cards.get(key)
    return id && id !== issue ? [{ issue_id: issue, depends_on_id: id }] : []
  })
  if (targets.length > 0) yield* ctx.tx.insert(BoardDependencyTable).values(targets).run()
})

const projectOf = Effect.fnUntraced(function* (tx: Tx, item: BoardEvent) {
  return yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, item.project)).get()
})

const requireProject = Effect.fnUntraced(function* (ctx: Context) {
  const project = yield* projectOf(ctx.tx, ctx.item)
  if (!project) return yield* new ReplayError({ activity: ctx.item.activity, message: `Project ${ctx.item.project} does not exist.` })
  return project
})

const requireIssue = Effect.fnUntraced(function* (ctx: Context) {
  const issue = ctx.item.issue ? ctx.cards.get(ctx.item.issue) : undefined
  if (!issue) return yield* new ReplayError({ activity: ctx.item.activity, message: `Card ${ctx.item.issue} does not exist.` })
  return issue
})

function pick(fields: Fields | null, columns: ReadonlyArray<string>) {
  return Object.fromEntries(Object.entries(fields ?? {}).filter((entry) => columns.includes(entry[0])))
}

function structure(value: Fields) {
  return Object.fromEntries(Object.entries(value).filter((entry) => !PROSE.includes(entry[0])))
}

function prose(row: Pick<ActivityRow, "reason" | "before" | "after">) {
  const sides = [
    ["before", row.before],
    ["after", row.after],
  ] as const
  return Object.fromEntries([
    ...(row.reason ? [["reason", row.reason]] : []),
    ...sides.flatMap((side) =>
      Object.entries(side[1] ?? {})
        .filter((entry) => PROSE.includes(entry[0]) && entry[1] !== undefined)
        .map((entry) =>
          typeof entry[1] === "string" ? [`${side[0]}.${entry[0]}`, entry[1]] : [`${side[0]}.${entry[0]}${JSON_SUFFIX}`, JSON.stringify(entry[1])],
        ),
    ),
  ])
}

// Puts a side's prose back into its structure. Without text (a public tree) the prose keys stay absent.
function merge(side: BoardEvent["before"], text: BoardEvent["text"], name: "before" | "after"): Fields | null {
  if (!side && !Object.keys(text ?? {}).some((key) => key.startsWith(`${name}.`))) return null
  const prefix = `${name}.`
  return {
    ...side,
    ...Object.fromEntries(
      Object.entries(text ?? {})
        .filter((entry) => entry[0].startsWith(prefix))
        .map((entry) => {
          const key = entry[0].slice(prefix.length)
          return key.endsWith(JSON_SUFFIX) ? [key.slice(0, -JSON_SUFFIX.length), JSON.parse(entry[1])] : [key, entry[1]]
        }),
    ),
  }
}
~~~~
