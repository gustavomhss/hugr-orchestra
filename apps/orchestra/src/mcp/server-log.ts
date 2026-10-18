import type { LoggingMessageNotification } from "@modelcontextprotocol/sdk/types.js"
import { Effect } from "effect"

export function serverLog(name: string, params: LoggingMessageNotification["params"]) {
  const fields = { server: name, logger: params.logger, level: params.level, data: params.data }
  switch (params.level) {
    case "debug":
      return Effect.logDebug("MCP server log", fields)
    case "info":
    case "notice":
      return Effect.logInfo("MCP server log", fields)
    case "warning":
      return Effect.logWarning("MCP server log", fields)
    case "error":
    case "critical":
    case "alert":
    case "emergency":
      return Effect.logError("MCP server log", fields)
  }
}
