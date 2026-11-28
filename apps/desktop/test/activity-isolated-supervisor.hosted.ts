import { expect, test } from "bun:test"
import { Omni } from "@orchestra/core/omni"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"

test.skipIf(process.platform !== "linux" || process.env.ORCHESTRA_ACTIVITY_SIDECAR_CI !== "1")(
  "the root Omni supervisor rejects an unlisted program and substitutes an administrator-controlled environment",
  async () => {
    expectSpawn(import.meta.path)
    const omni = await Omni.load()
    const options = { memberIsolation: true, cwd: "/tmp", inheritEnv: false, env: { CALLER_VARIABLE: "discard" } } as const
    expect(() => omni.spawn("/bin/cat", [], options)).toThrow(/(?:authorized|allowlist|allowed|admitted)/i)
    const result = await omni.run("/usr/bin/cat", ["/proc/self/environ"], options)
    Omni.count("spawns")
    expect(result.exitCode).toBe(0)
    expect(result.stdout.split("\0").filter(Boolean).sort()).toEqual(["LANG=C", "PATH=/usr/bin:/bin"])
  },
  30_000,
)
