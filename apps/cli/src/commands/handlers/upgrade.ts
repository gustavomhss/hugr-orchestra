import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import { InstallationVersion } from "@orchestra/core/installation/version"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Spawn } from "../../services/process"
import { upgradeCommand, upgradeMethod } from "./upgrade-method"

const PACKAGE = "@humanguardrail/cli"
const REPO = "gustavomhss/hugr-orchestra"

export default Runtime.handler(
  Commands.commands.upgrade,
  Effect.fn("cli.upgrade")(function* (input) {
    const current = InstallationVersion
    const target = (Option.getOrUndefined(input.target) ?? (yield* latestVersion())).replace(/^v/, "")

    if (current === target) {
      process.stdout.write(`Orchestra upgrade skipped: ${target} is already installed` + EOL)
      return
    }

    const chosen = Option.getOrUndefined(input.method)
    const method = chosen === "github" ? "curl" : (chosen ?? upgradeMethod(process.execPath))
    const command = upgradeCommand(method, `${PACKAGE}@${target}`)
    if (method === "desktop") {
      process.stdout.write(`Orchestra ${current} -> ${target}. This CLI ships inside the desktop app; update the app instead.` + EOL)
      return
    }
    if (!command) {
      process.stdout.write(
        [
          `Orchestra ${current} -> ${target}`,
          method === "curl"
            ? "Download the release archive from https://github.com/gustavomhss/hugr-orchestra/releases and run its install.sh."
            : `Could not tell how Orchestra was installed. Run the command for your package manager, e.g. npm install -g ${PACKAGE}@${target}, or reinstall from https://github.com/gustavomhss/hugr-orchestra/releases.`,
        ].join(EOL) + EOL,
      )
      return
    }

    process.stdout.write(`Upgrading ${current} -> ${target} with ${command[0]}...` + EOL)
    const result = yield* Spawn.run(command, { extendEnv: true })
    if (result.exitCode !== 0) {
      return yield* Effect.fail(new Error(`${command[0]} install failed (exit ${result.exitCode}): ${result.stderr.trim()}`))
    }
    process.stdout.write(`Upgraded to ${target}. Restart any running Orchestra sessions.` + EOL)
  }),
)

const latestVersion = Effect.fn("cli.upgrade.latest")(function* () {
  const response = yield* Effect.tryPromise(() =>
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "orchestra-cli" },
    }),
  )
  if (!response.ok) return yield* Effect.fail(new Error(`Failed to look up the latest version (HTTP ${response.status})`))
  const release = yield* Effect.promise(() => response.json() as Promise<{ tag_name?: string }>)
  if (release.tag_name === undefined) return yield* Effect.fail(new Error(`GitHub release response had no tag_name`))
  return release.tag_name
})