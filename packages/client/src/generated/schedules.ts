import type {
  SchedulesListInput,
  SchedulesListOutput,
  SchedulesCreateInput,
  SchedulesCreateOutput,
  SchedulesUpdateInput,
  SchedulesUpdateOutput,
  SchedulesRemoveInput,
  SchedulesRemoveOutput,
  SchedulesRunInput,
  SchedulesRunOutput,
} from "./types"
import type { RequestOptions } from "./client"
import type { RequestDescriptor } from "./request"

export function makeSchedules(
  request: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => Promise<A>,
  sse: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => AsyncIterable<A>,
) {
  return {
    list: (input?: SchedulesListInput, requestOptions?: RequestOptions) =>
      request<SchedulesListOutput>(
        {
          method: "GET",
          path: `/api/schedule`,
          query: { location: input?.["location"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
    create: (input: SchedulesCreateInput, requestOptions?: RequestOptions) =>
      request<SchedulesCreateOutput>(
        {
          method: "POST",
          path: `/api/schedule`,
          query: { location: input["location"] },
          body: {
            id: input["id"],
            name: input["name"],
            prompt: input["prompt"],
            cadence: input["cadence"],
            next: input["next"],
            timezone: input["timezone"],
            minute: input["minute"],
            enabled: input["enabled"],
            history: input["history"],
          },
          successStatus: 200,
          declaredStatuses: [400, 409, 401],
          empty: false,
        },
        requestOptions,
      ),
    update: (input: SchedulesUpdateInput, requestOptions?: RequestOptions) =>
      request<SchedulesUpdateOutput>(
        {
          method: "PATCH",
          path: `/api/schedule/${encodeURIComponent(input.scheduleID)}`,
          query: { location: input["location"] },
          body: {
            name: input["name"],
            prompt: input["prompt"],
            cadence: input["cadence"],
            next: input["next"],
            timezone: input["timezone"],
            enabled: input["enabled"],
          },
          successStatus: 200,
          declaredStatuses: [404, 400, 401],
          empty: false,
        },
        requestOptions,
      ),
    remove: (input: SchedulesRemoveInput, requestOptions?: RequestOptions) =>
      request<SchedulesRemoveOutput>(
        {
          method: "DELETE",
          path: `/api/schedule/${encodeURIComponent(input.scheduleID)}`,
          query: { location: input["location"] },
          successStatus: 204,
          declaredStatuses: [404, 400, 401],
          empty: true,
        },
        requestOptions,
      ),
    run: (input: SchedulesRunInput, requestOptions?: RequestOptions) =>
      request<SchedulesRunOutput>(
        {
          method: "POST",
          path: `/api/schedule/${encodeURIComponent(input.scheduleID)}/run`,
          query: { location: input["location"] },
          successStatus: 200,
          declaredStatuses: [404, 500, 400, 401],
          empty: false,
        },
        requestOptions,
      ),
  }
}
