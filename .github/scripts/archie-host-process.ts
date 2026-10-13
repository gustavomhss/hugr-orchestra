type Handle = { exitCode: number | null; signalCode?: string | null; kill: (signal: "SIGTERM" | "SIGKILL") => unknown }

import { lstat, mkdir, open, readdir, realpath } from "node:fs/promises"
import { join } from "node:path"

export async function claimOutput(out: string) {
  await mkdir(out, { recursive: true, mode: 0o700 })
  const stat = await lstat(out)
  if (!stat.isDirectory() || stat.isSymbolicLink() || (await readdir(out)).length) throw new Error("OUTPUT_NOT_FRESH")
  const claim = await open(join(out, ".claim"), "wx", 0o600)
  await claim.writeFile(JSON.stringify({ pid: process.pid }))
  await claim.close()
  if ((await readdir(out)).some((name) => name !== ".claim")) throw new Error("OUTPUT_CLAIM_CONFLICT")
  return realpath(out)
}

export async function within<T>(promise: Promise<T>, milliseconds: number) {
  const timer: { value?: ReturnType<typeof setTimeout> } = {}
  return Promise.race([
    promise.then((value) => ({ completed: true as const, value })),
    new Promise<{ completed: false }>((resolve) => { timer.value = setTimeout(() => resolve({ completed: false }), milliseconds) }),
  ]).finally(() => clearTimeout(timer.value))
}

export async function stopOwned(child: Handle, finished: Promise<unknown>, limits = { term: 10_000, kill: 10_000 }) {
  if (child.exitCode === null && child.signalCode == null) child.kill("SIGTERM")
  const graceful = await within(finished, limits.term)
  if (graceful.completed) return { signal: "SIGTERM", exited: true }
  if (child.exitCode === null && child.signalCode == null) child.kill("SIGKILL")
  const killed = await within(finished, limits.kill)
  if (!killed.completed) throw new Error("OWNED_PROCESS_EXIT_UNCONFIRMED")
  return { signal: "SIGKILL", exited: true }
}

export function requireOrdinaryLoginEnvironment(names: readonly string[]) {
  const overrides = names.filter((name) => ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"].includes(name))
  if (overrides.length) throw new Error(`ALTERNATE_CLAUDE_AUTH_ENVIRONMENT: ${overrides.join(", ")}`)
}

export function billingDiagnostic(text: string) {
  return /billing_error|billing error|third-party apps now draw from your extra usage|(?:error|disabled|exhausted|insufficient).*extra[ -]usage|extra[ -]usage.*(?:error|disabled|exhausted|insufficient)|(?:HTTP|status|error)[: =]*400\b|isUsingOverage[^\n]*true/i.test(text)
}
