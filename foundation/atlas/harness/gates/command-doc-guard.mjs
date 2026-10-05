#!/usr/bin/env node
// command-doc-guard — the SHIPPED SURFACE ≡ REFERENCE PAGES correspondence. One page per command, both ways.
//
// Prose rots because nothing fails when it does. The proof is in the file this gate reads: the comment on
// `COMMAND_LEG` (packages/cli/src/map.ts) records that the map "said 'all six' until `node` and `link` were
// added". That was a hand-maintained sentence sitting three lines from the array it described, and it still
// drifted. A hand-maintained docs INDEX — further away, edited by different people, in a different tree —
// drifts the same way and faster. So the reference tree is not indexed by hand here: it is CHECKED against
// the surface, and a missing page breaks the build.
//
// ── WHAT IT CHECKS — exactly this, in BOTH directions ────────────────────────────────────────────────
//   (1) UNDOCUMENTED COMMAND — an entry in `COMMANDS` with no `docs/reference/commands/<command>.md`.
//   (2) ORPHAN PAGE         — a `.md` under that directory naming something `COMMANDS` does not contain.
//                             A page for a deleted command is not harmless: it is a documented door that
//                             does not open, which is how a docs tree accumulates lies about a surface
//                             that moved. Both legs, or the ledger only ever grows.
//   (3) TRANSPORT PARITY    — the surface-cardinality bullet in README.md, delimited by the
//                             `transport-parity` markers, must agree with the SOURCE on all four numbers
//                             (commands, tools, governance, read) AND on the exact CLI-only command set.
//                             This leg was added after that bullet rotted twice: campaign 10 moved six
//                             doors onto MCP, campaign 11 added five more commands and five more tools,
//                             and the paragraph went on claiming 23 commands and 11 tools throughout. It
//                             carried the sentence "No gate holds this bullet" the whole time, which is a
//                             confession, not a guard — a claim that names its own fragility is still a
//                             claim a stranger reads as fact.
//   (4) README TABLE        — the command table in README.md, delimited by the `command-table` markers,
//                             must name EXACTLY `COMMANDS`, both ways. This leg exists because the README
//                             CLAIMED this gate protected that table while the gate did not read the file
//                             at all: the table listed ten commands against a shipped surface of
//                             twenty-three, and every check was green. A sentence asserting that a gate
//                             guards something is worth less than nothing when it is false — it stops the
//                             reader from checking. The table is the first thing a stranger reads, so a
//                             stale one misdescribes the product at its widest point of contact.
//
// The README region is delimited by `<!-- command-table:begin -->` / `<!-- command-table:end -->` rather
// than sniffed out of the prose. A heuristic that scans the whole file for backticked `atlas <word>` would
// silently widen or narrow as the prose moves around it, and a check whose scope drifts is the failure mode
// this gate was written against. The markers are explicit, and their ABSENCE is a hard failure — never a
// zero-row region that passes vacuously.
//
// ── WHAT IT DELIBERATELY DOES NOT CHECK ──────────────────────────────────────────────────────────────
// The CONTENT of a page. No word count, no required heading, no "must show an example". Existence and
// correspondence only. A gate that grades prose becomes an editor, and an editor nobody elected is worked
// around rather than satisfied. Whether a page is any GOOD is a human review job and is not claimed here.
//
// ── WHERE THE LIST COMES FROM, AND WHY NOT FROM HERE ─────────────────────────────────────────────────
// `COMMANDS` in packages/cli/src/map.ts is the oracle, and this gate carries NO copy of it. A gate holding
// its own list of the eight names would be a second source of truth with exactly the failure mode above:
// it would have said "all six" too, and agreed with itself, forever.
//
// The list is read from SOURCE via the TypeScript parser (already a dependency; reference-model-guard reads
// source the same way) rather than by importing `packages/cli/dist/**` — so the gate runs with no build,
// in the same position as godfile-guard, and its own fixtures are three lines of TypeScript instead of a
// compiled workspace. It is a PARSE, not a regex: an earlier gate in this tree was fooled by a marker in a
// string literal, and a pattern that quietly matches nothing is the specific disease this gate must not have.
//
// ── FAIL-CLOSED EXTRACTION ───────────────────────────────────────────────────────────────────────────
// The worst possible outcome here is not a false alarm — it is a gate that finds ZERO commands, checks zero
// of them, and prints OK. "Everything is documented" and "the extraction broke" would look identical. So
// every way of not getting a list is an explicit, named FAILURE: the file missing, the declaration missing,
// an initializer that is not an array literal, an element that is not a string literal, and an array that
// comes back EMPTY. The empty case fails even though an empty surface would be vacuously documented,
// because a real CLI shipping zero commands is not a state this repo can reach by accident.
//
// Run: `node harness/gates/command-doc-guard.mjs` (no build needed — it reads source only).

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, dirname, sep } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const ROOT = process.env.COMMAND_DOC_GUARD_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..")

