export * as Relay from "./relay"

import path from "path"
import { randomBytes, randomUUID } from "crypto"
import { chmodSync, linkSync, lstatSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "fs"
import which from "which"
import { Clock, Context, Duration, Effect, Layer, Option, Redacted, Result, Schema, Semaphore } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { RelayArm } from "@opencode-ai/schema/relay-arm"
import { ArmCreate } from "@opencode-ai/relay/arm/create"
import { ArmEvaluate } from "@opencode-ai/relay/arm/evaluate"
import { ArmLoad } from "@opencode-ai/relay/arm/load"
import { ArmState } from "@opencode-ai/relay/arm/state"
import { GateCheck } from "@opencode-ai/relay/gate/check"
import { GateControl } from "@opencode-ai/relay/gate/control"
import { GateShell } from "@opencode-ai/relay/gate/shell"
import { RelayJson } from "@opencode-ai/relay/json"
import { JudgeConfig } from "@opencode-ai/relay/judge/config"
import { LedgerChain } from "@opencode-ai/relay/ledger/chain"
import { Config } from "./config"
import { ConfigRelay } from "./config/relay"
import { makeLocationNode } from "./effect/app-node"
import { FSUtil } from "./fs-util"
import { Global } from "./global"
import { Location } from "./location"
import { AppProcess } from "./process"
import { ToolSafety } from "./tool-safety"
import { ToolSafetySandbox } from "./tool-safety-sandbox"

// The Relay engine as one Location node (relay-exec-spec §1, port plan §5). It binds the engine's ports: checks run
// through AppProcess and the ToolSafety sandbox, git through a sandboxed helper, the judge from Orchestra config, and
// every arm and ledger under `<Global.data>/relay/<projectID>/`. There is no child process, port or secret on the wire.

// A check's process group is killed at its timeout: a hook's before-verify, and each check of a workflow gate.
export const VERIFY_TIMEOUT = Duration.seconds(60)
export const GATE_TIMEOUT = Duration.minutes(15)

export class Unavailable extends Schema.TaggedErrorClass<Unavailable>()("Relay.Unavailable", {
  reason: Schema.Literals(["project-invalid", "install-invalid", "data-acquisition", "key-acquisition"]),
}) {}

export interface Paths {
  // `<Global.data>/relay/<projectID>`, owner-only.
  readonly root: string
  readonly authoring: string
  readonly arms: string
  // `hooks/<installID>/ledger.jsonl` per install.
  readonly hooks: string
  // The HMAC key every ledger here is chained with. It never reaches an agent or a check.
  readonly key: string
}

export interface VerifyInput {
  readonly installID: string
  // The Verify node; it names the recorded control.
  readonly nodeID: string
  // Recorded as the control's assertion.
  readonly message: string
  readonly check: string
  readonly workdir: string
  readonly params?: Readonly<Record<string, string>>
}

export interface Verified {
  // unavailable: the check could not run, or a pass could not be recorded. A hook turns it into an Ask.
  readonly verdict: "pass" | "fail" | "unavailable"
  // Why it is unavailable: missing, timeout, spawn, invalid-command, invalid-node or unrecorded.
  readonly reason?: string
  readonly oracle: string
  // The checklist-item's seq in the install's ledger; absent when it was not recorded.
  readonly ledgerSeq?: number
}

export interface Interface {
  readonly paths: Paths
  readonly judge: JudgeConfig.Config
  // One hook check through the gate core, recorded in the install's ledger. Verifies run one at a time.
  readonly verify: (input: VerifyInput) => Effect.Effect<Verified>
  // The dry "Check now": grades a WP and records nothing.
  readonly check: (
    input: Omit<GateCheck.Input, "stateDir">,
  ) => Effect.Effect<RelayArm.CheckOutcome, GateCheck.Busy | GateControl.PlanError>
  readonly create: (
    input: ArmCreate.Input,
  ) => Effect.Effect<"created" | "unchanged", ArmCreate.Conflict | ArmState.StateError | Unavailable>
  readonly evaluate: (input: RelayArm.EvaluateInput) => Effect.Effect<RelayArm.Evaluation, Unavailable>
  readonly release: (
    token: RelayArm.Token,
    reason: string,
  ) => Effect.Effect<void, ArmState.StateError | ArmState.Busy | Unavailable>
  // Clears a stale `.run.lock` with a `gate-recovered` note (R6); true when one was cleared.
  readonly recover: (
    token: RelayArm.Token,
  ) => Effect.Effect<boolean, ArmState.StateError | LedgerChain.AppendError | RelayJson.EncodeError | Unavailable>
  // Appends one note to an install's ledger, stamping `ts` first.
  readonly record: (
    installID: string,
    body: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<LedgerChain.Appended, LedgerChain.AppendError | RelayJson.EncodeError | Unavailable>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Relay") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const global = yield* Global.Service
    const location = yield* Location.Service
    const config = yield* Config.Service
    const processes = yield* AppProcess.Service
    const fs = yield* FSUtil.Service
    const root = path.join(global.data, "relay", location.project.id)
    const paths = {
      root,
      authoring: path.join(root, "authoring.sqlite3"),
      arms: path.join(root, "arms"),
      hooks: path.join(root, "hooks"),
      key: path.join(root, "ledger.key"),
    }
    const judge = settings(yield* config.entries())
    const judging = yield* JudgeConfig.Service.pipe(Effect.provide(JudgeConfig.layer(judge)))
    const verifies = yield* Semaphore.make(1)
    // Nothing touches the disk until an operation needs it, so a Location never fails to open over Relay.
    const cache: { key?: Redacted.Redacted<string> } = {}

    const ready = Effect.gen(function* () {
      if (!ID.test(location.project.id)) return yield* new Unavailable({ reason: "project-invalid" })
      const info = yield* Effect.try({
        try: () => {
          mkdirSync(root, { recursive: true, mode: 0o700 })
          return lstatSync(root)
        },
        catch: () => new Unavailable({ reason: "data-acquisition" }),
      })
      // A symlinked data directory would put the key and every ledger somewhere else.
      if (!info.isDirectory()) return yield* new Unavailable({ reason: "data-acquisition" })
    })

    const ledgerKey = Effect.suspend(() => {
      if (cache.key) return Effect.succeed(cache.key)
      return ready.pipe(
        Effect.andThen(loadKey(paths.key)),
        Effect.tap((key) => Effect.sync(() => (cache.key = key))),
      )
    })

    // A check: a fresh bash in the workdir with PATH, HOME and the run's params only. Output is discarded and the
    // whole process group is killed at the timeout. Provider keys, `RELAY_*` from this process and the ledger key never
    // reach it, and BASH_ENV, ENV and SHELLOPTS would run code at startup that the Python gate never ran.
    const shell = (timeout: Duration.Input) =>
      GateShell.Service.of({
        run: (input) =>
          Effect.gen(function* () {
            const env = {
              ...Object.fromEntries(Object.entries(input.env).filter((entry) => !STARTUP.has(entry[0]))),
              PATH: process.env.PATH ?? "/usr/bin:/bin",
              HOME: global.home,
            }
            if (!(yield* Effect.promise(() => which("bash", { path: env.PATH, nothrow: true }))))
              return yield* new GateShell.Unavailable({ reason: "missing" })
            const argv = GateShell.argv(input.program)
            const native = yield* ToolSafety.NativeContext
            // The sandbox follows the caller's ToolSafety profile; it also scrubs credential-shaped names and values.
            const command = yield* ToolSafetySandbox.wrap(
              ChildProcess.make(argv[0], argv.slice(1), {
                cwd: input.cwd,
                env,
                extendEnv: false,
                stdin: "ignore",
                stdout: "ignore",
                stderr: "ignore",
                // Untrappable, and sent to the whole group when the timeout interrupts the run.
                killSignal: "SIGKILL",
              }),
            ).pipe(
              Effect.provideService(FSUtil.Service, fs),
              Effect.provideService(ToolSafety.NativeContext, native ?? { directory: input.cwd }),
              Effect.mapError(() => new GateShell.Unavailable({ reason: "spawn" })),
            )
            const result = yield* processes.run(command).pipe(
              Effect.mapError(() => new GateShell.Unavailable({ reason: "spawn" })),
              Effect.timeoutOrElse({
                duration: input.timeout ?? timeout,
                orElse: () => Effect.fail(new GateShell.Unavailable({ reason: "timeout" })),
              }),
            )
            return { exitCode: result.exitCode }
          }).pipe(Effect.scoped),
      })

    // The sandboxed git helper of arsenal-completion: no optional locks, fsmonitor off, a timeout and an output cap.
    // GIT_* placement variables (GIT_DIR, GIT_EXTERNAL_DIFF, …) are dropped so a diff reads the workdir's own repository.
    const git = GateShell.Git.of({
      run: (cwd, args) =>
        processes
          .run(
            ChildProcess.make("git", ["--no-optional-locks", "-C", cwd, "-c", "core.fsmonitor=false", ...args], {
              cwd,
              env: {
                ...Object.fromEntries(
                  Object.entries(ToolSafetySandbox.environment()).filter((entry) => !entry[0].startsWith("GIT_")),
                ),
                GIT_OPTIONAL_LOCKS: "0",
              },
              extendEnv: false,
              stdin: "ignore",
              killSignal: "SIGKILL",
            }),
            { maxOutputBytes: GIT_OUTPUT_BYTES, maxErrorBytes: 1024 },
          )
          .pipe(
            Effect.mapError(() => new GateShell.Unavailable({ reason: "spawn" })),
            Effect.timeoutOrElse({
              duration: GIT_TIMEOUT,
              orElse: () => Effect.fail(new GateShell.Unavailable({ reason: "timeout" })),
            }),
            // A cut diff would reach the judge as if it were the whole change; the diff is unavailable instead.
            Effect.flatMap((result) =>
              result.stdoutTruncated
                ? Effect.fail(new GateShell.Unavailable({ reason: "spawn" }))
                : Effect.succeed({ exitCode: result.exitCode, stdout: new Uint8Array(result.stdout) }),
            ),
          ),
    })

    const ports =
      (timeout: Duration.Input) =>
      <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect.pipe(
          Effect.provideService(GateShell.Service, shell(timeout)),
          Effect.provideService(GateShell.Git, git),
          Effect.provideService(JudgeConfig.Service, judging),
        )

    const store = (key: Redacted.Redacted<string>) =>
      ArmState.Store.of({ armsDir: paths.arms, ledgerKey: Option.some(key) })

    const armed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      ledgerKey.pipe(
        Effect.flatMap((key) => effect.pipe(Effect.provideService(ArmState.Store, store(key)), ports(GATE_TIMEOUT))),
      )

    const record = Effect.fn("Relay.record")(function* (installID: string, body: Readonly<Record<string, unknown>>) {
      if (!ID.test(installID)) return yield* new Unavailable({ reason: "install-invalid" })
      const key = yield* ledgerKey
      const directory = path.join(paths.hooks, installID)
      yield* Effect.try({
        try: () => mkdirSync(directory, { recursive: true, mode: 0o700 }),
        catch: () => new Unavailable({ reason: "data-acquisition" }),
      })
      const ts = Math.floor((yield* Clock.currentTimeMillis) / 1000)
      const text = yield* RelayJson.compact({
        ts,
        ...Object.fromEntries(Object.entries(body).filter((entry) => entry[0] !== "ts")),
      })
      return yield* LedgerChain.append({ ledger: path.join(directory, "ledger.jsonl"), body: text, gen: 0, key })
    })

    const verify = Effect.fn("Relay.verify")(
      function* (input: VerifyInput): Effect.fn.Return<Verified> {
        // An empty command would be graded as a judge control; a hook check is a command.
        if (!input.check) return { verdict: "unavailable", reason: "invalid-command", oracle: "" }
        const graded = yield* GateControl.run(
          {
            sprint: {
              work_packages: [
                {
                  id: input.nodeID,
                  checklist: [{ id: input.nodeID, assert: input.message, cmd: input.check, origin: "hook" }],
                },
              ],
            },
            index: 0,
            workdir: input.workdir,
            params: input.params ?? {},
          },
          // Recorded below, so a ledger failure cannot lose the verdict.
          () => Effect.void,
        ).pipe(ports(VERIFY_TIMEOUT), Effect.option)
        const verdict = Option.flatMap(graded, (result) => Option.fromUndefinedOr(result.verdicts[0]))
        if (Option.isNone(verdict)) return { verdict: "unavailable", reason: "invalid-node", oracle: "" }
        const recorded = yield* record(
          input.installID,
          GateControl.body({ wp: input.nodeID, i: 0 }, verdict.value),
        ).pipe(Effect.option)
        const sequence = Option.match(recorded, { onNone: () => ({}), onSome: (line) => ({ ledgerSeq: line.seq }) })
        const unavailable = /^unavailable\((.+)\)$/.exec(verdict.value.graded_by)?.[1]
        if (unavailable)
          return { verdict: "unavailable", reason: unavailable, oracle: verdict.value.oracle, ...sequence }
        // A pass nobody can audit is not a pass; a fail stays a fail either way.
        if (verdict.value.verdict === "pass" && Option.isNone(recorded))
          return { verdict: "unavailable", reason: "unrecorded", oracle: verdict.value.oracle }
        return { verdict: verdict.value.verdict, oracle: verdict.value.oracle, ...sequence }
      },
      (effect) => verifies.withPermit(effect),
    )

    const recover = Effect.fn("Relay.recover")(function* (token: RelayArm.Token) {
      const key = yield* ledgerKey
      const arm = yield* ArmState.dir(token).pipe(Effect.provideService(ArmState.Store, store(key)))
      const lock = path.join(arm, RelayArm.Files.runLock)
      const info = yield* Effect.try({
        try: () => lstatSync(lock, { throwIfNoEntry: false }),
        catch: () => new ArmState.StateError({ path: lock, reason: "lock-acquisition" }),
      })
      // Stale only when no evaluation in this process holds it and it predates this process: this process releases
      // every lock it takes synchronously, and a younger lock may belong to a live evaluation it cannot see.
      if (!info?.isDirectory() || ArmState.held(arm) || info.mtimeMs >= performance.timeOrigin) return false
      const loaded = yield* ArmLoad.arm(arm).pipe(Effect.option)
      const position = yield* ArmState.read(arm, RelayArm.Files.position).pipe(
        Effect.orElseSucceed(() => Option.none<string>()),
      )
      // The WP at the recorded position, else the raw position, else `?` like an empty plan.
      const wp = Option.flatMap(loaded, (value) =>
        Option.flatMap(position, (raw) =>
          Option.map(ArmState.resolve(value.sprint, raw), (index) => value.sprint.work_packages[index]!.id),
        ),
      ).pipe(
        Option.orElse(() => position),
        Option.getOrElse(() => "?"),
      )
      const gen = Option.match(loaded, {
        onNone: () => 0,
        onSome: (value) =>
          LedgerChain.generation(
            Result.getOrUndefined(RelayJson.read(new TextDecoder().decode(value.sprintBytes), { flavor: "jq" })),
          ),
      })
      const ts = Math.floor((yield* Clock.currentTimeMillis) / 1000)
      // Noted before the lock goes: a recovery that cannot be recorded does not happen.
      yield* LedgerChain.append({
        ledger: path.join(arm, RelayArm.Files.ledger),
        body: yield* RelayJson.compact({ ts, arm: token, wp, event: "gate-recovered" }),
        gen,
        key,
      })
      yield* Effect.try({
        try: () => rmdirSync(lock),
        catch: () => new ArmState.StateError({ path: lock, reason: "lock-release" }),
      })
      return true
    })

    return Service.of({
      paths,
      judge,
      verify,
      check: Effect.fn("Relay.check")(function* (input: Omit<GateCheck.Input, "stateDir">) {
        return yield* GateCheck.check({ ...input, stateDir: undefined }).pipe(ports(GATE_TIMEOUT))
      }),
      create: Effect.fn("Relay.create")(function* (input: ArmCreate.Input) {
        return yield* armed(ArmCreate.create(input))
      }),
      evaluate: Effect.fn("Relay.evaluate")(function* (input: RelayArm.EvaluateInput) {
        yield* recover(input.token).pipe(Effect.ignore)
        return yield* armed(ArmEvaluate.evaluate(input))
      }),
      release: Effect.fn("Relay.release")(function* (token: RelayArm.Token, reason: string) {
        yield* recover(token).pipe(Effect.ignore)
        return yield* armed(ArmEvaluate.release(token, reason))
      }),
      recover,
      record,
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Global.node, Location.node, Config.node, AppProcess.node, FSUtil.node],
})

// Project and install IDs name directories, so they stay path-safe.
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/
const KEY = /^[0-9a-f]{64}$/
const STARTUP = new Set(["BASH_ENV", "ENV", "SHELLOPTS", "BASHOPTS"])
const GIT_TIMEOUT = Duration.seconds(60)
const GIT_OUTPUT_BYTES = 16 * 1024 * 1024

/** `relay.judge.*`, later documents overriding earlier ones key by key; defaults fill the rest. */
function settings(entries: ReadonlyArray<Config.Entry>): JudgeConfig.Config {
  const configured = entries
    .flatMap((entry) => (entry.type === "document" && entry.info.relay?.judge ? [entry.info.relay.judge] : []))
    .reduce<Partial<ConfigRelay.Judge>>((result, current) => ({ ...result, ...current }), {})
  return {
    backend: configured.backend ?? JudgeConfig.defaults.backend,
    model: configured.model ?? JudgeConfig.defaults.model,
    baseURL: configured.baseURL,
    apiKey: configured.apiKey === undefined ? undefined : Redacted.make(configured.apiKey),
    votes: configured.votes ?? JudgeConfig.defaults.votes,
    maxContext: configured.maxContext ?? JudgeConfig.defaults.maxContext,
    maxTokens: configured.maxTokens ?? JudgeConfig.defaults.maxTokens,
  }
}

/**
 * ledger.key: 32 random bytes as hex, owner-only, created once and never rewritten, since ledgers chained with it would
 * stop verifying. Concurrent creators settle on one key: a fully written temporary file is hard-linked into place, and
 * a link refuses a target that exists.
 */
function loadKey(file: string) {
  return readKey(file).pipe(
    Effect.flatMap((found) =>
      Option.isSome(found) ? Effect.succeed(found) : createKey(file).pipe(Effect.andThen(readKey(file))),
    ),
    Effect.flatMap((found) =>
      Option.isSome(found) ? Effect.succeed(found.value) : Effect.fail(new Unavailable({ reason: "key-acquisition" })),
    ),
  )
}

// A symlink, a non-file or malformed contents are refused, never followed or replaced.
function readKey(file: string) {
  const failed = () => new Unavailable({ reason: "key-acquisition" })
  return Effect.try({ try: () => lstatSync(file, { throwIfNoEntry: false }), catch: failed }).pipe(
    Effect.flatMap((info) => {
      if (info === undefined) return Effect.succeed(Option.none<Redacted.Redacted<string>>())
      if (!info.isFile()) return Effect.fail(failed())
      return Effect.try({
        try: () => {
          // Narrowed, never widened: the key stays owner-only even if its mode was loosened.
          if ((info.mode & 0o077) !== 0) chmodSync(file, 0o600)
          return readFileSync(file, "utf8")
        },
        catch: failed,
      }).pipe(
        Effect.flatMap((text) =>
          KEY.test(text) ? Effect.succeed(Option.some(Redacted.make(text))) : Effect.fail(failed()),
        ),
      )
    }),
  )
}

function createKey(file: string) {
  const temp = path.join(path.dirname(file), `.ledger.key.${randomUUID()}`)
  return Effect.try({
    try: () => {
      writeFileSync(temp, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 })
      // The creation mode passes through the umask; set it exactly.
      chmodSync(temp, 0o600)
      linkSync(temp, file)
    },
    catch: (error) => error,
  }).pipe(
    // Another creator linked its key first, and that key is the project's.
    Effect.catchIf(
      (error) => typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST",
      () => Effect.void,
    ),
    Effect.mapError(() => new Unavailable({ reason: "key-acquisition" })),
    // Synchronous: effect 4.0.0-beta.83 drops an async finalizer step when the fiber is interrupted.
    Effect.ensuring(
      Effect.try({ try: () => rmSync(temp, { force: true }), catch: () => undefined }).pipe(Effect.ignore),
    ),
  )
}
