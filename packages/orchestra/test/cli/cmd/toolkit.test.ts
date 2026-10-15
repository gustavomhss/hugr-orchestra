import { describe, expect } from "bun:test"
import path from "path"
import { writeFile } from "fs/promises"
import { Effect } from "effect"
import type { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { BackendToolkitManifest } from "@orchestra/core/backend-toolkit/manifest"
import { BackendToolkitTarget } from "@orchestra/core/backend-toolkit/target"
import { cliIt } from "../../lib/cli-process"

// Network-free: an empty root only reads state, and a root that is a regular file fails before any download starts.
describe("toolkit command", () => {
  cliIt.live(
    "status --json prints one State per engine",
    ({ home, orchestra }) =>
      Effect.gen(function* () {
        const detected = BackendToolkitTarget.detect()
        const result = yield* orchestra.spawn(["toolkit", "status", "--json"], {
          env: { BACKEND_TOOLKIT_ROOT: path.join(home, "toolkit") },
        })
        // An engine can be unsupported on a target the host supports (sqlx needs the MSVC linker on Windows).
        const expected: BackendToolkit.State[] = Object.values<BackendToolkitManifest.Engine>(BackendToolkitManifest.ENGINES).map((engine) => {
          if (!("target" in detected))
            return { engine: engine.id, version: engine.version, status: "unsupported", reason: detected.unsupported }
          const reason = "runtime" in engine ? engine.unsupported?.[detected.target] : undefined
          if (reason) return { engine: engine.id, version: engine.version, target: detected.target, status: "unsupported", reason }
          return { engine: engine.id, version: engine.version, target: detected.target, status: "absent" }
        })
        orchestra.expectExit(result, expected.some((state) => state.status === "unsupported") ? 1 : 0, "toolkit status --json")
        expect(JSON.parse(result.stdout)).toEqual(expected)
      }),
    60_000,
  )

  cliIt.live(
    "a failed prefetch exits non-zero and names the engine and cause",
    ({ home, orchestra }) =>
      Effect.gen(function* () {
        const root = path.join(home, "not-a-directory")
        yield* Effect.promise(() => writeFile(root, ""))
        const result = yield* orchestra.spawn(["toolkit", "prefetch", "sqlc"], { env: { BACKEND_TOOLKIT_ROOT: root } })
        expect(result.exitCode).not.toBe(0)
        expect(result.stdout).toContain(`sqlc ${BackendToolkitManifest.ENGINES.sqlc.version} failed: filesystem`)
        expect(result.stderr).toContain("sqlc failed: filesystem")
      }),
    60_000,
  )
})