/** The oracle. Its PATH is the one thing this gate hardcodes — moving the file must fail loudly, not silently. */
const MAP_REL = join("packages", "cli", "src", "map.ts")
/** One page per command lives here. Its PATH is a convention this gate defines; nothing else reads it. */
const DOCS_REL = join("docs", "reference", "commands")
/** The front door. Its command table is the first surface description a stranger reads. */
const README_REL = "README.md"

const MAP = join(ROOT, MAP_REL)
const DOCS = join(ROOT, DOCS_REL)
const README = join(ROOT, README_REL)

/** The delimiters of the checked region in the README. Explicit, so the gate's scope cannot drift with the prose. */
const TABLE_BEGIN = "<!-- command-table:begin -->"
const TABLE_END = "<!-- command-table:end -->"

/** The delimiters of the transport-parity region — same discipline, second region. */
const PARITY_BEGIN = "<!-- transport-parity:begin -->"
const PARITY_END = "<!-- transport-parity:end -->"

/** The second oracle: the two advertised MCP surface arrays. Its PATH is hardcoded for the same reason
 *  `MAP_REL` is — a moved file must fail loudly rather than quietly stop being checked. */
const HANDLER_REL = join("packages", "tools", "src", "handler.ts")
const HANDLER = join(ROOT, HANDLER_REL)

/**
 * The THIRD oracle, and the reason it exists is a defect this gate had on the day it was written.
 *
 * The first cut derived "what MCP advertises" from `GOVERNANCE_SURFACE ∪ READ_SURFACE` alone, because the
 * README says MCP advertises exactly that union. Running the real stdio server said otherwise: `tools/list`
 * returns EIGHTEEN tools, not sixteen. `atlas-relations` (#99a) and `atlas-negations` (#99b) are advertised
 * through a documented parallel path that deliberately leaves both surface constants untouched. So the
 * README was calling two reachable doors "CLI-only and unreachable over MCP" — a lie in the direction that
 * costs a user the most, and a gate anchored on the surface arrays would have certified it.
 *
 * That is the reference-model-vs-shipped-path trap in a gate rather than in a product: the arrays are the
 * MODEL, and the server is the PATH. The oracle is therefore widened to include every tool token the MCP
 * server DECLARES — `export const *_TOOL = '<literal>'` — which is where the parallel path names live.
 *
 * [STATED BOUND, and it is checked rather than asserted.] A declared token that is never advertised would
 * over-count here. This gate does not run the server (it reads source, needs no build, and must work in the
 * same position `godfile-guard` runs in), so it cannot prove advertisement. What it can do — and what pins
 * the bound — is the correspondence measured live at the time of writing: `union ∪ declared` was EXACTLY
 * the eighteen names `tools/list` returned. `packages/mcp-server/test/surface-conformance-req-mcp-1e.test.ts`
 * is the leg that proves advertisement itself; this one proves the DOCS match the declaration.
 */
const MCP_SRC_REL = join("packages", "mcp-server", "src")
const MCP_SRC = join(ROOT, MCP_SRC_REL)

/** A tool token is `atlas-<command>`; the command it exposes is the token minus that prefix. This is the
 *  ONLY correspondence rule between the two oracles, and it is checked rather than assumed: a token whose
 *  stripped name is not a shipped command is a named failure below, not a silently dropped row. */
const TOOL_PREFIX = "atlas-"

/** The exported identifier that enumerates the shipped surface. */
const ORACLE = "COMMANDS"

