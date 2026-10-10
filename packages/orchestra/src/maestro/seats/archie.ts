import PROMPT from "../../agent/prompt/archie.txt"
import { define } from "./seat"

export default define({
  id: "archie",
  role: "product, architecture, specification and planning",
  abilityClass: "scoped proposal authoring",
  returnCard: "upstream-result",
  forbiddenActions: [
    "inventing owner facts or approval",
    "product implementation",
    "dispatch or workflow execution",
    "delegation",
    "self-approval or acceptance claims",
    "commit, push, branch, merge or pull request",
    "installing tools",
    "working around permission denials or safety holds",
    "editing Atlas memory files",
  ],
  prompt: PROMPT,
  profile: "execution",
  profileKey: "upstream",
  description:
    "Upstream product, architecture, specification and planning specialist. Use it to author or revise requirements, technical proposals, roadmaps, decomposition, tasks, work packages and briefs. Edits only dispatch writePaths; read-only without them. Returns attributed proposals, source references, blockers and next actions. Does not implement products, approve scope, dispatch work or execute workflows.",
  labelEnv: "HUGR_UPSTREAM_NAME",
  skills: ["archie-plan", "archie-work-package"],
  workResult: "upstream-work-result-v1",
  writeRoots: true,
  strictResume: true,
  atlasMemory: false,
  toolkit: false,
})
