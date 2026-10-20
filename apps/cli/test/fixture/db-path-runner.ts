import { Effect } from "effect"
import pathHandler from "../../src/commands/handlers/db/path"

await Effect.runPromise(pathHandler({}))