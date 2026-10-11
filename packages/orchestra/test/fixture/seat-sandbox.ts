/**
 * Whether a native seat's shell command runs on this host. On macOS and Linux it runs only inside the OS sandbox that
 * confines its reads (seatbelt; srt over bubblewrap and socat) and is refused with `shell-read-sandbox-unavailable`
 * where none can start. Windows has no read sandbox and runs it with the argument checks only.
 * Linux CI provides the sandbox only to runs that start with test/linux-sandbox.hosted.ts.
 */
export function seatShellRuns() {
  if (process.platform === "darwin" || process.platform === "win32") return true
  return process.platform === "linux" && Boolean(Bun.which("srt") || (Bun.which("bwrap") && Bun.which("socat")))
}

/** The reason a seat's shell is refused where no sandbox can start. */
export const SEAT_SHELL_REFUSED = "shell-read-sandbox-unavailable"
