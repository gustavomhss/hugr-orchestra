// @atlas/persist — src/host-adapter.ts  (forge-agnostic host adapter — PERSIST-8)
//
// One impl per host abstracts the forge (the adapter is the SOLE caller of the low-level `Forge` port).
// Provenance serializes as an RFC-822-ish trailer (canonical) + a JSON `refs/notes/orchestra` note
// (mutable overlay); the PR surface is a PROJECTION. `readCommit`/`readPR` are TOTAL — absence ⇒ `null`.

import type { Dossier, Metering, PrAttach, Trailer, VersionDelta } from "./types.js"
import { asHash } from "@atlas/kernel"

/**
 * The forge-agnostic host adapter surface (PERSIST-8), one impl per forge. `readCommit`/`readPR` are
 * TOTAL — a missing note/attachment returns `null`, never throws (atlas-persist:113-114). `sha` is a git
 * commit SHA (a git object id) — deliberately NOT the branded CAS `Hash`, so it is typed `string`.
 */
export interface HostAdapterApi {
  /** Write the trailer block + `refs/notes/orchestra` note carrying the dossier. (atlas-persist:100) */
  attachToCommit(sha: string, dossier: Dossier): void
  /** Read back the note/trailer; absence ⇒ `null`, never throws. (atlas-persist:101) */
  readCommit(sha: string): Dossier | null
  /** Render PR-memory/logbook/knowledge-delta onto the host PR. (atlas-persist:102) */
  attachToPR(prId: string, prAttach: PrAttach): void
  /** Read back the projection; absence ⇒ `null`, never throws. (atlas-persist:103) */
  readPR(prId: string): PrAttach | null
}

/** The `refs/notes/orchestra` ref the mutable-overlay dossier note is written to (atlas-persist:17). */
export const NOTES_REF = "refs/notes/orchestra"
/** The push refspec the adapter configures so provenance notes leave the local repo (REQ-PERSIST-8-b). */
export const NOTES_PUSH_REFSPEC = "refs/notes/*:refs/notes/*"
/** The provenance tag the adapter stamps on EVERY forge call — the audit of "0 direct forge calls" keys on it. */
export const ADAPTER_VIA = "host-adapter"

/** One recorded forge interaction, tagged with the caller that made it (REQ-PERSIST-8-a audit). */
export interface ForgeCall {
  readonly op: string
  readonly via: string
}

/**
 * The low-level forge PORT — the SINGLE seam a `HostAdapter` touches, one impl per host (GitHub/GitLab/…).
 * git-side ops (`writeCommit`/`readTrailer`/`readNote`) carry the commit trailer + note that a clone copies;
 * host-side ops (`writePR`/`readPRBody`) render/read the PR projection that a bare clone does NOT fetch.
 * Every op takes a `via` tag so a leak (a caller reaching the forge directly) is auditable.
 */
export interface Forge {
  writeCommit(sha: string, trailer: string, note: string, via: string): void
  readTrailer(sha: string, via: string): string | null
  readNote(sha: string, via: string): string | null
  writePR(prId: string, body: string, via: string): void
  readPRBody(prId: string, via: string): string | null
  configurePush(refspec: string, via: string): void
  pushRefspecs(): readonly string[]
  hostSidePRCount(): number
  bareClone(): Forge
  calls(): readonly ForgeCall[]
}

/** A `HostAdapterApi` that also exposes the refspec configuration step (REQ-PERSIST-8-b). */
export interface ConfigurableHostAdapter extends HostAdapterApi {
  configurePushRefspec(): void
}

/** Serialize the canonical trailer as an RFC-822-ish `Key: value` block committed INTO the commit object. */
function serializeTrailer(t: Trailer): string {
  return [
    `WP: ${t.WP}`,
    `Model: ${t.Model}`,
    `Gates: ${t.Gates}`,
    `Verdict: ${t.Verdict}`,
    `TranscriptSha: ${t.TranscriptSha}`,
  ].join("\n")
}

/** Serialize the mutable-overlay part of the dossier (metering + knowledge-delta) as the JSON note payload. */
function serializeNote(d: Dossier): string {
  const overlay: { metering?: Metering; knowledgeDelta?: VersionDelta } = {}
  if (d.metering !== undefined) overlay.metering = d.metering
  if (d.knowledgeDelta !== undefined) overlay.knowledgeDelta = d.knowledgeDelta
  return JSON.stringify(overlay)
}

