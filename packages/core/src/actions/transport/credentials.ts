export * as ActionsCredentials from "./credentials"

import { open } from "node:fs/promises"
import { constants } from "node:fs"
import path from "node:path"
import { rootCertificates } from "node:tls"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../../process"
import { ActionsCli } from "./cli"

const commit = "570955d4252f860d6b0cbf3fd2ec44f86a7e6957"
const keys = ["token", "job_token", "is_oauth2", "ca_cert", "client_cert", "client_key"] as const

// Request-memory only. This module neither reads/copies a CLI config file nor
// exports credential values through the public Transport response/identity seam.
export const read = Effect.fn("ActionsTransport.credentials")(function* (proc: AppProcess.Interface, directory: string, provider: Actions.Provider) {
  const executable = yield* ActionsCli.target(provider)
  const command = ActionsCli.command(directory, provider, executable, [], "ignore")
  const get = (args: string[]) => Effect.scoped(Effect.gen(function* () {
    const handle = yield* proc.spawn(ChildProcess.make(executable, args, command.options))
    const result = yield* Effect.all({
      stdout: capture(handle.stdout), stderr: capture(handle.stderr), code: handle.exitCode,
    }, { concurrency: "unbounded" })
    if (result.code !== 0) return yield* ActionsCli.error(provider, "not_authenticated", "GitLab local sign-in configuration could not be read", "definitely_unsent")
    return yield* Effect.try({
      try: () => new TextDecoder("utf-8", { fatal: true }).decode(result.stdout).replace(/\r?\n$/, ""),
      catch: () => ActionsCli.error(provider, "not_authenticated", "GitLab local sign-in configuration is not valid UTF-8", "definitely_unsent"),
    })
  })).pipe(
    Effect.mapError(() => ActionsCli.error(provider, "not_authenticated", "GitLab local sign-in configuration could not be read safely", "definitely_unsent")),
    Effect.timeoutOrElse({ duration: "10 seconds", orElse: () => Effect.fail(ActionsCli.error(provider, "not_authenticated", "GitLab local configuration deadline exceeded", "definitely_unsent")) }),
  )
  const version = /^glab (\S+) \(([a-f0-9]+)\)$/.exec(yield* get(["version"]))
  if (version?.[1] !== "1.118.0" || !version[2] || version[2].length < 8 || !commit.startsWith(version[2]))
    return yield* ActionsCli.error(provider, "capability_unavailable", "GitLab local configuration reads require qualified glab 1.118.0", "definitely_unsent")
  const values = Object.fromEntries(yield* Effect.forEach(keys, (key) => get(["config", "get", key, "--host", provider.hostname]).pipe(Effect.map((value) => [key, value] as const))))
  const env = command.options.env ?? {}
  // Match v1.118.0's environment-PAT precedence over a stored OAuth flag.
  const oauth = values.is_oauth2 === "true" && (!(env.GITLAB_TOKEN || env.GITLAB_ACCESS_TOKEN) || !!env.GLAB_IS_OAUTH2)
  const token = values.token || (!oauth ? values.job_token : "")
  if (!token || !/^[\x21-\x7e]+$/.test(token))
    return yield* ActionsCli.error(provider, "not_authenticated", "GitLab sign-in is missing or unusable; sign in with the CLI", "definitely_unsent")
  if (!!values.client_cert !== !!values.client_key)
    return yield* ActionsCli.error(provider, "invalid_input", "GitLab mTLS requires both client certificate and key", "definitely_unsent")
  const material = (reference: string) => reference ? file(directory, reference).pipe(
    Effect.mapError(() => ActionsCli.error(provider, "invalid_input", "Configured GitLab TLS material could not be read safely", "definitely_unsent")),
  ) : Effect.succeed(undefined)
  const tls = yield* Effect.all({ ca: material(values.ca_cert), cert: material(values.client_cert), key: material(values.client_key) })
  return {
    headers: { [oauth ? "Authorization" : values.token ? "PRIVATE-TOKEN" : "JOB-TOKEN"]: oauth ? `Bearer ${token}` : token },
    ca: tls.ca ? [...rootCertificates, tls.ca] : undefined,
    cert: tls.cert, key: tls.key,
  }
})
export type Snapshot = Effect.Success<ReturnType<typeof read>>

function capture<E>(stream: Stream.Stream<Uint8Array, E>) {
  return stream.pipe(Stream.runFoldEffect(() => ({ bytes: 0, chunks: [] as Uint8Array[] }), (state, chunk) => {
    if (state.bytes + chunk.length > 16 * 1024) return Effect.fail(new Error("Local configuration capture limit"))
    state.bytes += chunk.length
    state.chunks.push(chunk)
    return Effect.succeed(state)
  }), Effect.map((state) => Buffer.concat(state.chunks)))
}

function file(directory: string, reference: string) {
  return Effect.acquireUseRelease(
    Effect.tryPromise(() => open(path.resolve(directory, reference), constants.O_RDONLY | constants.O_NONBLOCK)),
    (handle) => Effect.tryPromise(async () => {
      if (!(await handle.stat()).isFile()) throw new Error("TLS reference is not a regular file")
      const buffer = Buffer.alloc(256 * 1024 + 1)
      const state = { bytes: 0 }
      while (state.bytes < buffer.length) {
        const read = await handle.read(buffer, state.bytes, buffer.length - state.bytes, null)
        if (!read.bytesRead) break
        state.bytes += read.bytesRead
      }
      if (state.bytes === buffer.length) throw new Error("TLS material capture limit")
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, state.bytes))
    }),
    (handle) => Effect.promise(() => handle.close()),
  )
}
