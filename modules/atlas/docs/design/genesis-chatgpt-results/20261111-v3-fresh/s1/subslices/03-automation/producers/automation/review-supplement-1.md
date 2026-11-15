# Suplemento literal de revisão 1 — AUTOMATION-L1

```json
{
  "type": "documentary_transport_header",
  "task": "AUTOMATION-L1",
  "review_batch": "automation-1",
  "body_sha256": "2ed7670affc680005840d0918489cb1ac36e1c5a4021defcc57ae44186ae7459",
  "body_sections": [
    0,
    1,
    2,
    3
  ],
  "source_commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "requests": [
    "RE-AUT1-01",
    "RE-AUT1-02",
    "RE-AUT1-03",
    "RE-AUT1-04",
    "RE-AUT1-05",
    "RE-AUT1-06"
  ],
  "coverage_projection": "review-supplement-1-index.json#/shared_population_reconciliation",
  "coverage_projection_reuse": "One 204-row projection, shared by both judges and later review batches",
  "source_text": "literal_unmodified",
  "metadata": "typed_mechanical_projection",
  "tests": "NOT_RUN",
  "provider_execution": "NOT_RUN",
  "oracle_access": false,
  "body_v1_changed": false,
  "cross_scope_sources": "raw_source_only; S1-04 ownership retained; outside population 204",
  "proposition_authority": "producer evidence submission; no judgment or acceptance"
}
```

## AUT1-H01

```json
{"block_id":"AUT1-H01","type":"literal_source_excerpt","requests":["RE-AUT1-01"],"source_category":"historical_body","archive":"../../inputs/history/bodies/automation.md","repository_path":"modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/bodies/automation.md","commit":"a8df22ae3a140c58c63f62ce2a634c84f415c943","source_git_blob_sha":"83679961541fcbd73e5a79d8fea1ff14fc1aa4cb","source_sha256":"83d483f7f56a0e3dfa7a29e89fea01b29d1b5529e36693b20a06fe9cc0db8b88","source_bytes":4377,"body_anchors":[],"requested_subject":"Corpo histórico integral de 4.377 bytes"}
```

```json
{"first_line":1,"last_line":28,"bytes":4377,"sha256":"83d483f7f56a0e3dfa7a29e89fea01b29d1b5529e36693b20a06fe9cc0db8b88"}
```

~~~~markdown
# Actions admission, scheduled dispatch and Board decision records

Layer: **L1 — pinned factual basis**. Need: `flow`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

Actions is Location-scoped and resolves repository bindings only on first operation, allowing non-Git Locations to boot. GitHub and GitLab readers are selected from the binding; authoring, resources and commands have separate dispatch paths. Execution clones caller data and compares the admitted intent kind and any expected endpoint target fields before performing. One-time command output is validated separately from its durable operation acknowledgement. [1,2]

`ActionsOperations.prepare` requires a real absolute Location and signed-in account, strictly decodes intent, binds provider/account/revision/Location/client identity, reconciles exact retries and refuses conflicting reuse. It sweeps expiry independently, checks ledger/unknown-outcome capacity, and stores a prepared row inside an immediate transaction. Execution can claim only a still-prepared, unexpired matching row as `sending`; other states return their receipt. The provider action runs outside the SQL transaction with a deadline and disposal signal. Failure without definitive evidence becomes `outcome_unknown`; finalization records the outcome. `reconcile` observes only accepted or unknown rows and never calls the perform callback. This separates command admission from confirmed external outcome. [3]

The scheduler claims due slots transactionally and dispatches through normal `SessionV2.create` then durable `prompt`. Legacy runs select Maestro in the task directory. Capability runs check owner agent/placement and current claim before Session creation and again before admission. A documented race remains between the last check and prompt admission: a revoked claim may still receive an honest `started` receipt, including one run beyond a repeat limit. Started proves admission, not completion of the Session's model/tool work. [4]

Stale dispatch claims are selected after the 120-second lease. Takeover compares exact owner/claim time, checks whether the prompt reached `SessionInput`, voids unadmitted claims for replanning, and retries already admitted identity only to reconcile and wake. A failed legacy due slot is consumed rather than silently retried. The separately composed daemon ticks at boot and waits for due times or writes; failures are logged and later passes continue. This SQL dispatch lease is distinct from the process-local Session execution coordinator. [4]

Board answers produce decision records. Changing a standing answer rejects an already-overturned record, invalid option or unchanged answer, inserts a new record with `supersedes_id`, links the old record with `overturned_by_id`, updates the current question answer and appends activity. Recording an outcome addresses the current standing decision and logs Maestro's reason. It preserves answer lineage without claiming that a recorded outcome independently verifies the underlying work. [5]

## Normative intent and gaps

These services expose different meanings for preparation, sending, admission, acknowledgement, observation and recorded decisions. They are not interchangeable “done” statuses. Provider-specific Actions transport/reconciliation, scheduler cadence calculations and Board issue/epic automation are deeper family members not exhaustively interpreted here. No external workflow, schedule, Board write or product test ran.

## Source anchors

- **1.** `packages/core/src/actions.ts:4f81df84763bd63e7680de8fd40c60b583ef68ca` — Location binding, reader routing and execute, lines 49–85,171–216.
- **2.** `packages/core/src/actions/contract.ts:62521cbd3f4860049c3480a2bf9f2ed650c6c9f8` — transport, adapter and operation boundaries, lines 8–88.
- **3.** `packages/core/src/actions/operations.ts:83c0b9e03b063bd59bc2d30317f7de85cbb99ee4` — prepare, execution CAS and observation-only reconcile, lines 16–203.
- **4.** `packages/core/src/scheduled-task.ts:0a89bbdc576091ca01445e45e1500ed4008898a9` — claims, admission race, takeover and daemon, lines 23–32,121–244,272–320,481–504.
- **5.** `packages/core/src/board/decision.ts:4b219f5b62517b2c4f9749a1a99e6257cfeff167` — decision history, change and outcome, lines 11–128.
~~~~

## AUT1-H02

```json
{"block_id":"AUT1-H02","type":"literal_source_excerpt","requests":["RE-AUT1-01"],"source_category":"historical_gap_record","archive":"../../inputs/history/a3-dossier.md","repository_path":"modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/review-packets/l1-a3-v1-dossier.md","commit":"a8df22ae3a140c58c63f62ce2a634c84f415c943","source_git_blob_sha":"285e56c1680153ce75c71fd99bcf9455bde70d4d","source_sha256":"36416073165d59eec9c7d847a26f414d855cc2a40758d548f4dd49669dccc5d4","source_bytes":177076,"body_anchors":[],"requested_subject":"Gaps originais e continuidade registrada"}
```

```json
{"first_line":414,"last_line":428,"bytes":1174,"sha256":"759f3cc9ca870b74857b1e22f50912e64c697487895e849084da32acd3d9a1f2"}
```

~~~~markdown
### `s1.core.automation` — `flow`

Corpo congelado: `bodies/automation.md`, SHA256 `83d483f7f56a0e3dfa7a29e89fea01b29d1b5529e36693b20a06fe9cc0db8b88`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Provider-specific Actions commands/reconciliation, cadence policy and remaining Board workflows need their leaf sources when changed.
- Scheduled dispatch has an explicit revocation-to-admission race; admission is not Session completion.
- No external actions or product runtime checks executed.

**Inputs originais:** `file:packages/core/src/actions.ts`, `file:packages/core/src/actions/contract.ts`, `file:packages/core/src/actions/operations.ts`, `file:packages/core/src/scheduled-task.ts`, `file:packages/core/src/board/decision.ts`.

**Explicitação nova nesta revisão:** Estados distintos de Actions, dispatch admitido e linhagem de Board. Provider commands/readback, cadence/SQL e workflows Board restantes exigem seus leaves; a race de revogação não está resolvida.

**Uso dependente bloqueado:** Conclusão de workflow/Session, remoção de ambiguidade externa e limite repeat estrito não podem ser derivados de prepared/started/recorded.
~~~~

## AUT1-H03

```json
{"block_id":"AUT1-H03","type":"literal_source_excerpt","requests":["RE-AUT1-01"],"source_category":"historical_authority_record","archive":"../../inputs/history/a4-dossier.md","repository_path":"modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/review-packets/l1-a4-v1-dossier.md","commit":"a8df22ae3a140c58c63f62ce2a634c84f415c943","source_git_blob_sha":"6f872ea0e22097d8084fd587f585751a436f607e","source_sha256":"83b544ac46f99b2bf3585ff4e607bcd403e49eb20dd128deb5b6a029a772ead0","source_bytes":155061,"body_anchors":[],"requested_subject":"Regras históricas de leitura de folhas e preservação de estado"}
```

```json
{"first_line":299,"last_line":301,"bytes":1182,"sha256":"9bdfe088bc6a5d141fa62840650ac10bf2860f72274f37ab42a45f1c995c9549"}
```

~~~~markdown
Decisive implementation/control-flow and normative reads back the claims actually made in the other bodies. An unread substantive implementation is explicitly classified `representative_family_boundary`, never silently converted to support or semantic acceptance. Exact operation-specific leaf behavior remains a deeper-read obligation. This bounded L1 grouping covers the entry, authority and lifecycle questions; it does not certify every line of every member.

Historical migrations retain compatibility authority under the inspected migration engine. Generated schema/export/support files remain tied to their generators and owning contracts. The vendored Copilot family remains an upstream compatibility boundary. Tests, fixture trees, assets and harnesses have grouped validation disposition; their existence proves no executed result. Runtime pins and bundled text are change-sensitive inputs even when their leaf content is not interpreted here. Historical phase plans, runtime-closure qualification documents and old V2 sketches are retained as historical/normative inputs to compare with current code, never promoted by filename to current behavior or a fresh PASS. [1,3]
~~~~

```json
{"first_line":347,"last_line":349,"bytes":796,"sha256":"4567232af813afc727012a2d9d5600ca5804e3888b601261625e6c4172ceaf89"}
```

~~~~markdown
As sete orientações capturadas permanecem orientações no congelado: `docs/guides/agents.md`, `docs/guides/session-requests.md`, `docs/specs/v2/tools.md`, `packages/core/src/board/tools.ts`, `packages/core/src/session/README.md`, `packages/core/src/session/runner/execution-host.ts` e `packages/core/src/session/runner/index.ts`. Um trecho complementar eventualmente lido agora não apaga esse estado histórico.

**Lacuna obrigatória:** se uma pergunta L1 exigida depende de um leaf não lido, a lacuna permanece aberta nesse ponto. Não se presume que o requisito possa ser adiado por conveniência. O mesmo vale para a família util, sem fonte própria lida, e para documentos históricos ainda não confrontados. A suficiência do conjunto continua sujeita aos dois juízes da principal.
~~~~

## AUT1-H04

```json
{
  "type": "mechanical_json_projection",
  "requests": [
    "RE-AUT1-01"
  ],
  "source": {
    "commit": "a8df22ae3a140c58c63f62ce2a634c84f415c943",
    "path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/revisions/a-l1-evidence-v1/coverage-needs-projection.json",
    "git_blob_sha": "2e91d0f916dfa95a2dd0ef7ae74ff8c1bb427045",
    "byte_length": 726892,
    "sha256": "05485c4bd0ac9c76814e44537788818bbcf1fbcbfb87dd8063ce30bf1a67e0cf",
    "archive": "../../inputs/history/coverage-needs-projection.json"
  },
  "selector": "artifacts[original_artifact.key == \"s1.core.automation\"]",
  "record": {
    "original_artifact": {
      "key": "s1.core.automation",
      "scope": "orchestra.s1",
      "title": "Actions admission, scheduled dispatch and Board decision records",
      "layer": 1,
      "need": "flow",
      "body": {
        "path": "bodies/automation.md",
        "encoding": "utf-8",
        "byte_length": 4377,
        "sha256": "83d483f7f56a0e3dfa7a29e89fea01b29d1b5529e36693b20a06fe9cc0db8b88"
      },
      "authority": {
        "scope": "orchestra.s1",
        "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
        "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
      },
      "validity": "supported",
      "gaps": [
        "Provider-specific Actions commands/reconciliation, cadence policy and remaining Board workflows need their leaf sources when changed.",
        "Scheduled dispatch has an explicit revocation-to-admission race; admission is not Session completion.",
        "No external actions or product runtime checks executed."
      ],
      "evidence": [
        {
          "payload_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/review-evidence-compact.md",
          "sha256": "1d28ad12ce7c525d230e42486b6bccd691104d5e6acd4a815728dda7b8ed8676"
        },
        {
          "payload_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/excerpt-map.json",
          "sha256": "301173d05efb7a14a5fedfafbf6755d34e413100dadd7f21560a62e0f4cff471"
        }
      ],
      "input_keys": [
        "file:packages/core/src/actions.ts",
        "file:packages/core/src/actions/contract.ts",
        "file:packages/core/src/actions/operations.ts",
        "file:packages/core/src/scheduled-task.ts",
        "file:packages/core/src/board/decision.ts"
      ],
      "source_refs": [
        {
          "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
          "path": "packages/core/src/actions.ts",
          "git_blob_sha": "4f81df84763bd63e7680de8fd40c60b583ef68ca",
          "sha256": "08c5f306bc1c53b978a4254eba0fc708d9a4bfbb30fb63ead23c237f359fceef"
        },
        {
          "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
          "path": "packages/core/src/actions/contract.ts",
          "git_blob_sha": "62521cbd3f4860049c3480a2bf9f2ed650c6c9f8",
          "sha256": "c69997923b14da057a5cab4b3e9077884263d43c02f98dee1da44fedf65ae9bc"
        },
        {
          "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
          "path": "packages/core/src/actions/operations.ts",
          "git_blob_sha": "83c0b9e03b063bd59bc2d30317f7de85cbb99ee4",
          "sha256": "f4180bfeabef99c0eaddace3f1da7242fb8dacd7d63fb948b84cc014f59a89d4"
        },
        {
          "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
          "path": "packages/core/src/scheduled-task.ts",
          "git_blob_sha": "0a89bbdc576091ca01445e45e1500ed4008898a9",
          "sha256": "8c204bd55a8cf8fd1dbddc232f5dfa84b9190822d074ccc72e85594e457af12b"
        },
        {
          "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
          "path": "packages/core/src/board/decision.ts",
          "git_blob_sha": "4b219f5b62517b2c4f9749a1a99e6257cfeff167",
          "sha256": "7fdd5f2d2d0dfa0414b70b870e4ff75ca62fe7af36c62c90e583663af8833b43"
        }
      ],
      "recipe_ref": {
        "payload_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/recipe.json",
        "sha256": "79c21a0eb94bf9eb6927984134592a688d3b028c2213e5552bb1017ae50bd8fb"
      },
      "build_dependencies": [],
      "navigation": [],
      "producer_request_ref": {
        "payload_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/request.txt",
        "sha256": "5ade453a557acd559e6796cab8f6ed42d5141ddf668d3c6f06169e7ce8840d7d"
      },
      "producer_response_ref": {
        "payload_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/response.md",
        "sha256": "79a01b28b5df5d99a60f8dfd5af2b223671aec009ec9e77ae755cf38096ff12d"
      },
      "semantic_review_refs": [],
      "runtime_receipt_refs": []
    },
    "derived_population_routing": {
      "count": 204,
      "families": [
        "actions",
        "board",
        "scheduled-task"
      ],
      "by_depth": {
        "decisive_source_read": 6,
        "grouped_validation_inventory": 89,
        "orientation_read": 1,
        "representative_family_boundary": 108
      },
      "by_read_status": {
        "captured_targeted_orientation_only": 1,
        "not_read": 197,
        "semantically_read_decisive_ranges": 6
      },
      "coverage_group_ids": [
        "G001",
        "G002",
        "G003",
        "G004",
        "G005",
        "G019",
        "G020",
        "G021",
        "G022",
        "G115",
        "G116",
        "G117",
        "G118"
      ]
    },
    "source_reference_families": [
      "actions",
      "board",
      "scheduled-task"
    ],
    "clarification_authored_in_this_revision": {
      "need_boundary": "Estados distintos de Actions, dispatch admitido e linhagem de Board.",
      "mandatory_followup": "Provider commands/readback, cadence/SQL e workflows Board restantes exigem seus leaves; a race de revogação não está resolvida.",
      "blocked_dependent_claims": "Conclusão de workflow/Session, remoção de ambiguidade externa e limite repeat estrito não podem ser derivados de prepared/started/recorded.",
      "registered_dependent_artifact_keys": null,
      "note": "No L2–L4 dependent keys or new build edges are invented. These are use restrictions derived from existing bodies/gaps, not a retroactive validity change."
    }
  }
}
```

## AUT1-C01

```json
{"block_id":"AUT1-C01","type":"literal_source_excerpt","requests":["RE-AUT1-02","RE-AUT1-05","RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions.ts","repository_path":"packages/core/src/actions.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"4f81df84763bd63e7680de8fd40c60b583ef68ca","source_sha256":"08c5f306bc1c53b978a4254eba0fc708d9a4bfbb30fb63ead23c237f359fceef","source_bytes":12779,"body_anchors":["A01","A15","A17"],"requested_subject":"Composição da fachada, lazy store/operations/output, snapshot e roteamento de execute/reconcile"}
```

```json
{"first_line":49,"last_line":216,"bytes":9361,"sha256":"b43f04580fd9a915fffef53070fcfdc249b2b066ff0ee8ece8f2f96859ebfc72"}
```

~~~~typescript
export const make = Effect.fn("Actions.make")(function* (input: {
  directory: string
  workspaceID?: string
  projectID: string
  stateDirectory: string
  transport?: ActionsContract.Transport
}) {
  const config = { ...input }
  const fs = yield* FSUtil.Service
  const proc = yield* AppProcess.Service
  const transport = config.transport ?? (yield* ActionsTransport.make({ directory: config.directory }))
  const lifetime = yield* Scope.Scope
  const database = yield* Database.Service
  const operations = yield* Effect.cached(ActionsOperations.make(config).pipe(
    Effect.provideService(Database.Service, database), Scope.provide(lifetime),
  ))
  const github = ActionsGitHubRead.make({ transport })
  const gitlab = ActionsGitLabRead.make({ transport })
  const reader = (binding: Actions.Binding) => binding.provider.kind === "github" ? github : gitlab
  const resources = ActionsResources.make({ transport, reader, directory: config.directory, proc })
  const output = (binding: Actions.Binding) => Effect.promise(() => import("./actions/output/index")).pipe(
    Effect.map(({ ActionsOutput }) => ActionsOutput.make({ transport, reader: reader(binding) })),
  )

  // Actions is Location-scoped, but a non-Git Location must still boot other services.
  // Resolve repository state only when an Actions method is requested.
  const store = () => ActionsBinding.make({ ...config, resolve: transport.resolve }).pipe(
    Effect.provideService(FSUtil.Service, fs), Effect.provideService(AppProcess.Service, proc),
  )
  const bindings: ActionsContract.Bindings = {
    list: () => store().pipe(Effect.flatMap((bindings) => bindings.list())),
    create: (input) => store().pipe(Effect.flatMap((bindings) => bindings.create(input))),
    update: (id, input) => store().pipe(Effect.flatMap((bindings) => bindings.update(id, input))),
    remove: (ref) => store().pipe(Effect.flatMap((bindings) => bindings.remove(ref))),
    get: (ref) => store().pipe(Effect.flatMap((bindings) => bindings.get(ref))),
    policy: (ref) => store().pipe(Effect.flatMap((bindings) => bindings.policy(ref))),
    updatePolicy: (ref, policy) => store().pipe(Effect.flatMap((bindings) => bindings.updatePolicy(ref, policy))),
  }
  return {
    bindings,
    capabilities: Effect.fn("Actions.capabilities")(function* (ref) {
      const binding = yield* bindings.get(ref)
      return yield* reader(binding).capabilities(binding)
    }),
    workflows: Effect.fn("Actions.workflows")(function* (ref, input) {
      const binding = yield* bindings.get(ref)
      return yield* reader(binding).workflows(binding, input)
    }),
    source: Effect.fn("Actions.source")(function* (ref, input) {
      const binding = yield* bindings.get(ref)
      return yield* reader(binding).source(binding, input)
    }),
    graph: Effect.fn("Actions.graph")(function* (ref, input) {
      const binding = yield* bindings.get(ref)
      const source = yield* reader(binding).source(binding, input)
      const { ActionsGraph } = yield* Effect.promise(() => import("./actions/source/graph"))
      return ActionsGraph.parse(binding.provider.kind, source)
    }),
    runs: Effect.fn("Actions.runs")(function* (ref, input) {
      const binding = yield* bindings.get(ref)
      return yield* reader(binding).runs(binding, input)
    }),
    run: Effect.fn("Actions.run")(function* (ref, id) {
      const binding = yield* bindings.get(ref)
      return yield* reader(binding).run(binding, id)
    }),
    jobs: Effect.fn("Actions.jobs")(function* (ref, input) {
      const binding = yield* bindings.get(ref)
      return yield* reader(binding).jobs(binding, input)
    }),
    prepare: Effect.fn("Actions.prepare")(function* (ref, input) {
      const binding = yield* bindings.get(ref)
      const service = yield* operations
      return yield* service.prepare(binding, input)
    }),
    operation: Effect.fn("Actions.operation")(function* (ref, id) {
      const binding = yield* bindings.get(ref)
      const service = yield* operations
      return yield* service.get(binding, id)
    }),
    reconcile: Effect.fn("Actions.reconcile")(function* (ref, id) {
      const binding = yield* bindings.get(ref)
      const service = yield* operations
      return yield* service.reconcile(binding, id, (intent, acknowledged) =>
        ActionsReadback.observe(reader(binding), binding, intent, acknowledged))
    }),
    resources: Effect.fn("Actions.resources")(function* (ref, input) {
      const binding = yield* bindings.get(ref)
      if (input.kind === "artifacts") {
        const service = yield* output(binding)
        return yield* service.artifacts(binding, input)
      }
      return yield* resources.list(binding, input)
    }),
    transferInfo: Effect.fn("Actions.transferInfo")(function* (ref, input) {
      const binding = yield* bindings.get(ref)
      const service = yield* output(binding)
      return yield* service.info(binding, input)
    }),
    transfer: (ref, input) => Stream.unwrap(Effect.gen(function* () {
      const binding = yield* bindings.get(ref)
      const service = yield* output(binding)
      return service.read(binding, input)
    })),
    validateSource: Effect.fn("Actions.validateSource")(function* (ref, source, draft) {
      const binding = yield* bindings.get(ref)
      if (source.bindingID !== binding.id)
        return yield* new ActionsError({ kind: "binding_stale", message: "Source belongs to another binding", disposition: "definitely_unsent" })
      const { ActionsAuthoring } = yield* Effect.promise(() => import("./actions/authoring/index"))
      return yield* ActionsAuthoring.make({ transport, reader: reader(binding) }).validate(binding, { ...source, text: draft })
    }),
    sourceBase: Effect.fn("Actions.sourceBase")(function* (ref, branch) {
      const binding = yield* bindings.get(ref)
      const { ActionsSourceBase } = yield* Effect.promise(() => import("./actions/authoring/base"))
      return yield* ActionsSourceBase.read({ transport, reader: reader(binding) }, binding, branch)
    }),
    validateDraft: Effect.fn("Actions.validateDraft")(function* (ref, base, path, draft) {
      const snapshot = { ...base }
      const binding = yield* bindings.get(ref)
      const { ActionsSourceBase } = yield* Effect.promise(() => import("./actions/authoring/base"))
      return yield* ActionsSourceBase.validate({ transport, reader: reader(binding) }, binding, snapshot, path, draft)
    }),
    execute: Effect.fn("Actions.execute")(function* (ref, kind, input, target) {
      const selected = { ...ref }
      const submission = structuredClone(input)
      const expected = { ...target }
      const binding = yield* bindings.get(selected)
      const transient = { output: undefined as Actions.CommandOutput | undefined }
      const service = yield* operations
      const operation = yield* service.execute(binding, submission, (intent, payload) => Effect.gen(function* () {
        if (intent.kind !== kind || (["workflowID", "runID", "jobID", "resourceID", "resourceKind", "scope", "path", "ref"] as const)
          .some((key) => expected[key] !== undefined && intent.target[key] !== expected[key]))
          return yield* new ActionsError({ kind: "intent_conflict", message: "Command endpoint differs from the admitted native target", disposition: "definitely_unsent" })
        const result: ActionsContract.CommandResult = yield* Effect.gen(function* () {
          if (intent.kind.startsWith("source.")) {
            const { ActionsAuthoring } = yield* Effect.promise(() => import("./actions/authoring/index"))
            return yield* ActionsAuthoring.make({ transport, reader: reader(binding) }).perform(binding, intent, payload)
          }
          if (intent.target.resourceKind) return yield* resources.perform(binding, intent, payload)
          if (binding.provider.kind === "github") {
            const { ActionsGitHubCommands } = yield* Effect.promise(() => import("./actions/github/commands"))
            return yield* ActionsGitHubCommands.make({ transport, reader: github }).perform(binding, intent, payload)
          }
          const { ActionsGitLabCommands } = yield* Effect.promise(() => import("./actions/gitlab/commands"))
          return yield* ActionsGitLabCommands.make({ transport, reader: gitlab }).perform(binding, intent, payload)
        })
        transient.output = result.output === undefined ? undefined : yield* Schema.decodeUnknownEffect(Schema.toType(Actions.CommandOutput), {
          onExcessProperty: "error",
        })(result.output).pipe(Effect.mapError(() => new ActionsError({
          kind: "outcome_unknown", message: "Native command returned an invalid one-time output",
        })))
        return result.acknowledgement
      }))
      return { operation, ...(transient.output === undefined ? {} : { output: transient.output }) }
    }),
  } satisfies Interface
})

const layer = Layer.effect(Service, Effect.gen(function* () {
  const location = yield* Location.Service
  const global = yield* Global.Service
  return yield* make({ directory: location.directory, workspaceID: location.workspaceID,
    projectID: location.project.id, stateDirectory: global.data })
}).pipe(Effect.orDie))

export const node = makeLocationNode({
  service: Service, layer, deps: [Location.node, Global.node, FSUtil.node, AppProcess.node, Database.node],
})
~~~~

## AUT1-C02

```json
{"block_id":"AUT1-C02","type":"literal_source_excerpt","requests":["RE-AUT1-02"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/transport.ts","repository_path":"packages/core/src/actions/transport.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"a028169bb585fb81c24889148ea61aa631c521af","source_sha256":"0bee331d9b87db900ad4310366fb4b3a7abdc7f2c6e915e926754c6eced6d2ae","source_bytes":5201,"body_anchors":["A01","A32"],"requested_subject":"Composição do transporte e momento de request/resolve"}
```

```json
{"first_line":14,"last_line":67,"bytes":4660,"sha256":"e1bac8451bb2eb9b895b9a38e4d5812732f607aa0e59eaae265aeca1879e4e60"}
```

~~~~typescript
export const make = Effect.fn("ActionsTransport.make")(function* (input: { directory: string }): Effect.fn.Return<ActionsContract.Transport, never, AppProcess.Service> {
  const proc = yield* AppProcess.Service
  const gitlab = ActionsGitlab.make(input.directory, proc)

  const request = Effect.fn("ActionsTransport.request")(function* (provider: Actions.Provider, request: ActionsContract.Request) {
    const executable = yield* ActionsCli.target(provider)
    const path = yield* ActionsCli.endpoint(provider, request)
    if (request.body !== undefined && Option.isNone(Schema.decodeUnknownOption(Schema.Json)(request.body)))
      return yield* ActionsCli.error(provider, "invalid_input", "Request body must be JSON metadata", "definitely_unsent")
    const body = request.body === undefined ? Stream.empty : Stream.make(new TextEncoder().encode(JSON.stringify(request.body)))
    return yield* ActionsProcess.capture(proc, provider, ActionsCli.command(
      input.directory, provider, executable, ActionsCli.args(provider, request, path, true),
      request.body === undefined ? "ignore" : "pipe",
    ), body).pipe(Effect.flatMap((result) => ActionsResponse.parse(provider, result)))
  })

  const resolve = Effect.fn("ActionsTransport.resolve")(function* (provider: Actions.Provider, projectPath: string) {
    if (!projectPath || projectPath.startsWith("/") || projectPath.endsWith("/") ||
        projectPath.split("/").some((part) => !part || part === "." || part === "..") ||
        /[\s\\%?#{}:\x00-\x1f\x7f]/.test(projectPath) || (provider.kind === "github" && projectPath.split("/").length !== 2))
      return yield* ActionsCli.error(provider, "invalid_input", "Project path must be an exact native repository path", "definitely_unsent")
    if (provider.kind === "gitlab") return yield* gitlab.resolve(provider, projectPath)
    const project = yield* request(provider, { method: "GET", path: provider.kind === "github"
      ? `repos/${projectPath.split("/").map(encodeURIComponent).join("/")}` : `projects/${encodeURIComponent(projectPath)}` })
    const identity = ActionsIdentity.project(provider, project.data)
    if (Option.isNone(identity)) return yield* ActionsCli.error(provider, "transport_failed", "Provider did not return native project identity")
    const user = yield* request(provider, { method: "GET", path: "user" })
    const account = ActionsIdentity.account(provider, user.data)
    if (Option.isNone(account)) return yield* ActionsCli.error(provider, "not_authenticated", "Provider did not return the current signed-in account")
    return { ...identity.value, account: account.value }
  })

  const bound = <A, R>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError, R>) => effect.pipe(
    Effect.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: error.disposition, bindingID: binding.id })),
  )
  return {
    resolve,
    request: (binding, value) => bound(binding, binding.provider.kind === "gitlab" ? gitlab.request(binding, value) : request(binding.provider, value)),
    open: (binding, value) => bound(binding, binding.provider.kind === "gitlab" ? gitlab.open(binding, value)
      : Effect.fail(ActionsCli.error(binding.provider, "capability_unavailable", "GitHub raw output uses the qualified CLI byte transport", "definitely_unsent"))),
    bytes: (binding, value) => Stream.unwrap(bound(binding, Effect.gen(function* () {
      if (binding.provider.kind === "gitlab") return gitlab.bytes(binding, value)
        .pipe(Stream.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: error.disposition, bindingID: binding.id })))
      const executable = yield* ActionsCli.target(binding.provider)
      const path = yield* ActionsCli.endpoint(binding.provider, value)
      if (value.method !== "GET" || value.body !== undefined)
        return yield* ActionsCli.error(binding.provider, "invalid_input", "Raw byte downloads require GET without a body", "definitely_unsent")
      return ActionsProcess.bytes(proc, binding.provider, ActionsCli.command(input.directory, binding.provider, executable, ActionsCli.args(binding.provider, value, path, false), "ignore"))
        .pipe(Stream.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: error.disposition, bindingID: binding.id })))
    }))),
    upload: (binding, value, file) => bound(binding, binding.provider.kind === "gitlab" ? gitlab.upload(binding, value, file)
      : Effect.fail(ActionsCli.error(binding.provider, "capability_unavailable", "GitHub Actions does not provide native Secure File upload", "definitely_unsent"))),
  }
})
~~~~

## AUT1-C03

```json
{"block_id":"AUT1-C03","type":"literal_source_excerpt","requests":["RE-AUT1-02"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/binding.ts","repository_path":"packages/core/src/actions/binding.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"0012bd2c459c7c9899ce63aa6d4bb69760e9647a","source_sha256":"fa7b2380b5ea1c3b10195b17e2015fed34f0501df2e16cfa7fe497969dba83bc","source_bytes":11296,"body_anchors":["A02"],"requested_subject":"Resolução física e Git; target, create/update/policy; matching remoto completo"}
```

```json
{"first_line":12,"last_line":161,"bytes":10896,"sha256":"7e0ae2f4f2229bf5c8e1a7dd95dff0712bd339f9bf85d464e773cdb08544aacf"}
```

~~~~typescript
const STRICT = { onExcessProperty: "error" } as const
const SSH_HOSTS: Readonly<Record<string, string>> = { "ssh.github.com": "github.com", "altssh.gitlab.com": "gitlab.com" }
const parseURL = Option.liftThrowable((text: string) => new URL(text))
const invalid = () => new ActionsError({ kind: "invalid_input", message: "Invalid Actions binding input." })
const checked = <A>(read: () => A) => Effect.try({ try: read, catch: (error) => error instanceof ActionsError ? error : invalid() })

export const make = Effect.fn("ActionsBinding.make")(function* (input: {
  directory: string
  workspaceID?: string
  projectID: string
  stateDirectory: string
  resolve: ActionsContract.BindingResolver
}) {
  const fs = yield* FSUtil.Service
  const proc = yield* AppProcess.Service
  const directory = yield* ActionsState.canonical(input.directory)
  yield* fs.realPath(directory).pipe(Effect.mapError(invalid))
  const git = Effect.fnUntraced(function* (args: string[]) {
    const result = yield* proc.run(ChildProcess.make("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args], {
      cwd: directory,
      // Git placement/config environment must not redirect this trusted Location, including Windows key casing.
      env: Object.fromEntries(Object.entries(process.env).filter((entry) => !/^GIT_/i.test(entry[0]))),
      extendEnv: false,
      stdin: "ignore",
    }), { maxOutputBytes: 64 * 1024, maxErrorBytes: 4 * 1024, timeout: "10 seconds" }).pipe(
      Effect.mapError(() => new ActionsError({ kind: "transport_failed", message: "Unable to inspect the repository's git configuration." })),
    )
    if (result.stdoutTruncated)
      return yield* new ActionsError({ kind: "metadata_truncated", message: "Git configuration exceeds the Actions read limit." })
    if (result.exitCode !== 0) return yield* invalid()
    // POSIX filenames may end in CR: only LF terminates git output there. NUL-delimited config stays intact.
    return result.stdout.toString("utf8").replace(process.platform === "win32" ? /\r?\n$/ : /\n$/, "")
  })
  const repository = yield* git(["rev-parse", "--show-toplevel"]).pipe(Effect.mapError((error) => error.kind === "invalid_input"
    ? new ActionsError({ kind: "not_found", message: "This folder is not a Git repository." })
    : error))
  const state = yield* ActionsState.make({ ...input, directory, repository })
  const target = Effect.fnUntraced(function* (request: Actions.BindingInput) {
    const decoded = yield* Schema.decodeUnknownEffect(Actions.BindingInput, STRICT)(request).pipe(Effect.mapError(invalid))
    const provider = yield* checked(() => ActionsState.provider(decoded.provider))
    const projectPath = yield* checked(() => ActionsState.projectPath(provider.kind, decoded.projectPath))
    if (!ActionsState.validRemote(decoded.remote)) return yield* invalid()
    // Validate every fetch URL, including git's insteadOf expansion, before touching provider authentication.
    const raw = yield* git(["config", "--null", "--get-all", `remote.${decoded.remote}.url`])
    const effective = yield* git(["remote", "get-url", "--all", decoded.remote])
    yield* checked(() => [...raw.split("\0").filter(Boolean), ...effective.split(/\r?\n/)].forEach((remote) =>
      matchRemote(remote, provider, projectPath)))
    const identity = yield* input.resolve(provider, projectPath)
    if (!identity.projectID.trim() || /[\x00-\x20\x7f]/.test(identity.projectID) ||
      !identity.account || /[\x00-\x20\x7f]/.test(identity.account))
      return yield* new ActionsError({ kind: "transport_failed", message: "Provider returned invalid project or account identity." })
    yield* checked(() => ActionsState.projectPath(provider.kind, identity.projectPath))
    if (!samePath(provider.kind, projectPath, identity.projectPath))
      return yield* new ActionsError({ kind: "host_mismatch", message: "Provider returned a different project path." })
    return { ...decoded, provider, projectID: identity.projectID, projectPath: identity.projectPath, account: identity.account }
  })
  const record = Effect.fnUntraced(function* (document: ActionsState.Document, ref: Actions.BindingRef) {
    // A Binding is also a BindingRef; project away caller metadata and use only the trusted store's Location.
    const decoded = yield* Schema.decodeUnknownEffect(Actions.BindingRef)(ref).pipe(Effect.mapError(invalid))
    const current = document.records.find((item) => item.binding.id === decoded.id)
    if (!current) return yield* new ActionsError({ kind: "binding_missing", message: "Actions binding does not exist at this Location." })
    if (current.binding.revision !== decoded.revision)
      return yield* new ActionsError({ kind: "binding_stale", message: "Actions binding revision has changed.", bindingID: decoded.id })
    return current
  })
  const list = Effect.fn("ActionsBinding.list")(function* () {
    return (yield* state.read()).records.map((item) => item.binding)
  })
  const create = Effect.fn("ActionsBinding.create")(function* (request: Actions.BindingInput) {
    return yield* state.change((document) => Effect.gen(function* () {
      const resolved = yield* target(request)
      if (resolved.expectedRevision !== undefined) return yield* invalid()
      if (document.records.some((item) => item.binding.remote === resolved.remote || ActionsState.identityKey(item.binding) === ActionsState.identityKey(resolved)))
        return yield* new ActionsError({ kind: "binding_stale", message: "Actions project or remote is already bound at this Location." })
      const binding: Actions.Binding = {
        id: Actions.BindingID.create(), revision: 1, remote: resolved.remote, provider: resolved.provider,
        projectID: resolved.projectID, projectPath: resolved.projectPath, account: resolved.account,
        directory, ...(input.workspaceID === undefined ? {} : { workspaceID: input.workspaceID }),
      }
      return { document: { ...document, records: [...document.records, { binding, policy: {} }] }, value: binding }
    }))
  })
  const update = Effect.fn("ActionsBinding.update")(function* (id: Actions.BindingID, request: Actions.BindingInput) {
    const decoded = yield* Schema.decodeUnknownEffect(Actions.BindingInput, STRICT)(request).pipe(Effect.mapError(invalid))
    if (decoded.expectedRevision === undefined)
      return yield* new ActionsError({ kind: "binding_stale", message: "Actions binding update requires an expected revision." })
    const expectedRevision = decoded.expectedRevision
    return yield* state.change((document) => Effect.gen(function* () {
      const current = yield* record(document, { id, revision: expectedRevision })
      const resolved = yield* target(decoded)
      if (ActionsState.identityKey(current.binding) !== ActionsState.identityKey(resolved))
        return yield* new ActionsError({ kind: "binding_stale", message: "Actions binding cannot retarget its provider project.", bindingID: id })
      if (document.records.some((item) => item !== current && item.binding.remote === resolved.remote))
        return yield* new ActionsError({ kind: "binding_stale", message: "Actions remote is already bound at this Location.", bindingID: id })
      const binding = { ...current.binding, revision: current.binding.revision + 1, remote: resolved.remote,
        provider: resolved.provider, projectPath: resolved.projectPath, account: resolved.account }
      return { document: { ...document, records: document.records.map((item) => item === current ? { ...item, binding } : item) }, value: binding }
    }))
  })
  const get = Effect.fn("ActionsBinding.get")(function* (ref: Actions.BindingRef) {
    return (yield* record(yield* state.read(), ref)).binding
  })
  const remove = Effect.fn("ActionsBinding.remove")(function* (ref: Actions.BindingRef) {
    yield* state.change((document) => Effect.gen(function* () {
      const current = yield* record(document, ref)
      return { document: { ...document, records: document.records.filter((item) => item !== current) }, value: undefined }
    }))
  })
  const policy = Effect.fn("ActionsBinding.policy")(function* (ref: Actions.BindingRef) {
    const current = yield* record(yield* state.read(), ref)
    return { binding: { id: current.binding.id, revision: current.binding.revision }, policy: current.policy }
  })
  const updatePolicy = Effect.fn("ActionsBinding.updatePolicy")(function* (ref: Actions.BindingRef, policy: Actions.Policy) {
    const decoded = yield* Schema.decodeUnknownEffect(Actions.Policy, STRICT)(policy).pipe(Effect.mapError(invalid))
    return yield* state.change((document) => Effect.gen(function* () {
      const current = yield* record(document, ref)
      const binding = { ...current.binding, revision: current.binding.revision + 1 }
      return {
        document: { ...document, records: document.records.map((item) => item === current ? { binding, policy: decoded } : item) },
        value: { binding: { id: binding.id, revision: binding.revision }, policy: decoded },
      }
    }))
  })
  return { list, create, update, get, remove, policy, updatePolicy } satisfies ActionsContract.Bindings
})

