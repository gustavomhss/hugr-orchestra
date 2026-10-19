import { expect, spyOn, test } from "bun:test"
import { Effect, Exit, Option, Scope, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Npm } from "@orchestra/core/npm"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Omni } from "@orchestra/core/omni"
import { Flag } from "@orchestra/core/flag/flag"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { NpmTest } from "../../fake/npm"
import { awaitWithTimeout, testEffect } from "../../lib/effect"
import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"
import { Agent } from "@/agent/agent"
import { ClaudeHostMcp } from "@/claude-code/host/mcp"
import { ClaudeHostPlugin } from "@/claude-code/host/plugin"
import { ClaudeHostProcess } from "@/claude-code/host/process-tool"
import { ResearchSeatTools } from "@/research/seat-tools"
import { Seats } from "@/maestro/seats"
import { TestInstance, tmpdirScoped } from "../../fixture/fixture"
import { expectSpawn } from "../../../../core/test/fixture/omni-expect"

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

async function snapshot(dir: string) {
  return Promise.all((await files(dir)).map(async (file) => [file, await fs.readFile(path.join(dir, file))] as const))
}

const publisher = Effect.fnUntraced(function* (input: ClaudeHostPlugin.Input & { root: string }, prefix: string, pause: boolean) {
  // Seat prompts exceed Windows' command-line limit. Keep the real publisher and watcher in owned scoped files.
  const directory = yield* tmpdirScoped()
  yield* Effect.promise(() => Bun.write(path.join(directory, "input.json"), JSON.stringify({ input, prefix, pause })))
  yield* Effect.promise(() => Bun.write(path.join(directory, "publisher.ts"), `
    import { watch, writeFileSync, writeSync } from "node:fs";
    import path from "node:path";
    import { ClaudeHostPlugin } from ${JSON.stringify(pathToFileURL(path.resolve(import.meta.dir, "../../../src/claude-code/host/plugin.ts")).href)};
    const { input, prefix, pause } = await Bun.file(process.argv[2]).json();
    // Observe the real publisher's mkdir, without replacing any publisher or filesystem API.
    const watcher = watch(input.root, (event, name) => {
      if (!name?.startsWith(prefix + ".stage-")) return;
      watcher.close();
      writeFileSync(path.join(input.root, name, "sentinel"), "incomplete builder");
      writeSync(1, name + "\\n");
      if (pause) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    });
    await ClaudeHostPlugin.build(input);
    throw new Error("publisher accepted the sabotaged staging directory");
  `))
  return ChildProcess.make(process.execPath, ["--tsconfig-override", path.resolve(import.meta.dir, "../../../tsconfig.json"),
    path.join(directory, "publisher.ts"), path.join(directory, "input.json")],
    { cwd: path.resolve(import.meta.dir, "../../.."), stderr: pause ? "ignore" : "pipe" })
})

function boundedOutput<E, R>(stream: Stream.Stream<Uint8Array, E, R>, limit: number) {
  return stream.pipe(Stream.mapAccum(() => 0, (size, bytes) => {
    if (size + bytes.byteLength > limit) throw new Error(`Publisher output exceeded ${limit} bytes`)
    return [size + bytes.byteLength, [bytes]] as const
  }), Stream.decodeText())
}

