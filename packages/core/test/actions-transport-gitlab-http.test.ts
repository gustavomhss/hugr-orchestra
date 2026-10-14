import { expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { Deferred, Effect, Exit, Fiber, Stream } from "effect"
import { TestClock } from "effect/testing"
import { ActionsError } from "../src/actions/error"
import { ActionsHttp } from "../src/actions/transport/http"
import { ActionsHttpFixture } from "./fixture/actions-http"
import { ActionsTransportFixture } from "./fixture/actions-transport"
import { ActionsNetworkFixture } from "./fixture/actions-network"

const it = ActionsTransportFixture.it

it.live("TLS disposition requires a known verification code and pre-HTTP phase", Effect.sync(() => {
  const provider = ActionsTransportFixture.gitlab
  for (const code of ["ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR", "ERR_SSL_SSLV3_ALERT_BAD_RECORD_MAC", "ERR_TLS_HANDSHAKE_TIMEOUT", "ECONNRESET"]) {
    const error = Object.assign(new Error("synthetic-credential"), { code })
    expect(ActionsHttp.requestError(provider, error, "handshake").disposition).toBe("unknown")
    expect(ActionsHttp.requestError(provider, error, "http_possible").disposition).toBe("unknown")
    expect(JSON.stringify(ActionsHttp.requestError(provider, error, "http_possible"))).not.toContain("synthetic-credential")
  }
  const verification = Object.assign(new Error("synthetic-credential"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" })
  expect(ActionsHttp.requestError(provider, verification, "handshake").disposition).toBe("definitely_unsent")
  expect(ActionsHttp.requestError(provider, verification, "http_possible").disposition).toBe("unknown")
}))

it.live("real TLS peer consumes mutation body before reset; transport outcome stays unknown and redacted", Effect.gen(function* () {
  const fixture = yield* ActionsHttpFixture.make()
  const body = { ref: "main", value: "synthetic-mutation-value" }
  const state = { consumed: 0 }
  fixture.serverState.handler = (request, response) => {
    if (request.url === "/api/v4/user") {
      response.writeHead(200, { "Content-Type": "application/json" }); response.end('{"id":913,"username":"fixture-user"}'); return
    }
    request.on("data", (chunk) => { state.consumed += chunk.length })
    request.once("end", () => request.socket.destroy())
  }
  const error = yield* fixture.service.request(fixture.binding(), { method: "POST", path: "projects/9347/pipeline", body }).pipe(Effect.flip)
  const mutation = fixture.requests.find((request) => request.method === "POST")
  expect(state.consumed).toBe(Buffer.byteLength(JSON.stringify(body)))
  expect(mutation?.size).toBe(state.consumed)
  expect(mutation?.digest).toBe(createHash("sha256").update(JSON.stringify(body)).digest("hex"))
  expect(error).toMatchObject({ kind: "transport_failed", disposition: "unknown", bindingID: fixture.binding().id })
  expect(JSON.stringify(error)).not.toContain("synthetic-provider")
  expect(JSON.stringify(error)).not.toContain(body.value)
  expect(fixture.requests.map((request) => [request.method, request.path])).toEqual([["GET", "/api/v4/user"], ["POST", "/api/v4/projects/9347/pipeline"]])
}), 120_000)

it.live("real local glab settings snapshot binds HTTPS identity and write despite config/proxy changes", Effect.gen(function* () {
  const fixture = yield* ActionsHttpFixture.make()
  const secret = "synthetic-provider"
  fixture.state.beforeLastRead = () => fs.writeFile(path.join(fixture.config, "config.yml"), JSON.stringify({ hosts: {
    [fixture.provider.hostname]: { token: "synthetic-next", proxy: "http://foreign.invalid:9", skip_tls_verify: "true" },
  } }), { mode: 0o600 })
  expect(yield* fixture.service.request(fixture.binding(), { method: "POST", path: "projects/9347/pipeline", body: { ref: "main", value: "synthetic-body" } }))
    .toMatchObject({ status: 200 })
  expect(fixture.requests.map((request) => [request.method, request.path, request.headers["private-token"]]))
    .toEqual([["GET", "/api/v4/user", secret], ["POST", "/api/v4/projects/9347/pipeline", secret]])
  expect(fixture.requests[1].prefix.toString()).toContain("synthetic-body")
  expect(fixture.observed.every((argv) => argv[0] === "version" || argv[0] === "config")).toBe(true)
  expect(fixture.observed.filter((argv) => argv[0] === "config").map((argv) => argv.slice(0, 3)))
    .toEqual(["token", "job_token", "is_oauth2", "ca_cert", "client_cert", "client_key"].map((key) => ["config", "get", key]))
  expect(fixture.observed.flat().join(" ")).not.toContain(secret)
  fixture.state.beforeLastRead = undefined
  for (const settings of [
    { token: "", job_token: "synthetic-job" },
    { token: "synthetic-oauth", is_oauth2: "true" },
  ]) {
    yield* fixture.configure(settings)
    expect(yield* fixture.service.request(fixture.binding(), { method: "GET", path: "projects/9347" })).toMatchObject({ status: 200 })
    const headers = fixture.requests.at(-1)?.headers
    if (settings.job_token) expect(headers?.["job-token"]).toBe("synthetic-job")
    if (settings.is_oauth2) expect(headers?.authorization).toBe("Bearer synthetic-oauth")
  }
  yield* fixture.configure({ token: "synthetic-next" })
  fixture.serverState.tokenAccounts["synthetic-next"] = "other-user"
  const before = fixture.requests.length
  expect(yield* fixture.service.request(fixture.binding(), { method: "POST", path: "projects/9347/pipeline", body: { ref: "main" } }).pipe(Effect.flip))
    .toMatchObject({ kind: "binding_stale", disposition: "definitely_unsent" })
  expect(fixture.requests.slice(before).map((request) => [request.method, request.path])).toEqual([["GET", "/api/v4/user"]])
  yield* fixture.configure({ token: "expired-oauth", is_oauth2: "true" })
  fixture.serverState.handler = (_request, response) => {
    response.writeHead(401, { "Content-Type": "application/json" }); response.end('{"message":"expired-oauth"}')
  }
  const error = yield* fixture.service.request(fixture.binding(), { method: "POST", path: "projects/9347/pipeline" }).pipe(Effect.flip)
  expect(error).toMatchObject({ kind: "not_authenticated", disposition: "definitely_unsent" })
  expect(JSON.stringify(error)).not.toContain("expired-oauth")
  expect(fixture.observed.every((argv) => !argv.includes("oauth2_refresh_token"))).toBe(true)
}), 120_000)

it.live("real TLS rejects invalid certificates despite inherited/configured skip flags and never forwards auth on redirects", Effect.gen(function* () {
  const fixture = yield* ActionsHttpFixture.make()
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  yield* Effect.acquireRelease(Effect.sync(() => { process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0" }), () => Effect.sync(() => {
    if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
    if (previous !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous
  }))
  yield* fixture.configure({ ca_cert: "", skip_tls_verify: "true" })
  const rejected = yield* fixture.service.request(fixture.binding(), { method: "GET", path: "user" }).pipe(Effect.flip)
  expect(rejected).toMatchObject({ kind: "transport_failed", disposition: "definitely_unsent" })
  expect(fixture.requests).toHaveLength(0)
  yield* fixture.configure({})
  const foreign = yield* ActionsNetworkFixture.make()
  fixture.serverState.handler = (_request, response) => {
    response.writeHead(302, { Location: `${foreign.provider.apiOrigin}/api/v4/exfil?signature=synthetic-signed` }); response.end()
  }
  expect(yield* fixture.service.request(fixture.binding(), { method: "GET", path: "redirect" }).pipe(Effect.flip))
    .toMatchObject({ kind: "host_mismatch", disposition: "unknown" })
  expect(yield* fixture.service.bytes(fixture.binding(), { method: "GET", path: "redirect" }).pipe(Stream.runDrain, Effect.flip))
    .toMatchObject({ kind: "host_mismatch", disposition: "unknown" })
  expect(fixture.requests.map((request) => request.path)).toEqual(["/api/v4/redirect", "/api/v4/redirect"])
  expect(foreign.requests).toHaveLength(0)
}), 120_000)

it.live("real local helper private CA and mTLS references preserve certificate verification", Effect.gen(function* () {
  const fixture = yield* ActionsHttpFixture.make(true)
  const error = yield* fixture.service.request(fixture.binding(), { method: "GET", path: "projects/9347" }).pipe(Effect.flip)
  expect(error.kind).toBe("transport_failed")
  expect(fixture.requests).toHaveLength(0)
  yield* fixture.configure({ client_cert: path.join(fixture.root, "cert.pem"), client_key: path.join(fixture.root, "key.pem") })
  expect(yield* fixture.service.request(fixture.binding(), { method: "GET", path: "projects/9347" })).toMatchObject({ status: 200 })
  expect(fixture.requests[0].authorized).toBe(true)
}), 120_000)

it.live("GitLab HTTP metadata enforces bounds, statuses, 204 and safe diagnostics", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture()
  for (const [status, kind] of [[401, "not_authenticated"], [403, "permission_denied"], [404, "not_found"], [429, "rate_limited"], [500, "transport_failed"]] as const) {
    yield* fixture.reply({ stdout: ActionsTransportFixture.response(status, '{"message":"synthetic-provider"}', `Content-Type: application/json\r\n${status === 429 ? "Retry-After: 3\r\n" : ""}`) })
    const error = yield* fixture.service.request(fixture.binding(ActionsTransportFixture.gitlab), { method: "GET", path: "projects/9347" }).pipe(Effect.flip)
    expect(error.kind).toBe(kind)
    expect(error.disposition).toBe(status === 500 ? "unknown" : "definitely_rejected")
    expect(JSON.stringify(error)).not.toContain("synthetic-provider")
    if (status === 429) expect(error.retryAfter).toBe(3)
  }
  yield* fixture.reply({ stdout: ActionsTransportFixture.response(200, "{}"), padding: 3 * 1024 * 1024 })
  expect(yield* fixture.service.request(fixture.binding(ActionsTransportFixture.gitlab), { method: "GET", path: "projects/9347" }).pipe(Effect.flip))
    .toMatchObject({ kind: "metadata_truncated", disposition: "unknown" })
  yield* fixture.reply({ stdout: ActionsTransportFixture.response(204, "") })
  expect(yield* fixture.service.request(fixture.binding(ActionsTransportFixture.gitlab), { method: "GET", path: "projects/9347" }))
    .toMatchObject({ status: 204, data: null })
}))

it.effect("GitLab raw HTTPS watchdog closes socket while consumer holds a chunk", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ stdout: "first\n\n", hold: true })
  const received = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const fiber = yield* fixture.service.bytes(fixture.binding(ActionsTransportFixture.gitlab), { method: "GET", path: "projects/9347/jobs/52/trace" })
    .pipe(Stream.runForEach(() => Deferred.succeed(received, undefined).pipe(Effect.andThen(Deferred.await(release)))), Effect.flip, Effect.forkChild)
  yield* Deferred.await(received)
  expect(fixture.network.sockets.size).toBeGreaterThan(0)
  yield* TestClock.adjust("6 minutes")
  yield* Effect.promise(async () => {
    const deadline = Date.now() + 2000
    while (Date.now() < deadline && fixture.network.sockets.size) await Bun.sleep(10)
  })
  const live = fixture.network.sockets.size
  yield* Deferred.succeed(release, undefined)
  const exit = yield* Fiber.await(fiber)
  expect(live).toBe(0)
  expect(Exit.isSuccess(exit)).toBe(true)
  if (Exit.isSuccess(exit)) expect(exit.value.message).toContain("deadline exceeded")
}), 20_000)

