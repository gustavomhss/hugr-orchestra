export * as ToolSafety from "./tool-safety"

import path from "path"
import { Cause, Context, Effect, Exit, Layer, Option, Result, Schema } from "effect"
import { makeLocationNode } from "./effect/app-node"
import { FSUtil } from "./fs-util"
import { Patch } from "./patch"
import { ToolSafetyCommands } from "./tool-safety-commands"
import { ToolSafetyGit } from "./tool-safety-git"
import { AppProcess } from "./process"
import { Global } from "./global"
import { LayerNode } from "./effect/layer-node"
import { OutputInspector } from "./output-inspector"
import type { RelayHook } from "@orchestra/schema/relay-hook"
import { ToolSafetyHooks } from "./tool-safety-hooks"

/** Host-bound preferences, never decoded from tool arguments or inherited environment waivers. */
export type Profile = {
  readonly writeRoots?: ReadonlyArray<string>
  readonly protectedWrites?: ReadonlyArray<string>
  readonly allowedConfigEdits?: ReadonlyArray<string>
  readonly corpusFiles?: ReadonlyArray<string>
  readonly transcriptFiles?: ReadonlyArray<string>
  readonly maxTranscriptBytes?: number
  readonly requireSandbox?: boolean
  readonly neverTouch?: ReadonlyArray<string>
  readonly askBefore?: ReadonlyArray<string>
  readonly managedPaths?: ReadonlyArray<string>
  readonly sandbox?: {
    readonly enabled: boolean
    readonly allowedDomains?: ReadonlyArray<string>
    /** Exact existing local sockets, granted only by the programmatic host and bound to native placement. */
    readonly allowedUnixSockets?: readonly { readonly directory: string; readonly path: string }[]
    /** Host services for owned route-adapted clients: Darwin Unix broker, kernel TCP denied; Linux/Windows HOLD. */
    readonly allowedLoopbackEndpoints?: readonly { readonly directory: string; readonly host: "127.0.0.1"; readonly port: number }[]
    readonly denyPaths?: ReadonlyArray<string>
    /** Give each sandboxed command a fresh writable directory as TMPDIR, removed when the command ends. */
    readonly scratch?: boolean
    /** Where no sandbox can run, run the command without the write jail and report it instead of holding it. */
    readonly unconfinedFallback?: boolean
  }
  /** Installed Relay hooks (`hooks.json`), pinned per install. Only ToolSafety.run enforces them; they grant nothing. */
  readonly hooks?: ReadonlyArray<RelayHook.Install>
}

// Profiles a loader made only to carry hooks: to the native checks and to the tool they are no profile at all, as
// before any hook was installed.
const hookCarriers = new WeakSet<Profile>()

/** Attaches installed hooks to a loaded profile without making a profile where there was none. */
export const withHooks = (
  profile: Profile | undefined,
  hooks: ReadonlyArray<RelayHook.Install>,
): Profile | undefined => {
  if (hooks.length === 0) return profile
  const base = native(profile)
  if (base) return { ...base, hooks } satisfies Profile
  const carrier = { hooks } satisfies Profile
  hookCarriers.add(carrier)
  return carrier
}

// The profile the native checks and the tool see; hooks are ToolSafety.run's alone.
const native = (profile: Profile | undefined): Profile | undefined => {
  if (!profile?.hooks) return profile
  if (hookCarriers.has(profile)) return undefined
  return { ...profile, hooks: undefined }
}

/** Host fact about the write jail of sandbox-bound shell commands. */
export type ShellFact = {
  readonly shellWrites: "enforced" | "unenforced"
  readonly shellSandbox: { readonly kind: "seatbelt" | "srt" | "none"; readonly reason?: string }
}

/** Per-invocation cell that ToolSafetySandbox.wrap fills and ToolSafety.run attaches to its observation. */
export const ShellReport = Context.Reference<{ fact?: ShellFact } | undefined>("@orchestra/ToolSafety/ShellReport", {
  defaultValue: () => undefined,
})

/** Record a shell command's fact; an unenforced command is never hidden by a later enforced one. */
export const reportShell = (fact: ShellFact) =>
  Effect.gen(function* () {
    const cell = yield* ShellReport
    if (cell) cell.fact = worse(cell.fact, fact)
  })

