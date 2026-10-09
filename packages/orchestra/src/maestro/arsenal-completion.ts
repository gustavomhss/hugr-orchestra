export * as ArsenalCompletion from "./arsenal-completion"

import path from "path"
import { createHash, randomUUID } from "node:crypto"
import { Cause, Context, Effect, FileSystem, Layer, Option, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import type { RelaySprint } from "@orchestra/schema/relay-sprint"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppProcess } from "@orchestra/core/process"
import { ChildProcess } from "effect/unstable/process"
import { Location } from "@orchestra/core/location"
import { Relay } from "@orchestra/core/relay"
import { AbsolutePath } from "@orchestra/core/schema"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolFailure } from "@orchestra/llm"
import { ToolSafetyGit } from "@orchestra/core/tool-safety-git"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { RelayWorkflowSession } from "@orchestra/core/relay-workflow-session"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { WorkflowBinding } from "./workflow-binding"
import { isDeepStrictEqual } from "node:util"

// The Arsenal completion host on the Relay arm (port plan §6). The model only arms a contract; the native dispatch binds
// it, the Relay arm under the same token is the one evaluator, and Relay is the only writer of the arm and its ledger.
export type CheckOutcome = { readonly status: "pass" | "fail" | "skip" | "missing" | "acquisition-error"; readonly exitCode?: number }
export type Dispatch = {
  readonly sessionID: string
  readonly taskID: string
  readonly callID: string
  readonly directory: string
  readonly projectID: string
  readonly planID?: string
  readonly workflow?: {
    readonly selection: WorkflowBinding.Selection
    readonly assistantMessageID: string
    readonly logicalTaskID: string
    readonly writePaths: readonly string[]
    readonly subagentType: string
    readonly prompt: string
    readonly model?: string
  }
}
export type Binding = Dispatch & {
  readonly planID: string
  readonly token: string
  readonly stateDirectory: string
  readonly ownedPaths: ReadonlyArray<string>
}
export type Capture = RelayArm.HostCapture
export type HostCheck = (binding: Binding) => Effect.Effect<CheckOutcome, unknown>
export interface Host {
  /** Native authority resolves a stored token by actual dispatch identity. Never read model metadata. */
  readonly resolve: (input: Dispatch) => Effect.Effect<Binding | undefined, ToolSafety.Denied>
  readonly checks: ReadonlyMap<string, HostCheck>
  /** The Relay service of the binding's Location, which holds the arm and its ledger. */
  readonly relay: (placement: { readonly directory: string; readonly projectID: string }) => Effect.Effect<Relay.Interface, ToolSafety.Denied>
  /** Records the checks run so far in one evaluation, before the disposition of the gate that ran them. */
  readonly observe: (binding: Binding, capture: Capture) => Effect.Effect<void>
}
export const NativeHost = Context.Reference<Host | undefined>("@orchestra/ArsenalCompletion/NativeHost", { defaultValue: () => undefined })
export type Receipt = { readonly taskID: string; readonly planID: string; readonly directory: string }
const receipts = new WeakMap<Receipt, {
  host: Host; binding: Binding; contract: RelayArm.Contract; fingerprint: string; checks: ReadonlyMap<string, HostCheck>
  relay: Relay.Interface
  workflow?: Effect.Success<ReturnType<typeof WorkflowBinding.adopt>>
}>()

