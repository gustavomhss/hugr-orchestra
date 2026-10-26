import { expect, test } from "bun:test"
import config from "../electron-builder.config"

// macOS kills a hardened app that opens the microphone or the system-audio tap without these usage strings.
test("the mac bundle declares the live seat's microphone and system-audio usage", () => {
  const info = config.mac?.extendInfo as Record<string, unknown> | undefined
  expect(typeof info?.NSMicrophoneUsageDescription).toBe("string")
  expect(typeof info?.NSAudioCaptureUsageDescription).toBe("string")
})
