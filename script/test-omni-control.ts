// The omni positive control (D-L1), preloaded by the bunfig.toml of every package whose tests spawn through omni
// (core, opencode, maestro-arsenal, desktop). It checks nothing unless OPENCODE_EXPERIMENTAL_OMNI_SPAWNER is on. Then a
// run that made no omni spawn proved nothing about omni and fails; so does a strict run that delegated to legacy.
import { afterAll } from "bun:test"
import { omniSpawner } from "../packages/core/src/flag/flag"

const mode = omniSpawner(process.env.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER)
// A test that starts its own `bun test` (arsenal-lazy) hands it this run's environment, flag included; the control
// belongs to the outermost run only, which marks itself here before any test spawns.
const nested = process.env.OPENCODE_OMNI_CONTROL_RUN !== undefined
process.env.OPENCODE_OMNI_CONTROL_RUN = String(process.pid)
if (mode !== "off" && !nested) {
  const { Omni } = await import("../packages/core/src/omni")
  afterAll(() => {
    const problem = Omni.verdict(mode, Omni.snapshot())
    if (problem) throw new Error(`omni positive control: ${problem}`)
  })
}
