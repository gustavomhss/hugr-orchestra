import { describe, expect } from "bun:test"
import path from "node:path"
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { Effect, Layer, Option, Result, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { Event } from "@orchestra/schema/event"
import { ProjectID } from "@orchestra/schema/project-id"
import { SessionID } from "@orchestra/schema/session-id"
import { SessionMessage } from "@orchestra/schema/session-message"
import { AuthoringStore } from "@orchestra/relay/authoring/store"
import { AuthoringGraph } from "@orchestra/relay/authoring/graph"
import { ArmCreate } from "@orchestra/relay/arm/create"
import { ArmState } from "@orchestra/relay/arm/state"
import { RelayWorkflowBinding } from "../src/relay-workflow-binding"
import { RelayWorkflowCurrentStep } from "../src/relay-workflow-currentstep"
import { RelayWorkflowTransition } from "../src/relay-workflow-transition"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { run } from "../../relay/test/arm-harness"

// Prepared for the single integrated batch. Real store/compiler/arm files; no mocked evaluator or duplicate logic.
const it = testEffect(Layer.empty)
const projectID = ProjectID.make("workflow-project")
const fixture = Effect.gen(function* () {
  const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
  const store = yield* AuthoringStore.open(tmp.path, projectID)
  const graph = yield* AuthoringGraph.project("Progressive packet", {
    work_packages: [
      { id: "implement", instructions: "Implement approved packet.", checklist: [{ id: "impl", cmd: "true" }] },
      { id: "review", kind: "review", instructions: "Cold review packet.", checklist: [{ id: "review-check", cmd: "true" }] },
    ],
  })
  const draft = yield* store.save({ body: graph })
  const port: RelayWorkflowBinding.PublicationPort = {
    projectID, use: (read) => read(store),
    skills: () => Effect.fail(new AuthoringGraph.Refusal({ status: 404, code: "skill-unavailable", message: "No skill selected" })),
  }
  const input = { port, projectID, documentID: draft.id, parameters: { target: "src" }, writePaths: ["src"] }
  return { tmp, store, draft, port, input }
})

function reason<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(Effect.result, Effect.map((result) => {
    if (Result.isSuccess(result)) throw new Error("Expected a named HOLD, received success")
    expect(result.failure).toBeInstanceOf(RelayWorkflowBinding.Held)
    if (!(result.failure instanceof RelayWorkflowBinding.Held)) throw new Error("Expected named HOLD")
    return result.failure.reason
  }))
}

describe("host-acquired publication binding", () => {
  it.live("saved immutable flags do not establish publication; live publish does", () => Effect.gen(function* () {
    const f = yield* fixture
    expect(yield* reason(RelayWorkflowBinding.acquire(f.input))).toBe("WORKFLOW_PUBLICATION_UNPUBLISHED")
    const live = yield* f.store.publish(f.draft.id, f.draft.versionId)
    const acquired = yield* RelayWorkflowBinding.acquire(f.input)
    if (!live.activeVersionId) throw new Error("Published fixture has no active version")
    const version = yield* f.store.version(live.id, live.activeVersionId)
    if (!version) throw new Error("Published fixture's active version is missing")
    expect(version.active).toBe(false)
    expect(acquired.definition.publication).toEqual({ projectID, documentID: live.id,
      activeVersionID: live.activeVersionId, immutableVersionBodyChecksum: AuthoringStore.checksum(version),
      livePublicationChecksum: AuthoringStore.checksum(live) })
    expect(acquired.definition.materialization.digest).toBe(RelayWorkflowBinding.digest(acquired.bytes))
    expect(acquired.definition.materialization.byteLength).toBe(acquired.bytes.length)
  }))

  it.live("changed active pointer and unpublish invalidate retained binding", () => Effect.gen(function* () {
    const f = yield* fixture
    yield* f.store.publish(f.draft.id, f.draft.versionId)
    const acquired = yield* RelayWorkflowBinding.acquire(f.input)
    const changed = yield* f.store.save({ id: f.draft.id, body: { name: "Revised packet" } })
    yield* f.store.publish(changed.id, changed.versionId)
    expect(yield* reason(RelayWorkflowBinding.revalidate(f.port, acquired.definition))).toBe("WORKFLOW_PUBLICATION_DRIFT")
    yield* f.store.unpublish(changed.id)
    expect(yield* reason(RelayWorkflowBinding.revalidate(f.port, acquired.definition))).toBe("WORKFLOW_PUBLICATION_UNPUBLISHED")
  }))

  it.live("wrong project, immutable checksum and native bytes never inherit identity", () => Effect.gen(function* () {
    const f = yield* fixture
    yield* f.store.publish(f.draft.id, f.draft.versionId)
    const acquired = yield* RelayWorkflowBinding.acquire(f.input)
    expect(yield* reason(RelayWorkflowBinding.acquire({ ...f.input, projectID: ProjectID.make("foreign-project") })))
      .toBe("WORKFLOW_PUBLICATION_PROJECT_MISMATCH")
    expect(yield* reason(RelayWorkflowBinding.revalidate(f.port, { ...acquired.definition,
      publication: { ...acquired.definition.publication, immutableVersionBodyChecksum: "0".repeat(64) } })))
      .toBe("WORKFLOW_PUBLICATION_DRIFT")
    expect(yield* reason(RelayWorkflowBinding.revalidate(f.port, { ...acquired.definition,
      materialization: { ...acquired.definition.materialization, digest: "0".repeat(64) } })))
      .toBe("WORKFLOW_MATERIALIZATION_DRIFT")
  }))

  it.live("resolved skill bytes are frozen separately from immutable graph", () => Effect.gen(function* () {
    const f = yield* fixture
    const file = path.join(f.tmp.path, "skill.txt")
    yield* Effect.sync(() => writeFileSync(file, "Skill version one"))
    const graph = yield* f.store.get(f.draft.id)
    const changed = yield* f.store.save({ id: graph.id, body: {
      nodes: graph.nodes.map((node) => node.id !== "implement" ? node
        : { ...node, parameters: { ...node.parameters, skill: "implementation" } }),
    } })
    yield* f.store.publish(changed.id, changed.versionId)
    const port: RelayWorkflowBinding.PublicationPort = { ...f.port,
      skills: (name) => Effect.sync(() => {
        const content = readFileSync(file, "utf8")
        return { id: name, content, sha256: RelayWorkflowBinding.digest(Buffer.from(content)) }
      }),
    }
    const acquired = yield* RelayWorkflowBinding.acquire({ ...f.input, port })
    expect(acquired.definition.resolvedSkills[0]?.content).toBe("Skill version one")
    yield* Effect.sync(() => writeFileSync(file, "Skill version two"))
    expect(yield* reason(RelayWorkflowBinding.revalidate(port, acquired.definition))).toBe("WORKFLOW_SKILL_DRIFT")
  }))
})

