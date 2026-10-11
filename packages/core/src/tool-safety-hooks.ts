export * as ToolSafetyHooks from "./tool-safety-hooks"

import path from "path"
import { createHash, randomUUID } from "crypto"
import { Cause, Clock, Context, Effect, Exit, Option, Schema } from "effect"
import type { ToolOutput, ToolResultValue } from "@orchestra/llm"
import { RelayHook } from "@orchestra/schema/relay-hook"
import type { RelayLedger } from "@orchestra/schema/relay-ledger"
import { HookEvaluate } from "@orchestra/relay/hook/evaluate"
import type { Database } from "./database/database"
import type { EventV2 } from "./event"
import type { Location } from "./location"
import { Patch } from "./patch"
import type { Relay } from "./relay"
import { RelayHookShipper } from "./relay-hook-shipper"
import { ToolSafety } from "./tool-safety"

// Installed Relay hooks on the tool path (relay-exec-spec H2, port plan §5). ToolSafety.run calls `before` once native
// safety passed and `after` once the effect settled successfully, both over the snapshot it loaded at the call's start.
// Hooks only restrict: a Block, a Repair, a rejected Approve and a failed Verify deny; Remind, Record and Allow grant
// nothing. Every matched action is first a durable `relay.hook.decided` event, then a receipt in the install's ledger,
// but no outcome waits on either. Session events (`session-start`, `prompt`, `session-idle`) take the same path.

export interface Scope {
  readonly installs: ReadonlyMap<string, RelayHook.Install>
  readonly call: ToolSafety.Invocation
  readonly invocation: Omit<HookEvaluate.Invocation, "timing">
  // The native profile, without hooks: a check's sandbox follows it like the tool's own processes do.
  readonly profile: ToolSafety.Profile | undefined
  // A Session event's: the sha256 of the prompt text, or nothing.
  readonly subject?: string
  readonly messageID?: ToolSafety.SessionEvent["messageID"]
  readonly events?: EventV2.Interface
  readonly db?: Database.Interface["db"]
  readonly location?: Location.Ref
  readonly relay?: Relay.Interface
}

/**
 * Where a host's calls run outside a Location (V1 Sessions): the Location their decisions belong to, and its Relay
 * service, acquired only once an enabled hook is in play.
 */
export const Placement = Context.Reference<
  { readonly location: Location.Ref; readonly relay: Effect.Effect<Relay.Interface | undefined> } | undefined
>("@orchestra/ToolSafetyHooks/Placement", { defaultValue: () => undefined })

/** What `before` decided, for the same call's `after`. */
export interface Hooked {
  readonly scope: Scope
  // Reminders and warnings for the result, in install and edge order.
  readonly notes: ReadonlyArray<string>
}

/** The `before` hooks of one call; undefined when no install is enabled. */
export const before = Effect.fn("ToolSafetyHooks.before")(function* (input: {
  readonly installs: ReadonlyArray<RelayHook.Install>
  readonly call: ToolSafety.Invocation
  readonly profile: ToolSafety.Profile | undefined
  readonly resolve: (target: string) => Effect.Effect<string, ToolSafety.Denied>
  // ToolSafety's construction context: a call's own context may lack the event or Relay service.
  readonly ambient: Context.Context<never>
}) {
  if (!input.installs.some((install) => install.enabled)) return undefined
  const scope = yield* scoped(input, input.call, yield* invocation(input.call, input.resolve))
  return { scope, notes: yield* enforce(scope, "before") } satisfies Hooked
})

/**
 * The hooks of one Session event. A denial stops only what comes after it: before `prompt` the caller refuses
 * admission; after `session-start` and `session-idle` there is no result to fail, so the caller only records.
 */
export const session = Effect.fn("ToolSafetyHooks.session")(function* (input: {
  readonly installs: ReadonlyArray<RelayHook.Install>
  readonly event: ToolSafety.SessionEvent
  readonly profile: ToolSafety.Profile | undefined
  readonly ambient: Context.Context<never>
}): Effect.fn.Return<ReadonlyArray<string>, ToolSafety.Denied> {
  if (!input.installs.some((install) => install.enabled)) return []
  const event = input.event
  // There is no tool call: decisions leave out the empty tool and call ID, and hosts bind the Session instead.
  const call = {
    tool: "",
    args: {},
    callID: "",
    sessionID: event.sessionID,
    ...(event.agent ? { agent: event.agent } : {}),
    ...(event.directory ? { directory: event.directory } : {}),
    ...(event.projectID ? { projectID: event.projectID } : {}),
    ...(event.projectDirectory ? { projectDirectory: event.projectDirectory } : {}),
  } satisfies ToolSafety.Invocation
  const subject = event.text === undefined ? undefined : createHash("sha256").update(event.text).digest("hex")
  const scope = yield* scoped(input, call, { operation: event.operation, paths: [] }, subject)
  return yield* enforce(
    { ...scope, ...(event.operation === "prompt" ? { messageID: event.messageID } : {}) },
    event.operation === "prompt" ? "before" : "after",
  )
})

