// A real Node process owns recursive deletion; its live handle keeps Bun's test pending.
export async function cleanupProofRoot(root: string, stage?: (name: string, details?: unknown) => void) {
  stage?.("node-cleanup-spawn-start", { root, pid: process.pid })
  const child = Bun.spawn(["node", "-e", `
    const fs = require("node:fs")
    if (process.versions.bun) throw new Error("Cleanup requires real Node")
    console.log(JSON.stringify({ stage: "node-cleanup-start", pid: process.pid, ppid: process.ppid, node: process.versions.node }))
    fs.rmSync(process.argv[1], { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    if (fs.existsSync(process.argv[1])) throw new Error("Owned desktop proof root survived cleanup")
    console.log(JSON.stringify({ stage: "node-cleanup-done", pid: process.pid, rootExists: false }))
  `, root], { stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 20000, killSignal: "SIGKILL" })
  stage?.("node-cleanup-spawned", { pid: child.pid })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  stage?.("node-cleanup-exited", { pid: child.pid, code, signal: child.signalCode, stdout, stderr })
  if (code !== 0 || child.signalCode) throw new Error(`Owned desktop proof cleanup failed (${code}, ${child.signalCode}): ${stderr}`)
}
