export * as ToolSafetyGit from "./tool-safety-git"

import path from "path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { FSUtil } from "./fs-util"
import { AppProcess } from "./process"
import { ToolSafety } from "./tool-safety"
import { ToolSafetySandbox } from "./tool-safety-sandbox"

/** A closed literal POSIX subset, not a shell security parser. Unknown staging placement is a HOLD. */
export function commands(text: string) {
  const result: string[][] = []
  const current: string[] = []
  const token = { text: "", quote: "", started: false }
  const flush = () => {
    if (token.started) current.push(token.text)
    token.text = ""
    token.started = false
  }
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (token.quote) {
      if (char === token.quote) { token.quote = ""; continue }
      if (token.quote === '"' && /[$`\\]/.test(char)) throw new Error("git-hygiene-dynamic-command")
      token.text += char
      continue
    }
    if (char === "'" || char === '"') { token.quote = char; token.started = true; continue }
    if (char === "\\") {
      if (index + 1 === text.length) throw new Error("git-hygiene-incomplete-command")
      token.text += text[++index]
      token.started = true
      continue
    }
    if (/[$`()<>]/.test(char)) throw new Error("git-hygiene-dynamic-command")
    if (char === ";" || char === "\n" || char === "&" || char === "|") {
      if ((char === "&" || char === "|") && text[index + 1] !== char)
        throw new Error("git-hygiene-unsupported-shell-operator")
      if (char === "&" || char === "|") index++
      flush()
      if (current.length) result.push(current.splice(0))
      continue
    }
    if (/\s/.test(char)) { flush(); continue }
    token.started = true
    token.text += char
  }
  if (token.quote) throw new Error("git-hygiene-incomplete-command")
  flush()
  if (current.length) result.push(current)
  return result
}