const spawnPublisher = Effect.fnUntraced(function* (command: ChildProcess.Command) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const scope = yield* Scope.make()
  // Keep this child scope's cleanup interruptible so a stuck exit signal cannot hold the test open.
  yield* Effect.addFinalizer(() => awaitWithTimeout(
    Scope.close(scope, Exit.void).pipe(Effect.interruptible),
    "publisher scope cleanup did not finish", "5 seconds",
  ).pipe(Effect.orDie))
  const before = Omni.snapshot().spawns
  const child = yield* spawner.spawn(command).pipe(Effect.provideService(Scope.Scope, scope))
  if (Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER !== "off") expect(Omni.snapshot().spawns).toBeGreaterThan(before)
  if (Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off") expect(Omni.snapshot().spawns).toBe(before)
  yield* Effect.addFinalizer(() => Effect.gen(function* () {
    if (yield* child.isRunning) yield* awaitWithTimeout(
      child.kill({ killSignal: "SIGKILL" }).pipe(Effect.interruptible),
      "publisher termination did not finish", "5 seconds",
    )
  }).pipe(Effect.orDie))
  return child
})

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
        // The research seat has one agent per tier (J1.4); every other seat has one agent named by its id.
        const agents = ids.flatMap((id) => ClaudeHostPlugin.agents(id).map((agent) => ({ id, name: agent.name })))
        expect(built.seats).toEqual(Object.fromEntries(agents.map((agent) => [`orchestra:${agent.name}`, agent.id])))
        expect(built.sdkAgents).toEqual({})
        const written = await files(built.path)
        expect(written.filter((file) => file.startsWith("agents/"))).toEqual(agents.map((agent) => `agents/${agent.name}.md`).toSorted())
        expect(JSON.parse(await Bun.file(path.join(built.path, ".claude-plugin/plugin.json")).text()).name).toBe(
          "orchestra",
        )
        // No plugin hooks or settings: records are in-process, and nothing disables a built-in.
        expect(written.some((file) => file.startsWith("hooks/") || file === "settings.json")).toBe(false)
        const skills = [
          ...Object.values(Seats.all).flatMap((seat) => seat.skills),
          ...(await fs.readdir(path.resolve(import.meta.dir, "../../../playbooks"))),
        ]
        expect(skills).toContain("jimmy-reference")
        expect(skills).toContain("backend-implement")
        expect(skills).toContain("maestro-governed")
        for (const skill of skills) expect(written).toContain(`skills/${skill}/SKILL.md`)
        // Skill reference files travel with their SKILL.md.
        expect(written.filter((file) => file.startsWith("skills/backend-implement/")).length).toBeGreaterThan(1)

        for (const [seat, agent] of seats.flatMap((seat) => ClaudeHostPlugin.agents(seat.id!).map((agent) => [seat, agent] as const))) {
          const text = await Bun.file(path.join(built.path, `agents/${agent.name}.md`)).text()
          const head = frontmatter(text)
          expect(head.name).toBe(agent.name)
          expect(JSON.parse(head.skills)).toEqual(Seats.find(seat.id)?.skills)
          expect(JSON.parse(head.description)).toStartWith(seat.description!.trim())
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
        const identities = await Promise.all((await files(first.path)).map(async (file) => {
          const stat = await fs.stat(path.join(first.path, file))
          return [file, stat.ino, stat.mtimeMs]
        }))
        await Bun.sleep(20)
        const second = await ClaudeHostPlugin.build({ seats: seats.toReversed(), tools, root: dir })
        expect(second.path).toBe(first.path)
        expect((await fs.stat(agent)).mtimeMs).toBe(before)
        expect(await Promise.all((await files(second.path)).map(async (file) => {
          const stat = await fs.stat(path.join(second.path, file))
          return [file, stat.ino, stat.mtimeMs]
        }))).toEqual(identities)
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
      })
    }),
  60_000,
)

for (const corruption of ["tampered", "empty"]) {
  it.instance(
    `a ${corruption} canonical tree stays intact while a verified immutable repair is published and reused`,
    () => Effect.gen(function* () {
      const f = yield* fixture
      yield* Effect.promise(async () => {
        const input = { seats: f.seats, tools, root: f.root }
        const first = await ClaudeHostPlugin.build(input)
        const expected = await snapshot(first.path)
        const inode = (await fs.stat(first.path)).ino
        if (corruption === "tampered") await fs.writeFile(path.join(first.path, "agents/backend.md"), "tampered")
        if (corruption === "empty") await Promise.all((await fs.readdir(first.path)).map((entry) =>
          fs.rm(path.join(first.path, entry), { recursive: true })))
        const damaged = await snapshot(first.path)
        const foreign = path.join(f.root, `unrelated.repair-${randomUUID()}`)
        const incomplete = `${first.path}.repair-${randomUUID()}`
        const staging = `${first.path}.stage-leftover`
        await fs.cp(first.path, incomplete, { recursive: true })
        await fs.writeFile(path.join(incomplete, "partial"), "unfinished")
        const reference = await ClaudeHostPlugin.build({ ...input, root: path.join(f.root, "reference") })
        await fs.cp(reference.path, foreign, { recursive: true })
        await fs.cp(reference.path, staging, { recursive: true })
        const repaired = await ClaudeHostPlugin.build(input)
        expect(repaired.path).toStartWith(`${first.path}.repair-`)
        expect(repaired.path).not.toBe(incomplete)
        expect(await snapshot(repaired.path)).toEqual(expected)
        expect(await snapshot(first.path)).toEqual(damaged)
        expect((await fs.stat(first.path)).ino).toBe(inode)
        const stat = await fs.stat(repaired.path)
        const reused = await ClaudeHostPlugin.build(input)
        expect(reused.path).toBe(repaired.path)
        expect((await fs.stat(reused.path)).ino).toBe(stat.ino)
        expect((await fs.stat(reused.path)).mtimeMs).toBe(stat.mtimeMs)
        expect(await snapshot(reused.path)).toEqual(expected)
        expect(await snapshot(incomplete)).not.toEqual(expected)
        expect(await snapshot(foreign)).toEqual(expected)
        expect(await snapshot(staging)).toEqual(expected)
      })
    }),
    60_000,
  )
}

