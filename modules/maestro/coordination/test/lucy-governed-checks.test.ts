import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { eq, like } from "drizzle-orm"
import { DateTime, Effect, Schema } from "effect"
import { Board } from "@orchestra/schema/board"
import { BoardNoteTable, BoardProjectTable } from "@orchestra/core/board/sql"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { EventTable } from "@orchestra/core/event/sql"
import { ProjectTable } from "@orchestra/core/project/sql"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { GovernanceRecordsV2 } from "../src/v2/governance/records"
import { MaestroReviewTools } from "../src/v2/tools/review"
import { authoredSkills, reviewRows, run } from "./fixture/lucy-pr-entry"
import { directory, projectID, restoreAlpha } from "./fixture/lucy-governed-repository"
import { briefsBySession, child, host, model, prompts, scripted, sessionID, time, turn } from "./fixture/lucy-governed-host"
import { CONFIRMED, HOST_FACTS, HOST_OUTCOMES, LOGIC_LENS, PLANTED, QUOTE_LINE, eligibleEntry, field, lensReturn, line, requireBindings, requireRecordID, retainedArtifacts, validationChecks, verifierReturn, workCard } from "./fixture/lucy-governed-data"

// Registered maestro_record_review during a scoped finish drain. The Session
// double admits prompts in memory only; this is not durable Session execution.
// A scripted prompt route is fixture-only and is not host round authority.
// Receipt refusal is counted before maestro.review publication and board notes.

test("a scoped finish refuses a governed receipt before a review event or board note", () =>
  Effect.runPromise(Effect.gen(function* () {
    const database = yield* Database.Service
    const registry = yield* ToolRegistry.Service
    const db = database.db
    const call = (agent: string, name: string, input: unknown, session = sessionID) =>
      registry.materialize().pipe(
        Effect.flatMap((materialized) => materialized.settle({
          sessionID: session, agent: AgentV2.ID.make(agent), assistantMessageID: SessionMessage.ID.make("msg_calling"),
          call: { type: "tool-call", id: `call_${name}_${agent}`, name, input },
        })),
        Effect.map((settled) => ({ type: settled.result.type, text: String(settled.result.value) })),
      )
    const reviewEvents = () => db.select().from(EventTable).where(like(EventTable.type, "maestro.review%")).all().pipe(Effect.orDie)
    const reviewNotes = () => db.select({ id: BoardNoteTable.id }).from(BoardNoteTable).where(eq(BoardNoteTable.kind, "review")).all().pipe(Effect.orDie)
    yield* db.insert(ProjectTable).values({ id: projectID, worktree: directory, sandboxes: [] }).onConflictDoNothing().run().pipe(Effect.orDie)
    yield* db.insert(SessionTable).values({
      id: sessionID, project_id: projectID, directory, slug: "chain", title: "chain", version: "test", agent: AgentV2.defaultID,
    }).onConflictDoNothing().run().pipe(Effect.orDie)
    const encode = Schema.encodeSync(SessionMessage.Message)
    const seq = { next: 1 }
    yield* db.insert(SessionMessageTable).values([
      SessionMessage.User.make({ id: SessionMessage.ID.make("msg_owner"), type: "user", text: "Ship the CSV export", time }),
      SessionMessage.Assistant.make({ id: SessionMessage.ID.make("msg_calling"), type: "assistant", agent: "maestro", model, content: [], time }),
    ].map((message) => {
      const { id, type, ...data } = encode(message)
      return { id: SessionMessage.ID.make(id), session_id: sessionID, type, seq: seq.next++, time_created: DateTime.toEpochMillis(message.time.created), data }
    })).onConflictDoNothing().run().pipe(Effect.orDie)
    child.create = (input) => db.insert(SessionTable).values({
      id: input.id, project_id: projectID, parent_id: input.parentID, directory, slug: "lucy", title: "lucy", version: "test", agent: "lucy",
    }).onConflictDoNothing().run().pipe(Effect.orDie, Effect.asVoid)
    let recordHits = 0
    const stages: string[] = []
    child.resume = (id) => Effect.gen(function* () {
      const prompt = prompts.at(-1) ?? ""
      const stage = prompt.includes("Stage: finish") ? "finish" : prompt.includes("Stage: hunt") ? "hunt" : prompt.includes("Stage: verify") ? "verify" : prompt.includes("review-entry") ? "entry" : "other"
      stages.push(stage)
      if (!prompt.includes("artifact JSON:") || stage !== "finish") return
      if (prompt.includes("entry stage returned no eligible record"))
        return yield* Effect.die(`reach-blocker: blocked entry cannot prove publication authorize. stages=${stages.join(",")}`)
      recordHits += 1
      const factsLine = prompt.slice(prompt.indexOf(HOST_FACTS) + HOST_FACTS.length).split("\n")[0]
      const facts = JSON.parse(factsLine ?? "") as {
        checks: { status?: string; pack?: string; accepted?: boolean }[]
        blockers: { kind: string; ref?: string }[]
      }
      const outcomes = JSON.parse(prompt.slice(prompt.indexOf(HOST_OUTCOMES) + HOST_OUTCOMES.length).split("\n")[0] ?? "null")
      if (!Array.isArray(outcomes)) return yield* Effect.die("finish brief has no host outcomes")
      if (facts.blockers.length === 0) return yield* Effect.die("registered finish produced no host blocker")
      const acquired = facts.checks.find((check) => check.status === "acquisition-error")
      if (!facts.blockers.some((blocker) => blocker.kind === "acquisition-error" || blocker.kind === "check-unavailable"))
        return yield* Effect.die(`host blockers are not a required-check refusal: ${JSON.stringify(facts.blockers)}`)
      if (acquired) expect(acquired.accepted).not.toBe(true)
      const method = line(prompt, "reviewMethodVersion: ")
      const routingDigest = line(prompt, "routingDigest: ")
      const catalogDigest = line(prompt, "catalogDigest: ")
      if (!method || !routingDigest || !catalogDigest) return yield* Effect.die("finish brief has no host method or digests")
      const artifact = JSON.parse(line(prompt, "artifact JSON: ") ?? "null")
      const base = {
        validationRecordID: /validationRecordID: (\S+)/.exec(prompt)?.[1],
        workCard, findings: [], items: outcomes, artifact, checks: JSON.parse(line(prompt, "checks JSON: ") ?? "null"), stage: "plan",
        reviewMethodVersion: method, routingDigest, catalogDigest,
      }
      const events = (yield* reviewEvents()).length
      const notes = (yield* reviewNotes()).length
      expect(events).toBe(0)
      expect(notes).toBe(0)
      const refused = yield* call("lucy", "maestro_record_review", { ...base, verdict: "APPROVE", findings: [] }, id)
      expect(refused.text).not.toContain("Review recording opens only in the lead's final turn")
      expect(refused.text).not.toContain("outcome-binding-mismatch")
      expect(refused.text).not.toContain("review-binding-missing")
      expect(refused.text).toContain("checks-blocked")
      expect((yield* reviewEvents()).length).toBe(0)
      expect((yield* reviewNotes()).length).toBe(0)
      if (acquired) expect(facts.blockers.some((blocker) => blocker.kind === "acquisition-error")).toBe(true)
      const legacy = yield* call("lucy", "maestro_record_review", { ...base, reviewMethodVersion: "review-v1", verdict: "APPROVE" }, id)
      expect(legacy.text.startsWith("REJECT:") || legacy.text.startsWith("APPROVE:")).toBe(false)
      expect((yield* reviewEvents()).length).toBe(events)
      const altered = yield* call("lucy", "maestro_record_review", { ...base, routingDigest: "f".repeat(64), verdict: "APPROVE" }, id)
      expect(altered.text.startsWith("APPROVE:")).toBe(false)
      expect((yield* reviewEvents()).length).toBe(events)
      const missing = yield* call("lucy", "maestro_record_review", { ...base, routingDigest: undefined, verdict: "APPROVE" }, id)
      expect(missing.text.startsWith("APPROVE:")).toBe(false)
      expect((yield* reviewEvents()).length).toBe(events)
    }).pipe(Effect.orDie)
    const admission = yield* call("maestro", "maestro_record_admission", {
      methodVersion: "admit-request-v1",
      assessment: { kind: "work", goal: "Ship the CSV export", known: [{ text: "The owner wants CSV export", source: "stakeholder" }], proposals: [], unknowns: [], uncertainty: "low", activeWorkEffect: "none", reason: "Goal and scope are clear" },
    })
    if (admission.type === "error") return yield* Effect.die(new Error(admission.text))
    expect(admission.type).toBe("text")
    const planned = yield* call("maestro", "maestro_record_plan_revision", {
      admissionMessageID: "msg_owner", methodVersion: "plan-v1", goal: field("CSV export"), acceptance: [field("A CSV downloads")],
      scope: [field("backend")], units: ["packages/alpha/shared"], constraints: [], reviewRequirement: field("cold review"), assumptions: [], risks: [],
    })
    const revision = JSON.parse(planned.text.split("\n").find((item) => item.startsWith("Bindings: "))?.slice("Bindings: ".length) ?? "{}") as { planRevisionID: string }
    const context = yield* call("maestro", "maestro_record_context", { planRevisionID: revision.planRevisionID })
    const contextBindings = JSON.parse(context.text.split("\n").find((item) => item.startsWith("Bindings: "))?.slice("Bindings: ".length) ?? "{}") as { contextRecordID: string; contextHash: string }
    const validated = yield* call("maestro", "maestro_record_validation", {
      planRevisionID: revision.planRevisionID, contextRecordID: contextBindings.contextRecordID, contextHash: contextBindings.contextHash,
      projectID, workCardID: "card_export", workCard, routedMemberID: "backend", validatorVersion: "validator-v1", checks: validationChecks,
    })
    const validation = JSON.parse(validated.text.split("\n").find((item) => item.startsWith("Bindings: "))?.slice("Bindings: ".length) ?? "{}") as { validationRecordID: string }
    const reviewed = yield* call("maestro", "maestro_request_review", {
      validationRecordID: validation.validationRecordID, workCard, reviewMethodVersion: "review-v2/plan/quick",
    })
    if (recordHits === 0)
      return yield* Effect.die(`callback never reached the record branch. stages=${stages.join(",") || "none"} last=${(prompts.at(-1) ?? "").slice(0, 240)} result=${reviewed.text.slice(0, 240)}`)
    expect(recordHits).toBeGreaterThan(0)
    expect(reviewed.text.startsWith("APPROVE:")).toBe(false)
  }).pipe(Effect.provide(host))))

