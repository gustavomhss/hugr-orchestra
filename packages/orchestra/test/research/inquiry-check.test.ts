import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { InquiryCheck } from "@/research/inquiry-check"

const cast = <T>(value: unknown) => value as T
const binding = cast<Research.Binding>({ directory: "/repo", worktree: "/repo" })
const ref = (id: string) => cast<Research.SourceRef>({ artifact: { id, revision: 0 }, representation: "text", digest: id.padEnd(64, "0") })
const rec = (id: string) => cast<Research.RecordRef>({ id, revision: 1 })
const FILE = ["alpha", "beta", "gamma", "delta", "eps", "zeta", "eta", "theta", "iota", "kappa"].join("\n")

const receipt = (id: string, origin: Research.SourceReceipt["origin"], extra: Partial<Research.SourceReceipt> = {}) =>
  cast<Research.SourceReceipt>({ ref: ref(id), origin, mediaType: "text/plain", bytes: 1, complete: true, capturedAt: 0, ...extra })
const file = receipt("file", { kind: "file", uri: "/repo/src/a.ts" })
const page = receipt("page", { kind: "url", uri: "https://docs.github.com/x" }, { mediaType: "text/markdown" })
const output = receipt("out", { kind: "tool-output", uri: "native:s/c/Grep" })

const claim = (evidence: Research.Evidence[], extra: Partial<InquiryCheck.Claim> = {}): InquiryCheck.Claim =>
  ({ ref: rec("c1"), subquestion: rec("q1"), proposition: "f is defined", nature: "extraction", conditions: [], evidence, contrary: [], ...extra })
const lines = (source: Research.SourceRef, start: number, end: number) => cast<Research.Evidence>({ source, lines: { start, end } })

const base = (extra: Partial<InquiryCheck.Input> = {}): InquiryCheck.Input => ({
  binding, answer: "", allowedDomains: "unrestricted", sources: [file, page, output], attempts: [],
  subquestions: [{ ref: rec("q1"), question: "what?" }], claims: [], hypotheses: [], searches: [], seenUrls: [],
  read: (source) => source.artifact.id === "file" ? Effect.succeed(FILE) : source.artifact.id === "gone"
    ? Effect.fail(new Research.Error({ code: "source_unavailable", message: "gone" })) : Effect.succeed("# page\nbody"),
  verify: () => Effect.void,
  liveness: (urls) => Effect.succeed(urls.map((url) => ({ url, status: "LIVE" as const }))),
  ...extra,
})
const run = (input: InquiryCheck.Input) => Effect.runPromise(InquiryCheck.run(input))
const rule = (outcome: Awaited<ReturnType<typeof run>>, id: string) => outcome.result.rules.find((item) => item.id === id)!
const reasons = (outcome: Awaited<ReturnType<typeof run>>, id: string) => outcome.result.issues.filter((issue) => issue.rule === id).map((issue) => issue.reason)

describe("InquiryCheck.extract", () => {
  const shape = (text: string) => InquiryCheck.extract(text).map((item) => `${item.kind}:${item.target}:${item.start ?? ""}-${item.end ?? ""}`)
  test("recognizes the four formats of R9", () => {
    expect(shape("see src/a.ts:10 and src/b.ts:3-5")).toEqual(["file:src/a.ts:10-10", "file:src/b.ts:3-5"])
    expect(shape("see src/a.ts#L10-L20")).toEqual(["file:src/a.ts:10-20"])
    expect(shape("see [the code](src/a.ts#L7)")).toEqual(["file:src/a.ts:7-7"])
    expect(shape("see [the code](./src/a.ts)")).toEqual(["file:./src/a.ts:-"])
  })
  test("a bare L10-L20 names no file and is an orphan", () => {
    expect(shape("it is defined at L10-L20")).toEqual(["orphan::10-20"])
    expect(shape("see src/a.ts#L10-L20")).toEqual(["file:src/a.ts:10-20"])
  })
  test("reads prose forms such as line 10 of file.ts", () => {
    expect(shape("line 10 of src/a.ts")).toEqual(["file:src/a.ts:10-10"])
    expect(shape("lines 10-20 of `src/a.ts`")).toEqual(["file:src/a.ts:10-20"])
    expect(shape("src/a.ts, line 4")).toEqual(["file:src/a.ts:4-4"])
    expect(shape("linhas 3 a 9 de src/a.ts")).toEqual(["file:src/a.ts:3-9"])
    expect(shape("line 10 of the output")).toEqual([])
  })
  test("URLs keep their anchor, and hosts with ports are not files", () => {
    expect(shape("https://github.com/o/r/blob/x/a.ts#L3-L9.")).toEqual(["url:https://github.com/o/r/blob/x/a.ts:3-9"])
    expect(shape("listens on localhost:8080")).toEqual([])
    expect(shape("```\nsrc/a.ts:10\nx.ts:3\n```")).toEqual(["file:src/a.ts:10-10"])
  })
})

