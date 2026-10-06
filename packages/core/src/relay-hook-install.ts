export * as RelayHookInstall from "./relay-hook-install"

import path from "path"
import { createHash, randomBytes, randomUUID } from "crypto"
import { rmSync } from "fs"
import { Clock, Effect, Option, Result, Schema } from "effect"
import { RelayHook } from "@opencode-ai/schema/relay-hook"
import type { RelayLedger } from "@opencode-ai/schema/relay-ledger"
import { RelayJson } from "@opencode-ai/relay/json"
import { KeyedMutex } from "./effect/keyed-mutex"
import { FSUtil } from "./fs-util"
import { MaestroArsenal } from "./tool/maestro-arsenal"
import { ToolSafetyProfile } from "./tool-safety-profile"

// The hook install writer (relay-exec-spec H1). Orchestra's server is the only writer of `hooks.json`: every install
// pins a published `relay.hook.v1` snapshot under the graph rules of Relay's `compile_hook`, so enforcement never sees
// a graph the compiler would refuse, even from a crafted export. `hooks.json` sits beside `preferences.json` in the
// project's ToolSafety profile directory, and reads follow the profile loader's rules.

/** The profile loader's cap. A larger file would hold every tool call, so the writer never produces one. */
export const MAX_BYTES = 512 * 1024

export const Reason = Schema.Literals([
  // Reading hooks.json, as the profile loader names them.
  "profile-project-invalid",
  "profile-state-root-acquisition",
  "profile-not-file-or-overflow",
  "profile-symlink-denied",
  "profile-changed-during-read",
  "profile-read-acquisition",
  "profile-invalid",
  // Writing hooks.json.
  "profile-overflow",
  "profile-write-acquisition",
  // The install request.
  "snapshot-invalid",
  "sha256-mismatch",
  "document-installed",
  "install-missing",
  "order-mismatch",
  // Repairing hooks.json.
  "repair-not-needed",
  "repair-refused",
])
export type Reason = typeof Reason.Type

export class Refused extends Schema.TaggedErrorClass<Refused>()("RelayHookInstall.Refused", {
  reason: Reason,
  message: Schema.String,
}) {}

/** `data` is `Global.data`; installs are pinned per project, in `file(data, projectID)`. */
export interface Binding {
  readonly data: string
  readonly projectID: string
}

/** A lifecycle receipt for `hooks/<installID>/ledger.jsonl`; the ledger writer stamps `ts`. */
export type Receipt = Omit<RelayLedger.HookLifecycle, "ts">

export interface Changed {
  readonly install: RelayHook.Install
  readonly receipt: Receipt
}

/** Beside `preferences.json`, in the ToolSafety profile directory the profile loader reads. */
export const file = (data: string, projectID: string) =>
  path.join(ToolSafetyProfile.profileDirectory(MaestroArsenal.stateDirectory(data, projectID), projectID), "hooks.json")

/**
 * The installs of a project; an absent file is none. Refuses `profile-invalid` when the file does not decode strictly
 * or when an install no longer holds what the writer checked (its graph rules and its sha256).
 */
export const read = Effect.fn("RelayHookInstall.read")(function* (binding: Binding) {
  const fs = yield* FSUtil.Service
  return yield* load(fs, yield* locate(fs, binding))
})

/** Pins a published version; one install per document. Its sha256 must be sha256(json.compact(snapshot)). */
export const install = Effect.fn("RelayHookInstall.install")(function* (
  input: Binding & {
    readonly document: string
    readonly version: string
    readonly snapshot: unknown
    readonly sha256: string
    readonly principal: string
  },
) {
  const snapshot = yield* pin(input.snapshot, input.sha256)
  const installedAt = yield* Clock.currentTimeMillis
  return yield* mutate(input, (installs) => {
    const existing = installs.find((item) => item.document === input.document)
    if (existing)
      return refuse(
        "document-installed",
        `Document ${input.document} is already installed as ${existing.installID}; update that install instead.`,
      )
    const created = {
      installID: `h-${randomBytes(8).toString("hex")}`,
      document: input.document,
      version: input.version,
      sha256: input.sha256,
      order: Math.max(-1, ...installs.map((item) => item.order)) + 1,
      enabled: true,
      installedBy: input.principal,
      installedAt,
      snapshot,
    }
    return Effect.succeed({ installs: [...installs, created], changed: changed(created, "hook-installed", input) })
  })
})