describe("pure current step and guarded transition seam", () => {
  it.live("resume redelivers exact current instructions without changing arm files", () => Effect.gen(function* () {
    const f = yield* fixture
    yield* f.store.publish(f.draft.id, f.draft.versionId)
    const acquired = yield* RelayWorkflowBinding.acquire(f.input)
    const binding = Schema.decodeUnknownSync(RelayArm.WorkflowBinding)({ definition: acquired.definition,
      planRevisionID: Event.ID.make("evt_existing_plan"), executionSessionID: SessionID.make("ses_worker"),
      authoritySessionID: SessionID.make("ses_owner"), logicalTaskID: "tsk_product_packet" })
    const store = ArmState.Store.of({ armsDir: path.join(f.tmp.path, "arms"), ledgerKey: Option.none() })
    yield* ArmCreate.create({ token: "native-arm", sprint: acquired.sprint, agentID: binding.executionSessionID,
      meta: { workdir: f.tmp.path, project_id: projectID, session_id: binding.executionSessionID, workflow: binding } })
      .pipe(Effect.provideService(ArmState.Store, store))
    const arm = path.join(store.armsDir, "native-arm")
    const snapshot = () => Object.fromEntries(readdirSync(arm).sort().map((file) => [file, readFileSync(path.join(arm, file), "utf8")]))
    const before = yield* Effect.sync(snapshot)
    const first = yield* RelayWorkflowCurrentStep.read("native-arm", binding).pipe(Effect.provideService(ArmState.Store, store))
    const repeated = yield* RelayWorkflowCurrentStep.read("native-arm", binding).pipe(Effect.provideService(ArmState.Store, store))
    expect(first).toEqual(repeated)
    expect(first.instructions).toContain("Implement approved packet.")
    expect(first.position).toBe("implement")
    expect(first.attempt).toBe(0)
    expect(yield* Effect.sync(snapshot)).toEqual(before)
    const pending = { binding, settlement: { assistantMessageID: SessionMessage.ID.make("msg_existing_assistant"),
      expected: { position: first.position, attempt: first.attempt, ledgerSeq: first.ledgerSeq } }, phase: "pending" as const }
    yield* Effect.sync(() => writeFileSync(path.join(arm, "workflow_pending.json"), JSON.stringify(pending)))
    const fenced = yield* Effect.sync(snapshot)
    const resumable = yield* RelayWorkflowCurrentStep.read("native-arm", binding).pipe(Effect.provideService(ArmState.Store, store))
    expect(resumable.pending).toEqual(pending)
    expect(resumable.position).toBe(first.position)
    expect(resumable.attempt).toBe(first.attempt)
    expect(resumable.ledgerSeq).toBe(first.ledgerSeq)
    expect(yield* Effect.sync(snapshot)).toEqual(fenced)
    expect(yield* Effect.promise(() => run(
      { dir: f.tmp.path, arms: store.armsDir, arm, work: f.tmp.path, home: f.tmp.path,
        transcript: path.join(f.tmp.path, "transcript.jsonl") },
      reason(RelayWorkflowTransition.transition({ token: "native-arm", binding,
        settlement: { assistantMessageID: SessionMessage.ID.make("msg_existing_assistant"), expected: first },
        revalidate: () => RelayWorkflowBinding.revalidate(f.port, acquired.definition).pipe(Effect.asVoid),
      }).pipe(Effect.provideService(ArmState.Store, store))),
    ))).toBe("WORKFLOW_SETTLEMENT_UNBOUND")
    expect(yield* Effect.sync(snapshot)).toEqual(fenced)
    yield* Effect.sync(() => writeFileSync(path.join(arm, "sprint.json"), JSON.stringify({ ...acquired.sprint, brief: "Tampered" })))
    expect(yield* reason(RelayWorkflowCurrentStep.read("native-arm", binding).pipe(Effect.provideService(ArmState.Store, store))))
      .toBe("WORKFLOW_MATERIALIZATION_DRIFT")
  }))
})