/**
 * Extract the string members of the exported `COMMANDS` array from map.ts SOURCE.
 *
 * Returns `{ names }` on success, or `{ broken }` naming precisely how the extraction failed. It never
 * returns an empty `names` and it never returns both — a caller cannot mistake "broke" for "nothing to do".
 */
function extractCommands(text) {
  return extractStringArray(text, MAP_REL, ORACLE)
}

/**
 * The same fail-closed literal-array extraction, over any (file, exported identifier) pair — used for
 * `COMMANDS` in map.ts and for `GOVERNANCE_SURFACE` / `READ_SURFACE` in handler.ts. Kept as ONE function
 * on purpose: three copies of a fail-closed reader is three chances for one of them to quietly return `[]`.
 */
function extractStringArray(text, relPath, ORACLE, { allowEmpty = false } = {}) {
  const sf = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, /* setParentNodes */ false, ts.ScriptKind.TS)

  let init
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const d of stmt.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === ORACLE) init = d.initializer
    }
  }
  if (init === undefined) {
    return {
      broken: `no \`${ORACLE}\` variable declaration found in ${relPath}. The oracle was renamed, moved, or deleted.`,
    }
  }

  // `COMMANDS = [...] as const` / `satisfies …` — unwrap the assertions the declaration is written with.
  while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init))
    init = init.expression

  if (!ts.isArrayLiteralExpression(init)) {
    return {
      broken: `\`${ORACLE}\` in ${relPath} is no longer initialised with an ARRAY LITERAL (found ${ts.SyntaxKind[init.kind]}). This gate can only enumerate a literal surface — a computed one cannot be checked statically.`,
    }
  }

  const names = []
  for (const el of init.elements) {
    if (!ts.isStringLiteralLike(el)) {
      return {
        broken: `\`${ORACLE}\` in ${relPath} contains a non-literal element (${ts.SyntaxKind[el.kind]}) — a spread or an expression. Every command must be a literal string, or the shipped surface cannot be enumerated.`,
      }
    }
    names.push(el.text)
  }
  if (names.length === 0 && !allowEmpty) {
    return {
      broken: `\`${ORACLE}\` in ${relPath} extracted EMPTY. Either the CLI ships no commands, or this gate's reading of the file broke — and a gate that checks zero commands would print OK for a completely undocumented product. Failing instead.`,
    }
  }
  return { names }
}

/**
 * Extract the command names the README's delimited table claims exist.
 *
 * A row is counted only when its FIRST cell opens with a backticked `atlas <name>` — the shape every row of
 * that table already has. Anything else inside the region (a header row, a separator, prose) contributes
 * nothing, so the region may carry the table and nothing but the table without the gate becoming a linter.
 *
 * Fail-closed exactly like `extractCommands`: a missing file, a missing marker, markers in the wrong order,
 * and an EMPTY region are each a named failure. A region that yields zero rows must never read as "the
 * table agrees with a surface of zero commands".
 */
function extractReadmeCommands(text) {
  const b = text.indexOf(TABLE_BEGIN)
  const e = text.indexOf(TABLE_END)
  if (b === -1 || e === -1) {
    return {
      broken: `${README_REL} is missing the ${b === -1 ? TABLE_BEGIN : TABLE_END} marker. The gate cannot tell which rows are the command table, and refuses to guess — a check whose scope is inferred from prose stops checking the moment the prose moves.`,
    }
  }
  if (e < b) {
    return {
      broken: `${README_REL} has ${TABLE_END} BEFORE ${TABLE_BEGIN}. The region is inside-out, so it encloses nothing.`,
    }
  }

  const names = []
  for (const line of text.slice(b + TABLE_BEGIN.length, e).split("\n")) {
    const m = /^\s*\|\s*`atlas ([a-z][a-z0-9-]*)/.exec(line)
    if (m !== null) names.push(m[1])
  }
  if (names.length === 0) {
    return {
      broken: `the ${README_REL} command-table region extracted ZERO rows. Either the table was emptied or its row shape changed, and a table that names no commands would agree with any surface at all. Failing instead.`,
    }
  }

  const seen = new Set()
  for (const n of names) {
    if (seen.has(n)) {
      return {
        broken: `the ${README_REL} command table lists \`atlas ${n}\` TWICE. A duplicated row makes the table's own count meaningless and hides a missing command behind a matching set.`,
      }
    }
    seen.add(n)
  }
  return { names }
}

