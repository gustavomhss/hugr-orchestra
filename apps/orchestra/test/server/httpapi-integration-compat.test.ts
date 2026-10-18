import { afterAll, expect, test } from "bun:test"
import { Context } from "effect"
import { OpenCode } from "@opencode-ai/client/promise"
import { tmpdir } from "../fixture/fixture"
import { oauthProject } from "./fixtures/oauth-project"
import { httpApiFixture } from "./httpapi-fixture"

const context = Context.empty() as Context.Context<unknown>
const fixture = httpApiFixture()
afterAll(() => fixture.dispose())

test("missing canonical and alias OAuth status share a typed transport refusal", async () => {
  await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
  const replies = []
  for (const route of ["/api/integration/attempt/con_missing", "/api/integration/compat-a/connect/oauth/con_missing"]) {
    const response = await fixture.handler(
      new Request(`http://localhost${route}?location[directory]=${encodeURIComponent(tmp.path)}`),
      context,
    )
    replies.push({ status: response.status, body: await response.json() })
  }
  expect(replies.map((reply) => reply.status)).toEqual([400, 400])
  expect(replies[0].body).toMatchObject({ _tag: "InvalidRequestError", kind: "integration_attempt_not_found" })
  expect(replies[1].body).toEqual(replies[0].body)
}, 30_000)

test("vendored OAuth DELETE cancels only its integration owner and removes canonical attempt state", async () => {
  await using tmp = await tmpdir(oauthProject)
  const api = OpenCode.make({
    baseUrl: "http://localhost",
    fetch: Object.assign(
      (input: RequestInfo | URL, init?: RequestInit) => fixture.handler(new Request(input, init), context),
      { preconnect() {} },
    ),
  })
  const location = { directory: tmp.path }
  for (let retry = 0; retry < 100; retry++) {
    if ((await api.integration.get({ integrationID: "compat-a", location })).data) break
    if (retry === 99) throw new Error("OAuth fixture integration did not load")
    await Bun.sleep(10)
  }
  const attempt = (
    await api.integration.oauth.connect({ integrationID: "compat-a", methodID: "code", inputs: {}, location })
  ).data
  const owned = { integrationID: "compat-a", attemptID: attempt.attemptID, location }
  // The raw response assertion detects the old HTML-200 catchall. The vendored client requires
  // NoContent, and ownership must be checked before any cancellation.
  const wrong = await fixture.handler(
    new Request(
      `http://localhost/api/integration/compat-b/connect/oauth/${attempt.attemptID}?location[directory]=${encodeURIComponent(tmp.path)}`,
      { method: "DELETE" },
    ),
    context,
  )
  expect(wrong.status).toBe(400)
  expect(await wrong.json()).toMatchObject({ kind: "integration_attempt_owner" })
  expect((await api.integration.oauth.status(owned)).data.status).toBe("pending")
  await api.integration.oauth.cancel(owned)
  const canonical = await fixture.handler(
    new Request(
      `http://localhost/api/integration/attempt/${attempt.attemptID}?location[directory]=${encodeURIComponent(tmp.path)}`,
    ),
    context,
  )
  expect(canonical.status).toBe(400)
  expect(await canonical.json()).toMatchObject({ kind: "integration_attempt_not_found" })
  expect((await api.integration.get({ integrationID: "compat-a", location })).data?.connections).toHaveLength(0)
}, 60_000)

test("vendored OAuth paths validate authoritative ownership and share canonical attempts", async () => {
  await using tmp = await tmpdir(oauthProject)
  const requests: string[] = []
  const api = OpenCode.make({
    baseUrl: "http://localhost",
    fetch: Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        requests.push(new URL(request.url).pathname)
        return fixture.handler(request, context)
      },
      { preconnect() {} },
    ),
  })
  const location = { directory: tmp.path }
  // External plugin registration is scoped and asynchronous; poll its real discovery endpoint.
  for (let retry = 0; retry < 100; retry++) {
    if ((await api.integration.get({ integrationID: "compat-a", location })).data) break
    if (retry === 99) throw new Error("OAuth fixture integration did not load")
    await Bun.sleep(10)
  }
  const attempt = (
    await api.integration.oauth.connect({ integrationID: "compat-a", methodID: "code", inputs: {}, location })
  ).data
  const owned = { integrationID: "compat-a", attemptID: attempt.attemptID, location }
  const wrong = { ...owned, integrationID: "compat-b" }
  expect((await api.integration.oauth.status(owned)).data.status).toBe("pending")
  await expect(api.integration.oauth.status(wrong)).rejects.toMatchObject({ kind: "integration_attempt_owner" })
  await expect(api.integration.oauth.complete({ ...wrong, code: "ok" })).rejects.toMatchObject({
    kind: "integration_attempt_owner",
  })
  await expect(api.integration.oauth.status({ ...owned, attemptID: "con_missing" })).rejects.toMatchObject({
    kind: "integration_attempt_not_found",
  })
  await expect(api.integration.oauth.complete(owned)).rejects.toMatchObject({ kind: "integration_code_required" })
  expect((await api.integration.oauth.status(owned)).data.status).toBe("pending")
  await api.integration.oauth.complete({ ...owned, code: "ok" })
  expect((await api.integration.oauth.status(owned)).data.status).toBe("complete")
  await expect(api.integration.oauth.status(wrong)).rejects.toMatchObject({ kind: "integration_attempt_owner" })
  await expect(api.integration.oauth.complete({ ...wrong, code: "ok" })).rejects.toMatchObject({
    kind: "integration_attempt_owner",
  })

  const canonical = `http://localhost/api/integration/attempt/${attempt.attemptID}?location[directory]=${encodeURIComponent(tmp.path)}`
  const response = await fixture.handler(new Request(canonical), context)
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ data: { status: "complete" } })
  expect((await api.integration.get({ integrationID: "compat-a", location })).data?.connections).toHaveLength(1)
  expect((await api.integration.get({ integrationID: "compat-b", location })).data?.connections).toHaveLength(0)

  const failed = (
    await api.integration.oauth.connect({ integrationID: "compat-a", methodID: "code", inputs: {}, location })
  ).data
  await expect(
    api.integration.oauth.complete({ ...owned, attemptID: failed.attemptID, code: "fail" }),
  ).rejects.toMatchObject({ kind: "integration_authorization" })
  expect((await api.integration.oauth.status({ ...owned, attemptID: failed.attemptID })).data.status).toBe("failed")
  await expect(api.integration.oauth.status({ ...wrong, attemptID: failed.attemptID })).rejects.toMatchObject({
    kind: "integration_attempt_owner",
  })

  const canonicalAttempt = (
    await api.integration.oauth.connect({ integrationID: "compat-b", methodID: "code", inputs: {}, location })
  ).data
  const completed = await fixture.handler(
    new Request(
      `http://localhost/api/integration/attempt/${canonicalAttempt.attemptID}/complete?location[directory]=${encodeURIComponent(tmp.path)}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "ok" }) },
    ),
    context,
  )
  expect(completed.status).toBe(204)
  expect((await api.integration.oauth.status({ ...wrong, attemptID: canonicalAttempt.attemptID })).data.status).toBe(
    "complete",
  )
  expect(requests).toContain(`/api/integration/compat-a/connect/oauth/${attempt.attemptID}`)
  expect(requests).toContain(`/api/integration/compat-a/connect/oauth/${attempt.attemptID}/complete`)
}, 60_000)
