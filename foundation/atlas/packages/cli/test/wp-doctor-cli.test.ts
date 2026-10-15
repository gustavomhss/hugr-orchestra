// @atlas/cli — test/wp-doctor-cli.test.ts  (WP-DOCTOR — `atlas doctor <sub>` sub-dispatch)
//
// RED→GREEN goldens for the read/advisory `DoctorApi` legs wired behind `atlas doctor`, driven over an
// INJECTED FAKE `DoctorSource` (the real source is the composition-root WP), plus the `index` leg, which is
// dispatched over its OWN injected provider and reads no store at all. The suite proves:
//   • each subcommand (archive/why/hotset/reground/index) routes to the CORRECT leg and renders deterministically;
//   • doctor is READ-ONLY — exit 0, opens NO write door (the wired handler is a spy, NEVER called), and
//     `reground` renders a PROPOSAL only (persists nothing → the follow-up is atlas-emit);
//   • TOTALITY — an unknown subcommand / a missing arg / a not-yet-wired source fails CLOSED to a
//     structured error + guidance + non-zero exit, never a throw.
// TEETH are embedded: a mis-routed leg (why→archive) and a doctor that opens a write door each flip a
// NAMED golden RED (verified out-of-band by apply→RED→revert on the source).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { asHash, asSubtreeHash, asNodeKey } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import { DOCTOR_GUIDANCE, WRITE_PATHS, createDoctor } from "@atlas/tools"
import type { DoctorSource, DriftItem, Verdict } from "@atlas/tools"
import type { GroundedFact } from "@atlas/knowledge"
import type { IndexPlanReport, WiredHandler } from "@atlas/adapter-io"
import { main } from "../src/cli.js"
import { runDoctor, DOCTOR_SUBCOMMANDS } from "../src/doctor.js"
import { authorityOf, COMMAND_LEG } from "../src/map.js"

// ── the FAKE read-only DoctorSource (distinct, deterministic per leg) ──────────────────────────────────
const H1 = asHash("lineage-aaa")
const H2 = asHash("lineage-bbb")
const struct = (id: string): StructRef => ({
  kind: "symbol",
  qualifiedPath: `pkg/${id}.ts::${id}`,
  subtreeHash: asSubtreeHash(id),
})
const DRIFT: DriftItem = { fact: "claimF", class: "semantic", anchorWas: struct("was"), anchorNow: struct("now") }
// the templated re-ground candidate the plan funnels through atlas-emit — its shape is irrelevant to render.
const FAKE_EMIT = {
  id: asNodeKey("nk-claimF"),
  kind: "advisory",
  tier: "T2",
  claimNorm: "F",
} as unknown as GroundedFact

const fakeSource = (): DoctorSource => ({
  lineage: (scope?: string) => (scope === "empty" ? [] : [H1, H2]),
  drift: (fact: string) => (fact === "clean" ? undefined : DRIFT),
  hotSetSize: () => 7,
  casAudit: () => ({ objects: 0, corrupt: [], unreadable: [], missing: [], orphan: 0, referenced: 0, sound: true }),
  plan: (fact: string) => (fact === "nofix" ? undefined : { action: "reground", emit: FAKE_EMIT }),
})

/** A wired handler SPY — the governed write path (atlas-emit funnels through it). Doctor must NEVER call it. */
function spyHandler(): { handler: WiredHandler; handle: ReturnType<typeof vi.fn> } {
  const handle = vi.fn((): Verdict => ({ ok: true, data: {}, guidance: { next: "x", invariant: "y" } }))
  const handler = {
    handle,
    resolveNode: () => ({ ok: false, guidance: { next: "n/a", invariant: "n/a" } }),
    schema: () => ({ name: "x", description: "", inputSchema: {} }),
  } as unknown as WiredHandler
  return { handler, handle }
}

// capture stdout so we can assert the render bytes reach the console.
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

