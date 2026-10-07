import { describe, expect } from "bun:test"
import path from "path"
import { createHash, randomUUID } from "crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { Deferred, Effect, Fiber, Layer, Schema, Scope, Stream } from "effect"
import { RelayHook } from "@opencode-ai/schema/relay-hook"
import { Config } from "../src/config"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { FSUtil } from "../src/fs-util"
import { Global } from "../src/global"
import { Location } from "../src/location"
import { Project } from "../src/project"
import { Relay } from "../src/relay"
import { RelayHookInstall } from "../src/relay-hook-install"
import { AbsolutePath } from "../src/schema"
import { SessionSchema } from "../src/session/schema"
import { MaestroArsenal } from "../src/tool/maestro-arsenal"
import { ToolRegistry } from "../src/tool/registry"
import { Tool } from "../src/tool/tool"
import { ToolOutputStore } from "../src/tool-output-store"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetyProfile } from "../src/tool-safety-profile"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { toolIdentity } from "./lib/tool"

// WP11: installed Relay hooks enforced on the V2 registry path (relay-exec-spec H2), one test per row of its table.
// Everything is real except the native approval host, which stands in for the permission card: hooks.json written by
// the install writer and read by the profile loader, the registry, durable events, and Relay's checks in real bash.
const it = testEffect(Layer.empty)
const projectID = "hook-project"

interface Dirs {
  readonly data: string
  readonly home: string
  readonly work: string
}

const fixture = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
).pipe(
  Effect.map((tmp) => {
    const dirs = {
      data: path.join(tmp.path, "data"),
      home: path.join(tmp.path, "home"),
      work: path.join(tmp.path, "work"),
    }
    Object.values(dirs).forEach((dir) => mkdirSync(dir))
    mkdirSync(MaestroArsenal.stateDirectory(dirs.data, projectID), { recursive: true })
    return dirs
  }),
)

function node(id: string, type: RelayHook.NodeType, parameters: Record<string, unknown>) {
  return { id, name: `Step ${id}`, type, position: [0, 0], parameters }
}

// A hook whose trigger fires on `event` (`<operation>.<timing>`); edges are [from, port, to], a chain by default.
function hook(
  name: string,
  event: string,
  nodes: ReadonlyArray<ReturnType<typeof node>>,
  edges: ReadonlyArray<readonly [string, number, string]> = nodes.map((item, index) => [
    index === 0 ? "event" : nodes[index - 1]!.id,
    0,
    item.id,
  ]),
) {
  const [operation, timing] = event.split(".")
  return {
    schema: "relay.hook.v1",
    name,
    nodes: [node("event", RelayHook.NodeType.trigger, { operation, timing }), ...nodes],
    connections: edges.map(([from, port, to]) => ({ from, port, to })),
    binding: "host-required",
    installed: false,
  }
}

// One action straight after the trigger.
const single = (name: string, event: string, type: RelayHook.NodeType, parameters: Record<string, unknown>) =>
  hook(name, event, [node("act", type, parameters)])

// Through the install writer, the only writer of hooks.json. ASCII fixtures compact to JSON.stringify's bytes.
function install(dirs: Dirs, snapshot: { readonly name: string }) {
  return RelayHookInstall.install({
    data: dirs.data,
    projectID,
    document: `doc-${snapshot.name}`,
    version: "v1",
    snapshot,
    sha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
    principal: "user:test",
  }).pipe(Effect.map((changed) => changed.install))
}

const written = { type: "text", value: "written" }
const hold = (reason: string, detail?: string) => ({
  type: "error",
  value: `Tool safety HOLD: ${reason}${detail === undefined ? "" : `. ${detail}`}`,
})
const rejected = new ToolSafety.Denied({ reason: "approval-native-rejected" })
const AFTER = " The tool already ran; its effect was not undone."

