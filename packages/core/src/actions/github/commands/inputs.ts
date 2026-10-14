export * as GitHubDispatchInputs from "./inputs"

import { Actions } from "@orchestra/schema/actions"
import { Option, Schema } from "effect"
import { diagnostics, object, read, strings } from "../../source/document"
import { GitHubCommandCommon } from "./common"

const Value = Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])
const Types = Schema.Literals(["string", "choice", "boolean", "number", "environment"])
const Definition = Schema.Struct({ type: Schema.optionalKey(Types),
  required: Schema.optionalKey(Schema.Boolean), description: Schema.optionalKey(Schema.String),
  default: Schema.optionalKey(Value), options: Schema.optionalKey(Schema.Array(Schema.String)) })

// Inspect native on.workflow_dispatch structurally; never evaluate YAML expressions.
export function definitions(binding: Actions.Binding, source: Actions.Source, report = diagnostics()): Record<string, typeof Definition.Type & { type: typeof Types.Type }> {
  if (Buffer.byteLength(source.text) > 128 * 1024)
    throw GitHubCommandCommon.fail(binding, "metadata_truncated", "Workflow exceeds bounded dispatch-definition parsing")
  const document = read(source.text, "github", report)
  if (document === undefined || report.state() !== "complete")
    throw GitHubCommandCommon.fail(binding, "source_unresolved", "Workflow dispatch source is not a proved native YAML mapping")
  if (!object(document.value.jobs) || Object.keys(document.value.jobs).length === 0)
    throw GitHubCommandCommon.fail(binding, "source_unresolved", "Workflow dispatch source has no native job definitions")
  // Document diagnostics cover bounded structural parsing, not graph completeness.
  // Dynamic matrices and reusable jobs do not invalidate a proved dispatch trigger.
  const on = document.value.on
  if (on === "workflow_dispatch" || (strings(on) && on.includes("workflow_dispatch"))) return {}
  if (!object(on) || !Object.hasOwn(on, "workflow_dispatch"))
    throw GitHubCommandCommon.fail(binding, "capability_unavailable", "Workflow source does not declare native workflow_dispatch")
  const configuration = Schema.decodeUnknownOption(Schema.Struct({ inputs: Schema.optionalKey(Schema.Record(Schema.String, Schema.NullOr(Definition))) }))
    (on.workflow_dispatch ?? {}, { onExcessProperty: "error" })
  if (Option.isNone(configuration)) throw GitHubCommandCommon.fail(binding, "source_unresolved", "Native workflow_dispatch input definitions are unresolved")
  if (Object.keys(configuration.value.inputs ?? {}).length > 25)
    throw GitHubCommandCommon.fail(binding, "source_unresolved", "Native workflow_dispatch defines more than 25 inputs")
  return Object.fromEntries(Object.entries(configuration.value.inputs ?? {}).map(([name, definition]) => {
    const value = definition ?? {}
    const type = value.type ?? "string"
    if (type === "choice" && (!value.options?.length || value.options.some((option) => !option)))
      throw GitHubCommandCommon.fail(binding, "source_unresolved", "Native choice input has no proved choices")
    if (value.options !== undefined && type !== "choice")
      throw GitHubCommandCommon.fail(binding, "source_unresolved", "Native input options do not match their declared type")
    if (typeof value.default === "string" && value.default.includes("${{"))
      throw GitHubCommandCommon.fail(binding, "source_unresolved", "Dynamic dispatch input defaults cannot be evaluated during admission")
    const result = { ...value, type }
    if (value.default !== undefined) validate(binding, result, value.default, "source_unresolved")
    return [name, result]
  }))
}

export function values(binding: Actions.Binding, registry: ReturnType<typeof definitions>, provided: Readonly<Record<string, string | number | boolean>> = {}) {
  if (Object.keys(provided).length > 25 || Object.keys(provided).some((key) => !Object.hasOwn(registry, key)))
    throw GitHubCommandCommon.fail(binding, "invalid_input", "Dispatch input keys do not match the selected native workflow")
  return Object.fromEntries(Object.entries(registry).flatMap(([name, definition]) => {
    const value = Object.hasOwn(provided, name) ? provided[name] : definition.default
    if (value === undefined) {
      if (definition.required) throw GitHubCommandCommon.fail(binding, "invalid_input", "A required native dispatch input is missing")
      return []
    }
    validate(binding, definition, value, "invalid_input")
    return [[name, value]]
  }))
}

function validate(binding: Actions.Binding, definition: { type: string; required?: boolean; options?: readonly string[] }, value: string | number | boolean, kind: Actions.ErrorKind) {
  if ((definition.type === "boolean" && typeof value !== "boolean") ||
      (definition.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) ||
      (["string", "choice", "environment"].includes(definition.type) && typeof value !== "string") ||
      (definition.required && value === "") || (definition.type === "choice" && !definition.options?.some((option) => option === value)))
    throw GitHubCommandCommon.fail(binding, kind, "Dispatch input value does not match its proved native definition")
}