// Process-local worst fact per Session, read by the backend work result. Bounded; the oldest Sessions drop first.
const shells = new Map<string, ShellFact>()
export const shellFact = (sessionID: string) => shells.get(sessionID)

const worse = (current: ShellFact | undefined, next: ShellFact) =>
  current?.shellWrites === "unenforced" ? current : next

export const RuntimeProfile = Context.Reference<Profile | undefined>("@orchestra/ToolSafety/Profile", {
  defaultValue: () => undefined,
})

/** Captured native placement. Command cwd and model arguments cannot move policy roots. */
export const NativeContext = Context.Reference<
  | {
      readonly directory: string
      readonly projectID?: string
    }
  | undefined
>("@orchestra/ToolSafety/NativeContext", { defaultValue: () => undefined })

export type Approval = {
  readonly action: string
  readonly resources: readonly string[]
  readonly invocation: Invocation
  /** A hook's own words for the approval card; askBefore approvals have none. */
  readonly message?: string
  /** A Session event's hook asks with no tool call to bind: its event, such as `prompt.before`. */
  readonly trigger?: string
  /** Final prompt identity captured by the Session host, never hook parameters. */
  readonly messageID?: string
}
export const NativeHost = Context.Reference<
  | {
      /** Must await actual native permission decision; preferences never grant authority. */
      readonly ask: (request: Approval) => Effect.Effect<void, Denied>
    }
  | undefined
>("@orchestra/ToolSafety/NativeHost", { defaultValue: () => undefined })

export const RuntimeProfileLoader = Context.Reference<(() => Effect.Effect<Profile | undefined, Denied>) | undefined>(
  "@orchestra/ToolSafety/ProfileLoader",
  { defaultValue: () => undefined },
)

export class Denied extends Schema.TaggedErrorClass<Denied>()("ToolSafety.Denied", {
  reason: Schema.String,
  /** Words for the model after the reason, such as the message of the hook that denied the call. */
  detail: Schema.optional(Schema.String),
}) {
  /** Keep the first line exactly `Tool safety HOLD: <reason>`; tests match it. */
  override get message() {
    const first =
      this.detail === undefined
        ? `Tool safety HOLD: ${this.reason}`
        : `Tool safety HOLD: ${this.reason}. ${this.detail}`
    const remediation = remediations.find((entry) => entry[0].test(this.reason))?.[1]
    return remediation ? `${first}\n${remediation}` : first
  }
}

/**
 * The call whose hooks another ToolSafety.run of it enforces, so this run does not repeat them: an outer run, or for V1
 * the session tools boundary inside the native host's wrapper, which a Promise boundary hides from it.
 */
export const HookedCall = Context.Reference<string | undefined>("@orchestra/ToolSafety/HookedCall", {
  defaultValue: () => undefined,
})

