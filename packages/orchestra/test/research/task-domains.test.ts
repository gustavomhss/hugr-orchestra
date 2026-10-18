import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { httpClient } from "@orchestra/core/effect/app-node-platform"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Permission } from "@/permission"
import { Provider } from "@/provider/provider"
import { ResearchExecution } from "@/research/allowance"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { SessionCompaction } from "@/session/compaction"
import { ToolRegistry } from "@/tool/registry"
import { PARALLEL_URL } from "@/tool/mcp-websearch"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestLLMServer } from "../lib/llm-server"
import { testEffect } from "../lib/effect"
import { NativeResearchTask } from "./fixtures/native-task"

// Parallel's search endpoint answers from here; every other request (the scripted model) goes over the real client.
const searches: { search_queries: string[] }[] = []
const http = Layer.effect(HttpClient.HttpClient, Effect.gen(function* () {
  const real = yield* HttpClient.HttpClient
  return HttpClient.make((request) => {
    if (!request.url.startsWith(PARALLEL_URL)) return real.execute(request)
    if (request.body._tag === "Uint8Array") searches.push(JSON.parse(new TextDecoder().decode(request.body.body)).params.arguments)
    return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{
      type: "text", text: JSON.stringify({ search_id: "s", results: [
        { url: "https://bun.sh/docs/runtime/child-process", excerpts: ["Spawn child processes"] },
        { url: "https://evil.example/spawn", excerpts: ["Copied spawn page"] },
      ] }) }] } }), { status: 200 })))
  })
})).pipe(Layer.provide(FetchHttpClient.layer))

const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  SessionPrompt.node, SessionCompaction.node, ToolRegistry.node, Session.node, SessionProjector.node, Agent.node, Provider.node,
  Permission.node, ResearchRecords.node, ResearchArtifacts.node, ResearchExecution.node, BackgroundJob.node,
  Database.node, EventV2.node, EventV2Bridge.node, FSUtil.node,
  LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] }),
]), [[RuntimeFlags.node, RuntimeFlags.layer({ experimentalBackgroundSubagents: true })], [httpClient, http]]))

// J1.9 loop side: the Maestro's Task call fixes jimmy's web domains; its websearch steers to them and returns nothing else.
it.instance("Task allowedDomains restricts jimmy's websearch for that dispatch only", () => Effect.gen(function* () {
  const fixture = yield* NativeResearchTask.setup()
  const saved = process.env.ORCHESTRA_WEBSEARCH_PROVIDER
  yield* Effect.acquireRelease(Effect.sync(() => { process.env.ORCHESTRA_WEBSEARCH_PROVIDER = "parallel" }), () => Effect.sync(() => {
    if (saved === undefined) delete process.env.ORCHESTRA_WEBSEARCH_PROVIDER
    else process.env.ORCHESTRA_WEBSEARCH_PROVIDER = saved
  }))
  yield* Effect.addFinalizer(() => Effect.gen(function* () {
    yield* Effect.forEach(yield* fixture.sessions.children(fixture.parent.id), (child) => fixture.prompt.cancel(child.id))
    yield* fixture.sessions.remove(fixture.parent.id)
  }).pipe(Effect.orDie))
  const searched = (callID: string, extra: Record<string, unknown>) => Effect.gen(function* () {
    yield* fixture.remote.tool("websearch", { query: "spawn" })
    yield* fixture.remote.text("Done.")
    const before = new Set((yield* fixture.sessions.children(fixture.parent.id)).map((child) => child.id))
    yield* fixture.call({ description: "Web discovery", prompt: "Search the web.", subagent_type: "jimmy", ...extra }, callID)
      .pipe(Effect.timeout("60 seconds"))
    const child = (yield* fixture.sessions.children(fixture.parent.id)).find((session) => !before.has(session.id))
    if (!child) throw new Error("Expected a jimmy execution Session")
    const parts = (yield* fixture.sessions.messages({ sessionID: child.id })).flatMap((message) => message.parts)
    const part = parts.find((candidate) => candidate.type === "tool" && candidate.tool === "websearch")
    if (!part || part.type !== "tool" || part.state.status !== "completed") throw new Error(`websearch did not complete: ${JSON.stringify(part)}`)
    return part.state.output
  })

  const restricted = yield* searched("restricted-discovery", { allowedDomains: ["bun.sh"] })
  expect(searches.at(-1)?.search_queries).toEqual(["spawn site:bun.sh"])
  expect(restricted).toContain("Results restricted to bun.sh; 1 result(s) outside them withheld.")
  expect(restricted).toContain("https://bun.sh/docs/runtime/child-process")
  expect(restricted).not.toContain("evil.example")

  const open = yield* searched("open-discovery", {})
  expect(searches.at(-1)?.search_queries).toEqual(["spawn"])
  expect(open).toContain("evil.example")
}), 120_000)
