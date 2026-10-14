import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Fiber, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import type { ActionsContract } from "../src/actions/contract"
import { ActionsError } from "../src/actions/error"
import { ActionsTransportFixture } from "./fixture/actions-transport"

const it = ActionsTransportFixture.it

it.live("resolves exact native project IDs and current CLI account on explicit hosts", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ routes: {
    "repos/acme/widget": { stdout: ActionsTransportFixture.response(200, '{"id":913,"full_name":"Acme/Widget"}') },
    "projects/acme%2Fnested%2Fwidget": { stdout: ActionsTransportFixture.response(200, '{"id":722,"path_with_namespace":"acme/nested/widget"}') },
    "user": { stdout: ActionsTransportFixture.response(200, '{"login":"ada","username":"grace"}') },
  } })
  expect(yield* fixture.service.resolve(ActionsTransportFixture.github, "acme/widget"))
    .toEqual({ projectID: "913", projectPath: "Acme/Widget", account: "ada" })
  expect(yield* fixture.service.resolve(fixture.network.provider, "acme/nested/widget"))
    .toEqual({ projectID: "722", projectPath: "acme/nested/widget", account: "grace" })
  const calls = yield* fixture.calls()
  expect(calls.map((call) => call.argv.at(-1)))
    .toEqual(["repos/acme/widget", "user"])
  expect(calls.map((call) => call.argv.slice(0, 6))).toEqual([
    ["api", "--hostname", "github.com", "--method", "GET", "--include"],
    ["api", "--hostname", "github.com", "--method", "GET", "--include"],
  ])
  expect(fixture.network.requests.map((request) => request.path)).toEqual(["/api/v4/projects/acme%2Fnested%2Fwidget", "/api/v4/user"])
}))

it.live("JSON secrets travel only through stdin; method, query, version and CLI environment stay explicit", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ stdout: ActionsTransportFixture.response(201, '{\n "id": 9374,\n "nested": [true,null]\n}\n', "Content-Type: application/json\r\nX-Native: first\r\nX-Native: second\r\n") })
  const body = { value: 'synthetic-secret\n"quoted" $(touch sentinel) {owner} :branch', protected: false }
  const result = yield* fixture.service.request(fixture.binding(), { method: "PATCH", path: "/repos/acme/widget/actions/variables/X", query: { per_page: 50, ref: ":branch {owner}" }, body })
  expect(result).toEqual({ status: 201, headers: { "content-type": "application/json", "x-native": "first, second" }, data: { id: 9374, nested: [true, null] } })
  const call = (yield* fixture.calls())[0]
  expect(call.argv).toEqual(["api", "--hostname", "github.com", "--method", "PATCH", "--include", "--header",
    "X-GitHub-Api-Version: 2026-03-10", "--header", "Content-Type: application/json", "--input", "-", "--",
    "repos/acme/widget/actions/variables/X?per_page=50&ref=%3Abranch+%7Bowner%7D"])
  expect(JSON.parse(Buffer.from(call.stdin, "base64").toString())).toEqual(body)
  expect(call.argv.join(" ")).not.toContain("synthetic-secret")
  expect(call.env).toMatchObject({ GH_PROMPT_DISABLED: "1", GLAB_NO_PROMPT: "1", NO_COLOR: "1", GH_NO_UPDATE_NOTIFIER: "1",
    GLAB_CHECK_UPDATE: "false", GLAB_DEBUG_HTTP: "false", GH_DEBUG: "", GITLAB_API_HOST: "github.com", GLAB_API_PROTOCOL: "https", GITLAB_SUBFOLDER: "/" })
  expect(fixture.commands.every((command) => command._tag === "StandardCommand" && command.options.shell === false)).toBe(true)
}))

it.live("self-hosted GitHub does not claim github.com's pinned-version capability", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ stdout: ActionsTransportFixture.response(204, "", "") })
  expect(yield* fixture.service.request(fixture.binding({ kind: "github", hostname: "github.example.com", apiOrigin: "https://github.example.com/api/v3", version: "3.17" }),
    { method: "POST", path: "repos/acme/widget/actions/workflows/8/dispatches", body: { ref: "main" } })).toEqual({ status: 204, headers: {}, data: null })
  expect((yield* fixture.calls())[0].argv).not.toContain("X-GitHub-Api-Version: 2026-03-10")
}))

