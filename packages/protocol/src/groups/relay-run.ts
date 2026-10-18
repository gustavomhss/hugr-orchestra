import { Location } from "@orchestra/schema/location"
import { NonNegativeInt } from "@orchestra/schema/schema"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { LocationQuery, locationQueryOpenApi } from "./location"
import { RelayErrors } from "./relay-document"

// External runs (Relay for LangGraph), read-only: each `<location>/.relay/runs/<runID>/ledger.jsonl` rebuilt into the
// run the app's Executions screen renders. The ledger is self-reported by the external process, so its audit is never
// a pass.

export const RelayExternalRun = Schema.Struct({
  runID: Schema.String,
  documentID: Schema.String,
  version: Schema.optional(Schema.String),
  status: Schema.Literals(["running", "parked", "completed", "failed"]),
  position: Schema.optional(Schema.String),
  failing: Schema.Array(Schema.String),
  reason: Schema.optional(Schema.String),
  label: Schema.String,
  agent: Schema.Literal("langgraph"),
  startedAt: Schema.Number,
  endedAt: Schema.optional(Schema.Number),
  steps: Schema.Array(
    Schema.Struct({
      wp: Schema.String,
      status: Schema.Literals(["running", "passed", "failed", "escalated"]),
      attempts: Schema.Number,
      startedAt: Schema.optional(Schema.Number),
      endedAt: Schema.optional(Schema.Number),
      checks: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          verdict: Schema.Literals(["pass", "fail", "advisory"]),
          output: Schema.String,
        }),
      ),
      note: Schema.optional(Schema.String),
    }),
  ),
}).annotate({ identifier: "RelayExternalRun" })

export const RelayExternalAudit = Schema.Struct({
  status: Schema.Literals(["pass", "fail", "pending"]),
  code: Schema.String,
  rows: Schema.Array(Schema.Struct({ label: Schema.String, value: Schema.String })),
}).annotate({ identifier: "RelayExternalAudit" })

const run = "/api/relay/run/:runID"
const params = { runID: Schema.String }

const docs = (identifier: string, summary: string, description: string) =>
  OpenApi.annotations({ identifier, summary, description })

export const RelayRunGroup = HttpApiGroup.make("server.relay.run")
  .add(
    HttpApiEndpoint.get("relay.run.list", "/api/relay/run", {
      query: Schema.Struct({ ...LocationQuery.fields, document: Schema.optional(Schema.String) }),
      success: Location.response(Schema.Array(RelayExternalRun)),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.run.list",
          "List external runs",
          "The location's external runs, newest first, optionally only those of one document. A run whose ledger does not decode is left out.",
        ),
      ),
  )
  .add(
    HttpApiEndpoint.get("relay.run.get", run, {
      params,
      query: LocationQuery,
      success: Location.response(RelayExternalRun),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(docs("v2.relay.run.get", "Get external run", "One external run rebuilt from its ledger.")),
  )
  .add(
    HttpApiEndpoint.get("relay.run.audit", `${run}/audit`, {
      params,
      query: LocationQuery,
      success: Location.response(RelayExternalAudit),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.run.audit",
          "Audit external run",
          "Verify the run's ledger chain. An intact chain is pending external-self-reported, never pass; a broken one fails at its first bad line.",
        ),
      ),
  )
  .add(
    HttpApiEndpoint.get("relay.run.ledger", `${run}/ledger`, {
      params,
      query: Schema.Struct({
        ...LocationQuery.fields,
        after: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
      }),
      success: Location.response(Schema.Array(Schema.Record(Schema.String, Schema.Unknown))),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.run.ledger",
          "Read external run ledger",
          "The run's ledger entries from seq `after` on (all of them when it is 0 or absent).",
        ),
      ),
  )
  .annotateMerge(OpenApi.annotations({ title: "relay runs", description: "External Relay run routes." }))