// Second HOLD line, written for the model: the cause, that nothing ran, and the next step.
// Only codes raised by the safety modules are listed; approval, completion and Maestro
// profile-snapshot codes belong to their owners and keep the bare first line.
const remediations: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /^known-(?:destructive-operation|catastrophic-delete|catastrophic-find-delete|unrecoverable-git-clean)$/,
    "This destructive command is blocked for every agent and no approval unlocks it, so it did not run. Do not retry it another way; if it is really needed, give the owner the exact command to run themselves (if the match is only words in a message, reword them).",
  ],
  [
    /^known-gate-bypass$/,
    "Hooks and verification gates cannot be skipped (`--no-verify`, `-n`, `HUSKY=0`, `--no-hooks`), so the command did not run. Fix what the hook reports and rerun without the bypass; words such as `-n` or `-json` in a `git commit` message also match, so reword them.",
  ],
  [
    /^git-hygiene-dynamic-command$/,
    "`git add` and `git commit` commands cannot contain `$`, backticks, parentheses, redirects or heredocs (or `\\` inside double quotes), so the command did not run. Do not work around it; write the message literally, as in `git commit -m 'subject' -m 'body'`.",
  ],
  [
    /^git-hygiene-unsupported-shell-operator$/,
    "A single `|` or `&` cannot appear in a command that runs `git add` or `git commit`, so it did not run. Chain steps with `&&` or `;`, or run the rest in a separate call.",
  ],
  [
    /^git-hygiene-incomplete-command$/,
    "The command has an unclosed quote or a trailing `\\`, so it did not run. Close the quote and retry.",
  ],
  [
    /^git-hygiene-preceding-command-unbound$/,
    "When a call runs `git add` or `git commit`, every command except the last must be `cd <dir>`, `git add`, `git commit` or a read-only git command (status, diff, log, show, ls-files, rev-parse), so it did not run. Run the other commands in a separate call.",
  ],
  [
    /^git-hygiene-placement-environment$/,
    "`GIT_*` overrides are not allowed with `git add` or `git commit`, so the command did not run. Remove `GIT_*=` assignments from the command; if it has none, the session environment sets `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` or `GIT_CONFIG_*`, so report that to the owner.",
  ],
  [
    /^git-hygiene-cwd-(?:unparsed|acquisition)$/,
    "The directory for this git command must be one existing path, given by `workdir`, `cd <dir>` or `git -C <dir>`, so the command did not run. Check the path and retry.",
  ],
  [
    /^git-hygiene-global-option-unbound$/,
    "Only `-C <dir>` may come between `git` and `add` or `commit`, so the command did not run. Drop other global options such as `-c` or `--git-dir`, and run git commands that merely mention `add` or `commit` in a separate call.",
  ],
  [
    /^git-hygiene-message-unparsed$/,
    "`-m` needs a message after it, so the command did not run. Use `git commit -m 'subject'`.",
  ],
  [
    /^git-hygiene-stage-option-unbound$/,
    "The command used a `git add` or `git commit` option the guard does not accept, so it did not run. Use plain flags such as `git add <paths>` and `git commit -m '…'` (`-a`, `--amend`, `--allow-empty`, `-q` and `-s` also work); `-am`, `--no-edit`, `-F`, `--author`, `-p` and `commit -v` are refused.",
  ],
  [
    /^git-hygiene-managed-or-protected-data$/,
    "The command would stage or commit a managed or protected file (tool state such as `.techlead/` or audit and budget logs, caches, credentials, or a never-touch path), so it did not run. Stage explicit paths that leave it out and unstage it if it is already staged; only the owner may commit such files.",
  ],
  [
    /^git-hygiene-root-outside-project$/,
    "The repository this command would change is outside the current project, so it did not run. Run `git add` and `git commit` only inside this project; the owner can commit elsewhere.",
  ],
  [
    /^git-hygiene-(?:query-failed-or-overflow|path-acquisition)$/,
    "The guard could not list what this command would stage (not a git repository, a path outside it, or too many files), so it did not run. Check the directory and stage fewer, explicit paths.",
  ],
  [
    /^recognized-secret-output$/,
    "The tool ran, but its output contained a credential-shaped value (a private key, or an AWS, GitHub, Stripe or OpenAI key), so the output was discarded. Do not print secrets or try to reveal them another way; to check that one is set, test it without printing its value.",
  ],
  [
    /^output-inspection-budget$/,
    "The tool ran, but its output was too large or too deeply nested to scan for secrets, so it was discarded. Ask for a smaller result.",
  ],
  [
    /^project-never-touch$/,
    "The project's safety profile marks this path never-touch, so the call did not run. Leave it alone and do not reach it another way; only the owner can change the profile.",
  ],
  [
    /^protected-instruction-or-config-write$/,
    "The project's safety profile protects this instruction or config file, so nothing was written. Leave it, or ask the owner to make the change.",
  ],
  [
    /^write-outside-physical-roots$/,
    "Effective write roots respect project limits and any bound dispatch `writePaths`. This path is outside them, so nothing was written. A teammate must return a blocker naming the path and missing write scope; otherwise ask the owner. Do not widen an explicit packet's scope.",
  ],
  [
    /^defense-corpus-bulk-read$/,
    "The project's safety profile allows this file to be read only in slices, so nothing was read. Pass `limit` as a whole number from 1 to 400 and page with `offset`.",
  ],
  [
    /^transcript-context-budget$/,
    "This transcript file is larger than the project's transcript budget, so it was not read. Do not read it another way; ask the owner if you need it.",
  ],
  [
    /^invalid-patch-acquisition$/,
    "The patch could not be parsed, so nothing was applied. Fix the patch format and retry.",
  ],
  [
    /^missing-native-path$/,
    "The call names no file path the guard can check, so it did not run. Pass the file path argument.",
  ],
  [
    /^required-process-sandbox-unbound$/,
    "The project's safety profile requires commands to run in a process sandbox and this tool cannot, so it did not run. Run commands with the shell tool, or ask the owner.",
  ],
  [
    /^(?:required-process-sandbox-unavailable|sandbox-.+)$/,
    "The project's safety profile requires a process sandbox that could not be set up here, so the command did not run. Do not run it another way; report the reason to the owner.",
  ],
  [
    /^profile-(?:project-invalid|state-root-acquisition|project-root-acquisition|state-inside-project|stat-acquisition|not-file-or-overflow|path-acquisition|symlink-denied|changed-during-read|invalid|read-acquisition)$/,
    "The project's safety profile could not be loaded, so the call did not run. Do not work around it; report the reason to the owner, who can fix the profile.",
  ],
  [
    /^(?:filesystem-acquisition|binding-acquisition|path-acquisition(?:-.+)?|missing-native-binding|ask-before-native-binding-missing|write-root-(?:acquisition|stat|not-directory)|corpus-(?:stat-acquisition|not-file)|transcript-(?:stat-acquisition|not-file)|invalid-transcript-budget|output-inspection-acquisition|git-hygiene-(?:native-binding-missing|command-acquisition|project-acquisition|query-acquisition|root-acquisition))$/,
    "The safety guard hit an internal error and could not check this call, so it did not run. Do not retry it another way; report the reason to the owner.",
  ],
]

