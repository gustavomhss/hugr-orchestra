export * as ToolSafetyGitHost from "./tool-safety-git-host"

import path from "path"
import { lstat, readFile, realpath, stat } from "node:fs/promises"
import { Effect, Scope } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { FSUtil } from "./fs-util"
import { Shell } from "./shell"
import { ToolSafety } from "./tool-safety"

// Git via host (owner decision 2026-10-11). Git cannot start inside the Windows AppContainer: it opens the NUL device,
// which no AppContainer may open. A confined command line that is exactly one read-only git call therefore runs on the
// host, and every other git call stays confined (refused with a named reason before launch).
//
// Host git executes commands named by its configuration (hooks, fsmonitor, pager, textconv and external diff, gpg,
// filter drivers, ...), and filter driver names cannot be overridden without knowing them. So host git only runs where
// the confined world cannot write git's configuration at all: the git directory, its common directory and their config
// must lie outside every write root, and a `.git` file must be the worktree's own (git's back-link names it). The flags
// below are defence in depth against the user's own config and the work tree's attributes, which the command can write.

/** The words after `git` when the command line is exactly one plain `git` call; undefined for anything else. */
export function words(command: ChildProcess.StandardCommand) {
  const line = commandLine(command)
  const parsed = line === undefined ? undefined : split(line.text, line.cmd)
  if (!parsed?.length || !["git", "git.exe"].includes(parsed[0].toLowerCase())) return
  return parsed.slice(1)
}