it.live("documented empty rerun and cancellation acknowledgements retain native success status", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture()
  for (const status of [201, 202, 204]) {
    yield* fixture.reply({ stdout: ActionsTransportFixture.response(status, "", "") })
    expect(yield* fixture.service.request(fixture.binding(), {
      method: "POST", path: "repositories/913/actions/runs/8/cancel",
    })).toEqual({ status, headers: {}, data: null })
  }
  yield* fixture.reply({ stdout: ActionsTransportFixture.response(200, "", "") })
  expect(yield* fixture.service.request(fixture.binding(), { method: "GET", path: "user" }).pipe(Effect.flip))
    .toMatchObject({ kind: "transport_failed", disposition: "unknown" })
  yield* fixture.reply({ stdout: ActionsTransportFixture.response(202, "", ""), code: 1 })
  expect(yield* fixture.service.request(fixture.binding(), {
    method: "POST", path: "repositories/913/actions/runs/8/cancel",
  }).pipe(Effect.flip)).toMatchObject({ kind: "transport_failed", disposition: "unknown" })
}))

it.live("unsafe native lookup, authority, traversal, placeholder and secret-query paths fail before spawn", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture()
  for (const path of ["https://evil.test/x", "//evil.test/x", "repos/../user", "repos/%2e%2e/user", "repos/%252e%252e/user",
    "repos/{owner}/{repo}", "projects/:id", "projects/x\\user", "user?token=x", "user#fragment",
    "projects/a%2F..%2Fb", "projects/a%252Fb", "projects/%2F%2Fevil.test", "projects/%00bad", "projects/%5Cbad"]) {
    expect(yield* fixture.service.request(fixture.binding(), { method: "GET", path }).pipe(Effect.flip))
      .toMatchObject({ kind: "invalid_input", disposition: "definitely_unsent" })
  }
  for (const project of ["acme/../widget", "https://github.com/acme/widget", "acme/{repo}", "acme/widget/extra"]) {
    expect(yield* fixture.service.resolve(ActionsTransportFixture.github, project).pipe(Effect.flip))
      .toMatchObject({ kind: "invalid_input", disposition: "definitely_unsent" })
  }
  expect(yield* fixture.service.request(fixture.binding({ ...ActionsTransportFixture.gitlab, apiOrigin: "https://evil.test" }), { method: "GET", path: "user" }).pipe(Effect.flip))
    .toMatchObject({ kind: "host_mismatch", disposition: "definitely_unsent" })
  expect(yield* fixture.service.request(fixture.binding({ ...ActionsTransportFixture.github, hostname: "github.com@evil.test" }), { method: "GET", path: "user" }).pipe(Effect.flip))
    .toMatchObject({ kind: "host_mismatch", disposition: "definitely_unsent" })
  expect(yield* fixture.service.request(fixture.binding(), { method: "POST", path: "user", query: { token: "secret" } }).pipe(Effect.flip))
    .toMatchObject({ kind: "invalid_input", disposition: "definitely_unsent" })
  expect(fixture.handles).toHaveLength(0)
}))

it.live("encoded workflow filenames and GitLab file/project segments preserve native data", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ stdout: ActionsTransportFixture.response(200, "{}") })
  for (const path of [
    "repos/acme/widget/actions/workflows/build%20release.yml",
    "repos/acme/widget/contents/config%23prod.yml",
    "projects/acme%2Fnested%2Fwidget/repository/files/config%23prod.yml",
    "projects/9347/repository/files/dir%2Fbuild%20release.yml/raw",
  ]) {
    expect(yield* fixture.service.request(fixture.binding(path.startsWith("projects/") ? ActionsTransportFixture.gitlab : ActionsTransportFixture.github), { method: "GET", path }))
      .toMatchObject({ status: 200, data: {} })
  }
  expect((yield* fixture.calls()).map((call) => call.argv.at(-1))).toEqual([
    "repos/acme/widget/actions/workflows/build%20release.yml", "repos/acme/widget/contents/config%23prod.yml",
  ])
  expect(fixture.network.requests.map((request) => request.path)).toEqual([
    "/api/v4/projects/acme%2Fnested%2Fwidget/repository/files/config%23prod.yml", "/api/v4/projects/9347/repository/files/dir%2Fbuild%20release.yml/raw",
  ])
}))