export type Invocation = {
  readonly tool: string
  readonly args: unknown
  readonly sessionID: string
  readonly callID: string
  /** Native host execution identity; optional for legacy callers. */
  readonly assistantMessageID?: string
  readonly agent?: string
  readonly directory?: string
  readonly projectID?: string
  readonly projectDirectory?: string
}

/**
 * A Session event installed hooks fire on: `session-start` once a new Session is stored and `session-idle` once a
 * drain settles, both after the event, and `prompt` before admission. The placement is the Session's Location.
 */
export type SessionEvent = {
  readonly operation: "session-start" | "prompt" | "session-idle"
  readonly sessionID: string
  readonly agent?: string
  readonly directory?: string
  readonly projectID?: string
  readonly projectDirectory?: string
  /** The prompt's text; hooks record only its sha256. */
  readonly text?: string
  /** Final prompt identity supplied by the host, never hook or model data. */
  readonly messageID?: string
}

/** Audit observations carry identities and outcomes only; they never grant execution authority. */
export type Observation = {
  readonly tool: string
  readonly sessionID: string
  readonly callID: string
  readonly directory?: string
  readonly projectID?: string
  readonly outcome: "started" | "success" | "failure" | "cancelled" | "held"
  readonly reason?: string
  readonly shellWrites?: ShellFact["shellWrites"]
  readonly shellSandbox?: ShellFact["shellSandbox"]
}

