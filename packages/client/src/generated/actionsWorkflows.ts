import type {
  ActionsWorkflowsListInput,
  ActionsWorkflowsListOutput,
  ActionsWorkflowsSourceInput,
  ActionsWorkflowsSourceOutput,
  ActionsWorkflowsGraphInput,
  ActionsWorkflowsGraphOutput,
  ActionsWorkflowsDispatchInput,
  ActionsWorkflowsDispatchOutput,
  ActionsWorkflowsStateInput,
  ActionsWorkflowsStateOutput,
} from "./types"
import type { RequestOptions } from "./client"
import type { RequestDescriptor } from "./request"

export function makeActionsWorkflows(
  request: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => Promise<A>,
  sse: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => AsyncIterable<A>,
) {
  return {
    list: (input: ActionsWorkflowsListInput, requestOptions?: RequestOptions) =>
      request<ActionsWorkflowsListOutput>(
        {
          method: "GET",
          path: `/api/actions/workflow/${encodeURIComponent(input.bindingID)}`,
          query: {
            location: input["location"],
            revision: input["revision"],
            cursor: input["cursor"],
            limit: input["limit"],
            query: input["query"],
            state: input["state"],
          },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    source: (input: ActionsWorkflowsSourceInput, requestOptions?: RequestOptions) =>
      request<ActionsWorkflowsSourceOutput>(
        {
          method: "GET",
          path: `/api/actions/workflow/${encodeURIComponent(input.bindingID)}/source`,
          query: { location: input["location"], revision: input["revision"], path: input["path"], ref: input["ref"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    graph: (input: ActionsWorkflowsGraphInput, requestOptions?: RequestOptions) =>
      request<ActionsWorkflowsGraphOutput>(
        {
          method: "GET",
          path: `/api/actions/workflow/${encodeURIComponent(input.bindingID)}/graph`,
          query: { location: input["location"], revision: input["revision"], path: input["path"], ref: input["ref"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    dispatch: (input: ActionsWorkflowsDispatchInput, requestOptions?: RequestOptions) =>
      request<ActionsWorkflowsDispatchOutput>(
        {
          method: "POST",
          path: `/api/actions/workflow/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.workflowID)}/dispatch`,
          query: { location: input["location"], revision: input["revision"] },
          body: { id: input["id"], input: input["input"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    state: (input: ActionsWorkflowsStateInput, requestOptions?: RequestOptions) =>
      request<ActionsWorkflowsStateOutput>(
        {
          method: "PUT",
          path: `/api/actions/workflow/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.workflowID)}/state`,
          query: { location: input["location"], revision: input["revision"] },
          body: { id: input["id"], input: input["input"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
  }
}
