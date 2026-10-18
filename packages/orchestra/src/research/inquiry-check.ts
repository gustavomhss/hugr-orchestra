export * as InquiryCheck from "./inquiry-check"

import path from "node:path"
import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { Liveness } from "@orchestra/core/research-toolkit/liveness"

// J5.6-J5.8: the mechanical check before the card. It proves a citation exists and covers what it says it covers; it
// never judges whether the sentence follows from it. Every rule reports `checked`, so an empty pass cannot happen.

export type Claim = {
  readonly ref: Research.RecordRef
  readonly subquestion: Research.RecordRef
  readonly proposition: string
  readonly nature: "extraction" | "observation" | "inference"
  readonly scope?: "universal" | "existential"
  readonly conditions: readonly string[]
  readonly evidence: readonly Research.Evidence[]
  readonly contrary: readonly Research.Evidence[]
}
export type Hypothesis = {
  readonly ref: Research.RecordRef
  readonly proposition: string
  readonly status: "open" | "confirmed" | "refuted"
  readonly evidence: readonly Research.Evidence[]
}
/** A `code_search` or `code_query` this dispatch ran: `scope` is what it covered, `complete` its coverage verdict. */
export type Search = { readonly tool: "code_search" | "code_query"; readonly complete: boolean; readonly scope: readonly string[] }

export type Input = {
  readonly binding: Research.Binding
  /** What the seat is closing with. Absent on a mid-run `check`, which is held to the strictest bar. */
  readonly sufficiency?: Research.Sufficiency
  /** The `answer` of the last close attempt; empty when none. */
  readonly answer: string
  readonly allowedDomains: readonly string[] | "unrestricted"
  /** Sources and attempts admitted under this binding, from the ledger. */
  readonly sources: readonly Research.SourceReceipt[]
  readonly attempts: readonly Research.AttemptReceipt[]
  readonly subquestions: ReadonlyArray<{ readonly ref: Research.RecordRef; readonly question: string }>
  readonly claims: readonly Claim[]
  readonly hypotheses: readonly Hypothesis[]
  readonly searches: readonly Search[]
  /** URLs seen by retained web searches; a dead URL outside them and the captured sources is LIKELY_HALLUCINATED. */
  readonly seenUrls: readonly string[]
  /** Retained bytes of a source (`records.view` drained). */
  readonly read: (ref: Research.SourceRef) => Effect.Effect<string, Research.Error>
  /** `records.verifyEvidence`: quote and JSON pointer resolution against the retained bytes. */
  readonly verify: (ref: Research.EvidenceRef) => Effect.Effect<void, Research.Error>
  /** `Liveness.check` bound to this dispatch's captures. */
  readonly liveness: (urls: readonly string[]) => Effect.Effect<readonly Research.CheckResult["urls"][number][]>
  /** Real path of a citation target, so symlinks resolve like the read tool records them. */
  readonly real?: (target: string) => Effect.Effect<string>
}
export type Outcome = {
  readonly result: Research.CheckResult
  /** R7 in a `partial` close: uncovered subquestions become coverage failures, not check failures. */
  readonly coverageFailures: readonly string[]
  /** UNKNOWN URLs: not a failure, but the card must say so. */
  readonly limitations: readonly string[]
  readonly omitted: number
}

type Rule = typeof Research.CheckRule.Type
type Issue = Research.CheckResult["issues"][number]
export type Citation = { readonly raw: string; readonly kind: "file" | "url" | "orphan"; readonly target: string; readonly start?: number; readonly end?: number }