for (const killed of [false, true]) {
  it.instance(
    `a ${killed ? "killed" : "live"} incomplete publisher cannot block publication or lose its staging sentinel`,
    () => Effect.gen(function* () {
      const f = yield* fixture
      const reference = yield* Effect.promise(() => ClaudeHostPlugin.build({ seats: f.seats, tools, root: f.root }))
      const root = yield* tmpdirScoped()
      const input = { seats: f.seats, tools, root }
      const prefix = path.basename(reference.path)
      const lock = path.join(root, `${prefix}.lock`)
      yield* Effect.promise(async () => {
        await fs.mkdir(lock)
        await fs.writeFile(path.join(lock, "sentinel"), "old-version owner")
      })
      if (Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER !== "off") expectSpawn(import.meta.path)
      const child = yield* spawnPublisher(yield* publisher(input, prefix, true))
      const ready = yield* awaitWithTimeout(
        boundedOutput(child.stdout, 1024).pipe(Stream.splitLines, Stream.runHead),
        "publisher never reached staging", "20 seconds",
      )
      const staging = path.join(root, Option.getOrThrow(ready))
      const inode = yield* Effect.promise(async () => {
        expect(path.basename(staging)).toStartWith(`${prefix}.stage-`)
        const partial = await files(staging)
        expect((await files(reference.path)).some((file) => !partial.includes(file))).toBe(true)
        return (await fs.stat(staging)).ino
      })
      expect(yield* child.isRunning).toBe(true)
      if (killed) {
        yield* awaitWithTimeout(child.kill({ killSignal: "SIGKILL" }), "publisher did not terminate", "5 seconds")
        expect(yield* child.isRunning).toBe(false)
      }
      yield* Effect.promise(async () => {
        const built = await ClaudeHostPlugin.build(input)
        expect(built.path).toBe(path.join(root, prefix))
        expect(await snapshot(built.path)).toEqual(await snapshot(reference.path))
        expect((await fs.stat(staging)).ino).toBe(inode)
        expect(await Bun.file(path.join(staging, "sentinel")).text()).toBe("incomplete builder")
        expect(await Bun.file(path.join(lock, "sentinel")).text()).toBe("old-version owner")
        expect((await fs.readdir(root)).toSorted()).toEqual([prefix, path.basename(staging), path.basename(lock)].toSorted())
      })
      if (!killed) expect(yield* child.isRunning).toBe(true)
    }),
    60_000,
  )
}

it.instance(
  "an unexpected staging file fails full digest validation before any canonical directory is published",
  () => Effect.gen(function* () {
    const f = yield* fixture
    const reference = yield* Effect.promise(() => ClaudeHostPlugin.build({ seats: f.seats, tools, root: f.root }))
    const root = yield* tmpdirScoped()
    const prefix = path.basename(reference.path)
    if (Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER !== "off") expectSpawn(import.meta.path)
    const child = yield* spawnPublisher(yield* publisher({ seats: f.seats, tools, root }, prefix, false))
    const ready = yield* awaitWithTimeout(
      boundedOutput(child.stdout, 1024).pipe(Stream.splitLines, Stream.runHead),
      "publisher never reached staging", "20 seconds",
    )
    expect(Option.getOrThrow(ready)).toStartWith(`${prefix}.stage-`)
    const stderr = yield* awaitWithTimeout(
      boundedOutput(child.stderr, 64 * 1024).pipe(Stream.runCollect),
      "publisher did not reject staging", "20 seconds",
    )
    expect(yield* awaitWithTimeout(child.exitCode, "publisher did not exit", "5 seconds")).not.toBe(0)
    expect(stderr.join("")).toContain("Incomplete Orchestra plugin staging directory")
    expect(yield* Effect.promise(() => fs.readdir(root))).toEqual([])
  }),
  60_000,
)

