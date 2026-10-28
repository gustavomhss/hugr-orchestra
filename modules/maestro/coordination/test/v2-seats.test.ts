import { expect, test } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { PermissionV2 } from "@orchestra/core/permission"
import { nativeProfiles } from "../src/roster"
import { MaestroSeatsV2 } from "../src/v2/seats"

// A seat's native profile becomes its V2 permission floor: the profile's own order, so its `*` deny comes first and its
// grants win over it, and as the last rules a configured allow cannot widen it.

test("a review seat's floor denies by default and grants only its profile", () => {
  const rules = MaestroSeatsV2.floor(nativeProfiles.lucy)
  expect(rules[0]).toEqual({ action: "*", resource: "*", effect: "deny" })
  const configured = [{ action: "*", resource: "*", effect: "allow" as const }]
  expect(PermissionV2.evaluate("bash", "ls", configured, rules).effect).toBe("deny")
  expect(PermissionV2.evaluate("maestro_record_review", "*", configured, rules).effect).toBe("allow")
  expect(PermissionV2.evaluate("read", "app/.env", configured, rules).effect).toBe("deny")
  expect(MaestroSeatsV2.floor(undefined)).toEqual([])
})

// The earlier runtime's per-agent tool filter, as rules after the floor: each Maestro or Atlas Memory tool stays with its owners only.
const rulesOf = (id: string) => [...MaestroSeatsV2.floor(nativeProfiles[id]), ...MaestroSeatsV2.visibility(id)]
const configured = [{ action: "*", resource: "*", effect: "allow" as const }]
const effect = (id: string, action: string, resource = "*") =>
  PermissionV2.evaluate(action, resource, configured, rulesOf(id)).effect

test("Maestro keeps its governance tools and playbooks but not a seat's tools", () => {
  expect(effect("maestro", "maestro_workflows")).toBe("allow")
  expect(effect("maestro", "maestro_record_result_decision")).toBe("allow")
  expect(effect("maestro", "maestro_arsenal_execute", "any")).toBe("allow")
  expect(effect("maestro", "skill", "maestro-run-governed")).toBe("allow")
  expect(effect("maestro", "maestro_record_review")).toBe("deny")
  expect(effect("maestro", "atlas_memory_recall")).toBe("deny")
  expect(effect("maestro", "bash", "ls")).toBe("allow")
})

test("other agents are denied Maestro's tools and playbooks, whatever configuration allows", () => {
  for (const id of ["general", "explore", "custom"]) {
    for (const tool of MaestroSeatsV2.owners.flatMap((owner) => owner.tools)) expect(effect(id, tool)).toBe("deny")
    expect(effect(id, "skill", "frame-request")).toBe("deny")
    expect(effect(id, "skill", "my-skill")).toBe("allow")
    expect(effect(id, "read", "src/a.ts")).toBe("allow")
  }
})

test("each seat keeps exactly its own Maestro and Atlas Memory tools", () => {
  expect(effect("lucy", "maestro_record_review")).toBe("allow")
  expect(effect("billy", "maestro_record_review")).toBe("deny")
  expect(effect("lucy", "maestro_workflows")).toBe("deny")
  expect(effect("archie", "maestro_arsenal_catalog")).toBe("allow")
  expect(effect("archie", "maestro_arsenal_execute", "not-an-authoring-operation")).toBe("deny")
  expect(effect("backend", "maestro_arsenal_catalog")).toBe("deny")
  for (const id of ["backend", "jimmy", "archie"]) expect(effect(id, "atlas_memory_emit")).toBe("allow")
  for (const id of ["patty", "lucy", "rosie"]) expect(effect(id, "atlas_memory_recall")).toBe("deny")
  expect(effect("backend", "skill", "maestro-run-governed")).toBe("deny")
})

test("the backend seat keeps HuGR Composer's tools over a configured deny, and no other server's", () => {
  const denied = [...configured, { action: "hugr-composer_*", resource: "*", effect: "deny" as const }]
  const tool = "hugr-composer_fastapi_meta_compose"
  expect(PermissionV2.evaluate(tool, "*", denied, rulesOf("backend")).effect).toBe("allow")
  for (const id of ["maestro", "patty", "general"]) expect(PermissionV2.evaluate(tool, "*", denied, rulesOf(id)).effect).toBe("deny")
  expect(effect("backend", "other-server_tool")).toBe("deny")
})

test("a seat loads any node below its own roots and no other seat's nodes", () => {
  expect(effect("backend", "skill", "backend-implement")).toBe("allow")
  expect(effect("backend", "skill", "backend-implement-stack-python-fastapi")).toBe("allow")
  expect(effect("backend", "skill", "backend-implementation")).toBe("deny")
  expect(effect("backend", "skill", "archie-plan-scope")).toBe("deny")
  for (const id of ["archie", "maestro", "general"]) expect(effect(id, "skill", "backend-implement-stack-python")).toBe("deny")
})

test("a seat's entry skills stay with that seat", () => {
  expect(effect("backend", "skill", "backend-api")).toBe("allow")
  expect(effect("archie", "skill", "archie-plan")).toBe("allow")
  expect(effect("archie", "skill", "backend-api")).toBe("deny")
  expect(effect("backend", "skill", "archie-plan")).toBe("deny")
  for (const id of ["maestro", "general", "custom"]) {
    expect(effect(id, "skill", "backend-api")).toBe("deny")
    expect(effect(id, "skill", "archie-plan")).toBe("deny")
  }
})

// A seat's display label, as on the earlier runtime: the label variable over `agent.<id>.name` over the roster default; an invalid label
// keeps the default and names the problem.
test("a seat's label comes from its variable, then configuration, else the default", () => {
  const others = [AgentV2.ID.make("general"), AgentV2.ID.make("lucy")].map((id) => ({ ...AgentV2.Info.empty(id) }))
  expect(MaestroSeatsV2.label("lucy", "Default", undefined, others)).toEqual({ label: "Default" })
  expect(MaestroSeatsV2.label("lucy", "Default", " Ana ", others)).toEqual({ label: "Ana" })
  for (const [configured, problem] of [
    ["", "empty"],
    ["x".repeat(41), "longer than 40 characters"],
    ["A\nB", "contains a control character or line break"],
    ["Explore", "reserved agent id"],
    ["GENERAL", "reserved agent id"],
  ])
    expect(MaestroSeatsV2.label("lucy", "Default", configured, others)).toEqual({
      label: "Default",
      path: "agent.lucy.name",
      problem,
    })
  expect(MaestroSeatsV2.label("backend", "Default", "Lucy", others)).toMatchObject({ problem: "already used by another agent" })
  process.env.HUGR_UPSTREAM_NAME = "Upstream Ana"
  const fromVariable = MaestroSeatsV2.label("archie", "Default", "Configured", others)
  delete process.env.HUGR_UPSTREAM_NAME
  expect(fromVariable).toEqual({ label: "Upstream Ana" })
  expect(MaestroSeatsV2.label("archie", "Default", "Configured", others)).toEqual({ label: "Configured" })
})