/**
 * Extract the four numbers and the CLI-only command list the README's transport-parity region CLAIMS.
 *
 * Fail-closed on every way of not getting them, exactly like the other two extractors: missing file,
 * missing marker, markers in the wrong order, and — the one that matters most here — a region that does not
 * carry a pattern. A number this gate silently failed to find would read as "nothing to check", which is
 * the state this whole gate exists to make impossible: the bullet was WRONG for two campaigns while every
 * check was green, and it stayed wrong because nothing was reading it.
 *
 * The patterns are anchored on the surrounding words, not on position, so the prose may be re-worded around
 * them; what may NOT happen is a number quietly disappearing, because its absence fails.
 */
function extractParityClaims(text) {
  const b = text.indexOf(PARITY_BEGIN)
  const e = text.indexOf(PARITY_END)
  if (b === -1 || e === -1) {
    return {
      broken: `${README_REL} is missing the ${b === -1 ? PARITY_BEGIN : PARITY_END} marker. The gate cannot tell which prose states the surface cardinality, and refuses to guess.`,
    }
  }
  if (e < b) {
    return {
      broken: `${README_REL} has ${PARITY_END} BEFORE ${PARITY_BEGIN}. The region is inside out; the gate would read an empty span and pass vacuously.`,
    }
  }
  const region = text.slice(b + PARITY_BEGIN.length, e)

  const commands = /CLI exposes \*\*(\d+)\*\* commands/.exec(region)
  if (commands === null) {
    return {
      broken: `the transport-parity region does not state the command count in the form "CLI exposes **N** commands". A count the gate cannot find is a count nobody is checking.`,
    }
  }
  const tools = /\*\*(\d+)\*\* tools \((\d+) governance \+ (\d+) read \+ (\d+) parallel-path\)/.exec(region)
  if (tools === null) {
    return {
      broken: `the transport-parity region does not state the tool cardinality in the form "**N** tools (G governance + R read + P parallel-path)". The parallel-path term is REQUIRED: omitting it is how this bullet came to call two advertised tools unreachable.`,
    }
  }
  // The count may or may not be inside the sentence's own bold span, so the emphasis markers are OPTIONAL
  // around it — matching the number, not the styling. Everything after the colon up to a blank line is the
  // list; the backtick scan below is what actually decides membership.
  const cliOnly = /remaining (?:\*\*)?(\d+)(?:\*\*)? commands are CLI-only[^:]*:([^]*?)(?=\n\s*\n|$)/.exec(region)
  if (cliOnly === null) {
    return {
      broken: `the transport-parity region does not state the CLI-only set in the form "The remaining **N** commands are CLI-only ... : \`a\`, \`b\`, ...".`,
    }
  }
  const listed = [...cliOnly[2].matchAll(/\`([a-z][a-z-]*)\`/g)].map((m) => m[1])
  if (listed.length === 0) {
    return {
      broken: `the transport-parity region names ZERO CLI-only commands. An empty list would agree with a surface in which every command is on MCP, which is not a state this repo can reach by accident.`,
    }
  }
  return {
    claimed: {
      commands: Number(commands[1]),
      tools: Number(tools[1]),
      governance: Number(tools[2]),
      read: Number(tools[3]),
      parallel: Number(tools[4]),
      cliOnlyCount: Number(cliOnly[1]),
      cliOnly: listed,
    },
  }
}

/**
 * Every tool token the MCP server DECLARES: the string literal of each `const <NAME>_TOOL = '...'`, over
 * every `.ts` under the server's `src`. A PARSE, not a regex — the same discipline the command oracle uses,
 * because a token inside a comment or a doc string must not count as a declaration.
 *
 * Fail-closed: a missing directory and an EMPTY result are both named failures. Zero declared tokens would
 * silently shrink the advertised set and make the CLI-only list look correct while over-stating it.
 */
function extractMcpToolTokens() {
  let files
  try {
    files = readdirSync(MCP_SRC)
      .filter((f) => f.endsWith(".ts"))
      .sort()
  } catch {
    return { broken: `${MCP_SRC_REL} could not be listed. The MCP server's source moved; point this gate at it.` }
  }
  const names = new Set()
  for (const f of files) {
    const sf = ts.createSourceFile(
      f,
      readFileSync(join(MCP_SRC, f), "utf8"),
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS,
    )
    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt)) continue
      for (const d of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !/_TOOL$/.test(d.name.text)) continue
        let init = d.initializer
        while (init !== undefined && (ts.isAsExpression(init) || ts.isParenthesizedExpression(init)))
          init = init.expression
        if (init !== undefined && ts.isStringLiteralLike(init)) names.add(init.text)
      }
    }
  }
  if (names.size === 0) {
    return {
      broken: `no \`*_TOOL\` string constant found under ${MCP_SRC_REL}. Either the server declares no tools, or this gate's reading of it broke — and the second would silently shrink the advertised surface.`,
    }
  }
  return { names: [...names].sort() }
}

