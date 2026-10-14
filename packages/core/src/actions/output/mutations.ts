export * as ActionsArtifactCommands from "./mutations"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsResourceNative } from "../resources/native"
import { OutputNative } from "./native"
import { OutputVersion } from "./version"

const Input = Schema.Struct({ provider: Actions.ProviderKind })

export function make(input: { transport: ActionsContract.Transport; reader: (binding: Actions.Binding) => ActionsContract.ReadAdapter }) {
  return Effect.fn("ActionsArtifacts.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
    const services = { transport: input.transport, reader: input.reader(binding) }
    const id = yield* ActionsResourceNative.checked(binding, () => {
      const decoded = ActionsResourceNative.input(binding, Input, payload)
      if (decoded.provider !== binding.provider.kind || intent.target.resourceKind !== "artifacts" ||
        intent.binding.id !== binding.id || intent.binding.revision !== binding.revision || !intent.target.resourceID ||
        !["resource.delete", "artifact.keep"].includes(intent.kind) || intent.expected?.attempt !== undefined || intent.expected?.commit !== undefined || intent.expected?.sourceVersion !== undefined ||
        Object.keys(intent.target).some((key) => !["resourceKind", "resourceID", "scope", "runID"].includes(key)))
        throw ActionsResourceNative.error(binding, "invalid_input", "Artifact command does not match its native admission")
      return ActionsResourceNative.id(binding, intent.target.resourceID)
    })
    if (binding.provider.kind === "github" && intent.kind === "artifact.keep")
      return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitHub Actions has no native artifact keep operation")
    const authority = yield* ActionsResourceNative.authority(services, binding, intent.kind === "artifact.keep" ? 30 : 40)
    if (binding.provider.kind === "github") {
      const path = `${authority.root}/actions/artifacts/${id}`
      const response = yield* ActionsResourceNative.get(services, binding, path)
      yield* ActionsResourceNative.before(binding, ActionsResourceNative.checked(binding, () => {
        const native = ActionsResourceNative.decode(binding, OutputNative.Artifact, response.data)
        OutputNative.artifactOwner(binding, native, id, intent.target.runID)
        if (intent.target.scope !== undefined && intent.target.scope !== String(native.workflow_run.id))
          throw ActionsResourceNative.error(binding, "binding_stale", "Artifact scope differs from its admitted native run")
        ActionsResourceNative.requireVersion(binding, intent, OutputVersion.github(native))
      }))
      yield* ActionsResourceNative.send(services, binding, { method: "DELETE", path }, [204])
      return { acknowledgement: { resourceID: id } }
    }
    const job = yield* ActionsResourceNative.get(services, binding, `${authority.root}/jobs/${id}`)
    const native = yield* ActionsResourceNative.before(binding, ActionsResourceNative.checked(binding, () => {
      const native = ActionsResourceNative.decode(binding, OutputNative.GitLabJob, job.data)
      OutputNative.gitlabOwner(binding, native, id, intent.target.runID)
      if (intent.target.scope !== undefined && intent.target.scope !== String(native.pipeline.id))
        throw ActionsResourceNative.error(binding, "binding_stale", "Artifact scope differs from its admitted native pipeline")
      ActionsResourceNative.requireVersion(binding, intent, OutputVersion.gitlab(native))
      return native
    }))
    const response = yield* ActionsResourceNative.send(services, binding, { method: intent.kind === "artifact.keep" ? "POST" : "DELETE",
      path: `${authority.root}/jobs/${id}/artifacts${intent.kind === "artifact.keep" ? "/keep" : ""}` }, intent.kind === "artifact.keep" ? [200] : [204])
    if (intent.kind === "artifact.keep") yield* ActionsResourceNative.after(binding, ActionsResourceNative.checked(binding, () => {
      const kept = ActionsResourceNative.decode(binding, OutputNative.GitLabJob, response.data, true)
      OutputNative.gitlabOwner(binding, kept, id, String(native.pipeline.id))
      if (kept.artifacts_expire_at !== null) throw ActionsResourceNative.error(binding, "outcome_unknown", "Native artifact keep response did not prove removed expiry", "unknown")
    }))
    return { acknowledgement: { resourceID: id } }
  })
}
