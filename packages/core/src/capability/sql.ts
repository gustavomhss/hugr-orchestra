import { foreignKey, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { Schema } from "effect"
import type { Agent } from "@orchestra/schema/agent"
import type { Capability } from "@orchestra/schema/capability"
import type { Credential } from "@orchestra/schema/credential"
import type { Integration } from "@orchestra/schema/integration"
import type { Project } from "@orchestra/schema/project"
import type { AbsolutePath } from "@orchestra/schema/schema"
import type { SessionID } from "@orchestra/schema/session-id"
import type { WorkspaceID } from "@orchestra/schema/workspace-id"
import { CredentialTable } from "../credential/sql"
import { Timestamps } from "../database/schema.sql"
import { ProjectTable } from "../project/sql"
import { SessionTable } from "../session/sql"

// Credentials stay in the existing credential store; these rows retain explicit references only.
export const CapabilityConnectionTable = sqliteTable("capability_connection", {
  id: text().$type<Capability.ConnectionID>().primaryKey(),
  project_id: text().$type<Project.ID>().references(() => ProjectTable.id, { onDelete: "cascade" }).notNull(),
  directory: text().$type<AbsolutePath>().notNull(),
  workspace_id: text().$type<WorkspaceID>(),
  provider: text().notNull(),
  integration_id: text().$type<Integration.ID>().notNull(),
  credential_id: text().$type<Credential.ID>().references(() => CredentialTable.id, { onDelete: "set null" }),
  subject_id: text().notNull(),
  endpoint: text().notNull(),
  scope_hash: text().notNull(),
  generation: integer().notNull().default(0),
  state: text().$type<"active" | "disconnected" | "revoked">().notNull(),
  ...Timestamps,
})

export const CapabilityTargetTable = sqliteTable("capability_target", {
  id: text().$type<Capability.TargetID>().primaryKey(),
  connection_id: text().$type<Capability.ConnectionID>().references(() => CapabilityConnectionTable.id, { onDelete: "cascade" }).notNull(),
  environment: text().notNull(),
  resource: text({ mode: "json" }).$type<Schema.Json>().notNull(),
  generation: integer().notNull().default(0),
  ...Timestamps,
})

export const CapabilityBindingTable = sqliteTable("capability_binding", {
  target_id: text().$type<Capability.TargetID>().references(() => CapabilityTargetTable.id, { onDelete: "cascade" }).notNull(),
  session_id: text().$type<SessionID>().references(() => SessionTable.id, { onDelete: "cascade" }).notNull(),
  agent_id: text().$type<Agent.ID>().notNull(),
  actions: text({ mode: "json" }).$type<readonly string[]>().notNull(),
  ...Timestamps,
}, (table) => [primaryKey({ columns: [table.target_id, table.session_id, table.agent_id] })])

// Blob revisions are immutable. Session references, rather than the creating Session, own retention.
export const CapabilityArtifactTable = sqliteTable("capability_artifact", {
  id: text().$type<Capability.ArtifactID>().notNull(),
  revision: integer().notNull(),
  owner: text({ mode: "json" }).$type<Capability.Owner>().notNull(),
  producer: text({ mode: "json" }).$type<Capability.InvocationRef>().notNull(),
  mime: text().notNull(),
  kind: text().notNull(),
  hash: text().notNull(),
  bytes: integer().notNull(),
  verification: text().$type<Capability.Verification>().notNull(),
  metadata: text({ mode: "json" }).$type<Schema.Json>().notNull(),
  time_created: Timestamps.time_created,
}, (table) => [primaryKey({ columns: [table.id, table.revision] })])

export const CapabilityArtifactReferenceTable = sqliteTable("capability_artifact_reference", {
  artifact_id: text().$type<Capability.ArtifactID>().notNull(),
  revision: integer().notNull(),
  session_id: text().$type<SessionID>().references(() => SessionTable.id, { onDelete: "cascade" }).notNull(),
  pinned: integer({ mode: "boolean" }).notNull().default(false),
  time_created: Timestamps.time_created,
}, (table) => [
  primaryKey({ columns: [table.artifact_id, table.revision, table.session_id] }),
  foreignKey({ columns: [table.artifact_id, table.revision], foreignColumns: [CapabilityArtifactTable.id, CapabilityArtifactTable.revision] }).onDelete("cascade"),
])

// Pins remain durable when their creating Session reference is removed.
export const CapabilityArtifactPinTable = sqliteTable("capability_artifact_pin", {
  artifact_id: text().$type<Capability.ArtifactID>().notNull(),
  revision: integer().notNull(),
  owner: text({ mode: "json" }).$type<Capability.Owner>().notNull(),
  session_id: text().$type<SessionID>().notNull(),
  time_created: Timestamps.time_created,
}, (table) => [
  primaryKey({ columns: [table.artifact_id, table.revision, table.session_id] }),
  foreignKey({ columns: [table.artifact_id, table.revision], foreignColumns: [CapabilityArtifactTable.id, CapabilityArtifactTable.revision] }).onDelete("cascade"),
])

// Durable observations never imply permission to redispatch provider work after restart.
export const CapabilityJobTable = sqliteTable("capability_job", {
  id: text().$type<Capability.JobID>().primaryKey(),
  owner: text({ mode: "json" }).$type<Capability.Owner>().notNull(),
  invocation: text({ mode: "json" }).$type<Capability.InvocationRef>().notNull(),
  kind: text().$type<"provider" | "local-process" | "worker" | "script">().notNull(),
  operation: text().notNull(),
  creation_key: text().unique(),
  request_hash: text(),
  state: text().notNull(),
  connection: text({ mode: "json" }).$type<Capability.ConnectionRef>(),
  target: text({ mode: "json" }).$type<Capability.TargetRef>(),
  provider_id: text(),
  observation: text({ mode: "json" }).$type<Schema.Json>().notNull(),
  generation: integer().notNull().default(0),
  ...Timestamps,
})

// Child calls are execution evidence, not provider replay grants or extra model tool parts.
export const CapabilityChildTable = sqliteTable("capability_child", {
  id: text().primaryKey(),
  session_id: text().$type<SessionID>().references(() => SessionTable.id, { onDelete: "cascade" }).notNull(),
  agent_id: text().$type<Agent.ID>().notNull(),
  assistant_message_id: text().notNull(),
  root_call_id: text().notNull(),
  root_tool_name: text().notNull(),
  parent_call_id: text().notNull(),
  ordinal: integer().notNull(),
  depth: integer().notNull(),
  tool_name: text().notNull(),
  request_hash: text().notNull(),
  state: text().$type<"running" | "completed" | "failed" | "interrupted">().notNull(),
  ...Timestamps,
}, (table) => [uniqueIndex("capability_child_parent_ordinal").on(
  table.session_id, table.assistant_message_id, table.parent_call_id, table.ordinal,
)])

// Operator mutations are local SQL transitions. This ledger never admits remote/model execution.
export const CapabilityRequestTable = sqliteTable("capability_request", {
  id: text().primaryKey(),
  idempotency_hash: text().unique().notNull(),
  principal: text().notNull(),
  origin: text().notNull(),
  scope_hash: text().notNull(),
  action: text().notNull(),
  target_hash: text().notNull(),
  payload_hash: text().notNull(),
  result: text({ mode: "json" }).$type<Schema.Json>().notNull(),
  time_created: Timestamps.time_created,
})
