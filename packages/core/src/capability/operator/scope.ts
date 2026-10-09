export * as CapabilityOperatorScope from "./scope"

import { Location } from "@orchestra/schema/location"
import { Project } from "@orchestra/schema/project"
import { Option, Schema } from "effect"
import { createHash } from "node:crypto"
import type { CapabilityOperatorContract } from "./contract"

const Placement = Schema.Struct({ projectID: Project.ID, location: Location.Ref })
const actionPattern = /^[a-z][a-z0-9_.-]{0,63}(?![\s\S])/

/** Copy data descriptors before effects run. Accessors and custom serializers never execute. */
export function capture<A>(input: unknown, parse: (value: unknown) => A, allowClock = false):
  { readonly ok: true; readonly value: A } | { readonly ok: false } {
  try {
    const budget = { nodes: 0, bytes: 0 }
    const value = copy(input, budget, 0, allowClock)
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 65536) throw new Error("Invalid operator data")
    return { ok: true, value: parse(value) }
  } catch {
    // Reflection can throw for hostile proxies. No caller data escapes this parsing boundary.
    return { ok: false }
  }
}

function copy(value: unknown, budget: { nodes: number; bytes: number }, depth: number, allowClock: boolean): unknown {
  budget.nodes += 1
  if (depth > 64 || budget.nodes > 2048) throw new Error("Invalid operator data")
  if (typeof value === "string") {
    budget.bytes += Buffer.byteLength(JSON.stringify(value), "utf8")
    if (budget.bytes > 65536) throw new Error("Invalid operator data")
    return value
  }
  if (value === undefined || value === null || typeof value === "boolean" || typeof value === "number") return value
  if (typeof value !== "object") throw new Error("Invalid operator data")
  const prototype = Object.getPrototypeOf(value)
  const array = Array.isArray(value)
  if (prototype !== (array ? Array.prototype : Object.prototype) && prototype !== null)
    throw new Error("Invalid operator data")
  const keys = Reflect.ownKeys(value)
  if (keys.length > 2048) throw new Error("Invalid operator data")
  const entries = keys.filter((key) => !(array && key === "length")).map((key) => {
    if (typeof key !== "string") throw new Error("Invalid operator data")
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("Invalid operator data")
    budget.bytes += Buffer.byteLength(JSON.stringify(key), "utf8") + 2
    if (budget.bytes > 65536) throw new Error("Invalid operator data")
    if (allowClock && depth === 0 && key === "now" && typeof descriptor.value === "function")
      return [key, descriptor.value] as const
    return [key, copy(descriptor.value, budget, depth + 1, allowClock)] as const
  })
  if (!array) return Object.freeze(Object.fromEntries(entries))
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value
  if (!Number.isSafeInteger(length) || length < 0 || length > 2048 || entries.length !== length ||
    entries.some(([key], index) => key !== String(index))) throw new Error("Invalid operator data")
  return Object.freeze(entries.map((entry) => entry[1]))
}

export function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))) throw new Error("Invalid operator data")
  return value as Record<string, unknown>
}

export function text(value: unknown, max = 65536): string {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > max)
    throw new Error("Invalid operator data")
  return value
}

export function positive(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER)
    throw new Error("Invalid operator data")
  return value
}

export function options(value: unknown) {
  const input = record(value, ["principal", "scope", "now", "ttlMillis", "maxCapabilities"])
  const principal = text(input.principal, 256)
  const scope = grant(input.scope)
  const ttlMillis = input.ttlMillis === undefined ? 3600000 : positive(input.ttlMillis)
  const maxCapabilities = input.maxCapabilities === undefined ? 128 : positive(input.maxCapabilities)
  if (!Number.isSafeInteger(maxCapabilities) || (input.now !== undefined && typeof input.now !== "function"))
    throw new Error("Invalid operator data")
  // The host clock is the sole callable input; descriptor copying preserves its identity.
  const now = input.now === undefined ? Date.now : input.now as () => number
  return { principal, scope, ttlMillis, maxCapabilities, now }
}

function list<A>(value: unknown, max: number, parse: (value: unknown) => A, key: (value: A) => string): readonly A[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("Invalid operator data")
  const result = value.map(parse).sort((left, right) => key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0)
  if (new Set(result.map(key)).size !== result.length) throw new Error("Invalid operator data")
  return Object.freeze(result)
}

