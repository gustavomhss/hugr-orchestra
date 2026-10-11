export * as CapabilityProcessContract from "./contract"

import { Capability } from "@orchestra/schema/capability"
import { NonNegativeInt } from "@orchestra/schema/schema"
import { Schema, type Effect, type Scope } from "effect"
import type { ChildProcess } from "effect/unstable/process"
import type { ToolSafety } from "../../tool-safety"
import type { CapabilityJobs } from "../job"

// Model-facing input. One canonical leaf, explicit argv only: never shell text.
const Ref = { id: Capability.JobID }
const Text = Schema.String.check(Schema.isMaxLength(65_536))
export const Start = Schema.Struct({
  action: Schema.Literal("start"),
  argv: Schema.Array(Schema.String.check(Schema.isMaxLength(8192))).check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  cwd: Schema.optional(Schema.String.check(Schema.isMaxLength(4096))),
  env: Schema.optional(Schema.Record(Schema.String.check(Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]{0,127}(?![\s\S])/)),
    Schema.String.check(Schema.isMaxLength(4096)))),
  // "pty" is reserved: this wave fails it with unsupported_operation instead of silently using pipes.
  mode: Schema.optional(Schema.Literals(["pipe", "pty"])),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export const List = Schema.Struct({ action: Schema.Literal("list") }).annotate({ parseOptions: { onExcessProperty: "error" } })
export const Status = Schema.Struct({ action: Schema.Literal("status"), ...Ref }).annotate({ parseOptions: { onExcessProperty: "error" } })
export const Log = Schema.Struct({ action: Schema.Literal("log"), ...Ref, cursor: Schema.optional(NonNegativeInt),
  maxBytes: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65_536 }))) })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const Wait = Schema.Struct({ action: Schema.Literal("wait"), ...Ref, cursor: Schema.optional(NonNegativeInt),
  timeoutMs: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 60_000 }))) })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const Write = Schema.Struct({ action: Schema.Literal("write"), ...Ref, data: Text })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const Submit = Schema.Struct({ action: Schema.Literal("submit"), ...Ref, data: Text })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const CloseInput = Schema.Struct({ action: Schema.Literal("close-input"), ...Ref })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const Stop = Schema.Struct({ action: Schema.Literal("stop"), ...Ref }).annotate({ parseOptions: { onExcessProperty: "error" } })
export const Transfer = Schema.Struct({ action: Schema.Literal("transfer"), ...Ref })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const Input = Schema.Union([Start, List, Status, Log, Wait, Write, Submit, CloseInput, Stop, Transfer])
export type Input = typeof Input.Type

// Absolute UTF-8 byte offsets over the merged stdout+stderr stream since process start.
export const Window = Schema.Struct({ retainedStart: NonNegativeInt, end: NonNegativeInt, eof: Schema.Boolean })
export interface Window extends Schema.Schema.Type<typeof Window> {}
export const Chunk = Schema.Struct({
  start: NonNegativeInt, end: NonNegativeInt, text: Schema.String,
  // Requested bytes not returned: dropped by retention, or skipped to reach a UTF-8 boundary: [from, to).
  lost: Schema.optional(Schema.Struct({ from: NonNegativeInt, to: NonNegativeInt })),
  eof: Schema.Boolean,
})
export interface Chunk extends Schema.Schema.Type<typeof Chunk> {}
export const Exit = Schema.Struct({ code: Schema.optional(Schema.Int), signal: Schema.optional(Schema.String) })
export const ProcessStatus = Schema.Struct({
  process: Capability.JobRef, state: Capability.JobState, output: Window,
  input: Schema.Literals(["open", "closed"]), exit: Schema.optional(Exit),
})
export interface ProcessStatus extends Schema.Schema.Type<typeof ProcessStatus> {}
export const Output = Schema.Union([
  Schema.Struct({ action: Schema.Literal("start"), status: ProcessStatus }),
  Schema.Struct({ action: Schema.Literal("list"), items: Schema.Array(ProcessStatus) }),
  Schema.Struct({ action: Schema.Literals(["status", "write", "submit", "close-input"]), status: ProcessStatus }),
  Schema.Struct({ action: Schema.Literal("log"), status: ProcessStatus, chunk: Chunk }),
  Schema.Struct({ action: Schema.Literal("wait"), status: ProcessStatus, timedOut: Schema.Boolean }),
  // local-stop: the whole tree was signalled and exited; incomplete: survivors or unconfirmed exit.
  Schema.Struct({ action: Schema.Literal("stop"), status: ProcessStatus, outcome: Schema.Literals(["local-stop", "incomplete"]) }),
  Schema.Struct({ action: Schema.Literal("transfer"), status: ProcessStatus }),
])
export type Output = typeof Output.Type

/** Bounded byte buffer with absolute cursors. Pure, process-local. */
export type Buffer = Readonly<{
  append: (bytes: Uint8Array) => void
  end: () => void
  window: () => Window
  /** cursor defaults to retainedStart; text never splits a UTF-8 sequence. */
  read: (cursor: number | undefined, maxBytes: number) => Chunk
  /** Completes when end > cursor or eof. Interrupting it only detaches this waiter. */
  changed: (cursor: number) => Effect.Effect<void>
}>

export type StartInput = Readonly<{
  ref: Capability.JobRef
  owner: Capability.Owner
  command: ChildProcess.Command
  /** Runs inside the process Scope, e.g. ToolSafetySandbox.wrap. */
  prepare: (command: ChildProcess.Command) => Effect.Effect<ChildProcess.Command, unknown, Scope.Scope>
  /** Durable settlement through the producer's job service; called once after exit or stop. */
  settle: (outcome: Readonly<{ exit: typeof Exit.Type; stopped: boolean }>) => Effect.Effect<void>
}>

/** Process-global: handles outlive tool fibers and Location idle teardown, never serialize, die with the host. */
export type Registry = Readonly<{
  /** ToolSafety.Denied from prepare propagates unchanged so settlement can escalate it as a HOLD. */
  start: (input: StartInput) => Effect.Effect<Live, Capability.Failure | ToolSafety.Denied>
  /** Owner mismatch and unknown IDs fail identically with target_denied. */
  get: (ref: Capability.JobRef, owner: Capability.Owner) => Effect.Effect<Live, Capability.Failure>
  list: (owner: Capability.Owner) => Effect.Effect<readonly Live[]>
  /** Only refs the registry owns in this process; the startup sweep must not mark them lost. */
  live: () => ReadonlySet<Capability.JobID>
  startedAt: number
}>

export type Live = Readonly<{
  ref: Capability.JobRef
  owner: () => Capability.Owner
  output: Buffer
  input: () => "open" | "closed"
  exit: () => typeof Exit.Type | undefined
  write: (bytes: Uint8Array) => Effect.Effect<void, Capability.Failure>
  closeInput: () => Effect.Effect<void, Capability.Failure>
  stop: () => Effect.Effect<"local-stop" | "incomplete">
  /** Waits for exit; interruption detaches the waiter only. */
  exited: Effect.Effect<typeof Exit.Type>
  /** Atomic in-process owner swap after the durable owner update committed. Allowed after exit (owner === from). */
  transfer: (from: Capability.Owner, to: Capability.Owner) => Effect.Effect<void, Capability.Failure>
}>

export type Jobs = Effect.Success<typeof CapabilityJobs.make>
