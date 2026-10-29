// @atlas/persist — src/host-adapter.ts  (forge-agnostic host adapter — PERSIST-8)
//
// One impl per host abstracts the forge (the adapter is the SOLE caller of the low-level `Forge` port).
// Provenance serializes as an RFC-822-ish trailer (canonical) + a JSON `refs/notes/orchestra` note
// (mutable overlay); the PR surface is a PROJECTION. `readCommit`/`readPR` are TOTAL — absence ⇒ `null`.

import type { Dossier, Metering, PrAttach, Trailer, VersionDelta } from "./types.js"
import { asHash } from "@atlas/kernel"

/**
 * The forge-agnostic host adapter surface (PERSIST-8), one impl per forge. `readCommit`/`readPR` are
 * TOTAL — a missing note/attachment returns `null`, never throws (atlas-persist:113-114). `sha` is a git
 * commit SHA (a git object id) — deliberately NOT the branded CAS `Hash`, so it is typed `string`.
 */
export interface HostAdapterApi {
  /** Write the trailer block + `refs/notes/orchestra` note carrying the dossier. (atlas-persist:100) */
  attachToCommit(sha: string, dossier: Dossier): void
  /** Read back the note/trailer; absence ⇒ `null`, never throws. (atlas-persist:101) */
  readCommit(sha: string): Dossier | null
  /** Render PR-memory/logbook/knowledge-delta onto the host PR. (atlas-persist:102) */
  attachToPR(prId: string, prAttach: PrAttach): void
  /** Read back the projection; absence ⇒ `null`, never throws. (atlas-persist:103) */
  readPR(prId: string): PrAttach | null
}

/** The `refs/notes/orchestra` ref the mutable-overlay dossier note is written to (atlas-persist:17). */
export const NOTES_REF = "refs/notes/orchestra"
/** The push refspec the adapter configures so provenance notes leave the local repo (REQ-PERSIST-8-b). */
export const NOTES_PUSH_REFSPEC = "refs/notes/*:refs/notes/*"
/** The provenance tag the adapter stamps on EVERY forge call — the audit of "0 direct forge calls" keys on it. */
export const ADAPTER_VIA = "host-adapter"

/** One recorded forge interaction, tagged with the caller that made it (REQ-PERSIST-8-a audit). */
export interface ForgeCall {
  readonly op: string
  readonly via: string
}

/**
 * The low-level forge PORT — the SINGLE seam a `HostAdapter` touches, one impl per host (GitHub/GitLab/…).
 * git-side ops (`writeCommit`/`readTrailer`/`readNote`) carry the commit trailer + note that a clone copies;
 * host-side ops (`writePR`/`readPRBody`) render/read the PR projection that a bare clone does NOT fetch.
 * Every op takes a `via` tag so a leak (a caller reaching the forge directly) is auditable.
 */
export interface Forge {
  writeCommit(sha: string, trailer: string, note: string, via: string): void
  readTrailer(sha: string, via: string): string | null
  readNote(sha: string, via: string): string | null
  writePR(prId: string, body: string, via: string): void
  readPRBody(prId: string, via: string): string | null
  configurePush(refspec: string, via: string): void
  pushRefspecs(): readonly string[]
  hostSidePRCount(): number
  bareClone(): Forge
  calls(): readonly ForgeCall[]
}

/** A `HostAdapterApi` that also exposes the refspec configuration step (REQ-PERSIST-8-b). */
export interface ConfigurableHostAdapter extends HostAdapterApi {
  configurePushRefspec(): void
}

/** Serialize the canonical trailer as an RFC-822-ish `Key: value` block committed INTO the commit object. */
function serializeTrailer(t: Trailer): string {
  return [
    `WP: ${t.WP}`,
    `Model: ${t.Model}`,
    `Gates: ${t.Gates}`,
    `Verdict: ${t.Verdict}`,
    `TranscriptSha: ${t.TranscriptSha}`,
    ...(t.Attempt === undefined ? [] : [`Attempt: ${t.Attempt}`]),
  ].join("\n")
}

