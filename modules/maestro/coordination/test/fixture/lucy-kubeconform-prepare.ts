import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { access, readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { Context, Deferred, Effect, Exit, Fiber, Schema, Tracer } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { EventV2 } from "@orchestra/core/event"
import { PermissionV2 } from "@orchestra/core/permission"
import { ReviewLocalTools } from "@orchestra/core/review-toolkit/local-tools"
import { ToolSafetySandboxRuntime } from "@orchestra/core/tool-safety-sandbox-runtime"
import type { Ctx, Fixture } from "./lucy-engagement"

export const native = process.platform === "linux" && process.arch === "x64"
const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const Count = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER))
const Targets = Schema.Literals(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"])
const Sources = Schema.Struct({
  schema: Schema.Literal("kubeconform-preparation-sources-v1"),
  provenance: Schema.Struct({ retentionCommit: Schema.String, measurementSha256: Digest, noticeOriginsSha256: Digest, p0a2Run: Count, p0bRun: Count }),
  id: Schema.Literal("kubeconform"), version: Schema.Literal("0.8.0"), license: Schema.Literal("Apache-2.0"), upstream: Schema.Literal("yannh/kubeconform"),
  targets: Schema.Array(Schema.Struct({ target: Targets,
    archive: Schema.Struct({ url: Schema.String, sha256: Digest, bytes: Count }),
    executable: Schema.Struct({ name: Schema.String, sha256: Digest, bytes: Count }),
    floor: Schema.Struct({ macos: Schema.optional(Schema.String) }),
  })),
  notices: Schema.Array(Schema.Struct({ component: Schema.String, version: Schema.String, filename: Schema.String, url: Schema.String,
    sha256: Digest, bytes: Count, gitBlob: Schema.String, artifact: Schema.String })),
})
export const sources = Effect.promise(async () => Schema.decodeUnknownSync(Schema.fromJsonString(Sources), { onExcessProperty: "error" })(
  await Bun.file(new URL("../../../../../docs/specs/lucy/kubeconform-preparation-sources.json", import.meta.url)).text(),
))
const Identity = Schema.Struct({ id: Schema.Literals(["shfmt", "cargo-machete", "kubeconform"]), version: Schema.String,
  target: Targets, executable: Schema.String, integrity: Schema.String, proof: Schema.Literal("version-probe") })
export const Prepared = Schema.Struct({ status: Schema.Literals(["ready", "not-run"]), reason: Schema.optional(Schema.String),
  tools: Schema.Array(Schema.Union([
    Schema.Struct({ tool: Schema.Literals(["shfmt", "cargo-machete", "kubeconform"]), ok: Schema.Literal(true), identity: Identity }),
    Schema.Struct({ tool: Schema.Literals(["shfmt", "cargo-machete", "kubeconform"]), ok: Schema.Literal(false), reason: Schema.String }),
  ])) })
const Captured = Schema.Struct({ data: Schema.declare<Buffer>((value): value is Buffer => Buffer.isBuffer(value)), bytes: Count, truncated: Schema.Boolean })
const Outcome = Schema.Struct({ exitCode: Schema.Union([Schema.Number, Schema.Null]), durationMs: Schema.Number,
  timedOut: Schema.Boolean, overflow: Schema.Boolean, memoryExceeded: Schema.Boolean, failure: Schema.optional(Schema.String), stdout: Captured, stderr: Captured })

export type Roots = { readonly tools: string; readonly runtime: string; readonly global: string }
export const roots = (f: Fixture): Roots => ({ tools: path.join(f.global.cache, "p1-private-tools"),
  runtime: path.join(f.global.cache, "p1-sandbox"), global: path.join(f.global.cache, "p1-old-global") })
export const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
export const present = (filename: string) => Effect.promise(() => access(filename).then(() => true, () => false))
export async function capture(root: string) {
  const files = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: root, onlyFiles: true, dot: true, followSymlinks: false }))).sort()
  return Promise.all(files.map(async (file) => [file, digest(await readFile(path.join(root, file)))] as const))
}

export const scoped = <A, E, R>(work: Effect.Effect<A, E, R>, f: Roots, dependencies?: readonly string[]) => Effect.gen(function* () {
  const source = yield* ToolSafetySandboxRuntime.Source
  return yield* work.pipe(Effect.provideService(ReviewLocalTools.Root, f.tools),
    Effect.provideService(BackendToolkit.Root, f.global),
    Effect.provideService(ToolSafetySandboxRuntime.Source, source && { ...source, directory: f.runtime,
      ...(dependencies === undefined ? {} : { dependencies }) }))
})

/** Watches the real permission event and actual registered settlement; unsupported input cannot hang the fixture. */
export const begin = (host: Ctx, f: Roots, input: unknown, dependencies?: readonly string[]) => Effect.gen(function* () {
  const events = yield* EventV2.Service
  const asked = yield* Deferred.make<PermissionV2.Request>()
  const requests: PermissionV2.Request[] = []
  const unsubscribe = yield* events.listen((event) => {
    if (event.type !== PermissionV2.Event.Asked.type) return Effect.void
    const request = Schema.decodeUnknownSync(PermissionV2.Request)(event.data)
    if (request.action !== "review_checks_prepare") return Effect.void
    requests.push(request)
    return Deferred.succeed(asked, request).pipe(Effect.asVoid)
  })
  yield* Effect.addFinalizer(() => unsubscribe)
  const running = yield* scoped(host.call("maestro_prepare_review_checks", input), f, dependencies).pipe(Effect.forkChild)
  const first = yield* Effect.raceFirst(
    Deferred.await(asked).pipe(Effect.map((request) => ({ kind: "asked" as const, request }))),
    Fiber.join(running).pipe(Effect.map((result) => ({ kind: "settled" as const, result }))),
  )
  return { first, running, requests }
})

