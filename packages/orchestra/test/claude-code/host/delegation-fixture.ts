import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { Effect, Schema } from "effect"
import { ClaudeHostMcp } from "@/claude-code/host/mcp"
import { PartID, type MessageID, type SessionID } from "@/session/schema"
import type { Session } from "@/session/session"

/** Execute the real MCP grant producer and retain its result on the owning tool part. */
export const grant = Effect.fn("DelegationFixture.grant")(function* (input: {
  sessions: Session.Interface
  sessionID: SessionID
  messageID: MessageID
  directory: string
  writePaths: string[]
}) {
  const context = yield* Effect.context<never>()
  const abort = new AbortController()
  const args = { seat: "archie", writePaths: input.writePaths, purpose: "proposal" }
  const part = yield* input.sessions.updatePart({ id: PartID.ascending(), sessionID: input.sessionID,
    messageID: input.messageID, type: "tool", callID: crypto.randomUUID(), tool: ClaudeHostMcp.GRANT,
    metadata: { claudeCodeTool: `mcp__orchestra__${ClaudeHostMcp.GRANT}` },
    state: { status: "running", input: args, time: { start: Date.now() } } })
  const server = ClaudeHostMcp.server({ sessionID: input.sessionID, directory: input.directory,
    worktree: input.directory, agent: "maestro", abort, bridge: {
      run: (effect) => Effect.runPromiseWith(context)(effect),
      claim: () => Effect.succeed(part),
      context: () => Effect.succeed({ sessionID: input.sessionID, messageID: input.messageID, agent: "maestro",
        callID: part.callID, abort: abort.signal, messages: [], metadata: () => Effect.void, ask: () => Effect.void }),
      execute: (def, args, context) => def.execute(args, context),
      complete: (part) => input.sessions.updatePart(part).pipe(Effect.asVoid),
      settled: () => {},
    } })
  const client = new Client({ name: "delegation-grant-fixture", version: "1" })
  const transports = InMemoryTransport.createLinkedPair()
  yield* Effect.addFinalizer(() => Effect.promise(() => client.close()))
  yield* Effect.promise(async () => { await server.instance.connect(transports[0]); await client.connect(transports[1]) })
  const result = yield* Effect.promise(() => client.callTool({ name: ClaudeHostMcp.GRANT, arguments: args }))
  const output = Schema.decodeUnknownSync(Schema.Struct({ isError: Schema.optional(Schema.Boolean),
    content: Schema.Array(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })) }))(result)
  if (output.isError || output.content.length !== 1) throw new Error("Expected one successful native MCP grant result")
  return Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ grantID: Schema.String })))(output.content[0].text).grantID
})

export * as DelegationFixture from "./delegation-fixture"
