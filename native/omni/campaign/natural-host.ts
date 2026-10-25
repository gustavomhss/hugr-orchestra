// Controlled host for the V2 natural-exit proof. It composes the unchanged production modules a V2 process owns for
// child processes (core AppProcess over omni, and the omni binding itself), activates them, disposes them, and then
// must end with no help: no exit hook, forced exit, watchdog or unref belongs here. The parent owns failure cleanup.
import { createServer } from "node:http"
import { writeFileSync } from "node:fs"
import { Effect, ManagedRuntime, ChildProcess } from "@orchestra/core/test/fixture/omni-effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppProcess } from "@orchestra/core/process"
import { Omni } from "@orchestra/core/omni"

type Stoppable = { pid: number | undefined; output: AsyncIterable<{ data: Uint8Array }>; stop: (options: { graceMs: number }) => Promise<unknown> }

// Retain completed native objects and their output through the host's lifetime. Neither GC nor unref is part of disposal.
const retained: { pipe?: Stoppable; pump?: Promise<void>; chunks?: Uint8Array[]; app?: { stdout: string; stderr: string } }[] = []
const processes = ManagedRuntime.make(LayerNode.compile(AppProcess.node))
const node = process.env.NATURAL_NODE!
const requests: string[] = []

async function activate() {
  const app = await processes.runPromise(
    Effect.gen(function* () {
      const service = yield* AppProcess.Service
      return yield* service.run(
        ChildProcess.make(node, ["-e", "process.stdout.write('APP_PROCESS_READY');process.stderr.write('APP_PROCESS_STDERR')"]),
      )
    }),
  )
  retained.push({ app: { stdout: app.stdout.toString(), stderr: app.stderr.toString() } })
  const binding = await Omni.load()
  const spawn = (command: string, args: string[], stdin: "pipe" | "closed") =>
    binding.spawn(command, args, { stdin, text: false, inheritEnv: false, env: Omni.childEnv(), backpressure: true }) as unknown as Stoppable
  const pipe = spawn(node, ["-e", "process.stdout.write('NATIVE_OUTPUT_READY\\n');process.stdin.resume()", process.env.NATURAL_NATIVE_NONCE!], "pipe")
  const chunks: Uint8Array[] = []
  const pump = (async () => {
    for await (const chunk of pipe.output) chunks.push(chunk.data)
  })()
  retained.push({ pipe, pump, chunks })
  const tree = JSON.parse(process.env.NATURAL_TREE!) as { command: string; args: string[] }
  const treePipe = spawn(tree.command, tree.args, "closed")
  const treeChunks: Uint8Array[] = []
  retained.push({ pipe: treePipe, pump: (async () => { for await (const chunk of treePipe.output) treeChunks.push(chunk.data) })(), chunks: treeChunks })
  return { app: { exitCode: app.exitCode, ...retained[0]!.app }, nativePID: pipe.pid, treePID: treePipe.pid, counts: Omni.snapshot() }
}

async function dispose() {
  console.log("NATURAL_EVENT " + JSON.stringify({ event: "dispose-started", pid: process.pid }))
  for (const value of retained) if (value.pipe) await value.pipe.stop({ graceMs: 100 })
  for (const value of retained) await value.pump
  await processes.dispose()
  console.log("NATURAL_RETAINED " + JSON.stringify(retained.map((value) => value.pipe ? { pid: value.pipe.pid, chunks: value.chunks!.map((chunk) => Buffer.from(chunk).toString()) } : value.app)))
}

const control = createServer((req, res) => {
  requests.push(`${req.method} ${req.url}`)
  if (req.method !== "POST" || !["/write", "/dispose"].includes(req.url ?? "")) {
    res.writeHead(404).end()
    return
  }
  const action = req.url === "/write" ? activate() : dispose().then(() => ({ disposed: true }))
  void action.then((result) => {
    res.setHeader("content-type", "application/json")
    res.end(JSON.stringify(result))
    if (req.url !== "/dispose") return
    const evidence = { event: "disposed", pid: process.pid, requests, resources: process.getActiveResourcesInfo() }
    writeFileSync(process.env.NATURAL_DISPOSED!, JSON.stringify(evidence))
    console.log("NATURAL_EVENT " + JSON.stringify(evidence))
    // The mutation changes only the event-loop boundary, after the very same real disposal.
    if (process.env.NATURAL_MUTATION === "timer") setInterval(() => {}, 1000)
    control.close()
    control.closeIdleConnections()
  }, (error: unknown) => {
    console.error("NATURAL_FAILURE " + String(error))
    process.exitCode = 1
    res.writeHead(500).end(String(error))
    control.close()
  })
})
await new Promise<void>((resolve) => control.listen(0, "127.0.0.1", resolve))
const address = control.address()
if (!address || typeof address === "string") throw new Error("Natural host control has no TCP address")
console.log("NATURAL_READY " + JSON.stringify({ pid: process.pid, control: `http://127.0.0.1:${address.port}`, runtime: process.versions }))