export function ownerRequest(value: Effect.Success<ReturnType<typeof begin>>, host: Ctx, tools: readonly string[]) {
  expect(value.first.kind).toBe("asked")
  if (value.first.kind !== "asked") throw new Error(`P1 expected explicit permission before preparation: ${value.first.result.text}`)
  const request = value.first.request
  expect(String(request.sessionID)).toBe(String(host.parent.id))
  expect(request.action).toBe("review_checks_prepare")
  expect(request.resources).toEqual(["review-check:read-sandbox", ...tools.map((tool) => `review-check:${tool}`)])
  expect(request.save).toBeUndefined()
  expect(request.source?.type).toBe("tool")
  if (request.source?.type !== "tool") throw new Error("P1 real tool-call permission source absent")
  expect(String(request.source.messageID)).toMatch(/^msg_engagement_\d+$/)
  expect(request.source.callID).toMatch(/^call_engagement_\d+$/)
  expect(value.requests).toHaveLength(1)
  return request
}

export const rule = (host: Ctx, effect: "allow" | "deny") => {
  const agents = Context.get(host.context, AgentV2.Service)
  return agents.transform((draft) => draft.update(AgentV2.defaultID, (agent) => {
    for (const resource of ["review-check:read-sandbox", "review-check:kubeconform", "review-check:shfmt"])
      agent.permissions.push({ action: "review_checks_prepare", resource, effect })
  }))
}

export function decoded(result: Effect.Success<ReturnType<Ctx["call"]>>) {
  expect(result.type, result.text).toBe("text")
  return Schema.decodeUnknownSync(Schema.fromJsonString(Prepared), { onExcessProperty: "error" })(result.text)
}

/** Observe native ResearchProcess exits without replacing any command, service, bytes or status. */
export function trace(afterVersion?: () => void) {
  const outcomes: Array<typeof Outcome.Type> = []
  const failures: unknown[] = []
  const tracer = Tracer.make({ span: (options) => new class extends Tracer.NativeSpan {
    override end(time: bigint, exit: Exit.Exit<unknown, unknown>) {
      super.end(time, exit)
      if (options.name !== "ResearchProcess.run") return
      if (!Exit.isSuccess(exit)) { failures.push(exit); return }
      const outcome = Schema.decodeUnknownSync(Outcome, { onExcessProperty: "error" })(exit.value)
      outcomes.push(outcome)
      if (outcome.stdout.data.toString("utf8") === "v0.8.0\n") afterVersion?.()
    }
  }(options) })
  return { outcomes, failures, tracer }
}

export function version(observed: ReturnType<typeof trace>, count = 1) {
  expect(observed.failures).toEqual([])
  const versions = observed.outcomes.filter((outcome) => outcome.stdout.data.toString("utf8") === "v0.8.0\n")
  expect(versions).toHaveLength(count)
  for (const outcome of versions) {
    expect(outcome.exitCode).toBe(0)
    expect(outcome.failure).toBeUndefined()
    expect(outcome.timedOut).toBe(false)
    expect(outcome.overflow).toBe(false)
    expect(outcome.memoryExceeded).toBe(false)
    expect(outcome.stdout.truncated).toBe(false)
    expect(outcome.stderr.truncated).toBe(false)
    expect(outcome.stdout.bytes).toBe(7)
    expect(outcome.stderr.bytes).toBe(0)
    expect(outcome.stderr.data.byteLength).toBe(0)
  }
}

export const verified = (result: typeof Prepared.Type, f: Roots) => Effect.gen(function* () {
  const expected = yield* sources
  const observed = expected.targets.find((entry) => entry.target === "linux-x64")
  if (!observed) throw new Error("P1 independent Linux identity missing")
  expect(result.status).toBe("ready")
  const item = result.tools.find((entry) => entry.tool === "kubeconform")
  expect(item?.ok).toBe(true)
  if (!item?.ok) throw new Error("P1 actual kubeconform preparation did not succeed")
  expect(item.identity).toMatchObject({ id: "kubeconform", version: "0.8.0", target: "linux-x64", proof: "version-probe",
    integrity: `sha256-${Buffer.from(observed.executable.sha256, "hex").toString("base64")}` })
  expect(path.relative(f.tools, item.identity.executable).split(path.sep)).toEqual([
    expect.stringMatching(/^[a-f0-9]{64}$/), "engines", "kubeconform", "0.8.0-linux-x64", "kubeconform",
  ])
  const bytes = yield* Effect.promise(() => readFile(item.identity.executable))
  expect(bytes.byteLength).toBe(observed.executable.bytes)
  expect(digest(bytes)).toBe(observed.executable.sha256)
  const notices = path.join(path.dirname(item.identity.executable), "notices")
  expect((yield* Effect.promise(() => readdir(notices))).sort()).toEqual(expected.notices.map((notice) => notice.filename).sort())
  for (const notice of expected.notices) {
    const bytes = yield* Effect.promise(() => readFile(path.join(notices, notice.filename)))
    expect(bytes.byteLength).toBe(notice.bytes)
    expect(digest(bytes)).toBe(notice.sha256)
  }
  return item.identity
})
