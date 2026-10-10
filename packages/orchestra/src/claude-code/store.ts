export * as ClaudeCodeStore from "./store"

import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { Cause, Effect, Option, Schema } from "effect"
import type { SessionKey, SessionStore, SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import type { Session } from "@/session/session"
import type { MessageID, SessionID } from "@/session/schema"
import type { SessionContinuity } from "@/continuity/service"
import { hash } from "@/continuity/archive-format"
import { ClaudeCodeTranscript } from "./transcript"
import { ClaudeCodeNative } from "./native"
import { estimate } from "@/continuity/masking"
import { ClaudeCodeStorage } from "./storage"
import type { Provider } from "@/provider/provider"

const keySchema = Schema.Struct({ projectKey: Schema.NonEmptyString, sessionId: Schema.NonEmptyString, subpath: Schema.optional(Schema.NonEmptyString) })
const entrySchema = Schema.Record(Schema.String, Schema.Json)
const storedSchema = Schema.Struct({ version: Schema.Literal(1), sessionID: Schema.String,
  mapping: Schema.Record(Schema.String, Schema.String),
  retracted: Schema.optional(Schema.Array(Schema.String)),
  delivered: Schema.optional(Schema.Array(Schema.String)),
  members: Schema.optional(Schema.Record(Schema.String, Schema.Array(Schema.String))),
  keys: Schema.Array(Schema.Struct({ key: keySchema, entries: Schema.Array(entrySchema), leaf: Schema.optional(Schema.NullOr(Schema.String)) })) })
type Stored = { version: 1; sessionID: string; mapping: Record<string, string>; retracted: string[]; delivered: string[];
  members: Record<string, string[]>; keys: { key: SessionKey; entries: SessionStoreEntry[]; leaf: string | null | undefined }[] }

/** Full native archive and mapping side index. Prepared views are never written back into this archive. */
export function create(input: {
  sessionID: SessionID
  fs: FSUtil.Interface
  sessions: Session.Interface
  continuity: SessionContinuity.Interface
  run: <A>(effect: Effect.Effect<A, unknown>) => Promise<A>
  userID?: MessageID
  userIDs?: readonly MessageID[]
  canRecall: boolean
  rewrite: () => boolean
  diagnostic?: (reason: string) => Effect.Effect<void>
  onFailure?: () => Effect.Effect<void>
  onDelivery?: (ids: readonly MessageID[]) => Effect.Effect<void>
}) {
  const root = path.join(Global.Path.data, "claude-code")
  const dir = path.join(root, hash(input.sessionID))
  const diagnostic = (reason: string) => input.diagnostic?.(reason) ?? Effect.logWarning("Claude Code transcript", { sessionID: input.sessionID, reason })
  const directory = Effect.gen(function* () {
    const base = yield* input.fs.realPath(Global.Path.data)
    const canonical = path.join(base, "claude-code", hash(input.sessionID))
    for (const target of [path.dirname(canonical), canonical]) {
      yield* input.fs.makeDirectory(target, { mode: 0o700 }).pipe(Effect.catchReason("PlatformError", "AlreadyExists", () => Effect.void))
      if ((yield* input.fs.stat(target)).type !== "Directory" || (yield* input.fs.realPath(target)) !== target || !target.startsWith(base + path.sep))
        return yield* Effect.fail(new Error("claude-code-unsafe-path"))
      yield* input.fs.chmod(target, 0o700)
    }
    return canonical
  })
  const storage = ClaudeCodeStorage.create<Stored>({ fs: input.fs, directory,
    empty: () => ({ version: 1, sessionID: input.sessionID, mapping: {}, retracted: [], delivered: [], members: {}, keys: [] }),
    decode: (text) => {
    const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
    const decoded = Option.isSome(json) ? Schema.decodeUnknownOption(storedSchema)(json.value) : Option.none()
    if (Option.isNone(decoded) || decoded.value.sessionID !== input.sessionID)
      throw new Error("claude-code-corrupt-storage")
    const value = decoded.value
    if (new Set(value.keys.map((item) => JSON.stringify(item.key))).size !== value.keys.length ||
      value.keys.some((item) => item.entries.some((entry) => typeof entry.type !== "string" ||
        entry.uuid !== undefined && typeof entry.uuid !== "string" ||
        entry.timestamp !== undefined && typeof entry.timestamp !== "string" ||
        entry.sessionId !== undefined && entry.sessionId !== item.key.sessionId)))
      throw new Error("claude-code-corrupt-storage")
    return { ...value, mapping: { ...value.mapping }, retracted: [...value.retracted ?? []], delivered: [...value.delivered ?? []],
      members: Object.fromEntries(Object.entries(value.members ?? {}).map(([uuid, ids]) => [uuid, [...ids]])),
      keys: value.keys.map((item) => ({ key: item.key, entries: item.entries as SessionStoreEntry[], leaf: item.leaf })) } satisfies Stored
  } })
  const read = storage.read
  const serialized = <A, E>(effect: Effect.Effect<A, E>) => effect.pipe(
    Effect.tapCause((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : input.onFailure?.() ?? Effect.void))
  const record = (value: { apiID?: string; uuid?: string; messageID: MessageID }) => serialized(storage.modify((stored) => {
    for (const id of [value.apiID, value.uuid].filter((id) => id !== undefined)) {
      if (stored.mapping[id] && stored.mapping[id] !== value.messageID) throw new Error("claude-code-mapping-conflict")
      stored.mapping[id] = value.messageID
    }
  })).pipe(Effect.orDie)
  const validate = (key: SessionKey) => Effect.gen(function* () {
    yield* Schema.decodeUnknownEffect(keySchema)(key)
    const session = yield* input.sessions.get(input.sessionID)
    const metadata = session.metadata?.claudeCode
    const owner = ClaudeCodeTranscript.record(metadata) ? metadata.sessionId : undefined
    if (owner && owner !== key.sessionId) return yield* Effect.fail(new Error("claude-code-session-key-mismatch"))
  })
  const store: SessionStore = {
    append: (key, entries) => input.run(serialized(Effect.gen(function* () {
      yield* validate(key)
      const ids = input.userIDs ?? (input.userID ? [input.userID] : [])
      const history = ids.length ? yield* input.sessions.messages({ sessionID: input.sessionID }) : []
      const users = ids.flatMap((id) => history.filter((message) => message.info.id === id && message.info.role === "user"))
      const prompt = input.userID && ids.includes(input.userID) && users.length && users.length === ids.length
        ? users.flatMap((message) => message.parts.flatMap((part) => part.type === "text" && !part.ignored ? [part.text] : [])).join("\n\n").trim()
        : undefined
      return yield* storage.modify((stored) => {
      if (stored.keys.some((item) => item.key.projectKey !== key.projectKey || item.key.sessionId !== key.sessionId))
        throw new Error("claude-code-session-key-mismatch")
      const normalized = { projectKey: key.projectKey, sessionId: key.sessionId, ...key.subpath === undefined ? {} : { subpath: key.subpath } }
      const item: Stored["keys"][number] = stored.keys.find((item) => isDeepStrictEqual(item.key, normalized)) ?? { key: normalized, entries: [], leaf: undefined }
      if (!stored.keys.includes(item)) stored.keys.push(item)
      const incoming = Schema.decodeUnknownSync(Schema.Array(entrySchema))(entries)
      const before = stored.delivered.length
      for (const blob of incoming) {
        if (typeof blob.type !== "string" || blob.uuid !== undefined && typeof blob.uuid !== "string" ||
          blob.timestamp !== undefined && typeof blob.timestamp !== "string")
          throw new Error("claude-code-invalid-entry")
        const entry = blob as SessionStoreEntry
        if (entry.sessionId !== undefined && (typeof entry.sessionId !== "string" || entry.sessionId !== key.sessionId))
          throw new Error("claude-code-entry-owner-mismatch")
        const existing = entry.uuid ? item.entries.findLast((value) => value.uuid === entry.uuid) : undefined
        if (existing && isDeepStrictEqual(existing, entry)) continue
        item.entries.push(structuredClone(entry))
        if (entry.type === "last-prompt" && (typeof entry.leafUuid === "string" || entry.leafUuid === null)) item.leaf = entry.leafUuid
        if (ClaudeCodeNative.conversational(entry) && entry.uuid) item.leaf = entry.uuid
        if (key.subpath || !ClaudeCodeTranscript.main(entry)) continue
        const api = ClaudeCodeTranscript.apiID(entry)
        const id = api ? stored.mapping[api] : undefined
        if (entry.type === "assistant" && entry.uuid && id) stored.mapping[entry.uuid] = id
        // A native user row is a receipt only for the exact host prompt admitted to this query.
        const receipt = prompt && ClaudeCodeTranscript.prompt(entry) && ClaudeCodeTranscript.record(entry.message) && entry.message.role === "user" &&
          (entry.message.content === prompt || isDeepStrictEqual(entry.message.content, [{ type: "text", text: prompt }]))
        if (!existing && entry.uuid && input.userID && !stored.mapping[entry.uuid] && receipt) {
          stored.mapping[entry.uuid] = input.userID
          stored.members[entry.uuid] = [...ids]
          stored.delivered = [...new Set([...stored.delivered, ...stored.members[entry.uuid]])]
        }
      }
      return stored.delivered.length !== before
      })
    })).pipe(Effect.flatMap((delivered) => delivered && input.onDelivery && input.userIDs ? input.onDelivery(input.userIDs) : Effect.void))),
    load: (key) => input.run(prepare(key).pipe(Effect.map((prepared) => prepared?.entries ?? null))),
    listSubkeys: (key) => input.run(serialized(read.pipe(Effect.map((stored) => stored.keys.flatMap((item) =>
      item.key.projectKey === key.projectKey && item.key.sessionId === key.sessionId && item.key.subpath ? [item.key.subpath] : []))))),
  }
  const retract = (uuids: readonly string[]) => serialized(storage.modify((stored) => {
    const messages = new Set(uuids.flatMap((uuid) => stored.mapping[uuid] ? [stored.mapping[uuid]] : []))
    const native = stored.keys.flatMap((item) => item.entries.filter((entry) => entry.uuid &&
      (uuids.includes(entry.uuid) || messages.has(stored.mapping[entry.uuid] ?? stored.mapping[ClaudeCodeNative.apiID(entry) ?? ""]))))
    stored.retracted = [...new Set([...stored.retracted, ...uuids, ...native.flatMap((entry) => entry.uuid ? [entry.uuid] : [])])]
  }))
  const prepare = (key: SessionKey, options: { admit?: boolean; model?: Provider.Model } = {}) => Effect.gen(function* () {
      yield* serialized(validate(key))
      const stored = yield* serialized(read)
       const normalized = { projectKey: key.projectKey, sessionId: key.sessionId, ...key.subpath === undefined ? {} : { subpath: key.subpath } }
       const item = stored.keys.find((item) => isDeepStrictEqual(item.key, normalized))
      if (!item) return undefined
      if (key.subpath) return { key, entries: structuredClone(ClaudeCodeNative.fold(item.entries, stored.retracted)),
        kind: "ready" as const, reason: "sidechain", ready: true, tokens: 0, nativeTokens: 0 }
      const session = yield* input.sessions.get(input.sessionID)
      const all = yield* input.sessions.messages({ sessionID: input.sessionID })
      const index = session.revert ? all.findIndex((message) => message.info.id === session.revert?.messageID) : -1
      const history = index < 0 ? all : [...all.slice(0, index), ...session.revert?.partID ? [{ ...all[index],
        parts: all[index].parts.slice(0, all[index].parts.findIndex((part) => part.id === session.revert?.partID)) }] : []]
      const visible = new Set(history.map((message) => message.info.id))
      const folded = ClaudeCodeNative.fold(item.entries, stored.retracted)
      const removed = new Set([...stored.retracted, ...folded.flatMap((entry) => {
        const mapped = stored.mapping[entry.uuid ?? ""] ?? stored.mapping[ClaudeCodeTranscript.apiID(entry) ?? ""]
        const message = history.find((message) => message.info.id === mapped)
        const changed = entry.type === "assistant" && message && ClaudeCodeTranscript.blocks(entry).some((block) => {
          if (block.type === "tool_use") return !message.parts.some((part) => part.type === "tool" && part.callID === block.id)
          if (block.type === "text") return !message.parts.some((part) => part.type === "text" && part.text === block.text)
          if (block.type === "thinking") return !message.parts.some((part) => part.type === "reasoning" && part.text === block.thinking)
          return false
        })
        const memberRemoved = entry.uuid && stored.members[entry.uuid]?.some((id) => !visible.has(id as MessageID))
        return mapped && (!visible.has(mapped as MessageID) || changed || memberRemoved) && entry.uuid ? [entry.uuid] : []
      })])
      // Native archives retain reverted branches. Never resume their descendants, even after a process restart.
      ClaudeCodeNative.exclude(item.entries, removed)
      const retained = ClaudeCodeNative.exclude(folded, removed)
      const mapped = (entry: SessionStoreEntry) => stored.mapping[entry.uuid ?? ""] ?? stored.mapping[ClaudeCodeNative.apiID(entry) ?? ""]
      const last = history.findLast((message) => retained.some((entry) => mapped(entry) === message.info.id))?.info.id
      const selected = retained.findLast((entry) => ClaudeCodeNative.conversational(entry) && mapped(entry) === last)?.uuid
      const active = ClaudeCodeNative.active(retained, removed.size ? selected : undefined)
      const entries = active.entries
      if (removed.size) {
        yield* input.continuity.invalidate(input.sessionID)
        yield* diagnostic("history-resynchronized")
      }
      const nativeTokens = estimate(entries)
      if (!input.rewrite() || active.reason) return { key, entries: structuredClone(entries), reason: active.reason ?? "native",
        kind: active.reason && active.reason !== "cleared" ? "fallback" as const : "ready" as const, ready: true, tokens: nativeTokens, nativeTokens }
      const view = yield* (options.admit ? input.continuity.admit : input.continuity.prepare)({ sessionID: input.sessionID, messages: history,
        expectedUserID: options.admit ? input.userID : undefined, model: options.model, canRecall: input.canRecall })
      const prepared = ClaudeCodeTranscript.materialize({ entries, history, mapping: stored.mapping, view })
      yield* diagnostic(removed.size ? `history-resynchronized:${prepared.reason}` : prepared.reason)
      return { key, entries: structuredClone(prepared.entries), reason: prepared.reason, kind: prepared.kind,
        ready: true, tokens: estimate(prepared.entries), nativeTokens }
    })
  return { store, record, retract, prepare, read: serialized(read), directory: dir }
}
