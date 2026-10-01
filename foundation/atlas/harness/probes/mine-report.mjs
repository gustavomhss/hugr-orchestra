// harness/probes/mine-report.mjs — parse the ledger a genesis run prints: its own stdout.
//
// Split from `genesis-output-probe.mjs` along the seam the product itself draws (`cli/src/mine-render.ts`
// is a separate file for the same reason): reading a durable store and reading a rendered report are two
// different acts, and only one of them is about bytes that survive the process.
//
// ── WHY THIS FILE HAS TO EXIST AT ALL — CORRECTED (bench D2, 2026-08-11) ────────────────────────────────
// This header used to say "a genesis run leaves NO durable record of which sites it visited". That was true
// when it was written and is now STALE for the run's OWN OUTPUT: GEN-8/GEN-12g
// (`packages/genesis/src/coverage.ts`, `packages/cli/src/mine-render.ts` — `coverageLines` / `siteLine`)
// added a per-site `RunCoverage` ledger, and a finished `atlas mine` pass now prints one `site: {...}` JSON
// row per PLANNED site, naming its `outcome` (`seeded` / `abstained` / `unrecorded` / `interrupted` /
// `unvisited`). A site that ABSTAINED and a site that was silently DROPPED are therefore no longer
// indistinguishable in what the run prints — see `docs/reference/commands/mine.md` §"The coverage ledger".
//
// What is STILL true, and is the reason this file exists rather than reading `.atlas/` directly: the
// `.atlas/` STORE ITSELF carries NONE of this. `RunCoverage` rides on the in-process `GenesisReport` and is
// never written to a sidecar — it reaches the world only as stdout prose. So the per-site ledger is durable
// only for a caller that captured the run's stdout; a store consulted on its own still cannot answer "which
// sites did this run visit, and with what outcome". That half of the old claim stands, restated precisely
// instead of overbroadly.
//
// The three aggregate lines parsed by `parseMineReport` are the ones `docs/reference/commands/mine.md` pins
// verbatim; the `site:` rows parsed by `parseSiteRows` are the coverage block the same page pins. Parsing
// rendered output is a weak contract and is treated as one throughout: an unparseable report is reported as
// such, never silently read as zeroes or as an empty ledger.

/** The `atlas mine` header line — the report's own count of what it seeded. */
const SEEDED = /^genesis: seeded (\d+) candidate fact\(s\); ratified (\d+)$/m
/** The GEN-13 cost line. `budgetSpent` counts SITES, one unit per completed site (`run-controller.ts`). */
const COST = /^cost: llmCalls (\d+) · budgetSpent (\d+)$/m
/** The `mineWhyEmpty` branch where the structural pass yielded no site at all. */
const ZERO_SITES = /^mine: (\d+) candidate facts — 0 sites visited\b/m
/** Every other branch: `mine: <k> candidate facts — <m> site(s) visited …`. */
const VISITED = /^mine: (\d+) candidate facts — (\d+) site\(s\) visited\b/m
/** The ONE branch whose prose accounts for the abstentions — the only place the residual is attributable. */
const ALL_ABSTAINED = /site\(s\) visited and every one abstained/
/** The `coverageLines` verdict line (`reconcile(...).why`), always present when `mine-render.ts` prints. */
const COVERAGE_VERDICT = /^coverage: (.*)$/m
/** One `siteLine` row: a fixed `site: ` prefix, then single-line JSON (`mine-render.ts` `siteLine`). Anchored
 *  to line start/end so a `whyNot`/`note` string that happens to embed the literal text `site: {` cannot be
 *  mistaken for a second row — `siteLine` always emits exactly one JSON object per printed line. */
const SITE_ROW = /^site: (\{.*\})$/gm

/** The `SiteOutcome.outcome` vocabulary, transcribed from `packages/genesis/src/types.ts:148-179` — a row
 *  whose `outcome` is outside this set was not written by `siteLine` and is reported as malformed, not
 *  silently accepted. */
const OUTCOMES = new Set(["seeded", "abstained", "unrecorded", "interrupted", "unvisited"])

/**
 * Parse a captured `atlas mine` stdout — the AGGREGATE legs (unchanged RETURN SHAPE; existing callers, e.g.
 * `genesis-output-probe.mjs` GOC-8, read exactly these five fields).
 *
 * MEASURED GAP, FIXED HERE (bench D2, 2026-08-11): the "mine: … site(s) visited …" line this used to require
 * unconditionally is **only ever printed on an EMPTY pass** — `mineWhyEmpty` (`mine-render.ts`) returns
 * `null`, and `foldVerdict` prints NOTHING, the instant `r.seeded.length > 0`. So a run that actually seeded
 * a fact (the case this probe most needs to read, driving `bench-driver.mjs`'s manifest) used to come back
 * `undefined` here — unparseable — even though the report was complete and well-formed. The fix is not an
 * inference: `budgetSpent` (from the cost line — one unit per completed site) and `seeded` (from the header
 * — the exact number `mineOutcome.facts` is built from) are the SAME two counts the missing line would have
 * echoed, so `sites`/`candidates` are read off THEM instead when a run seeded at least one fact. A run that
 * both seeded nothing AND carries no "mine:" line is still refused as unparseable — that combination has no
 * reading that isn't a guess.
 *
 * Returns `undefined` when the header/cost lines are absent, or seeded nothing and carries no "mine:" line
 * either — a report this cannot read is not a run it can vouch for, and answering `{seeded: 0, sites: 0}`
 * for an unparseable file would be the same "corrupt read as empty" amplification `promote.md` refuses one
 * door over.
 */