const skills = await authoredSkills()

// Names the Windows private-store refusal, not a successful card review.
test(process.platform === "win32"
  ? "card-only PR refuses the unsupported private replay store before a child or receipt"
  : "card-only finish cannot record a receipt", () =>
  Effect.runPromise(run(skills, {}, (ctx) => Effect.gen(function* () {
    const before = yield* reviewRows()
    const result = yield* ctx.invoke("maestro", { kind: "pr", baseRef: ctx.base, headRef: ctx.head, tier: "quick", prText: "x" })
    if (process.platform === "win32") {
      expect(result.type).toBe("error")
      expect(result.text).toContain("pr-facts-unsupported")
      expect(ctx.touches.children).toEqual([])
      expect(ctx.touches.prompts).toEqual([])
      expect(ctx.touches.resumes).toBe(0)
      expect(yield* reviewRows()).toEqual(before)
      return
    }
    const child = ctx.touches.children[0]
    if (!child) return yield* Effect.die("no child")
    const registry = yield* ToolRegistry.Service
    const recorded = yield* registry.materialize().pipe(
      Effect.flatMap((materialized) => materialized.settle({
        sessionID: SessionSchema.ID.make(child), agent: AgentV2.ID.make("lucy"), assistantMessageID: SessionMessage.ID.make("msg_pr_entry"),
        call: { type: "tool-call", id: "call_record", name: "maestro_record_review", input: {
          validationRecordID: "val", workCard: "card", reviewMethodVersion: "review-v2/pr/quick", verdict: "APPROVE", findings: [],
          artifact: { baseSHA: ctx.base, headSHA: ctx.head, worktree: ctx.directory, changedPaths: ["src/a"], sha256: "cd".repeat(32) }, checks: [],
        } },
      })),
      Effect.map((settled) => String(settled.result.value)),
    )
    expect(recorded).toContain("Review recording opens only in the lead's final turn")
    expect(yield* reviewRows()).toEqual(before)
  }))))