export const make = Effect.gen(function* () {
  const host = yield* NativeHost
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const git = (directory: string, args: string[]) => processes.run(ChildProcess.make("git", [
    "--no-optional-locks", "-C", directory, "-c", "core.fsmonitor=false", ...args,
  ], { cwd: directory, env: { ...ToolSafetySandbox.environment(), GIT_OPTIONAL_LOCKS: "0" }, extendEnv: false }), {
    timeout: "10 seconds", maxOutputBytes: 512 * 1024, maxErrorBytes: 1024,
  }).pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "completion-git-acquisition" })),
    Effect.flatMap((result) => result.exitCode || result.stdoutTruncated || result.stderrTruncated
      ? Effect.fail(new ToolSafety.Denied({ reason: "completion-git-failed-or-overflow" })) : Effect.succeed(result.stdout.toString("utf8"))))
  // HEAD with the exact git codes; the arm's revision guard then binds the checks to the HEAD it reads itself.
  const head = (directory: string) => git(directory, ["rev-parse", "HEAD"]).pipe(
    Effect.map((text) => text.trim()),
    Effect.filterOrFail((text) => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(text),
      () => new ToolSafety.Denied({ reason: "completion-revision-acquisition" })),
  )

  const load = (binding: Binding) => Effect.scoped(Effect.gen(function* () {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(binding.token) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(binding.projectID))
      return yield* new ToolSafety.Denied({ reason: "completion-state-identity-invalid" })
    const state = yield* fs.realPath(binding.stateDirectory)
    if (FSUtil.contains(binding.directory, state)) return yield* new ToolSafety.Denied({ reason: "completion-state-inside-project" })
    const file = path.join(state, binding.projectID, "completion", `${binding.token}.json`)
    if ((yield* fs.realPath(file)) !== file) return yield* new ToolSafety.Denied({ reason: "completion-state-symlink" })
    const handle = yield* fs.open(file, { flag: "r" })
    const info = yield* handle.stat
    if (info.type !== "File" || info.size > 512 * 1024) return yield* new ToolSafety.Denied({ reason: "completion-state-overflow-or-type" })
    const bytes = Option.getOrUndefined(yield* handle.readAlloc(512 * 1024 + 1)) ?? new Uint8Array()
    const after = yield* handle.stat
    if (bytes.length !== Number(info.size) || after.size !== info.size ||
      Option.getOrUndefined(after.mtime)?.getTime() !== Option.getOrUndefined(info.mtime)?.getTime())
      return yield* new ToolSafety.Denied({ reason: "completion-state-changed" })
    const stateValue = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(RelayArm.Stored))(
      new TextDecoder().decode(bytes), { onExcessProperty: "error" },
    )
    if (stateValue.projectID !== binding.projectID || stateValue.contract.sessionID !== binding.sessionID)
      return yield* new ToolSafety.Denied({ reason: "completion-project-or-session-mismatch" })
    const checks = stateValue.contract.chain.flatMap((gate) => gate.checks)
    if (checks.length > 1000 || new Set(checks.map((check) => check.id)).size !== checks.length ||
      new Set(stateValue.contract.chain.map((gate) => gate.id)).size !== stateValue.contract.chain.length)
      return yield* new ToolSafety.Denied({ reason: "completion-callback-cap-or-duplicate" })
    return { contract: stateValue.contract, fingerprint: createHash("sha256").update(JSON.stringify(stateValue)).digest("hex") }
  })).pipe(Effect.mapError((error) => error instanceof ToolSafety.Denied ? error : new ToolSafety.Denied({ reason: "completion-state-acquisition" })))

  // PUT the Relay arm under the Arsenal token (same body 200, different body 409), then refuse a parked one before any
  // worker runs (Maestro condition 3).
  const arm = Effect.fn("ArsenalCompletion.arm")(function* (relay: Relay.Interface, binding: Binding,
    loaded: { readonly contract: RelayArm.Contract; readonly fingerprint: string }) {
    if (FSUtil.contains(binding.directory, relay.paths.root))
      return yield* new ToolSafety.Denied({ reason: "completion-state-inside-project" })
    if (path.basename(relay.paths.root) !== binding.projectID)
      return yield* new ToolSafety.Denied({ reason: "completion-dispatch-binding-mismatch" })
    const meta: RelayArm.Meta = {
      workdir: yield* fs.realPath(binding.directory).pipe(
        Effect.mapError(() => new ToolSafety.Denied({ reason: "completion-state-acquisition" })),
      ),
      token: binding.token,
      label: loaded.contract.label,
      project_id: binding.projectID,
      session_id: binding.sessionID,
      contract_sha256: loaded.fingerprint,
    }
    // The arm belongs to the dispatching session, which owns the contract, so every retry evaluates the same arm.
    yield* relay.create({ token: binding.token, sprint: sprint(loaded.contract), meta, agentID: binding.sessionID }).pipe(
      Effect.mapError((error) => new ToolSafety.Denied({
        reason: error._tag === "ArmCreate.Conflict" ? "completion-contract-drift" : "completion-state-acquisition",
      })),
    )
    const parked = yield* relay.parked(binding.token).pipe(
      Effect.mapError(() => new ToolSafety.Denied({ reason: "completion-evaluation-acquisition" })),
    )
    if (Option.isSome(parked)) return yield* new ToolSafety.Denied({
      reason: "completion-parked-awaiting-owner", detail: Relay.parkedHold(parked.value.wp, parked.value.failing),
    })
  })

  const beforeDispatch = Effect.fn("ArsenalCompletion.beforeDispatch")(function* (input: Dispatch) {
    if (!host && input.workflow) return yield* new ToolSafety.Denied({ reason: "WORKFLOW_NATIVE_ARM_UNBOUND" })
    if (!host) return
    const binding = yield* host.resolve(input)
    if (!binding && input.workflow) return yield* new ToolSafety.Denied({ reason: "WORKFLOW_NATIVE_ARM_UNBOUND" })
    if (!binding) return
    if (typeof host.relay !== "function" || typeof host.observe !== "function")
      return yield* new ToolSafety.Denied({ reason: "completion-evaluator-or-observer-unbound" })
    if (!binding.planID || binding.sessionID !== input.sessionID || binding.taskID !== input.taskID ||
      binding.callID !== input.callID || binding.projectID !== input.projectID ||
      (input.planID !== undefined && input.planID !== binding.planID) ||
      (yield* fs.realPath(input.directory)) !== (yield* fs.realPath(binding.directory)))
      return yield* new ToolSafety.Denied({ reason: "completion-dispatch-binding-mismatch" })
    const loaded = yield* load(binding)
    const checks = new Map(host.checks)
    if (loaded.contract.chain.some((gate) => gate.checks.some((check) => !checks.has(check.hostCheck))))
      return yield* new ToolSafety.Denied({ reason: "completion-host-check-unbound" })
    yield* head(binding.directory)
    const relay = yield* host.relay(binding)
    if (input.workflow) {
      const workflow = yield* WorkflowBinding.adopt({ token: binding.token, relay,
        dispatch: { ...input, ...input.workflow, workflow: input.workflow.selection },
        globalChecks: loaded.contract.chain.flatMap((gate) => gate.checks), availableChecks: new Set(checks.keys()),
      }).pipe(Effect.provideService(FileSystem.FileSystem, fs),
        Effect.mapError((error) => new ToolSafety.Denied({ reason: error instanceof RelayWorkflowBinding.Held
        ? error.reason : "WORKFLOW_BINDING_ACQUISITION" })))
      const receipt = Object.freeze({ taskID: binding.taskID, planID: binding.planID, directory: binding.directory })
      receipts.set(receipt, { host, binding, ...loaded, checks, relay, workflow })
      return receipt
    }
    yield* arm(relay, binding, loaded)
    const receipt = Object.freeze({ taskID: binding.taskID, planID: binding.planID, directory: binding.directory })
    receipts.set(receipt, { host, binding, ...loaded, checks, relay })
    return receipt
  })

  const verifiedCompletion = Effect.fn("ArsenalCompletion.verifiedCompletion")(function* (receipt: Receipt | undefined, taskID: string) {
    if (!receipt) return
    const current = receipts.get(receipt)
    if (!current || receipt.taskID !== taskID) return yield* new ToolSafety.Denied({ reason: "completion-receipt-unbound" })
    const native = workflowSessionHost(receipt)
    receipts.delete(receipt)
    if ((yield* load(current.binding)).fingerprint !== current.fingerprint)
      return yield* new ToolSafety.Denied({ reason: "completion-contract-drift" })
    if (current.workflow) {
      yield* current.workflow.revalidate().pipe(Effect.mapError((error) => new ToolSafety.Denied({ reason: error.reason })))
      const view = yield* current.relay.currentStep(current.workflow.token, current.workflow.binding).pipe(
        Effect.mapError(() => new ToolSafety.Denied({ reason: "WORKFLOW_STATE_ACQUISITION" })),
      )
      if (view.pending) {
        if (!native) return yield* new ToolSafety.Denied({ reason: "WORKFLOW_NATIVE_HOST_UNBOUND" })
        yield* native.settle({ token: current.workflow.token, binding: current.workflow.binding, view }, view.pending.settlement)
          .pipe(Effect.mapError((error) => new ToolSafety.Denied({ reason: error.reason })))
      }
      const complete = view.pending ? yield* current.relay.currentStep(current.workflow.token, current.workflow.binding)
        .pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "WORKFLOW_STATE_ACQUISITION" }))) : view
      if (complete.pending || complete.state !== "complete") return yield* new ToolSafety.Denied({ reason: "WORKFLOW_CHAIN_INCOMPLETE" })
      const audit = yield* current.relay.audit(current.workflow.token).pipe(Effect.option)
      if (Option.isNone(audit) || audit.value.result !== "PASS")
        return yield* new ToolSafety.Denied({ reason: "WORKFLOW_AUDIT_UNAVAILABLE" })
      yield* current.workflow.host.complete(current.workflow.binding).pipe(
        Effect.mapError((error) => new ToolSafety.Denied({ reason: error.reason })),
      )
      return { verified: true as const, planID: current.binding.planID, taskID, checks: audit.value.controls.length }
    }
    const binding = current.binding
    const revision = yield* head(binding.directory)
    // Every result this evaluation produced; each gate's observation carries all of them, so the last one is whole.
    const seen: RelayArm.HostCheckResult[] = []
    // Why an observation stopped the evaluation, which the arm itself reports only as a defect.
    const refused: { reason?: string } = {}
    const evaluation = yield* current.relay.evaluate({
      token: binding.token,
      agentID: binding.sessionID,
      mode: "all-gates",
      revisionGuard: true,
      blockCap: 0,
      hostChecks: new Map([...current.checks].map(([name, check]) => [name, adapt(check, binding, revision)])),
      observe: (capture) => {
        if (!capture.complete) {
          refused.reason = "completion-host-check-unbound"
          return Effect.die(new ToolSafety.Denied({ reason: refused.reason }))
        }
        seen.push(...capture.results)
        return current.host.observe(binding, { complete: true, results: [...seen] }).pipe(
          Effect.catchCause((cause) => {
            const error = Cause.squash(cause)
            refused.reason = error instanceof ToolSafety.Denied ? error.reason : "completion-evaluation-acquisition"
            return Effect.die(error)
          }),
        )
      },
    }).pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "completion-evaluation-acquisition" })))
    if (refused.reason) return yield* new ToolSafety.Denied({ reason: refused.reason })
    const hold = Relay.hold(evaluation)
    if (hold === "completion-parked-awaiting-owner")
      return yield* new ToolSafety.Denied({ reason: hold, detail: Relay.parkedHold(evaluation.wp ?? "", evaluation.failing) })
    if (evaluation.outcome === "noop") return yield* new ToolSafety.Denied({ reason: "completion-evaluation-acquisition",
      detail: "This arm already passed every gate and cannot verify new work; arm a new contract for the next task." })
    if (hold) return yield* new ToolSafety.Denied({ reason: hold })
    // A pass is one Relay can audit: an intact chain and every control passing.
    const audit = yield* current.relay.audit(binding.token).pipe(Effect.option)
    if (Option.isNone(audit) || audit.value.result !== "PASS")
      return yield* new ToolSafety.Denied({ reason: "completion-evaluation-acquisition" })
    return { verified: true as const, planID: binding.planID, taskID, checks: seen.length }
  })

  const workflowSessionHost = (receipt: Receipt | undefined) => {
    const current = receipt ? receipts.get(receipt) : undefined
    if (!current?.workflow) return
    const ready = current.workflow
    const sessionHost: RelayWorkflowSession.Host = {
      current: (bound) => Effect.gen(function* () {
        if (bound.token !== ready.token || !isDeepStrictEqual(bound.binding, ready.binding))
          return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })
        yield* ready.revalidate()
        const view = yield* current.relay.currentStep(ready.token, ready.binding).pipe(
          Effect.mapError(() => new RelayWorkflowBinding.Held({ reason: "WORKFLOW_STATE_ACQUISITION" })),
        )
        return { token: ready.token, binding: ready.binding, view }
      }),
      settle: (position, settlement) => Effect.gen(function* () {
        if (position.token !== ready.token || !isDeepStrictEqual(position.binding, ready.binding))
          return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })
        yield* ready.verifySettlement(settlement.assistantMessageID)
        return yield* current.relay.transition({
        token: ready.token, binding: ready.binding, settlement,
        agentID: ready.binding.executionSessionID, revalidate: ready.revalidate,
        hostChecks: new Map([...current.checks].map(([name, check]) => [name, adapt(check, current.binding, "")])),
        observe: (capture) => current.host.observe(current.binding, capture),
        })
      }).pipe(Effect.mapError((error) => error instanceof RelayWorkflowBinding.Held ? error
        : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_SETTLEMENT_ACQUISITION" }))),
    }
    return sessionHost
  }
  const withWorkflow = <A, E, R>(receipt: Receipt | undefined, effect: Effect.Effect<A, E, R>) => {
    const sessionHost = workflowSessionHost(receipt)
    return sessionHost ? effect.pipe(Effect.provideService(RelayWorkflowSession.NativeHost, sessionHost)) : effect
  }
  const revalidateWorkflow = (receipt: Receipt | undefined) => {
    const current = receipt ? receipts.get(receipt) : undefined
    return current?.workflow ? current.workflow.revalidate().pipe(
      Effect.mapError((error) => new ToolSafety.Denied({ reason: error.reason })),
    ) : Effect.void
  }
  return { beforeDispatch, verifiedCompletion, withWorkflow, revalidateWorkflow, workflowSessionHost }
})

