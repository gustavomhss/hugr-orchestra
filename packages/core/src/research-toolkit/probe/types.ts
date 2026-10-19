export * as Probe from "./types"

import { Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import { PositiveInt, optional } from "@orchestra/schema/schema"

// J4: the probe executor. No input field becomes free argv; the host fixes binaries and arguments per runner.

/** Owner caps (D2, 2026-10-18); config `research.limits.*` may lower them. */
export const Limits = Object.freeze({
  heapMiB: 1024,
  /** Resident memory of the whole probe tree, enforced by omni (J4.7, D2). */
  rssBytes: 1024 * 1024 * 1024,
  scratchBytes: 2 * 1024 * 1024 * 1024,
  outputBytes: 1024 * 1024,
  tailBytes: 64 * 1024,
  scriptBytes: 16 * 1024,
  perDispatch: 1,
  perHost: 2,
  queueSeconds: 30,
})

const file = Schema.NonEmptyString.check(Schema.isMaxLength(8192))
const expectation = Schema.Struct({
  exitCode: optional(Schema.Int),
  stdoutIncludes: optional(Schema.NonEmptyString.check(Schema.isMaxLength(4096))),
  stderrIncludes: optional(Schema.NonEmptyString.check(Schema.isMaxLength(4096))),
  diagnosticCode: optional(Schema.NonEmptyString.check(Schema.isMaxLength(64))),
})

export const ProbeInput = Schema.Struct({
  // revision: a full hash or a ref the host resolves first (J5.15).
  snapshot: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("commit"), revision: Schema.NonEmptyString.check(Schema.isMaxLength(256)) }),
    Schema.Struct({ kind: Schema.Literal("worktree") }),
  ]),
  runner: Schema.Union([
    // project: a tsconfig path inside the snapshot.
    Schema.Struct({ kind: Schema.Literal("typecheck"), project: file }),
    Schema.Struct({ kind: Schema.Literal("test"), file, name: optional(Schema.NonEmptyString.check(Schema.isMaxLength(1024))) }),
    Schema.Struct({
      // The schema bounds characters; the host also refuses more than scriptBytes of UTF-8.
      kind: Schema.Literal("script"), language: Schema.Literals(["ts", "js", "py"]),
      source: Schema.NonEmptyString.check(Schema.isMaxLength(Limits.scriptBytes)),
    }),
  ]),
  expect: optional(expectation),
  hypothesis: optional(Research.RecordRef),
  // At most what remains of the dispatch probe allowance.
  timeoutSeconds: optional(PositiveInt),
})
export type ProbeInput = typeof ProbeInput.Type

export type Verdict =
  | "passed" | "failed" | "reproduced" | "not_reproduced" | "timeout" | "memory_exceeded" | "blocked_by_repo_guard" | "error"

export type Stream = { readonly tail: string; readonly bytes: number; readonly truncated: boolean }

/** Retained as structured-json at `probe:<executionSessionID>/<probeID>`, even when the probe fails (J4.9). */
export type ProbeResult = {
  readonly probeID: string
  readonly snapshot: { readonly kind: "commit" | "worktree"; readonly revision: string; readonly dirtyDigest?: string; readonly files: number }
  /** argv as executed, with scratch paths. */
  readonly runner: { readonly kind: string; readonly binary: string; readonly version: string; readonly argv: ReadonlyArray<string> }
  /** reproduced and not_reproduced appear only with expect. */
  readonly verdict: Verdict
  readonly exitCode: number | null
  readonly durationMs: number
  readonly memoryCap: "heap-only" | "rss"
  readonly peakRssBytes?: number
  readonly stdout: Stream
  readonly stderr: Stream
  /** Paths translated from the scratch to the original file. */
  readonly diagnostics?: ReadonlyArray<{
    readonly path: string
    readonly line: number
    readonly column: number
    readonly code: string
    readonly message: string
  }>
  readonly expect?: ProbeInput["expect"]
  /** The script text, retained separately. */
  readonly script?: Research.SourceRef
}
