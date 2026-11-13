export * as ReviewCargoAuditFacts from "./cargo-audit-facts"

import { Effect } from "effect"
import { BackendToolkit } from "../backend-toolkit"
import pinned from "../backend-toolkit/packs/cargo-audit"
import { ResearchProcess } from "../research-toolkit/process"

// Status-only pin lookup. Never ensure, prefetch, or start a process at import.
export const VERSION = "0.23.0"
export const TEMPLATE = "cargo-audit-lock-json"
export const RULE = "cargo-audit/advisory"
export const DATABASE_ABSENT = "not run: RustSec advisory database absent"

export function argv(bin: string, lock: string, db: string): string[] {
  return [bin, "audit", "--file", lock, "--db", db, "--no-fetch", "--no-yanked", "--stale", "--format", "json"]
}

export function refreshArgv(bin: string, db: string): string[] {
  return [bin, "audit", "update-db", "--db", db, "--url", "https://github.com/RustSec/advisory-db.git"]
}

export function environment(home: string, input: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(ResearchProcess.environment(input)).filter(([key]) =>
      !key.startsWith("CARGO_") && !key.startsWith("RUSTUP_") && !key.startsWith("RUSTSEC_") && key !== "HOME" && !key.startsWith("XDG_"))),
    HOME: home,
    CARGO_HOME: home,
    RUSTUP_HOME: home,
    XDG_CONFIG_HOME: home,
    XDG_CACHE_HOME: home,
    TMPDIR: home,
  }
}

export function lockfiles(paths: readonly string[]): string[] {
  return [...new Set(paths.filter(safeCargoLock))].sort()
}

export function cardReason(reason: string | undefined, state?: { readonly revision: string; readonly committedAt: string; readonly refreshedAt: string }): string {
  if (state === undefined) return DATABASE_ABSENT
  const stamp = `rustsec database: ${state.revision}; committed: ${state.committedAt}; refreshed: ${state.refreshedAt}; yanked: not examined`
  if (!reason) return stamp
  return `${reason}; ${stamp}`
}

export const locate: () => Effect.Effect<{ executable: string } | { absent: string }> = Effect.fn("ReviewCargoAuditFacts.locate")(function* () {
  if (process.platform !== "linux" || process.arch !== "x64") return { absent: "native-runtime-unqualified" }
  const target = yield* BackendToolkit.Target
  if ("unsupported" in target || target.target !== "linux-x64") return { absent: "native-runtime-unqualified" }
  const states = yield* BackendToolkit.status<string>(pinned.id).pipe(
    Effect.provideService(BackendToolkit.Manifest, { [pinned.id]: pinned }),
  )
  const state = states[0]
  if (state?.status === "ready") return { executable: state.executable }
  if (state?.status === "unsupported") return { absent: `cargo-audit absent: ${state.reason}` }
  if (state?.status === "failed") return { absent: `cargo-audit absent: ${state.cause}` }
  return { absent: "cargo-audit absent" }
})

function safeCargoLock(file: string) {
  if (file.includes("\0") || file.includes("\r") || file.includes("\n") || file.includes("\\")) return false
  if (file.startsWith("/") || /^[A-Za-z]:/.test(file)) return false
  const parts = file.split("/")
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) return false
  return parts[parts.length - 1] === "Cargo.lock"
}
