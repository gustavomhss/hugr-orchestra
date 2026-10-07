import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import path from "path"
import { fileURLToPath } from "url"
import { Effect, FileSystem, Layer, Context, Schema } from "effect"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { NamedError } from "@opencode-ai/core/util/error"
import type { Agent } from "@/agent/agent"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceState } from "@/effect/instance-state"
import { Global } from "@opencode-ai/core/global"
import { SkillFile } from "@opencode-ai/core/skill/file"
import { Permission } from "@/permission"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Config } from "@/config/config"
import { FrontmatterError } from "@opencode-ai/core/v1/config/error"
import { ConfigMarkdown } from "@/config/markdown"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Glob } from "@opencode-ai/core/util/glob"
import { Discovery } from "./discovery"
import { isRecord } from "@/util/record"
import { escapeHtml } from "@/util/html"
import { Seats } from "@/maestro/seats"
import { SeatSkillRoot } from "@/maestro/seat-skill-root"

const CLAUDE_EXTERNAL_DIR = ".claude"
const AGENTS_EXTERNAL_DIR = ".agents"
const EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md"
const OPENCODE_SKILL_PATTERN = "{skill,skills}/**/SKILL.md"
const SKILL_PATTERN = "**/SKILL.md"

// Maestro's playbooks ship with Orchestra, so every repository has them. The desktop app points
// ORCHESTRA_PLAYBOOKS_DIR at its packaged copy; a run from this repository reads the source copy.
export const PLAYBOOKS_DIR =
  process.env.ORCHESTRA_PLAYBOOKS_DIR ?? fileURLToPath(new URL("../../playbooks", import.meta.url))

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  location: Schema.String,
  content: Schema.String,
  /** Last modification time (ms) of the skill file, for optimistic concurrency on save. */
  mtime: Schema.optional(Schema.Finite),
})
export type Info = Schema.Schema.Type<typeof Info>

