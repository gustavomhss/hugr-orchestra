import type {
  ActionsBindingsListInput,
  ActionsBindingsListOutput,
  ActionsBindingsCreateInput,
  ActionsBindingsCreateOutput,
  ActionsBindingsGetInput,
  ActionsBindingsGetOutput,
  ActionsBindingsUpdateInput,
  ActionsBindingsUpdateOutput,
  ActionsBindingsRemoveInput,
  ActionsBindingsRemoveOutput,
  ActionsBindingsCapabilitiesInput,
  ActionsBindingsCapabilitiesOutput,
  ActionsBindingsPolicyInput,
  ActionsBindingsPolicyOutput,
  ActionsBindingsUpdatePolicyInput,
  ActionsBindingsUpdatePolicyOutput,
} from "./types"
import type { RequestOptions } from "./client"
import type { RequestDescriptor } from "./request"

export function makeActionsBindings(
  request: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => Promise<A>,
  sse: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => AsyncIterable<A>,
) {
  return {
    list: (input?: ActionsBindingsListInput, requestOptions?: RequestOptions) =>
      request<ActionsBindingsListOutput>(
        {
          method: "GET",
          path: `/api/actions/binding`,
          query: { location: input?.["location"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    create: (input: ActionsBindingsCreateInput, requestOptions?: RequestOptions) =>
      request<ActionsBindingsCreateOutput>(
        {
          method: "POST",
          path: `/api/actions/binding`,
          query: { location: input["location"] },
          body: {
            remote: input["remote"],
            provider: input["provider"],
            projectPath: input["projectPath"],
            expectedRevision: input["expectedRevision"],
          },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    get: (input: ActionsBindingsGetInput, requestOptions?: RequestOptions) =>
      request<ActionsBindingsGetOutput>(
        {
          method: "GET",
          path: `/api/actions/binding/${encodeURIComponent(input.bindingID)}`,
          query: { location: input["location"], revision: input["revision"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    update: (input: ActionsBindingsUpdateInput, requestOptions?: RequestOptions) =>
      request<ActionsBindingsUpdateOutput>(
        {
          method: "PATCH",
          path: `/api/actions/binding/${encodeURIComponent(input.bindingID)}`,
          query: { location: input["location"], revision: input["revision"] },
          body: {
            remote: input["remote"],
            provider: input["provider"],
            projectPath: input["projectPath"],
            expectedRevision: input["expectedRevision"],
          },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    remove: (input: ActionsBindingsRemoveInput, requestOptions?: RequestOptions) =>
      request<ActionsBindingsRemoveOutput>(
        {
          method: "DELETE",
          path: `/api/actions/binding/${encodeURIComponent(input.bindingID)}`,
          query: { location: input["location"], revision: input["revision"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    capabilities: (input: ActionsBindingsCapabilitiesInput, requestOptions?: RequestOptions) =>
      request<ActionsBindingsCapabilitiesOutput>(
        {
          method: "GET",
          path: `/api/actions/binding/${encodeURIComponent(input.bindingID)}/capabilities`,
          query: { location: input["location"], revision: input["revision"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    policy: (input: ActionsBindingsPolicyInput, requestOptions?: RequestOptions) =>
      request<ActionsBindingsPolicyOutput>(
        {
          method: "GET",
          path: `/api/actions/binding/${encodeURIComponent(input.bindingID)}/policy`,
          query: { location: input["location"], revision: input["revision"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    updatePolicy: (input: ActionsBindingsUpdatePolicyInput, requestOptions?: RequestOptions) =>
      request<ActionsBindingsUpdatePolicyOutput>(
        {
          method: "PUT",
          path: `/api/actions/binding/${encodeURIComponent(input.bindingID)}/policy`,
          query: { location: input["location"], revision: input["revision"] },
          body: { retentionDays: input["retentionDays"], execution: input["execution"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
  }
}
