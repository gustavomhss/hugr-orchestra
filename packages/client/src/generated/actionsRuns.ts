import type {
  ActionsRunsListInput,
  ActionsRunsListOutput,
  ActionsRunsGetInput,
  ActionsRunsGetOutput,
  ActionsRunsJobsInput,
  ActionsRunsJobsOutput,
  ActionsRunsRetryInput,
  ActionsRunsRetryOutput,
  ActionsRunsCancelInput,
  ActionsRunsCancelOutput,
  ActionsRunsForceCancelInput,
  ActionsRunsForceCancelOutput,
  ActionsRunsRemoveInput,
  ActionsRunsRemoveOutput,
  ActionsRunsApproveForkInput,
  ActionsRunsApproveForkOutput,
  ActionsRunsRenameInput,
  ActionsRunsRenameOutput,
} from "./types"
import type { RequestOptions } from "./client"
import type { RequestDescriptor } from "./request"

export function makeActionsRuns(
  request: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => Promise<A>,
  sse: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => AsyncIterable<A>,
) {
  return {
    list: (input: ActionsRunsListInput, requestOptions?: RequestOptions) =>
      request<ActionsRunsListOutput>(
        {
          method: "GET",
          path: `/api/actions/run/${encodeURIComponent(input.bindingID)}`,
          query: {
            location: input["location"],
            revision: input["revision"],
            workflowID: input["workflowID"],
            cursor: input["cursor"],
            limit: input["limit"],
            ref: input["ref"],
            event: input["event"],
            status: input["status"],
            commit: input["commit"],
            actor: input["actor"],
            created: input["created"],
            createdAfter: input["createdAfter"],
            createdBefore: input["createdBefore"],
            updatedAfter: input["updatedAfter"],
            updatedBefore: input["updatedBefore"],
          },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    get: (input: ActionsRunsGetInput, requestOptions?: RequestOptions) =>
      request<ActionsRunsGetOutput>(
        {
          method: "GET",
          path: `/api/actions/run/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.runID)}`,
          query: { location: input["location"], revision: input["revision"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    jobs: (input: ActionsRunsJobsInput, requestOptions?: RequestOptions) =>
      request<ActionsRunsJobsOutput>(
        {
          method: "GET",
          path: `/api/actions/run/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.runID)}/jobs`,
          query: {
            location: input["location"],
            revision: input["revision"],
            attempt: input["attempt"],
            cursor: input["cursor"],
          },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    retry: (input: ActionsRunsRetryInput, requestOptions?: RequestOptions) =>
      request<ActionsRunsRetryOutput>(
        {
          method: "POST",
          path: `/api/actions/run/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.runID)}/retry`,
          query: { location: input["location"], revision: input["revision"] },
          body: { id: input["id"], input: input["input"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    cancel: (input: ActionsRunsCancelInput, requestOptions?: RequestOptions) =>
      request<ActionsRunsCancelOutput>(
        {
          method: "POST",
          path: `/api/actions/run/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.runID)}/cancel`,
          query: { location: input["location"], revision: input["revision"] },
          body: { id: input["id"], input: input["input"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    forceCancel: (input: ActionsRunsForceCancelInput, requestOptions?: RequestOptions) =>
      request<ActionsRunsForceCancelOutput>(
        {
          method: "POST",
          path: `/api/actions/run/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.runID)}/force-cancel`,
          query: { location: input["location"], revision: input["revision"] },
          body: { id: input["id"], input: input["input"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    remove: (input: ActionsRunsRemoveInput, requestOptions?: RequestOptions) =>
      request<ActionsRunsRemoveOutput>(
        {
          method: "DELETE",
          path: `/api/actions/run/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.runID)}`,
          query: { location: input["location"], revision: input["revision"] },
          body: { id: input["id"], input: input["input"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    approveFork: (input: ActionsRunsApproveForkInput, requestOptions?: RequestOptions) =>
      request<ActionsRunsApproveForkOutput>(
        {
          method: "POST",
          path: `/api/actions/run/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.runID)}/approve-fork`,
          query: { location: input["location"], revision: input["revision"] },
          body: { id: input["id"], input: input["input"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    rename: (input: ActionsRunsRenameInput, requestOptions?: RequestOptions) =>
      request<ActionsRunsRenameOutput>(
        {
          method: "PUT",
          path: `/api/actions/run/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.runID)}/name`,
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
