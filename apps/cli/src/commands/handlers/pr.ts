import { EOL } from "os"
import path from "path"
import { Effect } from "effect"
import { access } from "node:fs/promises"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Spawn } from "../../services/process"

const hasDirectory = (directory: string) =>
  Effect.tryPromise(() => access(directory)).pipe(
    Effect.map(() => true),
    Effect.catch(() => Effect.succeed(false)),
  )

export default Runtime.handler(
  Commands.commands.pr,
  Effect.fn("cli.pr")(function* (input) {
    const cwd = process.cwd()
    if (!(yield* hasDirectory(path.join(cwd, ".git")))) {
      return yield* Effect.fail(new Error("Could not find git repository. Please run this command from a git repository."))
    }

    const branch = `pr/${input.number}`
    process.stdout.write(`Fetching and checking out PR #${input.number}...` + EOL)
    const checkout = yield* Spawn.run(["gh", "pr", "checkout", String(input.number), "--branch", branch, "--force"], {
      cwd,
    })
    if (checkout.exitCode !== 0) {
      return yield* Effect.fail(
        new Error(
          `Failed to checkout PR #${input.number}${checkout.stderr.trim() ? `: ${checkout.stderr.trim()}` : ""}. Make sure you have gh CLI installed and authenticated.`,
        ),
      )
    }

    const view = yield* Spawn.run(["gh", "pr", "view", String(input.number), "--json", "url"], { cwd })
    const url = view.exitCode === 0 && view.stdout.trim() ? JSON.parse(view.stdout).url : undefined
    process.stdout.write(`Successfully checked out PR #${input.number} as branch '${branch}'` + EOL)
    if (url) process.stdout.write(url + EOL)
  }),
)