import { Effect, Layer, Schema, Scope } from "effect"
import { Research } from "@orchestra/schema/research"
import type { Tool } from "@orchestra/core/tool/tool"
import { check, object, stable } from "./assertions"
import { call } from "./backend"
import { http, route } from "./dsl"
import { runtime } from "./runtime"
import type { Scenario, ScenarioContext } from "./types"

const artifactPath = "/api/session/{sessionID}/research/{artifactID}"
const sourceText = "Evidence\n" + "😀".repeat(5_000) + "\nOnly version 1."
const documentText = "# Qualified answer\n\nOnly version 1 [source](research:observed)."
const probe = { path: "/api/session/ses_httpapi_missing/research/cart_00000000000000000000000000?revision=1" }

// These scenarios run the production route tree. Admission uses native V1 projections and the public host
// invocation boundary; storage filenames, ledger rows and cursor internals are never fixture inputs.
export const researchArtifactScenarios: Scenario[] = [
  http.protected
    .get(artifactPath, "v2.research.artifact.source")
    .probe(probe)
    .seeded(seed)
    .at((ctx) => ({ path: ctx.state.sourcePath, headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const first = Schema.decodeUnknownSync(Research.ArtifactPage)(body)
      check(stable(first.ref) === stable(ctx.state.source.ref.artifact), "source page should keep admitted artifact revision")
      check(stable(first.receipt) === stable(ctx.state.source), "source page should return exact admitted receipt")
      check(first.representation === "text", "source page should keep admitted representation")
      check(first.text.length > 0 && Buffer.byteLength(first.text) <= Research.Limits.pageBytes, "source page should be nonempty and bounded")
      const cursor = first.cursor
      check(first.complete === false && typeof cursor === "string", "large source should require continuation")
      const continuation = http.protected.get(artifactPath, "v2.research.artifact.continuation")
        .at(() => ({ path: `${ctx.state.sourcePath}&cursor=${encodeURIComponent(cursor)}`, headers: ctx.headers() }))
        .json()
      const result = yield* call(continuation, { ...ctx, state: undefined })
      check(result.status === 200, `source continuation should return 200, got ${result.status}: ${result.text}`)
      const last = Schema.decodeUnknownSync(Research.ArtifactPage)(result.body)
      check(stable(last.ref) === stable(first.ref) && stable(last.receipt) === stable(first.receipt), "continuation should keep immutable ref and receipt")
      check(last.representation === "text" && Buffer.byteLength(last.text) <= Research.Limits.pageBytes, "continuation should keep representation and page bound")
      check(first.text + last.text === sourceText, "HTTP pages should reconstruct exact UTF-8 capture")
      check(last.complete === true && last.cursor === undefined, "final source page should end continuation")

      const mismatched = http.protected.get(artifactPath, "v2.research.artifact.cursor-mismatch")
        .at(() => ({ path: `${ctx.state.documentPath}&cursor=${encodeURIComponent(cursor)}`, headers: ctx.headers() }))
        .json()
      const rejected = yield* call(mismatched, { ...ctx, state: undefined })
      check(rejected.status === 404, `cursor from another artifact should return 404, got ${rejected.status}: ${rejected.text}`)
      notFound(rejected.body)
    }), "status"),
  http.protected
    .get(artifactPath, "v2.research.artifact.document")
    .probe(probe)
    .seeded(seed)
    .at((ctx) => ({ path: ctx.state.documentPath, headers: ctx.headers() }))
    .json(200, (body, ctx) => {
      const page = Schema.decodeUnknownSync(Research.ArtifactPage)(body)
      check(stable(page.ref) === stable(ctx.state.document.artifact), "document page should keep admitted artifact revision")
      check(stable(page.receipt) === stable(ctx.state.document), "document page should return exact published receipt")
      check(page.representation === "markdown" && page.text === documentText, "document page should return exact published Markdown")
      check(page.complete === true && page.cursor === undefined, "small document should be complete without continuation")
    }, "status"),
  http.protected
    .get(artifactPath, "v2.research.artifact.foreign-task")
    .probe(probe)
    .seeded(seed)
    .at((ctx) => ({ path: ctx.state.foreignPath, headers: ctx.headers() }))
    .json(404, notFound, "status"),
  http.protected
    .get(artifactPath, "v2.research.artifact.authority")
    .probe(probe)
    .seeded(seed)
    .at((ctx) => ({ path: ctx.state.authorityPath, headers: ctx.headers() }))
    .json(404, notFound, "status"),
  http.protected
    .get(artifactPath, "v2.research.artifact.unadmitted")
    .probe(probe)
    .seeded(seed)
    .at((ctx) => ({ path: ctx.state.unadmittedPath, headers: ctx.headers() }))
    .json(404, notFound, "status"),
  http.protected
    .get(artifactPath, "v2.research.artifact.unavailable")
    .probe(probe)
    .seeded((ctx) => seed(ctx, true))
    .at((ctx) => ({ path: ctx.state.sourcePath, headers: ctx.headers() }))
    .json(503, (body) => {
      object(body)
      check(body._tag === "ServiceUnavailableError", "removed admitted bytes should map to declared service error")
      check(body.service === "research" && body.message === "Research artifact is unavailable", "unavailable bytes should identify research without exposing storage")
    }, "status"),
  http.protected
    .get(artifactPath, "v2.research.artifact.revision-not-admitted")
    .probe(probe)
    .seeded(seed)
    .at((ctx) => ({ path: ctx.state.sourcePath.replace("revision=1", "revision=2"), headers: ctx.headers() }))
    .json(404, notFound, "status"),
  http.protected
    .get(artifactPath, "v2.research.artifact.cursor-invalid")
    .probe(probe)
    .seeded(seed)
    .at((ctx) => ({ path: `${ctx.state.sourcePath}&cursor=not-json`, headers: ctx.headers() }))
    .json(404, notFound, "status"),
  ...[undefined, "0", "-1", "1.5", "not-a-number"].map((revision) => http.protected
    .get(artifactPath, `v2.research.artifact.revision-invalid.${revision ?? "missing"}`)
    .probe(probe)
    .seeded(seed)
    .at((ctx) => ({
      path: ctx.state.sourcePath.split("?")[0] + (revision === undefined ? "" : `?revision=${revision}`),
      headers: ctx.headers(),
    }))
    .json(400, (body) => {
      object(body)
      check(body._tag === "InvalidRequestError" && body.kind === "Query", "revision decoding should return declared query validation error")
    }, "status")),
]

