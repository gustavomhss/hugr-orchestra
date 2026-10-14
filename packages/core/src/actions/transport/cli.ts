export * as ActionsCli from "./cli"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { which } from "../../util/which"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"

export const names = { github: "gh", gitlab: "glab" } as const

export function error(provider: Actions.Provider, kind: Actions.ErrorKind, message: string, disposition: Actions.SendDisposition = "unknown") {
  return new ActionsError({ kind, message, provider: provider.kind, disposition })
}

export const target = Effect.fn("ActionsTransport.target")(function* (provider: Actions.Provider) {
  const host = URL.parse(`https://${provider.hostname}`)
  if (!host || host.host !== provider.hostname || host.pathname !== "/" || host.username || host.password || host.search || host.hash)
    return yield* error(provider, "host_mismatch", "Provider hostname must be an explicit canonical HTTPS host", "definitely_unsent")
  const origin = provider.kind === "github" && provider.hostname === "github.com"
    ? "https://api.github.com"
    : host.origin
  const base = provider.kind === "gitlab" ? `${origin}/api/v4` : `${origin}/api/v3`
  if (provider.apiOrigin !== origin && (provider.hostname === "github.com" || provider.apiOrigin !== base))
    return yield* error(provider, "host_mismatch", "Provider API origin does not match the CLI hostname", "definitely_unsent")
  if ((provider.kind === "gitlab" && provider.hostname === "github.com") ||
      (provider.kind === "github" && provider.hostname === "gitlab.com"))
    return yield* error(provider, "host_mismatch", "Provider kind does not match the hostname", "definitely_unsent")
  const executable = which(names[provider.kind])
  if (!executable) return yield* error(provider, "cli_missing", `${names[provider.kind]} is not installed on this server`, "definitely_unsent")
  return executable
})

export const endpoint = Effect.fn("ActionsTransport.endpoint")(function* (provider: Actions.Provider, input: ActionsContract.Request) {
  // Raw CLI/URL syntax is separate from encoded segment data. An encoded slash
  // belongs to one native GitLab project/file argument, never a new URL authority.
  const segments = yield* Effect.try({
    try: () => input.path.replace(/^\//, "").split("/").map(decodeURIComponent),
    catch: () => error(provider, "invalid_input", "Request path has invalid URL encoding", "definitely_unsent"),
  })
  if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(input.method) ||
      !/^\/?[A-Za-z0-9_]/.test(input.path) || /[\s\\?#{}:]/.test(input.path) ||
      segments.some((segment) => /\\|%[0-9a-f]{2}|[\x00-\x1f\x7f]/i.test(segment) ||
        segment.split("/").some((part) => !part || part === "." || part === "..")))
    return yield* error(provider, "invalid_input", "Request path must be a literal relative API endpoint", "definitely_unsent")
  const entries = Object.entries(input.query ?? {})
  if (entries.some(([key, value]) => !/^[\w[\].-]+$/.test(key) ||
      /token|secret|password|authorization|private.?key|^value$/i.test(key) ||
      (typeof value === "number" && !Number.isFinite(value))))
    return yield* error(provider, "invalid_input", "Sensitive values belong in JSON stdin, not query arguments", "definitely_unsent")
  const query = new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()
  return `${input.path.replace(/^\//, "")}${query ? `?${query}` : ""}`
})

export function command(directory: string, provider: Actions.Provider, executable: string, args: readonly string[], stdin: "pipe" | "ignore") {
  const env = {
    GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", GH_DEBUG: "", GH_FORCE_TTY: "",
    GLAB_NO_PROMPT: "1", GLAB_CHECK_UPDATE: "false", GLAB_SHOW_WHATS_NEW: "false",
    GLAB_NOTIFY_SKILL_UPDATES: "false", GLAB_DEBUG: "false", GLAB_DEBUG_HTTP: "false",
    GLAB_SEND_TELEMETRY: "false", CI: "false", GITLAB_CI: "false",
    NO_COLOR: "1", CLICOLOR: "0", CLICOLOR_FORCE: "0", FORCE_COLOR: "0", TERM: "dumb",
    GH_PAGER: "", GLAB_PAGER: "", PAGER: "",
    // A nonempty slash overrides glab's configured subfolder and trims to root.
    GITLAB_API_HOST: provider.hostname, GLAB_API_PROTOCOL: "https", GITLAB_SUBFOLDER: "/",
  }
  return ChildProcess.make(executable, args, {
    cwd: directory,
    shell: false,
    extendEnv: false,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !Object.keys(env).some((name) => name === key.toUpperCase()))),
      ...env,
    },
    stdin,
    stdout: "pipe",
    stderr: "pipe",
    forceKillAfter: "1 second",
  })
}

export function args(provider: Actions.Provider, input: ActionsContract.Request, path: string, metadata: boolean) {
  return [
    "api", "--hostname", provider.hostname, "--method", input.method,
    ...(metadata ? ["--include"] : []),
    ...(provider.kind === "github" && provider.hostname === "github.com"
      ? ["--header", "X-GitHub-Api-Version: 2026-03-10"] : []),
    ...(input.body === undefined ? [] : ["--header", "Content-Type: application/json", "--input", "-"]),
    "--", path,
  ]
}
