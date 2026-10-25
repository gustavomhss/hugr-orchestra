import { Context, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware } from "effect/unstable/httpapi"
import { LocationQuery } from "./location"
import { CapabilityAuthorization } from "../middleware/capability-authorization"

export const CapabilityOperatorGroup = HttpApiGroup.make("server.capability.operator").add(
  HttpApiEndpoint.get("capability.operator.inspect", "/api/capability/operator", {
    query: LocationQuery,
    success: Schema.Struct({ requestID: Schema.String, principal: Schema.String,
      origin: Schema.Literals(["configured-auth", "desktop", "cli", "sdk"]), scopeHash: Schema.String }),
  }),
)

export const makeCapabilityOperatorGroup = <Id extends HttpApiMiddleware.AnyId, Service>(
  locationMiddleware: Context.Key<Id, Service>,
) => CapabilityOperatorGroup.middleware(locationMiddleware).middleware(CapabilityAuthorization)