function samePath(kind: Actions.ProviderKind, left: string, right: string) {
  return kind === "github" ? left.toLowerCase() === right.toLowerCase() : left === right
}

function matchRemote(text: string, provider: Actions.Provider, projectPath: string) {
  if (/[\x00-\x20\x7f]/.test(text)) throw invalid()
  const scp = /^(?:git@)?([A-Za-z0-9.-]+):([^/].*)$/.exec(text)
  const remote = scp ? { protocol: "ssh:", hostname: scp[1].toLowerCase(), host: scp[1].toLowerCase(), path: scp[2] }
    : Option.getOrUndefined(parseURL(text).pipe(Option.map((url) => {
      if (url.password || (url.protocol === "https:" ? url.username : url.username && url.username !== "git") ||
        !["https:", "ssh:"].includes(url.protocol) || url.search || url.hash) throw invalid()
      // URL parsing normalizes dot segments; reject them before that normalization can hide a different repository.
      if (/\/(?:\.|\.\.)(?:\/|$)|%|\\/.test(text)) throw invalid()
      return { protocol: url.protocol, hostname: url.hostname, host: url.host, path: url.pathname.slice(1) }
    })))
  if (!remote) throw invalid()
  const alias = remote.protocol === "ssh:" ? SSH_HOSTS[remote.hostname] : undefined
  const expected = new URL(`https://${provider.hostname}`)
  if ((remote.protocol === "https:" ? remote.host !== expected.host : (alias ?? remote.hostname) !== expected.hostname))
    throw new ActionsError({ kind: "host_mismatch", message: "Named git remote does not match the explicit Actions host." })
  const actual = ActionsState.projectPath(provider.kind, remote.path.replace(/\.git$/, ""))
  if (!samePath(provider.kind, actual, projectPath))
    throw new ActionsError({ kind: "host_mismatch", message: "Named git remote does not match the Actions project path." })
}
~~~~

## AUT1-C04

```json
{"block_id":"AUT1-C04","type":"literal_source_excerpt","requests":["RE-AUT1-02"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/state.ts","repository_path":"packages/core/src/actions/state.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"c24ab01417fdea32688d26007e04d8fdac1d43ca","source_sha256":"a47ce41b196dd2c95e9724824d554472f93466be0220a02f1b019e855c3b9faf","source_bytes":8827,"body_anchors":["A02"],"requested_subject":"Canonical/locationKey, estado externo, read/decode/parents/physical/write, identidade/provider/path"}
```

```json
{"first_line":8,"last_line":166,"bytes":8571,"sha256":"61e4574a525d0bb060a6495dd0749c99ee3cd7e06c1abdb35029414f62fda36c"}
```

~~~~typescript
import { KeyedMutex } from "../effect/keyed-mutex"
import { FSUtil } from "../fs-util"
import { PhysicalPath } from "../util/physical-path"
import { ActionsError } from "./error"

const STRICT = { onExcessProperty: "error" } as const
const MAX_BYTES = 1024 * 1024
const locks = KeyedMutex.makeUnsafe<string>()
const Document = Schema.Struct({
  version: Schema.Literal(1),
  records: Schema.Array(Schema.Struct({ binding: Actions.Binding, policy: Actions.Policy })),
})
export type Document = typeof Document.Type
const url = Option.liftThrowable((text: string) => new URL(text))
const utf8 = Option.liftThrowable((bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(bytes))

export const canonical = Effect.fn("ActionsState.canonical")(function* (directory: string) {
  if (!directory || directory.includes("\0"))
    return yield* new ActionsError({ kind: "invalid_input", message: "Invalid Actions directory." })
  return yield* Effect.tryPromise({
    try: () => PhysicalPath.physicalPath(path.resolve(FSUtil.windowsPath(directory))),
    catch: () => new ActionsError({ kind: "invalid_input", message: "Actions directory is unavailable." }),
  })
})

export function locationKey(directory: string, workspaceID?: string) {
  return createHash("sha256").update(JSON.stringify([directory, workspaceID ?? null])).digest("hex")
}

export const make = Effect.fn("ActionsState.make")(function* (input: {
  directory: string
  workspaceID?: string
  projectID: string
  stateDirectory: string
  repository: string
}) {
  const fs = yield* FSUtil.Service
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(input.projectID) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(input.projectID) ||
    (input.workspaceID !== undefined && (!input.workspaceID || /[\x00-\x1f\x7f]/.test(input.workspaceID))))
    return yield* new ActionsError({ kind: "invalid_input", message: "Invalid Actions project or workspace identity." })
  const root = yield* canonical(input.stateDirectory)
  const repository = yield* canonical(input.repository)
  if (FSUtil.contains(repository, root))
    return yield* new ActionsError({ kind: "invalid_input", message: "Actions state must be outside the repository." })
  const target = path.join(root, "actions", input.projectID, locationKey(input.directory, input.workspaceID), "bindings.json")
  const failed = () => new ActionsError({ kind: "maintenance_required", message: "Actions binding state is unavailable or corrupt." })
  const physical = Effect.fnUntraced(function* () {
    if ((yield* canonical(target).pipe(Effect.mapError(failed))) !== target)
      return yield* failed()
  })
  function parents(directory: string): Effect.Effect<void, ActionsError> {
    return Effect.gen(function* () {
      const info = yield* fs.stat(directory).pipe(
        Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)), Effect.mapError(failed),
      )
      if (info) {
        if (info.type !== "Directory") return yield* failed()
        return
      }
      if (path.dirname(directory) === directory) return yield* failed()
      yield* parents(path.dirname(directory))
    })
  }
  const decode = Effect.fnUntraced(function* (text: string) {
    const document = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Document), STRICT)(text).pipe(Effect.mapError(failed))
    if (new Set(document.records.map((record) => record.binding.id)).size !== document.records.length ||
      new Set(document.records.map((record) => record.binding.remote)).size !== document.records.length ||
      new Set(document.records.map((record) => identityKey(record.binding))).size !== document.records.length)
      return yield* failed()
    yield* Effect.try({
      try: () => document.records.forEach((record) => {
        const binding = record.binding
        if (binding.directory !== input.directory || binding.workspaceID !== input.workspaceID ||
          !validRemote(binding.remote) || !binding.projectID.trim() || /[\x00-\x20\x7f]/.test(binding.projectID) ||
          !binding.account || /[\x00-\x20\x7f]/.test(binding.account) ||
          projectPath(binding.provider.kind, binding.projectPath) !== binding.projectPath ||
          JSON.stringify(provider(binding.provider)) !== JSON.stringify(binding.provider)) throw failed()
      }),
      catch: failed,
    })
    return document
  })
  const read = Effect.fnUntraced(function* () {
    yield* physical()
    // ENOTDIR can look like NotFound on a platform; a blocked parent is corruption, not an empty store.
    yield* parents(path.dirname(target))
    const info = yield* fs.stat(target).pipe(
      Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
      Effect.mapError(failed),
    )
    if (!info) return { version: 1, records: [] } satisfies Document
    if (info.type !== "File" || info.size > MAX_BYTES) return yield* failed()
    const bytes = yield* fs.readFile(target).pipe(Effect.mapError(failed))
    const text = utf8(bytes)
    if (bytes.length > MAX_BYTES || Option.isNone(text)) return yield* failed()
    return yield* decode(text.value)
  })
  const write = Effect.fnUntraced(function* (document: Document) {
    const text = JSON.stringify(document)
    if (Buffer.byteLength(text) > MAX_BYTES) return yield* failed()
    yield* decode(text)
    yield* physical()
    yield* fs.makeDirectory(path.dirname(target), { recursive: true, mode: 0o700 }).pipe(Effect.mapError(failed))
    yield* physical()
    const temp = path.join(path.dirname(target), `.bindings.${randomUUID()}.tmp`)
    yield* fs.writePhysical(temp, text, { exclusive: true }).pipe(
      Effect.andThen(fs.chmod(temp, 0o600)),
      Effect.andThen(physical()),
      Effect.andThen(fs.rename(temp, target)),
      Effect.mapError(failed),
      Effect.ensuring(Effect.try({ try: () => rmSync(temp, { force: true }), catch: failed }).pipe(Effect.ignore)),
      Effect.uninterruptible,
    )
  })
  return {
    read: () => locks.withLock(target)(read()),
    change: <A>(edit: (document: Document) => Effect.Effect<{ document: Document; value: A }, ActionsError>) =>
      locks.withLock(target)(Effect.gen(function* () {
        const next = yield* edit(yield* read())
        yield* write(next.document)
        return next.value
      })),
  }
})

export function validRemote(remote: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(remote) && remote.split("/").every((part) => part && part !== "." && part !== "..")
}

export function projectPath(kind: Actions.ProviderKind, text: string) {
  const parts = text.split("/")
  if ((kind === "github" ? parts.length !== 2 : parts.length < 2) ||
    parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part) || part === "." || part === ".." || part.endsWith(".git")))
    throw new ActionsError({ kind: "invalid_input", message: "Invalid provider project path." })
  return text
}

export function provider(input: Actions.Provider): Actions.Provider {
  const host = Option.getOrUndefined(url(`https://${input.hostname}`))
  const api = Option.getOrUndefined(url(input.apiOrigin))
  if (!host || !api || !/^[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(input.hostname) ||
    host.username || host.password || host.pathname !== "/" || host.search || host.hash ||
    host.hostname.endsWith(".") || host.hostname.split(".").some((part) => !part || part.startsWith("-") || part.endsWith("-")) ||
    api.protocol !== "https:" || api.username || api.password || api.pathname !== "/" || api.search || api.hash ||
    /[\x00-\x20\x7f]/.test(input.apiOrigin))
    throw new ActionsError({ kind: "invalid_input", message: "Invalid Actions provider host or API origin." })
  const hostname = host.host
  if (["ssh.github.com", "altssh.gitlab.com", "api.github.com"].includes(host.hostname) ||
    (host.hostname === "github.com" && (input.kind !== "github" || api.origin !== "https://api.github.com" || host.port)) ||
    (host.hostname === "gitlab.com" && (input.kind !== "gitlab" || api.origin !== "https://gitlab.com" || host.port)) ||
    (!["github.com", "gitlab.com"].includes(host.hostname) && api.host !== hostname))
    throw new ActionsError({ kind: "host_mismatch", message: "Actions provider host and API origin do not match." })
  return { kind: input.kind, hostname, apiOrigin: api.origin, ...(input.version === undefined ? {} : { version: input.version }) }
}

export function identityKey(binding: Pick<Actions.Binding, "provider" | "projectID">) {
  return JSON.stringify([binding.provider.kind, binding.provider.hostname, binding.provider.apiOrigin, binding.projectID])
}
~~~~

## AUT1-C05

```json
{"block_id":"AUT1-C05","type":"literal_source_excerpt","requests":["RE-AUT1-02","RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/contract.ts","repository_path":"packages/core/src/actions/contract.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"62521cbd3f4860049c3480a2bf9f2ed650c6c9f8","source_sha256":"c69997923b14da057a5cab4b3e9077884263d43c02f98dee1da44fedf65ae9bc","source_bytes":5462,"body_anchors":["A01","A15","A17"],"requested_subject":"Interfaces que separam transporte, operação, acknowledgment e output"}
```

```json
{"first_line":8,"last_line":88,"bytes":5206,"sha256":"240786bac74bd0fbeb4ca3b9c32441171dda2c81970fab39e5a986597e302fb2"}
```

~~~~typescript
export type Request = {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  readonly path: string
  readonly query?: Readonly<Record<string, string | number | boolean>>
  readonly body?: Json
}
export type Response = { readonly status: number; readonly headers: Readonly<Record<string, string>>; readonly data: Json }
export type BindingIdentity = { readonly projectID: string; readonly projectPath: string; readonly account: string }
export type BindingResolver = (provider: Actions.Provider, projectPath: string) => Effect.Effect<BindingIdentity, ActionsError>
export type CommandResult = { readonly acknowledgement: Actions.OperationAcknowledgement; readonly output?: Actions.CommandOutput }
export type RawResponse = {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: Stream.Stream<Uint8Array, ActionsError>
  readonly close: Effect.Effect<void>
}
export type BoundRequest = Request & { readonly method: "GET"; readonly body?: never }

export interface Transport {
  readonly resolve: BindingResolver
  readonly request: (binding: Actions.Binding, input: Request) => Effect.Effect<Response, ActionsError>
  readonly bytes: (binding: Actions.Binding, input: Request) => Stream.Stream<Uint8Array, ActionsError>
  readonly open?: (binding: Actions.Binding, input: BoundRequest) => Effect.Effect<RawResponse, ActionsError, Scope.Scope>
  readonly upload: (
    binding: Actions.Binding,
    input: Request,
    file: { readonly filename: string; readonly bytes: Stream.Stream<Uint8Array, ActionsError> },
  ) => Effect.Effect<Response, ActionsError>
}

export interface Bindings {
  readonly list: () => Effect.Effect<Actions.Binding[], ActionsError>
  readonly create: (input: Actions.BindingInput) => Effect.Effect<Actions.Binding, ActionsError>
  readonly update: (id: Actions.BindingID, input: Actions.BindingInput) => Effect.Effect<Actions.Binding, ActionsError>
  readonly remove: (input: Actions.BindingRef) => Effect.Effect<void, ActionsError>
  readonly get: (input: Actions.BindingRef) => Effect.Effect<Actions.Binding, ActionsError>
  readonly policy: (input: Actions.BindingRef) => Effect.Effect<Actions.PolicyState, ActionsError>
  readonly updatePolicy: (input: Actions.BindingRef, policy: Actions.Policy) => Effect.Effect<Actions.PolicyState, ActionsError>
}

export interface Adapter {
  readonly capabilities: (binding: Actions.Binding) => Effect.Effect<Actions.Capability[], ActionsError>
  readonly workflows: (binding: Actions.Binding, input: Actions.ListInput) => Effect.Effect<Actions.WorkflowPage, ActionsError>
  readonly source: (binding: Actions.Binding, input: { readonly path: string; readonly ref: string }) => Effect.Effect<Actions.Source, ActionsError>
  readonly runs: (binding: Actions.Binding, input: Actions.RunListInput) => Effect.Effect<Actions.RunPage, ActionsError>
  readonly run: (binding: Actions.Binding, id: string) => Effect.Effect<Actions.Run, ActionsError>
  readonly jobs: (binding: Actions.Binding, input: { readonly runID: string; readonly attempt?: number; readonly cursor?: string }) => Effect.Effect<Actions.JobPage, ActionsError>
  readonly resources: (binding: Actions.Binding, input: Actions.ResourceListInput) => Effect.Effect<Actions.ResourcePage, ActionsError>
  readonly perform: (binding: Actions.Binding, intent: Actions.OperationIntent, input: Json) => Effect.Effect<Actions.OperationAcknowledgement, ActionsError>
  readonly reconcile: (
    binding: Actions.Binding,
    intent: Actions.OperationIntent,
    acknowledgement?: Actions.OperationAcknowledgement,
  ) => Effect.Effect<Actions.OperationObservation, ActionsError>
  readonly transfer: (binding: Actions.Binding, input: Actions.TransferInput) => Stream.Stream<Uint8Array, ActionsError>
}

export interface Operations {
  readonly prepare: (binding: Actions.Binding, input: Actions.OperationIntent) => Effect.Effect<Actions.Operation, ActionsError>
  readonly execute: (
    binding: Actions.Binding,
    input: Actions.ExecuteInput,
    perform: (intent: Actions.OperationIntent, payload: Json) => Effect.Effect<Actions.OperationAcknowledgement, ActionsError>,
  ) => Effect.Effect<Actions.Operation, ActionsError>
  readonly get: (binding: Actions.Binding, id: Actions.OperationID) => Effect.Effect<Actions.Operation, ActionsError>
  readonly reconcile: (
    binding: Actions.Binding,
    id: Actions.OperationID,
    observe: (intent: Actions.OperationIntent, acknowledgement?: Actions.OperationAcknowledgement) => Effect.Effect<Actions.OperationObservation, ActionsError>,
  ) => Effect.Effect<Actions.Operation, ActionsError>
}

export type ReadAdapter = Pick<Adapter, "capabilities" | "workflows" | "source" | "runs" | "run" | "jobs">
export interface Commands {
  readonly perform: (binding: Actions.Binding, intent: Actions.OperationIntent, payload: Json) => Effect.Effect<CommandResult, ActionsError>
}

export interface ResourceDomain {
  readonly list: (binding: Actions.Binding, input: Actions.ResourceListInput) => Effect.Effect<Actions.ResourcePage, ActionsError>
  readonly perform: (binding: Actions.Binding, intent: Actions.OperationIntent, payload: Json) => Effect.Effect<CommandResult, ActionsError>
}
~~~~

## AUT1-C06

```json
{"block_id":"AUT1-C06","type":"literal_source_excerpt","requests":["RE-AUT1-03"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/cursor.ts","repository_path":"packages/core/src/actions/cursor.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"3c61a40570a65ef162d6ab908f70b09b1a22aa93","source_sha256":"42629421f0bb3f1c6c48c37c256899929890a718f6072228669d58340ad56373","source_bytes":3689,"body_anchors":["A03"],"requested_subject":"Schema/identidade de cursor, filtros, next/total/limit/fingerprint"}
```

```json
{"first_line":1,"last_line":82,"bytes":3689,"sha256":"42629421f0bb3f1c6c48c37c256899929890a718f6072228669d58340ad56373"}
```

~~~~typescript
export * as ActionsCursor from "./cursor"

import { createHash } from "node:crypto"
import { Actions } from "@orchestra/schema/actions"
import { Option, Schema } from "effect"
import { ActionsError } from "./error"

const PositivePage = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100_000 }))
const Cursor = Schema.Struct({
  binding: Actions.BindingID,
  revision: Schema.Int,
  provider: Actions.ProviderKind,
  host: Schema.String,
  project: Schema.String,
  scope: Schema.String,
  filters: Schema.String,
  page: PositivePage,
})
const decode = Schema.decodeUnknownOption(Schema.fromJsonString(Cursor))

export function page(binding: Actions.Binding, scope: string, filters: Readonly<Record<string, unknown>>, cursor?: string) {
  if (cursor === undefined) return 1
  const value = cursor.length <= 2048 ? decode(Buffer.from(cursor, "base64url").toString("utf8")) : Option.none()
  if (Option.isNone(value) || value.value.binding !== binding.id || value.value.revision !== binding.revision ||
    value.value.provider !== binding.provider.kind || value.value.host !== binding.provider.hostname ||
    value.value.project !== binding.projectID || value.value.scope !== scope || value.value.filters !== fingerprint(filters))
    throw new ActionsError({ kind: "invalid_input", message: "Actions cursor does not belong to this binding and selection", disposition: "definitely_unsent" })
  return value.value.page
}

export function encode(binding: Actions.Binding, scope: string, filters: Readonly<Record<string, unknown>>, page: number) {
  return Buffer.from(JSON.stringify(Cursor.make({
    binding: binding.id, revision: binding.revision, provider: binding.provider.kind,
    host: binding.provider.hostname, project: binding.projectID, scope, filters: fingerprint(filters), page,
  }))).toString("base64url")
}

export function next(headers: Readonly<Record<string, string>>) {
  const explicit = headers["x-next-page"]
  if (explicit !== undefined) {
    if (explicit === "") return
    const page = positive(explicit)
    if (page === undefined) throw paginationError()
    return page
  }
  const link = headers.link?.split(",").find((part) => /;\s*rel="?next"?(?:\s*;|\s*$)/.test(part))
  const address = link && /^\s*<([^>]+)>/.exec(link)?.[1]
  const parsed = address ? URL.parse(address, "https://pagination.invalid") : undefined
  if (!link) return
  const page = parsed && positive(parsed.searchParams.get("page") ?? "")
  if (page === undefined || page === null) throw paginationError()
  return page
}

export function total(headers: Readonly<Record<string, string>>) {
  const raw = headers["x-total"]
  if (raw === undefined) return
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw paginationError()
  return Number(raw)
}

export function limit(input?: number) {
  if (input === undefined) return 50
  if (!Number.isSafeInteger(input) || input < 1 || input > 100)
    throw new ActionsError({ kind: "invalid_input", message: "Actions page size must be between 1 and 100", disposition: "definitely_unsent" })
  return input
}

function positive(text: string) {
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) > 100_000) return
  return Number(text)
}

function fingerprint(filters: Readonly<Record<string, unknown>>) {
  return createHash("sha256").update(JSON.stringify(Object.entries(filters)
    .filter(([key, value]) => key !== "cursor" && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right)))).digest("hex")
}

function paginationError() {
  return new ActionsError({ kind: "transport_failed", message: "Provider returned invalid Actions pagination metadata" })
}
~~~~

## AUT1-C07

```json
{"block_id":"AUT1-C07","type":"literal_source_excerpt","requests":["RE-AUT1-03"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/github/native.ts","repository_path":"packages/core/src/actions/github/native.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"9de483d99f461e35c200b1fdcc2a0ce3f6224dac","source_sha256":"8624a7b9db3ea727bd4142c0233b37259f0a92ba457c31c658a8ce52f096a712","source_bytes":7552,"body_anchors":["A04"],"requested_subject":"IDs/SHAs/ref/path, repository ID e paginação completa"}
```

```json
{"first_line":9,"last_line":121,"bytes":7281,"sha256":"c8a3d925d93e2487d3080fab3d86e503f17b418050ec7e1a61fae7131221cd74"}
```

~~~~typescript
export const ID = Schema.Union([
  Schema.String.check(Schema.isPattern(/^[1-9]\d{0,127}$/)),
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
])
export const Positive = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }))
export const Count = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }))
export const SHA = Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i))
export const Time = Schema.String.check(Schema.isPattern(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/))
export const Repository = Schema.Struct({
  id: ID, full_name: Schema.NonEmptyString,
  default_branch: Schema.optionalKey(Schema.NullOr(Schema.String)),
  permissions: Schema.optionalKey(Schema.Struct({
    pull: Schema.optionalKey(Schema.Boolean), push: Schema.optionalKey(Schema.Boolean),
    admin: Schema.optionalKey(Schema.Boolean), maintain: Schema.optionalKey(Schema.Boolean),
  })),
})

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string) {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: "github", disposition: "definitely_unsent" })
}

export function decode<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, data: unknown, label: string): A {
  const value = Schema.decodeUnknownOption(schema)(data)
  if (Option.isNone(value)) throw error(binding, "transport_failed", `GitHub returned invalid ${label} metadata`)
  return value.value
}

export function id(binding: Actions.Binding, value: string) {
  if (typeof value !== "string" || !/^[1-9]\d{0,127}$/.test(value)) throw error(binding, "invalid_input", "GitHub target ID must be a canonical positive decimal")
  return value
}

export function ref(binding: Actions.Binding, value: string) {
  if (typeof value !== "string" || !value || value.length > 1024 || /[\s\\%?#{}:\x00-\x1f\x7f~^*\[]/.test(value) || value.includes("..") ||
      value.includes("@{") || value === "@" || value.startsWith("-") || value.endsWith(".") ||
      value.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock")))
    throw error(binding, "invalid_input", "GitHub ref must be an exact safe branch, tag or commit")
  return value
}

export function path(binding: Actions.Binding, value: string) {
  if (typeof value !== "string" || !value || value.length > 4096 || /[\\%{}:\x00-\x1f\x7f]/.test(value) ||
      value.split("/").some((part) => !part || part === "." || part === ".."))
    throw error(binding, "invalid_input", "GitHub source path must be an exact repository-relative path")
  return value.split("/").map(encodeURIComponent).join("/")
}

// Every read stays ID-addressed after this lookup; full_name is display metadata.
// Lead qualified these immutable routes with live gh on github.com. An unsupported
// host must return its native error, never fall back to a reused owner/repo path.
// https://docs.github.com/en/rest/repos/repos#get-a-repository
export const repository = Effect.fn("ActionsGitHubRead.repository")(function* (transport: ActionsContract.Transport, binding: Actions.Binding) {
  if (binding.provider.kind !== "github") return yield* error(binding, "host_mismatch", "GitHub read adapter requires a GitHub binding")
  const target = yield* checked(binding, () => id(binding, binding.projectID))
  const response = yield* get(transport, binding, { method: "GET", path: `repositories/${target}` })
  return yield* checked(binding, () => {
    const native = decode(binding, Repository, response.data, "repository")
    if (String(native.id) !== binding.projectID) throw error(binding, "binding_stale", "GitHub repository ID does not match the binding")
    return { native, path: `repositories/${target}`, headers: response.headers }
  })
})

export const get = Effect.fn("ActionsGitHubRead.get")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, input: ActionsContract.Request) {
  const response = yield* transport.request(binding, input)
  if (response.status !== 200) return yield* error(binding, "transport_failed", "GitHub read transport returned a non-success response")
  return response
})

export function checked<A>(binding: Actions.Binding, fn: () => A) {
  return Effect.try({ try: fn, catch: (cause) => cause instanceof ActionsError ? cause : error(binding, "transport_failed", "GitHub metadata could not be decoded") })
}

export function selection(binding: Actions.Binding, scope: string, filters: Readonly<Record<string, unknown>>, cursor?: string, limit?: number) {
  const per_page = ActionsCursor.limit(limit)
  const effective = { ...filters, per_page }
  return { filters: effective, scope, per_page, page: ActionsCursor.page(binding, scope, effective, cursor) }
}

export function pagination(binding: Actions.Binding, response: ActionsContract.Response, request: ActionsContract.Request,
  selected: ReturnType<typeof selection>, count: number, nativeTotal?: number) {
  const headers = response.headers
  const next = ActionsCursor.next(headers)
  const headerTotal = ActionsCursor.total(headers)
  const total = nativeTotal ?? headerTotal
  const fail = () => error(binding, "transport_failed", "GitHub returned invalid or incomplete pagination metadata")
  if (nativeTotal !== undefined && headerTotal !== undefined && nativeTotal !== headerTotal) throw fail()
  if (count > selected.per_page || (next !== undefined && next !== selected.page + 1)) throw fail()
  if (headers.link !== undefined) {
    if (ActionsCursor.next({ link: headers.link }) !== next) throw fail()
    const origin = binding.provider.apiOrigin.replace(/\/$/, "")
    const expected = new URL(`${origin}/${request.path}`)
    headers.link.split(",").forEach((part) => {
      const match = /^\s*<([^>]+)>;\s*rel="?(next|prev|first|last)"?\s*$/.exec(part)
      const url = match && URL.parse(match[1])
      if (!match || !url || url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password || url.hash) throw fail()
      const page = url.searchParams.get("page")
      if (!page || !/^[1-9]\d*$/.test(page) || Number(page) > 100_000) throw fail()
      const query = Object.fromEntries(url.searchParams)
      if (Array.from(url.searchParams.keys()).length !== Object.keys(query).length) throw fail()
      const wanted = { ...request.query, page: Number(page) }
      if (Object.keys(query).length !== Object.keys(wanted).length ||
          Object.entries(wanted).some(([key, value]) => query[key] !== String(value))) throw fail()
    })
  }
  if (total !== undefined && ((count > 0 && total < (selected.page - 1) * selected.per_page + count) ||
      (next === undefined && total > selected.page * selected.per_page) || (next !== undefined && total <= selected.page * selected.per_page))) throw fail()
  if (next !== undefined && count === 0) throw fail()
  if (next === undefined && total === undefined && count === selected.per_page && headers.link === undefined && headers["x-next-page"] === undefined) throw fail()
  return {
    ...(next === undefined ? {} : { next: ActionsCursor.encode(binding, selected.scope, selected.filters, next) }),
    ...(total === undefined ? {} : { total }), capturedAt: Date.now(),
  }
}
~~~~

## AUT1-C08

```json
{"block_id":"AUT1-C08","type":"literal_source_excerpt","requests":["RE-AUT1-03"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/github/catalog.ts","repository_path":"packages/core/src/actions/github/catalog.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"6fba4351d5bb942754a6609c3ddb82c55ae3dc36","source_sha256":"d6dfdfe937306ddec89ca7c43589d3c812f445797f5365c839af6ba303da2c04","source_bytes":7466,"body_anchors":["A03","A04"],"requested_subject":"Workflow, commit/path/bytes/sourceVersion e capabilities"}
```

```json
{"first_line":1,"last_line":89,"bytes":7466,"sha256":"d6dfdfe937306ddec89ca7c43589d3c812f445797f5365c839af6ba303da2c04"}
```

~~~~typescript
export * as GitHubCatalog from "./catalog"

import { Actions } from "@orchestra/schema/actions"
import { createHash } from "node:crypto"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { GitHubNative } from "./native"

const Workflow = Schema.Struct({ id: GitHubNative.ID, name: Schema.NullOr(Schema.String), path: Schema.NonEmptyString,
  state: Schema.NonEmptyString, updated_at: Schema.optionalKey(GitHubNative.Time) })
const Workflows = Schema.Struct({ total_count: Schema.optionalKey(GitHubNative.Count), workflows: Schema.Array(Workflow) })
const Commit = Schema.Struct({ sha: GitHubNative.SHA })
const Content = Schema.Struct({ type: Schema.String, path: Schema.String, sha: GitHubNative.SHA,
  size: GitHubNative.Count, encoding: Schema.optionalKey(Schema.String), content: Schema.optionalKey(Schema.String),
  target: Schema.optionalKey(Schema.String), submodule_git_url: Schema.optionalKey(Schema.String) })

// https://docs.github.com/en/rest/actions/workflows#list-repository-workflows
export const workflows = Effect.fn("ActionsGitHubRead.workflows")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, input: Actions.ListInput) {
  const selected = yield* GitHubNative.checked(binding, () => {
    if (input.query !== undefined || input.state !== undefined)
      throw GitHubNative.error(binding, "invalid_input", "GitHub workflow listing does not support server-side query or state filters")
    return GitHubNative.selection(binding, "github.workflows", {}, input.cursor, input.limit)
  })
  const repo = yield* GitHubNative.repository(transport, binding)
  const request = { method: "GET", path: `${repo.path}/actions/workflows`, query: { page: selected.page, per_page: selected.per_page } } as const
  const response = yield* GitHubNative.get(transport, binding, request)
  return yield* GitHubNative.checked(binding, () => {
    const data = GitHubNative.decode(binding, Workflows, response.data, "workflow list")
    return { items: data.workflows.map((item): Actions.Workflow => ({
      id: String(item.id), bindingID: binding.id, name: item.name, path: item.path, state: item.state,
      ...(repo.native.default_branch ? { defaultRef: repo.native.default_branch } : {}),
      dispatchable: false, dispatchState: "unknown", ...(item.updated_at === undefined ? {} : { updatedAt: item.updated_at }),
    })), ...GitHubNative.pagination(binding, response, request, selected, data.workflows.length, data.total_count) }
  })
})

// Resolve mutable ref once; contents always uses the resulting immutable commit.
// https://docs.github.com/en/rest/commits/commits#get-a-commit
// https://docs.github.com/en/rest/repos/contents#get-repository-content
export const source = Effect.fn("ActionsGitHubRead.source")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, input: { path: string; ref: string }) {
  const target = yield* GitHubNative.checked(binding, () => ({ path: GitHubNative.path(binding, input.path), ref: GitHubNative.ref(binding, input.ref) }))
  const repo = yield* GitHubNative.repository(transport, binding)
  const commitResponse = yield* GitHubNative.get(transport, binding, { method: "GET", path: `${repo.path}/commits/${encodeURIComponent(target.ref)}` })
  const commit = yield* GitHubNative.checked(binding, () => {
    const native = GitHubNative.decode(binding, Commit, commitResponse.data, "commit")
    if (/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(target.ref) && target.ref.toLowerCase() !== native.sha.toLowerCase())
      throw GitHubNative.error(binding, "source_conflict", "GitHub resolved commit does not match the requested immutable ref")
    return native
  })
  const response = yield* GitHubNative.get(transport, binding, { method: "GET", path: `${repo.path}/contents/${target.path}`, query: { ref: commit.sha } })
  const content = yield* GitHubNative.checked(binding, () => {
    const content = GitHubNative.decode(binding, Content, response.data, "source content")
    if (content.path !== input.path) throw GitHubNative.error(binding, "source_unresolved", "GitHub source path does not match the requested file")
    if (content.type !== "file" || content.target !== undefined || content.submodule_git_url !== undefined || content.encoding !== "base64" || content.content === undefined)
      throw GitHubNative.error(binding, "source_unresolved", "GitHub did not return authoritative full file content")
    if (content.size > 1024 * 1024 || content.content.length > 1500 * 1024)
      throw GitHubNative.error(binding, "metadata_truncated", "GitHub source exceeds the bounded content limit")
    const encoded = content.content.replace(/[\r\n]/g, "")
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
      throw GitHubNative.error(binding, "source_unresolved", "GitHub source is not canonical Base64")
    const bytes = Buffer.from(encoded, "base64")
    if (bytes.toString("base64") !== encoded || bytes.length !== content.size)
      throw GitHubNative.error(binding, "source_unresolved", "GitHub source content is incomplete")
    // GitHub supports both repository object algorithms; preserve either full ID.
    // https://docs.github.com/en/rest/repos/repos#get-the-hash-algorithm-for-a-repository
    if (createHash(content.sha.length === 40 ? "sha1" : "sha256").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== content.sha.toLowerCase())
      throw GitHubNative.error(binding, "source_unresolved", "GitHub source bytes do not match the authoritative blob ID")
    return { native: content, bytes }
  })
  const text = yield* Effect.try({ try: () => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content.bytes),
    catch: () => GitHubNative.error(binding, "source_unresolved", "GitHub source is not valid UTF-8") })
  return { bindingID: binding.id, path: content.native.path, ref: input.ref, commit: commit.sha, version: content.native.sha, text, editable: false }
})

export const capabilities = Effect.fn("ActionsGitHubRead.capabilities")(function* (transport: ActionsContract.Transport, binding: Actions.Binding) {
  const repo = yield* GitHubNative.repository(transport, binding)
  // Prove this Actions endpoint, not only repository visibility or a repo role.
  yield* workflows(transport, binding, { limit: 1 })
  const observedAt = Date.now()
  const scopes = repo.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
  const evidence = [scopes === undefined ? undefined : `Observed classic OAuth scopes: ${scopes.join(", ") || "none"}`,
    repo.native.permissions === undefined ? undefined : `Observed repository permissions: ${Object.entries(repo.native.permissions).map(([key, value]) => `${key}=${value}`).join(", ")}`]
    .filter((value) => value !== undefined).join("; ")
  return [Actions.Capability.make({ operation: "workflows.list", state: "available", scope: `repository:${binding.projectID}`,
    reason: "Native workflows GET succeeded", observedAt }),
    ...["source.read", "runs.list", "runs.read", "jobs.list", "workflow.dispatch", "workflow.enable", "workflow.disable", "source.write", "run.retry", "run.cancel", "run.delete"].map((operation) =>
      Actions.Capability.make({ operation, state: "unknown", scope: `repository:${binding.projectID}`,
        reason: `Endpoint or target eligibility has not been proved${evidence ? `; ${evidence}` : ""}`, observedAt }))]
})
~~~~

## AUT1-C09

```json
{"block_id":"AUT1-C09","type":"literal_source_excerpt","requests":["RE-AUT1-03"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/github/runs.ts","repository_path":"packages/core/src/actions/github/runs.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"ab56898ee021b474d882ecb6ef84282fe618ed30","source_sha256":"03a7cb4acf1a709fb8c289cede6f44045b70735107117d890e6c61f3fc1594c4","source_bytes":9329,"body_anchors":["A05"],"requested_subject":"Schemas, filtros/list/get, projeção e created-range"}
```

```json
{"first_line":1,"last_line":120,"bytes":9329,"sha256":"03a7cb4acf1a709fb8c289cede6f44045b70735107117d890e6c61f3fc1594c4"}
```

~~~~typescript
export * as GitHubRuns from "./runs"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { GitHubNative } from "./native"

const Run = Schema.Struct({
  id: GitHubNative.ID, workflow_id: GitHubNative.ID, repository: GitHubNative.Repository,
  name: Schema.NullOr(Schema.String), display_title: Schema.optionalKey(Schema.String), run_number: Schema.optionalKey(GitHubNative.Positive), head_branch: Schema.NullOr(Schema.String), head_sha: GitHubNative.SHA,
  event: Schema.NonEmptyString, status: Schema.NullOr(Schema.String), conclusion: Schema.optionalKey(Schema.NullOr(Schema.String)),
  run_attempt: Schema.optionalKey(GitHubNative.Positive), actor: Schema.optionalKey(Schema.NullOr(Schema.Struct({ login: Schema.NonEmptyString }))),
  triggering_actor: Schema.optionalKey(Schema.NullOr(Schema.Struct({ login: Schema.NonEmptyString }))),
  created_at: GitHubNative.Time, updated_at: Schema.optionalKey(GitHubNative.Time), run_started_at: Schema.optionalKey(GitHubNative.Time), html_url: Schema.String,
})
const Runs = Schema.Struct({ total_count: Schema.optionalKey(GitHubNative.Count), workflow_runs: Schema.Array(Run) })
const statuses = new Set(["completed", "action_required", "cancelled", "failure", "neutral", "skipped", "stale", "success", "timed_out", "in_progress", "queued", "requested", "waiting", "pending"])

// https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository
export const list = Effect.fn("ActionsGitHubRead.runs")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, input: Actions.RunListInput) {
  const query = yield* GitHubNative.checked(binding, () => {
    if (input.workflowID !== undefined) GitHubNative.id(binding, input.workflowID)
    if (input.ref !== undefined) GitHubNative.ref(binding, input.ref)
    if (input.commit !== undefined && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(input.commit)) throw GitHubNative.error(binding, "invalid_input", "GitHub run commit filter requires a full SHA")
    if (input.event !== undefined && !/^[a-z][a-z0-9_]{0,127}$/.test(input.event)) throw GitHubNative.error(binding, "invalid_input", "GitHub event filter is invalid")
    if (input.actor !== undefined && !/^[A-Za-z0-9-]+(?:\[bot\])?$/.test(input.actor)) throw GitHubNative.error(binding, "invalid_input", "GitHub actor filter is invalid")
    if (input.status !== undefined && !statuses.has(input.status)) throw GitHubNative.error(binding, "invalid_input", "GitHub run status filter is invalid")
    return Object.fromEntries(Object.entries({ branch: input.ref, event: input.event, status: input.status,
      head_sha: input.commit, actor: input.actor, created: created(binding, input) }).filter((entry): entry is [string, string] => entry[1] !== undefined))
  })
  const selected = yield* GitHubNative.checked(binding, () => GitHubNative.selection(binding, "github.runs", { ...query, workflowID: input.workflowID }, input.cursor, input.limit))
  const repo = yield* GitHubNative.repository(transport, binding)
  const request = { method: "GET", path: input.workflowID === undefined ? `${repo.path}/actions/runs` : `${repo.path}/actions/workflows/${input.workflowID}/runs`,
    query: { ...query, page: selected.page, per_page: selected.per_page } } as const
  const response = yield* GitHubNative.get(transport, binding, request)
  return yield* GitHubNative.checked(binding, () => {
    const data = GitHubNative.decode(binding, Runs, response.data, "run list")
    return { items: data.workflow_runs.map((item) => {
      if (input.workflowID !== undefined && String(item.workflow_id) !== input.workflowID)
        throw GitHubNative.error(binding, "transport_failed", "GitHub returned a run from another workflow")
      return project(binding, item)
    }), ...GitHubNative.pagination(binding, response, request, selected, data.workflow_runs.length, data.total_count) }
  })
})

