// Live smoke test of the Claude Code engine through Orchestra's real loop (uses the machine's Claude Code login).
// Usage: XDG_*=<isolated dirs> bun script/claude-code-engine/smoke.ts <workspace-dir>
// The workspace gets an opencode.json with a `claude` agent on the Claude Code engine. Every permission request is
// approved once and logged, so the run shows which approvals Orchestra asked for.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { Effect, Fiber } from "effect"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceStore } from "@/project/instance-store"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"

const WORKSPACE = path.resolve(process.argv[2] ?? "")
if (!process.argv[2]) throw new Error("usage: bun script/claude-code-engine/smoke.ts <workspace-dir>")
mkdirSync(WORKSPACE, { recursive: true })
writeFileSync(path.join(WORKSPACE, "notes.txt"), "status: draft\nowner: nobody\n")
writeFileSync(path.join(WORKSPACE, "opencode.json"), JSON.stringify({
  agent: { claude: { mode: "primary", engine: "claude-code", model: `anthropic/${process.env.SMOKE_MODEL ?? "claude-haiku-4-5-20251001"}`,
    // Ask for edits and shell commands, so the run shows Orchestra deciding Claude Code's calls.
    permission: { edit: "ask", bash: "ask" } } },
}, null, 2))
try { execFileSync("git", ["init", "-q"], { cwd: WORKSPACE }) } catch {}

const program = Effect.gen(function* () {
  const sessions = yield* Session.Service
  const prompt = yield* SessionPrompt.Service
  const permission = yield* Permission.Service
  const asked: string[] = []
  const approver = yield* Effect.forever(Effect.gen(function* () {
    for (const request of yield* permission.list()) {
      asked.push(`${request.permission} ${JSON.stringify(request.patterns)}`)
      yield* permission.reply({ requestID: request.id, reply: "once" }).pipe(Effect.ignore)
    }
    yield* Effect.sleep("100 millis")
  })).pipe(Effect.forkChild)

  const session = yield* sessions.create({ title: "Claude Code engine smoke" })
  const reply = yield* prompt.prompt({ sessionID: session.id, agent: "claude", parts: [{ type: "text",
    text: 'Read notes.txt, change "owner: nobody" to "owner: maestro", then run `ls` with Bash. Reply with one line.' }] })
  yield* Fiber.interrupt(approver)

  const history = yield* sessions.messages({ sessionID: session.id })
  for (const message of history) {
    const info = message.info
    const summary = message.parts.map((part) => part.type === "tool" ? `tool:${part.tool}:${part.state.status}`
      : part.type === "text" ? `text:${JSON.stringify(part.text.slice(0, 60))}` : part.type)
    console.log(info.role, info.role === "assistant" ? `finish=${info.finish} error=${info.error?.name ?? "-"}` : "", summary.join(" | "))
  }
  console.log("approvals asked:", asked)
  console.log("notes.txt:", JSON.stringify(readFileSync(path.join(WORKSPACE, "notes.txt"), "utf8")))
  console.log("final reply finish:", reply.info.role === "assistant" ? reply.info.finish : "-")
  console.log("session metadata:", JSON.stringify((yield* sessions.get(session.id)).metadata))
})

await AppRuntime.runPromise(InstanceStore.Service.use((store) => store.provide({ directory: WORKSPACE }, program as never)) as never)
process.exit(0)
