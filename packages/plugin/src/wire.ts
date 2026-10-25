// Provider, model, auth and config wire types the plugin contract names. They are frozen here so this
// package does not depend on a generated SDK; replace each with its schema type when one exists.

export type OAuth = {
  type: "oauth"
  refresh: string
  access: string
  expires: number
  accountId?: string
  enterpriseUrl?: string
}

export type ApiAuth = {
  type: "api"
  key: string
  metadata?: {
    [key: string]: string
  }
}

export type WellKnownAuth = {
  type: "wellknown"
  key: string
  token: string
}

export type Auth = OAuth | ApiAuth | WellKnownAuth

/**
 * Log level
 */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

/**
 * Server configuration for orchestra serve and web commands
 */
export type ServerConfig = {
  port?: number
  hostname?: string
  mdns?: boolean
  mdnsDomain?: string
  cors?: Array<string>
}

export type PermissionActionConfig = "ask" | "allow" | "deny"

export type PermissionObjectConfig = {
  [key: string]: PermissionActionConfig
}

export type PermissionRuleConfig = PermissionActionConfig | PermissionObjectConfig

export type PermissionConfig =
  | PermissionActionConfig
  | {
      read?: PermissionRuleConfig
      edit?: PermissionRuleConfig
      glob?: PermissionRuleConfig
      grep?: PermissionRuleConfig
      list?: PermissionRuleConfig
      bash?: PermissionRuleConfig
      task?: PermissionRuleConfig
      external_directory?: PermissionRuleConfig
      todowrite?: PermissionActionConfig
      question?: PermissionActionConfig
      webfetch?: PermissionActionConfig
      websearch?: PermissionActionConfig
      lsp?: PermissionRuleConfig
      doom_loop?: PermissionActionConfig
      skill?: PermissionRuleConfig
      [key: string]: PermissionRuleConfig | PermissionActionConfig | undefined
    }

export type AgentConfig = {
  model?: string
  variant?: string
  temperature?: number
  top_p?: number
  prompt?: string
  tools?: {
    [key: string]: boolean
  }
  disable?: boolean
  description?: string
  mode?: "subagent" | "primary" | "all"
  hidden?: boolean
  options?: {
    [key: string]: unknown
  }
  /**
   * Hex color code (e.g., #FF5733) or theme color (e.g., primary)
   */
  color?: string | "primary" | "secondary" | "accent" | "success" | "warning" | "error" | "info"
  steps?: number
  maxSteps?: number
  permission?: PermissionConfig
  engine?: "orchestra" | "claude-code"
  [key: string]:
    | unknown
    | string
    | number
    | {
        [key: string]: boolean
      }
    | boolean
    | "subagent"
    | "primary"
    | "all"
    | {
        [key: string]: unknown
      }
    | string
    | "primary"
    | "secondary"
    | "accent"
    | "success"
    | "warning"
    | "error"
    | "info"
    | number
    | PermissionConfig
    | "orchestra"
    | "claude-code"
    | undefined
}

