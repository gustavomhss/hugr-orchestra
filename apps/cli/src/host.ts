export * as ProductHost from "./host"

import type { Host } from "@orchestra/core/host"
import { AppDockTools } from "@orchestra/app-dock/application-tools"
import { ContinuityV2 } from "@orchestra/continuity/v2"
import { ClaudeCodeHost } from "@orchestra/engine-claude-code/v2/host"
import { MaestroSeatsV2 } from "@orchestra/maestro/v2/seats"

/**
 * Everything the product's V2 server composes, in the order it is applied. `Host.merge` flattens replacements in this
 * order and the last replacement of a node wins, so a later entry may refine an earlier one but none may depend on a
 * node an earlier one replaced differently. Today no two entries replace the same node, except inside Maestro, whose own
 * list orders its ToolSafety replacements (Arsenal first, write-roots last).
 *
 * 1. `maestro`: seats, Maestro and Atlas tools, the Arsenal's native safety, Task governance and write-roots safety.
 * 2. `continuity`: replaces `SessionCompaction` and adds `context_recall` / `context_compact`. It sits after Maestro
 *    because the seats' skills and prompts are the context it masks and summarizes, and it touches none of Maestro's nodes.
 * 3. `engine-claude-code`: replaces `ExecutionHost`, for agents whose `engine` names it.
 * 4. `app-dock`: only when the desktop that owns this child handed it a Dock channel.
 */
export function contributions(dock?: Parameters<typeof AppDockTools.contribution>[0]): ReadonlyArray<Host.Contribution> {
  return [
    MaestroSeatsV2.contribution,
    ContinuityV2.contribution,
    ClaudeCodeHost.contribution,
    ...(dock ? [AppDockTools.contribution(dock)] : []),
  ]
}