/** Every `.md` under DOCS, as slash-joined paths relative to it (recursive: a nested page is not a hiding place). */
function pages(dir, prefix = "") {
  if (!existsSync(dir)) return []
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) out.push(...pages(join(dir, e.name), `${prefix}${e.name}/`))
    else if (e.name.endsWith(".md")) out.push(`${prefix}${e.name}`)
  }
  return out
}

const fail = []

if (!existsSync(MAP)) {
  console.error("command-doc-guard: FAIL\n")
  console.error(`  ✗ EXTRACTION BROKEN — ${MAP_REL} does not exist. The command oracle moved; point this gate at it.\n`)
  process.exit(1)
}

if (!existsSync(README)) {
  console.error("command-doc-guard: FAIL\n")
  console.error(
    `  ✗ EXTRACTION BROKEN — ${README_REL} does not exist, so the front door's command table cannot be checked.\n`,
  )
  process.exit(1)
}

const { names, broken } = extractCommands(readFileSync(MAP, "utf8"))

if (broken !== undefined) {
  console.error("command-doc-guard: FAIL\n")
  console.error(`  ✗ EXTRACTION BROKEN — ${broken}\n`)
  console.error("The gate refuses to report on a surface it could not read. Fix the extraction, not the docs.")
  process.exit(1)
}

const readme = extractReadmeCommands(readFileSync(README, "utf8"))

if (readme.broken !== undefined) {
  console.error("command-doc-guard: FAIL\n")
  console.error(`  ✗ EXTRACTION BROKEN — ${readme.broken}\n`)
  console.error("The gate refuses to report on a table it could not read. Fix the extraction, not the docs.")
  process.exit(1)
}

if (!existsSync(HANDLER)) {
  console.error("command-doc-guard: FAIL\n")
  console.error(
    `  ✗ EXTRACTION BROKEN — ${HANDLER_REL} does not exist, so the advertised MCP surface cannot be read.\n`,
  )
  process.exit(1)
}

const handlerText = readFileSync(HANDLER, "utf8")
// EMPTINESS IS PERMITTED PER ARRAY, AND REFUSED ON THE UNION — a deliberate departure from the rule the
// `COMMANDS` extraction uses, and the reason is in ADR-0006: "READ_SURFACE does not exist yet. The gate
// treats it as empty." An empty READ_SURFACE is a state this repository has ACTUALLY BEEN IN, so failing on
// it would be a gate refusing a legitimate configuration rather than catching a broken read. The anti-vacuity
// property still has to hold somewhere, so it holds where the impossible state actually is: MCP advertising
// NOTHING would mean the whole tool surface vanished, which no surface change reaches by accident.
const gov = extractStringArray(handlerText, HANDLER_REL, "GOVERNANCE_SURFACE", { allowEmpty: true })
const rd = extractStringArray(handlerText, HANDLER_REL, "READ_SURFACE", { allowEmpty: true })
const mcp = extractMcpToolTokens()
const parity = extractParityClaims(readFileSync(README, "utf8"))

if (mcp.broken !== undefined) {
  console.error("command-doc-guard: FAIL\n")
  console.error(`  ✗ EXTRACTION BROKEN (the MCP tool declarations) — ${mcp.broken}\n`)
  process.exit(1)
}

