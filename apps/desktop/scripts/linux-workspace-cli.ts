#!/usr/bin/env bun

import { parseArgs } from "node:util"
import { resolve } from "node:path"
import { isatty } from "node:tty"
import { AppDockRuntime } from "../src/main/app-dock-runtime"
import { LinuxWorkspaceFiles } from "../src/main/linux-workspace-files"

async function main() {
  const parsed = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: "string" },
      cwd: { type: "string" },
      timeout: { type: "string" },
      encoding: { type: "string" },
    },
  })
  const root = parsed.values.root ?? process.env.ORCHESTRA_LINUX_ROOT
  if (!root || !parsed.positionals.length) {
    console.log(
      "ORCHESTRA_LINUX_ROOT=<desktop-userData>/app-dock-linux bun run linux <exec|shell|read|write|ls> [--cwd /home/dock] [--timeout 60000] [--] <args>",
    )
    process.exitCode = root ? 0 : 2
    return
  }
  const context = process.env.ORCHESTRA_LINUX_CONTEXT
  if (!context) throw new Error("linux-runtime-context-required")
  const runtime = AppDockRuntime.create({ root, context: resolve(context) })
  try {
    const files = LinuxWorkspaceFiles.create(runtime.access)
    const op = parsed.positionals[0]
    const args = parsed.positionals.slice(1)
    const input = {
      argv: args,
      cwd: parsed.values.cwd,
      timeoutMs: parsed.values.timeout === undefined ? undefined : Number(parsed.values.timeout),
    }
    if (op === "exec") {
      const controller = new AbortController()
      const stop = () => controller.abort()
      process.once("SIGINT", stop)
      process.once("SIGTERM", stop)
      const stdin = isatty(0) ? undefined : process.stdin
      try {
        const result = await runtime.access.run(input, {
          signal: controller.signal,
          input: stdin,
          output: { stdout: process.stdout, stderr: process.stderr },
        })
        process.exitCode = result.exitCode ?? 1
        return
      } finally {
        stdin?.destroy()
      }
    }
    if (op === "shell") {
      process.exitCode = await runtime.access.shell({ ...input, argv: args.length ? args : ["/bin/bash", "-il"] })
      return
    }
    if (op === "ls") console.log(JSON.stringify(await files.list(args[0]), null, 2))
    if (op === "read") {
      if (!args[0]) throw new Error("linux-path-required")
      console.log(
        JSON.stringify(
          await files.read(args[0], 0, 65536, parsed.values.encoding === "base64" ? "base64" : "utf8"),
          null,
          2,
        ),
      )
    }
    if (op === "write") {
      if (!args[0]) throw new Error("linux-path-required")
      const chunks: Buffer[] = []
      const size = { bytes: 0 }
      for await (const chunk of process.stdin) {
        size.bytes += chunk.length
        if (size.bytes > 1024 * 1024) throw new Error("input-limit")
        chunks.push(Buffer.from(chunk))
      }
      console.log(
        JSON.stringify(
          await files.write(
            args[0],
            Buffer.concat(chunks).toString("utf8"),
            parsed.values.encoding === "base64" ? "base64" : "utf8",
          ),
        ),
      )
    }
    if (!["ls", "read", "write"].includes(op)) throw new Error("invalid-linux-command")
  } finally {
    await runtime.dispose()
  }
}

await main()
