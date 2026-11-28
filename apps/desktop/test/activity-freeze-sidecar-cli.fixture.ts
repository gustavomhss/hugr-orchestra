import { createServer } from "node:http"
import { writeFile } from "node:fs/promises"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { Option, Stream } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { ActivityMonitor } from "@orchestra/core/activity-monitor"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { ProcessProvenance } from "@orchestra/core/process-provenance"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { ChildProcess } from "effect/unstable/process/ChildProcess"
import { Daemon } from "../../cli/src/services/daemon"
import { serveForever } from "../../cli/src/commands/handlers/serve"

const reportPath = process.env.ORCHESTRA_ACTIVITY_E2E_REPORT
const port = Number(process.argv[process.argv.indexOf("--port") + 1])
const requestedExecutables = JSON.parse(process.env.ORCHESTRA_ACTIVITY_ISOLATED_EXECUTABLES ?? "[]") as string[]

if (!reportPath || !Number.isInteger(port) || requestedExecutables.length !== 1 || requestedExecutables[0] !== "/usr/bin/cat")
  throw new Error("activity freeze fixture configuration is incomplete")

type FixtureChild = {
  file: string
  recordID: string
  handle: import("effect/unstable/process/ChildProcessSpawner").ChildProcessHandle
}
const output = new Map<string, { values: string[]; waiters: Array<(value: string) => void> }>()

function nextOutput(name: string): Promise<string | undefined> {
  const queue = output.get(name)!
  const value = queue.values.shift()
  if (value !== undefined) return Promise.resolve(value)
  return new Promise((resolve) => {
    const received = (line: string) => {
      clearTimeout(timer)
      resolve(line)
    }
    const timer = setTimeout(() => {
      queue.waiters = queue.waiters.filter((waiter) => waiter !== received)
      resolve(undefined)
    }, 750)
    queue.waiters.push(received)
  })
}

const fixture = serveForever({
  hostname: "127.0.0.1",
  port: Option.some(port),
  register: false,
  activityApprovalStdin: true,
  onListening: () => Effect.gen(function* () {
    const spawnerLayer = AppNodeBuilder.build(LayerNode.group([CrossSpawnSpawner.node]))
    const spawnerContext = yield* Layer.build(spawnerLayer)
    const spawner = Context.get(spawnerContext, ChildProcessSpawner)
    const spawn = (file: string, name: string) => Effect.gen(function* () {
      const ready = yield* Deferred.make<FixtureChild, unknown>()
      yield* Effect.forkScoped(Effect.gen(function* () {
        const handle = yield* spawner.spawn(ChildProcess.make(file, [], {
          cwd: "/tmp",
          env: { PATH: process.env.PATH ?? "" },
          extendEnv: false,
          stdin: { stream: "pipe", endOnDone: false },
          stdout: "pipe",
          stderr: "ignore",
        }))
        const recordID = ActivityMonitor.snapshot().records.find((record) => record.pid === Number(handle.pid))?.recordID
        if (!recordID) throw new Error(`production process spawner did not register ${file}`)
        const child = { file, recordID, handle }
        yield* Deferred.succeed(ready, child)
        const queue = { values: [] as string[], waiters: [] as Array<(value: string) => void>, partial: "" }
        output.set(name, queue)
        yield* Stream.runForEach(handle.stdout, (chunk) => Effect.sync(() => {
          queue.partial += Buffer.from(chunk).toString("utf8")
          for (const line of queue.partial.split("\n").slice(0, -1)) {
            const value = `${line}\n`
            const waiter = queue.waiters.shift()
            if (waiter) waiter(value)
            else queue.values.push(value)
          }
          queue.partial = queue.partial.slice(queue.partial.lastIndexOf("\n") + 1)
        }))
      }).pipe(
        Effect.provideService(ProcessProvenance.Owner, Effect.succeed("activity-freeze-sidecar-fixture")),
        Effect.catchCause((cause) => Effect.asVoid(Deferred.failCause(ready, cause))),
      ))
      return yield* Deferred.await(ready)
    })

    const selected = yield* spawn("/usr/bin/cat", "selected")
    const sibling = yield* spawn("/bin/cat", "sibling")
    const selectedControl = yield* Effect.promise(() => ActivityMonitor.freeze(selected.recordID))
    const siblingControl = yield* Effect.promise(() => ActivityMonitor.freeze(sibling.recordID))
    if (!selectedControl?.member || siblingControl) throw new Error("executable selection did not isolate only /usr/bin/cat")
    const control = createServer(async (request, response) => {
      const name = new URL(request.url ?? "/", "http://127.0.0.1").pathname.slice(1)
      const target = name === "selected" ? selected : name === "sibling" ? sibling : undefined
      if (!target || request.method !== "POST") {
        response.writeHead(404).end()
        return
      }
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      if (chunks.length) await Effect.runPromise(Stream.run(Stream.make(Buffer.concat(chunks)), target.handle.stdin))
      const result = await nextOutput(name)
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(
        result === undefined ? { timeout: true } : { result },
      ))
    })
    yield* Effect.promise(() => new Promise<void>((resolve, reject) => {
      control.once("error", reject)
      control.listen(0, "127.0.0.1", resolve)
    }))
    const address = control.address()
    if (!address || typeof address === "string") throw new Error("fixture control listener failed")
    yield* Effect.promise(() => writeFile(reportPath!, JSON.stringify({
      controlPort: address.port,
      selected: { file: selected.file, recordID: selected.recordID, pid: Number(selected.handle.pid), member: selectedControl.member },
      sibling: { file: sibling.file, recordID: sibling.recordID, pid: Number(sibling.handle.pid) },
      uid: process.getuid?.(),
      inheritedOmniVariables: Object.keys(process.env).filter((key) => key.toUpperCase().startsWith("HUGR_OMNI_")),
    })))
    yield* Effect.addFinalizer(() => Effect.promise(() => new Promise<void>((resolve) => control.close(() => resolve()))))
  }),
})

fixture.pipe(
  Effect.provide(Daemon.layer),
  Effect.provide(NodeServices.layer),
  Effect.scoped,
  NodeRuntime.runMain,
)

