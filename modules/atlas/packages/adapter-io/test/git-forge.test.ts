// @atlas/adapter-io — test/git-forge.test.ts   (WP-9.4.8.FORGE — EPIC-8, REQ-ADAPTER-10a/10b/10c, ADAPT-GIT-3)
//
// Acceptance suite for the low-level `Forge` port over host git (ADAPT-GIT-3). Transcribes the three frozen
// goldens (docs/requirements/goldens-adapters.md:341-363) against the SHARED `makeGitSbx()` harness
// (test/harness/git-sbx.ts — CONSUMED, never redefined) and CROSS-CHECKS every observed outcome against the
// frozen PERSIST-13 oracle (`commit`/`rewrite`/`noteOrphaned` @atlas/persist):
//   • SCN-ADAPTER-10a-1 — trailer appended to c1's message + note under refs/notes/orchestra + PR projection (happy)
//   • SCN-ADAPTER-10b-1 — a rebase (c1→c1') keeps the trailer in the rewritten message + orphans the note   (guard)
//   • SCN-ADAPTER-10c-1 — observed == PERSIST-*'s expected outcome at every step (0 semantics altered)        (guard)
//
// NOTE (the sha-change realization, cold-review): the canonical trailer homes INSIDE the commit object, so
// `writeCommit` AMENDS the target — the atlas-bearing commit is a NEW sha (this IS the "rewrite-honest"
// invariant). The frozen persist fake (test/wp-3.4-b.hostadapter-placement.test.ts) keeps the sha stable via
// a side-map; real git cannot. So this suite drives the `Forge` directly and reads by the POST-write sha
// (the git topology `c1`), exactly as the goldens are scoped ("the Forge writes/reads"). git's NATIVE
// rewrite (message carried, orchestra note orphaned) IS the PERSIST-* semantics — the forge adds no logic.

import { describe, it, expect, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { ADAPTER_VIA, directForgeCalls, commit, rewrite, noteOrphaned } from "@atlas/persist"
import { createForge } from "../src/git-forge.js"
import { makeGitSbx } from "./harness/git-sbx.js"
import type { GitSbx } from "./harness/git-sbx.js"

let sbx: GitSbx | undefined
afterEach(() => {
  sbx?.cleanup()
  sbx = undefined
})

// The dossier the adapter would serialize (opaque to the Forge — it carries strings, PERSIST owns the shape).
const TRAILER = [
  "WP: WP-9.4.8.FORGE",
  "Model: opus",
  "Gates: tsc,vitest",
  "Verdict: PASS",
  "TranscriptSha: 0123abc",
].join("\n")
const NOTE = JSON.stringify({ metering: { model: "opus", tokensIn: 10 }, knowledgeDelta: { added: [] } })
const PRBODY = JSON.stringify({ prId: "pr1", prMemory: { note: "m" } })

/** Raw git against the sbx (drives topology the harness does not own). */
function git(repo: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).toString().trim()
}
/** Raw git that returns `null` on a non-zero exit (used to assert absence, e.g. a note in another namespace). */
function gitOrNull(repo: string, ...args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
  } catch {
    return null
  }
}

/**
 * Stand up commit `c1` bearing the atlas on a fresh `atlas` branch: an intermediate commit `MID` (so a later
 * rebase genuinely changes the parent) then a base commit, which `writeCommit` amends into the atlas-bearing
 * `c1`. Returns the forge + the captured shas. `MID` is the rebase upstream; `cGreet` the new base.
 */
function seedAtlasCommit(): { forge: ReturnType<typeof createForge>; repo: string; c1: string; mid: string } {
  const s = makeGitSbx()
  sbx = s
  const repo = s.repoPath
  git(repo, "checkout", "-q", "-b", "atlas", s.mainTip)
  execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "chore: mid marker"], { cwd: repo })
  const mid = git(repo, "rev-parse", "HEAD")
  execFileSync("bash", ["-c", "printf x > PROVENANCE.md"], { cwd: repo })
  git(repo, "add", ".")
  git(repo, "commit", "-q", "-m", "feat: provenance doc")
  const base = git(repo, "rev-parse", "HEAD")

  const forge = createForge(repo)
  forge.writeCommit(base, TRAILER, NOTE, ADAPTER_VIA) // amends base → the atlas-bearing commit
  const c1 = git(repo, "rev-parse", "HEAD")
  return { forge, repo, c1, mid }
}

