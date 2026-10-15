// @atlas/cli — test/mine-cas-unaddressable-refusal.test.ts  (#140)
//
// #140: `atlas mine` and the `emit` door render the SAME CAS-unaddressable condition differently. The emit
// door catches `UnaddressableCasObjectError` at gate 0.5 and re-files it as a recorded, exit-2 refusal
// (`governed-emit-address.ts` `commitRefusalOf`). The `mine` path did NOT: the throw originates deep in the
// candidate-sidecar commit (`sidecar-commit.ts` — `ctx.put(obj) === CAS_EMPTY` → throw), travels up through
// `upsert` at genesis GEN-8a (OUTSIDE the per-site GEN-8c fault boundary, which only wraps `visit`), out of
// `runMine`, and reached `main`'s mine-catch UNRECOGNIZED — the catch only re-filed
// `ModelConfigError`/`PromptError`/`ModelCommandError` and re-threw everything else. Left uncaught, the
// operator got a raw stack trace: fail-closed-SILENT, contradicting ADR-0003 ("a refusal is
// fail-closed-VISIBLE on both transports").
//
// The fix adds `UnaddressableCasObjectError` as the FOURTH name in that allow-list, so it renders as the
// door's own refusal does: exit 2, `status: rejected`, and the error's `unaddressable-cas-object` discriminant
// verbatim on the `reason:` line.
//
// WHAT THIS PINS: the RENDERING at `main`'s mine-catch. `runMine` is mocked to throw, because the code under
// test is the classification in the catch. That the THROW is real and reachable is pinned separately and is
// NOT re-proven here: `@atlas/adapter-io` `store-fail-closed-door.test.ts` §C drives the WHOLE product door
// with a `BigInt`-bearing `grounding` and asserts the real `UnaddressableCasObjectError` is thrown
// (KERNEL-8 excludes `grounding` from the canonical preimage, so it clears `id(node)` and reaches the CAS put);
// #136 established the mine path reaches the same seam. Here we import the REAL error class so `.name` and its
// discriminant-leading `.message` are exactly what production throws — not a hand-rolled stand-in.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { UnaddressableCasObjectError } from "@atlas/adapter-io"

// Mock ONLY `runMineArms` — `cli.ts` imports nothing else from this module — so `main(['mine', '.'])` exercises
// the real catch/render path over a thrown error, with no need for a repo, a model, or a durable store.
// [SOUND-DEFAULT-MINE] `cli.ts` now drives the multi-arm `runMineArms` (was `runMine`); the mine-catch this
// pins is BYTE-IDENTICAL — only the mocked symbol name follows the call site the frozen seam moved.
vi.mock("../src/mine.js", () => ({ runMineArms: vi.fn() }))
import { runMineArms } from "../src/mine.js"
import { main } from "../src/cli.js"

const runMineMock = vi.mocked(runMineArms)

/** The discriminant — everything before the first `:` (the `reasonOf` rule, ADR-0007). */
const reasonOf = (s: string): string => s.split(":")[0]!

/** A named `status: …`/`reason: …` line the CLI renders, without its label — or `''` when absent. */
function line(stdout: string, label: string): string {
  const l = stdout.split("\n").find((x) => x.startsWith(`${label}: `))
  return l === undefined ? "" : l.slice(`${label}: `.length)
}

let writes: string[]
beforeEach(() => {
  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  })
})
afterEach(() => vi.restoreAllMocks())

const out = (): string => writes.join("")

describe("#140 — `atlas mine` renders a CAS-unaddressable throw as the door does, not as a silent crash", () => {
  it("a thrown UnaddressableCasObjectError becomes an exit-2 governed refusal on the reason line", async () => {
    // The REAL error, constructed with a real SidecarBase-shaped tag (the message is a pure function of it).
    const err = new UnaddressableCasObjectError("candidate" as never)
    runMineMock.mockRejectedValueOnce(err)

    const code = await main(["mine", "."])

    // Exit 2 — a governed refusal, not a usage/wiring error (exit 1) and not success (exit 0).
    expect(code).toBe(2)
    expect(line(out(), "status")).toBe("rejected")
    // The discriminant leads the reason verbatim — the SAME name a reader sees from the emit door's refusal.
    expect(reasonOf(line(out(), "reason"))).toBe("unaddressable-cas-object")
    // And the message travels UNCHANGED (not relabelled with the CLI's own guidance).
    expect(line(out(), "reason")).toBe(err.message)
  })

  it("the allow-list is not a catch-all: a foreign error still propagates (never rendered as a refusal)", async () => {
    // Negative control — if the catch swallowed everything, an internal defect would masquerade as a
    // governance refusal (the #129 blame-shift). Anything whose name is not on the allow-list re-throws.
    const foreign = new TypeError("Cannot read properties of undefined (reading 'contentHash')")
    runMineMock.mockRejectedValueOnce(foreign)

    await expect(main(["mine", "."])).rejects.toBe(foreign)
    // Nothing was rendered as a refusal on the way out.
    expect(out()).not.toContain("status: rejected")
  })

  it("positive control: a normal mine verdict is rendered unchanged (the catch is not on the success path)", async () => {
    runMineMock.mockResolvedValueOnce({ exitCode: 0, stdout: "status: ok\n" })
    const code = await main(["mine", "."])
    expect(code).toBe(0)
    expect(line(out(), "status")).toBe("ok")
  })
})
