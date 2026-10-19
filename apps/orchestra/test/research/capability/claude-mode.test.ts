import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Effect, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { ClaudeHostMcp } from "@/claude-code/host/mcp"
import { ClaudeHostPlugin } from "@/claude-code/host/plugin"
import { ClaudeHostResearch } from "@/claude-code/host/research"
import { ResearchExecution } from "@/research/allowance"
import { ResearchSeatTools } from "@orchestra/core/research/seat-tools"
import { PartID, type SessionID } from "@/session/schema"
import { ClaudeResearchFixture } from "../../claude-code/host/jimmy-fixture"

describe("JE-AC-E1: the generated jimmy agent lists exactly the seat's tools", () => {
  // Mutation control: drop the descriptor filter in ClaudeHostPlugin.tools (`!research || scope.includes(id)`).
  test("Read, Grep, Glob, WebSearch, Skill and the descriptor's MCP tools; never WebFetch, LSP, Bash or an edit tool", () => {
    const registry = [...ResearchSeatTools.OWN, ...ResearchSeatTools.LOOP, "webfetch", "lsp", "bash", "edit", "write", "task", "repo_map"]
    const listed = ClaudeHostPlugin.tools("jimmy", registry)
    expect(listed).toEqual(expect.arrayContaining(["Read", "Grep", "Glob", "WebSearch", "Skill"]))
    for (const id of ResearchSeatTools.OWN)
      expect([id, listed.includes(`mcp__${ClaudeHostMcp.NAME}__${id}`)]).toEqual([id, true])
    expect(listed.filter((name) => /^(WebFetch|LSP|Bash|Edit|Write|Task|Agent)$/.test(name) || /repo_map|lsp|webfetch|process/.test(name))).toEqual([])
    expect(listed.filter((name) => !name.startsWith("mcp__") && !(ResearchSeatTools.CLAUDE as readonly string[]).includes(name))).toEqual([])
  })

  ClaudeResearchFixture.it.instance("the files the plugin writes for the three tiers carry that tool list and no WebFetch", () => Effect.gen(function* () {
    const fixture = yield* ClaudeResearchFixture.setup()
    const registry = [...ResearchSeatTools.OWN, ...ResearchSeatTools.LOOP, "webfetch", "lsp"]
    const plugin = yield* Effect.promise(() => ClaudeHostPlugin.build({ seats: [fixture.seat], tools: { jimmy: registry },
      root: path.join(fixture.parent.directory, "plugin") }))
    for (const tier of Research.Depth.literals) {
      const text = yield* Effect.promise(() => Bun.file(path.join(plugin.path, `agents/jimmy-${tier}.md`)).text())
      const line = text.split("\n").find((entry) => entry.startsWith("tools: "))
      expect(line?.slice("tools: ".length).split(", ").toSorted()).toEqual(ClaudeHostPlugin.tools("jimmy", registry))
      expect(text).not.toMatch(/WebFetch|LSP/)
    }
  }), 30_000)
})

const rows = Effect.fn("CapabilityClaude.rows")(function* (sessionID: string, type: string) {
  const database = yield* Database.Service
  const all = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, sessionID)).all().pipe(Effect.orDie)
  return all.filter((row) => row.type === EventV2.versionedType(type, 1)).map((row) => row.data)
})
const admissions = (sessionID: string) => rows(sessionID, ResearchEvent.SourceAdmitted.type).pipe(
  Effect.map((data) => data.map((row) => Schema.decodeUnknownSync(ResearchEvent.SourceAdmitted.data)(row).receipt)))

