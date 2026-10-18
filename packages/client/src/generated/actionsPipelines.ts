import type {
  ActionsPipelinesMergeRequestInput,
  ActionsPipelinesMergeRequestOutput,
  ActionsPipelinesTriggerInput,
  ActionsPipelinesTriggerOutput,
} from "./types"
import type { RequestOptions } from "./client"
import type { RequestDescriptor } from "./request"

export function makeActionsPipelines(
  request: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => Promise<A>,
  sse: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => AsyncIterable<A>,
) {
  return {
    mergeRequest: (input: ActionsPipelinesMergeRequestInput, requestOptions?: RequestOptions) =>
      request<ActionsPipelinesMergeRequestOutput>(
        {
          method: "POST",
          path: `/api/actions/pipeline/${encodeURIComponent(input.bindingID)}/merge-request/${encodeURIComponent(input.mergeRequestID)}`,
          query: { location: input["location"], revision: input["revision"] },
          body: { id: input["id"], input: input["input"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    trigger: (input: ActionsPipelinesTriggerInput, requestOptions?: RequestOptions) =>
      request<ActionsPipelinesTriggerOutput>(
        {
          method: "POST",
          path: `/api/actions/pipeline/${encodeURIComponent(input.bindingID)}/trigger`,
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
