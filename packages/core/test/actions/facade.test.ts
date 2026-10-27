import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import path from "node:path"
import type { Interface } from "../../src/actions"
import type { ActionsError } from "../../src/actions/error"
import { ActionsOperationTable } from "../../src/actions/operations/sql"
import { Omni } from "../../src/omni"
import { expectSpawn } from "../fixture/omni-expect"
import { fault } from "./operations-fixture"
import { fixture, github, githubPath, gitlab, intent, it, jobID, runID } from "./assembly-fixture"

it.live("non-Git Actions constructor boots without Git or provider CLI; requested methods fail by name", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const f = yield* fixture({ git: false })
    const before = Omni.snapshot().spawns
    const defaults = yield* f.open({ transport: undefined })
    expect(Omni.snapshot().spawns).toBe(before)
    expect(yield* f.fs.readFileString(path.join(f.directory, githubPath))).toBe(f.text.github)
    expect(yield* f.database.db.select().from(ActionsOperationTable).all()).toEqual([])
    yield* fault(defaults.bindings.list(), "not_found")
    expect(Omni.snapshot().spawns).toBe(before + 1)
    const missing = { id: Actions.BindingID.make("ab_missing"), revision: 1 }
    yield* Effect.forEach(
      methods(
        f.api,
        missing,
        {
          clientID: "non-git",
          binding: missing,
          kind: "workflow.dispatch",
          target: {},
        },
        Actions.OperationID.make("aop_missing"),
      ),
      (effect) => fault(effect, "not_found"),
    )
    expect(f.resolutions).toEqual([])
    expect(f.requests).toEqual([])
  }),
)

it.live("facade binding CRUD persists actual store and requires expected revision before resolver I/O", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const f = yield* fixture()
    expect(yield* f.api.bindings.list()).toEqual([])
    const binding = yield* f.create()
    expect(yield* f.api.bindings.get(binding)).toEqual(binding)
    expect(Schema.is(Actions.Binding)(binding)).toBe(true)
    yield* fault(
      f.api.bindings.update(binding.id, { remote: "origin", provider: github, projectPath: "acme/widgets" }),
      "binding_stale",
    )
    expect(f.resolutions).toHaveLength(1)
    const updated = yield* f.api.bindings.update(binding.id, {
      remote: "origin",
      provider: github,
      projectPath: "acme/widgets",
      expectedRevision: binding.revision,
    })
    expect(updated).toMatchObject({ id: binding.id, revision: 2, projectID: "1234" })
    const disk = yield* f.fs.readFileString(f.file(updated))
    const reopened = yield* f.open()
    expect(yield* reopened.bindings.list()).toEqual([updated])
    yield* Effect.forEach(
      [
        f.api.bindings.get(binding),
        f.api.bindings.remove(binding),
        f.api.bindings.update(binding.id, {
          remote: "origin",
          provider: github,
          projectPath: "acme/widgets",
          expectedRevision: 1,
        }),
      ],
      (effect) => fault(effect, "binding_stale"),
    )
    expect(f.resolutions).toHaveLength(2)
    expect(yield* f.fs.readFileString(f.file(updated))).toBe(disk)
    yield* reopened.bindings.remove(updated)
    expect(yield* f.api.bindings.list()).toEqual([])
    expect(yield* f.fs.readJson(f.file(updated))).toEqual({ version: 1, records: [] })
    yield* fault(f.api.bindings.get(updated), "binding_missing")
  }),
)

