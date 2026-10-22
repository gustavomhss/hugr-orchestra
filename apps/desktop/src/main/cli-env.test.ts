import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mockElectron } from "./electron-mock.fixture"

mockElectron()

const { cliEnv } = await import("./cli-env")

const keys = ["ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER", "HUGR_OMNI_ADDON", "HUGR_OMNI_SUPERVISOR"] as const
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
let directory: string | undefined

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "orchestra-cli-env-"))
  const addon = join(directory, "hugr_omni.node")
  const supervisor = join(directory, "hugr-omni-supervisor")
  process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER = "1"
  process.env.HUGR_OMNI_ADDON = addon
  process.env.HUGR_OMNI_SUPERVISOR = supervisor
  await Promise.all([writeFile(addon, ""), writeFile(supervisor, "")])
})

afterEach(async () => {
  for (const key of keys) {
    const value = saved[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  if (directory) await rm(directory, { recursive: true, force: true })
})

test("the owned CLI child gets the desktop's resolved omni pair", () => {
  const env = cliEnv({ PATH: "/bin", XDG_STATE_HOME: "/stale" }, "/state")
  expect(env.HUGR_OMNI_ADDON).toBe(process.env.HUGR_OMNI_ADDON)
  expect(env.HUGR_OMNI_SUPERVISOR).toBe(process.env.HUGR_OMNI_SUPERVISOR)
  expect(env.XDG_STATE_HOME).toBe("/state")
  expect(env.PATH).toBe("/bin")
})

test("an absent state home removes the inherited XDG_STATE_HOME", () => {
  const env = cliEnv({ XDG_STATE_HOME: "/stale" }, undefined)
  expect(env.XDG_STATE_HOME).toBeUndefined()
  expect(env.HUGR_OMNI_ADDON).toBe(process.env.HUGR_OMNI_ADDON)
  expect(env.HUGR_OMNI_SUPERVISOR).toBe(process.env.HUGR_OMNI_SUPERVISOR)
})