/** Repins an install to another version of its document, keeping its ID, order and enabled state. */
export const update = Effect.fn("RelayHookInstall.update")(function* (
  input: Binding & {
    readonly installID: string
    readonly version: string
    readonly snapshot: unknown
    readonly sha256: string
    readonly principal: string
  },
) {
  const snapshot = yield* pin(input.snapshot, input.sha256)
  const installedAt = yield* Clock.currentTimeMillis
  return yield* replace(input, (current) => ({
    install: {
      ...current,
      version: input.version,
      sha256: input.sha256,
      installedBy: input.principal,
      installedAt,
      snapshot,
    },
    event: "hook-updated",
  }))
})

export const setEnabled = Effect.fn("RelayHookInstall.setEnabled")(function* (
  input: Binding & { readonly installID: string; readonly enabled: boolean; readonly principal: string },
) {
  return yield* replace(input, (current) => ({
    install: { ...current, enabled: input.enabled },
    event: input.enabled ? "hook-enabled" : "hook-disabled",
  }))
})

export const uninstall = Effect.fn("RelayHookInstall.uninstall")(function* (
  input: Binding & { readonly installID: string; readonly principal: string },
) {
  return yield* mutate(input, (installs) => {
    const current = installs.find((item) => item.installID === input.installID)
    if (!current) return missing(input.installID)
    return Effect.succeed({
      installs: installs.filter((item) => item !== current),
      changed: changed(current, "hook-uninstalled", input),
    })
  })
})

/** Sets the evaluation order to the given sequence, which must name every install exactly once. */
export const reorder = Effect.fn("RelayHookInstall.reorder")(function* (
  input: Binding & { readonly installIDs: ReadonlyArray<string> },
) {
  return yield* mutate(input, (installs) => {
    const known = new Set(installs.map((item) => item.installID))
    if (
      input.installIDs.length !== installs.length ||
      new Set(input.installIDs).size !== installs.length ||
      input.installIDs.some((id) => !known.has(id))
    )
      return refuse("order-mismatch", "The order must name every installed hook exactly once.")
    const reordered = input.installIDs.map((id, order) => ({
      ...installs.find((item) => item.installID === id)!,
      order,
    }))
    return Effect.succeed({ installs: reordered, changed: reordered })
  })
})

/**
 * The owner's explicit repair of a corrupt `hooks.json`, never run on its own: a regular file the loader refuses as
 * `profile-invalid` (not UTF-8 or JSON, not an install list, or an install that no longer holds its sha256 or graph
 * rules) or as over the size cap is renamed aside to `hooks.json.corrupt-<ms>-<hex>` beside it, and an empty install
 * list is written in its place. Nothing is deleted. A valid file is never touched (`repair-not-needed`), and neither is
 * a symlink, a non-file, a file that changed while it was read or one that cannot be read (`repair-refused`): those are
 * not corruption the server can prove, so they stay for the owner to inspect.
 */
