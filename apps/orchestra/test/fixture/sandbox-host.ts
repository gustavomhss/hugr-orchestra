import { Effect } from "effect"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { ToolSafetySandboxRuntime } from "@orchestra/core/tool-safety-sandbox-runtime"

/**
 * The jail this host gives a sandbox-bound command: seatbelt, srt, or none and why. A Linux host with bubblewrap fetches
 * its sandbox runtime first, so its srt jail is tested rather than reported as not acquired yet. Tests branch on this:
 * the jailed behaviour where there is a jail, the named HOLD or documented fallback where there is none.
 */
export const sandboxHost = await Effect.runPromise(
  ToolSafetySandboxRuntime.ready().pipe(Effect.andThen(ToolSafetySandbox.status())),
)

// Windows' AppContainer confines pwsh and cmd only (tool-safety-appcontainer.test.ts), so the node-based probes that branch
// on `jail` treat it as no jail and take their named-HOLD path.
export const jail = sandboxHost.shellWrites === "enforced" && sandboxHost.shellSandbox.kind !== "appcontainer"
  ? sandboxHost.shellSandbox.kind : undefined
