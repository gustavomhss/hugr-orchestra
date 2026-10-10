import { expect } from "bun:test"
import { NodeServices } from "@effect/platform-node"
import path from "node:path"
import { createConnection, createServer } from "node:net"
import { Effect, Fiber, Layer, Schema } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppProcess } from "@orchestra/core/process"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { SessionV1 } from "@orchestra/core/v1/session"
import { PermissionV1 } from "@orchestra/core/v1/permission"
import { Session } from "../../src/session/session"
import { Server } from "../../src/server/server"
import { tmpdirScoped } from "../fixture/fixture"
import { TestLLMServer } from "../lib/llm-server"
import { pollWithTimeout, testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(TestLLMServer.layer, NodeServices.layer, LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node]))))
const sandbox = await Effect.runPromise(ToolSafetySandbox.status())
const prepared = sandbox.shellWrites === "enforced" ? it.live : it.live.skip
if (sandbox.shellWrites === "unenforced") console.info(`Native preparation conformance skipped: ${sandbox.shellSandbox.reason}`)

const fixture = (shell: "allow" | "ask" = "allow") => Effect.gen(function* () {
  const llm = yield* TestLLMServer
  const fs = yield* FSUtil.Service
  const directory = yield* tmpdirScoped({ git: true, config: {
    formatter: false, lsp: false, permission: { "*": "allow" },
    agent: { probe: { mode: "primary", permission: { "*": "allow", bash: shell } } },
    provider: { probe: { npm: "@ai-sdk/openai-compatible", name: "Probe", options: { baseURL: llm.url, apiKey: "fixture" },
      models: { model: { name: "Probe", limit: { context: 32000, output: 4096 } } } } }, model: "probe/model",
  } })
  const start = (profile?: ToolSafety.Profile) => Effect.acquireRelease(
    Effect.promise(() => Server.listen({ hostname: "127.0.0.1", port: 0, toolSafetyProfile: profile })),
    (listener) => Effect.promise(() => listener.stop(true)),
  )
  const request = (listener: Server.Listener, route: string, body?: unknown) => Effect.promise(() =>
    fetch(new URL(route, listener.url), {
      method: body === undefined ? "GET" : "POST",
      headers: { "x-orchestra-directory": directory, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    }),
  )
  const child = (listener: Server.Listener) => Effect.gen(function* () {
    const parentResponse = yield* request(listener, "/session", { title: "profile parent" })
    expect(parentResponse.status).toBe(200)
    const parent = yield* Schema.decodeUnknownEffect(Session.Info)(yield* Effect.promise(() => parentResponse.json()))
    const childResponse = yield* request(listener, "/session", { title: "profile child", parentID: parent.id })
    expect(childResponse.status).toBe(200)
    const child = yield* Schema.decodeUnknownEffect(Session.Info)(yield* Effect.promise(() => childResponse.json()))
    expect(child.parentID).toBe(parent.id)
    expect(child.directory).toBe(directory)
    expect(child.projectID).toBe(parent.projectID)
    expect(child.projectID).not.toBe("global")
    return child
  })
  const invoke = (listener: Server.Listener, child: { readonly id: Session.Info["id"] }, name: string, input: unknown) => Effect.gen(function* () {
    yield* llm.tool(name, input)
    yield* llm.text("probe complete")
    const response = yield* request(listener, `/session/${child.id}/message`, {
      agent: "probe", model: { providerID: "probe", modelID: "model" }, parts: [{ type: "text", text: "Run probe once." }],
    })
    expect(response.status).toBe(200)
    yield* Effect.promise(() => response.text())
    const messages = yield* request(listener, `/session/${child.id}/message`)
    const decoded = yield* Schema.decodeUnknownEffect(Schema.Array(SessionV1.WithParts))(yield* Effect.promise(() => messages.json()))
    const tools = decoded.flatMap((message) => message.parts).filter((part) => part.type === "tool")
    expect(tools.length).toBeGreaterThan(0)
    return tools
  })
  return { llm, fs, directory, start, child, invoke, request }
})

it.live("listener snapshots profile arrays into actual V1 child native tools; stock listener keeps stock policy", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    yield* f.fs.writeFileString(path.join(f.directory, "private.txt"), "fixture-private")
    const neverTouch = ["private.txt"]
    const profile = { neverTouch, writeRoots: ["allowed"] }
    const listener = yield* f.start(profile).pipe(Effect.tap(() => Effect.sync(() => neverTouch.length = 0)))
    const child = yield* f.child(listener)
    const tools = yield* f.invoke(listener, child, "read", { filePath: path.join(f.directory, "private.txt") })
    expect(tools.some((part) => part.state.status === "error" && part.state.error.includes("Tool safety HOLD: project-never-touch"))).toBe(true)
    expect(tools.some((part) => part.state.status === "completed" && part.state.output.includes("fixture-private"))).toBe(false)
    yield* Effect.promise(() => listener.stop(true))
    const stock = yield* f.start()
    const stockChild = yield* f.child(stock)
    const stockTools = yield* f.invoke(stock, stockChild, "read", { filePath: path.join(f.directory, "private.txt") })
    expect(stockTools.some((part) => part.state.status === "completed" && part.state.output.includes("fixture-private"))).toBe(true)
  }), 60_000,
)