test("a Quick finish pages before record, then seals that snapshot", () =>
  Effect.runPromise(Effect.gen(function* () {
    prompts.length = 0
    const database = yield* Database.Service
    const registry = yield* ToolRegistry.Service
    const db = database.db
    const parent = SessionSchema.ID.make("ses_outcome_governed")
    let calls = 0
    const call = (agent: string, name: string, input: unknown, session = parent) =>
      registry.materialize().pipe(
        Effect.flatMap((materialized) => materialized.settle({
          sessionID: session, agent: AgentV2.ID.make(agent), assistantMessageID: SessionMessage.ID.make("msg_calling_outcome"),
          call: { type: "tool-call", id: `call_outcome_${calls++}`, name, input },
        })),
        Effect.map((settled) => ({ type: settled.result.type, text: String(settled.result.value) })),
      )
    const rows = (pattern: string) => db.select().from(EventTable).where(like(EventTable.type, pattern)).all().pipe(Effect.orDie)
    yield* db.insert(ProjectTable).values({ id: projectID, worktree: directory, sandboxes: [] }).onConflictDoNothing().run().pipe(Effect.orDie)
    yield* db.insert(SessionTable).values({
      id: parent, project_id: projectID, directory, slug: "outcome", title: "outcome", version: "test", agent: AgentV2.defaultID,
    }).onConflictDoNothing().run().pipe(Effect.orDie)
    yield* db.insert(BoardProjectTable).values({
      id: Board.ProjectID.create(), key: "OUTCOME", name: "Outcome", goal: "Governed page.", status: "active",
      github_state: "off", next_issue_number: 1, next_epic_number: 1, repo_project_id: projectID,
      review_accepted_unavailable: ["no-build"],
    }).run().pipe(Effect.orDie)
    const encode = Schema.encodeSync(SessionMessage.Message)
    yield* db.insert(SessionMessageTable).values([
      SessionMessage.User.make({ id: SessionMessage.ID.make("msg_owner_outcome"), type: "user", text: "Ship the CSV export", time }),
      SessionMessage.Assistant.make({ id: SessionMessage.ID.make("msg_calling_outcome"), type: "assistant", agent: "maestro", model, content: [], time }),
    ].map((message, index) => {
      const { id, type, ...data } = encode(message)
      return { id: SessionMessage.ID.make(id), session_id: parent, type, seq: index + 1, time_created: DateTime.toEpochMillis(message.time.created), data }
    })).onConflictDoNothing().run().pipe(Effect.orDie)
    child.create = (input) => db.insert(SessionTable).values({
      id: input.id, project_id: projectID, parent_id: input.parentID, directory, slug: "lucy", title: "lucy", version: "test", agent: "lucy",
    }).onConflictDoNothing().run().pipe(Effect.orDie, Effect.asVoid)
    child.resume = (id) => Effect.gen(function* () {
      const prompt = prompts.at(-1) ?? ""
      if (!prompt.includes("artifact JSON:")) return
      const retained = /review:([0-9a-f-]{36})\/retained\.json/.exec(prompt)
      const lens = /analyzer items for ([^ (]+)/.exec(prompt)?.[1]
      const validationID = /validationRecordID: (\S+)/.exec(prompt)?.[1]
      if (!retained || !lens || !validationID) return yield* Effect.die("finish brief has no retained page")
      const file = path.join(MaestroReviewTools.analysisStore(`review_${validationID}_plan`), retained[1], "retained.json")
      const text = yield* Effect.promise(() => Bun.file(file).text().catch(() => undefined))
      if (!text) return yield* Effect.die(`retained artifact missing: ${file}`)
      const retainedItems = JSON.parse(text) as { items: Record<string, unknown>[] }
      const extra = {
        fingerprint: "fp-paged-primary", class: "logic.invariant", lens, pack: "gitleaks", rule: "paged-rule",
        ruleStatus: "probation", severity: "P2", path: "docs/export.md", line: 1, snippetDigest: "digest",
        sources: [{ pack: "gitleaks", rule: "paged-rule" }], triage: "triage", onChangedLine: true,
      }
      retainedItems.items.push(extra)
      yield* Effect.promise(() => Bun.write(file, JSON.stringify(retainedItems)))
      const paged = yield* call("lucy", "review_analyze", { op: "page", lens }, id)
      if (paged.type === "error" || !paged.text.includes("fp-paged-primary")) return yield* Effect.die(new Error(paged.text))
      const pageItems = JSON.parse(paged.text) as { items: { pack: string; rule: string; fingerprint: string }[] }
      const initial = [...prompt.matchAll(/<data name="analyzer items for [^"]*">\n([\s\S]*?)\n<\/data>/g)].flatMap((match) => {
        const parsed = JSON.parse(match[1]) as { pack: string; rule: string; fingerprint: string }[]
        if (!Array.isArray(parsed)) throw new Error("analyzer items block is not a list")
        return parsed
      })
      const projection = [...new Map([...initial, ...pageItems.items].map((entry) => [entry.fingerprint, {
        pack: entry.pack, rule: entry.rule, fingerprint: entry.fingerprint, outcome: "not-pursued" as const,
      }])).values()]
      if (!projection.some((entry) => entry.fingerprint === "fp-paged-primary")) return yield* Effect.die("page did not deliver the primary")
      const method = line(prompt, "reviewMethodVersion: ")
      const routingDigest = line(prompt, "routingDigest: ")
      const catalogDigest = line(prompt, "catalogDigest: ")
      if (!method || !routingDigest || !catalogDigest) return yield* Effect.die("finish brief has no host method or digests")
      const base = {
        validationRecordID: validationID, workCard, findings: [],
        artifact: JSON.parse(line(prompt, "artifact JSON: ") ?? "null"),
        checks: JSON.parse(line(prompt, "checks JSON: ") ?? "null"),
        stage: "plan" as const, reviewMethodVersion: method, routingDigest, catalogDigest,
      }
      expect((yield* rows("maestro.review%")).length).toBe(0)
      expect((yield* rows("review.precision%")).length).toBe(0)
      const omitted = yield* call("lucy", "maestro_record_review", { ...base, verdict: "APPROVE", items: [] }, id)
      expect(omitted.text.startsWith("APPROVE:")).toBe(false)
      const missing = yield* call("lucy", "maestro_record_review", { ...base, verdict: "APPROVE" }, id)
      expect(missing.text.startsWith("APPROVE:")).toBe(false)
      const changed = yield* call("lucy", "maestro_record_review", {
        ...base, verdict: "APPROVE", items: projection.map((entry, index) => index === 0 ? { ...entry, outcome: "confirmed" as const } : entry),
      }, id)
      expect(changed.text.startsWith("APPROVE:")).toBe(false)
      expect((yield* rows("maestro.review%")).length).toBe(0)
      expect((yield* rows("review.precision%")).length).toBe(0)
      const recorded = yield* call("lucy", "maestro_record_review", { ...base, verdict: "APPROVE", items: [...projection].reverse() }, id)
      if (!recorded.text.startsWith("APPROVE:")) return yield* Effect.die(new Error(recorded.text))
      const receipt = recorded.text.slice("APPROVE: ".length).trim()
      expect((yield* rows("maestro.review%")).length).toBe(1)
      const admitted = yield* rows("review.precision%")
      expect(admitted).toHaveLength(1)
      const admittedData = admitted[0].data as { review?: string; project?: string; reads?: { fingerprint: string; generation: string }[] }
      expect(admittedData.review).toBe(receipt)
      expect(admittedData.project).toBe(projectID)
      expect(admittedData.reads?.some((read) => read.fingerprint === "fp-paged-primary")).toBe(true)
      expect(admittedData.reads?.every((read) => /^[0-9a-f]{64}$/.test(read.generation))).toBe(true)
      retainedItems.items.push({ ...extra, fingerprint: "fp-after-seal" })
      yield* Effect.promise(() => Bun.write(file, JSON.stringify(retainedItems)))
      const sealed = yield* call("lucy", "review_analyze", { op: "page", lens }, id)
      expect(sealed.text).toContain("outcome-delivery-sealed")
      expect(sealed.text).not.toContain("fp-after-seal")
      expect(yield* rows("review.precision%")).toEqual(admitted)
      const retry = yield* call("lucy", "maestro_record_review", { ...base, verdict: "APPROVE", items: projection }, id)
      expect(retry.text).toBe(recorded.text)
      expect((yield* rows("maestro.review%")).length).toBe(1)
      const after = yield* rows("review.precision%")
      expect(after).toHaveLength(1)
      expect(after[0].id).toBe(admitted[0].id)
      expect(after[0].seq).toBe(admitted[0].seq)
    }).pipe(Effect.orDie)
    const admission = yield* call("maestro", "maestro_record_admission", {
      methodVersion: "admit-request-v1",
      assessment: { kind: "work", goal: "Ship the CSV export", known: [{ text: "The owner wants CSV export", source: "stakeholder" }], proposals: [], unknowns: [], uncertainty: "low", activeWorkEffect: "none", reason: "Goal and scope are clear" },
    })
    if (admission.type === "error") return yield* Effect.die(new Error(admission.text))
    const planned = yield* call("maestro", "maestro_record_plan_revision", {
      admissionMessageID: "msg_owner_outcome", methodVersion: "plan-v1", goal: field("CSV export"), acceptance: [field("A CSV downloads")],
      scope: [field("backend")], units: ["packages/alpha/shared"], constraints: [], reviewRequirement: field("cold review"), assumptions: [], risks: [],
    })
    const revision = JSON.parse(planned.text.split("\n").find((item) => item.startsWith("Bindings: "))?.slice("Bindings: ".length) ?? "{}") as { planRevisionID: string }
    const context = yield* call("maestro", "maestro_record_context", { planRevisionID: revision.planRevisionID })
    const contextBindings = JSON.parse(context.text.split("\n").find((item) => item.startsWith("Bindings: "))?.slice("Bindings: ".length) ?? "{}") as { contextRecordID: string; contextHash: string }
    const validated = yield* call("maestro", "maestro_record_validation", {
      planRevisionID: revision.planRevisionID, contextRecordID: contextBindings.contextRecordID, contextHash: contextBindings.contextHash,
      projectID, workCardID: "card_outcome", workCard, routedMemberID: "backend", validatorVersion: "validator-v1", checks: validationChecks,
    })
    const validation = JSON.parse(validated.text.split("\n").find((item) => item.startsWith("Bindings: "))?.slice("Bindings: ".length) ?? "{}") as { validationRecordID: string }
    const reviewed = yield* call("maestro", "maestro_request_review", {
      validationRecordID: validation.validationRecordID, workCard, reviewMethodVersion: "review-v2/plan/quick", tier: "quick",
    })
    if ((yield* rows("maestro.review%")).length !== 1) return yield* Effect.die(new Error(reviewed.text))
  }).pipe(Effect.provide(host))))

