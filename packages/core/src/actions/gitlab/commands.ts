export * as ActionsGitLabCommands from "./commands"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsGitLabNative } from "./native"
import { GitLabCommandShared } from "./commands/shared"
import { GitLabCommandLaunch } from "./commands/launch"
import { GitLabCommandRuns } from "./commands/runs"
import { GitLabCommandJobs } from "./commands/jobs"
import { GitLabCommandMergeRequest } from "./commands/merge-request"

export function make(input: { readonly transport: ActionsContract.Transport; readonly reader: ActionsContract.ReadAdapter }): ActionsContract.Commands {
  const launch = GitLabCommandLaunch.make(input)
  const run = GitLabCommandRuns.make(input)
  const job = GitLabCommandJobs.make(input)
  const mergeRequest = GitLabCommandMergeRequest.make(input)
  return { perform: Effect.fn("ActionsGitLabCommands.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
    const plan = yield* Effect.gen(function* () {
      const admitted = yield* ActionsGitLabNative.checked(binding, () => GitLabCommandShared.admit(binding, intent))
      if (admitted.kind === "workflow.dispatch" || admitted.kind === "pipeline.trigger") return yield* launch(binding, admitted, payload)
      if (admitted.kind === "pipeline.mergeRequest") return yield* mergeRequest(binding, admitted, payload)
      if (admitted.kind.startsWith("run.")) return yield* run(binding, admitted, payload)
      return yield* job(binding, admitted, payload)
    }).pipe(Effect.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: "definitely_unsent" })))
    // One write, owned by the caller's durable execution scope. W1 captures the
    // same credential snapshot for native actor preflight and this HTTP mutation.
    const response = yield* input.transport.request(binding, plan.request)
    if (!plan.statuses.includes(response.status)) return yield* GitLabCommandShared.error(binding, "outcome_unknown", "GitLab command returned an unqualified native write status", true)
    return { acknowledgement: yield* plan.acknowledge(response) }
  }) }
}
