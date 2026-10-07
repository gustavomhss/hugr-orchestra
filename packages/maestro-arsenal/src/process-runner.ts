// The process-runner injection point (integration plan §7). Arsenal cannot depend on @opencode-ai/core (core depends
// on arsenal), so the host injects how processes run: core installs its omni runner when it loads arsenal and the omni
// flag is on. With nothing injected, arsenal keeps its own Bun.spawn path.

export interface ProcessRequest {
  argv: string[]
  cwd: string
  /** The child's whole environment (nothing else is inherited). */
  env: Record<string, string>
  input?: string
  timeoutMs: number
  /** Per stream; more output than this is `overflow`. */
  maxOutputBytes: number
}

export interface ProcessResult {
  stdout: Uint8Array
  stderr: Uint8Array
  /** `code ?? (signal ? 1 : 0)` of the root process. */
  exitCode: number
  timedOut: boolean
  overflow: boolean
}

/** Runs one process to completion and stops its whole tree; rejects only when it cannot start. */
export type ProcessRunner = (request: ProcessRequest) => Promise<ProcessResult>

let injected: ProcessRunner | undefined

/** Installs the host's runner; `undefined` restores arsenal's own Bun.spawn path. */
export function setProcessRunner(runner: ProcessRunner | undefined) {
  injected = runner
}

export function processRunner() {
  return injected
}
