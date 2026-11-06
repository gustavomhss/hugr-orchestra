import { mkdtemp, readFile, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { Agent } from "node:https"
import { connect, createServer } from "node:tls"
import type { ConnectionOptions, TLSSocket } from "node:tls"
import { AppProcess } from "@orchestra/core/process"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"

export const metadataPath = "/organizations/v2.0/.well-known/openid-configuration"
export const keysPath = "/organizations/discovery/v2.0/keys"
export const metadata = {
  issuer: "https://login.microsoftonline.com/{tenantid}/v2.0",
  authorization_endpoint: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
  token_endpoint: "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
  jwks_uri: "https://login.microsoftonline.com" + keysPath,
  id_token_signing_alg_values_supported: ["RS256"],
}

class FixtureAgent extends Agent {
  constructor(
    readonly fixturePort: number,
    readonly fixtureCA?: Buffer,
  ) {
    super({ keepAlive: false })
  }
  override createConnection(options: ConnectionOptions) {
    return connect({
      ...options,
      host: "127.0.0.1",
      port: this.fixturePort,
      ca: this.fixtureCA,
      servername: "login.microsoftonline.com",
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    })
  }
}

export function discoveryFixture(keys: unknown) {
  return Effect.gen(function* () {
    const proc = yield* AppProcess.Service
    const root = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "fabric-jwks-tls-"))),
      (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
    )
    const certificate = (host: string, name: string) =>
      Effect.gen(function* () {
        const openssl =
          process.platform === "win32" ? "C:\\Program Files\\Git\\usr\\bin\\openssl.exe" : "/usr/bin/openssl"
        yield* proc
          .run(
            ChildProcess.make(
              openssl,
              [
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-days",
                "1",
                "-keyout",
                name + ".key",
                "-out",
                name + ".crt",
                "-subj",
                "/CN=" + host,
                "-addext",
                "subjectAltName=DNS:" + host,
              ],
              { cwd: root, extendEnv: true, stdin: "ignore" },
            ),
            { timeout: "30 seconds", maxOutputBytes: 8192, maxErrorBytes: 8192 },
          )
          .pipe(Effect.flatMap(AppProcess.requireSuccess))
        return {
          key: yield* Effect.promise(() => readFile(path.join(root, name + ".key"))),
          cert: yield* Effect.promise(() => readFile(path.join(root, name + ".crt"))),
        }
      })
    const good = yield* certificate("login.microsoftonline.com", "good")
    const wrong = yield* certificate("wrong-host.invalid", "wrong")
    const sockets = new Set<TLSSocket>()
    const listeners = new Set<() => void>()
    const observed: { method: string; path: string; headers: Record<string, string>; clientCertificate: boolean }[] = []
    const state = { mode: "normal", metadata: { ...metadata } as Record<string, unknown>, keys, closed: 0 }
    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        createServer(good, (socket) => {
          sockets.add(socket)
          socket.on("error", () => socket.destroy())
          socket.once("close", () => {
            sockets.delete(socket)
            state.closed++
            listeners.forEach((listener) => listener())
          })
          const input = { bytes: Buffer.alloc(0), handled: false }
          socket.on("data", (chunk: Buffer) => {
            if (input.handled) return
            input.bytes = Buffer.concat([input.bytes, chunk])
            if (input.bytes.length > 16384) {
              socket.destroy()
              return
            }
            const end = input.bytes.indexOf("\r\n\r\n")
            if (end < 0) return
            input.handled = true
            const lines = input.bytes.subarray(0, end).toString("ascii").split("\r\n")
            const [method, target] = lines[0]!.split(" ")
            const headers = Object.fromEntries(
              lines.slice(1).map((line) => {
                const at = line.indexOf(":")
                return [line.slice(0, at).toLowerCase(), line.slice(at + 1).trim()]
              }),
            )
            observed.push({
              method: method!,
              path: target!,
              headers,
              clientCertificate: !!socket.getPeerCertificate().raw,
            })
            listeners.forEach((listener) => listener())
            const reply = (status: number, headers: Record<string, string>, body = "", finish = true) => {
              socket.write(
                `HTTP/1.1 ${status} Fixture\r\nConnection: close\r\n${Object.entries(headers)
                  .map(([key, value]) => `${key}: ${value}\r\n`)
                  .join("")}\r\n`,
              )
              if (body) socket.write(body)
              if (finish) socket.end()
            }
            if (state.mode === "redirect" || (state.mode === "key-redirect" && target === keysPath)) {
              reply(302, { Location: "https://never-follow.invalid/private", "Content-Length": "0" })
              return
            }
            if (state.mode === "status") {
              reply(401, { "Content-Length": "0" })
              return
            }
            if (state.mode === "stall") {
              reply(200, { "Content-Type": "application/json", "Content-Length": "1000" }, "", false)
              return
            }
            const normal = JSON.stringify(target === metadataPath ? state.metadata : state.keys)
            const body = state.mode === "json" ? "PRIVATE_INVALID_JSON" : normal
            const contentType = state.mode === "type" ? "text/html" : "application/json; charset=utf-8"
            if (state.mode === "overflow") {
              const value = "x".repeat(target === metadataPath ? 65537 : 262145)
              reply(
                200,
                { "Content-Type": contentType, "Transfer-Encoding": "chunked" },
                value.length.toString(16) + "\r\n" + value + "\r\n0\r\n\r\n",
              )
              return
            }
            reply(
              200,
              {
                "Content-Type": contentType,
                "Content-Length": String(Buffer.byteLength(body) + (state.mode === "partial" ? 100 : 0)),
                ...(state.mode === "encoding" ? { "Content-Encoding": "gzip" } : {}),
              },
              body,
            )
          })
        }),
      ),
      (server) =>
        Effect.promise(
          () =>
            new Promise<void>((resolve) => {
              sockets.forEach((socket) => socket.destroy())
              server.close(() => resolve())
            }),
        ),
    )
    yield* Effect.promise(
      () =>
        new Promise<void>((resolve, reject) => {
          server.once("error", reject)
          server.listen(0, "127.0.0.1", () => resolve())
        }),
    )
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("TLS fixture must bind a real port")
    const agent = yield* Effect.acquireRelease(
      Effect.sync(() => new FixtureAgent(address.port, good.cert)),
      (agent) => Effect.sync(() => agent.destroy()),
    )
    const untrusted = yield* Effect.acquireRelease(
      Effect.sync(() => new FixtureAgent(address.port)),
      (agent) => Effect.sync(() => agent.destroy()),
    )
    const wrongHost = yield* Effect.acquireRelease(
      Effect.sync(() => new FixtureAgent(address.port, wrong.cert)),
      (agent) => Effect.sync(() => agent.destroy()),
    )
    const wait = (condition: () => boolean) =>
      Effect.callback<void>((resume) => {
        const listener = () => {
          if (condition()) resume(Effect.void)
        }
        listeners.add(listener)
        listener()
        return Effect.sync(() => listeners.delete(listener))
      }).pipe(Effect.timeout("3 seconds"))
    return {
      state,
      observed,
      agent,
      untrusted,
      wrongHost,
      wrongCertificate: () => server.setSecureContext(wrong),
      waitClosed: (after: number) => wait(() => state.closed > after),
      waitRequest: (after: number) => wait(() => observed.length > after),
    }
  })
}
