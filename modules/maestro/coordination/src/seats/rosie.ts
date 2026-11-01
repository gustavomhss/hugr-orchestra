import PROMPT from "./prompt/rosie.txt"
import { define } from "./seat"

export default define({
  id: "rosie",
  role: "documentation changes",
  abilityClass: "scoped docs write",
  returnCard: "docs evidence card",
  forbiddenActions: ["decide product behavior"],
  prompt: PROMPT,
  profile: "execution",
  description: "Documentation changes. Edits files and runs shell commands. Returns docs evidence card.",
  routing: "Documentation changes.",
  staffed: false,
  skills: [],
  writeRoots: false,
  strictResume: false,
  atlasMemory: false,
  toolkit: false,
})
