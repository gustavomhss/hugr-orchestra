export * as ClaudeHostPlugin from "./plugin"

// The `orchestra` Claude Code plugin (meta-harness PLAN §4.3, §4.8), generated from the registry: the native seats as
// the agent registry resolves them (label, prompt, model), their tools as the tool registry grants them
// (ClaudeHostMcp.prepare), and their skills plus Maestro's playbooks. Plugin files are never committed: they are
// written into an Orchestra-owned cache directory named by their content hash, so a build writes only when the
// content changed. Claude Code loads it with `plugins: [{ type: "local", path }]` and addresses each seat as
// `orchestra:<seat>`, and the research seat as `orchestra:jimmy-<tier>`.
//
// There is no hooks/hooks.json: every record is written by the in-process SDK hooks (host/hooks.ts), and no
// record-free policy needs a plugin hook today.
import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk"
import { Global } from "@orchestra/core/global"
import { Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import type { Agent } from "@/agent/agent"
import { Seats } from "@orchestra/maestro/seats"
import { SeatSkillRoot } from "@orchestra/maestro/seat-skill-root"
import { ResearchSeatTools } from "@orchestra/core/research/seat-tools"
import { Skill } from "@/skill"
import { ClaudeHostMcp } from "./mcp"
import { ClaudeHostProcess } from "./process-tool"

export const NAME = "orchestra"

/** Where the content-hashed plugin directories are published by default: `<ROOT>/<hash>/`. */
export const ROOT = path.join(Global.Path.cache, "claude-host", "plugin-v2")

/** A seat that needs `permissionMode` or its own MCP server: plugin agents ignore those fields (12, Agreement 3). */
export type SdkOnly = Pick<AgentDefinition, "permissionMode" | "mcpServers">

export type Input = {
  /** The native seats as Agent.Service resolves them; other agents are ignored. */
  seats: readonly Agent.Info[]
  /** Every registry tool id per agent id (ClaudeHostMcp.prepare `granted`). */
  tools: Readonly<Record<string, readonly string[]>>
  /** Seats defined through the SDK `agents` option instead of a plugin file. */
  sdk?: Readonly<Record<string, SdkOnly>>
  /** Where content-hashed plugin directories live. Default: Orchestra's cache. */
  root?: string
  /** Maestro's playbooks. Default: Skill.PLAYBOOKS_DIR. */
  playbooks?: string
}

/**
 * The plugin agents of a seat: one per research tier for the research seat (J1.4), so the tier travels in the Agent
 * call's `subagent_type` and each definition carries its own `maxTurns`; one agent named by its id for any other seat.
 */
export function agents(seat: string): readonly { readonly name: string; readonly tier?: Research.Depth }[] {
  if (seat !== ResearchSeatTools.SEAT) return [{ name: seat }]
  return Research.Depth.literals.map((tier) => ({ name: `${seat}-${tier}`, tier }))
}

/** The seat and research tier a plugin agent name addresses: `jimmy-focused` is the research seat at `focused`. */
export function agent(name: string) {
  const match = /^(.+)-([a-z]+)$/.exec(name)
  if (match?.[1] === ResearchSeatTools.SEAT && Schema.is(Research.Depth)(match[2])) return { seat: match[1], tier: match[2] }
  return { seat: name, tier: undefined }
}

/**
 * Seat prompt text that describes Orchestra's own loop, and its Claude Code equivalent. Nothing else in a seat prompt
 * changes.
 */
export const LOOP_TEXT: readonly (readonly [string, string])[] = [
  ["the task delegation tool", "the Agent delegation tool"],
]

export async function build(input: Input) {
  const seats = input.seats.flatMap((agent) => {
    const seat = Seats.find(agent.id)
    return seat && agent.native === true ? [{ agent, seat }] : []
  }).toSorted((a, b) => a.seat.id.localeCompare(b.seat.id))
  const defined = seats.flatMap((item) => agents(item.seat.id).map((entry) => ({ id: item.seat.id, name: entry.name,
    definition: definition(item.agent, item.seat.id, input.tools[item.seat.id] ?? [], entry.tier) })))
  const files = new Map<string, Uint8Array>([
    [".claude-plugin/plugin.json", encode(JSON.stringify({
      name: NAME,
      description: "Orchestra's native team seats, their skills and Maestro's playbooks.",
    }, null, 2) + "\n")],
    ...defined.filter((item) => !input.sdk?.[item.id]).map((item) => [`agents/${item.name}.md`, encode(markdown(item.id, item.name, item.definition))] as const),
    ...await skills(seats.map((item) => item.seat.id), input.playbooks ?? Skill.PLAYBOOKS_DIR),
  ])
  return {
    path: await publish(input.root ?? ROOT, files),
    seats: Object.fromEntries(defined.map((item) => [`${NAME}:${item.name}`, item.id])),
    sdkAgents: Object.fromEntries(defined.flatMap((item) => {
      const sdk = input.sdk?.[item.id]
      return sdk ? [[`${NAME}:${item.name}`, { ...item.definition, ...sdk } satisfies AgentDefinition]] : []
    })),
  }
}

/**
 * A seat's Claude Code tool allow-list: built-in names for built-in duplicates, `mcp__orchestra__*` for the rest. The
 * research seat keeps only its descriptor's tools (J1.6) plus its native readers and search, whose output PostToolUse
 * retains (J1.7); WebFetch returns a model-made summary rather than received bytes, so it is never among them.
 */
export function tools(seat: string, granted: readonly string[]) {
  const research = seat === ResearchSeatTools.SEAT
  const scope: readonly string[] = [...ResearchSeatTools.OWN, ...ResearchSeatTools.LOOP]
  const names = granted.filter((id) => !research || scope.includes(id)).flatMap((id) => {
    if (Object.hasOwn(ClaudeHostMcp.BUILTINS, id)) return ClaudeHostMcp.BUILTINS[id]
    return ClaudeHostMcp.servable(id) ? [`mcp__${ClaudeHostMcp.NAME}__${id}`] : []
  })
  return [...new Set([...names, ...(research ? ResearchSeatTools.CLAUDE : [])])].toSorted()
}

function definition(agent: Agent.Info, seat: string, granted: readonly string[], tier: Research.Depth | undefined) {
  const allowed = tools(seat, granted)
  // An empty allow-list would read as "inherit every tool": fail instead of widening the seat.
  if (allowed.length === 0) throw new Error(`Seat ${seat} has no tools to give Claude Code`)
  if (!agent.prompt?.trim()) throw new Error(`Seat ${seat} has no prompt`)
  if (!agent.description?.trim()) throw new Error(`Seat ${seat} has no description`)
  const process = `mcp__${ClaudeHostMcp.NAME}__${ClaudeHostProcess.ID}`
  const note = allowed.some((name) => name.startsWith(`mcp__${ClaudeHostMcp.NAME}__`)) ? [
    "# Orchestra tools",
    [
      `Orchestra's tools are MCP tools named \`mcp__${ClaudeHostMcp.NAME}__<tool>\`.`,
      ...(allowed.includes(process) ? [`Start a long-running or background command, such as a dev server or a watcher,` +
        ` with \`${process}\` instead of Bash, so the owner can watch and stop it.`] : []),
    ].join(" "),
  ].join("\n") : undefined
  return {
    description: tier ? `${agent.description.trim()} Research tier ${tier}: up to ${Research.Tiers[tier].providerCalls} turns.`
      : agent.description,
    prompt: [LOOP_TEXT.reduce((text, [from, to]) => text.replaceAll(from, to), agent.prompt.trim()), note]
      .filter(Boolean).join("\n\n") + "\n",
    tools: allowed,
    skills: Seats.find(seat)?.skills.slice(),
    ...(tier ? { maxTurns: Research.Tiers[tier].providerCalls } : {}),
    model: agent.model?.providerID === "anthropic" ? agent.model.modelID : "inherit",
  } satisfies AgentDefinition
}

// JSON strings are valid YAML double-quoted scalars, so no seat text can break the frontmatter.
function markdown(id: string, name: string, definition: Required<Pick<AgentDefinition, "description" | "prompt" | "tools" | "model">> & Pick<AgentDefinition, "maxTurns">) {
  return [
    "---",
    `name: ${name}`,
    `description: ${JSON.stringify(definition.description)}`,
    `tools: ${definition.tools.join(", ")}`,
    `model: ${JSON.stringify(definition.model)}`,
    `skills: ${JSON.stringify(Seats.find(id)?.skills ?? [])}`,
    ...(definition.maxTurns === undefined ? [] : [`maxTurns: ${definition.maxTurns}`]),
    "---",
    "",
    definition.prompt,
  ].join("\n")
}

/**
 * The source of a skill file Claude Code reads from a published plugin (`<ROOT>/<hash>/skills/<name>/...`): the same
 * file in its seat's skill root, or in Maestro's playbooks. The published tree is a byte copy of that source.
 */
export function source(filepath: string) {
  const [hash, kind, name, ...rest] = path.relative(ROOT, filepath).split(path.sep)
  if (!hash || hash === ".." || path.isAbsolute(hash) || kind !== "skills" || !name) return
  const seat = Object.values(Seats.all).find((item) => item.skills.includes(name))
  return path.join(seat ? SeatSkillRoot.roots[seat.id] : Skill.PLAYBOOKS_DIR, name, ...rest)
}

// The seats' entry skills (from the seat skill roots, which compiled builds extract) and Maestro's playbooks.
async function skills(seats: readonly string[], playbooks: string) {
  const sources = [
    ...seats.flatMap((id) => (Seats.find(id)?.skills ?? []).map((name) => ({ name, dir: path.join(SeatSkillRoot.roots[id], name) }))),
    ...(await fs.readdir(playbooks, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return []
      throw error
    }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, dir: path.join(playbooks, entry.name) })),
  ]
  const names = sources.map((source) => source.name)
  const duplicate = names.find((name, index) => names.indexOf(name) !== index)
  if (duplicate) throw new Error(`Two Orchestra skills share the name ${duplicate}`)
  const trees = await Promise.all(sources.map(async (source) =>
    (await tree(source.dir)).map(([file, bytes]) => [`skills/${source.name}/${file}`, bytes] as const)))
  const files = trees.flat()
  const missing = sources.find((source) => !files.some(([file]) => file === `skills/${source.name}/SKILL.md`))
  if (missing) throw new Error(`Skill ${missing.name} has no SKILL.md`)
  return files
}

