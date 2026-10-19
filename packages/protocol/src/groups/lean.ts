import { LeanCoverage } from "@orchestra/schema/lean-coverage"
import { LeanDashboard } from "@orchestra/schema/lean-dashboard"
import { Location } from "@orchestra/schema/location"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { ServiceUnavailableError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

// The Lean dashboard of the requested Location's saved profile: what Lean saved per item, and the profile's switches.
export const LeanGroup = HttpApiGroup.make("server.lean")
  .add(
    HttpApiEndpoint.get("lean.get", "/api/lean", {
      query: LocationQuery,
      success: Location.response(LeanDashboard.Info),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.lean.get",
          summary: "Get Lean dashboard",
          description: "The saved profile's Lean switches and what Lean saved per item in this Location.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.patch("lean.update", "/api/lean", {
      query: LocationQuery,
      payload: LeanDashboard.Update,
      success: Location.response(LeanDashboard.Info),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.lean.update",
          summary: "Update Lean preferences",
          description: "Switch Lean or one of its items on or off for the saved profile, and return the dashboard.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("lean.history", "/api/lean/history/:itemID", {
      params: { itemID: LeanCoverage.ItemID },
      query: LocationQuery,
      success: Location.response(LeanDashboard.History),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.lean.history",
          summary: "Get Lean item history",
          description: "The latest executions one Lean item saved output on in this Location.",
        }),
      ),
  )
  .annotateMerge(OpenApi.annotations({ title: "lean", description: "Lean dashboard routes." }))