export const repair = Effect.fn("RelayHookInstall.repair")(function* (binding: Binding) {
  const fs = yield* FSUtil.Service
  const target = yield* locate(fs, binding)
  return yield* locks.withLock(target)(
    Effect.gen(function* () {
      const loaded = yield* load(fs, target).pipe(Effect.result)
      if (Result.isSuccess(loaded))
        return yield* refuse("repair-not-needed", "hooks.json is valid; there is nothing to repair.")
      const reason = loaded.failure.reason
      const refused = () => refuse("repair-refused", `hooks.json was left as it is: ${loaded.failure.message}`)
      if (reason !== "profile-invalid" && reason !== "profile-not-file-or-overflow") return yield* refused()
      // The cap refusal also covers a directory or a symlinked file; only a regular file reached directly is moved.
      const info = yield* fs.stat(target).pipe(Effect.option)
      const real = yield* fs.realPath(target).pipe(Effect.option)
      if (Option.isNone(info) || info.value.type !== "File" || !Option.contains(real, target)) return yield* refused()
      const backup = `${target}.corrupt-${yield* Clock.currentTimeMillis}-${randomBytes(4).toString("hex")}`
      yield* fs
        .rename(target, backup)
        .pipe(
          Effect.mapError(
            () => new Refused({ reason: "profile-write-acquisition", message: "Unable to move hooks.json aside." }),
          ),
        )
      yield* write(fs, target, { installs: [] })
      return { backup, installs: [] as ReadonlyArray<RelayHook.Install> }
    }),
  )
})

/** The `compile_hook` rule a structurally valid export breaks, as its refusal message; undefined when none. */
function violation(hook: RelayHook.V1) {
  const nodes = new Map(hook.nodes.map((node) => [node.id, node]))
  if (hook.nodes.length > 1000) return "Nodes must be a list of at most 1000 steps"
  if (nodes.size !== hook.nodes.length || new Set(hook.nodes.map((node) => node.name)).size !== hook.nodes.length)
    return "Node IDs and names must be unique"
  if (
    !hook.nodes.some((node) => node.type !== RelayHook.NodeType.trigger && node.type !== RelayHook.NodeType.condition)
  )
    return "Add at least one action to the hook"
  const triggers = hook.nodes.filter((node) => node.type === RelayHook.NodeType.trigger)
  if (triggers.length !== 1) return "A hook needs exactly one event"
  const trigger = triggers[0]!
  if (hook.connections.some((edge) => !nodes.has(edge.from))) return "Invalid hook connection"
  if (hook.connections.some((edge) => edge.port >= RelayHook.Outputs[nodes.get(edge.from)!.type].length))
    return "Invalid output port for this action"
  // One next step per output: the evaluator reads the steps after a Verify as its Pass branch only.
  if (new Set(hook.connections.map((edge) => `${edge.from}\u0000${edge.port}`)).size !== hook.connections.length)
    return "A hook output accepts one next step"
  if (hook.connections.some((edge) => !nodes.has(edge.to))) return "Invalid hook target"
  if (hook.connections.some((edge) => edge.to === trigger.id)) return "The event takes no incoming connections"
  const adjacency = Map.groupBy(hook.connections, (edge) => edge.from)
  const seen = new Set<string>()
  const visiting = new Set<string>()
  const cyclic = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (seen.has(id)) return false
    visiting.add(id)
    const found = (adjacency.get(id) ?? []).some((edge) => cyclic(edge.to))
    visiting.delete(id)
    seen.add(id)
    return found
  }
  if (cyclic(trigger.id)) return "Hooks do not accept cycles"
  if (seen.size !== nodes.size) return "Connect the event to the next hook steps"
  if (
    trigger.parameters.timing !== "before" &&
    hook.nodes.some((node) => node.type === RelayHook.NodeType.block || node.type === RelayHook.NodeType.approve)
  )
    return "Block and approval need an event before the effect"
  return undefined
}

const STRICT = { onExcessProperty: "error" } as const
// Project and install IDs name directories (an install's ledger), so they stay path-safe even in a hand-edited file.
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/
// One writer per file in this process. Only the Orchestra server writes hooks.json (two servers on one data
// directory are out of scope), so an in-process lock with a synchronous release is enough.
const locks = KeyedMutex.makeUnsafe<string>()

function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex")
}

/**
 * The snapshot as an install stores it: `json.compact` (`RelayJson.compact`, jq's bytes) read back, so a value compact
 * JSON cannot carry (NaN, a fraction, a function, a key a JS object would reorder) is refused rather than silently
 * changed. Validated, not decoded: decoding rebuilds objects in schema key order, and the sha256 is taken over the
 * export's own key order.
 */
