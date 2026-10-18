import { expect, test } from "bun:test"
import { SessionManagementUnsupported, sessionManagementUnsupported } from "./session-management-errors"
import { createSdkForServer } from "./server"

test.each([404, 405, 501])("unsupported classifier preserves unknown-route cause status %s", (status) => {
  expect(sessionManagementUnsupported(new Error("UnexpectedStatus", { cause: { status } }))).toBe(true)
})

test.each([401, 403, 500])("unsupported classifier preserves failure cause status %s", (status) => {
  expect(sessionManagementUnsupported(new Error("UnexpectedStatus", { cause: { status } }))).toBe(false)
})

test("unsupported classifier recognizes direct and wrapped markers", () => {
  const marker = new SessionManagementUnsupported()
  expect(sessionManagementUnsupported(marker)).toBe(true)
  expect(sessionManagementUnsupported(new Error("Transport", { cause: marker }))).toBe(true)
})

test("typed SessionNotFound wins over status and unsupported markers throughout cause chain", () => {
  const missing = { _tag: "SessionNotFoundError", status: 404, sessionID: "ses_missing" }
  expect(sessionManagementUnsupported(missing)).toBe(false)
  expect(sessionManagementUnsupported(Object.assign(new Error("Missing"), missing))).toBe(false)
  expect(sessionManagementUnsupported(new Error("UnexpectedStatus", { cause: missing }))).toBe(false)
  expect(sessionManagementUnsupported(new Error("Transport", { cause: new Error("UnexpectedStatus", { cause: missing }) }))).toBe(false)
  expect(sessionManagementUnsupported(new SessionManagementUnsupported("Classified before decoding", { cause: missing }))).toBe(false)
})

test("unsupported classifier does not classify arbitrary direct status objects or transport failures", () => {
  expect(sessionManagementUnsupported({ status: 404 })).toBe(false)
  expect(sessionManagementUnsupported(Object.assign(new Error("Transport"), { status: 404 }))).toBe(false)
  expect(sessionManagementUnsupported(new Error("synthetic offline"))).toBe(false)
})

test("actual legacy SDK interceptor preserves typed SessionNotFound inside cause.body", async () => {
  const body = { _tag: "SessionNotFoundError", sessionID: "ses_missing" }
  const fetcher = Object.assign(async () => Response.json(body, { status: 404 }), { preconnect: fetch.preconnect })
  const sdk = createSdkForServer({ server: { url: "https://synthetic.invalid" }, fetch: fetcher, throwOnError: true })
  const error = await sdk.session.get({ sessionID: "ses_missing" }).then(() => undefined, (error: unknown) => error)
  expect(error).toBeInstanceOf(Error)
  expect(error).toMatchObject({ cause: { status: 404, body } })
  expect(sessionManagementUnsupported(error)).toBe(false)
  expect(sessionManagementUnsupported(new Error("Session notfound", { cause: { status: 404, body } }))).toBe(false)
})

test("decoded body tags at each cause node win over statuses and markers", () => {
  const body = { _tag: "SessionNotFoundError", sessionID: "ses_missing" }
  const wrapper = new Error("Session notfound", { cause: { status: 404, body } })
  expect(sessionManagementUnsupported(new Error("Transport", { cause: wrapper }))).toBe(false)
  expect(sessionManagementUnsupported(new SessionManagementUnsupported("Earlier classification", { cause: wrapper }))).toBe(false)
  expect(sessionManagementUnsupported(Object.assign(new SessionManagementUnsupported(), { body }))).toBe(false)
  const cyclic = new Error("Transport")
  cyclic.cause = { status: 404, body, cause: cyclic }
  expect(sessionManagementUnsupported(cyclic)).toBe(false)
})

test.each([404, 405, 501])("unknown-route cause status %s remains unsupported when body has no typed missing Session", (status) => {
  for (const body of [{ _tag: "UnknownRouteError" }, { message: "synthetic route missing" }, null, "synthetic route missing"]) {
    expect(sessionManagementUnsupported(new Error("UnexpectedStatus", { cause: { status, body } }))).toBe(true)
  }
})

test.each([401, 403, 500])("decoded auth/server body remains a failure for status %s", (status) => {
  const error = new Error("Transport", {
    cause: new Error("UnexpectedStatus", { cause: { status, body: { _tag: "UnauthorizedError" } } }),
  })
  expect(sessionManagementUnsupported(error)).toBe(false)
})
