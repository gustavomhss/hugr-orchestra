export * as ActionsGitlab from "./gitlab"

import { randomUUID } from "node:crypto"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema, Stream } from "effect"
import { AppProcess } from "../../process"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsCli } from "./cli"
import { ActionsCredentials } from "./credentials"
import { ActionsHttp } from "./http"
import { ActionsIdentity } from "./identity"

export function make(directory: string, proc: AppProcess.Interface) {
  const validate = Effect.fn("ActionsTransport.gitlabActor")(function* (binding: Actions.Binding, snapshot: ActionsCredentials.Snapshot) {
    if (!binding.account) return yield* ActionsCli.error(binding.provider, "binding_stale", "GitLab binding has no verified sign-in identity", "definitely_unsent")
    const user = yield* ActionsHttp.metadata(binding.provider, snapshot, { method: "GET", path: "user" })
      .pipe(Effect.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: "definitely_unsent" })))
    const account = ActionsIdentity.account(binding.provider, user.data)
    if (Option.isNone(account) || account.value !== binding.account)
      return yield* ActionsCli.error(binding.provider, "binding_stale", "GitLab sign-in identity changed; rebind before mutation", "definitely_unsent")
  })
  return {
    resolve: Effect.fn("ActionsTransport.gitlabResolve")(function* (provider: Actions.Provider, projectPath: string) {
      const snapshot = yield* ActionsCredentials.read(proc, directory, provider)
      const project = yield* ActionsHttp.metadata(provider, snapshot, { method: "GET", path: `projects/${encodeURIComponent(projectPath)}` })
      const identity = ActionsIdentity.project(provider, project.data)
      if (Option.isNone(identity)) return yield* ActionsCli.error(provider, "transport_failed", "Provider did not return native project identity")
      const user = yield* ActionsHttp.metadata(provider, snapshot, { method: "GET", path: "user" })
      const account = ActionsIdentity.account(provider, user.data)
      if (Option.isNone(account)) return yield* ActionsCli.error(provider, "not_authenticated", "Provider did not return the current signed-in account")
      return { ...identity.value, account: account.value }
    }),
    request: Effect.fn("ActionsTransport.gitlabRequest")(function* (binding: Actions.Binding, input: ActionsContract.Request) {
      yield* ActionsCli.endpoint(binding.provider, input)
      if (input.body !== undefined && Option.isNone(Schema.decodeUnknownOption(Schema.Json)(input.body)))
        return yield* ActionsCli.error(binding.provider, "invalid_input", "Request body must be JSON metadata", "definitely_unsent")
      const snapshot = yield* ActionsCredentials.read(proc, directory, binding.provider)
      if (input.method !== "GET") yield* validate(binding, snapshot)
      return yield* ActionsHttp.metadata(binding.provider, snapshot, input)
    }),
    open: Effect.fn("ActionsTransport.gitlabOpen")(function* (binding: Actions.Binding, input: ActionsContract.BoundRequest) {
      yield* ActionsCli.endpoint(binding.provider, input)
      if (input.method !== "GET" || input.body !== undefined || input.query !== undefined ||
        !/^[1-9]\d{0,127}$/.test(binding.projectID) ||
        !new RegExp(`^projects/${binding.projectID}/jobs/[1-9]\\d{0,127}/(?:trace|artifacts(?:/.*)?)$`).test(input.path))
        return yield* ActionsCli.error(binding.provider, "invalid_input", "Raw opening requires an exact bound GitLab job trace or artifact GET", "definitely_unsent")
      const snapshot = yield* ActionsCredentials.read(proc, directory, binding.provider)
      yield* validate(binding, snapshot)
      return yield* ActionsHttp.openRaw(binding.provider, snapshot, input)
    }),
    bytes: (binding: Actions.Binding, input: ActionsContract.Request) => Stream.unwrap(Effect.gen(function* () {
      yield* ActionsCli.endpoint(binding.provider, input)
      if (input.method !== "GET" || input.body !== undefined)
        return yield* ActionsCli.error(binding.provider, "invalid_input", "Raw byte downloads require GET without a body", "definitely_unsent")
      return ActionsHttp.bytes(binding.provider, yield* ActionsCredentials.read(proc, directory, binding.provider), input)
    })),
    upload: Effect.fn("ActionsTransport.gitlabUpload")(function* (binding: Actions.Binding, input: ActionsContract.Request, file: { filename: string; bytes: Stream.Stream<Uint8Array, ActionsError> }) {
      if (!file.filename || file.filename === "." || file.filename === ".." || file.filename !== file.filename.trim() ||
          /[\\/:\x00-\x1f\x7f]/.test(file.filename) || file.filename.length > 255 || input.method !== "POST" ||
          input.path.replace(/^\//, "") !== `projects/${encodeURIComponent(binding.projectID)}/secure_files` ||
          input.body !== undefined || input.query?.name !== file.filename)
        return yield* ActionsCli.error(binding.provider, "invalid_input", "Secure File upload requires an exact safe filename and matching native name query", "definitely_unsent")
      yield* ActionsCli.endpoint(binding.provider, input)
      const snapshot = yield* ActionsCredentials.read(proc, directory, binding.provider)
      yield* validate(binding, snapshot)
      const boundary = `orchestra-${randomUUID()}`
      const prefix = new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${file.filename}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename.replace(/["\\]/g, "\\$&")}"\r\nContent-Type: application/octet-stream\r\n\r\n`)
      const body = Stream.concat(Stream.make(prefix), Stream.concat(file.bytes, Stream.make(new TextEncoder().encode(`\r\n--${boundary}--\r\n`))))
      return yield* ActionsHttp.metadata(binding.provider, snapshot, input, body, `multipart/form-data; boundary=${boundary}`)
    }),
  }
}
