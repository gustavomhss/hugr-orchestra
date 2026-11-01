import type { ServerBoardListOutput } from "@orchestra/client"
import { createWarm } from "../../warm"
import type { Snapshot, Trail } from "./model"

// The last project list per server and the last board per project, painted at once when the chapter opens again
// while the fresh reads run. The review cards' CI trails ride along with their board. The board cache is detached:
// the page reconciles its store in place, which would otherwise rewrite the cached board.
export const lists = createWarm<readonly ServerBoardListOutput[number][]>(4)
export const boards = createWarm<{ snapshot: Snapshot; trails: Record<string, Trail> }>(16, { detach: true })
// Review cards load their CI trail this many at a time.
export const trailBatch = 3
