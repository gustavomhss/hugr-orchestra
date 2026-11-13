import type {
  Command,
} from "./config"

import type {
  OAuth,
} from "./provider"

export type McpListInput = {
  readonly location?: {
    readonly location?:
      | {
          readonly directory?: string | undefined
          readonly workspace?: string | undefined
        }
      | undefined
  }["location"]
}
export type McpListOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: Array<McpServer>
}
export type McpLocalConfig = {
  /**
   * Type of MCP server connection
   */
  type: "local"
  /**
   * Command and arguments to run the MCP server
   */
  command: Array<string>
  cwd?: string
  environment?: {
    [key: string]: string
  }
  enabled?: boolean
  timeout?: number
}
export type McpOAuthConfig = {
  clientId?: string
  clientSecret?: string
  scope?: string
  callbackPort?: number
  redirectUri?: string
}
export type McpRemoteConfig = {
  /**
   * Type of MCP server connection
   */
  type: "remote"
  /**
   * URL of the remote MCP server
   */
  url: string
  enabled?: boolean
  headers?: {
    [key: string]: string
  }
  /**
   * OAuth authentication configuration for the MCP server. Set to false to disable OAuth auto-detection.
   */
  oauth?: McpOAuthConfig | false
  timeout?: number
}

/**
 * @deprecated Always uses stretch layout.
 */
export type McpResource = {
  server: string
  name: string
  uri: string
  description?: string
  mimeType?: string
}
export type McpResourceCatalog = {
  resources: Array<McpResource>
  templates: Array<McpResourceTemplate>
}
export type McpResourceCatalogInput = {
  readonly location?: {
    readonly location?:
      | {
          readonly directory?: string | undefined
          readonly workspace?: string | undefined
        }
      | undefined
  }["location"]
}
export type McpResourceCatalogOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: McpResourceCatalog
}
export type McpResourceTemplate = {
  server: string
  name: string
  uriTemplate: string
  description?: string
  mimeType?: string
}
export type McpServer = {
  name: string
  status:
    | McpStatusConnected
    | McpStatusPending
    | McpStatusDisabled
    | McpStatusFailed
    | McpStatusNeedsAuth
    | McpStatusNeedsClientRegistration
  integrationID?: string
}
export type McpStatusConnected = {
  status: "connected"
}
export type McpStatusDisabled = {
  status: "disabled"
}
export type McpStatusFailed = {
  status: "failed"
  error: string
}
export type McpStatusNeedsAuth = {
  status: "needs_auth"
}
export type McpStatusNeedsClientRegistration = {
  status: "needs_client_registration"
  error: string
}
export type McpStatusPending = {
  status: "pending"
}
