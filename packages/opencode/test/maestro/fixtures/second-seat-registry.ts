// Fresh-process source snapshot: scaffold a real second seat, then resolve the registry from that snapshot.
// Runtime services remain real. Optional mutation changes only the copied Task source, never the working tree.
import { plugin } from "bun"
import { afterAll } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { add } from "../../../script/seat"

const snapshot = await fs.mkdtemp(path.join(os.tmpdir(), "second-seat-source-"))
afterAll(() => fs.rm(snapshot, { recursive: true, force: true }))
const source = path.resolve(import.meta.dirname, "../../..")
const packageRoot = path.join(snapshot, "packages/opencode")
await fs.cp(path.join(source, "src/maestro/seats"), path.join(packageRoot, "src/maestro/seats"), { recursive: true })
await fs.cp(path.join(source, "src/agent/prompt"), path.join(packageRoot, "src/agent/prompt"), { recursive: true })
await fs.cp(path.resolve(source, "../backend-specialist"), path.join(snapshot, "packages/backend-specialist"), { recursive: true })
await add("sample-seat", "synthetic packet execution", packageRoot)
const registrySource = (await Bun.file(path.join(packageRoot, "src/maestro/seats/index.ts")).text())
  .replaceAll('from "./', `from "${path.join(packageRoot, "src/maestro/seats").replaceAll("\\", "/")}/`)

const taskSource = await Bun.file(path.join(source, "src/tool/task.ts")).text()
const binding = "const seat = next.native === true ? Seats.find(nextID) : undefined"
const mutation = "const seat = nextID === \"backend\" ? Seats.find(nextID) : undefined"
if (process.env.ORCHESTRA_SEAT_MUTATION === "backend-only-task") {
  if (taskSource.split(binding).length !== 2) throw new Error("Second-seat mutation target missing or duplicated")
  await Bun.write(path.join(packageRoot, "src/tool/task.ts"), taskSource.replace(binding, mutation))
}

plugin({
  name: "second-seat-source-snapshot",
  setup(build) {
    build.onLoad({ filter: /[\\/]maestro[\\/]seats[\\/]index\.ts$/ }, () => ({ loader: "ts", contents: registrySource }))
    if (process.env.ORCHESTRA_SEAT_MUTATION === "backend-only-task") {
      build.onLoad({ filter: /[\\/]src[\\/]tool[\\/]task\.ts$/ }, async () => ({
        loader: "ts", contents: await Bun.file(path.join(packageRoot, "src/tool/task.ts")).text(),
      }))
    }
  },
})

if (process.env.ORCHESTRA_SEAT_EMBEDDED === "1") {
  const { seatSkillsModule } = await import("../../../script/seat-skills")
  const contents = await seatSkillsModule()
  plugin({
    name: "second-seat-compiled-skills",
    setup(build) {
      build.module("opencode-seat-skills.gen.ts", () => ({ loader: "js", contents }))
    },
  })
}
