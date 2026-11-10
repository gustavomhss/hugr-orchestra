import { expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { Project } from "@orchestra/core/project"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewAnalyze } from "@orchestra/core/review-toolkit/analyze"
import { ReviewLedger } from "@orchestra/core/review/ledger"
import { ReviewPrecisionCatalog } from "@orchestra/core/review/precision-catalog"
import { ReviewPrecisionStore } from "@orchestra/core/review/precision-store"
import { ReviewPrecisionEvent } from "@orchestra/schema/review-precision-event"
import { MaestroReviewTools } from "../src/v2/tools/review"
import { ReviewPRFactsV2 } from "../src/v2/tools/review-pr-facts"
import { authoredSkills, run } from "./fixture/lucy-pr-entry"

// Registered maestro_request_review only. ReviewPrecisionCatalog.effective is the
// expected snapshot, not a stand-in for the host. In-memory prompts are not a
// durable Session claim; precision rows are.

const native = "generic-api-key"
const pack = ReviewCatalog.current.packs.find((entry) => entry.id === "gitleaks")
const star = ReviewCatalog.current.rules.find((entry) => entry.pack === "gitleaks" && entry.rule === "*")
if (!pack || !star) throw new Error("catalog has no gitleaks wildcard")
const generation = ReviewLedger.generation(pack, { ...star, rule: native })
const other = "other-project"
const skills = await authoredSkills()

const read = (prefix: string, index: number): ReviewLedger.Read => ({
  pack: "gitleaks",
  rule: native,
  generation,
  fingerprint: `fp-${prefix}-${index}`,
  outcome: "refuted",
})

const seed = (project: string, count: number, prefix: string) =>
  Effect.gen(function* () {
    const ids: string[] = []
    for (let index = 0; index < count; index++) {
      const admitted = yield* ReviewPrecisionStore.append({ review: `${prefix}:${index}`, project, reads: [read(prefix, index)] })
      ids.push(admitted.id)
    }
    return ids
  })

const digest = (batches: ReadonlyArray<ReviewLedger.Batch>, project: string) =>
  ReviewCatalog.catalogDigest(ReviewPrecisionCatalog.effective({
    project,
    catalog: ReviewCatalog.current,
    batches,
  })).slice("sha256:".length)

const request = (base: string, head: string, prText: string) =>
  ({ kind: "pr" as const, baseRef: base, headRef: head, tier: "quick" as const, prText })

const candidateOf = (text: string) =>
  JSON.parse(text.slice("PR identity: ".length).split("\n")[0] ?? "").candidate as string

const storedOf = (candidate: string) =>
  ReviewPRFactsV2.read(MaestroReviewTools.analysisStore(`pr_${candidate}`), candidate)

const rows = () =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    return yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, ReviewPrecisionEvent.Aggregate)).all().pipe(Effect.orDie)
  })

const nativeStatus = (catalog: ReviewCatalog.Catalog) =>
  catalog.rules.find((rule) => rule.pack === "gitleaks" && rule.rule === native)?.status

// data-migration.checks is empty, so an entry overlay cannot add a pack. A second
// analysis is not reachable on this registered fixture; do not invent one.

