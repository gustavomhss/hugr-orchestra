import { expect, test } from "bun:test"
import { sidecarVersion } from "./owned-serve"

test("the desktop runs its owned V2 serve child unless the one-release V1 fallback or the daemon is asked for", () => {
  expect(sidecarVersion(undefined)).toBe("v2-owned")
  expect(sidecarVersion("")).toBe("v2-owned")
  expect(sidecarVersion("owned")).toBe("v2-owned")
  expect(sidecarVersion("legacy")).toBe("v1")
  expect(sidecarVersion("0")).toBe("v1")
  expect(sidecarVersion("1")).toBe("v2")
})
