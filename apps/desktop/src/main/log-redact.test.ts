import { describe, expect, test } from "bun:test"
import { isRedactable, redactLog } from "./log-redact"

describe("redactLog", () => {
  test("hides auth_token query values and keeps the rest of the URL", () => {
    expect(redactLog("GET /event?auth_token=abc123&directory=%2Ftmp 200")).toBe(
      "GET /event?auth_token=[redacted]&directory=%2Ftmp 200",
    )
  })

  test("hides Authorization header values in text and netlog JSON", () => {
    expect(redactLog("Authorization: Basic b3JjaGVzdHJhOnNlY3JldA==")).toBe("Authorization: [redacted]")
    expect(redactLog('{"params":{"headers":["authorization: Bearer abcdefghijkl","host: localhost"]}}')).toBe(
      '{"params":{"headers":["authorization: [redacted]","host: localhost"]}}',
    )
  })

  test("hides a bare Basic credential", () => {
    expect(redactLog("sent Basic b3JjaGVzdHJhOnNlY3JldA== upstream")).toBe("sent Basic [redacted] upstream")
  })

  test("selects log text and not crash dumps", () => {
    expect(isRedactable("server-1/orchestra.log")).toBe(true)
    expect(isRedactable("network.netlog")).toBe(true)
    expect(isRedactable("crashpad/abc.dmp")).toBe(false)
  })
})
