export * as ActionsNetworkFixture from "./actions-network"

import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createServer, TLSSocket } from "node:tls"
import type { Socket } from "node:net"
import { EventEmitter } from "node:events"
import { createHash } from "node:crypto"
import { Effect, Schedule } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../../src/process"

// A wire-level TLS/HTTP fixture avoids Bun's Node HTTP-server compatibility
// layer treating chunked request bodies as empty. It never buffers a whole file.
export class Request extends EventEmitter<{ data: [Buffer]; end: [] }> {
  constructor(readonly method: string, readonly url: string, readonly headers: Record<string, string>, readonly socket: TLSSocket) { super() }
}
export class Response {
  constructor(readonly socket: TLSSocket) {}
  writeHead(status: number, headers: Record<string, string>) {
    this.socket.write(`HTTP/1.1 ${status} Status\r\nConnection: close\r\nTransfer-Encoding: chunked\r\n${Object.entries(headers).map(([key, value]) => `${key}: ${value}\r\n`).join("")}\r\n`)
  }
  write(body: string | Buffer) {
    const bytes = Buffer.from(body)
    if (bytes.length) this.socket.write(Buffer.concat([Buffer.from(`${bytes.length.toString(16)}\r\n`), bytes, Buffer.from("\r\n")]))
  }
  end(body?: string | Buffer) {
    if (body) this.write(body)
    this.socket.end("0\r\n\r\n")
  }
}

