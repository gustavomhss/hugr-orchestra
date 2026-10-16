import type {
  ActionsJobsRetryInput,
  ActionsJobsRetryOutput,
  ActionsJobsPlayInput,
  ActionsJobsPlayOutput,
  ActionsJobsCancelInput,
  ActionsJobsCancelOutput,
  ActionsJobsEraseInput,
  ActionsJobsEraseOutput,
} from "./types"
import type { RequestOptions } from "./client"
import type { RequestDescriptor } from "./request"

export function makeActionsJobs(
  request: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => Promise<A>,
  sse: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => AsyncIterable<A>,
) {
  return {
    retry: (input: ActionsJobsRetryInput, requestOptions?: RequestOptions) =>
      request<ActionsJobsRetryOutput>(
        {
          method: "POST",
          path: `/api/actions/job/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.jobID)}/retry`,
          query: { location: input["location"], revision: input["revision"] },
          body: { id: input["id"], input: input["input"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    play: (input: ActionsJobsPlayInput, requestOptions?: RequestOptions) =>
      request<ActionsJobsPlayOutput>(
        {
          method: "POST",
          path: `/api/actions/job/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.jobID)}/play`,
          query: { location: input["location"], revision: input["revision"] },
          body: { id: input["id"], input: input["input"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    cancel: (input: ActionsJobsCancelInput, requestOptions?: RequestOptions) =>
      request<ActionsJobsCancelOutput>(
        {
          method: "POST",
          path: `/api/actions/job/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.jobID)}/cancel`,
          query: { location: input["location"], revision: input["revision"] },
          body: { id: input["id"], input: input["input"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    erase: (input: ActionsJobsEraseInput, requestOptions?: RequestOptions) =>
      request<ActionsJobsEraseOutput>(
        {
          method: "POST",
          path: `/api/actions/job/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.jobID)}/erase`,
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
