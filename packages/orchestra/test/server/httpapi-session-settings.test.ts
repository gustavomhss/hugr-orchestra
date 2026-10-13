import { expect, test } from "bun:test"
import { Process } from "../../src/util/process"
import { expectSpawn } from "../../../core/test/fixture/omni-expect"

// Bun/Turbo discovery must execute the DSL's native handler stories, not only count their registration.
test("Session settings DSL exercises real policy, archive and cursor requests", async () => {
  expectSpawn(import.meta.path)
  const addon = process.env.HUGR_OMNI_ADDON
  const supervisor = process.env.HUGR_OMNI_SUPERVISOR
  if (!addon || !supervisor)
    throw new Error("Session settings proof requires the owner/CI native addon and supervisor pair")
  const result = await Process.run(
    [
      process.execPath,
      "-e",
      // Omni strips its own environment from children. This test driver explicitly hands over the same producer pair.
      "process.env.HUGR_OMNI_ADDON = process.argv[1]; process.env.HUGR_OMNI_SUPERVISOR = process.argv[2]; await import(process.argv[3])",
      addon,
      supervisor,
      new URL("../../script/httpapi-exercise.ts", import.meta.url).href,
      "--mode",
      "effect",
      "--include",
      "v2.session.settings.",
      "--fail-on-missing",
      "--fail-on-skip",
    ],
    {
      nothrow: true,
      deadline: 150_000,
      env: { ORCHESTRA_PRINT_LOGS: "1", ORCHESTRA_LOG_LEVEL: "ERROR", ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "strict" },
    },
  )
  const output = result.stdout.toString() + result.stderr.toString()
  expect(result.code, output).toBe(0)
  expect(output).toContain("selected=14")
  expect(output).toContain("summary pass=14 fail=0 skip=0 missing=0 extra=0")
  expect(output).toContain("v2.session.settings.policy.get.parent")
  expect(output).toContain("v2.session.settings.policy.get.child")
  expect(output).toContain("v2.session.settings.archive.lifecycle")
}, 160_000)
