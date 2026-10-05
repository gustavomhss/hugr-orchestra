export * as LinuxWorkspaceRPC from "./linux-workspace-rpc"

import type { LinuxWorkspaceAccess } from "./linux-workspace-access"
import { LinuxWorkspaceFiles } from "./linux-workspace-files"

type Access = ReturnType<typeof LinuxWorkspaceAccess.create>
const bridge = { access: undefined as Access | undefined }
const pending = new Map<string, { controller: AbortController; sessionID: string }>()
export const register = (access: Access) => {
  bridge.access = access
}
export const close = async () => {
  pending.forEach((entry) => entry.controller.abort())
  await bridge.access?.close()
}

export function handle(message: unknown, reply: (value: unknown) => void) {
  if (
    !message ||
    typeof message !== "object" ||
    !("type" in message) ||
    !["linux.rpc", "linux.rpc.cancel", "linux.session.close"].includes(String(message.type))
  )
    return false
  if (message.type === "linux.session.close") {
    if (!("sessionID" in message) || typeof message.sessionID !== "string" || !message.sessionID) return true
    const owner = message.sessionID
    pending.forEach((entry) => {
      if (entry.sessionID === owner) entry.controller.abort()
    })
    void bridge.access?.closeOwner(owner).then(
      () => reply({ type: "linux.session.closed", sessionID: owner, ok: true }),
      () => reply({ type: "linux.session.closed", sessionID: owner, ok: false, error: "workspace-cleanup-failed" }),
    )
    return true
  }
  if (!("id" in message) || typeof message.id !== "string" || !/^[a-f0-9-]{36}$/.test(message.id)) return true
  const id = message.id
  if (message.type === "linux.rpc.cancel") {
    pending.get(id)?.controller.abort()
    return true
  }
  if (pending.has(id)) return true
  if (
    !bridge.access ||
    pending.size >= 32 ||
    !("sessionID" in message) ||
    typeof message.sessionID !== "string" ||
    !message.sessionID ||
    !("op" in message) ||
    typeof message.op !== "string" ||
    !("args" in message) ||
    !message.args ||
    typeof message.args !== "object" ||
    Array.isArray(message.args)
  ) {
    reply({ type: "linux.rpc.result", id, ok: false, error: "workspace-unavailable" })
    return true
  }
  const access = bridge.access
  const sessionID = message.sessionID
  const op = message.op
  const args = message.args as Record<string, unknown>
  const controller = new AbortController()
  pending.set(id, { controller, sessionID })
  const files = LinuxWorkspaceFiles.create(access)
  const invocation = (defaultShell = false) => {
    const argv = args.argv ?? (defaultShell ? ["/bin/bash", "-il"] : undefined)
    if (!Array.isArray(argv) || argv.some((value) => typeof value !== "string")) throw new Error("invalid-argv")
    if (
      args.env !== undefined &&
      (!args.env ||
        typeof args.env !== "object" ||
        Array.isArray(args.env) ||
        Object.values(args.env).some((value) => typeof value !== "string"))
    )
      throw new Error("invalid-env")
    return {
      argv: argv as string[],
      cwd: args.cwd === undefined ? undefined : text(args.cwd),
      env: args.env as Record<string, string> | undefined,
      stdin: args.stdin === undefined ? undefined : text(args.stdin, true),
      timeoutMs: args.timeoutMs === undefined ? undefined : number(args.timeoutMs),
    }
  }
  const dispatch = async () => {
    controller.signal.throwIfAborted()
    if (op === "exec") {
      const input = invocation()
      if (input.timeoutMs === 0) throw new Error("invalid-timeout")
      return access.run(input, { signal: controller.signal })
    }
    if (op === "file.read")
      return files.read(
        text(args.path),
        args.offset === undefined ? undefined : number(args.offset),
        args.length === undefined ? undefined : number(args.length),
        encoding(args.encoding),
        controller.signal,
      )
    if (op === "file.write")
      return files.write(text(args.path), text(args.data, true), encoding(args.encoding), controller.signal)
    if (op === "file.list")
      return files.list(
        args.path === undefined ? undefined : text(args.path),
        args.offset === undefined ? undefined : number(args.offset),
        args.length === undefined ? undefined : number(args.length),
        controller.signal,
      )
    if (op === "terminal.open") {
      const result = await access.open(
        sessionID,
        invocation(true),
        args.cols === undefined ? undefined : number(args.cols),
        args.rows === undefined ? undefined : number(args.rows),
      )
      if (controller.signal.aborted) {
        await access.closeTerminal(sessionID, result.terminalID)
        controller.signal.throwIfAborted()
      }
      return result
    }
    const terminalID = text(args.terminalID)
    if (op === "terminal.read") return access.read(sessionID, terminalID)
    if (op === "terminal.write") return access.write(sessionID, terminalID, text(args.data, true), controller.signal)
    if (op === "terminal.resize")
      return access.resize(sessionID, terminalID, number(args.cols), number(args.rows), controller.signal)
    if (op === "terminal.close") return access.closeTerminal(sessionID, terminalID)
    throw new Error("unsupported-linux-operation")
  }
  void dispatch()
    .then(
      (value) => reply({ type: "linux.rpc.result", id, ok: true, value }),
      (error) =>
        reply({
          type: "linux.rpc.result",
          id,
          ok: false,
          error: error instanceof Error ? error.message : "workspace-failed",
        }),
    )
    .finally(() => pending.delete(id))
  return true
}

function text(value: unknown, empty = false) {
  if (typeof value !== "string" || (!empty && !value)) throw new Error("invalid-string")
  return value
}
function number(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error("invalid-number")
  return value
}
function encoding(value: unknown): "utf8" | "base64" {
  if (value === undefined || value === "utf8") return "utf8"
  if (value === "base64") return "base64"
  throw new Error("invalid-encoding")
}
