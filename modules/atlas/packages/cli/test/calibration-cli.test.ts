// WP-3-RETR — `atlas budget` / `atlas territories`: the RETR-8/13 calibration READ legs wired into the CLI
// (transcript: the frozen @atlas/retrieval `ledger.ts` RETR-8 + `offatlas.ts` RETR-13 surfaces as running
// code). This suite drives `main()` over FAKE injected legs (the leg's own behaviour is
// `calibration-verdicts.ts`'s job) and asserts: the commands exist and classify READ, the dispatch reaches
// the injected leg, and an uncomposed runtime fails closed — the same shape memory-read-cli.test.ts uses.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { main } from "../src/cli.js"
import { COMMANDS, COMMAND_LEG, authorityOf } from "../src/map.js"
import type { BudgetReport, TerritoriesLeg } from "@atlas/adapter-io"
import { ledgerFrom, offAtlasFrom } from "@atlas/retrieval"
import { OFF_ATLAS_THRESHOLD } from "@atlas/adapter-io"

let writes: string[]
beforeEach(() => {
  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  })
})
afterEach(() => vi.restoreAllMocks())

describe("WP-3-RETR — atlas budget renders the RETR-8 per-kind hits/hitRate calibration ledger", () => {
  it("a composed budget leg renders the honest-zero BASE_CAP floor, exit 0", async () => {
    const budget: () => BudgetReport = () => ({ ledger: ledgerFrom([]), servedRecords: 0 })
    const code = await main(["budget"], { budget })
    expect(code).toBe(0)
    // the honest-zero feed note — 0 served injections, caps at the ratified floor — is rendered, never an
    // invented rate (the repo's honest-zero culture; `own-source.ts` names the SAME deficit at `hits: 0`).
    expect(writes.join("")).toContain("ratified BASE_CAP floor")
  })

  it("an uncomposed runtime fails closed exit 1", async () => {
    const code = await main(["budget"], {})
    expect(code).toBe(1)
    expect(writes.join("")).toContain("atlas runtime is not composed yet")
  })
})

describe("WP-3-RETR — atlas territories renders the RETR-13 per-territory off-atlas MISS-oracle", () => {
  it("renders a crossing territory as a calibration prompt against the ONE bound threshold, exit 0", async () => {
    const territories: TerritoriesLeg = () => offAtlasFrom([{ territory: "src/app", offAtlas: true }], ["src/app"])
    const code = await main(["territories"], { territories })
    expect(code).toBe(0)
    const out = writes.join("")
    expect(out).toContain("served")
    expect(out).toContain(String(OFF_ATLAS_THRESHOLD))
  })

  it("an uncomposed runtime fails closed exit 1", async () => {
    const code = await main(["territories"], {})
    expect(code).toBe(1)
    expect(writes.join("")).toContain("atlas runtime is not composed yet")
  })
})

describe("WP-3-RETR — both commands classify READ off atlas-query, like anchors/relations", () => {
  it.each(["budget", "territories"] as const)("%s", (cmd) => {
    expect(COMMANDS).toContain(cmd)
    expect(COMMAND_LEG[cmd]).toBe("atlas-query")
    expect(authorityOf(cmd)).toBe("read")
  })
})
