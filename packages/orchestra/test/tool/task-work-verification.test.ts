import { afterEach, expect } from "bun:test"
import { Cause, Deferred, Effect, Exit } from "effect"
import { SessionV1 } from "@orchestra/core/v1/session"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { BackendResult } from "@/maestro/backend-result"
import { TaskTool } from "@/tool/task"
import { MessageID, PartID } from "@/session/schema"
import { layer, dispatch } from "../maestro/governed-fixture"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect, awaitWithTimeout } from "../lib/effect"
import { fixture, card } from "./task-work-verification-fixture"

afterEach(disposeAllInstances)
const it = testEffect(layer)
const git = { git: true }

it.instance("worker prose pass remains unverified; pure assembly has pending acceptance and no host identities", () =>
  Effect.gen(function* () {
    const f = yield* fixture({ armed: false })
    const exit = yield* f.run()
    if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
    expect(exit.value.metadata.workResult).toMatchObject({ memberId: "backend", executionSessionId: exit.value.metadata.sessionId,
      authoritySessionId: f.chat.id, mode: "delegated", acceptance: { state: "pending" },
      verification: { state: "not-host-verified" }, checks: card.checks, terminal: { reason: "ended" } })
    expect(f.captures).toEqual([])
    const pure = BackendResult.assemble(f.written[0])
    expect(pure.acceptance).toEqual({ state: "pending" })
    expect([pure.memberId, pure.executionSessionId, pure.authoritySessionId, pure.delta]).toEqual([undefined, undefined, undefined, undefined])
  }), git)

for (const content of ["pass", "fail", "missing"]) {
  it.instance(`real Relay filesystem ${content} projects actual facts before Task exit`, () => Effect.gen(function* () {
    const f = yield* fixture({ content, outcome: content === "fail" ? "blocked" : "done" })
    const exit = yield* f.run()
    expect(Exit.isSuccess(exit)).toBe(content === "pass")
    expect(f.streamed.at(-1)).toMatchObject({
      mode: "delegated-armed", acceptance: { state: "pending" }, checks: card.checks,
      workerEvidence: { checks: [{ index: 0, evidence: "unbound", callIDs: [] }] },
      terminal: { reason: content === "fail" ? "blocked" : "ended" },
      verification: { state: content === "pass" ? "host-verified" : content === "fail" ? "host-failed" : "host-incomplete" },
      hostChecks: { results: [{ name: "filesystem", status: content === "missing" ? "acquisition-error" : content,
        provenance: { source: "host-check", projectID: f.chat.projectID, sessionID: f.chat.id } },
        ...(content === "pass" ? [expect.objectContaining({ name: "second", status: "pass" })] : [])] },
      delta: { baseRevision: expect.stringMatching(/^[a-f0-9]{40}$/), checkedRevision: expect.stringMatching(/^[a-f0-9]{40}$/),
        worktreeDigest: expect.stringMatching(/^[a-f0-9]{64}$/) },
    })
    if (content === "pass") expect(f.streamed.at(-1)).toMatchObject({ verification: {
      receipt: { verified: true, taskID: f.written[0].info.sessionID, planID: "plan", checks: 2 } } })
    if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain("completion-checks-not-passing")
  }), git)
}

for (const secondaryAcquisition of [false, true]) {
  it.instance(`native denial retains partial capture and secondary ${secondaryAcquisition ? "acquisition" : "drift"}`, () =>
    Effect.gen(function* () {
      const f = yield* fixture({ hostDenial: true, drift: !secondaryAcquisition, secondaryAcquisition, metadataDefect: !secondaryAcquisition })
      const exit = yield* f.run()
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain("native-inspection-refused")
      expect(f.streamed.at(-1)).toMatchObject({ terminal: { reason: "ended" }, acceptance: { state: "pending" },
        verification: { state: "host-incomplete", hostReason: { reason: "native-inspection-refused", detail: "inspection detail" },
          deltaReason: { reason: secondaryAcquisition ? "completion-delta-acquisition" : "completion-delta-drift" } },
        hostChecks: { results: [expect.objectContaining({ name: "filesystem", status: "pass" })] } })
      expect(JSON.stringify(f.streamed.at(-1))).not.toMatch(/rawCause|ToolSafety\.Denied|_tag|stack/)
    }), git)
}

it.instance("sampled delta drift refuses completion despite captured passes", () => Effect.gen(function* () {
  const f = yield* fixture({ drift: true })
  expect(Exit.isFailure(yield* f.run())).toBe(true)
  expect(f.streamed.at(-1)).toMatchObject({ terminal: { reason: "ended" }, verification: {
    state: "host-incomplete", hostReason: { reason: "completion-delta-drift" } }, hostChecks: { results: [
    expect.objectContaining({ status: "pass" }), expect.objectContaining({ status: "pass" })] } })
}), git)

it.instance("metadata observer defect revokes pass receipt and preserves inspection facts", () => Effect.gen(function* () {
  const f = yield* fixture({ metadataDefect: true })
  const exit = yield* f.run()
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain("metadata observer defect")
  expect(f.streamed.at(-1)).toMatchObject({ terminal: { reason: "ended" }, verification: {
    state: "host-incomplete", hostReason: { reason: "completion-evaluation-acquisition" } },
    hostChecks: { results: [expect.objectContaining({ status: "pass" }), expect.objectContaining({ status: "pass" })] } })
  expect(JSON.stringify(f.streamed.at(-1))).not.toContain('"verified":true')
}), git)

