import { afterEach, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import type { Agent } from "@/agent/agent"
import { ClaudeHostMcp } from "@/claude-code/host/mcp"
import { ClaudeHostPlugin } from "@/claude-code/host/plugin"
import { ClaudeHostProcess } from "@/claude-code/host/process-tool"
import { renderPrompt, roster } from "@/maestro/roster"
import { Seats } from "@/maestro/seats"
import { tmpdir } from "../../fixture/fixture"

// The registry, as Agent.Service resolves the native seats: label-rendered prompt and the seat description.
const seats: Agent.Info[] = roster.filter((member) => member.nativeProfile && member.prompt).map((member) => ({
  id: member.memberId, name: member.displayName, native: true, mode: "subagent", options: {}, permission: [],
  description: Seats.find(member.memberId)?.description, prompt: renderPrompt(member, member.displayName),
}))

// What ClaudeHostMcp.prepare reports per seat: each profile's tools, the per-seat grants, and `process` with the shell.
const tools = Object.fromEntries(Object.values(Seats.all).map((seat) => [seat.id, [
  "invalid", "read", "glob", "grep",
  ...(seat.profile === "execution" ? ["bash", "edit", "write", "apply_patch", ClaudeHostProcess.ID] : []),
  ...(seat.skills.length ? ["skill"] : []),
  ...(seat.atlasMemory ? ["atlas_memory_recall", "atlas_memory_emit"] : []),
  ...(seat.id === "lucy" ? ["maestro_record_review"] : []),
  ...(seat.id === "archie" ? ["maestro_arsenal_catalog", "maestro_arsenal_describe", "maestro_arsenal_execute"] : []),
]]))

// Claude Code's built-in tool names (sdk-tools.d.ts) a seat allow-list may name.
const KNOWN = ["Agent", "AskUserQuestion", "Bash", "Edit", "Glob", "Grep", "LSP", "Read", "Skill", "TodoWrite", "WebFetch", "WebSearch", "Write"]

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

async function root() {
  const dir = (await tmpdir()).path
  roots.push(dir)
  return dir
}

function frontmatter(text: string) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (!match) throw new Error("no frontmatter")
  return Object.fromEntries(match[1].split("\n").map((line) => {
    const index = line.indexOf(": ")
    return [line.slice(0, index), line.slice(index + 2)]
  }))
}

