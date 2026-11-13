import type {
  Todo,
} from "./misc"

export type EventCatalogUpdated = {
  id: string
  type: "catalog.updated"
  properties: {
    [key: string]: unknown
  }
}
export type EventFileEdited = {
  id: string
  type: "file.edited"
  properties: {
    file: string
  }
}
export type EventFileWatcherUpdated = {
  id: string
  type: "file.watcher.updated"
  properties: {
    file: string
    event: "add" | "change" | "unlink"
  }
}
export type EventIntegrationConnectionUpdated = {
  id: string
  type: "integration.connection.updated"
  properties: {
    integrationID: string
  }
}
export type EventIntegrationUpdated = {
  id: string
  type: "integration.updated"
  properties: {
    [key: string]: unknown
  }
}
export type EventModelsDevRefreshed = {
  id: string
  type: "models-dev.refreshed"
  properties: {
    [key: string]: unknown
  }
}
export type EventPluginAdded = {
  id: string
  type: "plugin.added"
  properties: {
    id: string
  }
}
export type EventProjectDirectoriesUpdated = {
  id: string
  type: "project.directories.updated"
  properties: {
    projectID: string
  }
}
export type EventReferenceUpdated = {
  id: string
  type: "reference.updated"
  properties: {
    [key: string]: unknown
  }
}
export type EventRelayHookDecided = {
  id: string
  type: "relay.hook.decided"
  properties: {
    decisionID: string
    installID: string
    version: string
    sha256: string
    nodeID: string
    action: "remind" | "block" | "approve" | "verify" | "repair" | "record" | "allow"
    trigger: string
    tool?: string
    sessionID: string
    callID?: string
    assistantMessageID?: string
    messageID?: string
    agent?: string
    subject: string
    outcome:
      | "blocked"
      | "approved"
      | "rejected"
      | "cancelled"
      | "passed"
      | "failed"
      | "unavailable"
      | "repair-required"
      | "reminded"
      | "recorded"
      | "allowed"
    replier?: string
    durationMs: number
  }
}
export type EventServerConnected = {
  id: string
  type: "server.connected"
  properties: {
    [key: string]: unknown
  }
}
export type EventTodoUpdated = {
  id: string
  type: "todo.updated"
  properties: {
    sessionID: string
    todos: Array<Todo>
  }
}
export type EventVcsBranchUpdated = {
  id: string
  type: "vcs.branch.updated"
  properties: {
    branch?: string
  }
}
