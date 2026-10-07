export * as ArsenalCompletion from "./arsenal-completion"

import path from "path"
import { createHash, randomUUID } from "node:crypto"
import { Context, Effect, Option, Schema } from "effect"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppProcess } from "@orchestra/core/process"
import { ChildProcess } from "effect/unstable/process"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetyGit } from "@orchestra/core/tool-safety-git"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"

// Exact D relay-arm state shape. Host callbacks below bind D's evaluator, not a second evaluator.
const ID = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/))
const Contract = Schema.Struct({
  sessionID: ID, label: Schema.NonEmptyString.check(Schema.isMaxLength(4096)),
  retryBudget: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(32))),
  chain: Schema.Array(Schema.Struct({
    id: ID, instructions: Schema.optional(Schema.NonEmptyString.check(Schema.isMaxLength(4096))),
    checks: Schema.Array(Schema.Struct({ id: ID, hostCheck: ID })).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  })).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
})
const Stored = Schema.Struct({ schema: Schema.Literal(1), projectID: ID, contract: Contract })
export type CheckOutcome = { readonly status: "pass" | "fail" | "skip" | "missing" | "acquisition-error"; readonly exitCode?: number }
export type Dispatch = {
  readonly sessionID: string
  readonly taskID: string
  readonly callID: string
  readonly directory: string
  readonly projectID: string
  readonly planID?: string
}
export type Binding = Dispatch & {
  readonly planID: string
  readonly token: string
  readonly stateDirectory: string
  readonly ownedPaths: ReadonlyArray<string>
}
type ContractValue = {
  sessionID: string; label: string; retryBudget?: number
  chain: { id: string; instructions?: string; checks: { id: string; hostCheck: string }[] }[]
}
export type Capture = {
  complete: boolean
  results: { name: string; status: CheckOutcome["status"]; exitCode?: number; provenance: {
    source: "host-check"; projectID: string; sessionID: string; eventID: string; revision: string; revisionKind: "git"
  } }[]
}
export type HostCheck = (binding: Binding) => Effect.Effect<CheckOutcome, unknown>
export interface Host {
  /** Native authority resolves a stored token by actual dispatch identity. Never read model metadata. */
  readonly resolve: (input: Dispatch) => Effect.Effect<Binding | undefined, ToolSafety.Denied>
  readonly checks: ReadonlyMap<string, HostCheck>
  readonly evaluateCompletion: (projectID: string, contract: ContractValue, observations: Capture,
    bindings: readonly string[]) => { status: string; failures: readonly string[] }
  readonly observe: (binding: Binding, capture: Capture) => Effect.Effect<void>
}
export const NativeHost = Context.Reference<Host | undefined>("@orchestra/ArsenalCompletion/NativeHost", { defaultValue: () => undefined })
export type Receipt = { readonly taskID: string; readonly planID: string; readonly directory: string }
const receipts = new WeakMap<Receipt, { host: Host; binding: Binding; contract: ContractValue; revision: string; fingerprint: string; checks: ReadonlyMap<string, HostCheck> }>()

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
    const stateValue = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Stored))(
      new TextDecoder().decode(bytes), { onExcessProperty: "error" },
    )
    if (stateValue.projectID !== binding.projectID || stateValue.contract.sessionID !== binding.sessionID)
      return yield* new ToolSafety.Denied({ reason: "completion-project-or-session-mismatch" })
    const contract: ContractValue = { ...stateValue.contract,
      chain: stateValue.contract.chain.map((gate) => ({ ...gate, checks: gate.checks.map((check) => ({ ...check })) })),
    }
    const checks = contract.chain.flatMap((gate) => gate.checks)
    if (checks.length > 1000 || new Set(checks.map((check) => check.id)).size !== checks.length ||
      new Set(contract.chain.map((gate) => gate.id)).size !== contract.chain.length)
      return yield* new ToolSafety.Denied({ reason: "completion-callback-cap-or-duplicate" })
    return { contract, fingerprint: createHash("sha256").update(JSON.stringify(stateValue)).digest("hex") }
  })).pipe(Effect.mapError((error) => error instanceof ToolSafety.Denied ? error : new ToolSafety.Denied({ reason: "completion-state-acquisition" })))

  const beforeDispatch = Effect.fn("ArsenalCompletion.beforeDispatch")(function* (input: Dispatch) {
    if (!host) return
    const binding = yield* host.resolve(input)
    if (!binding) return
    if (typeof host.evaluateCompletion !== "function" || typeof host.observe !== "function")
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
    const revision = (yield* git(binding.directory, ["rev-parse", "HEAD"])).trim()
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)) return yield* new ToolSafety.Denied({ reason: "completion-revision-acquisition" })
    const receipt = Object.freeze({ taskID: binding.taskID, planID: binding.planID, directory: binding.directory })
    receipts.set(receipt, { host, binding, ...loaded, revision, checks })
    return receipt
  })

  const verifiedCompletion = Effect.fn("ArsenalCompletion.verifiedCompletion")(function* (receipt: Receipt | undefined, taskID: string) {
    if (!receipt) return
    const current = receipts.get(receipt)
    if (!current || receipt.taskID !== taskID) return yield* new ToolSafety.Denied({ reason: "completion-receipt-unbound" })
    receipts.delete(receipt)
    if ((yield* load(current.binding)).fingerprint !== current.fingerprint)
      return yield* new ToolSafety.Denied({ reason: "completion-contract-drift" })
    const revision = (yield* git(current.binding.directory, ["rev-parse", "HEAD"])).trim()
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)) return yield* new ToolSafety.Denied({ reason: "completion-revision-acquisition" })
    const results = yield* Effect.forEach(current.contract.chain.flatMap((gate) => gate.checks), (check) => {
      const callback = current.checks.get(check.hostCheck)
      if (!callback) return Effect.fail(new ToolSafety.Denied({ reason: "completion-host-check-unbound" }))
      return callback(current.binding).pipe(
        Effect.timeoutOrElse({ duration: "60 seconds", orElse: () => Effect.fail(new Error("check timeout")) }),
        Effect.catch(() => Effect.succeed({ status: "acquisition-error" as const })),
        Effect.map((outcome) => ({ name: check.id, status: outcome.status, exitCode: "exitCode" in outcome ? outcome.exitCode : undefined, provenance: {
          source: "host-check" as const, projectID: current.binding.projectID, sessionID: current.binding.sessionID,
          eventID: randomUUID(), revision, revisionKind: "git" as const,
        } })),
      )
    }, { concurrency: 1 })
    const capture = { complete: true, results }
    if ((yield* git(current.binding.directory, ["rev-parse", "HEAD"])).trim() !== revision)
      return yield* new ToolSafety.Denied({ reason: "completion-revision-drift" })
    yield* current.host.observe(current.binding, capture)
    const evaluation = yield* Effect.try({
      try: () => current.host.evaluateCompletion(current.binding.projectID, current.contract, capture, [...current.checks.keys()]),
      catch: () => new ToolSafety.Denied({ reason: "completion-evaluation-acquisition" }),
    })
    if (evaluation.status !== "PASS" || evaluation.failures.length > 0)
      return yield* new ToolSafety.Denied({ reason: "completion-checks-not-passing" })
    return { verified: true as const, planID: current.binding.planID, taskID, checks: results.length }
  })

  return { beforeDispatch, verifiedCompletion }
})

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
