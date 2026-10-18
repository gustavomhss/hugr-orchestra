// Dedicated hosted proof: excluded from ordinary Bun suffix discovery, selected by its exact path.
// Workspace programs that a sandboxed command could have planted (a language server binary, a formatter binary, a
// formatter config that runs code) start confined: they cannot write outside what they format or reach the network.
// macOS runs them under seatbelt. On Linux CI this file relaxes the runner's AppArmor user-namespace restriction for
// bubblewrap and installs the sandbox's system dependencies when absent; the pinned sandbox runtime is fetched by the
// product itself. Windows has no backend for them yet and must refuse.
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { NodeFileSystem } from "@effect/platform-node"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { rm, symlink } from "node:fs/promises"
import { createServer } from "node:net"
import os from "node:os"
import path from "node:path"
import { Effect, Fiber, Layer } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Format } from "../../src/format"
import { LSP } from "../../src/lsp/lsp"
import { confined, spawn, type Child } from "../../src/lsp/launch"
import { TestInstance } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"

const lsp = testEffect(LayerNode.compile(LSP.node))
const format = testEffect(
  Layer.mergeAll(LayerNode.compile(LayerNode.group([Format.node, CrossSpawnSpawner.node])), NodeFileSystem.layer),
)
const confinable = process.platform === "darwin" || process.platform === "linux"
const confinedLsp = confinable ? lsp.instance : lsp.instance.skip
const confinedFormat = confinable ? format.instance : format.instance.skip
const windowsFormat = process.platform === "win32" ? format.instance : format.instance.skip

// A host loopback service the confined programs try to reach, and a host directory outside every workspace.
let connections = 0
const listener = createServer((socket) => {
  connections++
  socket.destroy()
})
const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), "workspace-sandbox-outside-")))
const marker = path.join(outside, "escaped")
// Host-side programs a test puts first on PATH: a version-manager shim directory and a fake package runner.
const tools = realpathSync(mkdtempSync(path.join(os.tmpdir(), "workspace-sandbox-tools-")))
let port = 0

beforeAll(async () => {
  if (process.platform === "linux") {
    if (process.env.CI !== "true") throw new Error("the Linux proof prepares its host and runs only on CI")
    host(["sudo", "sysctl", "-w", "kernel.apparmor_restrict_unprivileged_userns=0"])
    if (!Bun.which("bwrap") || !Bun.which("socat"))
      host(["sudo", "apt-get", "install", "-y", "--no-install-recommends", "bubblewrap", "socat"])
  }
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve))
  port = (listener.address() as { port: number }).port
})

afterAll(() => {
  listener.close()
  rmSync(outside, { recursive: true, force: true })
  rmSync(tools, { recursive: true, force: true })
})

// Runs the effect with `directory` first on PATH, then restores PATH.
const onPath = <A, E, R>(directory: string, effect: Effect.Effect<A, E, R>) =>
  Effect.suspend(() => {
    const previous = process.env.PATH
    process.env.PATH = `${directory}${path.delimiter}${previous}`
    return effect.pipe(Effect.ensuring(Effect.sync(() => void (process.env.PATH = previous))))
  })

function program(file: string, body: string) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `#!/bin/sh\n${body}`)
  chmodSync(file, 0o755)
}

function host(cmd: string[]) {
  const result = Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" })
  if (result.exitCode !== 0) throw new Error(`host setup failed: ${cmd.join(" ")}`)
}

// Shell probes: write outside the workspace, write a workspace file it was not asked to touch, and reach the host
// service (the host counts connections; a reply is not needed).
const probes = (workspace: string) => `
( echo escaped > "${marker}" ) 2>/dev/null && out=written || out=denied
( echo planted > "${path.join(workspace, "planted.txt")}" ) 2>/dev/null && sibling=written || sibling=denied
curl -s --max-time 5 "http://127.0.0.1:${port}/" >/dev/null 2>&1
probe="out=$out sibling=$sibling"
`

