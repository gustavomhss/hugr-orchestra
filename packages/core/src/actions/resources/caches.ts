export * as ActionsCaches from "./caches"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { GitHubNative } from "../github/native"
import { ActionsGitLabNative } from "../gitlab/native"
import { ActionsResourceNative } from "./native"
import { ActionsResourceGraphQL } from "./gitlab-graphql"

const Cache = Schema.Struct({ id: GitHubNative.ID, key: Schema.NonEmptyString, ref: Schema.NonEmptyString,
  version: Schema.NonEmptyString, size_in_bytes: GitHubNative.Count, created_at: GitHubNative.Time, last_accessed_at: GitHubNative.Time })
const Caches = Schema.Struct({ total_count: GitHubNative.Count, actions_caches: Schema.Array(Cache) })
const Usage = Schema.Struct({ full_name: Schema.NonEmptyString, active_caches_size_in_bytes: GitHubNative.Count, active_caches_count: GitHubNative.Count })
const Delete = Schema.Struct({ provider: Schema.Literal("github"), name: Schema.optionalKey(Schema.NonEmptyString), ref: Schema.optionalKey(Schema.NonEmptyString) })
const Clear = Schema.Struct({ data: Schema.Struct({ runnerCacheClear: Schema.NullOr(Schema.Struct({ errors: Schema.Array(Schema.String) })) }),
  errors: Schema.optionalKey(Schema.Array(Schema.Json)) })
type Services = ActionsResourceNative.Services & { readonly graphql?: ActionsResourceGraphQL.Request }

