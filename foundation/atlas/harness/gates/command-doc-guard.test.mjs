// harness/gates/command-doc-guard.test.mjs — the gate's OWN teeth.
//
// Every defect class the gate claims to catch is PLANTED in a throwaway fixture tree, and the gate must
// exit non-zero AND NAME the thing that is wrong — the name is the whole product of a gate like this, since
// "some page is missing" sends nobody anywhere. The clean tree must PASS, so the gate cannot be satisfied
// by firing on everything.
//
// The ANTI-VACUITY case is the one that matters most and is easiest to forget: if the extraction ever comes
// back empty, "zero commands, zero missing pages" reads as success while the entire surface is unchecked.
// That case is planted here explicitly (a fixture whose `COMMANDS` is `[]`), alongside the three other ways
// the read can break, because a gate whose oracle silently evaporates is worse than no gate at all.
//
// The fixture is a miniature Atlas: `packages/cli/src/map.ts` carrying a `COMMANDS` array, and a
// `docs/reference/commands/` tree. Never the real docs tree.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const GATE = fileURLToPath(new URL("./command-doc-guard.mjs", import.meta.url))

let root

/** Run the gate against the fixture. Returns `{ code, out }` — never throws on a non-zero exit. */
function runGate() {
  try {
    const out = execFileSync(process.execPath, [GATE], {
      env: { ...process.env, COMMAND_DOC_GUARD_ROOT: root },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }
  }
}

/** Write the command oracle. `body` is the full initializer text, so malformed shapes can be planted. */
function map(body) {
  const p = join(root, "packages", "cli", "src", "map.ts")
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(
    p,
    `import type { Tool } from '@atlas/tools';\n\nexport const COMMANDS = ${body};\nexport type Command = (typeof COMMANDS)[number];\n`,
  )

  // Keep the README in step by DEFAULT, so a test that moves the surface exercises the leg it is aiming at
  // and not this one too. The literal-string shapes planted by the anti-vacuity tests have no names to
  // mirror; those cases fail on extraction long before the README is read.
  const literal = [...body.matchAll(/'([a-z][a-z0-9-]*)'/g)].map((m) => m[1])
  if (literal.length > 0) {
    // The parity leg needs its SECOND oracle and a README region to compare against. By default the
    // fixture advertises the FIRST command and leaves the rest CLI-only, so every legacy test keeps
    // exercising exactly the leg it aims at. A test aimed at the parity leg calls `handler`/`readme`
    // directly to desync them.
    handler([literal[0]], [])
    mcp([])
    readme(literal, { advertised: [literal[0]] })
  }
}

/**
 * Write the advertised-surface oracle: `GOVERNANCE_SURFACE` and `READ_SURFACE` in handler.ts. Members are
 * given as COMMAND names and prefixed here, mirroring the real correspondence the gate relies on.
 */
/**
 * Write the THIRD oracle: the MCP server's own `*_TOOL` declarations. Members are COMMAND names, prefixed
 * here. `parallel` names tools declared by the server that are in NEITHER surface constant — the shape that
 * made the real README call two reachable doors unreachable.
 */
function mcp(parallel) {
  const p = join(root, "packages", "mcp-server", "src", "tools.ts")
  mkdirSync(dirname(p), { recursive: true })
  parallelNames = [...parallel]
  writeFileSync(
    p,
    [...advertisedNames, ...parallel].map((n, i) => `export const T${i}_TOOL = 'atlas-${n}';`).join("\n") + "\n",
  )
}

function handler(governance, read) {
  // Remembered so `readme()` called DIRECTLY (a test desyncing the table leg) still emits a parity region
  // that AGREES with the handler on disk. Otherwise every table-leg test would trip the parity leg too and
  // stop testing the thing it aims at — the one-leg-at-a-time discipline `map()` already keeps.
  advertisedNames = [...governance, ...read]
  advertisedSplit = { governance: governance.length, read: read.length }
  const p = join(root, "packages", "tools", "src", "handler.ts")
  mkdirSync(dirname(p), { recursive: true })
  const arr = (ns) => `[${ns.map((n) => `'atlas-${n}'`).join(", ")}]`
  writeFileSync(
    p,
    `export const GOVERNANCE_SURFACE: readonly Tool[] = ${arr(governance)};
` +
      `export const READ_SURFACE: readonly ReadDoor[] = ${arr(read)};
`,
  )
}

/**
 * Write the README with a command table naming exactly `names`, wrapped in the markers the gate reads.
 *
 * `map()` calls this itself, so a test that changes the shipped surface gets a README that FOLLOWS it and
 * keeps testing one leg at a time. A test aimed at the README leg calls this directly to desync the two.
 */
let advertisedNames = []
let advertisedSplit = { governance: 0, read: 0 }
let parallelNames = []

function readme(names, { begin = true, end = true, advertised = undefined, parity = undefined } = {}) {
  const rows = names.map(
    (n) => `| \`atlas ${n} <x>\` | read | does a thing | [reference](./docs/reference/commands/${n}.md) |`,
  )
  // The parity region is DERIVED from the same two lists by default, so it agrees unless a test overrides
  // it. `parity: null` omits the region entirely (the anti-vacuity cases for this leg).
  const adv = (advertised ?? advertisedNames).filter((n) => names.includes(n))
  const all = [...new Set([...adv, ...parallelNames])]
  const cliOnly = names.filter((n) => !all.includes(n))
  const claims =
    parity === null
      ? []
      : [
          "<!-- transport-parity:begin -->",
          "",
          (parity?.commands ?? `The CLI exposes **${names.length}** commands`) +
            `; MCP advertises **${parity?.tools ?? all.length}** tools ` +
            `(${parity?.governance ?? advertisedSplit.governance} governance + ` +
            `${parity?.read ?? advertisedSplit.read} read + ` +
            `${parity?.parallel ?? parallelNames.length} parallel-path).`,
          "",
          `**The remaining ${parity?.cliOnlyCount ?? cliOnly.length} commands are CLI-only**: ` +
            (parity?.cliOnly ?? cliOnly).map((n) => `\`${n}\``).join(", ") +
            ".",
          "",
          "<!-- transport-parity:end -->",
        ]
  writeFileSync(
    join(root, "README.md"),
    [
      "# Fixture",
      "",
      "Prose that mentions `atlas init` OUTSIDE the region and must not be counted.",
      "",
      begin ? "<!-- command-table:begin -->" : "",
      "",
      "| command | kind | what it does | page |",
      "| --- | --- | --- | --- |",
      ...rows,
      "",
      end ? "<!-- command-table:end -->" : "",
      "",
      ...claims,
      "",
      "More prose naming `atlas query` after the region.",
      "",
    ].join("\n"),
  )
}

/** Write a reference page. `rel` may be nested. Content is irrelevant BY DESIGN — the gate never reads it. */
function page(rel) {
  const p = join(root, "docs", "reference", "commands", rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, "# a page\n")
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "command-doc-guard-"))
  map("['init', 'query', 'emit'] as const") // also writes a README table naming exactly those three
  page("init.md")
  page("query.md")
  page("emit.md")
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe("command-doc-guard — the gate can be falsified", () => {
  it("PASSES when every command has a page and every page has a command", () => {
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(out).toMatch(/command-doc-guard: OK — 3 shipped command\(s\)/)
    expect(out).toMatch(/3 row\(s\) in the README\.md command table/)
    expect(code).toBe(0)
  })

  it("FAILS a command the README table does NOT list, and NAMES it", () => {
    readme(["init", "query"]) // `emit` ships and has a page; the front door omits it
    const { code, out } = runGate()
    expect(out).toMatch(/MISSING FROM THE README TABLE — `atlas emit`/)
    expect(out).not.toMatch(/MISSING FROM THE README TABLE — `atlas init`/) // and only that one
    expect(code).toBe(1)
  })

  it("FAILS a README row for a command that does not ship, and NAMES it", () => {
    readme(["init", "query", "emit", "teleport"])
    const { code, out } = runGate()
    expect(out).toMatch(/README TABLE NAMES A NON-COMMAND — `atlas teleport`/)
    expect(code).toBe(1)
  })

  it("counts ONLY the delimited region — `atlas …` in the surrounding prose is not a row", () => {
    readme(["init", "query", "emit"]) // the fixture prose names `atlas init` and `atlas query` outside it
    const { code, out } = runGate()
    expect(out).toMatch(/3 row\(s\) in the README\.md command table/)
    expect(code).toBe(0)
  })

  it("ANTI-VACUITY: a MISSING begin marker FAILS instead of checking nothing", () => {
    readme(["init", "query", "emit"], { begin: false })
    const { code, out } = runGate()
    expect(out).toMatch(/EXTRACTION BROKEN/)
    expect(out).toMatch(/missing the <!-- command-table:begin --> marker/)
    expect(out).not.toMatch(/command-doc-guard: OK/)
    expect(code).toBe(1)
  })

  it("ANTI-VACUITY: a MISSING end marker FAILS", () => {
    readme(["init", "query", "emit"], { end: false })
    const { code, out } = runGate()
    expect(out).toMatch(/missing the <!-- command-table:end --> marker/)
    expect(code).toBe(1)
  })

  it("ANTI-VACUITY: an EMPTY region FAILS rather than agreeing with any surface", () => {
    readme([])
    const { code, out } = runGate()
    expect(out).toMatch(/EXTRACTION BROKEN/)
    expect(out).toMatch(/extracted ZERO rows/)
    expect(code).toBe(1)
  })

  it("ANTI-VACUITY: a MISSING README FAILS", () => {
    rmSync(join(root, "README.md"), { force: true })
    const { code, out } = runGate()
    expect(out).toMatch(/EXTRACTION BROKEN/)
    expect(out).toMatch(/README\.md does not exist/)
    expect(code).toBe(1)
  })

  it("FAILS a DUPLICATED row — a repeated command hides a missing one behind a matching set", () => {
    readme(["init", "query", "emit", "emit"])
    const { code, out } = runGate()
    expect(out).toMatch(/lists `atlas emit` TWICE/)
    expect(code).toBe(1)
  })

  it("FAILS a command with NO page, and NAMES the command", () => {
    map("['init', 'query', 'emit', 'reconcile'] as const") // `reconcile` ships; nobody wrote its page
    const { code, out } = runGate()
    expect(out).toMatch(/UNDOCUMENTED COMMAND — `atlas reconcile`/)
    expect(out).toContain("docs/reference/commands")
    expect(out).not.toMatch(/UNDOCUMENTED COMMAND — `atlas init`/) // and only that one
    expect(code).toBe(1)
  })

  it("names EVERY undocumented command, not just the first", () => {
    map("['init', 'query', 'emit', 'node', 'link'] as const")
    const { out } = runGate()
    expect(out).toMatch(/UNDOCUMENTED COMMAND — `atlas node`/)
    expect(out).toMatch(/UNDOCUMENTED COMMAND — `atlas link`/)
  })

  it("FAILS a page with NO command, and NAMES the page", () => {
    page("promote.md") // a command that was renamed away, or never shipped
    const { code, out } = runGate()
    expect(out).toMatch(/ORPHAN PAGE — docs\/reference\/commands\/promote\.md/)
    expect(code).toBe(1)
  })

  it("FAILS a page hidden in a SUBDIRECTORY (nesting is not an escape hatch)", () => {
    page(join("draft", "emit.md"))
    const { code, out } = runGate()
    expect(out).toMatch(/ORPHAN PAGE — docs\/reference\/commands\/draft\/emit\.md/)
    expect(code).toBe(1)
  })

  it("ANTI-VACUITY: an EMPTY command list FAILS instead of reporting everything documented", () => {
    map("[] as const")
    const { code, out } = runGate()
    expect(out).toMatch(/EXTRACTION BROKEN/)
    expect(out).toMatch(/extracted EMPTY/)
    expect(out).not.toMatch(/command-doc-guard: OK/)
    expect(code).toBe(1)
  })

  it("ANTI-VACUITY: a RENAMED oracle FAILS (it does not read as a zero-command surface)", () => {
    const p = join(root, "packages", "cli", "src", "map.ts")
    writeFileSync(p, "export const CLI_COMMANDS = ['init'] as const;\n")
    const { code, out } = runGate()
    expect(out).toMatch(/EXTRACTION BROKEN/)
    expect(out).toMatch(/no `COMMANDS` variable declaration found/)
    expect(code).toBe(1)
  })

  it("ANTI-VACUITY: a NON-LITERAL surface FAILS rather than enumerating nothing", () => {
    map("buildCommands()")
    const { code, out } = runGate()
    expect(out).toMatch(/EXTRACTION BROKEN/)
    expect(out).toMatch(/no longer initialised with an ARRAY LITERAL/)
    expect(code).toBe(1)
  })

  it("ANTI-VACUITY: a SPREAD element FAILS rather than under-counting the surface", () => {
    map("['init', ...EXTRA] as const")
    const { code, out } = runGate()
    expect(out).toMatch(/EXTRACTION BROKEN/)
    expect(out).toMatch(/non-literal element/)
    expect(code).toBe(1)
  })

  it("ANTI-VACUITY: a MISSING map.ts FAILS", () => {
    rmSync(join(root, "packages"), { recursive: true, force: true })
    const { code, out } = runGate()
    expect(out).toMatch(/EXTRACTION BROKEN/)
    expect(code).toBe(1)
  })

  it("reports EVERY command as undocumented when the docs directory does not exist (the state on master)", () => {
    rmSync(join(root, "docs"), { recursive: true, force: true })
    const { code, out } = runGate()
    for (const c of ["init", "query", "emit"]) expect(out).toMatch(new RegExp(`UNDOCUMENTED COMMAND — \`atlas ${c}\``))
    expect(code).toBe(1)
  })

  it("does NOT judge page CONTENT (an empty page satisfies the correspondence)", () => {
    writeFileSync(join(root, "docs", "reference", "commands", "emit.md"), "")
    const { code } = runGate()
    expect(code).toBe(0)
  })
})

