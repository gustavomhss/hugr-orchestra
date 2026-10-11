import { expect } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import type { ToolContext } from "@orchestra/plugin"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { Skill } from "@/skill"
import { HugrComposerClient } from "@/plugin/hugr-composer/client"
import { OUTCOME_KEY, readOutcome } from "@/plugin/hugr-composer/outcome"
import { createHuGRTools } from "@/plugin/hugr-composer/tools"
import { requireInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { rejection, rethrow } from "../lib/rejection"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Config.node, Agent.node, Skill.node, Permission.node, Session.node]), [
    [RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true, disableExternalSkills: true })],
  ]),
)
const secret = "private backend detail /secret/path token=private"
const cases = [
  ...[
    "structured",
    "text",
    "structured-error",
    "text-error",
    "structured-error-object",
    "text-error-object",
    "structured-error-array",
    "text-error-array",
    "structured-error-zero",
    "text-error-zero",
    // A code outside the closed set is redacted like any other backend text.
    "structured-bad-coded",
    "text-bad-coded",
  ].map((mode) => ({ mode, expected: undefined, code: "unknown" })),
  { mode: "flagged", expected: undefined, code: "backend-error" },
  ...["structured-coded", "text-coded"].map((mode) => ({ mode, expected: undefined, code: "target-exists" })),
  { mode: "plain", expected: "ok", code: undefined },
  ...["structured-success", "text-success"].map((mode) => ({
    mode,
    expected: { success: false, data: { error: secret, errors: [secret], ok: false, success: false } },
    code: undefined,
  })),
  ...[null, false, "", "  ", [], {}].map((error) => ({
    mode: `empty-${JSON.stringify(error)}`,
    expected: { error, data: "ok" },
    code: undefined,
  })),
]

// Each semantic case owns its native instance and one real peer. Failures cannot hide later controls.
cases.forEach(({ mode, expected, code }) => {
  it.instance(
    `Composer ${mode}: all five tools over real stdio`,
    () =>
      Effect.gen(function* () {
        const fixture = yield* composerFixture(mode)
        const calls = [
          () => fixture.tools["hugr-search"].execute({ query: "cache" }, fixture.context),
          () => fixture.tools["hugr-describe"].execute({ name: "cache" }, fixture.context),
          () => fixture.tools["hugr-list"].execute({ bundle_name: "cache" }, fixture.context),
          () => fixture.tools["hugr-compose"].execute({ output_dir: "generated" }, fixture.context),
          () => fixture.tools["hugr-scaffold"].execute({ output_dir: "generated", profile: "api" }, fixture.context),
        ]
        yield* Effect.forEach(calls, (call) =>
          Effect.promise(async () => {
            if (expected === undefined) {
              expect(await rejection(call())).toMatchObject({
                message: `HuGR Composer backend operation failed: ${code}`,
                code,
              })
              return
            }
            const result = await call()
            if (typeof result !== "object" || result === null) throw new Error("Expected Composer output")
            expect(mode === "plain" ? result.output : JSON.parse(result.output)).toEqual(expected)
          }),
        )
        yield* Effect.promise(async () => {
          expect(await Bun.file(fixture.marker).text()).toBe("initialize\n" + "tools/call\n".repeat(5))
          // Only the two owned writes report an outcome; each failed call streams it before it throws.
          expect(fixture.metadata).toEqual(
            code === undefined
              ? []
              : [
                  streamed("Composed FastAPI composition", failed("hugr-compose", code)),
                  streamed("Scaffolded project: app", failed("hugr-scaffold", code)),
                ],
          )
        })
      }),
    { config: { permission: { edit: "allow" } } },
    { timeout: 30_000 },
  )
})

