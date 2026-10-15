export * as MaestroArsenalOmni from "./maestro-arsenal-omni"

import { Flag } from "@orchestra/core/flag/flag"
import { Omni } from "@orchestra/core/omni"
import type { ProcessRequest, ProcessResult } from "@orchestra/maestro-arsenal"

/**
 * Loads arsenal, and with the omni flag on installs the omni process runner into it (integration plan §7): arsenal
 * cannot depend on core, so this is where its processes move to omni. With the flag off arsenal keeps Bun.spawn.
 */
export function loadArsenal() {
  return import("@orchestra/maestro-arsenal").then((module) => {
    if (Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER !== "off") module.Arsenal.setProcessRunner(omniRunner)
    return module
  })
}

/** Arsenal's process runner on omni: one run(), the whole tree stopped on timeout, overflow or exit. */
export async function omniRunner(request: ProcessRequest): Promise<ProcessResult> {
  const binding = await Omni.load()
  const [command, ...args] = request.argv
  const env = Object.fromEntries(Object.entries(request.env).filter(([key]) => !/^HUGR_OMNI_/i.test(key)))
  const pending = binding.run(command, args, {
    cwd: request.cwd,
    inheritEnv: false,
    env,
    input: request.input,
    text: false,
    timeoutMs: request.timeoutMs,
    maxOutputBytes: request.maxOutputBytes,
  })
  Omni.count("spawns")
  const { result, overflow } = await pending.then(
    (result) => ({ result, overflow: false }),
    (error: unknown) => {
      const limit = error as { code?: string; result?: Awaited<typeof pending> }
      if (limit.code === "OUTPUT_LIMIT" && limit.result) return { result: limit.result, overflow: true }
      throw error
    },
  )
  const exitCode = result.exitCode ?? (result.signal ? 1 : 0)
  return { stdout: result.stdout, stderr: result.stderr, exitCode, timedOut: result.reason === "timeout", overflow }
}
