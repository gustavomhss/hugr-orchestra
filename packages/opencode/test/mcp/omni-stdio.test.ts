// The omni stdio MCP transport (WP3), used when the omni flag is on: close() leaves no grandchild, a server that
// writes a lot of stderr before it connects still connects, a missing command rejects, onclose fires exactly once,
// a connect failure carries the last stderr lines, and Windows batch arguments with metacharacters work or fail
// clearly. The process oracle is the nonce tree.
import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { Flag } from "@opencode-ai/core/flag/flag"
import { McpStdio, OmniStdioTransport } from "../../src/mcp/stdio"
import { alive, gone, reap, tree } from "../../../core/test/fixture/process-tree"
import { tmpdir } from "../fixture/fixture"

const omni = Flag.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER !== "off"
const fixture = path.join(import.meta.dir, "..", "fixture", "mcp-omni-stdio.ts")

function client() {
  return new Client({ name: "omni-stdio-test", version: "1.0.0" })
}

function transport(env: Record<string, string> = {}, args: string[] = ["probe"], log?: (line: string) => void) {
  return new OmniStdioTransport({
    command: process.execPath,
    args: [fixture, ...args],
    env: { ...process.env, ...env },
    log,
  })
}

async function until(check: () => Promise<boolean>, what: string) {
  const deadline = Date.now() + 20_000
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

describe.skipIf(!omni)("mcp omni stdio transport", () => {
  test("close leaves no grandchild of the server", async () => {
    const t = tree(1)
    try {
      const mcp = client()
      await mcp.connect(transport({ MCP_OMNI_TREE: JSON.stringify({ command: t.command, args: t.args }) }))
      await until(async () => (await alive(t.nonce)) === t.size, "the server's tree")
      await mcp.close()
      expect(await gone(t.nonce)).toBe(0)
    } finally {
      await reap(t.nonce)
    }
  }, 30_000)

  test("200 KB of stderr before the server connects still connects, and reaches the log", async () => {
    const lines: string[] = []
    const mcp = client()
    await mcp.connect(transport({ MCP_OMNI_STDERR: String(200 * 1024) }, ["probe"], (line) => lines.push(line)))
    expect((await mcp.listTools()).tools.map((tool) => tool.name)).toEqual(["probe"])
    await until(async () => lines.includes("fixture stderr done"), "the last stderr line in the log")
    expect(lines.length).toBeGreaterThan(2000)
    await mcp.close()
  }, 30_000)

  test("a missing command rejects connect", async () => {
    const mcp = client()
    const missing = new OmniStdioTransport({ command: `omni-missing-${crypto.randomUUID()}`, env: process.env })
    const err = await mcp.connect(missing).catch((error: unknown) => error)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain("omni-missing-")
  })

  test("onclose fires exactly once, whether the server exits or close() is called", async () => {
    const server = transport()
    let closed = 0
    const mcp = client()
    await mcp.connect(server)
    const previous = server.onclose
    server.onclose = () => {
      closed++
      previous?.()
    }
    await Promise.all([mcp.close(), server.close(), server.close()])
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(closed).toBe(1)
  }, 30_000)

  test("a connect failure carries the server's last 20 stderr lines", async () => {
    const server = transport({ MCP_OMNI_FAIL_LINES: "30" })
    const err = await client()
      .connect(server)
      .catch((error: unknown) => error)
    expect(err).toBeInstanceOf(Error)
    const message = McpStdio.failure(server, err)
    expect(message).toContain("fixture stderr line 30")
    expect(message).toContain("fixture stderr line 11")
    expect(message).not.toContain("fixture stderr line 10\n")
  }, 30_000)

  test("docker run gets --rm and the owner label; other commands are unchanged", () => {
    const args = ["run", "-i", "mcp/server"]
    expect(McpStdio.docker("npx", args)).toBe(args)
    const docker = McpStdio.docker("docker", args)
    expect(docker.slice(0, 2)).toEqual(["run", "--rm"])
    expect(docker).toContain(`${McpStdio.LABEL}=${require("node:os").hostname()}/${process.pid}`)
    expect(McpStdio.docker("docker", ["run", "--rm", "x"]).filter((arg) => arg === "--rm")).toHaveLength(1)
  })

  test.skipIf(process.platform !== "win32")(
    "a .cmd server (npx-style) with metacharacter arguments works or fails with a clear error",
    async () => {
      await using tmp = await tmpdir()
      const wrapper = path.join(tmp.path, "npx-like.cmd")
      await fs.writeFile(wrapper, `@echo off\r\n"${process.execPath}" "${fixture}" %*\r\n`)
      const name = "a&b|c^d<e>f%PATH%"
      const server = new OmniStdioTransport({ command: wrapper, args: [name], env: process.env })
      const mcp = client()
      const connected = await mcp.connect(server).then(
        () => undefined,
        (error: unknown) => error,
      )
      if (connected === undefined) {
        // Passed literally: no metacharacter was interpreted by cmd.exe.
        expect((await mcp.listTools()).tools.map((tool) => tool.name)).toEqual([name])
        await mcp.close()
        return
      }
      expect(connected).toBeInstanceOf(Error)
      expect((connected as { code?: string }).code).toBe("INVALID_ARGUMENT")
      expect((connected as Error).message.length).toBeGreaterThan(20)
    },
    30_000,
  )
})
