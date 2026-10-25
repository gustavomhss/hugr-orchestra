import { Capability } from "@orchestra/schema/capability"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { Context, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware } from "effect/unstable/httpapi"
import { CapabilityAuthorization } from "../middleware/capability-authorization"
import { LocationQuery, locationQueryOpenApi } from "./location"

const Limit = Schema.NumberFromString.pipe(
  Schema.decodeTo(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32 }))),
  Schema.optionalKey,
).annotate({ description: "Maximum page size, 1..32. Defaults to 16." })

const ConnectionQuery = Schema.Struct({
  ...LocationQuery.fields,
  after: CapabilityManagement.ConnectionQuery.fields.after,
  limit: Limit,
})
const TargetQuery = Schema.Struct({
  ...LocationQuery.fields,
  after: CapabilityManagement.TargetQuery.fields.after,
  limit: Limit,
})
const BindingQuery = Schema.Struct({ ...LocationQuery.fields,
  after: CapabilityManagement.BindingQuery.fields.after, limit: Limit })
const MutationHeaders = Schema.Struct({ "idempotency-key": Schema.NonEmptyString })

export const CapabilityConnectionsGroup = HttpApiGroup.make("server.capability.connections")
  .add(
    HttpApiEndpoint.post("capability.connection.connect", "/api/capability/connections/connect", {
      query: LocationQuery, headers: MutationHeaders, payload: CapabilitySetup.Input,
      success: CapabilityManagement.Receipt,
    }),
    HttpApiEndpoint.get("capability.target.get", "/api/capability/targets/:targetID", {
      params: { targetID: Capability.TargetID }, query: LocationQuery, success: CapabilityManagement.Target,
    }),
    HttpApiEndpoint.get("capability.binding.list", "/api/capability/targets/:targetID/bindings", {
      params: { targetID: Capability.TargetID }, query: BindingQuery, success: CapabilityManagement.BindingPage,
    }),
    HttpApiEndpoint.get("capability.connection.list", "/api/capability/connections", {
      query: ConnectionQuery,
      success: CapabilityManagement.ConnectionPage,
    }),
    HttpApiEndpoint.get("capability.connection.get", "/api/capability/connections/:connectionID", {
      params: { connectionID: Capability.ConnectionID },
      query: LocationQuery,
      success: CapabilityManagement.Connection,
    }),
    HttpApiEndpoint.get("capability.connection.targets", "/api/capability/connections/:connectionID/targets", {
      params: { connectionID: Capability.ConnectionID },
      query: TargetQuery,
      success: CapabilityManagement.TargetPage,
    }),
    HttpApiEndpoint.post("capability.connection.disconnect", "/api/capability/connections/disconnect", {
      query: LocationQuery,
      headers: MutationHeaders,
      payload: CapabilityManagement.DisconnectInput,
      success: CapabilityManagement.Receipt,
    }),
    HttpApiEndpoint.post("capability.target.create", "/api/capability/targets", {
      query: LocationQuery,
      headers: MutationHeaders,
      payload: CapabilityManagement.CreateTargetInput,
      success: CapabilityManagement.Receipt,
    }),
    HttpApiEndpoint.post("capability.target.retarget", "/api/capability/targets/retarget", {
      query: LocationQuery,
      headers: MutationHeaders,
      payload: CapabilityManagement.RetargetInput,
      success: CapabilityManagement.Receipt,
    }),
    HttpApiEndpoint.post("capability.target.remove", "/api/capability/targets/remove", {
      query: LocationQuery,
      headers: MutationHeaders,
      payload: CapabilityManagement.RemoveTargetInput,
      success: CapabilityManagement.Receipt,
    }),
    HttpApiEndpoint.post("capability.binding.put", "/api/capability/bindings", {
      query: LocationQuery,
      headers: MutationHeaders,
      payload: CapabilityManagement.PutBindingInput,
      success: CapabilityManagement.Receipt,
    }),
    HttpApiEndpoint.post("capability.binding.remove", "/api/capability/bindings/remove", {
      query: LocationQuery,
      headers: MutationHeaders,
      payload: CapabilityManagement.RemoveBindingInput,
      success: CapabilityManagement.Receipt,
    }),
  )
  .annotateEndpointsMerge(locationQueryOpenApi)

export const makeCapabilityConnectionsGroup = <Id extends HttpApiMiddleware.AnyId, Service>(
  locationMiddleware: Context.Key<Id, Service>,
) => CapabilityConnectionsGroup.middleware(locationMiddleware).middleware(CapabilityAuthorization)