function notFound(body: unknown) {
  object(body)
  check(body._tag === "ResearchArtifactNotFoundError", "unadmitted or foreign artifact should map to declared research 404")
  check(body.message === "Research artifact not found", "research 404 should not disclose retained placement or bytes")
}

function seed(ctx: ScenarioContext, unavailable = false) {
  return Effect.gen(function* () {
    // Import live services only after the exerciser has installed its isolated database and XDG roots.
    const { ResearchRecords } = yield* Effect.promise(() => import("@orchestra/core/research/records"))
    const { ResearchArtifacts } = yield* Effect.promise(() => import("@orchestra/core/research/artifacts"))
    const { ResearchBinding } = yield* Effect.promise(() => import("@orchestra/core/research/binding"))
    const { CapabilityInvocation } = yield* Effect.promise(() => import("@orchestra/core/capability/invocation"))
    const { AppNodeBuilder } = yield* Effect.promise(() => import("@orchestra/core/effect/app-node-builder"))
    const { Global } = yield* Effect.promise(() => import("@orchestra/core/global"))
    const { LogicalTask } = yield* Effect.promise(() => import("../../../src/maestro/logical-task"))
    const { SessionV1 } = yield* Effect.promise(() => import("@orchestra/schema/session-v1"))
    const { SessionMessage } = yield* Effect.promise(() => import("@orchestra/schema/session-message"))
    const { Agent } = yield* Effect.promise(() => import("@orchestra/schema/agent"))
    const { Model } = yield* Effect.promise(() => import("@orchestra/schema/model"))
    const { Provider } = yield* Effect.promise(() => import("@orchestra/schema/provider"))
    const modules = yield* Effect.promise(() => runtime())
    const scope = yield* Scope.Scope
    const app = yield* Layer.buildWithMemoMap(modules.AppLayer, modules.memoMap, scope)
    const directory = ctx.directory
    check(directory !== undefined, "research fixture needs isolated project directory")
    const instance = yield* modules.InstanceStore.Service.use((store) => store.load({ directory })).pipe(Effect.provide(app))
    const research = ResearchRecords.layer.pipe(
      Layer.provideMerge(ResearchArtifacts.layer),
      Layer.provide(AppNodeBuilder.build(Global.node)),
      Layer.provide(Layer.succeedContext(app)),
    )
    return yield* Effect.gen(function* () {
      const sessions = yield* modules.Session.Service
      const records = yield* ResearchRecords.Service
      const artifacts = yield* ResearchArtifacts.Service
      const authority = yield* sessions.create({ agent: "maestro", title: "HttpApi research authority" })
      const child = yield* sessions.create({ agent: "jimmy", parentID: authority.id, title: "HttpApi research execution" })
      yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: authority.id,
        projectID: child.projectID, memberID: "jimmy", source: "host" })
      const foreign = yield* sessions.create({ agent: "jimmy", parentID: authority.id, title: "HttpApi foreign research task" })
      yield* LogicalTask.ensure({ executionSessionID: foreign.id, authoritySessionID: authority.id,
        projectID: foreign.projectID, memberID: "jimmy", source: "host" })
      const binding = yield* ResearchBinding.resolve(child.id, child.projectID)
      const user = yield* sessions.updateMessage({
        id: SessionV1.MessageID.ascending(), sessionID: child.id, role: "user", agent: "jimmy", time: { created: Date.now() },
        model: { providerID: Provider.ID.make("test"), modelID: Model.ID.make("test-model") },
      })
      const assistant = yield* sessions.updateMessage({
        id: SessionV1.MessageID.ascending(), sessionID: child.id, role: "assistant", parentID: user.id,
        agent: "jimmy", mode: "jimmy", path: { cwd: binding.directory, root: binding.worktree }, time: { created: Date.now() },
        providerID: Provider.ID.make("test"), modelID: Model.ID.make("test-model"), cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      })
      const invoke = <A, E, R>(run: (context: Tool.Context) => Effect.Effect<A, E, R>) => Effect.gen(function* () {
        const part = yield* sessions.updatePart({
          id: SessionV1.PartID.ascending(), sessionID: child.id, messageID: assistant.id, type: "tool",
          callID: SessionV1.PartID.ascending(), tool: "research_record", state: { status: "pending", input: {}, raw: "" },
        })
        const context: Tool.Context = { sessionID: child.id, assistantMessageID: SessionMessage.ID.make(assistant.id),
          agent: Agent.ID.make("jimmy"), toolCallID: part.callID }
        return yield* CapabilityInvocation.withContext({
          issuer: "app", owner: { projectID: binding.projectID, location: { directory: binding.directory }, sessionID: child.id, agentID: context.agent },
          invocation: { sessionID: child.id, agentID: context.agent, assistantMessageID: context.assistantMessageID, callID: context.toolCallID },
          rootToolName: "research_record", effectiveRules: [{ action: "research_record", resource: "*", effect: "allow" }], nativeDenyFloor: [],
        }, run(context))
      })
      const source = yield* invoke((context) => records.capture(binding, context, {
        origin: { kind: "tool-output", uri: "httpapi-exercise:observed", revision: "version-1" },
        representation: "text", mediaType: "text/plain", content: sourceText, complete: true,
      }))
      const published = yield* invoke((context) => records.record(binding, context, { action: "document", document: {
        genre: "answer", title: "Qualified answer", body: documentText, findingRefs: [],
        citations: { observed: { source: source.ref, locator: { kind: "quote", exact: "Only version 1." } } },
      } }))
      check(published.document !== undefined, "native document publication should return admitted receipt")
      const corpus = Schema.decodeUnknownSync(Research.Corpus)(yield* records.view(binding, { action: "corpus" }))
      check(corpus.complete && stable(corpus.sources) === stable([source]) && stable(corpus.documents) === stable([published.document]),
        "native corpus should expose admitted source and published document receipts")
      const unadmitted = yield* artifacts.put(binding, { content: "Stored but not admitted", representation: "text" }, "httpapi-unadmitted")
      // Host removal preserves admission while deleting owned bytes; no private storage-path manipulation.
      if (unavailable) yield* artifacts.remove(binding)
      const path = (sessionID: string, artifact: { id: string; revision: number }) =>
        route(artifactPath, { sessionID, artifactID: artifact.id }) + `?revision=${artifact.revision}`
      return {
        source, document: published.document,
        sourcePath: path(child.id, source.ref.artifact), documentPath: path(child.id, published.document.artifact),
        foreignPath: path(foreign.id, published.document.artifact), authorityPath: path(authority.id, published.document.artifact),
        unadmittedPath: path(child.id, unadmitted.ref),
      }
    }).pipe(
      Effect.provide(research),
      Effect.provideService(modules.InstanceRef, instance),
      Effect.provide(app),
    )
  }).pipe(Effect.orDie, Effect.scoped)
}