/** `Host.relay` over the process's Location map: the Relay service of the placement's own Location. */
export const locationRelay = (get: (ref: Location.Ref) => Layer.Layer<Relay.Service, unknown>) =>
  (placement: { readonly directory: string }) => Relay.Service.use(Effect.succeed).pipe(
    Effect.provide(get(Location.Ref.make({ directory: AbsolutePath.make(placement.directory) }))),
    Effect.mapError(() => new ToolSafety.Denied({ reason: "completion-evaluation-acquisition" })),
  )

/**
 * Maestro condition 2: Maestro may request the release of a parked arm, but only the owner's answer to the native-host
 * approval releases it. Approving resets the parked gate's retry budget only; rejecting leaves the arm parked, which is
 * the owner cancelling it. Nothing else in Orchestra calls `Relay.release` for an Arsenal arm.
 */
export const release = Effect.fn("ArsenalCompletion.release")(function* (input: {
  readonly relay: Relay.Interface
  readonly token: string
  readonly reason: string
  readonly approve: (message: string) => Effect.Effect<void, unknown>
}) {
  const unavailable = () => new ToolFailure({ message: "COMPLETION_RELEASE_UNAVAILABLE" })
  const parked = yield* input.relay.parked(input.token).pipe(Effect.mapError(unavailable))
  if (Option.isNone(parked)) return yield* new ToolFailure({ message: "COMPLETION_RELEASE_NOT_PARKED" })
  yield* input.approve(`${Relay.parkedHold(parked.value.wp, parked.value.failing)} Release requested: ${input.reason}`).pipe(
    Effect.mapError(() => new ToolFailure({ message: "COMPLETION_RELEASE_REJECTED" })),
  )
  yield* input.relay.release(input.token, `owner: ${input.reason}`).pipe(Effect.mapError(unavailable))
})

