import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import { InstallationVersion } from "@orchestra/core/installation/version"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Spawn } from "../../services/process"

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

    if (input.method === "github") {
      process.stdout.write(
        [
          `Orchestra ${current} -> ${target}`,
          "Download the release archive from https://github.com/gustavomhss/hugr-orchestra/releases and run its install.sh.",
        ].join(EOL) + EOL,
      )
      return
    }

    process.stdout.write(`Upgrading ${current} -> ${target} with npm...` + EOL)
    const result = yield* Spawn.run(["npm", "install", "-g", `${PACKAGE}@${target}`], { extendEnv: true })
    if (result.exitCode !== 0) {
      return yield* Effect.fail(new Error(`npm install failed (exit ${result.exitCode}): ${result.stderr.trim()}`))
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