describe("REQ-ADAPTER-10 — the forge carries the atlas (ADAPT-GIT-3, over real git-sbx)", () => {
  it("SCN-ADAPTER-10a-1: writes trailer + refs/notes/orchestra note + PR projection", () => {
    const { forge, repo, c1 } = seedAtlasCommit()

    // trailer appended to c1's message (canonical — inside the commit object, round-trips byte-exact).
    expect(forge.readTrailer(c1, ADAPTER_VIA)).toBe(TRAILER)
    // note attached to c1 under refs/notes/orchestra.
    expect(forge.readNote(c1, ADAPTER_VIA)).toBe(NOTE)
    expect(git(repo, "notes", "--ref=refs/notes/orchestra", "show", c1)).toBe(NOTE)
    // teeth (breaks-on "note written to refs/notes/commits, the default namespace"): absent there.
    expect(gitOrNull(repo, "notes", "--ref=refs/notes/commits", "show", c1)).toBeNull()

    // PR projection written (host-side).
    forge.writePR("pr1", PRBODY, ADAPTER_VIA)
    expect(forge.readPRBody("pr1", ADAPTER_VIA)).toBe(PRBODY)
    expect(forge.hostSidePRCount()).toBe(1)

    // every forge interaction went through the adapter tag (REQ-PERSIST-8-a audit holds).
    expect(directForgeCalls(forge)).toEqual([])
  })

  it("SCN-ADAPTER-10b-1: a rebase (c1→c1') keeps the trailer and orphans the note data", () => {
    const s = seedAtlasCommit()
    const { forge, repo, c1, mid } = s
    expect(forge.readNote(c1, ADAPTER_VIA)).toBe(NOTE) // note present before the rewrite

    // rewrite history by a rebase: replay c1 onto cGreet (new parent ⇒ new sha), no conflict (new file).
    git(repo, "rebase", "-q", "--onto", sbx!.cGreet, mid, "atlas")
    const c1p = git(repo, "rev-parse", "HEAD")
    expect(c1p).not.toBe(c1) // c1' is a genuinely new sha

    // trailer data SURVIVES in the rewritten message (git replays the commit object's message).
    // teeth (breaks-on "the rewrite drops the trailer, treating it as ephemeral"): it is still there.
    expect(forge.readTrailer(c1p, ADAPTER_VIA)).toBe(TRAILER)
    // note-carried data is ORPHANED exactly per PERSIST-*: it still keys on the OLD c1 sha, absent on c1'.
    expect(forge.readNote(c1p, ADAPTER_VIA)).toBeNull() // absent on the rewritten sha
    expect(forge.readNote(c1, ADAPTER_VIA)).toBe(NOTE) // still on old c1 — not silently discarded
  })

  it("SCN-ADAPTER-10c-1: the observed outcome == the PERSIST-13 oracle at every step (0 semantics altered)", () => {
    const s = seedAtlasCommit()
    const { forge, repo, c1, mid } = s

    // Build the frozen PERSIST-13 oracle over the SAME topology: a fresh commit (note keys on its own sha).
    const before = commit(c1, { atlas: TRAILER }, { note: NOTE })
    expect(noteOrphaned(before)).toBe(false)
    // observed (real git) matches the oracle pre-rewrite: trailer readable, note present & not orphaned.
    expect(forge.readTrailer(c1, ADAPTER_VIA)).toBe(TRAILER)
    expect(forge.readNote(c1, ADAPTER_VIA)).toBe(NOTE)

    git(repo, "rebase", "-q", "--onto", sbx!.cGreet, mid, "atlas")
    const c1p = git(repo, "rev-parse", "HEAD")
    const after = rewrite(before, c1p) // the oracle's rewrite: trailer carried, note orphaned on the old sha

    // step-for-step equality: oracle says trailer survives + note orphaned; real git observes exactly that.
    expect(noteOrphaned(after)).toBe(true)
    expect(after.trailer.atlas).toBe(TRAILER)
    expect(forge.readTrailer(c1p, ADAPTER_VIA)).toBe(TRAILER) // == oracle: trailer survives
    expect(forge.readNote(c1p, ADAPTER_VIA)).toBeNull() // == oracle: note orphaned (absent)
    // teeth (breaks-on "the forge 'improves' orphan handling by re-pointing the note to c1'"): the note was
    // NOT re-pointed — it still keys on the OLD c1 sha (the oracle's `after.noteKey`), matching PERSIST-*.
    expect(after.noteKey).toBe(c1)
    expect(forge.readNote(c1, ADAPTER_VIA)).toBe(NOTE)
  })
})
