import { Agent } from "@orchestra/schema/agent"
import { AgentFile } from "@orchestra/schema/agent-file"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { ConflictError, InvalidRequestError, UnknownError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

const AgentDetail = Schema.Struct({
  tools: Schema.Array(Schema.Struct({ name: Schema.String, description: Schema.String })),
  skills: Schema.Array(
    Schema.Struct({ name: Schema.String, description: Schema.String.pipe(Schema.optional), location: Schema.String }),
  ),
  /** The pinned command-line engines of the agent's toolkit, with their install state on this machine. */
  engines: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      version: Schema.String,
      license: Schema.String,
      upstream: Schema.String,
      role: Schema.Literals(["generator", "check", "indexer", "oracle"]),
      input: Schema.String,
      status: Schema.Literals(["absent", "fetching", "ready", "failed", "unsupported"]),
    }),
  ),
}).annotate({ identifier: "AgentV2.Detail" })

export const AgentGroup = HttpApiGroup.make("server.agent")
  .add(
    HttpApiEndpoint.get("agent.list", "/api/agent", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Agent.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.agent.list",
          summary: "List agents",
          description: "Retrieve currently registered agents.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("agent.detail", "/api/agent/:agentID/detail", {
      params: { agentID: Schema.String },
      query: LocationQuery,
      success: Location.response(AgentDetail),
      error: [InvalidRequestError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.agent.detail",
          summary: "Get agent detail",
          description:
            "List the tools this agent's permissions advertise to the model and the catalog skills it may load. Skills packaged with the agent are on `Agent.Info.skills`.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("agent.file.get", "/api/agent/:agentID/file", {
      params: { agentID: Schema.String },
      query: LocationQuery,
      success: Location.response(AgentFile.Info),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.agent.file.get",
          summary: "Get agent file",
          description: "Read the agent definition stored in this location's .orchestra/agent directory.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.put("agent.file.update", "/api/agent/:agentID/file", {
      params: { agentID: Schema.String },
      query: LocationQuery,
      payload: AgentFile.Input,
      success: Location.response(AgentFile.Info),
      error: [InvalidRequestError, ConflictError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.agent.file.update",
          summary: "Update agent file",
          description:
            "Write the agent definition to this location's .orchestra/agent directory and reload the registered agents. Fails with 409 when `revision` no longer matches the file.",
        }),
      ),
  )
