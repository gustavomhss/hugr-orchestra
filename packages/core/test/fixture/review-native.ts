export * as ReviewNativeFixture from "./review-native"

import path from "node:path"
import { Effect } from "effect"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ToolSafetySandbox } from "../../src/tool-safety-sandbox"

/** Qualify a pinned tool using the production sandbox and spawner, never a host-shell fallback. */
export function run(input: { executable: string; args: readonly string[]; root: string }) {
  return Effect.scoped(Effect.gen(function* () {
    const launch = yield* ToolSafetySandbox.confine({
      command: input.executable,
      args: input.args,
      cwd: input.root,
      env: ResearchProcess.environment({
        PATH: process.env.PATH,
        HOME: input.root,
        XDG_CONFIG_HOME: path.join(input.root, ".config"),
        XDG_CACHE_HOME: path.join(input.root, ".cache"),
        TMPDIR: input.root,
        LANG: "C.UTF-8",
        NO_COLOR: "1",
      }),
      write: [],
    })
    return yield* ResearchProcess.run({
      command: launch.command,
      args: launch.args,
      cwd: input.root,
      env: Object.fromEntries(Object.entries(launch.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      timeoutMs: 60_000,
      maxBytes: 4 * 1024 * 1024,
    })
  }))
}