it.instance(
  "filesystem errors reject publication instead of masquerading as a verified snapshot",
  () => Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.promise(async () => {
      await fs.writeFile(f.root, "not a cache directory")
      await expect(ClaudeHostPlugin.build({ seats: f.seats, tools, root: f.root })).rejects.toThrow()
      if (process.platform === "win32" || process.getuid?.() === 0) return
      const input = { seats: f.seats, tools, root: `${f.root}-permissions` }
      const built = await ClaudeHostPlugin.build(input)
      await fs.chmod(built.path, 0)
      try {
        await expect(ClaudeHostPlugin.build(input)).rejects.toMatchObject({ code: "EACCES" })
        expect(await fs.readdir(input.root)).toEqual([path.basename(built.path)])
      } finally {
        await fs.chmod(built.path, 0o755)
      }
      const playbooks = path.join(input.root, "playbooks")
      await fs.mkdir(playbooks)
      await fs.chmod(playbooks, 0)
      try {
        await expect(ClaudeHostPlugin.build({ ...input, playbooks })).rejects.toMatchObject({ code: "EACCES" })
      } finally {
        await fs.chmod(playbooks, 0o755)
      }
    })
  }),
  60_000,
)

for (const code of ["EPERM", "EACCES", "EEXIST", "ENOTEMPTY", "ENOTDIR"]) {
  for (const destination of ["complete", "tampered", "missing-file", "extra-file", "empty", "absent", "file"]) {
    it.instance(
      `rename ${code} with a ${destination} destination permits only verified reuse or an ordinary collision repair`,
      () => Effect.gen(function* () {
        const f = yield* fixture
        const reference = yield* Effect.promise(() => ClaudeHostPlugin.build({ seats: f.seats, tools, root: f.root }))
        const root = yield* tmpdirScoped()
        yield* Effect.promise(async () => {
          const target = path.join(root, path.basename(reference.path))
          const repair = `${target}.repair-${randomUUID()}`
          const expected = await snapshot(reference.path)
          const failure = Object.assign(new Error(`controlled rename ${code}`), { code })
          const rename = fs.rename
          const boundary = spyOn(fs, "rename").mockImplementation(async (from, to) => {
            if (to !== target) return rename(from, to)
            expect(await snapshot(String(from))).toEqual(expected)
            // Only rename's result is controlled. Destination inspection and all tree reads/writes are real.
            if (destination === "file") await fs.writeFile(target, "foreign file")
            if (destination === "empty") await fs.mkdir(target)
            if (["complete", "tampered", "missing-file", "extra-file"].includes(destination))
              await fs.cp(reference.path, target, { recursive: true })
            if (destination === "tampered") await fs.writeFile(path.join(target, "agents/backend.md"), "tampered")
            if (destination === "missing-file") await fs.rm(path.join(target, "agents/backend.md"))
            if (destination === "extra-file") await fs.writeFile(path.join(target, "unexpected"), "extra")
            // A repair becoming available at the boundary must not turn a permission failure into success.
            await fs.cp(reference.path, repair, { recursive: true })
            throw failure
          })
          try {
            const result = await ClaudeHostPlugin.build({ seats: f.seats, tools, root }).then(
              (built) => built, (error: unknown) => error,
            )
            expect(boundary).toHaveBeenCalledTimes(1)
            const permission = code === "EPERM" || code === "EACCES"
            if (destination === "complete" || (!permission && destination !== "absent")) {
              expect(result).toMatchObject({ path: destination === "complete" ? target : repair })
              expect(await snapshot(destination === "complete" ? target : repair)).toEqual(expected)
            }
            if (destination === "absent" || (permission && destination !== "complete")) expect(result).toBe(failure)
            expect((await fs.readdir(root)).toSorted()).toEqual([
              ...(destination === "absent" ? [] : [path.basename(target)]), path.basename(repair),
            ].toSorted())
            expect(await snapshot(repair)).toEqual(expected)
            if (destination === "file") expect(await Bun.file(target).text()).toBe("foreign file")
            if (destination === "empty") expect(await fs.readdir(target)).toEqual([])
            if (destination === "tampered") expect(await Bun.file(path.join(target, "agents/backend.md")).text()).toBe("tampered")
            if (destination === "missing-file") expect(await Bun.file(path.join(target, "agents/backend.md")).exists()).toBe(false)
            if (destination === "extra-file") expect(await Bun.file(path.join(target, "unexpected")).text()).toBe("extra")
          } finally {
            boundary.mockRestore()
          }
        })
      }),
      60_000,
    )
  }
}

