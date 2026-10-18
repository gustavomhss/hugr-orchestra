import { expect, test } from "bun:test"
import { openRendererPath } from "./open-path"

test("desktop recovery: renderer preserves explicit app and rejects with localized failure plus diagnostics", async () => {
  const calls: unknown[] = []
  const result = await openRendererPath({
    path: "/repo", app: "missing.exe",
    open: async (...args) => { calls.push(args); return { status: "failed", code: "app-unavailable", detail: "ENOENT" } },
    message: async (code) => `localized:${code}`,
  }).catch((error: unknown) => error)
  expect(calls).toEqual([["/repo", "missing.exe"]])
  expect(result).toBeInstanceOf(Error)
  if (!(result instanceof Error)) throw new Error("expected renderer error")
  expect(result.message).toBe("localized:app-unavailable")
  expect(result.cause).toEqual({ status: "failed", code: "app-unavailable", detail: "ENOENT" })
})