describe("InquiryCheck.run", () => {
  test("fails on zero citations: R2 reports checked 0 and answered cannot pass", async () => {
    const outcome = await run(base())
    expect(outcome.result.verdict).toBe("fail")
    expect(rule(outcome, "R2")).toMatchObject({ failed: 1 })
    expect(reasons(outcome, "R2")[0]).toContain("zero claims")
    expect(rule(outcome, "R7").checked).toBe(1)
  })

  test("a claim with resolved line evidence passes, and the answer may cite inside it", async () => {
    const outcome = await run(base({ claims: [claim([lines(file.ref, 2, 6)])], answer: "see src/a.ts:3-5 and line 4 of src/a.ts" }))
    expect(outcome.result).toMatchObject({ verdict: "pass", issues: [] })
    expect(rule(outcome, "R9").checked).toBe(2)
    expect(rule(outcome, "R3").checked).toBe(1)
  })

  test("R9 fails on unmapped file lines, orphan ranges, other paths and basename-only matches", async () => {
    const answer = "src/a.ts:9 L10-L20 src/other.ts:2 a.ts:3"
    const outcome = await run(base({ claims: [claim([lines(file.ref, 2, 6)])], answer }))
    expect(reasons(outcome, "R9").length).toBe(4)
    expect(reasons(outcome, "R9").join("|")).toContain("without a path")
    expect(reasons(outcome, "R9").join("|")).toContain("outside the evidence")
  })

  test("R3 separates an unreadable source from an out-of-range line", async () => {
    const gone = receipt("gone", { kind: "file", uri: "/repo/src/g.ts" })
    const outcome = await run(base({ sources: [file, gone], claims: [claim([lines(gone.ref, 1, 2), lines(file.ref, 8, 99)])] }))
    const found = reasons(outcome, "R3")
    expect(found.some((reason) => reason.startsWith("source unreadable"))).toBe(true)
    expect(found.some((reason) => reason.includes("outside the captured range 1-10"))).toBe(true)
  })

  test("R3 uses the recorded extent of a partial capture and maps original coordinates", async () => {
    const partial = receipt("file", { kind: "file", uri: "/repo/src/a.ts" }, { complete: false, observed: { byteStart: 40, lineStart: 5, lineEnd: 8 } })
    const ok = await run(base({ sources: [partial], claims: [claim([lines(partial.ref, 6, 7)])] }))
    expect(ok.result.verdict).toBe("pass")
    const bad = await run(base({ sources: [partial], claims: [claim([lines(partial.ref, 1, 2)])] }))
    expect(reasons(bad, "R3")[0]).toContain("outside the captured range 5-")
    const unknown = receipt("file", { kind: "file", uri: "/repo/src/a.ts" }, { complete: false })
    expect(reasons(await run(base({ sources: [unknown], claims: [claim([lines(unknown.ref, 1, 1)])] })), "R3")[0]).toContain("extent unknown")
  })

  test("tool-output sources carry no lines and are never a claim's only primary source", async () => {
    const lined = await run(base({ claims: [claim([lines(output.ref, 1, 1)])] }))
    expect(reasons(lined, "R3")[0]).toContain("tool output")
    const quoted = await run(base({ claims: [claim([cast({ source: output.ref, quote: "Grep hit" })])] }))
    expect(reasons(quoted, "R1")[0]).toContain("no primary source")
    const mixed = await run(base({ claims: [claim([cast({ source: output.ref, quote: "Grep hit" }), lines(file.ref, 1, 2)])] }))
    expect(mixed.result.verdict).toBe("pass")
  })

  test("quote and pointer go through the record verifier, and a quote also covers its lines", async () => {
    const seen: string[] = []
    const verify: InquiryCheck.Input["verify"] = (item) => {
      seen.push(item.locator.kind)
      return item.locator.kind === "json" ? Effect.fail(new Research.Error({ code: "reference_invalid", message: "x" })) : Effect.void
    }
    const outcome = await run(base({ verify, answer: "src/a.ts:3",
      claims: [claim([cast({ source: file.ref, quote: "gamma" }), cast({ source: file.ref, pointer: "/a" })])] }))
    expect(seen).toEqual(["quote", "json"])
    expect(reasons(outcome, "R3")).toEqual(["JSON pointer does not resolve"])
    expect(reasons(outcome, "R9")).toEqual([])
  })

  test("R4 fails evidence whose attempt was unavailable or uncertain", async () => {
    const attempt = cast<Research.AttemptReceipt>({ outcome: "uncertain", reason: "timeout", source: file.ref })
    expect(reasons(await run(base({ attempts: [attempt], claims: [claim([lines(file.ref, 1, 2)])] })), "R4")[0]).toContain("uncertain")
  })

  test("R5 and R6 need a complete search whose scope the claim names", async () => {
    const universal = claim([lines(file.ref, 1, 2)], { proposition: "f is the only caller", conditions: ["src/**"] })
    const none = claim([lines(file.ref, 1, 2)], { proposition: "there are no usages of g" })
    const bare = await run(base({ claims: [universal, none] }))
    expect(rule(bare, "R5")).toMatchObject({ checked: 1, failed: 1 })
    expect(rule(bare, "R6")).toMatchObject({ checked: 1, failed: 1 })
    const searched = await run(base({ claims: [universal, { ...none, conditions: ["src/**"] }], searches: [{ tool: "code_search", complete: true, scope: ["src/**"] }] }))
    expect(searched.result.verdict).toBe("pass")
    const incomplete = await run(base({ claims: [universal], searches: [{ tool: "code_search", complete: false, scope: ["src/**"] }] }))
    expect(rule(incomplete, "R5").failed).toBe(1)
  })

  test("R7 and R8 fail when answered and degrade to coverage failures when partial", async () => {
    const open = [{ ref: rec("h1"), proposition: "p", status: "open" as const, evidence: [] }]
    const answered = await run(base({ claims: [claim([lines(file.ref, 1, 2)], { subquestion: rec("other") })], hypotheses: open }))
    expect(rule(answered, "R7").failed).toBe(1)
    expect(rule(answered, "R8").failed).toBe(1)
    const partial = await run(base({ sufficiency: "partial", claims: [claim([lines(file.ref, 1, 2)], { subquestion: rec("other") })], hypotheses: open }))
    expect(partial.result.verdict).toBe("pass")
    expect(partial.coverageFailures).toEqual(["uncovered: what?"])
  })

  test("R10 and R11 check every cited URL and captured URL source, with UNKNOWN as a limitation", async () => {
    const liveness: InquiryCheck.Input["liveness"] = (urls) => Effect.succeed(urls.map((url) => ({ url,
      status: url.includes("dead") ? "DEAD" as const : url.includes("slow") ? "UNKNOWN" as const : "LIVE" as const })))
    const outcome = await run(base({ liveness, allowedDomains: ["github.com"], seenUrls: ["https://x.dev/dead", "https://x.dev/slow"],
      claims: [claim([lines(file.ref, 1, 2)])], answer: "https://x.dev/dead https://x.dev/slow https://evilgithub.com/a" }))
    expect(outcome.result.urls.map((url) => url.url).sort()).toEqual(["https://docs.github.com/x", "https://evilgithub.com/a", "https://x.dev/dead", "https://x.dev/slow"].sort())
    expect(reasons(outcome, "R10").length).toBe(1)
    expect(rule(outcome, "R11").failed).toBe(3)
    expect(outcome.limitations).toEqual(["URL could not be verified: https://x.dev/slow"])
  })

  test("a plain URL never seen or captured is unmapped", async () => {
    const outcome = await run(base({ claims: [claim([lines(file.ref, 1, 2)])], answer: "https://nowhere.dev/a" }))
    expect(reasons(outcome, "R9")[0]).toContain("not captured or seen")
  })
})