// https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run
export const read = Effect.fn("ActionsGitHubRead.run")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, target: string) {
  yield* GitHubNative.checked(binding, () => GitHubNative.id(binding, target))
  const repo = yield* GitHubNative.repository(transport, binding)
  return yield* at(transport, binding, repo.path, target)
})

export const at = Effect.fn("ActionsGitHubRead.runAt")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, repo: string, target: string) {
  const response = yield* GitHubNative.get(transport, binding, { method: "GET", path: `${repo}/actions/runs/${target}` })
  return yield* GitHubNative.checked(binding, () => {
    const data = GitHubNative.decode(binding, Run, response.data, "run")
    if (String(data.id) !== target) throw GitHubNative.error(binding, "transport_failed", "GitHub returned another run ID")
    return project(binding, data)
  })
})

function project(binding: Actions.Binding, data: typeof Run.Type): Actions.Run {
  if (String(data.repository.id) !== binding.projectID)
    throw GitHubNative.error(binding, "binding_stale", "GitHub run repository ID does not match the binding")
  // Native updated_at is not an authoritative completion time, so it never becomes finishedAt; once a run is
  // completed it is the last native stamp, which is what the GitHub UI and CLI use for run duration.
  const duration = data.status === "completed" && data.updated_at !== undefined && data.run_started_at !== undefined
    ? Math.round((Date.parse(data.updated_at) - Date.parse(data.run_started_at)) / 1000) : undefined
  return { id: String(data.id), bindingID: binding.id, workflowID: String(data.workflow_id), name: data.name,
    ref: data.head_branch, commit: data.head_sha, event: data.event, status: data.status,
    repositoryID: String(data.repository.id), createdAt: data.created_at, url: data.html_url,
    ...(data.actor == null ? {} : { actor: data.actor.login }),
    ...(data.triggering_actor == null ? {} : { triggeringActor: data.triggering_actor.login }),
    ...(data.updated_at === undefined ? {} : { updatedAt: data.updated_at }),
    ...(data.conclusion === undefined ? {} : { conclusion: data.conclusion }),
    ...(data.run_attempt === undefined ? {} : { attempt: data.run_attempt }),
    ...(data.display_title === undefined ? {} : { title: data.display_title }),
    ...(data.run_number === undefined ? {} : { number: data.run_number }),
    ...(duration === undefined || !Number.isFinite(duration) || duration < 0 ? {} : { duration }),
    ...(data.run_started_at === undefined ? {} : { startedAt: data.run_started_at }) }
}

// GitHub created uses inclusive native range/comparison syntax, not updated filters.
// https://docs.github.com/en/search-github/getting-started-with-searching-on-github/understanding-the-search-syntax#query-for-dates
function created(binding: Actions.Binding, input: Actions.RunListInput) {
  if (input.updatedAfter !== undefined || input.updatedBefore !== undefined)
    throw GitHubNative.error(binding, "capability_unavailable", "GitHub workflow runs do not support native updated-time filters")
  if (input.created !== undefined && (input.createdAfter !== undefined || input.createdBefore !== undefined))
    throw GitHubNative.error(binding, "invalid_input", "GitHub created cannot be combined with explicit created-time bounds")
  if (input.created !== undefined) {
    const range = input.created.split("..")
    if (range.length === 1) {
      date(binding, input.created.replace(/^[<>]=?/, ""))
      return input.created
    }
    if (range.length !== 2 || range.every((bound) => bound === "*"))
      throw GitHubNative.error(binding, "invalid_input", "GitHub created filter requires a native date comparison or range")
    const after = range[0] === "*" ? undefined : date(binding, range[0])
    const before = range[1] === "*" ? undefined : date(binding, range[1])
    if (after !== undefined && before !== undefined && after > before)
      throw GitHubNative.error(binding, "invalid_input", "GitHub created-time range is reversed")
    return input.created
  }
  const after = input.createdAfter === undefined ? undefined : date(binding, input.createdAfter)
  const before = input.createdBefore === undefined ? undefined : date(binding, input.createdBefore)
  if (after !== undefined && before !== undefined && after > before)
    throw GitHubNative.error(binding, "invalid_input", "GitHub created-time range is reversed")
  if (input.createdAfter !== undefined && input.createdBefore !== undefined) return `${input.createdAfter}..${input.createdBefore}`
  if (input.createdAfter !== undefined) return `>=${input.createdAfter}`
  if (input.createdBefore !== undefined) return `<=${input.createdBefore}`
}

function date(binding: Actions.Binding, value: string) {
  const instant = Date.parse(value)
  const local = value.length === 10 ? `${value}T00:00:00` : value.slice(0, 19)
  if (!/^\d{4}-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d))?$/.test(value) || !Number.isFinite(instant) ||
      new Date(`${local}Z`).toISOString().slice(0, 19) !== local)
    throw GitHubNative.error(binding, "invalid_input", "GitHub created-time bound requires a valid ISO date or second-resolution timestamp with timezone")
  return instant
}
~~~~

## AUT1-C10

```json
{"block_id":"AUT1-C10","type":"literal_source_excerpt","requests":["RE-AUT1-03"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/github/jobs.ts","repository_path":"packages/core/src/actions/github/jobs.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"dbd8e1e17265f8439ba932be4b88d002b6984d79","source_sha256":"7bc8c9a73de49cc8acefbff94fdf03d72ca3a595e3d0451012db6b54a23ffc86","source_bytes":4682,"body_anchors":["A05"],"requested_subject":"Tentativa fixada, endpoints e checks de run/attempt/job"}
```

```json
{"first_line":1,"last_line":61,"bytes":4682,"sha256":"7bc8c9a73de49cc8acefbff94fdf03d72ca3a595e3d0451012db6b54a23ffc86"}
```

~~~~typescript
export * as GitHubJobs from "./jobs"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { GitHubNative } from "./native"
import { GitHubRuns } from "./runs"

// Zero is native unassigned runner metadata, never a valid job/run target ID.
const RunnerID = Schema.NullOr(Schema.Union([GitHubNative.Count, Schema.String.check(Schema.isPattern(/^(?:0|[1-9]\d{0,127})$/))]))
const Step = Schema.Struct({ number: GitHubNative.Count, name: Schema.String, status: Schema.NullOr(Schema.String),
  conclusion: Schema.optionalKey(Schema.NullOr(Schema.String)), started_at: Schema.optionalKey(Schema.NullOr(GitHubNative.Time)), completed_at: Schema.optionalKey(Schema.NullOr(GitHubNative.Time)) })
const Job = Schema.Struct({ id: GitHubNative.ID, run_id: GitHubNative.ID, run_attempt: Schema.optionalKey(GitHubNative.Positive),
  name: Schema.String, status: Schema.NullOr(Schema.String), conclusion: Schema.optionalKey(Schema.NullOr(Schema.String)),
  runner_name: Schema.optionalKey(Schema.NullOr(Schema.String)), runner_id: Schema.optionalKey(RunnerID),
  labels: Schema.optionalKey(Schema.Array(Schema.String)), runner_group_id: Schema.optionalKey(RunnerID),
  started_at: Schema.optionalKey(Schema.NullOr(GitHubNative.Time)), completed_at: Schema.optionalKey(Schema.NullOr(GitHubNative.Time)),
  steps: Schema.Array(Step) })
const Jobs = Schema.Struct({ total_count: Schema.optionalKey(GitHubNative.Count), jobs: Schema.Array(Job) })

// https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt
export const list = Effect.fn("ActionsGitHubRead.jobs")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, input: { runID: string; attempt?: number; cursor?: string }) {
  yield* GitHubNative.checked(binding, () => {
    GitHubNative.id(binding, input.runID)
    if (input.attempt !== undefined && (!Number.isSafeInteger(input.attempt) || input.attempt < 1))
      throw GitHubNative.error(binding, "invalid_input", "GitHub run attempt must be a positive safe integer")
  })
  const repo = yield* GitHubNative.repository(transport, binding)
  const run = yield* GitHubRuns.at(transport, binding, repo.path, input.runID)
  const attempt = input.attempt ?? run.attempt
  if (attempt === undefined)
    return yield* GitHubNative.error(binding, "capability_unavailable", "GitHub did not prove the current run attempt; select an explicit attempt")
  const selected = yield* GitHubNative.checked(binding, () => GitHubNative.selection(binding, "github.jobs",
    { runID: input.runID, attempt }, input.cursor))
  // Current selection is resolved once, then pinned before a rerun can advance it.
  const request = { method: "GET", path: `${repo.path}/actions/runs/${input.runID}/attempts/${attempt}/jobs`,
    query: { page: selected.page, per_page: selected.per_page } } as const
  const response = yield* GitHubNative.get(transport, binding, request)
  return yield* GitHubNative.checked(binding, () => {
    const data = GitHubNative.decode(binding, Jobs, response.data, "job list")
    return { items: data.jobs.map((job): Actions.Job => {
      if (String(job.run_id) !== input.runID || (job.run_attempt !== undefined && job.run_attempt !== attempt))
        throw GitHubNative.error(binding, "transport_failed", "GitHub job run or attempt does not match the selection")
      return { id: String(job.id), bindingID: binding.id, runID: String(job.run_id), name: job.name,
        status: job.status, kind: "job",
        ...(job.conclusion === undefined ? {} : { conclusion: job.conclusion }),
        ...(job.runner_name == null ? {} : { runner: job.runner_name }),
        ...(job.runner_id == null ? {} : { runnerID: String(job.runner_id) }),
        ...(job.runner_group_id == null ? {} : { runnerGroupID: String(job.runner_group_id) }),
        ...(job.labels === undefined ? {} : { runnerLabels: job.labels }),
        // The pinned endpoint proves identity even on payloads omitting run_attempt.
        attempt,
        ...(job.started_at == null ? {} : { startedAt: job.started_at }),
        ...(job.completed_at == null ? {} : { finishedAt: job.completed_at }),
        steps: job.steps.map((step) => ({ number: step.number, name: step.name, status: step.status,
          ...(step.conclusion === undefined ? {} : { conclusion: step.conclusion }),
          ...(step.started_at == null ? {} : { startedAt: step.started_at }),
          ...(step.completed_at == null ? {} : { finishedAt: step.completed_at }) })) }
    }), ...GitHubNative.pagination(binding, response, request, selected, data.jobs.length, data.total_count) }
  })
})
~~~~

## AUT1-C11

```json
{"block_id":"AUT1-C11","type":"literal_source_excerpt","requests":["RE-AUT1-03"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/github/index.ts","repository_path":"packages/core/src/actions/github/index.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"bca13413b5e00aeb317fdca0a8db0de21fa76562","source_sha256":"0f585e30bf78620b2878f7b2431af6186d0a401730325fe401f1ff9138329320","source_bytes":855,"body_anchors":["A04"],"requested_subject":"Composição do adapter GitHub"}
```

```json
{"first_line":8,"last_line":17,"bytes":648,"sha256":"75e765be4de45aabbf07707808107e1be347de3e9de0b908fbf7fd3fe8985337"}
```

~~~~typescript
export function make(input: { transport: ActionsContract.Transport }): ActionsContract.ReadAdapter {
  return {
    capabilities: (binding) => GitHubCatalog.capabilities(input.transport, binding),
    workflows: (binding, selection) => GitHubCatalog.workflows(input.transport, binding, selection),
    source: (binding, selection) => GitHubCatalog.source(input.transport, binding, selection),
    runs: (binding, selection) => GitHubRuns.list(input.transport, binding, selection),
    run: (binding, id) => GitHubRuns.read(input.transport, binding, id),
    jobs: (binding, selection) => GitHubJobs.list(input.transport, binding, selection),
  }
}
~~~~

## AUT1-C12

```json
{"block_id":"AUT1-C12","type":"literal_source_excerpt","requests":["RE-AUT1-03"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/gitlab/native.ts","repository_path":"packages/core/src/actions/gitlab/native.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"d6cf026dcbfb9023285415a9dd16842951e39ac0","source_sha256":"4f61c33643ab30ba295e4e84619c1a3ec4d1dd029d6ce32407029553691eadcc","source_bytes":10614,"body_anchors":["A06"],"requested_subject":"Schemas/IDs/SHAs, projeto/pipeline, metadata/version, slot/configPath e paginação"}
```

```json
{"first_line":12,"last_line":170,"bytes":10139,"sha256":"9d75a7db09d7c3bfeef67204da96b8725c96c74c9ce42734808deab9b7205149"}
```

~~~~typescript
export const ID = Schema.Union([
  Schema.String.check(Schema.isPattern(/^[1-9]\d*$/)),
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
])
export const SHA = Schema.String.check(Schema.isPattern(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i))
const nullableText = Schema.optional(Schema.NullOr(Schema.String))
const access = Schema.NullOr(Schema.Struct({ access_level: Schema.Int }))
export const Project = Schema.Struct({
  id: ID, path_with_namespace: Schema.NonEmptyString, name: Schema.NullOr(Schema.String),
  ci_config_path: nullableText, default_branch: nullableText,
  jobs_enabled: Schema.optional(Schema.Boolean), builds_access_level: Schema.optional(Schema.String),
  repository_access_level: Schema.optional(Schema.String), archived: Schema.optional(Schema.Boolean),
  permissions: Schema.optional(Schema.Struct({ project_access: Schema.optional(access), group_access: Schema.optional(access) })),
})
export const Pipeline = Schema.Struct({
  id: ID, iid: Schema.optional(ID), project_id: ID, sha: SHA, ref: Schema.NullOr(Schema.String), source: Schema.NonEmptyString, status: Schema.NullOr(Schema.NonEmptyString),
  name: nullableText, web_url: nullableText, created_at: nullableText, updated_at: nullableText,
  started_at: nullableText, finished_at: nullableText,
  duration: Schema.optional(Schema.NullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)))),
  user: Schema.optional(Schema.NullOr(Schema.Struct({ id: ID, username: Schema.NonEmptyString }))),
})
export const Job = Schema.Struct({
  id: ID, name: Schema.String, status: Schema.NullOr(Schema.NonEmptyString), stage: Schema.String, allow_failure: Schema.Boolean,
  pipeline: Schema.Struct({ id: ID, project_id: ID }),
  started_at: nullableText, finished_at: nullableText, retried: Schema.optional(Schema.Boolean),
  runner: Schema.optional(Schema.NullOr(Schema.Struct({ id: ID, description: nullableText }))),
})
export const Bridge = Schema.Struct({
  ...Job.fields,
  downstream_pipeline: Schema.NullOr(Schema.Struct({ id: ID, project_id: Schema.optional(ID) })),
})
export const Commit = Schema.Struct({ id: SHA })
export const File = Schema.Struct({
  file_path: Schema.NonEmptyString, encoding: Schema.Literal("base64"), content: Schema.String,
  blob_id: SHA, commit_id: SHA, last_commit_id: SHA,
})
const Metadata = Schema.Struct({ version: Schema.optional(Schema.NullOr(Schema.String)) })
export const VersionObservation = Schema.Struct({
  version: Schema.NonEmptyString, hostname: Schema.NonEmptyString, apiOrigin: Schema.NonEmptyString, observedAt: Schema.Number,
})

export function make(transport: ActionsContract.Transport) {
  const get = Effect.fn("ActionsGitLabRead.get")(function* (binding: Actions.Binding, path: string, query?: ActionsContract.Request["query"]) {
    yield* checked(binding, () => projectPath(binding))
    const response = yield* transport.request(binding, { method: "GET", path, ...(query ? { query } : {}) })
    if (response.status !== 200) return yield* error(binding, "transport_failed", "GitLab read did not return HTTP 200")
    return response
  })
  const project = Effect.fn("ActionsGitLabRead.project")(function* (binding: Actions.Binding) {
    const path = yield* checked(binding, () => projectPath(binding))
    const response = yield* get(binding, path)
    return yield* checked(binding, () => {
      const value = decode(binding, Project, response.data, "project")
      if (String(value.id) !== binding.projectID) throw error(binding, "binding_stale", "GitLab project identity differs from the bound native project")
      return value
    })
  })
  const pipeline = Effect.fn("ActionsGitLabRead.pipeline")(function* (binding: Actions.Binding, id: string) {
    const path = yield* checked(binding, () => `${projectPath(binding)}/pipelines/${nativeID(binding, id, "pipeline ID")}`)
    const response = yield* get(binding, path)
    return yield* checked(binding, () => {
      const value = decode(binding, Pipeline, response.data, "pipeline")
      requirePipeline(binding, value, id)
      return value
    })
  })
  const metadata = Effect.fn("ActionsGitLabRead.metadata")(function* (binding: Actions.Binding) {
    const target = yield* checked(binding, () => {
      const host = URL.parse(`https://${binding.provider.hostname}`)
      const origin = URL.parse(binding.provider.apiOrigin)
      if (!host || !origin || host.host !== binding.provider.hostname || host.pathname !== "/" || host.username || host.password || host.search || host.hash ||
        origin.protocol !== "https:" || origin.host !== host.host || origin.username || origin.password || origin.search || origin.hash ||
        (binding.provider.apiOrigin !== host.origin && binding.provider.apiOrigin !== `${host.origin}/api/v4`))
        throw error(binding, "host_mismatch", "GitLab metadata requires the exact canonical bound HTTPS host and API origin")
      return { hostname: binding.provider.hostname, apiOrigin: binding.provider.apiOrigin }
    })
    // Authenticated W1 transport supplies this observation, never client Provider.version.
    // https://docs.gitlab.com/api/metadata/
    const response = yield* get(binding, "metadata")
    return yield* checked(binding, () => {
      const value = decode(binding, Metadata, response.data, "instance metadata")
      if (!value.version) throw error(binding, "capability_unavailable", "GitLab metadata did not establish a native instance version")
      return VersionObservation.make({ ...target, version: value.version, observedAt: Date.now() })
    })
  })
  return { get, project, pipeline, metadata }
}

export function requireVersion(binding: Actions.Binding, observation: typeof VersionObservation.Type, minimum: readonly number[], feature: string) {
  if (observation.hostname !== binding.provider.hostname || observation.apiOrigin !== binding.provider.apiOrigin)
    throw error(binding, "host_mismatch", "GitLab version observation belongs to a different bound host or API origin")
  const version = /^(\d+)\.(\d+)\.(\d+)(?:-(?:ee|ce))?$/.exec(observation.version)
  if (!version || !version.slice(1).every((part) => Number.isSafeInteger(Number(part))) ||
    Number(version[1]) < minimum[0] || (Number(version[1]) === minimum[0] && Number(version[2]) < minimum[1]))
    throw error(binding, "capability_unavailable", `GitLab ${feature} requires native metadata proving GitLab ${minimum.join(".")} or newer`)
}

export function checked<A>(binding: Actions.Binding, body: () => A) {
  return Effect.try({ try: body, catch: (cause) => cause instanceof ActionsError ? cause
    : error(binding, "transport_failed", "GitLab read metadata could not be interpreted safely") })
}

export function decode<S extends Schema.Decoder<unknown>>(binding: Actions.Binding, schema: S, data: unknown, label: string): S["Type"] {
  const result = Schema.decodeUnknownOption(schema)(data)
  if (Option.isNone(result)) throw error(binding, "transport_failed", `GitLab returned invalid native ${label} metadata`)
  return result.value
}

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string) {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: "gitlab",
    disposition: kind === "invalid_input" || kind === "capability_unavailable" ? "definitely_unsent" : "unknown" })
}

export function projectPath(binding: Actions.Binding) {
  if (binding.provider.kind !== "gitlab") throw error(binding, "invalid_input", "GitLab read requires a GitLab binding")
  return `projects/${nativeID(binding, binding.projectID, "project ID")}`
}

export function nativeID(binding: Actions.Binding, id: string, label: string) {
  if (typeof id !== "string" || !/^[1-9]\d*$/.test(id)) throw error(binding, "invalid_input", `GitLab ${label} must be a positive native numeric string`)
  return id
}

// One project pipeline/config slot, NOT a GitHub-style definition ID or a historical file path.
export function workflowID(binding: Actions.Binding) { return `gitlab:project:${binding.projectID}:pipeline` }

export function configPath(project: typeof Project.Type) {
  // Empty/null explicitly mean unset. An omitted field means it was not observed.
  return project.ci_config_path === null || project.ci_config_path === "" ? ".gitlab-ci.yml" : project.ci_config_path
}

export function localPath(path: string) {
  return !!path && !/[:@\x00-\x1f\x7f\\]/.test(path) && !path.startsWith("/") &&
    !path.split("/").some((part) => !part || part === "." || part === "..") && !/[?*{}$]/.test(path)
}

export function requirePipeline(binding: Actions.Binding, pipeline: typeof Pipeline.Type, id?: string) {
  if (String(pipeline.project_id) !== binding.projectID || (id !== undefined && String(pipeline.id) !== id))
    throw error(binding, "binding_stale", "GitLab pipeline does not belong to the requested native project and pipeline")
}

export function conclusion(status: string | null) {
  return status !== null && ["success", "failed", "canceled", "skipped"].includes(status) ? status : undefined
}

export function selection(binding: Actions.Binding, input: object, fields: readonly string[], schema: Schema.Top) {
  if (typeof input !== "object" || input === null || Option.isNone(Schema.decodeUnknownOption(Schema.toType(schema))(input)))
    throw error(binding, "invalid_input", "GitLab read selection does not match the Actions input schema")
  const unsupported = Object.keys(input).find((key) => !fields.includes(key))
  if (unsupported) throw error(binding, "invalid_input", `GitLab read filter '${unsupported}' is not represented by this Actions contract`)
}

export function pagination(binding: Actions.Binding, scope: string, filters: Readonly<Record<string, unknown>>, headers: Readonly<Record<string, string>>, page: number) {
  const next = ActionsCursor.next(headers)
  if (next !== undefined && next <= page) throw error(binding, "transport_failed", "GitLab pagination did not advance")
  const total = ActionsCursor.total(headers)
  return { ...(next === undefined ? {} : { next: ActionsCursor.encode(binding, scope, filters, next) }),
    ...(total === undefined ? {} : { total }) }
}
~~~~

## AUT1-C13

```json
{"block_id":"AUT1-C13","type":"literal_source_excerpt","requests":["RE-AUT1-03"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/gitlab/catalog.ts","repository_path":"packages/core/src/actions/gitlab/catalog.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"a7a087856e35e01764382211abebfddfa00c133d","source_sha256":"546e21ae307d414ec385b7de7963b1756535a22beb66ff277c007111fe0b6478","source_bytes":7296,"body_anchors":["A06"],"requested_subject":"Slot/configuração, fonte local, path/commit/blob/last_commit_id e capabilities"}
```

```json
{"first_line":1,"last_line":87,"bytes":7296,"sha256":"546e21ae307d414ec385b7de7963b1756535a22beb66ff277c007111fe0b6478"}
```

~~~~typescript
export * as ActionsGitLabCatalog from "./catalog"

import { Actions } from "@orchestra/schema/actions"
import { createHash } from "node:crypto"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsGitLabNative } from "./native"

export function make(transport: ActionsContract.Transport) {
  const native = ActionsGitLabNative.make(transport)
  const workflows = Effect.fn("ActionsGitLabRead.workflows")(function* (binding: Actions.Binding, input: Actions.ListInput) {
    yield* ActionsGitLabNative.checked(binding, () => {
      ActionsGitLabNative.selection(binding, input, ["cursor", "limit", "query", "state"], Actions.ListInput)
      const page = ActionsCursor.page(binding, "gitlab.workflows", { ...input, limit: ActionsCursor.limit(input.limit) }, input.cursor)
      if (page !== 1) throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab project pipeline catalog has only one entry")
    })
    const project = yield* native.project(binding)
    const workflow = toWorkflow(binding, project)
    const items = (!input.query || workflow.name?.includes(input.query) || workflow.path.includes(input.query)) &&
      (input.state === undefined || workflow.state === input.state) ? [workflow] : []
    return { items, total: items.length, capturedAt: Date.now() }
  })
  const source = Effect.fn("ActionsGitLabRead.source")(function* (binding: Actions.Binding, input: { readonly path: string; readonly ref: string }) {
    yield* ActionsGitLabNative.checked(binding, () => {
      ActionsGitLabNative.selection(binding, input, ["path", "ref"], Schema.Struct({ path: Schema.NonEmptyString, ref: Schema.NonEmptyString }))
      if (!ActionsGitLabNative.localPath(input.path)) throw ActionsGitLabNative.error(binding, "source_unresolved",
        "GitLab external, project-qualified or dynamic CI source requires separate resolution; no local configuration fallback")
      if (!input.ref || /[\x00-\x1f\x7f\\]/.test(input.ref) || input.ref.split("/").some((part) => !part || part === "." || part === ".."))
        throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab source ref must name an exact commit, branch or tag")
    })
    const project = yield* native.project(binding)
    const configured = ActionsGitLabNative.configPath(project)
    // Current settings cannot deny a historical file or local include addressed
    // by its immutable commit. That read does not prove a run-definition join.
    if (input.path === ".gitlab-ci.yml" && configured !== input.path && Option.isNone(Schema.decodeUnknownOption(ActionsGitLabNative.SHA)(input.ref)))
      return yield* ActionsGitLabNative.error(binding, "source_unresolved", "GitLab native CI configuration is custom, external or unobserved; default file is not a substitute")
    const commitResponse = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/commits/${encodeURIComponent(input.ref)}`)
    const commit = yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.decode(binding, ActionsGitLabNative.Commit, commitResponse.data, "commit"))
    // Resolve branch BEFORE content, then request that exact immutable commit.
    // https://docs.gitlab.com/api/commits/#retrieve-a-commit
    const response = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/files/${encodeURIComponent(input.path)}`, { ref: commit.id })
    return yield* ActionsGitLabNative.checked(binding, () => {
      const file = ActionsGitLabNative.decode(binding, ActionsGitLabNative.File, response.data, "repository file")
      if (file.file_path !== input.path || file.commit_id !== commit.id)
        throw ActionsGitLabNative.error(binding, "source_conflict", "GitLab source identity differs from the requested file and resolved commit")
      const bytes = Buffer.from(file.content, "base64")
      const text = bytes.toString("utf8")
      if (bytes.toString("base64") !== file.content || !Buffer.from(text, "utf8").equals(bytes))
        throw ActionsGitLabNative.error(binding, "source_unresolved", "GitLab source content is not exact base64-encoded UTF-8 text")
      // File API may transcode text. Prove fidelity to the identified raw blob,
      // not merely to the API's decoded view: H("blob <byte-length>\0" + bytes).
      // https://git-scm.com/book/en/v2/Git-Internals-Git-Objects
      // https://git-scm.com/docs/hash-function-transition (blob payload unchanged)
      if (createHash(file.blob_id.length === 40 ? "sha1" : "sha256").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== file.blob_id.toLowerCase())
        throw ActionsGitLabNative.error(binding, "source_unresolved", "GitLab decoded source bytes do not match the identified raw Git blob")
      return Actions.Source.make({ bindingID: binding.id, path: input.path, ref: input.ref, commit: commit.id,
        version: JSON.stringify({ blob_id: file.blob_id, last_commit_id: file.last_commit_id }), text,
        // Read permission, roles and branch protection cannot prove write eligibility.
        editable: false, diagnostics: ["Write permission and ref protection are not observed; source is read-only"] })
    })
  })
  const capabilities = Effect.fn("ActionsGitLabRead.capabilities")(function* (binding: Actions.Binding) {
    const project = yield* native.project(binding)
    const observedAt = Date.now()
    const scope = `projects/${binding.projectID}`
    const permissions = [project.permissions?.project_access?.access_level, project.permissions?.group_access?.access_level]
      .filter((value) => value !== undefined)
    const context = `Native project read succeeded; access levels ${permissions.length ? permissions.join(",") : "unobserved"}; advisory client version ${binding.provider.version ?? "unset"}; native version unobserved by this inspection`
    return [Actions.Capability.make({ operation: "workflows.read", state: "available", reason: context, scope, observedAt }),
      ...["source.read", "runs.read", "jobs.read"].map((operation) => Actions.Capability.make({ operation, state: "unknown", scope, observedAt,
        reason: `${context}; endpoint-specific read permission not observed` })),
      ...Actions.OperationKind.literals.map((operation) => Actions.Capability.make({ operation, state: "unknown", scope, observedAt,
        reason: `${context}; token scope, native operation eligibility and protected-ref permissions not observed` })),
    ]
  })
  return { workflows, source, capabilities }
}

function toWorkflow(binding: Actions.Binding, project: typeof ActionsGitLabNative.Project.Type) {
  const path = ActionsGitLabNative.configPath(project)
  const disabled = project.jobs_enabled === false || project.builds_access_level === "disabled" || project.archived === true
  const state = path === undefined || !ActionsGitLabNative.localPath(path) ? "source_unresolved" : disabled ? "disabled" : "configured"
  return Actions.Workflow.make({ id: ActionsGitLabNative.workflowID(binding), bindingID: binding.id, name: project.name,
    ...(project.default_branch ? { defaultRef: project.default_branch } : {}),
    path: path ?? "", state, dispatchable: false, dispatchState: disabled ? "unavailable" : "unknown" })
}
~~~~

## AUT1-C14

```json
{"block_id":"AUT1-C14","type":"literal_source_excerpt","requests":["RE-AUT1-03"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/gitlab/runs.ts","repository_path":"packages/core/src/actions/gitlab/runs.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"5c1611e2e163457eb6f17cc44f386f597ccaccd6","source_sha256":"4cb9c8b7a73b12019ee9f60b36b2c116ccac833ab12f73307e5c37ba6341cdab","source_bytes":9251,"body_anchors":["A07"],"requested_subject":"Filtros nativos, metadata gates, tempos e ausência de attempt fabricado"}
```

```json
{"first_line":1,"last_line":116,"bytes":9251,"sha256":"4cb9c8b7a73b12019ee9f60b36b2c116ccac833ab12f73307e5c37ba6341cdab"}
```

~~~~typescript
export * as ActionsGitLabRuns from "./runs"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsGitLabNative } from "./native"

// https://docs.gitlab.com/api/pipelines/#list-project-pipelines
const statuses = ["created", "waiting_for_resource", "preparing", "waiting_for_callback", "pending", "running", "success", "failed", "canceling", "canceled", "skipped", "manual", "scheduled"]
const Timestamp = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/))
  .pipe(Schema.decodeTo(Schema.DateTimeUtcFromString))
const Source = Schema.Literals(["unknown", "push", "web", "trigger", "schedule", "api", "external", "pipeline", "chat", "webide",
  "merge_request_event", "external_pull_request_event", "parent_pipeline", "ondemand_dast_scan", "ondemand_dast_validation",
  "security_orchestration_policy", "container_registry_push", "duo_workflow", "pipeline_execution_policy_schedule"])
// Closed API enum. 14.2 declares source but gates the finder behind a flag; 14.3 removes it.
// https://gitlab.com/gitlab-org/gitlab/-/blob/v14.3.0-ee/app/finders/ci/pipelines_finder.rb
// https://gitlab.com/gitlab-org/gitlab/-/blob/v17.0.0-ee/app/finders/ci/pipelines_finder.rb (parent_pipeline)
// https://gitlab.com/gitlab-org/gitlab/-/blob/v14.3.0-ee/app/models/concerns/enums/ci/pipeline.rb
// https://gitlab.com/gitlab-org/gitlab/-/blob/v17.0.0-ee/app/models/concerns/enums/ci/pipeline.rb
// https://gitlab.com/gitlab-org/gitlab/-/blob/v17.4.0-ee/app/models/concerns/enums/ci/pipeline.rb
// https://gitlab.com/gitlab-org/gitlab/-/blob/v17.9.0-ee/app/models/concerns/enums/ci/pipeline.rb
const sourceMinimum = {
  unknown: [14, 3], push: [14, 3], web: [14, 3], trigger: [14, 3], schedule: [14, 3], api: [14, 3], external: [14, 3],
  pipeline: [14, 3], chat: [14, 3], webide: [14, 3], merge_request_event: [14, 3], external_pull_request_event: [14, 3],
  ondemand_dast_scan: [14, 3], ondemand_dast_validation: [14, 3], security_orchestration_policy: [14, 3],
  parent_pipeline: [17, 0], container_registry_push: [17, 0], duo_workflow: [17, 4], pipeline_execution_policy_schedule: [17, 9],
}

export function make(transport: ActionsContract.Transport) {
  const native = ActionsGitLabNative.make(transport)
  const runs = Effect.fn("ActionsGitLabRead.runs")(function* (binding: Actions.Binding, input: Actions.RunListInput) {
    const query = yield* ActionsGitLabNative.checked(binding, () => {
      ActionsGitLabNative.selection(binding, input, ["workflowID", "cursor", "limit", "ref", "event", "status", "commit", "actor", "created",
        "createdAfter", "createdBefore", "updatedAfter", "updatedBefore"], Actions.RunListInput)
      if (input.workflowID !== undefined && input.workflowID !== ActionsGitLabNative.workflowID(binding))
        throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab workflowID must select this native project pipeline/config slot")
      if (input.created !== undefined) throw ActionsGitLabNative.error(binding, "capability_unavailable", "GitLab created filter is ambiguous; use explicit created_after/created_before fields")
      if (input.status !== undefined && !statuses.includes(input.status))
        throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab status filter must use a documented native pipeline status")
      if (input.event !== undefined && Option.isNone(Schema.decodeUnknownOption(Source)(input.event)))
        throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab event filter must use a qualified native pipeline source")
      if ([input.ref, input.event, input.commit, input.actor].some((value) => value !== undefined && (!value || /[\x00-\x1f\x7f]/.test(value))))
        throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab pipeline filters must be nonempty native strings")
      return { per_page: ActionsCursor.limit(input.limit),
        ...(input.ref === undefined ? {} : { ref: input.ref }), ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.event === undefined ? {} : { source: input.event }), ...(input.commit === undefined ? {} : { sha: input.commit }),
        ...(input.actor === undefined ? {} : { username: input.actor }), ...rangeQuery(binding, input) }
    })
    const page = yield* ActionsGitLabNative.checked(binding, () => ActionsCursor.page(binding, "gitlab.runs", query, input.cursor))
    if (input.event !== undefined || input.createdAfter !== undefined || input.createdBefore !== undefined || input.updatedAfter !== undefined || input.updatedBefore !== undefined) {
      const observation = yield* native.metadata(binding)
      yield* ActionsGitLabNative.checked(binding, () => {
        if (input.event !== undefined) {
          const source = ActionsGitLabNative.decode(binding, Source, input.event, "source selection")
          ActionsGitLabNative.requireVersion(binding, observation, sourceMinimum[source], `source=${source}`)
        }
        // https://gitlab.com/gitlab-org/gitlab/-/blob/v17.11.0-ee/lib/api/ci/pipelines.rb
        if (input.createdAfter !== undefined || input.createdBefore !== undefined)
          ActionsGitLabNative.requireVersion(binding, observation, [17, 11], "created_after/created_before")
        // https://gitlab.com/gitlab-org/gitlab/-/blob/v12.6.0-ee/lib/api/pipelines.rb
        if (input.updatedAfter !== undefined || input.updatedBefore !== undefined)
          ActionsGitLabNative.requireVersion(binding, observation, [12, 6], "updated_after/updated_before")
      })
    }
    yield* native.project(binding)
    const response = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/pipelines`, { ...query, page })
    return yield* ActionsGitLabNative.checked(binding, () => {
      const pipelines = ActionsGitLabNative.decode(binding, Schema.Array(ActionsGitLabNative.Pipeline), response.data, "pipeline list")
      pipelines.forEach((pipeline) => {
        ActionsGitLabNative.requirePipeline(binding, pipeline)
        if (input.event !== undefined && pipeline.source !== input.event)
          throw ActionsGitLabNative.error(binding, "transport_failed", "GitLab returned a pipeline outside the requested native source selection")
      })
      if (new Set(pipelines.map((pipeline) => String(pipeline.id))).size !== pipelines.length)
        throw ActionsGitLabNative.error(binding, "transport_failed", "GitLab pipeline page contains duplicate native IDs")
      return { items: pipelines.map((pipeline) => toRun(binding, pipeline)), capturedAt: Date.now(),
        ...ActionsGitLabNative.pagination(binding, "gitlab.runs", query, response.headers, page) }
    })
  })
  const run = Effect.fn("ActionsGitLabRead.run")(function* (binding: Actions.Binding, id: string) {
    yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.nativeID(binding, id, "pipeline ID"))
    yield* native.project(binding)
    return toRun(binding, yield* native.pipeline(binding, id))
  })
  return { runs, run }
}

function toRun(binding: Actions.Binding, pipeline: typeof ActionsGitLabNative.Pipeline.Type) {
  return Actions.Run.make({ id: String(pipeline.id), bindingID: binding.id, workflowID: ActionsGitLabNative.workflowID(binding),
    name: pipeline.name === undefined ? `Pipeline ${pipeline.id}` : pipeline.name, ref: pipeline.ref, commit: pipeline.sha, event: pipeline.source,
    repositoryID: String(pipeline.project_id),
    ...(pipeline.name ? { title: pipeline.name } : {}),
    ...(pipeline.iid === undefined ? {} : { number: Number(pipeline.iid) }),
    status: pipeline.status, ...(ActionsGitLabNative.conclusion(pipeline.status) === undefined ? {} : { conclusion: pipeline.status }),
    ...(pipeline.user ? { actor: pipeline.user.username } : {}),
    ...(pipeline.created_at === undefined || pipeline.created_at === null ? {} : { createdAt: pipeline.created_at }),
    ...(pipeline.started_at === undefined || pipeline.started_at === null ? {} : { startedAt: pipeline.started_at }),
    ...(pipeline.finished_at === undefined || pipeline.finished_at === null ? {} : { finishedAt: pipeline.finished_at }),
    ...(pipeline.updated_at === undefined || pipeline.updated_at === null ? {} : { updatedAt: pipeline.updated_at }),
    ...(pipeline.duration === undefined || pipeline.duration === null ? {} : { duration: pipeline.duration }),
    ...(pipeline.web_url === undefined || pipeline.web_url === null ? {} : { url: pipeline.web_url }),
  })
}

function rangeQuery(binding: Actions.Binding, input: Actions.RunListInput) {
  const entries = Object.entries({ created_after: input.createdAfter, created_before: input.createdBefore,
    updated_after: input.updatedAfter, updated_before: input.updatedBefore })
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
  if (!entries.length) return {}
  entries.forEach(([key, value]) => {
    if (Option.isNone(Schema.decodeUnknownOption(Timestamp)(value)))
      throw ActionsGitLabNative.error(binding, "invalid_input", `GitLab ${key} must be an ISO 8601 timestamp with a timezone`)
  })
  return Object.fromEntries(entries)
}
~~~~

## AUT1-C15

```json
{"block_id":"AUT1-C15","type":"literal_source_excerpt","requests":["RE-AUT1-03"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/gitlab/jobs.ts","repository_path":"packages/core/src/actions/gitlab/jobs.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"5eef5ef7e30087596d06535bf9f4775704a8d033","source_sha256":"5f2ef28c5898a8375a57a0c85d053cea34a3f3981319d1bbb619db7599a5f8bf","source_bytes":4992,"body_anchors":["A07"],"requested_subject":"Jobs/bridges em faixas de cursor, include_retried e ownership"}
```

```json
{"first_line":1,"last_line":69,"bytes":4992,"sha256":"5f2ef28c5898a8375a57a0c85d053cea34a3f3981319d1bbb619db7599a5f8bf"}
```

~~~~typescript
export * as ActionsGitLabJobs from "./jobs"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsGitLabNative } from "./native"

// Jobs and bridges have independent native pagination. A single opaque cursor
// reserves 1..50,000 for jobs, 50,001..100,000 for bridges. Never zip their pages.
// Composite totals stay unknown: one endpoint's X-Total cannot count both lists.
const bridgeOffset = 50_000
const perPage = 50

export function make(transport: ActionsContract.Transport) {
  const native = ActionsGitLabNative.make(transport)
  return Effect.fn("ActionsGitLabRead.jobs")(function* (binding: Actions.Binding, input: { readonly runID: string; readonly attempt?: number; readonly cursor?: string }) {
    const filters = { runID: input.runID, per_page: perPage, include_retried: true, pagination: "jobs-then-bridges-v1" }
    const position = yield* ActionsGitLabNative.checked(binding, () => {
      ActionsGitLabNative.selection(binding, input, ["runID", "attempt", "cursor"], Schema.Struct({
        runID: Schema.NonEmptyString, attempt: Schema.optional(Schema.Int), cursor: Schema.optional(Schema.String),
      }))
      ActionsGitLabNative.nativeID(binding, input.runID, "pipeline ID")
      if (input.attempt !== undefined) throw ActionsGitLabNative.error(binding, "capability_unavailable", "GitLab job retries have native job IDs, not pipeline run_attempt numbers")
      return ActionsCursor.page(binding, "gitlab.jobs", filters, input.cursor)
    })
    yield* native.project(binding)
    yield* native.pipeline(binding, input.runID)
    const bridges = position > bridgeOffset
    const page = bridges ? position - bridgeOffset : position
    // The documented bridges route retains compatibility with pre-19.2 GitLab.
    // https://docs.gitlab.com/api/jobs/#list-all-trigger-jobs-by-pipeline
    const response = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/pipelines/${input.runID}/${bridges ? "bridges" : "jobs"}`,
      { page, per_page: perPage, ...(bridges ? {} : { include_retried: true }) })
    return yield* ActionsGitLabNative.checked(binding, () => {
      const jobs = bridges ? ActionsGitLabNative.decode(binding, Schema.Array(ActionsGitLabNative.Bridge), response.data, "bridge list")
        : ActionsGitLabNative.decode(binding, Schema.Array(ActionsGitLabNative.Job), response.data, "job list")
      jobs.forEach((job) => {
        if (String(job.pipeline.id) !== input.runID || String(job.pipeline.project_id) !== binding.projectID)
          throw ActionsGitLabNative.error(binding, "binding_stale", "GitLab job does not belong to the requested native project and pipeline")
      })
      if (new Set(jobs.map((job) => String(job.id))).size !== jobs.length)
        throw ActionsGitLabNative.error(binding, "transport_failed", "GitLab job page contains duplicate native IDs")
      const next = ActionsCursor.next(response.headers)
      ActionsCursor.total(response.headers) // Validate even though it is not a composite total.
      if (next !== undefined && (next <= page || next > bridgeOffset))
        throw ActionsGitLabNative.error(binding, "transport_failed", "GitLab jobs pagination is non-advancing or exceeds the cursor range")
      const position = next === undefined ? bridges ? undefined : bridgeOffset + 1 : (bridges ? bridgeOffset : 0) + next
      return { items: jobs.map((job) => toJob(binding, job, bridges)), capturedAt: Date.now(),
        ...(position === undefined ? {} : { next: ActionsCursor.encode(binding, "gitlab.jobs", filters, position) }) }
    })
  })
}

