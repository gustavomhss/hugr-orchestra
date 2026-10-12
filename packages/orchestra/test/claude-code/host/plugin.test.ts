import { expect, test } from "bun:test"
import { Effect } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Npm } from "@orchestra/core/npm"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { NpmTest } from "../../fake/npm"
import { testEffect } from "../../lib/effect"
import fs from "node:fs/promises"
import path from "node:path"
import { Agent } from "@/agent/agent"
import { ClaudeHostMcp } from "@/claude-code/host/mcp"
import { ClaudeHostPlugin } from "@/claude-code/host/plugin"
import { ClaudeHostProcess } from "@/claude-code/host/process-tool"
import { Seats } from "@/maestro/seats"
import { TestInstance, tmpdirScoped } from "../../fixture/fixture"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Agent.node, RuntimeFlags.node, CrossSpawnSpawner.node]), [
    [Npm.node, NpmTest.noop],
    [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
  ]),
)

// Resolve the real native seats within a TestInstance, including their configured labels, descriptions and prompts.
const fixture = Effect.gen(function* () {
  const instance = yield* TestInstance
  const agents = yield* Agent.Service
  return {
    root: path.join(instance.directory, "plugin"),
    seats: (yield* agents.list()).filter((agent) => agent.native === true && Seats.find(agent.id)),
  }
})

// What ClaudeHostMcp.prepare reports per seat: each profile's tools, the per-seat grants, and `process` with the shell.
const tools = Object.fromEntries(
  Object.values(Seats.all).map((seat) => [
    seat.id,
    [
      "invalid",
      "read",
      "glob",
      "grep",
      ...(seat.profile === "execution" ? ["bash", "edit", "write", "apply_patch", ClaudeHostProcess.ID] : []),
      ...(seat.skills.length ? ["skill"] : []),
      ...(seat.workResult === "discovery-work-result-v1" ? ["research_capture", "research_view", "research_record", "atlas_context"] : []),
      ...(seat.atlasMemory ? ["atlas_memory_recall", "atlas_memory_emit"] : []),
      ...(seat.id === "lucy" ? ["maestro_record_review"] : []),
      ...(seat.id === "archie"
        ? ["maestro_arsenal_catalog", "maestro_arsenal_describe", "maestro_arsenal_execute"]
        : []),
    ],
  ]),
)

// Claude Code's built-in tool names (sdk-tools.d.ts) a seat allow-list may name.
const KNOWN = [
  "Agent",
  "AskUserQuestion",
  "Bash",
  "Edit",
  "Glob",
  "Grep",
  "LSP",
  "Read",
  "Skill",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
  "Write",
]

function frontmatter(text: string) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (!match) throw new Error("no frontmatter")
  return Object.fromEntries(
    match[1].split("\n").map((line) => {
      const index = line.indexOf(": ")
      return [line.slice(0, index), line.slice(index + 2)]
    }),
  )
}

async function files(dir: string): Promise<string[]> {
  return (await fs.readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .toSorted()
}

it.instance(
  "the plugin covers every native seat, with one orchestra:<seat> name each, and every seat and playbook skill",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const seats = f.seats
      yield* Effect.promise(async () => {
        const built = await ClaudeHostPlugin.build({ seats, tools, root: f.root })
        const ids = Object.keys(Seats.all).toSorted()
        expect(ids.length).toBeGreaterThanOrEqual(8)
        expect(built.seats).toEqual(Object.fromEntries(ids.map((id) => [`orchestra:${id}`, id])))
        expect(built.sdkAgents).toEqual({})
        const written = await files(built.path)
        expect(written.filter((file) => file.startsWith("agents/"))).toEqual(ids.map((id) => `agents/${id}.md`))
        expect(JSON.parse(await Bun.file(path.join(built.path, ".claude-plugin/plugin.json")).text()).name).toBe(
          "orchestra",
        )
        // No plugin hooks or settings: records are in-process, and nothing disables a built-in.
        expect(written.some((file) => file.startsWith("hooks/") || file === "settings.json")).toBe(false)
        const skills = [
          ...Object.values(Seats.all).flatMap((seat) => seat.skills),
          ...(await fs.readdir(path.resolve(import.meta.dir, "../../../playbooks"))),
        ]
        expect(skills).toContain("jimmy-research")
        expect(skills).toContain("jimmy-discovery")
        expect(skills).toContain("backend-implement")
        expect(skills).toContain("maestro-governed")
        for (const skill of skills) expect(written).toContain(`skills/${skill}/SKILL.md`)
        // Skill reference files travel with their SKILL.md.
        expect(written.filter((file) => file.startsWith("skills/backend-implement/")).length).toBeGreaterThan(1)

        for (const seat of seats) {
          const text = await Bun.file(path.join(built.path, `agents/${seat.id}.md`)).text()
          const head = frontmatter(text)
          expect(head.name).toBe(seat.id!)
          expect(JSON.parse(head.skills)).toEqual(Seats.find(seat.id)?.skills)
          expect(JSON.parse(head.description)).toBe(seat.description!)
          expect(JSON.parse(head.model)).toBe("inherit")
          expect(head.disallowedTools).toBeUndefined()
          expect(text).toContain(seat.prompt!.split("\n")[0])
          expect(text).not.toContain("{{label}}")
        }
      })
    }),
  60_000,
)

