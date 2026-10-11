export * as BackendToolkitAttempts from "./attempts"

import { Cause, Schema } from "effect"
import { PinnedArtifact } from "../pinned-artifact"
import { BackendToolkitAcquisition } from "./acquisition"
import { BackendToolkitDiagnostics } from "./diagnostics"

/**
 * Acquisition failures name the engine and bounded installer cause. A shell wait can instead report
 * `toolkit-not-ready:fetching:<engine>` while acquisition continues; invalid graphs name the missing id or cycle.
 */
export class NotReady extends Schema.TaggedErrorClass<NotReady>()("BackendToolkit.NotReady", {
  reason: Schema.String,
}) {
  override get message() {
    return `Backend toolkit not ready: ${this.reason}`
  }
}

// A failed fetch is retried by a later need after this window, not by every command.
const RETRY_MS = 5 * 60_000
// A cold cargo build of a CLI with its whole dependency graph takes minutes.
export const INSTALL_MS = 30 * 60_000

// Install keys coalesce shared dependencies; request keys own continuation through the entire dependency chain.
export const attempts = BackendToolkitAcquisition.make<PinnedArtifact.Failed | NotReady>(RETRY_MS, (cause) => {
  const text = cause.reasons.map((reason) => {
    if (Cause.isFailReason(reason)) return reason.error instanceof NotReady ? reason.error.reason : reason.error.cause
    if (Cause.isInterruptReason(reason)) return "acquisition-interrupted"
    return `acquisition-defect:${reason.defect instanceof Error ? reason.defect.message : typeof reason.defect === "string" ? reason.defect : "unknown"}`
  }).join("; ")
  return BackendToolkitDiagnostics.details(text) ?? "acquisition-details-redacted"
})
