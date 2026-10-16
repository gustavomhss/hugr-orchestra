export * as ActionsTransport from "./transport"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema, Stream } from "effect"
import { AppProcess } from "../process"
import { ActionsContract } from "./contract"
import { ActionsError } from "./error"
import { ActionsCli } from "./transport/cli"
import { ActionsProcess } from "./transport/process"
import { ActionsResponse } from "./transport/response"
import { ActionsGitlab } from "./transport/gitlab"
import { ActionsIdentity } from "./transport/identity"

export const make = Effect.fn("ActionsTransport.make")(function* (input: { directory: string }): Effect.fn.Return<ActionsContract.Transport, never, AppProcess.Service> {
  const proc = yield* AppProcess.Service
  const gitlab = ActionsGitlab.make(input.directory, proc)

  const request = Effect.fn("ActionsTransport.request")(function* (provider: Actions.Provider, request: ActionsContract.Request) {
    const executable = yield* ActionsCli.target(provider)
    const path = yield* ActionsCli.endpoint(provider, request)
    if (request.body !== undefined && Option.isNone(Schema.decodeUnknownOption(Schema.Json)(request.body)))
      return yield* ActionsCli.error(provider, "invalid_input", "Request body must be JSON metadata", "definitely_unsent")
    const body = request.body === undefined ? Stream.empty : Stream.make(new TextEncoder().encode(JSON.stringify(request.body)))
    return yield* ActionsProcess.capture(proc, provider, ActionsCli.command(
      input.directory, provider, executable, ActionsCli.args(provider, request, path, true),
      request.body === undefined ? "ignore" : "pipe",
    ), body).pipe(Effect.flatMap((result) => ActionsResponse.parse(provider, result)))
  })

  const resolve = Effect.fn("ActionsTransport.resolve")(function* (provider: Actions.Provider, projectPath: string) {
    if (!projectPath || projectPath.startsWith("/") || projectPath.endsWith("/") ||
        projectPath.split("/").some((part) => !part || part === "." || part === "..") ||
        /[\s\\%?#{}:\x00-\x1f\x7f]/.test(projectPath) || (provider.kind === "github" && projectPath.split("/").length !== 2))
      return yield* ActionsCli.error(provider, "invalid_input", "Project path must be an exact native repository path", "definitely_unsent")
    if (provider.kind === "gitlab") return yield* gitlab.resolve(provider, projectPath)
    const project = yield* request(provider, { method: "GET", path: provider.kind === "github"
      ? `repos/${projectPath.split("/").map(encodeURIComponent).join("/")}` : `projects/${encodeURIComponent(projectPath)}` })
    const identity = ActionsIdentity.project(provider, project.data)
    if (Option.isNone(identity)) return yield* ActionsCli.error(provider, "transport_failed", "Provider did not return native project identity")
    const user = yield* request(provider, { method: "GET", path: "user" })
    const account = ActionsIdentity.account(provider, user.data)
    if (Option.isNone(account)) return yield* ActionsCli.error(provider, "not_authenticated", "Provider did not return the current signed-in account")
    return { ...identity.value, account: account.value }
  })

  const bound = <A, R>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError, R>) => effect.pipe(
    Effect.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: error.disposition, bindingID: binding.id })),
  )
  return {
    resolve,
    request: (binding, value) => bound(binding, binding.provider.kind === "gitlab" ? gitlab.request(binding, value) : request(binding.provider, value)),
    open: (binding, value) => bound(binding, binding.provider.kind === "gitlab" ? gitlab.open(binding, value)
      : Effect.fail(ActionsCli.error(binding.provider, "capability_unavailable", "GitHub raw output uses the qualified CLI byte transport", "definitely_unsent"))),
    bytes: (binding, value) => Stream.unwrap(bound(binding, Effect.gen(function* () {
      if (binding.provider.kind === "gitlab") return gitlab.bytes(binding, value)
        .pipe(Stream.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: error.disposition, bindingID: binding.id })))
      const executable = yield* ActionsCli.target(binding.provider)
      const path = yield* ActionsCli.endpoint(binding.provider, value)
      if (value.method !== "GET" || value.body !== undefined)
        return yield* ActionsCli.error(binding.provider, "invalid_input", "Raw byte downloads require GET without a body", "definitely_unsent")
      return ActionsProcess.bytes(proc, binding.provider, ActionsCli.command(input.directory, binding.provider, executable, ActionsCli.args(binding.provider, value, path, false), "ignore"))
        .pipe(Stream.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: error.disposition, bindingID: binding.id })))
    }))),
    upload: (binding, value, file) => bound(binding, binding.provider.kind === "gitlab" ? gitlab.upload(binding, value, file)
      : Effect.fail(ActionsCli.error(binding.provider, "capability_unavailable", "GitHub Actions does not provide native Secure File upload", "definitely_unsent"))),
  }
})