it.live("native identities reject mutable IDs and malformed accounts without coercion", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture()
  for (const id of ["acme/widget", "0", "-1", "1.5", "1e3", " 12", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    yield* fixture.reply({ stdout: ActionsTransportFixture.response(200, JSON.stringify({ id, full_name: "acme/widget" })) })
    expect((yield* fixture.service.resolve(ActionsTransportFixture.github, "acme/widget").pipe(Effect.flip)).kind).toBe("transport_failed")
  }
  for (const provider of [ActionsTransportFixture.github, fixture.network.provider]) {
    for (const account of ["acme/user", "user name", "user\n", "user\x00", "user@host", "x".repeat(256)]) {
      yield* fixture.reply({ routes: {
        "repos/acme/widget": { stdout: ActionsTransportFixture.response(200, '{"id":913,"full_name":"acme/widget"}') },
        "projects/acme%2Fwidget": { stdout: ActionsTransportFixture.response(200, '{"id":913,"path_with_namespace":"acme/widget"}') },
        "user": { stdout: ActionsTransportFixture.response(200, JSON.stringify({ login: account, username: account })) },
      } })
      expect((yield* fixture.service.resolve(provider, "acme/widget").pipe(Effect.flip)).kind).toBe("not_authenticated")
    }
  }
  yield* fixture.reply({ routes: {
    "repos/acme/widget": { stdout: ActionsTransportFixture.response(200, '{"id":"9223372036854775807","full_name":"acme/widget"}') },
    "user": { stdout: ActionsTransportFixture.response(200, '{"login":"ada-lovelace"}') },
  } })
  expect(yield* fixture.service.resolve(ActionsTransportFixture.github, "acme/widget"))
    .toMatchObject({ projectID: "9223372036854775807", account: "ada-lovelace" })
  yield* fixture.reply({ routes: {
    "repos/acme/widget": { stdout: ActionsTransportFixture.response(200, '{"id":913,"full_name":"acme/widget"}') },
    "user": { stdout: ActionsTransportFixture.response(200, '{"login":"dependabot[bot]"}') },
  } })
  expect(yield* fixture.service.resolve(ActionsTransportFixture.github, "acme/widget"))
    .toMatchObject({ projectID: "913", account: "dependabot[bot]" })
}))

it.live("missing CLIs are named; native IDs and account identity are never guessed", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({}, false)
  const error = yield* fixture.service.request(fixture.binding(ActionsTransportFixture.gitlab), { method: "GET", path: "user" }).pipe(Effect.flip)
  expect(error).toMatchObject({ kind: "cli_missing", message: "glab is not installed on this server", bindingID: fixture.binding().id, disposition: "definitely_unsent" })
}))

it.live("missing project identity fails rather than guessing from display path", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ stdout: ActionsTransportFixture.response(200, '{"full_name":"acme/widget"}') })
  expect((yield* fixture.service.resolve(ActionsTransportFixture.github, "acme/widget").pipe(Effect.flip)).kind).toBe("transport_failed")
  yield* fixture.reply({ routes: {
    "repos/acme/widget": { stdout: ActionsTransportFixture.response(200, '{"id":913,"full_name":"Acme/Widget"}') },
    "user": { stdout: ActionsTransportFixture.response(200, "{}") },
  } })
  expect((yield* fixture.service.resolve(ActionsTransportFixture.github, "acme/widget").pipe(Effect.flip)).kind).toBe("not_authenticated")
}))