const RULES: readonly Rule[] = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11"]
const UNIVERSAL = /(?<![\p{L}\p{N}_])(only|always|never|none|no other|all|every|apenas|somente|sempre|nunca|nenhum|nenhuma|nenhuns|todos|todas|todo|toda|qualquer)(?![\p{L}\p{N}_])/iu
const ABSENCE = /(?<![\p{L}\p{N}_])(does not exist|doesn't exist|do not exist|not found|there (?:is|are) no|no (?:callers?|usages?|references?|uses?|implementations?|matches|occurrences?)|never (?:called|used|referenced)|n[aã]o existe|n[aã]o h[aá]|n[aã]o (?:é|e) (?:chamad|usad|referenciad)\p{L}*|sem (?:chamadas|usos|refer[eê]ncias|ocorr[eê]ncias))(?![\p{L}\p{N}_])/iu

/** R1-R11 over the current state. */
export const run = Effect.fn("InquiryCheck.run")(function* (input: Input) {
  const issues: Issue[] = []
  const checked = new Map<Rule, number>(RULES.map((rule) => [rule, 0]))
  const count = (rule: Rule, by = 1) => checked.set(rule, checked.get(rule)! + by)
  const fail = (rule: Rule, reason: string, extra?: Partial<Issue>) => { issues.push({ rule, reason, ...extra }) }
  const strict = (input.sufficiency ?? "answered") === "answered"

  const receipts = new Map(input.sources.map((receipt) => [ResearchLedger.canonical(receipt.ref), receipt]))
  const texts = new Map<string, { ok: true; text: string } | { ok: false; code: string }>()
  const text = (ref: Research.SourceRef) => {
    const key = ResearchLedger.canonical(ref)
    const known = texts.get(key)
    if (known) return Effect.succeed(known)
    return input.read(ref).pipe(
      Effect.map((value) => ({ ok: true, text: value }) as const),
      Effect.catch((error) => Effect.succeed({ ok: false, code: error.code } as const)),
      Effect.tap((value) => Effect.sync(() => texts.set(key, value))),
    )
  }

  // Original-file lines held by a retained source: from its recorded extent, or from the line count of a complete
  // capture that starts at byte 0. An unreadable source is its own reason, never "outside the range".
  const extents = new Map<string, { start: number; end: number } | string>()
  const extent = Effect.fn("InquiryCheck.extent")(function* (receipt: Research.SourceReceipt) {
    const key = ResearchLedger.canonical(receipt.ref)
    const known = extents.get(key)
    if (known) return known
    const observed = receipt.observed
    const html = receipt.origin.kind === "url" && (/html/i.test(receipt.mediaType) || (receipt.transformation && receipt.transformation !== "utf8-decode-v1"))
    const fromStart = observed?.lineStart === undefined && (observed?.byteStart ?? 0) === 0 && receipt.complete && !html
    const value = yield* Effect.gen(function* () {
      if (receipt.origin.kind === "tool-output") return "tool output has no original-file line coordinates"
      if (observed?.lineStart === undefined && !fromStart)
        return html ? "a transformed page has no original line coordinates" : "captured extent unknown (partial capture without line coordinates)"
      const body = yield* text(receipt.ref)
      if (!body.ok) return `source unreadable (${body.code})`
      const lines = body.text.split(/\r\n|\n|\r/).length
      const start = observed?.lineStart ?? 1
      return { start, end: observed?.lineEnd ?? start + lines - 1 }
    })
    extents.set(key, value)
    return value
  })

  // One piece of evidence: ownership (R1), attempt (R4), locator (R3). Returns the original lines it covers, if known.
  const spans: Array<{ receipt: Research.SourceReceipt; start: number; end: number }> = []
  const evidence = Effect.fn("InquiryCheck.evidence")(function* (item: Research.Evidence, owner: Research.RecordRef, resolves: boolean) {
    const at = { ref: owner }
    const receipt = receipts.get(ResearchLedger.canonical(item.source))
    count("R1")
    if (!receipt) return fail("R1", "source not admitted under this dispatch's binding", at), false
    const attempts = input.attempts.filter((attempt) => attempt.source && ResearchLedger.canonical(attempt.source) === ResearchLedger.canonical(item.source))
    count("R4")
    if (attempts.length && attempts.every((attempt) => attempt.outcome === "unavailable" || attempt.outcome === "uncertain"))
      return fail("R4", `source attempt was ${attempts[0].outcome} (${attempts[0].reason})`, { ...at, citation: receipt.origin.uri }), false
    count("R3")
    const where = { ...at, citation: receipt.origin.uri }
    if ("lines" in item) {
      const have = yield* extent(receipt)
      if (typeof have === "string") return fail("R3", have, where), false
      if (item.lines.start > item.lines.end || item.lines.start < have.start || item.lines.end > have.end)
        return fail("R3", `lines ${item.lines.start}-${item.lines.end} outside the captured range ${have.start}-${have.end}`, where), false
      spans.push({ receipt, ...item.lines })
      return true
    }
    const locator = "quote" in item ? { kind: "quote" as const, exact: item.quote } : { kind: "json" as const, pointer: item.pointer }
    const verdict = yield* input.verify({ source: item.source, locator }).pipe(Effect.as(undefined), Effect.catch((error) => Effect.succeed(error)))
    // A literal found more than once is still present; only absence or unreadable bytes fail.
    if (verdict && verdict.code !== "locator_ambiguous")
      return fail("R3", verdict.code === "reference_invalid" ? ("quote" in item ? "quote not present in the retained bytes" : "JSON pointer does not resolve")
        : `source unreadable (${verdict.code})`, where), false
    if ("quote" in item) yield* quoteSpan(receipt, item.quote)
    return resolves
  })
  const quoteSpan = Effect.fn("InquiryCheck.quoteSpan")(function* (receipt: Research.SourceReceipt, quote: string) {
    const have = yield* extent(receipt)
    const body = yield* text(receipt.ref)
    if (typeof have === "string" || !body.ok) return
    const at = body.text.indexOf(quote)
    if (at < 0) return
    const before = body.text.slice(0, at).split(/\r\n|\n|\r/).length
    spans.push({ receipt, start: have.start + before - 1, end: have.start + before - 1 + quote.split(/\r\n|\n|\r/).length - 1 })
  })

  // R1, R2, R3, R4, R5, R6 per claim.
  const resolved = yield* Effect.forEach(input.claims, Effect.fn("InquiryCheck.claim")(function* (claim) {
    const at = { ref: claim.ref }
    const results = yield* Effect.forEach(claim.evidence, (item) => evidence(item, claim.ref, true))
    yield* Effect.forEach(claim.contrary, (item) => evidence(item, claim.ref, false))
    count("R2")
    if (!claim.evidence.length) fail("R2", "claim has no evidence", at)
    const good = claim.evidence.filter((item, index) => results[index])
    // Tool output and atlas-own memory are never primary; a claim needs at least one file or URL source of its own.
    count("R1")
    const primary = good.some((item) => ["file", "url"].includes(receipts.get(ResearchLedger.canonical(item.source))!.origin.kind))
    if (good.length && !primary) fail("R1", "no primary source: tool output and atlas-own memory cannot be a claim's only evidence", at)
    const universal = claim.scope === "universal" || UNIVERSAL.test(claim.proposition)
    const absence = ABSENCE.test(claim.proposition)
    if (universal) count("R5")
    if (absence) count("R6")
    // The claim must name the scope of a complete search; "complete" without a scope would prove nothing.
    const searched = input.searches.some((search) => search.complete &&
      search.scope.some((entry) => entry.trim() !== "" && claim.conditions.some((condition) => condition.includes(entry))))
    if (universal && !searched) fail("R5", "universal claim without a complete code_search or code_query whose scope is in its conditions", at)
    if (absence && !searched) fail("R6", "absence claim without a complete code_search or code_query whose scope is in its conditions", at)
    return primary && good.length > 0
  }))

  // R2: an answered inquiry rests on at least one claim with resolved evidence.
  if (strict && !resolved.some(Boolean)) fail("R2", input.claims.length ? "answered, but no claim has resolved evidence" : "answered, but the inquiry has zero claims and zero evidence")

  // R7: every subquestion has an answering claim.
  const coverageFailures: string[] = []
  input.subquestions.forEach((sub) => {
    count("R7")
    if (input.claims.some((claim) => claim.subquestion.id === sub.ref.id)) return
    if (strict) return fail("R7", "subquestion has no answering claim", { ref: sub.ref, citation: sub.question })
    coverageFailures.push(`uncovered: ${sub.question}`)
  })

  // R8: hypotheses are decided, and a decision carries evidence.
  yield* Effect.forEach(input.hypotheses, Effect.fn("InquiryCheck.hypothesis")(function* (hypothesis) {
    count("R8")
    if (hypothesis.status === "open") return strict ? fail("R8", "open hypothesis in an answered inquiry", { ref: hypothesis.ref }) : undefined
    if (!hypothesis.evidence.length) return fail("R8", `hypothesis ${hypothesis.status} without a probe or source`, { ref: hypothesis.ref })
    yield* Effect.forEach(hypothesis.evidence, (item) => evidence(item, hypothesis.ref, true))
  }))

  // R9: every path and URL line in the answer sits inside evidence a claim holds. Exact path, no basename suffix.
  const citations = extract(input.answer)
  const roots = [...new Set([input.binding.directory, input.binding.worktree])]
  const targets = Effect.fn("InquiryCheck.targets")(function* (written: string) {
    const resolved = roots.map((root) => path.resolve(root, written))
    const real = input.real ? yield* Effect.forEach(resolved, (item) => input.real!(item).pipe(Effect.orElseSucceed(() => item))) : []
    return new Set([...resolved, ...real].map(normal))
  })
  const urlSources = input.sources.filter((receipt) => receipt.origin.kind === "url")
  const known = new Set([...urlSources.map((receipt) => Liveness.normal(receipt.origin.uri)), ...input.seenUrls.map(Liveness.normal)])
  yield* Effect.forEach(citations, Effect.fn("InquiryCheck.citation")(function* (citation) {
    count("R9")
    const at = { citation: citation.raw }
    if (citation.kind === "orphan") return fail("R9", "line range without a path or URL: write it as path:start-end", at)
    const lined = citation.start !== undefined
    if (lined && citation.start! > citation.end!) return fail("R9", "inverted line range", at)
    if (citation.kind === "url" && !lined)
      return known.has(Liveness.normal(citation.target)) ? undefined : fail("R9", "URL not captured or seen in this dispatch", at)
    const own = citation.kind === "url" ? undefined : yield* targets(citation.target)
    const rematched = spans.filter((span) => citation.kind === "url"
      ? span.receipt.origin.kind === "url" && Liveness.normal(span.receipt.origin.uri) === Liveness.normal(citation.target)
      : span.receipt.origin.kind === "file" && own!.has(normal(span.receipt.origin.uri)))
    if (!lined) return rematched.length ? undefined : fail("R9", "no evidence for this path", at)
    if (!rematched.length) return fail("R9", "no evidence for this path or URL", at)
    if (!rematched.some((span) => span.start <= citation.start! && citation.end! <= span.end))
      fail("R9", `lines ${citation.start}-${citation.end} are outside the evidence held (${rematched.map((span) => `${span.start}-${span.end}`).join(", ")})`, at)
  }))

  // R10, R11: every cited URL and every captured URL source is alive and allowed.
  const urls = [...new Set([...citations.filter((citation) => citation.kind === "url").map((citation) => citation.target), ...urlSources.map((receipt) => receipt.origin.uri)])]
  const statuses = yield* input.liveness(urls)
  const limitations: string[] = []
  statuses.forEach((status) => {
    count("R10")
    count("R11")
    if (!Liveness.allowed(status.url, input.allowedDomains)) fail("R11", "host is outside the domain list of this dispatch", { citation: status.url })
    if (status.status === "DEAD" || status.status === "LIKELY_HALLUCINATED")
      fail("R10", status.status === "DEAD" ? `URL is dead${status.httpStatus ? ` (HTTP ${status.httpStatus})` : ""}` : "URL is dead and was never seen in this dispatch: likely hallucinated", { citation: status.url })
    if (status.status === "UNKNOWN") limitations.push(`URL could not be verified: ${status.url}`)
  })

  const failed = (rule: Rule) => issues.filter((issue) => issue.rule === rule).length
  const bounded = issues.slice(0, 256).map((issue) => ({ ...issue, reason: clip(issue.reason, 4096), ...(issue.citation ? { citation: clip(issue.citation, 8192) } : {}) }))
  return {
    result: { verdict: issues.length ? "fail" : "pass",
      rules: RULES.map((id) => ({ id, checked: checked.get(id)!, failed: failed(id) })), issues: bounded, urls: statuses },
    coverageFailures, limitations, omitted: Math.max(0, issues.length - 256),
  } satisfies Outcome
})

/**
 * Every citation form in the text, outside fenced blocks (a path with a directory still counts there):
 * markdown links, `line 10 of file.ts`, `file.ts, line 10`, `path:10-20`, `path#L10-L20`, URLs (with or without a line
 * anchor), and a bare `L10-L20`, which names no file and is reported as an orphan.
 */
export function extract(text: string): readonly Citation[] {
  const fenced = [...text.matchAll(FENCE)].flatMap((match) => scan(match[0]).filter((citation) => citation.kind === "file" && /[/\\]/.test(citation.target)))
  return dedupe([...scan(text.replace(FENCE, "\n")), ...fenced])
}

const FENCE = /(```|~~~)[\s\S]*?\1/g
const URL_PATTERN = /https?:\/\/[^\s<>()[\]{}"'`]+/g
const TOKEN = String.raw`(?:[A-Za-z]:)?[\w@~./\\-]+`
const RANGE = String.raw`(\d+)(?:\s*(?:-|–|to|a|até)\s*(\d+))?`
const LINE_WORD = String.raw`(?:lines?|linhas?)`
const LINK = /\[[^\]\n]*\]\(([^)\s]+)\)/g
const LINE_OF = new RegExp(String.raw`(?<![\p{L}\p{N}])${LINE_WORD}\s+${RANGE}\s+(?:of|in|de|em|do|da|no|na)\s+[\x60'"]?(${TOKEN})[\x60'"]?`, "giu")
const PATH_LINE = new RegExp(String.raw`(?<![\w@~./\\:-])(${TOKEN})[\x60'"]?[,\s(]+${LINE_WORD}\s+${RANGE}`, "giu")
const PATH_COLON = /(?<![\w@~./\\:-])((?:[A-Za-z]:)?[\w@~./\\-]+):(\d+)(?:-(\d+))?(?!\d)/g
const PATH_ANCHOR = /(?<![\w@~./\\:-])((?:[A-Za-z]:)?[\w@~./\\-]+)#L(\d+)(?:-L?(\d+))?(?!\d)/g
const ORPHAN = /(?<![\w#/.:-])L(\d+)\s*[-–]\s*L?(\d+)(?![\w])/g
// A host with a port (`localhost:8080`, `example.com:443`) is not a file with a line.
const HOSTS = new Set(["com", "org", "net", "io", "dev", "ai", "co", "edu", "gov", "info", "biz", "me", "us", "uk", "eu", "de",
  "local", "localhost", "internal", "lan", "cloud", "site", "xyz", "tech", "online", "example", "test", "invalid"])

function scan(source: string) {
  const found: Citation[] = []
  const take = (pattern: RegExp, text: string, build: (match: RegExpExecArray) => Citation | undefined) =>
    text.replace(pattern, (...args) => {
      const groups = args.slice(0, -2) as string[]
      const match = Object.assign(groups, { index: args[args.length - 2] as number }) as unknown as RegExpExecArray
      const citation = build(match)
      if (citation) found.push(citation)
      return " ".repeat(groups[0].length)
    })
  let rest = take(URL_PATTERN, source, (match) => {
    const raw = match[0].replace(/[.,;:!?]+$/, "")
    const anchor = /#L(\d+)(?:-L?(\d+))?$/.exec(raw)
    return { raw, kind: "url", target: raw.replace(/#.*$/, ""), ...(anchor ? { start: Number(anchor[1]), end: Number(anchor[2] ?? anchor[1]) } : {}) }
  })
  rest = take(LINK, rest, (match) => {
    const target = match[1]
    if (target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) return undefined
    const parsed = /^([^#?:]+)(?:(?:#L(\d+)(?:-L?(\d+))?)|(?::(\d+)(?:-(\d+))?))?(?:\?.*)?$/.exec(target)
    if (!parsed || !file(parsed[1])) return undefined
    const start = parsed[2] ?? parsed[4]
    return { raw: target, kind: "file", target: parsed[1], ...(start ? { start: Number(start), end: Number(parsed[3] ?? parsed[5] ?? start) } : {}) }
  })
  rest = take(LINE_OF, rest, (match) => file(match[3]) ? cite(match[3], match[1], match[2], match[0]) : undefined)
  rest = take(PATH_LINE, rest, (match) => file(match[1]) ? cite(match[1], match[2], match[3], match[0]) : undefined)
  rest = take(PATH_COLON, rest, (match) => file(match[1]) ? cite(match[1], match[2], match[3], match[0]) : undefined)
  rest = take(PATH_ANCHOR, rest, (match) => file(match[1]) ? cite(match[1], match[2], match[3], match[0]) : undefined)
  take(ORPHAN, rest, (match) => ({ raw: match[0], kind: "orphan", target: "", start: Number(match[1]), end: Number(match[2]) }))
  return found
}

function cite(target: string, start: string, end: string | undefined, raw: string): Citation {
  return { raw: raw.trim(), kind: "file", target, start: Number(start), end: Number(end ?? start) }
}

function dedupe(list: readonly Citation[]) {
  return [...new Map(list.map((citation) => [`${citation.kind}\n${citation.target}\n${citation.start}\n${citation.end}`, citation])).values()]
}

/** A file has a directory or an extension that is not a top-level domain. */
function file(candidate: string) {
  if (/[/\\]/.test(candidate)) return true
  const extension = /\.([A-Za-z][\w-]*)$/.exec(candidate)?.[1]
  return extension !== undefined && !HOSTS.has(extension.toLowerCase())
}

function normal(value: string) {
  const slashed = value.replaceAll("\\", "/").replace(/^\.\//, "")
  return process.platform === "win32" ? slashed.toLowerCase() : slashed
}

function clip(value: string, limit: number) {
  return value.length <= limit ? value : `${value.slice(0, limit - 3)}...`
}
