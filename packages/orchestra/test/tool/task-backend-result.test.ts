import { afterEach, describe, expect } from "bun:test"
import { SessionV1 } from "@orchestra/core/v1/session"
import { Cause, Effect, Exit } from "effect"
import { BACKEND_DEFAULT_LABEL } from "../../src/maestro/roster"
import { Session } from "@/session/session"
import { MessageID, PartID } from "../../src/session/schema"
import { PermissionV1 } from "@orchestra/core/v1/permission"
import { disposeAllInstances } from "../fixture/fixture"
import { ref, it, background, card, blocked, fenced, final, dispatch, workResult, deliverBackground, shell, host, claimedEvidence, empty } from "./fixtures/task-backend-result"

// F4 cl.5-6 and F4-CH: the Task path decodes the backend specialist's `backend-result` card into `metadata.workResult`.

afterEach(async () => {
  await disposeAllInstances()
})

describe("tool.task backend-result", () => {
  background.instance("completed native backend Task delivers failed generic notice without upstream authorship or receipt", () =>
    Effect.gen(function* () {
      const result = yield* deliverBackground(final(card),
        new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(), "backend", "native")
      expect(result.workResult).toMatchObject({ schema: "backend-work-result-v1",
        card: { parsed: true, messageID: result.childMessageID },
        terminal: { reason: "failed", hostDetail: expect.stringContaining("Network connection lost") } })
      expect(result.workResult).not.toHaveProperty("author")
      expect(result.native).toMatchObject({ call: { state: { status: "completed" } }, notice: { type: "synthetic" } })
      expect(result.native?.notice.text).toContain('<task id="')
      expect(result.native?.notice.text).toContain('state="error"')
      expect(result.native?.notice.text).toContain("<task_error>")
      expect(result.native?.notice.text).toContain(final(card))
    }),
  )

  it.instance("decodes a valid card into the work result", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card))
      if (!Exit.isSuccess(result.exit)) throw new Error("expected task success")
      expect(workResult(result.exit.value.metadata)).toEqual({
        schema: "backend-work-result-v1",
        card: { parsed: true, messageID: result.childMessageID },
        outcome: "done",
        changes: card.changes,
        checks: card.checks,
        workerEvidence: claimedEvidence,
        blockers: [],
        risks: card.risks,
        nextActions: [],
        terminal: { reason: "ended" },
        writeRoots: [],
        ...host,
        ...shell,
      })
    }),
  )

  it.instance("maps outcome blocked to terminal blocked", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(blocked))
      if (!Exit.isSuccess(result.exit)) throw new Error("expected task success")
      expect(workResult(result.exit.value.metadata)).toMatchObject({
        card: { parsed: true },
        outcome: "blocked",
        blockers: blocked.blockers,
        terminal: { reason: "blocked" },
      })
    }),
  )

  for (const [name, text] of [
    ["two blocks", `${final(card)}\n\n${fenced(card)}`],
    ["an extra top-level key", final({ ...card, verified: true })],
    ["an extra nested key", final({ ...card, changes: [{ ...card.changes[0], callIDs: ["call-1"] }] })],
    ["no block", "Done. Changed the repository query and ran the unit check."],
    ["invalid JSON", "Done.\n\n```backend-result\n{ outcome: done }\n```"],
    ["an unknown blocker kind", final({ ...blocked, blockers: [{ kind: "design", reason: "x" }] })],
    ["an unknown outcome", final({ ...card, outcome: "partial" })],
    ["an unknown change kind", final({ ...card, changes: [{ ...card.changes[0], change: "renamed" }] })],
    ["an unknown check status", final({ ...card, checks: [{ ...card.checks[0], status: "passed" }] })],
  ] as const) {
    it.instance(`leaves worker fields empty for ${name}`, () =>
      Effect.gen(function* () {
        const result = yield* dispatch(text)
        if (!Exit.isSuccess(result.exit)) throw new Error("expected task success")
        expect(workResult(result.exit.value.metadata)).toEqual({
          schema: "backend-work-result-v1",
          card: { parsed: false, messageID: result.childMessageID },
          ...empty,
          terminal: { reason: "ended" },
        })
      }),
    )
  }

  it.instance("streams the work result before a failed child fails the Task", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), {
        error: new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(),
      })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toMatchObject({
        card: { parsed: true, messageID: result.childMessageID },
        outcome: "done",
        changes: card.changes,
        terminal: { reason: "failed" },
      })
    }),
  )

  it.instance("a failed child that declared blocked stays failed", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(blocked), {
        error: new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(),
      })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toMatchObject({ outcome: "blocked", terminal: { reason: "failed" } })
    }),
  )

  it.instance("other subagents get no work result", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), { subagent: "general" })
      if (!Exit.isSuccess(result.exit)) throw new Error("expected task success")
      expect(workResult(result.exit.value.metadata)).toBeUndefined()
      expect(result.streamed.some((item) => "workResult" in item)).toBe(false)
    }),
  )
  it.instance(
    "a renamed seat still routes by its stable id and never by a label",
    () =>
      Effect.gen(function* () {
        const result = yield* dispatch(final(card))
        if (!Exit.isSuccess(result.exit)) throw new Error("expected task success")
        expect(workResult(result.exit.value.metadata)).toMatchObject({ card: { parsed: true }, outcome: "done" })
        const sessions = yield* Session.Service
        const child = (yield* sessions.children(result.chat.id))[0]
        expect(child?.agent).toBe("backend")
        expect(child?.title).toContain("(@Pikachu subagent)")

        for (const label of ["Pikachu", BACKEND_DEFAULT_LABEL]) {
          const byLabel = yield* dispatch(final(card), { subagent: label })
          expect(Exit.isFailure(byLabel.exit)).toBe(true)
          if (Exit.isFailure(byLabel.exit)) expect(Cause.pretty(byLabel.exit.cause)).toContain("Unknown agent type")
        }

        // The caller resolves by id: the renamed seat keeps its native profile, which denies delegation.
        const caller = yield* dispatch(final(card), { caller: { agent: "Pikachu", agentID: "backend" } })
        expect(Exit.isFailure(caller.exit)).toBe(true)
        if (Exit.isFailure(caller.exit))
          expect(Cause.squash(caller.exit.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      }),
    { config: { agent: { backend: { name: "Pikachu" } } } },
  )

  it.instance("streams an unparsed work result when the child prompt is cancelled", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), { prompt: () => Effect.interrupt })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toEqual({
        schema: "backend-work-result-v1",
        card: { parsed: false },
        ...empty,
        terminal: { reason: "interrupted", hostDetail: "Task cancelled" },
      })
    }),
  )

  it.instance("streams an unparsed work result when the child dies before a final message", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), { prompt: () => Effect.die(new Error("child process died")) })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toEqual({
        schema: "backend-work-result-v1",
        card: { parsed: false },
        ...empty,
        terminal: { reason: "failed", hostDetail: "child process died" },
      })
    }),
  )

  it.instance("a dying child keeps only what its last message actually says", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const written: string[] = []
      const result = yield* dispatch(final(card), {
        prompt: (input) =>
          Effect.gen(function* () {
            const message = yield* sessions.updateMessage({
              id: MessageID.ascending(),
              role: "assistant",
              parentID: MessageID.ascending(),
              sessionID: input.sessionID,
              mode: "backend",
              agent: "backend",
              cost: 0,
              path: { cwd: "/tmp", root: "/tmp" },
              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              modelID: ref.modelID,
              providerID: ref.providerID,
              time: { created: Date.now() },
            })
            written.push(message.id)
            yield* sessions.updatePart({
              id: PartID.ascending(),
              messageID: message.id,
              sessionID: input.sessionID,
              type: "text",
              text: "Done.\n\n```backend-result\n{ \"outcome\": \"do",
            })
            return yield* Effect.die(new Error("child process died"))
          }),
      })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toEqual({
        schema: "backend-work-result-v1",
        card: { parsed: false, messageID: written[0] },
        ...empty,
        terminal: { reason: "failed", hostDetail: "child process died" },
      })
    }),
  )

  it.instance("a failed child's streamed result carries the host reason", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), {
        error: new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(),
      })
      expect(result.streamed.at(-1)?.workResult).toMatchObject({
        card: { parsed: true },
        terminal: { reason: "failed", hostDetail: expect.stringContaining("Network connection lost") },
      })
    }),
  )

  background.instance("a finished background child delivers its final work result to the parent", () =>
    Effect.gen(function* () {
      const result = yield* deliverBackground(final(card))
      // The Task part completed at start and keeps `running` (F4 amendment); the notice carries the final result.
      expect(workResult(result.started)).toMatchObject({ terminal: { reason: "running" } })
      expect(result.workResult).toEqual({
        schema: "backend-work-result-v1",
        card: { parsed: true, messageID: result.childMessageID },
        ...card,
        workerEvidence: claimedEvidence,
        terminal: { reason: "ended" },
        writeRoots: [],
        ...host,
        ...shell,
      })
    }),
  )

  background.instance("a failed background child delivers a failed work result with the host reason", () =>
    Effect.gen(function* () {
      const result = yield* deliverBackground(
        final(card),
        new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(),
      )
      expect(result.workResult).toMatchObject({
        card: { parsed: true, messageID: result.childMessageID },
        outcome: "done",
        changes: card.changes,
        terminal: { reason: "failed", hostDetail: expect.stringContaining("Network connection lost") },
      })
    }),
  )

  background.instance("background mode returns a running work result with no worker fields", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), { background: true, prompt: () => Effect.never })
      if (!Exit.isSuccess(result.exit)) throw new Error("expected background start")
      const expected = {
        schema: "backend-work-result-v1",
        card: { parsed: false },
        ...empty,
        terminal: { reason: "running", hostDetail: "Background task started" },
      }
      expect(workResult(result.exit.value.metadata)).toEqual(expected)
      expect(result.streamed.at(-1)?.workResult).toEqual(expected)
    }),
  )
})