it.live("HTTP auth, permission, missing-resource and rate-limit failures are safe and retry-aware", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture()
  for (const [status, kind, headers] of [
    [401, "not_authenticated", ""], [403, "permission_denied", ""], [404, "not_found", ""],
    [429, "rate_limited", "Retry-After: 12\r\n"], [403, "rate_limited", "X-RateLimit-Remaining: 0\r\nRetry-After: 17\r\n"],
  ] as const) {
    yield* fixture.reply({ stdout: ActionsTransportFixture.response(status, '{"message":"synthetic-secret"}', headers), stderr: "synthetic-secret provider diagnostic; not authenticated", code: 1 })
    const error = yield* fixture.service.request(fixture.binding(), { method: "GET", path: "user" }).pipe(Effect.flip)
    expect(error.kind).toBe(kind)
    expect(error.disposition).toBe("definitely_rejected")
    expect(JSON.stringify(error)).not.toContain("synthetic-secret")
    if (status === 429) expect(error.retryAfter).toBe(12)
    if (status === 403 && headers) expect(error.retryAfter).toBe(17)
  }
  yield* fixture.reply({ code: 4, stderr: "gh auth login synthetic-secret" })
  expect(yield* fixture.service.request(fixture.binding(), { method: "GET", path: "user" }).pipe(Effect.flip))
    .toMatchObject({ kind: "not_authenticated", disposition: "unknown" })
}))

it.live("metadata truncation rejects complete JSON followed by oversized whitespace, and oversized stderr", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ stdout: ActionsTransportFixture.response(200, '{"ok":true}'), padding: 3 * 1024 * 1024 })
  expect(yield* fixture.service.request(fixture.binding(), { method: "POST", path: "repos/acme/widget/actions/workflows/8/dispatches", body: { ref: "main" } }).pipe(Effect.flip))
    .toMatchObject({ kind: "metadata_truncated", disposition: "unknown" })
  yield* fixture.reply({ stdout: ActionsTransportFixture.response(200, "{}"), stderr: "s".repeat(32 * 1024) })
  expect(yield* fixture.service.request(fixture.binding(), { method: "GET", path: "user" }).pipe(Effect.flip))
    .toMatchObject({ kind: "metadata_truncated", disposition: "unknown" })
}))

it.live("invalid JSON, missing HTTP framing and malformed headers never become empty catalogs", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture()
  for (const stdout of [ActionsTransportFixture.response(200, '{"cut":'), "{}", ActionsTransportFixture.response(200, "{}", "broken header\r\n")]) {
    yield* fixture.reply({ stdout })
    expect(yield* fixture.service.request(fixture.binding(), { method: "GET", path: "user" }).pipe(Effect.flip))
      .toMatchObject({ kind: "transport_failed", disposition: "unknown" })
  }
}))

it.effect("write metadata deadline stays unknown and closes actual subprocess", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ hold: true, stderr: "synthetic-secret" })
  const fiber = yield* fixture.service.request(fixture.binding(), { method: "POST", path: "repos/acme/widget/actions/workflows/8/dispatches", body: { ref: "main" } }).pipe(Effect.flip, Effect.forkChild)
  yield* fixture.ready()
  yield* TestClock.adjust("31 seconds")
  const error = yield* Fiber.join(fiber)
  expect(error).toMatchObject({ disposition: "unknown", bindingID: fixture.binding().id })
  expect(error.message).toContain("deadline exceeded")
  expect(JSON.stringify(error)).not.toContain("synthetic-secret")
  expect(yield* fixture.handles[0].isRunning).toBe(false)
}), 20_000)

it.live("owner perform callback receives typed definitive rejection through safe transport wrapping", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture()
  const binding = fixture.binding()
  const intent = Actions.OperationIntent.make({ clientID: "owner-disposition", binding: { id: binding.id, revision: binding.revision }, kind: "workflow.dispatch", target: { workflowID: "8" } })
  // Exercise the exact owner callback type, without duplicating receipt logic or
  // substituting an Operations implementation for the lead-owned durable writer.
  const perform: Parameters<ActionsContract.Operations["execute"]>[2] = (intent, payload) => fixture.service.request(binding, {
    method: "POST", path: `repos/acme/widget/actions/workflows/${intent.target.workflowID}/dispatches`, body: payload,
  }).pipe(Effect.andThen(Effect.die("Failed sends must not produce acknowledgement")))
  for (const status of [400, 401, 403, 404, 409, 422, 429]) {
    yield* fixture.reply({ stdout: ActionsTransportFixture.response(status, '{"message":"synthetic-secret"}', "Content-Type: application/json\r\nRetry-After: 9\r\n"), stderr: "synthetic-secret", code: 1 })
    const error = yield* perform(intent, { ref: "main", inputs: { value: "synthetic-secret" } }).pipe(Effect.flip)
    expect(error).toBeInstanceOf(ActionsError)
    expect(Schema.decodeUnknownSync(Actions.ErrorData)(error))
      .toMatchObject({ disposition: "definitely_rejected", bindingID: binding.id, provider: "github" })
    expect(JSON.stringify(error)).not.toContain("synthetic-secret")
    if (status === 429) expect(error.retryAfter).toBe(9)
  }
}))

