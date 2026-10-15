// @atlas/cli — test/enrich-env-gating.test.ts  (ENRICH arm — the ATLAS_ENRICH gating decision, tested not inspected)
//
// The opt-in ENRICH arm (A4-LEVER.md) is off by default and must stay a MEASURED flip, never a silent
// behaviour change. `enrichEnabled` is the sole gate; this pins its truth table — in particular that every
// explicit falsey spelling (`ATLAS_ENRICH=false`/`off`/`no`/`0`) stays OFF, so an operator who writes
// `ATLAS_ENRICH=false` does not accidentally turn the arm ON.

import { describe, expect, it } from "vitest"

import { enrichEnabled, ENRICH_ENV } from "../src/mine-proposer.js"

const withEnv = (v: string | undefined): NodeJS.ProcessEnv => (v === undefined ? {} : { [ENRICH_ENV]: v })

describe("ENRICH — enrichEnabled gates the arm, default OFF", () => {
  it("is OFF when the var is unset", () => {
    expect(enrichEnabled({})).toBe(false)
  })

  it.each(["", "0", "false", "FALSE", "off", "Off", "no", " false "])(
    "is OFF for the falsey spelling %j (no silent enable)",
    (v) => {
      expect(enrichEnabled(withEnv(v))).toBe(false)
    },
  )

  it.each(["1", "true", "on", "yes", "symbol"])("is ON for the truthy value %j", (v) => {
    expect(enrichEnabled(withEnv(v))).toBe(true)
  })
})