test("a Standard finish refuses a forged finding and publishes the host-confirmed P1", () =>
  Effect.runPromise(Effect.gen(function* () {
    prompts.length = 0
    briefsBySession.clear()
    scripted.messages = (sessionID) => {
      const brief = briefsBySession.get(sessionID) ?? ""
      const key = brief.includes("Stage: finish") ? "finish" : brief.includes("Stage: hunt") ? "hunt" : brief.includes("Stage: verify") ? "verify" : brief.includes("review-entry") ? "entry" : ""
      if (!key) return undefined
      const text = key === "entry" ? eligibleEntry() : key === "hunt" ? lensReturn(brief) : key === "verify" ? verifierReturn(brief) : "recorded"
      return turn(sessionID, key, text)
    }
    const database = yield* Database.Service
    const registry = yield* ToolRegistry.Service
    const db = database.db
    const parent = SessionSchema.ID.make("ses_finding_governed")
    let calls = 0
    let recordHits = 0
    const held = { validationRecordID: "" }
    const stages: string[] = []
    const call = (agent: string, name: string, input: unknown, session = parent) =>
      registry.materialize().pipe(
        Effect.flatMap((materialized) => materialized.settle({
          sessionID: session, agent: AgentV2.ID.make(agent), assistantMessageID: SessionMessage.ID.make("msg_calling_finding"),
          call: { type: "tool-call", id: `call_finding_${calls++}`, name, input },
        })),
        Effect.map((settled) => ({ type: settled.result.type, text: String(settled.result.value) })),
      )
    const rows = (pattern: string) => db.select().from(EventTable).where(like(EventTable.type, pattern)).all().pipe(Effect.orDie)
    yield* db.insert(ProjectTable).values({ id: projectID, worktree: directory, sandboxes: [] }).onConflictDoNothing().run().pipe(Effect.orDie)
    yield* db.insert(SessionTable).values({
      id: parent, project_id: projectID, directory, slug: "finding", title: "finding", version: "test", agent: AgentV2.defaultID,
    }).onConflictDoNothing().run().pipe(Effect.orDie)
    yield* db.insert(BoardProjectTable).values({
      id: Board.ProjectID.create(), key: "FINDING", name: "Finding", goal: "Governed finding.", status: "active",
      github_state: "off", next_issue_number: 1, next_epic_number: 1, repo_project_id: projectID,
      review_accepted_unavailable: ["no-build"],
    }).run().pipe(Effect.orDie)
    const encode = Schema.encodeSync(SessionMessage.Message)
    yield* db.insert(SessionMessageTable).values([
      SessionMessage.User.make({ id: SessionMessage.ID.make("msg_owner_finding"), type: "user", text: "Ship the CSV export", time }),
      SessionMessage.Assistant.make({ id: SessionMessage.ID.make("msg_calling_finding"), type: "assistant", agent: "maestro", model, content: [], time }),
    ].map((message, index) => {
      const { id, type, ...data } = encode(message)
      return { id: SessionMessage.ID.make(id), session_id: parent, type, seq: index + 1, time_created: DateTime.toEpochMillis(message.time.created), data }
    })).onConflictDoNothing().run().pipe(Effect.orDie)
    child.create = (input) => db.insert(SessionTable).values({
      id: input.id, project_id: projectID, parent_id: input.parentID, directory, slug: "lucy", title: "lucy", version: "test", agent: "lucy",
    }).onConflictDoNothing().run().pipe(Effect.orDie, Effect.asVoid)
    child.resume = (id) => Effect.gen(function* () {
      const prompt = briefsBySession.get(id) ?? prompts.at(-1) ?? ""
      const stage = prompt.includes("Stage: finish") ? "finish" : prompt.includes("Stage: hunt") ? "hunt" : prompt.includes("Stage: verify") ? "verify" : "other"
      stages.push(stage)
      if (stage === "hunt") {
        const lens = /Stage: hunt, lens ([^,]+)/.exec(prompt)?.[1]
        if (lens !== LOGIC_LENS) return
        if (!held.validationRecordID) return yield* Effect.die("reach-blocker: fixture order, host validation id empty")
        const store = MaestroReviewTools.analysisStore(`review_${held.validationRecordID}_plan`)
        const found = yield* Effect.promise(() => retainedArtifacts(store))
        if (found.length !== 1) return yield* Effect.die(`reach-blocker: fixture order, expected one retained artifact under ${store}, found ${found.length}: ${found.join(", ") || "none"}`)
        const file = found[0]
        if (!file) return yield* Effect.die(`reach-blocker: fixture order, retained artifact missing under ${store}`)
        const text = yield* Effect.promise(() => Bun.file(file).text().catch(() => undefined))
        if (!text) return yield* Effect.die(`reach-blocker: retained artifact missing: ${file}`)
        const retainedItems = JSON.parse(text) as { items: Record<string, unknown>[] }
        retainedItems.items.push(PLANTED)
        yield* Effect.promise(() => Bun.write(file, JSON.stringify(retainedItems)))
        const paged = yield* call("lucy", "review_analyze", { op: "page", lens }, id)
        if (paged.type === "error" || !paged.text.includes(PLANTED.fingerprint))
          return yield* Effect.die(`reach-blocker: review_analyze.page did not deliver the planted item: ${paged.text.slice(0, 240)}`)
        return
      }
      if (stage !== "finish" || !prompt.includes("artifact JSON:")) return
      if (!prompt.includes(CONFIRMED))
        return yield* Effect.die(`reach-blocker: Standard finish has no host confirmed list. stages=${stages.join(",")}`)
      const confirmed = JSON.parse(/<data name="confirmed findings, as the host merged them">\n([\s\S]*?)\n<\/data>/.exec(prompt)?.[1] ?? "null") as {
        id: string; path: string; line: number; endLine?: number; severity: string; class: string; node: string; lens: string; rule: string; trigger: string; rungs: string[]; evidence: { kind: string; path: string; startLine: number; endLine: number }
      }[]
      const hostFinding = confirmed.find((item) => item.severity === "P1" && item.path === "docs/export.md")
      if (!hostFinding) return yield* Effect.die(`reach-blocker: host confirmed list has no P1 on docs/export.md. stages=${stages.join(",")} confirmed=${JSON.stringify(confirmed)}`)
      recordHits += 1
      const outcomes = JSON.parse(prompt.slice(prompt.indexOf(HOST_OUTCOMES) + HOST_OUTCOMES.length).split("\n")[0] ?? "null")
      if (!Array.isArray(outcomes) || outcomes.length === 0) return yield* Effect.die("reach-blocker: host outcomes omitted the planted item")
      const facts = JSON.parse(prompt.slice(prompt.indexOf(HOST_FACTS) + HOST_FACTS.length).split("\n")[0] ?? "") as { blockers: { kind: string }[] }
      if (facts.blockers.length > 0)
        return yield* Effect.die(`reach-blocker: finish is checks-blocked, so publication is not the gate under test: ${JSON.stringify(facts.blockers)}`)
      const method = line(prompt, "reviewMethodVersion: ")
      const routingDigest = line(prompt, "routingDigest: ")
      const catalogDigest = line(prompt, "catalogDigest: ")
      if (!method || !routingDigest || !catalogDigest) return yield* Effect.die("finish brief has no host method or digests")
      const finding = {
        id: hostFinding.id, path: hostFinding.path, line: hostFinding.line,
        ...(hostFinding.endLine === undefined ? {} : { endLine: hostFinding.endLine }),
        message: "The export claim is not held.", severity: hostFinding.severity, confidence: "high" as const,
        lens: hostFinding.lens, class: hostFinding.class, node: hostFinding.node, rule: hostFinding.rule,
        trigger: hostFinding.trigger, rungs: hostFinding.rungs, evidence: hostFinding.evidence, status: "open" as const,
      }
      const base = {
        validationRecordID: /validationRecordID: (\S+)/.exec(prompt)?.[1],
        workCard, artifact: JSON.parse(line(prompt, "artifact JSON: ") ?? "null"),
        checks: JSON.parse(line(prompt, "checks JSON: ") ?? "null"), stage: "plan" as const,
        reviewMethodVersion: method, routingDigest, catalogDigest, items: outcomes,
      }
      const events = (yield* rows("maestro.review%")).length
      const precision = (yield* rows("review.precision%")).length
      expect(events).toBe(0)
      expect(precision).toBe(0)
      const empty = yield* call("lucy", "maestro_record_review", { ...base, verdict: "APPROVE", findings: [] }, id)
      expect(empty.text).toContain("unverified-finding")
      expect((yield* rows("maestro.review%")).length).toBe(0)
      expect((yield* rows("review.precision%")).length).toBe(0)
      for (const changed of [
        { ...finding, severity: "P2" },
        { ...finding, path: "src/alpha.ts" },
        { ...finding, rungs: ["probe:test"] },
        { ...finding, evidence: { ...finding.evidence, path: "src/alpha.ts" } },
        { ...finding, id: "C9" },
        { ...finding, status: "resolved" },
      ]) {
        const refused = yield* call("lucy", "maestro_record_review", { ...base, verdict: "FIX_FIRST", findings: [changed] }, id)
        expect(refused.text).toContain("unverified-finding")
        expect((yield* rows("maestro.review%")).length).toBe(0)
        expect((yield* rows("review.precision%")).length).toBe(0)
      }
      const published = yield* call("lucy", "maestro_record_review", { ...base, verdict: "FIX_FIRST", findings: [finding] }, id)
      if (!published.text.startsWith("FIX_FIRST:")) return yield* Effect.die(new Error(published.text))
      expect((yield* rows("maestro.review%")).length).toBe(1)
      expect((yield* rows("review.precision%")).length).toBe(1)
    }).pipe(Effect.orDie)
    const admission = yield* call("maestro", "maestro_record_admission", {
      methodVersion: "admit-request-v1",
      assessment: { kind: "work", goal: "Ship the CSV export", known: [{ text: "The owner wants CSV export", source: "stakeholder" }], proposals: [], unknowns: [], uncertainty: "low", activeWorkEffect: "none", reason: "Goal and scope are clear" },
    })
    if (admission.type === "error") return yield* Effect.die(new Error(admission.text))
    const planned = yield* call("maestro", "maestro_record_plan_revision", {
      admissionMessageID: "msg_owner_finding", methodVersion: "plan-v1", goal: field("CSV export"), acceptance: [field("A CSV downloads")],
      scope: [field("backend")], units: ["packages/alpha/shared"], constraints: [], reviewRequirement: field("cold review"), assumptions: [], risks: [],
    })
    const revision = JSON.parse(planned.text.split("\n").find((item) => item.startsWith("Bindings: "))?.slice("Bindings: ".length) ?? "{}") as { planRevisionID: string }
    const context = yield* call("maestro", "maestro_record_context", { planRevisionID: revision.planRevisionID })
    const contextBindings = JSON.parse(context.text.split("\n").find((item) => item.startsWith("Bindings: "))?.slice("Bindings: ".length) ?? "{}") as { contextRecordID: string; contextHash: string }
    const validated = yield* call("maestro", "maestro_record_validation", {
      planRevisionID: revision.planRevisionID, contextRecordID: contextBindings.contextRecordID, contextHash: contextBindings.contextHash,
      projectID, workCardID: "card_finding", workCard, routedMemberID: "backend", validatorVersion: "validator-v1", checks: validationChecks,
    })
    const validation = JSON.parse(validated.text.split("\n").find((item) => item.startsWith("Bindings: "))?.slice("Bindings: ".length) ?? "{}") as { validationRecordID: string }
    held.validationRecordID = validation.validationRecordID
    if (!held.validationRecordID) return yield* Effect.die("reach-blocker: fixture order, validation tool returned no id")
    const reviewed = yield* call("maestro", "maestro_request_review", {
      validationRecordID: held.validationRecordID, workCard, reviewMethodVersion: "review-v2/plan/standard", tier: "standard",
    })
    if (recordHits === 0)
      return yield* Effect.die(`callback never reached the record branch. stages=${stages.join(",") || "none"} result=${reviewed.text.slice(0, 240)}`)
    expect(recordHits).toBeGreaterThan(0)
    expect(reviewed.text.startsWith("FIX_FIRST:")).toBe(true)
  }).pipe(Effect.provide(host), Effect.ensuring(Effect.sync(() => { scripted.messages = () => undefined })))))