it.instance(
  "generation is deterministic and writes only when the content changes",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const seats = f.seats
      const other = yield* tmpdirScoped()
      yield* Effect.promise(async () => {
        const dir = f.root
        const first = await ClaudeHostPlugin.build({ seats, tools, root: dir })
        const agent = path.join(first.path, "agents/backend.md")
        const before = (await fs.stat(agent)).mtimeMs
        await Bun.sleep(20)
        const second = await ClaudeHostPlugin.build({ seats: seats.toReversed(), tools, root: dir })
        expect(second.path).toBe(first.path)
        expect((await fs.stat(agent)).mtimeMs).toBe(before)
        expect(await fs.readdir(dir)).toEqual([path.basename(first.path)])

        // Another root gets the same bytes under the same name.
        const elsewhere = await ClaudeHostPlugin.build({ seats, tools, root: other })
        expect(path.basename(elsewhere.path)).toBe(path.basename(first.path))
        expect(await files(elsewhere.path)).toEqual(await files(first.path))

        // A changed seat is a new directory; the earlier one stays for sessions still reading it.
        const changed = await ClaudeHostPlugin.build({
          root: dir,
          tools,
          seats: seats.map((seat) =>
            seat.id === "lucy"
              ? {
                  ...seat,
                  model: { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-fable-5") },
                }
              : seat,
          ),
        })
        expect(changed.path).not.toBe(first.path)
        expect(JSON.parse(frontmatter(await Bun.file(path.join(changed.path, "agents/lucy.md")).text()).model)).toBe(
          "claude-fable-5",
        )
        expect((await fs.readdir(dir)).toSorted()).toEqual(
          [path.basename(first.path), path.basename(changed.path)].toSorted(),
        )

        // A tampered directory is replaced whole.
        await fs.writeFile(agent, "tampered")
        const repaired = await ClaudeHostPlugin.build({ seats, tools, root: dir })
        expect(repaired.path).toBe(first.path)
        expect(await Bun.file(agent).text()).toStartWith("---\nname: backend\n")
      })
    }),
  60_000,
)

it.instance(
  "tools map to Claude Code built-ins or additive orchestra MCP tools, never to a disabled built-in",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const seats = f.seats
      yield* Effect.promise(async () => {
        const built = await ClaudeHostPlugin.build({ seats, tools, root: f.root })
        for (const seat of seats) {
          const listed = frontmatter(await Bun.file(path.join(built.path, `agents/${seat.id}.md`)).text()).tools.split(
            ", ",
          )
          expect(listed).toEqual(ClaudeHostPlugin.tools(seat.id!, tools[seat.id!]))
          for (const name of listed) {
            if (name.startsWith("mcp__orchestra__"))
              expect(ClaudeHostMcp.servable(name.slice("mcp__orchestra__".length))).toBe(true)
            if (!name.startsWith("mcp__orchestra__")) expect(KNOWN).toContain(name)
          }
          // Loop-only tools never reach a seat.
          expect(listed.some((name) => /invalid|context_compact/.test(name))).toBe(false)
        }
        expect(ClaudeHostPlugin.tools("backend", tools.backend)).toEqual([
          "Bash",
          "Edit",
          "Glob",
          "Grep",
          "Read",
          "Skill",
          "Write",
          "mcp__orchestra__atlas_memory_emit",
          "mcp__orchestra__atlas_memory_recall",
          "mcp__orchestra__process",
        ])
        expect(ClaudeHostPlugin.tools("lucy", tools.lucy)).toEqual([
          "Glob",
          "Grep",
          "Read",
          "mcp__orchestra__maestro_record_review",
        ])
        const backend = await Bun.file(path.join(built.path, "agents/backend.md")).text()
        expect(backend).toContain("`mcp__orchestra__process` instead of Bash")
        expect(await Bun.file(path.join(built.path, "agents/lucy.md")).text()).not.toContain("mcp__orchestra__process")
      })
    }),
  60_000,
)

