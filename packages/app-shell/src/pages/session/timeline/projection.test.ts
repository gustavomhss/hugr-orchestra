import { describe, expect, mock, test } from "bun:test"
import type { PartGroup } from "@orchestra/session-ui/message-part"
import { batch, createRoot, createSignal } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import type { SessionMessageAssistant, SessionMessageInfo } from "@/session-types"
import { normalizeSessionMessages } from "@/utils/session-message"
import type { Part, SessionStatus, UserMessage } from "@/v2-wire"
import { reuseTimelineRows } from "./row-reconciliation"
import { TimelineRow } from "./timeline-row"

// The real module pulls in the whole UI; the projection only needs its two pure helpers. `renderable` reads the
// text the way the real one does, which is the subscription the streaming rules are about.
mock.module("@orchestra/session-ui/message-part", () => ({
  renderable: (part: Part) => part.type !== "text" || !!part.text.trim(),
  groupParts: (refs: Array<{ messageID: string; part: { id: string } }>) =>
    refs.map((ref) => ({
      type: "part" as const,
      key: ref.part.id,
      ref: { messageID: ref.messageID, partID: ref.part.id },
    })),
}))

const { createTimelineProjection } = await import("./projection")
const { Timeline } = await import("./rows")

const context = (key: string, partIDs: string[], userMessageID = "user-1") =>
  new TimelineRow.AssistantPart({
    userMessageID,
    group: {
      key,
      type: "context",
      refs: partIDs.map((partID) => ({ messageID: "assistant-1", partID })),
    } satisfies PartGroup,
    previousAssistantPart: false,
  })

const user = (userMessageID = "user-1") => new TimelineRow.UserMessage({ userMessageID })
const keys = (rows: TimelineRow.TimelineRow[]) => rows.map(TimelineRow.key)

describe("reuseTimelineRows", () => {
  test.each([
    {
      name: "reuses an unchanged context group",
      previous: [context("context:a", ["a", "b"])],
      rows: [context("context:a", ["a", "b"])],
      expected: ["assistant-part:user-1:context:a"],
      reused: [[0, 0]],
    },
    {
      name: "preserves the group key when a member is appended",
      previous: [context("context:a", ["a"])],
      rows: [context("context:a", ["a", "b"])],
      expected: ["assistant-part:user-1:context:a"],
      reused: [],
    },
    {
      name: "preserves the group key when the first member is removed",
      previous: [context("context:a", ["a", "b"])],
      rows: [context("context:b", ["b"])],
      expected: ["assistant-part:user-1:context:a"],
      reused: [],
    },
    {
      name: "lets only the natural owner retain an old key after a split",
      previous: [context("context:a", ["a", "b"])],
      rows: [context("context:a", ["a"]), context("context:b", ["b"])],
      expected: ["assistant-part:user-1:context:a", "assistant-part:user-1:context:b"],
      reused: [],
    },
    {
      name: "chooses the earliest prior key when groups merge",
      previous: [context("context:a", ["a"]), context("context:b", ["b"])],
      rows: [context("context:b", ["b", "a"])],
      expected: ["assistant-part:user-1:context:a"],
      reused: [],
    },
    {
      name: "reserves an old key for its natural owner when two new groups compete",
      previous: [context("context:a", ["a", "b"])],
      rows: [context("context:b", ["b"]), context("context:a", ["a"])],
      expected: ["assistant-part:user-1:context:b", "assistant-part:user-1:context:a"],
      reused: [],
    },
    {
      name: "does not reuse context identity across user messages",
      previous: [context("context:a", ["a", "b"], "user-1")],
      rows: [context("context:b", ["b"], "user-2")],
      expected: ["assistant-part:user-2:context:b"],
      reused: [],
    },
    {
      name: "reuses an unaffected ordinary row",
      previous: [user()],
      rows: [user()],
      expected: ["user-message:user-1"],
      reused: [[0, 0]],
    },
    {
      name: "does not create accidental key collisions",
      previous: [context("context:a", ["a", "b", "c"])],
      rows: [context("context:b", ["b"]), context("context:a", ["a"]), context("context:c", ["c"])],
      expected: [
        "assistant-part:user-1:context:b",
        "assistant-part:user-1:context:a",
        "assistant-part:user-1:context:c",
      ],
      reused: [],
    },
  ])("$name", ({ previous, rows, expected, reused }) => {
    const result = reuseTimelineRows([...previous], [...rows])

    expect(keys(result)).toEqual([...expected])
    expect(new Set(keys(result)).size).toBe(result.length)
    reused.forEach(([resultIndex, previousIndex]) => expect(result[resultIndex]).toBe(previous[previousIndex]))
  })
})

