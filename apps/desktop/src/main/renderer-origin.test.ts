import { expect, test } from "bun:test"
import { isRendererOrigin, rendererCsp, rendererCspReportOnly, rendererDevUrl } from "./renderer-origin"

test("a packaged app ignores the dev server URL, an unpackaged one honors it", () => {
  expect(rendererDevUrl(true, "http://localhost:5173")).toBeUndefined()
  expect(rendererDevUrl(false, "http://localhost:5173")).toBe("http://localhost:5173")
  expect(rendererDevUrl(false, undefined)).toBeUndefined()
  expect(rendererDevUrl(false, "not a url")).toBeUndefined()
})

test("only the renderer's own origin is trusted", () => {
  const dev = "http://localhost:5173"
  expect(isRendererOrigin("oc://renderer/index.html", undefined)).toBe(true)
  expect(isRendererOrigin("oc://other/index.html", undefined)).toBe(false)
  expect(isRendererOrigin("https://evil.example/index.html", undefined)).toBe(false)
  expect(isRendererOrigin("http://localhost:5173/index.html", undefined)).toBe(false)
  expect(isRendererOrigin("http://localhost:5173/index.html", dev)).toBe(true)
  expect(isRendererOrigin("http://localhost:5174/index.html", dev)).toBe(false)
  expect(isRendererOrigin(undefined, dev)).toBe(false)
  expect(isRendererOrigin("", dev)).toBe(false)
})

test("the enforced policy is the safe subset and the full one stays report-only", () => {
  expect(rendererCsp).toBe("object-src 'none'; base-uri 'self'")
  expect(rendererCspReportOnly).toContain("default-src 'self'")
  expect(rendererCspReportOnly).not.toContain("'unsafe-eval'")
})
