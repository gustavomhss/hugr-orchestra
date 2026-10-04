import { spawn, type ChildProcess } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"
import { mkdtemp } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Runtime } from "./runtime"

const directory = await mkdtemp(join(process.env.APP_DOCK_PROOF_TMP ?? tmpdir(), "orchestra-dock-linux-"))
const name = `orchestra-dock-proof-${randomUUID()}`
const errors: unknown[] = []
const lifecycle = { interrupted: false, child: undefined as ChildProcess | undefined }
const interrupt = () => {
  lifecycle.interrupted = true
  lifecycle.child?.kill("SIGTERM")
}
process.once("SIGINT", interrupt)
process.once("SIGTERM", interrupt)
await Bun.write(join(directory, "ownership.json"), JSON.stringify({ name, label: "io.orchestra.app-dock=proof" }))
try {
  const runtime = await Runtime.start(name, randomBytes(32).toString("hex"))
  if (lifecycle.interrupted) throw new Error("Linux App Dock proof interrupted")
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "host.ts")],
    outdir: directory,
    naming: "host.cjs",
    target: "node",
    format: "cjs",
    external: ["electron"],
    write: true,
  })
  if (!result.success || !result.outputs[0]) throw new Error("Linux App Dock proof bundle failed")
  const electron = process.env.APP_DOCK_ELECTRON ?? join(
    dirname(createRequire(join(process.cwd(), "package.json")).resolve("electron")),
    process.platform === "darwin" ? "dist/Electron.app/Contents/MacOS/Electron" : process.platform === "win32" ? "dist/electron.exe" : "dist/electron",
  )
  const child = spawn(electron, [result.outputs[0].path], {
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      APP_DOCK_PROOF_ROOT: directory,
      APP_DOCK_PROOF_CONTAINER: runtime.name,
      APP_DOCK_PROOF_URL: runtime.url,
      APP_DOCK_PROOF_PASSWORD: runtime.password,
      APP_DOCK_PROOF_FINGERPRINT: runtime.fingerprint,
    },
  })
  lifecycle.child = child
  const exit = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", resolve)
  })
  if (exit !== 0) throw new Error(`Linux App Dock proof exited with ${exit}; diagnostics: ${directory}`)
  console.log(await Bun.file(join(directory, "report.json")).text())
  console.log(`Evidence: ${directory}`)
} catch (error) {
  errors.push(error)
  console.error(`Evidence: ${directory}`)
} finally {
  await Runtime.remove(name).catch((error: unknown) => errors.push(error))
  process.off("SIGINT", interrupt)
  process.off("SIGTERM", interrupt)
}
if (errors.length) throw new AggregateError(errors, "Linux App Dock proof or cleanup failed")
