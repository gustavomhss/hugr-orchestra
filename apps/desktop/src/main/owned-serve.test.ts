import { expect, test } from "bun:test"
import { sidecarVersion } from "./owned-serve"

test("the desktop runs its owned V2 serve child unless the shared daemon is asked for", () => {
  expect(sidecarVersion(undefined)).toBe("v2-owned")
  expect(sidecarVersion("")).toBe("v2-owned")
  expect(sidecarVersion("owned")).toBe("v2-owned")
  // The V1 sidecar is gone: its old selectors start the owned V2 child.
  expect(sidecarVersion("legacy")).toBe("v2-owned")
  expect(sidecarVersion("0")).toBe("v2-owned")
  expect(sidecarVersion("1")).toBe("v2")
})
