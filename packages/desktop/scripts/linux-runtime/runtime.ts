export * as Runtime from "./runtime"

import { execFile } from "node:child_process"
import { promisify } from "node:util"

const exec = promisify(execFile)

export async function docker(args: string[], env = process.env) {
  return exec("docker", args, { env, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 })
}

export async function start(name: string, password: string) {
  await docker([
    "run", "--detach", "--init", "--name", name,
    "--label", "io.orchestra.app-dock=proof",
    "--memory", "1g", "--cpus", "2", "--pids-limit", "256", "--shm-size", "128m",
    "--publish", "127.0.0.1::14500",
    "--mount", `type=volume,source=${name},target=/home/dock`,
    "--env", "APP_DOCK_RUNTIME_PASSWORD",
    "--env", "XPRA_BATCH_MIN_DELAY", "--env", "XPRA_BATCH_START_DELAY",
    "orchestra-dock-linux:probe",
  ], { ...process.env, APP_DOCK_RUNTIME_PASSWORD: password })
  const address = (await docker(["port", name, "14500/tcp"])).stdout.trim()
  if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error("Runtime did not bind an exclusive loopback port")
  await waitFor(async () => {
    const result = await docker(["exec", name, "python3", "-c", `
import ssl, urllib.request
context = ssl.create_default_context(cafile='/home/dock/.runtime/cert.pem')
with urllib.request.urlopen('https://127.0.0.1:14500/index.html', context=context, timeout=1) as response:
    assert response.status == 200
print('ready')
`]).catch(() => undefined)
    return result?.stdout.trim() === "ready"
  }, "runtime HTTPS endpoint").catch(async (error: unknown) => {
    const logs = await docker(["logs", name])
    throw new Error(`${error}\n${logs.stdout}\n${logs.stderr}`)
  })
  const fingerprint = (await docker(["exec", name, "openssl", "x509", "-in", "/home/dock/.runtime/cert.pem", "-noout", "-fingerprint", "-sha256"])).stdout.trim().split("=")[1]!
  const url = new URL(`https://${address}/index.html`)
  url.searchParams.set("username", "dock")
  url.searchParams.set("floating_menu", "false")
  url.searchParams.set("sound", "false")
  if (process.env.APP_DOCK_PROOF_ENCODING) url.searchParams.set("encoding", process.env.APP_DOCK_PROOF_ENCODING)
  // Canvas-completion instrumentation cannot observe a worker-owned OffscreenCanvas.
  url.searchParams.set("offscreen", "0")
  return { name, password, fingerprint, url: url.toString() }
}

export async function stats(name: string) {
  const result = await docker(["exec", name, "python3", "-c", `
import json
from pathlib import Path
root = Path('/sys/fs/cgroup')
cpu = dict(line.split() for line in (root / 'cpu.stat').read_text().splitlines())
memory = dict(line.split() for line in (root / 'memory.stat').read_text().splitlines())
print(json.dumps({'cpuUsec': int(cpu['usage_usec']), 'memoryBytes': int((root / 'memory.current').read_text()), 'inactiveFileBytes': int(memory['inactive_file'])}))
`])
  return JSON.parse(result.stdout) as { cpuUsec: number; memoryBytes: number; inactiveFileBytes: number }
}

export async function vmStats() {
  if (process.platform !== "darwin") return { status: "not-measured-on-this-platform" }
  const pids = (await exec("pgrep", ["-f", "com.docker.virtualization"])).stdout.trim().split(/\s+/)
  if (!pids.length || pids.some((pid) => !/^\d+$/.test(pid))) throw new Error("Docker macOS VM process not identified")
  return { status: "observed", residentProcesses: (await exec("ps", ["-p", pids.join(","), "-o", "pid=,rss=,%cpu=,comm="])).stdout.trim() }
}

export async function waitFor(predicate: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 60_000
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

export async function remove(name: string) {
  await docker(["rm", "--force", name])
  await docker(["volume", "rm", name])
}
