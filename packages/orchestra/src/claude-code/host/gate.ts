export * as ClaudeHostGate from "./gate"

// Orchestra's policy gate for every Claude Code tool call, built-ins, MCP tools and subagent calls alike, run from the
// in-process `PreToolUse` hook. A call passes only when every check passes: governance HOLDs, ToolSafety under the
// calling agent's own write roots, the arsenal input bindings for Orchestra's in-process tools, then Orchestra's
// permission rules. Any failure is a deny, and nothing later can turn a deny back into an allow. Claude Code's own
// native tools never reached ToolSafety before; this gate is where they do. A PreToolUse deny wins in every permission
// mode, bypass included, while `canUseTool` is skipped whenever an allow rule matches (spike S7), so all policy is here.
// Shell calls obey the actor's effective project sandbox; write-roots seats also require their per-call grant's roots.
// Parsing a command for its writes is not a control.
import { Effect, Exit, Scope } from "effect"
import path from "node:path"
import fs from "node:fs/promises"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import type { HookJSONOutput } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { FSUtil } from "@orchestra/core/fs-util"
import { Wildcard } from "@orchestra/core/util/wildcard"
import { Database } from "@orchestra/core/database/database"
import { Shell } from "@orchestra/core/shell"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { Seats } from "@/maestro/seats"
import { WriteRoots } from "@/maestro/write-roots"
import { WorkflowBinding } from "@/maestro/workflow-binding"
import { Permission } from "@/permission"
import { MessageID, type SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { approve, resolvePath } from "@/tool/shell/scan"
import { ShellExecution } from "@/tool/shell/execution"
import type { Tool } from "@/tool/tool"
import { asks } from "../permissions"
import { ClaudeCodeTools } from "../tools"
import { ClaudeHostMcp } from "./mcp"
import { ClaudeHostProcess } from "./process-tool"
import { ClaudeHostPlugin } from "./plugin"

type Input = Record<string, unknown>

/** Who makes a call: the main conversation, or one subagent joined to its dispatch, and the Orchestra Session it acts in. */
export type Actor = {
  readonly sessionID: SessionID
  /** The Orchestra agent or seat id whose rules apply. */
  readonly seat: string
  /** Claude Code's subagent id; absent on the main thread. */
  readonly agentID?: string
}

/** The ToolSafety view of one call: Orchestra's tool name and argument names. */
export type Call = { readonly tool: string; readonly args: Input }

/** The checks one call goes through. Each one denies by failing; none of them can allow past another's failure. */
export type Ports = {
  /**
   * The registry tool ids each agent may call (ClaudeHostMcp.prepare().granted). The `orchestra` MCP server is shared
   * by the whole session and its calls do not say who calls, so the gate scopes them by the caller's seat.
   */
  readonly granted: Readonly<{ [agent: string]: readonly string[] }>
  /** Governance HOLDs that refuse a call before any policy is evaluated. */
  readonly hold: (actor: Actor, name: string, input: Input) => Effect.Effect<void, unknown>
  /** ToolSafety, evaluated with the actor Session's profile, so a subagent's write roots are its own grant's. */
  readonly safety: (actor: Actor, call: Call, toolUseID: string) => Effect.Effect<void, unknown>
  /** The arsenal input bindings of an Orchestra in-process tool (`mcp__orchestra__<tool>`). */
  readonly arsenal: (actor: Actor, tool: string, input: Input) => Effect.Effect<void, unknown>
  /** Orchestra's permission rules, asking the owner where a rule says ask. */
  readonly ask: (actor: Actor, name: string, input: Input, toolUseID: string) => Effect.Effect<void, unknown>
  /**
   * A shell command rewritten under the actor's effective sandbox policy; undefined when no confinement is required.
   * Write-roots seats also require bound roots. Required confinement fails closed when this host has no jail.
   */
  readonly confine: (actor: Actor, command: string, toolUseID: string, process?: { workdir?: string }) => Effect.Effect<string | undefined, unknown>
  /** Releases what a confined call holds (the jail's policy and scratch files) once the call has ended. */
  readonly release: (toolUseID: string) => Effect.Effect<void>
  /** Releases every jail still held, such as a background `process`'s, when the host session ends. */
  readonly close: Effect.Effect<void>
}

export type Decision = { readonly allow: true; readonly input?: Input } | { readonly allow: false; readonly reason: string }

/** Orchestra's decision on one call. In-process Orchestra tools ask inside their own implementation, so they skip `ask`. */
export const decide = Effect.fn("ClaudeHostGate.decide")(function* (ports: Ports, actor: Actor, name: string, input: Input, toolUseID: string): Effect.fn.Return<Decision> {
  const own = ClaudeCodeTools.orchestra(name)
  const scoped = scope(ports.granted, actor, name, input)
  if (scoped) return { allow: false, reason: scoped }
  const checks = [
    ports.hold(actor, name, input),
    ports.safety(actor, invocation(name, input), toolUseID),
    ...(own ? [ports.arsenal(actor, own, input)] : [ports.ask(actor, name, input, toolUseID)]),
  ]
  for (const check of checks) {
    const exit = yield* Effect.exit(check)
    if (Exit.isFailure(exit)) return { allow: false, reason: ClaudeCodeTools.failure(exit.cause) }
  }
  // Bash and process starts share the effective sandbox policy and per-call resource lifetime.
  if (name !== "Bash" && !(own === PROCESS && input.action === "start")) return { allow: true }
  const confined = yield* Effect.exit(ports.confine(actor, typeof input.command === "string" ? input.command : "", toolUseID,
    own === PROCESS ? { workdir: text(input, "workdir") } : undefined))
  if (Exit.isFailure(confined)) return { allow: false, reason: ClaudeCodeTools.failure(confined.cause) }
  return (confined.value === undefined ? { allow: true } : { allow: true, input: { ...input, command: confined.value } })
})

/** The hook answer for a decision. A deny names its reason so the model can act on it. */
export function output(decision: Decision): HookJSONOutput {
  if (decision.allow) return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow",
    ...(decision.input ? { updatedInput: { ...decision.input } } : {}) } }
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: decision.reason } }
}

