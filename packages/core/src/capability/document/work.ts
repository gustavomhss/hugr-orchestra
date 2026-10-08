export * as DocumentWork from "./work"

import { Worker } from "node:worker_threads"
import { Capability } from "@orchestra/schema/capability"
import { Effect, Option, Schema } from "effect"

export const limits = Object.freeze({ bytes: 8 * 1024 * 1024, pages: 100, cells: 10000, sheets: 20,
  metadata: 48 * 1024, text: 16000, pixels: 1000000, inflated: 32 * 1024 * 1024, millis: 15000, heapMB: 128 })
export const File = Schema.Struct({ data: Schema.Uint8Array, mime: Schema.String, metadata: Schema.Json })
export const Success = Schema.Struct({ status: Schema.Literal("ok"), files: Schema.Array(File),
  metadata: Schema.Json, incomplete: Schema.Array(Schema.String) })
export type Success = typeof Success.Type
export const Reply = Schema.Union([Success, Schema.Struct({ status: Schema.Literal("error"), code: Capability.ErrorCode })])
export function failure(code: Capability.ErrorCode = "unsupported_operation") {
  return new Capability.Failure({ code, message: code === "quota_exceeded" ? "Native document work budget exceeded"
    : "Native document operation is unavailable or unsupported" })
}

/** Private byte-only worker boundary. No artifact storage, policy, paths, network inputs or tool contexts cross it. */
export function run(kind: "pdf" | "sheet", input: unknown, data: readonly Uint8Array[]) {
  if (data.reduce((n, bytes) => n + bytes.byteLength, 0) > limits.bytes) return Effect.fail(failure("quota_exceeded"))
  return Effect.acquireUseRelease(
    Effect.try({ try: () => new Worker(new URL("./worker.ts", import.meta.url), {
      workerData: { kind, input, data }, resourceLimits: { maxOldGenerationSizeMb: limits.heapMB, maxYoungGenerationSizeMb: 16 },
    }), catch: () => failure("acquisition_failed") }),
    (worker) => Effect.callback<Success, Capability.Failure>((resume) => {
      const timer = setTimeout(() => resume(Effect.fail(failure("quota_exceeded"))), limits.millis)
      worker.once("message", (value: unknown) => {
        const reply = Schema.decodeUnknownOption(Reply)(value)
        if (Option.isNone(reply)) return resume(Effect.fail(failure("outcome_unknown")))
        if (reply.value.status === "error") return resume(Effect.fail(failure(reply.value.code)))
        const result = reply.value
        if (result.files.reduce((n, file) => n + file.data.byteLength, 0) > limits.bytes ||
          new TextEncoder().encode(JSON.stringify(result.metadata)).byteLength > limits.metadata)
          return resume(Effect.fail(failure("quota_exceeded")))
        resume(Effect.succeed(result))
      })
      worker.once("error", () => resume(Effect.fail(failure("acquisition_failed"))))
      worker.once("exit", () => resume(Effect.fail(failure("outcome_unknown"))))
      return Effect.sync(() => clearTimeout(timer))
    }),
    (worker) => Effect.promise(() => worker.terminate()).pipe(Effect.asVoid),
  )
}
