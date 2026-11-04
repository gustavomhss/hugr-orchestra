import PROMPT from "./prompt/lucy.txt"
import { define } from "./seat"

export default define({
  id: "lucy",
  role: "cold review and audit; records governed reviews",
  abilityClass: "read-only review with confined verification",
  returnCard: "review-result",
  forbiddenActions: [
    "editing product files",
    "receiving the author transcript",
    "approving or merging",
    "delegation",
    "self-review",
    "installing tools",
    "network access outside the host",
    "working around permission denials or safety holds",
    "editing Atlas memory files",
  ],
  prompt: PROMPT,
  profile: "review",
  description: "Cold review and audit; records governed reviews. Read-only: reads and searches files, runs allowlisted analyzers and probes in a scratch copy, never edits. Returns a cited APPROVE/FIX_FIRST/REJECT verdict.",
  skills: ["lucy-review", "lucy-lens", "team-stack"],
  workResult: "review-work-result-v1",
  writeRoots: false,
  strictResume: true,
  atlasMemory: false,
  toolkit: false,
  review: true,
  mcp: [],
})
