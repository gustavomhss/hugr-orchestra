import { Location } from "@opencode-ai/schema/location"
import { RelayArm } from "@opencode-ai/schema/relay-arm"
import { RelayAuthoring } from "@opencode-ai/schema/relay-authoring"
import { RelayHook } from "@opencode-ai/schema/relay-hook"
import { Hex64, Sprint } from "@opencode-ai/schema/relay-sprint"
import { NonNegativeInt } from "@opencode-ai/schema/schema"
import { Schema, Struct } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { LocationQuery, locationQueryOpenApi } from "./location"

// Relay authoring (RELAY-PORT-PLAN §5): workflow and hook documents, their versions and scopes, and publication. Every
// refusal carries the authoring code and message (`version-conflict`, `profile-tools-missing`, …) under its status.
const refusal = { code: Schema.String, message: Schema.String }

export class RelayInvalidError extends Schema.TaggedErrorClass<RelayInvalidError>()("RelayInvalidError", refusal, {
  httpApiStatus: 400,
}) {}

export class RelayNotFoundError extends Schema.TaggedErrorClass<RelayNotFoundError>()("RelayNotFoundError", refusal, {
  httpApiStatus: 404,
}) {}

export class RelayConflictError extends Schema.TaggedErrorClass<RelayConflictError>()("RelayConflictError", refusal, {
  httpApiStatus: 409,
}) {}

export class RelayUnavailableError extends Schema.TaggedErrorClass<RelayUnavailableError>()(
  "RelayUnavailableError",
  refusal,
  { httpApiStatus: 503 },
) {}

export const RelayErrors = [RelayInvalidError, RelayNotFoundError, RelayConflictError, RelayUnavailableError]

/**
 * A stored document as the editor reads it: its checksum (the `expectedChecksum` of the next save or publish), the
 * published version, its scopes expanded, whether run admission accepts its profile (`runnable` is false for the
 * seeded profiles whose Relay tools are not ported yet), and who last published or unpublished it.
 */
export const RelayDocumentView = Schema.Struct({
  ...RelayAuthoring.Document.fields,
  tags: Schema.Array(RelayAuthoring.Scope),
  checksum: Hex64,
  activeVersion: Schema.NullOr(RelayAuthoring.Version),
  runnable: Schema.Boolean,
  publishedBy: Schema.optionalKey(Schema.String),
  unpublishedBy: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelayDocumentView", parseOptions: { onExcessProperty: "preserve" } })
export type RelayDocumentView = typeof RelayDocumentView.Type

// The fields a save takes. `active` and `activeVersionId` change only through publish and unpublish.
const DocumentFields = {
  name: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  nodes: Schema.optionalKey(Schema.Array(RelayAuthoring.Node)),
  connections: Schema.optionalKey(RelayAuthoring.Connections),
  nodeGroups: Schema.optionalKey(Schema.Array(RelayAuthoring.NodeGroup)),
  tags: Schema.optionalKey(Schema.Array(RelayAuthoring.Tag)),
  meta: Schema.optionalKey(RelayAuthoring.Meta),
  isArchived: Schema.optionalKey(Schema.Boolean),
}

export const RelayDocumentCreate = Schema.Struct(DocumentFields).annotate({ identifier: "RelayDocumentCreate" })
export type RelayDocumentCreate = typeof RelayDocumentCreate.Type

/** A save of the version the editor loaded: `versionId` is required unless `force` overwrites whatever is stored. */
export const RelayDocumentUpdate = Schema.Struct({
  ...DocumentFields,
  versionId: Schema.optionalKey(Schema.String),
  expectedChecksum: Schema.optionalKey(Schema.String),
  force: Schema.optionalKey(Schema.Boolean),
}).annotate({ identifier: "RelayDocumentUpdate" })
export type RelayDocumentUpdate = typeof RelayDocumentUpdate.Type

export const RelaySprintView = Schema.Struct({
  sprint: Sprint,
  skillBindings: Schema.Array(Schema.Struct(Struct.omit(RelayAuthoring.SkillBinding.fields, ["content"]))),
}).annotate({ identifier: "RelaySprintView" })

export const RelayExport = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("hook"), definition: RelayHook.V1 }),
  Schema.Struct({ kind: Schema.Literal("workflow"), definition: Sprint }),
]).annotate({ identifier: "RelayExport" })