// Answers initialize and publishes argv[2] as a diagnostic on every opened document.
const SERVER = `
const message = process.argv[2]
let pending = Buffer.alloc(0)
const send = (body) => {
  const json = JSON.stringify(body)
  process.stdout.write("Content-Length: " + Buffer.byteLength(json) + "\\r\\n\\r\\n" + json)
}
process.stdin.on("data", (chunk) => {
  pending = Buffer.concat([pending, chunk])
  for (;;) {
    const end = pending.indexOf("\\r\\n\\r\\n")
    if (end < 0) return
    const length = Number(pending.subarray(0, end).toString().match(/Content-Length: (\\d+)/i)[1])
    if (pending.length < end + 4 + length) return
    const data = JSON.parse(pending.subarray(end + 4, end + 4 + length).toString())
    pending = pending.subarray(end + 4 + length)
    if (data.method === "initialize") send({ jsonrpc: "2.0", id: data.id, result: { capabilities: { textDocumentSync: 1 } } })
    else if (data.id !== undefined && data.method) send({ jsonrpc: "2.0", id: data.id, result: null })
    if (data.method === "textDocument/didOpen")
      send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri: data.params.textDocument.uri,
        diagnostics: [{ message, severity: 1, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } }] } })
  }
})
`

describe("workspace programs run confined", () => {
  confinedLsp(
    "a planted workspace language server cannot write outside or reach the network; its diagnostics still arrive",
    () =>
      Effect.gen(function* () {
        const directory = (yield* TestInstance).directory
        const service = yield* LSP.Service
        const file = path.join(directory, "schema.gql")
        yield* Effect.promise(() => Bun.write(file, "type Query { ok: Boolean }\n"))
        yield* service.touchFile(file)
        const message = yield* pollWithTimeout(
          service.diagnostics().pipe(
            Effect.map((all) => Object.values(all).flat().find((entry) => entry.message.startsWith("probe "))?.message),
          ),
          "the planted language server never published its probe",
          "150 seconds",
        )
        // Positive control above: the planted server ran and spoke LSP. Then each escape was refused.
        expect(message).toBe("probe out=denied sibling=denied")
        expect(existsSync(marker)).toBe(false)
        expect(existsSync(path.join(directory, "planted.txt"))).toBe(false)
        expect(connections).toBe(0)
      }),
    {
      config: { lsp: true },
      init: (directory) =>
        Effect.promise(async () => {
          await Bun.write(path.join(directory, "biome.json"), "{}\n")
          await Bun.write(path.join(directory, "server.cjs"), SERVER)
          const bin = path.join(directory, "node_modules", ".bin", "biome")
          await Bun.write(bin, `#!/bin/sh\n${probes(directory)}\nexec "${process.execPath}" "${path.join(directory, "server.cjs")}" "probe $probe"\n`)
          await Bun.$`chmod +x ${bin}`
        }),
    },
    180_000,
  )

  confinedFormat(
    "a planted workspace formatter rewrites only its file and cannot write outside or reach the network",
    () =>
      Effect.gen(function* () {
        const directory = (yield* TestInstance).directory
        const file = path.join(directory, "a.php")
        yield* Effect.promise(() => Bun.write(file, "<?php\n"))
        expect(yield* Format.use.file(file)).toBe(true)
        expect(yield* Effect.promise(() => Bun.file(file).text())).toBe("<?php\nformatted out=denied sibling=denied\n")
        expect(existsSync(marker)).toBe(false)
        expect(existsSync(path.join(directory, "planted.txt"))).toBe(false)
        expect(connections).toBe(0)
      }),
    {
      config: { formatter: true },
      init: (directory) =>
        Effect.promise(async () => {
          await Bun.write(path.join(directory, "composer.json"), JSON.stringify({ "require-dev": { "laravel/pint": "*" } }))
          const bin = path.join(directory, "vendor", "bin", "pint")
          await Bun.write(bin, `#!/bin/sh\n${probes(directory)}\necho "formatted $probe" >> "$1"\n`)
          await Bun.$`chmod +x ${bin}`
        }),
    },
    180_000,
  )

  confinedFormat(
    "prettier formats through stdin while a workspace config that runs code stays confined",
    () =>
      Effect.gen(function* () {
        const directory = (yield* TestInstance).directory
        const file = path.join(directory, "a.ts")
        yield* Effect.promise(() => Bun.write(file, "const x   =   1;\n"))
        expect(yield* Format.use.file(file)).toBe(true)
        // semi: false comes from the config file, so the config ran inside the sandbox and the result was written back.
        expect(yield* Effect.promise(() => Bun.file(file).text())).toBe("const x = 1\n")
        expect(existsSync(marker)).toBe(false)
        expect(connections).toBe(0)
      }),
    {
      config: { formatter: true },
      init: (directory) =>
        Effect.promise(async () => {
          await Bun.write(path.join(directory, "package.json"), JSON.stringify({ devDependencies: { prettier: "*" } }))
          await Bun.write(
            path.join(directory, ".prettierrc.cjs"),
            `const fs = require("fs")
try { fs.writeFileSync(${JSON.stringify(marker)}, "escaped") } catch {}
require("child_process").spawnSync("curl", ["-s", "--max-time", "5", "http://127.0.0.1:${port}/"])
module.exports = { semi: false }
`,
          )
        }),
    },
    240_000,
  )

  confinedFormat(
    "rustfmt runs confined: the rustup proxy executes the toolchain a workspace rust-toolchain.toml names",
    () =>
      Effect.gen(function* () {
        const directory = (yield* TestInstance).directory
        const file = path.join(directory, "main.rs")
        yield* Effect.promise(() => Bun.write(file, "fn main() {}\n"))
        // Positive control: the planted toolchain's rustfmt ran (through the rustup proxy) and rewrote its file.
        expect(yield* Format.use.file(file)).toBe(true)
        expect(yield* Effect.promise(() => Bun.file(file).text())).toBe("fn main() {}\nformatted out=denied sibling=denied\n")
        expect(existsSync(marker)).toBe(false)
        expect(existsSync(path.join(directory, "planted.txt"))).toBe(false)
      }),
    {
      config: { formatter: true },
      init: (directory) =>
        Effect.promise(async () => {
          if (!Bun.which("rustfmt")) throw new Error("this proof needs the runner's rustup rustfmt proxy on PATH")
          const toolchain = path.join(directory, "toolchain")
          await Bun.write(path.join(directory, "rust-toolchain.toml"), `[toolchain]\npath = ${JSON.stringify(toolchain)}\n`)
          await Bun.write(path.join(toolchain, "lib", ".keep"), "")
          const bin = path.join(toolchain, "bin", "rustfmt")
          await Bun.write(bin, `#!/bin/sh\n${probes(directory)}\necho "formatted $probe" >> "$1"\n`)
          await Bun.$`chmod +x ${bin}`
        }),
    },
    180_000,
  )

  confinedFormat(
    "a file formatter is refused when the formatted path is a symlink leading outside the workspace",
    () =>
      Effect.gen(function* () {
        const directory = (yield* TestInstance).directory
        const victim = path.join(outside, "victim.php")
        yield* Effect.promise(async () => {
          await Bun.write(victim, "<?php\n")
          await symlink(victim, path.join(directory, "a.php"))
        })
        yield* Format.use.file(path.join(directory, "a.php"))
        expect(yield* Effect.promise(() => Bun.file(victim).text())).toBe("<?php\n")
      }),
    {
      config: { formatter: true },
      init: (directory) =>
        Effect.promise(async () => {
          await Bun.write(path.join(directory, "composer.json"), JSON.stringify({ "require-dev": { "laravel/pint": "*" } }))
          const bin = path.join(directory, "vendor", "bin", "pint")
          await Bun.write(bin, `#!/bin/sh\necho escaped >> "$1"\n`)
          await Bun.$`chmod +x ${bin}`
        }),
    },
    180_000,
  )

  confinedFormat(
    "a stdin formatter's output is not written through a symlink swapped in while it ran",
    () =>
      Effect.gen(function* () {
        const directory = (yield* TestInstance).directory
        const victim = path.join(outside, "victim.ts")
        const file = path.join(directory, "a.ts")
        yield* Effect.promise(async () => {
          await Bun.write(victim, "const victim = 1\n")
          await Bun.write(path.join(directory, "warm.ts"), "const warm   =   1;\n")
          await Bun.write(file, "const x   =   1;\n")
        })
        // Warm up first so prettier is resolved; then a.ts's config holds until the swap below is done.
        yield* Format.use.file(path.join(directory, "warm.ts"))
        expect(yield* Effect.promise(() => Bun.file(path.join(directory, "warm.ts")).text())).toBe("const warm = 1\n")
        const formatting = yield* Effect.forkChild(Format.use.file(file))
        yield* Effect.sleep("3 seconds")
        yield* Effect.promise(async () => {
          await rm(file)
          await symlink(victim, file)
          await Bun.write(path.join(directory, "swapped"), "")
        })
        yield* Fiber.join(formatting)
        expect(yield* Effect.promise(() => Bun.file(victim).text())).toBe("const victim = 1\n")
      }),
    {
      config: { formatter: true },
      init: (directory) =>
        Effect.promise(async () => {
          await Bun.write(path.join(directory, "package.json"), JSON.stringify({ devDependencies: { prettier: "*" } }))
          await Bun.write(
            path.join(directory, ".prettierrc.cjs"),
            `const fs = require("fs")
if (process.argv.some((arg) => arg.endsWith("a.ts"))) {
  const deadline = Date.now() + 60_000
  while (!fs.existsSync(${JSON.stringify(path.join(directory, "swapped"))}) && Date.now() < deadline)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
}
module.exports = { semi: false }
`,
          )
        }),
    },
    240_000,
  )

  confinedFormat(
    "a gofmt shim that resolves a .tool-versions path: toolchain from the workspace runs confined",
    () =>
      Effect.gen(function* () {
        const directory = (yield* TestInstance).directory
        const file = path.join(directory, "a.go")
        yield* Effect.promise(() => Bun.write(file, "package main\n"))
        // Positive control: the planted toolchain's gofmt ran through the shim and rewrote its file.
        expect(yield* onPath(path.join(tools, ".asdf", "shims"), Format.use.file(file))).toBe(true)
        expect(yield* Effect.promise(() => Bun.file(file).text())).toBe("package main\nformatted out=denied sibling=denied\n")
        expect(existsSync(marker)).toBe(false)
        expect(existsSync(path.join(directory, "planted.txt"))).toBe(false)
      }),
    {
      config: { formatter: true },
      init: (directory) =>
        Effect.sync(() => {
          // asdf's shim reads the version from the workspace; `path:` points it at a directory the workspace holds.
          program(path.join(tools, ".asdf", "shims", "gofmt"), `dir=$(sed -n 's/^golang path://p' .tool-versions)\nexec "$dir/bin/gofmt" "$@"\n`)
          writeFileSync(path.join(directory, ".tool-versions"), `golang path:${path.join(directory, "toolchain")}\n`)
          program(path.join(directory, "toolchain", "bin", "gofmt"), `${probes(directory)}\necho "formatted $probe" >> "$2"\n`)
        }),
    },
    180_000,
  )

  confinedFormat(
    "a configured npx formatter runs confined",
    () =>
      Effect.gen(function* () {
        const directory = (yield* TestInstance).directory
        const file = path.join(directory, "a.zz")
        yield* Effect.promise(() => Bun.write(file, "zz\n"))
        expect(yield* onPath(path.join(tools, "runner"), Format.use.file(file))).toBe(true)
        expect(yield* Effect.promise(() => Bun.file(file).text())).toBe("zz\nformatted out=denied sibling=denied\n")
        expect(existsSync(marker)).toBe(false)
        expect(existsSync(path.join(directory, "planted.txt"))).toBe(false)
      }),
    {
      config: { formatter: { zfmt: { command: ["npx", "zfmt", "$FILE"], extensions: [".zz"] } } },
      init: (directory) =>
        Effect.sync(() => program(path.join(tools, "runner", "npx"), `${probes(directory)}\necho "formatted $probe" >> "$2"\n`)),
    },
    180_000,
  )

  confinedFormat(
    "a static gofmt outside the workspace and the shim directories stays unconfined and formats",
    () =>
      Effect.gen(function* () {
        const directory = (yield* TestInstance).directory
        const file = path.join(directory, "a.go")
        yield* Effect.promise(() => Bun.write(file, "package main\nfunc main(){}\n"))
        const gofmt = path.join(tools, "system", "gofmt")
        expect(yield* Effect.promise(() => ToolSafetySandbox.runsWorkspaceCode(directory, gofmt, ["-w", file], directory))).toBe(false)
        expect(yield* onPath(path.join(tools, "system"), Format.use.file(file))).toBe(true)
        expect(yield* Effect.promise(() => Bun.file(file).text())).toBe("package main\n\nfunc main() {}\n")
      }),
    {
      config: { formatter: true },
      init: () => Effect.sync(() => program(path.join(tools, "system", "gofmt"), `printf 'package main\\n\\nfunc main() {}\\n' > "$2"\n`)),
    },
    60_000,
  )

  test.skipIf(!confinable)(
    "startup latency of one language server, unconfined and confined",
    async () => {
      const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), "workspace-sandbox-latency-")))
      const server = path.join(directory, "server.cjs")
      await Bun.write(server, SERVER)
      const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { capabilities: {} } })
      // Median of five launches, each timed from the launch call to the first byte of the initialize reply.
      const measure = async (launch: () => Promise<Child>) => {
        const samples: number[] = []
        for (let run = 0; run < 5; run++) {
          const start = performance.now()
          const proc = await launch()
          proc.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
          await new Promise<void>((resolve) => proc.stdout.once("data", () => resolve()))
          samples.push(performance.now() - start)
          proc.kill()
          await proc.exited
        }
        return samples.sort((a, b) => a - b)[2]
      }
      const unconfined = await measure(async () => spawn(process.execPath, [server, "latency"], { cwd: directory }))
      const sandboxed = await measure(() => confined(process.execPath, [server, "latency"], { cwd: directory }))
      console.info(`lsp-startup-ms ${process.platform}: unconfined ${unconfined.toFixed(0)}, confined ${sandboxed.toFixed(0)}`)
      rmSync(directory, { recursive: true, force: true })
    },
    180_000,
  )

  test.skipIf(process.platform !== "win32")("Windows refuses a confined launch and names why", async () => {
    await expect(confined(process.execPath, ["-e", "0"], { cwd: os.tmpdir() })).rejects.toMatchObject({
      reason: "sandbox-platform-unsupported: win32",
    })
  })

  windowsFormat(
    "Windows leaves a workspace formatter's file untouched",
    () =>
      Effect.gen(function* () {
        const directory = (yield* TestInstance).directory
        const file = path.join(directory, "a.php")
        yield* Effect.promise(() => Bun.write(file, "<?php\n"))
        yield* Format.use.file(file)
        expect(yield* Effect.promise(() => Bun.file(file).text())).toBe("<?php\n")
      }),
    {
      config: { formatter: true },
      init: (directory) =>
        Effect.promise(async () => {
          await Bun.write(path.join(directory, "composer.json"), JSON.stringify({ "require-dev": { "laravel/pint": "*" } }))
          await Bun.write(path.join(directory, "vendor", "bin", "pint.cmd"), "@echo formatted>> %1\r\n")
        }),
    },
  )
})