/** Serialize the mutable-overlay part of the dossier (metering + knowledge-delta) as the JSON note payload. */
function serializeNote(d: Dossier): string {
  const overlay: { metering?: Metering; knowledgeDelta?: VersionDelta } = {}
  if (d.metering !== undefined) overlay.metering = d.metering
  if (d.knowledgeDelta !== undefined) overlay.knowledgeDelta = d.knowledgeDelta
  return JSON.stringify(overlay)
}

/** Parse the RFC-822-ish trailer block back to a `Trailer`; a missing/blank line yields an empty field, except
 *  `Attempt`, which stays absent so a trailer written before attempts existed round-trips unchanged. */
function parseTrailer(text: string): Trailer {
  const kv = new Map<string, string>()
  for (const line of text.split("\n")) {
    const i = line.indexOf(": ")
    if (i > 0) kv.set(line.slice(0, i), line.slice(i + 2))
  }
  return {
    WP: kv.get("WP") ?? "",
    Model: kv.get("Model") ?? "",
    Gates: kv.get("Gates") ?? "",
    Verdict: kv.get("Verdict") ?? "",
    TranscriptSha: asHash(kv.get("TranscriptSha") ?? ""),
    ...(kv.get("Attempt") === undefined ? {} : { Attempt: kv.get("Attempt") as string }),
  }
}

/**
 * Reconstruct the `Dossier` from the canonical trailer block + the JSON overlay note. The trailer is the
 * canonical backbone (PERSIST-13): if it is absent there is no dossier to reconstruct (`null`). Total —
 * a malformed note is ignored, never thrown.
 */
function deserializeDossier(trailerText: string | null, noteJson: string | null): Dossier | null {
  if (trailerText === null) return null
  const dossier: { trailer: Trailer; metering?: Metering; knowledgeDelta?: VersionDelta } = {
    trailer: parseTrailer(trailerText),
  }
  if (noteJson !== null) {
    try {
      const overlay = JSON.parse(noteJson) as { metering?: Metering; knowledgeDelta?: VersionDelta }
      if (overlay.metering !== undefined) dossier.metering = overlay.metering
      if (overlay.knowledgeDelta !== undefined) dossier.knowledgeDelta = overlay.knowledgeDelta
    } catch {
      /* a malformed overlay note is ignored — the canonical trailer still reconstructs the dossier */
    }
  }
  return dossier
}

/** Parse the PR projection body back to a `PrAttach`; a malformed body yields `null` (total, never throws). */
function safeParsePR(body: string): PrAttach | null {
  try {
    return JSON.parse(body) as PrAttach
  } catch {
    return null
  }
}

/**
 * Build the one-per-host adapter over the low-level `Forge` port. Every forge interaction flows through
 * this object and is stamped `ADAPTER_VIA`, so `directForgeCalls` finds none in the happy path. Reads are
 * total (`null` on absence). `attachToPR`/`readPR` treat the host PR as a disposable projection.
 */
export function makeHostAdapter(forge: Forge): ConfigurableHostAdapter {
  return {
    attachToCommit(sha: string, dossier: Dossier): void {
      forge.writeCommit(sha, serializeTrailer(dossier.trailer), serializeNote(dossier), ADAPTER_VIA)
    },
    readCommit(sha: string): Dossier | null {
      const trailer = forge.readTrailer(sha, ADAPTER_VIA)
      const note = forge.readNote(sha, ADAPTER_VIA)
      if (trailer === null && note === null) return null
      return deserializeDossier(trailer, note)
    },
    attachToPR(prId: string, prAttach: PrAttach): void {
      forge.writePR(prId, JSON.stringify(prAttach), ADAPTER_VIA)
    },
    readPR(prId: string): PrAttach | null {
      const body = forge.readPRBody(prId, ADAPTER_VIA)
      return body === null ? null : safeParsePR(body)
    },
    configurePushRefspec(): void {
      forge.configurePush(NOTES_PUSH_REFSPEC, ADAPTER_VIA)
    },
  }
}