async function files(dir: string): Promise<string[]> {
  return (await fs.readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .toSorted()
}

test("the plugin covers every native seat, with one orchestra:<seat> name each, and every seat and playbook skill", async () => {
  const built = await ClaudeHostPlugin.build({ seats, tools, root: await root() })
  const ids = Object.keys(Seats.all).toSorted()
  expect(ids.length).toBeGreaterThanOrEqual(8)
  expect(built.seats).toEqual(Object.fromEntries(ids.map((id) => [`orchestra:${id}`, id])))
  expect(built.sdkAgents).toEqual({})
  const written = await files(built.path)
  expect(written.filter((file) => file.startsWith("agents/"))).toEqual(ids.map((id) => `agents/${id}.md`))
  expect(JSON.parse(await Bun.file(path.join(built.path, ".claude-plugin/plugin.json")).text()).name).toBe("orchestra")
  // No plugin hooks or settings: records are in-process, and nothing disables a built-in.
  expect(written.some((file) => file.startsWith("hooks/") || file === "settings.json")).toBe(false)
  const skills = [...Object.values(Seats.all).flatMap((seat) => seat.skills), ...(await fs.readdir(path.resolve(import.meta.dir, "../../../playbooks")))]
  expect(skills).toContain("backend-implement")
  expect(skills).toContain("maestro-governed")
  for (const skill of skills) expect(written).toContain(`skills/${skill}/SKILL.md`)
  // Skill reference files travel with their SKILL.md.
  expect(written.filter((file) => file.startsWith("skills/backend-implement/")).length).toBeGreaterThan(1)

  for (const seat of seats) {
    const text = await Bun.file(path.join(built.path, `agents/${seat.id}.md`)).text()
    const head = frontmatter(text)
    expect(head.name).toBe(seat.id!)
    expect(JSON.parse(head.description)).toBe(seat.description!)
    expect(JSON.parse(head.model)).toBe("inherit")
    expect(head.disallowedTools).toBeUndefined()
    expect(text).toContain(seat.prompt!.split("\n")[0])
    expect(text).not.toContain("{{label}}")
  }
})

test("generation is deterministic and writes only when the content changes", async () => {
  const dir = await root()
  const first = await ClaudeHostPlugin.build({ seats, tools, root: dir })
  const agent = path.join(first.path, "agents/backend.md")
  const before = (await fs.stat(agent)).mtimeMs
  await Bun.sleep(20)
  const second = await ClaudeHostPlugin.build({ seats: seats.toReversed(), tools, root: dir })
  expect(second.path).toBe(first.path)
  expect((await fs.stat(agent)).mtimeMs).toBe(before)
  expect(await fs.readdir(dir)).toEqual([path.basename(first.path)])

  // Another root gets the same bytes under the same name.
  const elsewhere = await ClaudeHostPlugin.build({ seats, tools, root: await root() })
  expect(path.basename(elsewhere.path)).toBe(path.basename(first.path))
  expect(await files(elsewhere.path)).toEqual(await files(first.path))

  // A changed seat is a new directory; the earlier one stays for sessions still reading it.
  const changed = await ClaudeHostPlugin.build({ root: dir, tools,
    seats: seats.map((seat) => seat.id === "lucy" ? { ...seat, model: { providerID: "anthropic", modelID: "claude-fable-5" } as Agent.Info["model"] } : seat) })
  expect(changed.path).not.toBe(first.path)
  expect(JSON.parse(frontmatter(await Bun.file(path.join(changed.path, "agents/lucy.md")).text()).model)).toBe("claude-fable-5")
  expect((await fs.readdir(dir)).toSorted()).toEqual([path.basename(first.path), path.basename(changed.path)].toSorted())

  // A tampered directory is replaced whole.
  await fs.writeFile(agent, "tampered")
  const repaired = await ClaudeHostPlugin.build({ seats, tools, root: dir })
  expect(repaired.path).toBe(first.path)
  expect(await Bun.file(agent).text()).toStartWith("---\nname: backend\n")
})

test("tools map to Claude Code built-ins or additive orchestra MCP tools, never to a disabled built-in", async () => {
  const built = await ClaudeHostPlugin.build({ seats, tools, root: await root() })
  for (const seat of seats) {
    const listed = frontmatter(await Bun.file(path.join(built.path, `agents/${seat.id}.md`)).text()).tools.split(", ")
    expect(listed).toEqual(ClaudeHostPlugin.tools(seat.id!, tools[seat.id!]))
    for (const name of listed) {
      if (name.startsWith("mcp__orchestra__")) expect(ClaudeHostMcp.servable(name.slice("mcp__orchestra__".length))).toBe(true)
      if (!name.startsWith("mcp__orchestra__")) expect(KNOWN).toContain(name)
    }
    // Loop-only tools never reach a seat.
    expect(listed.some((name) => /invalid|context_compact/.test(name))).toBe(false)
  }
  expect(ClaudeHostPlugin.tools("backend", tools.backend)).toEqual(["Bash", "Edit", "Glob", "Grep", "Read", "Skill", "Write",
    "mcp__orchestra__atlas_memory_emit", "mcp__orchestra__atlas_memory_recall", "mcp__orchestra__process"])
  expect(ClaudeHostPlugin.tools("lucy", tools.lucy)).toEqual(["Glob", "Grep", "Read", "mcp__orchestra__maestro_record_review"])
  const backend = await Bun.file(path.join(built.path, "agents/backend.md")).text()
  expect(backend).toContain("`mcp__orchestra__process` instead of Bash")
  expect(await Bun.file(path.join(built.path, "agents/lucy.md")).text()).not.toContain("mcp__orchestra__process")
})

test("jimmy reads sources only through the research capture tools", () => {
  const listed = ClaudeHostPlugin.tools("jimmy", ["read", "grep", "glob", "lsp", "webfetch", "websearch", "context_recall"])
  expect(listed).toEqual(["mcp__orchestra__context_recall", "mcp__orchestra__research_capture",
    "mcp__orchestra__research_record", "mcp__orchestra__research_view"])
  expect(ClaudeHostPlugin.CAPTURE.jimmy).toContain("research_capture")
})

test("seat prompts change only where they describe Orchestra's loop", async () => {
  // Each rewrite still matches a real seat prompt, so the table never goes stale.
  for (const [from] of ClaudeHostPlugin.LOOP_TEXT) expect(seats.some((seat) => seat.prompt!.includes(from))).toBe(true)
  const built = await ClaudeHostPlugin.build({ seats, tools, root: await root() })
  const archie = await Bun.file(path.join(built.path, "agents/archie.md")).text()
  const source = seats.find((seat) => seat.id === "archie")!.prompt!
  expect(archie).toContain("the Agent delegation tool")
  expect(archie).not.toContain("the task delegation tool")
  expect(archie).toContain(source.replaceAll("the task delegation tool", "the Agent delegation tool").trim())
})

test("a seat needing permissionMode or its own MCP server goes through the SDK agents option", async () => {
  const built = await ClaudeHostPlugin.build({ seats, tools, root: await root(), sdk: { rosie: { permissionMode: "dontAsk" } } })
  expect(built.seats["orchestra:rosie"]).toBe("rosie")
  expect(await Bun.file(path.join(built.path, "agents/rosie.md")).exists()).toBe(false)
  const rosie = built.sdkAgents["orchestra:rosie"]
  expect(rosie.permissionMode).toBe("dontAsk")
  expect(rosie.tools).toEqual(ClaudeHostPlugin.tools("rosie", tools.rosie))
  expect(rosie.prompt).toContain(seats.find((seat) => seat.id === "rosie")!.prompt!.split("\n")[0])
})

test("a seat with no tool Claude Code can run fails instead of inheriting every tool", async () => {
  await expect(ClaudeHostPlugin.build({ seats, tools: { ...tools, billy: ["invalid", "context_compact"] }, root: await root() }))
    .rejects.toThrow("Seat billy has no tools")
})
