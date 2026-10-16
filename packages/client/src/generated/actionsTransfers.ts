import type { ActionsTransfersInfoInput, ActionsTransfersInfoOutput } from "./types"
import type { RequestOptions } from "./client"
import type { RequestDescriptor } from "./request"

export function makeActionsTransfers(
  request: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => Promise<A>,
  sse: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => AsyncIterable<A>,
) {
  return {
    info: (input: ActionsTransfersInfoInput, requestOptions?: RequestOptions) =>
      request<ActionsTransfersInfoOutput>(
        {
          method: "GET",
          path: `/api/actions/transfer/${encodeURIComponent(input.bindingID)}/info`,
          query: {
            location: input["location"],
            revision: input["revision"],
            kind: input["kind"],
            id: input["id"],
            runID: input["runID"],
            attempt: input["attempt"],
            path: input["path"],
          },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
  }
}
