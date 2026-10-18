import PROMPT from "../../agent/prompt/rosie.txt"
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
  skills: [],
  writeRoots: false,
  strictResume: false,
  atlasMemory: false,
  toolkit: false,
})
