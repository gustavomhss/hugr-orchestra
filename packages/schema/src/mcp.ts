export * as Mcp from "./mcp"

import { Schema } from "effect"
import { optional } from "./schema"

// Connection state of one configured MCP server, as reported to clients.
const StatusConnected = Schema.Struct({ status: Schema.Literal("connected") }).annotate({
  identifier: "MCPStatusConnected",
})
const StatusDisabled = Schema.Struct({ status: Schema.Literal("disabled") }).annotate({
  identifier: "MCPStatusDisabled",
})
const StatusFailed = Schema.Struct({ status: Schema.Literal("failed"), error: Schema.String }).annotate({
  identifier: "MCPStatusFailed",
})
const StatusNeedsAuth = Schema.Struct({ status: Schema.Literal("needs_auth") }).annotate({
  identifier: "MCPStatusNeedsAuth",
})
const StatusNeedsClientRegistration = Schema.Struct({
  status: Schema.Literal("needs_client_registration"),
  error: Schema.String,
}).annotate({ identifier: "MCPStatusNeedsClientRegistration" })

export const Status = Schema.Union([
  StatusConnected,
  StatusDisabled,
  StatusFailed,
  StatusNeedsAuth,
  StatusNeedsClientRegistration,
]).annotate({ identifier: "MCPStatus", discriminator: "status" })
export type Status = Schema.Schema.Type<typeof Status>

// One configured MCP server of a Location and its connection state.
export const Server = Schema.Struct({ name: Schema.String, status: Status }).annotate({ identifier: "McpServer" })
export type Server = Schema.Schema.Type<typeof Server>

// A resource or resource template one connected MCP server offers, as the prompt's @ mentions list them.
export const Resource = Schema.Struct({
  server: Schema.String,
  name: Schema.String,
  uri: Schema.String,
  description: Schema.String.pipe(Schema.optional),
  mimeType: Schema.String.pipe(Schema.optional),
}).annotate({ identifier: "McpResource" })
export type Resource = Schema.Schema.Type<typeof Resource>

export const ResourceTemplate = Schema.Struct({
  server: Schema.String,
  name: Schema.String,
  uriTemplate: Schema.String,
  description: Schema.String.pipe(Schema.optional),
  mimeType: Schema.String.pipe(Schema.optional),
}).annotate({ identifier: "McpResourceTemplate" })
export type ResourceTemplate = Schema.Schema.Type<typeof ResourceTemplate>

export const ResourceCatalog = Schema.Struct({
  resources: Schema.Array(Resource),
  templates: Schema.Array(ResourceTemplate),
}).annotate({ identifier: "McpResourceCatalog" })
export type ResourceCatalog = Schema.Schema.Type<typeof ResourceCatalog>

// The authorization URL of a started OAuth sign-in; empty when the server was already authorized.
export const AuthStart = Schema.Struct({
  authorizationUrl: Schema.String,
  oauthState: Schema.String,
}).annotate({ identifier: "McpAuthStart" })
export type AuthStart = Schema.Schema.Type<typeof AuthStart>

// What the MCP page shows of one server's config: its transport and endpoint only, never headers, environment or OAuth.
export interface Entry extends Schema.Schema.Type<typeof Entry> {}
export const Entry = Schema.Struct({
  type: optional(Schema.Literals(["local", "remote"])),
  command: optional(Schema.Array(Schema.String)),
  url: optional(Schema.String),
}).annotate({ identifier: "McpEntry" })