export const before = Effect.fn("ToolSafetyGit.before")(function* (input: {
  command: string
  directory: string
  projectDirectory?: string
  cwd?: string
  env?: NodeJS.ProcessEnv
  managedPaths?: ReadonlyArray<string>
  neverTouch?: ReadonlyArray<string>
}) {
  if (!/\bgit\b[^\n;&|]*\b(?:add|commit)\b/.test(input.command)) return
  const fs = yield* FSUtil.Service
  const processService = yield* AppProcess.Service
  const env = input.env ?? ToolSafetySandbox.environment()
  if (["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT"].some((key) => env[key]))
    return yield* new ToolSafety.Denied({ reason: "git-hygiene-placement-environment" })
  const parsed = yield* Effect.try({
    try: () => commands(input.command),
    // The parser names the construct it refused; keep that code so the HOLD can say what to change.
    catch: (error) => new ToolSafety.Denied({
      reason: error instanceof Error && error.message.startsWith("git-hygiene-") ? error.message : "git-hygiene-command-acquisition",
    }),
  })
  const project = yield* fs.realPath(input.projectDirectory ?? input.directory).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "git-hygiene-project-acquisition" })),
  )
  const placement = { cwd: path.resolve(input.directory, input.cwd ?? ".") }
  const query = (cwd: string, args: string[]) => processService.run(ChildProcess.make("git", [
    "--no-optional-locks", "-C", cwd, "-c", "core.fsmonitor=false", ...args,
  ], { cwd, env: { ...env, GIT_OPTIONAL_LOCKS: "0" }, extendEnv: false, stdin: "ignore" }), {
    maxOutputBytes: 512 * 1024, maxErrorBytes: 1024, timeout: "10 seconds",
  }).pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "git-hygiene-query-acquisition" })),
    Effect.flatMap((result) => result.exitCode !== 0 || result.stdoutTruncated || result.stderrTruncated
      ? Effect.fail(new ToolSafety.Denied({ reason: "git-hygiene-query-failed-or-overflow" }))
      : Effect.succeed(result.stdout.toString("utf8"))))
  const names = (text: string) => {
    if (text !== "" && !text.endsWith("\0")) throw new Error("git-hygiene-path-list-invalid")
    const paths = text === "" ? [] : text.slice(0, -1).split("\0")
    if (paths.length > 10_000 || paths.some((entry) => !entry)) throw new Error("git-hygiene-path-list-overflow")
    return paths
  }
  for (const segment of parsed) {
    const tokens = segment.filter((token, index) => index !== 0 || token !== "env")
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0] ?? "")) {
      if (/^GIT_/.test(tokens[0])) return yield* new ToolSafety.Denied({ reason: "git-hygiene-placement-environment" })
      tokens.shift()
    }
    if (tokens[0] === "cd") {
      if (tokens.length !== 2) return yield* new ToolSafety.Denied({ reason: "git-hygiene-cwd-unparsed" })
      placement.cwd = yield* fs.realPath(path.resolve(placement.cwd, tokens[1])).pipe(
        Effect.mapError(() => new ToolSafety.Denied({ reason: "git-hygiene-cwd-acquisition" })),
      )
      continue
    }
    if (path.basename(tokens[0] ?? "") !== "git") {
      // A previous arbitrary command could change Git's index/config or cwd through a sourced script.
      if (segment !== parsed.at(-1)) return yield* new ToolSafety.Denied({ reason: "git-hygiene-preceding-command-unbound" })
      continue
    }
    const cwd = { value: placement.cwd }
    tokens.shift()
    while (tokens[0] === "-C" || tokens[0]?.startsWith("-C")) {
      const target = tokens.shift()?.slice(2) || tokens.shift()
      if (!target) return yield* new ToolSafety.Denied({ reason: "git-hygiene-cwd-unparsed" })
      cwd.value = path.resolve(cwd.value, target)
    }
    const operation = tokens.shift()
    if (operation !== "add" && operation !== "commit") {
      if (tokens.includes("add") || tokens.includes("commit"))
        return yield* new ToolSafety.Denied({ reason: "git-hygiene-global-option-unbound" })
      if (segment !== parsed.at(-1) && !["status", "diff", "log", "show", "ls-files", "rev-parse"].includes(operation ?? ""))
        return yield* new ToolSafety.Denied({ reason: "git-hygiene-preceding-command-unbound" })
      continue
    }
    const actual = yield* fs.realPath(cwd.value).pipe(
      Effect.mapError(() => new ToolSafety.Denied({ reason: "git-hygiene-cwd-acquisition" })),
    )
    const root = (yield* query(actual, ["rev-parse", "--show-toplevel"])).trim()
    if (!root || !(yield* fs.realPath(root).pipe(Effect.map((root) => FSUtil.contains(project, root)),
      Effect.mapError(() => new ToolSafety.Denied({ reason: "git-hygiene-root-acquisition" })))))
      return yield* new ToolSafety.Denied({ reason: "git-hygiene-root-outside-project" })
    const options = { all: false, force: false, dry: false, paths: [] as string[] }
    while (tokens.length) {
      const token = tokens.shift() ?? ""
      if (token === "--") { options.paths.push(...tokens); break }
      if (!token.startsWith("-")) { options.paths.push(token); continue }
      if (operation === "add") {
        if (["--all", "--update", "--force", "--dry-run", "--verbose"].includes(token) || /^-[Auvfn]+$/.test(token)) {
          options.all ||= token === "--update" || token.includes("u")
          options.force ||= token === "--force" || /^-[Auvfn]*f/.test(token)
          options.dry ||= token === "--dry-run" || /^-[Auvfn]*n/.test(token)
          continue
        }
      }
      if (operation === "commit") {
        if (token === "-m" || token === "--message") {
          if (tokens.shift() === undefined) return yield* new ToolSafety.Denied({ reason: "git-hygiene-message-unparsed" })
          continue
        }
        if (token.startsWith("--message=") || /^-m.+/.test(token)) continue
        if (["--all", "-a", "--amend", "--allow-empty", "--quiet", "-q", "--signoff", "-s"].includes(token)) {
          options.all ||= token === "--all" || token === "-a"
          continue
        }
      }
      return yield* new ToolSafety.Denied({ reason: "git-hygiene-stage-option-unbound" })
    }
    if (options.dry) continue
    const lists = operation === "commit"
      ? [yield* query(actual, ["diff", "--cached", "--name-only", "-z"]),
          ...(options.all || options.paths.length ? [yield* query(actual, ["ls-files", "--full-name", "-z", "--modified", "--deleted", "--", ...options.paths])] : [])]
      : [yield* query(actual, ["ls-files", "--full-name", "-z", "--cached", "--modified", "--deleted",
          ...(!options.all ? ["--others", ...(!options.force ? ["--exclude-standard"] : [])] : []), "--", ...options.paths])]
    const candidates = yield* Effect.try({ try: () => [...new Set(lists.flatMap(names))],
      catch: () => new ToolSafety.Denied({ reason: "git-hygiene-path-acquisition" }) })
    for (const entry of candidates) {
      const absolute = path.resolve(root, entry)
      const physical = yield* fs.realPath(absolute).pipe(
        Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(absolute)),
        Effect.mapError(() => new ToolSafety.Denied({ reason: "git-hygiene-path-acquisition" })),
      )
      // Closed source telemetry/cache spellings; native managed roots additionally cover actual host data/token files.
      if (/(?:^|\/)\.techlead\/|(?:^|\/)audit-[^/]*\.jsonl$|(?:^|\/)budget-[^/]*\.json$|(?:^|\/)preflight-[^/]*\.json$|(?:^|\/)techlead-policy\.json$|(?:^|\/)__pycache__(?:\/|$)|\.pyc$|(?:^|\/)agent-[0-9a-fA-F]{6,}\.jsonl$|\.output$/.test(entry) ||
        input.managedPaths?.some((managed) => FSUtil.contains(path.resolve(managed), physical)) ||
        input.neverTouch?.some((pattern) => fs.globMatch(pattern, entry) || fs.globMatch(pattern, physical) ||
          (!/[*?[]/.test(pattern) && FSUtil.contains(path.resolve(input.directory, pattern), physical))))
        return yield* new ToolSafety.Denied({ reason: "git-hygiene-managed-or-protected-data" })
    }
  }
})
