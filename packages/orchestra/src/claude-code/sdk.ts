export * as ClaudeCodeSDK from "./sdk"

import { Context, Layer, Option, Schema } from "effect"
import { query } from "@anthropic-ai/claude-agent-sdk"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { homedir, userInfo } from "node:os"
import { join } from "node:path"

type QueryOptions = NonNullable<Parameters<typeof query>[0]["options"]>

/** Explicit environment injection for producers; the SDK helper also accepts options.env. */
export const Environment = Context.Reference<NonNullable<QueryOptions["env"]>>("@orchestra/ClaudeCodeSDK/Environment", {
  defaultValue: () => process.env,
})

/** SDK 0.3.289 Query.return races waitForExit against 2000ms, so it is not an exit receipt. */
export function processLifetime(options: QueryOptions) {
  const env = machineEnvironment(options.env ?? process.env)
  const exits: Promise<void>[] = []
  return {
    options: {
      ...options,
      env,
      spawnClaudeCodeProcess: (input) => {
        // CLI oW/Hh give --bare an API-only path ahead of the host-managed OAuth path.
        if (input.args.includes("--bare")) throw new Error("Claude Code bare mode cannot enforce machine OAuth login")
        const environment = machineEnvironment(input.env)
        const login = requireMachineLogin(environment)
        // Pinned CLI yK selects this token first; nc/Hh and settings-env u exclude all settings-sourced auth/routing.
        environment.CLAUDE_CODE_OAUTH_TOKEN = login.accessToken
        environment.CLAUDE_CODE_OAUTH_SCOPES = login.scopes.join(" ")
        if (login.subscriptionType) environment.CLAUDE_CODE_SUBSCRIPTION_TYPE = login.subscriptionType
        if (login.rateLimitTier) environment.CLAUDE_CODE_RATE_LIMIT_TIER = login.rateLimitTier
        const spawner = options.spawnClaudeCodeProcess ?? ((input) => {
          const child = spawn(input.command, input.args, {
            cwd: input.cwd, env: input.env, signal: input.signal,
            stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
          })
          child.stderr.on("data", (data: Buffer) => options.stderr?.(data.toString()))
          child.stderr.on("error", () => {})
          return child
        })
        const child = spawner({ ...input, env: environment })
        // Install before returning to the SDK, including its abort handling. Abort errors do not prove exit.
        exits.push(new Promise<void>((resolve, reject) => {
          const exited = () => { child.off("error", failed); resolve() }
          const failed = (error: Error) => {
            if (!("syscall" in error) || typeof error.syscall !== "string" || !error.syscall.startsWith("spawn")) return
            child.off("exit", exited)
            reject(error)
          }
          child.once("error", failed)
          child.once("exit", exited)
          if (child.exitCode !== null || child.signalCode != null) {
            child.off("exit", exited)
            exited()
          }
        }))
        // A failed spawn can precede query disposal; retain the rejection for join without an unhandled rejection.
        exits.at(-1)?.catch(() => {})
        return child
      },
    } satisfies QueryOptions,
    join: async (): Promise<void> => {
      const failed = (await Promise.allSettled(exits)).find((exit) => exit.status === "rejected")
      if (failed?.status === "rejected") throw failed.reason
    },
  }
}

function machineEnvironment(env: NonNullable<QueryOptions["env"]>): Record<string, string> {
  // Allowlist rather than a finite denylist: new API/backend/host-auth overrides must not leak through.
  const essentials = new Set([
    "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC",
    "USER", "LOGNAME", "USERNAME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE", "TZ",
    "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "CLAUDE_CONFIG_DIR", "CLAUDE_SECURESTORAGE_CONFIG_DIR",
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR",
    "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_AGENT_SDK_VERSION", "CLAUDE_CODE_SDK_READS_SESSION_STATE",
    "CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING", "CLAUDE_CODE_PROJECT_DIR_NAME",
  ])
  return {
    ...Object.fromEntries(Object.entries(env).filter(([key, value]) => value !== undefined && essentials.has(key.toUpperCase()))),
    // Launch-only CLI capability. Settings cannot unset it or replace the selected credential/provider.
    CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: "1",
  }
}

const credentials = Schema.Struct({ claudeAiOauth: Schema.Struct({
  accessToken: Schema.NonEmptyString,
  refreshToken: Schema.optional(Schema.NonEmptyString),
  expiresAt: Schema.Number,
  scopes: Schema.Array(Schema.String),
  subscriptionType: Schema.optional(Schema.NullOr(Schema.String)),
  rateLimitTier: Schema.optional(Schema.NullOr(Schema.String)),
}) })
const decodeCredentials = Schema.decodeUnknownOption(Schema.fromJsonString(credentials))

function requireMachineLogin(env: NonNullable<QueryOptions["env"]>) {
  const directory = env.CLAUDE_CONFIG_DIR ?? join(env.HOME ?? env.USERPROFILE ?? homedir(), ".claude")
  const file = join(directory, ".credentials.json")
  // Match pinned SDK z2/JBe keychain naming, including isolated config directories. No model/API probe.
  const secure = env.CLAUDE_SECURESTORAGE_CONFIG_DIR
  const suffix = (secure !== undefined ? !secure : !env.CLAUDE_CONFIG_DIR)
    ? "" : "-" + createHash("sha256").update((secure ?? directory).normalize("NFC")).digest("hex").slice(0, 8)
  const account = (() => {
    try { return env.USER || userInfo().username } catch { return "claude-code-user" }
  })()
  const keychain = process.platform === "darwin" && (!env.CLAUDE_CONFIG_DIR || !existsSync(file)) ? spawnSync("/usr/bin/security", [
    "find-generic-password", "-a", /^[a-zA-Z0-9._-]+$/.test(account) ? account : "claude-code-user",
    "-w", "-s", "Claude Code-credentials" + suffix,
  ], { env, encoding: "utf8", timeout: 5000, windowsHide: true }) : undefined
  const parsed = decodeCredentials(keychain?.status === 0 && keychain.stdout.trim()
    ? keychain.stdout : existsSync(file) ? readFileSync(file, "utf8") : "")
  // Explicit env OAuth has no refresh token in pinned CLI yK/EK: expired local access tokens must fail closed.
  if (Option.isSome(parsed) && parsed.value.claudeAiOauth.scopes.includes("user:inference") &&
    parsed.value.claudeAiOauth.expiresAt > Date.now()) return parsed.value.claudeAiOauth
  throw new Error("Claude Code machine login unavailable; run claude auth login with a Claude subscription")
}

/** The Claude Agent SDK entry point, behind a service so tests can script a session. */
export interface Interface {
  readonly query: typeof query
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/ClaudeCodeSDK") {}

export const layer = Layer.succeed(Service, Service.of({ query }))

export const node = LayerNode.make({ service: Service, layer, deps: [] })
