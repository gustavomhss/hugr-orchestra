import { Global } from "@orchestra/core/global"
import { InstallationVersion } from "@orchestra/core/installation/version"
import { ClientError, Orchestra } from "@orchestra/client"
import { ServerAuth } from "@orchestra/server/auth"
import { Context, Effect, FileSystem, Layer, Option, Schedule, Schema, Scope } from "effect"
import { HttpServer } from "effect/unstable/http"
import { randomBytes, randomUUID } from "crypto"
import { spawn } from "node:child_process"
import path from "path"

export interface Interface {
  readonly client: () => Effect.Effect<ReturnType<typeof Orchestra.make>, unknown>
  readonly transport: () => Effect.Effect<{ url: string; headers: RequestInit["headers"] }, unknown>
  readonly start: () => Effect.Effect<string, Error>
  /** Points at the server already answering on this local port, or starts a dedicated one there. */
  readonly startOn: (port: number) => Effect.Effect<string, Error>
  readonly status: () => Effect.Effect<string | undefined>
  readonly stop: () => Effect.Effect<void, unknown>
  readonly password: (value?: string) => Effect.Effect<string, unknown>
  readonly register: (address: HttpServer.Address) => Effect.Effect<void, unknown, Scope.Scope>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/cli/Daemon") {}

const Registration = Schema.Struct({
  id: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  url: Schema.String,
  pid: Schema.Int.check(Schema.isGreaterThan(0)),
})
type Registration = typeof Registration.Type

function sameRegistration(left: Registration, right: Registration) {
  return left.id === right.id && left.version === right.version && left.url === right.url && left.pid === right.pid
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const directory = Global.Path.state
    const file = path.join(directory, "server.json")
    const passwordFile = path.join(directory, "password")
    const decodeRegistration = Schema.decodeUnknownEffect(Schema.fromJsonString(Registration))

    const password = Effect.fn("cli.daemon.password")(function* (value?: string) {
      const existing = yield* fs.readFileString(passwordFile).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (value === undefined && existing) return existing

      // Keep one private credential across server restarts so discovered clients
      // can reconnect without exposing a password flag or environment variable.
      const generated = value ?? randomBytes(32).toString("base64url")
      const temp = passwordFile + ".tmp"
      yield* fs.makeDirectory(directory, { recursive: true })
      yield* fs.writeFileString(temp, generated, { mode: 0o600 })
      yield* fs.rename(temp, passwordFile)
      return generated
    })

    const registration = Effect.fnUntraced(function* () {
      return yield* fs.readFileString(file).pipe(Effect.flatMap(decodeRegistration))
    })

    const createClient = Effect.fnUntraced(function* (url: string) {
      return Orchestra.make({ baseUrl: url, headers: ServerAuth.headers({ password: yield* password() }) })
    })

    // Failure messages are fixed reason codes: `service start` reports the last
    // one, so they must never carry server output or the password.
    const healthy = Effect.fnUntraced(function* () {
      const info = yield* registration().pipe(Effect.mapError(() => new Error("registration-unavailable")))
      const client = yield* createClient(info.url).pipe(Effect.mapError(() => new Error("password-unavailable")))
      // The client throws on any non-success status where the legacy client resolved without data, so only
      // transport failures stay "unreachable"; every other failure keeps reporting "unhealthy".
      const response = yield* Effect.tryPromise({
        try: () => client.health.get({ signal: AbortSignal.timeout(2_000) }),
        catch: (cause) =>
          new Error(
            cause instanceof ClientError && cause.reason === "Transport" ? "health-unreachable" : "health-unhealthy",
          ),
      })
      if (response.healthy === true) return info
      return yield* Effect.fail(new Error("health-unhealthy"))
    })

    const compatible = Effect.fnUntraced(function* () {
      const info = yield* healthy()
      if (info.version === InstallationVersion) return info
      return yield* Effect.fail(new Error("version-mismatch"))
    })

    const signal = (pid: number, signal: NodeJS.Signals) =>
      Effect.try({ try: () => process.kill(pid, signal), catch: (cause) => cause }).pipe(Effect.ignore)

    const awaitStopped = Effect.fnUntraced(function* (pid: number) {
      const running = yield* Effect.try({ try: () => process.kill(pid, 0), catch: () => false }).pipe(
        Effect.orElseSucceed(() => false),
      )
      if (!running) return true
      return yield* Effect.fail(new Error(`Server process ${pid} is still running`))
    })

    const stopProcess = Effect.fnUntraced(function* (info: Registration) {
      const current = yield* healthy().pipe(Effect.option)
      if (Option.isNone(current) || !sameRegistration(current.value, info)) return

      yield* signal(info.pid, "SIGTERM")
      const stopped = yield* awaitStopped(info.pid).pipe(
        Effect.retry(Schedule.spaced("50 millis").pipe(Schedule.both(Schedule.recurs(100)))),
        Effect.option,
      )
      if (Option.isSome(stopped)) return

      const latest = yield* healthy().pipe(Effect.option)
      if (Option.isNone(latest) || !sameRegistration(latest.value, info)) return
      yield* signal(info.pid, "SIGKILL")
      yield* awaitStopped(info.pid).pipe(
        Effect.retry(Schedule.spaced("50 millis").pipe(Schedule.both(Schedule.recurs(100)))),
      )
    })

    const start = Effect.fn("cli.daemon.start")(function* () {
      const existing = yield* healthy().pipe(Effect.option)
      const found = Option.getOrUndefined(existing)
      const compiled = path.basename(process.execPath).replace(/\.exe$/, "") !== "bun"
      if (found?.version === InstallationVersion && compiled) return found.url
      if (found) yield* stopProcess(found).pipe(Effect.ignore)

      const launched = yield* launch(["serve", "--register"])
      const child = launched.child
      const started = launched.started

      return yield* compatible().pipe(
        // A cold daemon start takes up to ~5s on slow hosts (macOS Intel CI), so
        // a retry count would race it. Wait on a deadline; an exited daemon ends it early.
        Effect.retry({
          schedule: Schedule.spaced("50 millis").pipe(Schedule.both(Schedule.during("20 seconds"))),
          while: () => child.exit === undefined,
        }),
        Effect.map((info) => info.url),
        Effect.mapError((error) => new Error(
          `Failed to start server (${child.exit ? `exited ${child.exit}` : error.message}, ${Date.now() - started}ms)`,
        )),
      )
    })

    // A detached server of this same executable; the caller waits for it to answer. `child.exit` is set if it dies first.
    const launch = Effect.fnUntraced(function* (args: ReadonlyArray<string>) {
      const compiled = path.basename(process.execPath).replace(/\.exe$/, "") !== "bun"
      const entrypoint = compiled ? undefined : process.argv[1]
      if (!compiled && entrypoint === undefined) return yield* Effect.fail(new Error("Failed to resolve CLI entrypoint"))
      const started = Date.now()
      const child: { exit?: string } = {}
      yield* Effect.try({
        try: () => {
          const daemon = spawn(process.execPath, [...(entrypoint ? [entrypoint] : []), ...args], {
            detached: true,
            stdio: "ignore",
          })
          daemon.once("exit", (code, signal) => (child.exit = signal ? `signal=${signal}` : `code=${code}`))
          daemon.unref()
        },
        catch: (cause) => new Error("Failed to start server", { cause }),
      })
      return { child, started }
    })

    const startOn = Effect.fn("cli.daemon.startOn")(function* (port: number) {
      const url = `http://127.0.0.1:${port}`
      const client = yield* createClient(url).pipe(Effect.mapError((error) => new Error(String(error))))
      const answering = Effect.tryPromise({
        try: () => client.health.get({ signal: AbortSignal.timeout(2_000) }),
        catch: () => new Error("health-unreachable"),
      })
      if (Option.isSome(yield* answering.pipe(Effect.option))) return url
      const launched = yield* launch(["serve", "--hostname", "127.0.0.1", "--port", String(port)])
      yield* answering.pipe(
        Effect.retry({
          schedule: Schedule.spaced("50 millis").pipe(Schedule.both(Schedule.during("20 seconds"))),
          while: () => launched.child.exit === undefined,
        }),
        Effect.mapError(
          () => new Error(`Failed to start server on port ${port} (${launched.child.exit ?? "no answer"}, ${Date.now() - launched.started}ms)`),
        ),
      )
      return url
    })

    const transport = Effect.fn("cli.daemon.transport")(function* () {
      return { url: yield* start(), headers: ServerAuth.headers({ password: yield* password() }) }
    })

    const client = Effect.fn("cli.daemon.client")(function* () {
      const connection = yield* transport()
      return Orchestra.make({ baseUrl: connection.url, headers: connection.headers })
    })

    const status = Effect.fn("cli.daemon.status")(function* () {
      const existing = yield* healthy().pipe(Effect.option)
      const found = Option.getOrUndefined(existing)
      if (found?.version === InstallationVersion) return found.url
      if (found) return undefined
      yield* fs.remove(file).pipe(Effect.ignore)
      return undefined
    })

    const stop = Effect.fn("cli.daemon.stop")(function* () {
      const existing = yield* healthy().pipe(Effect.option)
      // A stale registration may point at a PID that has since been reused by
      // another process. Only signal the PID after authenticating the server.
      if (Option.isNone(existing)) return yield* fs.remove(file).pipe(Effect.ignore)
      yield* stopProcess(existing.value)
      yield* fs.remove(file).pipe(Effect.ignore)
    })

    const register = Effect.fn("cli.daemon.register")(function* (address: HttpServer.Address) {
      const id = randomUUID()
      const temp = file + "." + id + ".tmp"
      yield* fs.makeDirectory(directory, { recursive: true })
      yield* fs.writeFileString(
        temp,
        JSON.stringify({ id, version: InstallationVersion, url: HttpServer.formatAddress(address), pid: process.pid }),
        { mode: 0o600 },
      )
      yield* fs.rename(temp, file)
      yield* registration().pipe(
        Effect.flatMap((info) => (info.id === id ? Effect.void : signal(process.pid, "SIGTERM"))),
        Effect.catch(() => signal(process.pid, "SIGTERM")),
        Effect.repeat(Schedule.spaced("10 seconds")),
        Effect.forkScoped,
      )
      yield* Effect.addFinalizer(() =>
        registration().pipe(
          Effect.flatMap((info) => (info.id === id ? fs.remove(file) : Effect.void)),
          Effect.ignore,
        ),
      )
    })

    return Service.of({ client, transport, start, startOn, status, stop, password, register })
  }),
)

export * as Daemon from "./daemon"
