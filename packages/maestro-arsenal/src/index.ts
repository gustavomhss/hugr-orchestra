export * as Arsenal from "./index"
export { list, describe, execute } from "./registry"
export { evaluateCompletion } from "./governance/completion-evaluation"
export { validateHostSnapshot } from "./governance/telemetry"
export async function runCompletion(...args: Parameters<typeof import("./governance/completion").runCompletion>) {
  const { runCompletion } = await import("./governance/completion")
  return runCompletion(...args)
}
export async function readPreferencesSnapshot(...args: Parameters<typeof import("./tools/profile").readPreferencesSnapshot>) {
  const { readPreferencesSnapshot } = await import("./tools/profile")
  return readPreferencesSnapshot(...args)
}
export type { CompletionContract, HostCheck, HostCheckRegistry } from "./governance/completion"
export type { ArsenalContext, Descriptor, Effect, Tool, ToolTextResult } from "./contract"
export { setProcessRunner, processRunner } from "./process-runner"
export type { ProcessRequest, ProcessResult, ProcessRunner } from "./process-runner"
