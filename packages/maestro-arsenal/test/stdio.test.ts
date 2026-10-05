import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { Arsenal } from "../src/index"

test("real MCP SDK initializes stdio server, lists exact schemas, calls shared handlers and rejects malformed input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "arsenal-project-"))
  const stateDirectory = await mkdtemp(join(tmpdir(), "arsenal-state-"))
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(import.meta.dir, "../src/server.ts"), "--directory", directory, "--state-directory", stateDirectory, "--project-id", "stdio-project"], stderr: "pipe" })
  const client = new Client({ name: "arsenal-conformance", version: "1.0.0" })
  try {
    await client.connect(transport)
    expect(await client.ping()).toEqual({})
    expect(client.getServerVersion()?.name).toBe("maestro-arsenal")
    const listed = await client.listTools()
    const library = await Arsenal.list()
    expect(listed.tools.map((tool) => tool.name)).toEqual(library.map((tool) => tool.name))
    for (const tool of listed.tools) expect(tool.inputSchema).toEqual({ ...(await Arsenal.describe(tool.name)).inputSchema, type: "object" as const })
    const args = { items: [{ id: "A1", test: "acceptance" }], wps: [{ id: "a", covers: ["A1"] }] }
    const direct = await Arsenal.execute("plan-check", args)
    expect(JSON.stringify(await client.callTool({ name: "plan-check", arguments: args }))).toBe(JSON.stringify(direct))
    const invalid = await client.callTool({ name: "plan-check", arguments: { items: [], wps: [] } })
    expect(invalid.isError).toBe(true)
    expect(JSON.stringify(invalid.content)).toContain("invalid_arguments")
    expect((await client.callTool({ name: "sliceability", arguments: { symbols: ["x"], edges: [["x"]], k: 0 } })).isError).toBe(true)
    expect((await client.callTool({ name: "retired-tool", arguments: {} })).isError).toBe(true)
    // Error must not kill transport or poison subsequent requests.
    expect(JSON.stringify(await client.callTool({ name: "plan-check", arguments: args }))).toBe(JSON.stringify(direct))
  } finally {
    await client.close()
    await rm(directory, { recursive: true, force: true })
    await rm(stateDirectory, { recursive: true, force: true })
  }
})

test("standalone server refuses missing explicit root and overlapping state placement", async () => {
  const missing = Bun.spawn([process.execPath, join(import.meta.dir, "../src/server.ts")], { stdout: "pipe", stderr: "pipe" })
  expect(await missing.exited).not.toBe(0)
  expect(await new Response(missing.stderr).text()).toContain("explicit absolute --directory, --state-directory and --project-id are required")
  expect(await new Response(missing.stdout).text()).toBe("")
  const directory = await mkdtemp(join(tmpdir(), "arsenal-overlap-"))
  try {
    const overlap = Bun.spawn([process.execPath, join(import.meta.dir, "../src/server.ts"), "--directory", directory, "--state-directory", directory, "--project-id", "p"], { stdout: "pipe", stderr: "pipe" })
    expect(await overlap.exited).not.toBe(0)
    expect(await new Response(overlap.stderr).text()).toContain("project root and state root must be disjoint")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
