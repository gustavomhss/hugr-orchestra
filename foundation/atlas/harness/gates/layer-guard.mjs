// harness/gates/layer-guard.mjs — the ARCHITECTURE FITNESS FUNCTION (reference/atlas-architecture.md)
//
// A layer rule that lives only in prose is not a rule. This gate reads the REAL dependency graph and the
// REAL composition root and fails on anything that violates the hierarchy or the exposure law:
//
//   ARCH-1/2  LAYER      — dependencies flow outer→inner only; the graph is acyclic; `tools` (the port
//                          layer) has ZERO edges to adapter-io / cli / mcp-server.
//   ARCH-3    BINDING    — every member of the tool union is bound SOMEWHERE real. `GOVERNANCE_SURFACE`
//                          members bind at the ONE `Tool`-leg composition root (`wire.ts`); `READ_SURFACE`
//                          members bind by ANY of three kinds — a compose-planner field (`compose.ts`), a
//                          query-projection via the CLI's command→leg map onto a bound `atlas-query` leg
//                          (`cli/src/map.ts`), or a direct `wire.ts` leg (see `boundReadDoor`, WP-10.A5.TOOLS).
//                          Checked in BOTH directions: a typed-but-unbound door is a hole, a bound-but-
//                          undeclared `wire.ts` leg is a ghost.
//   ARCH-5/6  SURFACE    — advertised ≡ invocable; GOVERNANCE_SURFACE ⊎ READ_SURFACE is total and disjoint;
//                          WRITE_PATHS ⊆ GOVERNANCE_SURFACE.
//   ARCH-7    BUDGET     — the statically-advertised tool count stays ≤ 30 (a MEASURED threshold, not an
//                          invented one — see reference/atlas-architecture.md §2.2). Crossing it is not
//                          forbidden; it fails the gate so the move to dynamic projection (ARCH-8) is a
//                          deliberate decision rather than a drift.
//
// Grounding: architecture fitness functions (Ford/Parsons/Kua; ArchUnit → ArchUnitTS). DIST-free where it
// can be: the LAYER + BINDING checks read source and package manifests, so they work before a build. Only
// the SURFACE check imports the built constants.
//
// It is NOT dependency-free, and the earlier revision that claimed to be paid for it: reading TypeScript
// with regexes is what put a private comment stripper in this file, and that stripper deleted real import
// statements. Lexing is delegated to `../lib/lexing.mjs` — the argument, and the measurement, live in its
// header.
//
// The SCANNING half (workspace graph, source-import grammar, the canonical layer diagram reader) lives in
// `../lib/workspace-scan.mjs`. That is a split by ROLE, not by size: this file JUDGES, that one READS. It
// happened now because this file sat at exactly 400 of the 400-LOC ceiling and could not take another line
// once `godfile-guard` learned to walk `harness/**` — a file at the cap is a file whose next edit is a
// refactor whether or not that was the edit you wanted to make.

import { readFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
// The ONE comment stripper in this repo. Keeping a private copy here is what created the hole it now closes.
import { stripComments } from "../lib/lexing.mjs"
import { canonicalRanks, workspaceGraph } from "../lib/workspace-scan.mjs"

// The repo root, OVERRIDABLE so the gate's own test can point it at a fixture tree. Without this the gate
// could only ever be mutation-tested by hand against the live repo — which is precisely the 'trust me' the
// gate exists to abolish.
const ROOT = process.env.LAYER_GUARD_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const PKGS = join(ROOT, "packages")

/** The canonical layer diagram. It is READ (`../lib/workspace-scan.mjs`), never transcribed — the header of
 *  `canonicalRanks` records the three ranks an earlier hard-coded array got wrong. */
const ARCHITECTURE_DOC = join(ROOT, "ARCHITECTURE.md")

/** The ring, above every `L*` core layer. Index order = increasing depth; `e2e*` import all, are imported by
 *  none. It is declared HERE, with the other architecture constants, because it is an architectural claim —
 *  the scanner merely applies it. A package in neither the diagram nor this list is a HARD FAILURE below. */
const RING_ORDER = ["adapter-io", "cli", "mcp-server", "e2e", "e2e-blackbox"]

/** ARCH-2, stated as an explicit denylist so the message can name the invariant rather than a rank. */
const FORBIDDEN_EDGES = [
  ["tools", "adapter-io"],
  ["tools", "cli"],
  ["tools", "mcp-server"],
]

/** ARCH-7 — the measured static-surface budget. See §2.2 for the citations behind the number. */
const TOOL_BUDGET = 30

/** The ONE composition root for the five `Tool` legs (ARCH-3). */
const COMPOSITION_ROOT = join(PKGS, "adapter-io", "src", "wire.ts")

/** [WP-10.A5.TOOLS binding fix] `READ_SURFACE` doors do NOT all bind at `COMPOSITION_ROOT` — verified against
 *  the shipped tree, not assumed. There are THREE legitimate binding kinds, and a member is bound iff it
 *  satisfies ANY of them (see `boundReadDoor` below):
 *   (a) COMPOSE-PLANNER — `atlas-anchors` / `atlas-slots` / `atlas-draft` / `atlas-check` are fields on the
 *       `ComposedRuntime` object literal `composeRuntime` (`adapter-io/src/compose.ts`) returns — built from
 *       the planner factories declared in `@atlas/tools` (`anchors.ts`/`slots.ts`/`draft.ts`/`check.ts`) and
 *       threaded there. NOT in `wire.ts`'s `legs`.
 *   (b) QUERY-PROJECTION — `atlas-doctor` / `atlas-node` are not their own leg at all: the CLI intercepts
 *       `doctor`/`node` BEFORE the handler and reuses the `atlas-query` leg (`cli/src/map.ts`
 *       `COMMAND_LEG['doctor'] === COMMAND_LEG['node'] === 'atlas-query'`) — a second PROJECTION of the read
 *       door that IS bound in `wire.ts`'s `legs`, not a second door.
 *   (c) DIRECT TOOL LEG — a token bound literally in `wire.ts`'s `legs` (the pre-existing check, unchanged;
 *       covers the five `GOVERNANCE_SURFACE` members and would cover a future READ_SURFACE member wired the
 *       same way).
 *  A member satisfying NONE of the three is a real hole and still reds ARCH-3/5 (teeth: see the gate's own
 *  test / the WP's return card — a bogus `'atlas-nonexistent'` member was probed live and reverted). */
const COMPOSE_ROOT = join(PKGS, "adapter-io", "src", "compose.ts")
const CLI_MAP = join(PKGS, "cli", "src", "map.ts")

const fail = []
const note = (msg) => fail.push(msg)

// ── ARCH-1/2 — direction, forbidden edges, acyclicity ────────────────────────────────────────────────
function checkLayers(graph, rank) {
  if (rank === null) return // the canonical diagram could not be read; already noted
  // ARCH-1: NO package may be silently unranked. An unranked package skips the direction check entirely,
  // which is how an earlier version of this gate left `memory` and `genesis` unchecked while printing OK.
  for (const pkg of graph.keys()) {
    if (!rank.has(pkg)) {
      note(
        `ARCH-1 unranked package '@atlas/${pkg}': it is in neither ARCHITECTURE.md's layer diagram nor the ring list, so its edges are UNCHECKED. Rank it before it ships.`,
      )
    }
  }

  for (const [pkg, deps] of graph) {
    const from = rank.get(pkg)
    for (const dep of deps) {
      if (!graph.has(dep)) continue // not a workspace package
      const to = rank.get(dep)
      if (from !== undefined && to !== undefined && to >= from) {
        note(
          `ARCH-1 layer inversion: @atlas/${pkg} (L${from}) depends on @atlas/${dep} (L${to}) — a package may import only from a STRICTLY lower layer (ARCHITECTURE.md)`,
        )
      }
    }
  }

  for (const [outer, inner] of FORBIDDEN_EDGES) {
    if ((graph.get(outer) ?? []).includes(inner)) {
      note(
        `ARCH-2 forbidden edge: @atlas/${outer} MUST NOT depend on @atlas/${inner} — a port is declared in the consuming layer and implemented outward`,
      )
    }
  }

  // Acyclicity — iterative DFS with an explicit path so the cycle can be NAMED, not just detected.
  const state = new Map() // 0 = unvisited, 1 = on-stack, 2 = done
  const path = []
  const visit = (node) => {
    if (state.get(node) === 2) return
    if (state.get(node) === 1) {
      const cycle = [...path.slice(path.indexOf(node)), node].map((n) => `@atlas/${n}`).join(" → ")
      note(`ARCH-1 dependency CYCLE: ${cycle}`)
      return
    }
    state.set(node, 1)
    path.push(node)
    for (const dep of graph.get(node) ?? []) if (graph.has(dep)) visit(dep)
    path.pop()
    state.set(node, 2)
  }
  for (const pkg of graph.keys()) visit(pkg)
}

// ── ARCH-3 — the union and the composition root agree, in BOTH directions ────────────────────────────
/** The quoted keys of the `const legs: ToolLegs = { … }` object literal at the composition root. Parsed
 *  from source (not dist) so the check runs before a build; anchored on the exact declaration so a second
 *  legs-like literal elsewhere cannot satisfy it. */
function boundLegs() {
  if (!existsSync(COMPOSITION_ROOT)) {
    note(`ARCH-3 composition root missing: ${COMPOSITION_ROOT} — there MUST be exactly one leg-binding site`)
    return null
  }
  // STRIP FIRST, THEN LOCATE. The order is the whole point and it used to be the other way round: the
  // literal was found and brace-matched over RAW text and only the resulting SLICE was stripped, so the
  // comment above the strip claimed a protection the code did not have. A `}` in prose inside the literal
  // — `// the handler dispatches on legs[tool] } and never checks membership` is the shape wire.ts invites —
  // drove the depth counter to zero early, `end` landed on the comment, and every leg BELOW that line fell
  // outside the block. A bound-but-undeclared ghost leg there is invocable over MCP and invisible here:
  // exit 0. Reproduced on a fixture where the same ghost leg without the comment correctly fails.
  //
  // Blanking is offset-preserving, so `src` and the located offsets still describe the same bytes; the only
  // thing that changed is that braces, quotes and `...` inside comments are no longer read as syntax. The
  // `indexOf` anchor is stripped too, which is a second small gain: a commented-out `const legs: ToolLegs`
  // can no longer be mistaken for the binding site.
  const src = stripComments(readFileSync(COMPOSITION_ROOT, "utf8"), "wire.ts")
  const start = src.indexOf("const legs: ToolLegs = {")
  if (start < 0) {
    note(`ARCH-3 composition root has no \`const legs: ToolLegs = {\` binding block (${COMPOSITION_ROOT})`)
    return null
  }
  // Brace-match from the literal's opening brace so nested objects/arrow bodies do not truncate the scan.
  //
  // STILL UNCOVERED, and stated rather than left to be discovered: this counter is comment-aware now but
  // not STRING-aware. A `}` inside a string or template INSIDE the legs literal can still close the block
  // early. Measured on the real wire.ts today: the located block is byte-identical before and after this
  // change and no leg hides behind such a brace, so it is a latent gap, not a live one. Closing it needs
  // the object literal to come from the AST rather than from a bracket count — a different change from
  // this one, and not one to smuggle in alongside a correctness fix.
  const open = src.indexOf("{", start)
  let depth = 0
  let end = -1
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}" && --depth === 0) {
      end = i
      break
    }
  }
  if (end < 0) {
    note("ARCH-3 composition root: unbalanced braces in the legs binding block")
    return null
  }
  // Already stripped above, so this is a plain cut. `wire.ts` is ~70% comment by volume, which is why every
  // scan below — bracket walk, `^\s*` key anchor, computed-key probe — needs prose to have stopped being syntax.
  const block = src.slice(open, end)

  // A SPREAD or a COMPUTED key AT THE TOP LEVEL of the literal hides a leg from this scan while leaving it
  // fully invocable — the handler dispatches on `legs[tool]` with no membership check, so a spread-in leg is
  // reachable over MCP with the gate green. Demonstrated on this tree.
  //
  // DEPTH MATTERS: a conditional spread inside a NESTED option object (`...(cfg.x !== undefined ? … : {})`,
  // which wire.ts legitimately uses in a seam config) is not a leg and must not fire. A depth-blind check
  // reports it and cries wolf — which is exactly what the first revision of this check did.
  let nest = 0
  for (let i = 0; i < block.length; i++) {
    const c = block[i]
    if (c === "{" || c === "[" || c === "(") nest++
    else if (c === "}" || c === "]" || c === ")") nest--
    else if (nest === 1 && block.startsWith("...", i)) {
      note(
        "ARCH-3 the leg binding block contains a top-level SPREAD (`...`): the bound set cannot be determined statically, and a spread-in leg is invocable while invisible to this gate. Bind every leg with a literal quoted key.",
      )
      break
    }
  }
  if (/^\s*\[[^\]]+\]\s*:/m.test(block)) {
    note(
      "ARCH-3 the leg binding block contains a COMPUTED key (`[expr]:`): the bound set cannot be determined statically. Bind every leg with a literal quoted key.",
    )
  }
  // `[a-z0-9-]`, not `[a-z-]`. The digit-blind class was the SAME defect as the specifier grammar one
  // function away, with the same consequence in the same direction: `'atlas-v2'` bound here matched nothing,
  // so the leg was absent from the returned set, absent from ARCH-3/5's bound-but-undeclared check, and
  // fully invocable — `legs[tool]` dispatches with no membership test. Exit 0 on a ghost. (The other
  // direction is loud and was never the risk: a SURFACE tool with a digit would have been reported as
  // typed-but-unbound.)
  return new Set([...block.matchAll(/^\s*['"](atlas-[a-z0-9-]+)['"]\s*:/gm)].map((m) => m[1]))
}

/** [WP-10.A5.TOOLS binding fix, kind (a)] The bare (unquoted) top-level keys of the `composeRuntime` return
 *  object literal in `COMPOSE_ROOT` — where the compose-planner doors (`anchors`/`slots`/`draft`/`check`)
 *  are actually threaded (`compose.ts`, NOT `wire.ts`). Located the same way `boundLegs` locates the `legs`
 *  literal: strip comments first (so a `}`/`:` in prose cannot be mistaken for syntax), anchor on the
 *  `composeRuntime`'s distinctive first bound field (`handler: assembleHandler(config)`, stable since
 *  WP-7.26), then brace-match from the literal's own opening brace. `null` ⇒ the anchor moved and this
 *  parse needs updating — reported, never silently treated as "nothing bound". */
function boundComposeFields() {
  if (!existsSync(COMPOSE_ROOT)) {
    note(
      `ARCH-3 compose root missing: ${COMPOSE_ROOT} — the compose-planner doors (anchors/slots/draft/check) have nowhere to bind`,
    )
    return null
  }
  const src = stripComments(readFileSync(COMPOSE_ROOT, "utf8"), "compose.ts")
  const anchor = /return\s*\{\s*handler\s*:\s*assembleHandler\s*\(\s*config\s*\)/
  const m = anchor.exec(src)
  if (m === null) {
    note(
      `ARCH-3 compose root: could not locate composeRuntime's \`return { handler: assembleHandler(config), … }\` literal (${COMPOSE_ROOT}) — the binding anchor moved, update boundComposeFields()`,
    )
    return null
  }
  const start = m.index + m[0].indexOf("{")
  let depth = 0
  let end = -1
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}" && --depth === 0) {
      end = i
      break
    }
  }
  if (end < 0) {
    note("ARCH-3 compose root: unbalanced braces in the composeRuntime return literal")
    return null
  }
  const block = src.slice(start, end)
  // ONE depth-aware pass does both the spread scan AND the key scan — [FIX 2, cold-review gate-integrity]
  // the key scan used to be a SEPARATE, depth-BLIND regex (`/^\s*ident\s*:/gm`) that matched a line-start
  // `ident:` at ANY nesting depth inside the block, not just the literal's own top-level fields. A NESTED
  // key (`real: { phantom: 1 }`) then satisfied a `READ_SURFACE` member named `phantom` even though
  // `phantom` is never an actual returned dispatch field — `composeRuntime` never binds it to anything a
  // caller can reach. Keys are now captured ONLY at `nest === 1` (immediately inside the block's own opening
  // brace), the SAME depth the spread scan already anchors on, so both share one brace-depth counter and
  // cannot drift apart from each other.
  //
  // The spread carve-out is unchanged: a nested conditional spread (`...(cond ? {…} : {})`) is legitimate
  // here (compose.ts uses exactly that shape for `readRefusal`/`readAdvisory`) and still excluded by the
  // `...(` check; only a BARE top-level spread — which would hide a field from this scan the same way it
  // hides a leg in `boundLegs` — is reported.
  let nest = 0
  const fields = new Set()
  for (let i = 0; i < block.length; i++) {
    const c = block[i]
    if (nest === 1) {
      // A line-start (mid-string) `ident:` reached ONLY at depth 1 — the literal's own top-level key.
      const bol = i === 0 || block[i - 1] === "\n"
      if (bol) {
        const m = /^[ \t]*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/.exec(block.slice(i))
        if (m !== null) fields.add(m[1])
      }
    }
    if (c === "{" || c === "[" || c === "(") nest++
    else if (c === "}" || c === "]" || c === ")") nest--
    else if (nest === 1 && block.startsWith("...", i) && !block.startsWith("...(", i)) {
      note(
        "ARCH-3 compose root: the composeRuntime return literal contains a bare (non-conditional) top-level SPREAD — the bound field set cannot be determined statically. Bind every field with a literal key.",
      )
    }
  }
  return fields
}

/** [WP-10.A5.TOOLS binding fix, kind (b)] `COMMAND_LEG` from `CLI_MAP` (`cli/src/map.ts`) — the CLI's
 *  command→leg map. `doctor`/`node` are commands that are "second projections" of `atlas-query`
 *  (`COMMAND_LEG['doctor'] === COMMAND_LEG['node'] === 'atlas-query'`): intercepted before the handler, but
 *  reading off the SAME bound `atlas-query` leg, never a leg of their own. Parsed from source (comment-
 *  stripped, same discipline as `boundLegs`/`boundComposeFields`) so this runs before a build too. */
function commandLegMap() {
  if (!existsSync(CLI_MAP)) {
    note(`ARCH-3 CLI command map missing: ${CLI_MAP} — the query-projection doors (doctor/node) cannot be verified`)
    return null
  }
  const src = stripComments(readFileSync(CLI_MAP, "utf8"), "map.ts")
  const start = src.indexOf("export const COMMAND_LEG")
  if (start < 0) {
    note(`ARCH-3 CLI command map: no \`export const COMMAND_LEG\` binding found (${CLI_MAP})`)
    return null
  }
  const open = src.indexOf("{", start)
  let depth = 0
  let end = -1
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}" && --depth === 0) {
      end = i
      break
    }
  }
  if (end < 0) {
    note("ARCH-3 CLI command map: unbalanced braces in the COMMAND_LEG binding block")
    return null
  }
  const block = src.slice(open, end)
  const map = new Map()
  // The key is EITHER a bare identifier (`doctor:`) or a QUOTED one (`'test-vacuities':`), and the mapped
  // value accepts either quote delimiter. A hyphenated
  // multi-word command name is not a legal bare JS property key, and `COMMAND_LEG` already carries several
  // (`test-vacuities`, `verify-fact`, `verify-store`, `derive-relations`) before this optional-quote leg
  // existed. None of THOSE happened to be a `READ_SURFACE` member, so the blind spot never fired — a
  // hyphenated command that IS a `READ_SURFACE` member (CAMPAIGN-11's memory read doors, WP-11.W8) is the
  // first to need kind (b) through a quoted key, and the fix is general: require matching quote delimiters
  // when present, never assume one style.
  for (const cm of block.matchAll(/^\s*(['"]?)([a-zA-Z_$][a-zA-Z0-9_$-]*)\1\s*:\s*(['"])([^'"]+)\3/gm)) {
    map.set(cm[2], cm[4])
  }
  return map
}

