import { SessionID } from "@/session/schema"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQuery,
  WorkspaceRoutingQueryFields,
} from "../middleware/workspace-routing"
import { ApiNotFoundError } from "../errors"
import { described } from "./metadata"

// Background processes a session's shell tool left running (O1(b)): listed with their live tree and output tail, and
// stopped one by one. Session removal stops them all.

const root = "/session/:sessionID/processes"

export const SessionProcessPaths = {
  list: root,
  stop: `${root}/:processID/stop`,
} as const

// Absent, not null, when omni does not know a parent or a name: the legacy SDK's OpenAPI drops nulls.
export const ProcessNode = Schema.Struct({
  pid: Schema.Int,
  parentPid: Schema.optional(Schema.Int),
  name: Schema.optional(Schema.String),
}).annotate({ identifier: "SessionProcessNode" })

export const SessionProcess = Schema.Struct({
  id: Schema.String,
  pid: Schema.Int,
  title: Schema.String,
  started: Schema.Finite,
  processes: Schema.Array(ProcessNode),
  output: Schema.String,
  written: Schema.Finite,
}).annotate({ identifier: "SessionProcess" })

export const ListQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  tail: Schema.optional(Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
})

export const SessionProcessApi = HttpApi.make("session-process")
  .add(
    HttpApiGroup.make("sessionProcess")
      .add(
        HttpApiEndpoint.get("list", SessionProcessPaths.list, {
          params: { sessionID: SessionID },
          query: ListQuery,
          success: described(Schema.Array(SessionProcess), "Running background processes"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.processes",
            summary: "List background processes",
            description:
              "List the process trees a session's shell tool left running, each with its live processes and the tail of its output.",
          }),
        ),
        HttpApiEndpoint.post("stop", SessionProcessPaths.stop, {
          params: { sessionID: SessionID, processID: Schema.String },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Process tree stopped"),
          error: ApiNotFoundError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.processStop",
            summary: "Stop background process",
            description: "Stop one background process tree of a session, with every process it started.",
          }),
        ),
      )
      .annotateMerge(OpenApi.annotations({ title: "session", description: "Session background process routes." }))
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "opencode experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )
