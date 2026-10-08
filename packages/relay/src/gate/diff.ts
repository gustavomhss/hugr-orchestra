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
}): Effect.Effect<Option.Option<string>, never, GateShell.Git> =>
  Effect.gen(function* () {
    const baseRef = input.baseRef
    if (!baseRef) return Option.none()
    const git = yield* GateShell.Git
    const run = (args: ReadonlyArray<string>) => git.run(input.workdir, args)
    // Word splitting only: bash also globbed these words against the hook's cwd (PARITY-EXCEPTIONS WP3-2).
    const pathspec = words(input.pathspec)
    if ((yield* run(["rev-parse", "--git-dir"])).exitCode !== 0) return Option.none()
    if ((yield* run(["cat-file", "-e", `${baseRef}^{commit}`])).exitCode !== 0) return Option.none()
    const tracked = yield* run(["diff", baseRef, "--", ...pathspec])
    if (tracked.exitCode !== 0) return Option.none()
    // `git diff` shows tracked changes only, and a new file is the most common shape of new work. Each `ls-files` line
    // is passed back verbatim, so a name git had to quote fails its no-index diff and is skipped, exactly as in bash.
    const others = yield* run(["ls-files", "--others", "--exclude-standard", "--", ...pathspec])
    const untracked = yield* Effect.forEach(
      decoder.decode(others.stdout).split("\n").slice(0, -1).filter(Boolean),
      // --no-index exits 1 when the files differ, which is the normal case here.
      (file) => run(["diff", "--no-index", "--", "/dev/null", file]).pipe(Effect.map((result) => result.stdout)),
    )
    return utf8(Buffer.concat([tracked.stdout, ...untracked]))
  }).pipe(Effect.catchTag("GateShell.Unavailable", () => Effect.succeed(Option.none<string>())))

// The label the judge sees for the computed diff.
export const NAME = "computed.diff"

// Bash word splitting with the default IFS.
export const words = (text: string) => text.split(/[ \t\n]+/).filter(Boolean)

// Strict UTF-8 that keeps a byte order mark, like Python's `utf-8` codec.
export const utf8 = Option.liftThrowable((bytes: ArrayBuffer | Uint8Array) =>
  new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
)

const decoder = new TextDecoder()