export function make(services: Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsCaches.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.selection(binding, input, "caches",
        binding.provider.kind === "github" ? ["resourceID", "ref", "query", "cursor", "limit"] : []))
      const current = frozen.binding
      if (current.provider.kind === "gitlab") {
        const project = yield* ActionsGitLabNative.make(services.transport).project(current)
        return { items: [{ id: current.projectID, bindingID: current.id, kind: "caches" as const, name: "Project runner caches",
          scope: ActionsResourceNative.scope(current), data: { nativeID: current.projectID, projectID: current.projectID,
            scope: "Every cache key in this project", storage: "Runner or external object storage", inventory: "native_unavailable",
            projectWide: true, existingBlobsRetained: true, futureJobsOnly: true, resourceVersion: projectVersion(project) } }], total: 1, capturedAt: Date.now() }
      }
      const repo = yield* GitHubNative.repository(services.transport, current)
      const selected = yield* ActionsResourceNative.checked(current, () => {
        if (frozen.input.resourceID !== undefined) ActionsResourceNative.id(current, frozen.input.resourceID)
        if (frozen.input.ref !== undefined) cacheRef(current, frozen.input.ref)
        return GitHubNative.selection(current, "github.caches", { ...(frozen.input.query === undefined ? {} : { key: frozen.input.query }),
          ...(frozen.input.ref === undefined ? {} : { ref: frozen.input.ref }) }, frozen.input.cursor, frozen.input.limit)
      })
      const query = { page: selected.page, per_page: selected.per_page, ...(frozen.input.query === undefined ? {} : { key: frozen.input.query }),
        ...(frozen.input.ref === undefined ? {} : { ref: frozen.input.ref }) }
      const response = yield* ActionsResourceNative.get(services, current, `${repo.path}/actions/caches`, query)
      const measured = yield* usage(services, current)
      return yield* ActionsResourceNative.checked(current, () => {
        const native = ActionsResourceNative.decode(current, Caches, response.data)
        if (frozen.input.resourceID !== undefined && !native.actions_caches.some((cache) => String(cache.id) === frozen.input.resourceID))
          throw ActionsResourceNative.error(current, "not_found", "Cache ID was not in this native key/ref page; select its exact key/ref cursor")
        return { items: native.actions_caches.filter((cache) => frozen.input.resourceID === undefined || String(cache.id) === frozen.input.resourceID)
          .map((cache): Actions.Resource => ({ id: String(cache.id), bindingID: current.id, kind: "caches", name: cache.key,
            scope: ActionsResourceNative.scope(current), data: { nativeID: String(cache.id), key: cache.key, ref: cache.ref,
              size: cache.size_in_bytes, sizeInBytes: cache.size_in_bytes, createdAt: cache.created_at, lastAccessedAt: cache.last_accessed_at,
              age: cache.last_accessed_at, version: cache.version, resourceVersion: cacheVersion(cache), usage: measured } })),
          ...GitHubNative.pagination(current, response, { method: "GET", path: `${repo.path}/actions/caches`, query }, selected, native.actions_caches.length, native.total_count) }
      })
    }),
    perform: Effect.fn("ActionsCaches.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.capture(binding, intent, payload, "caches", ["resource.delete", "cache.clear"]))
      const current = frozen.binding
      const admitted = frozen.intent
      const authority = yield* ActionsResourceNative.authority(services, current, current.provider.kind === "gitlab" ? 30 : 40)
      yield* ActionsResourceNative.source(services, current, admitted)
      if (current.provider.kind === "gitlab") {
        yield* ActionsResourceNative.checked(current, () => {
          const input = ActionsResourceNative.input(current, ActionsResourceNative.ProviderOnly, frozen.payload)
          if (input.provider !== "gitlab" || admitted.kind !== "cache.clear" || admitted.target.resourceID !== undefined && admitted.target.resourceID !== current.projectID)
            throw ActionsResourceNative.error(current, "invalid_input", "GitLab cache invalidation requires cache.clear at whole-project scope")
        })
        const project = yield* ActionsResourceNative.before(current, ActionsGitLabNative.make(services.transport).project(current))
        yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.requireVersion(current, admitted, projectVersion(project)))
        if (!services.graphql) return yield* ActionsResourceNative.error(current, "capability_unavailable", "GitLab cache clear requires bound /api/graphql transport; /api/v4/graphql is not a native endpoint")
        const response = yield* services.graphql(current, { kind: "cacheClear" }).pipe(Effect.mapError((cause) =>
          ActionsResourceNative.error(current, cause.disposition === "definitely_unsent" || cause.disposition === "definitely_rejected" ? cause.kind : "outcome_unknown",
            "GitLab cache-clear request failed", cause.disposition ?? "unknown")))
        return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const native = ActionsResourceNative.decode(current, Clear, response.data, true)
          if (response.status !== 200 || native.errors?.length || !native.data.runnerCacheClear || native.data.runnerCacheClear.errors.length)
            throw ActionsResourceNative.error(current, "outcome_unknown", "GitLab did not acknowledge project cache namespace invalidation", "unknown")
          return { acknowledgement: { resourceID: current.projectID } }
        }))
      }
      const input = yield* ActionsResourceNative.checked(current, () => {
        const value = ActionsResourceNative.input(current, Delete, frozen.payload)
        if (!admitted.target.resourceID && !value.name) throw ActionsResourceNative.error(current, "invalid_input", "GitHub cache deletion requires a native ID or exact cache key")
        if (value.ref !== undefined) cacheRef(current, value.ref)
        if (value.ref !== admitted.target.ref)
          throw ActionsResourceNative.error(current, "invalid_input", "Cache execute ref differs from the admitted exact ref")
        if (!admitted.target.resourceID && admitted.expected?.resourceVersion !== undefined)
          throw ActionsResourceNative.error(current, "invalid_input", "Cache resourceVersion binds one native cache ID; key-wide deletion requires explicit native IDs")
        if (admitted.target.resourceID !== undefined) ActionsResourceNative.id(current, admitted.target.resourceID)
        return value
      })
      // GitHub has no cache-ID GET. Bounded exact-key/ref inventory proves ID mapping;
      // a full/partial page can never be mistaken for complete key-wide preflight.
      const response = yield* ActionsResourceNative.get(services, current, `${authority.root}/actions/caches`, {
        per_page: 100, page: 1, ...(input.name === undefined ? {} : { key: input.name }), ...(input.ref === undefined ? {} : { ref: input.ref }),
      })
      const native = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.decode(current, Caches, response.data))
      const cache = yield* ActionsResourceNative.checked(current, () => {
        const exact = native.actions_caches.filter((cache) => (input.name === undefined || cache.key === input.name) && (input.ref === undefined || cache.ref === input.ref))
        if (admitted.target.resourceID !== undefined) {
          const cache = exact.find((cache) => String(cache.id) === admitted.target.resourceID)
          if (!cache) throw ActionsResourceNative.error(current, native.total_count > native.actions_caches.length ? "metadata_truncated" : "not_found",
            "Native cache ID was not proved for this key/ref; provide its exact native key/ref selection")
          ActionsResourceNative.requireVersion(current, admitted, cacheVersion(cache))
          return cache
        }
        if (native.total_count > native.actions_caches.length) throw ActionsResourceNative.error(current, "metadata_truncated", "Key-wide cache deletion requires complete bounded native key/ref inventory; select individual IDs")
        if (!exact.length) throw ActionsResourceNative.error(current, "not_found", "No native cache matched the exact cache key/ref")
        return undefined
      })
      if (cache) {
        yield* ActionsResourceNative.send(services, current, { method: "DELETE", path: `${authority.root}/actions/caches/${cache.id}` }, [204])
        return { acknowledgement: { resourceID: String(cache.id) } }
      }
      const written = yield* ActionsResourceNative.send(services, current, { method: "DELETE", path: `${authority.root}/actions/caches`,
        query: { key: input.name ?? "", ...(input.ref === undefined ? {} : { ref: input.ref }) } }, [200])
      yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
        const deleted = ActionsResourceNative.decode(current, Caches, written.data, true)
        if (!deleted.actions_caches.length || deleted.actions_caches.some((cache) => cache.key !== input.name || input.ref !== undefined && cache.ref !== input.ref))
          throw ActionsResourceNative.error(current, "outcome_unknown", "Cache-key deletion response did not prove the exact admitted key/ref", "unknown")
      }))
      return { acknowledgement: { unattributed: true } }
    }),
  }
}