const pin = Effect.fnUntraced(function* (snapshot: unknown, expected: string) {
  const text = yield* RelayJson.compact(snapshot).pipe(
    Effect.mapError(() => new Refused({ reason: "snapshot-invalid", message: "The snapshot is not JSON." })),
  )
  const parsed = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(
    Effect.mapError(() => new Refused({ reason: "snapshot-invalid", message: "The snapshot is not JSON." })),
  )
  const hook = yield* Schema.decodeUnknownEffect(RelayHook.V1)(parsed, STRICT).pipe(
    Effect.mapError(
      (error) =>
        new Refused({
          reason: "snapshot-invalid",
          message: `The snapshot is not a relay.hook.v1 export: ${error.message}`,
        }),
    ),
  )
  const broken = violation(hook)
  if (broken) return yield* refuse("snapshot-invalid", broken)
  if (sha256(text) !== expected)
    return yield* refuse("sha256-mismatch", "The snapshot does not match the published sha256.")
  return parsed as RelayHook.V1
})

const locate = Effect.fnUntraced(function* (fs: FSUtil.Interface, binding: Binding) {
  if (!ID.test(binding.projectID)) return yield* refuse("profile-project-invalid", "Invalid project ID.")
  const root = yield* fs
    .realPath(binding.data)
    .pipe(
      Effect.mapError(
        () => new Refused({ reason: "profile-state-root-acquisition", message: "The data directory is unavailable." }),
      ),
    )
  return file(root, binding.projectID)
})

// The profile loader's rules: a regular file, no symlink on the way, at most MAX_BYTES, unchanged while read.
const load = Effect.fnUntraced(function* (fs: FSUtil.Interface, target: string) {
  const unreadable = () => new Refused({ reason: "profile-read-acquisition", message: "Unable to read hooks.json." })
  const stat = fs.stat(target).pipe(
    Effect.map((info) => Option.some(info)),
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(Option.none())),
    Effect.mapError(unreadable),
  )
  const before = yield* stat
  if (Option.isNone(before)) return { installs: [] } satisfies RelayHook.Installs
  if (before.value.type !== "File" || before.value.size > MAX_BYTES)
    return yield* refuse("profile-not-file-or-overflow", "hooks.json is not a regular file within the size cap.")
  if ((yield* fs.realPath(target).pipe(Effect.mapError(unreadable))) !== target)
    return yield* refuse("profile-symlink-denied", "hooks.json resolves through a symlink.")
  const bytes = yield* fs.readFile(target).pipe(Effect.mapError(unreadable))
  const after = yield* stat
  if (Option.isNone(after) || bytes.length !== Number(before.value.size) || stamp(after.value) !== stamp(before.value))
    return yield* refuse("profile-changed-during-read", "hooks.json changed while it was read.")
  const text = utf8(bytes)
  if (Option.isNone(text)) return yield* refuse("profile-invalid", "hooks.json is not UTF-8.")
  return yield* parse(text.value)
})

