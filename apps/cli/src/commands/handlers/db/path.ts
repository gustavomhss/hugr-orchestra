import { EOL } from "os"
import { Effect } from "effect"
import { Database } from "@orchestra/core/database/database"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"

export default Runtime.handler(Commands.commands.db.commands.path, () =>
  Effect.sync(() => process.stdout.write(Database.path() + EOL)),
)