/** [WP-10.A5.TOOLS binding fix] A READ_SURFACE token (`atlas-anchors`, …) is BOUND iff it satisfies kind
 *  (a), (b), or (c) — see the header note beside `COMPOSE_ROOT`/`CLI_MAP`. `legs` is `boundLegs()`'s result
 *  (kind (c)); `composeFields` is `boundComposeFields()`'s (kind (a)); `cmdLeg` is `commandLegMap()`'s (kind
 *  (b), resolved against `legs` — a command that maps to an UNBOUND Tool does not count). All three inputs
 *  may be `null` (their own parse already `note()`d why) — a `null` input contributes ZERO bindings, never a
 *  free pass, so a member that could only be verified through a missing/moved anchor still reds, honestly.
 */
function boundReadDoor(token, legs, composeFields, cmdLeg) {
  const bare = token.replace(/^atlas-/, "") // 'atlas-anchors' → 'anchors', 'atlas-doctor' → 'doctor'
  if ((legs ?? new Set()).has(token)) return true // (c) direct Tool leg
  if ((composeFields ?? new Set()).has(bare)) return true // (a) compose-planner field
  // (b) query-projection via the CLI's command→leg map — EXACT-MATCH onto `atlas-query`, the ONE read
  // oracle `doctor`/`node` are documented as projecting onto. [FIX 1, cold-review gate-integrity] Checking
  // only "the mapped leg is SOME bound leg" (no name check) let `COMMAND_LEG` project a READ_SURFACE member
  // onto a bound WRITE leg (e.g. `atlas-emit`) and still pass — the door would then secretly route to a
  // governed write door while the surface pin calls it read-only. Do NOT weaken this to "not in
  // WRITE_PATHS": the contract this kind documents is specifically "reads off atlas-query", not merely
  // "reads off something that isn't a write door" — a THIRD read-ish Tool added later must not silently
  // qualify either.
  const command = cmdLeg?.get(bare)
  if (command === "atlas-query" && (legs ?? new Set()).has(command)) return true
  return false
}

