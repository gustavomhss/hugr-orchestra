import { describe, expect, test } from "bun:test"
import type { retry } from "@orchestra/core/util/retry"
import type { SessionMessageInfo } from "@/session-types"
import type { Part, Session } from "@/v2-wire"
import { createServerSession } from "./server-session"
import { resyncAfterReconnect } from "./server-resync"
import { session, v2User, v2Assistant, textPart, page, deferredPage, ids, messageClient, create, type SessionApi } from "./server-session-test.fixture"

describe("server session", () => {
  test("reconnect force reads a new history snapshot after a pre-gap read settles", async () => {
    const old = deferredPage()
    const fresh = page([v2User("message-1"), v2Assistant("message-2", 2, "completed during gap")])
    const client = messageClient(old.promise, fresh)
    const store = create(client)
    store.pin("ses_child")
    const beforeGap = store.sync("ses_child")
    await client.requested(1)
    expect(client.requests).toHaveLength(1)
    expect(store.history.loading("ses_child")).toBe(true)

    const reconnect = resyncAfterReconnect(store, {})
    // The snapshot was captured before disconnect and contains none of the reply completed during the gap.
    old.resolve(page([v2User("message-1")]))
    await Promise.all([beforeGap, reconnect])

    expect(client.requests).toHaveLength(2)
    expect(ids(store)).toEqual(["message-1", "message-2"])
    expect(store.data.session_message.ses_child?.at(-1)).toMatchObject({
      id: "message-2", content: [{ type: "text", text: "completed during gap" }],
    })
    expect(store.history.loading("ses_child")).toBe(false)
  })

  test("forced history settles failed predecessors, coalesces callers and leaves another Session independent", async () => {
    const messageID = "msg_force_boundary"
    const results: {
      failure: string
      problem: Error
      first: unknown
      trailing: unknown
      duplicate: unknown
      reads: number
      maximum: number
      ids: string[] | undefined
      later: unknown[]
      message: SessionMessageInfo | undefined
      parts: Part[] | undefined
    }[] = []
    for (const failure of ["history", "metadata", "trailing"] as const) {
      const pending = deferredPage()
      const trailingPage = deferredPage()
      const started = Promise.withResolvers<void>()
      const secondStarted = Promise.withResolvers<void>()
      const metadata = Promise.withResolvers<Awaited<ReturnType<SessionApi["get"]>>>()
      const info = (id: string) => ({ ...session(id), location: { directory: "/repo" }, cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } })
      const problem = new Error(`${failure} read failed`)
      const state = { reads: 0, active: 0, maximum: 0, gets: 0 }
      const base = messageClient()
      const store = createServerSession(
        {
          ...base.sessionApi,
          get: async (input) => {
            if (input.sessionID !== "ses_child") return info(input.sessionID)
            state.gets++
            return failure === "metadata" && state.gets === 1 ? metadata.promise : info(input.sessionID)
          },
        },
        {
          ...base.messageApi,
          list: async (input) => {
            if (input.sessionID !== "ses_child") return page([v2User("other-session")])
            state.reads++
            state.active++
            state.maximum = Math.max(state.maximum, state.active)
            started.resolve()
            try {
              if (state.reads === 1) return await pending.promise
              secondStarted.resolve()
              return failure === "trailing" && state.reads === 2
                ? await trailingPage.promise
                : page([v2User(messageID, 1, "fresh-after-failure")])
            } finally {
              state.active--
            }
          },
        },
        { retry: async (read) => read(), todo: async () => [] },
      )
      const outcome = (task: Promise<void>) =>
        task.then(
          () => ({ ok: true }),
          (error: unknown) => ({ error }),
        )
      const first = outcome(store.sync("ses_child"))
      await started.promise
      if (failure === "metadata") metadata.reject(problem)
      // A complete independent read lets the failed metadata child settle while A's history stays held.
      await store.sync("ses_other")
      expect(store.data.message.ses_other?.map((message) => message.id)).toEqual(["other-session"])
      expect(state.reads).toBe(1)
      expect(state.active).toBe(1)
      const trailing = outcome(store.sync("ses_child", { force: true }))
      const samePredecessor = outcome(store.sync("ses_child", { force: true }))
      const later: ReturnType<typeof outcome>[] = []
      try {
        if (failure === "history") pending.reject(problem)
        if (failure !== "history") pending.resolve(page([v2User(messageID, 1, "old-captured-page")]))
        if (failure === "trailing") {
          await first
          // This deadline only bounds observation; the actual second HTTP read establishes the ordering.
          expect(await Promise.race([secondStarted.promise.then(() => true), Bun.sleep(2_000).then(() => false)])).toBe(true)
          expect(state.reads).toBe(2)
          expect(state.active).toBe(1)
          later.push(outcome(store.sync("ses_child", { force: true })), outcome(store.sync("ses_child", { force: true })))
          expect(state.reads).toBe(2)
          trailingPage.resolve(page([v2User(messageID, 1, "captured-trailing-page")]))
        }
        const laterResults = await Promise.all(later)
        results.push({
          failure,
          problem,
          first: await first,
          trailing: await trailing,
          duplicate: await samePredecessor,
          reads: state.reads,
          maximum: state.maximum,
          ids: ids(store),
          later: laterResults,
          message: store.data.session_message.ses_child?.find((message) => message.id === messageID),
          parts: store.data.part[messageID],
        })
      } finally {
        metadata.resolve(info("ses_child"))
        pending.resolve(page())
        trailingPage.resolve(page())
        await Promise.all([first, trailing, samePredecessor, ...later])
      }
    }
    for (const result of results) {
      expect(result.first).toEqual(result.failure === "trailing" ? { ok: true } : { error: result.problem })
      expect(result.trailing).toEqual({ ok: true })
      expect(result.duplicate).toEqual({ ok: true })
      expect(result.reads).toBe(result.failure === "trailing" ? 3 : 2)
      expect(result.maximum).toBe(1)
      expect(result.ids).toEqual([messageID])
      expect(result.message).toMatchObject({ id: messageID, type: "user", text: "fresh-after-failure" })
      expect(result.parts).toEqual([textPart(messageID, { text: "fresh-after-failure" })])
      expect(result.later).toEqual(result.failure === "trailing" ? [{ ok: true }, { ok: true }] : [])
    }
  })

  test("deletion cancels the old trailing read without letting its finalizer erase a replacement owner", async () => {
    const messageID = "msg_replacement_boundary"
    const old = deferredPage()
    const replacement = deferredPage()
    const client = messageClient(old.promise, replacement.promise, page([v2User(messageID, 1, "replacement-fresh")]))
    const store = create(client)
    const first = store.sync("ses_child")
    await client.requested(1)
    const obsolete = store.sync("ses_child", { force: true })
    store.apply({ type: "session.next.deleted", properties: { timestamp: 2, sessionID: "ses_child" } })
    const next = store.sync("ses_child")
    await client.requested(2)
    const nextForce = store.sync("ses_child", { force: true })
    try {
      old.resolve(page([v2User(messageID, 1, "deleted-owner")]))
      await Promise.all([first, obsolete])
      expect(client.requests).toHaveLength(2)
      expect(ids(store) ?? []).not.toContain(messageID)
      const sameReplacement = store.sync("ses_child", { force: true })
      replacement.resolve(page([v2User(messageID, 1, "replacement-captured")]))
      await Promise.all([next, nextForce, sameReplacement])
      expect(client.requests).toHaveLength(3)
      expect(ids(store)).toEqual([messageID])
      expect(store.data.session_message.ses_child?.find((message) => message.id === messageID)).toMatchObject({
        id: messageID, type: "user", text: "replacement-fresh",
      })
      expect(store.data.part[messageID]).toEqual([textPart(messageID, { text: "replacement-fresh" })])
    } finally {
      old.resolve(page())
      replacement.resolve(page())
      await Promise.allSettled([first, obsolete, next, nextForce])
    }
  })

})