/**
 * The `after` hooks of a call whose effect settled, then every note appended to its result. A failed check or a Repair
 * turns the result into a denial; the effect itself is not undone.
 */
export const after = <A>(hooked: Hooked, value: A, succeeded: boolean) =>
  Effect.gen(function* () {
    const notes = succeeded ? yield* enforce(hooked.scope, "after") : []
    return annotate(value, [...hooked.notes, ...notes])
  })

// The services a decision needs: the call's own context first, then ToolSafety's construction context, then a host's
// Placement outside any Location.
const scoped = Effect.fnUntraced(function* (
  input: {
    readonly installs: ReadonlyArray<RelayHook.Install>
    readonly profile: ToolSafety.Profile | undefined
    readonly ambient: Context.Context<never>
  },
  call: ToolSafety.Invocation,
  invocation: Omit<HookEvaluate.Invocation, "timing">,
  subject?: string,
) {
  const { EventV2 } = yield* Effect.promise(() => import("./event"))
  const { Location } = yield* Effect.promise(() => import("./location"))
  const { Database } = yield* Effect.promise(() => import("./database/database"))
  const placement = yield* Placement
  const location = yield* lookup(input.ambient, Location.Service)
  const found = yield* relay(input.ambient)
  const scope = {
    installs: new Map(input.installs.map((install) => [install.installID, install])),
    call,
    invocation,
    profile: input.profile,
    ...(subject === undefined ? {} : { subject }),
    events: yield* lookup(input.ambient, EventV2.Service),
    db: (yield* lookup(input.ambient, Database.Service))?.db,
    location: location ? { directory: location.directory, workspaceID: location.workspaceID } : placement?.location,
    relay: found ?? (placement ? yield* placement.relay : undefined),
  } satisfies Scope
  // An enabled-hook boundary retries missing receipts only in this Session, even if no hook step matches.
  if (scope.relay && scope.db)
    yield* RelayHookShipper.ship({
      relay: scope.relay,
      db: scope.db,
      sessionID: scope.call.sessionID,
    }).pipe(Effect.exit)
  return scope
})

const OPERATIONS = new Map<string, "read" | "edit" | "write" | "command">([
  ["read", "read"],
  ["edit", "edit"],
  ["multiedit", "edit"],
  ["write", "write"],
  ["bash", "command"],
  ["shell", "command"],
])

// The hook view of a call. Paths are project-relative, `/`-separated and canonical through ToolSafety's resolver, never
// the raw argument. `apply_patch` is `edit` over its update, move and delete paths plus `write` over its added files.
const invocation = Effect.fnUntraced(function* (
  call: ToolSafety.Invocation,
  resolve: (target: string) => Effect.Effect<string, ToolSafety.Denied>,
) {
  const args =
    call.args !== null && typeof call.args === "object" && !Array.isArray(call.args)
      ? (call.args as Record<string, unknown>)
      : {}
  const relative = (target: string) =>
    Effect.gen(function* () {
      if (!call.directory) return yield* new ToolSafety.Denied({ reason: "missing-native-binding" })
      const root = yield* resolve(call.projectDirectory ?? call.directory)
      return path.relative(root, yield* resolve(path.resolve(call.directory, target))).replaceAll("\\", "/")
    })
  const operation = OPERATIONS.get(call.tool)
  if (operation === "command")
    return {
      operation,
      tool: call.tool,
      paths: [],
      ...(typeof args.command === "string" ? { command: args.command } : {}),
    }
  if (call.tool === "apply_patch") {
    const hunks = yield* Effect.try({
      try: () => Patch.parse(typeof args.patchText === "string" ? args.patchText : ""),
      catch: () => new ToolSafety.Denied({ reason: "invalid-patch-acquisition" }),
    })
    const edited = yield* Effect.forEach(
      hunks.flatMap((hunk) => {
        if (hunk.type === "add") return []
        return hunk.type === "update" && hunk.movePath ? [hunk.path, hunk.movePath] : [hunk.path]
      }),
      relative,
    )
    const added = yield* Effect.forEach(
      hunks.flatMap((hunk) => (hunk.type === "add" ? [hunk.path] : [])),
      relative,
    )
    if (edited.length === 0) return { operation: "write" as const, tool: call.tool, paths: added }
    return {
      operation: "edit" as const,
      tool: call.tool,
      paths: edited,
      ...(added.length > 0 ? { also: [{ operation: "write" as const, paths: added }] } : {}),
    }
  }
  if (!operation) return { operation: "tool" as const, tool: call.tool, paths: [] }
  const target =
    typeof args.filePath === "string" ? args.filePath : typeof args.path === "string" ? args.path : undefined
  return { operation, tool: call.tool, paths: target === undefined ? [] : [yield* relative(target)] }
})

