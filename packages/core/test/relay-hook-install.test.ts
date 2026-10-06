import { describe, expect } from "bun:test"
import path from "path"
import { createHash } from "crypto"
import { readdirSync } from "fs"
import { mkdir, readFile, symlink, writeFile } from "fs/promises"
import { Effect, Exit, Schema } from "effect"
import { RelayHook } from "@opencode-ai/schema/relay-hook"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { RelayHookInstall } from "../src/relay-hook-install"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(FSUtil.node))
const projectID = "project-1"
const BEFORE = "Block and approval need an event before the effect"
const FAN_OUT = "A hook output accepts one next step"

// The spec's example: "No generated edits" blocks an edit under the generated SDK and records any other edit.
function guard() {
  return {
    schema: "relay.hook.v1",
    name: "No generated edits",
    nodes: [
      node("event", RelayHook.NodeType.trigger, { operation: "edit", timing: "before" }),
      node("generated", RelayHook.NodeType.condition, { field: "path", pattern: "packages/sdk/js/src/generated/**" }),
      node("block", RelayHook.NodeType.block, { message: "Regenerate with ./packages/sdk/js/script/build.ts" }),
      node("record", RelayHook.NodeType.record, { message: "Outside the generated tree." }),
    ] as Array<ReturnType<typeof node>>,
    connections: [edge("event", 0, "generated"), edge("generated", 0, "block"), edge("generated", 1, "record")],
    binding: "host-required",
    installed: false,
  }
}

function node(id: string, type: string, parameters: Record<string, unknown>): Record<string, unknown> {
  return { id, name: `Step ${id}`, type, position: [0, 0], parameters }
}

function edge(from: string, port: number, to: string) {
  return { from, port, to }
}

// For ASCII fixtures without DEL, `jq -c` and JSON.stringify write the same bytes.
function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex")
}

function published(snapshot: unknown) {
  return { snapshot, sha256: sha256(JSON.stringify(snapshot)) }
}

const fixture = Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const data = yield* fs.realPath(yield* fs.makeTempDirectoryScoped({ prefix: "relay-hook-install-" }))
  return { data, projectID, file: RelayHookInstall.file(data, projectID) }
})

function install(binding: RelayHookInstall.Binding, snapshot: unknown, document = "doc-generated") {
  return RelayHookInstall.install({
    ...binding,
    document,
    version: "v3",
    principal: "user:ana",
    ...published(snapshot),
  })
}

function refusal<A, R>(effect: Effect.Effect<A, RelayHookInstall.Refused, R>) {
  return effect.pipe(
    Effect.flip,
    Effect.map((error) => ({ reason: error.reason, message: error.message })),
  )
}

const absent = (file: string) =>
  Effect.promise(() =>
    readFile(file).then(
      () => false,
      () => true,
    ),
  )

