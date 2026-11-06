import { mkdtemp, readFile, readdir, readlink, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createServer } from "node:tls"
import type { Socket } from "node:net"
import { AppProcess } from "@orchestra/core/process"
import { Omni } from "@orchestra/core/omni"
import { expect } from "bun:test"
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

export function discoveryFixture(
  keys: unknown,
  options?: { token?: (body: URLSearchParams) => Promise<unknown>; observe?: (path: string, method: string) => void },
) {
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
    const before = Omni.snapshot().spawns
    const good = yield* certificate("login.microsoftonline.com", "good")
    const wrong = yield* certificate("wrong-host.invalid", "wrong")
    expect(Omni.snapshot().spawns - before).toBe(2)
    const sockets = new Set<Socket>()
    const pending = new Set<Socket>()
    const clientPorts: number[] = []
    const listeners = new Set<() => void>()
    const observed: {
      method: string
      path: string
      headers: Record<string, string>
      clientCertificate: boolean
      body: string
    }[] = []
    const state = {
      mode: "normal",
      metadata: { ...metadata } as Record<string, unknown>,
      keys,
      closed: 0,
      connections: 0,
      peerEnds: 0,
    }
    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        createServer(good, (socket) => {
          state.connections++
          if (!socket.remotePort) throw new Error("Real TLS peer must have a client port")
          clientPorts.push(socket.remotePort)
          socket.once("end", () => {
            state.peerEnds++
            listeners.forEach((listener) => listener())
          })
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
            if (input.bytes.length > 49152) {
              socket.destroy()
              return
            }
            const end = input.bytes.indexOf("\r\n\r\n")
            if (end < 0) return
            if (end > 16384) {
              socket.destroy()
              return
            }
            const lines = input.bytes.subarray(0, end).toString("ascii").split("\r\n")
            const [method, target] = lines[0]!.split(" ")
            const headers = Object.fromEntries(
              lines.slice(1).map((line) => {
                const at = line.indexOf(":")
                return [line.slice(0, at).toLowerCase(), line.slice(at + 1).trim()]
              }),
            )
            const length = Number(headers["content-length"] ?? 0)
            if (!Number.isSafeInteger(length) || length < 0 || length > 32768) {
              socket.destroy()
              return
            }
            if (input.bytes.length < end + 4 + length) return
            input.handled = true
            const form = input.bytes.subarray(end + 4, end + 4 + length).toString("utf8")
            observed.push({
              method: method!,
              path: target!,
              headers,
              clientCertificate: !!socket.getPeerCertificate().raw,
              body: form,
            })
            options?.observe?.(target!, method!)
            listeners.forEach((listener) => listener())
            const reply = (
              status: number,
              headers: Record<string, string>,
              body: string | Buffer = "",
              finish = true,
            ) => {
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
            if (state.mode === "utf8") {
              reply(200, { "Content-Type": "application/json", "Content-Length": "1" }, Buffer.from([255]))
              return
            }
            if (
              state.mode === "normal" &&
              method === "POST" &&
              target?.split("?")[0] === "/organizations/oauth2/v2.0/token" &&
              options?.token
            ) {
              options.token(new URLSearchParams(form)).then(
                (value) => {
                  const output = JSON.stringify(value)
                  reply(
                    200,
                    { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(output)) },
                    output,
                  )
                },
                () => reply(500, { "Content-Length": "0" }),
              )
              return
            }
            const normal = JSON.stringify(target === metadataPath ? state.metadata : state.keys)
            const body = state.mode === "json" ? "PRIVATE_INVALID_JSON" : normal
            const contentType = state.mode === "type" ? "text/html" : "application/json; charset=utf-8"
            if (state.mode === "overflow" || (state.mode === "key-overflow" && target === keysPath)) {
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
                ...(state.mode === "headers" ? { "X-Too-Large": "x".repeat(16385) } : {}),
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
              pending.forEach((socket) => socket.destroy())
              server.close(() => resolve())
            }),
        ),
    )
    server.on("connection", (socket) => {
      pending.add(socket)
      socket.once("close", () => pending.delete(socket))
    })
    yield* Effect.promise(
      () =>
        new Promise<void>((resolve, reject) => {
          server.once("error", reject)
          server.listen(0, "127.0.0.1", () => resolve())
        }),
    )
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("TLS fixture must bind a real port")
    const wait = (condition: () => boolean, label: string) =>
      Effect.callback<void>((resume) => {
        const listener = () => {
          if (condition()) resume(Effect.void)
        }
        listeners.add(listener)
        listener()
        return Effect.sync(() => listeners.delete(listener))
      }).pipe(
        Effect.timeoutOrElse({
          duration: "3 seconds",
          orElse: () =>
            Effect.die(
              new Error(
                `TLS fixture did not observe ${label}: ` +
                  JSON.stringify({
                    closed: state.closed,
                    connections: state.connections,
                    requests: observed.length,
                    peerEnds: state.peerEnds,
                  }),
              ),
            ),
        }),
      )
    return {
      state,
      observed,
      clientPorts,
      clientDescriptors: (port: number) =>
        Effect.promise(async () => {
          const rows = (await readFile("/proc/net/tcp", "utf8"))
            .trim()
            .split("\n")
            .slice(1)
            .map((line) => line.trim().split(/\s+/))
          const local = port.toString(16).toUpperCase().padStart(4, "0")
          const remote = address.port.toString(16).toUpperCase().padStart(4, "0")
          const inodes = new Set(
            rows.filter((row) => row[1]?.endsWith(":" + local) && row[2]?.endsWith(":" + remote)).map((row) => row[9]),
          )
          const links = await Promise.all(
            (await readdir("/proc/self/fd")).map((name) =>
              readlink("/proc/self/fd/" + name).catch((error: unknown) => {
                if (error instanceof Error && "code" in error && error.code === "ENOENT") return ""
                throw error
              }),
            ),
          )
          return links.filter((link) => {
            const match = /^socket:\[(\d+)\]$/.exec(link)
            return match && inodes.has(match[1])
          })
        }),
      finishPeers: () => sockets.forEach((socket) => socket.end()),
      network: { address: "127.0.0.1", port: address.port, ca: good.cert.toString() },
      untrusted: { address: "127.0.0.1", port: address.port },
      wrongHost: { address: "127.0.0.1", port: address.port, ca: wrong.cert.toString() },
      hostCertificate: { certificate: good.cert.toString(), privateKey: good.key.toString() },
      wrongCertificate: () => server.setSecureContext(wrong),
      waitClosed: (after: number) => wait(() => state.closed > after, "socket closure after " + after),
      waitRequest: (after: number) => wait(() => observed.length > after, "request after " + after),
      waitIdle: () => wait(() => state.closed === state.connections, "idle sockets"),
      waitPeerEnd: (after: number) => wait(() => state.peerEnds > after, "peer EOF after " + after),
    }
  })
}
