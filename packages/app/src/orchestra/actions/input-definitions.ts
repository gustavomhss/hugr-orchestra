import type { Actions } from "@orchestra/schema/actions"

export type JsonValue = null | string | number | boolean | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export function headerDefinitions(header: unknown): readonly Actions.InputDefinition[] | undefined {
  if (!isRecord(header) || !isRecord(header.spec) || "include" in header.spec || !isRecord(header.spec.inputs)) return undefined
  const definitions = Object.entries(header.spec.inputs).map(([name, value]) => inputDefinition(name, value))
  return definitions.every((value): value is Actions.InputDefinition => value !== undefined) ? definitions : undefined
}

export function githubDefinitions(triggers: unknown): readonly Actions.InputDefinition[] | undefined {
  if (triggers === "workflow_dispatch") return []
  if (Array.isArray(triggers)) return triggers.includes("workflow_dispatch") ? [] : undefined
  if (!isRecord(triggers)) return undefined
  const dispatch = triggers.workflow_dispatch
  if (dispatch === undefined) return undefined
  if (dispatch === null) return []
  if (!isRecord(dispatch)) return undefined
  const inputs = dispatch.inputs
  if (inputs === undefined) return []
  if (!isRecord(inputs)) return undefined
  const definitions = Object.entries(inputs).map(([name, value]) => inputDefinition(name, value))
  return definitions.every((value): value is Actions.InputDefinition => value !== undefined) ? definitions : undefined
}

export function parseInputs(raw: string, definitions: readonly Actions.InputDefinition[] | undefined, provider: Actions.ProviderKind, data: FormData) {
  if (definitions) {
    let invalid: "required" | "invalid" | undefined
    const values = definitions.flatMap<readonly [string, JsonValue]>((item): readonly [string, JsonValue][] => {
      const rawValue = data.get(`input:${item.name}`)
      if (item.type === "boolean") return [[item.name, data.has(`input:${item.name}`)]]
      if (rawValue === null || String(rawValue) === "") {
        if (item.required) invalid = "required"
        if (item.type === "string" || item.type === "file" || item.type === "environment") return [[item.name, ""]]
        return []
      }
      const text = String(rawValue)
      if (item.type === "number") {
        const number = Number(text)
        if (!Number.isFinite(number)) { invalid = "invalid"; return [] }
        return [[item.name, number]]
      }
      if (item.type === "array") {
        try {
          const value: unknown = JSON.parse(text)
          if (Array.isArray(value) && isJson(value)) return [[item.name, value]]
        } catch {
          invalid = "invalid"
          return []
        }
        invalid = "invalid"
        return []
      }
      if ((item.type === "choice" || item.type === "environment") && item.options) {
        const index = Number(text)
        if (Number.isInteger(index) && index >= 0 && index < item.options.length) return [[item.name, item.options[index]]]
        invalid = "invalid"
        return []
      }
      return [[item.name, text]]
    })
    return invalid ? { error: invalid } : { value: Object.fromEntries(values) }
  }
  if (!raw.trim()) return { value: {} }
  try {
    const value: unknown = JSON.parse(raw)
    if (!isJsonObject(value)) return { error: true }
    if (provider === "github" && Object.values(value).some((item) => !isPrimitive(item))) return { error: true }
    return { value }
  } catch {
    return { error: true }
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
export function isJsonObject(value: unknown): value is Record<string, JsonValue> { return isRecord(value) && Object.values(value).every(isJson) }
function inputDefinition(name: string, value: unknown): Actions.InputDefinition | undefined {
  if (!isRecord(value)) return undefined
  const type = value.type === undefined ? "string" : value.type
  if (type !== "string" && type !== "boolean" && type !== "number" && type !== "choice" && type !== "environment" && type !== "file" && type !== "array") return undefined
  if (value.required !== undefined && typeof value.required !== "boolean") return undefined
  if (value.description !== undefined && typeof value.description !== "string") return undefined
  if (value.default !== undefined && !isJson(value.default)) return undefined
  if (value.options !== undefined && (!Array.isArray(value.options) || value.options.some((option) => !isPrimitive(option)))) return undefined
  return { name, type, required: value.required ?? false, ...(typeof value.description === "string" ? { description: value.description } : {}), ...(value.default !== undefined ? { default: value.default } : {}), ...(Array.isArray(value.options) ? { options: value.options } : {}) }
}
export function isPrimitive(value: unknown): value is string | number | boolean { return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) }
export function isJson(value: unknown): value is JsonValue { if (value === null || isPrimitive(value)) return true; if (Array.isArray(value)) return value.every(isJson); if (isRecord(value)) return Object.values(value).every(isJson); return false }
