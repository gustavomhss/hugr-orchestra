import PROMPT from "./prompt/jimmy.txt"
import { define } from "./seat"

export default define({
  id: "jimmy",
  role: "codebase exploration",
  abilityClass: "read-only discovery",
  returnCard: "jimmy-result",
  forbiddenActions: ["ratify alone", "edit product"],
  prompt: PROMPT,
  profile: "discovery",
  description: "Technical discovery and research specialist. Locates and explains code, investigates behavior, compares solutions and researches primary sources. Read-only product access; writes only native research documents/corpus and its bound Atlas Memory. Returns cited findings, coverage, limits and next steps. Give the question and relevant scope; incomplete exploratory briefs are valid.",
  skills: ["jimmy-discovery", "jimmy-research"],
  workResult: "discovery-work-result-v1",
  writeRoots: false,
  strictResume: true,
  atlasMemory: true,
  toolkit: false,
})
