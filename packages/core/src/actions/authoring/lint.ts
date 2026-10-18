import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsGitLabNative } from "../gitlab/native"
import type { ActionsError } from "../error"
import { diagnostics } from "../source/document"
import type { Services } from "./input"
import { guard } from "./remote"

const Lint = Schema.Struct({ valid: Schema.Boolean, errors: Schema.Array(Schema.String), warnings: Schema.Array(Schema.String) })

export const lint = Effect.fn("ActionsAuthoring.gitlabLint")(function* (
  services: Services, binding: Actions.Binding, source: Actions.Source, graph: Actions.Graph,
): Effect.fn.Return<Actions.Graph, ActionsError> {
  // CI lint is an explicit user-requested computation, not a durable mutation or a dry-run pipeline.
  const root = yield* guard(binding, () => ActionsGitLabNative.projectPath(binding))
  const result = yield* services.transport.request(binding, {
    method: "POST", path: `${root}/ci/lint`,
    body: { content: source.text, include_jobs: false, dry_run: false },
  }).pipe(Effect.map((response) => response.status === 200 ? Schema.decodeUnknownOption(Lint)(response.data) : Option.none()),
    Effect.catch(() => Effect.succeed(Option.none())))
  const report = diagnostics()
  report.items.push(...graph.diagnostics)
  if (Option.isNone(result)) report.add("partial", "gitlab_lint_unavailable:provider validation was not established", true)
  if (Option.isSome(result) && (!result.value.valid || result.value.errors.length > 0))
    report.add("unresolved", "gitlab_lint_invalid:provider rejected this source", true)
  if (Option.isSome(result) && result.value.warnings.length > 0) report.add("partial", "gitlab_lint_warning:provider returned validation warnings", true)
  // Native lint never upgrades local includes/rules/matrices into claimed execution topology.
  return { ...graph, state: graph.state === "unresolved" || report.state() === "unresolved" ? "unresolved"
    : graph.state === "partial" || report.state() === "partial" ? "partial" : "complete", diagnostics: report.items }
})
