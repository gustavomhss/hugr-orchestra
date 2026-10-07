import PROMPT from "../../agent/prompt/backend.txt"
import { define } from "./seat"

// The reference seat (specs/backend-specialist). Its default label is BACKEND_DEFAULT_LABEL in maestro/roster.ts.
export default define({
  id: "backend",
  role: "backend execution",
  abilityClass: "scoped repository write",
  returnCard: "backend-result",
  forbiddenActions: [
    "investigation or diagnosis",
    "architecture or scope decisions",
    "delegation",
    "self-review",
    "claims of verification or acceptance",
    "commit, push, branch, merge or pull request",
    "installing tools",
    "working around permission denials or safety holds",
    "editing Atlas memory files",
  ],
  prompt: PROMPT,
  profile: "execution",
  description:
    "Backend implementation specialist. Use it to implement one complete backend work packet: the target behavior with its acceptance, the write paths, and the checks to run. Edits only dispatch writePaths; read-only without them. Runs shell commands. Returns the change, check evidence and blockers. Not for investigation, diagnosis, design or review.",
  labelEnv: "HUGR_BACKEND_NAME",
  skills: [
    "backend-implement",
    "backend-api",
    "backend-data",
    "backend-concurrency",
    "backend-refactor",
    "backend-check",
  ],
  workResult: "backend-work-result-v1",
  writeRoots: true,
  strictResume: true,
  atlasMemory: true,
  toolkit: true,
})
