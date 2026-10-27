import { release } from "node:os"
import { shell, systemPreferences } from "electron"
import type { LivePermission, LiveReadiness, LiveSource } from "@orchestra/app/live"

import { hasTranscriptionKey } from "./live-key"

// What the live seat needs before a meeting, in the settings screen's vocabulary. System audio rides on the screen
// recording permission (the Core Audio tap is granted through it), so both its pane and its status are the screen's.

export const PANES = {
  microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
  "system-audio": "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
}

export function permissionFor(status: string): LivePermission {
  if (status === "granted") return "granted"
  if (status === "denied" || status === "restricted") return "denied"
  return "needed"
}

// Darwin 23.2 is macOS 14.2, the first release with the system audio tap. Other platforms report no system audio.
export function systemAudioAvailable(platform: string, kernel: string) {
  if (platform !== "darwin") return false
  const [major = 0, minor = 0] = kernel.split(".").map(Number)
  return major > 23 || (major === 23 && minor >= 2)
}

export function sourcePermissions(): Record<LiveSource, LivePermission> {
  if (process.platform !== "darwin") return { microphone: "granted", "system-audio": "granted" }
  return {
    microphone: permissionFor(systemPreferences.getMediaAccessStatus("microphone")),
    "system-audio": permissionFor(systemPreferences.getMediaAccessStatus("screen")),
  }
}

// The default input device's name is not known to main without native code, so the label stays undefined.
export function readiness(answerModel: string | undefined): LiveReadiness {
  return {
    permissions: sourcePermissions(),
    microphone: undefined,
    systemAudio: { available: systemAudioAvailable(process.platform, release()) },
    transcriptionKey: hasTranscriptionKey(),
    // v1 never probes the provider, so reachability is unknown.
    answerModel: answerModel ? { id: answerModel, reachable: "unknown" } : undefined,
  }
}

export async function requestPermission(source: LiveSource) {
  const current = sourcePermissions()[source]
  if (current === "granted") return current
  if (current === "denied") {
    await shell.openExternal(PANES[source])
    return current
  }
  // Only the microphone has a prompt API; screen recording asks on the first capture, so its pane is the way in.
  if (source === "microphone") return (await systemPreferences.askForMediaAccess("microphone")) ? "granted" : "denied"
  await shell.openExternal(PANES[source])
  return sourcePermissions()[source]
}
