import { createHash } from "node:crypto"
import { types } from "node:util"
import { Capability } from "@orchestra/schema/capability"
import { Location } from "@orchestra/schema/location"
import { Project } from "@orchestra/schema/project"
import { Option, Result, Schema } from "effect"
import type { CapabilityOperatorContract } from "./contract"

const targetSchema = Schema.Struct({
  action: Schema.NonEmptyString,
  placement: Schema.Struct({ projectID: Project.ID, location: Location.Ref }),
  resource: Schema.optional(Schema.Struct({ kind: Schema.NonEmptyString, id: Schema.NonEmptyString })),
})

export const payloadBudget = Object.freeze({ bytes: 256 * 1024, nodes: 4096 })
export const resultBudget = Object.freeze({ bytes: 16 * 1024, nodes: 1024 })

/** Descriptor inspection precedes serialization; neither accessors nor toJSON may run here. */
export function snapshot(input: unknown, budget: { bytes: number; nodes: number }) {
  const active = new WeakSet<object>()
  const used = { nodes: 0, bytes: 0 }
  const encode = (text: string) => {
    used.bytes += Buffer.byteLength(text)
    if (used.bytes > budget.bytes) throw quota()
    return text
  }
  const visit = (value: unknown, depth: number): { data: Schema.Json; json: string } => {
    if (++used.nodes > budget.nodes || depth > 64) throw quota()
    if (value === null || typeof value === "boolean" || typeof value === "string" ||
      (typeof value === "number" && Number.isFinite(value))) {
      // Reject huge strings before allocating their escaped JSON representation.
      if (typeof value === "string" && Buffer.byteLength(value) > budget.bytes) throw quota()
      return { data: value, json: encode(JSON.stringify(value)) }
    }
    if (!value || typeof value !== "object" || types.isProxy(value) || active.has(value)) throw invalid()
    const array = Array.isArray(value)
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype) &&
      !(Object.getPrototypeOf(value) === null && !array)) throw invalid()
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = Reflect.ownKeys(descriptors)
    if (keys.length > budget.nodes + 1) throw quota()
    if (keys.some((key) => typeof key !== "string" || !("value" in descriptors[key]) ||
      (!descriptors[key].enumerable && !(array && key === "length")))) throw invalid()
    active.add(value)
    if (array) {
      const length: unknown = descriptors.length?.value
      if (typeof length !== "number" || length > budget.nodes) throw quota()
      if (keys.length !== length + 1 || keys.some((key) => key !== "length" &&
        (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))) throw invalid()
      encode("[]" + ",".repeat(Math.max(0, length - 1)))
      const items = Array.from({ length }, (_, index) => visit(descriptors[String(index)].value, depth + 1))
      active.delete(value)
      return { data: Object.freeze(items.map((item) => item.data)),
        json: `[${items.map((item) => item.json).join(",")}]` }
    }
    const names = keys.filter((key): key is string => typeof key === "string").sort()
    encode("{}" + ",".repeat(Math.max(0, names.length - 1)))
    const items = names.map((key) => {
      if (Buffer.byteLength(key) > budget.bytes) throw quota()
      const name = encode(JSON.stringify(key) + ":")
      return { key, name, ...visit(descriptors[key].value, depth + 1) }
    })
    active.delete(value)
    // Null prototype protects special keys, and prevents inherited serializers from participating.
    const data: { [key: string]: Schema.Json } = Object.create(null)
    items.forEach((item) => Object.defineProperty(data, item.key, { value: item.data, enumerable: true }))
    return { data: Object.freeze(data), json: `{${items.map((item) => item.name + item.json).join(",")}}` }
  }
  return visit(input, 0)
}

export function capture(suppliedTarget: CapabilityOperatorContract.Target, payload: Schema.Json) {
  return Result.try({
    try: () => {
      const root = fields(suppliedTarget, ["action", "placement", "resource"])
      const placement = fields(root.placement, ["projectID", "location"])
      const location = fields(placement.location, ["directory", "workspaceID"])
      const decoded = Schema.decodeUnknownOption(targetSchema)({
        action: root.action, placement: { projectID: placement.projectID, location },
        ...(root.resource === undefined ? {} : { resource: fields(root.resource, ["kind", "id"]) }),
      })
      if (Option.isNone(decoded)) throw invalid()
      const target = decoded.value
      Object.freeze(target.placement.location)
      Object.freeze(target.placement)
      if (target.resource) Object.freeze(target.resource)
      Object.freeze(target)
      const value = snapshot(payload, payloadBudget)
      return { target, payloadHash: hash(value.json), targetHash: hash(snapshot([
        target.action, target.placement.projectID, target.placement.location.directory,
        target.placement.location.workspaceID ?? null,
        target.resource ? [target.resource.kind, target.resource.id] : null,
      ], payloadBudget).json) }
    },
    catch: (error) => error instanceof Capability.Failure ? error : invalid(),
  })
}

export function stored(input: unknown) {
  if (typeof input !== "string" || Buffer.byteLength(input) > resultBudget.bytes)
    throw new Error("Capability request stored result is invalid")
  const decoded = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(input)
  if (Option.isNone(decoded)) throw new Error("Capability request stored result is invalid")
  const result = Result.try(() => snapshot(decoded.value, resultBudget))
  if (Result.isFailure(result)) throw new Error("Capability request stored result is invalid")
  return result.success.data
}

export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

export function invalid() {
  return new Capability.Failure({ code: "unsupported_operation", message: "Capability request JSON is invalid" })
}

export function quota() {
  return new Capability.Failure({ code: "quota_exceeded", message: "Capability request budget exceeded" })
}

function fields(value: unknown, allowed: readonly string[]) {
  if (!value || typeof value !== "object" || types.isProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw invalid()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !allowed.includes(key) ||
    !("value" in descriptors[key]) || !descriptors[key].enumerable)) throw invalid()
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]))
}
