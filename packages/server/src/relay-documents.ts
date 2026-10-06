export * as RelayDocuments from "./relay-documents"

import path from "path"
import { createHash } from "crypto"
import { Context, Effect, Layer, RcMap, Result } from "effect"
import { Location } from "@opencode-ai/core/location"
import { Relay } from "@opencode-ai/core/relay"
import { SkillV2 } from "@opencode-ai/core/skill"
import {
  RelayConflictError,
  RelayInvalidError,
  RelayNotFoundError,
  RelayUnavailableError,
  type RelayDocumentCreate,
  type RelayDocumentView,
} from "@opencode-ai/protocol/groups/relay-document"
import { AuthoringGraph } from "@opencode-ai/relay/authoring/graph"
import { AuthoringHook } from "@opencode-ai/relay/authoring/hook"
import { AuthoringStore } from "@opencode-ai/relay/authoring/store"
import type { RelayAuthoring } from "@opencode-ai/schema/relay-authoring"
import { response } from "./location"

// The authoring application behind the Relay document, publish and hook routes (relay_authoring/application.py): the
// store per project, the editor's view of a document, a save that keeps an uncompilable draft with its diagnostics,
// compilation with skills from Orchestra's catalog, and refusals as HttpApi errors.

export interface Interface {
  // Runs `use` against the requesting project's store, under `<Global.data>/relay/<projectID>/authoring.sqlite3`.
  readonly use: <A, E, R>(
    use: (store: AuthoringStore.Interface) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R | Relay.Service | Location.Service>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/server/RelayDocuments") {}

// One store per project, opened on first use and closed once idle. The shipped profiles are seeded the first time a
// project's store opens in this process, as Python seeds them when its server starts, so a deleted profile document
// only returns after a restart.
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const seeded = new Set<string>()
    const stores = yield* RcMap.make({
      lookup: (root: string) =>
        Effect.gen(function* () {
          const store = yield* AuthoringStore.open(root, path.basename(root))
          if (seeded.has(root)) return store
          seeded.add(root)
          // A missing profile catalog leaves the templates out; the project's own documents stay usable.
          yield* AuthoringStore.seedProfiles(store).pipe(
            Effect.catchCause((cause) => Effect.logWarning("relay profiles were not seeded", { root, cause })),
          )
          return store
        }),
      idleTimeToLive: "10 minutes",
    })
    return Service.of({
      use: (use) =>
        Effect.gen(function* () {
          const relay = yield* Relay.Service
          return yield* use(yield* RcMap.get(stores, relay.paths.root))
        }).pipe(Effect.scoped),
    })
  }),
)

/** The editor's view (Python's `view`): the stored document, validated, plus what the editor needs beside it. */
export const view = Effect.fnUntraced(function* (
  store: AuthoringStore.Interface,
  document: RelayAuthoring.Document,
  scopes?: ReadonlyArray<RelayAuthoring.Scope>,
) {
  yield* AuthoringGraph.validate(document)
  const available = new Map((scopes ?? (yield* store.scopes())).map((scope) => [scope.id, scope]))
  return {
    ...document,
    tags: document.tags.flatMap((tag) => {
      const scope = available.get(typeof tag === "string" ? tag : tag.id)
      return scope ? [scope] : []
    }),
    checksum: AuthoringStore.checksum(document),
    activeVersion: document.activeVersionId ? yield* store.version(document.id, document.activeVersionId) : null,
    runnable: yield* AuthoringStore.runnable(document).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    ),
  } satisfies RelayDocumentView
})

/**
 * Python's `save`: the stored document overlaid with the given fields, validated (an invalid shape is refused), then
 * compiled. A draft that does not compile is saved with the refusal as its diagnostic; a workflow that does has its
 * retained sprint, WP titles and node names brought in line with the graph. Node positions are rounded here, because
 * ledgers and hook exports carry whole numbers only.
 */
export const save = Effect.fnUntraced(function* (input: {
  readonly store: AuthoringStore.Interface
  readonly skills: AuthoringGraph.SkillResolver
  readonly fields: RelayDocumentCreate
  readonly id?: string
  readonly expectedVersion?: string
  readonly expectedChecksum?: string
}) {
  const before = input.id ? yield* input.store.get(input.id) : undefined
  const fields = yield* rounded(input.fields)
  const candidate: Record<string, unknown> = structuredClone({ ...before, ...fields })
  Object.entries({ name: "New Relay workflow", nodes: [], connections: {}, meta: {} }).forEach((entry) => {
    if (!Object.hasOwn(candidate, entry[0])) candidate[entry[0]] = entry[1]
  })
  // Only publish and unpublish change what is available to run or install, never a save.
  candidate.active = before?.active ?? false
  candidate.activeVersionId = before?.activeVersionId ?? null
  yield* AuthoringGraph.validate(candidate)
  const meta = candidate.meta as { relay?: Record<string, unknown> }
  meta.relay ??= { schema: 1, kind: "workflow" }
  const relay = meta.relay
  const hook = AuthoringHook.isHook(candidate)
  relay.kind = hook ? "hook" : "workflow"
  const compiled = yield* (hook ? AuthoringHook.compile(candidate) : align(candidate, relay, input.skills)).pipe(
    Effect.result,
  )
  relay.diagnostics = Result.isSuccess(compiled) ? [] : [compiled.failure.message]
  return yield* input.store.save({
    body: candidate as Partial<RelayAuthoring.Document>,
    id: input.id,
    expectedVersion: input.expectedVersion,
    expectedChecksum: input.expectedChecksum,
  })
})

