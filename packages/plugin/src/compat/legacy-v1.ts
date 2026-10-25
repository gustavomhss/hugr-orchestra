// Frozen copy of the legacy V1 wire types (packages/sdk/js/src/gen/types.gen.ts) that the server plugin contract
// still names, so this package does not depend on the legacy SDK. Do not regenerate; replace with schema types.

export type Permission = {
  id: string
  type: string
  pattern?: string | Array<string>
  sessionID: string
  messageID: string
  callID?: string
  title: string
  metadata: {
    [key: string]: unknown
  }
  time: {
    created: number
  }
}

export type Project = {
  id: string
  worktree: string
  vcsDir?: string
  vcs?: "git"
  time: {
    created: number
    initialized?: number
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
  }
  cost: {
    input: number
    output: number
    cache: {
      read: number
      write: number
    }
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
    output: number
  }
  status: "alpha" | "beta" | "deprecated" | "active"
  options: {
    [key: string]: unknown
  }
  headers: {
    [key: string]: string
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

/**
 * Custom keybind configurations
 */
export type KeybindsConfig = {
  /**
   * Leader key for keybind combinations
   */
  leader?: string
  /**
   * Exit the application
   */
  app_exit?: string
  /**
   * Open external editor
   */
  editor_open?: string
  /**
   * List available themes
   */
  theme_list?: string
  /**
   * Toggle sidebar
   */
  sidebar_toggle?: string
  /**
   * Toggle session scrollbar
   */
  scrollbar_toggle?: string
  /**
   * Toggle username visibility
   */
  username_toggle?: string
  /**
   * View status
   */
  status_view?: string
  /**
   * Export session to editor
   */
  session_export?: string
  /**
   * Create a new session
   */
  session_new?: string
  /**
   * List all sessions
   */
  session_list?: string
  /**
   * Show session timeline
   */
  session_timeline?: string
  /**
   * Share current session
   */
  session_share?: string
  /**
   * Unshare current session
   */
  session_unshare?: string
  /**
   * Interrupt current session
   */
  session_interrupt?: string
  /**
   * Compact the session
   */
  session_compact?: string
  /**
   * Scroll messages up by one page
   */
  messages_page_up?: string
  /**
   * Scroll messages down by one page
   */
  messages_page_down?: string
  /**
   * Scroll messages up by one line
   */
  messages_line_up?: string
  /**
   * Scroll messages down by one line
   */
  messages_line_down?: string
  /**
   * Scroll messages up by half page
   */
  messages_half_page_up?: string
  /**
   * Scroll messages down by half page
   */
  messages_half_page_down?: string
  /**
   * Navigate to first message
   */
  messages_first?: string
  /**
   * Navigate to last message
   */
  messages_last?: string
  /**
   * Navigate to next message
   */
  messages_next?: string
  /**
   * Navigate to previous message
   */
  messages_previous?: string
  /**
   * Navigate to last user message
   */
  messages_last_user?: string
  /**
   * Copy message
   */
  messages_copy?: string
  /**
   * Undo message
   */
  messages_undo?: string
  /**
   * Redo message
   */
  messages_redo?: string
  /**
   * Toggle code block concealment in messages
   */
  messages_toggle_conceal?: string
  /**
   * Toggle tool details visibility
   */
  tool_details?: string
  /**
   * List available models
   */
  model_list?: string
  /**
   * Next recently used model
   */
  model_cycle_recent?: string
  /**
   * Previous recently used model
   */
  model_cycle_recent_reverse?: string
  /**
   * List available commands
   */
  command_list?: string
  /**
   * List agents
   */
  agent_list?: string
  /**
   * Next agent
   */
  agent_cycle?: string
  /**
   * Previous agent
   */
  agent_cycle_reverse?: string
  /**
   * Clear input field
   */
  input_clear?: string
  /**
   * Forward delete
   */
  input_forward_delete?: string
  /**
   * Paste from clipboard
   */
  input_paste?: string
  /**
   * Submit input
   */
  input_submit?: string
  /**
   * Insert newline in input
   */
  input_newline?: string
  /**
   * Previous history item
   */
  history_previous?: string
  /**
   * Next history item
   */
  history_next?: string
  /**
   * Next child session
   */
  session_child_cycle?: string
  /**
   * Previous child session
   */
  session_child_cycle_reverse?: string
  /**
   * Suspend terminal
   */
  terminal_suspend?: string
  /**
   * Toggle terminal title
   */
  terminal_title_toggle?: string
}

export type AgentConfig = {
  model?: string
  temperature?: number
  top_p?: number
  prompt?: string
  tools?: {
    [key: string]: boolean
  }
  disable?: boolean
  /**
   * Description of when to use the agent
   */
  description?: string
  mode?: "subagent" | "primary" | "all"
  /**
   * Hex color code for the agent (e.g., #FF5733)
   */
  color?: string
  /**
   * Maximum number of agentic iterations before forcing text-only response
   */
  maxSteps?: number
  permission?: {
    edit?: "ask" | "allow" | "deny"
    bash?:
      | ("ask" | "allow" | "deny")
      | {
          [key: string]: "ask" | "allow" | "deny"
        }
    webfetch?: "ask" | "allow" | "deny"
    doom_loop?: "ask" | "allow" | "deny"
    external_directory?: "ask" | "allow" | "deny"
  }
  [key: string]:
    | unknown
    | string
    | number
    | {
        [key: string]: boolean
      }
    | boolean
    | ("subagent" | "primary" | "all")
    | number
    | {
        edit?: "ask" | "allow" | "deny"
        bash?:
          | ("ask" | "allow" | "deny")
          | {
              [key: string]: "ask" | "allow" | "deny"
            }
        webfetch?: "ask" | "allow" | "deny"
        doom_loop?: "ask" | "allow" | "deny"
        external_directory?: "ask" | "allow" | "deny"
      }
    | undefined
}

export type ProviderConfig = {
  api?: string
  name?: string
  env?: Array<string>
  id?: string
  npm?: string
  models?: {
    [key: string]: {
      id?: string
      name?: string
      release_date?: string
      attachment?: boolean
      reasoning?: boolean
      temperature?: boolean
      tool_call?: boolean
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
        output: number
      }
      modalities?: {
        input: Array<"text" | "audio" | "image" | "video" | "pdf">
        output: Array<"text" | "audio" | "image" | "video" | "pdf">
      }
      experimental?: boolean
      status?: "alpha" | "beta" | "deprecated" | "active"
      options?: {
        [key: string]: unknown
      }
      headers?: {
        [key: string]: string
      }
      provider?: {
        npm: string
      }
    }
  }
  whitelist?: Array<string>
  blacklist?: Array<string>
  options?: {
    apiKey?: string
    baseURL?: string
    /**
     * GitHub Enterprise URL for copilot authentication
     */
    enterpriseUrl?: string
    /**
     * Enable promptCacheKey for this provider (default false)
     */
    setCacheKey?: boolean
    /**
     * Timeout in milliseconds for requests to this provider. Default is 300000 (5 minutes). Set to false to disable timeout.
     */
    timeout?: number | false
    [key: string]: unknown | string | boolean | (number | false) | undefined
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
  /**
   * Environment variables to set when running the MCP server
   */
  environment?: {
    [key: string]: string
  }
  /**
   * Enable or disable the MCP server on startup
   */
  enabled?: boolean
  /**
   * Timeout in ms for fetching tools from the MCP server. Defaults to 5000 (5 seconds) if not specified.
   */
  timeout?: number
}

export type McpOAuthConfig = {
  /**
   * OAuth client ID. If not provided, dynamic client registration (RFC 7591) will be attempted.
   */
  clientId?: string
  /**
   * OAuth client secret (if required by the authorization server)
   */
  clientSecret?: string
  /**
   * OAuth scopes to request during authorization
   */
  scope?: string
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
  /**
   * Enable or disable the MCP server on startup
   */
  enabled?: boolean
  /**
   * Headers to send with the request
   */
  headers?: {
    [key: string]: string
  }
  /**
   * OAuth authentication configuration for the MCP server. Set to false to disable OAuth auto-detection.
   */
  oauth?: McpOAuthConfig | false
  /**
   * Timeout in ms for fetching tools from the MCP server. Defaults to 5000 (5 seconds) if not specified.
   */
  timeout?: number
}

/**
 * @deprecated Always uses stretch layout.
 */
export type LayoutConfig = "auto" | "stretch"

export type Config = {
  /**
   * JSON schema reference for configuration validation
   */
  $schema?: string
  /**
   * Theme name to use for the interface
   */
  theme?: string
  keybinds?: KeybindsConfig
  /**
   * Log level
   */
  logLevel?: "DEBUG" | "INFO" | "WARN" | "ERROR"
  /**
   * TUI specific settings
   */
  tui?: {
    /**
     * TUI scroll speed
     */
    scroll_speed?: number
    /**
     * Scroll acceleration settings
     */
    scroll_acceleration?: {
      /**
       * Enable scroll acceleration
       */
      enabled: boolean
    }
    /**
     * Control diff rendering style: 'auto' adapts to terminal width, 'stacked' always shows single column
     */
    diff_style?: "auto" | "stacked"
  }
  /**
   * Command configuration
   */
  command?: {
    [key: string]: {
      template: string
      description?: string
      agent?: string
      model?: string
      subtask?: boolean
    }
  }
  watcher?: {
    ignore?: Array<string>
  }
  plugin?: Array<string>
  snapshot?: boolean
  /**
   * Control sharing behavior:'manual' allows manual sharing via commands, 'auto' enables automatic sharing, 'disabled' disables all sharing
   */
  share?: "manual" | "auto" | "disabled"
  /**
   * @deprecated Use 'share' field instead. Share newly created sessions automatically
   */
  autoshare?: boolean
  /**
   * Automatically update to the latest version. Set to true to auto-update, false to disable, or 'notify' to show update notifications
   */
  autoupdate?: boolean | "notify"
  /**
   * Disable providers that are loaded automatically
   */
  disabled_providers?: Array<string>
  /**
   * When set, ONLY these providers will be enabled. All other providers will be ignored
   */
  enabled_providers?: Array<string>
  /**
   * Model to use in the format of provider/model, eg anthropic/claude-2
   */
  model?: string
  /**
   * Small model to use for tasks like title generation in the format of provider/model
   */
  small_model?: string
  /**
   * Custom username to display in conversations instead of system username
   */
  username?: string
  /**
   * @deprecated Use `agent` field instead.
   */
  mode?: {
    build?: AgentConfig
    plan?: AgentConfig
    [key: string]: AgentConfig | undefined
  }
  /**
   * Agent configuration
   */
  agent?: {
    plan?: AgentConfig
    build?: AgentConfig
    general?: AgentConfig
    explore?: AgentConfig
    [key: string]: AgentConfig | undefined
  }
  /**
   * Custom provider configurations and model overrides
   */
  provider?: {
    [key: string]: ProviderConfig
  }
  /**
   * MCP (Model Context Protocol) server configurations
   */
  mcp?: {
    [key: string]: McpLocalConfig | McpRemoteConfig
  }
  formatter?:
    | false
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
  lsp?:
    | false
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
  /**
   * Additional instruction files or patterns to include
   */
  instructions?: Array<string>
  layout?: LayoutConfig
  permission?: {
    edit?: "ask" | "allow" | "deny"
    bash?:
      | ("ask" | "allow" | "deny")
      | {
          [key: string]: "ask" | "allow" | "deny"
        }
    webfetch?: "ask" | "allow" | "deny"
    doom_loop?: "ask" | "allow" | "deny"
    external_directory?: "ask" | "allow" | "deny"
  }
  tools?: {
    [key: string]: boolean
  }
  enterprise?: {
    /**
     * Enterprise URL
     */
    url?: string
  }
  experimental?: {
    hook?: {
      file_edited?: {
        [key: string]: Array<{
          command: Array<string>
          environment?: {
            [key: string]: string
          }
        }>
      }
      session_completed?: Array<{
        command: Array<string>
        environment?: {
          [key: string]: string
        }
      }>
    }
    /**
     * Number of retries for chat completions on failure
     */
    chatMaxRetries?: number
    disable_paste_summary?: boolean
    /**
     * Enable the batch tool
     */
    batch_tool?: boolean
    /**
     * Enable OpenTelemetry spans for AI SDK calls (using the 'experimental_telemetry' flag)
     */
    openTelemetry?: boolean
    /**
     * Tools that should only be available to primary agents.
     */
    primary_tools?: Array<string>
  }
}
