// @atlas/cli — test/mine-exit-codes.test.ts  (genesis-hardening A3 — the three `atlas mine` exit codes, by run)
//
//   2 — the run ended on a caught error (here a throwing staging `upsert`): the refusal on stdout AND the
//       error on stderr, through the REAL dispatch catch. Before A3 the controller's GEN-8c catch turned it
//       into the empty report, indistinguishable from a repo with nothing to find.
//   0 — a genuinely empty frontier: an empty report and the existing "0 candidate facts" why-line.
//   1 — a budget ceiling of 1 over a 4-site frontier: what was staged is kept and the resume rank printed.
//
// `runMineArms` is replaced by the REAL `runMine` over injected seams (the dispatch has no seam of its own),
// so everything from the controller to the rendered refusal is production code.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { DiskStore } from "@atlas/adapter-io"

vi.mock("../src/mine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/mine.js")>()
  return { ...actual, runMineArms: vi.fn() }
})

const { runMine, runMineArms, driveMine } = await import("../src/mine.js")
const { dispatchMine } = await import("../src/cli-dispatch.js")
const { budget, depsOf, fakeStore, stagingFake, FRONTIER, REPO, NO_MODEL_ENV } = await import("./mine-fixtures.js")

let stdout: string[]
let stderr: string[]
beforeEach(() => {
  stdout = []
  stderr = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk))
    return true
  })
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk))
    return true
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

/** A staging door that throws — not the `settled: false` refusal, an actual error out of the write. */
const explodingStore = (): DiskStore => ({
  ...fakeStore(),
  commitStaging: (): never => {
    throw new TypeError("staging door exploded")
  },
})

describe("genesis-hardening A3 — `atlas mine` exit codes", () => {
  it("exit 2: a throwing upsert ⇒ refusal on stdout, the error on stderr", async () => {
    // The dispatch refuses an unindexed target before mining when a sound arm is selected (A2); the cwd has no
    // index, so isolate the advisory arm. `runMineArms` → the real `runMine` over the exploding store.
    vi.stubEnv("ATLAS_MINE_SLOT", "advisory")
    vi.mocked(runMineArms).mockImplementationOnce(() =>
      runMine(REPO, depsOf({ store: explodingStore(), budget: budget(FRONTIER.length) })),
    )

    const code = await dispatchMine([])

    expect(code).toBe(2)
    expect(stdout.join("")).toContain("status: rejected")
    expect(stderr.join("")).toContain("atlas mine: the genesis run failed — TypeError: staging door exploded")
  })

  it("exit 0: a genuinely empty frontier ⇒ an empty report and the existing 0-candidate why-line", async () => {
    const report = driveMine(REPO, { env: NO_MODEL_ENV })
    expect(report.seeded).toEqual([])
    expect(report.budgetSpent).toBe(0)
    expect(report.failure).toBeUndefined()
    expect(report.resumeToken).toBeUndefined()

    const v = await runMine(REPO, { env: NO_MODEL_ENV })
    expect(v.exitCode).toBe(0)
    expect(v.stdout).toContain("mine: 0 candidate facts — 0 sites visited")
    expect(v.stdout).not.toContain("partial:")
  })

  it("exit 1: budget ceiling 1 over a 4-site frontier ⇒ staged kept, resume rank printed", async () => {
    const fx = stagingFake()
    const v = await runMine(REPO, depsOf({ store: fx.store, budget: budget(1) }))

    expect(FRONTIER.length).toBeGreaterThanOrEqual(2) // the cap is a real cut
    expect(v.exitCode).toBe(1)
    expect(v.stdout).toMatch(/partial: resume at rank \d+ — the budget ceiling was reached/)
    expect(v.stdout).toContain("seeded 1 candidate fact(s)")
    expect(fx.staged.length).toBeGreaterThan(0) // what the one visited site staged is kept
    expect(fx.staged[fx.staged.length - 1]!.current.size).toBe(1)
  })
})
