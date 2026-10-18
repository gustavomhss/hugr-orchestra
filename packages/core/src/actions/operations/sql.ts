import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { Actions } from "@orchestra/schema/actions"

export const ActionsOperationTable = sqliteTable(
  "actions_operation",
  {
    id: text().$type<Actions.OperationID>().primaryKey(),
    location_key: text().notNull(),
    project_id: text().notNull(),
    directory: text().notNull(),
    workspace_id: text(),
    binding_id: text().$type<Actions.BindingID>().notNull(),
    binding_revision: integer().notNull(),
    provider_kind: text().$type<Actions.ProviderKind>().notNull(),
    provider_hostname: text().notNull(),
    provider_api_origin: text().notNull(),
    provider_project_id: text().notNull(),
    actor: text().notNull(),
    client_id: text().notNull(),
    kind: text().$type<Actions.OperationKind>().notNull(),
    target: text({ mode: "json" }).$type<Actions.OperationTarget>().notNull(),
    expected: text({ mode: "json" }).$type<Actions.OperationExpected>(),
    state: text().$type<Actions.Operation["state"]>().notNull(),
    time_created: integer().notNull(),
    time_expires: integer().notNull(),
    time_updated: integer().notNull(),
    result: text({ mode: "json" }).$type<Actions.Operation["result"]>(),
    reason: text(),
  },
  (table) => [
    uniqueIndex("actions_operation_location_binding_client_idx").on(table.location_key, table.binding_id, table.client_id),
    index("actions_operation_state_expires_idx").on(table.state, table.time_expires),
    index("actions_operation_state_updated_idx").on(table.state, table.time_updated),
  ],
)
