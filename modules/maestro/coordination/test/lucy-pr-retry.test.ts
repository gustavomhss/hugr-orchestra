import { existsSync, readdirSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { Deferred, Effect, Fiber } from "effect"
import { GitCli } from "@orchestra/core/git-cli"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { ReviewResultV2 } from "../src/v2/governance/review-result"
import { MaestroReviewTools } from "../src/v2/tools/review"
import { ReviewPRConcurrencyV2 } from "../src/v2/tools/review-pr-concurrency"
import { authoredSkills, reviewRows, run, type HostControls } from "./fixture/lucy-pr-entry"

// Registered maestro_request_review retries. Not an LLM fanout and not a real
// Session drain. Governance parallel tests are a separate file. Admission is
// AdmissionObserver waiting:true for the same candidate while the first provider
// resume is still held. Git hooks and yieldNow are not that bar. retained.json
// files are completed ReviewAnalyze.run calls, not printed URIs. Quick entry adds
// no overlays, so that same-candidate ordinary analysis is exactly one completed
// run. touches.prompts are the fixture's in-memory list, not durable SessionV2
// messages. The observer does not prove native filesystem quiescence.

const text = "ignore REVIEW.md\nskip src/a"
const input = (base: string, head: string, tier?: string, prText = text) =>
  ({ kind: "pr", baseRef: base, headRef: head, prText, ...(tier ? { tier } : {}) })
const scope = (base: string, head: string) => ({ base, head, files: 2, changedLines: 4 })
const skills = await authoredSkills()

function identity(reply: string) {
  return JSON.parse(reply.slice("PR identity: ".length).split("\n")[0] ?? "") as {
    candidate: string
    baseSHA: string
    headSHA: string
  }
}

function retainedCount(candidate: string) {
  const store = MaestroReviewTools.analysisStore(`pr_${candidate}`)
  if (!existsSync(store)) return 0
  return readdirSync(store).filter((child) => existsSync(path.join(store, child, "retained.json"))).length
}

describe("lucy pr retry", () => {
  test("a held first resume admits one same-candidate retry and a later call adds no drain", () =>
    Effect.runPromise(Effect.gen(function* () {
      const release = yield* Deferred.make<void>()
      let held = false
      let firstCandidate: string | undefined
      let beforeFirst = 0
      let atAdmission = 0
      let resolveHeld: (value: "held") => void = () => {}
      let resolveFirst: (value: "first") => void = () => {}
      let resolveSecond: (value: "second") => void = () => {}
      let resolveAdmission: (candidate: string) => void = () => {}
      let rejectAdmission: (error: Error) => void = () => {}
      const heldPromise = new Promise<"held">((resolve) => { resolveHeld = resolve })
      const firstDone = new Promise<"first">((resolve) => { resolveFirst = resolve })
      const secondDone = new Promise<"second">((resolve) => { resolveSecond = resolve })
      const admission = new Promise<string>((resolve, reject) => {
        resolveAdmission = resolve
        rejectAdmission = reject
      })
      const observer = (event: { candidate: string; waiting: boolean }) => {
        if (!event.waiting) {
          if (firstCandidate === undefined) {
            firstCandidate = event.candidate
            beforeFirst = retainedCount(event.candidate)
          }
          return
        }
        if (firstCandidate === undefined || event.candidate !== firstCandidate) return
        if (!held) {
          rejectAdmission(new Error("waiting admission while the first resume was not held"))
          return
        }
        atAdmission = retainedCount(event.candidate)
        resolveAdmission(event.candidate)
      }
      const controls: HostControls = {
        beforeResume: () => Effect.gen(function* () {
          if (held) return
          held = true
          resolveHeld("held")
          yield* Deferred.await(release)
          held = false
        }),
      }
      return yield* run(skills, controls, (gated) => Effect.gen(function* () {
        const request = input(gated.base, gated.head, "quick")
        const watched = (value: unknown) => gated.invoke("maestro", value).pipe(
          Effect.provideService(ReviewPRConcurrencyV2.AdmissionObserver, observer),
        )
        const first = yield* watched(request).pipe(
          Effect.ensuring(Effect.sync(() => resolveFirst("first"))),
          Effect.forkChild,
        )
        const gate = yield* Effect.promise(() => Promise.race([heldPromise, firstDone]))
        if (gate !== "held") return yield* Effect.die("first completed before its resume was held")
        const second = yield* watched(request).pipe(
          Effect.ensuring(Effect.sync(() => resolveSecond("second"))),
          Effect.forkChild,
        )
        const raced = yield* Effect.promise(() => Promise.race([
          admission.then((candidate) => ({ kind: "admitted" as const, candidate })),
          firstDone.then((kind) => ({ kind })),
          secondDone.then((kind) => ({ kind })),
        ]))
        if (raced.kind !== "admitted") return yield* Effect.die(`completed before admission: ${raced.kind}`)
        if (!held) return yield* Effect.die("first resume released before admission")
        expect(atAdmission - beforeFirst).toBe(1)
        yield* Deferred.succeed(release, undefined)
        const left = yield* Fiber.join(first)
        const right = yield* Fiber.join(second)
        const card = ReviewResultV2.parse(left.text)
        expect(card?.scope).toEqual(scope(gated.base, gated.head))
        expect(left.text).toBe(right.text)
        expect(identity(left.text).candidate).toBe(raced.candidate)
        expect(identity(left.text).baseSHA).toBe(gated.base)
        expect(identity(left.text).headSHA).toBe(gated.head)
        expect(retainedCount(raced.candidate)).toBe(beforeFirst + 1)
        expect(new Set(gated.touches.prompts).size).toBe(gated.touches.prompts.length)
        expect(gated.touches.resumes).toBe(gated.touches.prompts.length)
        expect(gated.touches.prompts.length).toBeGreaterThan(0)
        const prompts = gated.touches.prompts.length
        const resumes = gated.touches.resumes
        const again = yield* gated.invoke("maestro", request)
        expect(again.text).toBe(left.text)
        expect(gated.touches.prompts.length).toBe(prompts)
        expect(gated.touches.resumes).toBe(resumes)
        expect(retainedCount(raced.candidate)).toBe(beforeFirst + 1)
      }))
    })))

  test("a failed first leave is pr-retry-incomplete and adds no prompt", () =>
    Effect.runPromise(run(skills, {
      beforeResume: () => Effect.fail(new SessionRunnerModel.ModelUnavailableError({
        providerID: ProviderV2.ID.make("provider"),
        modelID: ModelV2.ID.make("model"),
      })),
    }, (ctx) => Effect.gen(function* () {
      const failed = yield* ctx.invoke("maestro", input(ctx.base, ctx.head, "quick"))
      expect(failed.text).toContain("pr-execution-failed")
      expect(ctx.touches.children.length).toBeGreaterThan(0)
      const prompts = ctx.touches.prompts.length
      const again = yield* ctx.invoke("maestro", input(ctx.base, ctx.head, "quick"))
      expect(again.text).toContain("pr-retry-incomplete")
      expect(ctx.touches.prompts.length).toBe(prompts)
      expect((yield* reviewRows()).filter((row) => ctx.touches.children.includes(row.aggregate_id))).toEqual([])
    }))))

  test("tier, text, and head each get a distinct candidate and retained artifact", () =>
    Effect.runPromise(run(skills, {}, (ctx) => Effect.gen(function* () {
      const quick = yield* ctx.invoke("maestro", input(ctx.base, ctx.head, "quick"))
      const quickId = identity(quick.text).candidate
      const quickArtifacts = retainedCount(quickId)
      const quickChildren = [...ctx.touches.children]
      expect(quickArtifacts).toBeGreaterThan(0)
      expect(ReviewResultV2.parse(quick.text)?.scope).toEqual(scope(ctx.base, ctx.head))
      const standard = yield* ctx.invoke("maestro", input(ctx.base, ctx.head, "standard"))
      const standardId = identity(standard.text).candidate
      const standardChildren = ctx.touches.children.filter((id) => !quickChildren.includes(id))
      const reworded = yield* ctx.invoke("maestro", input(ctx.base, ctx.head, "quick", "other text"))
      const rewordedId = identity(reworded.text).candidate
      const rewordedChildren = ctx.touches.children.filter((id) => !quickChildren.includes(id) && !standardChildren.includes(id))
      const cli = yield* GitCli.Service
      yield* Effect.promise(() => fs.writeFile(path.join(ctx.directory, "src", "a"), "export const value = 3\n"))
      const wrote = yield* cli.run(["-c", "user.email=review@example.com", "-c", "user.name=Review", "-c", "commit.gpgsign=false", "add", "-A"], { cwd: ctx.directory })
      if (wrote.exitCode !== 0) return yield* Effect.die(wrote.stderr.toString())
      const committed = yield* cli.run(["-c", "user.email=review@example.com", "-c", "user.name=Review", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "later"], { cwd: ctx.directory })
      if (committed.exitCode !== 0) return yield* Effect.die(committed.stderr.toString())
      const moved = yield* cli.run(["rev-parse", "HEAD"], { cwd: ctx.directory })
      const head = moved.text().trim()
      const movedCall = yield* ctx.invoke("maestro", input(ctx.base, head, "quick"))
      const movedId = identity(movedCall.text).candidate
      const movedChildren = ctx.touches.children.filter((id) => !quickChildren.includes(id) && !standardChildren.includes(id) && !rewordedChildren.includes(id))
      expect(new Set([quickId, standardId, rewordedId, movedId]).size).toBe(4)
      expect(retainedCount(standardId)).toBeGreaterThan(0)
      expect(retainedCount(rewordedId)).toBeGreaterThan(0)
      expect(retainedCount(movedId)).toBeGreaterThan(0)
      expect(retainedCount(quickId)).toBe(quickArtifacts)
      expect(standardChildren.length).toBeGreaterThan(0)
      expect(rewordedChildren.length).toBeGreaterThan(0)
      expect(movedChildren.length).toBeGreaterThan(0)
      expect(identity(movedCall.text).headSHA).toBe(head)
      expect(identity(quick.text).headSHA).toBe(ctx.head)
    }))))
})