const Issue = Schema.StructWithRest(
  Schema.Struct({
    message: Schema.String,
    path: Schema.Array(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)

function isSkillFrontmatter(data: unknown): data is { name: string; description?: string } {
  return (
    isRecord(data) &&
    typeof data.name === "string" &&
    (data.description === undefined || typeof data.description === "string")
  )
}

export class InvalidError extends Schema.TaggedErrorClass<InvalidError>()("SkillInvalidError", {
  path: Schema.String,
  message: Schema.optional(Schema.String),
  issues: Schema.optional(Schema.Array(Issue)),
}) {}

export class NameMismatchError extends Schema.TaggedErrorClass<NameMismatchError>()("SkillNameMismatchError", {
  path: Schema.String,
  expected: Schema.String,
  actual: Schema.String,
}) {}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("Skill.NotFoundError", {
  name: Schema.String,
  available: Schema.Array(Schema.String),
}) {
  override get message() {
    return `Skill "${this.name}" not found. Available skills: ${this.available.join(", ") || "none"}`
  }
}

type State = {
  skills: Record<string, Info>
  dirs: Set<string>
  // Host-registered native-seat skills. Offered only to native seats, never listed by `all()`.
  seat: Record<string, Record<string, Info>>
}

type DiscoveryState = {
  playbooks: string[]
  matches: string[]
  dirs: string[]
  seat: Record<string, string[]>
}

type ScanState = {
  matches: Set<string>
  dirs: Set<string>
}

export interface Interface {
  readonly get: (name: string) => Effect.Effect<Info | undefined>
  readonly require: (name: string, agentID?: string) => Effect.Effect<Info, NotFoundError>
  readonly all: () => Effect.Effect<Info[]>
  readonly dirs: () => Effect.Effect<string[]>
  readonly available: (agent?: Agent.Info) => Effect.Effect<Info[]>
  /** Writes a skill file (see SkillFile.save) and rescans this instance's skills. */
  readonly save: (input: SkillFile.SaveInput) => Effect.Effect<Info, SkillFile.WriteError>
  readonly remove: (location: string) => Effect.Effect<void, SkillFile.WriteError>
}

const add = Effect.fnUntraced(function* (
  state: State,
  match: string,
  events: EventV2Bridge.Service["Service"],
  fsys: FSUtil.Interface,
) {
  const md = yield* Effect.tryPromise({
    try: () => ConfigMarkdown.parse(match),
    catch: (err) => err,
  }).pipe(
    Effect.catch(
      Effect.fnUntraced(function* (err) {
        const message = FrontmatterError.isInstance(err) ? err.data.message : `Failed to parse skill ${match}`
        const { Session } = yield* Effect.promise(() => import("@/session/session"))
        yield* events.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
        yield* Effect.logError("failed to load skill", { skill: match, error: err })
        return undefined
      }),
    ),
  )

  if (!md) return

  if (!isSkillFrontmatter(md.data)) return
  if (
    match.replaceAll("\\", "/").includes("/.opencode/skills/own/") &&
    md.data.name !== `own_${path.basename(path.dirname(match))}`
  )
    return

  if (state.skills[md.data.name]) {
    yield* Effect.logWarning("duplicate skill name", {
      name: md.data.name,
      existing: state.skills[md.data.name].location,
      duplicate: match,
    })
  }

  state.dirs.add(path.dirname(match))
  state.skills[md.data.name] = {
    name: md.data.name,
    description: md.data.description,
    location: match,
    content: md.content,
    mtime: yield* SkillFile.modified(match).pipe(Effect.provideService(FSUtil.Service, fsys)),
  }
})

const scan = Effect.fnUntraced(function* (
  state: ScanState,
  root: string,
  pattern: string,
  opts?: { dot?: boolean; scope?: string },
) {
  const matches = yield* Effect.tryPromise({
    try: () =>
      Glob.scan(pattern, {
        cwd: root,
        absolute: true,
        include: "file",
        symlink: true,
        dot: opts?.dot,
      }),
    catch: (error) => error,
  }).pipe(
    Effect.catch((error) => {
      if (!opts?.scope) return Effect.die(error)
      return Effect.logError(`failed to scan ${opts.scope} skills`, { dir: root, error: error }).pipe(
        Effect.as([] as string[]),
      )
    }),
  )

  for (const match of matches) {
    state.matches.add(match)
    state.dirs.add(path.dirname(match))
  }
})

const discoverSkills = Effect.fnUntraced(function* (
  config: Config.Interface,
  discovery: Discovery.Interface,
  fsys: FSUtil.Interface,
  global: Global.Interface,
  disableExternalSkills: boolean,
  disableClaudeCodeSkills: boolean,
  directory: string,
  worktree: string,
  projectID: string,
) {
  const state: ScanState = { matches: new Set(), dirs: new Set() }
  const playbooks: ScanState = { matches: new Set(), dirs: state.dirs }
  if (yield* fsys.isDir(PLAYBOOKS_DIR)) yield* scan(playbooks, PLAYBOOKS_DIR, SKILL_PATTERN, { scope: "bundled" })

  const externalDirs: string[] = []
  if (!disableExternalSkills) {
    if (!disableClaudeCodeSkills) externalDirs.push(CLAUDE_EXTERNAL_DIR)
    externalDirs.push(AGENTS_EXTERNAL_DIR)

    for (const dir of externalDirs) {
      const root = path.join(global.home, dir)
      if (!(yield* fsys.isDir(root))) continue
      yield* scan(state, root, EXTERNAL_SKILL_PATTERN, { dot: true, scope: "global" })
    }

    const upDirs = yield* fsys
      .up({ targets: externalDirs, start: directory, stop: worktree })
      .pipe(Effect.catch(() => Effect.succeed([] as string[])))

    for (const root of upDirs) {
      yield* scan(state, root, EXTERNAL_SKILL_PATTERN, { dot: true, scope: "project" })
    }
  }

  const configDirs = yield* config.directories()
  for (const dir of configDirs) {
    yield* scan(state, dir, OPENCODE_SKILL_PATTERN)
  }

  const cfg = yield* config.get()
  const provider = cfg.maestro?.atlas
  if (
    provider?.projectID === projectID &&
    worktree !== "/" &&
    (provider.directory === "." ||
      (provider.directory.length > 0 &&
        !/[\\:\p{Cc}]/u.test(provider.directory) &&
        !path.posix.isAbsolute(provider.directory) &&
        provider.directory.split("/").every((part) => part !== "" && part !== "." && part !== "..")))
  ) {
    const fs = yield* FileSystem.FileSystem
    const repository = yield* fs.realPath(worktree)
    const root = path.resolve(repository, provider.directory, ".opencode/skills/own")
    const actual = yield* fs.realPath(root).pipe(Effect.catch(() => Effect.succeed(undefined)))
    if (actual === root) {
      const matches = yield* Effect.tryPromise({
        try: () => Glob.scan(SKILL_PATTERN, { cwd: root, absolute: true, include: "file", symlink: false, dot: true }),
        catch: (error) => error,
      })
      yield* Effect.forEach(matches, (match) =>
        Effect.gen(function* () {
          const resolved = yield* fs.realPath(match)
          const relative = path.relative(root, resolved)
          if (
            resolved !== path.resolve(match) ||
            path.isAbsolute(relative) ||
            relative.startsWith(`..${path.sep}`) ||
            relative === ".."
          )
            return
          if ((yield* fs.stat(resolved)).type !== "File") return
          state.matches.add(resolved)
          state.dirs.add(path.dirname(resolved))
        }),
      )
    }
  }
  for (const item of cfg.skills?.paths ?? []) {
    const expanded = item.startsWith("~/") ? path.join(global.home, item.slice(2)) : item
    const dir = path.isAbsolute(expanded) ? expanded : path.join(directory, expanded)
    if (!(yield* fsys.isDir(dir))) {
      yield* Effect.logWarning("skill path not found", { path: dir })
      continue
    }

    yield* scan(state, dir, SKILL_PATTERN)
  }

  for (const url of cfg.skills?.urls ?? []) {
    const pulledDirs = yield* discovery.pull(url)
    for (const dir of pulledDirs) {
      yield* scan(state, dir, SKILL_PATTERN)
    }
  }

  // Packaged skills are isolated per seat, including name collisions with project/global skill trees.
  const seat = Object.fromEntries(yield* Effect.forEach(Object.entries(SeatSkillRoot.roots), ([id, root]) =>
    Effect.gen(function* () {
      const scoped: ScanState = { matches: new Set(), dirs: new Set() }
      yield* scan(scoped, root, SKILL_PATTERN)
      return [id, Array.from(scoped.matches)] as const
    }),
  ))

  return {
    playbooks: Array.from(playbooks.matches),
    matches: Array.from(state.matches),
    dirs: Array.from(state.dirs),
    seat,
  }
})

const loadSkills = Effect.fnUntraced(function* (
  state: State,
  discovered: DiscoveryState,
  events: EventV2Bridge.Service["Service"],
  fsys: FSUtil.Interface,
) {
  // Playbooks load first, so a skill of the same name from any other source replaces one.
  yield* Effect.forEach(
    [discovered.playbooks, discovered.matches],
    (matches) =>
      Effect.forEach(matches, (match) => add(state, match, events, fsys), {
        concurrency: "unbounded",
        discard: true,
      }),
    { discard: true },
  )

  yield* Effect.logInfo("init", { count: Object.keys(state.skills).length })
})

export class Service extends Context.Service<Service, Interface>()("@opencode/Skill") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const discovery = yield* Discovery.Service
    const config = yield* Config.Service
    const events = yield* EventV2Bridge.Service
    const fsys = yield* FSUtil.Service
    const global = yield* Global.Service
    const flags = yield* RuntimeFlags.Service
    const fs = yield* FileSystem.FileSystem
    const discovered = yield* InstanceState.make(
      Effect.fn("Skill.discovery")(function* (ctx) {
        return yield* discoverSkills(
          config,
          discovery,
          fsys,
          global,
          flags.disableExternalSkills,
          flags.disableClaudeCodeSkills,
          ctx.directory,
          ctx.worktree,
          ctx.project.id,
        ).pipe(Effect.provideService(FileSystem.FileSystem, fs), Effect.orDie)
      }),
    )
    const state = yield* InstanceState.make(
      Effect.fn("Skill.state")(function* () {
        const s: State = { skills: {}, dirs: new Set(), seat: {} }
        const found = yield* InstanceState.get(discovered)
        yield* loadSkills(s, found, events, fsys)
        yield* Effect.forEach(Object.entries(found.seat), ([id, matches]) => Effect.gen(function* () {
          const seat: State = { skills: {}, dirs: new Set(), seat: {} }
          yield* loadSkills(seat, { playbooks: [], matches, dirs: [], seat: {} }, events, fsys)
          s.seat[id] = seat.skills
        }))
        return s
      }),
    )

    const get = Effect.fn("Skill.get")(function* (name: string) {
      const s = yield* InstanceState.get(state)
      return s.skills[name]
    })

    const require = Effect.fn("Skill.require")(function* (name: string, agentID?: string) {
      const s = yield* InstanceState.get(state)
      const visible = agentID && Seats.find(agentID) ? { ...s.skills, ...s.seat[agentID] } : s.skills
      const info = visible[name]
      if (info) return info
      return yield* new NotFoundError({ name, available: Object.keys(visible).toSorted() })
    })

    const all = Effect.fn("Skill.all")(function* () {
      const s = yield* InstanceState.get(state)
      return Object.values(s.skills)
    })

    const dirs = Effect.fn("Skill.dirs")(function* () {
      return (yield* InstanceState.get(discovered)).dirs
    })

    const available = Effect.fn("Skill.available")(function* (agent?: Agent.Info) {
      const s = yield* InstanceState.get(state)
      const list = Object.values(agent?.native && agent.id && Seats.find(agent.id) ? { ...s.skills, ...s.seat[agent.id] } : s.skills).toSorted((a, b) =>
        a.name.localeCompare(b.name),
      )
      if (!agent) return list
      // A skill rule whose pattern is an absolute path matches where the skill was found, not its name,
      // and only hides the skill from this list. Name rules such as "*" never match a location.
      const located = agent.permission.filter((rule) => path.isAbsolute(rule.pattern))
      return list.filter(
        (skill) =>
          Permission.evaluate("skill", skill.name, agent.permission).action !== "deny" &&
          Permission.evaluate("skill", skill.location, located).action !== "deny",
      )
    })

    const rescan = Effect.fnUntraced(function* () {
      yield* InstanceState.invalidate(discovered)
      yield* InstanceState.invalidate(state)
    })

    const save = Effect.fn("Skill.save")(function* (input: SkillFile.SaveInput) {
      const directory = yield* InstanceState.directory
      const saved = yield* SkillFile.save({ directory, registered: yield* all(), skill: input }).pipe(
        Effect.provideService(FSUtil.Service, fsys),
      )
      yield* rescan()
      return saved
    })

    const remove = Effect.fn("Skill.remove")(function* (location: string) {
      const directory = yield* InstanceState.directory
      yield* SkillFile.remove({ directory, registered: yield* all(), location }).pipe(
        Effect.provideService(FSUtil.Service, fsys),
      )
      yield* rescan()
    })

    return Service.of({ get, require, all, dirs, available, save, remove })
  }),
)

export function fmt(list: Info[], opts: { verbose: boolean }) {
  const described = list.filter((skill) => skill.description !== undefined)
  if (described.length === 0) return "No skills are currently available."
  if (opts.verbose) {
    return [
      "<available_skills>",
      ...described
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .flatMap((skill) => [
          "  <skill>",
          `    <name>${skill.name}</name>`,
          `    <description>${skill.description}</description>`,
          `    <location>${escapeHtml(skill.location)}</location>`,
          "  </skill>",
        ]),
      "</available_skills>",
    ].join("\n")
  }

  return [
    "## Available Skills",
    ...described
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((skill) => `- **${skill.name}**: ${skill.description}`),
  ].join("\n")
}

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [filesystem, Discovery.node, Config.node, EventV2Bridge.node, FSUtil.node, Global.node, RuntimeFlags.node],
})

export * as Skill from "."
