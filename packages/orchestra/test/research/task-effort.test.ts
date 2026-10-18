import { expect } from "bun:test"
import { Effect, Exit, Schema } from "effect"
import { EventV2 } from "@orchestra/core/event"
import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { NativeResearchTask } from "./fixtures/native-task"
import { testEffect } from "../lib/effect"

const it = testEffect(NativeResearchTask.layer)

// The caller's Task input chooses the tier; the native binding row records it before the seat's first provider call.
it.instance("native Task binds jimmy's requested effort tier, quick when absent, and refuses an unknown tier", () => Effect.gen(function* () {
  const fixture = yield* NativeResearchTask.setup()
  yield* Effect.addFinalizer(() => Effect.gen(function* () {
    yield* fixture.prompt.cancel(fixture.parent.id)
    yield* Effect.forEach(yield* fixture.sessions.children(fixture.parent.id), (child) => fixture.prompt.cancel(child.id))
    yield* fixture.sessions.remove(fixture.parent.id)
  }).pipe(Effect.orDie))
  const events = yield* EventV2.Service
  const bound: Research.Allowance[] = []
  const unsubscribe = yield* events.listen((event) => Effect.sync(() => {
    if (event.type !== ResearchEvent.AllowanceBound.type) return
    const admitted = Schema.decodeUnknownSync(ResearchEvent.AllowanceBound.data)(event.data)
    if (admitted.allowance.binding.authoritySessionID === fixture.parent.id) bound.push(admitted.allowance)
  }))
  yield* Effect.addFinalizer(() => unsubscribe)
  const brief = { description: "Tiered discovery", prompt: "Answer from what you already know.", subagent_type: "jimmy" }
  for (const [callID, effort] of [["deep-discovery", "deep"], ["focused-discovery", "focused"], ["default-discovery", undefined]] as const) {
    yield* fixture.remote.text("No sources needed.")
    yield* fixture.call({ ...brief, ...(effort ? { effort } : {}) }, callID).pipe(Effect.timeout("30 seconds"))
  }
  expect(bound.map((allowance) => [allowance.dispatchCallID, allowance.tier, allowance.providerLimit, allowance.toolLimit,
    allowance.byteLimit, allowance.deadlineSeconds])).toEqual([
    ["deep-discovery", "deep", 96, 256, 256 * 1024 * 1024, 2400],
    ["focused-discovery", "focused", 48, 128, 128 * 1024 * 1024, 1200],
    ["default-discovery", "quick", 24, 64, 64 * 1024 * 1024, 600],
  ])
  const refused = yield* fixture.call({ ...brief, effort: "max" }, "invalid-discovery")
  expect(Exit.isFailure(refused.exit)).toBe(true)
  expect(bound).toHaveLength(3)
}), 90_000)