describe("RelayHookInstall.install", () => {
  it.effect("pins a published version that the next read sees", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      const changed = yield* install(binding, guard())
      expect(changed.install).toMatchObject({
        document: "doc-generated",
        version: "v3",
        sha256: sha256(JSON.stringify(guard())),
        order: 0,
        enabled: true,
        installedBy: "user:ana",
        installedAt: 0,
        snapshot: guard(),
      })
      expect(changed.install.installID).toMatch(/^h-[0-9a-f]{16}$/)
      expect(changed.receipt).toEqual({
        event: "hook-installed",
        install: changed.install.installID,
        document: "doc-generated",
        version: "v3",
        sha256: changed.install.sha256,
        principal: "user:ana",
      })
      expect(yield* RelayHookInstall.read(binding)).toEqual({ installs: [changed.install] })
      const other = yield* install(binding, guard(), "doc-other")
      expect(other.install.order).toBe(1)
      // The file on disk is the strict schema, as the profile loader reads it.
      const text = yield* Effect.promise(() => readFile(binding.file, "utf8"))
      expect(Exit.isSuccess(Schema.decodeUnknownExit(Schema.fromJsonString(RelayHook.Installs))(text))).toBe(true)
    }),
  )

  it.effect("keeps the export's key order, so its sha256 holds when the file is rewritten", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      const text =
        '{"name":"Order","schema":"relay.hook.v1","nodes":[{"id":"e","name":"E","type":"relay.hookEventTrigger",' +
        '"position":[0,0],"parameters":{"timing":"before","operation":"read"}},{"name":"R","id":"r",' +
        '"type":"relay.hookRemind","position":[10,20],"parameters":{"message":"Read the spec first."}}],' +
        '"connections":[{"to":"r","port":0,"from":"e"}],"installed":false,"binding":"host-required"}'
      yield* RelayHookInstall.install({
        ...binding,
        document: "doc-order",
        version: "v1",
        principal: "user:ana",
        snapshot: JSON.parse(text),
        sha256: sha256(text),
      })
      // A second install reads the first back, which rechecks its sha256 against its stored snapshot.
      yield* install(binding, guard())
      const stored = JSON.parse(yield* Effect.promise(() => readFile(binding.file, "utf8")))
      expect(JSON.stringify(stored.installs[0].snapshot)).toBe(text)
    }),
  )

  it.effect("refuses excess properties anywhere in the snapshot and writes nothing", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      const extraTop = { ...guard(), active: true }
      const extraNode = guard()
      extraNode.nodes[2] = { ...extraNode.nodes[2], notes: "hidden" }
      const extraParameter = guard()
      extraParameter.nodes[2] = node("block", RelayHook.NodeType.block, { message: "No.", check: "true" })
      const extraConnection = guard()
      extraConnection.connections[0] = { ...edge("event", 0, "generated"), type: "main" } as ReturnType<typeof edge>
      for (const snapshot of [extraTop, extraNode, extraParameter, extraConnection])
        expect((yield* refusal(install(binding, snapshot))).reason).toBe("snapshot-invalid")
      expect(yield* absent(binding.file)).toBe(true)
    }),
  )

  it.effect("refuses a sha256 mismatch and writes nothing", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      const wrong = RelayHookInstall.install({
        ...binding,
        document: "doc-generated",
        version: "v3",
        principal: "user:ana",
        snapshot: guard(),
        sha256: sha256(JSON.stringify({ ...guard(), name: "Something else" })),
      })
      expect(yield* refusal(wrong)).toEqual({
        reason: "sha256-mismatch",
        message: "The snapshot does not match the published sha256.",
      })
      // The sha256 covers the compact form, not another spelling of the same JSON.
      const pretty = RelayHookInstall.install({
        ...binding,
        document: "doc-generated",
        version: "v3",
        principal: "user:ana",
        snapshot: guard(),
        sha256: sha256(JSON.stringify(guard(), null, 2)),
      })
      expect((yield* refusal(pretty)).reason).toBe("sha256-mismatch")
      expect(yield* absent(binding.file)).toBe(true)
    }),
  )

  it.effect("takes the sha256 over jq's compact form, which escapes DEL", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      const snapshot = guard()
      snapshot.nodes[3] = node("record", RelayHook.NodeType.record, { message: "a\u007fb" })
      const text = JSON.stringify(snapshot)
      const request = (digest: string) =>
        RelayHookInstall.install({ ...binding, document: "d", version: "v", principal: "p", snapshot, sha256: digest })
      expect((yield* refusal(request(sha256(text)))).reason).toBe("sha256-mismatch")
      const changed = yield* request(sha256(text.replace("a\u007fb", "a\\u007fb")))
      expect(changed.install.snapshot.nodes[3]).toMatchObject({ parameters: { message: "a\u007fb" } })
    }),
  )

  it.effect("refuses a value JSON cannot carry instead of changing it", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      const request = (snapshot: unknown) =>
        RelayHookInstall.install({
          ...binding,
          document: "d",
          version: "v",
          principal: "p",
          snapshot,
          sha256: "0".repeat(64),
        })
      const nan = guard()
      nan.nodes[0] = { ...nan.nodes[0], typeVersion: Number.NaN }
      expect((yield* refusal(request(nan))).message).toStartWith("The snapshot is not a relay.hook.v1 export")
      expect(yield* refusal(request({ ...guard(), name: 1n }))).toEqual({
        reason: "snapshot-invalid",
        message: "The snapshot is not JSON.",
      })
      expect(yield* refusal(request(undefined))).toEqual({
        reason: "snapshot-invalid",
        message: "The snapshot is not JSON.",
      })
      expect(yield* absent(binding.file)).toBe(true)
    }),
  )

  it.effect("refuses Block or Approve on an after trigger", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      const timed = (operation: string, timing: string, type: string) => {
        const snapshot = guard()
        snapshot.nodes[0] = node("event", RelayHook.NodeType.trigger, { operation, timing })
        snapshot.nodes[2] = node("block", type, { message: "Stop." })
        return refusal(install(binding, snapshot, `doc-${operation}-${timing}-${type}`))
      }
      const after = { reason: "snapshot-invalid", message: BEFORE } as const
      expect(yield* timed("edit", "after", RelayHook.NodeType.block)).toEqual(after)
      expect(yield* timed("command", "after", RelayHook.NodeType.approve)).toEqual(after)
      expect(yield* timed("session-idle", "after", RelayHook.NodeType.block)).toEqual(after)
      expect(yield* timed("session-start", "after", RelayHook.NodeType.approve)).toEqual(after)
      // A trigger whose timing its operation does not allow is not an export at all.
      expect((yield* timed("prompt", "after", RelayHook.NodeType.remind)).reason).toBe("snapshot-invalid")
      expect(yield* absent(binding.file)).toBe(true)
    }),
  )

  it.effect("refuses fan-out: each output port takes one next step", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      const fanned = (connections: ReadonlyArray<ReturnType<typeof edge>>, gate = false) => {
        const snapshot = guard()
        if (gate) snapshot.nodes[1] = node("generated", RelayHook.NodeType.verify, { message: "Types.", check: "true" })
        snapshot.connections = [...connections]
        return refusal(install(binding, snapshot))
      }
      const fanOut = { reason: "snapshot-invalid", message: FAN_OUT } as const
      // A condition's Yes port into two steps.
      expect(
        yield* fanned([edge("event", 0, "generated"), edge("generated", 0, "block"), edge("generated", 0, "record")]),
      ).toEqual(fanOut)
      // A Verify's Pass port into two steps: the evaluator reads the steps after a Verify as its Pass branch only.
      expect(
        yield* fanned(
          [edge("event", 0, "generated"), edge("generated", 0, "record"), edge("generated", 0, "block")],
          true,
        ),
      ).toEqual(fanOut)
      // The trigger into two steps, and the same edge twice.
      expect(
        yield* fanned([edge("event", 0, "generated"), edge("event", 0, "record"), edge("generated", 0, "block")]),
      ).toEqual(fanOut)
      expect(
        yield* fanned([
          edge("event", 0, "generated"),
          edge("generated", 0, "block"),
          edge("generated", 0, "block"),
          edge("generated", 1, "record"),
        ]),
      ).toEqual(fanOut)
      expect(yield* absent(binding.file)).toBe(true)
    }),
  )

  it.effect("installs the owner-approved vocabulary: Allow, Run gate Pass and Fail, the merged events", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      const gate = guard()
      gate.nodes[1] = node("generated", RelayHook.NodeType.verify, {
        message: "Types must hold.",
        check: "bun typecheck",
      })
      gate.nodes[2] = node("block", RelayHook.NodeType.repair, { message: "Fix the types." })
      gate.nodes[3] = node("record", RelayHook.NodeType.allow, { message: "" })
      gate.connections = [edge("event", 0, "generated"), edge("generated", 0, "record"), edge("generated", 1, "block")]
      const changed = yield* install(binding, gate, "doc-gate")
      expect(changed.install.snapshot.connections).toEqual(gate.connections)
      const events = [
        ["tool", "after"],
        ["session-start", "after"],
        ["prompt", "before"],
        ["session-idle", "after"],
      ] as const
      for (const [operation, timing] of events) {
        const snapshot = guard()
        snapshot.nodes[0] = node("event", RelayHook.NodeType.trigger, { operation, timing })
        snapshot.nodes[2] = node("block", RelayHook.NodeType.remind, { message: "Note it." })
        yield* install(binding, snapshot, `doc-${operation}`)
      }
      // Block before a prompt is a before trigger, so it stays allowed.
      const prompt = guard()
      prompt.nodes[0] = node("event", RelayHook.NodeType.trigger, { operation: "prompt", timing: "before" })
      yield* install(binding, prompt, "doc-prompt-block")
      expect((yield* RelayHookInstall.read(binding)).installs.length).toBe(6)
    }),
  )

  it.effect("applies the rest of compile_hook's graph rules", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      const variant = (change: (snapshot: ReturnType<typeof guard>) => void) => {
        const snapshot = guard()
        change(snapshot)
        return refusal(install(binding, snapshot)).pipe(Effect.map((result) => result.message))
      }
      const cases: ReadonlyArray<readonly [string, (snapshot: ReturnType<typeof guard>) => void]> = [
        [
          "A hook needs exactly one event",
          (s) => {
            s.nodes[3] = node("record", RelayHook.NodeType.trigger, { operation: "read", timing: "before" })
          },
        ],
        [
          "Add at least one action to the hook",
          (s) => {
            s.nodes = s.nodes.slice(0, 2)
            s.connections = s.connections.slice(0, 1)
          },
        ],
        ["Invalid hook connection", (s) => s.connections.push(edge("ghost", 0, "record"))],
        ["Invalid hook target", (s) => s.connections.splice(2, 1, edge("generated", 1, "ghost"))],
        // Block has no outputs; a condition has two.
        ["Invalid output port for this action", (s) => s.connections.push(edge("block", 0, "record"))],
        ["Invalid output port for this action", (s) => s.connections.push(edge("generated", 2, "record"))],
        ["The event takes no incoming connections", (s) => s.connections.splice(2, 1, edge("generated", 1, "event"))],
        [
          "Hooks do not accept cycles",
          (s) => {
            s.nodes[3] = node("record", RelayHook.NodeType.remind, { message: "Again." })
            s.connections.push(edge("record", 0, "generated"))
          },
        ],
        ["Connect the event to the next hook steps", (s) => s.connections.pop()],
        ["Node IDs and names must be unique", (s) => s.nodes.splice(3, 1, { ...s.nodes[3], id: "block" })],
        ["Node IDs and names must be unique", (s) => s.nodes.splice(3, 1, { ...s.nodes[3], name: "Step block" })],
      ]
      for (const [message, change] of cases) expect(yield* variant(change)).toBe(message)
      expect(yield* absent(binding.file)).toBe(true)
    }),
  )

  it.effect("keeps one install per document and never writes past the loader's cap", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      const first = yield* install(binding, guard())
      expect(yield* refusal(install(binding, guard()))).toEqual({
        reason: "document-installed",
        message: `Document doc-generated is already installed as ${first.install.installID}; update that install instead.`,
      })
      const huge = guard()
      huge.nodes[3] = node("record", RelayHook.NodeType.record, { message: "x".repeat(RelayHookInstall.MAX_BYTES) })
      expect((yield* refusal(install(binding, huge, "doc-huge"))).reason).toBe("profile-overflow")
      expect((yield* RelayHookInstall.read(binding)).installs).toEqual([first.install])
    }),
  )
})