export function denied(output: HookJSONOutput) {
  return "hookSpecificOutput" in output && output.hookSpecificOutput?.hookEventName === "PreToolUse" &&
    output.hookSpecificOutput.permissionDecision === "deny"
}

export function deny(reason: string): HookJSONOutput {
  return output({ allow: false, reason })
}

/** Claude Code's tool call as ToolSafety reads it: Orchestra's tool name and argument names for the same operation. */
export function invocation(name: string, input: Input): Call {
  const own = ClaudeCodeTools.orchestra(name)
  if (own) return { tool: own, args: input }
  const file = text(input, "file_path") ?? text(input, "notebook_path")
  if (name === "Bash") return { tool: "bash", args: { command: text(input, "command") ?? "" } }
  if (name === "Write") return { tool: "write", args: { filePath: file } }
  if (name === "Edit" || name === "MultiEdit" || name === "NotebookEdit") return { tool: "edit", args: { filePath: file } }
  if (name === "Read") return { tool: "read", args: { filePath: file, limit: input.limit, offset: input.offset } }
  return { tool: name, args: input }
}

/** The `process` MCP tool: a background shell command whose jail lives until the host session ends. */
export const PROCESS = ClaudeHostProcess.ID

/**
 * What a seat may reach at all: its own entry skills (plugin agents cannot restrict skills), and the Orchestra MCP tools
 * the registry grants it. Returns the reason a call is out of scope.
 */
