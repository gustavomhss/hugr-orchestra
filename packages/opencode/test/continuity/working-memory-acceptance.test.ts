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

test("durable Markdown fragments preserve captured text, have content IDs, and survive memory retirement", async () => {
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
    const tail = [{ info: { ...messages[0].info, id: MessageID.make("msg_tail") }, parts: [] }]
    const snapshot = { sessionID, boundary: tail[0].info.id, tailStart: tail[0].info.id,
      head: messages, tail, canRecall: true }
    const host = { history: [...messages, ...tail], delegations: {}, member: false }
    const first = decode({ text: JSON.stringify({ ops: [{ op: "add", section: "findings", src: ["u1"], fields: {
      finding: "Read-only verification succeeded; deployment awaits approval.", why: "Deployment is next.", status: "confirmed" } }] }),
      snapshot, producerID: SessionID.descending(), host, ceiling: 100000 })
    if (!("artifact" in first)) throw new Error("Expected first memory")
    // Retiring the only item leaves a valid memory with zero items; the archive keeps every fragment.
    const after = [...tail, { info: { ...messages[0].info, id: MessageID.make("msg_next_tail") }, parts: [] }]
    const next = decode({ text: JSON.stringify({ ops: [{ op: "retire", id: "m1", reason: "Verification details are no longer active." }] }),
      snapshot: { ...snapshot, previous: first.artifact, head: tail, boundary: after[1].info.id, tailStart: after[1].info.id, tail: after.slice(1) },
      producerID: SessionID.descending(), host: { ...host, history: [...messages, ...after] }, ceiling: 100000 })
    expect("artifact" in next && next.artifact.items).toEqual([])
    expect("artifact" in next && next.artifact.text).toContain("## Findings\n(none)")
    const inventory = yield* archive.list(sessionID)
    expect(inventory.map((entry) => entry.id)).toEqual(written.map((entry) => entry.id))
    expect(yield* archive.read({ sessionID: SessionID.descending(), id: written[0].id })).toBeUndefined()
    return inventory
  }).pipe(Effect.provide(AppNodeBuilder.build(Archive.node))))
  expect(result.length).toBe(planned.length)
})