it.live(
  "constructor snapshots Directory, Project, workspace, data root and transport; native clone cannot retarget it",
  () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const f = yield* fixture()
      const clone = yield* f.clone()
      const otherData = path.join(f.root, "other-data")
      yield* f.fs.makeDirectory(otherData)
      Object.assign(f.options, {
        directory: clone,
        projectID: "other-project",
        stateDirectory: otherData,
        workspaceID: "other-workspace",
        transport: {
          ...f.transport,
          resolve: () => Effect.die("Retargeted resolver"),
          request: () => Effect.die("Retargeted provider"),
        },
      })
      const provider = { ...github }
      const binding = yield* f.api.bindings.create({ remote: "origin", provider, projectPath: "acme/widgets" })
      Object.assign(provider, { hostname: "other.example", apiOrigin: "https://other.example", kind: "gitlab" })
      expect(binding).toMatchObject({ directory: f.directory, workspaceID: "workspace-original", provider: github })
      const original = yield* f.open()
      expect(yield* original.bindings.get(binding)).toEqual(binding)
      expect(yield* f.fs.readJson(f.file(binding))).toEqual({ version: 1, records: [{ binding, policy: {} }] })
      const other = yield* f.open({
        directory: clone,
        projectID: "other-project",
        stateDirectory: otherData,
        workspaceID: "other-workspace",
      })
      expect(yield* other.bindings.list()).toEqual([])
      const receipt = yield* f.api.prepare(binding, intent(binding, f.commit))
      const stored = yield* f.database.db.select().from(ActionsOperationTable).get()
      expect(stored).toMatchObject({
        id: receipt.id,
        project_id: "core-project",
        directory: f.directory,
        workspace_id: "workspace-original",
        provider_kind: "github",
        provider_hostname: "github.com",
        provider_project_id: "1234",
      })
      const source = yield* f.api.source(binding, { path: githubPath, ref: "main" })
      expect(source).toMatchObject({ commit: f.commit, version: f.blobs.github, text: f.text.github })
      expect(
        f.requests.every((call) => call.binding.directory === f.directory && call.binding.provider.kind === "github"),
      ).toBe(true)
    }),
)