export type ProviderConfig = {
  api?: string
  name?: string
  env?: Array<string>
  id?: string
  npm?: string
  whitelist?: Array<string>
  blacklist?: Array<string>
  options?: {
    apiKey?: string
    baseURL?: string
    enterpriseUrl?: string
    setCacheKey?: boolean
    /**
     * Timeout in milliseconds for full requests to this provider. Set to false to disable timeout.
     */
    timeout?: number | false
    /**
     * Timeout in milliseconds to wait for response headers (default: 300000). Set to false to disable timeout.
     */
    headerTimeout?: number | false
    /**
     * Timeout in milliseconds between streamed SSE chunks for this provider (default: 300000). If no chunk arrives within this window, the request is aborted. Set to false to disable timeout.
     */
    chunkTimeout?: number | false
    [key: string]: unknown | string | boolean | number | false | number | false | number | false | undefined
  }
  models?: {
    [key: string]: {
      id?: string
      name?: string
      family?: string
      release_date?: string
      attachment?: boolean
      reasoning?: boolean
      temperature?: boolean
      tool_call?: boolean
      interleaved?:
        | boolean
        | "reasoning"
        | "reasoning_content"
        | "reasoning_text"
        | string
        | {
            field: "reasoning" | "reasoning_content" | "reasoning_text" | string
          }
      cost?: {
        input: number
        output: number
        cache_read?: number
        cache_write?: number
        context_over_200k?: {
          input: number
          output: number
          cache_read?: number
          cache_write?: number
        }
      }
      limit?: {
        context: number
        input?: number
        output: number
      }
      modalities?: {
        input?: Array<"text" | "audio" | "image" | "video" | "pdf">
        output?: Array<"text" | "audio" | "image" | "video" | "pdf">
      }
      experimental?: boolean
      status?: "alpha" | "beta" | "deprecated" | "active"
      provider?: {
        npm?: string
        api?: string
      }
      options?: {
        [key: string]: unknown
      }
      headers?: {
        [key: string]: string
      }
      /**
       * Variant-specific configuration
       */
      variants?: {
        [key: string]: {
          disabled?: boolean
          [key: string]: unknown | boolean | undefined
        }
      }
    }
  }
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
export type LayoutConfig = "auto" | "stretch"

export type ImageAttachmentConfig = {
  auto_resize?: boolean
  max_width?: number
  max_height?: number
  max_base64_bytes?: number
}

export type AttachmentConfig = {
  image?: ImageAttachmentConfig
}

export type Config = {
  $schema?: string
  shell?: string
  logLevel?: LogLevel
  server?: ServerConfig
  command?: {
    [key: string]: {
      template: string
      description?: string
      agent?: string
      model?: string
      variant?: string
      subtask?: boolean
    }
  }
  skills?: {
    paths?: Array<string>
    urls?: Array<string>
  }
  maestro?: ConfigMaestro
  references?: {
    [key: string]: string | ConfigV2ReferenceGit | ConfigV2ReferenceLocal
  }
  reference?: {
    [key: string]: string | ConfigV2ReferenceGit | ConfigV2ReferenceLocal
  }
  watcher?: {
    ignore?: Array<string>
  }
  snapshot?: boolean
  plugin?: Array<
    | string
    | [
        string,
        {
          [key: string]: unknown
        },
      ]
  >
  /**
   * Automatically update to the latest version. Set to true to auto-update, false to disable, or 'notify' to show update notifications
   */
  autoupdate?: boolean | "notify"
  disabled_providers?: Array<string>
  enabled_providers?: Array<string>
  model?: string
  small_model?: string
  default_agent?: string
  subagent_depth?: number
  username?: string
  mode?: {
    [key: string]: AgentConfig
  }
  agent?: {
    maestro?: AgentConfig
    general?: AgentConfig
    explore?: AgentConfig
    title?: AgentConfig
    summary?: AgentConfig
    compaction?: AgentConfig
    [key: string]: AgentConfig | undefined
  }
  provider?: {
    [key: string]: ProviderConfig
  }
  mcp?: {
    [key: string]:
      | McpLocalConfig
      | McpRemoteConfig
      | {
          enabled: boolean
        }
  }
  /**
   * Enable or configure formatters. Omit or set to false to disable, true to enable built-ins, or an object to enable built-ins with overrides.
   */
  formatter?:
    | boolean
    | {
        [key: string]: {
          disabled?: boolean
          command?: Array<string>
          environment?: {
            [key: string]: string
          }
          extensions?: Array<string>
        }
      }
  /**
   * Enable or configure LSP servers. Omit or set to false to disable, true to enable built-ins, or an object to enable built-ins with overrides.
   */
  lsp?:
    | boolean
    | {
        [key: string]:
          | {
              disabled: true
            }
          | {
              command: Array<string>
              extensions?: Array<string>
              disabled?: boolean
              env?: {
                [key: string]: string
              }
              initialization?: {
                [key: string]: unknown
              }
            }
      }
  instructions?: Array<string>
  layout?: LayoutConfig
  permission?: PermissionConfig
  tools?: {
    [key: string]: boolean
  }
  attachment?: AttachmentConfig
  tool_output?: {
    max_lines?: number
    max_bytes?: number
    lean?: {
      enabled?: boolean
    }
  }
  research?: {
    limits?: {
      indexer_bytes?: number
      probe_bytes?: number
      scratch_bytes?: number
      index_bytes?: number
    }
  }
  compaction?: {
    auto?: boolean
    prune?: boolean
    tail_turns?: number
    preserve_recent_tokens?: number
    reserved?: number
  }
  continuity?: {
    enabled?: boolean
    trigger?: number
  }
  relay?: ConfigV2Relay
  experimental?: {
    disable_paste_summary?: boolean
    batch_tool?: boolean
    openTelemetry?: boolean
    primary_tools?: Array<string>
    continue_loop_on_deny?: boolean
    mcp_timeout?: number
    policies?: Array<ConfigV2ExperimentalPolicy>
  }
}

export type Model = {
  id: string
  providerID: string
  api: {
    id: string
    url: string
    npm: string
  }
  name: string
  family?: string
  capabilities: {
    temperature: boolean
    reasoning: boolean
    attachment: boolean
    toolcall: boolean
    input: {
      text: boolean
      audio: boolean
      image: boolean
      video: boolean
      pdf: boolean
    }
    output: {
      text: boolean
      audio: boolean
      image: boolean
      video: boolean
      pdf: boolean
    }
    interleaved:
      | boolean
      | {
          field: "reasoning" | "reasoning_content" | "reasoning_text" | string
        }
  }
  cost: {
    input: number
    output: number
    cache: {
      read: number
      write: number
    }
    tiers?: Array<{
      input: number
      output: number
      cache: {
        read: number
        write: number
      }
      tier: {
        type: "context"
        size: number
      }
    }>
    experimentalOver200K?: {
      input: number
      output: number
      cache: {
        read: number
        write: number
      }
    }
  }
  limit: {
    context: number
    input?: number
    output: number
  }
  status: "alpha" | "beta" | "deprecated" | "active"
  options: {
    [key: string]: unknown
  }
  headers: {
    [key: string]: string
  }
  release_date: string
  variants?: {
    [key: string]: {
      [key: string]: unknown
    }
  }
}

export type Provider = {
  id: string
  name: string
  source: "env" | "config" | "custom" | "api"
  env: Array<string>
  key?: string
  options: {
    [key: string]: unknown
  }
  models: {
    [key: string]: Model
  }
}

export type ConfigMaestro = {
  atlas?: {
    projectID: string
    directory: string
    sourceDirectory?: string
  }
}

export type ConfigV2ReferenceGit = {
  repository: string
  branch?: string
  description?: string
  hidden?: boolean
}

export type ConfigV2ReferenceLocal = {
  path: string
  description?: string
  hidden?: boolean
}

export type ConfigV2RelayJudge = {
  backend?: "stub" | "api"
  model?: string
  baseURL?: string
  apiKey?: string
  votes?: number
  maxContext?: number
  maxTokens?: number
}

export type ConfigV2Relay = {
  judge?: ConfigV2RelayJudge
}

export type PolicyEffect = "allow" | "deny"

export type ConfigV2ExperimentalPolicy = {
  action: "provider.use"
  effect: PolicyEffect
  resource: string
}
