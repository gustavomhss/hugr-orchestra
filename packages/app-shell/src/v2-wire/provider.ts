import type {
  JsonValue,
} from "./misc"

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
export type ModelCapabilities = {
  tools: boolean
  input: Array<string>
  output: Array<string>
}
export type ModelCompatibility = {
  reasoningField?: ModelReasoningField
}
export type ModelCost = {
  tier?: {
    type: "context"
    size: number
  }
  input: MoneyUSDPerMillionTokens
  output: MoneyUSDPerMillionTokens
  cache: {
    read: MoneyUSDPerMillionTokens
    write: MoneyUSDPerMillionTokens
  }
}
export type ModelDefaultOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: ModelInfo | null
}
export type ModelInfo = {
  id: string
  modelID: string
  providerID: string
  family?: string
  name: string
  compatibility?: ModelCompatibility
  package?: string
  settings?: {
    [x: string]: JsonValue
  }
  headers?: {
    [x: string]: string
  }
  body?: {
    [x: string]: JsonValue
  }
  capabilities: ModelCapabilities
  variants: Array<ModelVariant>
  time: {
    released: number
  }
  cost: Array<ModelCost>
  status: "alpha" | "beta" | "deprecated" | "active"
  enabled: boolean
  limit: {
    context: number
    input?: number
    output: number
  }
}
export type ModelListOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: Array<ModelInfo>
}
export type ModelReasoningField = "reasoning" | "reasoning_content" | "reasoning_text" | (string & {})
export type ModelRef = {
  id: string
  providerID: string
  variant?: string
}
export type ModelVariant = {
  id: string
  settings?: {
    [x: string]: JsonValue
  }
  headers?: {
    [x: string]: string
  }
  body?: {
    [x: string]: JsonValue
  }
}
export type MoneyUSDPerMillionTokens = number
export type OAuth = {
  type: "oauth"
  refresh: string
  access: string
  expires: number
  accountId?: string
  enterpriseUrl?: string
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
export type ProviderAuthMethod = {
  type: "oauth" | "api"
  label: string
  prompts?: Array<
    | {
        type: "text"
        key: string
        message: string
        placeholder?: string
        when?: {
          key: string
          op: "eq" | "neq"
          value: string
        }
      }
    | {
        type: "select"
        key: string
        message: string
        options: Array<{
          label: string
          value: string
          hint?: string
        }>
        when?: {
          key: string
          op: "eq" | "neq"
          value: string
        }
      }
  >
}
export type ProviderAuthResponse = ProviderAuthResponses[keyof ProviderAuthResponses]
export type ProviderAuthResponses = {
  /**
   * Provider auth methods
   */
  200: {
    [key: string]: Array<ProviderAuthMethod>
  }
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
export type ProviderListOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: Array<ProviderV2Info>
}
export type ProviderListResponse = ProviderListResponses[keyof ProviderListResponses]
export type ProviderListResponses = {
  /**
   * List of providers
   */
  200: {
    all: Array<Provider>
    default: {
      [key: string]: string
    }
    connected: Array<string>
  }
}
export type ProviderRequest = {
  settings: ProviderSettings
  headers: {
    [x: string]: string
  }
  body: {
    [x: string]: JsonValue
  }
}
export type ProviderSettings = {
  [x: string]: JsonValue
}
export type ProviderV2Info = {
  id: string
  integrationID?: string
  name: string
  disabled?: boolean
  package: string
  settings?: {
    [x: string]: JsonValue
  }
  headers?: {
    [x: string]: string
  }
  body?: {
    [x: string]: JsonValue
  }
}