export interface Interface {
  readonly before: (input: Invocation) => Effect.Effect<void, Denied>
  readonly inspect: (output: unknown) => Effect.Effect<void, Denied>
  readonly run: <A, E, R>(
    input: Invocation,
    effect: Effect.Effect<A, E, R>,
    observe: (observation: Observation) => Effect.Effect<void>,
    outcome?: (value: A) => "success" | "failure" | "cancelled",
  ) => Effect.Effect<A, E | Denied, R>
  /** Installed hooks on a Session event, over the profile loaded for it; only a `prompt` denial has an effect to stop. */
  readonly session: (input: SessionEvent) => Effect.Effect<ReadonlyArray<string>, Denied>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/ToolSafety") {}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const contains = (root: string, target: string) => {
  const relative = path.relative(root, target)
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

export const make = Effect.gen(function* () {
  const fs = Option.getOrUndefined(yield* Effect.serviceOption(FSUtil.Service))
  const processService = Option.getOrUndefined(yield* Effect.serviceOption(AppProcess.Service))
  const global = Option.getOrUndefined(yield* Effect.serviceOption(Global.Service))
  // Hook services missing from a call's context are looked up where ToolSafety was built.
  const ambient = yield* Effect.context<never>()

  const canonical = Effect.fnUntraced(function* (target: string): Effect.fn.Return<string, Denied> {
    if (!fs) return yield* new Denied({ reason: "filesystem-acquisition" })
    return yield* fs.realPath(target).pipe(
      Effect.catchReason("PlatformError", "NotFound", () =>
        Effect.gen(function* () {
          const parent = path.dirname(target)
          if (parent === target) return yield* new Denied({ reason: "path-acquisition-missing-root" })
          const anchor = yield* canonical(parent)
          const info = yield* fs.stat(anchor).pipe(
            Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
            Effect.mapError(() => new Denied({ reason: "path-acquisition-stat" })),
          )
          if (info && info.type !== "Directory") return yield* new Denied({ reason: "path-acquisition-non-directory" })
          return path.join(anchor, path.basename(target))
        }),
      ),
      Effect.mapError((error) => (error instanceof Denied ? error : new Denied({ reason: "path-acquisition" }))),
    )
  })

  const before = Effect.fn("ToolSafety.before")(function* (input: Invocation) {
    const args = record(input.args)
    const command = input.tool !== "task" && typeof args.command === "string" ? args.command : undefined
    if (command) {
      const reason = ToolSafetyCommands.reason(command)
      if (reason) return yield* new Denied({ reason })
    }
    const profile = native(yield* RuntimeProfile)
    if (command && /\bgit\b[^\n;&|]*\b(?:add|commit)\b/.test(command)) {
      if (!input.directory || !fs || !processService)
        return yield* new Denied({ reason: "git-hygiene-native-binding-missing" })
      yield* ToolSafetyGit.before({
        command,
        directory: input.directory,
        projectDirectory: input.projectDirectory,
        cwd: typeof args.workdir === "string" ? args.workdir : undefined,
        managedPaths: [
          ...(global
            ? [
                global.data,
                global.state,
                path.join(global.home, ".git-credentials"),
                path.join(global.home, ".npmrc"),
                path.join(global.home, ".aws"),
                path.join(global.home, ".ssh"),
              ]
            : []),
          ...(profile?.managedPaths ?? []),
        ],
        neverTouch: profile?.neverTouch,
      }).pipe(Effect.provideService(FSUtil.Service, fs), Effect.provideService(AppProcess.Service, processService))
    }
    if (!profile) return
    if (!input.directory || !input.projectID) return yield* new Denied({ reason: "missing-native-binding" })
    const actions = command ? ToolSafetyCommands.actions(command) : [input.tool]
    const required = actions.filter((action) => profile.askBefore?.includes(action))
    if (required.length) {
      const host = yield* NativeHost
      if (!host) return yield* new Denied({ reason: "ask-before-native-binding-missing" })
      yield* Effect.forEach(
        required,
        (action) =>
          host.ask({
            action,
            resources: command ? [command] : [input.tool],
            invocation: input,
          }),
        { discard: true },
      )
    }
    if (profile.requireSandbox && command !== undefined && !["bash", "shell", "task"].includes(input.tool))
      return yield* new Denied({ reason: "required-process-sandbox-unbound" })

    const writing = ["write", "edit", "multiedit", "apply_patch"].includes(input.tool)
    const reading = input.tool === "read"
    if (!writing && !reading) return
    // Patch.parse is the grammar the apply_patch tools apply, so these are exactly the files a patch writes
    const paths =
      input.tool === "apply_patch"
        ? yield* Effect.try({
            try: () =>
              Patch.parse(typeof args.patchText === "string" ? args.patchText : "").flatMap((hunk) =>
                hunk.type === "update" && hunk.movePath ? [hunk.path, hunk.movePath] : [hunk.path],
              ),
            catch: () => new Denied({ reason: "invalid-patch-acquisition" }),
          })
        : typeof args.filePath === "string"
          ? [args.filePath]
          : reading && typeof args.path === "string"
            ? [args.path]
            : []
    if (paths.length === 0) return yield* new Denied({ reason: "missing-native-path" })
    if (!fs) return yield* new Denied({ reason: "filesystem-acquisition" })
    const directory = yield* fs
      .realPath(input.directory)
      .pipe(Effect.mapError(() => new Denied({ reason: "binding-acquisition" })))
    yield* Effect.forEach(
      paths,
      (target) =>
        Effect.gen(function* () {
          const physical = yield* canonical(path.resolve(directory, target))
          const relative = path.relative(directory, physical).replaceAll("\\", "/")
          if (profile.neverTouch?.some((pattern) => fs.globMatch(pattern, relative) || fs.globMatch(pattern, physical)))
            return yield* new Denied({ reason: "project-never-touch" })
          const literalDenies = yield* Effect.forEach(
            (profile.neverTouch ?? []).filter((pattern) => !/[*?[]/.test(pattern)),
            (entry) => canonical(path.resolve(directory, entry)).pipe(Effect.map((entry) => contains(entry, physical))),
          )
          if (literalDenies.some(Boolean)) return yield* new Denied({ reason: "project-never-touch" })
          const matches = (entries: ReadonlyArray<string> = []) =>
            Effect.forEach(entries, (entry) =>
              canonical(path.resolve(directory, entry)).pipe(Effect.map((entry) => contains(entry, physical))),
            ).pipe(Effect.map((entries) => entries.some(Boolean)))
          if (writing) {
            if (profile.writeRoots !== undefined) {
              // A root may be a file or a path not created yet; it resolves through its nearest existing ancestor on
              // every call, so a root later replaced by a symlink is judged by where it points now.
              const roots = yield* Effect.forEach(profile.writeRoots, (root) =>
                canonical(path.resolve(directory, root)).pipe(
                  Effect.mapError(() => new Denied({ reason: "write-root-acquisition" })),
                ),
              )
              if (!roots.some((root) => contains(root, physical)))
                return yield* new Denied({ reason: "write-outside-physical-roots" })
            }
            if ((yield* matches(profile.protectedWrites)) && !(yield* matches(profile.allowedConfigEdits)))
              return yield* new Denied({ reason: "protected-instruction-or-config-write" })
            // Native leaf edit/external_directory permissions still decide authorization.
            return
          }
          if (yield* matches(profile.corpusFiles)) {
            const info = yield* fs
              .stat(physical)
              .pipe(Effect.mapError(() => new Denied({ reason: "corpus-stat-acquisition" })))
            if (info.type !== "File") return yield* new Denied({ reason: "corpus-not-file" })
            if (typeof args.limit !== "number" || !Number.isInteger(args.limit) || args.limit <= 0 || args.limit > 400)
              return yield* new Denied({ reason: "defense-corpus-bulk-read" })
          }
          if (yield* matches(profile.transcriptFiles)) {
            const cap = profile.maxTranscriptBytes ?? 400_000
            if (!Number.isSafeInteger(cap) || cap <= 0)
              return yield* new Denied({ reason: "invalid-transcript-budget" })
            const info = yield* fs
              .stat(physical)
              .pipe(Effect.mapError(() => new Denied({ reason: "transcript-stat-acquisition" })))
            if (info.type !== "File") return yield* new Denied({ reason: "transcript-not-file" })
            if (info.size > cap) return yield* new Denied({ reason: "transcript-context-budget" })
          }
        }),
      { discard: true },
    )
  })

  const run: Interface["run"] = (input, effect, observe, outcome) => {
    const observation = {
      tool: input.tool.slice(0, 128),
      sessionID: input.sessionID,
      callID: input.callID,
      directory: input.directory,
      projectID: input.projectID,
    }
    // Nested runs (the registry's durable observation inside the session's) share the outermost cell, so every
    // observation of the call carries the fact.
    const report: { cell: { fact?: ShellFact } } = { cell: {} }
    return Effect.gen(function* () {
      report.cell = (yield* ShellReport) ?? report.cell
      const loader = yield* RuntimeProfileLoader
      // Loaded once: the whole call, its after hooks included, keeps this snapshot even if hooks.json changes meanwhile.
      const loaded = loader ? yield* loader() : yield* RuntimeProfile
      const profile = native(loaded)
      yield* before(input).pipe(Effect.provideService(RuntimeProfile, profile))
      const outer = yield* HookedCall
      const hooked =
        loaded?.hooks && outer !== input.callID
          ? yield* ToolSafetyHooks.before({ installs: loaded.hooks, call: input, profile, resolve: canonical, ambient })
          : undefined
      yield* observe({ ...observation, outcome: "started" })
      const value = yield* effect.pipe(
        Effect.provideService(RuntimeProfile, profile),
        Effect.provideService(
          NativeContext,
          input.directory ? { directory: input.directory, projectID: input.projectID } : undefined,
        ),
        Effect.provideService(ShellReport, report.cell),
        Effect.provideService(HookedCall, hooked ? input.callID : outer),
        sanitizeFailure,
      )
      if (!hooked) return value
      return yield* ToolSafetyHooks.after(hooked, value, (outcome?.(value) ?? "success") === "success")
    }).pipe(
      Effect.onExit((exit) => {
        const shell = report.cell.fact
        if (shell) {
          const recorded = worse(shells.get(input.sessionID), shell)
          shells.delete(input.sessionID)
          shells.set(input.sessionID, recorded)
          if (shells.size > 1024) shells.delete(shells.keys().next().value!)
        }
        if (Exit.isSuccess(exit))
          return observe({ ...observation, ...shell, outcome: outcome?.(exit.value) ?? "success" })
        const error =
          Option.getOrUndefined(Cause.findErrorOption(exit.cause)) ??
          Result.getOrUndefined(Cause.findDefect(exit.cause))
        return observe({
          ...observation,
          ...shell,
          outcome: Cause.hasInterrupts(exit.cause) ? "cancelled" : error instanceof Denied ? "held" : "failure",
          ...(error instanceof Denied ? { reason: error.reason } : {}),
        })
      }),
    )
  }

  const session: Interface["session"] = (input) =>
    Effect.gen(function* () {
      const loader = yield* RuntimeProfileLoader
      const loaded = loader ? yield* loader() : yield* RuntimeProfile
      if (!loaded?.hooks) return []
      return yield* ToolSafetyHooks.session({ installs: loaded.hooks, event: input, profile: native(loaded), ambient })
    })

  return Service.of({ before, inspect, run, session })
})

/** Stateless boundary usable by native producers before retention, including plugin producers. */
export const inspect = (output: unknown) =>
  Effect.try({
    try: () => inspectValue(output),
    catch: () => new Denied({ reason: "output-inspection-acquisition" }),
  }).pipe(Effect.flatMap((reason) => (reason ? Effect.fail(new Denied({ reason })) : Effect.void)))

export const node = makeLocationNode({
  service: Service,
  layer: Layer.effect(Service, make),
  deps: [FSUtil.node, AppProcess.node, Global.node],
})

/** Legacy plugin producer hook: call with its native Instance placement before def.execute, never model roots. */
export const beforeInvocation = (input: Invocation) =>
  Effect.gen(function* () {
    const safety = yield* make
    const loader = yield* RuntimeProfileLoader
    const profile = loader ? yield* loader() : yield* RuntimeProfile
    yield* safety.before(input).pipe(Effect.provideService(RuntimeProfile, profile))
  }).pipe(Effect.provide(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node, Global.node]))))

