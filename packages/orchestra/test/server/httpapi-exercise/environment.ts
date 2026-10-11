import { Flag } from "@orchestra/core/flag/flag"
import { Effect } from "effect"
import { mkdirSync } from "fs"
import path from "path"
import os from "node:os"

const preserveExerciseGlobalRoot = !!process.env.ORCHESTRA_HTTPAPI_EXERCISE_GLOBAL
export const exerciseGlobalRoot =
  process.env.ORCHESTRA_HTTPAPI_EXERCISE_GLOBAL ??
  path.join(os.tmpdir(), `orchestra-httpapi-global-${process.pid}`)
process.env.XDG_DATA_HOME = path.join(exerciseGlobalRoot, "data")
process.env.XDG_CONFIG_HOME = path.join(exerciseGlobalRoot, "config")
process.env.XDG_STATE_HOME = path.join(exerciseGlobalRoot, "state")
process.env.XDG_CACHE_HOME = path.join(exerciseGlobalRoot, "cache")
process.env.ORCHESTRA_INHERIT_CREDENTIALS = "0"
export const exerciseConfigDirectory = path.join(exerciseGlobalRoot, "config", "orchestra")
export const exerciseDataDirectory = path.join(exerciseGlobalRoot, "data", "orchestra")
// Always in the system temp directory: auth probes create git worktrees wherever git root discovery lands, so
// the probe directory must not follow ORCHESTRA_HTTPAPI_EXERCISE_GLOBAL into a checkout.
export const exerciseProbeDirectory = path.join(os.tmpdir(), `orchestra-httpapi-probe-${process.pid}`)
mkdirSync(exerciseProbeDirectory, { recursive: true })

const preserveExerciseDatabase = !!process.env.ORCHESTRA_HTTPAPI_EXERCISE_DB
export const exerciseDatabasePath =
  process.env.ORCHESTRA_HTTPAPI_EXERCISE_DB ??
  path.join(os.tmpdir(), `orchestra-httpapi-exercise-${process.pid}.db`)
process.env.ORCHESTRA_DB = exerciseDatabasePath
Flag.ORCHESTRA_DB = exerciseDatabasePath

export const original = {
  ORCHESTRA_SERVER_PASSWORD: Flag.ORCHESTRA_SERVER_PASSWORD,
  ORCHESTRA_SERVER_USERNAME: Flag.ORCHESTRA_SERVER_USERNAME,
}

export const cleanupExercisePaths = Effect.promise(async () => {
  const fs = await import("fs/promises")
  if (!preserveExerciseDatabase) {
    await Promise.all(
      [exerciseDatabasePath, `${exerciseDatabasePath}-wal`, `${exerciseDatabasePath}-shm`].map((file) =>
        fs.rm(file, { force: true }).catch(() => undefined),
      ),
    )
  }
  await fs.rm(exerciseProbeDirectory, { recursive: true, force: true }).catch(() => undefined)
  if (!preserveExerciseGlobalRoot)
    await fs.rm(exerciseGlobalRoot, { recursive: true, force: true }).catch(() => undefined)
})