// Fatal: a replacement character would silently change what was written.
const utf8 = Option.liftThrowable((bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(bytes))

function stamp(info: {
  readonly size: unknown
  readonly ino: Option.Option<number>
  readonly mtime: Option.Option<Date>
}) {
  return JSON.stringify([
    String(info.size),
    Option.getOrUndefined(info.ino),
    Option.getOrUndefined(info.mtime)?.getTime(),
  ])
}

const parse = Effect.fnUntraced(function* (text: string) {
  const corrupt = (message: string) => new Refused({ reason: "profile-invalid", message })
  const parsed = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(
    Effect.mapError(() => corrupt("hooks.json is not JSON.")),
  )
  const decoded = yield* Schema.decodeUnknownEffect(RelayHook.Installs)(parsed, STRICT).pipe(
    Effect.mapError((error) => corrupt(`hooks.json is not a hook install list: ${error.message}`)),
  )
  if (new Set(decoded.installs.map((item) => item.installID)).size !== decoded.installs.length)
    return yield* corrupt("hooks.json repeats an install ID.")
  // Kept as read, not as decoded, so each snapshot keeps the key order its sha256 covers.
  const installs = (parsed as RelayHook.Installs).installs
  const broken = yield* Effect.forEach(installs, (item) =>
    Effect.gen(function* () {
      if (!ID.test(item.installID)) return `Install ${item.installID} has an invalid ID.`
      const digest = yield* RelayJson.compact(item.snapshot).pipe(Effect.map(sha256), Effect.option)
      if (!Option.contains(digest, item.sha256)) return `Install ${item.installID} does not match its sha256.`
      const rule = violation(item.snapshot)
      return rule ? `Install ${item.installID}: ${rule}` : undefined
    }),
  ).pipe(Effect.map((reasons) => reasons.find((reason) => reason !== undefined)))
  if (broken) return yield* corrupt(broken)
  return { installs } satisfies RelayHook.Installs
})

// Read, change and replace hooks.json under the file's lock.
function mutate<A>(
  binding: Binding,
  change: (
    installs: ReadonlyArray<RelayHook.Install>,
  ) => Effect.Effect<{ readonly installs: ReadonlyArray<RelayHook.Install>; readonly changed: A }, Refused>,
) {
  return Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const target = yield* locate(fs, binding)
    return yield* locks.withLock(target)(
      Effect.gen(function* () {
        const next = yield* change((yield* load(fs, target)).installs)
        yield* write(fs, target, { installs: next.installs })
        return next.changed
      }),
    )
  })
}

function replace(
  input: Binding & { readonly installID: string; readonly principal: string },
  edit: (current: RelayHook.Install) => {
    readonly install: RelayHook.Install
    readonly event: RelayLedger.HookLifecycleEvent
  },
) {
  return mutate(input, (installs) => {
    const current = installs.find((item) => item.installID === input.installID)
    if (!current) return missing(input.installID)
    const next = edit(current)
    return Effect.succeed({
      installs: installs.map((item) => (item === current ? next.install : item)),
      changed: changed(next.install, next.event, input),
    })
  })
}

/**
 * Write beside the target and rename over it, so a reader sees the old file or the new one, never a part. The file is
 * read back first: the writer never leaves a file the loader would refuse.
 */
const write = Effect.fnUntraced(function* (fs: FSUtil.Interface, target: string, installs: RelayHook.Installs) {
  const text = JSON.stringify(installs)
  if (Buffer.byteLength(text) > MAX_BYTES)
    return yield* refuse("profile-overflow", `hooks.json would exceed ${MAX_BYTES} bytes.`)
  yield* parse(text)
  const failed = () => new Refused({ reason: "profile-write-acquisition", message: "Unable to write hooks.json." })
  const directory = path.dirname(target)
  yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 }).pipe(Effect.mapError(failed))
  if ((yield* fs.realPath(directory).pipe(Effect.mapError(failed))) !== directory)
    return yield* refuse("profile-symlink-denied", "The profile directory resolves through a symlink.")
  const temp = path.join(directory, `.hooks.json.${randomUUID()}.tmp`)
  yield* fs.writeFileString(temp, text, { flag: "wx", mode: 0o600 }).pipe(
    Effect.andThen(fs.rename(temp, target)),
    Effect.mapError(failed),
    // Synchronous: with effect 4.0.0-beta.83 an async finalizer is dropped when the fiber is interrupted. After a
    // successful rename the temporary file is gone, and `force` makes this a no-op.
    Effect.ensuring(
      Effect.try({ try: () => rmSync(temp, { force: true }), catch: () => undefined }).pipe(Effect.ignore),
    ),
  )
})

function changed(
  install: RelayHook.Install,
  event: RelayLedger.HookLifecycleEvent,
  input: { readonly principal: string },
): Changed {
  return {
    install,
    receipt: {
      event,
      install: install.installID,
      document: install.document,
      version: install.version,
      sha256: install.sha256,
      principal: input.principal,
    },
  }
}

function missing(installID: string) {
  return refuse("install-missing", `No installed hook ${installID}.`)
}

function refuse(reason: Reason, message: string) {
  return Effect.fail(new Refused({ reason, message }))
}
