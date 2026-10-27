/** Whether a bind failure means the port is taken, looking through the wrapped causes the HTTP server adds. */
export function addressInUse(error: unknown) {
  for (let depth = 0; depth < 5 && typeof error === "object" && error !== null; depth++) {
    if ((error as { code?: unknown }).code === "EADDRINUSE") return true
    error = (error as { cause?: unknown }).cause
  }
  return false
}
