import type {
  ActivityPlanOutput,
  ActivityWorktreesOutput,
  ActivityReadWorktreeInput,
  ActivityReadWorktreeOutput,
  ActivityProveWorktreeUseInput,
  ActivityProveWorktreeUseOutput,
  ActivityDockerOutput,
  ActivityReadDockerOutput,
  ActivityExternalCachesOutput,
  ActivityReadExternalCacheInput,
  ActivityReadExternalCacheOutput,
  ActivityDiskOutput,
  ActivityReadDiskInput,
  ActivityReadDiskOutput,
  ActivitySnapshotOutput,
  ActivityInspectInput,
  ActivityInspectOutput,
} from "./types"
import type { RequestOptions } from "./client"
import type { RequestDescriptor } from "./request"

export function makeActivity(
  request: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => Promise<A>,
  sse: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => AsyncIterable<A>,
) {
  return {
    plan: (requestOptions?: RequestOptions) =>
      request<ActivityPlanOutput>(
        {
          method: "GET",
          path: `/api/activity/plan`,
          successStatus: 200,
          declaredStatuses: [503, 401, 400],
          empty: false,
        },
        requestOptions,
      ),
    worktrees: (requestOptions?: RequestOptions) =>
      request<ActivityWorktreesOutput>(
        {
          method: "GET",
          path: `/api/activity/worktrees`,
          successStatus: 200,
          declaredStatuses: [503, 401, 400],
          empty: false,
        },
        requestOptions,
      ),
    readWorktree: (input: ActivityReadWorktreeInput, requestOptions?: RequestOptions) =>
      request<ActivityReadWorktreeOutput>(
        {
          method: "POST",
          path: `/api/activity/worktrees/${encodeURIComponent(input.recordID)}/read`,
          successStatus: 200,
          declaredStatuses: [400, 409, 503, 401],
          empty: false,
        },
        requestOptions,
      ),
    proveWorktreeUse: (input: ActivityProveWorktreeUseInput, requestOptions?: RequestOptions) =>
      request<ActivityProveWorktreeUseOutput>(
        {
          method: "POST",
          path: `/api/activity/worktrees/${encodeURIComponent(input.recordID)}/use-proof`,
          successStatus: 200,
          declaredStatuses: [400, 409, 503, 401],
          empty: false,
        },
        requestOptions,
      ),
    docker: (requestOptions?: RequestOptions) =>
      request<ActivityDockerOutput>(
        { method: "GET", path: `/api/activity/docker`, successStatus: 200, declaredStatuses: [401, 400], empty: false },
        requestOptions,
      ),
    readDocker: (requestOptions?: RequestOptions) =>
      request<ActivityReadDockerOutput>(
        {
          method: "POST",
          path: `/api/activity/docker/read`,
          successStatus: 200,
          declaredStatuses: [503, 401, 400],
          empty: false,
        },
        requestOptions,
      ),
    externalCaches: (requestOptions?: RequestOptions) =>
      request<ActivityExternalCachesOutput>(
        {
          method: "GET",
          path: `/api/activity/external-caches`,
          successStatus: 200,
          declaredStatuses: [401, 400],
          empty: false,
        },
        requestOptions,
      ),
    readExternalCache: (input: ActivityReadExternalCacheInput, requestOptions?: RequestOptions) =>
      request<ActivityReadExternalCacheOutput>(
        {
          method: "POST",
          path: `/api/activity/external-caches/${encodeURIComponent(input.id)}/read`,
          successStatus: 200,
          declaredStatuses: [400, 409, 401],
          empty: false,
        },
        requestOptions,
      ),
    disk: (requestOptions?: RequestOptions) =>
      request<ActivityDiskOutput>(
        { method: "GET", path: `/api/activity/disk`, successStatus: 200, declaredStatuses: [401, 400], empty: false },
        requestOptions,
      ),
    readDisk: (input: ActivityReadDiskInput, requestOptions?: RequestOptions) =>
      request<ActivityReadDiskOutput>(
        {
          method: "POST",
          path: `/api/activity/disk/${encodeURIComponent(input.rootID)}/read`,
          successStatus: 200,
          declaredStatuses: [401, 400],
          empty: false,
        },
        requestOptions,
      ),
    snapshot: (requestOptions?: RequestOptions) =>
      request<ActivitySnapshotOutput>(
        { method: "GET", path: `/api/activity`, successStatus: 200, declaredStatuses: [401, 400], empty: false },
        requestOptions,
      ),
    inspect: (input: ActivityInspectInput, requestOptions?: RequestOptions) =>
      request<ActivityInspectOutput>(
        {
          method: "GET",
          path: `/api/activity/${encodeURIComponent(input.recordID)}/inspection`,
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false,
        },
        requestOptions,
      ),
  }
}
