import { afterAll, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { smoke } from "./node/smoke"

// The desktop server runs the engine under Node, in an Electron utilityProcess (packages/desktop/src/main/server.ts;
// Electron 42.3.3 ships Node 24.15.0). Node cannot load these sources as they are: relative imports carry no file
// extension, which Node's ESM resolver requires. So the smoke entry is bundled the way packages/opencode/script/
// build-node.ts bundles the desktop server (Bun.build, target node, where `#sqlite` takes its `node` condition) and run
// by the `node` on PATH. A missing or too old Node fails here; it never skips.

const root = mkdtempSync(path.join(os.tmpdir(), "relay-node-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

// node:sqlite without a flag and DatabaseSync.isTransaction.
const MINIMUM = [22, 16] as const

test("the engine runs under Node: ledger, store, check and hook agree with Bun", async () => {
  const node = Bun.which("node")
  if (node === null) throw new Error("node is not on PATH; the Node smoke cannot run")
  const version = (await run([node, "-p", "process.versions.node"])).stdout.trim()
  const [major = 0, minor = 0] = version.split(".").map(Number)
  if (major < MINIMUM[0] || (major === MINIMUM[0] && minor < MINIMUM[1]))
    throw new Error(`node ${version} is older than ${MINIMUM.join(".")}`)

  const built = await Bun.build({
    entrypoints: [path.join(import.meta.dir, "node", "main.ts")],
    outdir: path.join(root, "build"),
    target: "node",
    format: "esm",
  })
  expect(built.logs.map(String)).toEqual([])
  expect(built.success).toBe(true)
  const bundle = built.outputs[0]!.path
  const source = await Bun.file(bundle).text()
  expect(source).toContain(`from "node:sqlite"`)
  expect(source).not.toContain("bun:sqlite")

  const nodeDir = path.join(root, "node")
  mkdirSync(nodeDir)
  const child = await run([node, bundle, nodeDir])
  if (child.exitCode !== 0) throw new Error(`node exited ${child.exitCode}:\n${child.stderr}`)
  const reported = JSON.parse(child.stdout)
  expect(reported.runtime).toEqual({ name: "node", bun: false, node: version })

  const bunDir = path.join(root, "bun")
  mkdirSync(bunDir)
  const local = await Effect.runPromise(smoke(bunDir))
  expect(reported.summary).toEqual(JSON.parse(JSON.stringify(local)))
  expect(local).toMatchObject({
    ledger: { seq: [0, 1], verify: { exit: 0, stderr: "" } },
    store: { published: true, versions: 1, reopened: true },
    check: { outcome: "check", i: 0, wp: "wp1", failing: ["B"] },
    hook: [["b:block"], ["a:allow"], ["b:block"]],
  })
  expect(local.ledger.verify.stdout).toStartWith("LEDGER INTACT — 2 chained entries [KEYED (HMAC-SHA256)]")
}, 120_000)

async function run(argv: ReadonlyArray<string>) {
  const proc = Bun.spawn([...argv], { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited])
  return { stdout, stderr, exitCode }
}
