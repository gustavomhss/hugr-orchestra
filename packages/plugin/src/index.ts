import type { Config as SDKConfig } from "./wire.js"
import { type ToolDefinition } from "./tool.js"

export * from "./tool.js"

export type PluginOptions = Record<string, unknown>

export type Config = Omit<SDKConfig, "plugin"> & {
  plugin?: Array<string | [string, PluginOptions]>
}

/** The server hooks a host invokes. Today that is only `tool`, which the product host registers as core Tools. */
export interface Hooks {
  tool?: {
    [key: string]: ToolDefinition
  }
}
