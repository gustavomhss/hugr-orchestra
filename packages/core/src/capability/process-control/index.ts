export * as CapabilityProcessControl from "./index"

import { Capability } from "@orchestra/schema/capability"
import { eq } from "drizzle-orm"
import { Cause, Context, Duration, Effect, Exit, Option } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Database } from "../../database/database"
import { FSUtil } from "../../fs-util"
import { Location } from "../../location"
import { LocationMutation } from "../../location-mutation"
import { PermissionV2 } from "../../permission"
import { AppProcess } from "../../process"
import { SessionStore } from "../../session/store"
import { Tool } from "../../tool/tool"
import { ToolSafety } from "../../tool-safety"
import { ToolSafetyCommands } from "../../tool-safety-commands"
import { ToolSafetyGit } from "../../tool-safety-git"
import { ToolSafetySandbox } from "../../tool-safety-sandbox"
import { CapabilityInvocation } from "../invocation"
import { CapabilityJobs } from "../job"
import { CapabilityJobTable } from "../sql"
import { CapabilityProcessContract } from "./contract"
import { CapabilityProcessRegistry } from "./registry"

export const name = "process_control"
type Error = Capability.Failure | ToolSafety.Denied | LocationMutation.PathError | FSUtil.Error |
  Effect.Error<ReturnType<PermissionV2.Interface["assert"]>>

