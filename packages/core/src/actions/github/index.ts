export * as ActionsGitHubRead from "./index"

import { ActionsContract } from "../contract"
import { GitHubCatalog } from "./catalog"
import { GitHubRuns } from "./runs"
import { GitHubJobs } from "./jobs"

export function make(input: { transport: ActionsContract.Transport }): ActionsContract.ReadAdapter {
  return {
    capabilities: (binding) => GitHubCatalog.capabilities(input.transport, binding),
    workflows: (binding, selection) => GitHubCatalog.workflows(input.transport, binding, selection),
    source: (binding, selection) => GitHubCatalog.source(input.transport, binding, selection),
    runs: (binding, selection) => GitHubRuns.list(input.transport, binding, selection),
    run: (binding, id) => GitHubRuns.read(input.transport, binding, id),
    jobs: (binding, selection) => GitHubJobs.list(input.transport, binding, selection),
  }
}
