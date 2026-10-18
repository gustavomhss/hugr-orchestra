import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import { Effect, Layer, Schema, Context } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { withTransientReadRetry } from "@/util/effect-http-client"
import { serviceUse } from "@orchestra/core/effect/service-use"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "@orchestra/core/process"
import { Global } from "@orchestra/core/global"
import path from "path"
import { makeRuntime } from "@orchestra/core/effect/runtime"
import semver from "semver"
import { InstallationChannel, InstallationVersion } from "@orchestra/core/installation/version"
import { InstallationEvent } from "@orchestra/schema/installation-event"

export type Method = "curl" | "npm" | "yarn" | "pnpm" | "bun" | "brew" | "scoop" | "choco" | "desktop" | "unknown"

export type ReleaseType = "patch" | "minor" | "major"

export const Event = InstallationEvent

export function getReleaseType(current: string, latest: string): ReleaseType {
  const currMajor = semver.major(current)
  const currMinor = semver.minor(current)
  const newMajor = semver.major(latest)
  const newMinor = semver.minor(latest)

  if (newMajor > currMajor) return "major"
  if (newMinor > currMinor) return "minor"
  return "patch"
}

export const Info = Schema.Struct({
  version: Schema.String,
  latest: Schema.String,
}).annotate({ identifier: "InstallationInfo" })
export type Info = Schema.Schema.Type<typeof Info>

export function userAgent(client = "cli") {
  return `orchestra/${InstallationChannel}/${InstallationVersion}/${client}`
}

export const USER_AGENT = userAgent()

export function isPreview() {
  return InstallationChannel !== "latest"
}

export function isLocal() {
  return InstallationChannel === "local"
}

export class UpgradeFailedError extends Schema.TaggedErrorClass<UpgradeFailedError>()("UpgradeFailedError", {
  stderr: Schema.String,
}) {
  override get message() {
    return this.stderr
  }
}

const GitHubRelease = Schema.Struct({ tag_name: Schema.String })

export const PACKAGE = "@hugr/cli"
export const FORMULA = "gustavomhss/tap/orchestra"

// The desktop app ships its own copy of the CLI in Resources/cli; that copy is updated with the app.
export function isDesktopBundle(execPath: string) {
  return ["/Resources/cli/", "/resources/cli/", "\\resources\\cli\\"].some((directory) => execPath.includes(directory))
}

export interface Interface {
  readonly info: () => Effect.Effect<Info>
  readonly method: () => Effect.Effect<Method>
  readonly latest: (method?: Method) => Effect.Effect<string>
  readonly upgrade: (method: Method, target: string) => Effect.Effect<void, UpgradeFailedError>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/Installation") {}

export const use = serviceUse(Service)

const layer: Layer.Layer<Service, never, HttpClient.HttpClient | AppProcess.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const http = HttpClient.filterStatusOk(withTransientReadRetry(yield* HttpClient.HttpClient))
    const appProcess = yield* AppProcess.Service

    const text = Effect.fnUntraced(
      function* (cmd: string[]) {
        // Package managers read project files from their cwd, and some run them (yarn's .yarnrc yarn-path, pnpm's packageManager,
        // bunfig.toml). The process cwd is the workspace, which a sandboxed command can write; Orchestra's state directory it cannot.
        const result = yield* appProcess.run(ChildProcess.make(cmd[0], cmd.slice(1), { cwd: Global.Path.state, extendEnv: true }))
        return result.stdout.toString("utf8")
      },
      Effect.catch(() => Effect.succeed("")),
    )

    const run = Effect.fnUntraced(
      function* (cmd: string[]) {
        const result = yield* appProcess.run(
          ChildProcess.make(cmd[0], cmd.slice(1), { cwd: Global.Path.state, extendEnv: true }),
        )
        return { code: result.exitCode, stderr: result.stderr.toString("utf8") }
      },
      Effect.catch((err) => Effect.succeed({ code: 1, stderr: err instanceof Error ? err.message : String(err) })),
    )

