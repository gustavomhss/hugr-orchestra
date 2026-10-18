import type {
  ActionsResourcesListInput,
  ActionsResourcesListOutput,
  ActionsResourcesCommandInput,
  ActionsResourcesCommandOutput,
} from "./types"
import type { RequestOptions } from "./client"
import type { RequestDescriptor } from "./request"

export function makeActionsResources(
  request: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => Promise<A>,
  sse: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => AsyncIterable<A>,
) {
  return {
    list: (input: ActionsResourcesListInput, requestOptions?: RequestOptions) =>
      request<ActionsResourcesListOutput>(
        {
          method: "GET",
          path: `/api/actions/resource/${encodeURIComponent(input.bindingID)}`,
          query: {
            location: input["location"],
            revision: input["revision"],
            kind: input["kind"],
            runID: input["runID"],
            resourceID: input["resourceID"],
            scope: input["scope"],
            ref: input["ref"],
            query: input["query"],
            cursor: input["cursor"],
            limit: input["limit"],
          },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    command: (input: ActionsResourcesCommandInput, requestOptions?: RequestOptions) =>
      request<ActionsResourcesCommandOutput>(
        {
          method: "POST",
          path: `/api/actions/resource/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.resourceKind)}/${encodeURIComponent(input.action)}`,
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