// Enabled installs in install order. Within an install, a failed Verify with a connected Fail port runs that branch in
// place of the rest of its install, which is the Verify's Pass continuation. The first denial ends the call.
const enforce = Effect.fnUntraced(function* (scope: Scope, timing: RelayHook.Timing) {
  const steps = yield* Effect.try({
    try: () => HookEvaluate.plan([...scope.installs.values()], { ...scope.invocation, timing }),
    // A hook that cannot be evaluated holds the call instead of letting it through.
    catch: () => new ToolSafety.Denied({ reason: "relay-hook-evaluation-acquisition" }),
  })
  const notes = yield* Effect.forEach(Map.groupBy(steps, (step) => step.installID).values(), (group) =>
    walk(scope, timing, group),
  )
  return notes.flat()
})

function walk(
  scope: Scope,
  timing: RelayHook.Timing,
  steps: ReadonlyArray<HookEvaluate.Step>,
): Effect.Effect<ReadonlyArray<string>, ToolSafety.Denied> {
  const step = steps[0]
  if (!step) return Effect.succeed([])
  return act(scope, timing, step).pipe(
    Effect.flatMap((acted) =>
      walk(scope, timing, acted.branch ?? steps.slice(1)).pipe(Effect.map((notes) => [...acted.notes, ...notes])),
    ),
  )
}

const AFTER = " The tool already ran; its effect was not undone."

const act = Effect.fnUntraced(function* (
  scope: Scope,
  timing: RelayHook.Timing,
  step: HookEvaluate.Step,
): Effect.fn.Return<
  { readonly notes: ReadonlyArray<string>; readonly branch?: ReadonlyArray<HookEvaluate.Step> },
  ToolSafety.Denied
> {
  const started = yield* Clock.currentTimeMillis
  const hook = scope.installs.get(step.installID)!.snapshot
  const node = hook.nodes.find((item) => item.id === step.nodeID)?.name ?? step.nodeID
  const tail = timing === "after" ? AFTER : ""
  const decide = (outcome: RelayLedger.HookOutcome) => decided(scope, timing, step, outcome, started)
  if (step.action === "remind") {
    yield* decide("reminded")
    return { notes: [`Hook '${hook.name}': ${step.message}`] }
  }
  if (step.action === "record" || step.action === "allow") {
    yield* decide(step.action === "record" ? "recorded" : "allowed")
    return { notes: [] }
  }
  if (step.action === "block") {
    yield* decide("blocked")
    return yield* deny("relay-hook-block", `Blocked by hook '${hook.name}': ${step.message}${tail}`)
  }
  if (step.action === "repair") {
    yield* decide("repair-required")
    return yield* deny("relay-hook-repair", `Hook '${hook.name}' requires a repair: ${step.message}${tail}`)
  }
  if (step.action === "approve") {
    yield* ask(scope, timing, step, `Hook '${hook.name}' asks for approval: ${step.message}`)
    return { notes: [] }
  }
  const verified = yield* check(scope, step)
  if (verified.verdict === "pass") {
    yield* decide("passed")
    return { notes: [] }
  }
  if (verified.verdict === "fail") {
    yield* decide("failed")
    if (step.onFail) return { notes: [], branch: step.onFail }
    return yield* deny("relay-hook-verify-failed", `Hook '${hook.name}' check '${node}' failed: ${step.message}${tail}`)
  }
  yield* decide("unavailable")
  const unavailable = `Hook '${hook.name}' check '${node}' could not run (${verified.reason ?? "unavailable"})`
  // A check that cannot run never blocks and never allows: before the effect, the user decides; after it, the result
  // stands with a warning.
  if (timing === "after") return { notes: [`${unavailable}; the result was kept: ${step.message}`] }
  yield* ask(scope, timing, step, `${unavailable}: ${step.message}`)
  return { notes: [] }
})