async function checkSurface(legs) {
  let mod
  try {
    mod = await import(join(PKGS, "tools", "dist", "src", "index.js"))
  } catch {
    note("ARCH-5 cannot import the built tool surface (packages/tools/dist) — run `npm run typecheck` first")
    return
  }

  const governance = [...(mod.GOVERNANCE_SURFACE ?? [])]
  const write = [...(mod.WRITE_PATHS ?? [])]
  // READ_SURFACE absent ⇒ empty, so the checks below hold vacuously until the constant lands (WP-10.A5.TOOLS
  // landed it — 6 members, three binding kinds, see `boundReadDoor`).
  const read = [...(mod.READ_SURFACE ?? [])]
  // `boundComposeFields`/`commandLegMap` each parse a SEPARATE source file (`compose.ts` / `cli/src/map.ts`)
  // that a miniature/fixture tree — or a real tree with no READ_SURFACE member yet — has no reason to carry.
  // Computed LAZILY, only when there is an actual READ_SURFACE member to verify, so their own "file missing"
  // diagnostics never fire on a tree that legitimately has nothing for them to check (an empty READ_SURFACE
  // is not itself a violation — ARCH-6/7 already treat it as vacuous, consistent with that).
  const composeFields = read.length > 0 ? boundComposeFields() : null
  const cmdLeg = read.length > 0 ? commandLegMap() : null

  const union = new Set([...governance, ...read])

  // ARCH-6 — disjoint, and WRITE_PATHS ⊆ GOVERNANCE_SURFACE.
  for (const t of read) {
    if (governance.includes(t)) note(`ARCH-6 partition violated: '${t}' is in BOTH GOVERNANCE_SURFACE and READ_SURFACE`)
    if (write.includes(t)) note(`ARCH-6 authority violated: '${t}' is in READ_SURFACE and in WRITE_PATHS`)
  }
  for (const t of write) {
    if (!governance.includes(t)) note(`ARCH-6 authority violated: write path '${t}' is not in GOVERNANCE_SURFACE`)
  }

  // ARCH-5 — the surface constants vs the bound legs (legs are resolved by the caller so ARCH-3 runs
  // even when dist is absent — an earlier revision nested it here, so a missing build silently skipped it).
  // GOVERNANCE_SURFACE members are checked directly against `legs` (kind (c), unchanged). READ_SURFACE
  // members are checked via `boundReadDoor` — bound iff kind (a), (b), OR (c) (WP-10.A5.TOOLS).
  if (legs !== null) {
    for (const t of governance) {
      if (!legs.has(t))
        note(
          `ARCH-3/5 '${t}' is declared in the tool surface but has NO bound leg at the composition root — a typed-but-unbound door is a hole`,
        )
    }
    for (const t of read) {
      if (!boundReadDoor(t, legs, composeFields, cmdLeg)) {
        note(
          `ARCH-3/5 '${t}' is declared in READ_SURFACE but has NO binding — checked all three kinds: not a compose-planner field (adapter-io/src/compose.ts), not a query-projection via cli/src/map.ts's COMMAND_LEG onto a bound atlas-query leg, and not a direct wire.ts leg. A typed-but-unbound door is a hole.`,
        )
      }
    }
    for (const t of legs) {
      if (!union.has(t))
        note(
          `ARCH-3/5 leg '${t}' is bound at the composition root but is in NO surface constant — a bound-but-undeclared leg is invocable and invisible to every surface pin`,
        )
    }
  }

  // ARCH-7 — the measured budget.
  if (union.size > TOOL_BUDGET) {
    note(
      `ARCH-7 static surface budget exceeded: ${union.size} tools > ${TOOL_BUDGET}. Tool-selection accuracy degrades sharply past ~30 (see reference/atlas-architecture.md §2.2). Move growth to the dynamic scope-scoped projection (ARCH-8) rather than raising this number.`,
    )
  }

  return {
    governance: governance.length,
    read: read.length,
    total: union.size,
    readAbsent: mod.READ_SURFACE === undefined,
  }
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────────
// ORDER IS THE CONTRACT. The violation list is printed in push order, so the verdict is only comparable
// across revisions if the notes go in at the same points. `canonicalRanks` used to call `note()` itself;
// a library cannot reach into its caller's accumulator, so it returns its notes and they are spliced in
// HERE — the same position, before `checkLayers`. Verified byte-identical on this tree, on a tree carrying
// a deliberate `tools → adapter-io` inversion (4 violations, same order), and on a missing root.
const { graph, undeclared, opaque } = workspaceGraph(PKGS)
const { ranks: rank, notes: rankNotes } = canonicalRanks(ARCHITECTURE_DOC, new Set(graph.keys()), RING_ORDER)
for (const n of rankNotes) note(n)
checkLayers(graph, rank)

// A source import that no manifest declares is a real edge the build resolves by workspace hoisting. It is
// not itself a layer violation (the direction check above already ranks it), but it means the manifest is
// not a faithful description of the graph — report it so the drift is visible rather than load-bearing.
for (const u of undeclared) note(`ARCH-1 undeclared edge: ${u} — the manifest does not describe the real graph`)
// An unresolvable dynamic specifier defeats every static check in this gate, in the inner layers where it
// matters. Refuse it there rather than pretend the scan was complete.
for (const o of opaque) {
  const pkg = o.slice(0, o.indexOf("/"))
  if ((rank?.get(pkg) ?? Infinity) <= (rank?.get("tools") ?? Infinity)) {
    note(
      `ARCH-1 non-literal dynamic import in an inner layer — statically unresolvable, so this gate cannot see where it points: ${o}`,
    )
  }
}

const legs = boundLegs()
const surface = await checkSurface(legs)

if (fail.length > 0) {
  console.error("layer-guard: FAIL\n")
  for (const f of fail) console.error(`  ✗ ${f}`)
  console.error(`\n${fail.length} violation(s). Contract: docs/reference/atlas-architecture.md`)
  process.exit(1)
}

// The success line states ONLY what was checked. It deliberately does NOT claim "advertised ≡ invocable":
// this gate never reads `mcp-server/src/server.ts`, so the ADVERTISED set is out of its scope — it compares
// the surface CONSTANTS against the bound legs. Overstating that was a real defect in the first version.
console.log(
  `layer-guard: OK — ${graph.size} packages ranked + acyclic, 0 layer inversions (manifest ∪ source imports); ` +
    `surface constants ${surface?.total ?? "?"}/${TOOL_BUDGET} ` +
    `(${surface?.governance ?? "?"} governance + ${surface?.read ?? 0} read) ≡ bound legs.` +
    (surface?.readAbsent === true
      ? "\n  (READ_SURFACE not yet exported — its partition is DECLARED UNCOVERED, not verified.)"
      : ""),
)