// Fixture leaves that note each run and touch real files, so a denial can show that nothing ran.
function register(dirs: Dirs, ran: Array<string>) {
  const leaf = (run: (args: Readonly<Record<string, string>>) => string) =>
    Tool.make({
      description: "fixture",
      input: Schema.Record(Schema.String, Schema.String),
      output: Schema.String,
      execute: (args) => Effect.sync(() => run(args)),
    })
  return ToolRegistry.Service.use((registry) =>
    registry.register({
      write: leaf((args) => {
        mkdirSync(path.dirname(path.join(dirs.work, args.filePath!)), { recursive: true })
        writeFileSync(path.join(dirs.work, args.filePath!), "written")
        ran.push(`write ${args.filePath}`)
        return "written"
      }),
      apply_patch: leaf(() => (ran.push("apply_patch"), "patched")),
      bash: leaf((args) => (ran.push(`bash ${args.command}`), "ran")),
    }),
  )
}

type Host = (request: ToolSafety.Approval) => Effect.Effect<void, ToolSafety.Denied>

/**
 * The V2 registry as a Location builds it, with the project's profile loader and, unless `relay` is false, the Relay
 * service. `call` settles one tool call through it and returns what the model reads; `host` answers Approve asks.
 */
function harness<A, E>(
  dirs: Dirs,
  body: (input: {
    readonly sessionID: SessionSchema.ID
    readonly ran: ReadonlyArray<string>
    readonly asks: ReadonlyArray<ToolSafety.Approval>
    readonly call: (name: string, input: unknown, host?: Host) => Effect.Effect<unknown, unknown>
    readonly decisions: (count: number) => Effect.Effect<ReadonlyArray<RelayHook.Decided["data"]>, unknown>
  }) => Effect.Effect<A, E, ToolRegistry.Service | FSUtil.Service | Scope.Scope>,
  options: { readonly relay?: boolean } = {},
) {
  const directory = AbsolutePath.make(dirs.work)
  const ran: Array<string> = []
  const asks: Array<ToolSafety.Approval> = []
  const sessionID = SessionSchema.ID.make(`ses_hooks_${randomUUID().replaceAll("-", "")}`)
  const location = Location.Service.of({ directory, project: { id: Project.ID.make(projectID), directory } })
  const layer = AppNodeBuilder.build(
    LayerNode.group([ToolRegistry.nativeNode, EventV2.node, FSUtil.node, Relay.node]),
    [
      [Global.node, Global.layerWith({ data: dirs.data, home: dirs.home })],
      [Location.node, Layer.succeed(Location.Service, location)],
      [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
      // Relay down: the Location has no Relay service at all.
      ...(options.relay === false ? [[Relay.node, Layer.empty] as const] : []),
    ],
  )
  return Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2.Service
    const registry = yield* ToolRegistry.Service
    const stateDirectory = MaestroArsenal.stateDirectory(dirs.data, projectID)
    const load = ToolSafetyProfile.makeLoader(fs, { directory: dirs.work, stateDirectory, projectID })
    yield* register(dirs, ran)
    const call = (name: string, input: unknown, host?: Host) =>
      registry.materialize().pipe(
        Effect.flatMap((tools) =>
          tools.settle({ sessionID, ...toolIdentity, call: { type: "tool-call", name, id: randomUUID(), input } }),
        ),
        Effect.map((settlement) => settlement.result),
        Effect.provideService(ToolSafety.RuntimeProfileLoader, load),
        Effect.provideService(
          ToolSafety.NativeHost,
          host && { ask: (request) => Effect.sync(() => asks.push(request)).pipe(Effect.andThen(host(request))) },
        ),
      )
    // Read back from the durable log of the Session aggregate.
    const decisions = (count: number) =>
      Stream.runCollect(
        events.durable({ aggregateID: sessionID }).pipe(
          Stream.filter((event) => event.type === RelayHook.Decided.type),
          Stream.map((event) => Schema.decodeUnknownSync(RelayHook.Decided.data)(event.data)),
          Stream.take(count),
        ),
      ).pipe(Effect.timeout("5 seconds"))
    return yield* body({ sessionID, ran, asks, call, decisions })
  }).pipe(Effect.provide(layer))
}

