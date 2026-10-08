import { expect, spyOn } from "bun:test"
import path from "node:path"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { Effect, Fiber } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Flag } from "@opencode-ai/core/flag/flag"
import { LSP } from "@/lsp/lsp"
import { LSPClient } from "@/lsp/client"
import { InstanceStore } from "@/project/instance-store"
import { InstanceState } from "@/effect/instance-state"
import { TestInstance } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"
import { alive, reap, sweep, tree } from "../../../core/test/fixture/process-tree"

const it = testEffect(LayerNode.compile(LSP.node))
const omni = Flag.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER !== "off"

it.instance(
  "20 same-instance wrapper crashes restart only on demand, keep status accurate and serialize concurrent requests",
  () =>
    Effect.gen(function* () {
      const lsp = yield* LSP.Service
      const directory = (yield* TestInstance).directory
      const nonce = JSON.parse(readFileSync(path.join(directory, "fixture.json"), "utf8")) as {
        nonce: string
        size: number
      }
      const launches = () =>
        readFileSync(path.join(directory, "launches.jsonl"), "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as { pid: number })
      const file = path.join(directory, "sample.restart")
      yield* Effect.addFinalizer(() => Effect.promise(() => reap(nonce.nonce)))
      yield* Effect.promise(() => Bun.write(file, "sample\n"))
      yield* lsp.touchFile(file)
      for (let cycle = 0; cycle < 20; cycle++) {
        yield* pollWithTimeout(
          Effect.promise(async () => {
            const count = (await sweep(nonce.nonce)).length
            const recorded = omni ? await alive(nonce.nonce) : 0
            return count === (omni ? 4 : 2) && (!omni || recorded === nonce.size) ? count : undefined
          }),
          "live wrapper/tree positive control",
          "20 seconds",
        )
        if (omni) expect(yield* Effect.promise(() => alive(nonce.nonce))).toBe(nonce.size)
        expect(yield* lsp.status()).toEqual([{ id: "restart", name: "restart", root: "", status: "connected" }])
        yield* pollWithTimeout(
          lsp.diagnostics().pipe(
            Effect.map((diagnostics) =>
              Object.values(diagnostics)
                .flat()
                .some((entry) => entry.message.startsWith("live-"))
                ? true
                : undefined,
            ),
          ),
          "live diagnostics positive control",
          "10 seconds",
        )
        const old = yield* Effect.promise(() => sweep(nonce.nonce))
        const pid = launches().at(-1)?.pid
        if (pid === undefined || !old.includes(pid)) throw new Error("wrapper nonce identity absent")
        yield* Effect.sync(() => process.kill(pid, "SIGKILL"))
        yield* pollWithTimeout(
          lsp.status().pipe(Effect.map((status) => (status[0]?.status === "error" ? true : undefined))),
          "dead cached LSP must report error",
          "10 seconds",
        )
        expect(yield* lsp.diagnostics()).toEqual({})
        // Neither status nor diagnostics may eagerly restart a server.
        expect(launches().length).toBe(cycle + 1)
        yield* Effect.all([lsp.touchFile(file), lsp.touchFile(file)], { concurrency: "unbounded" })
        expect(launches().length).toBe(cycle + 2)
        const current = yield* Effect.promise(() => sweep(nonce.nonce))
        expect(current.filter((id) => old.includes(id))).toEqual([])
        expect(yield* lsp.status()).toEqual([{ id: "restart", name: "restart", root: "", status: "connected" }])
      }
      // Every launch went through initialize and didOpen: a new wrapper is not enough to pass.
      const protocol = readFileSync(path.join(directory, "protocol.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { pid: number; method: string })
      for (const launch of launches()) {
        for (const method of ["initialize", "initialized", "textDocument/didOpen"])
          expect(protocol.some((entry) => entry.pid === launch.pid && entry.method === method)).toBe(true)
      }
    }),
  {
    init: (directory) =>
      Effect.gen(function* () {
        const fixture = tree(1)
        const wrapper = path.join(directory, `${fixture.nonce}-wrapper.cjs`)
        yield* Effect.promise(() => Bun.write(path.join(directory, "fixture.json"), JSON.stringify(fixture)))
        yield* Effect.promise(() =>
          Bun.write(
            wrapper,
            `
const fs = require('node:fs');
const cp = require('node:child_process');
const server = cp.spawn(process.execPath, [${JSON.stringify(path.join(import.meta.dirname, "../fixture/lsp/fake-lsp-server.js"))}, ${JSON.stringify(fixture.nonce)}], {stdio: ['pipe', 'pipe', 'inherit']});
${omni ? `cp.spawn(process.execPath, ${JSON.stringify(fixture.args)}, {stdio: 'ignore'});` : ""}
fs.appendFileSync(${JSON.stringify(path.join(directory, "launches.jsonl"))}, JSON.stringify({pid: process.pid}) + '\\n');
let pending = Buffer.alloc(0);
process.stdin.on('data', chunk => {
  pending = Buffer.concat([pending, chunk]);
  for (;;) {
    const end = pending.indexOf('\\r\\n\\r\\n'); if (end < 0) break;
    const length = Number(pending.subarray(0, end).toString().match(/Content-Length: (\\d+)/i)?.[1]);
    if (!Number.isFinite(length)) throw Error('invalid LSP framing');
    if (pending.length < end + 4 + length) break;
    const message = JSON.parse(pending.subarray(end + 4, end + 4 + length));
    fs.appendFileSync(${JSON.stringify(path.join(directory, "protocol.jsonl"))}, JSON.stringify({pid: process.pid, method: message.method}) + '\\n');
    if (message.method === 'textDocument/didOpen') {
      const diagnostic = JSON.stringify({jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: {
        uri: message.params.textDocument.uri, diagnostics: [{message: 'live-' + process.pid, severity: 1,
          range: {start: {line: 0, character: 0}, end: {line: 0, character: 1}}}]
      }});
      process.stdout.write('Content-Length: ' + Buffer.byteLength(diagnostic) + '\\r\\n\\r\\n' + diagnostic);
    }
    pending = pending.subarray(end + 4 + length);
  }
  server.stdin.write(chunk);
});
server.stdout.pipe(process.stdout);
process.stdin.on('end', () => server.stdin.end());
`,
          ),
        )
        yield* Effect.promise(() =>
          Bun.write(
            path.join(directory, "opencode.json"),
            JSON.stringify({
              lsp: { restart: { command: [process.execPath, wrapper, fixture.nonce], extensions: [".restart"] } },
            }),
          ),
        )
      }),
  },
  600_000,
)

for (const boundary of ["old-shutdown", "replacement-initialize"] as const) {
  it.instance(
    `disposal closes admission during ${boundary} and joins the admitted request`,
    () =>
      Effect.gen(function* () {
        const lsp = yield* LSP.Service
        const store = yield* InstanceStore.Service
        const ctx = yield* InstanceState.context
        const directory = (yield* TestInstance).directory
        const fixtures = JSON.parse(readFileSync(path.join(directory, "barriers.json"), "utf8")) as {
          target: string
          sentinel: string
        }
        const targetFile = path.join(directory, "file.target")
        const marker = (name: string) => path.join(directory, name)
        const launches = () =>
          readFileSync(marker("launches.jsonl"), "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line) as { role: string; pid: number })
        const gate = Promise.withResolvers<void>()
        const original = LSPClient.create
        const created = { target: 0 }
        // Transparent completion barrier: real RPC create/real tree stop still execute; only their Promise is held.
        const hook = spyOn(LSPClient, "create").mockImplementation(async (input) => {
          const client = await original(input)
          const stop = client.shutdown
          if (input.serverID === "sentinel")
            client.shutdown = () => {
              writeFileSync(marker("finalizer-entered"), "")
              return stop()
            }
          if (input.serverID === "target" && ++created.target === 1 && boundary === "old-shutdown") {
            const held = { stop: undefined as Promise<void> | undefined }
            client.shutdown = () => {
              held.stop ??= stop().then(async () => {
                writeFileSync(marker("old-shutdown-entered"), "")
                await gate.promise
              })
              return held.stop
            }
          }
          return client
        })
        const waiting = (name: string) =>
          pollWithTimeout(
            Effect.sync(() => (existsSync(marker(name)) ? true : undefined)),
            `fixture barrier ${name}`,
            "20 seconds",
          )
        try {
          yield* Effect.promise(() =>
            Promise.all([Bun.write(targetFile, "x\n"), Bun.write(path.join(directory, "file.sentinel"), "x\n")]),
          )
          yield* lsp.touchFile(targetFile)
          yield* lsp.touchFile(path.join(directory, "file.sentinel"))
          yield* pollWithTimeout(
            Effect.promise(async () => {
              const count = (await sweep(fixtures.target)).length
              return count === (omni ? 4 : 2) && (!omni || (await alive(fixtures.target)) === 2) ? true : undefined
            }),
            "barrier fixture tree ready",
            "20 seconds",
          )
          const root = launches().find((entry) => entry.role === "target")
          if (!root || !(yield* Effect.promise(() => sweep(fixtures.target))).includes(root.pid))
            throw new Error("target nonce identity missing")
          yield* Effect.sync(() => process.kill(root.pid, "SIGKILL"))
          yield* pollWithTimeout(
            lsp
              .status()
              .pipe(
                Effect.map((status) =>
                  status.find((entry) => entry.id === "target")?.status === "error" ? true : undefined,
                ),
              ),
            "target close observed",
            "10 seconds",
          )
          if (boundary === "replacement-initialize") writeFileSync(marker("hold-initialize"), "")
          const demand = yield* lsp.touchFile(targetFile).pipe(Effect.forkChild({ startImmediately: true }))
          yield* waiting(boundary === "old-shutdown" ? "old-shutdown-entered" : "initialize-entered")
          const disposal = yield* store.dispose(ctx).pipe(Effect.forkChild({ startImmediately: true }))
          yield* waiting("finalizer-entered")
          expect(disposal.pollUnsafe()).toBeUndefined()
          gate.resolve()
          writeFileSync(marker("release-initialize"), "")
          yield* Fiber.join(demand)
          yield* Fiber.join(disposal)
          expect(launches().filter((entry) => entry.role === "target").length).toBe(boundary === "old-shutdown" ? 1 : 2)
          for (const nonce of Object.values(fixtures)) {
            yield* pollWithTimeout(
              Effect.promise(async () => ((await sweep(nonce)).length === 0 ? true : undefined)),
              "all barrier fixture descendants gone after disposal",
              "20 seconds",
            )
          }
        } finally {
          gate.resolve()
          writeFileSync(marker("release-initialize"), "")
          hook.mockRestore()
          // Cleanup is not the oracle: assertions above ran before this last-resort nonce sweep.
          for (const nonce of Object.values(fixtures)) {
            for (const pid of yield* Effect.promise(() => sweep(nonce)))
              yield* Effect.sync(() => {
                try {
                  process.kill(pid, "SIGKILL")
                } catch {}
              })
            yield* Effect.promise(() => reap(nonce))
          }
        }
      }),
    { init: barrierFixture },
    120_000,
  )
}

function barrierFixture(directory: string) {
  return Effect.gen(function* () {
    const fixtures = { target: tree(1), sentinel: tree(0) }
    const wrapper = path.join(directory, "barrier-wrapper.cjs")
    yield* Effect.promise(() =>
      Bun.write(
        path.join(directory, "barriers.json"),
        JSON.stringify({ target: fixtures.target.nonce, sentinel: fixtures.sentinel.nonce }),
      ),
    )
    yield* Effect.promise(() =>
      Bun.write(
        wrapper,
        `
const fs = require('node:fs'); const cp = require('node:child_process'); const path = require('node:path');
const role = process.argv[2]; const directory = ${JSON.stringify(directory)};
const marker = name => path.join(directory, name);
const server = cp.spawn(process.execPath, [${JSON.stringify(path.join(import.meta.dirname, "../fixture/lsp/fake-lsp-server.js"))}, process.argv[3]], {stdio: ['pipe', 'pipe', 'inherit']});
${omni ? `cp.spawn(process.execPath, role === 'target' ? ${JSON.stringify(fixtures.target.args)} : ${JSON.stringify(fixtures.sentinel.args)}, {stdio: 'ignore'});` : ""}
fs.appendFileSync(marker('launches.jsonl'), JSON.stringify({role, pid: process.pid}) + '\\n');
const pending = [];
const watcher = fs.watch(directory, () => {
  if (fs.existsSync(marker('release-initialize'))) { pending.splice(0).forEach(chunk => server.stdin.write(chunk)); }
});
process.stdin.on('data', chunk => {
  if (role === 'target' && fs.existsSync(marker('hold-initialize')) && !fs.existsSync(marker('release-initialize'))) {
    fs.writeFileSync(marker('initialize-entered'), ''); pending.push(chunk); return;
  }
  server.stdin.write(chunk);
});
server.stdout.pipe(process.stdout);
process.stdin.on('end', () => { watcher.close(); server.stdin.end(); });
`,
      ),
    )
    yield* Effect.promise(() =>
      Bun.write(
        path.join(directory, "opencode.json"),
        JSON.stringify({
          lsp: {
            target: { command: [process.execPath, wrapper, "target", fixtures.target.nonce], extensions: [".target"] },
            sentinel: {
              command: [process.execPath, wrapper, "sentinel", fixtures.sentinel.nonce],
              extensions: [".sentinel"],
            },
          },
        }),
      ),
    )
  })
}