test(process.platform === "win32"
  ? "Windows refuses a precision PR before analysis or precision publication"
  : "a new PR routes the history snapshot, and a later local read starts probation", () =>
  Effect.runPromise(run(skills, {}, (ctx) => Effect.gen(function* () {
    expect(generation).toMatch(/^[0-9a-f]{64}$/)
    expect(generation).not.toBe(ReviewLedger.generation(pack, star))
    const prior = yield* seed(other, 40, "ambient")
    const dropped = yield* ReviewPrecisionStore.history()
    expect(ReviewLedger.status(dropped, {
      project: Project.ID.global, pack: "gitleaks", rule: native, generation, repository: false, cost: "low",
      thresholds: ReviewCatalog.current.route.ledger,
    })).toBe("dropped")
    const snapshots: ReviewCatalog.Catalog[] = []
    const watch = (value: unknown) => ctx.invoke("maestro", value).pipe(
      Effect.provideService(ReviewAnalyze.ObserveCatalog, (catalog) => { snapshots.push(catalog) }),
    )
    const retainedBefore = yield* rows()
    const globalRequest = yield* watch(request(ctx.base, ctx.head, "global prior"))
    if (process.platform === "win32") {
      expect(globalRequest.type).toBe("error")
      expect(globalRequest.text).toContain("pr-facts-unsupported")
      expect(snapshots).toEqual([])
      expect(ctx.touches.children).toEqual([])
      expect(ctx.touches.prompts).toEqual([])
      expect(ctx.touches.resumes).toBe(0)
      expect(yield* rows()).toEqual(retainedBefore)
      return
    }
    if (globalRequest.type === "error") return yield* Effect.die(new Error(globalRequest.text))
    const globalCandidate = candidateOf(globalRequest.text)
    const globalFacts = yield* storedOf(globalCandidate)
    if (!globalFacts) return yield* Effect.die("completed review published no host facts")
    const globalCatalog = ReviewPrecisionCatalog.effective({ project: Project.ID.global, catalog: ReviewCatalog.current, batches: dropped })
    const seen = snapshots[0]
    if (!seen) return yield* Effect.die("registered analyze did not observe a catalog")
    expect(nativeStatus(seen)).toBe("dropped")
    expect(globalFacts.routing.catalog).toBe(ReviewCatalog.catalogDigest(seen).slice("sha256:".length))
    expect(globalFacts.routing.catalog).toBe(digest(dropped, Project.ID.global))
    expect(nativeStatus(globalCatalog)).toBe("dropped")
    expect(globalCatalog.packs.find((entry) => entry.id === "gitleaks")?.status).toBe(pack.status)
    expect(ctx.touches.prompts.join("\n")).not.toContain(generation)
    expect(ctx.touches.prompts.join("\n")).not.toContain("fp-ambient-")
    yield* ReviewPrecisionStore.append({
      review: "local:first", project: Project.ID.global,
      reads: [{ ...read("local", 0), outcome: "not-pursued" }],
    })
    const localHistory = yield* ReviewPrecisionStore.history()
    expect(ReviewLedger.status(localHistory, {
      project: Project.ID.global, pack: "gitleaks", rule: native, generation, repository: false, cost: "low",
      thresholds: ReviewCatalog.current.route.ledger,
    })).toBe("probation")
    const localRequest = yield* watch(request(ctx.base, ctx.head, "first local read"))
    if (localRequest.type === "error") return yield* Effect.die(new Error(localRequest.text))
    const localFacts = yield* storedOf(candidateOf(localRequest.text))
    if (!localFacts) return yield* Effect.die("local review published no host facts")
    const localSeen = snapshots[1]
    if (!localSeen) return yield* Effect.die("second registered analyze did not observe a catalog")
    expect(nativeStatus(localSeen)).toBe("probation")
    expect(localFacts.routing.catalog).toBe(ReviewCatalog.catalogDigest(localSeen).slice("sha256:".length))
    expect(localFacts.routing.catalog).toBe(digest(localHistory, Project.ID.global))
    expect(localFacts.routing.catalog).not.toBe(globalFacts.routing.catalog)
    const retained = yield* rows()
    expect(prior.every((id) => retained.some((row) => row.id === id))).toBe(true)
    expect(retained.filter((row) => {
      const data = row.data as { review?: string }
      return data.review?.startsWith("pr:")
    }).length).toBe(2)
  }))),
)

