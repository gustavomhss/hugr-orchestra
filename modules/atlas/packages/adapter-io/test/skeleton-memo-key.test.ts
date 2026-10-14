// @atlas/adapter-io — test/skeleton-memo-key.test.ts  (the S0 skeleton memo key: separator + source bytes)
//
// `createSkeletonSource` memoizes per `(repo, rev)` by JOINING the two into one cache key. The join is only
// safe if it is INJECTIVE — if two distinct `(repo, rev)` pairs can spell the same key, one mine pass hands
// back another pass's skeleton, silently, with no error anywhere. The separator is NUL because NUL is the
// one byte that appears in neither a POSIX path nor a git rev.
//
// TWO THINGS ARE PINNED HERE, and they are different things:
//
//   (1) THE VALUE — the separator must be a real NUL. The plausible regression is not "no separator", it is
//       the TWO-CHARACTER `\\0` (backslash, zero), which looks identical in a review and which a repo path
//       CAN contain. `('x\0y','z')` and `('x','y\0z')` — with LITERAL backslash-zero text in them — spell
//       DIFFERENT keys under a NUL separator and the SAME key under `\\0`. That is the collision case below,
//       and it is the RED: it fails against a `\\0` separator and passes against a NUL one.
//
//   (2) THE ENCODING — the separator must be written as the ESCAPE `\0` in the source, never as a raw 0x00
//       byte. Until this change `src/skeleton-source.ts` held a literal NUL at byte 8874, which made the
//       WHOLE FILE "binary" to `git diff` and INVISIBLE to `grep`: every grep-derived count or review over
//       `packages/*/src` silently skipped 166 lines of production composition code and read as success,
//       because grep returns nothing and nothing is what a missing file looks like. The runtime value is
//       byte-identical either way (verified: `\0` and the raw byte both produce charCode 0 at the same
//       offset for every input), so the escape costs nothing and buys the file back.
//
// Case (1) is the behaviour; case (2) is read with `fs` and NOT with grep, because grep is exactly the tool
// the defect defeats.

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { build } from "@atlas/index"
import type { Axes } from "@atlas/index"
import { createSkeletonSource } from "../src/skeleton-source.js"
import type { RevIndex } from "../src/rev-index.js"

/** The production source under test, resolved from THIS module (no cwd assumption). */
const SKELETON_SOURCE_TS = fileURLToPath(new URL("../src/skeleton-source.ts", import.meta.url))

/** A `RevIndex` double whose `axesAt(rev)` returns axes that IDENTIFY the rev (the root key IS the rev), and
 *  which records every call — so a memo HIT and a memo MISS are both directly observable. */
function recordingRevIndex(): { revIndex: RevIndex; calls: string[] } {
  const calls: string[] = []
  const axesAt = (rev: string): Axes => {
    calls.push(rev)
    return build({ path: rev, children: [] }, { documents: [] })
  }
  const revIndex = {
    axesAt,
    resolveAnchorAt: () => undefined,
    resolveBySubtreeAt: () => undefined,
    reDerives: () => false,
  } as unknown as RevIndex
  return { revIndex, calls }
}

/** A source whose non-HEAD leg is fully driven by the double (`headSha` ⇒ undefined, so every rev takes the
 *  `revIndex().axesAt(rev)` path and no git, worktree or filesystem is touched). */
function fakeSource(): { source: ReturnType<typeof createSkeletonSource>; calls: string[] } {
  const { revIndex, calls } = recordingRevIndex()
  return { source: createSkeletonSource("/synthetic/repo", { headSha: () => undefined, revIndex }), calls }
}

// The two pairs. Each string carries LITERAL backslash-zero text (`\\0` in source ⇒ the 2 chars `\` `0`),
// positioned so that a two-character `\\0` separator makes both pairs spell one key while a NUL separator
// keeps them apart. Obviously synthetic: no such repo or rev exists.
const REPO_A = "x\\0y"
const REV_A = "z"
const REPO_B = "x"
const REV_B = "y\\0z"

describe("skeleton memo key — the (repo, rev) join is INJECTIVE (a NUL separator, not `\\0`)", () => {
  it("NON-VACUITY: the memo really memoizes — the same (repo, rev) twice is ONE build", () => {
    const { source, calls } = fakeSource()
    const first = source.skeleton(REPO_A, REV_A)
    const second = source.skeleton(REPO_A, REV_A)
    expect(calls).toStrictEqual([REV_A]) //  one build, not two
    expect(second).toBe(first) //            the very same object came back out of the cache
  })

  it("NON-VACUITY: the two pairs really do collide under a two-character `\\0` separator", () => {
    // Stated as arithmetic on the strings themselves, so the collision the behavioural case guards against
    // is demonstrated rather than asserted. `\0` (NUL) keeps them apart; `\\0` (backslash-zero) does not.
    expect(`${REPO_A}\\0${REV_A}`).toBe(`${REPO_B}\\0${REV_B}`) // the MUTANT separator: one key
    expect(`${REPO_A}\0${REV_A}`).not.toBe(`${REPO_B}\0${REV_B}`) // the SHIPPED separator: two keys
  })

  it("RED under `\\0`: two distinct (repo, rev) pairs never share a memo entry", () => {
    const { source, calls } = fakeSource()
    const a = source.skeleton(REPO_A, REV_A)
    const b = source.skeleton(REPO_B, REV_B)

    // Both pairs were BUILT — under a `\\0` separator the second call is a cache HIT and `calls` is `['z']`.
    expect(calls).toStrictEqual([REV_A, REV_B])
    // …and each skeleton is the one its OWN rev produced, not the other pair's.
    expect(a.axes.spatial.key).toBe(REV_A)
    expect(b.axes.spatial.key).toBe(REV_B)
    expect(b).not.toBe(a)
  })
})

describe("skeleton-source.ts source bytes — greppable, and it stays that way", () => {
  it("holds NO raw NUL byte (read with fs, because grep is the tool the defect defeats)", () => {
    const bytes = readFileSync(SKELETON_SOURCE_TS)
    // Not `toContain` on a decoded string: a lone 0x00 survives UTF-8 decoding as U+0000 and is easy to
    // miss. The byte index is the assertion, and it reports WHERE, so a regression names its own offset.
    expect(bytes.indexOf(0)).toBe(-1)
    // NON-VACUITY: the file was actually read and is the module under test, not an empty/missing path.
    expect(bytes.length).toBeGreaterThan(1000)
    expect(bytes.toString("utf8")).toContain("export function createSkeletonSource")
  })

  it("spells the separator as the ESCAPE, and the escape is one backslash (not two)", () => {
    const src = readFileSync(SKELETON_SOURCE_TS, "utf8")
    const line = src.split("\n").find((l) => l.includes("const key =")) ?? ""
    // The exact text. `String.raw` so this assertion cannot itself be written with the wrong escape depth —
    // the prior seat's mistake was in the ASSERTION as much as in the code.
    expect(line).toContain(String.raw`\0`)
    expect(line).not.toContain(String.raw`\\0`)
  })
})
