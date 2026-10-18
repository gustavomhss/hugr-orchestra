import type {
  ActionsSourceBaseInput,
  ActionsSourceBaseOutput,
  ActionsSourceValidateDraftInput,
  ActionsSourceValidateDraftOutput,
  ActionsSourceValidateInput,
  ActionsSourceValidateOutput,
  ActionsSourceCommandInput,
  ActionsSourceCommandOutput,
} from "./types"
import type { RequestOptions } from "./client"
import type { RequestDescriptor } from "./request"

export function makeActionsSource(
  request: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => Promise<A>,
  sse: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => AsyncIterable<A>,
) {
  return {
    base: (input: ActionsSourceBaseInput, requestOptions?: RequestOptions) =>
      request<ActionsSourceBaseOutput>(
        {
          method: "GET",
          path: `/api/actions/source/${encodeURIComponent(input.bindingID)}/base`,
          query: { location: input["location"], revision: input["revision"], ref: input["ref"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    validateDraft: (input: ActionsSourceValidateDraftInput, requestOptions?: RequestOptions) =>
      request<ActionsSourceValidateDraftOutput>(
        {
          method: "POST",
          path: `/api/actions/source/${encodeURIComponent(input.bindingID)}/validate-draft`,
          query: { location: input["location"], revision: input["revision"] },
          body: { base: input["base"], path: input["path"], draft: input["draft"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    validate: (input: ActionsSourceValidateInput, requestOptions?: RequestOptions) =>
      request<ActionsSourceValidateOutput>(
        {
          method: "POST",
          path: `/api/actions/source/${encodeURIComponent(input.bindingID)}/validate`,
          query: { location: input["location"], revision: input["revision"] },
          body: { source: input["source"], draft: input["draft"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    command: (input: ActionsSourceCommandInput, requestOptions?: RequestOptions) =>
      request<ActionsSourceCommandOutput>(
        {
          method: "POST",
          path: `/api/actions/source/${encodeURIComponent(input.bindingID)}/${encodeURIComponent(input.action)}`,
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