    const result: Interface = {
      info: Effect.fn("Installation.info")(function* () {
        return {
          version: InstallationVersion,
          latest: yield* result.latest(),
        }
      }),
      method: Effect.fn("Installation.method")(function* () {
        if (isDesktopBundle(process.execPath)) return "desktop" as Method
        if (process.execPath.includes(path.join(".orchestra", "bin"))) return "curl" as Method
        if (process.execPath.includes(path.join(".local", "bin"))) return "curl" as Method
        const exec = process.execPath.toLowerCase()

        const checks: Array<{ name: Method; command: () => Effect.Effect<string> }> = [
          { name: "npm", command: () => text(["npm", "list", "-g", "--depth=0"]) },
          { name: "yarn", command: () => text(["yarn", "global", "list"]) },
          { name: "pnpm", command: () => text(["pnpm", "list", "-g", "--depth=0"]) },
          { name: "bun", command: () => text(["bun", "pm", "ls", "-g"]) },
          { name: "brew", command: () => text(["brew", "list", "--formula", "orchestra"]) },
          { name: "scoop", command: () => text(["scoop", "list", "orchestra"]) },
          { name: "choco", command: () => text(["choco", "list", "--limit-output", "orchestra"]) },
        ]

        checks.sort((a, b) => {
          const aMatches = exec.includes(a.name)
          const bMatches = exec.includes(b.name)
          if (aMatches && !bMatches) return -1
          if (!aMatches && bMatches) return 1
          return 0
        })

        for (const check of checks) {
          const output = yield* check.command()
          const installedName =
            check.name === "brew" || check.name === "choco" || check.name === "scoop" ? "orchestra" : PACKAGE
          if (output.includes(installedName)) {
            return check.name
          }
        }

        return "unknown" as Method
      }),
      latest: Effect.fn("Installation.latest")(
        function* () {
          const response = yield* http.execute(
            HttpClientRequest.get("https://api.github.com/repos/gustavomhss/hugr-orchestra/releases/latest").pipe(
              HttpClientRequest.acceptJson,
            ),
          )
          const data = yield* HttpClientResponse.schemaBodyJson(GitHubRelease)(response)
          return data.tag_name.replace(/^v/, "")
        },
        // A failed lookup must never break startup or the update notice: report the running version.
        Effect.catchCause(() => Effect.succeed(InstallationVersion)),
      ),
      upgrade: Effect.fn("Installation.upgrade")(function* (method: Method, target: string) {
        const command = upgradeCommand(method, target)
        if (typeof command === "string") return yield* new UpgradeFailedError({ stderr: command })
        const outcome = yield* run(command)
        if (outcome.code === 0) return
        return yield* new UpgradeFailedError({
          stderr: outcome.stderr.trim() || `${command.join(" ")} failed (exit code ${outcome.code}).`,
        })
      }),
    }

    return Service.of(result)
  }),
)

// The argv that upgrades this install, or the instruction to show when Orchestra cannot upgrade it itself.
export function upgradeCommand(method: Method, target: string): string[] | string {
  if (method === "npm") return ["npm", "install", "-g", `${PACKAGE}@${target}`]
  if (method === "pnpm") return ["pnpm", "add", "-g", `${PACKAGE}@${target}`]
  if (method === "bun") return ["bun", "add", "-g", `${PACKAGE}@${target}`]
  if (method === "yarn") return ["yarn", "global", "add", `${PACKAGE}@${target}`]
  if (method === "brew") return ["brew", "upgrade", FORMULA]
  if (method === "curl")
    return "Download the release archive from https://github.com/gustavomhss/hugr-orchestra/releases and run its install.sh."
  if (method === "desktop") return "This CLI belongs to the Orchestra desktop app. Update the desktop app instead."
  if (method === "scoop" || method === "choco") return `Orchestra has no ${method} package. Reinstall with npm i -g ${PACKAGE}.`
  return "Orchestra could not tell how it was installed. On Arch Linux run `paru -Syu orchestra-bin`; otherwise reinstall with npm i -g @hugr/cli."
}

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [AppProcess.node, LayerNodePlatform.httpClient],
})

const { runPromise } = makeRuntime(Service, AppNodeBuilder.build(node))

export const latest = (...args: Parameters<Interface["latest"]>) => runPromise((s) => s.latest(...args))
export const method = () => runPromise((s) => s.method())
export const upgrade = (...args: Parameters<Interface["upgrade"]>) => runPromise((s) => s.upgrade(...args))

export * as Installation from "."