test("a Quick finish refuses a fabricated quote and publishes an in-range P1", () =>
  Effect.runPromise(Effect.gen(function* () {
    prompts.length = 0
    briefsBySession.clear()
    scripted.messages = () => undefined
    const database = yield* Database.Service
    const registry = yield* ToolRegistry.Service
    const db = database.db
    const parent = SessionSchema.ID.make("ses_quote_governed")
    let calls = 0
    let recordHits = 0
    const stages: string[] = []
    const call = (agent: string, name: string, input: unknown, session = parent) =>
      registry.materialize().pipe(
        Effect.flatMap((materialized) => materialized.settle({
          sessionID: session, agent: AgentV2.ID.make(agent), assistantMessageID: SessionMessage.ID.make("msg_calling_quote"),
          call: { type: "tool-call", id: `call_quote_${calls++}`, name, input },
        })),
        Effect.map((settled) => ({ type: settled.result.type, text: String(settled.result.value) })),
      )
    const rows = (pattern: string) => db.select().from(EventTable).where(like(EventTable.type, pattern)).all().pipe(Effect.orDie)
    yield* db.insert(ProjectTable).values({ id: projectID, worktree: directory, sandboxes: [] }).onConflictDoNothing().run().pipe(Effect.orDie)
    yield* db.insert(SessionTable).values({
      id: parent, project_id: projectID, directory, slug: "quote", title: "quote", version: "test", agent: AgentV2.defaultID,
    }).onConflictDoNothing().run().pipe(Effect.orDie)
    yield* db.insert(BoardProjectTable).values({
      id: Board.ProjectID.create(), key: "QUOTE", name: "Quote", goal: "Governed quote.", status: "active",
      github_state: "off", next_issue_number: 1, next_epic_number: 1, repo_project_id: projectID,
      review_accepted_unavailable: ["no-build"],
    }).run().pipe(Effect.orDie)
    const encode = Schema.encodeSync(SessionMessage.Message)
    yield* db.insert(SessionMessageTable).values([
      SessionMessage.User.make({ id: SessionMessage.ID.make("msg_owner_quote"), type: "user", text: "Ship the CSV export", time }),
      SessionMessage.Assistant.make({ id: SessionMessage.ID.make("msg_calling_quote"), type: "assistant", agent: "maestro", model, content: [], time }),
    ].map((message, index) => {
      const { id, type, ...data } = encode(message)
      return { id: SessionMessage.ID.make(id), session_id: parent, type, seq: index + 1, time_created: DateTime.toEpochMillis(message.time.created), data }
    })).onConflictDoNothing().run().pipe(Effect.orDie)
    child.create = (input) => db.insert(SessionTable).values({
      id: input.id, project_id: projectID, parent_id: input.parentID, directory, slug: "lucy", title: "lucy", version: "test", agent: "lucy",
    }).onConflictDoNothing().run().pipe(Effect.orDie, Effect.asVoid)
    child.resume = (id) => Effect.gen(function* () {
      const prompt = briefsBySession.get(id) ?? prompts.at(-1) ?? ""
      const stage = prompt.includes("artifact JSON:") ? "finish" : prompt.includes("review-entry") ? "entry" : "other"
      stages.push(stage)
      if (stage !== "finish") return
      if (prompt.includes("entry stage returned no eligible record"))
        return yield* Effect.die(`reach-blocker: blocked entry cannot prove quote publication. stages=${stages.join(",")}`)
      recordHits += 1
      const outcomes = JSON.parse(prompt.slice(prompt.indexOf(HOST_OUTCOMES) + HOST_OUTCOMES.length).split("\n")[0] ?? "null")
      if (!Array.isArray(outcomes)) return yield* Effect.die("finish brief has no host outcomes")
      const facts = JSON.parse(prompt.slice(prompt.indexOf(HOST_FACTS) + HOST_FACTS.length).split("\n")[0] ?? "") as { blockers: { kind: string }[] }
      if (facts.blockers.length > 0)
        return yield* Effect.die(`reach-blocker: finish is checks-blocked, so publication is not the gate under test: ${JSON.stringify(facts.blockers)}`)
      const method = line(prompt, "reviewMethodVersion: ")
      const routingDigest = line(prompt, "routingDigest: ")
      const catalogDigest = line(prompt, "catalogDigest: ")
      if (!method || !routingDigest || !catalogDigest) return yield* Effect.die("finish brief has no host method or digests")
      const finding = {
        id: "Q1", path: "docs/export.md", line: QUOTE_LINE, message: "The export claim is not held.",
        severity: "P1" as const, confidence: "high" as const, lens: LOGIC_LENS, class: "logic.invariant",
        node: "lucy-review-prove-quote", rule: "logic.invariant", trigger: "The export claim is not held by the spec.",
        rungs: ["quote"], evidence: { kind: "quote" as const, path: "docs/export.md", startLine: QUOTE_LINE, endLine: QUOTE_LINE },
        status: "open" as const,
      }
      const base = {
        validationRecordID: /validationRecordID: (\S+)/.exec(prompt)?.[1],
        workCard, artifact: JSON.parse(line(prompt, "artifact JSON: ") ?? "null"),
        checks: JSON.parse(line(prompt, "checks JSON: ") ?? "null"), stage: "plan" as const,
        reviewMethodVersion: method, routingDigest, catalogDigest, items: outcomes,
      }
      expect((yield* rows("maestro.review%")).length).toBe(0)
      expect((yield* rows("review.precision%")).length).toBe(0)
      for (const changed of [
        { ...finding, evidence: { ...finding.evidence, startLine: 1, endLine: 1 } },
        { ...finding, evidence: { ...finding.evidence, path: "src/alpha.ts" } },
        { ...finding, rungs: ["probe:test"] },
      ]) {
        const refused = yield* call("lucy", "maestro_record_review", { ...base, verdict: "FIX_FIRST", findings: [changed] }, id)
        expect(refused.text).toContain("unverified-finding")
        expect((yield* rows("maestro.review%")).length).toBe(0)
        expect((yield* rows("review.precision%")).length).toBe(0)
      }
      const published = yield* call("lucy", "maestro_record_review", { ...base, verdict: "FIX_FIRST", findings: [finding] }, id)
      if (!published.text.startsWith("FIX_FIRST:")) return yield* Effect.die(new Error(published.text))
      expect((yield* rows("maestro.review%")).length).toBe(1)
      expect((yield* rows("review.precision%")).length).toBe(1)
    }).pipe(Effect.orDie)
    const admission = yield* call("maestro", "maestro_record_admission", {
      methodVersion: "admit-request-v1",
      assessment: { kind: "work", goal: "Ship the CSV export", known: [{ text: "The owner wants CSV export", source: "stakeholder" }], proposals: [], unknowns: [], uncertainty: "low", activeWorkEffect: "none", reason: "Goal and scope are clear" },
    })
    if (admission.type === "error") return yield* Effect.die(new Error(admission.text))
    const planned = yield* call("maestro", "maestro_record_plan_revision", {
      admissionMessageID: "msg_owner_quote", methodVersion: "plan-v1", goal: field("CSV export"), acceptance: [field("A CSV downloads")],
      scope: [field("backend")], units: ["packages/alpha/shared"], constraints: [], reviewRequirement: field("cold review"), assumptions: [], risks: [],
    })
    const revision = JSON.parse(planned.text.split("\n").find((item) => item.startsWith("Bindings: "))?.slice("Bindings: ".length) ?? "{}") as { planRevisionID: string }
    const context = yield* call("maestro", "maestro_record_context", { planRevisionID: revision.planRevisionID })
    const contextBindings = JSON.parse(context.text.split("\n").find((item) => item.startsWith("Bindings: "))?.slice("Bindings: ".length) ?? "{}") as { contextRecordID: string; contextHash: string }
    const validated = yield* call("maestro", "maestro_record_validation", {
      planRevisionID: revision.planRevisionID, contextRecordID: contextBindings.contextRecordID, contextHash: contextBindings.contextHash,
      projectID, workCardID: "card_quote", workCard, routedMemberID: "backend", validatorVersion: "validator-v1", checks: validationChecks,
    })
    const validation = JSON.parse(validated.text.split("\n").find((item) => item.startsWith("Bindings: "))?.slice("Bindings: ".length) ?? "{}") as { validationRecordID: string }
    const reviewed = yield* call("maestro", "maestro_request_review", {
      validationRecordID: validation.validationRecordID, workCard, reviewMethodVersion: "review-v2/plan/quick", tier: "quick",
    })
    if (recordHits === 0)
      return yield* Effect.die(`callback never reached the record branch. stages=${stages.join(",") || "none"} result=${reviewed.text.slice(0, 240)}`)
    expect(recordHits).toBeGreaterThan(0)
    expect(reviewed.text.startsWith("FIX_FIRST:")).toBe(true)
  }).pipe(Effect.provide(host), Effect.ensuring(Effect.sync(() => { scripted.messages = () => undefined })))))

