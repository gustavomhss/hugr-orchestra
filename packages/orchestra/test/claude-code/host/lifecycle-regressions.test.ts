import { expect } from "bun:test"
import path from "node:path"
import { Effect, Exit, Fiber } from "effect"
import type { Query } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeHost } from "@/claude-code/host/session"
import { ClaudeHostAdmission } from "@/claude-code/host/admission"
import { ClaudeCode } from "@/claude-code/engine"
import { Permission } from "@/permission"
import { MessageID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { SessionRevert } from "@/session/revert"
import { awaitWithTimeout, pollWithTimeout } from "../../lib/effect"
import { TestInstance } from "../../fixture/fixture"
import { ClaudeEngineFixture } from "../engine-fixture"

const frame = ClaudeEngineFixture.frame

// Only the SDK transport is scripted. Admission, history, lifecycle, permissions and mirror are real services.
function transport(
  params: ClaudeEngineFixture.Params,
  script: ClaudeEngineFixture.Script,
  controls: {
    accountInfo?: () => Promise<unknown>
    setModel?: (model?: string) => Promise<void>
    close?: () => void
  } = {},
) {
  if (typeof params.prompt === "string") throw new Error("expected streaming input")
  const prompt = params.prompt
  const input = (async function* () {
    for await (const message of prompt) {
      ClaudeEngineFixture.state.inputs.push(String(message.message.content))
      ClaudeEngineFixture.state.messages.push(message)
      yield message
    }
  })()
  const frames = script(input, params)
  return Object.assign(frames, {
    close: () => {
      ClaudeEngineFixture.state.closed.push(params)
      controls.close?.()
      void frames.return(undefined)
    },
    interrupt: async () => {
      ClaudeEngineFixture.state.interrupts++
      return ClaudeEngineFixture.state.receipt
    },
    stopTask: async (id: string) => {
      ClaudeEngineFixture.state.stoppedTasks.push(id)
    },
    setModel: controls.setModel ?? (async () => {}),
    accountInfo: controls.accountInfo ?? (async () => ({ subscriptionType: "Claude Max", apiProvider: "firstParty" })),
    getContextUsage: async () => ({ totalTokens: 10, maxTokens: 200_000, percentage: 0 }),
  }) as unknown as Query
}

for (const failure of ["reject", "stop"] as const)
  ClaudeEngineFixture.it.instance(
    `model control ${failure} leaves an exact-retry steer durably pending across reopening`,
    () =>
      Effect.gen(function* () {
        ClaudeEngineFixture.reset()
        const f = yield* ClaudeEngineFixture.setup()
        const host = yield* ClaudeHost.Service
        const ready = Promise.withResolvers<void>()
        const control = Promise.withResolvers<void>()
        const entered = Promise.withResolvers<void>()
        ClaudeEngineFixture.state.construct = (params) =>
          transport(
            params,
            async function* (input) {
              const first = await input[Symbol.asyncIterator]().next()
              if (first.done) return
              yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
              yield { ...first.value, session_id: frame.session_id }
              ready.resolve()
              for await (const _ of input) {
              }
            },
            {
              setModel: async () => {
                entered.resolve()
                await control.promise
                if (failure === "reject") throw new Error("model control rejected")
              },
            },
          )
        const first = yield* f.prompt.prompt({
          sessionID: f.chat.id,
          ...ClaudeEngineFixture.say("active"),
          noReply: true,
        })
        if (first.info.role !== "user") throw new Error("missing first user")
        const running = yield* host.turn({ sessionID: f.chat.id, user: first.info }).pipe(Effect.forkChild)
        yield* Effect.promise(() => ready.promise)
        const id = MessageID.ascending()
        const request = {
          sessionID: f.chat.id,
          messageID: id,
          ...ClaudeEngineFixture.say("unsent steer"),
          noReply: true,
        }
        const steer = yield* f.prompt.prompt(request)
        const sending = yield* host
          .steer({ sessionID: f.chat.id, user: steer, model: "different-model" })
          .pipe(Effect.exit, Effect.forkChild)
        yield* Effect.addFinalizer(() => Effect.sync(() => control.resolve()))
        yield* awaitWithTimeout(
          Effect.promise(() => entered.promise),
          "model control was not reached",
          "5 seconds",
        )
        const bound = ClaudeHostAdmission.read((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.inputs)[id]
        expect(bound).toMatchObject({ status: "pending" })
        expect(bound.uuid).toBeTruthy()
        expect(ClaudeEngineFixture.state.inputs).toEqual(["active"])
        if (failure === "stop") yield* host.interrupt(f.chat.id)
        control.resolve()
        const result = yield* Fiber.join(sending)
        if (failure === "reject") expect(Exit.isFailure(result)).toBe(true)
        yield* host.release(f.chat.id)
        yield* Fiber.await(running)
        const retry = yield* f.prompt.prompt(request)
        expect(retry.info.id).toBe(id)
        expect(ClaudeHostAdmission.read((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.inputs)[id]).toEqual(
          bound,
        )
        expect((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.delivered).not.toContain(id)
        ClaudeEngineFixture.state.construct = undefined
        ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.replies("retried"))
        if (retry.info.role !== "user") throw new Error("missing retry user")
        yield* host.turn({ sessionID: f.chat.id, user: retry.info })
        expect(ClaudeEngineFixture.state.inputs).toEqual(["active", "unsent steer"])
        expect(ClaudeEngineFixture.state.messages[1].uuid).toBe(bound.uuid)
        expect(
          ClaudeHostAdmission.read((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.inputs)[id].status,
        ).toBe("received")
        yield* host.release(f.chat.id)
      }),
    30_000,
  )

ClaudeEngineFixture.it.instance(
  "a submitted send without a native receipt stays unresolved after reopening",
  () =>
    Effect.gen(function* () {
      ClaudeEngineFixture.reset()
      const f = yield* ClaudeEngineFixture.setup()
      const host = yield* ClaudeHost.Service
      const read = Promise.withResolvers<void>()
      ClaudeEngineFixture.state.scripts.push(async function* (input) {
        await input[Symbol.asyncIterator]().next()
        yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
        read.resolve()
        for await (const _ of input) {
        }
      })
      const user = yield* f.prompt.prompt({
        sessionID: f.chat.id,
        ...ClaudeEngineFixture.say("uncertain"),
        noReply: true,
      })
      if (user.info.role !== "user") throw new Error("missing user")
      const running = yield* host.turn({ sessionID: f.chat.id, user: user.info }).pipe(Effect.forkChild)
      yield* Effect.promise(() => read.promise)
      expect(
        ClaudeHostAdmission.read((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.inputs)[user.info.id].status,
      ).toBe("submitted")
      expect((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.delivered ?? []).not.toContain(user.info.id)
      yield* host.release(f.chat.id)
      yield* Fiber.await(running)
      yield* host.turn({ sessionID: f.chat.id, user: user.info })
      expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
      expect(
        ClaudeHostAdmission.read((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.inputs)[user.info.id].status,
      ).toBe("uncertain")
      const last = (yield* f.sessions.messages({ sessionID: f.chat.id })).findLast(
        (item) => item.info.role === "assistant",
      )
      expect(last?.info).toMatchObject({
        error: { data: { message: expect.stringContaining("input submission is unresolved") } },
      })
    }),
  30_000,
)

ClaudeEngineFixture.it.instance(
  "revert reconciles native history before a normal admission and a later Claude return",
  () =>
    Effect.gen(function* () {
      ClaudeEngineFixture.reset()
      const f = yield* ClaudeEngineFixture.setup()
      const revert = yield* SessionRevert.Service
      ClaudeEngineFixture.state.scripts.push(
        ClaudeEngineFixture.replies("keep", "discard"),
        ClaudeEngineFixture.replies("returned"),
      )
      yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("kept native input") })
      yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("excluded native input") })
      const users = (yield* f.sessions.messages({ sessionID: f.chat.id })).filter((item) => item.info.role === "user")
      yield* revert.revert({ sessionID: f.chat.id, messageID: users[1].info.id })
      yield* f.prompt.prompt({
        sessionID: f.chat.id,
        agent: "maestro",
        parts: [{ type: "text", text: "normal admission" }],
        noReply: true,
      })
      expect(
        (yield* f.sessions.messages({ sessionID: f.chat.id })).some((item) => item.info.id === users[1].info.id),
      ).toBe(false)
      expect((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode).toMatchObject({ resumeAt: "msg_0" })
      yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("return to Claude") })
      expect(ClaudeEngineFixture.state.queries[1].options).toMatchObject({ resume: "sdk-1", resumeSessionAt: "msg_0" })
      expect(ClaudeEngineFixture.state.closed).toContain(ClaudeEngineFixture.state.queries[0])
      expect(ClaudeEngineFixture.state.inputs.filter((text) => text === "excluded native input")).toHaveLength(1)
    }),
  30_000,
)

ClaudeEngineFixture.it.instance(
  "mixed-history forks transform native ownership even when the latest user is normal",
  () =>
    Effect.gen(function* () {
      ClaudeEngineFixture.reset()
      const f = yield* ClaudeEngineFixture.setup()
      const host = yield* ClaudeHost.Service
      const engine = yield* ClaudeCode.Service
      ClaudeEngineFixture.state.scripts.push(
        ClaudeEngineFixture.replies("native source"),
        async function* (input, params) {
          const native = params.options?.sessionId
          if (!native || native === "sdk-1") throw new Error("fork retained its source native identity")
          for await (const message of input) {
            yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame, session_id: native }
            yield { ...message, session_id: native }
            yield {
              type: "assistant",
              ...frame,
              uuid: "fork-answer",
              session_id: native,
              message: {
                id: "fork-answer",
                content: [{ type: "text", text: "fork" }],
                stop_reason: "end_turn",
                usage: {},
              },
            }
            yield {
              type: "result",
              subtype: "success",
              is_error: false,
              total_cost_usd: 0,
              ...frame,
              session_id: native,
            }
          }
        },
      )
      yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("source") })
      const normal = yield* f.prompt.prompt({
        sessionID: f.chat.id,
        agent: "maestro",
        parts: [{ type: "text", text: "normal tail" }],
        noReply: true,
      })
      const fork = yield* f.sessions.fork({ sessionID: f.chat.id })
      expect(fork.metadata?.claudeCode).toMatchObject({ forkFrom: { sessionId: "sdk-1" } })
      expect(fork.metadata?.claudeCode?.sessionId).toBeUndefined()
      yield* f.prompt.prompt({ sessionID: fork.id, ...ClaudeEngineFixture.say("fork continuation") })
      expect(ClaudeEngineFixture.state.queries[1].options).toMatchObject({
        resume: "sdk-1",
        forkSession: true,
        sessionId: ClaudeHost.claudeSessionID(fork.id),
      })
      expect((yield* f.sessions.get(fork.id)).metadata?.claudeCode?.sessionId).not.toBe(
        (yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.sessionId,
      )
      // Removing the exact cut must refuse even though a subsequent user is on another engine.
      yield* f.sessions.setMetadata({
        sessionID: f.chat.id,
        metadata: { claudeCode: { sessionId: "sdk-1", starts: {}, ends: {}, inputs: {}, uuids: {} } },
      })
      expect(
        Exit.isFailure(yield* f.sessions.fork({ sessionID: f.chat.id, messageID: normal.info.id }).pipe(Effect.exit)),
      ).toBe(true)
      yield* engine.release(fork.id)
      yield* host.release(f.chat.id)
    }),
  30_000,
)

