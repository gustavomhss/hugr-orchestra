import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { Schema } from "effect"
import { MaestroContext } from "@opencode-ai/schema/maestro-context"
import { publishTerritoryCatalog, verifyHostContext } from "@opencode-ai/atlas-boundary"
import type { VerifiedHostContext, VerifiedOwnUnit } from "@opencode-ai/atlas-boundary"
import { materializeStaticOwnSnapshot, parseOwnSnapshot } from "@opencode-ai/atlas-boundary/materialize"
import { compileContextToolPlan } from "../../src/maestro/context-tool-plan"

const unitIds = ["crates/billing", "services/billing", "crates/billing/invoices"] as const
const sourceRevision = "a".repeat(40)
const blob = "b".repeat(40)
const manifest = [
  {
    kind: "knowledge",
    name: "billing-rules",
    digest: "digest:rules",
    pull: "atlas pull billing-rules --exact",
    hits: 2,
  },
]

function fixture() {
  const snapshotContent = JSON.stringify({
    schemaVersion: 1,
    snapshot: "snapshot:billing-v1",
    sourceRevision,
    units: unitIds.map((id, index) => ({
      unit: { id, level: "module", grounding: { source: "tree" } },
      sourceBlobs: { [`${id}/index.ts`]: blob },
      pack: {
        unit: id,
        invariants: [
          {
            nodeId: String(index + 1).repeat(64),
            tier: "T1",
            claim: "Billing amounts use exact integers.",
            freshness: "FRESH",
          },
        ],
        shape: { contents: [], owner: "backend", tier: "T1" },
        edges: { dependents: [], dependencies: [] },
        gotchas: [],
        memory: null,
        drill: {
          finer: index === 0 ? [{ id: unitIds[2], level: "module", grounding: { source: "tree" } }] : [],
          refresh: { pull: "refresh billing" },
          complement: { pull: "complement billing" },
        },
        grounding: { source: "tree" },
        tokenEstimate: 300,
        manifest: { pointers: manifest, truncated: false },
        pullReachable: [],
        advisory: [],
        advisoryDropped: 0,
      },
    })),
  })
  const snapshot = parseOwnSnapshot(snapshotContent)
  if (!snapshot) throw new Error("Canonical offline fixture rejected")
  const materialized = materializeStaticOwnSnapshot(snapshot)
  const verified = verifyHostContext({
    projectId: "p1",
    catalog: publishTerritoryCatalog("p1", [
      { name: "finance", owner: "backend", tier: "T1", globs: ["crates/**"] },
      { name: "platform", owner: "maestro", tier: "T0", globs: ["services/**"] },
    ]),
    snapshotContent,
    files: [...materialized.skills, materialized.coverage],
    currentBlobs: Object.fromEntries(unitIds.map((unit) => [`${unit}/index.ts`, blob])),
  })
  if (verified.status !== "READY") throw new Error(JSON.stringify(verified))
  return {
    actor: { memberId: "backend", projectId: "p1", sessionId: "s1" },
    revision: { id: "r1", hash: "c".repeat(64), projectId: "p1", sessionId: "s1" },
    territories: ["platform", "finance"],
    units: unitIds.slice(0, 2),
    context: verified.context,
  }
}

type Input = Parameters<typeof compileContextToolPlan>[0]

function changeUnit(input: Input, change: (unit: VerifiedOwnUnit) => VerifiedOwnUnit): Input {
  return {
    ...input,
    context: {
      ...input.context,
      units: input.context.units.map((unit) => (unit.unit === unitIds[0] ? change(unit) : unit)),
    },
  }
}

function ready(input: Input) {
  const result = compileContextToolPlan(input)
  expect(result.status).toBe("READY")
  if (result.status !== "READY") throw new Error(JSON.stringify(result))
  return result.plan
}

function held(input: Input, reason: string) {
  const result = compileContextToolPlan(input)
  expect(result.status).toBe("HOLD")
  if (result.status !== "HOLD") throw new Error("Unexpected READY")
  expect(result.reason).toBe(reason)
  expect(result.evidence.length).toBeGreaterThan(0)
  return result
}