// One native approval, recorded with how it ended: approved, rejected, or cancelled when the call was interrupted.
function ask(scope: Scope, timing: RelayHook.Timing, step: HookEvaluate.Step, message: string) {
  return Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const started = yield* Clock.currentTimeMillis
      const decide = (outcome: RelayLedger.HookOutcome) => decided(scope, timing, step, outcome, started, "approve")
      const host = yield* ToolSafety.NativeHost
      if (!host) {
        yield* decide("rejected")
        return yield* deny("relay-hook-approve-native-binding-missing", message)
      }
      const exit = yield* restore(
        host.ask({
          action: "relay_hook",
          resources: resources(scope),
          invocation: scope.call,
          message,
          ...(scope.messageID === undefined ? {} : { messageID: scope.messageID }),
          ...(scope.invocation.tool === undefined ? { trigger: `${scope.invocation.operation}.${timing}` } : {}),
        }),
      ).pipe(Effect.exit)
      if (Exit.isSuccess(exit)) return yield* decide("approved")
      const interrupted = Cause.hasInterrupts(exit.cause)
      yield* decide(interrupted ? "cancelled" : "rejected")
      const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause))
      if (interrupted || !error) return yield* Effect.failCause(exit.cause)
      return yield* deny(error.reason, message)
    }),
  )
}

// Through Relay, which records the verdict in the install's ledger. Without Relay the check cannot run.
function check(scope: Scope, step: HookEvaluate.Step): Effect.Effect<Pick<Relay.Verified, "verdict" | "reason">> {
  if (!scope.relay || !scope.call.directory || step.check === undefined)
    return Effect.succeed({ verdict: "unavailable", reason: "relay-unavailable" })
  return scope.relay
    .verify({
      installID: step.installID,
      nodeID: step.nodeID,
      message: step.message,
      check: step.check,
      workdir: scope.call.directory,
      params: params(scope),
    })
    .pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, scope.profile),
      Effect.provideService(ToolSafety.NativeContext, {
        directory: scope.call.directory,
        projectID: scope.call.projectID,
      }),
      Effect.catchDefect(() => Effect.succeed({ verdict: "unavailable" as const, reason: "error" })),
    )
}

// Model-controlled values reach a check only as environment variables, never spliced into its command.
function params(scope: Scope) {
  const paths = [scope.invocation.paths, ...(scope.invocation.also ?? []).map((part) => part.paths)].flat()
  return {
    ...(scope.invocation.tool === undefined ? {} : { RELAY_HOOK_TOOL: scope.call.tool }),
    ...(paths.length > 0 ? { RELAY_HOOK_PATH: paths.join("\n") } : {}),
    ...(scope.invocation.command === undefined ? {} : { RELAY_HOOK_COMMAND: scope.invocation.command }),
  }
}

function resources(scope: Scope) {
  if (scope.invocation.tool === undefined) return [scope.invocation.operation]
  if (scope.invocation.command !== undefined) return [scope.invocation.command]
  const paths = [scope.invocation.paths, ...(scope.invocation.also ?? []).map((part) => part.paths)].flat()
  return paths.length > 0 ? paths : [scope.call.tool]
}

function deny(reason: string, detail: string) {
  return Effect.fail(new ToolSafety.Denied({ reason, detail }))
}

/**
 * The durable decision, then its receipt. Its subject is the matched paths, or the sha256 of the command or prompt, so
 * their text stays in the Session record only. It never decides: a payload that does not decode, a missing service or a
 * failed write leave the outcome as it is. A receipt that cannot be written now is retried at the next enabled-hook
 * boundary in the same Session, or with its next decision; this is not startup or global recovery.
 */
