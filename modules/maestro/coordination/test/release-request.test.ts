import { expect, test } from "bun:test"
import { constants } from "node:fs"
import path from "path"
import { mkdir, writeFile } from "fs/promises"
import { Cause, Effect, Exit } from "effect"
import { tmpdir } from "./fixture/tmpdir"
import { Tool } from "@orchestra/core/tool/tool"
import { ReviewReleaseRequestV2 } from "../src/v2/tools/review-release"

const V1 = "artifact-v1-UNIQUE"
const V2 = "artifact-v2-UNIQUE"
const N1 = "notes-v1-UNIQUE"

const rejected = async (input: ReviewReleaseRequestV2.Input, directory: string) => {
  const exit = await Effect.runPromise(Effect.exit(ReviewReleaseRequestV2.capture(input, directory)))
  expect(Exit.isFailure(exit)).toBe(true)
  if (!Exit.isFailure(exit)) return ""
  const error = Cause.squash(exit.cause)
  expect(error).toBeInstanceOf(Tool.Failure)
  return String(error instanceof Tool.Failure ? error.message : "")
}

test("rejects release outside profile, plan stage, and release rereview before admission", async () => {
  const missing = path.join("/no/such/release-admission", "missing")
  const release = { artifact: "dist/app.bin", notes: "dist/notes.txt" }
  expect(await rejected({ profile: "code", stage: "code", release }, missing)).toContain("release-profile")
  expect(await rejected({ profile: "release", stage: "plan", release }, missing)).toContain("release-stage")
  expect(await rejected({ profile: "rereview", stage: "code", previousProfile: "release" }, missing)).toContain("release-rereview")
})

test("omitted non-release is undefined and omitted release capture is stable without a directory", async () => {
  const missing = path.join("/no/such/release-admission", "absent")
  const omitted = await Effect.runPromise(ReviewReleaseRequestV2.capture({ profile: "code", stage: "code" }, missing))
  expect(omitted).toBeUndefined()
  const first = await Effect.runPromise(ReviewReleaseRequestV2.capture({ profile: "release", stage: "code" }, missing))
  const second = await Effect.runPromise(ReviewReleaseRequestV2.capture({ profile: "release", stage: "code" }, missing))
  expect(first).toBeDefined()
  expect(first?.input).toBeUndefined()
  expect(first?.files).toEqual({})
  expect(first?.identity).toMatch(/^[0-9a-f]{64}$/)
  expect(second?.identity).toBe(first?.identity)
  const fresh = await Effect.runPromise(ReviewReleaseRequestV2.capture({ profile: "release", stage: "code", previousProfile: "release" }, missing))
  expect(fresh?.identity).toBe(first?.identity)
  expect(ReviewReleaseRequestV2.key("lead", undefined)).toBe("lead")
})

test.skipIf(!Boolean(constants.O_NOFOLLOW))("capture keeps v1 bytes and keys identity without a second read", async () => {
  const dir = await tmpdir()
  try {
    const root = dir.path
    await mkdir(path.join(root, "dist"), { recursive: true })
    await writeFile(path.join(root, "dist", "app.bin"), V1)
    await writeFile(path.join(root, "dist", "notes.txt"), N1)
    const input = { profile: "release" as const, stage: "code" as const, release: { artifact: "dist/app.bin", notes: "dist/notes.txt" } }
    const first = await Effect.runPromise(ReviewReleaseRequestV2.capture(input, root))
    const artifact = first?.files.artifact
    expect(artifact && "bytes" in artifact && Buffer.from(artifact.bytes).toString()).toBe(V1)
    expect(first?.files.notes && "bytes" in first.files.notes && Buffer.from(first.files.notes.bytes).toString()).toBe(N1)
    await writeFile(path.join(root, "dist", "app.bin"), V2)
    const second = await Effect.runPromise(ReviewReleaseRequestV2.capture(input, root))
    expect(second?.identity).not.toBe(first?.identity)
    expect(ReviewReleaseRequestV2.key("lead", second)).not.toBe(ReviewReleaseRequestV2.key("lead", first))
    expect(artifact && "bytes" in artifact && Buffer.from(artifact.bytes).toString()).toBe(V1)
    expect(ReviewReleaseRequestV2.key("lead", undefined)).toBe("lead")
    expect(ReviewReleaseRequestV2.key("lead", first)).toBe(`lead_release_${first?.identity}`)
    const retry = await Effect.runPromise(ReviewReleaseRequestV2.capture(input, root))
    expect(retry?.identity).toBe(second?.identity)
    expect(ReviewReleaseRequestV2.key("lead", retry)).toBe(ReviewReleaseRequestV2.key("lead", second))
  } finally {
    await dir[Symbol.asyncDispose]()
  }
})

test.skipIf(Boolean(constants.O_NOFOLLOW))("unavailable no-follow capture errors and keys a stable identity", async () => {
  const dir = await tmpdir()
  try {
    const root = dir.path
    await mkdir(path.join(root, "dist"), { recursive: true })
    await writeFile(path.join(root, "dist", "app.bin"), V1)
    const input = { profile: "release" as const, stage: "code" as const, release: { artifact: "dist/app.bin", notes: "dist/app.bin" } }
    const first = await Effect.runPromise(ReviewReleaseRequestV2.capture(input, root))
    expect(first?.files.artifact).toEqual({ path: "dist/app.bin", reason: "nofollow-unavailable" })
    expect(first?.files.notes).toEqual({ path: "dist/app.bin", reason: "nofollow-unavailable" })
    expect(JSON.stringify(first)).not.toContain(V1)
    expect(JSON.stringify(first)).not.toContain("bytes")
    await writeFile(path.join(root, "dist", "app.bin"), V2)
    const second = await Effect.runPromise(ReviewReleaseRequestV2.capture(input, root))
    expect(second?.identity).toBe(first?.identity)
    expect(ReviewReleaseRequestV2.key("lead", first)).toBe(`lead_release_${first?.identity}`)
    expect(ReviewReleaseRequestV2.key("lead", second)).toBe(ReviewReleaseRequestV2.key("lead", first))
  } finally {
    await dir[Symbol.asyncDispose]()
  }
})