function toJob(binding: Actions.Binding, job: typeof ActionsGitLabNative.Job.Type | typeof ActionsGitLabNative.Bridge.Type, bridges: boolean) {
  return Actions.Job.make({ id: String(job.id), bindingID: binding.id, runID: String(job.pipeline.id), name: job.name,
    status: job.status, stage: job.stage, allowFailure: job.allow_failure, kind: bridges ? "bridge" : "job",
    ...(ActionsGitLabNative.conclusion(job.status) === undefined ? {} : { conclusion: job.status }),
    ...(job.retried === undefined ? {} : { retried: job.retried }),
    ...(job.runner ? { runner: String(job.runner.id), runnerID: String(job.runner.id) } : {}),
    ...(job.started_at === undefined || job.started_at === null ? {} : { startedAt: job.started_at }),
    ...(job.finished_at === undefined || job.finished_at === null ? {} : { finishedAt: job.finished_at }),
    ...("downstream_pipeline" in job && job.downstream_pipeline ? { downstreamID: String(job.downstream_pipeline.id),
      ...(job.downstream_pipeline.project_id === undefined ? {} : { downstreamProjectID: String(job.downstream_pipeline.project_id) }) } : {}),
    // REST gives neither execution steps nor predecessor IDs. Same name/stage
    // proves neither retryOf nor definitionID (parallel/matrix jobs can match).
    steps: [],
  })
}
~~~~

## AUT1-C16

```json
{"block_id":"AUT1-C16","type":"literal_source_excerpt","requests":["RE-AUT1-03"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/gitlab/index.ts","repository_path":"packages/core/src/actions/gitlab/index.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"b73b4d7a730c58874e09b7df4f35be2ee13853b8","source_sha256":"7a6c70d16d96826f03d861001aa079307acc8d8fcc7d5d660b537d4d9d927b4b","source_bytes":494,"body_anchors":["A06"],"requested_subject":"Composição do adapter GitLab"}
```

```json
{"first_line":5,"last_line":11,"bytes":353,"sha256":"80c06ed55ec7f878a24752e57c92ea5d0818f8ffb41b512acddf1dbff89ac33f"}
```

~~~~typescript
import { ActionsGitLabRuns } from "./runs"
import { ActionsGitLabJobs } from "./jobs"

export function make(input: { readonly transport: ActionsContract.Transport }): ActionsContract.ReadAdapter {
  return { ...ActionsGitLabCatalog.make(input.transport), ...ActionsGitLabRuns.make(input.transport),
    jobs: ActionsGitLabJobs.make(input.transport) }
}
~~~~

## AUT1-C17

```json
{"block_id":"AUT1-C17","type":"literal_source_excerpt","requests":["RE-AUT1-04"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/source/document.ts","repository_path":"packages/core/src/actions/source/document.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"52ec9f767dad9ba0cec28ec25ec4f7e4c16a163b","source_sha256":"7948e08d19341892df7f4cd8ae38f3cdb27694a197e1b462c3b4efdb96d90ce3","source_bytes":13276,"body_anchors":["A08"],"requested_subject":"Constantes e todas as aplicações: preflight lexical/CST, composição, YAML, aliases/merges/duplicatas/Json"}
```

```json
{"first_line":1,"last_line":276,"bytes":13276,"sha256":"7948e08d19341892df7f4cd8ae38f3cdb27694a197e1b462c3b4efdb96d90ce3"}
```

~~~~typescript
import { Schema } from "effect"
import { CST, isAlias, isMap, isPair, isScalar, isSeq, Lexer, Parser, parseDocument } from "yaml"

export const limits = {
  sourceBytes: 1024 * 1024, aliases: 100, depth: 64, nodes: 50_000, lexemes: 200_000, trivia: 1024,
  resolutions: 4096, merges: 20_000, diagnostics: 32, diagnosticLength: 256,
}
const isJson = Schema.is(Schema.Json)

export function diagnostics() {
  const items: string[] = []
  const severity = { partial: false, unresolved: false }
  return {
    items,
    work: { lexemes: 0, triviaPeak: 0, parserNext: 0, parserEnd: 0, cstNodes: 0, compositions: 0, resolutions: 0, merges: 0 },
    add(kind: "partial" | "unresolved", message: string, critical = false) {
      severity[kind] = true
      if (critical && items.length >= limits.diagnostics - 1) {
        items[limits.diagnostics - 1] = `source_${kind}:${message}; diagnostics_truncated`.slice(0, limits.diagnosticLength)
        return
      }
      if (items.length < limits.diagnostics - 1) {
        items.push(`source_${kind}:${message}`.slice(0, limits.diagnosticLength))
        return
      }
      if (items.length === limits.diagnostics - 1) items.push("source_partial:diagnostics_truncated")
    },
    state(): "complete" | "partial" | "unresolved" {
      return severity.unresolved ? "unresolved" : severity.partial ? "partial" : "complete"
    },
  }
}
export type Diagnostics = ReturnType<typeof diagnostics>

export function read(text: string, provider: "github" | "gitlab", report: Diagnostics): {
  value: Schema.JsonObject; references: string[][]; header?: Schema.JsonObject
} | undefined {
  if (text.length > limits.sourceBytes || new TextEncoder().encode(text).length > limits.sourceBytes) {
    report.add("unresolved", "source_limit:maximum 1048576 UTF-8 bytes")
    return
  }
  // YAML conversion can throw for unresolved aliases or expansion limits; contain that library boundary.
  try {
    const documents = preflight(text, provider, report)
    if (!documents) return
    const parsed = documents.map((document, index) => compose(
      text.slice(index === 0 ? 0 : document.offset, documents[index + 1]?.offset ?? text.length), provider, report,
      index === 0 ? 0 : document.offset,
    ))
    if (parsed.some((document) => document === undefined)) return
    const first = parsed[0]
    if (!first) {
      report.add("unresolved", "unsafe_document:expected finite JSON mapping")
      return
    }
    if (provider === "github") return first
    if (parsed.length === 1 && first.value.spec === undefined) return first
    if (Object.keys(first.value).some((key) => key !== "spec") || !object(first.value.spec)
      || first.value.spec.inputs !== undefined && !object(first.value.spec.inputs)) {
      report.add("unresolved", "gitlab_header_invalid:expected isolated spec header")
      return
    }
    const body = parsed[1]
    if (body && !documents[1].start.some((token) => token.type === "doc-start") || body?.value.spec !== undefined) {
      report.add("unresolved", "gitlab_header_invalid:expected --- then one body without spec")
      return
    }
    return { value: body?.value ?? {}, references: body?.references ?? [], header: first.value }
  } catch (error) {
    const alias = error instanceof ReferenceError
    report.add("unresolved", alias ? "yaml_alias:unresolved or excessive alias expansion" : "yaml_conversion:invalid or excessive structure")
  }
}

function preflight(text: string, provider: "github" | "gitlab", report: Diagnostics) {
  const lexemes: string[] = []
  const counts = { aliases: 0, trivia: 0, scalar: false, offset: 0 }
  const lexical = new Lexer().lex(text)
  // Precheck the entire Lexer stream before either Parser or parseDocument can scan pending trivia.
  // 1024 trivia lexemes allow substantial comment blocks while bounding the library's quadratic prefix scans.
  while (true) {
    const next = lexical.next()
    if (next.done) break
    if (++report.work.lexemes > limits.lexemes) {
      report.add("unresolved", "precomposition_limit:maximum 200000 lexemes and depth 64")
      return
    }
    // A SCALAR marker owns the next lexeme, even when block/plain scalar data starts with whitespace or '#'.
    const payload = counts.scalar
    const type = payload ? null : CST.tokenType(next.value)
    counts.scalar = !payload && next.value === CST.SCALAR
    counts.trivia = type === "space" || type === "newline" || type === "comment" ? counts.trivia + 1 : 0
    report.work.triviaPeak = Math.max(report.work.triviaPeak, counts.trivia)
    if (counts.trivia > limits.trivia) {
      report.add("unresolved", `trivia_limit:maximum 1024 consecutive trivia lexemes; offset ${counts.offset}`)
      return
    }
    if (type === "alias" && ++counts.aliases > limits.aliases) {
      report.add("unresolved", "alias_limit:maximum 100 aliases")
      return
    }
    if (payload || type !== "scalar" && type !== "doc-mode" && type !== "flow-error-end") counts.offset += next.value.length
    lexemes.push(next.value)
  }
  const parser = new Parser()
  const documents: CST.Document[] = []
  const receive = (token: CST.Token) => {
    if (token.type === "document") documents.push(token)
    if (documents.length > (provider === "github" ? 1 : 2)) {
      report.add("unresolved", "yaml_MULTIPLE_DOCS:only GitLab spec header plus one body supported")
      return false
    }
    return true
  }
  if (!lexemes.every((lexeme) => {
    if (parser.stack.length > limits.depth + 2) {
      report.add("unresolved", "precomposition_limit:maximum 200000 lexemes and depth 64")
      return false
    }
    ++report.work.parserNext
    return Array.from(parser.next(lexeme)).every(receive)
  })) return
  ++report.work.parserEnd
  if (!Array.from(parser.end()).every(receive)) return
  const pending = documents.flatMap((document) => document.value ? [{ token: document.value, depth: 0 }] : [])
  while (pending.length) {
    const entry = pending.pop()
    if (!entry) break
    if (++report.work.cstNodes > limits.nodes || entry.depth > limits.depth) {
      report.add("unresolved", "precomposition_limit:maximum depth 64 and 50000 CST nodes")
      return
    }
    if (entry.token.type === "block-map" || entry.token.type === "block-seq" || entry.token.type === "flow-collection") {
      const mapping = entry.token.type === "block-map" || entry.token.type === "flow-collection" && entry.token.start.type === "flow-map-start"
      if (!entry.token.items.every((item) => {
        if (mapping && (item.key || item.sep) && (!item.key || !CST.isScalar(item.key))) {
          report.add("unresolved", "yaml_KEY_TYPE:CI mapping keys must be scalar strings, not aliases or collections")
          return false
        }
        if ((item.key || item.value) && ++report.work.cstNodes > limits.nodes) {
          report.add("unresolved", "precomposition_limit:maximum depth 64 and 50000 CST nodes")
          return false
        }
        if (item.key) pending.push({ token: item.key, depth: entry.depth + 1 })
        if (item.value) pending.push({ token: item.value, depth: entry.depth + 1 })
        return true
      })) return
    }
  }
  return documents
}

function compose(text: string, provider: "github" | "gitlab", report: Diagnostics, offset: number) {
  ++report.work.compositions
  // Library uniqueKeys uses an O(n²) scan. Validate decoded string keys with per-map Sets below.
  const document = parseDocument(text, {
    version: "1.2", schema: "core", uniqueKeys: false, stringKeys: true, prettyErrors: false,
    resolveKnownTags: false, merge: provider === "gitlab", logLevel: "error",
  })
  document.errors.forEach((error) => report.add("unresolved", `yaml_${error.code}:offset ${offset + error.pos[0]}`))
  if (document.errors.length) return
  if (document.directives.yaml.version !== "1.2") {
    report.add("unresolved", "yaml_version:only YAML 1.2 supported")
    return
  }
  document.warnings.forEach((warning) => report.add("partial", `yaml_${warning.code}:offset ${offset + warning.pos[0]}`))
  const references: string[][] = []
  const pending: { node: unknown; depth: number; path: string[] }[] = [{ node: document.contents, depth: 0, path: [] }]
  const counts = { nodes: 0, aliases: 0 }
  while (pending.length) {
    const entry = pending.pop()
    if (!entry) break
    if (++counts.nodes > limits.nodes || entry.depth > limits.depth) {
      report.add("unresolved", "structure_limit:maximum depth 64 and 50000 nodes")
      return
    }
    if (isAlias(entry.node) && ++counts.aliases > limits.aliases) {
      report.add("unresolved", "alias_limit:maximum 100 aliases")
      return
    }
    if (isAlias(entry.node)) {
      const target = entry.node.resolve(document)
      if (target) pending.push({ node: target, depth: entry.depth, path: entry.path })
    }
    if (isPair(entry.node)) {
      if (isScalar(entry.node.key) && ["__proto__", "constructor", "prototype"].includes(String(entry.node.key.value))) {
        report.add("unresolved", "unsafe_key:prototype-sensitive mapping key")
        return
      }
      const key = isScalar(entry.node.key) ? String(entry.node.key.value) : ""
      pending.push({ node: entry.node.key, depth: entry.depth, path: entry.path }, {
        node: entry.node.value, depth: entry.depth, path: [...entry.path, key],
      })
    }
    if (isMap(entry.node) || isSeq(entry.node)) {
      if (isMap(entry.node)) {
        const keys = new Set<string>()
        if (!entry.node.items.every((pair) => {
          if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
            report.add("unresolved", "yaml_KEY_TYPE:CI mapping keys must be scalar strings")
            return false
          }
          if (keys.has(pair.key.value)) {
            report.add("unresolved", `yaml_DUPLICATE_KEY:offset ${offset + (pair.key.range?.[0] ?? 0)}`)
            return false
          }
          keys.add(pair.key.value)
          return true
        })) return
      }
      if (entry.node.tag === "!reference" && provider === "gitlab") references.push(entry.path)
      if (entry.node.tag && !["tag:yaml.org,2002:map", "tag:yaml.org,2002:seq"].includes(entry.node.tag)
        && !(provider === "gitlab" && entry.node.tag === "!reference")) {
        report.add("unresolved", "unsafe_tag:unsupported collection tag")
        return
      }
      entry.node.items.forEach((node, index) => pending.push({
        node, depth: entry.depth + 1, path: isSeq(entry.node) ? [...entry.path, String(index)] : entry.path,
      }))
    }
    if (isScalar(entry.node) && entry.node.tag && ![
      "tag:yaml.org,2002:str", "tag:yaml.org,2002:int", "tag:yaml.org,2002:float",
      "tag:yaml.org,2002:bool", "tag:yaml.org,2002:null",
    ].includes(entry.node.tag)) {
      report.add("unresolved", "unsafe_tag:unsupported scalar tag")
      return
    }
  }
  const value: unknown = document.toJS({ maxAliasCount: limits.aliases })
  const visited = { nodes: 0 }
  if (!safeJson(value, new Set(), 0, visited) || !isJson(value) || !object(value)) {
    report.add("unresolved", "unsafe_document:expected finite JSON mapping without cycles or unsafe keys")
    return
  }
  return { value, references }
}

function safeJson(value: unknown, ancestors: Set<object>, depth: number, count: { nodes: number }): boolean {
  if (++count.nodes > limits.nodes || depth > limits.depth) return false
  if (value === null || typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value !== "object" || ancestors.has(value)) return false
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false
  if (Object.keys(value).some((key) => ["__proto__", "constructor", "prototype"].includes(key))) return false
  ancestors.add(value)
  const safe = Object.values(value).every((child: unknown) => safeJson(child, ancestors, depth + 1, count))
  ancestors.delete(value)
  return safe
}

export function object(value: Schema.Json | undefined): value is Schema.JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
}

export function strings(value: Schema.Json | undefined): value is readonly string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === "string" && entry.length > 0)
}

export function expression(value: Schema.Json | undefined): boolean {
  if (typeof value === "string") return value.includes("${{")
  if (Array.isArray(value)) return value.some((child) => expression(child))
  return object(value) && Object.values(value).some((child) => expression(child))
}

export function inputExpression(value: Schema.Json | undefined): boolean {
  if (typeof value === "string") return value.includes("$[[")
  if (Array.isArray(value)) return value.some((child) => inputExpression(child))
  return object(value) && Object.values(value).some((child) => inputExpression(child))
}

export function condition(value: Schema.Json | undefined, path: string, report: Diagnostics) {
  if (value === undefined) return
  if (typeof value === "string") return value
  if (typeof value === "boolean" || typeof value === "number") return String(value)
  report.add("unresolved", `condition_invalid:${path}`)
}
~~~~

## AUT1-C18

```json
{"block_id":"AUT1-C18","type":"literal_source_excerpt","requests":["RE-AUT1-04"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/source/graph.ts","repository_path":"packages/core/src/actions/source/graph.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"9979794cf9f26e006fa36651ba026ecf044a65e2","source_sha256":"0219fc70d60d16887c37ac9cd9a3b9cf9aac5e586716d918d5cb2667550c8e0f","source_bytes":3845,"body_anchors":["A09"],"requested_subject":"Grafo, estados de resolução, needs, ciclo e inputs"}
```

```json
{"first_line":1,"last_line":74,"bytes":3845,"sha256":"0219fc70d60d16887c37ac9cd9a3b9cf9aac5e586716d918d5cb2667550c8e0f"}
```

~~~~typescript
export * as ActionsGraph from "./graph"

import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { diagnostics, inputExpression, object, read } from "./document"
import type { Diagnostics } from "./document"
import { github } from "./github"
import { gitlab } from "./gitlab"

export function parse(provider: Actions.ProviderKind, source: Actions.Source): Actions.Graph {
  const report = diagnostics()
  source.diagnostics?.forEach((message) => report.add("partial", `source_diagnostic:${message}`))
  if (source.includes?.length) report.add("partial", "source_includes:external source not resolved")
  const document = read(source.text, provider, report)
  if (!document) return { source, state: "unresolved", jobs: [], diagnostics: report.items }
  const inputs = document.header ? inputDefinitions(document.header, report) : undefined
  if (provider === "gitlab" && inputExpression(document.value)) report.add("partial", "inputs_unresolved:body interpolation retained without evaluation")
  const result = provider === "github" ? github(document.value, report) : gitlab(document.value, report, document.references)
  // Inspect only definition-level edges. Matrix cells and provider execution IDs are separate data.
  const jobs = new Map(result.jobs.map((job) => [job.id, job]))
  const degree = new Map(result.jobs.map((job) => [job.id, job.needs.filter((id) => jobs.has(id)).length]))
  const outgoing = new Map<string, string[]>()
  result.jobs.forEach((job) => job.needs.forEach((id) => {
    if (!jobs.has(id)) return
    const destinations = outgoing.get(id)
    if (destinations) {
      destinations.push(job.id)
      return
    }
    outgoing.set(id, [job.id])
  }))
  const ready = result.jobs.filter((job) => degree.get(job.id) === 0).map((job) => job.id)
  const processed = { count: 0 }
  while (processed.count < ready.length) {
    const id = ready[processed.count++]
    if (id === undefined) break
    outgoing.get(id)?.forEach((child) => {
      const remaining = (degree.get(child) ?? 0) - 1
      degree.set(child, remaining)
      if (remaining === 0) ready.push(child)
    })
  }
  if (processed.count !== result.jobs.length) {
    report.add("unresolved", `needs_cycle:${result.jobs.filter((job) => (degree.get(job.id) ?? 0) > 0).map((job) => job.id).join(",")}`)
  }
  return { source, ...result, header: document.header, inputs, state: report.state(), diagnostics: report.items }
}

function inputDefinitions(header: Schema.JsonObject, report: Diagnostics): Actions.InputDefinition[] {
  if (!object(header.spec)) return []
  if (header.spec.include !== undefined) report.add("partial", "inputs_include_unresolved:external input definitions not fetched")
  if (!object(header.spec.inputs)) return []
  return Object.entries(header.spec.inputs).flatMap(([name, configuration]) => {
    const config = configuration === null ? {} : configuration
    if (!object(config) || !name) {
      report.add("unresolved", `input_invalid:${name}`)
      return []
    }
    if (config.rules !== undefined || inputExpression(config)) {
      report.add("partial", `input_unresolved:${name}:conditional or interpolated input definition`)
      return []
    }
    const definition = {
      name, type: config.type === undefined ? "string" : config.type, required: !Object.hasOwn(config, "default"),
      description: config.description, default: config.default, options: config.options,
    }
    if (!Schema.is(Actions.InputDefinition)(definition) || !["string", "boolean", "number", "array"].includes(definition.type)) {
      report.add("unresolved", `input_invalid:${name}:unsupported native input shape`)
      return []
    }
    if (config.regex !== undefined) report.add("partial", `input_constraints:${name}:native regex retained without evaluation`)
    return [definition]
  })
}
~~~~

## AUT1-C19

```json
{"block_id":"AUT1-C19","type":"literal_source_excerpt","requests":["RE-AUT1-04"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/source/github.ts","repository_path":"packages/core/src/actions/source/github.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"48042830d79b37d23fa901759eeeaa2f56fd8253","source_sha256":"18b5e3799d02c347f7c80b58264e4e8bc6c5d8c07f7d1559a65186a9313c6bca","source_bytes":3773,"body_anchors":["A09"],"requested_subject":"Jobs/needing/cycle input, matrix/reusable/condition"}
```

```json
{"first_line":1,"last_line":62,"bytes":3773,"sha256":"18b5e3799d02c347f7c80b58264e4e8bc6c5d8c07f7d1559a65186a9313c6bca"}
```

~~~~typescript
import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { condition, expression, object, strings } from "./document"
import type { Diagnostics } from "./document"

export function github(document: Schema.JsonObject, report: Diagnostics) {
  if (!object(document.jobs) || Object.keys(document.jobs).length === 0) {
    report.add("unresolved", "jobs_invalid:GitHub requires a nonempty jobs mapping")
    return { jobs: [], triggers: document.on }
  }
  if (document.on === undefined) report.add("unresolved", "triggers_missing:GitHub requires on")
  if (document.on !== undefined && typeof document.on !== "string" && !strings(document.on) && !object(document.on)) {
    report.add("unresolved", "triggers_invalid:expected native event string, array or mapping")
  }
  const definitions = document.jobs
  const jobs = Object.entries(definitions).flatMap(([id, configuration]): Actions.GraphJob[] => {
    if (!id || !object(configuration)) {
      report.add("unresolved", `job_invalid:jobs.${id}`)
      return []
    }
    const needs = configuration.needs === undefined ? [] : typeof configuration.needs === "string"
      ? [configuration.needs] : strings(configuration.needs) ? configuration.needs : undefined
    if (!needs || needs.some((need) => !need)) report.add("unresolved", `needs_invalid:jobs.${id}`)
    needs?.forEach((need) => {
      if (!Object.hasOwn(definitions, need)) report.add("unresolved", `needs_missing:jobs.${id}->${need}`)
    })
    if (needs && new Set(needs).size !== needs.length) report.add("unresolved", `needs_duplicate:jobs.${id}`)
    const strategy = object(configuration.strategy) ? configuration.strategy : undefined
    const matrix = strategy?.matrix
    if (matrix !== undefined && expression(matrix)) report.add("partial", `matrix_dynamic:jobs.${id}`)
    if (matrix !== undefined && !object(matrix) && typeof matrix !== "string") report.add("unresolved", `matrix_invalid:jobs.${id}`)
    if (typeof configuration.uses === "string") report.add("partial", `reusable_unresolved:jobs.${id}`)
    if (configuration.uses !== undefined && typeof configuration.uses !== "string") report.add("unresolved", `reusable_invalid:jobs.${id}`)
    if (Object.hasOwn(configuration, "<<")) report.add("partial", `yaml_merge_unsupported:jobs.${id}`)
    const steps = configuration.steps === undefined ? [] : Array.isArray(configuration.steps)
      ? configuration.steps.flatMap((step, index): Actions.GraphStep[] => {
        if (!object(step)) {
          report.add("unresolved", `step_invalid:jobs.${id}.steps.${index}`)
          return []
        }
        if (step.uses !== undefined && typeof step.uses !== "string" || step.run !== undefined && typeof step.run !== "string") {
          report.add("unresolved", `step_command_invalid:jobs.${id}.steps.${index}`)
        }
        return [{
          name: typeof step.name === "string" ? step.name : typeof step.id === "string" ? step.id
            : typeof step.uses === "string" ? step.uses : `Step ${index + 1}`,
          uses: typeof step.uses === "string" ? step.uses : undefined,
          run: typeof step.run === "string" ? step.run : undefined,
          condition: condition(step.if, `jobs.${id}.steps.${index}`, report),
        }]
      }) : undefined
    if (!steps) report.add("unresolved", `steps_invalid:jobs.${id}`)
    return [{
      id, name: typeof configuration.name === "string" ? configuration.name : id,
      needs: needs ?? [], condition: condition(configuration.if, `jobs.${id}`, report),
      runner: configuration["runs-on"], matrix,
      reusable: typeof configuration.uses === "string" ? configuration.uses : undefined,
      configuration, steps: steps ?? [],
    }]
  })
  return { jobs, triggers: document.on }
}
~~~~

## AUT1-C20

```json
{"block_id":"AUT1-C20","type":"literal_source_excerpt","requests":["RE-AUT1-04"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/source/gitlab.ts","repository_path":"packages/core/src/actions/source/gitlab.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"2c78794a932b7b1680a0571a975201c55676feef","source_sha256":"cc2827422fb5962c93b849d212d0755eb040485689cd1c43219d7e885550c79c","source_bytes":11989,"body_anchors":["A10"],"requested_subject":"Includes/references, extends, precedence/arrays, defaults, needs optional/external e partial"}
```

```json
{"first_line":1,"last_line":240,"bytes":11989,"sha256":"cc2827422fb5962c93b849d212d0755eb040485689cd1c43219d7e885550c79c"}
```

~~~~typescript
import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { inputExpression, limits, object, strings } from "./document"
import type { Diagnostics } from "./document"

const reserved = new Set([
  "include", "stages", "default", "variables", "workflow", "spec", "image", "services", "cache",
  "before_script", "after_script", "types",
])

export function gitlab(document: Schema.JsonObject, report: Diagnostics, references: readonly (readonly string[])[] = []) {
  const opaque = (path: readonly string[]) => references.some((reference) => path.every((key, index) => reference[index] === key))
  const includes = document.include
  if (includes !== undefined) report.add("partial", "include_unresolved:external GitLab configuration not fetched")
  const explicit = document.stages === undefined ? document.types : document.stages
  const stages = opaque(["stages"]) || opaque(["types"]) || inputExpression(explicit) ? undefined
    : explicit === undefined ? includes === undefined ? [".pre", "build", "test", "deploy", ".post"] : undefined
    : strings(explicit) ? [...new Set([".pre", ...explicit, ".post"])] : undefined
  if (explicit !== undefined && !stages) report.add(opaque(["stages"]) || opaque(["types"]) || inputExpression(explicit) ? "partial" : "unresolved", "stages_unresolved:expected literal native stage name array")
  if (strings(explicit) && new Set(explicit).size !== explicit.length) report.add("unresolved", "stages_duplicate")
  const definitions = new Map(Object.entries(document).filter(([key]) => !reserved.has(key)))
  const resolved = new Map<string, Schema.JsonObject>()
  const levels = new Map<string, number>()
  const resolving = new Set<string>()
  const failed = new Set<string>()
  const parentsByID = new Map<string, string[]>()
  function resolve(id: string, depth = 0): Schema.JsonObject | undefined {
    if (!resolutionVisit(report)) return
    // Depth and active ancestry affect failure. A deep/cyclic caller must not poison a later shallow caller.
    const context = JSON.stringify([id, depth, Array.from(resolving)])
    if (failed.has(context)) return
    const fail = (message: string) => {
      failed.add(context)
      report.add("partial", message)
    }
    const cached = resolved.get(id)
    if (depth + (levels.get(id) ?? 0) > 11 || resolving.has(id)) {
      fail(`extends_unresolved:cycle or more than 11 levels at ${id}`)
      return
    }
    const raw = definitions.get(id)
    if (!object(raw)) {
      fail(`extends_missing:${id}`)
      return
    }
    if (opaque([id]) && depth > 0 || opaque([id, "extends"])) {
      fail(`extends_unresolved:opaque native reference at ${id}`)
      return
    }
    if (cached) return cached
    if (raw.extends === undefined || raw.extends === null) {
      resolved.set(id, raw)
      levels.set(id, 0)
      return raw
    }
    if (includes !== undefined) {
      fail(`extends_unresolved:unfetched includes may contribute parent configuration at ${id}`)
      return
    }
    const parents = parentsByID.get(id) ?? []
    if (!parentsByID.has(id)) {
      const candidates = typeof raw.extends === "string" ? [raw.extends] : Array.isArray(raw.extends) ? raw.extends : undefined
      if (!candidates || !candidates.every((parent) => {
        if (!resolutionVisit(report) || typeof parent !== "string" || !parent) return false
        parents.push(parent)
        return true
      })) {
        fail(`extends_invalid:${id}`)
        return
      }
      // Validate each immutable parent list once; repeated callers must not rescan wide failed lists.
      parentsByID.set(id, parents)
    }
    resolving.add(id)
    const result: { value: Schema.JsonObject } = { value: {} }
    const sound = parents.every((parent) => {
      const config = resolve(parent, depth + 1)
      if (!config) return false
      const value = merge(result.value, config, report)
      if (!value) return false
      result.value = value
      return true
    })
    resolving.delete(id)
    if (!sound) {
      failed.add(context)
      return
    }
    // GitLab reverse deep merge: later parent wins; child wins; arrays/null replace, never concatenate.
    const effective = merge(result.value, raw, report)
    if (!effective) {
      failed.add(context)
      return
    }
    resolved.set(id, effective)
    levels.set(id, 1 + parents.reduce((maximum, parent) => Math.max(maximum, levels.get(parent) ?? 0), 0))
    return effective
  }
  const jobs = Array.from(definitions).flatMap(([id, raw]): Actions.GraphJob[] => {
    if (id.startsWith(".")) return []
    if (!id || !object(raw)) {
      report.add("unresolved", `job_invalid:${id}`)
      return []
    }
    const effective = resolve(id)
    // Unfetched includes may redefine even known templates/jobs. Keep only source-local projections.
    const config = effective ? applyDefaults(document, effective, report, opaque, id) : raw
    if (inputExpression(id) || inputExpression(config)) report.add("partial", `inputs_unresolved:${id}:native interpolation retained`)
    const uncertain = opaque([id, "<<"])
    if (uncertain) report.add("partial", `merge_unresolved:opaque native reference at ${id}`)
    const stage = uncertain || opaque([id, "stage"]) || inputExpression(config.stage) ? undefined : typeof config.stage === "string" ? config.stage
      : config.stage === undefined && effective && includes === undefined ? "test" : undefined
    if (config.stage !== undefined && typeof config.stage !== "string") report.add(uncertain || opaque([id, "stage"]) ? "partial" : "unresolved", `stage_invalid:${id}`)
    if (stage && stages && !stages.includes(stage)) report.add(includes === undefined ? "unresolved" : "partial", `stage_missing:${id}->${stage}`)
    const status = object(config.needs) && typeof config.needs.pipeline === "string" && config.needs.pipeline.length > 0 && config.needs.job === undefined
    if (status) report.add("partial", `needs_pipeline_status:${id}`)
    const needs = uncertain || opaque([id, "needs"]) ? undefined : config.needs === undefined || status ? [] : Array.isArray(config.needs) ? config.needs.flatMap((need): string[] => {
      if (typeof need === "string" && need) {
        if (inputExpression(need)) return []
        if (!definitions.has(need) || need.startsWith(".")) report.add(includes === undefined ? "unresolved" : "partial", `needs_missing:${id}->${need}`)
        return [need]
      }
      if (!object(need) || typeof need.job !== "string" || !need.job) {
        report.add("unresolved", `needs_invalid:${id}`)
        return []
      }
      if (inputExpression(need.job)) return []
      if (need.project !== undefined || need.pipeline !== undefined) {
        report.add("partial", `needs_external:${id}->${need.job}`)
        return []
      }
      if (need.optional !== undefined && typeof need.optional !== "boolean" || need.artifacts !== undefined && typeof need.artifacts !== "boolean") {
        report.add("unresolved", `needs_options_invalid:${id}->${need.job}`)
      }
      if (!definitions.has(need.job) || need.job.startsWith(".")) {
        if (need.optional !== true) report.add(includes === undefined ? "unresolved" : "partial", `needs_missing:${id}->${need.job}`)
        return []
      }
      if (need.parallel !== undefined) report.add("partial", `needs_parallel:${id}->${need.job}`)
      return [need.job]
    }) : inputExpression(config.needs) ? [] : undefined
    if (!needs) report.add(uncertain || opaque([id, "needs"]) ? "partial" : "unresolved", `needs_invalid:${id}`)
    if (needs && new Set(needs).size !== needs.length) report.add("unresolved", `needs_duplicate:${id}`)
    if (config.trigger !== undefined) report.add("partial", `downstream_unresolved:${id}`)
    if (config.rules !== undefined || config.only !== undefined || config.except !== undefined) report.add("partial", `selection_native:${id}`)
    if (config.parallel !== undefined && !object(config.parallel) && typeof config.parallel !== "number") report.add("partial", `parallel_unresolved:${id}`)
    return [{
      id, name: id, needs: needs ?? [], stage,
      runner: uncertain ? undefined : config.tags, matrix: !uncertain && object(config.parallel) ? config.parallel.matrix : undefined,
      configuration: raw, steps: [],
    }]
  })
  if (jobs.length === 0) report.add(includes === undefined ? "unresolved" : "partial", "jobs_missing:no local execution definitions")
  return { jobs, stages, includes, triggers: document.workflow }
}

function merge(parent: Schema.JsonObject, child: Schema.JsonObject, report: Diagnostics): Schema.JsonObject | undefined {
  if (report.work.merges === limits.merges) {
    report.add("partial", `merge_limit:${limits.merges} visits`, true)
    return
  }
  const entries: [string, Schema.Json][] = []
  const sound = [...new Set([...Object.keys(parent), ...Object.keys(child)])].every((key) => {
    if (!mergeVisit(report)) return false
    const value = child[key]
    const previous = parent[key]
    const result = value === undefined ? previous : object(value) && object(previous) ? merge(previous, value, report) : value
    if (result === undefined) return false
    entries.push([key, result])
    return true
  })
  return sound ? Object.fromEntries(entries) : undefined
}

function resolutionVisit(report: Diagnostics) {
  if (report.work.resolutions === limits.resolutions) {
    report.add("partial", `resolution_limit:${limits.resolutions} visits`, true)
    return false
  }
  ++report.work.resolutions
  return true
}

function mergeVisit(report: Diagnostics) {
  if (report.work.merges === limits.merges) {
    report.add("partial", `merge_limit:${limits.merges} visits`, true)
    return false
  }
  ++report.work.merges
  return true
}

const defaultKeys = new Set([
  "after_script", "artifacts", "before_script", "cache", "hooks", "id_tokens", "image",
  "interruptible", "retry", "services", "tags",
])

export function applyDefaults(document: Schema.JsonObject, config: Schema.JsonObject, report: Diagnostics, opaque = (_path: readonly string[]) => false, id?: string) {
  if (document.default === undefined) return config
  const inheritance = object(config.inherit) ? config.inherit.default : undefined
  if (config.inherit !== undefined && !object(config.inherit)
    || inheritance !== undefined && typeof inheritance !== "boolean" && !Array.isArray(inheritance)
    || inputExpression(config.inherit) || id !== undefined && opaque([id, "inherit"])
    || opaque(["default"]) || !object(document.default)) {
    report.add("partial", "defaults_unresolved:expected literal defaults and inherit:default boolean or allowlist")
    return config
  }
  if (inheritance === false) return config
  const allowed = new Set<string>()
  if (Array.isArray(inheritance) && !inheritance.every((key) => {
    if (!mergeVisit(report)) return false
    if (typeof key !== "string" || !defaultKeys.has(key)) return false
    allowed.add(key)
    return true
  })) {
    report.add("partial", "defaults_unresolved:unsupported or excessive inherit:default allowlist")
    return config
  }
  if (document.include !== undefined) {
    report.add("partial", "defaults_unresolved:unfetched includes may contribute job overrides")
    return config
  }
  if (report.work.merges === limits.merges) {
    report.add("partial", `merge_limit:${limits.merges} visits`, true)
    return config
  }
  const entries: [string, Schema.Json][] = []
  const sound = Object.entries(document.default).every(([key, value]) => {
    if (!mergeVisit(report)) return false
    if (!defaultKeys.has(key)) {
      report.add("partial", `default_unsupported:${key}`)
      return true
    }
    if (Array.isArray(inheritance) && !allowed.has(key) || Object.hasOwn(config, key)) return true
    // Native defaults copy whole keywords; they never deep-merge into an explicit job keyword.
    entries.push([key, value])
    return true
  })
  return sound ? { ...Object.fromEntries(entries), ...config } : config
}
~~~~