if (gov.broken === undefined && rd.broken === undefined && gov.names.length + rd.names.length === 0) {
  console.error("command-doc-guard: FAIL\n")
  console.error(
    `  ✗ EXTRACTION BROKEN — GOVERNANCE_SURFACE ∪ READ_SURFACE in ${HANDLER_REL} is EMPTY. Either MCP now ` +
      "advertises no tools at all, or this gate stopped reading the arrays. Those two look identical from " +
      "here and only one of them is survivable, so the gate refuses rather than reporting a surface of zero.\n",
  )
  process.exit(1)
}

for (const [what, r] of [
  ["GOVERNANCE_SURFACE", gov],
  ["READ_SURFACE", rd],
  ["the transport-parity region", parity],
]) {
  if (r.broken !== undefined) {
    console.error("command-doc-guard: FAIL\n")
    console.error(`  ✗ EXTRACTION BROKEN (${what}) — ${r.broken}\n`)
    console.error("The gate refuses to report on a surface it could not read. Fix the extraction, not the docs.")
    process.exit(1)
  }
}

const documented = new Set(pages(DOCS))
const shipped = new Set(names)
const tabled = new Set(readme.names)

// (1) a shipped command nobody wrote a page for.
for (const c of names) {
  if (!documented.has(`${c}.md`)) {
    fail.push(
      `UNDOCUMENTED COMMAND — \`atlas ${c}\`\n` +
        `      Shipped (it is in \`${ORACLE}\`, ${MAP_REL}) with no page at ${DOCS_REL}${sep}${c}.md.\n` +
        `      Write the page. A stub added to clear this gate is the exact lie the gate exists to prevent.`,
    )
  }
}

// (2) a page describing a door that is not there.
for (const p of documented) {
  if (!shipped.has(p.replace(/\.md$/, ""))) {
    fail.push(
      `ORPHAN PAGE — ${DOCS_REL}${sep}${p}\n` +
        `      Names something \`${ORACLE}\` (${MAP_REL}) does not contain, so it documents a door that does\n` +
        `      not open. Delete it, or rename it to the command it actually describes. One page per command,\n` +
        `      flat, named exactly \`<command>.md\` — a nested or extra file cannot be told apart from a stale one.`,
    )
  }
}

// (3) a shipped command the front door does not mention.
for (const c of names) {
  if (!tabled.has(c)) {
    fail.push(
      `MISSING FROM THE README TABLE — \`atlas ${c}\`\n` +
        `      Shipped (it is in \`${ORACLE}\`, ${MAP_REL}) and absent from the command table in ${README_REL}.\n` +
        `      A stranger reads that table as the product's surface, so a command missing from it does not\n` +
        `      exist as far as anyone outside this repo is concerned. Add the row.`,
    )
  }
}

// (4) a row for a door that is not there.
for (const c of tabled) {
  if (!shipped.has(c)) {
    fail.push(
      `README TABLE NAMES A NON-COMMAND — \`atlas ${c}\`\n` +
        `      The command table in ${README_REL} advertises it; \`${ORACLE}\` (${MAP_REL}) does not contain it.\n` +
        `      The front door promises a command that does not run. Delete the row, or ship the command.`,
    )
  }
}

