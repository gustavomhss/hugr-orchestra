// @atlas/cli — test/cli-crash.test.ts  (an error that escapes `main` exits 3, never Node's default 1)
//
// `bin.ts` runs `main` in an async IIFE whose `.catch` hands anything that escapes to `reportCrash`. Node's
// own exit for an uncaught throw is 1 — the code a script reads as a usage error, and `atlas mine` as a
// partial run — so a crashed `mine` arm used to pass for "budget reached". `bin.ts` itself runs on import
// and is not loadable here; this drives the REAL escape (`main(['mine', …])` re-raising an error the mine
// catch does not classify, as #140's control does) into the same `reportCrash` `bin.ts` calls.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/mine.js", () => ({ runMineArms: vi.fn() }))
import { runMineArms } from "../src/mine.js"
import { main } from "../src/cli.js"
import { reportCrash } from "../src/cli-verdict.js"

let stderr: string[]
beforeEach(() => {
  stderr = []
  vi.stubEnv("ATLAS_MINE_SLOT", "advisory") // the cwd has no index; isolate the arm that needs none
  vi.spyOn(process.stdout, "write").mockImplementation(() => true)
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk))
    return true
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe("an error that escapes main is an internal error, exit 3", () => {
  it("a foreign throw out of `atlas mine` reaches reportCrash ⇒ 3, with the error on stderr", async () => {
    const foreign = new TypeError("Cannot read properties of undefined (reading 'contentHash')")
    vi.mocked(runMineArms).mockRejectedValueOnce(foreign)

    const code = await main(["mine", "."]).then(
      () => "main returned",
      (e: unknown) => reportCrash(e),
    )

    expect(code).toBe(3)
    expect(stderr.join("")).toContain("atlas: internal error")
    expect(stderr.join("")).toContain("TypeError: Cannot read properties of undefined (reading 'contentHash')")
  })

  it("a non-Error throw is reported too", () => {
    expect(reportCrash("plain string")).toBe(3)
    expect(stderr.join("")).toContain("atlas: internal error — plain string")
  })
})
