// @atlas/cli — src/review-cli.ts  (the review-log commands' table: R2 hold/release, R3 propose/proposals/decide,
// R11 interview/answer)
//
// `main` (cli.ts) looks a command up here before its own interceptors, so a review command adds no line to cli.ts,
// which sits at its godfile waiver. Each runner lives in its own file; this table only binds a name to a runner.
// A name that is not yet in `COMMANDS` (map.ts) is unreachable — `parse` refuses it — so a runner can land and be
// tested before the task that publishes its command (docs page, README row, map/parse entries).

import type { CommandTable } from "./cli-dispatch.js"

export const REVIEW_COMMANDS: CommandTable = {}