// ── SCN-DOCTOR-1 — each subcommand routes to the correct leg + renders deterministically ───────────────
describe("SCN-DOCTOR-1 — every leg routes + renders", () => {
  it("1a: `doctor archive` → archive(scope?) renders the monotone lineage (exit 0)", async () => {
    const code = await main(["doctor", "archive"], { doctorSource: fakeSource() })
    expect(code).toBe(0)
    expect(out()).toBe(
      `status: ok\ndoctor: archive\narchive: [lineage-aaa, lineage-bbb]\n` +
        `next: ${DOCTOR_GUIDANCE.next}\ninvariant: ${DOCTOR_GUIDANCE.invariant}\n`,
    )
  })

  it("1a2: `doctor archive <scope>` forwards the scope to lineage (empty scope ⇒ empty archive)", async () => {
    const code = await main(["doctor", "archive", "empty"], { doctorSource: fakeSource() })
    expect(code).toBe(0)
    expect(out()).toContain("archive: []")
  })

  it("1b: `doctor why <fact>` → whyBroken(fact) renders the drift-explain (exit 0)", async () => {
    const code = await main(["doctor", "why", "claimF"], { doctorSource: fakeSource() })
    expect(code).toBe(0)
    expect(out()).toBe(
      `status: ok\ndoctor: why\nwhyBroken: fact=claimF class=semantic anchorWas=was anchorNow=now\n` +
        `next: ${DOCTOR_GUIDANCE.next}\ninvariant: ${DOCTOR_GUIDANCE.invariant}\n`,
    )
  })

  it("1c: `doctor hotset <budget>` → hotSet(Number(budget)) flags over-budget advisory (exit 0)", async () => {
    const over = await main(["doctor", "hotset", "3"], { doctorSource: fakeSource() })
    expect(over).toBe(0)
    expect(out()).toContain("hotSet: size=7 budget=3 over=true") // 7 > 3
    writes = []
    await main(["doctor", "hotset", "9"], { doctorSource: fakeSource() })
    expect(out()).toContain("hotSet: size=7 budget=9 over=false") // 7 <= 9 — the budget is really compared
  })

  it("1d: `doctor reground <fact>` → reground(fact) renders the PROPOSAL + points at atlas-emit (exit 0)", async () => {
    const code = await main(["doctor", "reground", "claimF"], { doctorSource: fakeSource() })
    expect(code).toBe(0)
    const s = out()
    expect(s).toContain("doctor: reground")
    expect(s).toContain("plan: action=reground fact=claimF")
    expect(s).toContain("atlas-emit") // the governed atlas-emit write door is the advisory follow-up
    expect(s).toContain(`invariant: ${DOCTOR_GUIDANCE.invariant}`)
  })

  it("TEETH (routing): the leg name is keyed by the SUBCOMMAND — why≠archive render (a why→archive swap bites)", () => {
    const why = runDoctor(["why", "claimF"], fakeSource())
    const archive = runDoctor(["archive"], fakeSource())
    expect(why.stdout).toContain("doctor: why")
    expect(why.stdout).toContain("whyBroken: fact=claimF")
    expect(archive.stdout).toContain("doctor: archive")
    // a mutant routing why→archive would render `whyBroken: none` (archive returns no drift field) ⇒ ≠ golden.
    expect(why.stdout).not.toEqual(archive.stdout)
    expect(why.stdout).not.toContain("whyBroken: none")
  })
})

// ── SCN-DOCTOR-2 — READ-ONLY: no write door, persists nothing ──────────────────────────────────────────
describe("SCN-DOCTOR-2 — doctor carries NO write authority", () => {
  it("2a: doctor is a READ leg in the authority partition; its leg is not a WRITE_PATHS door", () => {
    expect(authorityOf("doctor")).toBe("read")
    expect((WRITE_PATHS as readonly string[]).includes(COMMAND_LEG.doctor)).toBe(false)
  })

  it("2b: createDoctor(source) exposes the read legs it always did — and no write method", () => {
    const keys = Object.keys(createDoctor(fakeSource())).sort()
    // FIVE read legs since ADR-0022 added `casIntegrity` — still no write method, which is the assertion.
    expect(keys).toEqual(["archive", "casIntegrity", "hotSet", "reground", "whyBroken"])
    // The CLI surface is WIDER than the `DoctorApi` by exactly one leg: `index` reads the file tree + the
    // SCIP dump, never the store, so it is dispatched in the CLI and adds NO method to the frozen port
    // above. `cas` is NOT that kind of leg — it is a `DoctorApi` member, so the port grew with it.
    expect([...DOCTOR_SUBCOMMANDS]).toEqual(["archive", "why", "hotset", "reground", "cas", "index"])
  })

  it("TEETH (write-door): NO doctor subcommand ever touches the wired handler (the write door)", async () => {
    const { handler, handle } = spyHandler()
    for (const argv of [
      ["doctor", "archive"],
      ["doctor", "why", "claimF"],
      ["doctor", "hotset", "3"],
      ["doctor", "reground", "claimF"],
    ]) {
      writes = []
      const code = await main(argv, { handler, doctorSource: fakeSource() })
      expect(code).toBe(0) // read-only ⇒ exit 0
    }
    // a mutant that persists (e.g. reground auto-emits) would funnel atlas-emit through this handler ⇒ called.
    expect(handle).not.toHaveBeenCalled()
  })

  it("TEETH (persists-nothing): `reground` renders a proposal, exit 0, and opens NO write door", async () => {
    const { handler, handle } = spyHandler()
    const code = await main(["doctor", "reground", "claimF"], { handler, doctorSource: fakeSource() })
    expect(code).toBe(0)
    expect(out()).toContain("PROPOSAL only")
    expect(handle).not.toHaveBeenCalled() // nothing persisted — the store changes only via atlas-emit
  })
})

