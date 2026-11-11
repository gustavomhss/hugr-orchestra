import { describe, expect, test } from "bun:test"
import { readdirSync } from "fs"
import { Effect } from "effect"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewSyft } from "../../src/review-toolkit/syft"

const COPY = "/tmp/copy"
const STDOUT = "{\"artifacts\":[]}\n"

describe("syft", () => {
  test("scans the scratch copy as syft-json and a JSON object is a pass with no findings", async () => {
    const pack = ReviewCatalog.current.packs.find((entry) => entry.id === "syft")
    expect(pack?.template).toBe("syft-dir-json")
    if (!pack) throw new Error("syft missing")
    const seen: {
      argv?: ReadonlyArray<string>
      env?: Record<string, string>
      cwd?: string
      write?: ReadonlyArray<string>
    } = {}
    let retained = ""
    const confine = (input: { argv: ReadonlyArray<string>; cwd: string; write: ReadonlyArray<string>; env: Record<string, string> }) => {
      seen.argv = input.argv
      seen.env = input.env
      seen.cwd = input.cwd
      seen.write = input.write
      expect(readdirSync(input.cwd)).toEqual([])
      return Effect.succeed({
        outcome: {
          exitCode: 0,
          durationMs: 1,
          timedOut: false,
          overflow: false,
          memoryExceeded: false,
          stdout: { data: Buffer.from(STDOUT), bytes: Buffer.byteLength(STDOUT), truncated: false },
          stderr: { data: Buffer.alloc(0), bytes: 0, truncated: false },
        },
      })
    }
    const outcome = await Effect.runPromise(ReviewSyft.scan(pack, (name, text) => {
      retained = `${name}\n${text}`
      return Effect.succeed(`review:test/${name}`)
    }, confine, "/opt/syft", COPY))
    const argv = seen.argv
    const cwd = seen.cwd
    const env = seen.env
    if (!argv || !cwd || !env) throw new Error("syft was not launched")
    expect(argv).toEqual(["/opt/syft", "scan", "dir:/tmp/copy", "--base-path", "/tmp/copy", "-o", "syft-json"])
    expect(argv).not.toContain("--enrich")
    expect(argv.join(" ")).not.toContain("docker")
    expect(argv.join(" ")).not.toContain("registry")
    expect(env.SYFT_CHECK_FOR_APP_UPDATE).toBe("false")
    expect(env.HOME).toBe(cwd)
    expect(env.XDG_CONFIG_HOME).toBe(cwd)
    expect(Object.keys(env).filter((key) => key.startsWith("SYFT_"))).toEqual(["SYFT_CHECK_FOR_APP_UPDATE"])
    expect(cwd).not.toBe(COPY)
    expect(seen.write).toEqual([cwd])
    expect(outcome.checks[0]).toMatchObject({ id: "syft", status: "pass", workspaceExecuted: true })
    expect(outcome.head).toEqual([])
    expect(outcome.base).toEqual([])
    expect(retained).toContain("raw/syft.log")
    expect(retained).toContain(STDOUT)
    expect([...argv]).toEqual(ReviewSyft.argv("/opt/syft", COPY))
  })
})