/** REQ-PERSIST-8-a audit: every forge call NOT stamped `ADAPTER_VIA` — a direct forge call bypassing the
 *  adapter (host coupling leaking outside the single adapter impl). Empty ⇒ forge-agnosticism holds. */
export function directForgeCalls(forge: Forge): readonly ForgeCall[] {
  return forge.calls().filter((c) => c.via !== ADAPTER_VIA)
}

/** REQ-PERSIST-8-b: does a configured push refspec carry the notes namespace (`refs/notes/*`)? */
export function pushCarriesNotes(forge: Forge): boolean {
  return forge.pushRefspecs().some((r) => r.startsWith("refs/notes/"))
}

// ── The PR record (merge-queue spec §4.5) ─────────────────────────────────────────────────────────────────────────
//
// The Orchestra host renders every card PR and bundle PR through this one module, reached through the boundary's
// `./record` entry, so no second renderer exists in the board. Maestro writes the judgment sections; the host fills
// the facts. Model spend never appears: the board keeps it, and a project repository may be public (§14 decision 6).

/** The card PR record. Strings are Markdown written by Maestro; every other field is a host fact. */
export interface PrRecord {
  readonly intent: string
  readonly change: { readonly text: string; readonly start: readonly string[] }
  readonly decisions: readonly string[]
  readonly notCovered: string
  readonly risk: { readonly level: RiskLevel; readonly breaks: string; readonly notice: string; readonly undo: string }
  /** Card keys; empty renders "none". */
  readonly followUps: readonly string[]
  readonly facts: {
    readonly files: number
    readonly added: number
    readonly removed: number
    readonly packages: readonly string[]
    /** The plan's `area`, set only when it differs from the real packages. */
    readonly area?: string
    readonly ownUnits: readonly { readonly unit: string; readonly skill: string }[]
  }
  readonly evidence: {
    readonly doneWhen: readonly { readonly line: string; readonly command: string; readonly result: string }[]
    readonly probe?: string
    readonly reviews: readonly {
      readonly kind: string
      readonly verdict: string
      readonly findings: readonly { readonly at: string; readonly text: string; readonly closed?: string }[]
    }[]
    readonly checks: readonly { readonly name: string; readonly state: string; readonly url?: string }[]
    readonly used: "as-user" | "unseen"
  }
  readonly cost: {
    readonly attempts: readonly { readonly n: number; readonly cause: string }[]
    readonly ciRuns: number
    readonly ciMinutes: number
    readonly wallMs: number
  }
  readonly lineage: {
    readonly card: string
    readonly epic?: string
    readonly dependsOn: readonly string[]
    readonly plan?: string
    readonly seats: readonly string[]
    readonly reviewer?: string
  }
  readonly integration: { readonly state: string; readonly bundle?: string; readonly testedOn?: string }
}

export type RiskLevel = "low" | "medium" | "high"

/** The bundle PR record (§6.2): its members' records plus the bundle's own facts. */
export interface BundleRecord {
  readonly members: readonly { readonly title: string; readonly head: string; readonly record: PrRecord }[]
  readonly testedOn: string
  readonly skew: number
  readonly ciRuns: number
  readonly ciMinutes: number
  readonly ejections: readonly { readonly card: string; readonly cause: string }[]
}