ClaudeEngineFixture.it.instance(
  "a mixed fork retains the pending native revert cut before its source reopens",
  () =>
    Effect.gen(function* () {
      ClaudeEngineFixture.reset()
      const f = yield* ClaudeEngineFixture.setup()
      const revert = yield* SessionRevert.Service
      ClaudeEngineFixture.state.scripts.push(
        ClaudeEngineFixture.replies("keep", "discard"),
        async function* (input, params) {
          const native = params.options?.sessionId
          if (!native) throw new Error("missing fork native identity")
          for await (const message of input) {
            const uuid = crypto.randomUUID()
            yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame, session_id: native }
            yield { ...message, session_id: native }
            yield {
              type: "assistant",
              ...frame,
              uuid,
              session_id: native,
              user_message_uuid: message.uuid,
              message: {
                id: uuid,
                content: [{ type: "text", text: "fork reply" }],
                stop_reason: "end_turn",
                usage: {},
              },
            }
            yield {
              type: "result",
              subtype: "success",
              is_error: false,
              total_cost_usd: 0,
              ...frame,
              session_id: native,
            }
          }
        },
      )
      yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("keep") })
      yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("discard") })
      const users = (yield* f.sessions.messages({ sessionID: f.chat.id })).filter((item) => item.info.role === "user")
      yield* revert.revert({ sessionID: f.chat.id, messageID: users[1].info.id })
      yield* f.prompt.prompt({
        sessionID: f.chat.id,
        agent: "maestro",
        parts: [{ type: "text", text: "normal tail" }],
        noReply: true,
      })
      expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
      const fork = yield* f.sessions.fork({ sessionID: f.chat.id })
      expect(fork.metadata?.claudeCode).toMatchObject({ forkFrom: { sessionId: "sdk-1", at: "msg_0" } })
      expect(
        (yield* f.sessions.messages({ sessionID: fork.id }))
          .flatMap((item) => item.parts)
          .some((part) => part.type === "text" && part.text === "discard"),
      ).toBe(false)
      yield* f.prompt.prompt({ sessionID: fork.id, ...ClaudeEngineFixture.say("fork continuation") })
      expect(ClaudeEngineFixture.state.queries[1].options).toMatchObject({
        resume: "sdk-1",
        forkSession: true,
        resumeSessionAt: "msg_0",
      })
      expect((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.resumeAt).toBe("msg_0")
    }),
  30_000,
)

