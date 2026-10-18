import { expect, test } from "bun:test"
import { bytes, relative } from "./format"

test("bytes uses decimal units and B below one kilobyte", () => {
  expect(bytes(272, "en")).toBe("272 B")
  expect(bytes(30_198, "en")).toBe("30 kB")
  expect(bytes(2_300_000, "en")).toBe("2.3 MB")
  expect(bytes(11_000_000_000, "en")).toBe("11 GB")
  expect(bytes(undefined, "en")).toBe("—")
  expect(bytes(-1, "en")).toBe("—")
})

test("relative picks the largest whole unit and skips weeks", () => {
  const now = Date.parse("2026-10-18T12:00:00Z")
  expect(relative("2026-11-16T12:00:00Z", "en", now)).toBe("in 29 days")
  expect(relative("2026-10-18T11:52:00Z", "en", now)).toBe("8 minutes ago")
  expect(relative("2026-10-17T12:00:00Z", "en", now)).toBe("yesterday")
  expect(relative("not a date", "en", now)).toBe("—")
})
