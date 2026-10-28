import type { Issue } from "./graph"
import type { useRelayCopy } from "./ui"

type CopyKey = Parameters<ReturnType<typeof useRelayCopy>["t"]>[0]

// The server's compile messages, matched by their wording, with plain copy for each. `covered` lists the client issues
// that already say the same thing: the message is then left out of the list.
export const SERVER_ISSUES: { match: RegExp; key: CopyKey; covered?: string[] }[] = [
  { match: /^Add at least one step/, key: "orchestra.workflows.editor.serverIssue.noSteps", covered: ["no-steps"] },
  { match: /^Add at least one action/, key: "orchestra.workflows.editor.serverIssue.noAction", covered: ["no-action"] },
  {
    match: /^Criterion IDs must be unique/,
    key: "orchestra.workflows.editor.serverIssue.duplicateCheck",
    covered: ["check-duplicate"],
  },
  { match: /contiguous stretch/, key: "orchestra.workflows.editor.serverIssue.phase" },
  { match: /cycles/, key: "orchestra.workflows.editor.serverIssue.cycle", covered: ["cycle"] },
  {
    match: /^Remove branches|^Relay accepts one sequential output|^A hook output accepts one next step/,
    key: "orchestra.workflows.editor.serverIssue.branches",
    covered: ["branches"],
  },
  {
    match: /^Connect every step|^Some steps are disconnected|^A connection points to a missing step|^Connect the event/,
    key: "orchestra.workflows.editor.serverIssue.loose",
    covered: ["loose", "hook-loose"],
  },
  { match: /^Message must be/, key: "orchestra.workflows.editor.serverIssue.message", covered: ["message-empty"] },
  {
    match: /^Criteria must be|^A criterion must be/,
    key: "orchestra.workflows.editor.serverIssue.checks",
    covered: ["checklist-invalid"],
  },
  {
    match: /has no cmd, judge or host_check/,
    key: "orchestra.workflows.editor.serverIssue.checkEmpty",
    covered: ["check-empty"],
  },
  { match: /no Relay implementation/, key: "orchestra.workflows.editor.serverIssue.unknownStep" },
  { match: /^Skill unavailable/, key: "orchestra.workflows.editor.serverIssue.skill", covered: ["skill-missing"] },
  { match: /retry budget must be/, key: "orchestra.workflows.editor.serverIssue.budget" },
  { match: /start stays outside every phase/, key: "orchestra.workflows.editor.serverIssue.startPhase" },
  {
    match: /^A hook needs exactly one event/,
    key: "orchestra.workflows.editor.serverIssue.oneEvent",
    covered: ["no-trigger", "trigger-count"],
  },
  {
    match: /need an event before the effect/,
    key: "orchestra.workflows.editor.serverIssue.before",
    covered: ["needs-before"],
  },
]

// The issues to show: a server message is left out when a client issue already says the same thing.
export function shownIssues(issues: Issue[]) {
  const codes = new Set<string>(issues.map((issue) => issue.code))
  return issues.filter(
    (issue) =>
      issue.code !== "server" ||
      !SERVER_ISSUES.find((entry) => entry.match.test(issue.text))?.covered?.some((code) => codes.has(code)),
  )
}