for (const echoed of ["separate", "last", "none"] as const)
  ClaudeEngineFixture.it.instance(
    `two queued users preserve native identity (${echoed === "separate" ? "exact entries" : `inseparable SDK batch: ${echoed} echo`})`,
    () =>
      Effect.gen(function* () {
        ClaudeEngineFixture.reset()
        const f = yield* ClaudeEngineFixture.setup()
        const host = yield* ClaudeHost.Service
        ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.replies("initial"))
        yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("answered") })
        yield* host.release(f.chat.id)
        const a = yield* f.prompt.prompt({
          sessionID: f.chat.id,
          ...ClaudeEngineFixture.say("queued A"),
          noReply: true,
        })
        const b = yield* f.prompt.prompt({
          sessionID: f.chat.id,
          ...ClaudeEngineFixture.say("queued B"),
          noReply: true,
        })
        ClaudeEngineFixture.state.scripts.push(async function* (input) {
          const reader = input[Symbol.asyncIterator]()
          const first = await reader.next()
          const second = await reader.next()
          if (first.done || second.done) throw new Error("host did not send both durable users")
          expect(first.value.uuid).not.toBe(second.value.uuid)
          yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
          if (echoed === "separate") yield { ...first.value, session_id: frame.session_id }
          if (echoed !== "none")
            yield {
              ...second.value,
              session_id: frame.session_id,
              ...(echoed === "last"
                ? {
                    message: {
                      role: "user",
                      content: `${first.value.message.content}\n${second.value.message.content}`,
                    },
                  }
                : {}),
            }

          yield {
            type: "assistant",
            ...frame,
            uuid: "queued-answer",
            user_message_uuid: second.value.uuid,
            user_message_uuids: [first.value.uuid, second.value.uuid],
            message: {
              id: "queued-answer",
              content: [{ type: "text", text: "queued answer" }],
              stop_reason: "end_turn",
              usage: {},
            },
          }
          yield { type: "result", subtype: "success", is_error: false, total_cost_usd: 0, ...frame }
          for await (const _ of input) {
          }
        }, ClaudeEngineFixture.replies("branch"))
        if (b.info.role !== "user") throw new Error("missing second user")
        yield* awaitWithTimeout(
          host.turn({ sessionID: f.chat.id, user: b.info }),
          "queued SDK drain did not complete",
          "5 seconds",
        )
        expect(ClaudeEngineFixture.state.inputs).toEqual(["answered", "queued A", "queued B"])
        const inputs = ClaudeHostAdmission.read((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.inputs)
        expect(inputs[a.info.id].uuid).not.toBe(inputs[b.info.id].uuid)
        expect(inputs[b.info.id].status).toBe("consumed")
        const forked = yield* f.sessions.fork({ sessionID: f.chat.id, messageID: b.info.id }).pipe(Effect.exit)
        if (echoed !== "separate") {
          expect(inputs[b.info.id].inseparable).toEqual([a.info.id, b.info.id])
          expect(Exit.isFailure(forked)).toBe(true)
          yield* f.sessions.setRevert({ sessionID: f.chat.id, revert: { messageID: b.info.id }, summary: undefined })
          expect(
            Exit.isFailure(
              yield* f.prompt
                .prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("refuse interior cut"), noReply: true })
                .pipe(Effect.exit),
            ),
          ).toBe(true)
          return
        }
        if (Exit.isFailure(forked)) throw new Error("exact queued boundary was refused")
        expect(
          (yield* f.sessions.messages({ sessionID: forked.value.id }))
            .flatMap((item) => item.parts)
            .filter((part) => part.type === "text")
            .map((part) => part.text),
        ).toContain("queued A")
        yield* f.prompt.prompt({ sessionID: forked.value.id, ...ClaudeEngineFixture.say("branch") })
        expect(ClaudeEngineFixture.state.queries[2].options?.resumeSessionAt).toBe(inputs[a.info.id].uuid)
        // Negative control: an end from an earlier answered turn cannot stand in for B's exact entry.
        const session = yield* f.sessions.get(f.chat.id)
        yield* f.sessions.setMetadata({
          sessionID: f.chat.id,
          metadata: { ...session.metadata, claudeCode: { ...session.metadata?.claudeCode, starts: {} } },
        })
        expect(
          Exit.isFailure(yield* f.sessions.fork({ sessionID: f.chat.id, messageID: b.info.id }).pipe(Effect.exit)),
        ).toBe(true)
      }),
    30_000,
  )

