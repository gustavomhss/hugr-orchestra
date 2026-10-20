// @atlas/cli — src/review-cli.ts  (the review-log commands' table: R2 hold/release, R3 propose/proposals/decide,
// R11 interview/answer)
//
// `main` (cli.ts) looks a command up here before its own interceptors, so a review command adds no line to cli.ts,
// which sits at its godfile waiver. Each runner lives in its own file; this table only binds a name to a runner.
// A name that is not yet in `COMMANDS` (map.ts) is unreachable — `parse` refuses it — so a runner can land and be
// tested before the task that publishes its command (docs page, README row, map/parse entries).

import type { CommandTable } from "./cli-dispatch.js"
import { emitCli } from "./cli-verdict.js"
import { holdPorts, runHold, runRelease } from "./hold-cli.js"
import { ratifyPorts, runDecide, runProposals, runPropose } from "./ratify-cli.js"
import { interviewPorts, runAnswer, runInterview } from "./interview-cli.js"

export const REVIEW_COMMANDS: CommandTable = {
  hold: (input) => emitCli(runHold(holdPorts(), input.positionals, input.flags)),
  release: (input) => emitCli(runRelease(holdPorts(), input.positionals, input.flags)),
  propose: (input) => emitCli(runPropose(ratifyPorts(input.deps), input.positionals, input.flags)),
  proposals: (input) => emitCli(runProposals(ratifyPorts(input.deps))),
  decide: (input) => emitCli(runDecide(ratifyPorts(input.deps), input.positionals, input.flags)),
  interview: (input) => emitCli(runInterview(interviewPorts(), input.flags)),
  answer: (input) => emitCli(runAnswer(interviewPorts(), input.positionals, input.flags)),
}