describe("the transport-parity leg — the numbers, and the set", () => {
  // This leg exists because the README bullet it reads was WRONG across two campaigns while every other
  // check was green, and the bullet itself said "No gate holds this bullet". Naming an unguarded claim is
  // not guarding it, so these are the teeth.

  it("PASSES when every number and the CLI-only set agree with source", () => {
    map("['init', 'query', 'emit'] as const")
    handler(["init"], ["query"])
    readme(["init", "query", "emit"], { advertised: ["init", "query"] })
    for (const c of ["init", "query", "emit"]) page(`${c}.md`)
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })

  for (const [what, parity] of [
    ["the command count", { commands: "The CLI exposes **9** commands" }],
    ["the tool count", { tools: 99 }],
    ["the governance count", { governance: 9 }],
    ["the read count", { read: 9 }],
    ["the CLI-only count", { cliOnlyCount: 9 }],
  ]) {
    it(`FAILS a STALE ${what}, and says what source says instead`, () => {
      map("['init', 'query', 'emit'] as const")
      handler(["init"], ["query"])
      readme(["init", "query", "emit"], { advertised: ["init", "query"], parity })
      for (const c of ["init", "query", "emit"]) page(`${c}.md`)
      const { code, out } = runGate()
      expect(out).toMatch(/README TRANSPORT-PARITY .* IS STALE/)
      expect(code).not.toBe(0)
    })
  }

  it("FAILS a command MISSING from the CLI-only list, and NAMES it", () => {
    map("['init', 'query', 'emit'] as const")
    // ONE name dropped, not all: an EMPTY list is caught earlier by the region's own anti-vacuity check,
    // so dropping everything would test that rule instead of this one.
    handler(["init"], [])
    readme(["init", "query", "emit"], { advertised: ["init"], parity: { cliOnly: ["query"], cliOnlyCount: 2 } })
    for (const c of ["init", "query", "emit"]) page(`${c}.md`)
    expect(runGate().out).toMatch(/MISSING FROM THE README CLI-ONLY LIST — `atlas emit`/)
  })

  it("FAILS a CLI-only list naming a command that IS advertised", () => {
    map("['init', 'query', 'emit'] as const")
    handler(["init"], ["query"])
    readme(["init", "query", "emit"], {
      advertised: ["init", "query"],
      parity: { cliOnly: ["emit", "query"], cliOnlyCount: 2 },
    })
    for (const c of ["init", "query", "emit"]) page(`${c}.md`)
    expect(runGate().out).toMatch(/README CLI-ONLY LIST NAMES A REACHABLE OR ABSENT COMMAND — `atlas query`/)
  })

  it("FAILS an advertised tool whose stripped name is NOT a shipped command", () => {
    // The correspondence this leg derives the CLI-only set from. An unmappable token must fail loudly —
    // silently dropping it would INFLATE the derived set and make a wrong README look right.
    map("['init', 'query', 'emit'] as const")
    handler(["init"], ["ghost"])
    readme(["init", "query", "emit"], { advertised: ["init"] })
    for (const c of ["init", "query", "emit"]) page(`${c}.md`)
    expect(runGate().out).toMatch(/ADVERTISED TOOL MAPS TO NO COMMAND — `atlas-ghost`/)
  })

  it("ANTI-VACUITY: a MISSING parity region FAILS rather than checking no numbers", () => {
    map("['init', 'query', 'emit'] as const")
    handler(["init"], ["query"])
    readme(["init", "query", "emit"], { parity: null })
    for (const c of ["init", "query", "emit"]) page(`${c}.md`)
    const { code, out } = runGate()
    expect(out).toMatch(/EXTRACTION BROKEN \(the transport-parity region\)/)
    expect(code).not.toBe(0)
  })

  it("ANTI-VACUITY: an EMPTY advertised UNION FAILS (per-array empty is legal, per ADR-0006)", () => {
    // ADR-0006 records READ_SURFACE having genuinely been empty, so emptiness is refused on the UNION —
    // the state that cannot be reached by an honest surface change — and permitted per array.
    map("['init', 'query', 'emit'] as const")
    handler([], [])
    readme(["init", "query", "emit"], { advertised: [] })
    for (const c of ["init", "query", "emit"]) page(`${c}.md`)
    expect(runGate().out).toMatch(/GOVERNANCE_SURFACE ∪ READ_SURFACE .* is EMPTY/)
  })

  it("an EMPTY READ_SURFACE alone is LEGAL — the union is what must be non-empty", () => {
    map("['init', 'query', 'emit'] as const")
    handler(["init"], [])
    readme(["init", "query", "emit"], { advertised: ["init"] })
    for (const c of ["init", "query", "emit"]) page(`${c}.md`)
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })

  it("ANTI-VACUITY: a MISSING handler.ts FAILS rather than reading a zero-tool surface", () => {
    map("['init', 'query', 'emit'] as const")
    handler(["init"], ["query"])
    readme(["init", "query", "emit"], { advertised: ["init", "query"] })
    for (const c of ["init", "query", "emit"]) page(`${c}.md`)
    rmSync(join(root, "packages", "tools", "src", "handler.ts"))
    expect(runGate().out).toMatch(/EXTRACTION BROKEN — packages\/tools\/src\/handler\.ts does not exist/)
  })
})

