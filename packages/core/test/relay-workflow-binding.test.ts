import { describe, expect } from "bun:test"
import path from "node:path"
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { Effect, Layer, Option, Result, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { AtlasKnowledge } from "@orchestra/schema/atlas-knowledge"
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

function packet(id: string, content: string, authorSessionID = SessionID.make("ses_archie")) {
  // This is the host's wire payload in schema order, independent of binding's canonicalization helper.
  const payload = {
    projectID, authorSessionID, assistantMessageID: SessionMessage.ID.make(`msg_${id}`), callID: `call_${id}`,
    memberID: "archie" as const, target: { kind: id === "global" ? "assignment" as const : "work-package" as const, id },
    units: [{ unit: id, name: `Source ${id}`, sourceIdentity: "1".repeat(64), sourceRevision: "revision-one",
      contentHash: "2".repeat(64), receiptHash: "3".repeat(64),
      bodyHash: RelayWorkflowBinding.digest(Buffer.from(content, "utf8")), content }],
  }
  return Schema.decodeUnknownSync(AtlasKnowledge.Anchor)({
    reference: RelayWorkflowBinding.digest(Buffer.from(JSON.stringify(payload), "utf8")), ...payload,
  })
}

const knowledgeFixture = Effect.gen(function* () {
  const f = yield* fixture
  const anchors = [packet("global", "GLOBAL SOURCE"), packet("implement", "IMPLEMENT SOURCE"), packet("review", "FUTURE SOURCE")]
  const graph = yield* AuthoringGraph.project("Knowledge packet", {
    knowledge: [anchors[0].reference],
    macros: [{ id: "build", instructions: "MACRO CONTEXT" }],
    work_packages: [
      { id: "implement", macro: "build", instructions: "Implement approved packet.", self_check: ["Verify work."],
        knowledge: [anchors[0].reference, anchors[1].reference], checklist: [{ id: "impl", cmd: "true" }] },
      { id: "review", kind: "review", instructions: "Cold review packet.",
        knowledge: [anchors[2].reference], checklist: [{ id: "review-check", cmd: "true" }] },
    ],
  })
  const draft = yield* f.store.save({ id: f.draft.id, body: graph })
  yield* f.store.publish(draft.id, draft.versionId)
  const calls: { reference: string; authorSessionID: string }[] = []
  const port: RelayWorkflowBinding.PublicationPort = { ...f.port,
    knowledge: (reference, authorSessionID) => Effect.gen(function* () {
      calls.push({ reference, authorSessionID })
      const anchor = anchors.find((anchor) => anchor.reference === reference)
      if (!anchor) return yield* new RelayWorkflowBinding.Held({ reason: "ATLAS_REFERENCE_UNAVAILABLE" })
      return anchor
    }),
  }
  return { ...f, anchors, calls, port, input: { ...f.input, port, authorSessionID: "ses_archie" } }
})

describe("Atlas publication knowledge binding", () => {
  it.live("resolves only global/all-step union once with trusted author; preserves canonical field order", () => Effect.gen(function* () {
    const f = yield* knowledgeFixture
    const acquired = yield* RelayWorkflowBinding.acquire(f.input)
    expect(acquired.definition.knowledge).toEqual(f.anchors)
    expect(f.calls).toEqual(f.anchors.map((anchor) => ({ reference: anchor.reference, authorSessionID: "ses_archie" })))
    expect(yield* RelayWorkflowBinding.revalidate(f.port, acquired.definition)).toEqual(acquired)
    const reordered: RelayWorkflowBinding.PublicationPort = { ...f.port,
      knowledge: (reference) => Effect.sync(() => {
        const anchor = f.anchors.find((anchor) => anchor.reference === reference) ?? f.anchors[0]
        return Schema.decodeUnknownSync(AtlasKnowledge.Anchor)(Object.fromEntries(Object.entries({ ...anchor,
          target: Object.fromEntries(Object.entries(anchor.target).reverse()),
          units: anchor.units.map((unit) => Object.fromEntries(Object.entries(unit).reverse())),
        }).reverse()))
      }),
    }
    expect((yield* RelayWorkflowBinding.acquire({ ...f.input, port: reordered })).definition).toEqual(acquired.definition)
  }))

  it.live("missing author, resolver and foreign request bindings hold", () => Effect.gen(function* () {
    const f = yield* knowledgeFixture
    expect(yield* reason(RelayWorkflowBinding.acquire({ ...f.input, authorSessionID: undefined })))
      .toBe("WORKFLOW_KNOWLEDGE_AUTHOR_MISSING")
    expect(yield* reason(RelayWorkflowBinding.acquire({ ...f.input, port: { ...f.port, knowledge: undefined } })))
      .toBe("WORKFLOW_KNOWLEDGE_RESOLVER_MISSING")
    expect(yield* reason(RelayWorkflowBinding.acquire({ ...f.input, port: { ...f.port,
      knowledge: () => Effect.fail(new RelayWorkflowBinding.Held({ reason: "ATLAS_REFERENCE_UNAVAILABLE" })),
    } }))).toBe("ATLAS_REFERENCE_UNAVAILABLE")
    const changes = [
      { value: { ...f.anchors[0], projectID: ProjectID.make("foreign-project") }, reason: "WORKFLOW_KNOWLEDGE_PROJECT_MISMATCH" },
      { value: { ...f.anchors[0], authorSessionID: SessionID.make("ses_foreign") }, reason: "WORKFLOW_KNOWLEDGE_AUTHOR_MISMATCH" },
      { value: f.anchors[1], reason: "WORKFLOW_KNOWLEDGE_REFERENCE_MISMATCH" },
      { value: { ...f.anchors[0], unauthorized: true }, reason: "WORKFLOW_KNOWLEDGE_INVALID" },
      { value: { ...f.anchors[0], target: { ...f.anchors[0].target, unauthorized: true } }, reason: "WORKFLOW_KNOWLEDGE_INVALID" },
      { value: { ...f.anchors[0], units: [{ ...f.anchors[0].units[0], unauthorized: true }] }, reason: "WORKFLOW_KNOWLEDGE_INVALID" },
      { value: { ...f.anchors[0], units: [{ ...f.anchors[0].units[0], content: "tampered" }] }, reason: "WORKFLOW_KNOWLEDGE_BODY_MISMATCH" },
      { value: { ...f.anchors[0], units: [f.anchors[0].units[0], f.anchors[0].units[0]] }, reason: "WORKFLOW_KNOWLEDGE_UNIT_DUPLICATE" },
    ]
    for (const change of changes) {
      const port: RelayWorkflowBinding.PublicationPort = { ...f.port,
        knowledge: (reference) => Effect.succeed(reference === f.anchors[0].reference ? change.value
          : f.anchors.find((anchor) => anchor.reference === reference) ?? f.anchors[0]),
      }
      expect(yield* reason(RelayWorkflowBinding.acquire({ ...f.input, port }))).toBe(change.reason)
    }
  }))

  it.live("revalidate refuses exact source, receipt and body drift, including retained-anchor edits", () => Effect.gen(function* () {
    const f = yield* knowledgeFixture
    const acquired = yield* RelayWorkflowBinding.acquire(f.input)
    for (const change of [
      { sourceIdentity: "4".repeat(64) }, { sourceRevision: "revision-two" },
      { contentHash: "5".repeat(64) }, { receiptHash: "6".repeat(64) },
      { content: "different body", bodyHash: RelayWorkflowBinding.digest(Buffer.from("different body")) },
    ]) {
      const changed = { ...f.anchors[0], units: [{ ...f.anchors[0].units[0], ...change }] }
      const port: RelayWorkflowBinding.PublicationPort = { ...f.port,
        knowledge: (reference) => Effect.succeed(reference === changed.reference ? changed
          : f.anchors.find((anchor) => anchor.reference === reference) ?? f.anchors[0]),
      }
      expect(yield* reason(RelayWorkflowBinding.revalidate(port, acquired.definition)))
        .toBe("WORKFLOW_KNOWLEDGE_DIGEST_MISMATCH")
      expect(yield* reason(RelayWorkflowBinding.revalidate(f.port, { ...acquired.definition,
        knowledge: [changed, ...f.anchors.slice(1)] }))).toBe("WORKFLOW_KNOWLEDGE_DRIFT")
    }
    expect(yield* reason(RelayWorkflowBinding.revalidate(f.port, { ...acquired.definition,
      knowledge: [f.anchors[0], { ...f.anchors[1], authorSessionID: SessionID.make("ses_other") }, f.anchors[2]] })))
      .toBe("WORKFLOW_KNOWLEDGE_AUTHOR_MISMATCH")
    expect(yield* reason(RelayWorkflowBinding.revalidate(f.port, { ...acquired.definition, knowledge: undefined })))
      .toBe("WORKFLOW_KNOWLEDGE_AUTHOR_MISSING")
  }))

  it.live("distinct-reference validation and acquired combined UTF-8 content budgets hold", () => Effect.gen(function* () {
    const f = yield* knowledgeFixture
    const anchors = Array.from({ length: 9 }, (_, index) => packet(`unit-${index}`, "body"))
    const invalid = RelayWorkflowBinding.validateKnowledge({ projectID, authorSessionID: "ses_archie", knowledge: anchors,
      sprint: { knowledge: anchors.slice(0, 8).map((anchor) => anchor.reference),
        work_packages: [{ id: "implement", knowledge: [anchors[8].reference] }] },
    })
    expect(invalid).toBeInstanceOf(RelayWorkflowBinding.Held)
    if (!(invalid instanceof RelayWorkflowBinding.Held)) throw new Error("Expected reference-limit HOLD")
    expect(invalid.reason).toBe("WORKFLOW_KNOWLEDGE_REFERENCE_LIMIT")
    expect(f.calls).toEqual([])
    const big = [packet("first", "é".repeat(32768)), packet("second", "é".repeat(32769))]
    const bounded = yield* AuthoringGraph.project("Combined body cap", {
      knowledge: [big[0].reference], work_packages: [{ id: "implement", knowledge: [big[1].reference],
        checklist: [{ id: "ok", cmd: "true" }] }],
    })
    const updated = yield* f.store.save({ id: f.draft.id, body: bounded })
    yield* f.store.publish(updated.id, updated.versionId)
    const port: RelayWorkflowBinding.PublicationPort = { ...f.port,
      knowledge: (reference) => Effect.succeed(big.find((anchor) => anchor.reference === reference) ?? big[0]),
    }
    expect(yield* reason(RelayWorkflowBinding.acquire({ ...f.input, port }))).toBe("WORKFLOW_KNOWLEDGE_CONTENT_LIMIT")
    const exact = [big[0], packet("second", "é".repeat(32768))]
    expect(RelayWorkflowBinding.validateKnowledge({ projectID, authorSessionID: "ses_archie", knowledge: exact,
      sprint: { knowledge: [exact[0].reference], work_packages: [{ id: "implement", knowledge: [exact[1].reference] }] },
    })).toEqual(exact)
  }))

  it.live("a published union over the reference cap holds before any resolver call", () => Effect.gen(function* () {
    const f = yield* knowledgeFixture
    const anchors = Array.from({ length: 9 }, (_, index) => packet(`unit-${index}`, "body"))
    const eight = yield* AuthoringGraph.project("Reference cap", {
      knowledge: anchors.slice(0, 8).map((anchor) => anchor.reference),
      work_packages: [{ id: "implement", knowledge: [anchors[7].reference], checklist: [{ id: "ok", cmd: "true" }] }],
    })
    // The store keeps bodies as given; only the compiler sees the ninth distinct reference.
    const nine = { ...eight, nodes: eight.nodes.map((node) => node.id !== "implement" ? node
      : { ...node, parameters: { ...node.parameters, knowledge: JSON.stringify([anchors[8].reference]) } }) }
    const saved = yield* f.store.save({ id: f.draft.id, body: nine })
    yield* f.store.publish(saved.id, saved.versionId)
    expect(yield* reason(RelayWorkflowBinding.acquire(f.input))).toBe("WORKFLOW_KNOWLEDGE_REFERENCE_LIMIT")
    expect(f.calls).toEqual([])
  }))

  it.live("legacy empty selection retains definition and materialization bytes", () => Effect.gen(function* () {
    const f = yield* fixture
    yield* f.store.publish(f.draft.id, f.draft.versionId)
    const first = yield* RelayWorkflowBinding.acquire(f.input)
    const legacy = '{"work_packages":[{"id":"implement","instructions":"Implement approved packet.","checklist":[{"id":"impl","cmd":"true"}],"title":"","kind":"execute"},{"id":"review","kind":"review","instructions":"Cold review packet.","checklist":[{"id":"review-check","cmd":"true"}],"title":""}],"brief":"","retry_budget":3,"macros":[]}'
    expect(first.bytes.toString("utf8")).toBe(legacy)
    expect(first.definition.materialization).toEqual({ schemaIdentifier: "RelaySprint.Sprint",
      digest: RelayWorkflowBinding.digest(Buffer.from(legacy, "utf8")), byteLength: Buffer.byteLength(legacy, "utf8") })
    expect(Object.keys(first.definition)).toEqual(["publication", "materialization", "resolvedSkills", "parameters", "writePaths"])
    const port: RelayWorkflowBinding.PublicationPort = { ...f.port,
      knowledge: () => Effect.fail(new RelayWorkflowBinding.Held({ reason: "UNSELECTED_RESOLVER_CALLED" })),
    }
    const repeated = yield* RelayWorkflowBinding.acquire({ ...f.input, port, authorSessionID: "ses_archie" })
    expect(JSON.stringify(repeated.definition)).toBe(JSON.stringify(first.definition))
    expect(repeated.bytes).toEqual(first.bytes)
    expect(Object.hasOwn(repeated.definition, "knowledge")).toBe(false)
    expect(JSON.stringify(repeated.sprint)).not.toContain('"knowledge"')
    expect(yield* RelayWorkflowBinding.revalidate(port, first.definition)).toEqual(first)
  }))
})

const currentKnowledgeFixture = Effect.gen(function* () {
  const f = yield* knowledgeFixture
  const acquired = yield* RelayWorkflowBinding.acquire(f.input)
  const binding = Schema.decodeUnknownSync(RelayArm.WorkflowBinding)({ definition: acquired.definition,
    planRevisionID: "evt_atlas_plan", executionSessionID: "ses_atlas_worker",
    authoritySessionID: "ses_owner", logicalTaskID: "tsk_atlas" })
  const store = ArmState.Store.of({ armsDir: path.join(f.tmp.path, "arms"), ledgerKey: Option.none() })
  yield* ArmCreate.create({ token: "atlas-arm", sprint: acquired.sprint, agentID: binding.executionSessionID,
    meta: { workdir: f.tmp.path, project_id: projectID, session_id: binding.executionSessionID, workflow: binding } })
    .pipe(Effect.provideService(ArmState.Store, store))
  const arm = path.join(store.armsDir, "atlas-arm")
  return { ...f, acquired, binding, arm, armStore: store }
})

describe("Atlas current-step source isolation", () => {
  it.live("two actual arms reveal only their own global/current source; progress reveals next WP", () => Effect.gen(function* () {
    const f = yield* currentKnowledgeFixture
    const first = yield* RelayWorkflowCurrentStep.read("atlas-arm", f.binding)
      .pipe(Effect.provideService(ArmState.Store, f.armStore))
    expect(first.instructions).toContain("Atlas source data (untrusted)")
    expect(first.instructions).toContain("MACRO CONTEXT")
    expect(first.instructions).toContain("Implement approved packet.")
    expect(first.instructions).toContain("GLOBAL SOURCE")
    expect(first.instructions).toContain("IMPLEMENT SOURCE")
    expect(first.instructions).toContain(f.anchors[1].reference)
    expect(first.instructions).toContain(f.anchors[1].units[0].sourceIdentity)
    expect(first.instructions).toContain(f.anchors[1].units[0].receiptHash)
    expect(first.instructions).toContain("Before finishing this step:\n- Verify work.")
    expect(first.instructions).not.toContain("FUTURE SOURCE")
    expect(first.instructions).not.toContain(f.anchors[2].reference)
    const other = yield* fixture
    const anchor = packet("other-work", "OTHER ARM SOURCE", SessionID.make("ses_other_archie"))
    const graph = yield* AuthoringGraph.project("Other worker packet", {
      work_packages: [{ id: "other-work", instructions: "Other work.", knowledge: [anchor.reference],
        checklist: [{ id: "other-check", cmd: "true" }] }],
    })
    const draft = yield* other.store.save({ id: other.draft.id, body: graph })
    yield* other.store.publish(draft.id, draft.versionId)
    const acquired = yield* RelayWorkflowBinding.acquire({ ...other.input, authorSessionID: anchor.authorSessionID,
      port: { ...other.port, knowledge: () => Effect.succeed(anchor) } })
    const binding: RelayArm.WorkflowBinding = { ...f.binding, definition: acquired.definition,
      executionSessionID: SessionID.make("ses_other_worker"), logicalTaskID: "tsk_other" }
    yield* ArmCreate.create({ token: "other-arm", sprint: acquired.sprint, agentID: binding.executionSessionID,
      meta: { workdir: other.tmp.path, project_id: projectID, session_id: binding.executionSessionID, workflow: binding } })
      .pipe(Effect.provideService(ArmState.Store, f.armStore))
    const second = yield* RelayWorkflowCurrentStep.read("other-arm", binding)
      .pipe(Effect.provideService(ArmState.Store, f.armStore))
    expect(second.instructions).toContain("OTHER ARM SOURCE")
    expect(second.instructions).not.toContain("GLOBAL SOURCE")
    expect(second.instructions).not.toContain("IMPLEMENT SOURCE")
    expect(first.instructions).not.toContain("OTHER ARM SOURCE")
    expect(yield* reason(RelayWorkflowCurrentStep.read("other-arm", f.binding)
      .pipe(Effect.provideService(ArmState.Store, f.armStore)))).toBe("WORKFLOW_ARM_BINDING_MISMATCH")
    // Only fixture advances position; the view never becomes a cursor writer.
    yield* Effect.sync(() => writeFileSync(path.join(f.arm, RelayArm.Files.position), "review"))
    const snapshot = () => Object.fromEntries(readdirSync(f.arm).sort()
      .map((file) => [file, readFileSync(path.join(f.arm, file), "utf8")]))
    const before = yield* Effect.sync(snapshot)
    const next = yield* RelayWorkflowCurrentStep.read("atlas-arm", f.binding)
      .pipe(Effect.provideService(ArmState.Store, f.armStore))
    expect(next.wp).toBe("review")
    expect(next.instructions).toContain("GLOBAL SOURCE")
    expect(next.instructions).toContain("FUTURE SOURCE")
    expect(next.instructions).not.toContain("IMPLEMENT SOURCE")
    expect(yield* Effect.sync(snapshot)).toEqual(before)
  }))

  it.live("missing, foreign and body-corrupt retained bindings hold rather than dropping source", () => Effect.gen(function* () {
    const f = yield* currentKnowledgeFixture
    const changes = [
      { knowledge: undefined, reason: "WORKFLOW_KNOWLEDGE_BINDING_MISSING" },
      { knowledge: f.anchors.slice(0, 2), reason: "WORKFLOW_KNOWLEDGE_REFERENCE_MISMATCH" },
      { knowledge: [packet("foreign", "FOREIGN SOURCE"), ...f.anchors.slice(1)], reason: "WORKFLOW_KNOWLEDGE_REFERENCE_MISMATCH" },
      { knowledge: [{ ...f.anchors[0], projectID: ProjectID.make("foreign-project") }, ...f.anchors.slice(1)],
        reason: "WORKFLOW_KNOWLEDGE_PROJECT_MISMATCH" },
      { knowledge: [{ ...f.anchors[0], units: [{ ...f.anchors[0].units[0], content: "CORRUPT BODY" }] }, ...f.anchors.slice(1)],
        reason: "WORKFLOW_KNOWLEDGE_BODY_MISMATCH" },
    ]
    for (const change of changes) {
      const binding = { ...f.binding, definition: { ...f.binding.definition, knowledge: change.knowledge } }
      yield* Effect.sync(() => {
        const file = path.join(f.arm, RelayArm.Files.meta)
        const meta = Schema.decodeUnknownSync(RelayArm.Meta)(JSON.parse(readFileSync(file, "utf8")))
        writeFileSync(file, JSON.stringify({ ...meta, workflow: binding }))
      })
      expect(yield* reason(RelayWorkflowCurrentStep.read("atlas-arm", binding)
        .pipe(Effect.provideService(ArmState.Store, f.armStore)))).toBe(change.reason)
    }
  }))
})

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
    expect(first.instructions).toBe("Implement approved packet.")
    expect(Object.keys(first)).toEqual(["position", "attempt", "ledgerSeq", "state", "index", "wp", "pending", "instructions"])
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