export const make = Effect.fnUntraced(function* (mutual = false) {
  const proc = yield* AppProcess.Service
  const root = yield* Effect.acquireRelease(Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "actions-network-"))),
    (root) => Effect.promise(() => fs.rm(root, { recursive: true, force: true })))
  const run = (executable: string, args: string[]) => proc.run(ChildProcess.make(executable, args, { cwd: root, extendEnv: true, stdin: "ignore" }),
    { maxOutputBytes: 32 * 1024, maxErrorBytes: 32 * 1024, timeout: "30 seconds" }).pipe(Effect.flatMap(AppProcess.requireSuccess))
  yield* run(process.platform === "win32" ? "C:\\Program Files\\Git\\usr\\bin\\openssl.exe" : "/usr/bin/openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "key.pem", "-out", "cert.pem", "-days", "1",
    "-subj", "/CN=provider.fixture", "-addext", "subjectAltName=DNS:provider.fixture,DNS:localhost,IP:127.0.0.1",
  ])
  const requests: { path: string; method: string; headers: Record<string, string>; size: number; chunks: number; prefix: Buffer; digest?: string; authorized: boolean }[] = []
  const sockets = new Set<TLSSocket>()
  const pending = new Set<Socket>()
  const state = {
    username: "fixture-user", tokenAccounts: {} as Record<string, string>,
    handler: undefined as ((request: Request, response: Response) => void) | undefined,
    onRequest: undefined as (() => void) | undefined,
  }
  const server = yield* Effect.acquireRelease(Effect.promise(async () => createServer({
    key: await fs.readFile(path.join(root, "key.pem")), cert: await fs.readFile(path.join(root, "cert.pem")),
    ca: await fs.readFile(path.join(root, "cert.pem")), requestCert: mutual, rejectUnauthorized: mutual,
  }, (socket) => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
    socket.on("error", () => socket.destroy())
    const input = { buffer: Buffer.alloc(0), request: undefined as Request | undefined, chunked: false, remaining: 0, delimiter: false, ended: false }
    const emit = (bytes: Buffer) => input.request?.emit("data", bytes)
    socket.on("data", (bytes: Buffer) => {
      input.buffer = Buffer.concat([input.buffer, bytes])
      if (!input.request) {
        const end = input.buffer.indexOf("\r\n\r\n")
        if (end < 0) { if (input.buffer.length > 64 * 1024) socket.destroy(); return }
        const lines = input.buffer.subarray(0, end).toString().split("\r\n")
        const [method, url] = lines[0].split(" ")
        const headers = Object.fromEntries(lines.slice(1).map((line) => {
          const at = line.indexOf(":"); return [line.slice(0, at).toLowerCase(), line.slice(at + 1).trim()]
        }))
        input.buffer = input.buffer.subarray(end + 4)
        input.request = new Request(method, url, headers, socket)
        input.chunked = headers["transfer-encoding"] === "chunked"
        input.remaining = Number(headers["content-length"] ?? 0)
        const observed = { path: url, method, headers, size: 0, chunks: 0, prefix: Buffer.alloc(0), digest: undefined as string | undefined, authorized: socket.authorized }
        requests.push(observed)
        const hash = createHash("sha256")
        input.request.on("data", (chunk) => {
          hash.update(chunk); observed.size += chunk.length; observed.chunks++
          if (observed.prefix.length < 64 * 1024) observed.prefix = Buffer.concat([observed.prefix, chunk.subarray(0, 64 * 1024 - observed.prefix.length)])
        })
        input.request.on("end", () => { observed.digest = hash.digest("hex") })
        const response = new Response(socket)
        state.onRequest?.()
        if (state.handler) state.handler(input.request, response)
        if (!state.handler) {
          const respond = () => {
            response.writeHead(200, { "Content-Type": "application/json" })
            const token = headers["private-token"] ?? headers["job-token"] ?? headers.authorization ?? ""
            response.end(JSON.stringify({ id: 913, username: state.tokenAccounts[token] ?? state.username, path_with_namespace: "acme/nested/widget" }))
          }
          if (method === "GET") respond()
          if (method !== "GET") input.request.once("end", respond)
        }
      }
      while (!input.ended) {
        if (input.delimiter) {
          if (input.buffer.length < 2) return
          input.buffer = input.buffer.subarray(2); input.delimiter = false
        }
        if (input.chunked && !input.remaining) {
          const line = input.buffer.indexOf("\r\n")
          if (line < 0) return
          input.remaining = Number.parseInt(input.buffer.subarray(0, line).toString(), 16)
          input.buffer = input.buffer.subarray(line + 2)
          if (!input.remaining) { input.ended = true; input.request.emit("end"); return }
        }
        if (!input.remaining) { input.ended = true; input.request.emit("end"); return }
        if (!input.buffer.length) return
        const length = Math.min(input.remaining, input.buffer.length)
        emit(input.buffer.subarray(0, length))
        input.buffer = input.buffer.subarray(length); input.remaining -= length
        if (input.chunked && !input.remaining) input.delimiter = true
      }
    })
  })), (server) => Effect.promise(() => new Promise<void>((resolve) => {
    pending.forEach((socket) => socket.destroy())
    sockets.forEach((socket) => socket.destroy())
    server.close(() => resolve())
  })))
  server.on("connection", (socket) => { pending.add(socket); socket.on("close", () => pending.delete(socket)) })
  server.on("tlsClientError", (_error, socket) => socket.destroy())
  yield* Effect.promise(() => new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)))
  const address = server.address()
  if (!address || typeof address === "string") return yield* Effect.die("Fixture TLS server has no address")
  return {
    root, requests, run, state, sockets,
    provider: { kind: "gitlab", hostname: `127.0.0.1:${address.port}`, apiOrigin: `https://127.0.0.1:${address.port}` } as const,
    install: () => Effect.gen(function* () {
      const windows = process.platform === "win32"
      if (process.arch !== "x64" || (!windows && process.platform !== "linux")) return yield* Effect.die("Real glab qualification requires Linux/Windows x64 CI")
      const asset = windows ? "glab_1.118.0_windows_amd64.zip" : "glab_1.118.0_linux_amd64.tar.gz"
      const bytes = yield* Effect.promise(async () => {
        const response = await fetch(`https://gitlab.com/gitlab-org/cli/-/releases/v1.118.0/downloads/${asset}`, { signal: AbortSignal.timeout(60_000) })
        if (!response.ok) throw new Error(`glab fixture download failed: HTTP ${response.status}`)
        return Buffer.from(await response.arrayBuffer())
      })
      const expected = windows ? "f9e843edb625a6f78686d8f421f1e80f98f76fe993b75263c1aa9f428c8a32ff" : "f3782ddb62b6ab20d0031699ea7b43f345dc6f63e991883660e21343b9524931"
      if (createHash("sha256").update(bytes).digest("hex") !== expected) return yield* Effect.die("glab fixture release digest mismatch")
      yield* Effect.promise(() => fs.writeFile(path.join(root, asset), bytes))
      yield* run(windows ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "/usr/bin/tar", ["-xf", asset, "-C", root])
      const executable = path.join(root, "bin", windows ? "glab.exe" : "glab")
      if (!(yield* Effect.promise(() => Bun.file(executable).exists()))) return yield* Effect.die("glab release fixture executable missing")
      // A Windows image written moments ago can be briefly held by the runner's scanner and fail its first spawn. The
      // product maps every credential-read failure to one redacted message, so settle that here, where the real error shows.
      yield* run(executable, ["version"]).pipe(Effect.retry({ times: 20, schedule: Schedule.spaced("250 millis") }))
      return executable
    }),
  }
})
