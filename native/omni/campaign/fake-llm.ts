// The fake LLM a scenario's Orchestra talks to, and its provider block (re-exported by lib.ts).

import { createServer, type IncomingMessage, type ServerResponse } from "node:http"

/** The provider block for the fake LLM (the shape of apps/orchestra/test/lib/test-provider.ts). */
export function provider(url: string) {
  return {
    test: {
      name: "Test",
      id: "test",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 100_000, output: 10_000 },
          cost: { input: 0, output: 0 },
          options: {},
        },
      },
      options: { apiKey: "test-key", baseURL: url },
    },
  }
}

export type ToolCall = { name: string; args: Record<string, unknown> }

/**
 * A minimal OpenAI-compatible chat-completions server. The first request offering all requested tools gets them
 * as parallel tool calls; every other request (tool results, titles) gets a short text answer.
 */
export async function fakeLLM(calls: ToolCall[]) {
  const seen: string[] = []
  const offered: string[][] = []
  let issued = false
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    let body = ""
    request.on("data", (chunk) => (body += chunk))
    request.on("end", () => {
      const parsed = (() => {
        try {
          return JSON.parse(body) as { tools?: { function: { name: string } }[]; messages?: { role: string }[] }
        } catch {
          return {}
        }
      })()
      const names = (parsed.tools ?? []).map((tool) => tool.function.name)
      if (names.length > 0) offered.push(names)
      const available = calls.filter((call) => names.includes(call.name))
      const withTools = !issued && calls.length > 0 && available.length === calls.length
      seen.push(withTools ? "tools" : "text")
      if (withTools) issued = true
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" })
      const send = (delta: Record<string, unknown>, finish?: string) =>
        response.write(
          `data: ${JSON.stringify({
            id: "chatcmpl-campaign",
            object: "chat.completion.chunk",
            choices: [{ index: 0, delta, ...(finish ? { finish_reason: finish } : {}) }],
          })}\n\n`,
        )
      send({ role: "assistant" })
      if (withTools)
        available.forEach((call, index) =>
          send({
            tool_calls: [
              {
                index,
                id: `call_${index}`,
                type: "function",
                function: { name: call.name, arguments: JSON.stringify(call.args) },
              },
            ],
          }),
        )
      else send({ content: "done" })
      send({}, withTools ? "tool_calls" : "stop")
      response.end("data: [DONE]\n\n")
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address() as { port: number }
  return { url: `http://127.0.0.1:${address.port}/v1`, seen, offered, stop: () => server.close() }
}
