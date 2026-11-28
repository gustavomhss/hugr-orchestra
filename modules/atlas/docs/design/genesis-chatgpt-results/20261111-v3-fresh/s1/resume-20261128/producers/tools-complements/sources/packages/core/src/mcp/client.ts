export * as McpClient from "./client"

import { pathToFileURL } from "node:url"
import { Client, type ClientOptions } from "@modelcontextprotocol/sdk/client/index.js"
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { InstallationVersion } from "../installation/version"

const CLIENT_OPTIONS = {
  capabilities: {
    // Sampling, elicitation and tasks stay off until Orchestra handles those requests.
    roots: {},
  },
} satisfies ClientOptions

/** An MCP client that offers the project directory as its only root. */
export function createClient(directory: string) {
  const client = new Client({ name: "orchestra", version: InstallationVersion }, CLIENT_OPTIONS)
  client.setRequestHandler(ListRootsRequestSchema, () =>
    Promise.resolve({ roots: [{ uri: pathToFileURL(directory).href }] }),
  )
  return client
}