// Composer's real envelope today: ok, code, free text, no status or effects (F4.24 fallback).
;["structured", "text"].forEach((carrier) => {
  it.instance(
    `Composer ${carrier} success envelope: owned writes carry an outcome, nothing else does`,
    () =>
      Effect.gen(function* () {
        const fixture = yield* composerFixture(`${carrier}-envelope-ok`)
        yield* Effect.promise(async () => {
          const compose = await fixture.tools["hugr-compose"].execute({ output_dir: "generated" }, fixture.context)
          const dry = await fixture.tools["hugr-compose"].execute({ output_dir: "generated", dry_run: true }, fixture.context)
          const scaffold = await fixture.tools["hugr-scaffold"].execute({ output_dir: "generated" }, fixture.context)
          const search = await fixture.tools["hugr-search"].execute({ query: "cache" }, fixture.context)
          const results = [compose, dry, scaffold].map((result) => {
            if (typeof result !== "object" || result === null) throw new Error("Expected Composer output")
            return result.metadata
          })
          expect(results).toEqual([
            { [OUTCOME_KEY]: success("hugr-compose", "unknown") },
            { [OUTCOME_KEY]: success("hugr-compose", "none") },
            { [OUTCOME_KEY]: success("hugr-scaffold", "unknown") },
          ])
          expect(typeof search === "object" && search !== null ? search.metadata : "string").toBeUndefined()
          expect(readOutcome(results[0]?.[OUTCOME_KEY], "hugr-compose")).toEqual(success("hugr-compose", "unknown"))
          // Free backend text still never crosses the boundary through the outcome.
          expect(JSON.stringify(results)).not.toContain("secret")
          expect(fixture.metadata).toEqual([])
        })
      }),
    { config: { permission: { edit: "allow" } } },
    { timeout: 30_000 },
  )
})

it.instance(
  "Composer success envelope carrying a code is malformed and fails closed",
  () =>
    Effect.gen(function* () {
      const fixture = yield* composerFixture("structured-envelope-ok-code")
      yield* Effect.promise(async () => {
        expect(await rejection(fixture.tools["hugr-compose"].execute({ output_dir: "generated" }, fixture.context))).toMatchObject({
          message: "HuGR Composer backend operation failed: unknown",
        })
        expect(fixture.metadata).toEqual([streamed("Composed FastAPI composition", failed("hugr-compose", "unknown"))])
      })
    }),
  { config: { permission: { edit: "allow" } } },
  { timeout: 30_000 },
)

it.instance(
  "Composer failed dry-run compose has no effects; a failed scaffold cannot claim any",
  () =>
    Effect.gen(function* () {
      const fixture = yield* composerFixture("structured-coded")
      yield* Effect.promise(async () => {
        await rejection(fixture.tools["hugr-compose"].execute({ output_dir: "generated", dry_run: true }, fixture.context))
        await rejection(fixture.tools["hugr-scaffold"].execute({ output_dir: "generated" }, fixture.context))
        expect(fixture.metadata).toEqual([
          streamed("Composed FastAPI composition", { ...failed("hugr-compose", "target-exists"), effects: "none" }),
          streamed("Scaffolded project: app", failed("hugr-scaffold", "target-exists")),
        ])
      })
    }),
  { config: { permission: { edit: "allow" } } },
  { timeout: 30_000 },
)

it.instance(
  "Composer aborted owned write is interrupted with unknown effects and never reaches the backend",
  () =>
    Effect.gen(function* () {
      const fixture = yield* composerFixture("plain")
      const controller = new AbortController()
      controller.abort()
      yield* Effect.promise(async () => {
        await rejection(
          fixture.tools["hugr-scaffold"].execute({ output_dir: "generated" }, { ...fixture.context, abort: controller.signal }),
        )
        expect(fixture.metadata).toEqual([
          streamed("Scaffolded project: app", {
            schema: "hugr-composer-outcome-v1",
            tool: "hugr-scaffold",
            ok: false,
            status: "interrupted",
            effects: "unknown",
            error: { code: "CANCELLED" },
          }),
        ])
        expect(await Bun.file(fixture.marker).exists()).toBe(false)
      })
    }),
  { config: { permission: { edit: "allow" } } },
  { timeout: 30_000 },
)

