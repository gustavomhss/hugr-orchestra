import { systemPreferences } from "electron"

// Per-sense permission status for the live seat, in the overlay's vocabulary. macOS "not-determined" is "on-request":
// the system asks on first use. System audio has no status API; it stays "on-request" until capture proves it.

export type SenseStatus = "granted" | "denied" | "on-request"
export type SensePermissions = { microphone: SenseStatus; systemAudio: SenseStatus; screen: SenseStatus }

export function readPermissions(systemAudio: SenseStatus): SensePermissions {
  if (process.platform !== "darwin") return { microphone: "granted", systemAudio, screen: "granted" }
  return {
    microphone: senseStatus(systemPreferences.getMediaAccessStatus("microphone")),
    systemAudio,
    screen: senseStatus(systemPreferences.getMediaAccessStatus("screen")),
  }
}

// Asks for the microphone on the first meeting start. Screen recording and system audio cannot be asked for directly;
// macOS prompts when the first frame or loopback stream is requested.
export async function requestMicrophone() {
  if (process.platform !== "darwin") return true
  return systemPreferences.askForMediaAccess("microphone")
}

export function senseStatus(status: string): SenseStatus {
  if (status === "granted") return "granted"
  if (status === "denied" || status === "restricted") return "denied"
  return "on-request"
}
