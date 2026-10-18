import { randomUUID } from "node:crypto"
import { tool } from "@orchestra/plugin"
import type { Hooks, Plugin, ToolContext } from "@orchestra/plugin"

type Port = {
  postMessage(message: unknown): void
  on(event: "message", listener: (event: { data: unknown }) => void): void
}
// What the agent can do about each workspace state; without it models retry blindly or reach for other tools.
// Only the linux agent holds these tools, and it cannot ask the owner, so each hint ends in a report.
const hints = {
  "workspace-not-configured": "The Linux workspace was never set up; stop and report that the owner must open Apps > Linux workspace in the App Dock",
  "workspace-not-running": "The Linux workspace is stopped; stop and report that the owner must open Apps > Linux workspace in the App Dock",
  "workspace-unavailable": "The Linux workspace is not available in this app window; stop and report that the owner must open it in the App Dock",
}

const routers = new WeakMap<Port, Map<string, { settle: (value: unknown, error?: string) => void }>>()

export function createLinuxWorkspaceHooks(port: Port): Hooks {
  const router = routers.get(port) ?? new Map<string, { settle: (value: unknown, error?: string) => void }>()
  if (!routers.has(port)) {
    routers.set(port, router)
    port.on("message", (event) => {
      const message = event.data
      if (
        !message ||
        typeof message !== "object" ||
        !("type" in message) ||
        message.type !== "linux.rpc.result" ||
        !("id" in message) ||
        typeof message.id !== "string" ||
        !("ok" in message)
      )
        return
      router
        .get(message.id)
        ?.settle(
          "value" in message ? message.value : undefined,
          message.ok === true
            ? undefined
            : "error" in message && typeof message.error === "string"
              ? message.error
              : "workspace-failed",
        )
    })
  }
  const call = async (context: ToolContext, op: string, args: Record<string, unknown>) => {
    context.abort.throwIfAborted()
    await context.ask({
      permission: "linux",
      patterns: [op],
      always: [op],
      metadata: { operation: op, ...(args.argv ? { argv: args.argv } : {}), ...(args.path ? { path: args.path } : {}) },
    })
    context.abort.throwIfAborted()
    if (router.size >= 32) throw new Error("workspace-busy")
    return new Promise<string>((resolve, reject) => {
      const id = randomUUID()
      const cancel = () => port.postMessage({ type: "linux.rpc.cancel", id })
      const timer = setTimeout(
        () => {
          cancel()
          router.get(id)?.settle(undefined, "workspace-request-timeout")
        },
        (typeof args.timeoutMs === "number" ? args.timeoutMs : 60000) + 120000,
      )
      router.set(id, {
        settle(value, error) {
          router.delete(id)
          clearTimeout(timer)
          context.abort.removeEventListener("abort", cancel)
          if (error) {
            reject(new Error(error))
            return
          }
          resolve(JSON.stringify(value))
        },
      })
      context.abort.addEventListener("abort", cancel, { once: true })
      try {
        port.postMessage({ type: "linux.rpc", id, sessionID: context.sessionID, op, args })
      } catch {
        router.get(id)?.settle(undefined, "workspace-channel-failed")
      }
    })
  }
  const path = tool.schema
    .string()
    .startsWith("/")
    .describe("Absolute path inside the Linux workspace, not a host path")
  const terminalID = tool.schema.string().uuid()
  const invocation = {
    argv: tool.schema.array(tool.schema.string()).min(1).max(256),
    cwd: path.optional(),
    env: tool.schema.record(tool.schema.string(), tool.schema.string()).optional(),
  }
  const execute = (context: ToolContext, op: string, args: Record<string, unknown>) =>
    call(context, op, args).catch((error) => {
      const code = error instanceof Error ? error.message : "workspace-failed"
      return JSON.stringify({ error: code, ...(code in hints ? { hint: hints[code as keyof typeof hints] } : {}) })
    })
  return {
    event: async ({ event }) => {
      if (event.type === "session.deleted")
        port.postMessage({ type: "linux.session.close", sessionID: event.properties.info.id })
    },
    tool: {
      linux_exec: tool({
        description:
          "Execute argv in the persistent Linux workspace used by App Dock. Returns stdout, stderr, exitCode, timeout/cancellation and truncation. Use ['/bin/bash','-lc',command] for shell syntax. This does not execute on the host. No automatic retry after cancellation or an unknown outcome.",
        args: {
          ...invocation,
          stdin: tool.schema.string().optional(),
          timeoutMs: tool.schema.number().int().min(1).max(300000).optional(),
        },
        execute: (args, context) => execute(context, "exec", args),
      }),
      linux_read: tool({
        description:
          "Read a bounded byte range from a Linux file. Returns data, byte offsets, total size and eof. Use base64 for lossless binary or UTF-8 chunk boundary handling.",
        args: {
          path,
          offset: tool.schema.number().int().min(0).optional(),
          length: tool.schema.number().int().min(1).max(65536).optional(),
          encoding: tool.schema.enum(["utf8", "base64"]).optional(),
        },
        execute: (args, context) => execute(context, "file.read", args),
      }),
      linux_write: tool({
        description:
          "Write or replace a Linux file using UTF-8 or base64 data. Parent directory must exist. Maximum input is 1 MiB; use linux_exec stdin or terminal for other operations.",
        args: { path, data: tool.schema.string(), encoding: tool.schema.enum(["utf8", "base64"]).optional() },
        execute: (args, context) => execute(context, "file.write", args),
      }),
      linux_list: tool({
        description:
          "List a page of Linux directory entries. Offsets follow directory enumeration order and are not a snapshot if files change.",
        args: {
          path: path.optional(),
          offset: tool.schema.number().int().min(0).optional(),
          length: tool.schema.number().int().min(1).max(1000).optional(),
        },
        execute: (args, context) => execute(context, "file.list", args),
      }),
      linux_terminal_open: tool({
        description:
          "Open an actual interactive Linux PTY, default bash login shell. Session owns returned terminalID; read output, write input, resize and close explicitly. Terminal survives between tool calls, independently of the GUI.",
        args: {
          argv: invocation.argv.optional(),
          cwd: path.optional(),
          env: invocation.env,
          cols: tool.schema.number().int().min(1).max(500).optional(),
          rows: tool.schema.number().int().min(1).max(500).optional(),
        },
        execute: (args, context) => execute(context, "terminal.open", args),
      }),
      linux_terminal_read: tool({
        description:
          "Drain pending Linux terminal output. Returns running/exitCode and marks output truncated if its bounded buffer overflowed.",
        args: { terminalID },
        execute: (args, context) => execute(context, "terminal.read", args),
      }),
      linux_terminal_write: tool({
        description:
          "Write exact input to an owned Linux PTY. Include newline to submit a command; Ctrl-C is the character with code 3. A write acknowledgement does not prove command completion.",
        args: { terminalID, data: tool.schema.string().max(65536) },
        execute: (args, context) => execute(context, "terminal.write", args),
      }),
      linux_terminal_resize: tool({
        description: "Resize an owned Linux PTY; terminal programs receive size changes.",
        args: {
          terminalID,
          cols: tool.schema.number().int().min(1).max(500),
          rows: tool.schema.number().int().min(1).max(500),
        },
        execute: (args, context) => execute(context, "terminal.resize", args),
      }),
      linux_terminal_close: tool({
        description:
          "Close an owned Linux terminal and reap its attachment. Does not stop the workspace or other applications.",
        args: { terminalID },
        execute: (args, context) => execute(context, "terminal.close", args),
      }),
    },
  }
}

export const LinuxWorkspacePlugin: Plugin = async () => {
  const port = (process as typeof process & { parentPort?: Port }).parentPort
  return port ? createLinuxWorkspaceHooks(port) : {}
}
