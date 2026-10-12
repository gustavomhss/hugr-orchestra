// The omni positive control (D-L1), preloaded by the bunfig.toml of every package whose tests spawn through omni
// (core, orchestra, maestro-arsenal, desktop). Unset now means on; explicit legacy rollback checks nothing. Then a
// run that was expected to spawn through omni and made no omni spawn proved nothing about omni and fails; so does a
// strict run that delegated to legacy, and any run that delegated without a single omni spawn.
//
// Which runs are expected to spawn is ORCHESTRA_OMNI_CONTROL:
// - unset or "suite" (test.yml's lanes): every run. Whole packages and the orchestra shards always spawn.
// - "declared" (test-ci.yml, set for every `bun run test:ci` run): a run in which Bun loaded a test file that called
//   Omni.expectSpawn(import.meta.path) at its top level. Bun decides the selection; this file only reads what loaded.
//   A focused run whose files declare nothing and that neither spawned through omni nor delegated prints
//   "not applicable" and passes.
// Any other value fails the run before a test starts. Every outermost run prints one "omni positive control:" line.
//
// This file loads no package module at preload time. It runs before each package's own preload, and core's flag.ts
// snapshots env (ORCHESTRA_DB, ORCHESTRA_MODELS_PATH, ...) when first loaded: loading it here pinned ORCHESTRA_DB to unset,
// so tests ran on a file database instead of ":memory:".
import { afterAll } from "bun:test"
import path from "node:path"

const raw = process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER
const scope = process.env.ORCHESTRA_OMNI_CONTROL ?? "suite"
if (scope !== "suite" && scope !== "declared")
  throw new Error(`omni positive control: ORCHESTRA_OMNI_CONTROL=${JSON.stringify(scope)} is not suite or declared.`)
// A test that starts its own `bun test` (arsenal-lazy) hands it this run's environment, flag included; the control
// belongs to the outermost run only, which marks itself here before any test spawns.
const nested = process.env.ORCHESTRA_OMNI_CONTROL_RUN !== undefined
process.env.ORCHESTRA_OMNI_CONTROL_RUN = String(process.pid)
afterAll(async () => {
  if (nested) return
  const { omniSpawner } = await import("../packages/core/src/flag/flag")
  const mode = omniSpawner(raw)
  if (mode === "off") return console.log("omni positive control: off (legacy rollback); nothing checked.")
  const { Omni } = await import("../packages/core/src/omni")
  const counts = Omni.snapshot()
  const declared = Omni.expected().map((file) => path.relative(process.cwd(), file).replaceAll("\\", "/"))
  const reason =
    scope === "suite"
      ? "suite: every run must spawn through omni"
      : declared.length > 0
        ? `declared by ${declared.join(", ")}`
        : "focused: no loaded test file declares an omni spawn"
  const problem = Omni.verdict(mode, counts, scope === "suite" || declared.length > 0)
  if (problem) throw new Error(`omni positive control: FAIL (${reason}). ${problem}`)
  if (counts.spawns === 0)
    return console.log(`omni positive control: not applicable (${reason}); this run made no omni spawn and delegated none, so it proved nothing about omni.`)
  console.log(`omni positive control: pass (${reason}); ${counts.spawns} omni spawn(s), ${counts.delegations} delegated.`)
})
