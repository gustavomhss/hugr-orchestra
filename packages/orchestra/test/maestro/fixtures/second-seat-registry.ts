// Fresh-process source snapshot: scaffold a real second seat, then resolve the registry from that snapshot.
// Runtime services remain real. Optional mutation changes only the copied Task source, never the working tree.
import { plugin, type BunPlugin } from "bun"
import fs from "node:fs/promises"
import path from "node:path"

// Parent owns this directory, including cleanup after timeout/kill.
const snapshot = process.env.ORCHESTRA_SEAT_SNAPSHOT
if (!snapshot) throw new Error("Second-seat parent-owned snapshot missing")
const source = path.resolve(import.meta.dirname, "../../..")
const packageRoot = path.join(snapshot, "packages/orchestra")
await fs.cp(path.join(source, "src/maestro/seats"), path.join(packageRoot, "src/maestro/seats"), { recursive: true })
await fs.cp(path.join(source, "src/agent/prompt"), path.join(packageRoot, "src/agent/prompt"), { recursive: true })
await fs.cp(path.resolve(source, "../backend-specialist"), path.join(snapshot, "packages/backend-specialist"), { recursive: true })
// The scaffold validates canonical identity through the live roster. Run it in a separate process so that
// validation cannot cache this process's registry before the synthetic registry loader is registered.
const scaffold = Bun.spawn([process.execPath, "-e", `const { add } = await import(${JSON.stringify(path.join(source, "script/seat.ts"))}); await add("sample-seat", "synthetic packet execution", process.argv[1])`, packageRoot], {
  cwd: source, stdout: "pipe", stderr: "pipe", env: process.env,
})
const [scaffoldOut, scaffoldErr, scaffoldExit] = await Promise.all([
  new Response(scaffold.stdout).text(), new Response(scaffold.stderr).text(), scaffold.exited,
])
if (scaffoldExit !== 0) throw new Error(`Second-seat scaffold failed (${scaffoldExit}):\n${scaffoldOut}\n${scaffoldErr}`)
process.env.ORCHESTRA_SEAT_SKILL_BYTES = await Bun.file(path.join(snapshot, "packages/sample-seat-specialist/skills/sample-seat-work/SKILL.md")).text()
const registrySource = (await Bun.file(path.join(packageRoot, "src/maestro/seats/index.ts")).text())
  .replaceAll('from "./', `from "${path.join(packageRoot, "src/maestro/seats").replaceAll("\\", "/")}/`)

const taskSource = await Bun.file(path.join(source, "src/tool/task.ts")).text()
const binding = "const seat = next.native === true ? Seats.find(nextID) : undefined"
const mutation = "const seat = nextID === \"backend\" ? Seats.find(nextID) : undefined"
if (process.env.ORCHESTRA_SEAT_MUTATION === "backend-only-task") {
  if (taskSource.split(binding).length !== 2) throw new Error("Second-seat mutation target missing or duplicated")
  await Bun.write(path.join(packageRoot, "src/tool/task.ts"), taskSource.replace(binding, mutation))
}

export const snapshotPlugin: BunPlugin = {
  name: "second-seat-source-snapshot",
  setup(build) {
    build.onLoad({ filter: /[\\/]maestro[\\/]seats[\\/]index\.ts$/ }, () => ({ loader: "ts", contents: registrySource }))
    if (process.env.ORCHESTRA_SEAT_MUTATION === "backend-only-task") {
      build.onLoad({ filter: /[\\/]src[\\/]tool[\\/]task\.ts$/ }, async () => ({
        loader: "ts", contents: await Bun.file(path.join(packageRoot, "src/tool/task.ts")).text(),
      }))
    }
  },
}
plugin(snapshotPlugin)
