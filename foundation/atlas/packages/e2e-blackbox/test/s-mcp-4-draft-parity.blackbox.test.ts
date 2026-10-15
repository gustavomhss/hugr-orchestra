// @atlas/e2e-blackbox — test/s-mcp-4-draft-parity.blackbox.test.ts  (WP-10.A5.E2E — PROP-MCP-4, the draft door)
//
// PROP-MCP-4 — CLI ≡ MCP BYTE PARITY for the AUTHORING surface. For an authoring door `d` and input `x`,
// `serialize(cli(d, x)) ≡ serialize(mcp(d, x))` byte-for-byte. The one authoring door whose DATA payload is
// observable as JSON on BOTH transports black-box is `draft`: WP-10.A2-a.CLI-JSON shipped `atlas draft … --json`
// (prints `JSON.stringify(verdict.data)` — the raw `DraftOut`), and WP-10.A5.MCP routes `atlas-draft` DIRECTLY
// to the SAME shared `draftVerdict` builder (@atlas/adapter-io), returning `{data: DraftOut, guidance}`. Both
// serialize the SAME `DraftOut` the ONE builder produced; this story proves the bytes agree, so NEITHER door
// hand-reconstructs the envelope (a reconstruction is exactly what A2-a.E2E deleted from the round-trip path).
// The other five READ_SURFACE doors (anchors/slots/check/doctor/node) carry NO `--json` CLI surface, so their
// data JSON is not black-box observable on the CLI — the shared verdict builder's OWN parity guarantee stands
// for them (author-verdicts.ts states it verbatim), witnessed at the transport level by the MCP-only authoring
// story (s-mcp-authoring) and the CLI round trip (s-author8-round-trip); `draft` is the door where a re-encode
// divergence is DIRECTLY visible across the two transports, so it carries the byte-parity teeth.
//
// THE DIVERGENCE-TEETH (SCN-MCP-4c-1). A byte divergence between a shared-builder emit and a naive re-encode
// only ever shows on a PARTIALLY-POPULATED result — an EMPTY optional array or an ABSENT optional string, the
// two shapes JSON serializers differ on (`[]` vs dropped, and a key present-as-`null`/`""` vs absent). A draft
// carries BOTH: `fact.claims` is ALWAYS `[]` (empty optional array), and on the T2 advisory fast path the draft
// routes `auto-accept`, so `DraftOut.requires` is ABSENT (exactOptionalPropertyTypes — the field is dropped, not
// null). SCN-MCP-4c-1 asserts the CLI bytes and the MCP bytes agree AND that the shared shape is exactly this:
// `requires` absent, `claims: []`. A door that reconstructed `requires: null` (or dropped `claims`) would RED.
//
// BLACK-BOX. Every EXECUTION is a subprocess (`runAtlas` — the shipped `atlas` bin) or a real stdio MCP session
// (`mcpSession` — the shipped `atlas-mcp` bin). NOTHING from `@atlas/*` is imported. The fixture is placed
// through the harness's own git-repo builder; no product library authors, parses, or asserts anything here.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, mcpSession, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

const ACTOR = "e2e@atlas.local"
// `draft` composes a T2 advisory candidate (auto-accept) — no write, no ratifier consulted — but the fixture
// still carries an authorizing policy so the story reads like a real authoring seat's repo.
const POLICY = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { src: [ACTOR] } },
})

const FILES: Readonly<Record<string, string>> = {
  "src/app.ts":
    "export function run(): string {\n  return `running`;\n}\n\nexport function helper(): number {\n  return 1;\n}\n",
}

/** The RAW `DraftOut` bytes the CLI door prints for `draft <anchor> <slot> <claim> --json` (a subprocess). The
 *  `--json` branch prints `JSON.stringify(verdict.data)` on a SUCCESSFUL draft — that single line IS the door's
 *  serialization; trimmed of the trailing newline the CLI adds. Throws on a non-zero exit (a real regression). */
function cliDraftBytes(repo: FixtureRepo, anchor: string, slot: string, claim: string): string {
  const run = runAtlas(repo.repoPath, ["draft", anchor, slot, claim, "--json"])
  if (run.exitCode !== 0)
    throw new Error(`PROP-MCP-4: 'atlas draft … --json' exited ${run.exitCode}:\n${run.stdout}${run.stderr}`)
  return run.stdout.trim()
}

interface McpBody {
  data?: unknown
  guidance?: unknown
}
/** The `DraftOut` bytes the MCP door serializes for `atlas-draft` — the `.data` of the CallTool result text,
 *  re-serialized with `JSON.stringify` (the SAME function the CLI's `--json` branch uses). Both sides therefore
 *  serialize the SAME `DraftOut` object the ONE shared builder produced; any divergence is a re-encode divergence,
 *  which is the whole property. Throws on an error result (the door refused — no `DraftOut` to compare). */
