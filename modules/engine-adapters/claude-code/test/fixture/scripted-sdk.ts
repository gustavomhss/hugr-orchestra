export * as ScriptedSDK from "./scripted-sdk"

import type { Options, Query, SDKMessage, SDKResultSuccess, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"

export type { Options }

const done: SDKResultSuccess = {
  type: "result", subtype: "success", is_error: false, session_id: "eligibility-sdk", result: "",
  uuid: "00000000-0000-4000-8000-000000000001", duration_ms: 0, duration_api_ms: 0,
  num_turns: 1, stop_reason: "end_turn", total_cost_usd: 0, modelUsage: {}, permission_denials: [],
  usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
    cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
    server_tool_use: { web_fetch_requests: 0, web_search_requests: 0 }, service_tier: "standard" },
}

const unexpected = async () => { throw new Error("SDK control method is not scripted by this fixture") }

// A complete Query surface, with real async-generator behavior. Unexpected control calls fail explicitly.
export function query(input: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }, calls: Options[]): Query {
  if (!input.options) throw new Error("Expected the real host's SDK options")
  calls.push(input.options)
  const messages = (async function* (): AsyncGenerator<SDKMessage, void> {
    if (typeof input.prompt !== "string") await input.prompt[Symbol.asyncIterator]().next()
    yield done
  })()
  return Object.assign(messages, {
    interrupt: unexpected,
    setPermissionMode: unexpected,
    setMcpPermissionModeOverride: unexpected,
    setModel: unexpected,
    setMaxThinkingTokens: unexpected,
    applyFlagSettings: unexpected,
    updateSettings: unexpected,
    initializationResult: unexpected,
    reinitialize: unexpected,
    supportedCommands: unexpected,
    supportedModels: unexpected,
    supportedAgents: unexpected,
    mcpServerStatus: unexpected,
    getContextUsage: unexpected,
    usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: unexpected,
    readFile: unexpected,
    reloadPlugins: unexpected,
    reloadSkills: unexpected,
    reloadOutputStyles: unexpected,
    accountInfo: unexpected,
    rewindFiles: unexpected,
    seedReadState: unexpected,
    reconnectMcpServer: unexpected,
    toggleMcpServer: unexpected,
    readMcpResource: unexpected,
    setMcpServers: unexpected,
    streamInput: unexpected,
    stopTask: unexpected,
    backgroundTasks: unexpected,
    close: () => { throw new Error("SDK close is not scripted by this fixture") },
  })
}
