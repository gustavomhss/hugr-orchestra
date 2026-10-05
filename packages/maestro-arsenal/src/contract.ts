// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: native context, explicit effects, bounded schemas; removed model-brand authority.

export type Effect = "read" | "write" | "process"
export interface ArsenalContext {
  directory: string
  stateDirectory: string
  projectID: string
  authorize(request: { readonly effect: Effect; readonly paths: readonly string[]; readonly commands: readonly string[] }): Promise<void>
}
export interface ToolTextResult {
  content: { type: "text"; text: string }[]
  isError?: boolean
}
export interface Guidance { next?: string; invariant?: string }
export interface Descriptor {
  name: string
  description: string
  inputSchema: JsonSchema
  effects: Effect[]
}
export interface Tool<I = unknown> extends Descriptor {
  handler(input: I, context?: ArsenalContext): ToolTextResult | Promise<ToolTextResult>
}
export type ToolDef<I = unknown> = Tool<I>
export function text(value: unknown, guidance?: Guidance): ToolTextResult {
  const content: ToolTextResult["content"] = [{ type: "text", text: JSON.stringify(value, null, 2) }]
  const lines = [guidance?.next && `NEXT → ${guidance.next}`, guidance?.invariant && `INVARIANT → ${guidance.invariant}`].filter(Boolean)
  if (lines.length) content.push({ type: "text", text: lines.join("\n") })
  return { content }
}
export function failure(code: string, message: string): ToolTextResult {
  return { ...text({ error: code, message }), isError: true }
}

export interface Surface {
  name: string
  signature: string
  kind: "function" | "type" | "interface" | "const" | "class"
}
export interface Contract { id: string; surfaces: Surface[]; hash: string }
// Source FNV-1a preserved for compatibility. Drift identifier, not a security commitment.
export function surfaceHash(surfaces: Surface[]): string {
  const canon = surfaces.map((s) => `${s.kind}|${s.name}|${s.signature}`).sort().join("\n")
  let hash = 0x811c9dc5
  for (let i = 0; i < canon.length; i++) hash = Math.imul(hash ^ canon.charCodeAt(i), 0x01000193) >>> 0
  return hash.toString(16).padStart(8, "0")
}
export function requireContract(contract: Contract): string | undefined {
  if (new Set(contract.surfaces.map((s) => s.name)).size !== contract.surfaces.length) return "duplicate surface names"
  if (surfaceHash(contract.surfaces) !== contract.hash) return "contract hash does not match declared surfaces"
}

export interface JsonSchema {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null"
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean | JsonSchema
  items?: JsonSchema | JsonSchema[]
  additionalItems?: boolean
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  minProperties?: number
  maxProperties?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  minimum?: number
  maximum?: number
  enum?: readonly unknown[]
  const?: unknown
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  allOf?: JsonSchema[]
  not?: JsonSchema
}
export const stringSchema: JsonSchema = { type: "string", minLength: 1, maxLength: 65536 }
export const booleanSchema: JsonSchema = { type: "boolean" }
export const countSchema: JsonSchema = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER }
export function objectSchema(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return { type: "object", properties, required, additionalProperties: false }
}
export function arraySchema(items: JsonSchema, minItems = 0, maxItems = 4096): JsonSchema {
  return { type: "array", items, minItems, maxItems }
}
export const stringsSchema = arraySchema(stringSchema)
export const surfaceSchema = objectSchema({
  name: stringSchema, signature: stringSchema,
  kind: { type: "string", enum: ["function", "type", "interface", "const", "class"] },
}, ["name", "signature", "kind"])
export const contractSchema = objectSchema({
  id: stringSchema, surfaces: arraySchema(surfaceSchema, 1), hash: { type: "string", pattern: "^[a-f0-9]{8}$" },
}, ["id", "surfaces", "hash"])