for (const code of ["EPERM", "EACCES"]) {
  it.instance(
    `rename ${code} preserves the original failure when destination inspection is denied`,
    () => Effect.gen(function* () {
      const f = yield* fixture
      const reference = yield* Effect.promise(() => ClaudeHostPlugin.build({ seats: f.seats, tools, root: f.root }))
      const root = yield* tmpdirScoped()
      yield* Effect.promise(async () => {
        const target = path.join(root, path.basename(reference.path))
        const failure = Object.assign(new Error(`controlled rename ${code}`), { code })
        const inspection = spyOn(fs, "lstat")
        const boundary = spyOn(fs, "rename").mockImplementation(async () => {
          inspection.mockRejectedValueOnce(Object.assign(new Error("inspection denied"), { code: "EACCES" }))
          throw failure
        })
        try {
          await expect(ClaudeHostPlugin.build({ seats: f.seats, tools, root })).rejects.toBe(failure)
          expect(boundary).toHaveBeenCalledTimes(1)
          expect(inspection).toHaveBeenLastCalledWith(target)
          expect(await fs.readdir(root)).toEqual([])
        } finally {
          boundary.mockRestore()
          inspection.mockRestore()
        }
      })
    }),
    60_000,
  )
}

it.instance(
  "tools map to Claude Code built-ins or additive orchestra MCP tools, never to a disabled built-in",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const seats = f.seats
      yield* Effect.promise(async () => {
        const built = await ClaudeHostPlugin.build({ seats, tools, root: f.root })
        for (const seat of seats) {
          const listed = frontmatter(await Bun.file(path.join(built.path, `agents/${ClaudeHostPlugin.agents(seat.id!)[0].name}.md`)).text()).tools.split(
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

test("jimmy gets its descriptor's tools and native search, never WebFetch, LSP or repository intelligence", () => {
  const listed = ClaudeHostPlugin.tools("jimmy", [
    "repo_map",
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
    "Glob",
    "Grep",
    "Read",
    "Skill",
    "WebSearch",
    "mcp__orchestra__context_recall",
    "mcp__orchestra__research_capture",
    "mcp__orchestra__research_record",
    "mcp__orchestra__research_view",
  ])
})

test("jimmy's probe_run is served as an Orchestra MCP tool from its descriptor", () => {
  expect(ResearchSeatTools.OWN).toContain("probe_run")
  expect(ClaudeHostPlugin.tools("jimmy", [...ResearchSeatTools.OWN])).toContain("mcp__orchestra__probe_run")
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
  "concurrent clean-root builders converge on one complete canonical inode without rewriting it",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const reference = yield* Effect.promise(() => ClaudeHostPlugin.build({ seats: f.seats, tools, root: f.root }))
      const root = yield* tmpdirScoped()
      const target = path.join(root, path.basename(reference.path))
      yield* Effect.promise(async () => {
        const expected = await snapshot(reference.path)
        const results = await Promise.allSettled(Array.from({ length: 8 }, async () => {
          const result = await ClaudeHostPlugin.build({ seats: f.seats, tools, root })
          const stat = await fs.stat(result.path)
          expect(result.path).toBe(target)
          expect(await snapshot(result.path)).toEqual(expected)
          return stat
        }))
        const stats = results.map((result) => {
          if (result.status === "rejected") throw result.reason
          return result.value
        })
        expect(new Set(stats.map((stat) => stat.ino)).size).toBe(1)
        expect(await fs.readdir(root)).toEqual([path.basename(target)])
        const reused = await ClaudeHostPlugin.build({ seats: f.seats, tools, root })
        expect(reused.path).toBe(target)
        expect((await fs.stat(target)).ino).toBe(stats[0].ino)
        expect((await fs.stat(target)).mtimeMs).toBe(stats[0].mtimeMs)
        expect(await snapshot(target)).toEqual(expected)
      })
    }),
  60_000,
)
