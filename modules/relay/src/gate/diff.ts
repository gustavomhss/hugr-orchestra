export * as GateDiff from "./diff"

import { Effect, Option } from "effect"
import { GateShell } from "./shell"

/**
 * `relay_compute_diff` (WP3): `git diff <baseRef> -- <pathspec>`, then every nonignored untracked file as a no-index
 * diff against /dev/null, without touching the index. None when the base is missing, the workdir is not a git
 * repository, the ref is not a commit, git cannot run, or the diff is not UTF-8 (judge.py crashed reading it, so it
 * never reached a judge either). An empty diff is still Some("").
 */
export const compute = (input: {
  readonly workdir: string
  readonly baseRef?: string
  // Whitespace-split pathspec; empty means everything.
  readonly pathspec: string
  /** Managed judge evidence accepts only Git's own diff of the bound checkout and literal paths. */
  readonly worktreeEvidence?: boolean
}): Effect.Effect<Option.Option<string>, never, GateShell.Git> =>
  Effect.gen(function* () {
    const baseRef = input.baseRef
    if (!baseRef) return Option.none()
    const git = yield* GateShell.Git
    const run = (args: ReadonlyArray<string>) =>
      input.worktreeEvidence
        ? git.run(input.workdir, ["--literal-pathspecs", ...args], { repositoryConfigOnly: true })
        : git.run(input.workdir, args)
    // Word splitting only: bash also globbed these words against the hook's cwd (PARITY-EXCEPTIONS WP3-2).
    const pathspec = words(input.pathspec)
    if ((yield* run(["rev-parse", "--git-dir"])).exitCode !== 0) return Option.none()
    if ((yield* run(["cat-file", "-e", `${baseRef}^{commit}`])).exitCode !== 0) return Option.none()
    if (input.worktreeEvidence) {
      // Even built-in git diff can run a clean/process filter while converting worktree bytes.
      // Git config status 1 with empty output means no matching key.
      const filters = yield* run(["config", "--includes", "--name-only", "--get-regexp", "^filter\\..*\\.(clean|smudge|process)$"])
      if (filters.exitCode !== 1 || filters.stdout.length !== 0) return Option.none()
    }
    const diffOptions = input.worktreeEvidence ? ["--no-ext-diff", "--no-textconv"] : []
    const tracked = yield* run(["diff", ...diffOptions, baseRef, "--", ...pathspec])
    if (tracked.exitCode !== 0) return Option.none()
    // Legacy preserves bash's text splitting. Managed evidence needs the actual names and a successful listing.
    const others = yield* run([
      "ls-files", ...(input.worktreeEvidence ? ["-z"] : []), "--others", "--exclude-standard", "--", ...pathspec,
    ])
    const names = input.worktreeEvidence
      ? untrackedNames(others.exitCode, others.stdout)
      : decoder.decode(others.stdout).split("\n").slice(0, -1).filter(Boolean)
    if (!names) return Option.none()
    const untracked: Uint8Array[] = []
    for (const file of names) {
      const operand = input.worktreeEvidence ? `./${file}` : file
      const patch = yield* run(["diff", "--no-index", ...diffOptions, "--", "/dev/null", operand])
      // An enumerated addition needs an actual patch. Git can exit 1 without one if the file vanished.
      if (input.worktreeEvidence && (patch.exitCode !== 1 || !patch.stdout.length)) return Option.none()
      untracked.push(patch.stdout)
    }
    return utf8(Buffer.concat([tracked.stdout, ...untracked]))
  }).pipe(Effect.catchTag("GateShell.Unavailable", () => Effect.succeed(Option.none<string>())))

function untrackedNames(exitCode: number, stdout: Uint8Array) {
  if (exitCode !== 0) return undefined
  if (!stdout.length) return []
  const decoded = utf8(stdout)
  if (Option.isNone(decoded) || !decoded.value.endsWith("\0")) return undefined
  const names = decoded.value.slice(0, -1).split("\0")
  return names.some((name) => !name || name.startsWith("/") || name.split("/").includes("..")) ? undefined : names
}

// The label the judge sees for the computed diff.
export const NAME = "computed.diff"

// Bash word splitting with the default IFS.
export const words = (text: string) => text.split(/[ \t\n]+/).filter(Boolean)

// Strict UTF-8 that keeps a byte order mark, like Python's `utf-8` codec.
export const utf8 = Option.liftThrowable((bytes: ArrayBuffer | Uint8Array) =>
  new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
)

const decoder = new TextDecoder()
