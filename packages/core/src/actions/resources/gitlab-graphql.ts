export * as ActionsResourceGraphQL from "./gitlab-graphql"

import { request } from "node:https"
import { checkServerIdentity } from "node:tls"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { AppProcess } from "../../process"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsCredentials } from "../transport/credentials"
import { ActionsHttp } from "../transport/http"
import { ActionsResponse } from "../transport/response"
import { ActionsResourceNative } from "./native"

export type Command = { readonly kind: "runner"; readonly id: string } | { readonly kind: "cacheClear" }
export type Request = (binding: Actions.Binding, command: Command) => Effect.Effect<ActionsContract.Response, ActionsError>

// REST W1 deliberately binds /api/v4. This separate seam binds /api/graphql,
// keeps the same qualified CLI/TLS snapshot, and exposes only mock-required calls.
export function make(directory: string, proc: AppProcess.Interface): Request {
  return Effect.fn("ActionsResources.gitlabGraphQL")(function* (admitted: Actions.Binding, input: Command) {
    const binding = yield* ActionsResourceNative.checked(admitted, () => ActionsResourceNative.input(admitted, Schema.fromJsonString(Actions.Binding), JSON.stringify(admitted)))
    const command = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.input(binding, Schema.Union([
      Schema.Struct({ kind: Schema.Literal("runner"), id: Schema.NonEmptyString }), Schema.Struct({ kind: Schema.Literal("cacheClear") }),
    ]), input))
    const target = yield* ActionsResourceNative.checked(binding, () => {
      const provider = structuredClone(binding.provider)
      const host = URL.parse(`https://${provider.hostname}`)
      if (provider.kind !== "gitlab" || !host || host.host !== provider.hostname || host.pathname !== "/" || host.username || host.password || host.search || host.hash ||
        ![host.origin, `${host.origin}/api/v4`].includes(provider.apiOrigin))
        throw ActionsResourceNative.error(binding, "host_mismatch", "GitLab GraphQL requires the exact bound canonical HTTPS host")
      const project = ActionsResourceNative.id(binding, binding.projectID)
      return { provider, url: `${host.origin}/api/graphql`, body: command.kind === "runner" ? {
        query: "query OrchestraRunnerOwner($id: CiRunnerID!) { runner(id: $id) { id runnerType ownerProject { id } tagList } }",
        variables: { id: `gid://gitlab/Ci::Runner/${ActionsResourceNative.id(binding, command.id)}` },
      } : {
        query: "mutation OrchestraClearRunnerCache($projectId: ProjectID!) { runnerCacheClear(input: { projectId: $projectId }) { errors } }",
        variables: { projectId: `gid://gitlab/Project/${project}` },
      } }
    })
    const snapshot = yield* ActionsCredentials.read(proc, directory, target.provider)
    if (command.kind === "cacheClear") {
      if (!binding.account) return yield* ActionsResourceNative.error(binding, "binding_stale", "Cache clear requires a verified bound actor")
      const actor = yield* ActionsHttp.metadata(target.provider, snapshot, { method: "GET", path: "user" }).pipe(
        Effect.mapError((cause) => ActionsResourceNative.error(binding, cause.kind, "GitLab cache-clear actor preflight failed")),
      )
      const user = Schema.decodeUnknownOption(Schema.Struct({ username: Schema.NonEmptyString }))(actor.data)
      if (actor.status !== 200 || Option.isNone(user) || user.value.username !== binding.account)
        return yield* ActionsResourceNative.error(binding, "binding_stale", "GitLab cache-clear actor differs from the binding")
    }
    const response = yield* Effect.tryPromise({
      try: (signal) => new Promise<{ status: number; headers: Record<string, string>; bytes: Buffer }>((resolve, reject) => {
        const state = { phase: "handshake" as "handshake" | "http_possible", size: 0, chunks: [] as Buffer[] }
        const req = request(target.url, {
          method: "POST", agent: false, rejectUnauthorized: true, minVersion: "TLSv1.2", signal,
          ca: snapshot.ca, cert: snapshot.cert, key: snapshot.key,
          checkServerIdentity: (hostname, certificate) => {
            const error = checkServerIdentity(hostname, certificate)
            if (!error) state.phase = "http_possible"
            return error
          },
          headers: { ...snapshot.headers, "Content-Type": "application/json", Connection: "close" },
        })
        const fail = (cause: ActionsError) => { reject(cause); req.destroy() }
        const deadline = setTimeout(() => fail(ActionsResourceNative.error(binding, "outcome_unknown", "GitLab GraphQL deadline exceeded", "unknown")), 30_000)
        req.once("close", () => clearTimeout(deadline))
        req.once("error", (cause) => { clearTimeout(deadline); reject(ActionsHttp.requestError(target.provider, cause, state.phase)) })
        req.once("socket", (socket) => socket.once("secureConnect", () => { state.phase = "http_possible" }))
        req.once("response", (incoming) => {
          state.phase = "http_possible"
          incoming.once("aborted", () => fail(ActionsResourceNative.error(binding, "outcome_unknown", "GitLab GraphQL response ended prematurely", "unknown")))
          incoming.once("error", () => fail(ActionsResourceNative.error(binding, "outcome_unknown", "GitLab GraphQL response failed", "unknown")))
          incoming.on("data", (chunk: Buffer) => {
            state.size += chunk.length
            if (state.size > 2 * 1024 * 1024) {
              incoming.destroy()
              fail(ActionsResourceNative.error(binding, "metadata_truncated", "GitLab GraphQL metadata capture limit exceeded", "unknown"))
              return
            }
            state.chunks.push(chunk)
          })
          incoming.once("end", () => {
            clearTimeout(deadline)
            if (!incoming.complete) { fail(ActionsResourceNative.error(binding, "outcome_unknown", "GitLab GraphQL response was incomplete", "unknown")); return }
            resolve({ status: incoming.statusCode ?? 0, headers: Object.fromEntries(Object.entries(incoming.headers)
              .filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
              .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value])), bytes: Buffer.concat(state.chunks) })
          })
        })
        req.end(JSON.stringify(target.body))
      }),
      catch: (cause) => cause instanceof ActionsError ? cause : ActionsResourceNative.error(binding, "transport_failed", "GitLab GraphQL request failed", "unknown"),
    })
    return yield* ActionsResponse.http(target.provider, response.status, response.headers, response.bytes)
  })
}