/** The host git command for those words, or a HOLD naming why this git call stays confined. */
export const command = Effect.fn("ToolSafetyGitHost.command")(function* (input: {
  readonly words: readonly string[]
  readonly command: ChildProcess.StandardCommand
  /** Physical cwd of the command. */
  readonly cwd: string
  /** Physical native placement (the workspace). */
  readonly directory: string
  /** Physical write roots, scratch included. */
  readonly writes: readonly string[]
  readonly env: Record<string, string | undefined>
}): Effect.fn.Return<ChildProcess.Command, ToolSafety.Denied, FSUtil.Service | Scope.Scope> {
  const fs = yield* FSUtil.Service
  const args = admit(input.words)
  if (args instanceof ToolSafety.Denied) return yield* args
  const placed = yield* Effect.tryPromise({
    try: () => place(input),
    catch: () => new ToolSafety.Denied({ reason: "git-host-repository-unavailable" }),
  })
  if (typeof placed === "string") return yield* new ToolSafety.Denied({ reason: placed })
  // An empty private hooks directory, and a path inside it that names no program for gpg.
  const empty = yield* fs.makeTempDirectoryScoped({ prefix: "orchestra-git-host-" }).pipe(
    Effect.flatMap(fs.realPath),
    Effect.mapError(() => new ToolSafety.Denied({ reason: "git-host-scratch-acquisition" })),
  )
  const none = path.join(empty, "none")
  // The system config stays: it is admin-owned, and Git for Windows keeps line endings (core.autocrlf) and git-lfs
  // there, so a host git without it reports every CRLF checkout as modified. Its programs get the same overrides.
  const env = {
    ...Object.fromEntries(Object.entries(input.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_"))),
    GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", GIT_EDITOR: "false", GIT_PAGER: "cat",
    GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1", GIT_PROTOCOL_FROM_USER: "0",
  }
  return ChildProcess.make(placed.git, [
    "--no-pager", "--no-optional-locks", `--git-dir=${placed.gitdir}`, `--work-tree=${placed.worktree}`,
    ...[
      "core.fsmonitor=false", `core.hooksPath=${empty}`, "core.pager=cat", "diff.external=", "core.sshCommand=false",
      "protocol.allow=never", "credential.helper=", "core.askPass=", "submodule.recurse=false", "status.submoduleSummary=false",
      "log.showSignature=false", `gpg.program=${none}`, `gpg.openpgp.program=${none}`, `gpg.x509.program=${none}`,
      `gpg.ssh.program=${none}`, "column.ui=never",
    ].flatMap((entry) => ["-c", entry]),
    ...args,
  ], { ...input.command.options, cwd: placed.cwd, env, extendEnv: false, shell: false })
})

type Rule = {
  /** Long options without `--`; each may carry `=value`. */
  readonly long: readonly string[]
  /** Short letters that take no value. */
  readonly short?: string
  /** Short letters whose value is the rest of their cluster. */
  readonly valued?: string
  /** `-<n>` limits the count. */
  readonly count?: boolean
  /** Long options whose value may be the next word (where operands are restricted). */
  readonly next?: readonly string[]
  /** Operands (revisions, paths, patterns): any, none, or only in list mode. */
  readonly operands: "any" | "none" | "list"
  /** Flags Orchestra puts first. */
  readonly add?: readonly string[]
}

const DIFF = [
  "stat", "numstat", "shortstat", "dirstat", "name-only", "name-status", "summary", "patch", "no-patch", "raw", "unified",
  "minimal", "patience", "histogram", "ignore-space-change", "ignore-all-space", "ignore-blank-lines", "ignore-space-at-eol",
  "diff-filter", "find-renames", "find-copies", "no-renames", "word-diff", "color", "no-color", "abbrev", "full-index",
  "binary", "relative", "no-relative", "exit-code", "quiet", "check", "no-prefix", "compact-summary", "no-textconv",
  "no-ext-diff",
]
const LOG = [
  ...DIFF, "oneline", "format", "pretty", "graph", "decorate", "no-decorate", "all", "branches", "tags", "remotes",
  "max-count", "skip", "since", "until", "after", "before", "author", "committer", "grep", "all-match", "invert-grep",
  "regexp-ignore-case", "extended-regexp", "fixed-strings", "reverse", "first-parent", "merges", "no-merges",
  "min-parents", "max-parents", "follow", "date", "relative-date", "abbrev-commit", "no-abbrev-commit", "topo-order",
  "date-order", "author-date-order", "ancestry-path", "left-right", "cherry-pick", "cherry-mark", "boundary",
  "simplify-by-decoration", "full-history", "source", "notes", "no-notes", "expand-tabs", "no-expand-tabs", "walk-reflogs",
]
const DRIVERS = ["--no-textconv", "--no-ext-diff"]

// Read-only subcommands and the options each may take; anything else stays confined. Left out on purpose: config (it
// prints the user's global config), and every option that writes a file (--output), reads one outside the work tree
// (-O, -f, -S, --contents, --exclude-from, --pathspec-from-file, --ignore-revs-file, --no-index), runs a program
// (--ext-diff, --textconv, --show-signature, --open-files-in-pager, --filters) or recurses into submodules.
const RULES: Record<string, Rule> = {
  status: {
    long: ["short", "branch", "porcelain", "long", "show-stash", "untracked-files", "ignored", "ahead-behind",
      "no-ahead-behind", "renames", "no-renames", "find-renames", "null"],
    short: "sbz", valued: "u", operands: "any", add: ["--ignore-submodules=all"],
  },
  diff: { long: [...DIFF, "cached", "staged", "merge-base"], short: "psRwbzMC", valued: "U", operands: "any",
    add: [...DRIVERS, "--ignore-submodules=all"] },
  show: { long: LOG, short: "psRwbzMC", valued: "U", operands: "any", add: DRIVERS },
  log: { long: LOG, short: "psRwbzMCiEFg", valued: "nUSG", count: true, operands: "any", add: DRIVERS },
  "rev-list": { long: [...LOG.filter((name) => !DIFF.includes(name)), "count"], valued: "n", count: true, operands: "any" },
  "rev-parse": {
    long: ["show-toplevel", "show-prefix", "show-cdup", "git-dir", "git-common-dir", "absolute-git-dir", "is-inside-work-tree",
      "is-inside-git-dir", "is-bare-repository", "is-shallow-repository", "show-object-format", "abbrev-ref", "short",
      "symbolic", "symbolic-full-name", "verify", "quiet", "all", "branches", "tags", "remotes", "sq", "path-format",
      "git-path", "default", "not"],
    short: "q", operands: "any",
  },
  "ls-files": {
    long: ["cached", "deleted", "others", "ignored", "stage", "unmerged", "killed", "exclude-standard", "directory",
      "no-empty-directory", "error-unmatch", "full-name", "abbrev", "format", "deduplicate"],
    short: "cdoisuzktv", operands: "any",
  },
  branch: {
    long: ["list", "all", "remotes", "verbose", "show-current", "contains", "no-contains", "merged", "no-merged", "points-at",
      "sort", "format", "abbrev", "no-abbrev", "ignore-case", "omit-empty", "color", "no-color"],
    short: "arvl", next: ["contains", "no-contains", "merged", "no-merged", "points-at", "sort", "format"], operands: "list",
  },
  tag: {
    long: ["list", "sort", "contains", "no-contains", "merged", "no-merged", "points-at", "format", "ignore-case", "omit-empty",
      "color", "no-color"],
    short: "l", valued: "n", next: ["contains", "no-contains", "merged", "no-merged", "points-at", "sort", "format"],
    operands: "list",
  },
  remote: { long: ["verbose"], short: "v", operands: "none" },
  describe: {
    long: ["tags", "all", "always", "long", "abbrev", "exact-match", "match", "exclude", "contains", "first-parent", "candidates"],
    operands: "any",
  },
  "cat-file": { long: [], short: "ptse", operands: "any" },
  grep: {
    long: ["cached", "untracked", "exclude-standard", "text", "ignore-case", "word-regexp", "invert-match", "full-name",
      "extended-regexp", "basic-regexp", "fixed-strings", "perl-regexp", "line-number", "column", "files-with-matches",
      "name-only", "files-without-match", "null", "count", "color", "no-color", "break", "heading", "show-function",
      "function-context", "and", "or", "not", "all-match", "quiet", "max-depth", "max-count", "only-matching", "no-textconv"],
    short: "aiIvwEGFPnlLzchHoWqr", valued: "eABCm", operands: "any", add: ["--no-textconv"],
  },
  blame: {
    long: ["porcelain", "line-porcelain", "incremental", "root", "show-stats", "show-name", "show-number", "show-email", "date",
      "abbrev", "first-parent", "minimal", "color-lines", "color-by-age", "no-textconv"],
    short: "bltsnefwpcMC", operands: "any", add: ["--no-textconv"],
  },
  "merge-base": { long: ["all", "octopus", "is-ancestor", "independent", "fork-point"], short: "a", operands: "any" },
}

/** The host argv after the global options: the subcommand, Orchestra's flags, then the caller's checked words. */
function admit(words: readonly string[]) {
  // `--no-pager` is the only global option a caller may write; Orchestra sets every other one itself.
  const rest = words[0] === "--no-pager" || words[0] === "-P" ? words.slice(1) : words
  const sub = rest[0]
  if (sub === undefined || sub.startsWith("-")) return denied("git-host-global-option", sub)
  const rule = Object.hasOwn(RULES, sub) ? RULES[sub] : undefined
  if (!rule) return denied("git-host-subcommand-confined", sub)
  const operands: string[] = []
  const state = { list: false, skip: false, separated: false }
  for (const word of rest.slice(1)) {
    if (state.skip) { state.skip = false; continue }
    if (state.separated || word === "-" || !word.startsWith("-")) { operands.push(word); continue }
    if (word === "--") { state.separated = true; continue }
    if (word.startsWith("--")) {
      const name = word.slice(2).split("=")[0]
      if (!rule.long.includes(name)) return denied("git-host-option-confined", word)
      if (name === "list") state.list = true
      state.skip = !word.includes("=") && rule.next?.includes(name) === true
      continue
    }
    if (rule.count && /^-\d+$/.test(word)) continue
    const letters = [...word.slice(1)]
    const valued = letters.findIndex((letter) => rule.valued?.includes(letter))
    const flags = valued < 0 ? letters : letters.slice(0, valued)
    if (flags.some((letter) => !rule.short?.includes(letter))) return denied("git-host-option-confined", word)
    if (flags.includes("l")) state.list = true
  }
  if (operands.length && (rule.operands === "none" || (rule.operands === "list" && !state.list)))
    return denied("git-host-operand-confined", `${sub} ${operands[0]}`)
  return [sub, ...(rule.add ?? []), ...rest.slice(1)]
}

const denied = (reason: string, detail?: string) => new ToolSafety.Denied({ reason, detail })

/**
 * Where host git runs, or the reason it may not. Paths are compared in one canonical form (the native realpath: long
 * names, links resolved), so a short 8.3 name or a link cannot hide a write root. The repository is found from the cwd
 * up to the workspace; its git directory must be inside the workspace or be a linked worktree's whose `gitdir`
 * back-link names this `.git`, so a `.git` file cannot point host git at another repository. The git directory and its
 * common directory (config, hooks, objects) must lie outside every write root. The result is passed to git explicitly.
 */
async function place(input: {
  readonly cwd: string
  readonly directory: string
  readonly writes: readonly string[]
  readonly env: Record<string, string | undefined>
}) {
  const directory = await realpath(input.directory)
  const cwd = await realpath(input.cwd)
  const writes = await Promise.all(input.writes.map((root) => realpath(root).catch(() => root)))
  if (!FSUtil.contains(directory, cwd)) return "git-host-cwd-outside-workspace"
  const marker = await upward(cwd, directory)
  if (!marker) return "git-host-repository-unavailable"
  const info = await lstat(marker)
  const named = info.isFile() ? /^gitdir: (.+?)\s*$/.exec(await readFile(marker, "utf8"))?.[1] : undefined
  if (!info.isDirectory() && !named) return "git-host-repository-unavailable"
  const worktree = path.dirname(marker)
  const gitdir = await realpath(named ? path.resolve(worktree, named) : marker)
  if (!FSUtil.contains(directory, gitdir)) {
    const back = (await readFile(path.join(gitdir, "gitdir"), "utf8").catch(() => "")).trim()
    if (!back || path.relative(await realpath(back).catch(() => ""), await realpath(marker)) !== "")
      return "git-host-repository-foreign"
  }
  const shared = (await readFile(path.join(gitdir, "commondir"), "utf8").catch(() => "")).trim()
  const common = shared ? await realpath(path.resolve(gitdir, shared)) : gitdir
  if ([gitdir, common].some((entry) => writes.some((root) => FSUtil.overlaps(root, entry)))) return "git-host-repository-writable"
  const git = await program(input.env, [directory, ...writes])
  if (!git) return "git-host-program-not-found"
  return { cwd, worktree, gitdir, git }
}

async function upward(from: string, stop: string): Promise<string | undefined> {
  const marker = path.join(from, ".git")
  if (await lstat(marker).then(() => true, () => false)) return marker
  const parent = path.dirname(from)
  if (from === stop || parent === from || !FSUtil.contains(stop, parent)) return
  return upward(parent, stop)
}

/** The host's git: `git.exe` (`git` elsewhere) in an absolute PATH folder outside the workspace and the write roots. */
async function program(env: Record<string, string | undefined>, owned: readonly string[]) {
  const value = Object.entries(env).find(([key]) => key.toUpperCase() === "PATH")?.[1] ?? ""
  const found = await Promise.all(value.split(path.delimiter).filter((entry) => path.isAbsolute(entry)).map((entry) =>
    realpath(path.join(entry, process.platform === "win32" ? "git.exe" : "git")).then(
      async (real) => !owned.some((root) => FSUtil.contains(root, real)) && (await stat(real)).isFile() ? real : undefined,
      () => undefined,
    )))
  return found.find((entry) => entry !== undefined)
}

/** The text a pwsh `-Command` or a cmd.exe shell would run. */
function commandLine(command: ChildProcess.StandardCommand) {
  const shell = command.options.shell
  if (shell) {
    const file = shell === true ? (process.env.ComSpec ?? "cmd.exe") : shell
    return Shell.name(file) === "cmd" ? { text: [command.command, ...command.args].join(" "), cmd: true } : undefined
  }
  if (Shell.name(command.command) !== "pwsh") return
  const at = command.args.length - 2
  if (at < 0 || !/^-(?:c|command)$/i.test(command.args[at])) return
  if (!command.args.slice(0, at).every((arg) => /^-(?:nologo|noprofile|noninteractive)$/i.test(arg))) return
  return { text: command.args[at + 1], cmd: false }
}

/**
 * Literal words of a line that is one plain command, or undefined when a shell would read anything else into it.
 * A closed subset both shells read the same way: unquoted words of letters, digits and `_-./\:=+~*?`; double quotes
 * without `$`, backtick (pwsh) or `%`, `!` (cmd); single quotes in pwsh only. Everything else (pipes, redirects, `;`,
 * `&`, variables, subexpressions, script blocks, splatting, `--%`, comments, line breaks) is outside the subset.
 */
export function split(text: string, cmd: boolean) {
  const result: string[] = []
  const token = { text: "", quote: "", started: false }
  for (const char of text) {
    if (token.quote) {
      if (char === token.quote) { token.quote = ""; continue }
      if (/[\r\n]/.test(char) || (token.quote === '"' && (cmd ? /[%!]/ : /[$`]/).test(char))) return
      token.text += char
      continue
    }
    if (char === " " || char === "\t") {
      if (token.started) result.push(token.text)
      token.text = ""
      token.started = false
      continue
    }
    if (char === '"' || (char === "'" && !cmd)) { token.quote = char; token.started = true; continue }
    if (!/[A-Za-z0-9_\-./\\:=+~*?]/.test(char)) return
    token.text += char
    token.started = true
  }
  if (token.quote) return
  if (token.started) result.push(token.text)
  return result
}
