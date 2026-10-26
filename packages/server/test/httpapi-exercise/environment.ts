import { mkdirSync } from "fs"
import os from "node:os"
import path from "path"

// Imported before any Core module: Core reads these once at load, and Scenarios create and delete sessions, so they
// must never point at a developer's real database or home.
export const exerciseGlobalRoot =
  process.env.ORCHESTRA_HTTPAPI_EXERCISE_GLOBAL ?? path.join(os.tmpdir(), `orchestra-httpapi-global-${process.pid}`)
process.env.XDG_DATA_HOME = path.join(exerciseGlobalRoot, "data")
process.env.XDG_CONFIG_HOME = path.join(exerciseGlobalRoot, "config")
process.env.XDG_STATE_HOME = path.join(exerciseGlobalRoot, "state")
process.env.XDG_CACHE_HOME = path.join(exerciseGlobalRoot, "cache")
process.env.ORCHESTRA_INHERIT_CREDENTIALS = "0"
// Each Scenario builds its own app, and with it its own in-memory database.
process.env.ORCHESTRA_DB = ":memory:"
// The server reads credentials from the environment when no password is passed in; the exercise passes it explicitly.
delete process.env.ORCHESTRA_SERVER_PASSWORD
delete process.env.ORCHESTRA_SERVER_USERNAME
// The Claude mode routes resolve this missing executable and fail at once instead of starting Claude Code's sign-in.
process.env.ORCHESTRA_CLAUDE_CODE_EXECUTABLE = path.join(exerciseGlobalRoot, "missing-claude-code")
export const exerciseConfigDirectory = path.join(exerciseGlobalRoot, "config", "orchestra")
export const exerciseDataDirectory = path.join(exerciseGlobalRoot, "data", "orchestra")
// Always in the system temp directory: auth probes can create git worktrees wherever git root discovery lands, so the
// probe directory must not follow ORCHESTRA_HTTPAPI_EXERCISE_GLOBAL into a checkout.
export const exerciseProbeDirectory = path.join(os.tmpdir(), `orchestra-httpapi-probe-${process.pid}`)
mkdirSync(exerciseProbeDirectory, { recursive: true })

export async function cleanupExercisePaths() {
  const fs = await import("fs/promises")
  await fs.rm(exerciseProbeDirectory, { recursive: true, force: true }).catch(() => undefined)
  if (!process.env.ORCHESTRA_HTTPAPI_EXERCISE_GLOBAL)
    await fs.rm(exerciseGlobalRoot, { recursive: true, force: true }).catch(() => undefined)
}
