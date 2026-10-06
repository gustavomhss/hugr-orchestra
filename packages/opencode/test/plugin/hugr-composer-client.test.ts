import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { HugrComposerClient } from "../../src/plugin/hugr-composer/client"
import { tmpdir } from "../fixture/fixture"
import { rethrow } from "../lib/rejection"

const server = path.join(import.meta.dir, "../fixture/hugr-mcp.ts")

test.serial("aborts a stalled MCP handshake and closes its child", async () => {
  const client = new HugrComposerClient(process.cwd(), process.cwd(), {
    command: process.execPath,
    args: [server, "hang"],
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25)
  try {
    expect(await rethrow(client.callTool("test", {}, controller.signal))).toThrow()
  } finally {
    clearTimeout(timer)
    await client.close()
  }
})

test.serial("reconnects after MCP child exits", async () => {
  await using tmp = await tmpdir()
  const marker = path.join(tmp.path, "exited")
  const client = new HugrComposerClient(process.cwd(), process.cwd(), {
    command: process.execPath,
    args: [server, "exit-after-call", marker],
  })
  const signal = new AbortController().signal
  try {
    const first = await client.callTool("test", {}, signal)
    expect(first.content[0]).toMatchObject({ type: "text", text: "call-1" })
    await waitForFile(marker)
    const second = await client.callTool("test", {}, signal)
    expect(second.content[0]).toMatchObject({ type: "text", text: "call-1" })
  } finally {
    await client.close()
  }
})

test.serial("closes a child after the normal tool timeout", async () => {
  await using tmp = await tmpdir()
  const marker = path.join(tmp.path, "timed-out")
  const client = new HugrComposerClient(process.cwd(), process.cwd(), {
    command: process.execPath,
    args: [server, "hang-call", "exit-after-call", marker],
    timeout: 25,
    hardTimeout: 250,
  })
  try {
    expect(await rethrow(client.callTool("test", {}, new AbortController().signal))).toThrow()
    await waitForFile(marker)
  } finally {
    await client.close()
  }
})

async function waitForFile(file: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (
      await fs
        .stat(file)
        .then(() => true)
        .catch(() => false)
    )
      return
    await Bun.sleep(10)
  }
  throw new Error(`Timed out waiting for ${file}`)
}