export function scope(granted: Ports["granted"], actor: Actor, name: string, input: Input) {
  const own = ClaudeCodeTools.orchestra(name)
  const capture = ClaudeHostPlugin.CAPTURE[actor.seat]
  if (capture && !(own && capture.includes(own)) && !(name === "Skill" && capture.includes("skill")))
    return `${actor.seat} source access is scoped to Orchestra capture tools; ${name} did not run.`
  if (own) {
    // A write grant is part of delegating, so it goes to the agents that may delegate.
    const allowed = granted[actor.seat]?.includes(own === ClaudeHostMcp.GRANT ? "task" : own)
    return allowed ? undefined : `${actor.seat} is not granted the Orchestra tool ${own}, so the call did not run.`
  }
  if (name !== "Skill") return undefined
  const requested = (text(input, "skill") ?? text(input, "command") ?? "").replace(/^\//, "").replace(/^orchestra:/, "")
  const owner = Object.values(Seats.all).find((seat) => seat.skills.includes(requested))
  if (owner) return owner.id === actor.seat ? undefined : `${requested} is ${owner.id}'s skill, so ${actor.seat} cannot use it.`
  // The main conversation keeps its playbooks and the owner's own skills; a seat has only its entry skills.
  if (!actor.agentID) return undefined
  const skills = Seats.find(actor.seat)?.skills ?? []
  return `${actor.seat} may use only its own skills${skills.length ? ` (${skills.join(", ")})` : ""}; ${requested || "that skill"} is not one of them.`
}

export function agentCall(name: string) {
  return name === "Agent" || name === "Task"
}

/**
 * The gate on Orchestra's services. Needs, in the caller's context: Session, Agent, Permission, Config, FSUtil, the
 * child process spawner, the instance, and the arsenal bindings' services (ArsenalBindings.make).
 * `part` finds the mirrored part of a call, so a permission prompt is shown on it.
 */
export const live = Effect.fn("ClaudeHostGate.live")(function* (input: {
  readonly granted: Ports["granted"]
  readonly abort: AbortSignal
  readonly part?: (toolUseID: string) => SessionV1.ToolPart | undefined
}) {
  const sessions = yield* Session.Service
  const agents = yield* Agent.Service
  const permission = yield* Permission.Service
  const config = yield* Config.Service
  const fs = yield* FSUtil.Service
  const spawner = yield* ChildProcessSpawner
  const instance = yield* InstanceState.context
  const database = yield* Database.Service
  const arsenal = yield* ArsenalBindings.make
  const shell = Shell.acceptable((yield* config.get()).shell)
  const projectDirectory = instance.worktree === "/" ? instance.directory : instance.worktree
  const scopes = new Map<string, Scope.Closeable>()

  const context = Effect.fnUntraced(function* (actor: Actor, toolUseID: string) {
    const session = yield* sessions.get(actor.sessionID)
    const agent = yield* agents.get(actor.seat)
    const ruleset = Permission.merge(agent?.permission ?? [], session.permission ?? [])
    const part = input.part?.(toolUseID)
    const messageID = part?.messageID ?? MessageID.ascending()
    return {
      sessionID: actor.sessionID, messageID, callID: toolUseID, agent: actor.seat, agentID: actor.seat, abort: input.abort,
      messages: [], extra: { claudeCode: true }, metadata: () => Effect.void,
      ask: (request) => Effect.gen(function* () {
        const windows = process.platform === "win32" && request.permission === "external_directory"
        // Expand lexical 8.3 names without following junctions. Original lexical and physical checks remain;
        // an alias-only deny must never become a deny on the alias's otherwise permitted physical target.
        const lookup = windows ? yield* Effect.tryPromise({
          try: async () => {
            const patterns = [...new Set((await Promise.all(request.patterns.map(async (pattern) =>
              [pattern, await windowsPattern(pattern)]))).flat())]
            return { patterns, ruleset: (await Promise.all(ruleset.map(async (rule) =>
              rule.action === "deny" && Wildcard.match(request.permission, rule.permission)
                ? [rule, { ...rule, pattern: await windowsPattern(rule.pattern, patterns) }] : [rule]))).flat() }
          },
          catch: (cause) => new Error("HOLD: WINDOWS_LEXICAL_PATH_ACQUISITION_FAILED", { cause }),
        }) : { patterns: request.patterns, ruleset }
        return yield* permission.ask({ ...request, ...lookup, sessionID: actor.sessionID,
          ...(part ? { tool: { messageID, callID: toolUseID } } : {}) })
      }).pipe(Effect.orDie),
    } satisfies Tool.Context
  })

  const release = (toolUseID: string) => Effect.gen(function* () {
    const scope = scopes.get(toolUseID)
    scopes.delete(toolUseID)
    if (scope) yield* Scope.close(scope, Exit.void)
  })

  return {
    granted: input.granted,
    close: Effect.suspend(() => Effect.forEach([...scopes.keys()], release, { discard: true })),
    hold: (actor, name, input) => Effect.gen(function* () {
      const task = ClaudeCodeTools.orchestra(name) === ClaudeHostMcp.WORKFLOW_TASK
      // A workflow-bound Session runs its bound work only; it never starts teammates (task.ts parity).
      if ((agentCall(name) || task) &&
        (yield* WorkflowBinding.read(actor.sessionID).pipe(Effect.provideService(Database.Service, database))))
        return yield* Effect.fail(new Error("Tool safety HOLD: WORKFLOW_NESTED_TASK_REFUSED"))
      if (task && input.workflow === undefined)
        return yield* Effect.fail(new Error("Tool safety HOLD: WORKFLOW_TASK_SELECTION_MISSING. " +
          "mcp__orchestra__task runs only an approved Relay workflow dispatch: pass workflow, authorizationID and the " +
          "approved writePaths. Dispatch any other work with Agent and subagent_type \"orchestra:<seat>\"; nothing was dispatched."))
    }),
    safety: (actor, call, toolUseID) => Effect.gen(function* () {
      const session = yield* sessions.get(actor.sessionID)
      yield* arsenal.withSession(actor.sessionID, ToolSafety.beforeInvocation({ tool: call.tool, args: call.args,
        sessionID: actor.sessionID, callID: toolUseID, agent: actor.seat, directory: session.directory,
        projectID: session.projectID, projectDirectory }))
    }),
    arsenal: (actor, tool, args) => arsenal.beforeExecute(actor.sessionID, tool, args),
    confine: (actor, command, toolUseID, background) => arsenal.withSession(actor.sessionID, Effect.gen(function* () {
      const session = yield* sessions.get(actor.sessionID)
      const loader = yield* ToolSafety.RuntimeProfileLoader
      const profile = loader ? yield* loader() : yield* ToolSafety.RuntimeProfile
      if (Seats.find(actor.seat)?.writeRoots && !WriteRoots.read(session.permission))
        return yield* Effect.fail(new Error(`HOLD: ${actor.seat} has no bound write roots, so its Bash did not run.`))
      // Restrictions also require enforcement when a host profile did not explicitly set requireSandbox.
      const required = profile?.requireSandbox || profile?.sandbox?.enabled || profile?.writeRoots !== undefined ||
        profile?.sandbox?.readRoots !== undefined || profile?.neverTouch?.length || profile?.managedPaths?.length ||
        profile?.protectedWrites?.length || profile?.sandbox?.denyPaths?.length ||
        profile?.sandbox?.allowedUnixSockets?.length || profile?.sandbox?.allowedLoopbackEndpoints?.length
      if (!required) return undefined
      const ctx = yield* context(actor, toolUseID)
      const cwd = background?.workdir ? yield* resolvePath(background.workdir, instance.directory, shell).pipe(
        Effect.provideService(FSUtil.Service, fs), Effect.provideService(ChildProcessSpawner, spawner),
      ) : instance.directory
      const prepareParents = background ? yield* approve(ctx, { command, cwd, shell }).pipe(
        Effect.provideService(FSUtil.Service, fs), Effect.provideService(ChildProcessSpawner, spawner),
      ) : false
      const scope = yield* Scope.make()
      if (scopes.has(toolUseID)) {
        yield* Scope.close(scope, Exit.void)
        return yield* Effect.fail(new Error("HOLD: duplicate shell confinement call."))
      }
      scopes.set(toolUseID, scope)
      // Process starts transfer this jail at execution, without a second wrap. Required policy never falls back.
      const jailed = yield* (background
          ? ShellExecution.wrap(fs, { command, shell, cwd, env: process.env, prepareParents }, ctx)
          : ToolSafetySandbox.wrap(ChildProcess.make("/bin/sh", ["-c", command], { cwd: session.directory }))).pipe(
          Effect.provideService(ToolSafety.RuntimeProfile, { ...profile, requireSandbox: true,
            sandbox: { ...profile?.sandbox, enabled: true, unconfinedFallback: false } }),
          Effect.provideService(FSUtil.Service, fs), Scope.provide(scope),
          Effect.tapCause(() => release(toolUseID)), Effect.mapError((error) => new Error(
            `HOLD: NATIVE_SHELL_SANDBOX_REQUIRED: ${actor.seat}'s shell confinement could not be set up (${error instanceof ToolSafety.Denied ? error.reason : String(error)}), so the command did not run.`)))
      if (jailed._tag !== "StandardCommand") {
        yield* release(toolUseID)
        return yield* Effect.fail(new Error("HOLD: the write jail returned a pipeline, so the command did not run."))
      }
      const updated = line(jailed)
      if (background) yield* ShellExecution.handoff(ctx, {
        command: updated, originalCommand: command, prepareParents, cwd, agentID: ctx.agentID, wrapped: jailed, resources: scope,
        onTake: () => { scopes.delete(toolUseID) },
      }).pipe(Effect.tapCause(() => release(toolUseID)))
      return updated
    })),
    release,
    ask: (actor, name, args, toolUseID) => Effect.gen(function* () {
      const ctx = yield* context(actor, toolUseID)
      // Delegation is Orchestra's `task` permission on the seat, as Task asks it.
      if (agentCall(name)) {
        const route = text(args, "subagent_type") ?? "*"
        const seat = route.startsWith("orchestra:") ? Seats.find(route.slice("orchestra:".length))?.id ?? route : route
        return yield* ctx.ask({ permission: "task", patterns: [seat], always: ["*"],
          metadata: { description: text(args, "description"), subagent_type: route } })
      }
      // Native file tools use Orchestra's read/edit permissions and worktree-relative path patterns.
      // Asking for the SDK name (e.g. Write) falls through a native seat's deny-all rule, even inside its grant.
      if (["Read", "Write", "Edit", "MultiEdit", "NotebookEdit"].includes(name)) {
        const target = text(args, "file_path") ?? text(args, "notebook_path")
        if (!target) return yield* Effect.fail(new Error(`HOLD: ${name} has no file path.`))
        const filepath = path.resolve(instance.directory, FSUtil.windowsPath(target))
        // Expand lexical names before resolving links, and use the same spellings for both containment roots.
        const locations = process.platform === "win32" ? yield* Effect.tryPromise({
          try: () => Promise.all([filepath, instance.directory, projectDirectory].map(async (target) => {
            const expanded = await lexicalPath(target)
            if (expanded === undefined) throw new Error(`Windows lexical path was not acquired: ${target}`)
            return expanded
          })),
          catch: (cause) => new Error("HOLD: WINDOWS_LEXICAL_PATH_ACQUISITION_FAILED", { cause }),
        }) : [filepath, instance.directory, projectDirectory]
        const physical = yield* canonical(fs, locations[0], name === "Write")
        const worktree = yield* fs.realPath(locations[2])
        const targets = [...new Set([filepath, locations[0], physical])]
        const directory = name === "Read" && (yield* fs.stat(physical)).type === "Directory"
        // Resolve containment physically; context.ask separately expands Windows lexical short names.
        const roots = [instance.directory, projectDirectory, locations[1], locations[2]]
        const physicalRoots = [yield* fs.realPath(locations[1]), worktree]
        const external = [...new Set([
          ...(roots.some((root) => FSUtil.contains(root, filepath)) ? [] : [filepath]),
          ...(physicalRoots.some((root) => FSUtil.contains(root, physical)) ? [] : [physical]),
        ])]
        yield* Effect.forEach(external, (target) => {
          const parentDir = directory ? target : path.dirname(target)
          const glob = path.join(parentDir, "*").replaceAll("\\", "/")
          return ctx.ask({ permission: "external_directory", patterns: [glob], always: [glob],
            metadata: { filepath: target, parentDir } })
        })
        return yield* ctx.ask({ permission: name === "Read" ? "read" : "edit",
          patterns: targets.map((target) => path.relative(worktree, target).replaceAll("\\", "/")),
          always: ["*"], metadata: { filepath, physical } })
      }
      if (name === "Skill") return yield* ctx.ask({ permission: "skill", patterns: [text(args, "skill") ?? "*"], always: ["*"], metadata: { input: args } })
      return yield* asks(name, args, ctx, (command) => approve(ctx, { command, cwd: instance.directory, shell }).pipe(
        Effect.provideService(FSUtil.Service, fs), Effect.provideService(ChildProcessSpawner, spawner), Effect.asVoid))
    }),
  } satisfies Ports
})

/**
 * The jailed command as one Bash line: the tool-child environment the jail gives (relative to this process's, which
 * Claude Code inherits), then the jail launcher and its arguments, each word quoted.
 */
function line(command: ChildProcess.StandardCommand) {
  const env = command.options.env ?? {}
  const unset = Object.keys(process.env).filter((name) => !(name in env)).flatMap((name) => ["-u", name])
  const set = Object.entries(env).flatMap(([name, value]) => value !== undefined && process.env[name] !== value ? [`${name}=${value}`] : [])
  return ["/usr/bin/env", ...unset, ...set, command.command, ...command.args].map(quote).join(" ")
}

function quote(word: string) {
  return `'${word.replaceAll("'", `'\\''`)}'`
}

function text(input: Input, key: string) {
  const value = input[key]
  return typeof value === "string" ? value : undefined
}

// Wildcard's only metacharacters are * and ?. Expand the literal directory prefix, leaving its glob intact.
// Neither realpath nor FSUtil.normalizePath is lexical: both can replace a junction's name with its target.
async function windowsPattern(pattern: string, candidates?: readonly string[]) {
  const lexical = FSUtil.windowsPath(pattern).replaceAll("\\", "/")
    .replace(/^\/\/\?\/UNC\//i, "//").replace(/^\/\/\?\/([A-Za-z]:\/)/, "$1")
  if (!path.win32.isAbsolute(lexical)) return pattern
  const token = lexical.search(/[*?]/)
  const boundary = token < 0 ? lexical.length : lexical.lastIndexOf("/", token) + 1
  const prefix = await lexicalPath(path.resolve(lexical.slice(0, boundary)), candidates)
  return prefix === undefined ? pattern : path.join(prefix, lexical.slice(boundary)).replaceAll("\\", "/")
}

async function lexicalPath(target: string, candidates?: readonly string[]) {
  // An unrelated deny prefix need not acquire inaccessible descendants or a different drive.
  const relevant = (prefix: string) => !candidates || candidates.some((candidate) => FSUtil.contains(prefix, candidate))
  const root = path.parse(target).root
  if (!relevant(root)) return undefined
  await fs.lstat(root)
  const expanded = await target.slice(root.length).split(path.sep).filter(Boolean).reduce(async (previous, name) => {
    const parent = await previous
    if (!parent) return undefined
    const requestedPath = path.join(parent.path, name)
    if (parent.missing) return relevant(requestedPath) ? { path: requestedPath, missing: true } : undefined
    const entries = await fs.readdir(parent.path)
    // Enumeration proves the exact lexical name without acquiring unrelated entries' metadata.
    if (entries.includes(name)) {
      if (!relevant(requestedPath)) return undefined
      await fs.lstat(requestedPath)
      return { path: requestedPath, missing: false }
    }
    const requested = await fs.lstat(requestedPath, { bigint: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    // A proven absent component is a new literal name, not an alias. Preserve all missing descendants.
    if (!requested) return relevant(requestedPath) ? { path: requestedPath, missing: true } : undefined
    // lstat identifies the junction itself. Missing or ambiguous identities cannot prove a lexical alias.
    if (requested.ino === 0n) throw new Error(`Windows lexical file identity unavailable: ${requestedPath}`)
    const folded = entries.filter((entry) => entry.toUpperCase() === name.toUpperCase())
    const matches = (await Promise.all((folded.length ? folded : entries).map(async (entry) => {
      const info = await fs.lstat(path.join(parent.path, entry), { bigint: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined
        throw error
      })
      return info && info.dev === requested.dev && info.ino === requested.ino &&
        info.isSymbolicLink() === requested.isSymbolicLink() ? entry : undefined
    }))).filter((entry) => entry !== undefined)
    if (matches.length !== 1) throw new Error(`Windows lexical alias identity is ambiguous: ${requestedPath}`)
    const expanded = path.join(parent.path, matches[0])
    return relevant(expanded) ? { path: expanded, missing: false } : undefined
  }, Promise.resolve<{ path: string; missing: boolean } | undefined>({ path: root, missing: false }))
  return expanded?.path
}

// Only new Write paths may be absent. Existing aliases and parents must resolve physically; other failures deny.
function canonical(fs: FSUtil.Interface, target: string, create: boolean): Effect.Effect<string, FSUtil.Error | Error> {
  return fs.realPath(target).pipe(
    Effect.catchReason("PlatformError", "NotFound", (error) => {
      if (!create || path.dirname(target) === target) return Effect.fail(error)
      // A dangling symlink is an existing alias, not a new leaf: never authorize it as its own spelling.
      return fs.readLink(target).pipe(
        Effect.flatMap(() => Effect.fail(new Error("HOLD: native file target is a dangling symlink."))),
        Effect.catchReason("PlatformError", "NotFound", () =>
          canonical(fs, path.dirname(target), true).pipe(Effect.map((parent) => path.join(parent, path.basename(target)))),
        ),
      )
    }),
  )
}
