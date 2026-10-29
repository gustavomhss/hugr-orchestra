// @atlas/adapter-io — src/transcript-blobs.ts  (transcripts committed under `.atlas/blobs/`)
//
// The persist transcript store keeps bodies in memory. This one keeps them where a fresh clone finds them: the raw
// scrubbed bytes at `blobPath(hash)`, beside the knowledge blobs, so an attempt row's `transcriptSha` can be fetched
// after `git clone` (repo-layout design §3, re-spawn). The persist store still does the scrub and the hash, so the
// two can never disagree on what a body is called.
//
// A public repository never commits a transcript (design §6): with `commit: false` `put` still answers the hash, so
// the attempt row keeps its pointer, but no file is written and `fetch` finds nothing.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { createTranscriptStore, toGitPointer } from "@atlas/persist"
import type { Transcript, TranscriptRef, TranscriptStore } from "@atlas/persist"
import { blobPath } from "./layout.js"

export function createRepoTranscriptStore(repoPath: string, opts: { readonly commit: boolean }): TranscriptStore {
  return {
    put(body) {
      const memory = createTranscriptStore()
      const sha = memory.put(body)
      const path = blobPath(repoPath, sha)
      if (!opts.commit || existsSync(path)) return sha
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, memory.fetch(toGitPointer(sha)))
      return sha
    },
    fetch(ref: TranscriptRef): Transcript {
      const path = blobPath(repoPath, ref.sha)
      if (ref.store !== "cas" || !existsSync(path)) throw new Error(`transcript ${ref.sha} is not committed`)
      const body = new Uint8Array(readFileSync(path))
      // A blob edited after commit hashes to something else; refuse it rather than hand back other bytes.
      if (createTranscriptStore().put(body) !== ref.sha) throw new Error(`transcript ${ref.sha} does not match its hash`)
      return body
    },
  }
}
