import { expect } from "bun:test"
import path from "node:path"
import { readFileSync } from "node:fs"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Flag } from "@opencode-ai/core/flag/flag"
import { LSP } from "@/lsp/lsp"
import { TestInstance } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"
import { alive, reap, sweep, tree } from "../../../core/test/fixture/process-tree"

const it = testEffect(LayerNode.compile(LSP.node))
const omni = Flag.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER !== "off"

it.instance(
  "20 same-instance wrapper crashes restart only on demand, keep status accurate and serialize concurrent requests",
  () => Effect.gen(function* () {
    const lsp = yield* LSP.Service
    const directory = (yield* TestInstance).directory
    const nonce = JSON.parse(readFileSync(path.join(directory, "fixture.json"), "utf8")) as { nonce: string; size: number }
    const launches = () => readFileSync(path.join(directory, "launches.jsonl"), "utf8").trim().split("\n")
      .map((line) => JSON.parse(line) as { pid: number })
    const file = path.join(directory, "sample.restart")
    yield* Effect.addFinalizer(() => Effect.promise(() => reap(nonce.nonce)))
    yield* Effect.promise(() => Bun.write(file, "sample\n"))
    yield* lsp.touchFile(file)
    for (let cycle = 0; cycle < 20; cycle++) {
      yield* pollWithTimeout(Effect.promise(async () => {
        const count = (await sweep(nonce.nonce)).length
        const recorded = omni ? await alive(nonce.nonce) : 0
        return count === (omni ? 4 : 2) && (!omni || recorded === nonce.size) ? count : undefined
      }), "live wrapper/tree positive control", "20 seconds")
      if (omni) expect(yield* Effect.promise(() => alive(nonce.nonce))).toBe(nonce.size)
      expect(yield* lsp.status()).toEqual([{ id: "restart", name: "restart", root: "", status: "connected" }])
      yield* pollWithTimeout(lsp.diagnostics().pipe(Effect.map((diagnostics) =>
        Object.values(diagnostics).flat().some((entry) => entry.message.startsWith("live-")) ? true : undefined)),
        "live diagnostics positive control", "10 seconds")
      const old = yield* Effect.promise(() => sweep(nonce.nonce))
      const pid = launches().at(-1)?.pid
      if (pid === undefined || !old.includes(pid)) throw new Error("wrapper nonce identity absent")
      yield* Effect.sync(() => process.kill(pid, "SIGKILL"))
      yield* pollWithTimeout(lsp.status().pipe(Effect.map((status) => status[0]?.status === "error" ? true : undefined)),
        "dead cached LSP must report error", "10 seconds")
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
    const protocol = readFileSync(path.join(directory, "protocol.jsonl"), "utf8").trim().split("\n")
      .map((line) => JSON.parse(line) as { pid: number; method: string })
    for (const launch of launches()) {
      for (const method of ["initialize", "initialized", "textDocument/didOpen"])
        expect(protocol.some((entry) => entry.pid === launch.pid && entry.method === method)).toBe(true)
    }
  }),
  {
    init: (directory) => Effect.gen(function* () {
      const fixture = tree(1)
      const wrapper = path.join(directory, `${fixture.nonce}-wrapper.cjs`)
      yield* Effect.promise(() => Bun.write(path.join(directory, "fixture.json"), JSON.stringify(fixture)))
      yield* Effect.promise(() => Bun.write(wrapper, `
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
`))
      yield* Effect.promise(() => Bun.write(path.join(directory, "opencode.json"), JSON.stringify({
        lsp: { restart: { command: [process.execPath, wrapper, fixture.nonce], extensions: [".restart"] } },
      })))
    }),
  },
  600_000,
)