## AUT1-C21

```json
{"block_id":"AUT1-C21","type":"literal_source_excerpt","requests":["RE-AUT1-05"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/authoring/input.ts","repository_path":"packages/core/src/actions/authoring/input.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"92f38a96b425e8cbb9f6e1946c6c40fa78218e81","source_sha256":"93d7315954e83b280a4c1ae64b6882bb1d341b80e448cf1fd36330c30ed58fd2","source_bytes":8268,"body_anchors":["A11"],"requested_subject":"Payloads strict, bytes/path/ref, captura/fields por kind e versões/precondições"}
```

```json
{"first_line":9,"last_line":124,"bytes":7942,"sha256":"639d6aecd5c4b40bd50d37c1be0037fd7c0cca96d0e4150b6449874a534e0540"}
```

~~~~typescript
export type Services = { readonly transport: ActionsContract.Transport; readonly reader: ActionsContract.ReadAdapter }
const strict = { onExcessProperty: "error" } as const
const provider = Schema.Literals(["github", "gitlab"])
export const Branch = Schema.Struct({ provider, branch: Schema.NonEmptyString }).annotate({ parseOptions: strict })
export const Write = Schema.Struct({
  provider, mode: Schema.Literals(["create", "update"]), message: Schema.NonEmptyString, text: Schema.String,
  name: Schema.optionalKey(Schema.NonEmptyString),
  template: Schema.optionalKey(Schema.Literals(["Build and test", "Release", "Blank configuration"])),
}).annotate({ parseOptions: strict })
export const Review = Schema.Struct({ provider, title: Schema.NonEmptyString, text: Schema.String }).annotate({ parseOptions: strict })
export const Version = Schema.Struct({ blob_id: GitHubNative.SHA, last_commit_id: GitHubNative.SHA })
const Capture = Schema.Struct({ binding: Actions.Binding, intent: Actions.OperationIntent, payload: Schema.Json })

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string, disposition: Actions.SendDisposition = "definitely_unsent") {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: binding.provider.kind, disposition })
}

export function decode<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, value: unknown, sent = false): A {
  const decoded = Schema.decodeUnknownOption(schema, sent ? undefined : strict)(value)
  if (Option.isNone(decoded)) throw error(binding, sent ? "outcome_unknown" : "invalid_input",
    sent ? "Source mutation response did not prove native identity" : "Source command does not match its strict schema",
    sent ? "unknown" : "definitely_unsent")
  return decoded.value
}

export function native<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, value: unknown): A {
  const decoded = Schema.decodeUnknownOption(schema)(value)
  if (Option.isNone(decoded)) throw error(binding, "transport_failed", "Provider did not prove source preflight identity")
  return decoded.value
}

export function branch(binding: Actions.Binding, value: string) {
  if (!value || value.length > 1024 || !value.isWellFormed() || /[\s\\%?#{}:\x00-\x1f\x7f~^*\[]/.test(value) || value.includes("..") ||
    value.includes("@{") || value === "@" || value.startsWith("-") || value.endsWith(".") ||
    value.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock")))
    throw error(binding, "invalid_input", "Source branch must be an exact safe native branch name")
  if (value.startsWith("refs/") || Option.isSome(Schema.decodeUnknownOption(GitHubNative.SHA)(value)))
    throw error(binding, "invalid_input", "Source mutations require a short branch name, not an immutable object or qualified ref")
  return value
}

export function sourcePath(binding: Actions.Binding, value: string | undefined) {
  if (!value || value.length > 4096 || !value.isWellFormed())
    throw error(binding, "invalid_input", "Source commands require an exact admitted repository path")
  if (binding.provider.kind === "gitlab") {
    if (!ActionsGitLabNative.localPath(value))
      throw error(binding, "source_unresolved", "GitLab source proposals require an exact local repository path")
    return value
  }
  GitHubNative.path(binding, value)
  if (!value.startsWith(".github/workflows/") || !/^[^/]+\.ya?ml$/i.test(value.slice(".github/workflows/".length)))
    throw error(binding, "source_unresolved", "GitHub source proposals require a native workflow YAML path")
  return value
}

export function bytes(text: string) {
  if (text.length > limits.sourceBytes || !text.isWellFormed())
    throw new ActionsError({ kind: "invalid_input", message: "Source must be well-formed Unicode within 1048576 UTF-8 bytes", disposition: "definitely_unsent" })
  const value = new TextEncoder().encode(text)
  if (value.length > limits.sourceBytes)
    throw new ActionsError({ kind: "invalid_input", message: "Source exceeds 1048576 UTF-8 bytes", disposition: "definitely_unsent" })
  return value
}

export function capture(binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
  decode(binding, Schema.toType(Capture), { binding, intent, payload })
  // Snapshot before the first await. Mutation values never become durable intent fields.
  const value = decode(binding, Schema.fromJsonString(Capture), JSON.stringify({ binding, intent, payload }))
  if (value.intent.binding.id !== value.binding.id || value.intent.binding.revision !== value.binding.revision)
    throw error(binding, "binding_stale", "Source command binding differs from admission")
  if (!["source.branch", "source.write", "source.review"].includes(value.intent.kind))
    throw error(binding, "invalid_input", "Source command kind belongs to another dispatcher")
  if (Object.keys(value.intent.target).some((key) => !["ref", "path", "resourceID"].includes(key)))
    throw error(binding, "invalid_input", "Historical runs and execution targets cannot authorize source mutations")
  if (value.intent.expected?.attempt !== undefined || value.intent.expected?.resourceVersion !== undefined)
    throw error(binding, "invalid_input", "Source commands require source versions and commits, not execution or resource versions")
  if (!value.intent.target.ref || !value.intent.expected?.commit)
    throw error(binding, "invalid_input", "Source commands require an admitted branch and immutable expected commit")
  branch(binding, value.intent.target.ref)
  decode(binding, GitHubNative.SHA, value.intent.expected.commit)
  sourcePath(binding, value.intent.target.path)
  if (value.intent.expected.sourceVersion !== undefined) {
    if (!value.intent.target.path) throw error(binding, "invalid_input", "Source version requires an admitted path")
    version(binding, value.intent.expected.sourceVersion)
  }
  if (value.intent.kind === "source.branch") {
    if (!value.intent.target.resourceID) throw error(binding, "invalid_input", "Branch creation requires its admitted new branch")
    branch(binding, value.intent.target.resourceID)
    if (value.intent.target.resourceID === value.intent.target.ref)
      throw error(binding, "invalid_input", "Source branch must differ from its captured base")
  }
  if (value.intent.kind === "source.write" && (!value.intent.target.path || value.intent.target.resourceID !== undefined))
    throw error(binding, "invalid_input", "Source writes require only their admitted path and branch")
  if (value.intent.kind === "source.review" && value.intent.target.resourceID !== undefined)
    branch(binding, value.intent.target.resourceID)
  return value
}

export function version(binding: Actions.Binding, value: string) {
  return binding.provider.kind === "github" ? { blob_id: decode(binding, GitHubNative.SHA, value), last_commit_id: undefined }
    : decode(binding, Schema.fromJsonString(Version).annotate({ parseOptions: strict }), value)
}

export function source(binding: Actions.Binding, intent: Actions.OperationIntent, value: Actions.Source) {
  if (value.bindingID !== binding.id || value.path !== intent.target.path || value.ref !== intent.target.ref || !value.commit)
    throw error(binding, "source_unresolved", "Reader did not prove the admitted source identity")
  decode(binding, GitHubNative.SHA, value.commit)
  const selected = version(binding, value.version)
  bytes(value.text)
  const expected = intent.expected?.sourceVersion === undefined ? undefined : version(binding, intent.expected.sourceVersion)
  if (value.commit.toLowerCase() !== intent.expected?.commit?.toLowerCase() || expected !== undefined &&
    (selected.blob_id.toLowerCase() !== expected.blob_id.toLowerCase() ||
      selected.last_commit_id?.toLowerCase() !== expected.last_commit_id?.toLowerCase()))
    throw error(binding, "source_conflict", "Native source changed after admission")
  return value
}
~~~~

## AUT1-C22

```json
{"block_id":"AUT1-C22","type":"literal_source_excerpt","requests":["RE-AUT1-05"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/authoring/base.ts","repository_path":"packages/core/src/actions/authoring/base.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"3c18b87555faf8d09b789ac5dc7316c6721f0f58","source_sha256":"401a807ef4861a182c4ad70985f5d13d9b43a714693ec78ad2d9ec0dc1b83d7d","source_bytes":4981,"body_anchors":["A11"],"requested_subject":"Default branch observada, commit-base e revalidação de draft"}
```

```json
{"first_line":14,"last_line":72,"bytes":4470,"sha256":"584a54990fe9134f6ca5be3bb0cf1b660d42577d33a17ab35250fcd2d322433a"}
```

~~~~typescript
const GitHubRef = Schema.Struct({ ref: Schema.NonEmptyString,
  object: Schema.Struct({ type: Schema.Literal("commit"), sha: GitHubNative.SHA }) })
const GitLabRef = Schema.Struct({ name: Schema.NonEmptyString, commit: Schema.Struct({ id: ActionsGitLabNative.SHA }) })

export const read = Effect.fn("ActionsSourceBase.read")(function* (
  services: Services, binding: Actions.Binding, ref?: string,
): Effect.fn.Return<Actions.SourceBase, ActionsError> {
  const frozen = yield* guard(binding, () => {
    decode(binding, Schema.toType(Actions.Binding), binding)
    if (ref !== undefined) branch(binding, ref)
    return { binding: { ...binding, provider: { ...binding.provider } }, ref }
  })
  if (frozen.binding.provider.kind === "github") {
    const repository = yield* GitHubNative.repository(services.transport, frozen.binding)
    const selected = frozen.ref ?? repository.native.default_branch
    if (!selected) return yield* error(frozen.binding, "source_unresolved", "GitHub repository has no observed default branch")
    const name = yield* guard(frozen.binding, () => branch(frozen.binding, selected))
    const response = yield* GitHubNative.get(services.transport, frozen.binding,
      { method: "GET", path: `${repository.path}/git/ref/heads/${name.split("/").map(encodeURIComponent).join("/")}` })
    const value = yield* guard(frozen.binding, () => native(frozen.binding, GitHubRef, response.data))
    if (value.ref !== `refs/heads/${name}`) return yield* error(frozen.binding, "source_conflict", "GitHub branch identity differs from the requested branch")
    return { bindingID: frozen.binding.id, ref: name, commit: value.object.sha }
  }
  const project = yield* ActionsGitLabNative.make(services.transport).project(frozen.binding)
  const selected = frozen.ref ?? project.default_branch
  if (!selected) return yield* error(frozen.binding, "source_unresolved", "GitLab project has no observed default branch")
  const name = yield* guard(frozen.binding, () => branch(frozen.binding, selected))
  const root = yield* guard(frozen.binding, () => ActionsGitLabNative.projectPath(frozen.binding))
  const response = yield* get(services, frozen.binding, `${root}/repository/branches/${encodeURIComponent(name)}`)
  const value = yield* guard(frozen.binding, () => native(frozen.binding, GitLabRef, response.data))
  if (value.name !== name) return yield* error(frozen.binding, "source_conflict", "GitLab branch identity differs from the requested branch")
  return { bindingID: frozen.binding.id, ref: name, commit: value.commit.id }
})

export const validate = Effect.fn("ActionsSourceBase.validate")(function* (
  services: Services, binding: Actions.Binding, base: Actions.SourceBase, path: string, draft: string,
): Effect.fn.Return<Actions.Graph, ActionsError> {
  const frozen = yield* guard(binding, () => {
    decode(binding, Schema.toType(Actions.Binding), binding)
    const admitted = decode(binding, Schema.toType(Actions.SourceBase), base)
    if (admitted.bindingID !== binding.id) throw error(binding, "source_unresolved", "Source base belongs to another binding")
    branch(binding, admitted.ref)
    const draftBytes = bytes(draft)
    GitHubNative.path(binding, path)
    if (binding.provider.kind === "github" && (!path.startsWith(".github/workflows/") || path.split("/").length !== 3 || !/\.ya?ml$/i.test(path)))
      throw error(binding, "invalid_input", "GitHub draft path must be a workflow YAML file")
    if (binding.provider.kind === "gitlab" && !ActionsGitLabNative.localPath(path))
      throw error(binding, "invalid_input", "GitLab draft path must be a local repository path")
    // A draft digest identifies local text, never a native optimistic mutation version.
    const source: Actions.Source = { bindingID: admitted.bindingID, path, ref: admitted.ref, commit: admitted.commit,
      version: `draft:sha256:${createHash("sha256").update(draftBytes).digest("hex")}`, text: draft, editable: false }
    decode(binding, Schema.toType(Actions.Source), source)
    return { binding: { ...binding, provider: { ...binding.provider } }, base: { ...admitted }, source }
  })
  const current = yield* read(services, frozen.binding, frozen.base.ref)
  if (current.commit.toLowerCase() !== frozen.base.commit.toLowerCase())
    return yield* error(frozen.binding, "source_conflict", "Source branch moved after base admission")
  return yield* ActionsAuthoring.make(services).validate(frozen.binding, frozen.source)
})
~~~~

## AUT1-C23

```json
{"block_id":"AUT1-C23","type":"literal_source_excerpt","requests":["RE-AUT1-05"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/authoring/index.ts","repository_path":"packages/core/src/actions/authoring/index.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"7a555bdb35cedd26ab5ddc151c1d068b40eb0144","source_sha256":"219a11d44b682e37a729f0ef4060ad2eda6eae05737dbac5de2325b6b3b10075","source_bytes":2854,"body_anchors":["A11","A14"],"requested_subject":"Snapshot, validação/lint, seleção do plano e uma execução"}
```

```json
{"first_line":16,"last_line":52,"bytes":2232,"sha256":"3caeb03c64b46954ee0f70b3390c13367228eb73dcf1401ea9262a90e2fecd37"}
```

~~~~typescript
export function validate(binding: Actions.Binding, source: Actions.Source): Actions.Graph {
  if (source.bindingID !== binding.id)
    return { source, state: "unresolved", jobs: [], diagnostics: ["source_unresolved:binding_mismatch"] }
  if (source.text.length <= limits.sourceBytes && !source.text.isWellFormed())
    return { source, state: "unresolved", jobs: [], diagnostics: ["source_unresolved:unicode_invalid:source must be well-formed Unicode"] }
  return ActionsGraph.parse(binding.provider.kind, source)
}

export function make(services: Services) {
  return {
    validate: Effect.fn("ActionsAuthoring.validate")(function* (binding: Actions.Binding, source: Actions.Source): Effect.fn.Return<Actions.Graph, ActionsError> {
      const frozen = yield* guard(binding, () => {
        decode(binding, Schema.toType(Actions.Binding), binding)
        decode(binding, Schema.toType(Actions.Source), source)
        return { binding: { ...binding, provider: { ...binding.provider } }, source: { ...source } }
      })
      const graph = validate(frozen.binding, frozen.source)
      if (frozen.binding.provider.kind === "github" || graph.state === "unresolved") return graph
      const { lint } = yield* Effect.promise(() => import("./lint"))
      return yield* lint(services, frozen.binding, frozen.source, graph)
    }),
    perform: Effect.fn("ActionsAuthoring.perform")(function* (
      binding: Actions.Binding, intent: Actions.OperationIntent, payloadJson: ActionsContract.Json,
    ): Effect.fn.Return<ActionsContract.CommandResult, ActionsError> {
      const frozen = yield* guard(binding, () => capture(binding, intent, payloadJson))
      const prepared = yield* before(frozen.binding, Effect.gen(function* () {
        if (frozen.binding.provider.kind === "gitlab") {
          const { plan } = yield* Effect.promise(() => import("./gitlab"))
          return yield* plan(services, frozen.binding, frozen.intent, frozen.payload)
        }
        return yield* plan(services, frozen.binding, frozen.intent, frozen.payload)
      }))
      // The durable parent owns admission, receipt reads and phase sequencing. This call sends once.
      return yield* send(services, frozen.binding, prepared)
    }),
  }
}
~~~~

## AUT1-C24

```json
{"block_id":"AUT1-C24","type":"literal_source_excerpt","requests":["RE-AUT1-05"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/authoring/github.ts","repository_path":"packages/core/src/actions/authoring/github.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"fefe6fd6df55ea6fee6f898b9b5e37b13c650307","source_sha256":"bdcb41b748e4a4ac148867cfbcffe6638ed5dc2b07f3e6bfc25746f7f9134790","source_bytes":6777,"body_anchors":["A12"],"requested_subject":"Schemas de retorno e ramos branch/create/update/review/head completos"}
```

```json
{"first_line":11,"last_line":99,"bytes":6270,"sha256":"6caba49e8faf80a94cd4da34770a78de6dd76c29d6e3e0df6ae759b183f67a39"}
```

~~~~typescript
const Ref = Schema.Struct({ ref: Schema.NonEmptyString, object: Schema.Struct({ type: Schema.Literal("commit"), sha: GitHubNative.SHA }) })
const Content = Schema.Struct({
  content: Schema.Struct({ path: Schema.NonEmptyString, type: Schema.Literal("file"), sha: GitHubNative.SHA }),
  commit: Schema.Struct({ sha: GitHubNative.SHA }),
})
const Pull = Schema.Struct({
  id: GitHubNative.ID, number: GitHubNative.ID, html_url: Schema.NonEmptyString, title: Schema.NonEmptyString,
  body: Schema.NullOr(Schema.String), state: Schema.Literal("open"),
  head: Schema.Struct({ ref: Schema.NonEmptyString, sha: GitHubNative.SHA, repo: Schema.Struct({ id: GitHubNative.ID }) }),
  base: Schema.Struct({ ref: Schema.NonEmptyString, repo: Schema.Struct({ id: GitHubNative.ID }) }),
})

export const plan = Effect.fn("ActionsAuthoring.github")(function* (
  services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json,
): Effect.fn.Return<Plan, import("../error").ActionsError> {
  const command = yield* guard(binding, () => {
    const value = intent.kind === "source.branch" ? decode(binding, Branch, payload)
      : intent.kind === "source.write" ? decode(binding, Write, payload) : decode(binding, Review, payload)
    if (value.provider !== "github") throw error(binding, "invalid_input", "Source command provider differs from the bound repository")
    if ("text" in value) bytes(value.text)
    return value
  })
  const path = yield* guard(binding, () => sourcePath(binding, intent.target.path))
  const repo = yield* GitHubCommandCommon.authority(services, binding)
  const ref = yield* head(services, binding, repo.root, intent.target.ref ?? "")
  if (ref.toLowerCase() !== intent.expected?.commit?.toLowerCase())
    return yield* error(binding, "source_conflict", "Source branch moved after admission")
  if (intent.kind !== "source.write" && intent.expected?.sourceVersion !== undefined) yield* current(services, binding, intent)

  if ("branch" in command) {
    if (command.branch !== intent.target.resourceID)
      return yield* error(binding, "invalid_input", "New source branch differs from admission")
    if (intent.expected?.sourceVersion === undefined)
      yield* absent(services, binding, `${repo.root}/contents/${GitHubNative.path(binding, path)}`, ref)
    return {
      request: { method: "POST", path: `${repo.root}/git/refs`, body: { ref: `refs/heads/${command.branch}`, sha: ref } }, status: 201,
      acknowledge: (response) => guard(binding, () => {
        const value = decode(binding, Ref, response.data, true)
        if (value.ref !== `refs/heads/${command.branch}` || value.object.sha.toLowerCase() !== ref.toLowerCase())
          throw error(binding, "outcome_unknown", "GitHub did not prove the exact new branch and base commit", "unknown")
        return { acknowledgement: { resourceID: command.branch } }
      }),
    }
  }
  if ("mode" in command) {
    if (command.mode === "update" && !intent.expected?.sourceVersion || command.mode === "create" && intent.expected?.sourceVersion !== undefined)
      return yield* error(binding, "invalid_input", "Source create/update mode conflicts with its blob precondition")
    const previous = command.mode === "update" ? yield* current(services, binding, intent) : undefined
    if (previous?.text === command.text)
      return yield* error(binding, "invalid_input", "Source content is unchanged; no write was sent")
    // Contents create has native absence semantics; update supplies the authoritative blob SHA.
    return {
      request: { method: "PUT", path: `${repo.root}/contents/${GitHubNative.path(binding, path)}`, body: {
        message: command.message, content: Buffer.from(bytes(command.text)).toString("base64"), branch: intent.target.ref ?? "",
        ...(previous ? { sha: previous.version } : {}),
      } }, status: command.mode === "create" ? 201 : 200,
      acknowledge: (response) => Effect.gen(function* () {
        const value = yield* guard(binding, () => decode(binding, Content, response.data, true))
        if (value.content.path !== path || value.content.sha.toLowerCase() !== blob(command.text, value.content.sha))
          return yield* error(binding, "outcome_unknown", "GitHub did not prove the written path and blob", "unknown")
        return yield* written(services, binding, intent, command.text, value.commit.sha, value.content.sha)
      }),
    }
  }
  const base = yield* guard(binding, () => branch(binding, intent.target.resourceID ?? repo.native.default_branch ?? ""))
  if (base === intent.target.ref) return yield* error(binding, "invalid_input", "Review head and base must differ")
  yield* head(services, binding, repo.root, base)
  return {
    request: { method: "POST", path: `${repo.root}/pulls`, body: { head: intent.target.ref ?? "", base, title: command.title, body: command.text } }, status: 201,
    acknowledge: (response) => guard(binding, () => {
      const value = decode(binding, Pull, response.data, true)
      if (String(value.head.repo.id) !== binding.projectID || String(value.base.repo.id) !== binding.projectID ||
        value.head.ref !== intent.target.ref || value.head.sha.toLowerCase() !== ref.toLowerCase() || value.base.ref !== base ||
        value.title !== command.title || (value.body ?? "") !== command.text)
        throw error(binding, "outcome_unknown", "GitHub did not prove the exact same-repository review request", "unknown")
      const id = String(value.number)
      return { acknowledgement: { resourceID: id }, output: { kind: "sourceReview" as const, id,
        url: reviewURL(binding, value.html_url, `/${repo.native.full_name}/pull/${id}`) } }
    }),
  }
})

const head = Effect.fn("ActionsAuthoring.githubHead")(function* (services: Services, binding: Actions.Binding, root: string, name: string) {
  yield* guard(binding, () => branch(binding, name))
  const response = yield* get(services, binding, `${root}/git/ref/heads/${name.split("/").map(encodeURIComponent).join("/")}`)
  const value = yield* guard(binding, () => native(binding, Ref, response.data))
  if (value.ref !== `refs/heads/${name}`) return yield* error(binding, "source_conflict", "GitHub branch identity differs from admission")
  return value.object.sha
})
~~~~

## AUT1-C25

```json
{"block_id":"AUT1-C25","type":"literal_source_excerpt","requests":["RE-AUT1-05"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/authoring/gitlab.ts","repository_path":"packages/core/src/actions/authoring/gitlab.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"2e17c642d355cdb595332f3069a0928ef192ae08","source_sha256":"aba55ae13260350fc70490bbf9930e19cb648babb5f555b23c3c350161e479a9","source_bytes":7205,"body_anchors":["A13"],"requested_subject":"Schemas de retorno e ramos branch/create/update/MR/head completos"}
```

```json
{"first_line":10,"last_line":101,"bytes":6737,"sha256":"956854139e87cb31220d709dca2a392df586e3f66093940560f9a9866334e0ad"}
```

~~~~typescript
const Ref = Schema.Struct({ name: Schema.NonEmptyString, commit: Schema.Struct({ id: ActionsGitLabNative.SHA }) })
const File = Schema.Struct({ file_path: Schema.NonEmptyString, branch: Schema.NonEmptyString })
const Merge = Schema.Struct({
  id: ActionsGitLabNative.ID, iid: ActionsGitLabNative.ID, project_id: ActionsGitLabNative.ID,
  source_project_id: ActionsGitLabNative.ID, target_project_id: ActionsGitLabNative.ID,
  source_branch: Schema.NonEmptyString, target_branch: Schema.NonEmptyString, sha: ActionsGitLabNative.SHA,
  title: Schema.NonEmptyString, description: Schema.NullOr(Schema.String), state: Schema.Literal("opened"), web_url: Schema.NonEmptyString,
})

export const plan = Effect.fn("ActionsAuthoring.gitlab")(function* (
  services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json,
): Effect.fn.Return<Plan, import("../error").ActionsError> {
  const command = yield* guard(binding, () => {
    const value = intent.kind === "source.branch" ? decode(binding, Branch, payload)
      : intent.kind === "source.write" ? decode(binding, Write, payload) : decode(binding, Review, payload)
    if (value.provider !== "gitlab") throw error(binding, "invalid_input", "Source command provider differs from the bound project")
    if ("text" in value) bytes(value.text)
    return value
  })
  const path = yield* guard(binding, () => sourcePath(binding, intent.target.path))
  const root = yield* guard(binding, () => ActionsGitLabNative.projectPath(binding))
  const project = yield* before(binding, ActionsGitLabNative.make(services.transport).project(binding))
  yield* actor(services, binding)
  if (project.archived === true || project.repository_access_level === "disabled")
    return yield* error(binding, "permission_denied", "GitLab project metadata denies source writes")
  // Missing role/scope evidence remains unknown; native authorization decides this explicit write.
  // This is an explicit repository-file proposal, not a change to the project's CI config slot.
  const ref = yield* head(services, binding, root, intent.target.ref ?? "")
  if (ref.toLowerCase() !== intent.expected?.commit?.toLowerCase())
    return yield* error(binding, "source_conflict", "GitLab source branch moved after admission")
  if (intent.kind !== "source.write" && intent.expected?.sourceVersion !== undefined) yield* current(services, binding, intent)
  if ("branch" in command) {
    if (command.branch !== intent.target.resourceID)
      return yield* error(binding, "invalid_input", "New source branch differs from admission")
    if (intent.expected?.sourceVersion === undefined)
      yield* absent(services, binding, `${root}/repository/files/${encodeURIComponent(path)}`, ref)
    return {
      request: { method: "POST", path: `${root}/repository/branches`, body: { branch: command.branch, ref } }, status: 201,
      acknowledge: (response) => guard(binding, () => {
        const value = decode(binding, Ref, response.data, true)
        if (value.name !== command.branch || value.commit.id.toLowerCase() !== ref.toLowerCase())
          throw error(binding, "outcome_unknown", "GitLab did not prove the exact new branch and base commit", "unknown")
        return { acknowledgement: { resourceID: command.branch } }
      }),
    }
  }
  if ("mode" in command) {
    if (command.mode === "update" && !intent.expected?.sourceVersion || command.mode === "create" && intent.expected?.sourceVersion !== undefined)
      return yield* error(binding, "invalid_input", "Source create/update mode conflicts with its file precondition")
    const previous = command.mode === "update" ? yield* current(services, binding, intent) : undefined
    if (previous?.text === command.text) return yield* error(binding, "invalid_input", "Source content is unchanged; no write was sent")
    const fileVersion = previous ? yield* guard(binding, () => decode(binding, Schema.fromJsonString(Version), previous.version)) : undefined
    return {
      request: { method: command.mode === "create" ? "POST" : "PUT", path: `${root}/repository/files/${encodeURIComponent(path)}`, body: {
        branch: intent.target.ref ?? "", commit_message: command.message, content: command.text,
        ...(fileVersion ? { last_commit_id: fileVersion.last_commit_id } : {}),
      } }, status: command.mode === "create" ? 201 : 200,
      acknowledge: (response) => Effect.gen(function* () {
        const value = yield* guard(binding, () => decode(binding, File, response.data, true))
        if (value.file_path !== path || value.branch !== intent.target.ref)
          return yield* error(binding, "outcome_unknown", "GitLab did not prove the written file and branch", "unknown")
        return yield* written(services, binding, intent, command.text)
      }),
    }
  }
  const base = yield* guard(binding, () => branch(binding, intent.target.resourceID ?? project.default_branch ?? ""))
  if (base === intent.target.ref) return yield* error(binding, "invalid_input", "Review head and base must differ")
  yield* head(services, binding, root, base)
  return {
    request: { method: "POST", path: `${root}/merge_requests`, body: {
      source_branch: intent.target.ref ?? "", target_branch: base, title: command.title, description: command.text,
    } }, status: 201,
    acknowledge: (response) => guard(binding, () => {
      const value = decode(binding, Merge, response.data, true)
      if (String(value.project_id) !== binding.projectID || String(value.source_project_id) !== binding.projectID || String(value.target_project_id) !== binding.projectID ||
        value.source_branch !== intent.target.ref || value.target_branch !== base || value.sha.toLowerCase() !== ref.toLowerCase() ||
        value.title !== command.title || (value.description ?? "") !== command.text)
        throw error(binding, "outcome_unknown", "GitLab did not prove the exact same-project review request", "unknown")
      const id = String(value.iid)
      return { acknowledgement: { resourceID: id }, output: { kind: "sourceReview" as const, id,
        url: reviewURL(binding, value.web_url, `/${project.path_with_namespace}/-/merge_requests/${id}`) } }
    }),
  }
})

const head = Effect.fn("ActionsAuthoring.gitlabHead")(function* (services: Services, binding: Actions.Binding, root: string, name: string) {
  yield* guard(binding, () => branch(binding, name))
  const response = yield* get(services, binding, `${root}/repository/branches/${encodeURIComponent(name)}`)
  const value = yield* guard(binding, () => native(binding, Ref, response.data))
  if (value.name !== name) return yield* error(binding, "source_conflict", "GitLab branch identity differs from admission")
  return value.commit.id
})
~~~~

## AUT1-C26

```json
{"block_id":"AUT1-C26","type":"literal_source_excerpt","requests":["RE-AUT1-05"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/authoring/remote.ts","repository_path":"packages/core/src/actions/authoring/remote.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"0ef1c6bbc54e8e4a73bc9e82a7f1b6653161d3d7","source_sha256":"458a706a6415cb1e3d554169149215269f49bcbd5a5fc77f51162840cfcb13d8","source_bytes":8787,"body_anchors":["A14"],"requested_subject":"before/after, actor/absent/current/written/readSource/reviewURL/send completos"}
```

```json
{"first_line":12,"last_line":129,"bytes":8288,"sha256":"3c5e1b51587793cd2ede3992406134f3a16af311522d120f5c4043a2898aaa1a"}
```

~~~~typescript
export type Plan = {
  readonly request: ActionsContract.Request
  readonly status: number
  readonly acknowledge: (response: ActionsContract.Response) => Effect.Effect<ActionsContract.CommandResult, ActionsError>
}

export function guard<A>(binding: Actions.Binding, fn: () => A) {
  return Effect.try({ try: fn, catch: (cause) => cause instanceof ActionsError
    ? error(binding, cause.kind, cause.message, cause.disposition) : error(binding, "invalid_input", "Source metadata could not be validated") })
}

export function before<A>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError>) {
  return effect.pipe(Effect.mapError((cause) => error(binding, cause.kind, "Source mutation preflight failed")))
}

export function after<A>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError>) {
  // Once a write was sent, a failed proof is never a definitive rejection or a retry instruction.
  return effect.pipe(Effect.mapError(() => error(binding, "outcome_unknown", "Source mutation outcome was not proved", "unknown")))
}

export const get = Effect.fn("ActionsAuthoring.get")(function* (services: Services, binding: Actions.Binding, path: string, query?: ActionsContract.Request["query"]) {
  const response = yield* before(binding, services.transport.request(binding, { method: "GET", path, ...(query ? { query } : {}) }))
  if (response.status !== 200) {
    const failure = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* error(binding, failure.kind, "Source preflight read was rejected")
  }
  return response
})

export const actor = Effect.fn("ActionsAuthoring.actor")(function* (services: Services, binding: Actions.Binding) {
  if (!binding.account) return yield* error(binding, "not_authenticated", "Source authoring requires the captured signed-in account")
  const response = yield* get(services, binding, "user")
  const account = yield* guard(binding, () => binding.provider.kind === "github"
    ? native(binding, Schema.Struct({ login: Schema.NonEmptyString }), response.data).login
    : native(binding, Schema.Struct({ username: Schema.NonEmptyString }), response.data).username)
  if (account.toLowerCase() !== binding.account.toLowerCase())
    return yield* error(binding, "binding_stale", "Source authoring account changed after admission")
})

/** Call only after the exact project, actor and base branch/commit have been proved. */
export const absent = Effect.fn("ActionsAuthoring.absent")(function* (services: Services, binding: Actions.Binding, path: string, commit: string) {
  // Keep the transport's rejection evidence until classification. A generic/partial not_found is not absence.
  const response = yield* before(binding, services.transport.request(binding, { method: "GET", path, query: { ref: commit } }).pipe(
    Effect.catchIf((cause) => cause.kind === "not_found" && cause.disposition === "definitely_rejected", () => Effect.succeed(undefined)),
  ))
  if (!response || response.status === 404) return
  if (response.status === 200) return yield* error(binding, "source_conflict", "New source file already exists at the admitted base commit")
  const failure = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
  return yield* error(binding, failure.kind, "Source file absence was not proved")
})

export const current = Effect.fn("ActionsAuthoring.current")(function* (services: Services, binding: Actions.Binding, intent: Actions.OperationIntent) {
  if (!intent.target.path || !intent.target.ref) return yield* error(binding, "invalid_input", "Source precondition requires a path and branch")
  const value = yield* before(binding, readSource(services, binding, intent.target.path, intent.target.ref))
  return yield* guard(binding, () => source(binding, intent, value))
})

export function blob(text: string, algorithm: string) {
  const value = bytes(text)
  return createHash(algorithm.length === 40 ? "sha1" : "sha256").update(`blob ${value.length}\0`).update(value).digest("hex")
}

export const written = Effect.fn("ActionsAuthoring.written")(function* (
  services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, text: string, commit?: string, blobID?: string,
) {
  if (!intent.target.path || !intent.target.ref) return yield* error(binding, "outcome_unknown", "Written source target is missing", "unknown")
  const value = yield* readSource(services, binding, intent.target.path, intent.target.ref)
  return yield* guard(binding, () => {
    const native = version(binding, value.version)
    if (value.bindingID !== binding.id || value.path !== intent.target.path || value.ref !== intent.target.ref || !value.commit ||
      value.commit.toLowerCase() === intent.expected?.commit?.toLowerCase() ||
      commit !== undefined && value.commit.toLowerCase() !== commit.toLowerCase() || value.text !== text ||
      native.blob_id.toLowerCase() !== blob(text, native.blob_id) || blobID !== undefined && native.blob_id.toLowerCase() !== blobID.toLowerCase() ||
      native.last_commit_id !== undefined && native.last_commit_id.toLowerCase() !== value.commit.toLowerCase())
      throw error(binding, "outcome_unknown", "Provider did not prove the exact written file, branch, blob and new commit", "unknown")
    decode(binding, GitHubNative.SHA, value.commit)
    return { acknowledgement: { resourceID: value.commit } }
  })
})

const readSource = Effect.fn("ActionsAuthoring.readSource")(function* (services: Services, binding: Actions.Binding, path: string, ref: string) {
  if (binding.provider.kind === "github") return yield* services.reader.source(binding, { path, ref })
  // Read the exact local file at the proved branch head. Project CI settings do not select a proposal's path.
  const root = yield* guard(binding, () => ActionsGitLabNative.projectPath(binding))
  yield* guard(binding, () => branch(binding, ref))
  const response = yield* get(services, binding, `${root}/repository/branches/${encodeURIComponent(ref)}`)
  const head = yield* guard(binding, () => native(binding, Schema.Struct({ name: Schema.NonEmptyString,
    commit: Schema.Struct({ id: ActionsGitLabNative.SHA }) }), response.data))
  if (head.name !== ref) return yield* error(binding, "source_conflict", "GitLab branch identity differs from the admitted source")
  const value = yield* services.reader.source(binding, { path, ref: head.commit.id })
  if (value.bindingID !== binding.id || value.path !== path || value.ref !== head.commit.id || value.commit !== head.commit.id)
    return yield* error(binding, "source_unresolved", "Reader did not prove the exact local file at the observed branch head")
  return { ...value, ref }
})

export function reviewURL(binding: Actions.Binding, url: string, path: string) {
  const parsed = URL.parse(url)
  if (!parsed || parsed.protocol !== "https:" || parsed.host !== binding.provider.hostname || parsed.username || parsed.password ||
    parsed.search || parsed.hash || parsed.pathname !== path)
    throw error(binding, "outcome_unknown", "Review response did not prove its native request URL", "unknown")
  return url
}

export const send = Effect.fn("ActionsAuthoring.send")(function* (services: Services, binding: Actions.Binding, plan: Plan) {
  yield* actor(services, binding)
  const response = yield* services.transport.request(binding, plan.request).pipe(Effect.mapError((cause) => {
    const disposition = cause.disposition === "definitely_unsent" || cause.disposition === "definitely_rejected" ? cause.disposition : "unknown"
    return error(binding, disposition === "unknown" ? "outcome_unknown" : cause.kind, "Source provider write failed", disposition)
  }))
  if (response.status !== plan.status) {
    if ([400, 401, 403, 404, 409, 422, 429].includes(response.status)) {
      const failure = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
      return yield* error(binding, failure.kind, "Source provider write was rejected", "definitely_rejected")
    }
    return yield* error(binding, "outcome_unknown", "Source write returned an unqualified native status", "unknown")
  }
  return yield* after(binding, plan.acknowledge(response))
})
~~~~

## AUT1-C27

```json
{"block_id":"AUT1-C27","type":"literal_source_excerpt","requests":["RE-AUT1-05"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/authoring/lint.ts","repository_path":"packages/core/src/actions/authoring/lint.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"dca58f1b7cf7eaa4b4afdb25f18bb4ec9234d868","source_sha256":"35372e153a34ae76a23bc8d631ca762c169994db3a1d452c4e4ceb8f2920d5cc","source_bytes":2071,"body_anchors":["A14"],"requested_subject":"Opções CI lint e propagação de resultado/erro para resolução local"}
```

```json
{"first_line":1,"last_line":30,"bytes":2071,"sha256":"35372e153a34ae76a23bc8d631ca762c169994db3a1d452c4e4ceb8f2920d5cc"}
```

~~~~typescript
import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsGitLabNative } from "../gitlab/native"
import type { ActionsError } from "../error"
import { diagnostics } from "../source/document"
import type { Services } from "./input"
import { guard } from "./remote"

const Lint = Schema.Struct({ valid: Schema.Boolean, errors: Schema.Array(Schema.String), warnings: Schema.Array(Schema.String) })

export const lint = Effect.fn("ActionsAuthoring.gitlabLint")(function* (
  services: Services, binding: Actions.Binding, source: Actions.Source, graph: Actions.Graph,
): Effect.fn.Return<Actions.Graph, ActionsError> {
  // CI lint is an explicit user-requested computation, not a durable mutation or a dry-run pipeline.
  const root = yield* guard(binding, () => ActionsGitLabNative.projectPath(binding))
  const result = yield* services.transport.request(binding, {
    method: "POST", path: `${root}/ci/lint`,
    body: { content: source.text, include_jobs: false, dry_run: false },
  }).pipe(Effect.map((response) => response.status === 200 ? Schema.decodeUnknownOption(Lint)(response.data) : Option.none()),
    Effect.catch(() => Effect.succeed(Option.none())))
  const report = diagnostics()
  report.items.push(...graph.diagnostics)
  if (Option.isNone(result)) report.add("partial", "gitlab_lint_unavailable:provider validation was not established", true)
  if (Option.isSome(result) && (!result.value.valid || result.value.errors.length > 0))
    report.add("unresolved", "gitlab_lint_invalid:provider rejected this source", true)
  if (Option.isSome(result) && result.value.warnings.length > 0) report.add("partial", "gitlab_lint_warning:provider returned validation warnings", true)
  // Native lint never upgrades local includes/rules/matrices into claimed execution topology.
  return { ...graph, state: graph.state === "unresolved" || report.state() === "unresolved" ? "unresolved"
    : graph.state === "partial" || report.state() === "partial" ? "partial" : "complete", diagnostics: report.items }
})
~~~~

