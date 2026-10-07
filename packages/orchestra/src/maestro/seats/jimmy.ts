import PROMPT from "../../agent/prompt/jimmy.txt"
import { define } from "./seat"

export default define({
  id: "jimmy",
  role: "codebase exploration",
  abilityClass: "read-only discovery",
  returnCard: "grounded findings card",
  forbiddenActions: ["ratify alone", "edit product"],
  prompt: PROMPT,
  profile: "review",
  description: "Codebase exploration. Read-only: reads and searches files; cannot edit or run commands. Returns grounded findings card.",
  skills: [],
  writeRoots: false,
  strictResume: false,
  atlasMemory: false,
  toolkit: false,
})