const assistant = (id: string, created: number, content: SessionMessageAssistant["content"]) =>
  ({
    id,
    type: "assistant",
    agent: "build",
    model: { id: "model", providerID: "provider" },
    content,
    time: { created, completed: created + 1 },
  }) satisfies SessionMessageInfo

const readTool = (id: string): SessionMessageAssistant["content"][number] => ({
  id,
  type: "tool",
  name: "read",
  time: { created: 2, ran: 2, completed: 3 },
  state: { status: "completed", input: {}, metadata: {}, content: [{ type: "text", text: "contents" }] },
})

/** A long session whose last assistant message is streaming, wired to real Solid stores the way the app syncs them. */
function session(lastText = "Streaming") {
  const initial: SessionMessageInfo[] = [
    { id: "msg_1", type: "user", text: "first", time: { created: 1 } },
    assistant("msg_2", 2, [{ type: "text", text: "first answer" }]),
    { id: "msg_3", type: "user", text: "second", time: { created: 4 } },
    assistant("msg_4", 5, [
      { type: "text", text: "Reading." },
      readTool("prt_read"),
      { type: "text", text: "Done." },
      { type: "reasoning", text: "**Plan**\nthink" },
    ]),
    { id: "msg_5", type: "user", text: "third", time: { created: 8 } },
    assistant("msg_6", 9, [{ type: "text", text: lastText }]),
  ]
  const normalized = normalizeSessionMessages("ses_1", initial)
  const [source, setSource] = createStore({ messages: initial })
  const [store, setStore] = createStore({
    message: normalized.messages,
    part: Object.fromEntries(normalized.parts) as Record<string, Part[]>,
  })
  const [status, setStatus] = createSignal<SessionStatus>({ type: "busy" })
  const reads: string[] = []
  const users = () => store.message.filter((message): message is UserMessage => message.role === "user")
  const projection = createTimelineProjection({
    messages: () => store.message,
    userMessages: users,
    sessionMessages: () => source.messages,
    parts: (messageID) => {
      reads.push(messageID)
      return store.part[messageID] ?? []
    },
    status,
    showReasoningSummaries: () => true,
    turnDiffs: () => undefined,
  })
  /** Applies the touched messages the way the server session does: put each part, in place when it exists. */
  const sync = (touched: string[]) =>
    batch(() => {
      const next = normalizeSessionMessages("ses_1", source.messages)
      next.messages.forEach((message) => {
        if (!store.message.some((item) => item.id === message.id)) setStore("message", (value) => [...value, message])
      })
      touched.forEach((messageID) =>
        (next.parts.get(messageID) ?? []).forEach((part) => {
          const index = store.part[messageID]?.findIndex((item) => item.id === part.id) ?? -1
          if (index >= 0) return setStore("part", messageID, index, reconcile(part))
          setStore("part", messageID, (value = []) => [...value, part])
        }),
      )
    })
  const fresh = () => {
    const known = new Map(store.message.map((message) => [message.id, message]))
    return Timeline.constructSessionMessageRows(
      source.messages,
      (messageID) => known.get(messageID) as ReturnType<typeof users>[number] | undefined,
      (messageID) => store.part[messageID] ?? [],
      true,
      status().type,
      users(),
      () => undefined,
    )
  }
  const delta = (messageID: string, text: string) =>
    batch(() => {
      setSource(
        "messages",
        produce((messages) => {
          const content = messages.find((message) => message.id === messageID && message.type === "assistant")
          const first = content?.type === "assistant" ? content.content.find((item) => item.type === "text") : undefined
          if (first?.type === "text") first.text += text
        }),
      )
      sync([messageID])
    })
  return { projection, reads, sync, fresh, delta, source, setSource, setStatus }
}

