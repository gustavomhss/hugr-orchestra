import type {
  ImageAttachmentConfig,
  LayoutConfig,
  LogLevel,
} from "./misc"

import type {
  McpLocalConfig,
  McpRemoteConfig,
} from "./mcp"

import type {
  ModelRef,
  ProviderConfig,
  ProviderRequest,
} from "./provider"

import type {
  PermissionConfig,
  PermissionRuleset,
  PermissionV2Ruleset,
  PolicyEffect,
} from "./permission"

import type {
  ServerConfig,
} from "./relay"

export type Agent = {
  id?: string
  name: string
  description?: string
  mode: "subagent" | "primary" | "all"
  native?: boolean
  hidden?: boolean
  topP?: number
  temperature?: number
  color?: string
  avatar?: string
  permission: PermissionRuleset
  model?: {
    modelID: string
    providerID: string
  }
  variant?: string
  prompt?: string
  options: {
    [key: string]: unknown
  }
  steps?: number
  engine?: "orchestra" | "claude-code"
  /** The skill tree packaged with the agent itself, depth first; a child names its `parent`. */
  skills?: readonly {
    name: string
    description?: string
    when?: string
    parent?: string
  }[]
  toolkit?: "backend" | "research"
}
export type AgentColor = string
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
export type AgentInfo = {
  id: string
  name: string
  model?: ModelRef
  request: ProviderRequest
  system?: string
  description?: string
  mode: "subagent" | "primary" | "all"
  hidden: boolean
  color?: AgentColor
  avatar?: string
  steps?: number
  permissions: PermissionV2Ruleset
  skills?: Agent["skills"]
}
export type AgentListInput = {
  readonly location?: {
    readonly location?:
      | {
          readonly directory?: string | undefined
          readonly workspace?: string | undefined
        }
      | undefined
  }["location"]
}
export type AgentListOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: Array<AgentInfo>
}
export type AtlasKnowledgeAnchor = {
  reference: AtlasKnowledgeReference
  projectID: string
  authorSessionID: unknown
  assistantMessageID: unknown
  callID: unknown
  memberID: "archie"
  target: AtlasKnowledgeTarget
  units: unknown & unknown
}
export type AtlasKnowledgeReference = unknown & unknown & unknown
export type AtlasKnowledgeTarget = {
  kind: "assignment" | "work-package"
  id: AtlasKnowledgeUnitId
}
export type AtlasKnowledgeUnitId = unknown & unknown & unknown
export type AttachmentConfig = {
  image?: ImageAttachmentConfig
}
export type Command = {
  name: string
  description?: string
  agent?: string
  model?: string
  source?: "command" | "mcp" | "skill"
  template: string
  subtask?: boolean
  hints: Array<string>
}
export type CommandInfo = {
  name: string
  template: string
  description?: string
  agent?: string
  model?: ModelRef
  subtask?: boolean
}
export type CommandListInput = {
  readonly location?: {
    readonly location?:
      | {
          readonly directory?: string | undefined
          readonly workspace?: string | undefined
        }
      | undefined
  }["location"]
}
export type CommandListOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: Array<CommandInfo>
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
export type ConfigMaestro = {
  atlas?: {
    projectID: string
    directory: string
    sourceDirectory?: string
  }
}
export type ConfigV2ExperimentalPolicy = {
  action: "provider.use"
  effect: PolicyEffect
  resource: string
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
export type ConfigV2Relay = {
  judge?: ConfigV2RelayJudge
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
