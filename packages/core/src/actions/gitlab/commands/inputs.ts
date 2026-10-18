export * as GitLabCommandInputs from "./inputs"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { diagnostics, inputExpression, read } from "../../source/document"
import { ActionsContract } from "../../contract"
import { ActionsGitLabNative } from "../native"
import { GitLabCommandShared } from "./shared"

const Input = Schema.Struct({
  type: Schema.optional(Schema.Literals(["string", "number", "boolean", "array"])), default: Schema.optional(Schema.Json),
  options: Schema.optional(Schema.Array(Schema.Union([Schema.String, Schema.Number, Schema.Boolean]))),
  description: Schema.optional(Schema.String), regex: Schema.optional(Schema.String), rules: Schema.optional(Schema.Json),
})
const Header = Schema.Struct({ spec: Schema.Struct({ inputs: Schema.optional(Schema.Record(Schema.String, Schema.NullOr(Input))) }) })

export const check = Effect.fn("ActionsGitLabCommands.inputs")(function* (
  binding: Actions.Binding, transport: ActionsContract.Transport, source: Actions.Source, supplied?: Readonly<Record<string, ActionsContract.Json>>,
) {
  const values = yield* ActionsGitLabNative.checked(binding, () => validate(binding, source, supplied))
  if (supplied !== undefined) {
    const native = ActionsGitLabNative.make(transport)
    const observation = yield* native.metadata(binding)
    // API inputs: 17.10 feature-flagged; 18.1 GA. No client-version or flag guesses.
    // https://docs.gitlab.com/api/pipelines/#create-a-new-pipeline
    // https://gitlab.com/gitlab-org/gitlab/-/blob/v18.1.0-ee/lib/api/ci/helpers/pipelines_helpers.rb
    yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.requireVersion(binding, observation, [18, 1], "pipeline inputs"))
  }
  return values
})

function validate(binding: Actions.Binding, source: Actions.Source, supplied?: Readonly<Record<string, ActionsContract.Json>>) {
  const definitions = projection(source.text)
  if (definitions === undefined) {
    if (supplied !== undefined) throw GitLabCommandShared.error(binding, "source_unresolved", "GitLab input declarations are not proven by bounded local source")
    return
  }
  // RE2 and conditional native input rules are not JavaScript regex predicates.
  // Keep raw constraints authoritative; explicit values need native validation
  // outside this slice before they can be admitted under these declarations.
  if (supplied !== undefined && Object.values(definitions).some((config) => config?.regex !== undefined || config?.rules !== undefined))
    throw GitLabCommandShared.error(binding, "source_unresolved", "GitLab input regex/rules constraints are not locally verified")
  const values = supplied ?? {}
  if (Object.keys(values).some((key) => !Object.hasOwn(definitions, key)))
    throw GitLabCommandShared.error(binding, "invalid_input", "GitLab inputs contain a key not declared in the ref-bound CI header")
  Object.entries(definitions).forEach(([key, definition]) => {
    const config = definition ?? {}
    const type = config.type ?? "string"
    if (config.default !== undefined && !valid(type, config.default))
      throw GitLabCommandShared.error(binding, "source_unresolved", "GitLab CI input default does not match its declared native type")
    const value = Object.hasOwn(values, key) ? values[key] : config.default
    if (value === undefined || !valid(type, value))
      throw GitLabCommandShared.error(binding, "invalid_input", "GitLab required input is missing or has a different native type")
    if (config.options !== undefined && (type === "array" || !config.options.some((option) => option === value)))
      throw GitLabCommandShared.error(binding, "invalid_input", "GitLab input does not match a declared native option")
  })
  // Native provider applies omitted defaults. Preserve supplied values without coercion.
  return supplied
}

function valid(type: string, value: ActionsContract.Json) {
  return type === "array" ? Array.isArray(value) : type === "number" ? typeof value === "number" && Number.isFinite(value) : typeof value === type
}

function projection(text: string) {
  const report = diagnostics()
  const document = read(text, "gitlab", report)
  if (!document) return
  if (document.header === undefined) {
    // Parsed headerless local source proves no declarations. An unfetched
    // include may supply declarations: undefined is unknown, never empty.
    if (document.value.include !== undefined) return
    return {}
  }
  const spec = document.header.spec
  if (!spec || typeof spec !== "object" || Array.isArray(spec) || "include" in spec || inputExpression(spec)) return
  const decoded = Schema.decodeUnknownOption(Header, { onExcessProperty: "error" })(document.header)
  if (Option.isNone(decoded)) return
  return decoded.value.spec.inputs ?? {}
}