/** Recognized credential shapes only. Encodings, binary attachments and unknown providers are not confinement. */
function inspectValue(value: unknown, state = { seen: new Set<object>(), nodes: 0 }, depth = 0): string | undefined {
  state.nodes++
  if (depth > 64 || state.nodes > 10_000) return "output-inspection-budget"
  if (typeof value === "string") {
    return OutputInspector.reason(value)
  }
  if (!value || typeof value !== "object" || state.seen.has(value)) return
  state.seen.add(value)
  if (value instanceof Error) {
    const reason = inspectValue(value.message, state, depth + 1) ?? inspectValue(value.cause, state, depth + 1)
    if (reason) return reason
  }
  for (const child of Object.values(value)) {
    const reason = inspectValue(child, state, depth + 1)
    if (reason) return reason
  }
}

/** Preserve interruption causes; replace secret-bearing failures/defects before any durable error projection. */
export const sanitizeFailure = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Denied, R> =>
  effect.pipe(
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        const reasons = yield* Effect.forEach(cause.reasons, (entry) =>
          Effect.gen(function* () {
            if (Cause.isInterruptReason(entry)) return Cause.fromReasons<E>([entry])
            const checked = yield* inspect(Cause.isFailReason(entry) ? entry.error : entry.defect).pipe(Effect.result)
            return checked._tag === "Failure" ? Cause.fail(checked.failure) : Cause.fromReasons<E>([entry])
          }),
        )
        return yield* Effect.failCause(
          Cause.fromReasons<E | Denied>(reasons.flatMap<Cause.Reason<E | Denied>>((entry) => entry.reasons)),
        )
      }),
    ),
  )