ClaudeEngineFixture.it.instance(
  "native initialization records ownership while startup still waits for account control",
  () =>
    Effect.gen(function* () {
      ClaudeEngineFixture.reset()
      const f = yield* ClaudeEngineFixture.setup()
      const host = yield* ClaudeHost.Service
      const acquired = Promise.withResolvers<void>()
      const account = Promise.withResolvers<unknown>()
      ClaudeEngineFixture.state.construct = (params) =>
        transport(
          params,
          async function* (input) {
            yield {
              type: "system",
              subtype: "init",
              model: "claude-haiku-4-5-20251001",
              ...frame,
              session_id: "startup-native",
            }
            for await (const _ of input) {
            }
          },
          {
            accountInfo: () => {
              acquired.resolve()
              return account.promise
            },
          },
        )
      const user = yield* f.prompt.prompt({
        sessionID: f.chat.id,
        ...ClaudeEngineFixture.say("startup"),
        noReply: true,
      })
      if (user.info.role !== "user") throw new Error("missing user")
      const starting = yield* host.turn({ sessionID: f.chat.id, user: user.info }).pipe(Effect.forkChild)
      yield* Effect.addFinalizer(() => Effect.sync(() => account.resolve({ subscriptionType: "fixture-cleanup" })))
      yield* Effect.promise(() => acquired.promise)
      yield* pollWithTimeout(
        f.sessions
          .get(f.chat.id)
          .pipe(
            Effect.map((session) => (session.metadata?.claudeCode?.sessionId === "startup-native" ? true : undefined)),
          ),
        "startup native identity was dropped",
      )
      expect(ClaudeEngineFixture.state.inputs).toEqual([])
      expect(
        ClaudeHostAdmission.read((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.inputs)[user.info.id].status,
      ).toBe("pending")
      yield* host.release(f.chat.id)
      yield* Fiber.await(starting)
      expect(ClaudeEngineFixture.state.closed).toHaveLength(1)
    }),
  30_000,
)

for (const operation of ["delete", "interrupt"] as const)
  ClaudeEngineFixture.it.instance(
    `${operation} cancels an acquired startup owner before the held account control and joins before replacement`,
    () =>
      Effect.gen(function* () {
        ClaudeEngineFixture.reset()
        const f = yield* ClaudeEngineFixture.setup()
        const host = yield* ClaudeHost.Service
        const acquired = Promise.withResolvers<void>()
        const account = Promise.withResolvers<unknown>()
        const closed = Promise.withResolvers<void>()
        const joining = Promise.withResolvers<void>()
        const drain = Promise.withResolvers<void>()
        const attempts: ClaudeEngineFixture.Params[] = []
        ClaudeEngineFixture.state.construct = (params) => {
          attempts.push(params)
          if (attempts.length > 1) return transport(params, ClaudeEngineFixture.replies("replacement"))
          return transport(
            params,
            async function* (input) {
              for await (const _ of input) {
              }
              joining.resolve()
              await drain.promise
            },
            {
              accountInfo: () => {
                acquired.resolve()
                return account.promise
              },
              close: () => closed.resolve(),
            },
          )
        }
        const user = yield* f.prompt.prompt({
          sessionID: f.chat.id,
          ...ClaudeEngineFixture.say("startup"),
          noReply: true,
        })
        if (user.info.role !== "user") throw new Error("missing user")
        const starting = yield* host.turn({ sessionID: f.chat.id, user: user.info }).pipe(Effect.forkChild)
        yield* Effect.promise(() => acquired.promise)
        const stopping = yield* (
          operation === "delete" ? f.sessions.remove(f.chat.id) : Fiber.interrupt(starting).pipe(Effect.asVoid)
        ).pipe(Effect.forkChild)
        // Open transport barriers before joining child fibers, including a failing mutation's teardown.
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            drain.resolve()
            account.resolve({ subscriptionType: "fixture-cleanup" })
          }),
        )
        yield* awaitWithTimeout(
          Effect.promise(() => closed.promise),
          "startup owner was not closed before account response",
          "5 seconds",
        )
        expect(attempts[0].options?.abortController?.signal.aborted).toBe(true)
        yield* Effect.promise(() => joining.promise)
        const replacing = yield* host
          .turn({ sessionID: f.chat.id, user: user.info })
          .pipe(Effect.exit, Effect.forkChild)
        yield* Effect.yieldNow
        expect(attempts).toHaveLength(1)
        drain.resolve()
        yield* Fiber.join(stopping)
        yield* Fiber.await(starting)
        account.resolve({ subscriptionType: "late-account" })
        yield* Fiber.join(replacing)
        if (operation === "delete") {
          expect(Exit.isFailure(yield* f.sessions.get(f.chat.id).pipe(Effect.exit))).toBe(true)
          expect(attempts).toHaveLength(1)
        }
        if (operation === "interrupt") {
          expect(attempts).toHaveLength(2)
          expect((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.account).not.toMatchObject({
            subscriptionType: "late-account",
          })
          yield* host.release(f.chat.id)
        }
      }),
    30_000,
  )

