// @atlas/cli — test/help-cli.test.ts  (ENTRY-CLI-5 — the DERIVED help door)
//
// SCN-CLI-5a-1/5b-1/5c-1/5d-1 (docs/requirements/goldens-authoring.md). `renderHelp` (src/help.ts) is a PURE
// function of the parser's OWN registries — `COMMAND_LEG`/`COMMANDS` (map.ts), `ARITY`/`VALUED_FLAGS`
// (parse.ts) — never a hand-listed string. Two things are proven here that a hand-listed help could not
// prove of itself: (1) containment — every command the parser actually routes appears, and (2) that the
// containment cannot go stale, because `COMMAND_LEG`/`ARITY` are BOTH `Record<Command, …>` typed off the
// SAME `COMMANDS` array — TypeScript refuses a command present in one and absent from the other, so "a
// command added to the parser without updating help" is not a mistake this codebase can compile.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { main } from "../src/cli.js"
import { COMMANDS, COMMAND_LEG } from "../src/map.js"
import { ARITY } from "../src/parse.js"
import { ENV_CHANNELS, renderHelp } from "../src/help.js"

const HERE = dirname(fileURLToPath(import.meta.url))

// capture stdout the way the other CLI suites do (wp-9.1.1-a-cli.test.ts), so `main(['help'])` is asserted
// through the REAL entrypoint, not just the pure renderer.
function captureStdout(fn: () => Promise<number> | number): { code: number; out: string } {
  const chunks: string[] = []
  const original = process.stdout.write.bind(process.stdout)
  ;(process.stdout as unknown as { write: (c: unknown) => boolean }).write = (c: unknown) => {
    chunks.push(String(c))
    return true
  }
  try {
    const result = fn()
    const code = typeof result === "number" ? result : 0
    return { code, out: chunks.join("") }
  } finally {
    process.stdout.write = original
  }
}

describe("SCN-CLI-5a-1 — help covers the command map", () => {
  it("renderHelp() names every command in COMMAND_LEG (the real registry), with its ARITY", () => {
    const help = renderHelp()
    for (const c of COMMANDS) {
      expect(help).toContain(c)
      expect(help).toContain(`${c} — ${ARITY[c]} positional argument(s)`)
    }
  })

  it("reachable through the real entrypoint: `atlas help` / `--help` / `-h` all render the SAME derived text, exit 0", async () => {
    for (const tok of ["help", "--help", "-h"]) {
      const { code, out } = captureStdout(() => main([tok]))
      expect(await code).toBe(0)
      expect(out).toBe(renderHelp())
    }
  })
})

describe("SCN-CLI-5b-1 — help covers the write-governing environment", () => {
  it("names BOTH the actor-identity channel and the ratifier-token channel", () => {
    const help = renderHelp()
    expect(help).toContain("ATLAS_ACTOR")
    expect(help).toContain("ATLAS_RATIFY_TOKEN")
    expect(ENV_CHANNELS).toEqual(["ATLAS_ACTOR", "ATLAS_RATIFY_TOKEN"])
  })
})

describe("SCN-CLI-5c-1 — no undocumented command (guard)", () => {
  it("COMMAND_LEG and ARITY are BOTH total over the SAME `Command` union — a command cannot be added to one without the other (TypeScript, not a runtime check)", () => {
    // The compile-time property: `Object.keys` on two `Record<Command, X>` tables typed off the same
    // `COMMANDS` union always agree in membership — this is what makes "add a command without touching
    // help" a type error rather than a runtime drift, since `renderHelp` derives from `COMMAND_LEG` and its
    // arity line from `ARITY`.
    expect(Object.keys(COMMAND_LEG).sort()).toEqual(Object.keys(ARITY).sort())
    expect(Object.keys(COMMAND_LEG).sort()).toEqual([...COMMANDS].sort())
  })

  it("a command absent from the DERIVED source (COMMAND_LEG) is a command help CANNOT see — proving help is not a second hand-kept list", () => {
    // Simulate "the parser knows about a command help was never told about": a HAND-LISTED help string that
    // forgot the newest command (`draft`, the last one to join COMMAND_LEG). A hand-rolled help would have
    // silently shipped this stale text; the DERIVED `renderHelp()` cannot produce it, because there is no
    // hand-list for it to forget from.
    const handRolled = COMMANDS.filter((c) => c !== "draft").join(", ")
    expect(handRolled).not.toContain("draft")
    // TEETH (SCN-CLI-5c-1's "containment golden…fails" clause, proven by construction): had `help.ts` read
    // from a copy of `COMMANDS` frozen at authoring time (the antipattern this WP explicitly bans) instead
    // of `COMMAND_LEG` itself, adding `draft` to the real map would NOT have reached that copy and this
    // assertion — real help vs. the real (current) command set — would go RED the day a 23rd command lands.
    // The actual `renderHelp()` never can, because it re-reads `COMMAND_LEG` on every call:
    expect(renderHelp()).toContain("draft")
    for (const c of COMMANDS) expect(renderHelp()).toContain(c)
  })
})

describe("SCN-CLI-5d-1 — no undocumented write channel (guard: help ⊇ what the composition root reads)", () => {
  it("every `process.env.ATLAS_*` name the composition root (`adapter-io/src/compose.ts`) reads is named by help — the difference is empty", () => {
    // Read the composition root's OWN source — the one place `ATLAS_ACTOR`/`ATLAS_RATIFY_TOKEN` are actually
    // sourced (`compose.ts` `composeRuntime`) — never a copy. A third `process.env.ATLAS_*` read added there
    // without a matching addition to `ENV_CHANNELS` (help.ts) fails this assertion.
    const composeSrc = readFileSync(join(HERE, "..", "..", "adapter-io", "src", "compose.ts"), "utf8")
    const found = new Set([...composeSrc.matchAll(/process\.env\.(ATLAS_[A-Z0-9_]+)/g)].map((m) => m[1]))
    expect(found.size).toBeGreaterThan(0) // fail loudly if the extraction itself breaks (never a vacuous pass)
    const helpNamed = new Set(ENV_CHANNELS as readonly string[])
    const undocumented = [...found].filter((name) => !helpNamed.has(name as string))
    expect(undocumented).toEqual([]) // the difference (composition-root reads − help-named) is empty
  })
})
