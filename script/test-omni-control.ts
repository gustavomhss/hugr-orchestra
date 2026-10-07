// The omni positive control (D-L1), preloaded by the bunfig.toml of every package whose tests spawn through omni
// (core, opencode, maestro-arsenal, desktop). It checks nothing unless OPENCODE_EXPERIMENTAL_OMNI_SPAWNER is on. Then a
// run that made no omni spawn proved nothing about omni and fails; so does a strict run that delegated to legacy.
//
// This file loads no package module at preload time. It runs before each package's own preload, and core's flag.ts
// snapshots env (OPENCODE_DB, OPENCODE_MODELS_PATH, ...) when first loaded: loading it here pinned OPENCODE_DB to unset,
// so tests ran on a file database instead of ":memory:".
import { afterAll } from "bun:test"

const raw = process.env.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER
afterAll(async () => {
  const { omniSpawner } = await import("../packages/core/src/flag/flag")
  const mode = omniSpawner(raw)
  if (mode === "off") return
  const { Omni } = await import("../packages/core/src/omni")
  const problem = Omni.verdict(mode, Omni.snapshot())
  if (problem) throw new Error(`omni positive control: ${problem}`)
})
