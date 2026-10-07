export * as AgentPrompt from "./prompt"

import COMPACTION from "./prompt/compaction.txt"
import EXPLORE from "./prompt/explore.txt"
import GENERAL from "./prompt/general.txt"
import MAESTRO from "./prompt/maestro.txt"
import SUMMARY from "./prompt/summary.txt"
import TITLE from "./prompt/title.txt"

// Prompts of the agents both session paths define. They live in Core because Core cannot import orchestra.
export const maestro = MAESTRO
export const general = GENERAL
export const explore = EXPLORE
export const compaction = COMPACTION
export const title = TITLE
export const summary = SUMMARY
