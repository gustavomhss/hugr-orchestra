// A real Node process owns recursive deletion; its live handle keeps Bun's test pending.
export async function cleanupProofRoot(root: string) {
  const child = Bun.spawn(["node", "-e", `
    const fs = require("node:fs")
    if (process.versions.bun) throw new Error("Cleanup requires real Node")
    fs.rmSync(process.argv[1], { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    if (fs.existsSync(process.argv[1])) throw new Error("Owned desktop proof root survived cleanup")
  `, root], { stdin: "ignore", stdout: "ignore", stderr: "pipe", timeout: 20000, killSignal: "SIGKILL" })
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  if (code !== 0 || child.signalCode) throw new Error(`Owned desktop proof cleanup failed (${code}, ${child.signalCode}): ${stderr}`)
}
