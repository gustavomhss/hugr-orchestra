export * as ReviewEngagementSourceV2 from "./review-engagement-source"

import { createHash } from "node:crypto"
import { Effect } from "effect"
import type { GitCli } from "@orchestra/core/git-cli"
import { Tool } from "@orchestra/core/tool/tool"
import type { ReviewEngagementEvidenceV2 } from "./review-engagement-evidence"

const blobLimit = 4 * 1024 * 1024
const lineLimit = 400
const gitEnv = { GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "", GIT_TERMINAL_PROMPT: "0" }

export function read(git: GitCli.Interface, input: {
  readonly worktree: string
  readonly prepared: ReviewEngagementEvidenceV2.Prepared
  readonly path: string
  readonly startLine: number
  readonly endLine: number
}): Effect.Effect<{
  readonly path: string
  readonly oid: string
  readonly sha256: string
  readonly startLine: number
  readonly endLine: number
  readonly text: string
}, Tool.Failure> {
  return Effect.gen(function* () {
    const file = input.prepared.files.find((item) => item.path === input.path)
    if (!file || !acceptedRange(input.startLine, input.endLine)) return yield* refuse("engagement-region")
    if (!capturedOid(file.oid) || !capturedSize(file.size)) return yield* refuse("engagement-blob")
    const result = yield* git.run(["cat-file", "blob", file.oid], {
      cwd: input.worktree,
      env: gitEnv,
      maxOutputBytes: blobLimit + 1,
      timeout: "30 seconds",
    }).pipe(Effect.mapError(() => failure("engagement-blob")))
    if (result.exitCode !== 0 || result.truncated || result.stdout.length !== file.size) return yield* refuse("engagement-blob")
    if (blobOid(result.stdout, file.oid) !== file.oid) return yield* refuse("engagement-blob")
    const text = yield* Effect.try({
      try: () => utf8(result.stdout),
      catch: () => failure("engagement-encoding"),
    })
    const lines = logicalLines(text)
    const quoted = lines.slice(input.startLine - 1, input.endLine)
    if (input.endLine > lines.length || blankQuote(quoted)) return yield* refuse("engagement-region")
    return {
      path: input.path,
      oid: file.oid,
      sha256: createHash("sha256").update(result.stdout).digest("hex"),
      startLine: input.startLine,
      endLine: input.endLine,
      text: quoted.join("\n"),
    }
  })
}

type Reason = "engagement-region" | "engagement-blob" | "engagement-encoding"

const failure = (reason: Reason) => new Tool.Failure({ message: `${reason}: refused`, metadata: { reason } })

const refuse = (reason: Reason) => Effect.fail(failure(reason))

const acceptedRange = (start: number, end: number) =>
  Number.isSafeInteger(start) && Number.isSafeInteger(end) && start > 0 && end >= start && end - start < lineLimit

const capturedOid = (oid: string) => /^[0-9a-f]{40}$/.test(oid) || /^[0-9a-f]{64}$/.test(oid)

const capturedSize = (size: number) => Number.isSafeInteger(size) && size >= 0 && size <= blobLimit

const blobOid = (bytes: Buffer, oid: string) =>
  createHash(oid.length === 64 ? "sha256" : "sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")

const utf8 = (bytes: Buffer) => {
  if (bytes.includes(0)) throw failure("engagement-encoding")
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
}

const logicalLines = (text: string) => {
  if (text.length === 0) return []
  const lines = text.split("\n")
  if (text.endsWith("\n")) lines.pop()
  return lines
}

const blankQuote = (lines: readonly string[]) => lines.every((line) => line.trim() === "")