describe("ToolSafety hooks on the V2 registry path", () => {
  it.live("block: the tool never runs and the model reads the hook's message, Relay up or down", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      const guard = hook(
        "No generated edits",
        "write.before",
        [
          node("generated", RelayHook.NodeType.condition, { field: "path", pattern: "sdk/generated/**" }),
          node("block", RelayHook.NodeType.block, { message: "Regenerate with ./script/build.ts" }),
          node("record", RelayHook.NodeType.record, { message: "Outside the generated tree." }),
        ],
        [
          ["event", 0, "generated"],
          ["generated", 0, "block"],
          ["generated", 1, "record"],
        ],
      )
      yield* harness(dirs, () => install(dirs, guard))
      for (const relay of [true, false])
        yield* harness(
          dirs,
          (h) =>
            Effect.gen(function* () {
              expect(yield* h.call("write", { filePath: "sdk/generated/types.gen.ts" })).toEqual(
                hold("relay-hook-block", "Blocked by hook 'No generated edits': Regenerate with ./script/build.ts"),
              )
              expect(existsSync(path.join(dirs.work, "sdk/generated/types.gen.ts"))).toBe(false)
              expect(yield* h.call("write", { filePath: "src/app.ts" })).toEqual(written)
              expect(h.ran).toEqual(["write src/app.ts"])
              expect(
                (yield* h.decisions(2)).map((item) => [item.nodeID, item.action, item.outcome, item.subject]),
              ).toEqual([
                ["block", "block", "blocked", "sdk/generated/types.gen.ts"],
                ["record", "record", "recorded", "src/app.ts"],
              ])
            }),
          { relay },
        )
    }),
  )

  it.live(
    "approve: asks the native host as relay_hook; once runs, reject or no host denies, Relay down still asks",
    () =>
      Effect.gen(function* () {
        const dirs = yield* fixture
        const message = "Hook 'Confirm releases' asks for approval: Releases need you."
        yield* harness(dirs, () =>
          install(
            dirs,
            single("Confirm releases", "command.before", RelayHook.NodeType.approve, { message: "Releases need you." }),
          ),
        )
        for (const relay of [true, false])
          yield* harness(
            dirs,
            (h) =>
              Effect.gen(function* () {
                expect(yield* h.call("bash", { command: "./release.sh" }, () => Effect.void)).toEqual({
                  type: "text",
                  value: "ran",
                })
                expect(yield* h.call("bash", { command: "./release.sh v2" }, () => Effect.fail(rejected))).toEqual(
                  hold("approval-native-rejected", message),
                )
                expect(yield* h.call("bash", { command: "./release.sh v3" })).toEqual(
                  hold("relay-hook-approve-native-binding-missing", message),
                )
                expect(h.asks.map((request) => [request.action, request.resources, request.message])).toEqual([
                  ["relay_hook", ["./release.sh"], message],
                  ["relay_hook", ["./release.sh v2"], message],
                ])
                expect(h.ran).toEqual(["bash ./release.sh"])
                const decisions = yield* h.decisions(3)
                expect(decisions.map((item) => [item.action, item.outcome, item.trigger])).toEqual([
                  ["approve", "approved", "command.before"],
                  ["approve", "rejected", "command.before"],
                  ["approve", "rejected", "command.before"],
                ])
                // The command text stays in the Session record; the decision carries its sha256.
                expect(decisions[0]?.subject).toBe(createHash("sha256").update("./release.sh").digest("hex"))
              }),
            { relay },
          )
      }),
  )

  it.live(
    "verify before: exit 0 runs the tool, a failing check denies naming the control, verdicts are in the ledger",
    () =>
      Effect.gen(function* () {
        const dirs = yield* fixture
        yield* harness(dirs, (h) =>
          Effect.gen(function* () {
            const installed = yield* install(
              dirs,
              single("Tests first", "write.before", RelayHook.NodeType.verify, {
                message: "Write the failing test first.",
                check: 'test -f ready && test "$RELAY_HOOK_PATH" = src/app.ts',
              }),
            )
            expect(yield* h.call("write", { filePath: "src/app.ts" })).toEqual(
              hold(
                "relay-hook-verify-failed",
                "Hook 'Tests first' check 'Step act' failed: Write the failing test first.",
              ),
            )
            writeFileSync(path.join(dirs.work, "ready"), "")
            expect(yield* h.call("write", { filePath: "src/app.ts" })).toEqual(written)
            expect(h.ran).toEqual(["write src/app.ts"])
            expect((yield* h.decisions(2)).map((item) => item.outcome)).toEqual(["failed", "passed"])
            const ledger = path.join(dirs.data, "relay", projectID, "hooks", installed.installID, "ledger.jsonl")
            const lines = readFileSync(ledger, "utf8")
              .trim()
              .split("\n")
              .map((line) => JSON.parse(line))
            expect(lines.map((line) => [line.event, line.item, line.verdict, line.origin])).toEqual([
              ["checklist-item", "act", "fail", "hook"],
              ["checklist-item", "act", "pass", "hook"],
            ])
          }),
        )
      }),
  )

  it.live("verify that cannot run: an Ask, never a hard block or an allow", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      const lint = single("Lint", "write.before", RelayHook.NodeType.verify, { message: "Lint passes.", check: "true" })
      yield* harness(dirs, () => install(dirs, lint))
      const ask = "Hook 'Lint' check 'Step act' could not run (relay-unavailable): Lint passes."
      yield* harness(
        dirs,
        (h) =>
          Effect.gen(function* () {
            expect(yield* h.call("write", { filePath: "approved.ts" }, () => Effect.void)).toEqual(written)
            expect(yield* h.call("write", { filePath: "rejected.ts" }, () => Effect.fail(rejected))).toEqual(
              hold("approval-native-rejected", ask),
            )
            expect(yield* h.call("write", { filePath: "unasked.ts" })).toEqual(
              hold("relay-hook-approve-native-binding-missing", ask),
            )
            expect(h.asks.map((request) => [request.action, request.message])).toEqual([
              ["relay_hook", ask],
              ["relay_hook", ask],
            ])
            expect(h.ran).toEqual(["write approved.ts"])
            expect((yield* h.decisions(6)).map((item) => `${item.action} ${item.outcome}`)).toEqual([
              "verify unavailable",
              "approve approved",
              "verify unavailable",
              "approve rejected",
              "verify unavailable",
              "approve rejected",
            ])
          }),
        { relay: false },
      )
      // With Relay up, a host without bash cannot run the check either.
      yield* harness(dirs, (h) =>
        withPath(
          path.join(dirs.home, "no-bash"),
          Effect.gen(function* () {
            expect(yield* h.call("write", { filePath: "missing.ts" }, () => Effect.void)).toEqual(written)
            expect(h.asks.map((request) => request.message)).toEqual([
              "Hook 'Lint' check 'Step act' could not run (missing): Lint passes.",
            ])
          }),
        ),
      )
    }),
  )

  it.live("verify after: a pass keeps the result, a fail fails it without undoing the effect, Relay down warns", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      const types = single("Types", "write.after", RelayHook.NodeType.verify, {
        message: "Types check.",
        check: "test -f ready",
      })
      yield* harness(dirs, () => install(dirs, types))
      yield* harness(dirs, (h) =>
        Effect.gen(function* () {
          expect(yield* h.call("write", { filePath: "first.ts" })).toEqual(
            hold("relay-hook-verify-failed", `Hook 'Types' check 'Step act' failed: Types check.${AFTER}`),
          )
          expect(readFileSync(path.join(dirs.work, "first.ts"), "utf8")).toBe("written")
          writeFileSync(path.join(dirs.work, "ready"), "")
          expect(yield* h.call("write", { filePath: "second.ts" })).toEqual(written)
          expect((yield* h.decisions(2)).map((item) => `${item.trigger} ${item.outcome}`)).toEqual([
            "write.after failed",
            "write.after passed",
          ])
        }),
      )
      yield* harness(
        dirs,
        (h) =>
          Effect.gen(function* () {
            expect(yield* h.call("write", { filePath: "third.ts" })).toEqual({
              type: "text",
              value:
                "written\n\nHook 'Types' check 'Step act' could not run (relay-unavailable); the result was kept: Types check.",
            })
            expect(h.asks).toEqual([])
          }),
        { relay: false },
      )
    }),
  )

  it.live("repair: blocks with its instructions before, fails the result after", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* harness(dirs, (h) =>
        Effect.gen(function* () {
          yield* install(
            dirs,
            single("Format first", "command.before", RelayHook.NodeType.repair, { message: "Run the formatter." }),
          )
          yield* install(
            dirs,
            single("Changelog", "write.after", RelayHook.NodeType.repair, { message: "Add an entry." }),
          )
          expect(yield* h.call("bash", { command: "make release" })).toEqual(
            hold("relay-hook-repair", "Hook 'Format first' requires a repair: Run the formatter."),
          )
          expect(yield* h.call("write", { filePath: "notes.md" })).toEqual(
            hold("relay-hook-repair", `Hook 'Changelog' requires a repair: Add an entry.${AFTER}`),
          )
          expect(h.ran).toEqual(["write notes.md"])
          expect((yield* h.decisions(2)).map((item) => `${item.trigger} ${item.outcome}`)).toEqual([
            "command.before repair-required",
            "write.after repair-required",
          ])
        }),
      )
    }),
  )

  it.live("remind: messages are appended to the result before and after, in install order", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* harness(dirs, (h) =>
        Effect.gen(function* () {
          yield* install(
            dirs,
            single("Style", "write.before", RelayHook.NodeType.remind, { message: "Keep functions small." }),
          )
          yield* install(
            dirs,
            single("Review", "write.after", RelayHook.NodeType.remind, { message: "Ask for a review." }),
          )
          yield* install(
            dirs,
            single("Docs", "tool.before", RelayHook.NodeType.remind, { message: "Update the docs." }),
          )
          expect(yield* h.call("write", { filePath: "a.ts" })).toEqual({
            type: "text",
            value:
              "written\n\nHook 'Style': Keep functions small.\nHook 'Docs': Update the docs.\nHook 'Review': Ask for a review.",
          })
          expect(h.ran).toEqual(["write a.ts"])
          expect((yield* h.decisions(3)).map((item) => `${item.trigger} ${item.outcome}`)).toEqual([
            "write.before reminded",
            "tool.before reminded",
            "write.after reminded",
          ])
        }),
      )
    }),
  )

  it.live("record: the result is unchanged and the decision is a durable relay.hook.decided event", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* harness(dirs, (h) =>
        Effect.gen(function* () {
          const before = yield* install(
            dirs,
            single("Audit", "write.before", RelayHook.NodeType.record, { message: "Seen." }),
          )
          const after = yield* install(
            dirs,
            single("Audit after", "write.after", RelayHook.NodeType.record, { message: "Done." }),
          )
          expect(yield* h.call("write", { filePath: "src/a.ts" })).toEqual(written)
          const decisions = yield* h.decisions(2)
          expect(decisions[0]).toMatchObject({
            installID: before.installID,
            version: "v1",
            sha256: before.sha256,
            nodeID: "act",
            action: "record",
            trigger: "write.before",
            tool: "write",
            sessionID: h.sessionID,
            assistantMessageID: toolIdentity.assistantMessageID,
            agent: toolIdentity.agent,
            subject: "src/a.ts",
            outcome: "recorded",
          })
          expect(decisions[1]).toMatchObject({
            installID: after.installID,
            trigger: "write.after",
            outcome: "recorded",
          })
          expect(decisions[0]?.callID).toBe(decisions[1]!.callID)
          expect(decisions[0]?.decisionID).not.toBe(decisions[1]!.decisionID)
          expect(decisions.every((item) => Number.isInteger(item.durationMs) && item.durationMs >= 0)).toBe(true)
        }),
      )
    }),
  )

  it.live("allow grants nothing: not over another hook's block, a native hold or a native ask", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* harness(dirs, (h) =>
        Effect.gen(function* () {
          yield* install(dirs, single("Allow all", "tool.before", RelayHook.NodeType.allow, { message: "" }))
          yield* install(
            dirs,
            hook("No vendor", "write.before", [
              node("vendor", RelayHook.NodeType.condition, { field: "path", pattern: "vendor/**" }),
              node("block", RelayHook.NodeType.block, { message: "Vendored code is read-only." }),
            ]),
          )
          expect(yield* h.call("write", { filePath: "vendor/lib.js" })).toEqual(
            hold("relay-hook-block", "Blocked by hook 'No vendor': Vendored code is read-only."),
          )
          // The project's own preferences still hold and ask, whatever a hook allowed.
          const directory = ToolSafetyProfile.profileDirectory(
            MaestroArsenal.stateDirectory(dirs.data, projectID),
            projectID,
          )
          const preferences = { scrutiny: "strict", askBefore: ["push"], neverTouch: ["secrets/**"] }
          writeFileSync(
            path.join(directory, "preferences.json"),
            JSON.stringify({ ...preferences, riskTolerance: "low", waiverAuthority: "human-only" }),
          )
          expect(yield* h.call("write", { filePath: "secrets/key" })).toEqual(hold("project-never-touch"))
          expect(yield* h.call("bash", { command: "git push origin" }, () => Effect.fail(rejected))).toEqual(
            hold("approval-native-rejected"),
          )
          expect(h.asks.map((request) => request.action)).toEqual(["push"])
          expect(h.ran).toEqual([])
          expect((yield* h.decisions(2)).map((item) => `${item.nodeID} ${item.outcome}`)).toEqual([
            "act allowed",
            "block blocked",
          ])
        }),
      )
    }),
  )

  it.live("run gate Fail port: a connected Fail branch replaces the default failure", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* harness(dirs, (h) =>
        Effect.gen(function* () {
          const gate = node("gate", RelayHook.NodeType.verify, { message: "Coverage holds.", check: "test -f ready" })
          const pass = node("pass", RelayHook.NodeType.record, { message: "Coverage held." })
          const fail = node("fail", RelayHook.NodeType.remind, { message: "Coverage dropped; add tests." })
          const edges = [
            ["event", 0, "gate"],
            ["gate", 0, "pass"],
            ["gate", 1, "fail"],
          ] as const
          yield* install(dirs, hook("Soft gate", "write.before", [gate, pass, fail], edges))
          expect(yield* h.call("write", { filePath: "a.ts" })).toEqual({
            type: "text",
            value: "written\n\nHook 'Soft gate': Coverage dropped; add tests.",
          })
          writeFileSync(path.join(dirs.work, "ready"), "")
          expect(yield* h.call("write", { filePath: "b.ts" })).toEqual(written)
          expect((yield* h.decisions(4)).map((item) => `${item.nodeID} ${item.outcome}`)).toEqual([
            "gate failed",
            "fail reminded",
            "gate passed",
            "pass recorded",
          ])
        }),
      )
    }),
  )

  it.live("each call keeps the snapshot loaded at its start", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* harness(dirs, (h) =>
        Effect.gen(function* () {
          const ask = yield* install(
            dirs,
            single("Confirm", "write.before", RelayHook.NodeType.approve, { message: "Sure?" }),
          )
          const asked = yield* Deferred.make<void>()
          const answer = yield* Deferred.make<void>()
          const wait = () => Deferred.succeed(asked, undefined).pipe(Effect.andThen(Deferred.await(answer)))
          const fiber = yield* h.call("write", { filePath: "first.ts" }, wait).pipe(Effect.forkScoped)
          yield* Deferred.await(asked).pipe(Effect.timeout("10 seconds"))
          // While the first call waits, its Approve is uninstalled and an after Repair is installed.
          yield* RelayHookInstall.uninstall({
            data: dirs.data,
            projectID,
            installID: ask.installID,
            principal: "user:test",
          })
          yield* install(
            dirs,
            single("Changelog", "write.after", RelayHook.NodeType.repair, { message: "Add an entry." }),
          )
          yield* Deferred.succeed(answer, undefined)
          expect(yield* Fiber.join(fiber)).toEqual(written)
          expect(yield* h.call("write", { filePath: "second.ts" })).toMatchObject({ type: "error" })
          expect(h.asks.length).toBe(1)
          expect((yield* h.decisions(2)).map((item) => [item.installID === ask.installID, item.outcome])).toEqual([
            [true, "approved"],
            [false, "repair-required"],
          ])
        }),
      )
    }),
  )

  it.live("an interrupted Ask is recorded as cancelled and the tool never runs", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* harness(dirs, (h) =>
        Effect.gen(function* () {
          yield* install(dirs, single("Confirm", "write.before", RelayHook.NodeType.approve, { message: "Sure?" }))
          const asked = yield* Deferred.make<void>()
          const never = () => Deferred.succeed(asked, undefined).pipe(Effect.andThen(Effect.never))
          const fiber = yield* h.call("write", { filePath: "never.ts" }, never).pipe(Effect.forkScoped)
          yield* Deferred.await(asked).pipe(Effect.timeout("10 seconds"))
          yield* Fiber.interrupt(fiber)
          expect((yield* h.decisions(1)).map((item) => `${item.action} ${item.outcome}`)).toEqual(["approve cancelled"])
          expect(h.ran).toEqual([])
          expect(existsSync(path.join(dirs.work, "never.ts"))).toBe(false)
        }),
      )
    }),
  )

  it.live("apply_patch: update and add hunks each meet their own operation; a tool trigger sees both", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* harness(dirs, (h) =>
        Effect.gen(function* () {
          writeFileSync(path.join(dirs.work, "a.ts"), "old\n")
          yield* install(
            dirs,
            single("No new files", "write.before", RelayHook.NodeType.block, { message: "Edit only." }),
          )
          yield* install(dirs, single("Audit", "tool.before", RelayHook.NodeType.record, { message: "Seen." }))
          const update = "*** Update File: a.ts\n@@\n-old\n+new"
          const patch = (body: string) => ({ patchText: `*** Begin Patch\n${body}\n*** End Patch` })
          expect(yield* h.call("apply_patch", patch(update))).toEqual({ type: "text", value: "patched" })
          expect(yield* h.call("apply_patch", patch(`${update}\n*** Add File: lib/b.ts\n+fresh`))).toEqual(
            hold("relay-hook-block", "Blocked by hook 'No new files': Edit only."),
          )
          expect(h.ran).toEqual(["apply_patch"])
          expect((yield* h.decisions(2)).map((item) => [item.trigger, item.subject, item.outcome])).toEqual([
            ["tool.before", "a.ts", "recorded"],
            ["write.before", "lib/b.ts", "blocked"],
          ])
        }),
      )
    }),
  )

  it.live("a corrupt or tampered hooks.json holds every call as profile-invalid", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* harness(dirs, (h) =>
        Effect.gen(function* () {
          const installed = yield* install(
            dirs,
            single("Audit", "tool.before", RelayHook.NodeType.record, { message: "Seen." }),
          )
          const tampered = { ...installed, snapshot: { ...installed.snapshot, name: "Tampered" } }
          for (const content of ["{not json", JSON.stringify({ installs: [tampered] })]) {
            writeFileSync(RelayHookInstall.file(dirs.data, projectID), content)
            expect(yield* h.call("bash", { command: "ls" })).toEqual(hold("profile-invalid"))
          }
          expect(h.ran).toEqual([])
        }),
      )
    }),
  )
})

// Sets PATH for the effect and restores it after: the only way to take bash away from a check.
function withPath<A, E, R>(value: string, effect: Effect.Effect<A, E, R>) {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      mkdirSync(value, { recursive: true })
      const previous = process.env.PATH
      process.env.PATH = value
      return previous
    }),
    () => effect,
    (previous) =>
      Effect.sync(() => {
        if (previous === undefined) delete process.env.PATH
        if (previous !== undefined) process.env.PATH = previous
      }),
  )
}