/** The dry "Check now" of one step, run in the project directory with the given params. Nothing is recorded. */
export const RelayCheckInput = Schema.Struct({
  position: Schema.optionalKey(Schema.String),
  counter: Schema.optionalKey(NonNegativeInt),
  baseRef: Schema.optionalKey(Schema.String),
  params: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
}).annotate({ identifier: "RelayCheckInput" })

export const RelayNodeTypes = Schema.Struct({
  workflow: Schema.Array(RelayAuthoring.NodeTypeDescriptor),
  hook: Schema.Array(RelayAuthoring.NodeTypeDescriptor),
}).annotate({ identifier: "RelayNodeTypes" })

export const RelayScopeInput = Schema.Struct({
  name: Schema.String,
  description: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelayScopeInput" })

export const RelayPublishInput = Schema.Struct({
  versionId: Schema.String,
  expectedChecksum: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelayPublishInput" })

export const RelayUnpublishInput = Schema.Struct({
  expectedChecksum: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelayUnpublishInput" })

const document = "/api/relay/document/:documentID"
const params = { documentID: Schema.String }

const docs = (identifier: string, summary: string, description: string) =>
  OpenApi.annotations({ identifier, summary, description })

export const RelayDocumentGroup = HttpApiGroup.make("server.relay.document")
  .add(
    HttpApiEndpoint.get("relay.document.list", "/api/relay/document", {
      query: LocationQuery,
      success: Location.response(Schema.Array(RelayDocumentView)),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.document.list",
          "List Relay documents",
          "The project's workflow and hook documents, newest first. The shipped profiles are seeded once per server.",
        ),
      ),
  )
  .add(
    HttpApiEndpoint.post("relay.document.create", "/api/relay/document", {
      query: LocationQuery,
      payload: RelayDocumentCreate,
      success: Location.response(RelayDocumentView),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.document.create",
          "Create Relay document",
          "Create a document. A draft that does not compile yet is saved with its diagnostics.",
        ),
      ),
  )
  .add(
    HttpApiEndpoint.get("relay.document.get", document, {
      params,
      query: LocationQuery,
      success: Location.response(RelayDocumentView),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs("v2.relay.document.get", "Get Relay document", "One document with its checksum and published version."),
      ),
  )
  .add(
    HttpApiEndpoint.patch("relay.document.update", document, {
      params,
      query: LocationQuery,
      payload: RelayDocumentUpdate,
      success: Location.response(RelayDocumentView),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.document.update",
          "Save Relay document",
          "Save a new version of the loaded one. A stale versionId or expectedChecksum is a 409 version-conflict unless force is set.",
        ),
      ),
  )
  .add(
    HttpApiEndpoint.delete("relay.document.remove", document, {
      params,
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.document.remove",
          "Delete Relay document",
          "Delete a document. Its versions stay, and an installed hook keeps enforcing its pinned snapshot.",
        ),
      ),
  )
  .add(
    HttpApiEndpoint.get("relay.document.versions", `${document}/version`, {
      params,
      query: LocationQuery,
      success: Location.response(Schema.Array(RelayAuthoring.Version)),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs("v2.relay.document.versions", "List document versions", "A document's saved versions, newest first."),
      ),
  )
  .add(
    HttpApiEndpoint.get("relay.document.version", `${document}/version/:versionID`, {
      params: { ...params, versionID: Schema.String },
      query: LocationQuery,
      success: Location.response(RelayAuthoring.Version),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(docs("v2.relay.document.version", "Get document version", "One saved version of a document.")),
  )
  .add(
    HttpApiEndpoint.get("relay.document.sprint", `${document}/sprint`, {
      params,
      query: LocationQuery,
      success: Location.response(RelaySprintView),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.document.sprint",
          "Compile workflow",
          "Compile a workflow document to its sprint and the skill bindings resolved from the skill catalog.",
        ),
      ),
  )
  .add(
    HttpApiEndpoint.get("relay.document.export", `${document}/export`, {
      params,
      query: LocationQuery,
      success: Location.response(RelayExport),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.document.export",
          "Export Relay document",
          "A hook document as its relay.hook.v1 export, a workflow document as its compiled sprint.",
        ),
      ),
  )
  .add(
    HttpApiEndpoint.post("relay.document.check", `${document}/check`, {
      params,
      query: LocationQuery,
      payload: RelayCheckInput,
      success: Location.response(RelayArm.CheckOutcome),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.document.check",
          "Check workflow step",
          "Grade one step of a workflow in the project directory without recording anything or charging retries.",
        ),
      ),
  )
  .add(
    HttpApiEndpoint.get("relay.document.nodeTypes", "/api/relay/node-types", {
      query: LocationQuery,
      success: Location.response(RelayNodeTypes),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs("v2.relay.document.nodeTypes", "List Relay node types", "The workflow and hook node catalogs."),
      ),
  )
  .add(
    HttpApiEndpoint.get("relay.scope.list", "/api/relay/scope", {
      query: LocationQuery,
      success: Location.response(Schema.Array(RelayAuthoring.Scope)),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(docs("v2.relay.scope.list", "List Relay scopes", "The project's document scopes.")),
  )
  .add(
    HttpApiEndpoint.post("relay.scope.create", "/api/relay/scope", {
      query: LocationQuery,
      payload: RelayScopeInput,
      success: Location.response(RelayAuthoring.Scope),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.scope.create",
          "Create Relay scope",
          "Create a scope. A name equal to another scope's under case folding is a 409 duplicate-scope.",
        ),
      ),
  )
  .add(
    HttpApiEndpoint.patch("relay.scope.update", "/api/relay/scope/:scopeID", {
      params: { scopeID: Schema.String },
      query: LocationQuery,
      payload: RelayScopeInput,
      success: Location.response(RelayAuthoring.Scope),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(docs("v2.relay.scope.update", "Update Relay scope", "Rename or describe a scope.")),
  )
  .add(
    HttpApiEndpoint.delete("relay.scope.remove", "/api/relay/scope/:scopeID", {
      params: { scopeID: Schema.String },
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs("v2.relay.scope.remove", "Delete Relay scope", "Delete a scope and remove it from every document's tags."),
      ),
  )
  .annotateMerge(OpenApi.annotations({ title: "relay documents", description: "Relay authoring document routes." }))

export const RelayPublishGroup = HttpApiGroup.make("server.relay.publish")
  .add(
    HttpApiEndpoint.post("relay.publish.publish", `${document}/publish`, {
      params,
      query: LocationQuery,
      payload: RelayPublishInput,
      success: Location.response(RelayDocumentView),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.publish.publish",
          "Publish Relay document",
          "Publish the document's current version once it compiles. The signed-in principal is recorded as publishedBy.",
        ),
      ),
  )
  .add(
    HttpApiEndpoint.post("relay.publish.unpublish", `${document}/unpublish`, {
      params,
      query: LocationQuery,
      payload: RelayUnpublishInput,
      success: Location.response(RelayDocumentView),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.publish.unpublish",
          "Unpublish Relay document",
          "Withdraw the published version. The signed-in principal is recorded as unpublishedBy.",
        ),
      ),
  )
  .annotateMerge(OpenApi.annotations({ title: "relay publish", description: "Relay document publication routes." }))
