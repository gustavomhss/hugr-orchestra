import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { PermissionV1 } from "@orchestra/core/v1/permission"
import { ClaudeHostGate } from "@/claude-code/host/gate"
import { asks } from "@/claude-code/permissions"
import { Permission } from "@/permission"
import { MessageID, SessionID } from "@/session/schema"
import type { Tool } from "@/tool/tool"

// The gate's allow/deny matrix with the real ToolSafety and Orchestra's real permission evaluation. Only the lookup of
// an actor's profile and ruleset is fixed here: each actor gets the write roots its grant would bind.

const state: { root: string } = { root: "" }
const main = { sessionID: SessionID.descending(), seat: "maestro" } satisfies ClaudeHostGate.Actor
const archie = { sessionID: SessionID.descending(), seat: "archie", agentID: "agent-archie" } satisfies ClaudeHostGate.Actor
const backend = { sessionID: SessionID.descending(), seat: "backend", agentID: "agent-backend" } satisfies ClaudeHostGate.Actor

beforeAll(async () => {
  state.root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "claude-host-gate-")))
  await fs.mkdir(path.join(state.root, "docs"), { recursive: true })
  await fs.mkdir(path.join(state.root, "src"), { recursive: true })
})

afterAll(async () => {
  await fs.rm(state.root, { recursive: true, force: true })
})

function ports(options: {
  rules?: PermissionV1.Ruleset
  hold?: string
  jail?: "unavailable"
} = {}): ClaudeHostGate.Ports {
  const roots = (actor: ClaudeHostGate.Actor) => actor.seat === "archie" ? [path.join(state.root, "docs")]
    : actor.seat === "backend" ? [path.join(state.root, "src")] : undefined
  const ruleset = options.rules ?? [{ permission: "*", pattern: "*", action: "allow" as const }]
  return {
    granted: { maestro: ["task", "dock_read", "context_recall"], archie: ["context_recall", "write"], backend: ["context_recall", "process"] },
    hold: () => options.hold ? Effect.fail(new Error(options.hold)) : Effect.void,
    safety: (actor, call, toolUseID) => {
      const writeRoots = roots(actor)
      return ToolSafety.beforeInvocation({ tool: call.tool, args: call.args, sessionID: actor.sessionID, callID: toolUseID,
        directory: state.root, projectID: "project", projectDirectory: state.root }).pipe(
        Effect.provideService(ToolSafety.RuntimeProfile, writeRoots ? { writeRoots } : undefined))
    },
    arsenal: () => Effect.void,
    ask: (actor, name, input, toolUseID) => {
      const ctx = {
        sessionID: actor.sessionID, messageID: MessageID.ascending(), callID: toolUseID, agent: actor.seat, abort: new AbortController().signal,
        messages: [], metadata: () => Effect.void,
        ask: (request) => request.patterns.some((pattern) => Permission.evaluate(request.permission, pattern, ruleset).action === "deny")
          ? Effect.die(new PermissionV1.DeniedError({ ruleset })) : Effect.void,
      } satisfies Tool.Context
      return asks(name, input, ctx, () => Effect.void)
    },
    confine: (actor, command) => {
      if (actor.seat !== "archie" && actor.seat !== "backend") return Effect.succeed(undefined)
      if (options.jail === "unavailable") return Effect.fail(new Error(`HOLD: ${actor.seat}'s Bash runs only inside Orchestra's write jail`))
      return Effect.succeed(`jailed ${command}`)
    },
    release: () => Effect.void,
    close: Effect.void,
  }
}

const decide = (gate: ClaudeHostGate.Ports, actor: ClaudeHostGate.Actor, name: string, input: Record<string, unknown>) =>
  Effect.runPromise(ClaudeHostGate.decide(gate, actor, name, input, "toolu_gate"))

const file = (...segments: string[]) => path.join(state.root, ...segments)

