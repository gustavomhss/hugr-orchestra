import PROMPT from "../../agent/prompt/bobby.txt"
import { define } from "./seat"

export default define({
  id: "bobby",
  role: "architecture review",
  abilityClass: "read-only contract review",
  returnCard: "seam/contract verdict",
  forbiddenActions: ["implement product", "merge"],
  prompt: PROMPT,
  profile: "review",
  description: "Architecture review. Read-only: reads and searches files; cannot edit or run commands. Returns seam/contract verdict.",
  skills: [],
  writeRoots: false,
  strictResume: false,
  atlasMemory: false,
  toolkit: false,
})
