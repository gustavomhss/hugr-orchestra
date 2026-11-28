import { expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Schema, Stream } from "effect"
import { LLMEvent } from "@orchestra/llm"
import { reply, stage, text, type Controls, type Ctx, type Fixture } from "./lucy-engagement"
import { cache, decoded, digest, reader, refused } from "./lucy-engagement-artifacts"

export type Call = { readonly id: string; readonly name: string; readonly input: unknown }

/** Provider transport only: calls are admitted, run and settled by the real owned Session. */
export function calls(batch: readonly Call[]) {
  return Stream.fromIterable([
    LLMEvent.stepStart({ index: 0 }),
    ...batch.flatMap(({ id, name, input }) => [
      LLMEvent.toolInputStart({ id, name }), LLMEvent.toolInputDelta({ id, name, text: JSON.stringify(input) }),
      LLMEvent.toolInputEnd({ id, name }), LLMEvent.toolCall({ id, name, input }),
    ]),
    LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }), LLMEvent.finish({ reason: "tool-calls" }),
  ])
}

export function steps(batches: readonly (readonly Call[])[], before: (index: number, sessionID: string) => Effect.Effect<void>) {
  const positions = new Map<string, number>()
  const sessions = new Set<string>()
  const stream: NonNullable<Controls["stream"]> = (log, request) => {
    if (stage(log.text) !== "entry") return text(reply(log, request, { quote: true }))
    sessions.add(log.sessionID)
    const index = positions.get(log.sessionID) ?? 0
    positions.set(log.sessionID, index + 1)
    const batch = batches[index]
    if (!batch) return text(reply(log, request, { quote: true }))
    return Stream.unwrap(before(index, log.sessionID).pipe(Effect.as(calls(batch))))
  }
  return { stream, sessions }
}

export const commit = (root: Fixture, files: Readonly<Record<string, string>>) => Effect.gen(function* () {
  yield* Effect.promise(async () => {
    for (const [file, contents] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(root.directory, file)), { recursive: true })
      await fs.writeFile(path.join(root.directory, file), contents)
    }
  })
  yield* root.git("add", "--", ...Object.keys(files))
  yield* root.git("commit", "-q", "-m", "add-real-artifact-limit-source")
  return yield* root.git("rev-parse", "HEAD")
})

/** Existing CODE temp retention wraps producer text in {uri,text}; count the original UTF-8 body, not that wrapper. */
export const retained = (host: Ctx, input: unknown) => Effect.promise(async () => {
  const directory = path.join(cache(host, input), "raw")
  const files = (await fs.readdir(directory)).filter((file) => /^[0-9a-f]{64}\.json$/.test(file)).sort()
  return Promise.all(files.map(async (file) => {
    const value = Schema.decodeUnknownSync(Schema.Struct({ uri: Schema.String, text: Schema.String }))(
      JSON.parse(await fs.readFile(path.join(directory, file), "utf8")), { onExcessProperty: "error" },
    )
    const bytes = Buffer.from(value.text, "utf8")
    expect(file).toBe(`${digest(value.uri)}.json`)
    expect(value.uri.endsWith(`/${digest(bytes)}`)).toBe(true)
    const body = Schema.decodeUnknownSync(Schema.Struct({
      source: Schema.Struct({ commit: Schema.String }), snapshot: Schema.optional(Schema.String), result: Schema.optional(Schema.Unknown),
    }))(JSON.parse(value.text))
    return { uri: value.uri, bytes, body }
  }))
})

export const failed = (host: Ctx, root: Fixture, input: unknown, output: { readonly type: string; readonly text: string }) =>
  Effect.gen(function* () {
    refused(output, "engagement-evidence-bound-exceeded")
    expect((yield* host.execution.active).size).toBe(0)
    const count = root.requests.length
    const stopped = yield* host.invoke(input)
    const report = decoded(stopped)
    expect(report.status).toBe("failed")
    expect(report.report).toBeUndefined()
    expect(report.budget.deadlineAt - report.budget.startedAt).toBe(300_000)
    expect(report.notExamined).toContainEqual({ item: "engagement:evidence-publication", reason: "failure" })
    const unavailable = yield* host.call(reader, { op: "manifest", reportID: report.reportID })
    refused(unavailable, "engagement-evidence-unavailable")
    expect(unavailable.text).toContain("terminal-status")
    expect((yield* host.invoke(input)).text).toBe(stopped.text)
    expect(root.requests.length).toBe(count)
    return report
  })