/** The contract as a Relay sprint: label → brief, retryBudget → retry_budget, gate → WP, check → host_check control. */
export function sprint(contract: RelayArm.Contract): RelaySprint.Sprint {
  return {
    brief: contract.label,
    retry_budget: contract.retryBudget ?? 3,
    work_packages: contract.chain.map((gate) => ({
      id: gate.id,
      ...(gate.instructions === undefined ? {} : { instructions: gate.instructions }),
      checklist: gate.checks.map((check) => ({ id: check.id, host_check: check.hostCheck })),
    })),
  }
}

// A host check as the arm calls it. A failed callback is an acquisition error with the same provenance, never a pass.
function adapt(check: HostCheck, binding: Binding, revision: string): RelayArm.HostCheck {
  return (input) => {
    const provenance = {
      source: "host-check" as const, projectID: binding.projectID, sessionID: binding.sessionID,
      eventID: randomUUID(), revision: input.revision ?? revision, revisionKind: "git" as const,
    }
    return check(binding).pipe(
      Effect.map((outcome) => ({
        name: input.check.id, status: outcome.status, provenance,
        ...(outcome.exitCode === undefined ? {} : { exitCode: outcome.exitCode }),
      })),
      Effect.catch(() => Effect.succeed({ name: input.check.id, status: "acquisition-error" as const, provenance })),
    )
  }
}

