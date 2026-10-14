import { expect, test } from "bun:test"
import { SessionManagementUnsupported, sessionManagementUnsupported } from "./session-management-errors"

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
