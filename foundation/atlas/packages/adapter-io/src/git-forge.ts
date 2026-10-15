// @atlas/adapter-io — src/git-forge.ts  (ADAPT-GIT-3: forge)
//
// The low-level `Forge` port (@atlas/persist) over the host git — trailer/note/PR projection carrying the
// atlas, executing PERSIST-* semantics UNCHANGED. The trailer homes INSIDE the commit object (canonical —
// travels in any clone, survives a rewrite onto the new SHA); the note homes to `refs/notes/orchestra`
// (mutable overlay — NOT the default `refs/notes/commits`, so git never auto-copies it on rewrite and it
// is left orphaned exactly per PERSIST-13); the PR is a host-side projection (a bare clone never fetches
// it). The forge changes NONE of that semantics — git's native behavior IS the PERSIST-* oracle.

import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Forge, ForgeCall } from "@atlas/persist"
import { NOTES_REF } from "@atlas/persist"
import { runGit } from "./run-git.js"

/** The message boundary the trailer block is appended below, so `readTrailer` round-trips it byte-exact. */
const SENTINEL = "--- atlas-provenance ---"

/**
 * Construct the low-level `Forge` port over the host git at `repoPath` (ADAPT-GIT-3). `repoPath` is INJECTED
 * (scaffold widening, noted at exec — the frozen stub took none; a real git seam must know which repo, per
 * the sibling `createDiskStore(casPath)` / `createHistorySource(rev)` convention; `wire.ts` only
 * symbol-references `createForge`, so widening is edge-safe). git-side ops (`writeCommit`/`readTrailer`/
 * `readNote`) act on real objects/notes; host-side ops (`writePR`/`readPRBody`/refspecs) model the PR
 * surface a bare clone does not carry, in-memory.
 */
export function createForge(repoPath: string): Forge {
  // Host-side projection state — a real host's PR surface + configured refspecs live OUTSIDE git (a bare
  // clone never fetches them). The call ledger tags every git-side/host-side op with its `via`.
  const prs = new Map<string, string>()
  const refspecs: string[] = []
  const log: ForgeCall[] = []

  const git = (...args: string[]): string => runGit(repoPath, args)
  // Absence is NOT an error here (a missing trailer/note ⇒ `null`, never a throw — the reads are TOTAL).
  const gitOrNull = (...args: string[]): string | null => {
    try {
      return runGit(repoPath, args)
    } catch {
      return null
    }
  }

  const forge: Forge = {
    writeCommit(sha, trailer, note, via) {
      log.push({ op: "writeCommit", via })
      // Rewrite-honest: the canonical trailer homes INSIDE the commit object, so writing it AMENDS the
      // target (the atlas-bearing commit is the resulting HEAD). Fail-loud if the target is not the tip.
      const head = git("rev-parse", "HEAD").trim()
      if (head !== sha) {
        throw new Error(`git-forge writeCommit: target ${sha} is not HEAD (${head}) — cannot amend a non-tip commit`)
      }
      const body = git("show", "-s", "--format=%B", sha).replace(/\n+$/, "")
      git("commit", "--amend", "--no-verify", "-m", `${body}\n\n${SENTINEL}\n${trailer}`)
      const atlasSha = git("rev-parse", "HEAD").trim()
      // The mutable overlay homes to `refs/notes/orchestra` (NOT `refs/notes/commits`) keyed on the
      // atlas-bearing SHA. `-F -` writes the payload verbatim; a rewrite later orphans it via git-native.
      runGit(repoPath, ["notes", `--ref=${NOTES_REF}`, "add", "-f", "-F", "-", atlasSha], { input: note })
    },
    readTrailer(sha, via) {
      log.push({ op: "readTrailer", via })
      const msg = gitOrNull("show", "-s", "--format=%B", sha)
      if (msg === null) return null
      const marker = `${SENTINEL}\n`
      const i = msg.indexOf(marker)
      if (i < 0) return null
      return msg.slice(i + marker.length).replace(/\n+$/, "")
    },
    readNote(sha, via) {
      log.push({ op: "readNote", via })
      const note = gitOrNull("notes", `--ref=${NOTES_REF}`, "show", sha)
      return note === null ? null : note.replace(/\n+$/, "")
    },
    writePR(prId, body, via) {
      log.push({ op: "writePR", via })
      prs.set(prId, body)
    },
    readPRBody(prId, via) {
      log.push({ op: "readPRBody", via })
      return prs.get(prId) ?? null
    },
    configurePush(refspec, via) {
      log.push({ op: "configurePush", via })
      refspecs.push(refspec)
    },
    pushRefspecs() {
      return [...refspecs]
    },
    hostSidePRCount() {
      return prs.size
    },
    bareClone() {
      // A real `git clone --bare` copies commit objects (the trailer travels in the message), but NOT
      // `refs/notes/*` (perimeter-conditional overlay, PERSIST-13c) nor the host-side PR surface/refspecs.
      const dst = mkdtempSync(join(tmpdir(), "atlas-forge-bare-"))
      runGit(repoPath, ["clone", "--quiet", "--bare", repoPath, dst])
      return createForge(dst)
    },
    calls() {
      return [...log]
    },
  }
  return forge
}