// PlanRevisionV3 below is a labeled prerequisite event, not a claim that plan publication was secured.
test("a newer APPROVE or REJECT code receipt refuses rereview before any child prompt", () =>
  Effect.runPromise(restoreAlpha(Effect.gen(function* () {
    prompts.length = 0
    briefsBySession.clear()
    scripted.messages = () => undefined
    let mode: "plan" | "fix" | "approve" | "reject" = "plan"
    let created = 0
    const database = yield* Database.Service
    const registry = yield* ToolRegistry.Service
    const events = yield* EventV2.Service
    const db = database.db
    const parent = SessionSchema.ID.make("ses_round_closed")
    let calls = 0
    const call = (agent: string, name: string, input: unknown, session = parent) =>
      registry.materialize().pipe(
        Effect.flatMap((materialized) => materialized.settle({
          sessionID: session, agent: AgentV2.ID.make(agent), assistantMessageID: SessionMessage.ID.make("msg_calling_closed"),
          call: { type: "tool-call", id: `call_closed_${calls++}`, name, input },
        })),
        Effect.map((settled) => ({ type: settled.result.type, text: String(settled.result.value) })),
      )
    yield* db.insert(ProjectTable).values({ id: projectID, worktree: directory, sandboxes: [] }).onConflictDoNothing().run().pipe(Effect.orDie)
    yield* db.insert(SessionTable).values({
      id: parent, project_id: projectID, directory, slug: "closed", title: "closed", version: "test", agent: AgentV2.defaultID,
    }).onConflictDoNothing().run().pipe(Effect.orDie)
    yield* db.insert(BoardProjectTable).values({
      id: Board.ProjectID.create(), key: "CLOSED", name: "Closed", goal: "Closed round.", status: "active",
      github_state: "off", next_issue_number: 1, next_epic_number: 1, repo_project_id: projectID,
      review_accepted_unavailable: ["no-build"],
    }).run().pipe(Effect.orDie)
    const encode = Schema.encodeSync(SessionMessage.Message)
    yield* db.insert(SessionMessageTable).values([
      SessionMessage.User.make({ id: SessionMessage.ID.make("msg_owner_closed"), type: "user", text: "Ship the CSV export", time }),
      SessionMessage.Assistant.make({ id: SessionMessage.ID.make("msg_calling_closed"), type: "assistant", agent: "maestro", model, content: [], time }),
    ].map((message, index) => {
      const { id, type, ...data } = encode(message)
      return { id: SessionMessage.ID.make(id), session_id: parent, type, seq: index + 1, time_created: DateTime.toEpochMillis(message.time.created), data }
    })).onConflictDoNothing().run().pipe(Effect.orDie)
    child.create = (input) => {
      created += 1
      return db.insert(SessionTable).values({
        id: input.id, project_id: projectID, parent_id: input.parentID, directory, slug: "lucy", title: "lucy", version: "test", agent: "lucy",
      }).onConflictDoNothing().run().pipe(Effect.orDie, Effect.asVoid)
    }
    const quote = {
      id: "Q1", path: "src/alpha.ts", line: 1, message: "The export claim is not held.",
      severity: "P1" as const, confidence: "high" as const, lens: "correctness-logic", class: "logic.invariant",
      node: "lucy-review-prove-quote", rule: "logic.invariant", trigger: "replaced export",
      rungs: ["quote"], evidence: { kind: "quote" as const, path: "src/alpha.ts", startLine: 1, endLine: 1 },
      status: "open" as const,
    }
    child.resume = (id) => Effect.gen(function* () {
      const prompt = briefsBySession.get(id) ?? prompts.at(-1) ?? ""
      if (!prompt.includes("artifact JSON:") || prompt.includes("entry stage returned no eligible record")) return
      const outcomes = JSON.parse(prompt.slice(prompt.indexOf(HOST_OUTCOMES) + HOST_OUTCOMES.length).split("\n")[0] ?? "null")
      if (!Array.isArray(outcomes)) return yield* Effect.die("finish brief has no host outcomes")
      const method = line(prompt, "reviewMethodVersion: ")
      const routingDigest = line(prompt, "routingDigest: ")
      const catalogDigest = line(prompt, "catalogDigest: ")
      if (!method || !routingDigest || !catalogDigest) return yield* Effect.die("finish brief has no host method or digests")
      const base = {
        validationRecordID: /validationRecordID: (\S+)/.exec(prompt)?.[1],
        workCard, artifact: JSON.parse(line(prompt, "artifact JSON: ") ?? "null"),
        checks: JSON.parse(line(prompt, "checks JSON: ") ?? "null"),
        reviewMethodVersion: method, routingDigest, catalogDigest, items: outcomes,
      }
      const verdict = mode === "plan" || mode === "approve" ? "APPROVE" as const : mode === "reject" ? "REJECT" as const : "FIX_FIRST" as const
      const findings = verdict === "APPROVE" ? [] : [quote]
      const recorded = yield* call("lucy", "maestro_record_review", { ...base, stage: mode === "plan" ? "plan" as const : "code" as const, verdict, findings }, id)
      if (!recorded.text.startsWith(`${verdict}:`)) return yield* Effect.die(new Error(recorded.text))
    }).pipe(Effect.orDie)
    const refuse = (validationRecordID: string) => Effect.gen(function* () {
      const promptsAt = prompts.length
      const createdAt = created
      const refused = yield* call("maestro", "maestro_request_review", {
        validationRecordID, workCard, reviewMethodVersion: "review-v2/code/quick", stage: "code", profile: "rereview",
      })
      expect(refused.text).toMatch(/not-fix-first/)
      expect(prompts.length).toBe(promptsAt)
      expect(created).toBe(createdAt)
      expect(refused.text).not.toContain("FIX_FIRST:")
    })
    const admission = yield* call("maestro", "maestro_record_admission", {
      methodVersion: "admit-request-v1",
      assessment: { kind: "work", goal: "Ship the CSV export", known: [{ text: "The owner wants CSV export", source: "stakeholder" }], proposals: [], unknowns: [], uncertainty: "low", activeWorkEffect: "none", reason: "Goal and scope are clear" },
    })
    if (admission.type === "error") return yield* Effect.die(new Error(admission.text))
    const planned = yield* call("maestro", "maestro_record_plan_revision", {
      admissionMessageID: "msg_owner_closed", methodVersion: "plan-v1", goal: field("CSV export"), acceptance: [field("A CSV downloads")],
      scope: [field("backend")], units: ["packages/alpha/shared"], constraints: [], reviewRequirement: field("cold review"), assumptions: [], risks: [],
    })
    const toolRevision = requireBindings(planned.text, "closed plan revision")
    const toolPlan = yield* GovernanceRecordsV2.readPlanRevision(db, requireRecordID(toolRevision.planRevisionID, "closed plan revision"))
    if (!toolPlan || !("grounding" in toolPlan) || !toolPlan.grounding) return yield* Effect.die(`closed plan has no grounding to copy: ${planned.text.slice(0, 500)}`)
    const workflowBinding = Schema.decodeUnknownSync(RelayArm.WorkflowDefinition)({
      publication: { projectID, documentID: "packet", activeVersionID: "version-1",
        immutableVersionBodyChecksum: "1".repeat(64), livePublicationChecksum: "2".repeat(64) },
      materialization: { schemaIdentifier: "RelaySprint.Sprint", digest: "3".repeat(64), byteLength: 128 },
      resolvedSkills: [], parameters: { target: "src" }, writePaths: ["src"],
    })
    const seededBody = {
      sessionID: parent, admissionMessageID: toolPlan.admissionMessageID, methodVersion: toolPlan.methodVersion,
      revision: "v3" as const, goal: toolPlan.goal, acceptance: toolPlan.acceptance, scope: toolPlan.scope,
      constraints: toolPlan.constraints, reviewRequirement: toolPlan.reviewRequirement, contextRequirement: "PENDING" as const,
      assumptions: toolPlan.assumptions, risks: toolPlan.risks, status: "PROPOSED" as const,
      grounding: toolPlan.grounding, workflowBinding,
    }
    const revisionHash = GovernanceRecordsV2.hash(seededBody)
    const seeded = Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)({
      ...seededBody, id: `evt_maestro_plan_revision_${revisionHash}`, revisionHash, createdAt: 1,
    })
    yield* events.publish(MaestroEvent.PlanRevision.RecordedV3, seeded, { id: EventV2.ID.make(seeded.id) })
    const context = yield* call("maestro", "maestro_record_context", { planRevisionID: seeded.id })
    if (context.type === "error") return yield* Effect.die(new Error(context.text))
    const contextBindings = requireBindings(context.text, "closed context")
    if (!contextBindings.contextHash) return yield* Effect.die(`closed context refused before hash: ${context.text.slice(0, 500)}`)
    const validated = yield* call("maestro", "maestro_record_validation", {
      planRevisionID: seeded.id, contextRecordID: requireRecordID(contextBindings.contextRecordID, "closed context"), contextHash: contextBindings.contextHash,
      projectID, workCardID: "card_closed", workCard, routedMemberID: "backend", validatorVersion: "validator-v1", checks: validationChecks,
    })
    const validationRecordID = requireRecordID(requireBindings(validated.text, "closed validation").validationRecordID, "closed validation")
    const approved = yield* call("maestro", "maestro_request_review", {
      validationRecordID, workCard, reviewMethodVersion: "review-v2/plan/quick", tier: "quick",
    })
    if (!approved.text.startsWith("APPROVE:")) return yield* Effect.die(new Error(approved.text))
    yield* Effect.promise(() => fs.writeFile(path.join(directory, "src/alpha.ts"), "export const alpha = 2\n"))
    mode = "fix"
    const fixed = yield* call("maestro", "maestro_request_review", {
      validationRecordID, workCard, reviewMethodVersion: "review-v2/code/quick", stage: "code", tier: "quick",
    })
    if (!fixed.text.startsWith("FIX_FIRST:")) return yield* Effect.die(new Error(fixed.text))
    yield* Effect.promise(() => fs.writeFile(path.join(directory, "src/alpha.ts"), "export const alpha = 3\n"))
    mode = "approve"
    const closed = yield* call("maestro", "maestro_request_review", {
      validationRecordID, workCard, reviewMethodVersion: "review-v2/code/quick", stage: "code", tier: "quick",
    })
    if (!closed.text.startsWith("APPROVE:")) return yield* Effect.die(new Error(closed.text))
    yield* refuse(validationRecordID)
    yield* Effect.promise(() => fs.writeFile(path.join(directory, "src/alpha.ts"), "export const alpha = 4\n"))
    mode = "reject"
    const rejected = yield* call("maestro", "maestro_request_review", {
      validationRecordID, workCard, reviewMethodVersion: "review-v2/code/quick", stage: "code", tier: "quick",
    })
    if (!rejected.text.startsWith("REJECT:")) return yield* Effect.die(new Error(rejected.text))
    yield* refuse(validationRecordID)
  }).pipe(Effect.provide(host), Effect.ensuring(Effect.sync(() => { scripted.messages = () => undefined }))))))
