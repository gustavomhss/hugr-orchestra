// Packaged-app crash smoke (integration plan WP4; .github/workflows/omni-desktop-smoke.yml). Launches a packaged
// desktop app with ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=1, starts three nonce trees (process-tree.ts) and kill -9s the
// Electron main process; then no process of any tree may be left 8 s later.
//   main      the main process's own omni (ORCHESTRA_DESKTOP_OMNI_SMOKE_ARGV, read as bytes: text:false in Electron)
//   shell     the server's session shell (POST /session/:id/shell), the bash tool's spawner, in the utilityProcess
//   terminal  the server's terminal (POST /pty) in the utilityProcess
// Positive control: before the kill, every required tree must have a hugr-omni-supervisor among its ancestors, so a
// green run cannot come from a legacy spawn that happened to die. The server URL and credentials come from the
// smoke-only hook in src/main/omni-smoke.ts.
//
// Usage: bun test/omni-smoke/packaged.ts <app executable> [--require main,shell,terminal]
// On Linux the app runs under `xvfb-run -a`.

import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { alive, reap, sweep, tree } from "../../../core/test/fixture/process-tree"

const executable = process.argv[2]
if (!executable || !existsSync(executable)) throw new Error(`usage: packaged.ts <app executable>; got ${executable}`)
const flag = process.argv.indexOf("--require")
const required = (flag > 0 ? process.argv[flag + 1] : "main,shell,terminal").split(",")
const trees = { main: tree(2), shell: tree(2), terminal: tree(2) }
const home = await mkdtemp(path.join(os.tmpdir(), "omni-desktop-smoke-"))
const report = path.join(home, "smoke.json")
const launcher = process.platform === "linux" ? ["xvfb-run", "-a", executable] : [executable]
const app = spawn(launcher[0], [...launcher.slice(1), "--no-sandbox"], {
  env: {
    ...process.env,
    ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "1",
    // The app's own isolation switch: a temporary userData, XDG directories and an in-memory database.
    ORCHESTRA_TEST_ONBOARDING: "1",
    ORCHESTRA_DESKTOP_OMNI_SMOKE: report,
    ORCHESTRA_DESKTOP_OMNI_SMOKE_ARGV: JSON.stringify([trees.main.command, ...trees.main.args]),
    XDG_CONFIG_HOME: path.join(home, "config"),
    XDG_DATA_HOME: path.join(home, "data"),
    XDG_STATE_HOME: path.join(home, "state"),
    XDG_CACHE_HOME: path.join(home, "cache"),
  },
  stdio: ["ignore", "inherit", "inherit"],
})
const failures: string[] = []

try {
  const server = await until(120_000, "the app's smoke report", () =>
    existsSync(report)
      ? (JSON.parse(readFileSync(report, "utf8")) as {
          url: string
          username: string
          password: string
          pid: number
          main?: { line: string; bytes: boolean }
        })
      : undefined,
  )
  if (server.main?.line !== trees.main.ready || !server.main.bytes)
    failures.push(`main: expected "${trees.main.ready}" as bytes, got ${JSON.stringify(server.main)}`)
  const authorization = `Basic ${Buffer.from(`${server.username}:${server.password}`).toString("base64")}`
  const call = (route: string, body: unknown) =>
    fetch(new URL(route, server.url), {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  const session = (await (await call("/session", {})).json()) as { id: string }
  // The shell route needs an existing agent. GET /agent lists the default agent first; agent names change upstream
  // (dev dropped "build" for "maestro"), so the smoke asks instead of naming one.
  const agents = (await (await fetch(new URL("/agent", server.url), { headers: { authorization } })).json()) as {
    name: string
  }[]
  const agent = agents[0]?.name
  if (!agent) throw new Error(`GET /agent listed no agent: ${JSON.stringify(agents)}`)
  // The shell call returns only when the tree ends, so it is not awaited; an early answer is kept as evidence.
  let shellAnswer = "no answer yet"
  void call(`/session/${session.id}/shell`, {
    agent,
    model: { providerID: "opencode", modelID: "smoke" },
    command: [trees.shell.command, ...trees.shell.args].map(quote).join(" "),
  })
    .then(async (response) => (shellAnswer = `${response.status} ${(await response.text()).slice(0, 2000)}`))
    .catch((error) => (shellAnswer = `request failed: ${String(error)}`))
  const pty = await call("/pty", { command: trees.terminal.command, args: trees.terminal.args })
  if (!pty.ok) failures.push(`terminal: POST /pty answered ${pty.status} ${await pty.text()}`)

  for (const [name, created] of Object.entries(trees)) {
    if (!required.includes(name)) continue
    const count = await until(60_000, `${name} tree`, async () =>
      (await alive(created.nonce)) === created.size ? created.size : undefined,
    ).catch(() => 0)
    if (count !== created.size) {
      failures.push(`${name}: the tree never started (${count}/${created.size})`)
      if (name === "shell") {
        failures.push(`shell: POST /session/:id/shell: ${shellAnswer}`)
        const messages = await fetch(new URL(`/session/${session.id}/message`, server.url), {
          headers: { authorization },
        }).then((response) => response.text(), String)
        failures.push(`shell: the session's messages: ${messages.slice(0, 4000)}`)
      }
    }
    else if (!supervised(created.nonce)) failures.push(`${name}: no hugr-omni-supervisor above the tree (legacy spawn)`)
  }

  process.kill(server.pid, "SIGKILL")
  console.log(`smoke: kill -9 of the Electron main process ${server.pid}`)
  await new Promise((resolve) => setTimeout(resolve, 8000))
  for (const [name, created] of Object.entries(trees)) {
    const left = [await alive(created.nonce), (await sweep(created.nonce)).length]
    console.log(`smoke: ${name}: ${left[0]} recorded, ${left[1]} in the process table, 8 s after the kill`)
    if (required.includes(name) && Math.max(...left) > 0) failures.push(`${name}: ${Math.max(...left)} processes left`)
  }
} catch (error) {
  failures.push(String(error))
} finally {
  app.kill("SIGKILL")
  await Promise.all(Object.values(trees).map((created) => reap(created.nonce).catch(() => undefined)))
}

if (failures.length > 0) {
  console.error(["smoke: FAILED", ...failures.map((failure) => `  ${failure}`)].join("\n"))
  process.exit(1)
}
console.log(`smoke: PASS (${required.join(", ")})`)
process.exit(0)

async function until<T>(timeoutMs: number, what: string, probe: () => T | undefined | Promise<T | undefined>) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await probe()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

/** Some process carrying the nonce has a hugr-omni-supervisor ancestor (ps, so Linux and macOS alike). */
function supervised(nonce: string) {
  const table = spawnSync("ps", ["-A", "-ww", "-o", "pid=,ppid=,args="], { encoding: "utf8" }).stdout
  const rows = new Map(
    table
      .split("\n")
      .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
      .filter((match) => match !== null)
      .map((match) => [Number(match[1]), { parent: Number(match[2]), args: match[3] }] as const),
  )
  const ancestors = (pid: number): string[] => {
    const row = rows.get(pid)
    if (!row || row.parent <= 1) return []
    return [rows.get(row.parent)?.args ?? "", ...ancestors(row.parent)]
  }
  return [...rows]
    .filter(([, row]) => row.args.includes(nonce))
    .some(([pid]) => ancestors(pid).some((args) => /(^|\/)hugr-omni-supervisor(\s|$)/.test(args)))
}

function quote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}