it.instance(
  "Composer native denied compose/scaffold never start backend",
  () =>
    Effect.gen(function* () {
      const fixture = yield* composerFixture("plain")
      yield* Effect.promise(async () => {
        expect(
          await rethrow(fixture.tools["hugr-compose"].execute({ output_dir: "generated" }, fixture.context)),
        ).toThrow()
        expect(
          await rethrow(fixture.tools["hugr-scaffold"].execute({ output_dir: "generated" }, fixture.context)),
        ).toThrow()
        expect(await Bun.file(fixture.marker).exists()).toBe(false)
        // Same real peer is the positive control for absence and lazy startup.
        expect(await fixture.tools["hugr-search"].execute({ query: "control" }, fixture.context)).toMatchObject({
          output: "ok",
        })
        expect(await Bun.file(fixture.marker).text()).toBe("initialize\ntools/call\n")
        expect(fixture.metadata).toEqual([])
      })
    }),
  { config: { permission: { edit: "deny" } } },
  { timeout: 30_000 },
)

Array.of("compose", "scaffold").forEach((operation) => {
  it.instance(
    `Composer failed ${operation} write is not retried`,
    () =>
      Effect.gen(function* () {
        const fixture = yield* composerFixture("disconnect")
        yield* Effect.promise(async () => {
          const call =
            operation === "compose"
              ? fixture.tools["hugr-compose"].execute({ output_dir: "generated" }, fixture.context)
              : fixture.tools["hugr-scaffold"].execute({ output_dir: "generated" }, fixture.context)
          expect(await rethrow(call)).toThrow()
          expect(await Bun.file(fixture.marker).text()).toBe("initialize\ntools/call\n")
          // A transport failure carries no envelope but may have written: effects are unknown, not none.
          expect(fixture.metadata).toEqual([
            streamed(
              operation === "compose" ? "Composed FastAPI composition" : "Scaffolded project: app",
              failed(operation === "compose" ? "hugr-compose" : "hugr-scaffold", "backend-error"),
            ),
          ])
        })
      }),
    { config: { permission: { edit: "allow" } } },
    { timeout: 30_000 },
  )
})

// The canonical hugr-owned-tool-v1 envelope (F4.21-F4.23) wins over the legacy fields it travels with.
const canonical = (tool: "hugr-compose" | "hugr-scaffold", outcome: Record<string, unknown>) => ({
  schema: "hugr-owned-tool-v1",
  tool,
  observed_changes: [],
  ...outcome,
})
const invalid = (tool: "hugr-compose" | "hugr-scaffold") =>
  canonical(tool, { status: "failed", effects: "unknown", error: { code: "INVALID_PRODUCER_RESULT" } })