/** Location producer only. The lead registers this canonical leaf through capability/tools. */
export const make = (options: { jobs: CapabilityProcessContract.Jobs }) => Effect.gen(function* () {
  const jobs = options.jobs
  const location = yield* Location.Service
  const database = yield* Database.Service
  const registry = yield* CapabilityProcessRegistry.Service
  const permission = yield* PermissionV2.Service
  const mutation = yield* LocationMutation.Service
  const sessions = yield* SessionStore.Service
  const fs = yield* FSUtil.Service
  const appProcess = yield* AppProcess.Service
  const placement = { projectID: location.project.id,
    location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) }
  const native = { directory: location.directory, projectID: location.project.id }

  const bound = Effect.fn("CapabilityProcessControl.bound")(function* (context: Tool.Context) {
    const binding = yield* CapabilityInvocation.require(context, placement)
    if (binding.rootToolName !== name) return yield* failure("invocation_binding_mismatch")
    return binding
  })
  // Durable job state is the owner-scoped truth (jobs.read rechecks the owner); exit and output are live-only facts.
  const status = (context: Tool.Context, live: CapabilityProcessContract.Live) => jobs.read(context, live.ref).pipe(
    Effect.map((receipt): CapabilityProcessContract.ProcessStatus => {
      const exit = live.exit()
      return { process: live.ref, state: receipt.state, output: live.output.window(), input: live.input(),
        ...(exit ? { exit } : {}) }
    }))
  // The proof follows the durable row, so settlement and transfer always use the current (possibly transferred) owner.
  const proofOf = Effect.fn("CapabilityProcessControl.proof")(function* (ref: Capability.JobRef) {
    const row = yield* database.db.select().from(CapabilityJobTable).where(eq(CapabilityJobTable.id, ref.id)).get()
      .pipe(Effect.orDie)
    const proof = row ? CapabilityJobs.proofFromRow(row) : Option.none()
    if (!row || Option.isNone(proof)) return yield* failure("target_denied")
    return { proof: proof.value, generation: row.generation, state: row.state }
  })
  const observe = (ref: Capability.JobRef, state: Capability.JobState, observation: CapabilityJobs.Observation) =>
    Effect.gen(function* () {
      const current = yield* proofOf(ref)
      if (current.state === state) return
      yield* jobs.observeHost(current.proof, ref, { expectedGeneration: current.generation, state, observation })
    }).pipe(Effect.retry({ times: 2, while: (error) => error instanceof Capability.Failure }))

  const start = Effect.fn("CapabilityProcessControl.start")(function* (input: typeof CapabilityProcessContract.Start.Type,
    context: Tool.Context) {
    if (input.mode === "pty") return yield* failure("unsupported_operation")
    const binding = yield* bound(context)
    const source = { type: "tool" as const, messageID: context.assistantMessageID, callID: context.toolCallID }
    const target = yield* mutation.resolve({ path: input.cwd ?? ".", kind: "directory" })
    if (target.externalDirectory) yield* permission.assert({ ...LocationMutation.externalDirectoryPermission(target.externalDirectory),
      sessionID: context.sessionID, agent: context.agent, source })
    // One string for permission, git hygiene and command safety: explicit env changes what runs, so it is part of it.
    const display = ToolSafetyCommands.display(input.argv, input.env ?? {})
    yield* permission.assert({ action: "bash", resources: [display], save: [display],
      sessionID: context.sessionID, agent: context.agent, source })
    if ((yield* fs.stat(target.canonical)).type !== "Directory") return yield* failure("unsupported_operation")
    const explicit = input.env ?? {}
    const env = { ...ToolSafetySandbox.environment(), ...explicit }
    const profile = yield* ToolSafety.RuntimeProfile
    yield* ToolSafetyGit.before({ command: display, directory: location.directory,
      projectDirectory: location.project.directory === "/" ? location.directory : location.project.directory,
      cwd: target.canonical, env, managedPaths: profile?.managedPaths, neverTouch: profile?.neverTouch,
    }).pipe(Effect.provideService(FSUtil.Service, fs), Effect.provideService(AppProcess.Service, appProcess))
    const command = ChildProcess.make(input.argv[0] ?? "", input.argv.slice(1), { cwd: target.canonical, env,
      extendEnv: false, stdin: "pipe", detached: process.platform !== "win32", forceKillAfter: Duration.seconds(3) })
    // wrap re-filters credential-like names; explicitly bound entries it dropped are restored, sandbox overrides win.
    const prepare = (next: ChildProcess.Command) => ToolSafetySandbox.wrap(next).pipe(
      Effect.map((wrapped) => wrapped._tag !== "StandardCommand" ? wrapped : ChildProcess.make(wrapped.command, wrapped.args, {
        ...wrapped.options, extendEnv: false, env: { ...Object.fromEntries(Object.entries(explicit)
          .filter(([key]) => wrapped.options.env?.[key] === undefined)), ...wrapped.options.env } })),
      Effect.provideService(FSUtil.Service, fs), Effect.provideService(ToolSafety.RuntimeProfile, profile),
      Effect.provideService(ToolSafety.NativeContext, native))
    // Durable intent through running and the spawn are one indivisible step: no running job without a process attempt.
    return yield* Effect.uninterruptible(Effect.gen(function* () {
      const ref = yield* jobs.create(context, { kind: "local-process", operation: "process.start" })
      const settle = (outcome: Readonly<{ exit: typeof CapabilityProcessContract.Exit.Type; stopped: boolean }>) =>
        (outcome.stopped
          ? observe(ref, "cancel-requested", { cancellation: "requested" })
            .pipe(Effect.andThen(observe(ref, "cancelled", { cancellation: "confirmed" })))
          : observe(ref, outcome.exit.code === 0 ? "completed" : "failed", {})).pipe(
          Effect.catchCause((cause) => Effect.logWarning("process_control settlement failed", cause)))
      const started = yield* Effect.gen(function* () {
        yield* jobs.transition(context, ref, { expectedGeneration: 0, state: "submitting", observation: {} })
        yield* jobs.transition(context, ref, { expectedGeneration: 1, state: "running", observation: {} })
        return yield* registry.start({ ref, owner: binding.owner, command, prepare, settle })
      }).pipe(Effect.exit)
      if (Exit.isSuccess(started)) return started.value
      const marked = yield* observe(ref, "failed", {}).pipe(Effect.exit)
      return yield* Effect.failCause(Exit.isFailure(marked)
        ? Cause.fromReasons<Error>([...started.cause.reasons, ...marked.cause.reasons]) : started.cause)
    }))
  })

  const owned = Effect.fn("CapabilityProcessControl.owned")(function* (context: Tool.Context, ref: Capability.JobRef) {
    const binding = yield* bound(context)
    return { binding, live: yield* registry.get(ref, binding.owner) }
  })

  const transfer = Effect.fn("CapabilityProcessControl.transfer")(function* (context: Tool.Context, ref: Capability.JobRef) {
    const entry = yield* owned(context, ref)
    const from = entry.binding.owner
    const session = yield* sessions.get(from.sessionID)
    const parent = session?.parentID ? yield* sessions.get(session.parentID) : undefined
    if (!parent?.agent || parent.projectID !== from.projectID || parent.location.directory !== from.location.directory ||
      parent.location.workspaceID !== from.location.workspaceID) return yield* failure("target_denied")
    if (entry.live.exit() !== undefined) return yield* failure("unsupported_operation")
    const to: Capability.Owner = { ...from, sessionID: parent.id, agentID: parent.agent }
    const current = yield* proofOf(ref)
    if (current.proof.owner.sessionID !== from.sessionID || current.proof.owner.agentID !== from.agentID)
      return yield* failure("target_denied")
    // Read while the caller still owns the job; transfer changes only the owner, not the state.
    const before = yield* status(context, entry.live)
    yield* jobs.transferHost(current.proof, ref, { expectedGeneration: current.generation, owner: to })
    yield* entry.live.transfer(from, to)
    return { action: "transfer" as const, status: before }
  })

  const run = Effect.fn("CapabilityProcessControl.run")(function* (input: CapabilityProcessContract.Input,
    context: Tool.Context): Effect.fn.Return<CapabilityProcessContract.Output, Error> {
    if (input.action === "start") {
      const live = yield* start(input, context)
      return { action: "start", status: yield* status(context, live) }
    }
    if (input.action === "list") {
      const binding = yield* bound(context)
      const lives = yield* registry.list(binding.owner)
      return { action: "list", items: yield* Effect.forEach(lives.slice(0, 32), (live) => status(context, live)) }
    }
    if (input.action === "transfer") return yield* transfer(context, { id: input.id })
    const live = (yield* owned(context, { id: input.id })).live
    if (input.action === "status") return { action: "status", status: yield* status(context, live) }
    if (input.action === "log") return { action: "log", status: yield* status(context, live),
      chunk: live.output.read(input.cursor, input.maxBytes ?? 16_384) }
    if (input.action === "write" || input.action === "submit") {
      yield* live.write(new TextEncoder().encode(input.action === "submit" ? `${input.data}\n` : input.data))
      return { action: input.action, status: yield* status(context, live) }
    }
    if (input.action === "close-input") {
      yield* live.closeInput()
      return { action: "close-input", status: yield* status(context, live) }
    }
    if (input.action === "stop") {
      const outcome = yield* live.stop()
      return { action: "stop", status: yield* status(context, live), outcome }
    }
    const cursor = input.cursor ?? live.output.window().end
    const changed = yield* Effect.raceFirst(live.output.changed(cursor), live.exited.pipe(Effect.asVoid)).pipe(
      Effect.timeoutOption(Duration.millis(input.timeoutMs ?? 30_000)))
    return { action: "wait", status: yield* status(context, live), timedOut: changed._tag === "None" }
  })

  const toolFailure = (error: Error) => new Tool.Failure({ message: error instanceof Capability.Failure ? error.code
    : error instanceof ToolSafety.Denied ? error.message : `process_control_${error._tag}`,
    // Settlement escalates a passed-through Denied as a safety HOLD instead of an ordinary tool error.
    ...(error instanceof ToolSafety.Denied ? { error } : {}) })
  const toolErrors = <A>(effect: Effect.Effect<A, Error>) => effect.pipe(
    Effect.exit,
    Effect.flatMap((exit) => Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(
      Cause.fromReasons<Tool.Failure>(exit.cause.reasons.flatMap((reason) => reason._tag === "Fail"
        ? Cause.fail(toolFailure(reason.error)).reasons.map((next) => next.annotate(Context.makeUnsafe(new Map(reason.annotations))))
        : [reason])))),
  )
  const tools = {
    [name]: Tool.make({
      description: `Start and control a long-running local process from an explicit argv (never shell text). \
Actions: start, list, status, log, wait, write, submit (data plus newline), close-input, stop, transfer (to the parent Session). \
Output is merged stdout+stderr addressed by absolute byte cursors; pass the previous chunk end as the next cursor.`,
      input: CapabilityProcessContract.Input, output: CapabilityProcessContract.Output,
      execute: (input, context) => run(input, context).pipe(toolErrors),
      toModelOutput: ({ output }) => [{ type: "text", text: JSON.stringify(output) }],
    }),
  }
  return { tools }
})

function failure(code: Capability.ErrorCode) {
  return new Capability.Failure({ code, message: "Process control action is unavailable" })
}
