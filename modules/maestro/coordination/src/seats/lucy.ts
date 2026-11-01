import PROMPT from "./prompt/lucy.txt"
import { define } from "./seat"

export default define({
  id: "lucy",
  role: "cold code review; records governed reviews",
  abilityClass: "read-only artifact review",
  returnCard: "cited APPROVE/FIX_FIRST/REJECT card",
  forbiddenActions: ["edit implementation", "receive author transcript", "merge"],
  prompt: PROMPT,
  profile: "review",
  description: "Cold code review; records governed reviews. Read-only: reads and searches files; cannot edit or run commands. Returns cited APPROVE/FIX_FIRST/REJECT card.",
  routing: "Cold review of finished work before it ships.",
  approves: true,
  skills: [],
  writeRoots: false,
  strictResume: false,
  atlasMemory: false,
  toolkit: false,
})