export const usage = Effect.fn("ActionsCaches.usage")(function* (services: ActionsResourceNative.Services, binding: Actions.Binding) {
  if (binding.provider.kind !== "github") return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitLab project API does not expose per-key cache storage usage")
  const repo = yield* GitHubNative.repository(services.transport, binding)
  const response = yield* ActionsResourceNative.get(services, binding, `${repo.path}/actions/cache/usage`)
  return yield* ActionsResourceNative.checked(binding, () => {
    const native = ActionsResourceNative.decode(binding, Usage, response.data)
    if (native.full_name !== repo.native.full_name) throw ActionsResourceNative.error(binding, "binding_stale", "Cache usage identity differs from the immutable repository lookup")
    return { sizeInBytes: native.active_caches_size_in_bytes, count: native.active_caches_count, refresh: "approximately_five_minutes", capturedAt: Date.now() }
  })
})

function cacheRef(binding: Actions.Binding, ref: string) {
  GitHubNative.ref(binding, ref)
  if (!/^refs\/(?:heads\/.+|pull\/[1-9]\d*\/merge)$/.test(ref))
    throw ActionsResourceNative.error(binding, "invalid_input", "Cache ref must be an exact native refs/heads/... or refs/pull/.../merge value")
}

function cacheVersion(cache: typeof Cache.Type) {
  return ActionsResourceNative.version({ id: String(cache.id), key: cache.key, ref: cache.ref, version: cache.version,
    createdAt: cache.created_at, sizeInBytes: cache.size_in_bytes })
}

function projectVersion(project: typeof ActionsGitLabNative.Project.Type) {
  return ActionsResourceNative.version({ projectID: String(project.id), archived: project.archived ?? null,
    jobsEnabled: project.jobs_enabled ?? null, buildsAccessLevel: project.builds_access_level ?? null })
}