/** A hook compiles to its export; a workflow to its sprint, with the skills it binds. */
export const compile = Effect.fnUntraced(function* (document: unknown, skills: AuthoringGraph.SkillResolver) {
  if (AuthoringHook.isHook(document))
    return { kind: "hook" as const, definition: yield* AuthoringHook.compile(document) }
  return { kind: "workflow" as const, definition: (yield* AuthoringGraph.compile(document, skills)).sprint }
})

/**
 * Skills by name from the Location's catalog, as the editor lists them. Content and sha256 come from the catalog;
 * empty, NUL-carrying or oversized content is refused as Python's catalog refuses it.
 */
export function skills(catalog: SkillV2.Interface): AuthoringGraph.SkillResolver {
  return (name) =>
    catalog.list().pipe(
      Effect.flatMap((list) => {
        const skill = list.find((item) => item.name === name)
        if (!skill) return Effect.fail(refusal("Skill unavailable", 404, "skill-unavailable"))
        if (!skill.content.trim() || skill.content.includes("\0") || Buffer.byteLength(skill.content) > SKILL_LIMIT)
          return Effect.fail(refusal("The skill is empty, invalid or over the size limit", 400, "invalid-request"))
        return Effect.succeed({
          id: skill.name,
          content: skill.content,
          sha256: createHash("sha256").update(skill.content).digest("hex"),
        })
      }),
    )
}

/** The value inside the Location envelope, with authoring refusals as their HttpApi errors. */
export function respond<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return response(refusals(effect))
}

export function refusals<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.catchIf(
      (error): error is Extract<E, AuthoringGraph.Refusal> => error instanceof AuthoringGraph.Refusal,
      (error) => Effect.fail(refused(error)),
    ),
  )
}

/** An authoring refusal as the HttpApi error of its status. */
export function refused(error: { readonly status: number; readonly code: string; readonly message: string }) {
  const fields = { code: error.code, message: error.message }
  if (error.status === 404) return new RelayNotFoundError(fields)
  if (error.status === 409) return new RelayConflictError(fields)
  if (error.status === 503) return new RelayUnavailableError(fields)
  return new RelayInvalidError(fields)
}

export function refusal(message: string, status: number, code: string) {
  return new AuthoringGraph.Refusal({ status, code, message })
}

// relay_authoring/skills.py LIMIT.
const SKILL_LIMIT = 2 * 1024 * 1024

// The compiled sprint's objective, retry budget and WP titles replace the retained plan's, and node names are noted.
function align(
  candidate: Record<string, unknown>,
  relay: Record<string, unknown>,
  resolver: AuthoringGraph.SkillResolver,
) {
  return AuthoringGraph.compile(candidate, resolver).pipe(
    Effect.map((compiled) => {
      relay.sprint ??= { work_packages: [], macros: [] }
      const retained = relay.sprint as { work_packages?: Array<Record<string, unknown>> }
      Object.assign(retained, { brief: compiled.sprint.brief, retry_budget: compiled.sprint.retry_budget })
      const titles = new Map(compiled.sprint.work_packages.map((wp) => [wp.id, wp.title]))
      ;(retained.work_packages ?? []).forEach((wp) => {
        if (titles.has(wp.id as string)) wp.title = titles.get(wp.id as string)
      })
      const nodes = candidate.nodes as Array<{ id: string; name: string; parameters?: Record<string, unknown> }>
      relay.names = Object.fromEntries(nodes.map((node) => [node.id, node.name]))
      nodes.forEach((node) => {
        if (node.parameters && Object.hasOwn(node.parameters, "title") && titles.has(node.id))
          node.parameters.title = titles.get(node.id)
      })
    }),
  )
}

// Canvas positions become whole numbers. A fractional typeVersion would make the hook export unencodable, so it is
// refused rather than changed.
function rounded(fields: RelayDocumentCreate) {
  if (!fields.nodes) return Effect.succeed(fields)
  if (fields.nodes.some((node) => node.typeVersion !== undefined && !Number.isInteger(node.typeVersion)))
    return Effect.fail(refusal("A node typeVersion must be a whole number", 400, "invalid-request"))
  return Effect.succeed({
    ...fields,
    // `|| 0` keeps -0 (a rounded -0.4) out of the stored JSON.
    nodes: fields.nodes.map((node) => ({
      ...node,
      position: [Math.round(node.position[0]) || 0, Math.round(node.position[1]) || 0] as const,
    })),
  })
}