/** Every file under `dir`, by POSIX path relative to it. Links and other non-files are refused. */
async function tree(dir: string): Promise<(readonly [string, Uint8Array])[]> {
  const visit = async (current: string): Promise<(readonly [string, Uint8Array])[]> => (await Promise.all(
    (await fs.readdir(current, { withFileTypes: true })).map(async (entry) => {
      const target = path.join(current, entry.name)
      if (entry.isDirectory()) return visit(target)
      if (!entry.isFile()) throw new NotRegularFile(`Not a regular file in an Orchestra skill: ${target}`)
      return [[path.relative(dir, target).split(path.sep).join("/"), new Uint8Array(await fs.readFile(target))] as const]
    }),
  )).flat()
  return visit(dir)
}

// Cooperating publishers own the isolated plugin-v2 namespace and publish only complete immutable trees.
// Rename arbitrates their clean-root contention; it cannot protect against external empty-target writers.
// Corrupt targets stay intact for readers that may still hold them. Only this build's staging directory is removed.
async function publish(root: string, files: ReadonlyMap<string, Uint8Array>) {
  const expected = digest([...files])
  const dir = path.join(root, expected.slice(0, 16))
  await fs.mkdir(root, { recursive: true })
  const current = await existing(dir)
  if (current === expected) return dir
  const repaired = await repair(root, dir, expected)
  if (repaired) return repaired
  const temp = await fs.mkdtemp(`${dir}.stage-`)
  try {
    // Await each write so failure cleanup cannot race another write into the staging directory.
    for (const [file, bytes] of files) {
      const target = path.join(temp, ...file.split("/"))
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, bytes)
    }
    if (await existing(temp) !== expected) throw new Error(`Incomplete Orchestra plugin staging directory: ${temp}`)
    // POSIX rename can replace an EMPTY directory. Never attempt it against a known corrupt target.
    if (current === undefined) {
      const error = await fs.rename(temp, dir).then(() => undefined, (error: NodeJS.ErrnoException) => error)
      if (!error) return dir
      // Windows may report a completed competing publication as a permission failure. Only verified reuse
      // justifies success; every other destination state must preserve the original permission failure.
      if (error.code === "EPERM" || error.code === "EACCES") {
        if (await existing(dir).catch(() => { throw error }) === expected) return dir
        throw error
      }
      if (!["EEXIST", "ENOTEMPTY", "ENOTDIR"].includes(error.code ?? "")) throw error
      const winner = await existing(dir)
      if (winner === expected) return dir
      if (winner === undefined) throw error
    }
    const repaired = await repair(root, dir, expected)
    if (repaired) return repaired
    const target = `${dir}.repair-${randomUUID()}`
    await fs.rename(temp, target)
    return target
  } finally {
    await fs.rm(temp, { recursive: true, force: true })
  }
}

async function repair(root: string, dir: string, expected: string) {
  const prefix = `${path.basename(dir)}.repair-`
  for (const entry of (await fs.readdir(root, { withFileTypes: true })).toSorted((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue
    const target = path.join(root, entry.name)
    if (await existing(target) === expected) return target
  }
}

class NotRegularFile extends Error {}

async function existing(dir: string) {
  const stat = await fs.lstat(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (!stat) return undefined
  if (!stat.isDirectory()) return null
  const entries = await tree(dir).catch((error: NodeJS.ErrnoException) => {
    if (error instanceof NotRegularFile || error.code === "ENOENT" || error.code === "ENOTDIR") return null
    throw error
  })
  return entries && digest(entries)
}

function digest(entries: readonly (readonly [string, Uint8Array])[]) {
  const hash = createHash("sha256")
  entries
    .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .forEach(([file, bytes]) => hash.update(`${file}\0${createHash("sha256").update(bytes).digest("hex")}\n`))
  return hash.digest("hex")
}

function encode(text: string) {
  return new TextEncoder().encode(text)
}