describe("JE-AC-E5: native reads are retained through PostToolUse", () => {
  // The Read `tool_response` is the shape recorded from a real SDK 0.3.289 session (jimmy-capture.test.ts).
  const read = (dir: string) => ({ type: "text", file: { filePath: path.join(dir, "sample.txt"),
    content: "beta needle\ngamma\ndelta needle", numLines: 3, startLine: 2, totalLines: 6 } })

  // Mutation control: start the retained Read lines at 1 instead of `startLine` in ClaudeHostResearch.retained.
  ClaudeResearchFixture.it.instance("Read becomes a file source whose lines are the original ones", () => Effect.gen(function* () {
    const fixture = yield* ClaudeResearchFixture.setup()
    const dispatch = yield* fixture.nativeDispatch()
    yield* Effect.promise(() => Bun.write(path.join(fixture.parent.directory, "sample.txt"), "alpha\nbeta needle\ngamma\ndelta needle\nepsilon\nzeta\n"))
    const part = yield* fixture.sessions.updatePart({ id: PartID.ascending(), sessionID: dispatch.child, messageID: dispatch.message.id,
      callID: "read-1", type: "tool", tool: "read", state: { status: "running", input: {}, time: { start: Date.now() } } })
    if (part.type === "tool") fixture.mirrored.set("read-1", part)
    expect(yield* fixture.fire({ ...ClaudeResearchFixture.base, agent_id: dispatch.taskID, hook_event_name: "PostToolUse",
      tool_name: "Read", tool_use_id: "read-1", tool_input: {}, tool_response: read(fixture.parent.directory) })).toEqual({})
    const [admitted] = yield* admissions(dispatch.child)
    expect(admitted.origin).toEqual({ kind: "file", uri: path.join(fixture.parent.directory, "sample.txt") })
    expect(admitted.observed).toMatchObject({ lineStart: 2, lineEnd: 4 })
  }), 30_000)

  // The named control: with no capture port, the output is withheld rather than passed through unretained.
  ClaudeResearchFixture.it.instance("without a capture port the Read output is withheld", () => Effect.gen(function* () {
    const fixture = yield* ClaudeResearchFixture.setup({ capture: false })
    const dispatch = yield* fixture.nativeDispatch()
    expect(yield* fixture.fire({ ...ClaudeResearchFixture.base, agent_id: dispatch.taskID, hook_event_name: "PostToolUse",
      tool_name: "Read", tool_use_id: "read-uncaptured", tool_input: {}, tool_response: read(fixture.parent.directory) }))
      .toMatchObject({ hookSpecificOutput: { updatedToolOutput: expect.stringContaining("provenance capture is not available") } })
  }), 30_000)
})

describe("JE-AC-E6, W2, W3: tier and web domains travel with the dispatch", () => {
  const allowance = (fixture: { research: ClaudeHostResearch.Runtime }, child: SessionID) =>
    fixture.research.execute(child, Effect.map(ResearchExecution.Current, (frame) => frame?.allowance))

  // Mutation control (E6): read the tier from the brief's `effort:` line instead of the plugin agent name.
  ClaudeResearchFixture.it.instance("orchestra:jimmy-focused binds the focused tier to the tool_use_id; an effort line in the brief changes nothing", () => Effect.gen(function* () {
    const fixture = yield* ClaudeResearchFixture.setup()
    const focused = yield* fixture.nativeDispatch("toolu_focused", "focused")
    expect(yield* allowance(fixture, focused.child)).toMatchObject({ tier: "focused", dispatchCallID: "toolu_focused",
      providerLimit: 48, deadlineSeconds: Research.Tiers.focused.deadlineSeconds })
    const brief = yield* fixture.nativeDispatch("toolu_brief", "quick", "effort: deep\nFind the conditions.")
    expect(yield* allowance(fixture, brief.child)).toMatchObject({ tier: "quick", providerLimit: 24 })
    const files = yield* Effect.promise(() => ClaudeHostPlugin.build({ seats: [fixture.seat], tools: { jimmy: ["read"] },
      root: path.join(fixture.parent.directory, "plugin"), sdk: { jimmy: {} } }))
    expect(files.sdkAgents["orchestra:jimmy-focused"].maxTurns).toBe(48)
  }), 30_000)

  // Mutation control (W2): stop pinning the granted domains in the WebSearch PreToolUse handler.
  ClaudeResearchFixture.it.instance("a task grant's domains are pinned onto that dispatch's WebSearch, replacing the model's", () => Effect.gen(function* () {
    const fixture = yield* ClaudeResearchFixture.setup()
    const grantID = "grt_capability"
    ClaudeHostMcp.grants(fixture.parent.id).set(grantID, { grantID, sessionID: fixture.parent.id, seat: "jimmy", writePaths: [],
      writeRoots: [], purpose: "Docs only", allowedDomains: ["bun.sh"], time: Date.now() })
    const granted = yield* fixture.nativeDispatch("toolu_granted", "quick", `Find the docs.\ngrantID: ${grantID}`)
    expect(ClaudeHostMcp.grants(fixture.parent.id).has(grantID)).toBe(false)
    expect(yield* granted.pre("WebSearch", "search-1", { query: "bun runtime", allowed_domains: ["example.com"] }))
      .toMatchObject({ hookSpecificOutput: { permissionDecision: "allow", updatedInput: { query: "bun runtime", allowed_domains: ["bun.sh"] } } })
    // The next dispatch has no grant: its search is left as the model wrote it.
    const open = yield* fixture.nativeDispatch("toolu_open")
    expect(yield* open.pre("WebSearch", "search-2", { query: "bun runtime" })).not.toHaveProperty("hookSpecificOutput.updatedInput.allowed_domains")
  }), 30_000)
})
