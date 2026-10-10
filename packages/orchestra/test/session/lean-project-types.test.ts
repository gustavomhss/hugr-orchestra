import { test } from "bun:test"
import path from "node:path"

test("actual Lean Orchestra and SDK package typechecks run in CI", async () => {
  if (!process.env.GITHUB_RUN_ID) throw new Error("Package typechecks require CI")
  for (const directory of ["orchestra", "sdk/js"]) {
    const proc = Bun.spawn(["bun", "typecheck"], {
      cwd: path.resolve(import.meta.dir, "../../..", directory), stdout: "pipe", stderr: "pipe", timeout: 240000,
    })
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
    if (code !== 0) throw new Error(`${directory} typecheck exited ${code}/${proc.signalCode}\n${stdout}\n${stderr}`)
  }
}, 600000)
