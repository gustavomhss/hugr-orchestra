export * as OutputNetwork from "./output-network"

import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { createServer, TLSSocket } from "node:tls"
import type { Socket } from "node:net"
import { Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../../src/process"
import { OutputFixture } from "./output-fixture"

type Observed = { readonly path: string; readonly headers: Record<string, string>; readonly method: string; readonly signed: boolean; readonly clientCertificate: boolean }

export const make = Effect.fnUntraced(function* () {
  const proc = yield* AppProcess.Service
  const root = yield* Effect.acquireRelease(Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "actions-output-"))),
    (root) => Effect.promise(() => fs.rm(root, { recursive: true, force: true })))
  const run = (command: string, args: string[]) => proc.run(ChildProcess.make(command, args, { cwd: root, extendEnv: true, stdin: "ignore" }),
    { maxOutputBytes: 32 * 1024, maxErrorBytes: 32 * 1024, timeout: "30 seconds" }).pipe(Effect.flatMap(AppProcess.requireSuccess))
  const openssl = process.platform === "win32" ? "C:\\Program Files\\Git\\usr\\bin\\openssl.exe" : "/usr/bin/openssl"
  // Config-file extensions avoid relying on OpenSSL's -addext on macOS.
  yield* Effect.promise(() => fs.writeFile(path.join(root, "tls.cnf"), [
    "[req]", "distinguished_name=dn", "[dn]", "CN=localhost", "[certificate]",
    "subjectAltName=DNS:localhost,IP:127.0.0.1", "basicConstraints=critical,CA:TRUE",
    "keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign", "",
  ].join("\n")))
  const certificate = (name: string) => Effect.gen(function* () {
    yield* run(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${name}-key.pem`, "-out", `${name}-cert.pem`, "-days", "1",
      "-subj", "/CN=localhost", "-config", "tls.cnf", "-extensions", "certificate"])
    return { key: yield* Effect.promise(() => fs.readFile(path.join(root, `${name}-key.pem`))),
      cert: yield* Effect.promise(() => fs.readFile(path.join(root, `${name}-cert.pem`))) }
  })
  const tls = { native: yield* certificate("native"), signed: yield* certificate("signed") }
  const observed: Observed[] = []
  const state = { mode: "normal", actor: "fixture-user", nativeGets: 0, signedGets: 0, onClose: undefined as (() => void) | undefined }
  const sockets = new Set<Socket>()
  const origin = { signed: "" }
  const serve = (signed: boolean, material = signed ? tls.signed : tls.native) => Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(Effect.sync(() => createServer({ ...material,
      ca: tls.native.cert, requestCert: true, rejectUnauthorized: !signed }, (socket: TLSSocket) => {
      socket.on("error", () => socket.destroy())
      const input = { bytes: Buffer.alloc(0), handled: false }
      socket.on("data", (chunk: Buffer) => {
        if (input.handled) return
        input.bytes = Buffer.concat([input.bytes, chunk])
        if (input.bytes.length > 16 * 1024) { socket.destroy(); return }
        const end = input.bytes.indexOf("\r\n\r\n")
        if (end < 0) return
        input.handled = true
        const lines = input.bytes.subarray(0, end).toString("ascii").split("\r\n")
        const [method, target] = lines[0].split(" ")
        const headers = Object.fromEntries(lines.slice(1).map((line) => {
          const at = line.indexOf(":"); return [line.slice(0, at).toLowerCase(), line.slice(at + 1).trim()]
        }))
        observed.push({ path: target, method, headers, signed, clientCertificate: !!socket.getPeerCertificate().raw })
        const reply = (status: number, headers: Record<string, string>, body = Buffer.alloc(0), finish = true) => {
          socket.write(`HTTP/1.1 ${status} Fixture\r\nConnection: close\r\n${Object.entries(headers).map(([key, value]) => `${key}: ${value}\r\n`).join("")}\r\n`)
          if (body.length) socket.write(body)
          if (finish) socket.end()
        }
        const json = (data: unknown) => {
          const body = Buffer.from(JSON.stringify(data))
          reply(200, { "Content-Type": "application/json", "Content-Length": String(body.length) }, body)
        }
        if (method !== "GET") { reply(405, { "Content-Length": "0" }); return }
        if (!signed) {
          if (target === "/api/v4/user") { json({ username: state.actor }); return }
          if (target === "/api/v4/projects/21") { json({ id: 21 }); return }
          if (target === "/api/v4/projects/21/jobs/8") { json(OutputFixture.job); return }
          if (!target.startsWith("/api/v4/projects/21/jobs/8/artifacts")) { reply(404, { "Content-Length": "0" }); return }
          state.nativeGets++
          const location = state.mode === "unsafe-native" ? "http://signed.invalid/?signature=synthetic-url-secret"
            : `${origin.signed}/${state.nativeGets === 1 && state.mode === "renew" ? "expired" : "file"}?signature=synthetic-url-secret`
          reply(302, { Location: location, "Content-Length": "0", "Set-Cookie": "synthetic-native-cookie=secret; Secure" })
          return
        }
        state.signedGets++
        if (target.startsWith("/expired")) { reply(403, { "Content-Length": "0" }); return }
        if (state.mode === "deny") { reply(403, { "Content-Length": "0" }); return }
        if (state.mode === "redirect") {
          if (!target.startsWith("/final")) { reply(307, { Location: "/final?signature=synthetic-url-secret", "Content-Length": "0" }); return }
        }
        if (state.mode === "unsafe-hop") { reply(302, { Location: "https://user:pass@signed.invalid/file#fragment", "Content-Length": "0" }); return }
        if (state.mode === "loop") { reply(302, { Location: "/loop?signature=synthetic-url-secret", "Content-Length": "0" }); return }
        const blocked = state.mode === "blocked"
        if (blocked && state.onClose) socket.once("close", state.onClose)
        reply(200, { "Content-Type": "application/octet-stream", "Content-Length": state.mode === "partial" || blocked ? "1000" : String(OutputFixture.bytes.length),
          "Content-Disposition": "attachment; filename*=UTF-8''..%2F..%2Fresult.bin", Digest: "sha-256=synthetic-digest", "Accept-Ranges": "bytes" },
          Buffer.from(OutputFixture.bytes), state.mode !== "partial" && !blocked)
        if (state.mode === "partial") {
          const timer = setTimeout(() => socket.destroy(), 30)
          socket.once("close", () => clearTimeout(timer))
        }
      })
    })), (server) => Effect.promise(() => new Promise<void>((resolve) => {
      sockets.forEach((socket) => socket.destroy()); server.close(() => resolve())
    })))
    server.on("connection", (socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)) })
    // Bun emits tlsClientError for an absent OPTIONAL client certificate too.
    // Destroying that socket makes credential-free signed GETs impossible.
    // Allow only that absent-peer event; other errors and native mTLS stay fatal.
    server.on("tlsClientError", (error, socket) => {
      if (signed && "code" in error && error.code === "UNABLE_TO_GET_ISSUER_CERT" && !socket.getPeerCertificate()?.raw) return
      socket.destroy()
    })
    yield* Effect.promise(() => new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)))
    const address = server.address()
    if (!address || typeof address === "string") return yield* Effect.die("Output fixture server has no TCP address")
    return { server, origin: `https://127.0.0.1:${address.port}` }
  })
  const signed = yield* serve(true)
  origin.signed = signed.origin
  const native = yield* serve(false)
  // Bun 1.3.14 snapshots TLS options at listen(); setSecureContext does not
  // replace the live default identity. Negatives require a new scoped listener.
  const signedWithCertificate = (material: typeof tls.signed) => serve(true, material).pipe(
    Effect.tap((listener) => Effect.sync(() => { origin.signed = listener.origin })))
  const windows = process.platform === "win32"
  // Digests from the pinned release's checksums.txt, including both macOS ABIs.
  const release = [
    { platform: "win32", arch: "x64", asset: "glab_1.118.0_windows_amd64.zip", digest: "f9e843edb625a6f78686d8f421f1e80f98f76fe993b75263c1aa9f428c8a32ff" },
    { platform: "linux", arch: "x64", asset: "glab_1.118.0_linux_amd64.tar.gz", digest: "f3782ddb62b6ab20d0031699ea7b43f345dc6f63e991883660e21343b9524931" },
    { platform: "darwin", arch: "x64", asset: "glab_1.118.0_darwin_amd64.tar.gz", digest: "4807060de413264c69a36d5829e186918f58c5dcc8b884d75624b7052a5814ba" },
    { platform: "darwin", arch: "arm64", asset: "glab_1.118.0_darwin_arm64.tar.gz", digest: "d289e2ba48f85cc0639cb77e4ea78c14d222d099e8d545c7bb687ba779255f47" },
  ].find((entry) => entry.platform === process.platform && entry.arch === process.arch)
  if (!release) return yield* Effect.die("Qualified glab output fixture requires Linux/Windows x64 or macOS x64/arm64 CI")
  const archive = yield* Effect.promise(async () => {
    const response = await fetch(`https://gitlab.com/gitlab-org/cli/-/releases/v1.118.0/downloads/${release.asset}`, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw new Error(`Qualified glab fixture download failed: HTTP ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
  })
  if (createHash("sha256").update(archive).digest("hex") !== release.digest) return yield* Effect.die("Qualified glab fixture digest mismatch")
  yield* Effect.promise(() => fs.writeFile(path.join(root, release.asset), archive))
  yield* run(windows ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "/usr/bin/tar", ["-xf", release.asset, "-C", root])
  yield* Effect.promise(() => fs.mkdir(path.join(root, "config"), { mode: 0o700 }))
  yield* Effect.promise(() => fs.writeFile(path.join(root, "config", "config.yml"), JSON.stringify({ hosts: { [new URL(native.origin).host]: {
    token: "synthetic-native-token", ca_cert: path.join(root, "native-cert.pem"), client_cert: path.join(root, "native-cert.pem"), client_key: path.join(root, "native-key.pem"),
  } } }), { mode: 0o600 }))
  // Repeated in-process Bun.build reuses stale file state (SDK fixtures use the
  // same fresh-compiler boundary). Keep the real source graph and omni spawning.
  yield* run(process.execPath, ["build", path.join(import.meta.dir, "output-worker.ts"),
    "--target", "node", "--format", "esm", "--outfile", path.join(root, "output-worker.mjs")])
  const command = (mode: string, args: readonly string[] = []) => ChildProcess.make("node", [path.join(root, "output-worker.mjs"), native.origin, mode, ...args], {
    cwd: root, extendEnv: true, stdin: mode === "cancel" || mode === "deadline" ? "pipe" : "ignore", stdout: "pipe", stderr: "pipe",
    env: { PATH: `${path.join(root, "bin")}${path.delimiter}${process.env.PATH ?? process.env.Path ?? ""}`,
      GLAB_CONFIG_DIR: path.join(root, "config"), NODE_EXTRA_CA_CERTS: path.join(root, "signed-cert.pem"),
      NODE_TLS_REJECT_UNAUTHORIZED: "1", GITLAB_TOKEN: "", GITLAB_ACCESS_TOKEN: "", OAUTH_TOKEN: "", CI_JOB_TOKEN: "", JOB_TOKEN: "", GLAB_IS_OAUTH2: "", GLAB_USE_KEYRING: "false",
      XDG_DATA_HOME: path.join(root, "data"), XDG_CONFIG_HOME: path.join(root, "config"), XDG_CACHE_HOME: path.join(root, "cache"), XDG_STATE_HOME: path.join(root, "state"),
      ORCHESTRA_TEST_HOME: root },
  })
  const peerCertificate = (peer: string, ca: string, servername: string) => proc.run(command("peer-certificate", [peer, ca, servername]),
    { timeout: "10 seconds", maxOutputBytes: 32 * 1024, maxErrorBytes: 32 * 1024 }).pipe(
    Effect.flatMap(AppProcess.requireSuccess),
    Effect.map((result) => Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ fingerprint: Schema.String })))(result.stdout.toString().trim()).fingerprint))
  return { proc, root, state, observed, sockets, command, run, signed, signedWithCertificate, peerCertificate, openssl, tls }
})
