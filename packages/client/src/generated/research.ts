import type { ResearchArtifactInput, ResearchArtifactOutput } from "./types"
import type { RequestOptions } from "./client"
import type { RequestDescriptor } from "./request"

export function makeResearch(
  request: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => Promise<A>,
  sse: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => AsyncIterable<A>,
) {
  return {
    artifact: (input: ResearchArtifactInput, requestOptions?: RequestOptions) =>
      request<ResearchArtifactOutput>(
        {
          method: "GET",
          path: `/api/session/${encodeURIComponent(input.sessionID)}/research/${encodeURIComponent(input.artifactID)}`,
          query: { revision: input["revision"], cursor: input["cursor"] },
          successStatus: 200,
          declaredStatuses: [404, 409, 400, 503, 401],
          empty: false,
        },
        requestOptions,
      ),
  }
}
