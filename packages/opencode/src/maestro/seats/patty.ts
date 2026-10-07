import PROMPT from "../../agent/prompt/patty.txt"
import { define } from "./seat"

export default define({
  id: "patty",
  role: "frontend execution",
  abilityClass: "scoped repository write",
  returnCard: "implementation card, sensory evidence, diff receipt",
  forbiddenActions: ["approve", "review own work", "merge"],
  prompt: PROMPT,
  profile: "execution",
  description: "Frontend execution. Edits files and runs shell commands. Returns implementation card, sensory evidence, diff receipt.",
  skills: [],
  writeRoots: false,
  strictResume: false,
  atlasMemory: false,
  toolkit: false,
})