it.live("listener socket snapshot reaches actual V1 child shell; unsupported hosts HOLD instead of falling back", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    // Keep Unix socket names below sockaddr_un's path limit, independently of the git fixture path.
    const sockets = yield* f.fs.makeTempDirectoryScoped({ prefix: "sg-" }).pipe(Effect.flatMap(f.fs.realPath))
    const socket = path.join(sockets, "db.sock")
    if (process.platform !== "win32") yield* Effect.acquireRelease(
      Effect.promise(() => new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
        const server = createServer((connection) => connection.end("listener-db-response"))
        server.once("error", reject)
        server.listen(socket, () => resolve(server))
      })),
      (server) => Effect.promise(() => new Promise<void>((resolve) => server.close(() => resolve()))),
    )
    const node = yield* ToolSafetySandbox.available("node")
    if (!node) throw new Error("BLOCKED: Node unavailable")
    const probe = path.join(f.directory, "probe.cjs")
    yield* f.fs.writeFileString(probe, `let denied=false;try{require('fs').writeFileSync('sibling','bad')}catch(e){denied=['EPERM','EACCES'].includes(e.code)};console.log('siblingDenied:'+denied);const c=require('net').connect(${JSON.stringify(socket)});c.on('data',d=>console.log(d.toString()));c.on('error',e=>{console.log(e.code);process.exitCode=3});c.setTimeout(1000,()=>{c.destroy();process.exitCode=4})`)
    const grants = [{ directory: f.directory, path: socket }]
    const roots = ["nested/out.ts"]
    const profile = { requireSandbox: true, writeRoots: roots, sandbox: { enabled: true, scratch: true, unconfinedFallback: true, allowedUnixSockets: grants } }
    const listener = yield* f.start(profile).pipe(Effect.tap(() => Effect.sync(() => {
      grants[0].path = path.join(sockets, "missing.sock")
      grants[0].directory = sockets
      roots.push(f.directory)
    })))
    const child = yield* f.child(listener)
    const tools = yield* f.invoke(listener, child, "bash", { command: `${JSON.stringify(node)} ${JSON.stringify(probe)}`, description: "listener socket probe", timeout: 5000 })
    if (process.platform === "darwin") {
      expect(tools.some((part) => part.state.status === "completed" && part.state.output === "siblingDenied:true\nlistener-db-response\n" && part.state.metadata.exit === 0)).toBe(true)
      expect(yield* f.fs.exists(path.join(f.directory, "sibling"))).toBe(false)
      return
    }
    const reason = process.platform === "linux" ? "sandbox-unix-socket-exact-policy-unsupported" : "sandbox-unix-socket-platform-unsupported"
    expect(tools.some((part) => part.state.status === "error" && part.state.error.includes(`Tool safety HOLD: ${reason}`))).toBe(true)
    expect(yield* f.fs.exists(path.join(f.directory, "nested"))).toBe(false)
    expect(yield* f.fs.exists(path.join(f.directory, "sibling"))).toBe(false)
    console.info(`${process.platform}: real V1 child shell profile propagated; unsupported socket policy HOLD measured`)
  }), 60_000,
)