export function parseMineReport(text) {
  const seededLine = SEEDED.exec(text)
  const cost = COST.exec(text)
  if (seededLine === null || cost === null) return undefined
  const seeded = Number(seededLine[1])
  const zero = ZERO_SITES.exec(text)
  const visited = VISITED.exec(text)
  if (zero === null && visited === null) {
    if (seeded === 0) return undefined // no "mine:" line AND nothing seeded — genuinely unparseable
    return {
      seeded,
      ratified: Number(seededLine[2]),
      llmCalls: Number(cost[1]),
      budgetSpent: Number(cost[2]),
      sites: Number(cost[2]), //     the "mine:" line's own site count IS `budgetSpent` on every branch
      candidates: seeded, //         the "mine:" line's own candidate count IS `r.seeded.length` == `seeded`
      allAbstained: false, //        a seeded pass is definitionally not "every site abstained"
    }
  }
  return {
    seeded,
    ratified: Number(seededLine[2]),
    llmCalls: Number(cost[1]),
    budgetSpent: Number(cost[2]),
    sites: zero !== null ? 0 : Number(visited[2]),
    candidates: Number(zero !== null ? zero[1] : visited[1]),
    /** Did the run's own prose account for every visited site as an abstention? */
    allAbstained: ALL_ABSTAINED.test(text),
  }
}

/**
 * Parse the COVERAGE VERDICT line — `reconcile(...).why`, verbatim text after the `coverage: ` prefix.
 * `undefined` when the report carries no such line at all (a pre-ledger report, or unrelated text) — that
 * is UNEVALUABLE, never read as "coverage closed" or "coverage failed".
 */
export function parseCoverageVerdict(text) {
  const m = COVERAGE_VERDICT.exec(text)
  return m === null ? undefined : m[1]
}

/**
 * Parse every `site: {...}` row into one object per PLANNED site — the per-site `RunCoverage` ledger this
 * header now documents. A malformed row (present prefix, unparseable/wrong-shape JSON) is collected under
 * `malformed` by its raw line rather than silently dropped, so a caller can tell "this run visited 0 sites"
 * from "this run's ledger did not parse".
 *
 * Each well-formed row is returned AS PRINTED (`rank`, `outcome`, `kind`, `path`, plus whichever of
 * `facts` / `whyNot` / `note` / `cause` that outcome carries — see `siteLine`, `mine-render.ts`), so a
 * caller joining against the coverage rows never has to re-derive the shape `mine-render.ts` already fixed.
 *
 * @returns {{ rows: object[], malformed: string[] }}
 */
export function parseSiteRows(text) {
  const rows = []
  const malformed = []
  for (const m of text.matchAll(SITE_ROW)) {
    const raw = m[1]
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      malformed.push(m[0])
      continue
    }
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      typeof parsed.rank !== "number" ||
      typeof parsed.outcome !== "string" ||
      !OUTCOMES.has(parsed.outcome) ||
      typeof parsed.kind !== "string" ||
      typeof parsed.path !== "string"
    ) {
      malformed.push(m[0])
      continue
    }
    rows.push(parsed)
  }
  return { rows, malformed }
}

/**
 * The FULL parsed report: the three aggregate legs (`parseMineReport`) plus the coverage verdict
 * (`parseCoverageVerdict`) plus the per-site ledger (`parseSiteRows`) — the one call a caller that wants
 * everything this file knows how to read needs. `undefined` when even the aggregate legs do not parse (the
 * same refusal `parseMineReport` makes); the coverage verdict and site rows are ABSENT-TOLERANT on top of
 * that (a pre-ledger report has aggregate lines but no `coverage:`/`site:` lines at all, and that reads as
 * "no ledger", never as "0 sites").
 */
export function parseFullMineReport(text) {
  const agg = parseMineReport(text)
  if (agg === undefined) return undefined
  const coverageVerdict = parseCoverageVerdict(text)
  const { rows: siteRows, malformed: malformedSiteRows } = parseSiteRows(text)
  return { ...agg, coverageVerdict, siteRows, malformedSiteRows }
}