const decided = Effect.fnUntraced(function* (
  scope: Scope,
  timing: RelayHook.Timing,
  step: HookEvaluate.Step,
  outcome: RelayLedger.HookOutcome,
  started: number,
  action: RelayLedger.HookAction = step.action,
) {
  const install = scope.installs.get(step.installID)!
  const operation =
    install.snapshot.nodes.flatMap((node) =>
      node.type === RelayHook.NodeType.trigger && node.parameters.timing === timing ? [node.parameters.operation] : [],
    )[0] ?? scope.invocation.operation
  const data = Schema.decodeUnknownOption(RelayHook.Decided.data)({
    decisionID: randomUUID(),
    installID: install.installID,
    version: install.version,
    sha256: install.sha256,
    nodeID: step.nodeID,
    action,
    trigger: `${operation}.${timing}`,
    ...(scope.invocation.tool === undefined ? {} : { tool: scope.call.tool }),
    sessionID: scope.call.sessionID,
    ...(scope.invocation.tool === undefined ? {} : { callID: scope.call.callID }),
    ...(scope.call.assistantMessageID ? { assistantMessageID: scope.call.assistantMessageID } : {}),
    ...(scope.messageID === undefined ? {} : { messageID: scope.messageID }),
    ...(scope.call.agent ? { agent: scope.call.agent } : {}),
    subject: subject(scope, operation),
    outcome,
    durationMs: Math.max(0, (yield* Clock.currentTimeMillis) - started),
  })
  const events = scope.events
  if (Option.isNone(data) || !events) return
  yield* RelayHookShipper.track(
    data.value.decisionID,
    Effect.gen(function* () {
      const published = yield* events
        .publish(RelayHook.Decided, data.value, scope.location ? { location: scope.location } : undefined)
        .pipe(Effect.exit)
      if (Exit.isFailure(published) || !scope.relay || !scope.db) return
      yield* RelayHookShipper.ship({
        relay: scope.relay,
        db: scope.db,
        sessionID: scope.call.sessionID,
        current: data.value.decisionID,
      }).pipe(Effect.exit)
    }),
  )
})

function subject(scope: Scope, operation: RelayHook.Operation) {
  if (scope.invocation.tool === undefined) return scope.subject ?? ""
  const command = scope.invocation.command
  if (command !== undefined && (operation === "command" || operation === "tool"))
    return createHash("sha256").update(command).digest("hex")
  return [{ operation: scope.invocation.operation, paths: scope.invocation.paths }, ...(scope.invocation.also ?? [])]
    .filter((part) => operation === "tool" || part.operation === operation)
    .flatMap((part) => part.paths)
    .join("\n")
}

// The call's own context first, then ToolSafety's construction context.
function lookup<I, S>(ambient: Context.Context<never>, key: Context.Key<I, S>) {
  return Effect.serviceOption(key).pipe(
    Effect.map((found) => Option.getOrUndefined(Option.orElse(found, () => Context.getOption(ambient, key)))),
  )
}

// Loaded on demand: Relay imports ToolSafety, and the engine is only needed once a hook runs.
function relay(ambient: Context.Context<never>) {
  return Effect.tryPromise({ try: () => import("./relay"), catch: () => undefined }).pipe(
    Effect.flatMap((module) => lookup(ambient, module.Relay.Service)),
    Effect.orElseSucceed(() => undefined),
  )
}

/**
 * Notes reach the model on the V2 registry's settlement, where the model reads its `result` and the Session records its
 * `output`, and on a V1 tool's text `output`. Any other value is returned as it is; its decisions are still recorded.
 */
function annotate<A>(value: A, notes: ReadonlyArray<string>): A {
  if (notes.length === 0) return value
  const text = notes.join("\n")
  if (legacy(value)) return { ...value, output: `${value.output}\n\n${text}` }
  if (!settlement(value)) return value
  const output = value.output && {
    ...value.output,
    content: [...value.output.content, { type: "text" as const, text }],
  }
  return { ...value, result: appended(value.result, text), ...(output ? { output } : {}) }
}

function legacy<A>(value: A): value is A & { readonly output: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    !("result" in value) &&
    "output" in value &&
    typeof value.output === "string"
  )
}

function settlement<A>(value: A): value is A & { readonly result: ToolResultValue; readonly output?: ToolOutput } {
  if (value === null || typeof value !== "object" || !("result" in value)) return false
  const result = value.result
  return (
    result !== null &&
    typeof result === "object" &&
    "type" in result &&
    "value" in result &&
    ["text", "json", "error", "content"].includes(String(result.type))
  )
}

function appended(result: ToolResultValue, text: string): ToolResultValue {
  if (result.type === "content") return { type: "content", value: [...result.value, { type: "text", text }] }
  if (result.type === "json")
    return {
      type: "content",
      value: [
        { type: "text", text: stringify(result.value) },
        { type: "text", text },
      ],
    }
  return { type: result.type, value: `${stringify(result.value)}\n\n${text}` }
}

function stringify(value: unknown) {
  if (typeof value === "string") return value
  return JSON.stringify(value) ?? String(value)
}
