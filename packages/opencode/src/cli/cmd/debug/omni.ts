import { randomUUID } from "node:crypto"
import { EOL } from "node:os"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Omni } from "@opencode-ai/core/omni"
import { cmd } from "../cmd"

// A two-process tree whose argv carries the nonce: the root starts one child, and prints `ready` once it runs.
const TREE = `
const [nonce, depth] = process.argv.slice(-2)
setInterval(() => {}, 1 << 30)
if (depth === "0") console.log("ready " + nonce)
else {
  const child = process.getBuiltinModule("node:child_process").spawn(process.execPath, ["-e", process.argv[process.argv.length - 3], nonce, "0"], { stdio: ["ignore", "pipe", "inherit"], windowsHide: true })
  child.stdout.pipe(process.stdout)
}
`

export const OmniCommand = cmd({
  command: "omni",
  describe: "show the process spawner in use (omni or legacy) and run a test process tree through omni",
  builder: (yargs) =>
    yargs.option("hold", {
      type: "boolean",
      default: false,
      describe: "start the nonce tree, print `holding <nonce> pid=<this process>` and keep it alive until killed",
    }),
  async handler(args) {
    const print = (line: string) => process.stdout.write(line + EOL)
    const mode = Flag.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER
    print(`path: ${mode === "off" ? "legacy" : "omni"} (OPENCODE_EXPERIMENTAL_OMNI_SPAWNER=${mode})`)
    const found = (() => {
      try {
        return Omni.locate()
      } catch (error) {
        print(`omni: not found: ${error instanceof Error ? error.message : String(error)}`)
        return undefined
      }
    })()
    if (!found) {
      process.exitCode = mode === "off" ? 0 : 1
      return
    }
    print(`addon: ${found.addon}`)
    print(`supervisor: ${found.supervisor}`)
    if (args.hold) return hold(print)
    const result = await tree().catch((error: unknown) => `failed: ${error instanceof Error ? error.message : error}`)
    print(`nonce tree: ${result}`)
    const counts = Omni.snapshot()
    print(`counters: spawns=${counts.spawns} delegations=${counts.delegations}`)
    if (result !== "ok") process.exitCode = 1
  },
})

/** Starts the nonce tree and never returns: crash smokes kill this process and expect the tree to go with it. */
async function hold(print: (line: string) => void) {
  const nonce = `omni-debug-${randomUUID()}`
  const child = await start(nonce)
  for await (const line of child.lines()) if (line.text === `ready ${nonce}`) break
  print(`holding ${nonce} pid=${process.pid}`)
  setInterval(() => {}, 1 << 30)
  await new Promise(() => {})
}

async function start(nonce: string) {
  const binding = await Omni.load()
  const child = binding.spawn(process.execPath, ["-e", TREE, TREE, nonce, "1"], {
    inheritEnv: false,
    // A compiled CLI runs scripts only as bun.
    env: Omni.childEnv({ BUN_BE_BUN: "1" }),
  })
  Omni.count("spawns")
  return child
}

/** Starts the nonce tree through omni, checks both processes are in the tree, stops it, and checks it is gone. */
async function tree() {
  const nonce = `omni-debug-${randomUUID()}`
  await using child = await start(nonce)
  const timer = setTimeout(() => void child.stop(), 20_000)
  try {
    for await (const line of child.lines()) if (line.text === `ready ${nonce}`) break
    const before = (await child.processes()).length
    if (before < 2) return `expected 2 processes, saw ${before}`
    await child.stop()
    const after = (await child.processes()).length
    return after === 0 ? "ok" : `${after} process(es) left after stop`
  } finally {
    clearTimeout(timer)
  }
}