;["structured", "text"].forEach((carrier) => {
  it.instance(
    `Composer ${carrier} canonical envelope: success settles as a result with the validated outcome`,
    () =>
      Effect.gen(function* () {
        const generated = yield* composerFixture(`${carrier}-canon-generated`)
        const target = (...rel: string[]) => path.resolve(generated.context.directory, "generated", ...rel)
        const compose = yield* Effect.promise(() =>
          generated.tools["hugr-compose"].execute({ output_dir: "generated" }, generated.context),
        )
        // Directories stay in the inventory (a trailing slash), rebased onto the output directory.
        expect(typeof compose === "object" && compose !== null ? compose.metadata : undefined).toEqual({
          [OUTCOME_KEY]: canonical("hugr-compose", {
            status: "generated",
            effects: "observed",
            mode: "ad_hoc",
            observed_changes: [
              { path: target("app") + "/", change: "created" },
              { path: target("app", "compositions") + "/", change: "created" },
              { path: target("app", "compositions", "x.py"), change: "created" },
              { path: target("app", "compositions", "__init__.py"), change: "created" },
            ],
          }),
        })
        expect(generated.metadata).toEqual([])

        const preview = yield* composerFixture(`${carrier}-canon-previewed`)
        const dry = yield* Effect.promise(() =>
          preview.tools["hugr-compose"].execute({ output_dir: "generated", dry_run: true }, preview.context),
        )
        expect(typeof dry === "object" && dry !== null ? dry.metadata : undefined).toEqual({
          [OUTCOME_KEY]: canonical("hugr-compose", { status: "previewed", effects: "none", mode: "ad_hoc" }),
        })
        // No producer free text, artifact content or planned file crosses into the outcome.
        expect(JSON.stringify([compose, dry].map((result) => (typeof result === "object" ? result.metadata : result)))).not.toContain("secret")
      }),
    { config: { permission: { edit: "allow" } } },
    { timeout: 30_000 },
  )

  ;[
    {
      kind: "blocked",
      tool: "hugr-compose" as const,
      message: "hugr-compose blocked OUTPUT_CONFLICT",
      outcome: { status: "blocked", effects: "none", mode: "ad_hoc", error: { code: "OUTPUT_CONFLICT", producer_code: "target-exists" } },
    },
    {
      // F4.24: the producer says ok:true, but the material-less delegation is a refusal.
      kind: "blocked-delegate",
      tool: "hugr-compose" as const,
      message: "hugr-compose blocked UNSUPPORTED_OUTPUT",
      outcome: { status: "blocked", effects: "none", mode: "tool_delegate", error: { code: "UNSUPPORTED_OUTPUT" } },
    },
    {
      // Refused before the mode was decided: the Composer sends `mode: null`, which means absent.
      kind: "blocked-pre-mode",
      tool: "hugr-compose" as const,
      message: "hugr-compose blocked INVALID_INPUT",
      outcome: { status: "blocked", effects: "none", error: { code: "INVALID_INPUT", producer_code: "missing-selection" } },
    },
    {
      kind: "partial",
      tool: "hugr-scaffold" as const,
      message: "hugr-scaffold failed PRODUCER_FAILED",
      outcome: {
        status: "failed",
        effects: "partial",
        mode: "ad_hoc",
        observed_changes: [{ path: "half.py", change: "created" }],
        error: { code: "PRODUCER_FAILED", producer_code: "scaffold-failed" },
      },
    },
    {
      // A producer code outside the closed set degrades to `unknown` instead of invalidating the envelope.
      kind: "newer-code",
      tool: "hugr-compose" as const,
      message: "hugr-compose blocked INVALID_INPUT",
      outcome: { status: "blocked", effects: "none", mode: "ad_hoc", error: { code: "INVALID_INPUT", producer_code: "unknown" } },
    },
  ].forEach(({ kind, tool, message, outcome }) => {
    it.instance(
      `Composer ${carrier} canonical ${kind}: settles through the failure path with the validated outcome`,
      () =>
        Effect.gen(function* () {
          const fixture = yield* composerFixture(`${carrier}-canon-${kind}`)
          yield* Effect.promise(async () => {
            const failure = await rejection(fixture.tools[tool].execute({ output_dir: "generated" }, fixture.context))
            expect(failure).toMatchObject({ message, code: message.split(" ")[2] })
            const changes = (outcome.observed_changes as { path: string; change: string }[] | undefined)?.map((change) => ({
              ...change,
              path: path.resolve(fixture.context.directory, "generated", change.path),
            }))
            expect(fixture.metadata).toEqual([
              streamed(tool === "hugr-compose" ? "Composed FastAPI composition" : "Scaffolded project: app", canonical(tool, { ...outcome, ...(changes ? { observed_changes: changes } : {}) })),
            ])
            expect(JSON.stringify(fixture.metadata)).not.toContain("secret")
          })
        }),
      { config: { permission: { edit: "allow" } } },
      { timeout: 30_000 },
    )
  })

  ;[
    "illegal-effects",
    "illegal-code",
    "empty-inventory",
    "dirs-only",
    "escape",
    "oversize",
    "absolute",
    "unknown-status",
    "wrong-tool",
    "ok-false",
    "excess-free-text",
  ].forEach((kind) => {
    it.instance(
      `Composer ${carrier} canonical ${kind}: not a valid producer result, failed with unknown effects`,
      () =>
        Effect.gen(function* () {
          const fixture = yield* composerFixture(`${carrier}-canon-${kind}`)
          yield* Effect.promise(async () => {
            expect(await rejection(fixture.tools["hugr-compose"].execute({ output_dir: "generated" }, fixture.context))).toMatchObject({
              message: "hugr-compose failed INVALID_PRODUCER_RESULT",
            })
            expect(fixture.metadata).toEqual([streamed("Composed FastAPI composition", invalid("hugr-compose"))])
          })
        }),
      { config: { permission: { edit: "allow" } } },
      { timeout: 30_000 },
    )
  })

  ;[
    { kind: "generated", dryRun: true },
    { kind: "previewed", dryRun: undefined },
  ].forEach(({ kind, dryRun }) => {
    it.instance(
      `Composer ${carrier} canonical ${kind} that contradicts dry_run=${dryRun} is not a valid producer result`,
      () =>
        Effect.gen(function* () {
          const fixture = yield* composerFixture(`${carrier}-canon-${kind}`)
          yield* Effect.promise(async () => {
            await rejection(fixture.tools["hugr-compose"].execute({ output_dir: "generated", dry_run: dryRun }, fixture.context))
            expect(fixture.metadata).toEqual([streamed("Composed FastAPI composition", invalid("hugr-compose"))])
          })
        }),
      { config: { permission: { edit: "allow" } } },
      { timeout: 30_000 },
    )
  })
})