describe("RelayHookInstall lifecycle", () => {
  it.effect("updates, disables, enables, reorders and uninstalls with receipts", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      const first = (yield* install(binding, guard())).install
      const second = (yield* install(binding, guard(), "doc-other")).install
      const next = { ...guard(), name: "No generated edits, v4" }
      const updated = yield* RelayHookInstall.update({
        ...binding,
        installID: first.installID,
        version: "v4",
        principal: "user:bo",
        ...published(next),
      })
      expect(updated.install).toMatchObject({
        installID: first.installID,
        document: "doc-generated",
        version: "v4",
        order: 0,
        enabled: true,
        installedBy: "user:bo",
        snapshot: next,
      })
      expect(updated.receipt).toMatchObject({ event: "hook-updated", version: "v4", principal: "user:bo" })
      const disabled = yield* RelayHookInstall.setEnabled({
        ...binding,
        installID: second.installID,
        enabled: false,
        principal: "user:bo",
      })
      expect([disabled.install.enabled, disabled.receipt.event]).toEqual([false, "hook-disabled"])
      const enabled = yield* RelayHookInstall.setEnabled({
        ...binding,
        installID: second.installID,
        enabled: true,
        principal: "user:bo",
      })
      expect([enabled.install.enabled, enabled.receipt.event]).toEqual([true, "hook-enabled"])
      const order = (installIDs: ReadonlyArray<string>) => RelayHookInstall.reorder({ ...binding, installIDs })
      const reordered = yield* order([second.installID, first.installID])
      expect(reordered.map((item) => [item.installID, item.order])).toEqual([
        [second.installID, 0],
        [first.installID, 1],
      ])
      expect((yield* refusal(order([first.installID]))).reason).toBe("order-mismatch")
      expect((yield* refusal(order([first.installID, first.installID]))).reason).toBe("order-mismatch")
      expect((yield* refusal(order([first.installID, "h-ghost"]))).reason).toBe("order-mismatch")
      const removed = yield* RelayHookInstall.uninstall({
        ...binding,
        installID: first.installID,
        principal: "user:bo",
      })
      expect(removed.receipt).toEqual({
        event: "hook-uninstalled",
        install: first.installID,
        document: "doc-generated",
        version: "v4",
        sha256: updated.install.sha256,
        principal: "user:bo",
      })
      expect((yield* RelayHookInstall.read(binding)).installs.map((item) => item.installID)).toEqual([second.installID])
      const gone = RelayHookInstall.uninstall({ ...binding, installID: first.installID, principal: "user:bo" })
      expect((yield* refusal(gone)).reason).toBe("install-missing")
      // An update is held to the same rules as an install.
      const after = guard()
      after.nodes[0] = node("event", RelayHook.NodeType.trigger, { operation: "edit", timing: "after" })
      const refused = RelayHookInstall.update({
        ...binding,
        installID: second.installID,
        version: "v5",
        principal: "user:bo",
        ...published(after),
      })
      expect(yield* refusal(refused)).toEqual({ reason: "snapshot-invalid", message: BEFORE })
    }),
  )
})

