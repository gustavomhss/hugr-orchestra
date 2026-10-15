// LSP server processes under omni (WP3): stopping a server handle (what LSPClient shutdown and the LSP service do)
// stops its whole tree, whether node runs it directly or a Windows `.cmd` wraps it, and crash/restart cycles leave
// nothing behind. The oracle is the nonce tree; these run only with the omni flag on (legacy kills the root alone).
import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import type { Readable } from "node:stream"
import { Flag } from "@orchestra/core/flag/flag"
import { spawn } from "../../src/lsp/launch"
import { Process } from "@/util/process"
import { alive, gone, reap, tree } from "../../../core/test/fixture/process-tree"
import { tmpdir } from "../fixture/fixture"

const omni = Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER !== "off"

function ready(stream: Readable, line: string) {
  return new Promise<void>((resolve, reject) => {
    let text = ""
    stream.on("data", (chunk: Buffer) => {
      text += chunk.toString()
      if (text.includes(line)) resolve()
    })
    stream.once("end", () => reject(new Error(`stdout ended before ${line}: ${text}`)))
  })
}

describe.skipIf(!omni)("lsp server tree (omni)", () => {
  test("stopping a node-run server stops its descendants", async () => {
    const t = tree(2)
    try {
      const server = spawn(t.command, t.args)
      await ready(server.stdout, t.ready)
      await Process.stop(server)
      expect(await gone(t.nonce)).toBe(0)
    } finally {
      await reap(t.nonce)
    }
  }, 30_000)

  test.skipIf(process.platform !== "win32")(
    "stopping a server behind a .cmd stops its descendants",
    async () => {
      await using tmp = await tmpdir()
      const t = tree(2)
      // The tree's script as a file, so the .cmd passes only plain arguments: nonce, depth, record directory.
      const script = path.join(tmp.path, "tree.js")
      await fs.writeFile(script, t.args[1])
      const wrapper = path.join(tmp.path, "fake lsp.cmd")
      await fs.writeFile(wrapper, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`)
      try {
        const server = spawn(wrapper, t.args.slice(2))
        await ready(server.stdout, t.ready)
        await Process.stop(server)
        expect(await gone(t.nonce)).toBe(0)
      } finally {
        await reap(t.nonce)
      }
    },
    30_000,
  )

  test("20 crash/restart cycles leave no process behind", async () => {
    const nonces: string[] = []
    try {
      for (let cycle = 0; cycle < 20; cycle++) {
        const t = tree(1)
        nonces.push(t.nonce)
        const server = spawn(t.command, t.args)
        await ready(server.stdout, t.ready)
        // The crash: the server process dies on its own, its child still running.
        process.kill(server.pid!, "SIGKILL")
        await server.exited
        // What the LSP service does with a dead client before it starts the next one.
        await Process.stop(server)
        expect(await gone(t.nonce)).toBe(0)
      }
      const left = await Promise.all(nonces.map((nonce) => alive(nonce)))
      expect(left.reduce((sum, count) => sum + count, 0)).toBe(0)
    } finally {
      await Promise.all(nonces.map((nonce) => reap(nonce)))
    }
  }, 120_000)
})
