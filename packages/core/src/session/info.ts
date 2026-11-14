import { DateTime } from "effect"
import { AgentV2 } from "../agent"
import { Location } from "../location"
import { ModelV2 } from "../model"
import { ProjectV2 } from "../project"
import { ProviderV2 } from "../provider"
import { AbsolutePath, RelativePath } from "../schema"
import { WorkspaceV2 } from "../workspace"
import { SessionSchema } from "./schema"
import { SessionTable } from "./sql"
import { SessionMessage } from "./message"
import { Snapshot } from "../snapshot"
import { SessionSubagentModels } from "./subagent-models"

export const columns = {
  id: SessionTable.id,
  project_id: SessionTable.project_id,
  title: SessionTable.title,
  parent_id: SessionTable.parent_id,
  agent: SessionTable.agent,
  subagent_models: SessionTable.subagent_models,
  model: SessionTable.model,
  cost: SessionTable.cost,
  tokens_input: SessionTable.tokens_input,
  tokens_output: SessionTable.tokens_output,
  tokens_reasoning: SessionTable.tokens_reasoning,
  tokens_cache_read: SessionTable.tokens_cache_read,
  tokens_cache_write: SessionTable.tokens_cache_write,
  directory: SessionTable.directory,
  workspace_id: SessionTable.workspace_id,
  path: SessionTable.path,
  revert: SessionTable.revert,
  time_created: SessionTable.time_created,
  time_updated: SessionTable.time_updated,
  time_archived: SessionTable.time_archived,
}

export function fromRow(row: Pick<typeof SessionTable.$inferSelect, keyof typeof columns>): SessionSchema.Info {
  return SessionSchema.Info.make({
    id: SessionSchema.ID.make(row.id),
    projectID: ProjectV2.ID.make(row.project_id),
    title: row.title,
    parentID: row.parent_id ? SessionSchema.ID.make(row.parent_id) : undefined,
    agent: row.agent ? AgentV2.ID.make(row.agent) : undefined,
    subagentModels: SessionSubagentModels.fromStorage(row.id, row.subagent_models),
    model: row.model
      ? {
          id: ModelV2.ID.make(row.model.id),
          providerID: ProviderV2.ID.make(row.model.providerID),
          ...(row.model.variant === undefined ? {} : { variant: ModelV2.VariantID.make(row.model.variant) }),
        }
      : undefined,
    cost: row.cost,
    tokens: {
      input: row.tokens_input,
      output: row.tokens_output,
      reasoning: row.tokens_reasoning,
      cache: {
        read: row.tokens_cache_read,
        write: row.tokens_cache_write,
      },
    },
    location: Location.Ref.make({
      directory: AbsolutePath.make(row.directory),
      workspaceID: row.workspace_id ? WorkspaceV2.ID.make(row.workspace_id) : undefined,
    }),
    subpath: row.path ? RelativePath.make(row.path) : undefined,
    revert: row.revert ? { ...row.revert, messageID: SessionMessage.ID.make(row.revert.messageID) } : undefined,
    time: {
      created: DateTime.makeUnsafe(row.time_created),
      updated: DateTime.makeUnsafe(row.time_updated),
      archived: row.time_archived === null ? undefined : DateTime.makeUnsafe(row.time_archived),
    },
  })
}
