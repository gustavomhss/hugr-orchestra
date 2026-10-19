export * as McpStdio from "./stdio"

// Opens the omni stdio MCP transport (core's McpStdio) when ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER is on; the legacy path
// keeps the MCP SDK's own stdio transport. Docker servers get `--rm` and an owner label here.

import { hostname } from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { Flag } from "@orchestra/core/flag/flag"
import { OmniStdioTransport, failure, type Params } from "@orchestra/core/mcp/stdio"
import { Process } from "@/util/process"

export { OmniStdioTransport, failure }
/** Docker label that ties a container started for an MCP server to the Orchestra process that started it. */
export const LABEL = "orchestra.session"

/** Whether MCP stdio servers start on omni. */
export function enabled() {
  return Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER !== "off"
}

/**
 * The omni transport for one configured server: docker gets `--rm` and the owner label (after one sweep per process),
 * and every stderr line becomes a debug log of the calling fiber's loggers.
 */
export const open = Effect.fnUntraced(function* (
  input: Omit<Params, "log" | "spawned"> & { server: string; args: string[] },
) {
  const args = docker(input.command, input.args)
  if (args !== input.args) yield* Effect.promise(() => sweep())
  const log = Effect.runForkWith(yield* Effect.context<never>())
  return new OmniStdioTransport({
    ...input,
    args,
    log: (line) => void log(Effect.logDebug("MCP stderr", { server: input.server, line })),
    spawned: () => Process.telemetry("spawn", { command: path.basename(input.command), mode: "mcp" }),
  })
})

/**
 * `docker run` arguments for an omni MCP server: `--rm`, and a label naming this process, so a container whose client
 * died with a kill -9 is removed by the next sweep(). Other commands pass unchanged.
 */
export function docker(command: string, args: string[]) {
  if (path.basename(command).replace(/\.exe$/i, "") !== "docker" || args[0] !== "run") return args
  const extra = [...(args.includes("--rm") ? [] : ["--rm"]), "--label", `${LABEL}=${owner()}`]
  return ["run", ...extra, ...args.slice(1)]
}

function owner() {
  return `${hostname()}/${process.pid}`
}

let swept: Promise<void> | undefined

/**
 * Once per process: removes MCP containers labelled by an Orchestra process of this host that is gone. A label whose
 * pid is alive (even a reused pid) is left alone, so a sweep can leak a container but never removes a live one.
 */
export function sweep() {
  swept ??= (async () => {
    const listed = await Process.lines(
      ["docker", "ps", "-a", "--filter", `label=${LABEL}`, "--format", `{{.ID}} {{.Label "${LABEL}"}}`],
      { nothrow: true, deadline: 15_000 },
    )
    const dead = listed
      .map((line) => line.trim().split(/\s+/))
      .filter(([id, label]) => id && label && stale(label))
      .map(([id]) => id)
    if (dead.length === 0) return
    await Process.run(["docker", "rm", "-f", ...dead], { nothrow: true, deadline: 30_000 })
  })().catch(() => undefined)
  return swept
}

function stale(label: string) {
  const [host, pid] = [label.slice(0, label.lastIndexOf("/")), Number(label.slice(label.lastIndexOf("/") + 1))]
  if (host !== hostname() || !Number.isSafeInteger(pid) || pid <= 0) return false
  if (pid === process.pid) return false
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    return (error as { code?: string }).code === "ESRCH"
  }
}