it.live("write send disposition stays unknown for 5xx, network hints and failed partial response exits", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture()
  for (const reply of [
    ...[500, 502, 503, 504].map((status) => ({ stdout: ActionsTransportFixture.response(status, '{"message":"synthetic-secret"}'), code: 1 })),
    { code: 1, stderr: "connection reset synthetic-secret" },
    { code: 1, stderr: "HTTP 429 synthetic-secret" },
    { code: 1, stderr: "HTTP 401 not authenticated synthetic-secret" },
    { stdout: ActionsTransportFixture.response(200, '{"accepted":true}'), code: 1 },
    { stdout: ActionsTransportFixture.response(429, '{"message":"synthetic-secret"}'), code: 7 },
    { stdout: ActionsTransportFixture.response(429, '{"partial":'), code: 1 },
    { stdout: ActionsTransportFixture.response(422, '{"partial":'), code: 1 },
    { stdout: "HTTP/2.0 429 Status\nBroken header\n\n{}", code: 1 },
    { stdout: ActionsTransportFixture.response(429, '{"message":"synthetic-secret"}'), padding: 3 * 1024 * 1024, code: 1 },
  ]) {
    yield* fixture.reply(reply)
    const error = yield* fixture.service.request(fixture.binding(), { method: "POST", path: "repos/acme/widget/actions/workflows/8/dispatches", body: { ref: "main" } }).pipe(Effect.flip)
    expect(error.disposition).toBe("unknown")
    expect(error.bindingID).toBe(fixture.binding().id)
    expect(JSON.stringify(error)).not.toContain("synthetic-secret")
  }
}))

it.live("upload preflight is definitely unsent; partial ingress and raw exit retain unknown", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ settings: { token: "" } })
  const request = { method: "POST", path: "projects/9347/secure_files", query: { name: "bundle.bin" } } as const
  const file = { filename: "bundle.bin", bytes: Stream.empty }
  expect(yield* fixture.service.upload(fixture.binding(ActionsTransportFixture.gitlab), request, file).pipe(Effect.flip))
    .toMatchObject({ kind: "not_authenticated", disposition: "definitely_unsent" })
  expect(yield* fixture.service.upload(fixture.binding(), request, file).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
  expect(yield* fixture.service.upload(fixture.binding(ActionsTransportFixture.gitlab), request, { ...file, filename: "../bundle.bin" }).pipe(Effect.flip))
    .toMatchObject({ kind: "invalid_input", disposition: "definitely_unsent" })
  yield* fixture.reply({ help: "--form file=@-", hold: true })
  const ingress = new ActionsError({ kind: "transfer_failed", message: "Ingress failed", disposition: "definitely_unsent" })
  expect(yield* fixture.service.upload(fixture.binding(ActionsTransportFixture.gitlab), request, {
    filename: file.filename, bytes: Stream.concat(Stream.make(new Uint8Array([0, 255])), Stream.fail(ingress)),
  }).pipe(Effect.flip)).toMatchObject({ kind: "transfer_failed", disposition: "unknown", bindingID: fixture.binding().id })
  yield* fixture.reply({ stdout: "partial bytes\n\n", code: 1, stderr: "HTTP 400 synthetic-secret" })
  const error = yield* fixture.service.bytes(fixture.binding(), { method: "GET", path: "repos/acme/widget/actions/jobs/8/logs" }).pipe(Stream.runDrain, Effect.flip)
  expect(error.disposition).toBe("unknown")
  expect(error.bindingID).toBe(fixture.binding().id)
  expect(JSON.stringify(error)).not.toContain("synthetic-secret")
}))