// ── SCN-DOCTOR-3 — TOTALITY: fail closed with guidance, never a throw ──────────────────────────────────
describe("SCN-DOCTOR-3 — totality", () => {
  it("3a: an unknown subcommand → structured error + guidance + non-zero exit", async () => {
    const code = await main(["doctor", "bogus"], { doctorSource: fakeSource() })
    expect(code).not.toBe(0)
    const s = out()
    expect(s).toContain("status: error")
    expect(s).toContain("unknown doctor subcommand 'bogus'")
    expect(s).toContain("next:")
    expect(s).toContain("invariant:")
  })

  it("3b: no DoctorSource injected → fail CLOSED with guidance (real source = composition-root WP)", async () => {
    const code = await main(["doctor", "archive"], { handler: spyHandler().handler }) // handler present, source absent
    expect(code).not.toBe(0)
    expect(out()).toContain("composition-root WP")
    expect(out()).toContain("invariant:")
  })

  it("3c: a subcommand missing its required arg → structured error (why/hotset/reground)", async () => {
    for (const [argv, needle] of [
      [["doctor", "why"], "requires a <fact>"],
      [["doctor", "hotset"], "requires a numeric <budget>"],
      [["doctor", "hotset", "notanumber"], "requires a numeric <budget>"],
      [["doctor", "reground"], "requires a <fact>"],
    ] as const) {
      writes = []
      const code = await main([...argv], { doctorSource: fakeSource() })
      expect(code).not.toBe(0)
      expect(out()).toContain(needle)
    }
  })

  it("3d: bare `atlas doctor` (no subcommand) → non-zero, never a throw (parser arity totality)", async () => {
    const code = await main(["doctor"], { doctorSource: fakeSource() })
    expect(code).not.toBe(0)
    expect(out().length).toBeGreaterThan(0)
  })

  it("3e: the `index` leg fails CLOSED when its provider THROWS — a diagnosis never crashes the bin", () => {
    const v = runDoctor(["index"], undefined, () => {
      throw new Error("walk exploded")
    })
    expect(v.exitCode).not.toBe(0)
    expect(v.stdout).toContain("status: error")
    expect(v.stdout).toContain("walk exploded") // the reason survives verbatim to the user door
  })
})

// ── SCN-DOCTOR-4 — the `index` leg: plans the SCIP index, runs NOTHING ─────────────────────────────────
// `axes.edges` comes from SCIP alone, so a repo with no `.atlas/index.scip` visits 0 mine sites. Before this
// leg, `doctor` — the surface a user reaches for when a command returned nothing — could not say so, and
// `planIndexers` (the whole per-language dispatch) had ZERO production callers.
describe("SCN-DOCTOR-4 — doctor index", () => {
  /** A report with one configured language and one honest hole — the shape `reportIndexPlan` returns. */
  const REPORT: IndexPlanReport = {
    scipRel: ".atlas/index.scip",
    scip: { kind: "absent" },
    configured: [
      {
        plan: {
          lang: "ts",
          tool: "scip-typescript",
          version: "9.9.9",
          args: ["index", "--output", ".atlas/index.scip"],
        },
        files: 3,
      },
    ],
    holes: [{ plan: { lang: "rb", tool: "honest-hole", args: [] }, files: 1 }],
  }

  it("4a: renders the dump state, the PINNED command, and NAMES the honest hole (exit 0, read-only)", async () => {
    const { handler, handle } = spyHandler()
    const code = await main(["doctor", "index"], { handler, doctorSource: fakeSource(), indexPlan: () => REPORT })
    expect(code).toBe(0)
    const s = out()
    expect(s).toContain("doctor: index")
    expect(s).toContain("scip: ABSENT at .atlas/index.scip") // why the frontier is empty
    expect(s).toContain("run:    scip-typescript index --output .atlas/index.scip") // copy-pasteable
    expect(s).toContain("scip-typescript --version") // how to check what is INSTALLED
    expect(s).toContain("pinned 9.9.9") //             REQ-INDEX-3a: version-pinned per language
    // TEETH: the hole is NAMED. "Atlas has no indexer for rb" must not render as "Atlas found nothing".
    expect(s).toContain("lang: rb")
    expect(s).toContain("honest-hole")
    // and it is a DIAGNOSIS, not an execution: no write door is touched, and nothing is spawned.
    expect(handle).not.toHaveBeenCalled()
  })

  it("4b: with NO provider injected it fails CLOSED with guidance (never a throw, never a default report)", () => {
    const v = runDoctor(["index"])
    expect(v.exitCode).not.toBe(0)
    expect(v.stdout).toContain("status: error")
    expect(v.stdout).toContain("atlas doctor index has no repository source")
  })

  it("4c: `index` needs NO DoctorSource — the leg that explains an empty repo must work on an empty repo", async () => {
    const code = await main(["doctor", "index"], { indexPlan: () => REPORT }) // no doctorSource at all
    expect(code).toBe(0)
    expect(out()).toContain("doctor: index")
    expect(out()).not.toContain("composition-root WP") // NOT the unwired-source refusal
  })
})