## AUT1-C28

```json
{"block_id":"AUT1-C28","type":"literal_source_excerpt","requests":["RE-AUT1-05"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/authoring/schedule.ts","repository_path":"packages/core/src/actions/authoring/schedule.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"189f4f3903314afb6b6d8c86b50dbbccb0309869","source_sha256":"2151bb5ece4c4d2a635ede984a8668620e8f619000e720af35370b0f87bc561b","source_bytes":4994,"body_anchors":["A14"],"requested_subject":"Editor de autoria de on.schedule completo"}
```

```json
{"first_line":1,"last_line":77,"bytes":4994,"sha256":"2151bb5ece4c4d2a635ede984a8668620e8f619000e720af35370b0f87bc561b"}
```

~~~~typescript
import { isAlias, isMap, isScalar, isSeq, Pair, parseDocument } from "yaml"
import { ActionsError } from "../error"
import { diagnostics, read } from "../source/document"
import { bytes } from "./input"

// Reused by the GitHub schedules domain and the source editor. This edits YAML, not a schedule resource.
export function editSchedule(sourceText: string, cronEntries: readonly string[]): string {
  bytes(sourceText)
  const report = diagnostics()
  const checked = read(sourceText, "github", report)
  if (!checked || report.state() === "unresolved") throw invalid("Schedule source failed bounded YAML preflight")
  if (cronEntries.length > 1000 || cronEntries.some((cron) => typeof cron !== "string" || !cron || cron.length > 256 ||
    !cron.isWellFormed() || /[\r\n\x00]/.test(cron))) throw invalid("Schedule entries require bounded, nonempty native cron strings")
  const document = parseDocument(sourceText, {
    version: "1.2", schema: "core", uniqueKeys: false, stringKeys: true, prettyErrors: false,
    resolveKnownTags: false, merge: false, logLevel: "error",
  })
  if (document.errors.length || !isMap(document.contents)) throw invalid("Schedule source requires one YAML mapping")
  const original = document.get("on", true)
  if (isAlias(original)) throw invalid("Aliased workflow triggers require an explicit source edit")
  if ((isMap(original) || isSeq(original) || isScalar(original)) && original.anchor)
    throw invalid("Anchored workflow triggers require an explicit source edit")
  const events = isMap(original) ? original : document.createNode({})
  if (!isMap(events)) throw invalid("Workflow triggers could not be represented as a native mapping")
  if (!isMap(original) && original !== undefined) {
    const names = isScalar(original) && typeof original.value === "string" ? [original.value]
      : isSeq(original) && original.items.every((item) => isScalar(item) && typeof item.value === "string")
        ? original.items.map((item) => isScalar(item) ? String(item.value) : "") : undefined
    if (!names || new Set(names).size !== names.length || names.some((name) => !name || name === "schedule"))
      throw invalid("Workflow triggers require literal unique native events")
    // Build once rather than repeatedly calling YAMLMap.set's linear key lookup.
    events.items = names.map((name) => new Pair(document.createNode(name), document.createNode(null)))
    if (isScalar(original) || isSeq(original)) {
      events.commentBefore = original.commentBefore
      events.comment = original.comment
    }
  }
  if (events.has("<<")) throw invalid("Merged workflow triggers require an explicit source edit")
  const existing = events.get("schedule", true)
  if (existing !== undefined && (!isSeq(existing) || existing.anchor || existing.items.some((item) => !isMap(item) || item.anchor ||
    !isScalar(item.get("cron", true)) || typeof item.get("cron") !== "string" || item.has("<<"))))
    throw invalid("Schedule entries require literal cron mappings; aliases and merges stay source-owned")
  if (isSeq(existing) && existing.items.length === cronEntries.length &&
    existing.items.every((item, index) => isMap(item) && item.get("cron") === cronEntries[index])) return sourceText
  if (existing === undefined && cronEntries.length === 0) return sourceText
  if (cronEntries.length === 0) {
    // Keep comments attached to the removed schedule field as event-map trailing comments.
    if (isSeq(existing)) events.comment = [events.comment, existing.commentBefore, existing.comment].filter(Boolean).join("\n") || undefined
    events.delete("schedule")
  }
  if (cronEntries.length > 0) {
    const schedule = isSeq(existing) ? existing : document.createNode([])
    if (!isSeq(schedule)) throw invalid("Schedule entries could not be represented as a native sequence")
    schedule.items = cronEntries.map((cron, index) => {
      const previous = schedule.items[index]
      if (!isMap(previous)) return document.createNode({ cron })
      const scalar = previous.get("cron", true)
      if (!isScalar(scalar) || scalar.anchor) throw invalid("Schedule cron must remain an unanchored scalar")
      // Mutate only the scalar value: entry comments, quote style and unknown keys remain owned by YAML.
      scalar.value = cron
      return previous
    })
    events.set("schedule", schedule)
  }
  if (!isMap(original)) document.set("on", events)
  const encoded = document.toString({ lineWidth: 0 })
  const result = (sourceText.startsWith("\uFEFF") && !encoded.startsWith("\uFEFF") ? "\uFEFF" : "") +
    (sourceText.includes("\r\n") ? encoded.replace(/\r?\n/g, "\r\n") : encoded)
  bytes(result)
  const output = diagnostics()
  if (!read(result, "github", output) || output.state() === "unresolved") throw invalid("Schedule edit failed bounded YAML output validation")
  return result
}

function invalid(message: string) {
  return new ActionsError({ kind: "source_unresolved", message, provider: "github", disposition: "definitely_unsent" })
}
~~~~

## AUT1-C29

```json
{"block_id":"AUT1-C29","type":"literal_source_excerpt","requests":["RE-AUT1-05"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/resources/schedule-yaml.ts","repository_path":"packages/core/src/actions/resources/schedule-yaml.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"cd3a52f384a522b74910f01ea0278efc1fa5a12f","source_sha256":"57ef9c02ab37eb8cebeb87cd3a307673211f989e1bb8036cf3d4799a2b783abd","source_bytes":5345,"body_anchors":["A31"],"requested_subject":"Segundo editor de on.schedule e suas restrições, já transportado neste lote"}
```

```json
{"first_line":1,"last_line":81,"bytes":5345,"sha256":"57ef9c02ab37eb8cebeb87cd3a307673211f989e1bb8036cf3d4799a2b783abd"}
```

~~~~typescript
export * as ActionsScheduleYaml from "./schedule-yaml"

import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { isAlias, isMap, isScalar, isSeq, parseDocument } from "yaml"
import { diagnostics, object, read } from "../source/document"
import { ActionsResourceNative } from "./native"

const Schedules = Schema.Array(Schema.Struct({ cron: Schema.NonEmptyString }))

export function inspect(binding: Actions.Binding, text: string) {
  const report = diagnostics()
  const document = read(text, "github", report)
  if (!document || report.state() !== "complete")
    throw ActionsResourceNative.error(binding, "source_unresolved", "Schedule YAML failed the shared bounded CI document guard")
  if (!object(document.value.on)) return []
  const schedules = document.value.on.schedule
  if (schedules === undefined) return []
  const entries = ActionsResourceNative.input(binding, Schedules, schedules)
  if (entries.length > 100) throw ActionsResourceNative.error(binding, "metadata_truncated", "Workflow schedule count exceeds the bounded resource limit")
  entries.forEach((entry) => cron(binding, entry.cron))
  return entries
}

// Called by SourcePublisher's injected resource callback. It changes on.schedule
// only; the publisher retains branch/blob/commit admission and actual writes.
export function edit(binding: Actions.Binding, text: string, schedules: readonly { readonly cron: string }[]) {
  inspect(binding, text)
  if (schedules.length > 100) throw ActionsResourceNative.error(binding, "invalid_input", "At most 100 workflow schedules can be authored in one bounded edit")
  schedules.forEach((entry) => cron(binding, entry.cron))
  const document = parseDocument(text, { version: "1.2", schema: "core", uniqueKeys: false, stringKeys: true, prettyErrors: false, resolveKnownTags: false, logLevel: "error" })
  const trigger = document.get("on", true)
  if (isAlias(trigger)) throw ActionsResourceNative.error(binding, "source_unresolved", "Aliased workflow triggers require an explicit source-editor change")
  if (trigger === undefined) document.set("on", document.createNode({}))
  if (isScalar(trigger) && typeof trigger.value === "string") document.set("on", document.createNode({ [trigger.value]: null }))
  if (isSeq(trigger)) {
    if (trigger.items.some((node) => !isScalar(node) || typeof node.value !== "string"))
      throw ActionsResourceNative.error(binding, "source_unresolved", "Workflow event sequence could not be edited without changing other triggers")
    document.set("on", document.createNode(Object.fromEntries(trigger.items.filter(isScalar).map((node) => [String(node.value), null]))))
  }
  const events = document.get("on", true)
  if (!isMap(events)) throw ActionsResourceNative.error(binding, "source_unresolved", "Workflow triggers must be an explicit editable mapping")
  const existing = events.get("schedule", true)
  if (isAlias(existing)) throw ActionsResourceNative.error(binding, "source_unresolved", "Aliased schedules require an explicit source-editor change")
  if (!schedules.length) events.delete("schedule")
  if (schedules.length) {
    if (isSeq(existing)) existing.items = schedules.map((entry, index) => {
      const node = existing.items[index]
      if (node === undefined) return document.createNode({ cron: entry.cron })
      if (!isMap(node) || isAlias(node.get("cron", true)))
        throw ActionsResourceNative.error(binding, "source_unresolved", "Schedule aliases require an explicit source-editor change")
      node.set("cron", entry.cron)
      return node
    })
    if (!isSeq(existing)) events.set("schedule", document.createNode(schedules.map((entry) => ({ cron: entry.cron }))))
  }
  const result = document.toString()
  inspect(binding, result)
  return result
}

export function cron(binding: Actions.Binding, value: string) {
  // Native provider remains the cron parser/validator. Reject unsafe framing and
  // wrong field count here, rather than claiming a local cron dialect is native.
  if (value.length > 256 || /[\r\n\x00-\x1f\x7f]/.test(value) || value.trim().split(/ +/).length !== 5)
    throw ActionsResourceNative.error(binding, "invalid_input", "Schedule cron requires five bounded native fields")
  if (binding.provider.kind === "github") {
    const names = [[], [], [], ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]]
    const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]]
    const valid = value.trim().split(/ +/).every((field, index) => field.split(",").every((item) => {
      const parts = item.split("/")
      if (parts.length > 2 || parts[1] !== undefined && (!/^[1-9]\d*$/.test(parts[1]) || Number(parts[1]) > 1000)) return false
      if (parts[0] === "*") return true
      const bounds = parts[0].split("-").map((part) => /^\d+$/.test(part) ? Number(part) : names[index].indexOf(part.toUpperCase()) + (index === 3 ? 1 : 0))
      return bounds.length <= 2 && bounds.every((part) => Number.isInteger(part) && part >= ranges[index][0] && part <= ranges[index][1]) &&
        (bounds.length === 1 || bounds[0] <= bounds[1])
    }))
    if (!valid) throw ActionsResourceNative.error(binding, "invalid_input", "GitHub schedule cron must use its supported five-field POSIX syntax")
  }
  return value
}
~~~~

## AUT1-C30

```json
{"block_id":"AUT1-C30","type":"literal_source_excerpt","requests":["RE-AUT1-05","RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/github/commands/common.ts","repository_path":"packages/core/src/actions/github/commands/common.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"e9ee98a334dd701d076a29900dc47ccdba7a3f01","source_sha256":"b1a6b5b2081d754e5b57f93fadaf56153ca38d133450a05e3c7145bcbf21cfa7","source_bytes":13052,"body_anchors":["A18"],"requested_subject":"Preflight/autoridade GitHub usada por autoria; source/run e send"}
```

```json
{"first_line":1,"last_line":166,"bytes":13052,"sha256":"b1a6b5b2081d754e5b57f93fadaf56153ca38d133450a05e3c7145bcbf21cfa7"}
```

~~~~typescript
export * as GitHubCommandCommon from "./common"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../../contract"
import { ActionsError } from "../../error"
import { ActionsResponse } from "../../transport/response"
import { GitHubNative } from "../native"

export type Services = { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }
const Capture = Schema.Struct({ binding: Actions.Binding, intent: Actions.OperationIntent, payload: Schema.Json })
const Repository = Schema.Struct({ ...GitHubNative.Repository.fields,
  private: Schema.optionalKey(Schema.Boolean), archived: Schema.optionalKey(Schema.Boolean) })
const Account = Schema.Struct({ id: GitHubNative.ID,
  login: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9-]+(?:\[bot\])?$/)) })
const supported = new Set(["workflow.dispatch", "workflow.enable", "workflow.disable", "run.retry", "run.retryFailed",
  "run.cancel", "run.forceCancel", "run.delete", "run.approveFork", "job.retry"])

export function fail(binding: Actions.Binding, kind: Actions.ErrorKind, message: string, disposition: Actions.SendDisposition = "definitely_unsent") {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: "github", disposition })
}

export function input<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, value: unknown): A {
  const decoded = Schema.decodeUnknownOption(schema)(value, { onExcessProperty: "error" })
  if (Option.isNone(decoded)) throw fail(binding, "invalid_input", "GitHub command payload does not match its frozen native schema")
  return decoded.value
}

export function guard<A>(binding: Actions.Binding, fn: () => A, kind: Actions.ErrorKind = "invalid_input") {
  return Effect.try({ try: fn, catch: (error) => error instanceof ActionsError ? error : fail(binding, kind, "GitHub command metadata could not be validated") })
}

export const capture = Effect.fn("ActionsGitHubCommands.capture")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
  return yield* guard(binding, () => {
    input(binding, Capture, { binding, intent, payload })
    // Clone all admission and execute data before the first remote await. No payload hash or log.
    const frozen = input(binding, Schema.fromJsonString(Capture), JSON.stringify({ binding, intent, payload }))
    if (frozen.binding.provider.kind !== "github" || !supported.has(frozen.intent.kind))
      throw fail(binding, "invalid_input", "Command does not belong to the GitHub execution dispatcher")
    if (frozen.intent.binding.id !== frozen.binding.id || frozen.intent.binding.revision !== frozen.binding.revision)
      throw fail(binding, "binding_stale", "Command admission does not match the current binding revision")
    const target = frozen.intent.target
    const workflow = frozen.intent.kind.startsWith("workflow.")
    const job = frozen.intent.kind === "job.retry"
    const allowed = new Set(workflow ? ["workflowID", "path", "ref"] : job ? ["jobID", "runID", "workflowID", "path", "ref"] : ["runID", "workflowID", "path", "ref"])
    if (Object.keys(target).some((key) => !allowed.has(key)))
      throw fail(binding, "invalid_input", "Command target contains fields belonging to another native operation")
    const id = workflow ? target.workflowID : job ? target.jobID : target.runID
    if (id === undefined) throw fail(binding, "invalid_input", "Command requires its admitted native target ID")
    GitHubNative.id(binding, id)
    if (target.runID !== undefined) GitHubNative.id(binding, target.runID)
    if (target.workflowID !== undefined) GitHubNative.id(binding, target.workflowID)
    if (target.ref !== undefined) GitHubNative.ref(binding, target.ref)
    if (target.path !== undefined) GitHubNative.path(binding, target.path)
    if (workflow && frozen.intent.expected?.attempt !== undefined)
      throw fail(binding, "invalid_input", "Workflow commands do not have a native run-attempt precondition")
    if (frozen.intent.expected?.commit !== undefined) input(binding, GitHubNative.SHA, frozen.intent.expected.commit)
    if (frozen.intent.expected?.sourceVersion !== undefined) input(binding, GitHubNative.SHA, frozen.intent.expected.sourceVersion)
    return frozen
  })
})

export function before<A>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError>) {
  return effect.pipe(Effect.mapError((error) => fail(binding, error.kind, `GitHub command preflight failed (${error.kind})`)))
}

export const get = Effect.fn("ActionsGitHubCommands.get")(function* (services: Services, binding: Actions.Binding, path: string) {
  const response = yield* before(binding, services.transport.request(binding, { method: "GET", path }))
  if (response.status !== 200) {
    const error = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* fail(binding, error.kind, "GitHub command preflight request was rejected")
  }
  return response
})

export const authority = Effect.fn("ActionsGitHubCommands.authority")(function* (services: Services, binding: Actions.Binding) {
  const root = yield* guard(binding, () => `repositories/${GitHubNative.id(binding, binding.projectID)}`)
  const response = yield* get(services, binding, root)
  const native = yield* guard(binding, () => GitHubNative.decode(binding, Repository, response.data, "repository"), "transport_failed")
  if (String(native.id) !== binding.projectID) return yield* fail(binding, "binding_stale", "Native repository does not match command admission")
  yield* actor(services, binding)
  if (native.permissions?.push === false || native.archived === true)
    return yield* fail(binding, "permission_denied", "Native repository metadata denies command writes")
  const scopes = response.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
  if (scopes?.length && !scopes.includes("repo") && !(native.private === false && scopes.includes("public_repo")))
    return yield* fail(binding, "permission_denied", "Observed classic OAuth scopes deny repository writes")
  // Missing scope/role evidence stays unknown. Native authorization decides this
  // explicit command; no available write capability or fine-grained role is invented.
  return { root, native, headers: response.headers }
})

const actor = Effect.fn("ActionsGitHubCommands.actor")(function* (services: Services, binding: Actions.Binding) {
  if (!binding.account) return yield* fail(binding, "binding_stale", "GitHub binding has no verified actor account")
  const user = yield* get(services, binding, "user")
  const account = yield* guard(binding, () => GitHubNative.decode(binding, Account, user.data, "signed-in account"), "not_authenticated")
  if (account.login.toLowerCase() !== binding.account.toLowerCase())
    return yield* fail(binding, "binding_stale", "GitHub signed-in account changed after command admission")
})

export function version(binding: Actions.Binding, expected: Actions.OperationExpected | undefined, response: ActionsContract.Response) {
  if (expected?.resourceVersion === undefined) return
  if (!response.headers.etag) throw fail(binding, "capability_unavailable", "Native resource version was not observed")
  if (response.headers.etag !== expected.resourceVersion) throw fail(binding, "source_conflict", "Native resource version changed after admission")
}

export function source(binding: Actions.Binding, intent: Actions.OperationIntent, value: Actions.Source, path: string, ref: string, commit?: string) {
  if (value.bindingID !== binding.id || value.path !== path || value.ref !== ref || value.commit === undefined)
    throw fail(binding, "source_unresolved", "Reader did not prove the admitted native source identity")
  input(binding, GitHubNative.SHA, value.commit)
  input(binding, GitHubNative.SHA, value.version)
  if ((commit !== undefined && value.commit.toLowerCase() !== commit.toLowerCase()) ||
      (intent.expected?.commit !== undefined && value.commit.toLowerCase() !== intent.expected.commit.toLowerCase()) ||
      (intent.expected?.sourceVersion !== undefined && value.version.toLowerCase() !== intent.expected.sourceVersion.toLowerCase()))
    throw fail(binding, "source_conflict", "Native source changed after command admission")
}

export const run = Effect.fn("ActionsGitHubCommands.runPreflight")(function* (services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, id: string) {
  const value = yield* before(binding, services.reader.run(binding, id))
  if (value.id !== id || value.bindingID !== binding.id || value.repositoryID !== binding.projectID)
    return yield* fail(binding, "binding_stale", "Reader did not prove the admitted native run ownership")
  yield* guard(binding, () => input(binding, GitHubNative.SHA, value.commit))
  if (value.attempt === undefined || !Number.isSafeInteger(value.attempt) || value.attempt < 1)
    return yield* fail(binding, "capability_unavailable", "Native run attempt was not proved")
  if ((intent.expected?.commit !== undefined && value.commit.toLowerCase() !== intent.expected.commit.toLowerCase()) ||
      (intent.expected?.attempt !== undefined && value.attempt !== intent.expected.attempt) ||
      (intent.target.ref !== undefined && value.ref !== intent.target.ref) ||
      (intent.target.workflowID !== undefined && value.workflowID !== intent.target.workflowID))
    return yield* fail(binding, "source_conflict", "Native run source or attempt changed after admission")
  return value
})

export const historical = Effect.fn("ActionsGitHubCommands.historicalSource")(function* (services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, value: Actions.Run, response?: ActionsContract.Response) {
  if (intent.expected?.sourceVersion === undefined && intent.target.path === undefined && (intent.kind === "job.retry" || intent.expected?.resourceVersion === undefined)) return
  const metadata = response ?? (yield* get(services, binding, `repositories/${binding.projectID}/actions/runs/${value.id}`))
  yield* guard(binding, () => {
    const native = GitHubNative.decode(binding, Schema.Struct({ id: GitHubNative.ID, head_sha: GitHubNative.SHA,
      run_attempt: GitHubNative.Positive, path: Schema.NonEmptyString, repository: Schema.Struct({ id: GitHubNative.ID }),
      status: Schema.NullOr(Schema.String), conclusion: Schema.optionalKey(Schema.NullOr(Schema.String)), event: Schema.String }), metadata.data, "run source")
    if (String(native.id) !== value.id || String(native.repository.id) !== binding.projectID || native.head_sha.toLowerCase() !== value.commit.toLowerCase() || native.run_attempt !== value.attempt)
      throw fail(binding, "source_conflict", "Native run metadata changed during preflight")
    if (native.status !== value.status || native.conclusion !== value.conclusion || native.event !== value.event)
      throw fail(binding, "source_conflict", "Native run conditions changed during preflight")
    if (intent.target.path !== undefined && native.path !== intent.target.path) throw fail(binding, "source_conflict", "Admitted source path does not match native run provenance")
    if (intent.kind !== "job.retry") version(binding, intent.expected, metadata)
  })
  if (intent.expected?.sourceVersion === undefined) return
  const native = yield* guard(binding, () => GitHubNative.decode(binding, Schema.Struct({ path: Schema.NonEmptyString }), metadata.data, "run path"))
  const selected = yield* before(binding, services.reader.source(binding, { path: native.path, ref: value.commit }))
  yield* guard(binding, () => source(binding, intent, selected, native.path, value.commit, value.commit))
})

export const send = Effect.fn("ActionsGitHubCommands.send")(function* (services: Services, binding: Actions.Binding, request: ActionsContract.Request, statuses: readonly number[]) {
  // gh reloads CLI credentials per invocation; recheck actor immediately before send.
  yield* actor(services, binding)
  const response = yield* services.transport.request(binding, request).pipe(Effect.mapError((error) => {
    const disposition = error.disposition === "definitely_unsent" || error.disposition === "definitely_rejected" ? error.disposition : "unknown"
    return new ActionsError({ kind: disposition === "unknown" ? "outcome_unknown" : error.kind, provider: "github", bindingID: binding.id,
      message: "GitHub command request failed", disposition, retryAfter: error.retryAfter })
  }))
  if (statuses.includes(response.status)) return response
  if ([400, 401, 403, 404, 409, 422, 429].includes(response.status)) {
    const error = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* fail(binding, error.kind, "GitHub command was rejected by the provider", "definitely_rejected")
  }
  return yield* fail(binding, "outcome_unknown", "GitHub command returned an unrecognized acknowledgement", "unknown")
})
~~~~

## AUT1-C31

```json
{"block_id":"AUT1-C31","type":"literal_source_excerpt","requests":["RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/operations.ts","repository_path":"packages/core/src/actions/operations.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"83c0b9e03b063bd59bc2d30317f7de85cbb99ee4","source_sha256":"f4180bfeabef99c0eaddace3f1da7242fb8dacd7d63fb948b84cc014f59a89d4","source_bytes":12124,"body_anchors":["A15","A16","A17"],"requested_subject":"Location/Scope, get/prepare/execute/reconcile completos"}
```

```json
{"first_line":16,"last_line":204,"bytes":11296,"sha256":"7134b496a05abd568e7e72d9523c572013c1f2e0690be4f477d93c418e593fb8"}
```

~~~~typescript
export const make = Effect.fn("ActionsOperations.make")(function* (locationInput: {
  readonly directory: string
  readonly workspaceID?: string
  readonly projectID: string
}) {
  const input = { ...locationInput }
  const database = yield* Database.Service
  if (!path.isAbsolute(input.directory) || !input.projectID)
    return yield* Effect.fail(error("invalid_input", "Actions operations require a trusted absolute Location and project"))
  const directory = yield* Effect.tryPromise({
    try: () => realpath(input.directory),
    catch: () => error("invalid_input", "Actions operation Location is unavailable"),
  })
  const location = JSON.stringify([input.projectID, directory, input.workspaceID ?? null])
  yield* recover(database.db)
  const disposed = yield* Deferred.make<void>()
  const lifetime = { closed: false, requests: new Set<Fiber.Fiber<unknown, unknown>>() }
  yield* Effect.addFinalizer(() => Effect.gen(function* () {
    lifetime.closed = true
    const requests = Array.from(lifetime.requests)
    yield* Deferred.succeed(disposed, undefined)
    yield* Fiber.awaitAll(requests)
  }).pipe(Effect.uninterruptible))

  const validate = (binding: Actions.Binding) => {
    if (lifetime.closed) return error("binding_missing", "Actions operation Location was disposed")
    if (binding.directory !== directory || binding.workspaceID !== input.workspaceID)
      return error("host_mismatch", "Actions binding does not belong to this Location")
    if (!binding.account?.trim()) return error("not_authenticated", "Actions operations require a signed-in provider account")
  }

  const get: ActionsContract.Operations["get"] = Effect.fn("ActionsOperations.get")(function* (bindingInput, id) {
    const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
    const invalid = validate(binding)
    if (invalid) return yield* Effect.fail(invalid)
    const row = yield* find(database.db, id)
    const denied = access(row, location, binding, id)
    if (denied) return yield* Effect.fail(denied)
    if (!row) return yield* Effect.fail(error("operation_missing", "Actions operation does not exist", id))
    const expired = unavailable(row, yield* Clock.currentTimeMillis)
    if (expired) return yield* Effect.fail(expired)
    return receipt(row)
  })

  const prepare: ActionsContract.Operations["prepare"] = Effect.fn("ActionsOperations.prepare")(function* (bindingInput, raw) {
    const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
    const invalid = validate(binding)
    if (invalid) return yield* Effect.fail(invalid)
    // Strict decoding rejects extras before encoding elides optional undefined
    // keys. Decode the encoded DTO again to preserve branded identity types.
    const decoded = yield* Schema.decodeUnknownEffect(Schema.toType(Actions.OperationIntent), { onExcessProperty: "error" })(raw).pipe(
      Effect.map((value) => Schema.decodeUnknownSync(Actions.OperationIntent)(Schema.encodeSync(Actions.OperationIntent)(value))),
      Effect.mapError(() => error("invalid_input", "Actions operation intent is invalid")),
    )
    if (decoded.binding.id !== binding.id || decoded.binding.revision !== binding.revision)
      return yield* Effect.fail(error("binding_stale", "Actions operation intent binding changed"))
    // Maintenance commits independently so a refused expired retry still leaves
    // a compact, non-executable tombstone rather than rolling cleanup back.
    yield* safe(database.db.transaction((tx) => Clock.currentTimeMillis.pipe(
      Effect.flatMap((now) => sweep(tx, now)),
    ), { behavior: "immediate" }))
    return yield* safe(database.db.transaction((tx) => Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const existing = yield* tx.select().from(ActionsOperationTable).where(and(
        eq(ActionsOperationTable.location_key, location), eq(ActionsOperationTable.binding_id, binding.id),
        eq(ActionsOperationTable.client_id, decoded.clientID),
      )).get()
      if (existing) {
        if (!matches(existing, binding) || !equivalent(intent(existing), decoded))
          return yield* Effect.fail(error("intent_conflict", "Actions logical intent was already bound to another command", existing.id))
        const expired = unavailable(existing, now)
        if (expired) return yield* Effect.fail(expired)
        return receipt(existing)
      }
      const ledger = yield* tx.select({ total: count() }).from(ActionsOperationTable).get()
      if (!ledger || ledger.total >= LEDGER_LIMIT)
        return yield* Effect.fail(error("maintenance_required", "Actions admission ledger requires maintenance"))
      const unknown = yield* tx.select({ total: count() }).from(ActionsOperationTable)
        .where(eq(ActionsOperationTable.state, "outcome_unknown")).get()
      if (!unknown || unknown.total >= UNKNOWN_LIMIT)
        return yield* Effect.fail(error("maintenance_required", "Actions unknown outcome storage requires maintenance"))
      const inserted = yield* tx.insert(ActionsOperationTable).values({
        id: Actions.OperationID.create(),
        location_key: location,
        project_id: input.projectID,
        directory,
        workspace_id: input.workspaceID,
        binding_id: binding.id,
        binding_revision: binding.revision,
        provider_kind: binding.provider.kind,
        provider_hostname: binding.provider.hostname,
        provider_api_origin: binding.provider.apiOrigin,
        provider_project_id: binding.projectID,
        actor: binding.account ?? "",
        client_id: decoded.clientID,
        kind: decoded.kind,
        target: decoded.target,
        expected: decoded.expected,
        state: "prepared",
        time_created: now,
        time_expires: now + LEASE,
        time_updated: now,
      }).returning().get()
      if (!inserted) return yield* Effect.fail(error("maintenance_required", "Actions operation admission could not be stored"))
      return receipt(inserted)
    }), { behavior: "immediate" }))
  })

  const execute: ActionsContract.Operations["execute"] = Effect.fn("ActionsOperations.execute")((bindingInput, submission, perform) =>
    Effect.uninterruptibleMask((restore) => Effect.withFiber((fiber) => Effect.gen(function* () {
      const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
      const invalid = validate(binding)
      if (invalid) return yield* Effect.fail(invalid)
      const row = yield* find(database.db, submission.id)
      const denied = access(row, location, binding, submission.id)
      if (denied) return yield* Effect.fail(denied)
      if (!row) return yield* Effect.fail(error("operation_missing", "Actions operation does not exist", submission.id))
      const now = yield* Clock.currentTimeMillis
      const expired = unavailable(row, now)
      if (expired) return yield* Effect.fail(expired)
      if (row.state !== "prepared") return receipt(row)

      // Register before the durable claim so disposal cannot race the CAS/cleanup
      // handoff. This fiber remains the caller's request, never a shared worker.
      lifetime.requests.add(fiber)
      return yield* Effect.gen(function* () {
        if (lifetime.closed) return yield* Effect.fail(error("binding_missing", "Actions operation Location was disposed"))
        const claimed = yield* safe(database.db.transaction((tx) => Effect.gen(function* () {
          if (lifetime.closed) return yield* Effect.fail(error("binding_missing", "Actions operation Location was disposed"))
          // Sample time after acquiring SQLite's write reservation, not before
          // waiting for it. A lease may expire while the request waits to claim.
          const claimTime = yield* Clock.currentTimeMillis
          return yield* tx.update(ActionsOperationTable).set({ state: "sending", time_updated: claimTime })
            .where(and(
              eq(ActionsOperationTable.id, row.id), eq(ActionsOperationTable.location_key, location),
              eq(ActionsOperationTable.binding_id, binding.id), eq(ActionsOperationTable.binding_revision, binding.revision),
              eq(ActionsOperationTable.actor, row.actor), eq(ActionsOperationTable.state, "prepared"),
              gt(ActionsOperationTable.time_expires, claimTime),
            )).returning().get()
        }), { behavior: "immediate" }))
        if (!claimed) return yield* get(binding, row.id)
        yield* restore(Effect.suspend(() => lifetime.closed ? Effect.interrupt : perform(intent(claimed), submission.input)).pipe(
          Effect.flatMap(checkedAcknowledgement),
          Effect.scoped,
          Effect.timeout(DEADLINE),
          Effect.raceFirst(Deferred.await(disposed).pipe(Effect.andThen(Effect.interrupt))),
          Effect.catchCause((cause) => Cause.hasInterrupts(cause)
            ? Effect.interrupt
            : Effect.fail(definitive(cause) ?? error("outcome_unknown", "Actions provider outcome was not established", row.id))),
        )).pipe(Effect.onExit((exit) => finalize(database.db, row.id, exit)))
        return yield* get(binding, row.id)
      }).pipe(Effect.ensuring(Effect.sync(() => lifetime.requests.delete(fiber))))
    }))),
  )

  const reconcile: ActionsContract.Operations["reconcile"] = Effect.fn("ActionsOperations.reconcile")((bindingInput, id, observe) =>
    Effect.uninterruptibleMask((restore) => Effect.withFiber((fiber) => Effect.gen(function* () {
      const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
      const invalid = validate(binding)
      if (invalid) return yield* Effect.fail(invalid)
      const row = yield* find(database.db, id)
      const denied = access(row, location, binding, id)
      if (denied) return yield* Effect.fail(denied)
      if (!row) return yield* Effect.fail(error("operation_missing", "Actions operation does not exist", id))
      const expired = unavailable(row, yield* Clock.currentTimeMillis)
      if (expired) return yield* Effect.fail(expired)
      if (row.state !== "accepted" && row.state !== "outcome_unknown") return receipt(row)
      lifetime.requests.add(fiber)
      return yield* Effect.gen(function* () {
        const observation = yield* restore(Effect.suspend(() => lifetime.closed ? Effect.interrupt : observe(
          structuredClone(intent(row)), row.result == null ? undefined : structuredClone(row.result),
        )).pipe(
          Effect.flatMap(checkedObservation), Effect.scoped, Effect.timeout(DEADLINE),
          Effect.raceFirst(Deferred.await(disposed).pipe(Effect.andThen(Effect.interrupt))),
          Effect.catchCause((cause) => {
            if (Cause.hasInterrupts(cause)) return Effect.interrupt
            const failure = Cause.findErrorOption(cause)
            return Effect.fail(Option.isSome(failure) && failure.value instanceof ActionsError
              ? failure.value : error("transport_failed", "Actions operation observation failed", id))
          }),
        ))
        const observed = yield* update(database.db, row, observation)
        return observed ? receipt(observed) : yield* get(binding, id)
      }).pipe(Effect.ensuring(Effect.sync(() => lifetime.requests.delete(fiber))))
    }))),
  )

  return { prepare, execute, get, reconcile } satisfies ActionsContract.Operations
})
~~~~

## AUT1-C32

```json
{"block_id":"AUT1-C32","type":"literal_source_excerpt","requests":["RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/operations/sql.ts","repository_path":"packages/core/src/actions/operations/sql.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"63cad8cb4926acd4adc6c285bd6b1f1f64a238cc","source_sha256":"07f2de775a5e5352859f1bf041e32865b3681ec2db85fd4e367823fe2a00da75","source_bytes":1580,"body_anchors":["A15"],"requested_subject":"Todos os campos persistidos e unicidade"}
```

```json
{"first_line":1,"last_line":35,"bytes":1580,"sha256":"07f2de775a5e5352859f1bf041e32865b3681ec2db85fd4e367823fe2a00da75"}
```

~~~~typescript
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { Actions } from "@orchestra/schema/actions"

export const ActionsOperationTable = sqliteTable(
  "actions_operation",
  {
    id: text().$type<Actions.OperationID>().primaryKey(),
    location_key: text().notNull(),
    project_id: text().notNull(),
    directory: text().notNull(),
    workspace_id: text(),
    binding_id: text().$type<Actions.BindingID>().notNull(),
    binding_revision: integer().notNull(),
    provider_kind: text().$type<Actions.ProviderKind>().notNull(),
    provider_hostname: text().notNull(),
    provider_api_origin: text().notNull(),
    provider_project_id: text().notNull(),
    actor: text().notNull(),
    client_id: text().notNull(),
    kind: text().$type<Actions.OperationKind>().notNull(),
    target: text({ mode: "json" }).$type<Actions.OperationTarget>().notNull(),
    expected: text({ mode: "json" }).$type<Actions.OperationExpected>(),
    state: text().$type<Actions.Operation["state"]>().notNull(),
    time_created: integer().notNull(),
    time_expires: integer().notNull(),
    time_updated: integer().notNull(),
    result: text({ mode: "json" }).$type<Actions.Operation["result"]>(),
    reason: text(),
  },
  (table) => [
    uniqueIndex("actions_operation_location_binding_client_idx").on(table.location_key, table.binding_id, table.client_id),
    index("actions_operation_state_expires_idx").on(table.state, table.time_expires),
    index("actions_operation_state_updated_idx").on(table.state, table.time_updated),
  ],
)
~~~~

## AUT1-C33

```json
{"block_id":"AUT1-C33","type":"literal_source_excerpt","requests":["RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/operations/storage.ts","repository_path":"packages/core/src/actions/operations/storage.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"d7633da87c8fe5b41319e23c6ca9e9092d152e4e","source_sha256":"433462cdc96bbeda49a85f46e9c96954cee753822165329caac5c26c748ff2b4","source_bytes":7588,"body_anchors":["A16"],"requested_subject":"Constants, access/matches/unavailable/sweep/recover/finalize/identity completos"}
```

```json
{"first_line":9,"last_line":142,"bytes":7230,"sha256":"e36babb96201c8d75736b794995d75428b1b42127406728b683340bf71137c6d"}
```

~~~~typescript
export type DB = Database.Interface["db"]
export type Row = typeof ActionsOperationTable.$inferSelect
export const LEASE = 24 * 60 * 60 * 1000
export const RETENTION = 30 * LEASE
export const UNKNOWN_LIMIT = 10_000
export const LEDGER_LIMIT = 100_000
export const DEADLINE = "30 seconds"
export const RECEIPT_EXPIRED = "Actions operation receipt retention elapsed"
export const LEASE_EXPIRED = "Actions operation lease expired"

export function error(kind: Actions.ErrorKind, message: string, operationID?: Actions.OperationID) {
  return new ActionsError({ kind, message, operationID })
}

export function safe<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.mapError((cause) =>
      cause instanceof ActionsError ? cause : error("maintenance_required", "Actions operation storage is unavailable"),
    ),
    Effect.catchDefect(() => Effect.fail(error("maintenance_required", "Actions operation storage is unavailable"))),
  )
}

export function receipt(row: Row): Actions.Operation {
  return {
    id: row.id,
    bindingID: row.binding_id,
    clientID: row.client_id,
    kind: row.kind,
    state: row.state,
    target: row.target,
    createdAt: row.time_created,
    expiresAt: row.time_expires,
    updatedAt: row.time_updated,
    ...(row.result == null ? {} : { result: row.result }),
    ...(row.reason === null ? {} : { reason: row.reason }),
  }
}

export function intent(row: Row): Actions.OperationIntent {
  return {
    clientID: row.client_id,
    binding: { id: row.binding_id, revision: row.binding_revision },
    kind: row.kind,
    target: row.target,
    ...(row.expected === null ? {} : { expected: row.expected }),
  }
}

export const equivalent = Schema.toEquivalence(Actions.OperationIntent)

export function matches(row: Row, binding: Actions.Binding) {
  return row.binding_revision === binding.revision && row.actor === binding.account &&
    row.provider_kind === binding.provider.kind && row.provider_hostname === binding.provider.hostname &&
    row.provider_api_origin === binding.provider.apiOrigin && row.provider_project_id === binding.projectID
}

export function access(row: Row | undefined, location: string, binding: Actions.Binding, id: Actions.OperationID) {
  if (!row || row.location_key !== location || row.binding_id !== binding.id)
    return error("operation_missing", "Actions operation does not exist in this binding and Location", id)
  if (row.actor !== binding.account) return error("not_authenticated", "Actions operation belongs to another account", id)
  if (row.binding_revision !== binding.revision) return error("binding_stale", "Actions operation binding revision changed", id)
  if (!matches(row, binding)) return error("host_mismatch", "Actions operation provider identity changed", id)
}

