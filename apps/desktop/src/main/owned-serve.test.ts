import { expect, test } from "bun:test"
import { sidecarMode } from "./owned-serve"

test("the desktop runs its owned serve child unless the shared daemon is asked for", () => {
  expect(sidecarMode(undefined)).toBe("owned")
  expect(sidecarMode("")).toBe("owned")
  expect(sidecarMode("owned")).toBe("owned")
  // Anything but "shared" starts the owned child, old selectors included.
  expect(sidecarMode("legacy")).toBe("owned")
  expect(sidecarMode("0")).toBe("owned")
  expect(sidecarMode("1")).toBe("owned")
  expect(sidecarMode("shared")).toBe("shared")
})
