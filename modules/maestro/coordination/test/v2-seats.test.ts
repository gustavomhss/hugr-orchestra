import { expect, test } from "bun:test"
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

// V1's per-agent tool filter, as rules after the floor: each Maestro or Atlas Memory tool stays with its owners only.
const rulesOf = (id: string) => [...MaestroSeatsV2.floor(nativeProfiles[id]), ...MaestroSeatsV2.visibility(id)]
const configured = [{ action: "*", resource: "*", effect: "allow" as const }]
const effect = (id: string, action: string, resource = "*") =>
  PermissionV2.evaluate(action, resource, configured, rulesOf(id)).effect

test("Maestro keeps its governance tools and playbooks but not a seat's tools", () => {
  expect(effect("maestro", "maestro_workflows")).toBe("allow")
  expect(effect("maestro", "maestro_record_result_decision")).toBe("allow")
  expect(effect("maestro", "maestro_arsenal_execute", "any")).toBe("allow")
  expect(effect("maestro", "skill", "maestro-governed")).toBe("allow")
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
  expect(effect("backend", "skill", "maestro-governed")).toBe("deny")
})