it.live("native shell permission refusal leaves missing output ancestors untouched", () =>
  Effect.gen(function* () {
    const f = yield* fixture("ask")
    const node = yield* ToolSafetySandbox.available("node")
    if (!node) throw new Error("BLOCKED: Node unavailable")
    const probe = path.join(f.directory, "probe.cjs")
    yield* f.fs.writeFileString(probe, "require('fs').mkdirSync('nested/deep',{recursive:true});require('fs').writeFileSync('nested/deep/out.ts','must-not-run')")
    const listener = yield* f.start({ requireSandbox: true, writeRoots: ["nested/deep/out.ts"], sandbox: { enabled: true, scratch: true } })
    const child = yield* f.child(listener)
    // A quoted executable alone is a PowerShell expression, not a command. Use Node on PATH on every host.
    const invocation = yield* Effect.forkScoped(f.invoke(listener, child, "bash", { command: "node probe.cjs", description: "denied generator", timeout: 5000 }))
    const pending = yield* pollWithTimeout(Effect.gen(function* () {
      const response = yield* f.request(listener, "/permission")
      expect(response.status).toBe(200)
      const requests = yield* Schema.decodeUnknownEffect(Schema.Array(PermissionV1.Request))(yield* Effect.promise(() => response.json()))
      return requests.find((request) => request.sessionID === child.id && request.permission === "bash")
    }), "native shell permission was never requested", "15 seconds")
    expect(yield* f.fs.exists(path.join(f.directory, "nested"))).toBe(false)
    const rejected = yield* f.request(listener, `/permission/${pending.id}/reply`, { reply: "reject" })
    expect(rejected.status).toBe(200)
    const tools = yield* Fiber.join(invocation)
    expect(tools.some((part) => part.state.status === "error" && part.state.error === "The user rejected permission to use this specific tool call.")).toBe(true)
    expect(yield* f.fs.exists(path.join(f.directory, "nested"))).toBe(false)
  }), 60_000,
)

prepared("approved native shell prepares missing parents only after permission reply", () =>
  Effect.gen(function* () {
    const f = yield* fixture("ask")
    yield* f.fs.writeFileString(path.join(f.directory, "probe.cjs"), "require('fs').writeFileSync('nested/deep/out.ts','approved');console.log('generated')")
    const listener = yield* f.start({ requireSandbox: true, writeRoots: ["nested/deep/out.ts"], sandbox: { enabled: true, scratch: true } })
    const child = yield* f.child(listener)
    const invocation = yield* Effect.forkScoped(f.invoke(listener, child, "bash", { command: "node probe.cjs", description: "approved generator", timeout: 5000 }))
    const pending = yield* pollWithTimeout(Effect.gen(function* () {
      const response = yield* f.request(listener, "/permission")
      expect(response.status).toBe(200)
      const requests = yield* Schema.decodeUnknownEffect(Schema.Array(PermissionV1.Request))(yield* Effect.promise(() => response.json()))
      return requests.find((request) => request.sessionID === child.id && request.permission === "bash")
    }), "native shell permission was never requested", "15 seconds")
    expect(yield* f.fs.exists(path.join(f.directory, "nested"))).toBe(false)
    const approved = yield* f.request(listener, `/permission/${pending.id}/reply`, { reply: "once" })
    expect(approved.status).toBe(200)
    const tools = yield* Fiber.join(invocation)
    expect(tools.some((part) => part.state.status === "completed" && part.state.metadata.exit === 0 && part.state.output === "generated\n")).toBe(true)
    expect(yield* f.fs.readFileString(path.join(f.directory, "nested", "deep", "out.ts"))).toBe("approved")
  }), 60_000,
)