/** Host-registered built-ins. Package/compiler commands are fixed argv declared by the host, never Plan/model commands. */
export function builtins(fs: FSUtil.Interface, processes: AppProcess.Interface, input: {
  readonly permissionCheck: HostCheck
  readonly authorizeProcess: (binding: Binding, command: string, args: readonly string[]) => Effect.Effect<void>
  readonly surfaceCompiler: { command: string; args: readonly string[]; directory: string }
  readonly packageVerification: { command: string; args: readonly string[]; directory: string }
  readonly managedPaths: readonly string[]
}) {
  const commandCheck = (declared: typeof input.surfaceCompiler): HostCheck => (binding) => Effect.scoped(Effect.gen(function* () {
    const directory = yield* fs.realPath(path.resolve(binding.directory, declared.directory))
    if (!FSUtil.contains(binding.directory, directory)) return { status: "fail" as const, exitCode: 1 }
    yield* input.authorizeProcess(binding, declared.command, declared.args)
    const command = yield* ToolSafetySandbox.wrap(ChildProcess.make(declared.command, declared.args, { cwd: directory })).pipe(
      Effect.provideService(FSUtil.Service, fs),
      Effect.provideService(ToolSafety.NativeContext, { directory: binding.directory, projectID: binding.projectID }),
    )
    const result = yield* processes.run(command, { timeout: "55 seconds", maxOutputBytes: 1024, maxErrorBytes: 1024 })
    return { status: result.exitCode === 0 ? "pass" as const : "fail" as const, exitCode: result.exitCode }
  }))
  return new Map<string, HostCheck>([
    ["permissions", input.permissionCheck],
    ["surface-compiler", commandCheck(input.surfaceCompiler)],
    ["package-verification", commandCheck(input.packageVerification)],
    ["git-state", (binding) => ToolSafetyGit.before({ command: "git commit -m native-check", directory: binding.directory,
      projectDirectory: binding.directory, managedPaths: input.managedPaths,
    }).pipe(Effect.provideService(FSUtil.Service, fs), Effect.provideService(AppProcess.Service, processes),
      Effect.as({ status: "pass" as const, exitCode: 0 }))],
    ["owned-files", (binding) => Effect.gen(function* () {
      if (binding.ownedPaths.length === 0) return { status: "missing" as const }
      const queried = yield* Effect.forEach([
        ["diff", "HEAD", "--name-only", "-z"], ["ls-files", "--full-name", "--others", "--exclude-standard", "-z"],
      ], (args) => processes.run(ChildProcess.make("git", ["--no-optional-locks", "-C", binding.directory, ...args],
        { cwd: binding.directory, env: { ...ToolSafetySandbox.environment(), GIT_OPTIONAL_LOCKS: "0" }, extendEnv: false }),
      { maxOutputBytes: 512 * 1024, maxErrorBytes: 1024, timeout: "10 seconds" }))
      if (queried.some((result) => result.exitCode !== 0 || result.stdoutTruncated || result.stderrTruncated))
        return { status: "acquisition-error" as const }
      const texts = queried.map((result) => result.stdout.toString("utf8"))
      if (texts.some((text) => text && !text.endsWith("\0"))) return { status: "acquisition-error" as const }
      const files = [...new Set(texts.flatMap((text) => text.split("\0").filter(Boolean)))]
      if (files.length > 10_000) return { status: "acquisition-error" as const }
      const outside = files.some((file) => !binding.ownedPaths.some((pattern) => fs.globMatch(pattern, file)))
      return { status: outside ? "fail" as const : "pass" as const, exitCode: outside ? 1 : 0 }
    })],
  ])
}