export function placement(value: unknown): CapabilityOperatorContract.Placement {
  const input = record(value, ["projectID", "location"])
  text(input.projectID)
  const location = record(input.location, ["directory", "workspaceID"])
  text(location.directory)
  if (location.workspaceID !== undefined) text(location.workspaceID)
  const decoded = Schema.decodeUnknownOption(Schema.toType(Placement))(input)
  if (Option.isNone(decoded)) throw new Error("Invalid operator data")
  return Object.freeze({ projectID: decoded.value.projectID, location: Object.freeze({ ...decoded.value.location }) })
}

export function resource(value: unknown): CapabilityOperatorContract.Resource {
  const input = record(value, ["kind", "id"])
  return Object.freeze({ kind: text(input.kind), id: text(input.id) })
}

export function action(value: unknown): string {
  if (typeof value !== "string" || !actionPattern.test(value)) throw new Error("Invalid operator data")
  return value
}

export function placementKey(value: CapabilityOperatorContract.Placement) {
  return JSON.stringify([value.projectID, value.location.directory, value.location.workspaceID ?? null])
}

function resourceKey(value: CapabilityOperatorContract.Resource) {
  return JSON.stringify([value.kind, value.id])
}

export function grant(value: unknown): CapabilityOperatorContract.GrantScope {
  const input = record(value, ["placements", "actions", "resources"])
  const placements = input.placements === "instance" ? "instance" : list(input.placements, 64, placement, placementKey)
  const actions = list(input.actions, 32, (value) => value === "*" ? "*" : action(value), (value) => value)
  if (actions.includes("*") && actions.length !== 1) throw new Error("Invalid operator data")
  const resources = input.resources === undefined ? undefined : list(input.resources, 64, resource, resourceKey)
  return Object.freeze({ placements, actions, ...(resources === undefined ? {} : { resources }) })
}

export function subset(child: CapabilityOperatorContract.GrantScope, root: CapabilityOperatorContract.GrantScope) {
  return (root.actions.includes("*") || child.actions.every((action) => root.actions.includes(action))) &&
    (root.placements === "instance" || (child.placements !== "instance" &&
      child.placements.every((placement) => root.placements !== "instance" &&
        root.placements.some((allowed) => placementKey(allowed) === placementKey(placement))))) &&
    (root.resources === undefined || (child.resources !== undefined &&
      child.resources.every((resource) => root.resources?.some((allowed) => resourceKey(allowed) === resourceKey(resource)))))
}

export function target(value: unknown): CapabilityOperatorContract.Target {
  const input = record(value, ["action", "placement", "resource"])
  return Object.freeze({ action: action(input.action), placement: placement(input.placement),
    ...(input.resource === undefined ? {} : { resource: resource(input.resource) }) })
}

export function allows(scope: CapabilityOperatorContract.GrantScope, target: CapabilityOperatorContract.Target) {
  const resource = target.resource
  return (scope.actions.includes("*") || scope.actions.includes(target.action)) &&
    (scope.placements === "instance" || scope.placements.some((allowed) => placementKey(allowed) === placementKey(target.placement))) &&
    (scope.resources === undefined || (resource !== undefined &&
      scope.resources.some((allowed) => resourceKey(allowed) === resourceKey(resource))))
}

export function hash(scope: CapabilityOperatorContract.GrantScope) {
  return createHash("sha256").update(JSON.stringify(scope)).digest("hex")
}

export function request(value: unknown) {
  const input = record(value, ["requestID", "idempotencyKey"])
  const requestID = text(input.requestID, 128)
  if (!/^[\x21-\x7e]{1,128}(?![\s\S])/.test(requestID)) throw new Error("Invalid operator data")
  if (input.idempotencyKey === undefined) return Object.freeze({ requestID })
  const idempotencyKey = text(input.idempotencyKey, 128)
  if (!/^[A-Za-z0-9_-]{1,128}(?![\s\S])/.test(idempotencyKey)) throw new Error("Invalid operator data")
  return Object.freeze({ requestID, idempotencyKey })
}
