import { expect, test } from "bun:test"
import { startReason } from "./fixture/distribution-start-reason"

test("service start failure keeps only the fixed reason", () => {
  expect(startReason("Failed to start server (health-unreachable, 20123ms)\n")).toBe(
    "\nFailed to start server (health-unreachable, 20123ms)",
  )
  expect(startReason("\u001b[31mFailed to start server (\u001b[0mhealth-unreachable, 20123ms)")).toBe(
    "\nFailed to start server (health-unreachable, 20123ms)",
  )
  expect(startReason("Failed to start server (exited code=1, 400ms)")).toBe(
    "\nFailed to start server (exited code=1, 400ms)",
  )
  expect(startReason("Failed to start server (exited signal=SIGTERM, 12ms)")).toBe(
    "\nFailed to start server (exited signal=SIGTERM, 12ms)",
  )
  expect(startReason("password=secret\nFailed to start server (health-unreachable, 10ms)\n")).toBe(
    "\nFailed to start server (health-unreachable, 10ms)",
  )
  expect(startReason("password=secret\nFailed to start server")).toBe("")
  expect(startReason("Failed to start server (health unreachable, 10ms)")).toBe("")
})
