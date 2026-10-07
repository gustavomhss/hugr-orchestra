export * as OmniSmoke from "./omni-smoke"

// The packaged-app smoke (.github/workflows/omni-desktop-smoke.yml) and nothing else. It runs only when the launcher
// sets ORCHESTRA_DESKTOP_OMNI_SMOKE to a file path and the omni flag is on. It writes the local server's URL and
// credentials there, so the smoke driver can call the server API (a session shell, a terminal), plus this process's
// pid, which the driver kill -9s. Whoever sets the variable already controls this app's environment.
// With ORCHESTRA_DESKTOP_OMNI_SMOKE_ARGV (a JSON argv) it also starts that tree through the main process's own omni
// supervisor and reads its first line as bytes: the text:false path under Electron, and a main-process tree for the
// kill -9 oracle.

import { rename, writeFile } from "node:fs/promises"
import { DesktopOmni } from "./omni-process"

export async function report(server: { url: string; username: string; password: string }) {
  const file = process.env.ORCHESTRA_DESKTOP_OMNI_SMOKE
  if (!file || !DesktopOmni.enabled()) return
  const argv = JSON.parse(process.env.ORCHESTRA_DESKTOP_OMNI_SMOKE_ARGV ?? "[]") as string[]
  const main = argv.length > 0 ? await firstLine(argv) : undefined
  await writeFile(`${file}.tmp`, JSON.stringify({ ...server, pid: process.pid, main }))
  await rename(`${file}.tmp`, file)
}

async function firstLine([file, ...args]: string[]) {
  const child = DesktopOmni.spawn(file, args, { stdin: "closed" })
  const chunks: Buffer[] = []
  const line = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the smoke tree printed no line within 30 s")), 30_000)
    child.once("error", reject)
    child.once("exit", () => reject(new Error("the smoke tree exited")))
    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk)
      const text = Buffer.concat(chunks).toString("utf8")
      if (!text.includes("\n")) return
      clearTimeout(timer)
      resolve(text.slice(0, text.indexOf("\n")))
    })
  })
  return { pid: child.pid, line, bytes: chunks.every((chunk) => chunk instanceof Uint8Array) }
}
