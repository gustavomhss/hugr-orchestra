// @atlas/adapter-io — src/containment.ts  (the ONE answer to "is this path inside that directory?")
//
// Two doors in this package decide a security question with that predicate: `model-config.ts` refuses a
// model command sourced from the repository under analysis (it names an executable Atlas will RUN), and
// `prompt.ts` refuses to read source from outside the repository into a prompt sent to the operator's model
// endpoint. Both used to answer it by comparing PATH STRINGS, and STRING CONTAINMENT IS NOT CONTAINMENT.
//
// ── WHY realpathSync + relative() IS NOT ENOUGH ──────────────────────────────────────────────────────────
// `realpathSync` canonicalizes symlinks — that leg is real and it stays (on macOS `/var` is a symlink to
// `/private/var`, so a repo the shell reports as `/var/folders/x` really lives at `/private/var/folders/x`).
// What it does NOT do is canonicalize SPELLING. On APFS it is case-preserving and Unicode-normalization-
// preserving: it returns the path AS REQUESTED, not the canonical on-disk name. So `/tmp/Repo` and
// `/tmp/repo` — the SAME directory, one inode, indistinguishable to the kernel — come back as two different
// strings, `relative()` between them yields a `..`-prefixed path, and a guard reading "outside the repo"
// hands the attacker's config to `execFileSync`. Measured against the built module: the honest spelling was
// refused and a case variant of it LOADED a planted `{"cmd":"/bin/sh",…}`. NFC-on-disk vs NFD-in-path is the
// same bypass with a different alphabet.
//
// `toLowerCase()` is NOT the fix and must not be reached for: APFS case-folding follows the volume's own
// Unicode table, not JavaScript's, and normalization folding is not case folding at all. The only authority
// on "are these two names the same file" is the kernel, so identity is decided on **(dev, ino)** — the
// inode pair — and never on text.
//
// The walk is ITERATIVE by requirement, not by taste: the predecessor resolved one path segment per stack
// frame, so a ~8000-segment path threw an uncaught RangeError out of a security check.

import { realpathSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"

/** A file's kernel identity: the pair that answers "same file?" no matter how the name was spelled. */
interface FileId {
  readonly dev: bigint
  readonly ino: bigint
}

/** `statSync` as a total function. `bigint: true` so a 64-bit inode is compared exactly rather than through
 *  a float64 that can alias two distinct files above 2^53. `undefined` ⇒ absent/unreadable, never a throw. */
function idOf(path: string): FileId | undefined {
  try {
    const st = statSync(path, { bigint: true })
    return { dev: st.dev, ino: st.ino }
  } catch {
    return undefined
  }
}

/** The real spelling of `path` when it exists, the requested one when it does not. A path that is not there
 *  YET still has to be judged — the boundary is decided BEFORE the file is opened — and its existing
 *  ancestors are what decide it. */
function realOrAsked(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/**
 * Is `candidate` the directory `root` itself, or anything beneath it — decided by KERNEL IDENTITY.
 *
 * Total: it never throws. Any filesystem error while climbing means "not a match HERE" and the climb
 * continues; an error on `root` means FALSE, because an unresolvable root contains nothing (fail closed).
 *
 * The candidate MAY NOT EXIST. A non-existent leaf under an existing, contained parent IS contained — the
 * two callers both have to refuse a path before opening it, so requiring the file to be there would make
 * the check inapplicable exactly when it matters.
 *
 * Symlinks are resolved as they are met, so containment is a fact about WHERE THE BYTES ARE, not about how
 * the name was written: a link inside `root` whose target lives outside is NOT contained, and a link
 * outside whose target lives inside IS.
 */
export function isContainedIn(root: string, candidate: string): boolean {
  const rootId = idOf(realOrAsked(resolve(root)))
  if (rootId === undefined) return false // fail closed: a root that cannot be stat'd contains nothing

  let cur = resolve(candidate)
  for (;;) {
    // The real spelling first: it collapses `/var`→`/private/var` AND follows a link that points into the
    // tree, so the ancestors we climb are the ancestors the kernel would climb.
    const here = realOrAsked(cur)
    const id = idOf(here)
    if (id !== undefined && id.dev === rootId.dev && id.ino === rootId.ino) return true
    const up = dirname(here)
    // Terminates: `dirname` is a fixed point only at the filesystem root, and once `here` is a resolved
    // path every further parent is resolved too, so at most ONE link jump can lengthen the walk.
    if (up === here) return false
    cur = up
  }
}