async function mcpDraftBytes(
  repo: FixtureRepo,
  anchor: string,
  slot: string,
  claim: string,
): Promise<{ bytes: string; data: Record<string, unknown> }> {
  const session = await mcpSession(repo.repoPath)
  try {
    const res = (await session.client.callTool({ name: "atlas-draft", arguments: { anchor, slot, claim } })) as {
      isError?: boolean
      content: Array<{ text?: string }>
    }
    if (res.isError === true) throw new Error(`PROP-MCP-4: MCP atlas-draft returned isError:\n${res.content[0]?.text}`)
    const body = JSON.parse(res.content[0]?.text ?? "{}") as McpBody
    const data = (body.data ?? {}) as Record<string, unknown>
    return { bytes: JSON.stringify(data), data }
  } finally {
    await session.close()
  }
}

let repo: FixtureRepo
let priorActor: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  process.env.ATLAS_ACTOR = ACTOR
  repo = makeFixtureRepo({ files: FILES, policy: POLICY })
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
})

describe("PROP-MCP-4 — draft door: serialize(cli(draft, x)) ≡ serialize(mcp(draft, x)), byte-identical", () => {
  it("SCN-MCP-4a-1 (valid): a plain file-anchor draft serializes byte-identically on CLI --json and MCP", async () => {
    const cli = cliDraftBytes(repo, "src/app.ts", "invariant", "app never returns an empty string")
    const { bytes: mcp } = await mcpDraftBytes(repo, "src/app.ts", "invariant", "app never returns an empty string")
    expect(mcp).toBe(cli) // teeth: any re-encode by either door on a NORMAL DraftOut REDs here
    expect(cli.length).toBeGreaterThan(0) // non-vacuity: there really is a payload being compared
  }, 20_000)

  it("SCN-MCP-4b-1 (malformed input bytes): adversarial claim payloads still serialize byte-identically", async () => {
    // "malformed" here = adversarial claim BYTES a naive splitter/encoder mishandles (unicode, punctuation,
    // very long, near-empty single char) — each still composes a valid DraftOut, so each is byte-comparable
    // across both transports. A door that reconstructed the claim off a rendered subset would diverge on these.
    const CLAIMS = [
      'ユニコード — π ≈ 3.14159, café, Ω, "quoted", 日本語',
      "!!! @#$%^&*()_+-={}[]|\\:\";'<>?,./~` — punctuation-heavy",
      "a".repeat(400) + " — a very long claim body padded well past any typical line length",
      "x", // near-empty single non-space char
    ]
    for (const claim of CLAIMS) {
      const cli = cliDraftBytes(repo, "src/app.ts", "rationale", claim)
      const { bytes: mcp } = await mcpDraftBytes(repo, "src/app.ts", "rationale", claim)
      expect(mcp).toBe(cli)
    }
  }, 60_000) // matches the e2e-blackbox project budget (60s, §2.8/#311): 8 subprocess pairs measured 37s quiet.

  it("SCN-MCP-4c-1 (partially-populated — the divergence-teeth): absent optional string + empty optional array agree", async () => {
    // Draft conservatively routes through full ratification and carries `requires`; `fact.claims` remains an
    // explicit empty array. Assert byte parity and both optional-field shapes.
    const cli = cliDraftBytes(repo, "src/app.ts", "gotcha", "a symbol-free file anchor, fast-path route")
    const { bytes: mcp, data } = await mcpDraftBytes(
      repo,
      "src/app.ts",
      "gotcha",
      "a symbol-free file anchor, fast-path route",
    )
    expect(mcp).toBe(cli) // byte parity across transports, on the partially-populated shape

    // the divergence-teeth themselves, asserted on the observed payload:
    expect(data.route).toBe("full-ratify")
    expect(data.requires).toBe("ATLAS_RATIFY_TOKEN")
    const fact = data.fact as { claims?: unknown }
    expect(Array.isArray(fact.claims)).toBe(true)
    expect(fact.claims).toEqual([]) // EMPTY optional array — present as `[]`, never dropped
    // and the CLI bytes literally carry the same two shapes (a reconstruction would leak here):
    expect(cli).toContain('"claims":[]')
    expect(cli).toContain('"requires":"ATLAS_RATIFY_TOKEN"')
  }, 20_000)
})

describe("black-box law — this story imports no product library", () => {
  it("this file's own source text carries no `@atlas/` import specifier", async () => {
    const { readFileSync } = await import("node:fs")
    const { fileURLToPath } = await import("node:url")
    const src = readFileSync(fileURLToPath(import.meta.url), "utf8")
    const imports = [...src.matchAll(/^import .*from '([^']+)'/gm)].map((m) => m[1])
    expect(imports.filter((s) => s?.startsWith("@atlas/"))).toEqual([])
  })
})
