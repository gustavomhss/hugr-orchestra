import { expect, test } from "bun:test"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Model } from "@opencode-ai/schema/model"
import { Provider } from "@opencode-ai/schema/provider"
import { Archive } from "@/continuity/archive"
import { chunks } from "@/continuity/transcript"
import { decode } from "@/continuity/memory"
import { MessageID, PartID, SessionID } from "@/session/schema"
import type { SessionV1 } from "@opencode-ai/core/v1/session"

function history(sessionID: SessionID): SessionV1.WithParts[] {
  const id = MessageID.make("msg_archive_acceptance")
  return [{ info: { id, sessionID, role: "user", agent: "build", time: { created: 1 },
    model: { providerID: Provider.ID.make("test"), modelID: Model.ID.make("test") } },
    parts: [{ id: PartID.make("prt_archive_acceptance"), messageID: id, sessionID, type: "text",
      text: "Discovery: read-only verification succeeded. Keep deployment awaiting approval.\n" + "Exact detail 😀\r\n".repeat(6000) }] }]
}

test("durable Markdown fragments preserve captured text, have content IDs, and survive reference retirement", async () => {
  const sessionID = SessionID.descending()
  const messages = history(sessionID)
  const planned = chunks(sessionID, messages)
  expect(planned.length).toBeGreaterThan(1)
  expect(planned.every((chunk) => chunk.id === new Bun.CryptoHasher("sha256").update(chunk.markdown).digest("hex"))).toBe(true)
  const result = await Effect.runPromise(Effect.gen(function* () {
    const archive = yield* Archive.Service
    const written = yield* archive.publish({ sessionID, messages })
    expect(written).toEqual(planned)
    expect(yield* archive.publish({ sessionID, messages })).toEqual(written)
    for (const fragment of written) expect(yield* archive.read({ sessionID, id: fragment.id })).toEqual(fragment)
    const snapshot = { sessionID, boundary: messages[0].info.id, tailStart: MessageID.make("msg_tail"),
      head: messages, tail: [], canRecall: true }
    const first = decode({ text: JSON.stringify({ memory: "# Work\nRead-only verification succeeded; deployment awaits approval.",
      references: [{ id: written[0].id, why: "Verification details if deployment is requested." }] }),
      snapshot, producerID: SessionID.descending(), available: written, maxTokens: 100000 })
    expect(first).toBeDefined()
    const next = decode({ text: JSON.stringify({ memory: "# Work\nDeployment remains awaiting approval. Verification details are no longer active.", references: [] }),
      snapshot: { ...snapshot, previous: first }, producerID: SessionID.descending(), available: written, maxTokens: 100000 })
    expect(next?.references).toEqual([])
    const inventory = yield* archive.list(sessionID)
    expect(inventory.map((entry) => entry.id)).toEqual(written.map((entry) => entry.id))
    expect(yield* archive.read({ sessionID: SessionID.descending(), id: written[0].id })).toBeUndefined()
    return inventory
  }).pipe(Effect.provide(AppNodeBuilder.build(Archive.node))))
  expect(result.length).toBe(planned.length)
})
