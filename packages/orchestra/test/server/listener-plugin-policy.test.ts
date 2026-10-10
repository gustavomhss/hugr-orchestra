import { expect } from "bun:test"
import { NodeServices } from "@effect/platform-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Node } from "@orchestra/core/effect/app-node"
import { locationServices } from "@orchestra/core/location-services"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { AppProcess } from "@orchestra/core/process"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { SessionV1 } from "@orchestra/core/v1/session"
import { Cause, Effect, Exit, Layer, Schema } from "effect"
import path from "node:path"
import { createServer } from "node:net"
import { pathToFileURL } from "node:url"
import { Plugin } from "../../src/plugin"
import { ArsenalBindings } from "../../src/maestro/arsenal-bindings"
import { ListenerContext } from "../../src/server/listener-context"
import { Server } from "../../src/server/server"
import { Session } from "../../src/session/session"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"

const it = testEffect(
  Layer.mergeAll(
    TestLLMServer.layer,
    NodeServices.layer,
    AppNodeBuilder.build(LayerNode.group([FSUtil.node, AppProcess.node])),
  ),
)

const fixture = Effect.gen(function* () {
  const llm = yield* TestLLMServer
  const fs = yield* FSUtil.Service
  const directory = yield* tmpdirScoped({ git: true })
  // Production listeners share a disk DB. Test preload uses :memory:, so explicitly give both graphs one real file DB.
  const database = [Database.node, Database.layerFromPath(path.join(directory, "listeners.db"))] as const
  // Hoisting must resolve each global by one identity when its Database dependency is replaced.
  const globals = globalIdentities(locationServices).filter(([node]) => node.name !== Database.node.name)
  const replacements: LayerNode.Replacement[] = ArsenalBindings.nativeRegistryReplacements
  const added = [database, ...globals]
  yield* Effect.acquireRelease(
    Effect.sync(() => replacements.push(...added)),
    () =>
      Effect.sync(() => {
        added.forEach((entry) => {
          const index = replacements.indexOf(entry)
          if (index < 0) throw new Error("listener database fixture replacement lost")
          replacements.splice(index, 1)
        })
      }),
  )
  const record = path.join(directory, "plugin-record.json")
  const file = path.join(directory, "listener-plugin.ts")
  yield* fs.writeFileString(
    file,
    `
export default async (input) => ({
  "chat.message": async (_event, output) => {
    const trigger = output.parts.find((part) => part.type === "text" && part.text.startsWith("listener-probe:"))
    if (!trigger) return
    const target = trigger.text.slice("listener-probe:".length)
    const before = input.serverUrl.href
    const result = await input.client.session.prompt({
      path: { id: target },
      body: { agent: "probe", model: { providerID: "probe", modelID: "model" }, parts: [{ type: "text", text: "Read fixture once." }] },
      signal: AbortSignal.timeout(30000),
      throwOnError: true,
    })
    await Bun.write(${JSON.stringify(record)}, JSON.stringify({ before, after: input.serverUrl.href, request: result.request.url }))
  },
})
`,
  )
  yield* fs.writeFileString(
    path.join(directory, "orchestra.json"),
    JSON.stringify({
      plugin: [pathToFileURL(file).href],
      formatter: false,
      lsp: false,
      permission: { "*": "allow" },
      agent: { probe: { mode: "primary", permission: { "*": "allow" } } },
      provider: {
        probe: {
          npm: "@ai-sdk/openai-compatible",
          name: "Probe",
          options: { baseURL: llm.url, apiKey: "fixture" },
          models: { model: { name: "Probe", limit: { context: 32000, output: 4096 } } },
        },
      },
      model: "probe/model",
    }),
  )
  const start = (profile?: ToolSafety.Profile, mutate = () => {}) =>
    Effect.acquireRelease(
      Effect.promise(() => {
        const pending = Server.listen({ hostname: "127.0.0.1", port: 0, toolSafetyProfile: profile })
        // Mutation happens in the same synchronous stack, before awaiting listen's promise.
        mutate()
        return pending
      }),
      (listener) => Effect.promise(() => listener.stop(true)),
    )
  const request = (listener: Server.Listener, route: string, body?: unknown) =>
    Effect.promise(() =>
      fetch(new URL(route, listener.url), {
        method: body === undefined ? "GET" : "POST",
        headers: { "x-orchestra-directory": directory, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      }),
    )
  const create = (listener: Server.Listener, parentID?: Session.Info["id"]) =>
    Effect.gen(function* () {
      const response = yield* request(listener, "/session", { title: "listener binding probe", parentID })
      expect(response.status).toBe(200)
      return yield* Schema.decodeUnknownEffect(Session.Info)(yield* Effect.promise(() => response.json()))
    })
  const tools = (listener: Server.Listener, sessionID: Session.Info["id"]) =>
    Effect.gen(function* () {
      const response = yield* request(listener, `/session/${sessionID}/message`)
      expect(response.status).toBe(200)
      const messages = yield* Schema.decodeUnknownEffect(Schema.Array(SessionV1.WithParts))(
        yield* Effect.promise(() => response.json()),
      )
      return messages.flatMap((message) => message.parts).filter((part) => part.type === "tool")
    })
  const prompt = (listener: Server.Listener, sessionID: Session.Info["id"], text: string, noReply = false) =>
    Effect.gen(function* () {
      const response = yield* request(listener, `/session/${sessionID}/message`, {
        agent: "probe",
        model: { providerID: "probe", modelID: "model" },
        noReply,
        parts: [{ type: "text", text }],
      })
      const body = yield* Effect.promise(() => response.text())
      if (response.status !== 200) {
        yield* Effect.promise(() => listener.stop(true))
        const log = yield* fs.readFileString(path.join(Global.Path.log, "orchestra.log"))
        throw new Error(`prompt ${listener.url} ${sessionID} ${text}: HTTP ${response.status}: ${body}\n${log}`)
      }
      expect(response.status).toBe(200)
    })
  return { llm, fs, directory, record, start, request, create, tools, prompt }
})

function globalIdentities(
  node: LayerNode.Node<unknown, unknown, LayerNode.Tag | undefined>,
  seen = new Set<LayerNode.Node<unknown, unknown, LayerNode.Tag | undefined>>(),
): LayerNode.Replacement[] {
  if (seen.has(node)) return []
  seen.add(node)
  return [
    ...(node.tag === Node.tags.values.global ? [[node, node] as const] : []),
    ...node.dependencies.flatMap((dependency) => globalIdentities(dependency, seen)),
  ]
}

it.live(
  "plugin SDK retains restricted listener policy with overlapping stock listener, same directory and Session",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      yield* f.fs.writeFileString(path.join(f.directory, "private.txt"), "listener-private-positive-control")
      const neverTouch = ["private.txt"]
      const restricted = yield* f.start({ neverTouch }, () => {
        neverTouch.length = 0
      })
      const stock = yield* f.start()
      expect(restricted.url.href).not.toBe(stock.url.href)
      expect(Server.url?.href).toBe(stock.url.href)

      // Initialize A's plugin only after B has overwritten legacy discovery. Both graphs see the same persisted child.
      const parent = yield* f.create(restricted)
      const target = yield* f.create(restricted, parent.id)
      const caller = yield* f.create(restricted)
      const shared = yield* f.request(stock, `/session/${target.id}`)
      expect(shared.status).toBe(200)
      const adopted = yield* Schema.decodeUnknownEffect(Session.Info)(yield* Effect.promise(() => shared.json()))
      expect(adopted.id).toBe(target.id)
      expect(adopted.directory).toBe(f.directory)
      expect(adopted.parentID).toBe(parent.id)

      // Positive control: same Session, native tool, permissions and provider can read through B.
      yield* f.llm.tool("read", { filePath: path.join(f.directory, "private.txt") })
      yield* f.llm.text("stock complete")
      yield* f.prompt(stock, target.id, "Read fixture once.")
      const stockTools = yield* f.tools(stock, target.id)
      expect(
        stockTools.some(
          (part) =>
            part.state.status === "completed" && part.state.output.includes("listener-private-positive-control"),
        ),
      ).toBe(true)

      const invokePlugin = Effect.gen(function* () {
        yield* f.llm.tool("read", { filePath: path.join(f.directory, "private.txt") })
        yield* f.llm.text("restricted complete")
        // Caller admits only; its real chat hook issues the executing SDK prompt against the shared target.
        yield* f.prompt(restricted, caller.id, `listener-probe:${target.id}`, true)
        const record = yield* Schema.decodeUnknownEffect(
          Schema.Struct({ before: Schema.String, after: Schema.String, request: Schema.String }),
        )(yield* Effect.promise(() => Bun.file(f.record).json()))
        const calls = (yield* f.tools(restricted, target.id)).filter(
          (part) => !stockTools.some((old) => old.id === part.id),
        )
        expect(calls.length).toBeGreaterThan(0)
        expect(calls.filter((part) => part.state.status === "completed")).toHaveLength(0)
        expect(
          calls.every(
            (part) =>
              part.state.status === "error" && part.state.error.includes("Tool safety HOLD: project-never-touch"),
          ),
        ).toBe(true)
        expect(record.before).toBe(restricted.url.href)
        expect(record.after).toBe(restricted.url.href)
        expect(new URL(record.request).origin).toBe(restricted.url.origin)
        return calls
      })
      const overlapping = yield* invokePlugin
      yield* Effect.promise(() => stock.stop(true))
      expect(Server.url).toBeUndefined()
      const afterStop = yield* invokePlugin
      expect(afterStop.length).toBeGreaterThan(overlapping.length)
      console.info(
        "real plugin SDK: same Session readable on stock B; restricted A HOLD while B live and after B stops",
      )
    }),
  90_000,
)
;(["unix-socket", "loopback-endpoint"] as const).forEach((kind) => {
  it.live(
    `listener snapshots nested ${kind} grants before first await into actual native shell`,
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        const socketDirectory = yield* f.fs
          .makeTempDirectoryScoped({ prefix: "lb-" })
          .pipe(Effect.flatMap(f.fs.realPath))
        const socket = path.join(socketDirectory, "probe.sock")
        const server = yield* Effect.acquireRelease(
          Effect.promise(
            () =>
              new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
                const server = createServer((connection) => connection.end("nested-grant-response"))
                server.once("error", reject)
                if (kind === "unix-socket" && process.platform !== "win32")
                  return server.listen(socket, () => resolve(server))
                server.listen(0, "127.0.0.1", () => resolve(server))
              }),
          ),
          (server) => Effect.promise(() => new Promise<void>((resolve) => server.close(() => resolve()))),
        )
        const address = server.address()
        const port = address && typeof address !== "string" ? address.port : 1
        const sockets = [{ directory: f.directory, path: socket }]
        const endpoints = [{ directory: f.directory, host: "127.0.0.1" as const, port }]
        const roots = ["allowed"]
        const profile = {
          requireSandbox: true,
          writeRoots: roots,
          sandbox: {
            enabled: true,
            scratch: true,
            unconfinedFallback: true,
            ...(kind === "unix-socket" ? { allowedUnixSockets: sockets } : { allowedLoopbackEndpoints: endpoints }),
          },
        }
        yield* f.fs.writeFileString(
          path.join(f.directory, "grant-probe.cjs"),
          `
const route = process.env.ORCHESTRA_TCP_PROXY_ROUTES?.split(";").find(value => value.startsWith("${port}:"))
const destination = ${kind === "unix-socket" ? JSON.stringify(socket) : `route && Buffer.from(route.slice("${port}:".length), "hex").toString("utf8")`}
if (!destination) throw new Error("fixture-loopback-route-missing")
const c = require("net").connect(destination)
c.on("data", (data) => console.log(data.toString()))
c.on("error", () => { process.exitCode = 3 })
c.setTimeout(1000, () => { c.destroy(); process.exitCode = 4 })
`,
        )
        const listener = yield* f.start(profile, () => {
          sockets[0].path = path.join(socketDirectory, "missing.sock")
          endpoints[0].port = 0
          sockets.length = 0
          endpoints.length = 0
          roots.push(f.directory)
        })
        const parent = yield* f.create(listener)
        const child = yield* f.create(listener, parent.id)
        yield* f.llm.tool("bash", {
          command: "node grant-probe.cjs",
          description: "nested grant snapshot probe",
          timeout: 5000,
        })
        yield* f.llm.text("grant probe complete")
        yield* f.prompt(listener, child.id, "Run grant probe once.")
        const calls = yield* f.tools(listener, child.id)
        expect(calls).toHaveLength(1)
        if (process.platform === "darwin") {
          expect(calls[0].state.status).toBe("completed")
          expect(calls[0].state.status === "completed" && calls[0].state.output).toBe("nested-grant-response\n")
          expect(calls[0].state.status === "completed" && calls[0].state.metadata.exit).toBe(0)
          return
        }
        const suffix = kind === "loopback-endpoint" || process.platform === "linux"
          ? "exact-policy-unsupported"
          : "platform-unsupported"
        expect(calls[0].state.status).toBe("error")
        expect(calls[0].state.status === "error" && calls[0].state.error).toContain(
          `Tool safety HOLD: sandbox-${kind}-${suffix}`,
        )
      }),
    60_000,
  )
})

const unready = testEffect(
  AppNodeBuilder.build(Plugin.node).pipe(Layer.provide(Layer.succeed(ListenerContext.Current)({}))),
)

unready.instance("bound plugin without listener URL fails named unavailable instead of Server.Default fallback", () =>
  Effect.gen(function* () {
    const plugin = yield* Plugin.Service
    const exit = yield* plugin.init().pipe(Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) throw new Error("unready listener unexpectedly initialized plugins")
    expect(Cause.pretty(exit.cause)).toContain("ListenerBindingUnavailable: Listener URL unavailable before listening")
  }),
)