test("jimmy reads sources only through the research capture tools", () => {
  const listed = ClaudeHostPlugin.tools("jimmy", [
    "read",
    "grep",
    "glob",
    "lsp",
    "webfetch",
    "websearch",
    "context_recall",
    "research_capture", "research_record", "research_view", "skill",
  ])
  expect(listed).toEqual([
    "Skill",
    "mcp__orchestra__research_capture",
    "mcp__orchestra__research_record",
    "mcp__orchestra__research_view",
  ])
  expect(ClaudeHostPlugin.CAPTURE.jimmy).toContain("research_capture")
})

it.instance(
  "seat prompts change only where they describe Orchestra's loop",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const seats = f.seats
      yield* Effect.promise(async () => {
        // Each rewrite still matches a real seat prompt, so the table never goes stale.
        for (const [from] of ClaudeHostPlugin.LOOP_TEXT)
          expect(seats.some((seat) => seat.prompt!.includes(from))).toBe(true)
        const built = await ClaudeHostPlugin.build({ seats, tools, root: f.root })
        const archie = await Bun.file(path.join(built.path, "agents/archie.md")).text()
        const source = seats.find((seat) => seat.id === "archie")!.prompt!
        expect(archie).toContain("the Agent delegation tool")
        expect(archie).not.toContain("the task delegation tool")
        expect(archie).toContain(source.replaceAll("the task delegation tool", "the Agent delegation tool").trim())
      })
    }),
  60_000,
)

it.instance(
  "a seat needing permissionMode or its own MCP server goes through the SDK agents option",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const seats = f.seats
      yield* Effect.promise(async () => {
        const built = await ClaudeHostPlugin.build({
          seats,
          tools,
          root: f.root,
          sdk: { rosie: { permissionMode: "dontAsk" } },
        })
        expect(built.seats["orchestra:rosie"]).toBe("rosie")
        expect(await Bun.file(path.join(built.path, "agents/rosie.md")).exists()).toBe(false)
        const rosie = built.sdkAgents["orchestra:rosie"]
        expect(rosie.permissionMode).toBe("dontAsk")
        expect(rosie.tools).toEqual(ClaudeHostPlugin.tools("rosie", tools.rosie))
        expect(rosie.prompt).toContain(seats.find((seat) => seat.id === "rosie")!.prompt!.split("\n")[0])
      })
    }),
  60_000,
)

it.instance(
  "a seat with no tool Claude Code can run fails instead of inheriting every tool",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const seats = f.seats
      yield* Effect.promise(async () => {
        await expect(
          ClaudeHostPlugin.build({ seats, tools: { ...tools, billy: ["invalid", "context_compact"] }, root: f.root }),
        ).rejects.toThrow("Seat billy has no tools")
      })
    }),
  60_000,
)

it.instance(
  "concurrent builders wait for publication and both return the same complete, stable directory",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const reference = yield* Effect.promise(() => ClaudeHostPlugin.build({ seats: f.seats, tools, root: f.root }))
      const root = yield* tmpdirScoped()
      const target = path.join(root, path.basename(reference.path))
      const lock = `${target}.lock`
      yield* Effect.promise(() => fs.mkdir(lock))
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(lock, { recursive: true, force: true })))
      yield* Effect.promise(async () => {
        const published: { path: string; inode: number }[] = []
        const referenceFiles = await files(reference.path)
        const build = async () => {
          const result = await ClaudeHostPlugin.build({ seats: f.seats, tools, root })
          const inode = (await fs.stat(result.path)).ino
          expect(await files(result.path)).toEqual(referenceFiles)
          await Promise.all(
            referenceFiles.map(async (file) => {
              expect(await Bun.file(path.join(result.path, file)).bytes()).toEqual(
                await Bun.file(path.join(reference.path, file)).bytes(),
              )
            }),
          )
          published.push({ path: result.path, inode })
          return result
        }
        // Attach rejection handlers immediately and drain both builders even if a contention assertion fails.
        const builds = Promise.allSettled([build(), build()])
        try {
          await Bun.sleep(150)
          expect(published).toEqual([])
          expect(await fs.readdir(root)).toEqual([path.basename(lock)])
          // Publish identical content while holding the lock, recording identity BEFORE the waiters can acquire it.
          // Both waiters must recheck and reuse this tree instead of replacing it.
          await fs.cp(reference.path, target, { recursive: true })
          const inode = (await fs.stat(target)).ino
          await fs.rmdir(lock)
          const results = await builds
          results.forEach((result) => {
            if (result.status === "rejected") throw result.reason
            expect(result.value.path).toBe(target)
          })
          expect(published.map((item) => item.inode)).toEqual([inode, inode])
          expect((await fs.stat(target)).ino).toBe(inode)
          expect(await fs.readdir(root)).toEqual([path.basename(target)])
        } finally {
          await fs.rm(lock, { recursive: true, force: true })
          await builds
        }
      })
    }),
  60_000,
)