it.live("listener loopback snapshots preserve broker grants while raw TCP stays denied; unsupported hosts HOLD", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const connections = { accepted: 0 }
    const server = yield* Effect.acquireRelease(
      Effect.promise(() => new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
        const server = createServer((connection) => {
          connections.accepted++
          connection.end("listener-loopback-response")
        })
        server.once("error", reject)
        server.listen(0, "127.0.0.1", () => resolve(server))
      })),
      (server) => Effect.promise(() => new Promise<void>((resolve) => server.close(() => resolve()))),
    )
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("loopback address unavailable")
    const control = yield* Effect.promise(() => new Promise<string>((resolve, reject) => {
      const connection = createConnection({ host: "127.0.0.1", port: address.port })
      const chunks: Buffer[] = []
      connection.on("data", (chunk) => chunks.push(chunk))
      connection.on("end", () => { connection.destroy(); resolve(Buffer.concat(chunks).toString()) })
      connection.on("error", reject)
      connection.setTimeout(5000, () => { connection.destroy(); reject(new Error("loopback positive control timed out")) })
    }))
    expect(control).toBe("listener-loopback-response")
    expect(connections.accepted).toBe(1)
    yield* f.fs.writeFileString(path.join(f.directory, "probe.cjs"), `
      let siblingDenied=false;
      try{require('fs').writeFileSync('sibling','bad')}catch(e){siblingDenied=['EPERM','EACCES'].includes(e.code)};
      const read=options=>new Promise(resolve=>{const c=require('net').connect(options);let data='';
        c.on('data',chunk=>data+=chunk);c.on('end',()=>{c.destroy();resolve(data)});
        c.on('error',e=>{c.destroy();resolve(e.code)});c.setTimeout(1000,()=>{c.destroy();resolve('TIMEOUT')})});
      (async()=>{const raw=await read({host:'127.0.0.1',port:${address.port}});
        const prefix='${address.port}:';
        const route=process.env.ORCHESTRA_TCP_PROXY_ROUTES?.split(';').find(value=>value.startsWith(prefix));
        const broker=route?await read({path:Buffer.from(route.slice(prefix.length),'hex').toString('utf8')}):'NO_ROUTES';
        console.log(JSON.stringify({siblingDenied,raw,broker}));
        if(!siblingDenied||raw!=='EPERM'||broker!=='listener-loopback-response')process.exitCode=3;
      })().catch(error=>{console.error(error);process.exitCode=4});
    `)
    const grants = [{ directory: f.directory, host: "127.0.0.1" as const, port: address.port }]
    const roots = ["nested/out.ts"]
    const profile = { requireSandbox: true, writeRoots: roots, sandbox: { enabled: true, scratch: true, unconfinedFallback: true, allowedLoopbackEndpoints: grants } }
    const listener = yield* f.start(profile).pipe(Effect.tap(() => Effect.sync(() => {
      grants[0].directory = path.dirname(f.directory)
      grants[0].port = 0
      roots.push(f.directory)
    })))
    const child = yield* f.child(listener)
    const tools = yield* f.invoke(listener, child, "bash", { command: "node probe.cjs", description: "listener loopback endpoint probe", timeout: 5000 })
    if (process.platform === "darwin") {
      expect(tools.some((part) => part.state.status === "completed" && part.state.metadata.exit === 0 &&
        part.state.output === `${JSON.stringify({ siblingDenied: true, raw: "EPERM", broker: "listener-loopback-response" })}\n`)).toBe(true)
      expect(connections.accepted).toBe(2)
      expect(yield* f.fs.isDir(path.join(f.directory, "nested"))).toBe(true)
      expect(yield* f.fs.exists(path.join(f.directory, "sibling"))).toBe(false)
      return
    }
    const reason = "sandbox-loopback-endpoint-exact-policy-unsupported"
    expect(tools.some((part) => part.state.status === "error" && part.state.error.includes(`Tool safety HOLD: ${reason}`))).toBe(true)
    expect(yield* f.fs.exists(path.join(f.directory, "nested"))).toBe(false)
    expect(yield* f.fs.exists(path.join(f.directory, "sibling"))).toBe(false)
    expect(connections.accepted).toBe(1)
    console.info(`${process.platform}: real V1 child loopback grant propagated; unsupported endpoint policy HOLD measured`)
  }), 60_000,
)