describe("ClaudeHostGate.decide", () => {
  test("write roots are each subagent's own: inside its grant allows, anywhere else denies", async () => {
    const gate = ports()
    expect(await decide(gate, archie, "Write", { file_path: file("docs", "proposal.md"), content: "x" })).toEqual({ allow: true })
    expect(await decide(gate, backend, "Write", { file_path: file("src", "a.ts"), content: "x" })).toEqual({ allow: true })
    const crossed = await decide(gate, archie, "Write", { file_path: file("src", "a.ts"), content: "x" })
    expect(crossed.allow).toBe(false)
    if (!crossed.allow) expect(crossed.reason).toContain("write-outside-physical-roots")
    expect((await decide(gate, backend, "Edit", { file_path: file("docs", "proposal.md"), old_string: "a", new_string: "b" })).allow).toBe(false)
    expect((await decide(gate, archie, "NotebookEdit", { notebook_path: file("src", "n.ipynb"), new_source: "" })).allow).toBe(false)
    // The main thread has no bound roots: the project profile alone decides.
    expect(await decide(gate, main, "Write", { file_path: file("src", "a.ts"), content: "x" })).toEqual({ allow: true })
  })

  test("an in-process Orchestra tool goes through ToolSafety too, so a seat cannot write around its roots", async () => {
    const outside = await decide(ports(), archie, "mcp__orchestra__write", { filePath: file("src", "a.ts"), content: "x" })
    expect(outside.allow).toBe(false)
    expect(await decide(ports(), archie, "mcp__orchestra__write", { filePath: file("docs", "a.md"), content: "x" })).toEqual({ allow: true })
  })

  test("a deny beats every allow: allow-all rules do not let an unsafe or held call through", async () => {
    const allowAll = ports()
    const destructive = await decide(allowAll, main, "Bash", { command: "rm -rf /" })
    expect(destructive.allow).toBe(false)
    if (!destructive.allow) expect(destructive.reason).toContain("known-")
    const held = await decide(ports({ hold: "Tool safety HOLD: WORKFLOW_NESTED_TASK_REFUSED" }), main, "Read", { file_path: file("docs", "a.md") })
    expect(held).toEqual({ allow: false, reason: "Tool safety HOLD: WORKFLOW_NESTED_TASK_REFUSED" })
    const unsafe = await decide(allowAll, archie, "Write", { file_path: file("src", "a.ts"), content: "x" })
    expect(unsafe.allow).toBe(false)
  })

  test("Orchestra's permission rules decide what ToolSafety lets through", async () => {
    const rules = [{ permission: "*", pattern: "*", action: "allow" as const }, { permission: "webfetch", pattern: "*", action: "deny" as const }]
    const fetch = await decide(ports({ rules }), main, "WebFetch", { url: "https://example.com", prompt: "p" })
    expect(fetch.allow).toBe(false)
    if (!fetch.allow) expect(fetch.reason).toContain("rule which prevents")
    expect(await decide(ports({ rules }), main, "WebSearch", { query: "effect" })).toEqual({ allow: true })
  })

  test("Orchestra MCP tools are scoped to the caller's seat, whoever serves them", async () => {
    expect(await decide(ports(), main, "mcp__orchestra__dock_read", {})).toEqual({ allow: true })
    const seat = await decide(ports(), archie, "mcp__orchestra__dock_read", {})
    expect(seat).toEqual({ allow: false, reason: "archie is not granted the Orchestra tool dock_read, so the call did not run." })
    // A write grant belongs to whoever may delegate.
    expect(await decide(ports(), main, "mcp__orchestra__task_grant", { seat: "archie", writePaths: [], purpose: "p" })).toEqual({ allow: true })
    expect((await decide(ports(), archie, "mcp__orchestra__task_grant", { seat: "archie", writePaths: [], purpose: "p" })).allow).toBe(false)
  })

  test("a seat reaches only its own entry skills; the main thread keeps every skill but a seat's", async () => {
    expect(await decide(ports(), archie, "Skill", { skill: "orchestra:archie-plan" })).toEqual({ allow: true })
    expect((await decide(ports(), archie, "Skill", { skill: "backend-implement" })).allow).toBe(false)
    expect((await decide(ports(), archie, "Skill", { skill: "some-user-skill" })).allow).toBe(false)
    expect((await decide(ports(), main, "Skill", { skill: "archie-plan" })).allow).toBe(false)
    expect(await decide(ports(), main, "Skill", { skill: "some-user-skill" })).toEqual({ allow: true })
  })

  test("a write-roots seat's shell runs inside the jail, and without a jail it does not run", async () => {
    expect(await decide(ports(), archie, "Bash", { command: "ls docs" })).toEqual({ allow: true, input: { command: "jailed ls docs" } })
    expect(await decide(ports(), backend, "mcp__orchestra__process", { action: "start", command: "bun run dev" }))
      .toEqual({ allow: true, input: { action: "start", command: "jailed bun run dev" } })
    expect(await decide(ports(), backend, "mcp__orchestra__process", { action: "list" })).toEqual({ allow: true })
    expect(await decide(ports(), main, "Bash", { command: "ls" })).toEqual({ allow: true })
    const none = await decide(ports({ jail: "unavailable" }), archie, "Bash", { command: "ls docs" })
    expect(none.allow).toBe(false)
    if (!none.allow) expect(none.reason).toContain("write jail")
  })

  test("the hook answer carries the decision, the reason and a jailed command", () => {
    expect(ClaudeHostGate.output({ allow: false, reason: "no" })).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "no" },
    })
    expect(ClaudeHostGate.output({ allow: true, input: { command: "jailed" } })).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { command: "jailed" } },
    })
    expect(ClaudeHostGate.denied(ClaudeHostGate.deny("no"))).toBe(true)
    expect(ClaudeHostGate.denied(ClaudeHostGate.output({ allow: true }))).toBe(false)
  })

  test("Claude Code's tools reach ToolSafety under Orchestra's names and argument names", () => {
    expect(ClaudeHostGate.invocation("Write", { file_path: "/a" })).toEqual({ tool: "write", args: { filePath: "/a" } })
    expect(ClaudeHostGate.invocation("NotebookEdit", { notebook_path: "/n" })).toEqual({ tool: "edit", args: { filePath: "/n" } })
    expect(ClaudeHostGate.invocation("Bash", { command: "ls", description: "d" })).toEqual({ tool: "bash", args: { command: "ls" } })
    expect(ClaudeHostGate.invocation("mcp__orchestra__edit", { filePath: "/e" })).toEqual({ tool: "edit", args: { filePath: "/e" } })
    // Other built-ins too, so a hook's tool condition matches the same name on both engines.
    expect(ClaudeHostGate.invocation("Grep", { pattern: "x" })).toEqual({ tool: "grep", args: { pattern: "x" } })
    expect(ClaudeHostGate.invocation("WebFetch", { url: "u" })).toEqual({ tool: "webfetch", args: { url: "u" } })
    expect(ClaudeHostGate.invocation("Agent", { prompt: "p" })).toEqual({ tool: "task", args: { prompt: "p" } })
    expect(ClaudeHostGate.invocation("Task", { prompt: "p" })).toEqual({ tool: "task", args: { prompt: "p" } })
    expect(ClaudeHostGate.invocation("mcp__other__thing", { a: 1 })).toEqual({ tool: "mcp__other__thing", args: { a: 1 } })
  })
})
