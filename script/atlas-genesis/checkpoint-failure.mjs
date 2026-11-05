import assert from "node:assert/strict"

// Error messages, stacks, stdout and response bodies may contain credentials. Never serialize them here.
export function checkpointFailure(error, phase) {
  assert(["runner", "publish", "snapshot", "http"].includes(phase), "checkpoint: invalid failure phase")
  const receipt = { version: 1, phase, kind: "unknown" }
  try {
    // Snapshot primitives once: accessors may throw or change their value between validation and return.
    const name = error?.name
    if (name === "ModelCommandError") {
      const reason = error.reason
      if (["not-found", "timeout", "nonzero-exit"].includes(reason)) return { ...receipt, kind: "model-command", reason }
      return receipt
    }
    if (name === "CheckpointRemoteError") {
      const status = error.status
      const method = error.method
      if (Number.isInteger(status) && status >= 400 && status <= 599 && ["GET", "PUT", "POST"].includes(method)) {
        return { ...receipt, kind: "remote-http", status, method }
      }
      return receipt
    }
    if (["TimeoutError", "AbortError"].includes(name)) return { ...receipt, kind: "transport", reason: "deadline" }
    const code = error?.cause?.code ?? error?.code
    if (["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) {
      return { ...receipt, kind: "transport", reason: code }
    }
  } catch {
    return receipt
  }
  return receipt
}
