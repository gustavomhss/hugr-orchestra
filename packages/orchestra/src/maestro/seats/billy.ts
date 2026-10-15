import PROMPT from "../../agent/prompt/billy.txt"
import { define } from "./seat"

export default define({
  id: "billy",
  role: "security review",
  abilityClass: "read-only threat review",
  returnCard: "threat verdict and cited controls",
  forbiddenActions: ["implement product", "merge"],
  prompt: PROMPT,
  profile: "review",
  description: "Security review. Read-only: reads and searches files; cannot edit or run commands. Returns threat verdict and cited controls.",
  skills: [],
  writeRoots: false,
  strictResume: false,
  atlasMemory: false,
  toolkit: false,
})
