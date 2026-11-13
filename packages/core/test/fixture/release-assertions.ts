import { expect } from "bun:test"
import type { ReviewReleaseChecks } from "../../src/review-toolkit/release-checks"

const EVAL = "release:behavioural-eval"

export function one(result: ReviewReleaseChecks.Result, id: string) {
  const found = result.checks.filter((item) => item.id === id)
  const item = found[0]
  if (!item || found.length !== 1) throw new Error(`${id}:${found.length}`)
  return item
}

export function expectShape(item: { pack: string; version: string; lane: string; workspaceExecuted: boolean; uri?: string }) {
  expect(item.pack).toBe("release")
  expect(item.version).toBe("review-v2")
  expect(item.lane).toBe("no-build")
  expect(item.workspaceExecuted).toBe(false)
  expect(item.uri).toBe("raw/release.json")
}

export function expectEval(result: ReviewReleaseChecks.Result) {
  const item = one(result, EVAL)
  expectShape(item)
  expect(item.status).toBe("not-run")
  expect(item.reason).toBe("owner-permission")
}

export function containsArtifact(value: unknown, artifact: Buffer): boolean {
  if (typeof value === "string") return value.includes(artifact.toString("base64")) || value.includes(artifact.toString("hex"))
  if (value instanceof Uint8Array) return Buffer.from(value).equals(artifact)
  if (!value || typeof value !== "object") return false
  return Object.values(value).some((item) => containsArtifact(item, artifact))
}
