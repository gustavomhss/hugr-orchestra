import type {
  ActionsOperationsPrepareInput,
  ActionsOperationsPrepareOutput,
  ActionsOperationsGetInput,
  ActionsOperationsGetOutput,
  ActionsOperationsReconcileInput,
  ActionsOperationsReconcileOutput,
} from "./types"
import type { RequestOptions } from "./client"
import type { RequestDescriptor } from "./request"

export function makeActionsOperations(
  request: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => Promise<A>,
  sse: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => AsyncIterable<A>,
) {
  return {
    prepare: (input: ActionsOperationsPrepareInput, requestOptions?: RequestOptions) =>
      request<ActionsOperationsPrepareOutput>(
        {
          method: "POST",
          path: `/api/actions/operation/${encodeURIComponent(input.bindingID)}`,
          query: { location: input["location"], revision: input["revision"] },
          body: {
            clientID: input["clientID"],
            binding: input["binding"],
            kind: input["kind"],
            target: input["target"],
            expected: input["expected"],
          },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    get: (input: ActionsOperationsGetInput, requestOptions?: RequestOptions) =>
      request<ActionsOperationsGetOutput>(
        {
          method: "GET",
          path: `/api/actions/operation/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.operationID)}`,
          query: { location: input["location"], revision: input["revision"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    reconcile: (input: ActionsOperationsReconcileInput, requestOptions?: RequestOptions) =>
      request<ActionsOperationsReconcileOutput>(
        {
          method: "POST",
          path: `/api/actions/operation/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.operationID)}/reconcile`,
          query: { location: input["location"], revision: input["revision"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
  }
}