describe("ContextToolPlan canonical offline boundary", () => {
  test("unselected drill target cannot introduce guessed skill identity", () => {
    const input = fixture()
    const context = {
      ...input.context,
      units: input.context.units.map((unit) =>
        unit.unit === unitIds[2] ? { ...unit, skillName: "own_billing" } : unit,
      ),
    }
    held(
      changeUnit({ ...input, context }, (unit) => ({
        ...unit,
        pointers: [{ kind: "drill", name: "own_billing", digest: "drill", pull: "load exact", hits: 1 }],
      })),
      "drill-unit-unavailable",
    )
  })
  test("pointer projection survives durable public-schema round trip", () => {
    const input = changeUnit(fixture(), (unit) => ({
      ...unit,
      pointers: unit.pointers.map((pointer) => ({ ...pointer, note: "not part of protocol" })),
    }))
    const plan = ready(input)
    expect(Schema.decodeUnknownSync(MaestroContext.ToolPlan)(plan)).toEqual(plan)
    expect(Object.keys(plan.pointers[0]?.manifest[0] ?? {}).sort()).toEqual(["digest", "hits", "kind", "name", "pull"])
  })
  test("OCE-1/3/4: exact ordered load-skill actions, distinct same-leaf units, byte-identical retry", () => {
    const input = fixture()
    const plan = ready(input)
    expect(Object.keys(plan).sort()).toEqual([
      "actions",
      "actor",
      "actorBytes",
      "catalogVersion",
      "hash",
      "headSnapshot",
      "planRevision",
      "pointers",
      "sourceRevision",
      "territories",
      "version",
    ])
    expect(plan.version).toBe("context-tool-plan-v1")
    expect(plan.actor).toEqual(input.actor)
    expect(plan.actorBytes).toBe(
      '{"memberId":"backend","projectId":"p1","sessionId":"s1","version":"maestro-actor-v1"}',
    )
    expect(plan.planRevision).toEqual({ id: "r1", hash: "c".repeat(64) })
    expect(plan.catalogVersion).toBe(input.context.catalogVersion)
    expect(plan.headSnapshot).toBe(input.context.snapshot)
    expect(plan.sourceRevision).toBe(sourceRevision)
    expect(plan.territories).toEqual(["platform", "finance"])
    expect(plan.actions.map((action) => action.unit)).toEqual(input.units)
    expect(plan.actions.map((action) => action.skillName)).toEqual([
      "own_Y3JhdGVzL2JpbGxpbmc",
      "own_c2VydmljZXMvYmlsbGluZw",
    ])
    expect(plan.actions[0]?.path).toBe(".opencode/skills/own/Y3JhdGVzL2JpbGxpbmc/SKILL.md")
    plan.actions.forEach((action) => {
      const unit = input.context.units.find((unit) => unit.unit === action.unit)!
      expect(action.operation).toBe("load-skill")
      expect(action.contentHash).toBe(unit.receipt.contentHash)
      expect(action.receiptHash).toMatch(/^[a-f0-9]{64}$/)
      expect(Object.keys(action).sort()).toEqual([
        "contentHash",
        "operation",
        "path",
        "receiptHash",
        "skillName",
        "unit",
      ])
    })
    expect(plan.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(ready(fixture()))).toBe(JSON.stringify(plan))
    const reversed = ready({ ...input, units: [...input.units].reverse() })
    expect(reversed.actions.map((action) => action.unit)).toEqual([...input.units].reverse())
    expect(reversed.hash).not.toBe(plan.hash)
  })

  test("OCE-3: hash binds all plan fields, canonical receipt object order is irrelevant", () => {
    const input = fixture()
    const plan = ready(input)
    const reordered = changeUnit(input, (unit) => ({
      ...unit,
      receipt: Object.fromEntries(Object.entries(unit.receipt).reverse()) as unknown as VerifiedOwnUnit["receipt"],
    }))
    expect(ready(reordered)).toEqual(plan)
    const changed = [
      { ...input, actor: { ...input.actor, memberId: "lucy" } },
      { ...input, actor: { ...input.actor, sessionId: "s2" }, revision: { ...input.revision, sessionId: "s2" } },
      {
        ...input,
        actor: { ...input.actor, projectId: "p2" },
        revision: { ...input.revision, projectId: "p2" },
        context: { ...input.context, projectId: "p2" },
      },
      { ...input, revision: { ...input.revision, id: "r2" } },
      { ...input, revision: { ...input.revision, hash: "d".repeat(64) } },
      { ...input, territories: [...input.territories].reverse() },
      { ...input, context: { ...input.context, catalogVersion: "catalog:next" } },
      {
        ...input,
        context: {
          ...input.context,
          snapshot: "snapshot:next",
          units: input.context.units.map((unit) => ({
            ...unit,
            receipt: { ...unit.receipt, snapshot: "snapshot:next" },
          })),
        },
      },
      {
        ...input,
        context: {
          ...input.context,
          sourceRevision: "d".repeat(40),
          units: input.context.units.map((unit) => ({
            ...unit,
            receipt: { ...unit.receipt, sourceRevision: "d".repeat(40) },
          })),
        },
      },
      changeUnit(input, (unit) => ({ ...unit, receipt: { ...unit.receipt, contentHash: "content:changed" } })),
      changeUnit(input, (unit) => ({
        ...unit,
        pointers: unit.pointers.map((pointer) => ({ ...pointer, hits: pointer.hits + 1 })),
      })),
    ]
    changed.forEach((candidate) => expect(ready(candidate).hash).not.toBe(plan.hash))
    const unit = input.context.units.find((unit) => unit.unit === unitIds[0])!
    const receiptBytes = JSON.stringify({
      contentHash: unit.receipt.contentHash,
      drillUnits: [unitIds[2]],
      factIds: ["1".repeat(64)],
      graphCoverage: "COMPLETE",
      schemaVersion: 1,
      skillName: "own_Y3JhdGVzL2JpbGxpbmc",
      snapshot: "snapshot:billing-v1",
      sourceBlobs: { "crates/billing/index.ts": blob },
      sourceRevision,
      unit: "crates/billing",
    })
    expect(plan.actions[0]?.receiptHash).toBe(createHash("sha256").update(receiptBytes, "utf8").digest("hex"))
  })

  test.each([
    ["display name", { memberId: "Backend" }, "actor-invalid"],
    ["unknown member", { memberId: "outsider" }, "actor-invalid"],
    ["empty project", { projectId: "" }, "actor-invalid"],
    ["control session", { sessionId: "s1\n" }, "actor-invalid"],
    ["lone surrogate", { projectId: "p\ud800" }, "actor-invalid"],
    ["cross project", { projectId: "p2" }, "actor-binding-mismatch"],
    ["cross session", { sessionId: "s2" }, "actor-binding-mismatch"],
  ] as const)("OCE-1/7: actor %s holds", (_, actor, reason) => {
    const input = fixture()
    held({ ...input, actor: { ...input.actor, ...actor } }, reason)
  })

  test.each([
    { id: "" },
    { id: "r\u0000" },
    { hash: "h1" },
    { hash: "g".repeat(64) },
    { hash: "a".repeat(63) },
    { projectId: "" },
    { sessionId: "\t" },
  ])("OCE-7: malformed revision %j holds", (revision) => {
    const input = fixture()
    held({ ...input, revision: { ...input.revision, ...revision } }, "revision-invalid")
  })

  test("OCE-7: context binds explicit project/version/catalog/snapshot/Git source revision", () => {
    const input = fixture()
    held({ ...input, context: { ...input.context, projectId: "p2" } }, "actor-binding-mismatch")
    const invalid: Partial<VerifiedHostContext>[] = [
      { version: 2 as 1 },
      { catalogVersion: "" },
      { snapshot: "" },
      { sourceRevision: "head" },
      { sourceRevision: "f".repeat(41) },
    ]
    invalid.forEach((context) =>
      held({ ...input, context: { ...input.context, ...context } }, "context-identity-invalid"),
    )
    expect(
      ready({
        ...input,
        context: {
          ...input.context,
          sourceRevision: "e".repeat(64),
          units: input.context.units.map((unit) => ({
            ...unit,
            receipt: { ...unit.receipt, sourceRevision: "e".repeat(64) },
          })),
        },
      }).sourceRevision,
    ).toBe("e".repeat(64))
  })

  test.each([
    { units: [] },
    { units: [unitIds[0]!, unitIds[0]!] },
    { units: [""] },
    { territories: [] },
    { territories: ["finance", "finance"] },
    { territories: ["finance\n"] },
  ])("OCE-4/7: malformed/duplicate selection %j holds", (selection) => {
    held({ ...fixture(), ...selection }, "selection-invalid")
  })

  test("OCE-4/7: exact availability axes, missing and duplicate context units", () => {
    const input = fixture()
    ;["own_billing", "billing", "crates/*", "finance"].forEach((unit) => {
      expect(held({ ...input, units: [unit] }, "unit-unavailable").evidence).toContain(unit)
    })
    held({ ...input, territories: [unitIds[0]!] }, "territory-unavailable")
    held(
      {
        ...input,
        context: { ...input.context, units: input.context.units.filter((unit) => unit.unit !== unitIds[0]) },
      },
      "unit-unavailable",
    )
    held(
      { ...input, context: { ...input.context, units: [...input.context.units, input.context.units[0]!] } },
      "context-availability-invalid",
    )
    held({ ...input, context: { ...input.context, units: [] } }, "context-availability-invalid")
  })

  test.each([
    { skillName: "own_billing" },
    { path: ".opencode/skills/own/billing/SKILL.md" },
    { path: "/tmp/SKILL.md" },
    { path: ".opencode/skills/own/../SKILL.md" },
  ])("OCE-4/7: guessed skill/path %j holds", (change) => {
    held(
      changeUnit(fixture(), (unit) => ({ ...unit, ...change })),
      "unit-skill-identity-mismatch",
    )
  })

  test("OCE-4: mutually consistent guessed skill and receipt cannot replace exact unit encoding", () => {
    held(
      changeUnit(fixture(), (unit) => ({
        ...unit,
        skillName: "own_billing",
        receipt: { ...unit.receipt, skillName: "own_billing" },
      })),
      "unit-skill-identity-mismatch",
    )
  })

  test.each([
    { unit: "services/billing" },
    { skillName: "own_billing" },
    { snapshot: "old" },
    { sourceRevision: "f".repeat(40) },
    { schemaVersion: 2 as 1 },
    { contentHash: "" },
  ])("OCE-7: malformed/stale receipt %j holds", (receipt) => {
    held(
      changeUnit(fixture(), (unit) => ({ ...unit, receipt: { ...unit.receipt, ...receipt } })),
      "unit-receipt-mismatch",
    )
  })

  test("OCE-7: changed head snapshot rejects old receipt", () => {
    const input = fixture()
    held({ ...input, context: { ...input.context, snapshot: "snapshot:next" } }, "unit-receipt-mismatch")
    held(
      changeUnit(input, (unit) => ({ ...unit, content: "" })),
      "unit-receipt-mismatch",
    )
  })

  test("OCE-7: UNDER_APPROX never READY; exact receipt and pointers remain evidence", () => {
    const input = changeUnit(fixture(), (unit) => ({
      ...unit,
      receipt: { ...unit.receipt, graphCoverage: "UNDER_APPROX" },
    }))
    const result = held(input, "unit-coverage-incomplete")
    const unit = input.context.units.find((unit) => unit.unit === unitIds[0])!
    expect(result.evidence[0]).toBe(unit.unit)
    expect(JSON.parse(result.evidence[1]!)).toMatchObject({
      receipt: unit.receipt,
      manifest: unit.pointers,
      pullReachable: unit.pullReachable,
    })
  })

  test.each([1501, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])(
    "OCE-7: unsafe/over-cap token estimate %s holds",
    (tokenEstimate) => {
      held(
        changeUnit(fixture(), (unit) => ({ ...unit, tokenEstimate })),
        "unit-over-cap-or-invalid-estimate",
      )
    },
  )

  test("OCE-7: cap endpoints 0 and 1500 allowed", () => {
    ;[0, 1500].forEach((tokenEstimate) => ready(changeUnit(fixture(), (unit) => ({ ...unit, tokenEstimate }))))
  })

  test.each([
    { truncated: true },
    { pullReachable: ["fact:omitted", "fact:second"] },
    { advisoryDropped: 1 },
    { advisoryDropped: -1 },
    { advisoryDropped: 0.5 },
  ])("OCE-6/7: omitted tail %j holds with complete supplied evidence", (tail) => {
    const input = changeUnit(fixture(), (unit) => ({ ...unit, ...tail }))
    const result = held(input, "unit-tail-insufficient")
    const unit = input.context.units.find((unit) => unit.unit === unitIds[0])!
    expect(JSON.parse(result.evidence[1]!)).toEqual({
      receipt: unit.receipt,
      skillName: unit.skillName,
      path: unit.path,
      tokenEstimate: unit.tokenEstimate,
      manifest: unit.pointers,
      pullReachable: unit.pullReachable,
      advisoryDropped: unit.advisoryDropped,
      truncated: unit.truncated,
    })
  })

  test("OCE-6: available drills and full manifest values preserved, no automatic drill load", () => {
    const input = fixture()
    const unit = input.context.units.find((unit) => unit.unit === unitIds[0])!
    const plan = ready(input)
    expect(plan.pointers[0]).toEqual({
      unit: unitIds[0],
      drillUnits: [unitIds[2]],
      manifest: unit.pointers,
      pullReachable: [],
    })
    expect(plan.actions.map((action) => action.unit)).not.toContain(unitIds[2])
    const explicit = ready({ ...input, units: [unitIds[2]!] })
    expect(explicit.actions.map((action) => action.unit)).toEqual([unitIds[2]!])
    held(
      changeUnit(input, (unit) => ({ ...unit, receipt: { ...unit.receipt, drillUnits: ["missing/drill"] } })),
      "drill-unit-unavailable",
    )
    held(
      {
        ...input,
        context: { ...input.context, units: input.context.units.filter((unit) => unit.unit !== unitIds[2]) },
      },
      "drill-unit-unavailable",
    )
    const pointer = {
      kind: "drill" as const,
      name: "own_Y3JhdGVzL2JpbGxpbmcvaW52b2ljZXM",
      digest: "drill:digest",
      pull: "exact drill pull",
      hits: 3,
    }
    expect(
      ready(changeUnit(input, (unit) => ({ ...unit, pointers: [...unit.pointers, pointer] }))).pointers[0]?.manifest,
    ).toContainEqual(pointer)
    held(
      changeUnit(input, (unit) => ({ ...unit, pointers: [{ ...pointer, name: "missing/drill" }] })),
      "drill-unit-unavailable",
    )
  })

  test.each([
    { name: "" },
    { digest: "" },
    { pull: "" },
    { hits: -1 },
    { hits: 1.5 },
    { kind: "search" },
    { name: "bad\nname" },
  ])("OCE-6/7: malformed manifest pointer %j holds", (change) => {
    held(
      changeUnit(fixture(), (unit) => ({
        ...unit,
        pointers: [{ ...unit.pointers[0]!, ...change } as VerifiedOwnUnit["pointers"][number]],
      })),
      "unit-pointers-invalid",
    )
  })

  test("OCE-7: malformed drill and tail names/types hold before copy", () => {
    const input = fixture()
    held(
      changeUnit(input, (unit) => ({ ...unit, receipt: { ...unit.receipt, drillUnits: [""] } })),
      "unit-pointers-invalid",
    )
    held(
      changeUnit(input, (unit) => ({ ...unit, pullReachable: [""] })),
      "unit-pointers-invalid",
    )
    held(
      changeUnit(input, (unit) => ({ ...unit, pointers: null as unknown as VerifiedOwnUnit["pointers"] })),
      "unit-pointers-invalid",
    )
    held(
      changeUnit(input, (unit) => ({ ...unit, pointers: new Array<VerifiedOwnUnit["pointers"][number]>(1) })),
      "unit-pointers-invalid",
    )
    held({ ...input, units: new Array<string>(1) }, "selection-invalid")
  })

  test("OCE-9: synchronous read-only compilation accepts frozen verified input; output owns copied values", () => {
    const input = fixture()
    const before = JSON.stringify(input)
    const freeze = (value: unknown): void => {
      if (typeof value !== "object" || value === null) return
      Object.values(value).forEach(freeze)
      Object.freeze(value)
    }
    freeze(input)
    const plan = ready(input)
    expect(JSON.stringify(input)).toBe(before)
    expect(plan.actor).not.toBe(input.actor)
    expect(plan.territories).not.toBe(input.territories)
    expect(plan.pointers[0]?.manifest).not.toBe(input.context.units.find((unit) => unit.unit === unitIds[0])?.pointers)
    expect(plan.actions.every((action) => action.operation === "load-skill")).toBe(true)
    expect(JSON.stringify(ready(input))).toBe(JSON.stringify(plan))
  })
})
