import PROMPT from "../../agent/prompt/frankie.txt"
import { define } from "./seat"

export default define({
  id: "frankie",
  role: "process audit",
  abilityClass: "read-only process/ledger audit",
  returnCard: "audit verdict",
  forbiddenActions: ["implement product", "merge"],
  prompt: PROMPT,
  profile: "review",
  description: "Process audit. Read-only: reads and searches files; cannot edit or run commands. Returns audit verdict.",
  skills: [],
  writeRoots: false,
  strictResume: false,
  atlasMemory: false,
  toolkit: false,
})