export function unavailable(row: Row, now: number) {
  if (row.state === "expired" && row.reason === RECEIPT_EXPIRED)
    return error("operation_missing", RECEIPT_EXPIRED, row.id)
  if (row.state === "expired" || (row.state === "prepared" && row.time_expires <= now))
    return error("operation_expired", "Actions operation lease expired", row.id)
  if (["accepted", "confirmed", "rejected"].includes(row.state) && row.time_updated <= now - RETENTION)
    return error("operation_missing", "Actions operation receipt retention elapsed", row.id)
}

export const find = (db: Pick<DB, "select">, id: Actions.OperationID) =>
  safe(db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, id)).get())

export const sweep = (db: Pick<DB, "update">, now: number) =>
  Effect.gen(function* () {
    yield* db.update(ActionsOperationTable).set({ state: "expired", time_updated: now, result: null, reason: LEASE_EXPIRED }).where(
      and(eq(ActionsOperationTable.state, "prepared"), lte(ActionsOperationTable.time_expires, now)),
    ).run()
    // Keep the admission key and intent forever. Deleting a receipt would allow
    // a delayed prepare with the same logical intent to issue another command.
    yield* db.update(ActionsOperationTable).set({ state: "expired", result: null, reason: RECEIPT_EXPIRED }).where(and(
      inArray(ActionsOperationTable.state, ["accepted", "confirmed", "rejected"]),
      lte(ActionsOperationTable.time_updated, now - RETENTION),
    )).run()
  })

// Database identity outlives Location services. Rebuilding a Location must never
// recover another live request's sending row as though the process restarted.
const recovery = new WeakMap<DB, { readonly lock: Semaphore.Semaphore; done: boolean }>()

export const recover = (db: DB) => Effect.suspend(() => {
  const shared = recovery.get(db) ?? { lock: Semaphore.makeUnsafe(1), done: false }
  recovery.set(db, shared)
  return shared.lock.withPermit(Effect.gen(function* () {
    if (shared.done) return
    yield* safe(db.update(ActionsOperationTable).set({
      state: "outcome_unknown",
      time_updated: yield* Clock.currentTimeMillis,
      reason: "Provider outcome was not established before database restart",
    }).where(eq(ActionsOperationTable.state, "sending")).run())
    shared.done = true
  })).pipe(Effect.uninterruptible)
})

export const finalize = (db: DB, id: Actions.OperationID, exit: Exit.Exit<Actions.OperationAcknowledgement, ActionsError>) => Effect.gen(function* () {
  const rejected = Exit.isFailure(exit) ? definitive(exit.cause) : undefined
  const row = yield* safe(db.update(ActionsOperationTable).set({
    state: Exit.isSuccess(exit) ? "accepted" : rejected ? "rejected" : "outcome_unknown",
    result: Exit.isSuccess(exit) ? exit.value : null,
    time_updated: yield* Clock.currentTimeMillis,
    reason: Exit.isSuccess(exit) ? null : rejected?.disposition === "definitely_unsent"
      ? "Provider command was definitely not sent"
      : rejected ? "Provider command was definitively rejected" : "Provider outcome was not established",
  }).where(and(eq(ActionsOperationTable.id, id), eq(ActionsOperationTable.state, "sending"))).returning().get())
  if (!row) return yield* Effect.fail(error("maintenance_required", "Actions operation receipt could not be finalized", id))
})

export function identity(row: Row) {
  return and(
    eq(ActionsOperationTable.id, row.id), eq(ActionsOperationTable.location_key, row.location_key),
    eq(ActionsOperationTable.project_id, row.project_id), eq(ActionsOperationTable.directory, row.directory),
    row.workspace_id === null ? isNull(ActionsOperationTable.workspace_id) : eq(ActionsOperationTable.workspace_id, row.workspace_id),
    eq(ActionsOperationTable.binding_id, row.binding_id), eq(ActionsOperationTable.binding_revision, row.binding_revision),
    eq(ActionsOperationTable.provider_kind, row.provider_kind), eq(ActionsOperationTable.provider_hostname, row.provider_hostname),
    eq(ActionsOperationTable.provider_api_origin, row.provider_api_origin), eq(ActionsOperationTable.provider_project_id, row.provider_project_id),
    eq(ActionsOperationTable.actor, row.actor), eq(ActionsOperationTable.client_id, row.client_id),
    eq(ActionsOperationTable.kind, row.kind), eq(ActionsOperationTable.target, row.target),
    row.expected === null ? isNull(ActionsOperationTable.expected) : eq(ActionsOperationTable.expected, row.expected),
  )
}
~~~~

## AUT1-C34

```json
{"block_id":"AUT1-C34","type":"literal_source_excerpt","requests":["RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/operations/outcome.ts","repository_path":"packages/core/src/actions/operations/outcome.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"6ad54f11c415134b4eb590194e2079f09ef01aed","source_sha256":"3d89a3a86b0d51b2c153088397c952599dc8b75b5469a5a27a8efc7395ece20c","source_bytes":2037,"body_anchors":["A16","A17"],"requested_subject":"Decode estrito, definitive, combine, attributed e checked ack/observation"}
```

```json
{"first_line":1,"last_line":40,"bytes":2037,"sha256":"3d89a3a86b0d51b2c153088397c952599dc8b75b5469a5a27a8efc7395ece20c"}
```

~~~~typescript
import { Actions } from "@orchestra/schema/actions"
import { Cause, Effect, Option, Schema } from "effect"
import { ActionsError } from "../error"

export const decodeAcknowledgement = Schema.decodeUnknownEffect(Schema.toType(Actions.OperationAcknowledgement), {
  onExcessProperty: "error",
})

export const decodeObservation = Schema.decodeUnknownEffect(Schema.toType(Actions.OperationObservation), {
  onExcessProperty: "error",
})

export function definitive(cause: Cause.Cause<unknown>) {
  if (Cause.hasInterrupts(cause)) return
  const failure = Cause.findErrorOption(cause)
  if (Option.isNone(failure) || !(failure.value instanceof ActionsError)) return
  if (failure.value.disposition === "definitely_unsent" || failure.value.disposition === "definitely_rejected")
    return failure.value
}

export function combine(original?: Actions.OperationAcknowledgement, observed?: Actions.OperationAcknowledgement) {
  if ((["runID", "jobID", "resourceID", "attempt"] as const).some((field) => {
    return original?.[field] !== undefined && observed?.[field] !== undefined && original[field] !== observed[field]
  })) return new ActionsError({ kind: "intent_conflict", message: "Actions observation changed acknowledged native identity" })
  if (!original && !observed) return
  return { ...original, ...Schema.encodeSync(Actions.OperationAcknowledgement)(observed ?? {}) }
}

export function attributed(acknowledgement?: Actions.OperationAcknowledgement) {
  return acknowledgement?.unattributed !== true &&
    !!(acknowledgement?.runID || acknowledgement?.jobID || acknowledgement?.resourceID)
}

export const checkedAcknowledgement = (input: unknown) => decodeAcknowledgement(input).pipe(
  Effect.mapError(() => new ActionsError({ kind: "outcome_unknown", message: "Actions provider acknowledgement is invalid" })),
)

export const checkedObservation = (input: unknown) => decodeObservation(input).pipe(
  Effect.mapError(() => new ActionsError({ kind: "invalid_input", message: "Actions operation observation is invalid" })),
)
~~~~

## AUT1-C35

```json
{"block_id":"AUT1-C35","type":"literal_source_excerpt","requests":["RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/operations/readback.ts","repository_path":"packages/core/src/actions/operations/readback.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"16146919f0a4fb7101a72bee160cdcdc642ad90f","source_sha256":"80de0b27f0b95536f35fd87186241ef51bd9a66a9e47a19cca1df104010f86a8","source_bytes":1667,"body_anchors":["A17"],"requested_subject":"Reconcile update/CAS completo"}
```

```json
{"first_line":1,"last_line":27,"bytes":1667,"sha256":"80de0b27f0b95536f35fd87186241ef51bd9a66a9e47a19cca1df104010f86a8"}
```

~~~~typescript
import { Actions } from "@orchestra/schema/actions"
import { and, eq, isNull } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { ActionsError } from "../error"
import { attributed, combine } from "./outcome"
import { ActionsOperationTable } from "./sql"
import { identity, safe, unavailable, type DB, type Row } from "./storage"

export const update = (db: DB, row: Row, observation: Actions.OperationObservation) => db.transaction((tx) => Effect.gen(function* () {
  const now = yield* Clock.currentTimeMillis
  const expired = unavailable(row, now)
  if (expired) return yield* Effect.fail(expired)
  const acknowledgement = combine(row.result ?? undefined, observation.acknowledgement)
  if (acknowledgement instanceof ActionsError) return yield* Effect.fail(acknowledgement)
  // The adapter proves the exact native identity. Empty/unattributed replies
  // cannot confirm anything, and polling never changes unknown into accepted.
  const state = observation.state === "pending" || !attributed(acknowledgement) ? row.state : observation.state
  return yield* tx.update(ActionsOperationTable).set({
    state,
    result: acknowledgement ?? null,
    time_updated: state === row.state ? row.time_updated : now,
    reason: state === "rejected" ? "Provider command rejection was confirmed" : state === "confirmed" ? null : row.reason,
  }).where(and(
    identity(row), eq(ActionsOperationTable.state, row.state), eq(ActionsOperationTable.time_updated, row.time_updated),
    row.result == null ? isNull(ActionsOperationTable.result) : eq(ActionsOperationTable.result, row.result),
  )).returning().get()
}), { behavior: "immediate" }).pipe(safe)
~~~~

## AUT1-C36

```json
{"block_id":"AUT1-C36","type":"literal_source_excerpt","requests":["RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/readback.ts","repository_path":"packages/core/src/actions/readback.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"26e01af0e8dad921d4f7a408e2642a851da3903d","source_sha256":"891d45078014fc821bba1a9ea69e68b4a822545e79cf1e5ee5f9f0bcc86acac2","source_bytes":2118,"body_anchors":["A17"],"requested_subject":"Observador completo, incluindo assinatura/imports anteriores à linha14"}
```

```json
{"first_line":1,"last_line":35,"bytes":2118,"sha256":"891d45078014fc821bba1a9ea69e68b4a822545e79cf1e5ee5f9f0bcc86acac2"}
```

~~~~typescript
export * as ActionsReadback from "./readback"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsContract } from "./contract"
import type { ActionsError } from "./error"

export const observe = Effect.fn("ActionsReadback.observe")(function* (
  reader: ActionsContract.ReadAdapter,
  binding: Actions.Binding,
  intent: Actions.OperationIntent,
  acknowledged?: Actions.OperationAcknowledgement,
): Effect.fn.Return<Actions.OperationObservation, ActionsError> {
  // Unattributed dispatch cannot be recovered by guessing a nearby run.
  if (acknowledged?.unattributed || !acknowledged?.runID) return { state: "pending" }
  const run = yield* reader.run(binding, acknowledged.runID)
  if (intent.expected?.commit && run.commit !== intent.expected.commit) return { state: "pending" }
  if (intent.target.runID && run.id !== intent.target.runID) return { state: "pending" }
  if (intent.kind === "workflow.dispatch") {
    if (intent.target.workflowID && run.workflowID !== intent.target.workflowID) return { state: "pending" }
    if (intent.target.ref && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(intent.target.ref) &&
      run.ref !== intent.target.ref.replace(/^refs\/heads\//, "")) return { state: "pending" }
    if (intent.target.ref && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(intent.target.ref) &&
      run.commit.toLowerCase() !== intent.target.ref.toLowerCase()) return { state: "pending" }
    if (run.event !== "workflow_dispatch" && binding.provider.kind === "github") return { state: "pending" }
    return { state: "confirmed", acknowledgement: acknowledged }
  }
  if ((intent.kind === "run.retry" || intent.kind === "run.retryFailed") && acknowledged.attempt !== undefined &&
    run.attempt !== undefined && run.attempt >= acknowledged.attempt)
    return { state: "confirmed", acknowledgement: acknowledged }
  if ((intent.kind === "run.cancel" || intent.kind === "run.forceCancel") &&
    (run.conclusion === "cancelled" || run.status === "canceled"))
    return { state: "confirmed", acknowledgement: acknowledged }
  return { state: "pending" }
})
~~~~

## AUT1-C37

```json
{"block_id":"AUT1-C37","type":"literal_source_excerpt","requests":["RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/error.ts","repository_path":"packages/core/src/actions/error.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"5557a68cf67417c2c3149f6f130952297114ecbd","source_sha256":"9ce2b3a2943588b3bf4676773f9966a75f347aa84522b9ae96131ba9839017e7","source_bytes":246,"body_anchors":["A16"],"requested_subject":"Tipo de erro Actions usado por definitive"}
```

```json
{"first_line":1,"last_line":6,"bytes":246,"sha256":"9ce2b3a2943588b3bf4676773f9966a75f347aa84522b9ae96131ba9839017e7"}
```

~~~~typescript
export * as ActionsErrors from "./error"

import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"

export class ActionsError extends Schema.TaggedErrorClass<ActionsError>()("ActionsError", Actions.ErrorData.fields) {}
~~~~

## AUT1-C38

```json
{"block_id":"AUT1-C38","type":"literal_source_excerpt","requests":["RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/github/commands/workflow.ts","repository_path":"packages/core/src/actions/github/commands/workflow.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"bc9677ced86d82f08db5a38ae948bcca3b1406eb","source_sha256":"7330ca26082e22e8a81c89285afc18002903188555c96d1d60565fae993f7b2f","source_bytes":6811,"body_anchors":["A18"],"requested_subject":"Ack concreto dispatch 204 versus identidade nativa 200"}
```

```json
{"first_line":12,"last_line":47,"bytes":3488,"sha256":"3a3b5ad735321e2ccd9fd17dd5c744a46604132747fe785bb19576e150c216be"}
```

~~~~typescript
export const dispatch = Effect.fn("ActionsGitHubCommands.dispatch")(function* (services: GitHubCommandCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent, input: typeof Actions.GitHubDispatch.Type) {
  if (intent.target.ref === undefined || input.ref !== intent.target.ref)
    return yield* GitHubCommandCommon.fail(binding, "invalid_input", "Dispatch ref does not match the admitted native target")
  const { GitHubDispatchInputs } = yield* Effect.promise(() => import("./inputs"))
  const repository = yield* GitHubCommandCommon.authority(services, binding)
  const workflow = yield* read(services, binding, intent, repository.root)
  if (workflow.state !== "active") return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native workflow is not active for dispatch")
  const branch = repository.native.default_branch
  if (!branch) return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native default branch was not observed")
  const admission = yield* GitHubCommandCommon.before(binding, services.reader.source(binding, { path: workflow.path, ref: branch }))
  yield* GitHubCommandCommon.guard(binding, () => {
    GitHubCommandCommon.source(binding, { ...intent, expected: undefined }, admission, workflow.path, branch)
    GitHubDispatchInputs.definitions(binding, admission)
  }, "source_unresolved")
  // Default-branch eligibility and selected-ref execution source are separate proofs.
  const selected = yield* GitHubCommandCommon.before(binding, services.reader.source(binding, { path: workflow.path, ref: input.ref }))
  const definitions = yield* GitHubCommandCommon.guard(binding, () => {
    GitHubCommandCommon.source(binding, intent, selected, workflow.path, input.ref)
    return GitHubDispatchInputs.definitions(binding, selected)
  }, "source_unresolved")
  const inputs = yield* GitHubCommandCommon.guard(binding, () => GitHubDispatchInputs.values(binding, definitions, input.inputs))
  yield* Effect.forEach(Object.entries(definitions).filter(([name, definition]) => definition.type === "environment" && Object.hasOwn(inputs, name)), ([name]) => Effect.gen(function* () {
    const target = yield* GitHubCommandCommon.guard(binding, () => {
      const value = inputs[name]
      if (typeof value !== "string" || !value || value.length > 255 || value !== value.trim() || /[\\%{}:\x00-\x1f\x7f]/.test(value) || value.split("/").some((part) => !part || part === "." || part === ".."))
        throw GitHubCommandCommon.fail(binding, "invalid_input", "Environment input requires an exact native environment name")
      return { value, segment: encodeURIComponent(value) }
    })
    const response = yield* GitHubCommandCommon.get(services, binding, `${repository.root}/environments/${target.segment}`)
    yield* GitHubCommandCommon.guard(binding, () => {
      const environment = GitHubNative.decode(binding, Schema.Struct({ id: GitHubNative.ID, name: Schema.NonEmptyString }), response.data, "environment")
      if (environment.name.toLowerCase() !== target.value.toLowerCase()) throw GitHubCommandCommon.fail(binding, "source_conflict", "Native environment identity changed during preflight")
    })
  }))
  const response = yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${repository.root}/actions/workflows/${workflow.id}/dispatches`, body: { ref: input.ref, inputs } }, [200, 204])
  if (response.status === 204) return { acknowledgement: { unattributed: true } }
~~~~

## AUT1-C39

```json
{"block_id":"AUT1-C39","type":"literal_source_excerpt","requests":["RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/github/commands/run.ts","repository_path":"packages/core/src/actions/github/commands/run.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"20a65fe64b3559988856c829670ebb82296f9113","source_sha256":"a54d15a5e3870a09fc98708de4ee41aa09acaf2175b6d9c9e0e4249e6646fe78","source_bytes":4900,"body_anchors":["A19"],"requested_subject":"Retry/cancel/delete/fork e acknowledgments concretos"}
```

```json
{"first_line":10,"last_line":59,"bytes":4476,"sha256":"401ec763bac5df99cb1c4266a4fcac6408be01d8c04573250c9f2580d86a0b94"}
```

~~~~typescript
  event: Schema.String, status: Schema.NullOr(Schema.String), conclusion: Schema.optionalKey(Schema.NullOr(Schema.String)),
  repository: Schema.Struct({ id: GitHubNative.ID, private: Schema.Boolean }),
  head_repository: Schema.NullOr(Schema.Struct({ id: GitHubNative.ID, fork: Schema.Boolean })) })

// https://docs.github.com/en/rest/actions/workflow-runs
export const perform = Effect.fn("ActionsGitHubCommands.run")(function* (services: GitHubCommandCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent, debug?: boolean) {
  const id = yield* GitHubCommandCommon.guard(binding, () => GitHubNative.id(binding, intent.target.runID ?? ""))
  const repository = yield* GitHubCommandCommon.authority(services, binding)
  const run = yield* GitHubCommandCommon.run(services, binding, intent, id)
  yield* GitHubCommandCommon.historical(services, binding, intent, run)
  const target = `${repository.root}/actions/runs/${id}`
  if (intent.kind === "run.retry" || intent.kind === "run.retryFailed") {
    if (run.status !== "completed" || (intent.kind === "run.retryFailed" && !["failure", "cancelled", "timed_out"].includes(run.conclusion ?? "")))
      return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native run is not eligible for the admitted retry mode")
    yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${target}/${intent.kind === "run.retry" ? "rerun" : "rerun-failed-jobs"}`,
      body: debug === undefined ? {} : { enable_debug_logging: debug } }, [201, 204])
    // The admitted run is known; the newly-created attempt is not returned here.
    return { acknowledgement: { runID: id } }
  }
  if (intent.kind === "run.cancel" || intent.kind === "run.forceCancel") {
    if (run.status === null || !active.has(run.status))
      return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native run is not in a cancelable execution state")
    if (intent.kind === "run.forceCancel" && (binding.provider.hostname !== "github.com" || binding.provider.apiOrigin !== "https://api.github.com" || repository.headers["x-github-api-version-selected"] !== "2026-03-10"))
      return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native force-cancel route has no observed supported host/API-version evidence")
    yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${target}/${intent.kind === "run.cancel" ? "cancel" : "force-cancel"}` }, [202])
    return { acknowledgement: { runID: id } }
  }
  if (intent.kind === "run.delete") {
    if (run.status !== "completed") return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Only a terminal native run may be deleted")
    yield* GitHubCommandCommon.send(services, binding, { method: "DELETE", path: target }, [204])
    return { acknowledgement: { runID: id } }
  }
  if (intent.kind === "run.approveFork") {
    if (run.event !== "pull_request" || (run.status !== "action_required" && run.conclusion !== "action_required"))
      return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native run does not require fork pull-request approval")
    const response = yield* GitHubCommandCommon.get(services, binding, target)
    yield* GitHubCommandCommon.guard(binding, () => {
      const native = GitHubNative.decode(binding, Fork, response.data, "fork approval")
      if (String(native.id) !== id || String(native.repository.id) !== binding.projectID || native.run_attempt !== run.attempt || native.head_sha.toLowerCase() !== run.commit.toLowerCase())
        throw GitHubCommandCommon.fail(binding, "source_conflict", "Native fork run changed during preflight")
      if (native.event !== run.event || native.status !== run.status || native.conclusion !== run.conclusion)
        throw GitHubCommandCommon.fail(binding, "source_conflict", "Native fork approval conditions changed during preflight")
      if (native.repository.private || !native.head_repository?.fork || String(native.head_repository.id) === binding.projectID)
        throw GitHubCommandCommon.fail(binding, "capability_unavailable", "Native public-fork ownership was not proved")
    })
    yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${target}/approve` }, [201])
    return { acknowledgement: { runID: id } }
  }
  return yield* GitHubCommandCommon.fail(binding, "invalid_input", "Command does not belong to the GitHub run dispatcher")
})
~~~~

## AUT1-C40

```json
{"block_id":"AUT1-C40","type":"literal_source_excerpt","requests":["RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/github/commands/job.ts","repository_path":"packages/core/src/actions/github/commands/job.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"01828a587ca7443e08fc0ecdcff55bf1ebeca863","source_sha256":"b753ad05386cd13df639a4000b7fd35db4db8431e66f1ab27633acdbeb314591","source_bytes":2482,"body_anchors":["A19"],"requested_subject":"Retry de job e acknowledgment sem nova tentativa fabricada"}
```

```json
{"first_line":9,"last_line":33,"bytes":2155,"sha256":"9494a8db1e30da775bbbde5b91a05e6e4a721a3fa247809f442cdf27d5c05286"}
```

~~~~typescript
  run_attempt: Schema.optionalKey(GitHubNative.Positive), status: Schema.NullOr(Schema.String) })