ClaudeEngineFixture.it.instance(
  "a seat change rebuilds persona, mirror and permission callbacks using stable seat ids",
  () =>
    Effect.gen(function* () {
      ClaudeEngineFixture.reset()
      const instance = yield* TestInstance
      yield* Effect.promise(() =>
        Bun.write(
          path.join(instance.directory, "orchestra.json"),
          JSON.stringify({
            agent: {
              claude: {
                mode: "primary",
                engine: "claude-code",
                model: "anthropic/claude-haiku-4-5-20251001",
                permission: { bash: "allow" },
              },
              second: {
                mode: "primary",
                engine: "claude-code",
                model: "anthropic/claude-haiku-4-5-20251001",
                permission: { bash: "ask" },
              },
            },
          }),
        ),
      )
      const sessions = yield* Session.Service
      const f = {
        sessions,
        prompt: yield* SessionPrompt.Service,
        chat: yield* sessions.create({ title: "seat boundary", permission: [] }),
      }
      const permission = yield* Permission.Service
      const host = yield* ClaudeHost.Service
      yield* f.sessions.setPermission({ sessionID: f.chat.id, permission: [] })
      const callback = Promise.withResolvers<void>()
      ClaudeEngineFixture.state.scripts.push(
        ClaudeEngineFixture.replies("first seat"),
        async function* (input, params) {
          const next = await input[Symbol.asyncIterator]().next()
          if (next.done) return
          yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
          yield { ...next.value, session_id: frame.session_id }
          const permit = params.options?.canUseTool
          if (!permit) throw new Error("missing second-seat callback")
          const result = await permit(
            "Bash",
            { command: "pwd" },
            { signal: new AbortController().signal, toolUseID: "second-permission", requestId: "second-permission" },
          )
          expect(result?.behavior).toBe("allow")
          callback.resolve()
          yield {
            type: "assistant",
            ...frame,
            uuid: "second-seat-answer",
            message: {
              id: "second-seat-answer",
              content: [{ type: "text", text: "second seat" }],
              stop_reason: "end_turn",
              usage: {},
            },
          }
          yield { type: "result", subtype: "success", is_error: false, total_cost_usd: 0, ...frame }
          for await (const _ of input) {
          }
        },
      )
      yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("first") })
      const second = yield* f.prompt.prompt({
        sessionID: f.chat.id,
        ...ClaudeEngineFixture.say("second"),
        agent: "second",
        noReply: true,
      })
      const engine = yield* ClaudeCode.Service
      yield* engine.admitted(second)
      expect(ClaudeEngineFixture.state.closed).toEqual([ClaudeEngineFixture.state.queries[0]])
      expect(ClaudeEngineFixture.state.inputs).toEqual(["first"])
      if (second.info.role !== "user") throw new Error("missing second user")
      const running = yield* host.turn({ sessionID: f.chat.id, user: second.info }).pipe(Effect.forkChild)
      const pending = yield* pollWithTimeout(
        permission
          .list()
          .pipe(Effect.map((requests) => requests.find((request) => request.metadata.command === "pwd"))),
        "new seat did not supply its permission context",
      )
      yield* permission.reply({ requestID: pending.id, reply: "once" })
      yield* Fiber.join(running)
      yield* Effect.promise(() => callback.promise)
      expect(ClaudeEngineFixture.state.queries).toHaveLength(2)
      expect(ClaudeEngineFixture.state.queries[1].options).toMatchObject({
        resume: "sdk-1",
        systemPrompt: { append: expect.stringContaining("`second` seat") },
      })
      const reply = (yield* f.sessions.messages({ sessionID: f.chat.id })).findLast(
        (item) => item.info.role === "assistant",
      )
      expect(reply?.info).toMatchObject({ agent: "second", parentID: second.info.id })
      yield* host.release(f.chat.id)
    }),
  30_000,
)