/** A card's PR body. Missing evidence renders as missing, so a record cannot overstate itself. */
export function renderPrRecord(record: PrRecord): string {
  const facts = record.facts
  const evidence = record.evidence
  const lineage = record.lineage
  return [
    "## Intent",
    record.intent,
    "## Change",
    record.change.text,
    `Start reading: ${record.change.start.map(code).join(", ") || "not given"}.`,
    `${facts.files} files, +${facts.added} −${facts.removed}. Packages: ${facts.packages.join(", ") || "none"}.` +
      (facts.area === undefined ? "" : ` Plan area: ${facts.area}.`),
    ...(facts.ownUnits.length === 0 ? [] : [`Read with: ${facts.ownUnits.map((u) => `[${u.unit}](${u.skill})`).join(", ")}.`]),
    "## Decisions",
    ...record.decisions.map((line) => `- ${line}`),
    "## Evidence",
    ...(evidence.doneWhen.length === 0
      ? ["Done when: missing."]
      : evidence.doneWhen.map((d) => `- ${d.line}: ${code(d.command)} ${d.result}`)),
    `Probe: ${evidence.probe ?? "missing"}.`,
    ...(evidence.reviews.length === 0
      ? ["Review: missing."]
      : evidence.reviews.flatMap((r) => [
          `- ${r.kind}: ${r.verdict}`,
          ...r.findings.map((f) => `  - ${code(f.at)} ${f.text} (${f.closed === undefined ? "open" : `closed: ${f.closed}`})`),
        ])),
    ...(evidence.checks.length === 0
      ? ["Checks: missing."]
      : ["| Check | State |", "|---|---|", ...evidence.checks.map((c) => `| ${cell(c.url === undefined ? c.name : `[${c.name}](${c.url})`)} | ${cell(c.state)} |`)]),
    evidence.used === "as-user" ? "Used as the user would." : "Unseen: not used as the user would.",
    "## Not covered",
    record.notCovered,
    "## Risk",
    `**${record.risk.level}.** ${record.risk.breaks} Noticed by: ${record.risk.notice} Undo: ${record.risk.undo}`,
    "## Follow-ups",
    ...(record.followUps.length === 0 ? ["None."] : record.followUps.map((key) => `- ${key}`)),
    "## Cost",
    `Attempts: ${record.cost.attempts.map((a) => `a${a.n} (${a.cause})`).join(", ") || "none"}. CI: ${record.cost.ciRuns} runs, ${record.cost.ciMinutes} min. Ready to queued: ${minutes(record.cost.wallMs)}.`,
    "## Lineage",
    [
      `Card ${lineage.card}`,
      ...(lineage.epic === undefined ? [] : [`epic ${lineage.epic}`]),
      `depends on ${lineage.dependsOn.join(", ") || "nothing"}`,
      ...(lineage.plan === undefined ? [] : [`plan ${lineage.plan}`]),
      `seats ${lineage.seats.join(", ") || "none"}`,
      `reviewer ${lineage.reviewer ?? "none"}`,
    ].join("; ") + ".",
    "## Integration",
    [record.integration.state, ...(record.integration.bundle === undefined ? [] : [`bundle ${record.integration.bundle}`]), ...(record.integration.testedOn === undefined ? [] : [`tested on ${code(record.integration.testedOn)}`])].join("; ") + ".",
    refsComment([{ card: lineage.card, attempts: record.cost.attempts.map((a) => a.n) }]),
  ].join("\n\n")
}

/** A bundle's PR body: one line per member, the highest member risk, summed cost, base and skew, and ejections. */
export function renderBundleRecord(bundle: BundleRecord): string {
  const records = bundle.members.map((m) => m.record)
  const risk = records.map((r) => r.risk.level).reduce<RiskLevel>((top, level) => (RISK.indexOf(level) > RISK.indexOf(top) ? level : top), "low")
  return [
    "## Members",
    "| Card | Title | Head | Risk | Intent |",
    "|---|---|---|---|---|",
    ...bundle.members.map((m) => `| ${cell(m.record.lineage.card)} | ${cell(m.title)} | ${code(m.head.slice(0, 12))} | ${m.record.risk.level} | ${cell(m.record.intent)} |`),
    `Highest risk: **${risk}**.`,
    "## Cost",
    `Attempts: ${records.reduce((sum, r) => sum + r.cost.attempts.length, 0)}. CI: ${records.reduce((sum, r) => sum + r.cost.ciRuns, bundle.ciRuns)} runs, ${records.reduce((sum, r) => sum + r.cost.ciMinutes, bundle.ciMinutes)} min.`,
    "## Integration",
    `Tested on ${code(bundle.testedOn)}, ${bundle.skew} commits behind the base.`,
    ...(bundle.ejections.length === 0 ? [] : ["Ejected:", ...bundle.ejections.map((e) => `- ${e.card}: ${e.cause}`)]),
    refsComment(records.map((r) => ({ card: r.lineage.card, attempts: r.cost.attempts.map((a) => a.n) }))),
  ].join("\n\n")
}