// https://docs.github.com/en/rest/actions/workflow-runs#re-run-a-job-from-a-workflow-run
export const retry = Effect.fn("ActionsGitHubCommands.jobRetry")(function* (services: GitHubCommandCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent, debug?: boolean) {
  const id = yield* GitHubCommandCommon.guard(binding, () => GitHubNative.id(binding, intent.target.jobID ?? ""))
  const repository = yield* GitHubCommandCommon.authority(services, binding)
  const response = yield* GitHubCommandCommon.get(services, binding, `${repository.root}/actions/jobs/${id}`)
  const job = yield* GitHubCommandCommon.guard(binding, () => {
    const native = GitHubNative.decode(binding, Job, response.data, "job retry")
    if (String(native.id) !== id || (intent.target.runID !== undefined && String(native.run_id) !== intent.target.runID))
      throw GitHubCommandCommon.fail(binding, "source_conflict", "Native job does not match its admitted run ownership")
    GitHubCommandCommon.version(binding, intent.expected, response)
    return native
  })
  const run = yield* GitHubCommandCommon.run(services, binding, intent, String(job.run_id))
  if (job.run_attempt === undefined) return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native job attempt was not observed")
  if (job.run_attempt !== run.attempt || job.head_sha.toLowerCase() !== run.commit.toLowerCase())
    return yield* GitHubCommandCommon.fail(binding, "source_conflict", "Native job source or attempt is stale")
  if (job.status !== "completed" || run.status !== "completed")
    return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native job/run is not terminal for retry")
  yield* GitHubCommandCommon.historical(services, binding, intent, run)
  yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${repository.root}/actions/jobs/${id}/rerun`,
    body: debug === undefined ? {} : { enable_debug_logging: debug } }, [201, 204])
  return { acknowledgement: { jobID: id, runID: String(job.run_id) } }
})
~~~~

## AUT1-C41

```json
{"block_id":"AUT1-C41","type":"literal_source_excerpt","requests":["RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/gitlab/commands.ts","repository_path":"packages/core/src/actions/gitlab/commands.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"d3f432fc7b0c434bfcb9a88adeabfcfae5829033","source_sha256":"2be56b6ff21b0f9a63d929b0b38f75fad2d29705476dbd5d13f63634f803c00e","source_bytes":2258,"body_anchors":["A22"],"requested_subject":"Preflight plan, send único e qualificação de acknowledgment GitLab"}
```

```json
{"first_line":1,"last_line":33,"bytes":2258,"sha256":"2be56b6ff21b0f9a63d929b0b38f75fad2d29705476dbd5d13f63634f803c00e"}
```

~~~~typescript
export * as ActionsGitLabCommands from "./commands"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsGitLabNative } from "./native"
import { GitLabCommandShared } from "./commands/shared"
import { GitLabCommandLaunch } from "./commands/launch"
import { GitLabCommandRuns } from "./commands/runs"
import { GitLabCommandJobs } from "./commands/jobs"
import { GitLabCommandMergeRequest } from "./commands/merge-request"

export function make(input: { readonly transport: ActionsContract.Transport; readonly reader: ActionsContract.ReadAdapter }): ActionsContract.Commands {
  const launch = GitLabCommandLaunch.make(input)
  const run = GitLabCommandRuns.make(input)
  const job = GitLabCommandJobs.make(input)
  const mergeRequest = GitLabCommandMergeRequest.make(input)
  return { perform: Effect.fn("ActionsGitLabCommands.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
    const plan = yield* Effect.gen(function* () {
      const admitted = yield* ActionsGitLabNative.checked(binding, () => GitLabCommandShared.admit(binding, intent))
      if (admitted.kind === "workflow.dispatch" || admitted.kind === "pipeline.trigger") return yield* launch(binding, admitted, payload)
      if (admitted.kind === "pipeline.mergeRequest") return yield* mergeRequest(binding, admitted, payload)
      if (admitted.kind.startsWith("run.")) return yield* run(binding, admitted, payload)
      return yield* job(binding, admitted, payload)
    }).pipe(Effect.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: "definitely_unsent" })))
    // One write, owned by the caller's durable execution scope. W1 captures the
    // same credential snapshot for native actor preflight and this HTTP mutation.
    const response = yield* input.transport.request(binding, plan.request)
    if (!plan.statuses.includes(response.status)) return yield* GitLabCommandShared.error(binding, "outcome_unknown", "GitLab command returned an unqualified native write status", true)
    return { acknowledgement: yield* plan.acknowledge(response) }
  }) }
}
~~~~

## AUT1-C42

```json
{"block_id":"AUT1-C42","type":"literal_source_excerpt","requests":["RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/gitlab/commands/shared.ts","repository_path":"packages/core/src/actions/gitlab/commands/shared.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"b15f4a3edb40e83274490b3c789cf2581aac9a5a","source_sha256":"0af91cc662eb4578cf1f16e967743fe9d69fb356d6c58555f50826b399e23a97","source_bytes":5846,"body_anchors":["A22"],"requested_subject":"Intent estrito, target/commit/source, parser do ack pipeline"}
```

```json
{"first_line":9,"last_line":83,"bytes":5556,"sha256":"d10d6305fb44fcb10691798af365c1fa2b84743f8eae34e197d4f3203822f779"}
```

~~~~typescript
export const kinds = ["workflow.dispatch", "run.retry", "run.cancel", "run.delete", "run.rename", "job.retry", "job.play", "job.cancel", "job.erase", "pipeline.mergeRequest", "pipeline.trigger"]
export const terminal = ["success", "failed", "canceled", "skipped"]
export type Plan = { readonly request: ActionsContract.Request; readonly statuses: readonly number[];
  readonly acknowledge: (response: ActionsContract.Response) => Effect.Effect<Actions.OperationAcknowledgement, ActionsError> }

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string, sent = false) {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: "gitlab", disposition: sent ? "unknown" : "definitely_unsent" })
}

export function decode<S extends Schema.Decoder<unknown>>(binding: Actions.Binding, schema: S, data: unknown): S["Type"] {
  const result = Schema.decodeUnknownOption(schema, { onExcessProperty: "error" })(data)
  if (Option.isNone(result)) throw error(binding, "invalid_input", "GitLab command payload or intent does not match its native schema")
  return result.value
}

export function json(binding: Actions.Binding, data: unknown) {
  const result = Schema.decodeUnknownOption(Schema.Json)(data)
  if (Option.isNone(result)) throw error(binding, "invalid_input", "GitLab command requires finite JSON values")
  return result.value
}

export function admit(binding: Actions.Binding, input: Actions.OperationIntent) {
  const intent = decode(binding, Actions.OperationIntent, input)
  ActionsGitLabNative.projectPath(binding)
  if (intent.binding.id !== binding.id || intent.binding.revision !== binding.revision)
    throw error(binding, "binding_stale", "GitLab command binding and admitted revision differ")
  if (!kinds.includes(intent.kind)) throw error(binding, "invalid_input", "GitLab command kind belongs to a different dispatcher")
  if (intent.expected?.attempt !== undefined) throw error(binding, "capability_unavailable", "GitLab has native retry job identities, not run_attempt preconditions")
  if (intent.expected?.resourceVersion !== undefined) throw error(binding, "capability_unavailable", "This GitLab execution command has no native resourceVersion precondition")
  if (intent.expected?.commit !== undefined && Option.isNone(Schema.decodeUnknownOption(ActionsGitLabNative.SHA)(intent.expected.commit)))
    throw error(binding, "invalid_input", "GitLab expected commit must be an immutable Git object ID")
  if (intent.target.workflowID !== undefined && intent.target.workflowID !== ActionsGitLabNative.workflowID(binding))
    throw error(binding, "invalid_input", "GitLab workflow target must identify this project's native pipeline/config slot")
  return intent
}

export function target(binding: Actions.Binding, intent: Actions.OperationIntent, allowed: readonly string[], required: readonly string[]) {
  if (Object.keys(intent.target).some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(intent.target, key)))
    throw error(binding, "invalid_input", "GitLab admitted target does not match this native command")
}

export function commit(binding: Actions.Binding, intent: Actions.OperationIntent, sha: string, ref: string | null) {
  if (intent.expected?.commit !== undefined && intent.expected.commit !== sha || intent.target.ref !== undefined && intent.target.ref !== ref)
    throw error(binding, "source_conflict", "GitLab native commit or ref changed since admission")
}

export const source = Effect.fn("ActionsGitLabCommands.sourcePrecondition")(function* (
  binding: Actions.Binding, intent: Actions.OperationIntent, reader: ActionsContract.ReadAdapter, sha: string, path?: string,
) {
  const selected = intent.target.path ?? path
  if (!selected) {
    if (intent.expected?.sourceVersion !== undefined) return yield* error(binding, "source_unresolved", "A sourceVersion precondition requires the admitted native source path")
    return
  }
  const source = yield* reader.source(binding, { path: selected, ref: sha })
  if (source.bindingID !== binding.id || source.path !== selected || source.commit !== sha ||
    intent.expected?.sourceVersion !== undefined && source.version !== intent.expected.sourceVersion)
    return yield* error(binding, "source_conflict", "GitLab source identity or version changed since admission")
  return source
})

export function native<S extends Schema.Decoder<unknown>>(binding: Actions.Binding, schema: S, data: unknown, sent = false): S["Type"] {
  const result = Schema.decodeUnknownOption(schema)(data)
  if (Option.isNone(result)) throw error(binding, sent ? "outcome_unknown" : "transport_failed", "GitLab returned invalid command identity metadata", sent)
  return result.value
}

export function pipeline(binding: Actions.Binding, data: unknown, expected: { id?: string; commit?: string; ref?: string | null; sources?: readonly string[]; name?: string }) {
  const value = native(binding, ActionsGitLabNative.Pipeline, data, true)
  if (String(value.project_id) !== binding.projectID || expected.id !== undefined && String(value.id) !== expected.id ||
    expected.commit !== undefined && value.sha !== expected.commit || expected.ref !== undefined && value.ref !== expected.ref ||
    expected.sources !== undefined && !expected.sources.includes(value.source) || expected.name !== undefined && value.name !== expected.name)
    throw error(binding, "outcome_unknown", "GitLab mutation response did not prove the exact project, pipeline, source and ref", true)
  return { runID: String(value.id) }
}
~~~~

## AUT1-C43

```json
{"block_id":"AUT1-C43","type":"literal_source_excerpt","requests":["RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/gitlab/commands/runs.ts","repository_path":"packages/core/src/actions/gitlab/commands/runs.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"999c7e5cd6c6d8d33cbe63ad601923b308eff3e4","source_sha256":"0c210556925c4d2f025c6942b2512e8ab782ae748aa51b0336dde859c441ec30","source_bytes":3685,"body_anchors":["A22"],"requested_subject":"Retry/cancel/delete/rename e acknowledgment pipeline concreto"}
```

```json
{"first_line":9,"last_line":47,"bytes":3365,"sha256":"b9e290190f255ecd73886bd678ed598e21a97101e1b0a8de51dd851dcfd5606b"}
```

~~~~typescript

export function make(input: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }) {
  const native = GitLabCommandNative.make(input.transport)
  return Effect.fn("ActionsGitLabCommands.run")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json): Effect.fn.Return<GitLabCommandShared.Plan, import("../../error").ActionsError> {
    const name = yield* ActionsGitLabNative.checked(binding, () => {
      GitLabCommandShared.target(binding, intent, ["runID", "workflowID", "ref", "path"], ["runID"])
      ActionsGitLabNative.nativeID(binding, intent.target.runID ?? "", "pipeline ID")
      if (intent.kind === "run.rename") return GitLabCommandShared.decode(binding, Actions.RenameCommand.fields.input, payload).name
      const value = intent.kind === "run.retry" ? GitLabCommandShared.decode(binding, Actions.RetryCommand.fields.input, payload)
        : GitLabCommandShared.decode(binding, Actions.GitLabCommand.fields.input, payload)
      if (value.provider !== "gitlab") throw GitLabCommandShared.error(binding, "invalid_input", "GitLab command provider does not match this binding")
    })
    const project = yield* native.project(binding)
    const level = yield* ActionsGitLabNative.checked(binding, () => GitLabCommandNative.role(binding, project, intent.kind === "run.delete" ? 50 : 30))
    if (intent.kind === "run.rename") {
      const observation = yield* native.metadata(binding)
      // https://gitlab.com/gitlab-org/gitlab/-/blob/v18.4.0-ee/lib/api/ci/pipelines.rb
      yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.requireVersion(binding, observation, [16, 6], "pipeline name metadata"))
    }
    const run = yield* input.reader.run(binding, intent.target.runID ?? "")
    yield* ActionsGitLabNative.checked(binding, () => {
      if (run.id !== intent.target.runID || run.bindingID !== binding.id || run.workflowID !== ActionsGitLabNative.workflowID(binding))
        throw GitLabCommandShared.error(binding, "binding_stale", "GitLab selected pipeline belongs to a different native target")
      GitLabCommandShared.commit(binding, intent, run.commit, run.ref)
      if (intent.kind === "run.cancel") GitLabCommandNative.cancellation(binding, project, level)
    })
    yield* GitLabCommandShared.source(binding, intent, input.reader, run.commit)
    const path = `${ActionsGitLabNative.projectPath(binding)}/pipelines/${run.id}`
    if (intent.kind === "run.delete") return { request: { method: "DELETE", path }, statuses: [204],
      acknowledge: (response) => ActionsGitLabNative.checked(binding, () => {
        if (response.data !== null) throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab deletion did not return an exact native empty acknowledgement", true)
        return { runID: run.id }
      }) }
    return { request: { method: name === undefined ? "POST" : "PUT", path: `${path}/${name === undefined ? intent.kind === "run.retry" ? "retry" : "cancel" : "metadata"}`,
      ...(name === undefined ? {} : { body: { name } }) }, statuses: intent.kind === "run.retry" ? [200, 201] : [200],
      acknowledge: (response) => ActionsGitLabNative.checked(binding, () => GitLabCommandShared.pipeline(binding, response.data,
        { id: run.id, commit: run.commit, sources: [run.event], ref: run.ref, name })) }
  })
}
~~~~

## AUT1-C44

```json
{"block_id":"AUT1-C44","type":"literal_source_excerpt","requests":["RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/gitlab/commands/jobs.ts","repository_path":"packages/core/src/actions/gitlab/commands/jobs.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"176a10632f895603fc8cc2b7baef1327db90377e","source_sha256":"0e59d1b73ef755e2e29d0e0dcb829c127f9cc6b642773c973510afe5d3e0f310","source_bytes":11307,"body_anchors":["A22"],"requested_subject":"Ramos job/bridge, novo jobID retry e readback após escrita"}
```

```json
{"first_line":1,"last_line":133,"bytes":11307,"sha256":"0e59d1b73ef755e2e29d0e0dcb829c127f9cc6b642773c973510afe5d3e0f310"}
```

~~~~typescript
export * as GitLabCommandJobs from "./jobs"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../../contract"
import { ActionsGitLabNative } from "../native"
import { GitLabCommandNative } from "./native"
import { GitLabCommandShared } from "./shared"

const ReturnedJob = Schema.Struct({ id: ActionsGitLabNative.ID, pipeline: Schema.optional(Schema.Struct({ id: ActionsGitLabNative.ID, project_id: ActionsGitLabNative.ID,
  sha: Schema.optional(ActionsGitLabNative.SHA), ref: Schema.optional(Schema.NullOr(Schema.String)) })),
  commit: Schema.optional(Schema.Struct({ id: ActionsGitLabNative.SHA })), ref: Schema.optional(Schema.NullOr(Schema.String)),
  erased_at: Schema.optional(Schema.NullOr(Schema.String)) })

export function make(input: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }) {
  const native = GitLabCommandNative.make(input.transport)
  return Effect.fn("ActionsGitLabCommands.job")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json): Effect.fn.Return<GitLabCommandShared.Plan, import("../../error").ActionsError> {
    const variables = yield* ActionsGitLabNative.checked(binding, () => {
      GitLabCommandShared.target(binding, intent, ["jobID", "runID", "workflowID", "ref", "path"], ["jobID", "runID"])
      ActionsGitLabNative.nativeID(binding, intent.target.jobID ?? "", "job ID")
      ActionsGitLabNative.nativeID(binding, intent.target.runID ?? "", "pipeline ID")
      if (intent.kind === "job.play") return GitLabCommandShared.decode(binding, Actions.JobPlayCommand.fields.input, payload).variables
      const value = intent.kind === "job.retry" ? GitLabCommandShared.decode(binding, Actions.JobRetryCommand.fields.input, payload)
        : GitLabCommandShared.decode(binding, Actions.GitLabCommand.fields.input, payload)
      if (value.provider !== "gitlab") throw GitLabCommandShared.error(binding, "invalid_input", "GitLab command provider does not match this binding")
    })
    const project = yield* native.project(binding)
    const level = yield* ActionsGitLabNative.checked(binding, () => GitLabCommandNative.role(binding, project, 30))
    const run = yield* input.reader.run(binding, intent.target.runID ?? "")
    const path = `${ActionsGitLabNative.projectPath(binding)}/jobs/${intent.target.jobID}`
    const selected = yield* native.get(binding, path).pipe(
      Effect.map((response) => ({ kind: "job", data: response.data })),
      Effect.catch((error) => error.kind === "not_found"
        ? findBridge(binding, input.reader, run.id, intent.target.jobID ?? "").pipe(Effect.map((job) => ({ kind: "bridge", data: job }))) : Effect.fail(error)),
    )
    if (selected.kind === "bridge") {
      if (intent.kind === "job.cancel" || intent.kind === "job.erase")
        return yield* GitLabCommandShared.error(binding, "capability_unavailable", "GitLab bridge jobs have no native build cancel/erase endpoint")
      const observation = yield* native.metadata(binding)
      yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.requireVersion(binding, observation, [17, 0], "bridge job retry/play"))
    }
    const job = yield* ActionsGitLabNative.checked(binding, () => {
      const detail = selected.kind === "job" ? GitLabCommandShared.native(binding, GitLabCommandNative.Job, selected.data) : undefined
      const bridge = selected.kind === "bridge" ? GitLabCommandShared.native(binding, Actions.Job, selected.data) : undefined
      if (detail && (String(detail.id) !== intent.target.jobID || String(detail.pipeline.id) !== intent.target.runID || String(detail.pipeline.project_id) !== binding.projectID ||
        detail.commit.id !== run.commit || detail.pipeline.sha !== run.commit || detail.ref !== run.ref || detail.pipeline.ref !== run.ref) ||
        bridge && (bridge.id !== intent.target.jobID || bridge.runID !== run.id || bridge.bindingID !== binding.id || bridge.kind !== "bridge") ||
        run.id !== intent.target.runID || run.bindingID !== binding.id)
        throw GitLabCommandShared.error(binding, "binding_stale", "GitLab job does not belong to the exact admitted project, pipeline, commit and ref")
      GitLabCommandShared.commit(binding, intent, run.commit, run.ref)
      const status = detail?.status ?? bridge?.status
      if (detail?.archived === true) throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab archived job is not eligible for this command")
      if (intent.kind === "job.play" && status !== "manual")
        throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab manual play requires an observed manual job")
      if (intent.kind === "job.retry" && !["success", "failed", "canceled"].includes(status ?? ""))
        throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab job retry requires an observed finished retryable job")
      if (intent.kind === "job.erase" && (!GitLabCommandShared.terminal.includes(status ?? "") || detail?.erased_at))
        throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab erase requires a terminal, non-archived, unerased job")
      if (intent.kind === "job.cancel") GitLabCommandNative.cancellation(binding, project, level)
      return detail
    })
    if (intent.kind === "job.erase" && level < 40) {
      if (!job || job.user?.username !== binding.account) return yield* GitLabCommandShared.error(binding, "permission_denied", "GitLab erase requires Maintainer access or the job's unprotected-ref creator")
      const ref = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/branches/${encodeURIComponent(job.ref)}`)
      yield* ActionsGitLabNative.checked(binding, () => {
        const branch = GitLabCommandShared.native(binding, Schema.Struct({ ...GitLabCommandNative.Ref.fields, protected: Schema.Boolean }), ref.data)
        if (branch.name !== job.ref || branch.protected) throw GitLabCommandShared.error(binding, "permission_denied", "GitLab developer-owned erase requires a proved unprotected native ref")
      })
    }
    yield* GitLabCommandShared.source(binding, intent, input.reader, run.commit)
    const body = yield* ActionsGitLabNative.checked(binding, () => {
      if (variables === undefined) return
      if (variables.some((variable) => variable.variable_type === "file"))
        throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab job play variables do not support native file variable_type")
      if (new Set(variables.map((variable) => variable.key)).size !== variables.length)
        throw GitLabCommandShared.error(binding, "invalid_input", "GitLab job play variables must have distinct native keys")
      GitLabCommandNative.variables(binding, project, level, variables.length > 0)
      return { job_variables_attributes: variables.map((variable) => ({ key: variable.key, value: variable.value })) }
    })
    const verb = intent.kind.slice(4)
    return { request: { method: "POST", path: `${path}/${verb}`, ...(body === undefined ? {} : { body }) }, statuses: [200, 201],
      acknowledge: Effect.fn("ActionsGitLabCommands.jobAcknowledgement")(function* (response: ActionsContract.Response) {
        const returned = yield* ActionsGitLabNative.checked(binding, () => {
          const value = GitLabCommandShared.native(binding, ReturnedJob, response.data, true)
          requireSource(binding, value, run)
          if (intent.kind !== "job.retry" && String(value.id) !== intent.target.jobID)
            throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab job mutation returned a different native job ID", true)
          if (intent.kind === "job.retry" && String(value.id) === intent.target.jobID)
            throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab job retry did not establish a replacement native job ID", true)
          return value
        })
        // Some native response shapes omit owning pipeline metadata. Read the exact
        // acknowledged ID once; never attribute a retry by matching names or times.
        const verified = returned.pipeline && intent.kind !== "job.erase" ? returned
          : selected.kind === "bridge" ? yield* findBridge(binding, input.reader, run.id, String(returned.id)).pipe(
            Effect.map((job) => ({ id: job.id, pipeline: { id: job.runID, project_id: binding.projectID } })),
            Effect.mapError(() => GitLabCommandShared.error(binding, "outcome_unknown", "GitLab bridge write was accepted but exact returned-ID readback failed", true)),
          ) : yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/jobs/${returned.id}`).pipe(
            Effect.flatMap((response) => ActionsGitLabNative.checked(binding, () => GitLabCommandShared.native(binding, ReturnedJob, response.data, true))),
            Effect.mapError(() => GitLabCommandShared.error(binding, "outcome_unknown", "GitLab job write was accepted but exact readback failed", true)),
          )
        return yield* ActionsGitLabNative.checked(binding, () => {
          requireSource(binding, verified, run)
          if (String(verified.id) !== String(returned.id) || !verified.pipeline || String(verified.pipeline.id) !== run.id || String(verified.pipeline.project_id) !== binding.projectID ||
            intent.kind === "job.erase" && (!("erased_at" in verified) || !verified.erased_at))
            throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab mutation response/readback did not prove exact job ownership or erasure", true)
          return { runID: run.id, jobID: String(returned.id) }
        })
      }) }
  })
}

function requireSource(binding: Actions.Binding, value: typeof ReturnedJob.Type, run: Actions.Run) {
  if (value.pipeline && (String(value.pipeline.id) !== run.id || String(value.pipeline.project_id) !== binding.projectID ||
    value.pipeline.sha !== undefined && value.pipeline.sha !== run.commit || value.pipeline.ref !== undefined && value.pipeline.ref !== run.ref) ||
    value.commit !== undefined && value.commit.id !== run.commit || value.ref !== undefined && value.ref !== run.ref)
    throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab job mutation contradicted admitted native pipeline/source identity", true)
}

const findBridge = Effect.fn("ActionsGitLabCommands.exactBridge")(function* (binding: Actions.Binding, reader: ActionsContract.ReadAdapter, runID: string, id: string) {
  const seen = new Set<string>()
  const selection: { cursor?: string } = {}
  while (seen.size < 2000) {
    const page = yield* reader.jobs(binding, { runID, cursor: selection.cursor })
    const job = page.items.find((job) => job.id === id && job.kind === "bridge" && job.bindingID === binding.id && job.runID === runID)
    if (job) return job
    if (page.next === undefined) return yield* GitLabCommandShared.error(binding, "not_found", "GitLab exact native bridge job was not found in the owning pipeline")
    if (seen.has(page.next)) break
    seen.add(page.next)
    selection.cursor = page.next
  }
  return yield* GitLabCommandShared.error(binding, "metadata_truncated", "GitLab bridge ownership lookup exceeded bounded native pagination")
})
~~~~

## AUT1-C45

```json
{"block_id":"AUT1-C45","type":"literal_source_excerpt","requests":["RE-AUT1-05","RE-AUT1-06"],"source_category":"owned_population_source","archive":"sources/packages/core/src/actions/transport/response.ts","repository_path":"packages/core/src/actions/transport/response.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"09aed710878c0e33f33b7e1a8d566074a44ad30a","source_sha256":"dbe2d9284661b36cee41b379cba34f29cd6910df7757b10b94136eb12e6d8192","source_bytes":4934,"body_anchors":["A34"],"requested_subject":"Classificador de resposta: prova positiva de rejeição, não stderr vago"}
```

```json
{"first_line":56,"last_line":76,"bytes":1751,"sha256":"1ebfeea36895201d250369da55982b9f902e3425c7dfdd8ee7db16385ee280ca"}
```

~~~~typescript
export function failure(provider: Actions.Provider, exitCode: number, stderr: Buffer, status?: number, headers: Record<string, string> = {}, complete = false) {
  const code = status ?? Number(/\bHTTP[ :]+(\d{3})\b/i.exec(stderr.toString("utf8"))?.[1])
  const retry = headers["retry-after"]
  const seconds = retry && /^\d+$/.test(retry) ? Number(retry)
    : retry ? Math.max(0, Math.ceil((Date.parse(retry) - Date.now()) / 1000))
    : headers["x-ratelimit-remaining"] === "0" && /^\d+$/.test(headers["x-ratelimit-reset"] ?? "")
      ? Math.max(0, Number(headers["x-ratelimit-reset"]) - Math.floor(Date.now() / 1000)) : undefined
  const kind = code === 429 || (code === 403 && (retry !== undefined || headers["x-ratelimit-remaining"] === "0"))
    ? "rate_limited" : code === 401 ? "not_authenticated" : code === 403 ? "permission_denied" : code === 404 ? "not_found"
      : (provider.kind === "github" && exitCode === 4) || /auth login|not logged in|not authenticated|login first|invalid token/i.test(stderr.toString("utf8"))
        ? "not_authenticated" : "transport_failed"
  // Provider diagnostics can echo submitted secrets. Only classifications leave this boundary.
  return new ActionsError({
    kind, provider: provider.kind, message: `Provider request failed${code ? ` (HTTP ${code})` : ""}`,
    retryAfter: seconds !== undefined && Number.isFinite(seconds) ? seconds : undefined,
    // Require complete bounded JSON and a normal CLI HTTP-error exit. Partial
    // output, stderr HTTP hints and exit codes alone cannot prove rejection.
    disposition: complete && (exitCode === 0 || exitCode === 1) && status !== undefined && [400, 401, 403, 404, 409, 422, 429].includes(status)
      ? "definitely_rejected" : "unknown",
  })
}
~~~~

## AUT1-X01

```json
{"block_id":"AUT1-X01","type":"literal_source_excerpt","requests":["RE-AUT1-02","RE-AUT1-05","RE-AUT1-06"],"source_category":"external_S1_04_raw_source","archive":"external-sources/packages/schema/src/actions.ts","repository_path":"packages/schema/src/actions.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"3b9c5cc47c6e043e9e5d6f013a8201c4258abe0b","source_sha256":"ff0507ebbb63a8a1ab74bc11187cb70bd19d51ed2ec8cb741eaf0155d03f6b07","source_bytes":1071,"body_anchors":[],"requested_subject":"Barrel canônico consumido por Core"}
```

```json
{"first_line":1,"last_line":18,"bytes":1071,"sha256":"ff0507ebbb63a8a1ab74bc11187cb70bd19d51ed2ec8cb741eaf0155d03f6b07"}
```

~~~~typescript
export * as Actions from "./actions"

export {
  Binding, BindingID, BindingInput, BindingRef, Capability, ErrorData, ErrorKind,
  OperationID, Policy, PolicyState, Provider, ProviderKind, SendDisposition,
} from "./actions/identity"
export { Graph, GraphJob, GraphStep, InputDefinition, ListInput, Source, SourceBase, Workflow, WorkflowPage } from "./actions/workflow"
export { Job, JobPage, Run, RunListInput, RunPage, Step } from "./actions/run"
export { Resource, ResourceKind, ResourceListInput, ResourcePage, TransferInfo, TransferInput } from "./actions/resource"
export {
  ExecuteInput, Operation, OperationAcknowledgement, OperationExpected, OperationIntent,
  OperationKind, OperationObservation, OperationTarget,
} from "./actions/operation"
export {
  CommandExecution, CommandOutput, DispatchCommand, GitHubCommand, GitHubDispatch, GitLabCommand,
  GitLabDispatch, JobPlayCommand, JobRetryCommand, MergeRequestCommand, ProviderCommand, RenameCommand,
  ResourceCommand, RetryCommand, TriggerPipelineCommand, WorkflowStateCommand,
} from "./actions/command"
~~~~

## AUT1-X02

```json
{"block_id":"AUT1-X02","type":"literal_source_excerpt","requests":["RE-AUT1-02","RE-AUT1-06"],"source_category":"external_S1_04_raw_source","archive":"external-sources/packages/schema/src/actions/identity.ts","repository_path":"packages/schema/src/actions/identity.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"273b77520f81c755f62979b9609f45917e72e062","source_sha256":"1d3361dd26b49e366b7c59d14a589f6684a16b36bfec0b761e62481fc15f6f14","source_bytes":4175,"body_anchors":[],"requested_subject":"Binding/provider/ref/policy/error e IDs públicos"}
```

```json
{"first_line":1,"last_line":93,"bytes":4175,"sha256":"1d3361dd26b49e366b7c59d14a589f6684a16b36bfec0b761e62481fc15f6f14"}
```

~~~~typescript
import { Schema } from "effect"
import { descending } from "../identifier"
import { optional, PositiveInt, statics } from "../schema"

export const ProviderKind = Schema.Literals(["github", "gitlab"]).annotate({ identifier: "Actions.ProviderKind" })
export type ProviderKind = typeof ProviderKind.Type

export const BindingID = Schema.String.check(Schema.isStartsWith("ab_")).annotate({ identifier: "Actions.BindingID" }).pipe(
  Schema.brand("Actions.BindingID"),
  statics((schema) => ({ create: () => schema.make(`ab_${descending()}`) })),
)
export type BindingID = typeof BindingID.Type

export const OperationID = Schema.String.check(Schema.isStartsWith("aop_")).annotate({ identifier: "Actions.OperationID" }).pipe(
  Schema.brand("Actions.OperationID"),
  statics((schema) => ({ create: () => schema.make(`aop_${descending()}`) })),
)
export type OperationID = typeof OperationID.Type

export const Provider = Schema.Struct({
  kind: ProviderKind,
  hostname: Schema.NonEmptyString,
  apiOrigin: Schema.NonEmptyString,
  version: optional(Schema.String),
}).annotate({ identifier: "Actions.Provider" })
export interface Provider extends Schema.Schema.Type<typeof Provider> {}

export const BindingInput = Schema.Struct({
  remote: Schema.NonEmptyString,
  provider: Provider,
  projectPath: Schema.NonEmptyString,
  expectedRevision: optional(PositiveInt),
}).annotate({ identifier: "Actions.BindingInput" })
export interface BindingInput extends Schema.Schema.Type<typeof BindingInput> {}

export const Binding = Schema.Struct({
  id: BindingID,
  revision: PositiveInt,
  remote: Schema.NonEmptyString,
  provider: Provider,
  projectID: Schema.NonEmptyString,
  projectPath: Schema.NonEmptyString,
  account: optional(Schema.String),
  directory: Schema.NonEmptyString,
  workspaceID: optional(Schema.String),
}).annotate({ identifier: "Actions.Binding" })
export interface Binding extends Schema.Schema.Type<typeof Binding> {}

export const BindingRef = Schema.Struct({ id: BindingID, revision: PositiveInt })
  .annotate({ identifier: "Actions.BindingRef" })
export interface BindingRef extends Schema.Schema.Type<typeof BindingRef> {}

export const Capability = Schema.Struct({
  operation: Schema.NonEmptyString,
  state: Schema.Literals(["available", "unavailable", "unknown"]),
  reason: optional(Schema.String),
  scope: optional(Schema.String),
  observedAt: Schema.Number,
}).annotate({ identifier: "Actions.Capability" })
export interface Capability extends Schema.Schema.Type<typeof Capability> {}

export const ErrorKind = Schema.Literals([
  "binding_missing", "binding_stale", "host_mismatch", "cli_missing", "not_authenticated",
  "permission_denied", "capability_unavailable", "not_found", "invalid_input", "source_conflict",
  "source_unresolved", "rate_limited", "metadata_truncated", "transport_failed", "transfer_failed",
  "outcome_unknown", "operation_missing", "operation_expired", "operation_reused", "intent_conflict",
  "maintenance_required",
]).annotate({ identifier: "Actions.ErrorKind" })
export type ErrorKind = typeof ErrorKind.Type

export const SendDisposition = Schema.Literals(["definitely_unsent", "definitely_rejected", "unknown"])
  .annotate({ identifier: "Actions.SendDisposition" })
export type SendDisposition = typeof SendDisposition.Type

export const ErrorData = Schema.Struct({
  kind: ErrorKind,
  message: Schema.String,
  bindingID: optional(BindingID),
  provider: optional(ProviderKind),
  resourceID: optional(Schema.String),
  retryAfter: optional(Schema.Number),
  operationID: optional(OperationID),
  disposition: optional(SendDisposition),
}).annotate({ identifier: "Actions.ErrorData" })
export interface ErrorData extends Schema.Schema.Type<typeof ErrorData> {}

export const Policy = Schema.Struct({ retentionDays: optional(PositiveInt), execution: optional(Schema.String) })
  .annotate({ identifier: "Actions.Policy" })
export interface Policy extends Schema.Schema.Type<typeof Policy> {}

export const PolicyState = Schema.Struct({ binding: BindingRef, policy: Policy })
  .annotate({ identifier: "Actions.PolicyState" })
export interface PolicyState extends Schema.Schema.Type<typeof PolicyState> {}
~~~~

## AUT1-X03

```json
{"block_id":"AUT1-X03","type":"literal_source_excerpt","requests":["RE-AUT1-05","RE-AUT1-06"],"source_category":"external_S1_04_raw_source","archive":"external-sources/packages/schema/src/actions/operation.ts","repository_path":"packages/schema/src/actions/operation.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"da7b1bdfb6bd5f7dd8fd368adb5eb5402c37c6fe","source_sha256":"6ad34b7a3cbc4eb4c1ce500f6f665894c0a7792d4d12177cdd1e055592812f0f","source_bytes":3857,"body_anchors":[],"requested_subject":"Kind/target/expected/intent/ack/observation/operation versus execute payload"}
```

```json
{"first_line":1,"last_line":79,"bytes":3857,"sha256":"6ad34b7a3cbc4eb4c1ce500f6f665894c0a7792d4d12177cdd1e055592812f0f"}
```

~~~~typescript
import { Schema } from "effect"
import { BindingID, BindingRef, OperationID } from "./identity"
import { ResourceKind } from "./resource"
import { optional, PositiveInt } from "../schema"

export const OperationKind = Schema.Literals([
  "workflow.dispatch", "workflow.enable", "workflow.disable", "run.retry", "run.retryFailed",
  "run.cancel", "run.forceCancel", "run.delete", "run.approveFork", "run.rename", "job.retry",
  "job.play", "job.cancel", "job.erase", "logs.delete", "source.branch", "source.write", "source.delete", "source.review",
  "resource.create", "resource.update", "resource.delete", "artifact.keep", "deployment.review",
  "environment.stop", "runner.register", "runner.assign", "runner.remove", "cache.clear",
  "schedule.play", "schedule.takeOwnership", "pipeline.mergeRequest", "pipeline.trigger",
  "secureFile.upload", "resourceGroup.processMode",
]).annotate({ identifier: "Actions.OperationKind" })
export type OperationKind = typeof OperationKind.Type

// Admission stores identity and optimistic preconditions, never a mutation's values.
export const OperationTarget = Schema.Struct({
  workflowID: optional(Schema.NonEmptyString),
  runID: optional(Schema.NonEmptyString),
  jobID: optional(Schema.NonEmptyString),
  resourceID: optional(Schema.NonEmptyString),
  resourceKind: optional(ResourceKind),
  scope: optional(Schema.String),
  path: optional(Schema.NonEmptyString),
  ref: optional(Schema.NonEmptyString),
}).annotate({ identifier: "Actions.OperationTarget" })
export interface OperationTarget extends Schema.Schema.Type<typeof OperationTarget> {}

export const OperationExpected = Schema.Struct({
  sourceVersion: optional(Schema.NonEmptyString),
  commit: optional(Schema.NonEmptyString),
  attempt: optional(PositiveInt),
  resourceVersion: optional(Schema.NonEmptyString),
}).annotate({ identifier: "Actions.OperationExpected" })
export interface OperationExpected extends Schema.Schema.Type<typeof OperationExpected> {}

export const OperationIntent = Schema.Struct({
  clientID: Schema.NonEmptyString,
  binding: BindingRef,
  kind: OperationKind,
  target: OperationTarget,
  expected: optional(OperationExpected),
}).annotate({ identifier: "Actions.OperationIntent" })
export interface OperationIntent extends Schema.Schema.Type<typeof OperationIntent> {}

export const OperationAcknowledgement = Schema.Struct({
  runID: optional(Schema.NonEmptyString),
  jobID: optional(Schema.NonEmptyString),
  resourceID: optional(Schema.NonEmptyString),
  attempt: optional(PositiveInt),
  unattributed: optional(Schema.Boolean),
}).annotate({ identifier: "Actions.OperationAcknowledgement" })
export interface OperationAcknowledgement extends Schema.Schema.Type<typeof OperationAcknowledgement> {}

export const OperationObservation = Schema.Struct({
  state: Schema.Literals(["pending", "confirmed", "rejected"]),
  acknowledgement: optional(OperationAcknowledgement),
}).annotate({ identifier: "Actions.OperationObservation" })
export interface OperationObservation extends Schema.Schema.Type<typeof OperationObservation> {}

export const Operation = Schema.Struct({
  id: OperationID,
  bindingID: BindingID,
  clientID: Schema.String,
  kind: OperationKind,
  state: Schema.Literals(["prepared", "sending", "accepted", "confirmed", "rejected", "outcome_unknown", "expired"]),
  target: OperationTarget,
  createdAt: Schema.Number,
  expiresAt: Schema.Number,
  updatedAt: Schema.Number,
  result: optional(OperationAcknowledgement),
  reason: optional(Schema.String),
}).annotate({ identifier: "Actions.Operation" })
export interface Operation extends Schema.Schema.Type<typeof Operation> {}

export const ExecuteInput = Schema.Struct({ id: OperationID, input: Schema.Json })
  .annotate({ identifier: "Actions.ExecuteInput" })
export interface ExecuteInput extends Schema.Schema.Type<typeof ExecuteInput> {}
~~~~

## AUT1-X04

```json
{"block_id":"AUT1-X04","type":"literal_source_excerpt","requests":["RE-AUT1-05","RE-AUT1-06"],"source_category":"external_S1_04_raw_source","archive":"external-sources/packages/schema/src/actions/command.ts","repository_path":"packages/schema/src/actions/command.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"763fc67220a5a5962794593062f4705840e7598b","source_sha256":"46722d7902f6005986f3e2c372675e3f9e047e2dbe639e404146f151e1de3d85","source_bytes":5060,"body_anchors":[],"requested_subject":"Payloads tipados e CommandOutput separado do recibo"}
```

```json
{"first_line":1,"last_line":68,"bytes":5060,"sha256":"46722d7902f6005986f3e2c372675e3f9e047e2dbe639e404146f151e1de3d85"}
```

~~~~typescript
import { Schema } from "effect"
import { Operation } from "./operation"
import { OperationID } from "./identity"
import { optional } from "../schema"

const Value = Schema.Union([Schema.String, Schema.Number, Schema.Boolean])
const strict = { onExcessProperty: "error" } as const
const Variables = Schema.Array(Schema.Struct({
  key: Schema.NonEmptyString, value: Schema.String,
  variable_type: optional(Schema.Literals(["env_var", "file"])),
}).annotate({ parseOptions: strict }))

export const GitHubDispatch = Schema.Struct({
  provider: Schema.Literal("github"), ref: Schema.NonEmptyString,
  inputs: optional(Schema.Record(Schema.String, Value)),
}).annotate({ identifier: "Actions.GitHubDispatch", parseOptions: strict })
export const GitLabDispatch = Schema.Struct({
  provider: Schema.Literal("gitlab"), ref: Schema.NonEmptyString,
  variables: optional(Variables), inputs: optional(Schema.Record(Schema.String, Schema.Json)),
}).annotate({ identifier: "Actions.GitLabDispatch", parseOptions: strict })
export const DispatchCommand = Schema.Struct({ id: OperationID, input: Schema.Union([GitHubDispatch, GitLabDispatch]) })
  .annotate({ identifier: "Actions.DispatchCommand", parseOptions: strict })

export const WorkflowStateCommand = Schema.Struct({
  id: OperationID, input: Schema.Struct({ provider: Schema.Literal("github"), enabled: Schema.Boolean }),
}).annotate({ identifier: "Actions.WorkflowStateCommand", parseOptions: strict })
export const RetryCommand = Schema.Struct({ id: OperationID, input: Schema.Union([
  Schema.Struct({ provider: Schema.Literal("github"), mode: Schema.Literals(["all", "failed"]), enableDebugLogging: optional(Schema.Boolean) }),
  Schema.Struct({ provider: Schema.Literal("gitlab"), mode: Schema.Literal("failed") }),
]) }).annotate({ identifier: "Actions.RetryCommand", parseOptions: strict })
export const ProviderCommand = Schema.Struct({ id: OperationID, input: Schema.Struct({ provider: Schema.Literals(["github", "gitlab"]) }) })
  .annotate({ identifier: "Actions.ProviderCommand", parseOptions: strict })
export const GitHubCommand = Schema.Struct({ id: OperationID, input: Schema.Struct({ provider: Schema.Literal("github") }) })
  .annotate({ identifier: "Actions.GitHubCommand", parseOptions: strict })
export const GitLabCommand = Schema.Struct({ id: OperationID, input: Schema.Struct({ provider: Schema.Literal("gitlab") }) })
  .annotate({ identifier: "Actions.GitLabCommand", parseOptions: strict })
export const RenameCommand = Schema.Struct({ id: OperationID, input: Schema.Struct({
  provider: Schema.Literal("gitlab"), name: Schema.NonEmptyString,
}) }).annotate({ identifier: "Actions.RenameCommand", parseOptions: strict })
export const JobRetryCommand = Schema.Struct({ id: OperationID, input: Schema.Union([
  Schema.Struct({ provider: Schema.Literal("github"), enableDebugLogging: optional(Schema.Boolean) }),
  Schema.Struct({ provider: Schema.Literal("gitlab") }),
]) }).annotate({ identifier: "Actions.JobRetryCommand", parseOptions: strict })
export const JobPlayCommand = Schema.Struct({ id: OperationID, input: Schema.Struct({
  provider: Schema.Literal("gitlab"), variables: optional(Variables),
}) }).annotate({ identifier: "Actions.JobPlayCommand", parseOptions: strict })

export const MergeRequestCommand = Schema.Struct({ id: OperationID, input: Schema.Struct({ provider: Schema.Literal("gitlab") }) })
  .annotate({ identifier: "Actions.MergeRequestCommand", parseOptions: strict })
export const TriggerPipelineCommand = Schema.Struct({ id: OperationID, input: Schema.Struct({
  provider: Schema.Literal("gitlab"), ref: Schema.NonEmptyString, token: Schema.NonEmptyString,
  variables: optional(Schema.Record(Schema.String, Schema.String)), inputs: optional(Schema.Record(Schema.String, Schema.Json)),
}) }).annotate({ identifier: "Actions.TriggerPipelineCommand", parseOptions: strict })

// These values are returned only to the owning request, never put in an operation row.
export const CommandOutput = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("runnerToken"), token: Schema.NonEmptyString, expiresAt: optional(Schema.String), runnerID: optional(Schema.String) }),
  Schema.Struct({ kind: Schema.Literal("runnerJit"), encodedConfiguration: Schema.NonEmptyString, runnerID: Schema.NonEmptyString }),
  Schema.Struct({ kind: Schema.Literal("triggerToken"), token: Schema.NonEmptyString, triggerID: Schema.NonEmptyString }),
  Schema.Struct({ kind: Schema.Literal("sourceReview"), id: Schema.NonEmptyString, url: Schema.NonEmptyString }),
]).annotate({ identifier: "Actions.CommandOutput" })
export type CommandOutput = typeof CommandOutput.Type
export const CommandExecution = Schema.Struct({ operation: Operation, output: optional(CommandOutput) })
  .annotate({ identifier: "Actions.CommandExecution" })
export interface CommandExecution extends Schema.Schema.Type<typeof CommandExecution> {}

export const ResourceCommand = Schema.Struct({ id: OperationID, input: Schema.Json })
  .annotate({ identifier: "Actions.ResourceCommand", parseOptions: strict })
~~~~

## AUT1-X05

```json
{"block_id":"AUT1-X05","type":"literal_source_excerpt","requests":["RE-AUT1-02","RE-AUT1-05","RE-AUT1-06"],"source_category":"external_S1_04_raw_source","archive":"external-sources/packages/schema/src/schema.ts","repository_path":"packages/schema/src/schema.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"d19a39b9708cfcaeedc1d7c62503afbadfee5dd7","source_sha256":"a7cdac1ae9d21d9d71a3783a730ca29bc8fbe769d01479a19101a81eec2bb447","source_bytes":1234,"body_anchors":[],"requested_subject":"PositiveInt/optional/statics usados pelos schemas"}
```

```json
{"first_line":1,"last_line":23,"bytes":975,"sha256":"b7a5dba011c29cff7ff8005220b95e21f6cdaf9c31a44139e3e69ecaee85f868"}
```

~~~~typescript
import { DateTime, Option, Schema, SchemaGetter } from "effect"

export const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))
export const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const RelativePath = Schema.String.pipe(Schema.brand("RelativePath"))
export type RelativePath = typeof RelativePath.Type

export const AbsolutePath = Schema.String.pipe(Schema.brand("AbsolutePath"))
export type AbsolutePath = typeof AbsolutePath.Type

export const optional = <S extends Schema.Top>(schema: S) =>
  Schema.optionalKey(schema).pipe(
    Schema.decodeTo(Schema.optional(Schema.toType(schema)), {
      decode: SchemaGetter.passthrough({ strict: false }),
      encode: SchemaGetter.transformOptional(Option.filter((value) => value !== undefined)),
    }),
  )

export const statics =
  <S extends object, M extends Record<string, unknown>>(methods: (schema: S) => M) =>
  (schema: S): S & M =>
    Object.assign(schema, methods(schema))
~~~~

## AUT1-X06

```json
{"block_id":"AUT1-X06","type":"literal_source_excerpt","requests":["RE-AUT1-03","RE-AUT1-04","RE-AUT1-05"],"source_category":"external_S1_04_raw_source","archive":"external-sources/packages/schema/src/actions/workflow.ts","repository_path":"packages/schema/src/actions/workflow.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"a061e32b53f984a7e103e836fdfac97e5f6e98ce","source_sha256":"435abb6cb694c30d00c01bb0c00c8dd9cd821df163fe8c73cb30a4f09ad18321","source_bytes":3925,"body_anchors":[],"requested_subject":"Schemas SourceBase/Source/Graph/ListInput efetivamente usados na validação do Core"}
```

```json
{"first_line":1,"last_line":96,"bytes":3925,"sha256":"435abb6cb694c30d00c01bb0c00c8dd9cd821df163fe8c73cb30a4f09ad18321"}
```

~~~~typescript
import { Schema } from "effect"
import { BindingID } from "./identity"
import { optional, PositiveInt } from "../schema"

export const InputDefinition = Schema.Struct({
  name: Schema.NonEmptyString,
  description: optional(Schema.String),
  type: Schema.Literals(["string", "boolean", "number", "choice", "environment", "file", "array"]),
  required: Schema.Boolean,
  default: optional(Schema.Json),
  options: optional(Schema.Array(Schema.Union([Schema.String, Schema.Boolean, Schema.Number]))),
}).annotate({ identifier: "Actions.InputDefinition" })
export interface InputDefinition extends Schema.Schema.Type<typeof InputDefinition> {}

export const Workflow = Schema.Struct({
  id: Schema.NonEmptyString,
  bindingID: BindingID,
  name: Schema.NullOr(Schema.String),
  path: Schema.String,
  defaultRef: optional(Schema.NonEmptyString),
  state: Schema.String,
  dispatchable: Schema.Boolean,
  dispatchState: optional(Schema.Literals(["available", "unavailable", "unknown"])),
  inputs: optional(Schema.Array(InputDefinition)),
  triggers: optional(Schema.Array(Schema.String)),
  updatedAt: optional(Schema.String),
}).annotate({ identifier: "Actions.Workflow" })
export interface Workflow extends Schema.Schema.Type<typeof Workflow> {}

export const SourceBase = Schema.Struct({
  bindingID: BindingID,
  ref: Schema.NonEmptyString,
  commit: Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i)),
}).annotate({ identifier: "Actions.SourceBase" })
export interface SourceBase extends Schema.Schema.Type<typeof SourceBase> {}

export const Source = Schema.Struct({
  bindingID: BindingID,
  path: Schema.NonEmptyString,
  ref: Schema.NonEmptyString,
  commit: optional(Schema.String),
  version: Schema.NonEmptyString,
  text: Schema.String,
  editable: Schema.Boolean,
  includes: optional(Schema.Array(Schema.String)),
  diagnostics: optional(Schema.Array(Schema.String)),
}).annotate({ identifier: "Actions.Source" })
export interface Source extends Schema.Schema.Type<typeof Source> {}

export const GraphStep = Schema.Struct({
  name: Schema.String,
  uses: optional(Schema.String),
  run: optional(Schema.String),
  condition: optional(Schema.String),
}).annotate({ identifier: "Actions.GraphStep" })
export interface GraphStep extends Schema.Schema.Type<typeof GraphStep> {}

export const GraphJob = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.String,
  needs: Schema.Array(Schema.String),
  stage: optional(Schema.String),
  condition: optional(Schema.String),
  runner: optional(Schema.Json),
  matrix: optional(Schema.Json),
  reusable: optional(Schema.String),
  configuration: optional(Schema.Json),
  steps: Schema.Array(GraphStep),
}).annotate({ identifier: "Actions.GraphJob" })
export interface GraphJob extends Schema.Schema.Type<typeof GraphJob> {}

export const Graph = Schema.Struct({
  source: Source,
  state: Schema.Literals(["complete", "partial", "unresolved"]),
  jobs: Schema.Array(GraphJob),
  diagnostics: Schema.Array(Schema.String),
  triggers: optional(Schema.Json),
  stages: optional(Schema.Array(Schema.String)),
  includes: optional(Schema.Json),
  inputs: optional(Schema.Array(InputDefinition)),
  header: optional(Schema.Json),
}).annotate({ identifier: "Actions.Graph" })
export interface Graph extends Schema.Schema.Type<typeof Graph> {}

export const ListInput = Schema.Struct({
  cursor: optional(Schema.String),
  limit: optional(PositiveInt),
  query: optional(Schema.String),
  state: optional(Schema.String),
}).annotate({ identifier: "Actions.ListInput" })
export interface ListInput extends Schema.Schema.Type<typeof ListInput> {}

export const WorkflowPage = Schema.Struct({
  items: Schema.Array(Workflow), next: optional(Schema.String), total: optional(Schema.Number), capturedAt: Schema.Number,
}).annotate({ identifier: "Actions.WorkflowPage" })
export interface WorkflowPage extends Schema.Schema.Type<typeof WorkflowPage> {}
~~~~

## AUT1-X07

```json
{"block_id":"AUT1-X07","type":"literal_source_excerpt","requests":["RE-AUT1-03"],"source_category":"external_S1_04_raw_source","archive":"external-sources/packages/schema/src/actions/run.ts","repository_path":"packages/schema/src/actions/run.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","source_git_blob_sha":"830d6f13f362e0616160da6219f3eba8a9ab83df","source_sha256":"c91ac0507e4f4f304cea12b4681aea4f658aec6aa7fca9af478e0f38613267f8","source_bytes":3593,"body_anchors":[],"requested_subject":"Schemas Run/Job/RunListInput e paginação efetivamente usados pelos adapters"}
```

```json
{"first_line":1,"last_line":84,"bytes":3593,"sha256":"c91ac0507e4f4f304cea12b4681aea4f658aec6aa7fca9af478e0f38613267f8"}
```

~~~~typescript
import { Schema } from "effect"
import { BindingID } from "./identity"
import { optional, PositiveInt } from "../schema"

export const Run = Schema.Struct({
  id: Schema.NonEmptyString,
  bindingID: BindingID,
  workflowID: Schema.NonEmptyString,
  name: Schema.NullOr(Schema.String),
  title: optional(Schema.String),
  number: optional(PositiveInt),
  ref: Schema.NullOr(Schema.String),
  commit: Schema.String,
  event: Schema.String,
  actor: optional(Schema.String),
  status: Schema.NullOr(Schema.String),
  conclusion: optional(Schema.NullOr(Schema.String)),
  attempt: optional(PositiveInt),
  createdAt: optional(Schema.String),
  startedAt: optional(Schema.String),
  finishedAt: optional(Schema.String),
  updatedAt: optional(Schema.String),
  triggeringActor: optional(Schema.String),
  repositoryID: optional(Schema.String),
  duration: optional(Schema.Number),
  parentID: optional(Schema.String),
  url: optional(Schema.String),
}).annotate({ identifier: "Actions.Run" })
export interface Run extends Schema.Schema.Type<typeof Run> {}

export const Step = Schema.Struct({
  number: Schema.Number,
  name: Schema.String,
  status: Schema.NullOr(Schema.String),
  conclusion: optional(Schema.NullOr(Schema.String)),
  startedAt: optional(Schema.String),
  finishedAt: optional(Schema.String),
}).annotate({ identifier: "Actions.Step" })
export interface Step extends Schema.Schema.Type<typeof Step> {}

export const Job = Schema.Struct({
  id: Schema.NonEmptyString,
  bindingID: BindingID,
  runID: Schema.NonEmptyString,
  name: Schema.String,
  status: Schema.NullOr(Schema.String),
  conclusion: optional(Schema.NullOr(Schema.String)),
  definitionID: optional(Schema.String),
  runner: optional(Schema.String),
  runnerID: optional(Schema.String),
  runnerLabels: optional(Schema.Array(Schema.String)),
  runnerGroupID: optional(Schema.String),
  attempt: optional(PositiveInt),
  startedAt: optional(Schema.String),
  finishedAt: optional(Schema.String),
  downstreamID: optional(Schema.String),
  downstreamProjectID: optional(Schema.String),
  kind: optional(Schema.Literals(["job", "bridge"])),
  stage: optional(Schema.String),
  retried: optional(Schema.Boolean),
  retryOf: optional(Schema.String),
  allowFailure: optional(Schema.Boolean),
  steps: Schema.Array(Step),
}).annotate({ identifier: "Actions.Job" })
export interface Job extends Schema.Schema.Type<typeof Job> {}

export const RunListInput = Schema.Struct({
  workflowID: optional(Schema.String), cursor: optional(Schema.String), limit: optional(PositiveInt),
  ref: optional(Schema.String), event: optional(Schema.String), status: optional(Schema.String),
  commit: optional(Schema.String), actor: optional(Schema.String), created: optional(Schema.String),
  createdAfter: optional(Schema.String), createdBefore: optional(Schema.String),
  updatedAfter: optional(Schema.String), updatedBefore: optional(Schema.String),
}).annotate({ identifier: "Actions.RunListInput" })
export interface RunListInput extends Schema.Schema.Type<typeof RunListInput> {}

export const RunPage = Schema.Struct({
  items: Schema.Array(Run), next: optional(Schema.String), total: optional(Schema.Number), capturedAt: Schema.Number,
}).annotate({ identifier: "Actions.RunPage" })
export interface RunPage extends Schema.Schema.Type<typeof RunPage> {}

export const JobPage = Schema.Struct({
  items: Schema.Array(Job), next: optional(Schema.String), total: optional(Schema.Number), capturedAt: Schema.Number,
}).annotate({ identifier: "Actions.JobPage" })
export interface JobPage extends Schema.Schema.Type<typeof JobPage> {}
~~~~