it.live("stale revisions and foreign Locations fail reads/get/prepare/reconcile before provider I/O or admission", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const f = yield* fixture()
    const binding = yield* f.create()
    const command = intent(binding, f.commit)
    const prepared = yield* f.api.prepare(binding, command)
    const updated = yield* f.api.bindings.update(binding.id, {
      remote: "origin",
      provider: github,
      projectPath: "acme/widgets",
      expectedRevision: 1,
    })
    const before = yield* f.database.db.select().from(ActionsOperationTable).all()
    yield* Effect.forEach(methods(f.api, binding, command, prepared.id), (effect) => fault(effect, "binding_stale"))
    yield* fault(f.api.operation(updated, prepared.id), "binding_stale")
    yield* fault(f.api.reconcile(updated, prepared.id), "binding_stale")
    yield* fault(f.api.prepare(updated, command), "binding_stale")
    const clone = yield* f.clone()
    yield* Effect.forEach(
      [{ directory: clone }, { projectID: "other-project" }, { workspaceID: "other-workspace" }],
      (override) =>
        Effect.gen(function* () {
          const other = yield* f.open(override)
          expect(yield* other.bindings.list()).toEqual([])
          yield* Effect.forEach(methods(other, updated, command, prepared.id), (effect) =>
            fault(effect, "binding_missing"),
          )
        }),
    )
    const other = yield* f.open({ directory: clone })
    const foreign = yield* other.bindings.create({ remote: "origin", provider: github, projectPath: "acme/widgets" })
    yield* fault(f.api.prepare(updated, intent(foreign, f.commit)), "binding_stale")
    yield* fault(other.prepare(foreign, intent(updated, f.commit)), "binding_stale")
    expect(yield* f.database.db.select().from(ActionsOperationTable).all()).toEqual(before)
    expect(f.requests).toEqual([])
    // Positive control: the same transport and current persisted binding can perform a real reader lookup.
    expect((yield* f.api.run(updated, runID)).id).toBe(runID)
    expect(f.requests.map((call) => call.input.path)).toEqual([
      "repositories/1234",
      `repositories/1234/actions/runs/${runID}`,
    ])
  }),
)
Array.of(github, gitlab).forEach((provider) => {
  it.live(`facade selects ${provider.kind} readers and preserves native nullable metadata and large string IDs`, () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const f = yield* fixture()
      const binding = yield* f.create(provider)
      const workflows = yield* f.api.workflows(binding, {})
      expect(Schema.is(Actions.WorkflowPage)(workflows)).toBe(true)
      expect(workflows.items[0]).toMatchObject({
        name: null,
        bindingID: binding.id,
        dispatchable: false,
        dispatchState: "unknown",
      })
      expect(workflows.items[0]?.id).toBe(provider.kind === "github" ? "42" : "gitlab:project:5678:pipeline")
      const runs = yield* f.api.runs(binding, {})
      expect(Schema.is(Actions.RunPage)(runs)).toBe(true)
      expect(runs.items[0]).toMatchObject({ id: runID, name: null, ref: null, status: null, commit: f.commit })
      const run = yield* f.api.run(binding, runID)
      expect(Schema.is(Actions.Run)(run)).toBe(true)
      expect(run).toMatchObject({ id: runID, repositoryID: provider.kind === "github" ? "1234" : "5678" })
      const jobs = yield* f.api.jobs(binding, { runID })
      expect(Schema.is(Actions.JobPage)(jobs)).toBe(true)
      expect(jobs.items[0]).toMatchObject({ id: jobID, runID, status: null, kind: "job" })
      expect(jobs.items[0]?.definitionID).toBeUndefined()
      if (provider.kind === "github") {
        expect(jobs.items[0]).toMatchObject({
          attempt: 4,
          runnerID: "0",
          conclusion: null,
          steps: [{ number: 1, name: "Compile", status: null, conclusion: null }],
        })
      }
      if (provider.kind === "gitlab") {
        expect(jobs.items[0]).toMatchObject({ stage: "build", retried: true, allowFailure: false, steps: [] })
        const bridges = yield* f.api.jobs(binding, { runID, cursor: jobs.next })
        expect(bridges.items[0]).toMatchObject({
          kind: "bridge",
          downstreamID: "9007199254740993999",
          downstreamProjectID: "6789",
        })
      }
      const capabilities = yield* f.api.capabilities(binding)
      expect(capabilities.some((item) => item.state === "available")).toBe(true)
      const graph = yield* f.api.graph(binding, {
        path: provider.kind === "github" ? githubPath : ".gitlab-ci.yml",
        ref: "main",
      })
      expect(Schema.is(Actions.Graph)(graph)).toBe(true)
      expect(graph.source).toMatchObject({ commit: f.commit, text: f.text[provider.kind], editable: false })
      expect(graph.jobs.map((job) => ({ id: job.id, needs: job.needs }))).toEqual([
        { id: "build", needs: [] },
        { id: "test", needs: ["build"] },
      ])
      expect(graph.state).toBe(provider.kind === "github" ? "complete" : "partial")
      expect(
        f.requests.every((call) => call.binding.provider.kind === provider.kind && call.input.method === "GET"),
      ).toBe(true)
      expect(f.requests.map((call) => call.input.path)).toContain(
        provider.kind === "github" ? "repositories/1234/actions/runs" : "projects/5678/pipelines",
      )
    }),
  )
})

it.live("facade graph passes authoritative source through actual bounded YAML parser", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const text = `on: workflow_dispatch\nanchor: &x {}\naliases: [${Array.from({ length: 101 }, () => "*x").join(", ")}]\njobs: {build: {runs-on: ubuntu-latest, steps: []}}\n`
    const f = yield* fixture({ githubText: text })
    const binding = yield* f.create()
    const graph = yield* f.api.graph(binding, { path: githubPath, ref: "main" })
    expect(graph.source).toMatchObject({ text, commit: f.commit, version: f.blobs.github })
    expect(graph.state).toBe("unresolved")
    expect(graph.jobs).toEqual([])
    expect(graph.diagnostics).toContain("source_unresolved:alias_limit:maximum 100 aliases")
  }),
)

function methods(
  api: Interface,
  ref: Actions.BindingRef,
  command: Actions.OperationIntent,
  id: Actions.OperationID,
): Effect.Effect<unknown, ActionsError>[] {
  return [
    api.bindings.get(ref),
    api.capabilities(ref),
    api.workflows(ref, {}),
    api.source(ref, { path: githubPath, ref: "main" }),
    api.graph(ref, { path: githubPath, ref: "main" }),
    api.runs(ref, {}),
    api.run(ref, runID),
    api.jobs(ref, { runID }),
    api.prepare(ref, command),
    api.operation(ref, id),
    api.reconcile(ref, id),
  ]
}