it.live("GitLab multipart emits exact filename and streams file ingress before producer completion", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture()
  const ingress = yield* Deferred.make<void>()
  const block = Buffer.from(Array.from({ length: 16 * 1024 }, (_, index) => index % 256))
  const filename = 'bundle "prod".bin'
  const hash = createHash("sha256")
  const expected = createHash("sha256")
  Array.from({ length: 512 }).forEach(() => expected.update(block))
  const state = { pending: Buffer.alloc(0), file: false, size: 0, header: "", final: false }
  fixture.network.state.handler = (request, response) => {
    if (request.url === "/api/v4/user") {
      response.writeHead(200, { "Content-Type": "application/json" }); response.end('{"id":913,"username":"fixture-user"}'); return
    }
    const marker = Buffer.from(`\r\n--${String(request.headers["content-type"]).split("boundary=")[1]}--\r\n`)
    request.on("data", (chunk: Buffer) => {
      state.pending = Buffer.concat([state.pending, chunk])
      if (!state.file) {
        const start = state.pending.indexOf('Content-Disposition: form-data; name="file"')
        const end = start < 0 ? -1 : state.pending.indexOf("\r\n\r\n", start)
        if (end < 0) return
        state.header = state.pending.subarray(start, end).toString()
        state.pending = state.pending.subarray(end + 4)
        state.file = true
      }
      if (state.pending.length <= marker.length) return
      const bytes = state.pending.subarray(0, state.pending.length - marker.length)
      hash.update(bytes); state.size += bytes.length
      state.pending = state.pending.subarray(state.pending.length - marker.length)
      Deferred.doneUnsafe(ingress, Exit.succeed(undefined))
    })
    request.on("end", () => {
      state.final = state.pending.equals(marker)
      response.writeHead(201, { "Content-Type": "application/json" }); response.end('{"id":829}')
    })
  }
  const bytes = Stream.concat(Stream.make(block), Stream.unwrap(Deferred.await(ingress).pipe(
    Effect.timeoutOrElse({ duration: "2 seconds", orElse: () => Effect.fail(new ActionsError({ kind: "transfer_failed", message: "Multipart file did not stream before producer completion" })) }),
    Effect.as(Stream.fromIterable(Array.from({ length: 511 }, () => block))),
  )))
  expect(yield* fixture.service.upload(fixture.binding(ActionsTransportFixture.gitlab),
    { method: "POST", path: "projects/9347/secure_files", query: { name: filename } }, { filename, bytes }))
    .toMatchObject({ status: 201, data: { id: 829 } })
  expect(state.header).toContain('filename="bundle \\"prod\\".bin"')
  expect(state.size).toBe(block.length * 512)
  expect(state.final).toBe(true)
  expect(hash.digest("hex")).toBe(expected.digest("hex"))
  expect(fixture.network.requests.at(-1)?.chunks).toBeGreaterThan(1)
}), 30_000)

it.live("credential helper errors and truncation never reveal credential material", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ settings: { token: "synthetic-provider".repeat(2000) } })
  const error = yield* fixture.service.request(fixture.binding(ActionsTransportFixture.gitlab), { method: "GET", path: "projects/9347" }).pipe(Effect.flip)
  expect(error).toMatchObject({ kind: "not_authenticated", disposition: "definitely_unsent" })
  expect(JSON.stringify(error)).not.toContain("synthetic-provider")
  expect(fixture.network.requests).toHaveLength(0)
  yield* fixture.reply({ configCode: 1 })
  const failed = yield* fixture.service.request(fixture.binding(ActionsTransportFixture.gitlab), { method: "GET", path: "projects/9347" }).pipe(Effect.flip)
  expect(JSON.stringify(failed)).not.toContain("synthetic-credential")
}))