const run = (lastText: string | undefined, body: (harness: ReturnType<typeof session>) => void) =>
  createRoot((dispose) => {
    try {
      body(session(lastText))
    } finally {
      dispose()
    }
  })

const earlier = new Set(["msg_1", "msg_2", "msg_3", "msg_4"])

describe("createTimelineProjection", () => {
  test("projects the same rows as building them from scratch", () =>
    run(undefined, (h) => {
      expect(h.projection.rows()).toEqual(h.fresh().rows)
      expect(h.projection.activeMessageID()).toBe(h.fresh().activeMessageID)
      expect(h.projection.rows().map(TimelineRow.key)).toEqual([
        "user-message:msg_1",
        "assistant-part:msg_1:msg_2:text:0",
        "turn-gap:msg_3",
        "user-message:msg_3",
        "assistant-part:msg_3:msg_4:text:0",
        "assistant-part:msg_3:prt_read",
        "assistant-part:msg_3:msg_4:text:1",
        "assistant-part:msg_3:msg_4:reasoning:0",
        "turn-gap:msg_5",
        "user-message:msg_5",
        "assistant-part:msg_5:msg_6:text:0",
      ])
    }))

  test("a text delta on the last message reads no part of an earlier turn", () =>
    run(undefined, (h) => {
      const before = h.projection.rows()
      h.reads.length = 0

      h.delta("msg_6", " more")

      expect(h.projection.rows()).toEqual(h.fresh().rows)
      expect(h.reads.filter((id) => earlier.has(id))).toEqual([])
      // Row identity of every earlier turn is kept, so the list does not remount them.
      h.projection.rows().forEach((row, index) => {
        if (index < before.length - 1) expect(row).toBe(before[index]!)
      })
    }))

  test("many deltas on the last message never rebuild an earlier turn", () =>
    run(undefined, (h) => {
      h.projection.rows()
      h.reads.length = 0

      Array.from({ length: 20 }, (_, index) => h.delta("msg_6", ` token${index}`))

      expect(h.projection.rows()).toEqual(h.fresh().rows)
      expect(h.reads.filter((id) => earlier.has(id))).toEqual([])
    }))

  test("the first text of an empty part adds its row without touching earlier turns", () =>
    run("", (h) => {
      expect(h.projection.rows().map(TimelineRow.key).at(-1)).toBe("thinking:msg_5")
      h.reads.length = 0

      h.delta("msg_6", "Hi")

      expect(h.projection.rows().map(TimelineRow.key).at(-1)).toBe("assistant-part:msg_5:msg_6:text:0")
      expect(h.projection.rows()).toEqual(h.fresh().rows)
      expect(h.reads.filter((id) => earlier.has(id))).toEqual([])
    }))

  test("a new tool part rebuilds only its own turn", () =>
    run(undefined, (h) => {
      h.projection.rows()
      h.reads.length = 0

      h.setSource(
        "messages",
        produce((messages) => {
          const last = messages.at(-1)
          if (last?.type === "assistant") last.content.push(readTool("prt_new"))
        }),
      )
      h.sync(["msg_6"])

      expect(h.projection.rows().map(TimelineRow.key).at(-1)).toBe("assistant-part:msg_5:prt_new")
      expect(h.projection.rows()).toEqual(h.fresh().rows)
      expect(h.reads.filter((id) => earlier.has(id))).toEqual([])
    }))

  test("a new user turn and a status change match a fresh build", () =>
    run(undefined, (h) => {
      h.projection.rows()

      h.setSource("messages", (messages) => [...messages, { id: "msg_7", type: "user", text: "fourth", time: { created: 12 } }])
      h.sync(["msg_7"])
      expect(h.projection.rows()).toEqual(h.fresh().rows)
      expect(h.projection.activeMessageID()).toBe("msg_7")
      expect(h.projection.rows().map(TimelineRow.key).at(-1)).toBe("thinking:msg_7")

      h.setStatus({ type: "idle" })
      expect(h.projection.rows()).toEqual(h.fresh().rows)
      expect(h.projection.rows().map(TimelineRow.key)).not.toContain("thinking:msg_7")
    }))
})
