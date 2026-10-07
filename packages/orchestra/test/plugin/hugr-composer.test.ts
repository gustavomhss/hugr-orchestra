import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import type { ToolContext } from "@orchestra/plugin"
import { createHuGRTools } from "../../src/plugin/hugr-composer/tools"
import type { HugrComposerClient } from "../../src/plugin/hugr-composer/client"
import { tmpdir } from "../fixture/fixture"
import { rethrow } from "../lib/rejection"

test("rejects Composer writes outside worktree and symlink escapes", async () => {
  await using root = await tmpdir()
  await using outside = await tmpdir()
  const link = path.join(root.path, "outside")
  await fs.symlink(outside.path, link, "dir")
  const { tools, calls, asks, context } = fixture(root.path)

  expect(await rethrow(tools["hugr-compose"].execute({ output_dir: outside.path, dry_run: true }, context))).toThrow(
    "inside worktree",
  )
  expect(await rethrow(tools["hugr-compose"].execute({ output_dir: link, dry_run: true }, context))).toThrow(
    /inside worktree|symlinks/,
  )
  const dangling = path.join(root.path, "dangling")
  await fs.symlink(path.join(outside.path, "missing"), dangling)
  expect(await rethrow(tools["hugr-compose"].execute({ output_dir: dangling, dry_run: true }, context))).toThrow(
    "symlinks",
  )
  const real = path.join(root.path, "real")
  await fs.mkdir(real)
  const nested = path.join(root.path, "nested")
  await fs.symlink(real, nested)
  expect(
    await rethrow(
      tools["hugr-compose"].execute({ output_dir: path.join(nested, "generated"), dry_run: true }, context),
    ),
  ).toThrow("symlinks")
  expect(calls).toHaveLength(0)
  expect(asks).toHaveLength(0)
})

test("asks edit permission before non-dry-run Composer writes", async () => {
  await using root = await tmpdir()
  const { tools, calls, asks, context } = fixture(root.path)

  await tools["hugr-scaffold"].execute({ name: "demo", output_dir: "generated", profile: "api" }, context)

  expect(asks).toHaveLength(1)
  expect(asks[0]?.permission).toBe("edit")
  expect(asks[0]?.patterns).toEqual(["generated/**"])
  expect(calls[0]?.name).toBe("fastapi_meta_scaffold")
  expect(calls[0]?.args.output_dir).toBe(path.join(root.path, "generated"))
})

test("exposes only profiles accepted by FastAPI scaffold", () => {
  const { tools } = fixture(process.cwd())
  const profile = tools["hugr-scaffold"].args.profile

  expect(profile.safeParse("minimal").success).toBe(true)
  expect(profile.safeParse("api").success).toBe(true)
  expect(profile.safeParse("full").success).toBe(true)
  expect(profile.safeParse("worker").success).toBe(true)
  expect(profile.safeParse("standard").success).toBe(false)
})

function fixture(root: string) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const asks: Array<Parameters<ToolContext["ask"]>[0]> = []
  const client = {
    callTool: async (name: string, args: Record<string, unknown>, _signal: AbortSignal) => {
      calls.push({ name, args })
      return { content: [{ type: "text" as const, text: "ok" }] }
    },
  } as unknown as HugrComposerClient
  const context: ToolContext = {
    sessionID: "session",
    messageID: "message",
    agent: "agent",
    agentID: "agent",
    directory: root,
    worktree: root,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async (input) => {
      asks.push(input)
    },
  }
  return { tools: createHuGRTools(client), calls, asks, context }
}
