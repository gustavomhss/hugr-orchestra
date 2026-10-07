import { Location } from "@orchestra/schema/location"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { RelayLedger } from "@orchestra/schema/relay-ledger"
import { NonNegativeInt } from "@orchestra/schema/schema"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { LocationQuery, locationQueryOpenApi } from "./location"
import { RelayErrors } from "./relay-document"

// Installed hooks (relay-exec-spec H1/H2): the server pins published hook versions into the project's `hooks.json`,
// records each lifecycle change with the signed-in principal, and reads back what installed hooks decided.

export const RelayHookInstalls = Schema.Struct({ installs: Schema.Array(RelayHook.Install) }).annotate({
  identifier: "RelayHookInstalls",
})

/** Pin a published hook. `version` defaults to the document's published version and must be that version. */
export const RelayHookInstallInput = Schema.Struct({
  document: Schema.String,
  version: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelayHookInstallInput" })

/** Repin an install to its document's published version; `version`, when sent, must be that version. */
export const RelayHookUpdateInput = Schema.Struct({
  version: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelayHookUpdateInput" })

export const RelayHookOrderInput = Schema.Struct({ installIDs: Schema.Array(Schema.String) }).annotate({
  identifier: "RelayHookOrderInput",
})

/** The repair discards every install in a corrupt `hooks.json`, so the request states it. */
export const RelayHookRepairInput = Schema.Struct({ confirm: Schema.Literal(true) }).annotate({
  identifier: "RelayHookRepairInput",
})

/** The corrupt file was moved to `backup`, and `hooks.json` now holds no installs. */
export const RelayHookRepaired = Schema.Struct({
  backup: Schema.String,
  installs: Schema.Array(RelayHook.Install),
}).annotate({ identifier: "RelayHookRepaired" })

/** One `hook-decision` line of an install's ledger, with its chain sequence number. */
export const RelayHookDecision = Schema.Struct({
  ...RelayLedger.HookDecision.fields,
  seq: NonNegativeInt,
}).annotate({ identifier: "RelayHookDecision" })
export type RelayHookDecision = typeof RelayHookDecision.Type

const install = "/api/relay/hook/:installID"
const params = { installID: Schema.String }

const docs = (identifier: string, summary: string, description: string) =>
  OpenApi.annotations({ identifier, summary, description })

export const RelayHookGroup = HttpApiGroup.make("server.relay.hook")
  .add(
    HttpApiEndpoint.get("relay.hook.list", "/api/relay/hook", {
      query: LocationQuery,
      success: Location.response(RelayHookInstalls),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.hook.list",
          "List installed hooks",
          "The project's installed hooks in evaluation order. A corrupt hooks.json is a 409 profile-invalid.",
        ),
      ),
  )
  .add(
    HttpApiEndpoint.post("relay.hook.install", "/api/relay/hook", {
      query: LocationQuery,
      payload: RelayHookInstallInput,
      success: Location.response(RelayHook.Install),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.hook.install",
          "Install hook",
          "Pin the published version of a hook document for every session of the project, recording the signed-in principal.",
        ),
      ),
  )
  .add(
    HttpApiEndpoint.post("relay.hook.update", `${install}/update`, {
      params,
      query: LocationQuery,
      payload: RelayHookUpdateInput,
      success: Location.response(RelayHook.Install),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.hook.update",
          "Update installed hook",
          "Repin an install to its document's published version, keeping its ID, order and enabled state.",
        ),
      ),
  )
  .add(
    HttpApiEndpoint.post("relay.hook.enable", `${install}/enable`, {
      params,
      query: LocationQuery,
      success: Location.response(RelayHook.Install),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(docs("v2.relay.hook.enable", "Enable installed hook", "Enable an install; recorded.")),
  )
  .add(
    HttpApiEndpoint.post("relay.hook.disable", `${install}/disable`, {
      params,
      query: LocationQuery,
      success: Location.response(RelayHook.Install),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(docs("v2.relay.hook.disable", "Disable installed hook", "Disable an install; recorded.")),
  )
  .add(
    HttpApiEndpoint.patch("relay.hook.order", "/api/relay/hook/order", {
      query: LocationQuery,
      payload: RelayHookOrderInput,
      success: Location.response(RelayHookInstalls),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.hook.order",
          "Reorder installed hooks",
          "Set the evaluation order. The list must name every install exactly once, else 409 order-mismatch.",
        ),
      ),
  )
  .add(
    HttpApiEndpoint.delete("relay.hook.uninstall", install, {
      params,
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs("v2.relay.hook.uninstall", "Uninstall hook", "Remove an install; recorded. Its ledger is kept."),
      ),
  )
  .add(
    HttpApiEndpoint.get("relay.hook.decisions", `${install}/decisions`, {
      params,
      query: LocationQuery,
      success: Location.response(Schema.Array(RelayHookDecision)),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.hook.decisions",
          "List hook decisions",
          "The most recent 500 decisions in the install's ledger, oldest first.",
        ),
      ),
  )
  .add(
    HttpApiEndpoint.post("relay.hook.repair", "/api/relay/hook/repair", {
      query: LocationQuery,
      payload: RelayHookRepairInput,
      success: Location.response(RelayHookRepaired),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.hook.repair",
          "Repair hooks.json",
          "Only on this explicit request: a corrupt hooks.json (a regular file that does not decode or verify, or is over the size cap) is moved aside to a backup and replaced by an empty install list. A valid file, a symlink, a non-file or an unreadable file is never touched and answers 409.",
        ),
      ),
  )
  .annotateMerge(OpenApi.annotations({ title: "relay hooks", description: "Installed Relay hook routes." }))
