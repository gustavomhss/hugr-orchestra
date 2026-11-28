import { expect, test } from "bun:test"
import type { SDKMessage, SDKUserMessage, query } from "@anthropic-ai/claude-agent-sdk"
import type { ExecutionHost } from "@orchestra/core/session/runner"
import { Effect, Layer, Stream } from "effect"
import { ClaudeCodeAccountFixture } from "./fixture/account"
import { ClaudeCodeSDK } from "../src/sdk"
import { ClaudeCodeHost } from "../src/v2/host"
import { frame, usage, user, turnOf } from "./v2-host.fixture"

test("a prompt Claude Code already took is not sent again after a stop or a broken turn; an unanswered failure resends it", async () => {
  const prompts: unknown[] = []
  let frames: SDKMessage[] = []
  // `hang`: the frames stop without ending, as a turn the owner then stops; otherwise they end, as a process that exits.
  let hang = false
  // Like the SDK: it writes the first message, then asks the input for the next one.
  const reading = Layer.succeed(
    ClaudeCodeSDK.Service,
    ClaudeCodeSDK.Service.of({
      query: ((input: { prompt: AsyncIterable<SDKUserMessage> }) => {
        const messages = input.prompt[Symbol.asyncIterator]()
        void messages.next().then((first) => {
          prompts.push(first.done ? undefined : first.value.message.content)
          return messages.next()
        })
        const queued = [...frames]
        const hangs = hang
        return {
          [Symbol.asyncIterator]() {
            return this
          },
          next: () =>
            new Promise((resolve) =>
              setTimeout(() => {
                const value = queued.shift()
                if (value) return resolve({ value, done: false })
                if (!hangs) resolve({ value: undefined, done: true })
              }, 5),
            ),
          return: () => Promise.resolve({ value: undefined, done: true }),
        }
      }) as unknown as typeof query,
    }),
  )
  const stored: { value: unknown } = { value: undefined }
  const run = (history: ReadonlyArray<unknown>) =>
    Effect.runPromise(
      ClaudeCodeHost.make.pipe(
        Effect.provide(ClaudeCodeAccountFixture.layer),
        Effect.flatMap((host) =>
          Stream.runCollect(
            host.stream(
              turnOf({
                history: history as ExecutionHost.Turn["history"],
                state: {
                  get: Effect.sync(() => stored.value),
                  update: (fn) => Effect.sync(() => void (stored.value = fn(stored.value))),
                },
              }),
            ),
          ).pipe(Effect.timeoutOption("300 millis")),
        ),
        Effect.provide(reading),
        Effect.provideService(ClaudeCodeSDK.Environment, {}),
      ),
    )
  const init = frame({ type: "system", subtype: "init", session_id: "claude-1" })

  // Stopped while Claude Code works on the prompt, before it replied.
  hang = true
  frames = [init]
  await run([user("msg_1", "First")])
  expect(stored.value).toEqual({ sessionId: "claude-1", delivered: ["msg_1"] })

  // Claude Code replied, then its process ended before the result.
  hang = false
  frames = [init, frame({ type: "assistant", uuid: "a1", session_id: "claude-1", parent_tool_use_id: null,
    message: { content: [{ type: "text", text: "Working" }] } })]
  await run([user("msg_1", "First"), user("msg_2", "Second")])
  expect(stored.value).toEqual({ sessionId: "claude-1", delivered: ["msg_1", "msg_2"] })

  // Signed out: Claude Code answered nothing, so the prompt is sent again with the next one.
  frames = [init, frame({ type: "assistant", uuid: "b1", session_id: "claude-1", parent_tool_use_id: null,
    error: "authentication_failed", message: { content: [] } }),
    frame({ type: "result", subtype: "success", is_error: true, session_id: "claude-1", result: "Not signed in", usage })]
  await run([user("msg_1", "First"), user("msg_2", "Second"), user("msg_3", "Third")])
  expect(stored.value).toEqual({ sessionId: "claude-1", delivered: ["msg_1", "msg_2"] })
  expect(prompts).toEqual(["First", "Second", "Third"])
})