/** Parse the RFC-822-ish trailer block back to a `Trailer`; a missing/blank line yields an empty field. */
function parseTrailer(text: string): Trailer {
  const kv = new Map<string, string>()
  for (const line of text.split("\n")) {
    const i = line.indexOf(": ")
    if (i > 0) kv.set(line.slice(0, i), line.slice(i + 2))
  }
  return {
    WP: kv.get("WP") ?? "",
    Model: kv.get("Model") ?? "",
    Gates: kv.get("Gates") ?? "",
    Verdict: kv.get("Verdict") ?? "",
    TranscriptSha: asHash(kv.get("TranscriptSha") ?? ""),
  }
}

/**
 * Reconstruct the `Dossier` from the canonical trailer block + the JSON overlay note. The trailer is the
 * canonical backbone (PERSIST-13): if it is absent there is no dossier to reconstruct (`null`). Total —
 * a malformed note is ignored, never thrown.
 */
function deserializeDossier(trailerText: string | null, noteJson: string | null): Dossier | null {
  if (trailerText === null) return null
  const dossier: { trailer: Trailer; metering?: Metering; knowledgeDelta?: VersionDelta } = {
    trailer: parseTrailer(trailerText),
  }
  if (noteJson !== null) {
    try {
      const overlay = JSON.parse(noteJson) as { metering?: Metering; knowledgeDelta?: VersionDelta }
      if (overlay.metering !== undefined) dossier.metering = overlay.metering
      if (overlay.knowledgeDelta !== undefined) dossier.knowledgeDelta = overlay.knowledgeDelta
    } catch {
      /* a malformed overlay note is ignored — the canonical trailer still reconstructs the dossier */
    }
  }
  return dossier
}

/** Parse the PR projection body back to a `PrAttach`; a malformed body yields `null` (total, never throws). */
function safeParsePR(body: string): PrAttach | null {
  try {
    return JSON.parse(body) as PrAttach
  } catch {
    return null
  }
}

/**
 * Build the one-per-host adapter over the low-level `Forge` port. Every forge interaction flows through
 * this object and is stamped `ADAPTER_VIA`, so `directForgeCalls` finds none in the happy path. Reads are
 * total (`null` on absence). `attachToPR`/`readPR` treat the host PR as a disposable projection.
 */
export function makeHostAdapter(forge: Forge): ConfigurableHostAdapter {
  return {
    attachToCommit(sha: string, dossier: Dossier): void {
      forge.writeCommit(sha, serializeTrailer(dossier.trailer), serializeNote(dossier), ADAPTER_VIA)
    },
    readCommit(sha: string): Dossier | null {
      const trailer = forge.readTrailer(sha, ADAPTER_VIA)
      const note = forge.readNote(sha, ADAPTER_VIA)
      if (trailer === null && note === null) return null
      return deserializeDossier(trailer, note)
    },
    attachToPR(prId: string, prAttach: PrAttach): void {
      forge.writePR(prId, JSON.stringify(prAttach), ADAPTER_VIA)
    },
    readPR(prId: string): PrAttach | null {
      const body = forge.readPRBody(prId, ADAPTER_VIA)
      return body === null ? null : safeParsePR(body)
    },
    configurePushRefspec(): void {
      forge.configurePush(NOTES_PUSH_REFSPEC, ADAPTER_VIA)
    },
  }
}

/** REQ-PERSIST-8-a audit: every forge call NOT stamped `ADAPTER_VIA` — a direct forge call bypassing the
 *  adapter (host coupling leaking outside the single adapter impl). Empty ⇒ forge-agnosticism holds. */
export function directForgeCalls(forge: Forge): readonly ForgeCall[] {
  return forge.calls().filter((c) => c.via !== ADAPTER_VIA)
}

/** REQ-PERSIST-8-b: does a configured push refspec carry the notes namespace (`refs/notes/*`)? */
export function pushCarriesNotes(forge: Forge): boolean {
  return forge.pushRefspecs().some((r) => r.startsWith("refs/notes/"))
}