test(process.platform === "win32"
  ? "Windows refuses a precision retry before a drain or precision publication"
  : "a completed PR retry keeps the first snapshot after ambient history advances", () => {
  const advanced = { done: false }
  const captured: { database?: Database.Interface; events?: EventV2.Interface } = {}
  return Effect.runPromise(run(skills, {
    beforeResume: () => {
      const database = captured.database
      const events = captured.events
      if (!database || !events) return Effect.die(new Error("precision services were not captured"))
      return Effect.gen(function* () {
        if (advanced.done) return
        advanced.done = true
        yield* ReviewPrecisionStore.append({
          review: "mid-drain:demote", project: Project.ID.global, reads: [read("mid", 19)],
        }).pipe(
          Effect.provideService(Database.Service, database),
          Effect.provideService(EventV2.Service, events),
        )
      })
    },
  }, (ctx) => Effect.gen(function* () {
    captured.database = yield* Database.Service
    captured.events = yield* EventV2.Service
    yield* seed(Project.ID.global, 19, "before")
    const before = yield* ReviewPrecisionStore.history()
    const snapshot = digest(before, Project.ID.global)
    const snapshots: ReviewCatalog.Catalog[] = []
    const watch = (value: unknown) => ctx.invoke("maestro", value).pipe(
      Effect.provideService(ReviewAnalyze.ObserveCatalog, (catalog) => { snapshots.push(catalog) }),
    )
    const retainedBefore = yield* rows()
    const first = yield* watch(request(ctx.base, ctx.head, "immutable retry"))
    if (process.platform === "win32") {
      expect(first.type).toBe("error")
      expect(first.text).toContain("pr-facts-unsupported")
      expect(snapshots).toEqual([])
      expect(ctx.touches.children).toEqual([])
      expect(ctx.touches.prompts).toEqual([])
      expect(ctx.touches.resumes).toBe(0)
      expect(advanced.done).toBe(false)
      expect(yield* rows()).toEqual(retainedBefore)
      return
    }
    if (first.type === "error") return yield* Effect.die(new Error(first.text))
    const candidate = candidateOf(first.text)
    const facts = yield* storedOf(candidate)
    if (!facts) return yield* Effect.die("completed review published no host facts")
    const seen = snapshots[0]
    if (!seen) return yield* Effect.die("registered analyze did not observe a catalog")
    expect(snapshots).toHaveLength(1)
    expect(nativeStatus(seen)).toBe("probation")
    expect(facts.routing.catalog).toBe(ReviewCatalog.catalogDigest(seen).slice("sha256:".length))
    expect(facts.routing.catalog).toBe(snapshot)
    expect(digest(yield* ReviewPrecisionStore.history(), Project.ID.global)).not.toBe(snapshot)
    const prompts = ctx.touches.prompts.length
    const resumes = ctx.touches.resumes
    const children = ctx.touches.children.length
    const admitted = (yield* rows()).filter((row) => (row.data as { review?: string }).review === `pr:${candidate}`)
    expect(admitted).toHaveLength(1)
    yield* seed(other, 40, "after")
    const observed = snapshots.length
    const again = yield* watch(request(ctx.base, ctx.head, "immutable retry"))
    expect(snapshots).toHaveLength(observed)
    expect(again.text).toBe(first.text)
    expect(candidateOf(again.text)).toBe(candidate)
    expect(ctx.touches.prompts.length).toBe(prompts)
    expect(ctx.touches.resumes).toBe(resumes)
    expect(ctx.touches.children.length).toBe(children)
    const retryFacts = yield* storedOf(candidate)
    expect(retryFacts).toEqual(facts)
    const retryRows = (yield* rows()).filter((row) => (row.data as { review?: string }).review === `pr:${candidate}`)
    expect(retryRows.map((row) => `${row.id}:${row.seq}`)).toEqual(admitted.map((row) => `${row.id}:${row.seq}`))
    expect((yield* rows()).some((row) => (row.data as { review?: string }).review?.startsWith("after:"))).toBe(true)
    expect(ctx.touches.prompts.join("\n")).not.toContain(generation)
  })))
})

test(process.platform === "win32"
  ? "Windows names its platform refusal before corrupt precision history is inspected"
  : "corrupt precision history fails before a child and does not become empty history", () =>
  Effect.runPromise(run(skills, {}, (ctx) => Effect.gen(function* () {
    yield* seed(Project.ID.global, 1, "corrupt-seed")
    const database = yield* Database.Service
    yield* database.db.update(EventTable).set({ type: "review.unexpected.1" }).where(eq(EventTable.aggregate_id, ReviewPrecisionEvent.Aggregate)).run().pipe(Effect.orDie)
    const snapshots: ReviewCatalog.Catalog[] = []
    const failed = yield* ctx.invoke("maestro", request(ctx.base, ctx.head, "corrupt history")).pipe(
      Effect.provideService(ReviewAnalyze.ObserveCatalog, (catalog) => { snapshots.push(catalog) }),
    )
    expect(failed.type).toBe("error")
    expect(failed.text).toContain(process.platform === "win32" ? "pr-facts-unsupported" : "precision-history")
    expect(failed.text.startsWith("PR identity:")).toBe(false)
    expect(snapshots).toEqual([])
    expect(ctx.touches.children).toEqual([])
    expect(ctx.touches.prompts).toEqual([])
    expect(ctx.touches.resumes).toBe(0)
  }))),
)
