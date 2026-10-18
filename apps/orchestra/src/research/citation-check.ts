export * as ResearchCitationCheck from "./citation-check"

import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import type { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { Database } from "@orchestra/core/database/database"
import { ResearchQualifications } from "./qualifications"

export type Issue = { readonly citation: string; readonly reason: string }
export type Result = {
  readonly verdict: "pass" | "fail"
  readonly checked: { readonly evidence: number; readonly prose: number; readonly findings: number; readonly documents: number }
  readonly issues: readonly Issue[]
  readonly omitted: number
}

const URL_PATTERN = /https?:\/\/[^\s<>()[\]{}"'`]+/g
// A path, then `:line` or `:start-end`. URLs are removed and candidates filtered by `file` before use.
const PATH_PATTERN = /(?<![\w@~./\\:-])((?:[A-Za-z]:)?[\w@~./\\-]+):(\d+)(?:-(\d+))?(?!\d)/g
const FENCE_PATTERN = /(```|~~~)[\s\S]*?\1/g
// Top-level domains that are not common file extensions; `name.<tld>:<n>` without a slash is a host and port.
const HOSTS = new Set(["com", "org", "net", "io", "dev", "ai", "co", "edu", "gov", "info", "biz", "me", "us", "uk", "eu", "de",
  "local", "localhost", "internal", "lan", "cloud", "site", "xyz", "tech", "online", "example", "test", "invalid"])

/** Unavailable retained research fails closed: the parent sees unverified citations, never a silent pass. */
export const unavailable: Result = { verdict: "fail", checked: { evidence: 0, prose: 0, findings: 0, documents: 0 }, omitted: 0,
  issues: [{ citation: "retained research", reason: "this dispatch's retained research could not be read" }] }

/**
 * Host-side claim check, separate from synthesis. Reports every citation that does not resolve to this dispatch's own
 * retained research; it never edits or removes the author's text.
 */
export const check = Effect.fn("ResearchCitationCheck.check")(function* (
  records: ResearchRecords.Interface,
  binding: Research.Binding,
  card: Research.Card,
  prose: string,
): Effect.fn.Return<Result, Research.Error, Database.Service> {
  // Explicit-ID views resolve project-wide; this dispatch owns only entries admitted under its exact binding.
  const own = (yield* ResearchLedger.entries(binding, undefined, true))
    .filter((entry) => ResearchLedger.canonical(entry.data.binding) === ResearchLedger.canonical(binding))
  const sources = own.flatMap((entry) => entry.type === "research.source.admitted" ? [entry.data.receipt] : [])
  const retained = new Map(sources.map((receipt) => [ResearchLedger.canonical(receipt.ref), receipt]))
  const lines = new Map<string, number>()
  const read = (input: { action: "source"; ref: Research.SourceRef } | { action: "document"; ref: Research.DocumentRef }) =>
    drain(records, binding, input)

  const documents = yield* Effect.forEach(card.documentRefs, (ref) => Effect.gen(function* () {
    const published = own.flatMap((entry) => entry.type === "research.document.published" &&
      entry.data.receipt.ref.id === ref.id && entry.data.receipt.ref.revision === ref.revision ? [entry.data.receipt] : [])[0]
    if (!published) return { receipt: undefined, body: "",
      issues: [{ citation: `document ${ref.id}@${ref.revision}`, reason: "document not published by this dispatch" }] }
    return { receipt: published, body: yield* read({ action: "document", ref }), issues: [] }
  }))
  const owned = documents.flatMap((document) => document.receipt ? [{ receipt: document.receipt, body: document.body }] : [])

  // Card quotes are resolved against the retained bytes now. Finding evidence and document citations were resolved
  // against the same immutable, digest-checked bytes at admission, so only their ownership is checked here.
  const evidence = yield* Effect.forEach(card.evidenceRefs, (ref) => {
    const receipt = retained.get(ResearchLedger.canonical(ref.source))
    if (!receipt) return Effect.succeed([{ citation: label(ref), reason: "source not retained by this dispatch" }])
    return records.verifyEvidence(binding, ref).pipe(
      Effect.as([]),
      Effect.catch((error) => tolerate(ref, error, read({ action: "source", ref: ref.source })).pipe(
        Effect.map((reason) => reason ? [{ citation: label(ref, receipt), reason }] : []),
      )),
    )
  })
  const citations = owned.flatMap((document) => Object.entries(document.receipt.citations).flatMap((entry) =>
    retained.has(ResearchLedger.canonical(entry[1].source)) ? []
      : [{ citation: `document ${document.receipt.ref.id} [${entry[0]}]`, reason: "document citation not retained by this dispatch" }]))

  const refs = [...new Map([...card.findingRefs, ...owned.flatMap((document) => document.receipt.findingRefs)]
    .map((ref) => [`${ref.id}:${ref.revision}`, ref])).values()]
  const findings = refs.flatMap((ref) => {
    const citation = `finding ${ref.id}@${ref.revision}`
    const record = own.find((entry) => ResearchQualifications.ownFinding(entry, binding, ref))?.data.record
    if (!record || record.kind !== "finding") return [{ citation, reason: "finding not admitted by this dispatch" }]
    if (record.nature !== "hypothesis" && !record.evidence.length) return [{ citation, reason: "finding has no supporting evidence" }]
    if ([...record.evidence, ...record.contrary].some((item) => !retained.has(ResearchLedger.canonical(item.source))))
      return [{ citation, reason: "finding cites evidence not retained by this dispatch" }]
    return []
  })

  const cited = [...new Set([card.answer, prose, ...owned.map((document) => document.body)].flatMap(extract))]
  const unmapped = yield* Effect.forEach(cited, (citation) => Effect.gen(function* () {
    if (/^https?:/.test(citation)) {
      const target = url(citation)
      return sources.some((source) => source.origin.kind === "url" && target !== undefined && url(source.origin.uri) === target)
        ? [] : [{ citation, reason: "no retained source for this URL in this dispatch" }]
    }
    const match = /^(.*):(\d+)(?:-(\d+))?$/.exec(citation)
    if (!match) return []
    const file = normal(match[1])
    const start = Number(match[2])
    const end = Number(match[3] ?? match[2])
    const candidates = sources.filter((source) => source.origin.kind === "file" &&
      (normal(source.origin.uri) === file || normal(source.origin.uri).endsWith(`/${file}`)))
    if (!candidates.length) return [{ citation, reason: "no retained source for this path in this dispatch" }]
    const extents = candidates.flatMap((source) => source.observed?.lineStart
      ? [{ start: source.observed.lineStart, end: source.observed.lineEnd ?? source.observed.lineStart - 1 }] : [])
    if (start <= end && extents.some((extent) => extent.start <= start && end <= extent.end)) return []
    // A complete capture from the first byte has original coordinates equal to its retained lines.
    const counts = yield* Effect.forEach(candidates.filter((source) => !source.observed?.lineStart && source.complete &&
      (source.observed?.byteStart ?? 0) === 0), (source) => {
      const key = ResearchLedger.canonical(source.ref)
      const known = lines.get(key)
      if (known !== undefined) return Effect.succeed(known)
      return read({ action: "source", ref: source.ref }).pipe(
        Effect.map((text) => text.split(/\r\n|\n|\r/).length),
        Effect.orElseSucceed(() => 0),
        Effect.tap((count) => Effect.sync(() => lines.set(key, count))),
      )
    })
    if (start <= end && counts.some((count) => end <= count)) return []
    const captured = extents.map((extent) => `${extent.start}-${extent.end}`).join(", ")
    return [{ citation, reason: captured ? `line outside captured range (captured ${captured})` : "line outside captured range" }]
  }))

  const issues = [...new Map([...documents.flatMap((document) => document.issues), ...evidence.flat(), ...citations, ...findings, ...unmapped.flat()]
    .map((issue) => [`${issue.citation}\n${issue.reason}`, issue])).values()]
  return {
    verdict: issues.length ? "fail" : "pass",
    checked: { evidence: card.evidenceRefs.length + owned.reduce((sum, document) => sum + Object.keys(document.receipt.citations).length, 0),
      prose: cited.length, findings: refs.length, documents: card.documentRefs.length },
    issues: issues.slice(0, 32),
    omitted: Math.max(0, issues.length - 32),
  } satisfies Result
})

/** The compact block that travels to the parent with the qualification packet. */
export function format(result: Result) {
  const shown = result.issues.slice(0, 8)
  const hidden = result.issues.length - shown.length + result.omitted
  return [
    `Citation check: ${result.verdict}; checked evidence=${result.checked.evidence} prose=${result.checked.prose} findings=${result.checked.findings} documents=${result.checked.documents}; unverified=${result.issues.length + result.omitted}`,
    ...shown.map((issue) => `- ${clip(issue.citation, 160)}: ${issue.reason}`),
    ...(hidden > 0 ? [`- ${hidden} more unverified citation(s) in workResult.citationCheck`] : []),
  ].join("\n")
}

function extract(text: string) {
  const prose = text.replace(FENCE_PATTERN, "\n")
  // Code fences hold commands and configs; only an unmistakable path (one with a directory) cites there.
  const fenced = [...text.matchAll(FENCE_PATTERN)].flatMap((match) => paths(match[0])).filter((citation) => /[/\\]/.test(citation))
  return [...[...prose.matchAll(URL_PATTERN)].map((match) => match[0].replace(/[.,;:!?]+$/, "")), ...paths(prose), ...fenced]
}

function paths(text: string) {
  return [...text.replace(URL_PATTERN, " ").matchAll(PATH_PATTERN)].filter((match) => file(match[1]))
    .map((match) => `${match[1]}:${match[2]}${match[3] ? `-${match[3]}` : ""}`)
}

/** A file citation has a directory or a file extension, and is not a hostname or IP address followed by a port. */
function file(candidate: string) {
  if (/[/\\]/.test(candidate)) return true
  // No letter extension also covers bare hosts and IPv4 addresses (`localhost:8080`, `127.0.0.1:5432`).
  const extension = /\.([A-Za-z][\w-]*)$/.exec(candidate)?.[1]
  return extension !== undefined && !HOSTS.has(extension.toLowerCase())
}

function tolerate(ref: Research.EvidenceRef, error: Research.Error, text: Effect.Effect<string, Research.Error>) {
  if (error.code === "locator_ambiguous") return Effect.succeed("quote matches more than one location")
  if (ref.locator.kind === "lines") return Effect.succeed("line range outside retained representation")
  if (ref.locator.kind === "json") return Effect.succeed(error.code === "reference_invalid" ? "JSON pointer does not resolve" : `retained bytes unavailable (${error.code})`)
  if (error.code !== "reference_invalid") return Effect.succeed(`retained bytes unavailable (${error.code})`)
  const locator = ref.locator
  // Small tolerance: the quote may differ from the retained bytes only in whitespace runs.
  return text.pipe(
    Effect.map((value) => {
      const needle = squash(`${locator.prefix ?? ""}${locator.exact}${locator.suffix ?? ""}`)
      const count = needle ? squash(value).split(needle).length - 1 : 0
      if (count === 1) return undefined
      return count > 1 ? "quote matches more than one location" : "quote not found in retained representation"
    }),
    Effect.orElseSucceed(() => "retained bytes unavailable"),
  )
}

function drain(
  records: ResearchRecords.Interface,
  binding: Research.Binding,
  input: { action: "source"; ref: Research.SourceRef; cursor?: string } | { action: "document"; ref: Research.DocumentRef; cursor?: string },
): Effect.Effect<string, Research.Error> {
  return records.view(binding, input).pipe(Effect.flatMap((page) => {
    if (!("text" in page)) return Effect.fail(new Research.Error({ code: "source_unavailable", message: "Retained research page is not text" }))
    if (!page.cursor) return Effect.succeed(page.text)
    return drain(records, binding, { ...input, cursor: page.cursor }).pipe(Effect.map((rest) => page.text + rest))
  }))
}

function label(ref: Research.EvidenceRef, receipt?: Research.SourceReceipt) {
  const where = receipt?.origin.uri ?? `research:${ref.source.artifact.id}`
  if (ref.locator.kind === "lines") return `${where} retained lines ${ref.locator.start}-${ref.locator.end}`
  if (ref.locator.kind === "quote") return `${where} quote ${JSON.stringify(clip(ref.locator.exact, 60))}`
  return `${where} json ${ref.locator.pointer}`
}

function url(value: string) {
  if (!URL.canParse(value)) return undefined
  const parsed = new URL(value)
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`
}

function normal(value: string) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "")
}

function squash(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function clip(value: string, limit: number) {
  return value.length <= limit ? value : `${value.slice(0, limit - 3)}...`
}
