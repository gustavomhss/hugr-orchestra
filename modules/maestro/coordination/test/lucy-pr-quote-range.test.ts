import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { EventTable } from "@orchestra/core/event/sql"
import { GitCli } from "@orchestra/core/git-cli"
import { Database } from "@orchestra/core/database/database"
import { ReviewPrecisionEvent } from "@orchestra/schema/review-precision-event"
import { ReviewResultV2 } from "../src/v2/governance/review-result"
import { authoredSkills, run } from "./fixture/lucy-pr-entry"

// Quote-range existence only. A decoded finding is not proof that its claim is true.
// The fixture card stays the host's routing, scope, checks, blockers, outcome and verdict.

const skills = await authoredSkills()
const fence = (value: unknown) => "```" + ReviewResultV2.TAG + "\n" + JSON.stringify(value) + "\n```"

const finding = (line: number, endLine: number) => ({
  id: "F1",
  path: "src/a",
  line,
  endLine,
  severity: "P1" as const,
  confidence: "high" as const,
  class: "logic.invariant",
  node: "lucy-lens-correctness-logic",
  lens: "correctness-logic",
  rule: "logic.invariant",
  trigger: "quoted source range",
  rungs: ["quote"],
  evidence: { kind: "quote" as const, path: "src/a", startLine: line, endLine },
  status: "open" as const,
})

const withFinding = (line: number, endLine: number) => (cardText: string) => {
  const card = ReviewResultV2.parse(cardText)
  if (!card) throw new Error("fixture finish card did not parse")
  return fence({ ...card, findings: [finding(line, endLine)] })
}

const request = (base: string, head: string) =>
  ({ kind: "pr" as const, baseRef: base, headRef: head, tier: "quick" as const, prText: "quote range" })

const precision = () =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    return yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, ReviewPrecisionEvent.Aggregate)).all().pipe(Effect.orDie)
  })

const commitHead = (directory: string, bytes: string) =>
  Effect.gen(function* () {
    const cli = yield* GitCli.Service
    const git = (args: readonly string[]) =>
      cli.run(["-c", "user.email=review@example.com", "-c", "user.name=Review", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], { cwd: directory }).pipe(
        Effect.flatMap((result) => result.exitCode === 0 ? Effect.succeed(result.text().trim()) : Effect.die(new Error(result.stderr.toString()))),
      )
    yield* Effect.promise(() => fs.writeFile(path.join(directory, "src", "a"), bytes))
    yield* git(["add", "--", "src/a"])
    yield* git(["commit", "-q", "-m", "quote head"])
    return yield* git(["rev-parse", "HEAD"])
  })

test("a Quick blocked card admits one real added quote line and one precision row", () =>
  Effect.runPromise(run(skills, { finishCard: withFinding(1, 1) }, (ctx) => Effect.gen(function* () {
    const result = yield* ctx.invoke("maestro", request(ctx.base, ctx.head))
    expect(result.text).not.toContain("pr-card-invalid")
    expect(result.text).not.toContain("pr-quote-unavailable")
    const card = ReviewResultV2.parse(result.text)
    expect(card?.findings).toEqual([finding(1, 1)])
    expect(card?.outcome).not.toBe("done")
    const rows = yield* precision()
    expect(rows).toHaveLength(1)
    expect((rows[0].data as { review?: string }).review).toBe(`pr:${JSON.parse(result.text.slice("PR identity: ".length).split("\n")[0] ?? "").candidate}`)
  }))),
)

test("a quote that includes the trailing split sentinel is unavailable and admits nothing", () =>
  Effect.runPromise(run(skills, { finishCard: withFinding(1, 2) }, (ctx) => Effect.gen(function* () {
    const result = yield* ctx.invoke("maestro", request(ctx.base, ctx.head))
    expect(result.type).toBe("error")
    expect(result.text).toContain("pr-quote-unavailable")
    expect(result.text).toContain("quote range is empty or outside the head blob")
    expect(result.text).not.toContain("finding is not an added head line")
    expect(yield* precision()).toEqual([])
  }))),
)

test("a finding on a line the diff did not add is rejected before the blob is read", () =>
  Effect.runPromise(run(skills, { finishCard: withFinding(2, 2) }, (ctx) => Effect.gen(function* () {
    const result = yield* ctx.invoke("maestro", request(ctx.base, ctx.head))
    expect(result.type).toBe("error")
    expect(result.text).toContain("pr-quote-unavailable")
    expect(result.text).toContain("finding is not an added head line")
    expect(result.text).not.toContain("quote range is empty or outside the head blob")
    expect(yield* precision()).toEqual([])
  }))),
)

test("a blank-only added range is unavailable", () =>
  Effect.runPromise(run(skills, { finishCard: withFinding(1, 2) }, (ctx) => Effect.gen(function* () {
    const head = yield* commitHead(ctx.directory, "\n\n")
    const result = yield* ctx.invoke("maestro", request(ctx.base, head))
    expect(result.type).toBe("error")
    expect(result.text).toContain("pr-quote-unavailable")
    expect(result.text).toContain("quote range is empty or outside the head blob")
    expect(yield* precision()).toEqual([])
  }))),
)

test("CRLF and a final line without a newline still admit the one real line", () =>
  Effect.runPromise(run(skills, { finishCard: withFinding(1, 1) }, (ctx) => Effect.gen(function* () {
    for (const bytes of ["export const value = 2\r\n", "export const value = 2"]) {
      const head = yield* commitHead(ctx.directory, bytes)
      const result = yield* ctx.invoke("maestro", { ...request(ctx.base, head), prText: bytes })
      expect(result.text).not.toContain("pr-card-invalid")
      expect(result.text).not.toContain("pr-quote-unavailable")
      expect(ReviewResultV2.parse(result.text)?.findings[0]).toMatchObject({ line: 1, endLine: 1, severity: "P1" })
    }
    expect(yield* precision()).toHaveLength(2)
  }))),
)