describe("RelayHookInstall hooks.json", () => {
  it.effect("a corrupt file yields profile-invalid and is left as found", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      const valid = (yield* install(binding, guard())).install
      const fanned = guard()
      fanned.connections.push(edge("generated", 0, "record"))
      const corrupt = [
        "{not json",
        JSON.stringify({ installs: {} }),
        JSON.stringify({ installs: [{ ...valid, note: "excess" }] }),
        JSON.stringify({ installs: [valid], extra: true }),
        JSON.stringify({ installs: [{ ...valid, snapshot: { ...valid.snapshot, name: "Tampered" } }] }),
        JSON.stringify({ installs: [{ ...valid, ...published(fanned) }] }),
        JSON.stringify({ installs: [valid, { ...valid, order: 1 }] }),
        JSON.stringify({ installs: [{ ...valid, installID: "../escape" }] }),
      ].map((text) => Buffer.from(text))
      // Valid JSON once decoded leniently: the invalid UTF-8 byte would become U+FFFD.
      const [head, tail] = JSON.stringify({ installs: [{ ...valid, installedBy: "user:@" }] }).split("@")
      corrupt.push(Buffer.concat([Buffer.from(head!), Buffer.from([0xff]), Buffer.from(tail!)]))
      for (const bytes of corrupt) {
        yield* Effect.promise(() => writeFile(binding.file, bytes))
        expect((yield* refusal(RelayHookInstall.read(binding))).reason).toBe("profile-invalid")
        expect((yield* refusal(install(binding, guard(), "doc-new"))).reason).toBe("profile-invalid")
        expect((yield* Effect.promise(() => readFile(binding.file))).equals(bytes)).toBe(true)
      }
    }),
  )

  it.effect("refuses symlinks and unsafe project IDs", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      const outside = path.join(binding.data, "outside")
      const elsewhere = path.join(binding.data, "elsewhere")
      yield* Effect.promise(async () => {
        await mkdir(outside)
        await mkdir(elsewhere)
        await writeFile(path.join(outside, "hooks.json"), JSON.stringify({ installs: [] }))
        await mkdir(path.dirname(binding.file), { recursive: true })
        await symlink(path.join(outside, "hooks.json"), binding.file)
      })
      expect((yield* refusal(RelayHookInstall.read(binding))).reason).toBe("profile-symlink-denied")
      expect((yield* refusal(install(binding, guard()))).reason).toBe("profile-symlink-denied")
      // A symlinked profile directory, with no hooks.json yet.
      const linked = { ...binding, projectID: "project-2" }
      yield* Effect.promise(async () => {
        await mkdir(path.join(binding.data, "project-2"))
        await symlink(elsewhere, path.join(binding.data, "project-2", "profile"))
      })
      expect((yield* refusal(install(linked, guard()))).reason).toBe("profile-symlink-denied")
      expect(readdirSync(elsewhere)).toEqual([])
      expect(readdirSync(outside)).toEqual(["hooks.json"])
      expect((yield* refusal(install({ ...binding, projectID: "../escape" }, guard()))).reason).toBe(
        "profile-project-invalid",
      )
    }),
  )
})