describe("the parallel-path oracle — the defect this gate had on the day it was written", () => {
  // The first cut derived "advertised" from the two surface arrays alone and agreed with a README that
  // called `atlas-relations` and `atlas-negations` unreachable over MCP. The real stdio server returned
  // eighteen tools, not sixteen. These are the teeth for that.

  it("FAILS a README that omits a tool the SERVER declares but neither surface array carries", () => {
    map("['init', 'query', 'emit'] as const")
    handler(["init"], [])
    mcp(["query"]) // declared by the server, in NEITHER surface constant — the parallel path
    // A README that still believes only the arrays: 1 tool, and `query` listed as CLI-only.
    readme(["init", "query", "emit"], {
      advertised: ["init"],
      parity: { tools: 1, parallel: 0, cliOnly: ["query", "emit"], cliOnlyCount: 2 },
    })
    for (const c of ["init", "query", "emit"]) page(`${c}.md`)
    const { code, out } = runGate()
    expect(out).toMatch(/README TRANSPORT-PARITY (TOOL COUNT|PARALLEL-PATH COUNT) IS STALE/)
    expect(out).toMatch(/README CLI-ONLY LIST NAMES A REACHABLE OR ABSENT COMMAND — `atlas query`/)
    expect(code).not.toBe(0)
  })

  it("PASSES once the README counts the parallel path and drops it from CLI-only", () => {
    map("['init', 'query', 'emit'] as const")
    handler(["init"], [])
    mcp(["query"])
    readme(["init", "query", "emit"], { advertised: ["init"] }) // defaults now union the parallel path
    for (const c of ["init", "query", "emit"]) page(`${c}.md`)
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(out).toMatch(/1 parallel-path advertised tool\(s\)/)
    expect(code).toBe(0)
  })

  it("ANTI-VACUITY: no `*_TOOL` declaration anywhere FAILS rather than shrinking the advertised set", () => {
    // Zero declarations would make every parallel-path tool vanish from the advertised set and INFLATE the
    // CLI-only list — the same lie, arrived at by the gate breaking instead of the docs rotting.
    map("['init', 'query', 'emit'] as const")
    handler(["init"], [])
    writeFileSync(join(root, "packages", "mcp-server", "src", "tools.ts"), "export const NOT_A_TOOL_CONST = 1;\n")
    readme(["init", "query", "emit"], { advertised: ["init"] })
    for (const c of ["init", "query", "emit"]) page(`${c}.md`)
    expect(runGate().out).toMatch(/EXTRACTION BROKEN \(the MCP tool declarations\)/)
  })

  it("ANTI-VACUITY: a MISSING mcp-server src directory FAILS", () => {
    map("['init', 'query', 'emit'] as const")
    handler(["init"], [])
    rmSync(join(root, "packages", "mcp-server"), { recursive: true, force: true })
    readme(["init", "query", "emit"], { advertised: ["init"] })
    for (const c of ["init", "query", "emit"]) page(`${c}.md`)
    expect(runGate().out).toMatch(/could not be listed/)
  })
})