/** The cards and attempts a rendered body names; none when it has no refs comment or the comment is malformed. */
export function readPrRecordRefs(body: string): readonly { readonly card: string; readonly attempts: readonly number[] }[] {
  const match = /<!-- atlas-record:refs (.*?) -->/.exec(body)
  const refs = parseJsonOrUndefined(match?.[1] ?? "")
  if (!Array.isArray(refs)) return []
  return refs.filter(
    (ref): ref is { card: string; attempts: number[] } =>
      typeof ref === "object" && ref !== null && typeof ref.card === "string" && Array.isArray(ref.attempts) && ref.attempts.every(Number.isInteger),
  )
}

/** The trailer block a card's commit ends with: `WP`, `Attempt: a<n>` and whichever other trailer keys the host
 *  knows, in Atlas's key order. Core appends it to the commit message it writes, so nothing amends a commit
 *  afterwards. A block without `Model`, `Gates`, `Verdict` and `TranscriptSha` names the attempt file, which holds
 *  them, but `readCommit` does not read it as a dossier trailer. */
export function attemptTrailer(t: Pick<Trailer, "WP"> & Partial<Trailer>): string {
  return TRAILER_KEYS.flatMap((key) => (t[key] === undefined ? [] : [`${key}: ${t[key]}`])).join("\n")
}

/** The record port core's board binds (`Board.layerWith({ record })`): card body, bundle body, commit trailer. */
export const recordPort = { pr: renderPrRecord, bundle: renderBundleRecord, trailer: attemptTrailer }

/** The `WP:` lines a bundle's merge commit lists, one per member card. */
export function bundleTrailer(cards: readonly string[]): string {
  return cards.map((card) => `WP: ${card}`).join("\n")
}

/** The one HTTP call the writer makes, injectable so a test can answer it. Defaults to the global `fetch`. */
export type SendJson = (
  url: string,
  init: { readonly method: string; readonly headers: Record<string, string>; readonly body: string },
) => Promise<{ readonly status: number; json(): Promise<unknown> }>

/** The GitHub writer for host-opened PRs: `open` creates one and answers its number, `write` replaces its body. The
 *  token comes from `GITHUB_TOKEN` or `GH_TOKEN`; without one, or on an unexpected status, each call throws. */
export function githubPrWriter(slug: string, opts: { readonly send?: SendJson } = {}) {
  const send: SendJson = opts.send ?? ((url, init) => fetch(url, init))
  const call = async (method: string, path: string, body: unknown, expect: number) => {
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
    if (token === undefined || token === "") throw new Error("writing a PR needs GITHUB_TOKEN or GH_TOKEN")
    const response = await send(`https://api.github.com/repos/${slug}/pulls${path}`, {
      method,
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    if (response.status !== expect) throw new Error(`${method} ${slug} pulls${path} answered ${response.status}`)
    return response
  }
  return {
    async open(pr: { readonly head: string; readonly base: string; readonly title: string; readonly body: string; readonly draft: boolean }) {
      const created = (await (await call("POST", "", pr, 201)).json()) as { number?: unknown }
      if (typeof created.number !== "number") throw new Error(`GitHub created a PR on ${slug} without a number`)
      return created.number
    },
    async write(number: number, body: string) {
      await call("PATCH", `/${number}`, { body }, 200)
    },
  }
}

const RISK: readonly RiskLevel[] = ["low", "medium", "high"]
const TRAILER_KEYS = ["WP", "Model", "Gates", "Verdict", "TranscriptSha", "Attempt"] as const

function refsComment(refs: readonly { card: string; attempts: readonly number[] }[]): string {
  // A card key is free text, so `--` goes out as a JSON escape and the comment cannot end early.
  return `<!-- atlas-record:refs ${JSON.stringify(refs).replaceAll("--", "\\u002d\\u002d")} -->`
}

function code(text: string): string {
  return `\`${text.replaceAll("`", "'")}\``
}

function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ")
}

function minutes(ms: number): string {
  return `${Math.round(ms / 60_000)} min`
}

function parseJsonOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
