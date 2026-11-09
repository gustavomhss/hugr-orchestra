import type { Item, Person, Pulled, SourceKind } from "./types"

type Row = {
  listId: string
  source: SourceKind
  externalId: string
  actor: string
  snippet: string
  revision?: string
  threadId: string
  reply: boolean
  deepLink?: string
  personId?: string
  commitmentId?: string
  open: boolean
  revealAt?: number
}

type Egress = { readonly text: string; readonly threadId: string }
type StoredEgress = Egress & { readonly listId: string }

export type Saved = {
  readonly rows: readonly Row[]
  readonly drafts: readonly { readonly id: string; readonly text: string; readonly sent: boolean }[]
  readonly sent: readonly StoredEgress[]
  readonly next: number
}

export type Store = {
  upsert(pulled: Pulled): Item
  list(now: number): Item[]
  rank(items: readonly Item[]): Item[]
  link(itemId: string, personId: string | undefined, commitmentId: string | undefined): Item
  archive(id: string): Item
  markRead(id: string): Item
  remindTomorrow(id: string, now: number): Item
  handoff(ids: readonly string[]): { readonly ids: readonly string[] }
  saveDraft(id: string, text: string): Item
  originDraft(id: string, text: string): { readonly drafted: true }
  send(id: string, text: string, click: true): { readonly sent: true }
  release(id: string, text: string, click: boolean): { readonly sent: true }
  agentSend(id: string, text: string): never
  egress(): readonly Egress[]
  localDraft(id: string): string | undefined
}

export function open(people: readonly Person[], saved?: Saved, createId?: () => string): Store & { snapshot(): Saved } {
  const rows: Row[] = saved ? saved.rows.map((row) => ({ ...row })) : []
  const sent: StoredEgress[] = saved ? saved.sent.map((row) => ({ ...row })) : []
  const drafts = new Map(saved ? saved.drafts.map((draft) => [draft.id, { text: draft.text, sent: draft.sent }]) : [])
  let next = saved?.next ?? 1

  const personOf = (actor: string) => {
    const key = actor.toLowerCase()
    return people.find(
      (person) =>
        person.emails.some((email) => email.toLowerCase() === key) ||
        person.handles.some((handle) => handle.toLowerCase() === key),
    )
  }

  const rowsOf = (listId: string) => rows.filter((row) => row.listId === listId)

  const visible = (row: Row, now: number) => {
    if (row.revealAt !== undefined) return now >= row.revealAt
    return row.open
  }

  const item = (listId: string, now: number): Item => {
    const group = rowsOf(listId)
    const row = group[0]
    if (!row) throw new Error("missing")
    const waiting = group.some((entry) => visible(entry, now))
    return {
      id: listId,
      source: row.source,
      externalId: row.externalId,
      actor: row.actor,
      snippet: row.snippet,
      threadId: row.threadId,
      reply: row.reply,
      ...(row.deepLink ? { deepLink: row.deepLink } : {}),
      ...(row.personId ? { personId: row.personId } : {}),
      ...(row.commitmentId ? { commitmentId: row.commitmentId } : {}),
      waiting,
    }
  }

  const requireId = (id: string) => {
    if (!rows.some((row) => row.listId === id)) throw new Error("missing")
    return id
  }

  const close = (id: string) => {
    for (const row of rowsOf(id)) {
      row.open = false
      row.revealAt = undefined
    }
  }

  return {
    upsert(pulled) {
      const existing = rows.find((row) => row.source === pulled.source && row.externalId === pulled.externalId)
      if (existing) {
        // Edits keep local attention closed state: a revision change updates content only, never reopens a
        // closed item or cancels its pending reminder (QA-25 owner decision 2026-11-09; historical FAIL preserved
        // in evidence/qa-receipts.md). Only first acquisition enters waiting attention; identity is stable.
        if (pulled.revision !== undefined) existing.revision = pulled.revision
        existing.actor = pulled.actor
        existing.snippet = pulled.snippet
        existing.threadId = pulled.threadId
        existing.reply = pulled.reply
        existing.deepLink = pulled.deepLink
        return item(existing.listId, 0)
      }
      // Board actors are project/card references, never address-book people or delegable commitments.
      const person = ["board", "rss", "youtube", "calendar"].includes(pulled.source) ? undefined : personOf(pulled.actor)
      const joined = person ? rows.find((row) => row.personId === person.id) : undefined
      const listId = joined?.listId ?? createId?.() ?? `in_${next++}`
      rows.push({
        listId,
        source: pulled.source,
        externalId: pulled.externalId,
        actor: pulled.actor,
        snippet: pulled.snippet,
        ...(pulled.revision === undefined ? {} : { revision: pulled.revision }),
        threadId: pulled.threadId,
        reply: pulled.reply,
        ...(pulled.deepLink ? { deepLink: pulled.deepLink } : {}),
        ...(person ? { personId: person.id } : {}),
        ...(person?.openCommitmentId ? { commitmentId: person.openCommitmentId } : {}),
        open: true,
      })
      return item(listId, 0)
    },
    list(now) {
      const ids = [...new Set(rows.map((row) => row.listId))]
      return this.rank(ids.map((id) => item(id, now)))
    },
    rank(items) {
      return [...items].sort((left, right) => {
        if (left.waiting !== right.waiting) return left.waiting ? -1 : 1
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
      })
    },
    link(itemId, personId, commitmentId) {
      requireId(itemId)
      for (const row of rowsOf(itemId)) {
        row.personId = personId
        row.commitmentId = commitmentId
      }
      return item(itemId, 0)
    },
    archive(id) {
      requireId(id)
      close(id)
      return item(id, 0)
    },
    markRead(id) {
      requireId(id)
      close(id)
      return item(id, 0)
    },
    remindTomorrow(id, now) {
      requireId(id)
      const date = new Date(now)
      const revealAt = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
      for (const row of rowsOf(id)) {
        row.open = false
        row.revealAt = revealAt
      }
      return item(id, now)
    },
    handoff(ids) {
      const delivered = ids.map((id) => requireId(id))
      if (rows.some((row) => row.source === "board" && delivered.includes(row.listId))) throw new Error("refused")
      for (const id of delivered) close(id)
      return { ids: delivered }
    },
    saveDraft(id, text) {
      requireId(id)
      drafts.set(id, { text, sent: false })
      close(id)
      return item(id, 0)
    },
    originDraft(id, text) {
      requireId(id)
      drafts.set(id, { text, sent: false })
      return { drafted: true }
    },
    send(id, text, click) {
      return this.release(id, text, click)
    },
    release(id, text, click) {
      requireId(id)
      if (!click) throw new Error("refused")
      const row = rowsOf(id)[0]
      if (!row) throw new Error("missing")
      sent.push({ text, threadId: row.threadId, listId: id })
      const draft = drafts.get(id)
      if (draft) drafts.set(id, { text: draft.text, sent: true })
      return { sent: true }
    },
    agentSend() {
      throw new Error("refused")
    },
    egress() {
      return sent.map((row) => ({ text: row.text, threadId: row.threadId }))
    },
    localDraft(id) {
      return drafts.get(id)?.text
    },
    snapshot() {
      return {
        rows: rows.map((row) => ({ ...row })),
        drafts: [...drafts.entries()].map(([id, draft]) => ({ id, text: draft.text, sent: draft.sent })),
        sent: sent.map((row) => ({ ...row })),
        next,
      }
    },
  }
}
