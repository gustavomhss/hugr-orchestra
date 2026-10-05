import { expect, test } from "bun:test"
import path from "node:path"
import { Context, DateTime, Effect, Layer, Schema } from "effect"

test("actual default HTTP Location graph captures native approval and replies through native Permission routes", async () => {
  if (!process.env.E_LAST_HTTP_CHILD) {
    for (const mode of ["baseline", "capture"]) {
      const child = Bun.spawn([process.execPath, "test", "./test/maestro/arsenal-http-approval.test.ts", "--timeout", "90000"], { cwd: path.resolve(import.meta.dir, "../.."), env: { ...process.env, E_LAST_HTTP_CHILD: mode }, stdout: "pipe", stderr: "pipe" })
      const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
      if (exit !== 0) throw new Error(`HTTP native ${mode} child failed (${exit}): ${stdout}\n${stderr}`)
      expect(stderr).toContain("1 pass")
    }
    return
  }
  const { tmpdir } = await import("../fixture/fixture")
  const { prepareArsenalSDK } = await import("./arsenal-fixture")
  const { Global } = await import("@opencode-ai/core/global")
  const { ToolRegistry } = await import("@opencode-ai/core/tool/registry")
  const { MaestroArsenal } = await import("@opencode-ai/core/tool/maestro-arsenal")
  const { AgentV2 } = await import("@opencode-ai/core/agent")
  const captured: Array<Parameters<typeof ToolRegistry.Service.of>[0]> = []
  const original = MaestroArsenal.nativeRegistryNode.implementation
  // Observe the exact default HTTP registry, preserving its executor and native leaf policies.
  if (process.env.E_LAST_HTTP_CHILD === "capture") MaestroArsenal.nativeRegistryNode.implementation = original.pipe(Layer.tap((context) => Effect.sync(() => captured.push(Context.get(context, ToolRegistry.Service)))))
  using probe = { [Symbol.dispose]: () => { MaestroArsenal.nativeRegistryNode.implementation = original } }
  const { HttpApiApp } = await import("@/server/routes/instance/httpapi/server")
  const { pollWithTimeout } = await import("../lib/effect")
  await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
  await prepareArsenalSDK(tmp.path, Global.Path.config)
  await Bun.write(path.join(tmp.path, "proof.txt"), "native")
  const request = (route: string, body?: unknown) => HttpApiApp.webHandler().handler(new Request(`http://localhost${route}`, { method: body === undefined ? "GET" : "POST", headers: { "x-opencode-directory": tmp.path, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), Context.empty() as Context.Context<unknown>)
  const created = await request("/session", { agent: "maestro" })
  expect(created.status).toBe(200)
  const session = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String, projectID: Schema.String, directory: Schema.String }))(await created.json())
  const boot = await request("/api/command")
  if (boot.status !== 200) throw new Error(`HTTP_NATIVE_BOOT_FAILURE: ${boot.status}: ${await boot.text()}; mode=${process.env.E_LAST_HTTP_CHILD}; captured=${captured.length}`)
  expect(boot.status).toBe(200)
  if (process.env.E_LAST_HTTP_CHILD === "baseline") return
  expect(captured.length).toBeGreaterThan(0)
  const registry = captured.at(-1)
  if (!registry) throw new Error("Actual HTTP native registry was not constructed")
  const { AppRuntime } = await import("@/effect/app-runtime")
  const { EventV2 } = await import("@opencode-ai/core/event")
  const { SessionEvent } = await import("@opencode-ai/core/session/event")
  const { SessionSchema } = await import("@opencode-ai/core/session/schema")
  const { SessionMessage } = await import("@opencode-ai/core/session/message")
  const { ModelV2 } = await import("@opencode-ai/core/model")
  const { ProviderV2 } = await import("@opencode-ai/core/provider")
  const { PermissionV2 } = await import("@opencode-ai/core/permission")
  const materialized = await Effect.runPromise(registry.materialize())
  const invoke = (id: string, name: string, input: unknown, messageID = "msg_http_approval") => materialized.settle({ sessionID: SessionSchema.ID.make(session.id), assistantMessageID: SessionMessage.ID.make(messageID), agent: AgentV2.ID.make("maestro"), call: { type: "tool-call", id, name, input } })
  expect((await Effect.runPromise(invoke("http-profile-describe", MaestroArsenal.names.describe, { name: "profile" }))).result.type).toBe("text")
  expect((await Effect.runPromise(invoke("http-profile-set", MaestroArsenal.names.execute, { name: "profile", arguments: { action: "set", patch: { askBefore: ["read"] } } }))).result.type).toBe("text")
  await AppRuntime.runPromise(Effect.gen(function* () {
    const events = yield* EventV2.Service
    yield* events.publish(SessionEvent.Step.Started, { sessionID: SessionSchema.ID.make(session.id), assistantMessageID: SessionMessage.ID.make("msg_http_approval"), agent: "maestro", model: ModelV2.Ref.make({ id: ModelV2.ID.make("fixture"), providerID: ProviderV2.ID.make("fixture") }), timestamp: yield* DateTime.now })
    yield* events.publish(SessionEvent.Tool.Input.Started, { sessionID: SessionSchema.ID.make(session.id), assistantMessageID: SessionMessage.ID.make("msg_http_approval"), callID: "http-captured-approval", name: "read", timestamp: yield* DateTime.now })
    yield* events.publish(SessionEvent.Tool.Input.Ended, { sessionID: SessionSchema.ID.make(session.id), assistantMessageID: SessionMessage.ID.make("msg_http_approval"), callID: "http-captured-approval", text: JSON.stringify({ path: "proof.txt" }), timestamp: yield* DateTime.now })
    yield* events.publish(SessionEvent.Tool.Called, { sessionID: SessionSchema.ID.make(session.id), assistantMessageID: SessionMessage.ID.make("msg_http_approval"), callID: "http-captured-approval", tool: "read", input: { path: "proof.txt" }, provider: { executed: false }, timestamp: yield* DateTime.now })
  }))
  const wrongSource = await Effect.runPromise(invoke("http-captured-approval", "read", { path: "proof.txt" }, "msg_http_wrong"))
  expect(wrongSource.result).toEqual({ type: "error", value: "Tool safety HOLD: approval-v2-assistant-binding-mismatch" })
  expect(wrongSource.output).toBeUndefined()
  expect(JSON.stringify(wrongSource)).not.toContain('"content":"native"')
  const marker = { settled: false }
  const pending = Effect.runPromise(invoke("http-captured-approval", "read", { path: "proof.txt" })).then((result) => { marker.settled = true; return result })
  const asked = await Promise.race([pending.then((result) => { throw new Error(`HTTP_NATIVE_SETTLED_BEFORE_INTENT: ${JSON.stringify(result)}`) }), Effect.runPromise(pollWithTimeout(Effect.promise(async () => {
    const response = await request(`/api/session/${session.id}/permission`)
    expect(response.status).toBe(200)
    const items = Schema.decodeUnknownSync(Schema.Struct({ data: Schema.Array(PermissionV2.Request) }))(await response.json())
    return items.data.find((item) => item.metadata?.callID === "http-captured-approval")
  }), "HTTP captured native approval request missing"))])
  expect(asked).toMatchObject({ sessionID: session.id, action: "read", resources: ["proof.txt"], source: { type: "tool", messageID: "msg_http_approval", callID: "http-captured-approval" }, metadata: { nativeSafety: true, action: "read", projectID: session.projectID } })
  expect(marker.settled).toBe(false)
  expect((await request(`/api/session/${session.id}/permission/${asked.id}/reply`, { reply: "once" })).status).toBe(204)
  expect((await pending).output?.structured).toMatchObject({ content: "native" })
  expect(marker.settled).toBe(true)
}, 240000)