// (5) the transport-parity bullet: four numbers and one set, all against SOURCE.
{
  const c = parity.claimed
  // The union of the MODEL (the two surface constants) and the PATH (what the server declares). The
  // parallel-path tools live only in the second, and they are exactly the names the README used to call
  // unreachable. Deduped, because the read tools appear in both.
  const advertised = [...new Set([...gov.names, ...rd.names, ...mcp.names])].sort()
  const parallel = advertised.filter((t) => !gov.names.includes(t) && !rd.names.includes(t))
  const exposed = advertised.map((t) => (t.startsWith(TOOL_PREFIX) ? t.slice(TOOL_PREFIX.length) : t))

  // A token whose stripped name is not a shipped command breaks the ONE correspondence rule this leg
  // relies on. Named, never silently skipped — a dropped token would shrink the derived CLI-only set and
  // make the README's list look correct for the wrong reason.
  for (const [i, name] of exposed.entries()) {
    if (!shipped.has(name)) {
      fail.push(
        `ADVERTISED TOOL MAPS TO NO COMMAND — \`${advertised[i]}\`\n` +
          `      It is in GOVERNANCE_SURFACE ∪ READ_SURFACE (${HANDLER_REL}); \`${name}\` is not in \`${ORACLE}\` (${MAP_REL}).\n` +
          `      This gate derives the CLI-only set by subtracting the advertised names from the shipped ones,\n` +
          `      so an unmappable token would silently inflate that set rather than fail. Fix the surface or\n` +
          `      teach this gate the new correspondence explicitly.`,
      )
    }
  }

  const derivedCliOnly = names.filter((n) => !new Set(exposed).has(n))
  const numbers = [
    ["command count", c.commands, names.length, `\`${ORACLE}\` in ${MAP_REL}`],
    [
      "tool count",
      c.tools,
      advertised.length,
      `GOVERNANCE_SURFACE ∪ READ_SURFACE ∪ the *_TOOL declarations under ${MCP_SRC_REL}`,
    ],
    [
      "parallel-path count",
      c.parallel,
      parallel.length,
      `the *_TOOL declarations under ${MCP_SRC_REL} that are in NEITHER surface constant`,
    ],
    ["governance count", c.governance, gov.names.length, `GOVERNANCE_SURFACE in ${HANDLER_REL}`],
    ["read count", c.read, rd.names.length, `READ_SURFACE in ${HANDLER_REL}`],
    ["CLI-only count", c.cliOnlyCount, derivedCliOnly.length, "the shipped surface minus the advertised one"],
  ]
  for (const [what, claimed, actual, source] of numbers) {
    if (claimed !== actual) {
      fail.push(
        `README TRANSPORT-PARITY ${what.toUpperCase()} IS STALE — claims ${claimed}, source says ${actual}\n` +
          `      Oracle: ${source}.\n` +
          `      This is the exact drift that went unnoticed across two campaigns. Update the number in the\n` +
          `      \`transport-parity\` region of ${README_REL}; do not widen this check to accept it.`,
      )
    }
  }

  const claimedSet = new Set(c.cliOnly)
  const derivedSet = new Set(derivedCliOnly)
  for (const n of derivedCliOnly) {
    if (!claimedSet.has(n)) {
      fail.push(
        `MISSING FROM THE README CLI-ONLY LIST — \`atlas ${n}\`\n` +
          `      Shipped, and not advertised over MCP, so it belongs in that list. A stranger reads the list as\n` +
          `      the complete set of doors MCP cannot reach.`,
      )
    }
  }
  for (const n of claimedSet) {
    if (!derivedSet.has(n)) {
      fail.push(
        `README CLI-ONLY LIST NAMES A REACHABLE OR ABSENT COMMAND — \`atlas ${n}\`\n` +
          `      Either it is advertised over MCP after all, or it is not a shipped command. Both make the\n` +
          `      list wrong in the direction that understates the MCP surface.`,
      )
    }
  }
}

if (fail.length > 0) {
  console.error("command-doc-guard: FAIL\n")
  for (const f of fail) console.error(`  ✗ ${f}\n`)
  console.error(
    `${fail.length} violation(s) across a surface of ${names.length} command(s): ${names.join(", ")}.\n` +
      "The surface is the oracle. Move the docs to it — do not weaken this gate to the docs.",
  )
  process.exit(1)
}

console.log(
  `command-doc-guard: OK — ${names.length} shipped command(s) (${names.join(", ")}), ` +
    `${documented.size} reference page(s) under ${DOCS_REL}, ${tabled.size} row(s) in the ${README_REL} ` +
    `command table, and a transport-parity region agreeing on ${gov.names.length} governance + ` +
    `${rd.names.length} read + ${mcp.names.filter((t) => !gov.names.includes(t) && !rd.names.includes(t)).length} ` +
    `parallel-path advertised tool(s), plus ` +
    `${parity.claimed.cliOnlyCount} CLI-only command(s). Correspondence holds in all three directions. ` +
    "Existence only — whether a page is worth reading is a human job and is not claimed here.",
)