describe("RelayHookInstall atomic writes", () => {
  // What a reader can see is pinned by the two failure tests below; this one pins the lock: no install is lost.
  it.live("concurrent installs all land, each once and in its own place", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      const documents = Array.from({ length: 40 }, (_, index) => `doc-${index}`)
      yield* Effect.forEach(documents, (document) => install(binding, guard(), document), { concurrency: "unbounded" })
      const installs = (yield* RelayHookInstall.read(binding)).installs
      expect(installs.map((item) => item.document).toSorted()).toEqual(documents.toSorted())
      expect(installs.map((item) => item.order).toSorted((a, b) => a - b)).toEqual(documents.map((_, index) => index))
      expect(readdirSync(path.dirname(binding.file))).toEqual(["hooks.json"])
    }),
  )

  it.effect("a write that dies midway leaves the previous file whole and no temporary file behind", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      yield* install(binding, guard())
      const before = yield* Effect.promise(() => readFile(binding.file, "utf8"))
      const fs = yield* FSUtil.Service
      // Writes half of the text, then fails with a real PlatformError.
      const torn = FSUtil.Service.of({
        ...fs,
        writeFileString: (file, text, options) =>
          fs
            .writeFileString(file, text.slice(0, text.length / 2), options)
            .pipe(Effect.andThen(fs.readFile(path.join(binding.data, "missing"))), Effect.asVoid),
      })
      const error = yield* refusal(
        install(binding, guard(), "doc-other").pipe(Effect.provideService(FSUtil.Service, torn)),
      )
      expect(error.reason).toBe("profile-write-acquisition")
      expect(yield* Effect.promise(() => readFile(binding.file, "utf8"))).toBe(before)
      expect(readdirSync(path.dirname(binding.file))).toEqual(["hooks.json"])
    }),
  )

  it.effect("a failed replace leaves the previous file whole and no temporary file behind", () =>
    Effect.gen(function* () {
      const binding = yield* fixture
      yield* install(binding, guard())
      const before = yield* Effect.promise(() => readFile(binding.file, "utf8"))
      const fs = yield* FSUtil.Service
      // The rename lands in a directory that does not exist, so it fails after the temporary file is written.
      const failing = FSUtil.Service.of({
        ...fs,
        rename: (from) => fs.rename(from, path.join(binding.data, "missing", "hooks.json")),
      })
      const error = yield* refusal(
        install(binding, guard(), "doc-other").pipe(Effect.provideService(FSUtil.Service, failing)),
      )
      expect(error.reason).toBe("profile-write-acquisition")
      expect(yield* Effect.promise(() => readFile(binding.file, "utf8"))).toBe(before)
      expect(readdirSync(path.dirname(binding.file))).toEqual(["hooks.json"])
    }),
  )
})