for (const failure of ["provider", "die", "interrupt", "unfinished"] as const) {
  it.instance(`${failure} retains claims and independent execution terminal without acceptance`, () => Effect.gen(function* () {
    const f = yield* fixture({ promptFailure: failure === "die" || failure === "interrupt" ? failure : undefined,
      finish: failure === "unfinished" ? "tool-calls" : undefined,
      error: failure === "provider" ? new SessionV1.APIError({ message: "provider lost", isRetryable: false }).toObject() : undefined })
    expect(Exit.isFailure(yield* f.run())).toBe(true)
    expect(f.streamed.at(-1)).toMatchObject({ changes: card.changes, checks: card.checks,
      acceptance: { state: "pending" }, verification: { state: "host-incomplete" },
      terminal: { reason: failure === "interrupt" || failure === "unfinished" ? "interrupted" : "failed" } })
    expect(f.captures).toEqual([])
  }), git)
}

for (const content of ["pass", "fail"]) {
  it.instance(`background notice carries actual ${content} facts; Task start stays running and pending`, () => Effect.gen(function* () {
    const f = yield* fixture({ content, background: true, outcome: content === "fail" ? "blocked" : "done" })
    const started = yield* f.run()
    if (Exit.isFailure(started)) throw Cause.squash(started.cause)
    expect(started.value.metadata.workResult).toMatchObject({ terminal: { reason: "running" },
      acceptance: { state: "pending" }, verification: { state: "host-incomplete" } })
    yield* Deferred.succeed(f.release, undefined)
    const notice = (yield* awaitWithTimeout(Deferred.await(f.notice), "background notice missing", "15 seconds")).parts[0]
    if (notice.type !== "text") throw new Error("notice text missing")
    expect(notice.metadata?.workResult).toMatchObject({ memberId: "backend", authoritySessionId: f.chat.id,
      executionSessionId: started.value.metadata.sessionId, acceptance: { state: "pending" },
      terminal: { reason: content === "fail" ? "blocked" : "ended" }, verification: { state: content === "pass" ? "host-verified" : "host-failed" },
      hostChecks: { results: f.captures.at(-1)?.results } })
    expect(started.value.metadata.workResult?.terminal.reason).toBe("running")
  }), git)
}

it.instance("extended background worker cannot inherit earlier turn's verified receipt", () => Effect.gen(function* () {
  const f = yield* fixture({ background: true })
  const start = yield* f.run()
  if (Exit.isFailure(start)) throw Cause.squash(start.cause)
  const update = yield* f.run({ ...f.params, task_id: start.value.metadata.workResult?.taskId })
  if (Exit.isFailure(update)) throw Cause.squash(update.cause)
  yield* Deferred.succeed(f.release, undefined)
  const notice = (yield* awaitWithTimeout(Deferred.await(f.notice), "extended notice missing", "15 seconds")).parts[0]
  if (notice.type !== "text") throw new Error("notice text missing")
  expect(f.written).toHaveLength(2)
  expect(notice.metadata?.workResult).toMatchObject({ card: { messageID: f.written[1].info.id },
    terminal: { reason: "ended" }, verification: { state: "host-incomplete" }, acceptance: { state: "pending" } })
  expect(JSON.stringify(notice.metadata?.workResult)).not.toContain('"verified":true')
}), git)

it.instance("governed replay re-verifies host arm; spent arm refuses cached worker pass", () => Effect.gen(function* () {
  const original = yield* dispatch({ subagentType: "backend" })
  const f = yield* fixture({ parent: original.chat })
  const user = yield* f.sessions.updateMessage({ ...original.user, id: MessageID.ascending(), sessionID: original.first.metadata.sessionId })
  const info = yield* f.sessions.updateMessage({ ...original.assistant, id: MessageID.ascending(), parentID: user.id,
    sessionID: user.sessionID, agent: "backend", finish: "stop" })
  yield* f.sessions.updatePart({ id: PartID.ascending(), messageID: info.id, sessionID: info.sessionID, type: "text",
    text: "PASS\n```backend-result\n" + JSON.stringify(card) + "\n```" })
  const tool = yield* TaskTool.pipe(Effect.provideService(ArsenalCompletion.NativeHost, f.host))
  const def = yield* tool.init()
  const context = { ...original.context, metadata: f.context.metadata }
  const first = yield* def.execute(original.input, context)
  expect(first.metadata.workResult).toMatchObject({ terminal: { reason: "ended" }, verification: { state: "host-verified" } })
  const replay = yield* def.execute(original.input, context).pipe(Effect.exit)
  expect(Exit.isFailure(replay)).toBe(true)
  if (Exit.isFailure(replay)) expect(Cause.pretty(replay.cause)).toContain("This arm already passed every gate")
  expect(f.streamed.at(-1)).toMatchObject({ terminal: { reason: "ended" }, acceptance: { state: "pending" },
    verification: { state: "host-incomplete", hostReason: { reason: "completion-evaluation-acquisition" } } })
  expect(original.promptCount()).toBe(1)
  yield* f.sessions.updateMessage({ ...info, error: new SessionV1.APIError({ message: "replayed provider failure", isRetryable: false }).toObject() })
  expect(Exit.isFailure(yield* def.execute(original.input, context).pipe(Effect.exit))).toBe(true)
  expect(f.streamed.at(-1)).toMatchObject({ checks: card.checks, terminal: { reason: "failed" }, verification: { state: "host-incomplete" } })
}), { git: true, config: { agent: { maestro: { name: "Conductor" } } } }, 60_000)
