export * as ActionsGitLabRead from "./index"

import { ActionsContract } from "../contract"
import { ActionsGitLabCatalog } from "./catalog"
import { ActionsGitLabRuns } from "./runs"
import { ActionsGitLabJobs } from "./jobs"

export function make(input: { readonly transport: ActionsContract.Transport }): ActionsContract.ReadAdapter {
  return { ...ActionsGitLabCatalog.make(input.transport), ...ActionsGitLabRuns.make(input.transport),
    jobs: ActionsGitLabJobs.make(input.transport) }
}