it.instance(
  "Composer legacy ok:true delegation maps to blocked UNSUPPORTED_OUTPUT with no effects (F4.24)",
  () =>
    Effect.gen(function* () {
      const fixture = yield* composerFixture("structured-legacy-delegate")
      yield* Effect.promise(async () => {
        expect(await rejection(fixture.tools["hugr-compose"].execute({ output_dir: "generated" }, fixture.context))).toMatchObject({
          message: "hugr-compose blocked UNSUPPORTED_OUTPUT",
        })
        expect(fixture.metadata).toEqual([
          streamed(
            "Composed FastAPI composition",
            canonical("hugr-compose", { status: "blocked", effects: "none", mode: "tool_delegate", error: { code: "UNSUPPORTED_OUTPUT" } }),
          ),
        ])
        expect(JSON.stringify(fixture.metadata)).not.toContain("secret")
      })
    }),
  { config: { permission: { edit: "allow" } } },
  { timeout: 30_000 },
)

function failed(tool: "hugr-compose" | "hugr-scaffold", producerCode: string) {
  return {
    schema: "hugr-composer-outcome-v1",
    tool,
    ok: false,
    status: "failed",
    effects: "unknown",
    error: { code: "PRODUCER_FAILED", producerCode },
  }
}

function success(tool: "hugr-compose" | "hugr-scaffold", effects: "none" | "unknown") {
  return { schema: "hugr-composer-outcome-v1", tool, ok: true, effects } as const
}

function streamed(title: string, outcome: unknown) {
  return { title, metadata: { [OUTCOME_KEY]: outcome } }
}

function composerFixture(mode: string) {
  return Effect.gen(function* () {
    const instance = yield* requireInstance
    const sessions = yield* Session.Service
    const permission = yield* Permission.Service
    const agents = yield* Agent.Service
    const agent = yield* agents.get("maestro")
    const session = yield* sessions.create({ title: `composer ${mode}`, agent: "maestro" })
    const services = yield* Effect.context<never>()
    const metadata: unknown[] = []
    const context: ToolContext = {
      sessionID: session.id,
      messageID: "message",
      agent: "maestro",
      agentID: "maestro",
      directory: instance.directory,
      worktree: instance.directory,
      abort: new AbortController().signal,
      metadata: (input) => {
        metadata.push(input)
      },
      ask: (input) =>
        Effect.runPromiseWith(services)(permission.ask({ ...input, sessionID: session.id, ruleset: agent.permission })),
    }
    const marker = path.join(instance.directory, "backend-calls")
    const client = yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          new HugrComposerClient(instance.directory, instance.directory, {
            command: process.execPath,
            args: [path.join(import.meta.dir, "hugr-composer-envelope-server.ts"), mode, marker],
            timeout: 5_000,
            hardTimeout: 10_000,
          }),
      ),
      (client) => Effect.promise(() => client.dispose()),
    )
    const tools = createHuGRTools(client)
    expect(Object.keys(tools).sort()).toEqual([
      "hugr-compose",
      "hugr-describe",
      "hugr-list",
      "hugr-scaffold",
      "hugr-search",
    ])
    return { tools, context, marker, metadata }
  })
}
