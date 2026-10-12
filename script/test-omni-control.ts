// The omni positive control (D-L1), preloaded by the bunfig.toml of every package whose tests spawn through omni
// (core, orchestra, maestro-arsenal, desktop). Unset now means on; explicit legacy rollback checks nothing.
//
// A test declares that it must spawn through omni by calling expectSpawn(import.meta.path) from
// packages/core/test/fixture/omni-expect.ts in its body. The afterEach below settles each declaring test with the omni
// spawns counted since its call. With omni on, the run fails when:
// - a declaring test that ran made no omni spawn of its own (in every scope);
// - the run was expected to spawn through omni and made no omni spawn;
// - a strict run delegated to legacy, or any run delegated without a single omni spawn.
//
// Whether a run is expected to spawn is ORCHESTRA_OMNI_CONTROL:
// - unset or "suite": always. test.yml's lanes leave it unset; test-ci.yml sets it for a whole-package request.
// - "declared": only when a declaring test ran. test-ci.yml sets it for a request that names files or a -t filter.
//   A focused run in which no declaring test ran, with no omni spawn and no delegation, prints "not applicable".
// Any other value fails the run before a test starts.
//
// Every outermost run prints exactly one verdict line, "omni positive control: ...". When test-ci.yml provides
// ORCHESTRA_OMNI_CONTROL_NONCE, the line reads "omni positive control [<nonce>]: ..." and test-ci.ts accepts only that
// line. The variable is removed from this process's environment here, before any test loads, so a test's own output
// cannot carry this run's nonce.
//
// This file loads no package module at preload time. It runs before each package's own preload, and core's flag.ts
// snapshots env (ORCHESTRA_DB, ORCHESTRA_MODELS_PATH, ...) when first loaded: loading it here pinned ORCHESTRA_DB to unset,
// so tests ran on a file database instead of ":memory:".
import { afterAll, afterEach } from "bun:test"
import path from "node:path"

const raw = process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER
const scope = process.env.ORCHESTRA_OMNI_CONTROL ?? "suite"
if (scope !== "suite" && scope !== "declared")
  throw new Error(`omni positive control: ORCHESTRA_OMNI_CONTROL=${JSON.stringify(scope)} is not suite or declared.`)
const nonce = process.env.ORCHESTRA_OMNI_CONTROL_NONCE
delete process.env.ORCHESTRA_OMNI_CONTROL_NONCE
if (nonce !== undefined && !/^[0-9a-f]{32}$/.test(nonce))
  throw new Error("omni positive control: ORCHESTRA_OMNI_CONTROL_NONCE is not 32 lowercase hex digits.")
const tag = nonce === undefined ? "omni positive control" : `omni positive control [${nonce}]`
// A test that starts its own `bun test` (arsenal-lazy) hands it this run's environment, flag included; the control
// belongs to the outermost run only, which marks itself here before any test spawns.
const nested = process.env.ORCHESTRA_OMNI_CONTROL_RUN !== undefined
process.env.ORCHESTRA_OMNI_CONTROL_RUN = String(process.pid)
const expectations = "../packages/core/test/fixture/omni-expect"
afterEach(async () => {
  const { settle } = await import(expectations)
  settle()
})
afterAll(async () => {
  if (nested) return
  const { omniSpawner } = await import("../packages/core/src/flag/flag")
  const mode = omniSpawner(raw)
  if (mode === "off") return console.log(`${tag}: off (legacy rollback); nothing checked.`)
  const { Omni } = await import("../packages/core/src/omni")
  const { results } = await import(expectations)
  const counts = Omni.snapshot()
  const declared = (results() as { file: string; spawns: number }[]).map((entry) => ({
    file: path.relative(process.cwd(), entry.file).replaceAll("\\", "/"),
    spawns: entry.spawns,
  }))
  const files = [...new Set(declared.map((entry) => entry.file))]
  const silent = files.flatMap((file) => {
    const own = declared.filter((entry) => entry.file === file)
    const none = own.filter((entry) => entry.spawns <= 0).length
    return none > 0 ? [`${file}: ${none} of ${own.length} declaring test(s) made no omni spawn of their own`] : []
  })
  const reason =
    scope === "suite"
      ? "suite: every run must spawn through omni"
      : declared.length > 0
        ? `declared: ${declared.length} test(s) in ${files.join(", ")}`
        : "focused: no declaring test ran"
  if (silent.length > 0) throw new Error(`${tag}: FAIL (${reason}). ${silent.join("; ")}.`)
  const problem = Omni.verdict(mode, counts, scope === "suite" || declared.length > 0)
  if (problem) throw new Error(`${tag}: FAIL (${reason}). ${problem}`)
  if (counts.spawns === 0)
    return console.log(`${tag}: not applicable (${reason}); this run made no omni spawn and delegated none, so it proved nothing about omni.`)
  console.log(`${tag}: pass (${reason}); ${counts.spawns} omni spawn(s), ${counts.delegations} delegated.`)
})
