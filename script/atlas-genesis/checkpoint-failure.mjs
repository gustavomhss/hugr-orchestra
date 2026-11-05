import assert from "node:assert/strict"

// Error messages, stacks, stdout and response bodies may contain credentials. Never serialize them here.
export function checkpointFailure(error, phase) {
  assert(["runner", "publish", "snapshot", "http"].includes(phase), "checkpoint: invalid failure phase")
  const receipt = { version: 1, phase, kind: "unknown" }
  if (error?.name === "ModelCommandError" && ["not-found", "timeout", "nonzero-exit"].includes(error.reason)) {
    return { ...receipt, kind: "model-command", reason: error.reason }
  }
  if (error?.name === "CheckpointRemoteError" && Number.isInteger(error.status) && error.status >= 400 &&
    error.status <= 599 && ["GET", "PUT", "POST"].includes(error.method)) {
    return { ...receipt, kind: "remote-http", status: error.status, method: error.method }
  }
  if (["TimeoutError", "AbortError"].includes(error?.name)) return { ...receipt, kind: "transport", reason: "deadline" }
  const code = error?.cause?.code ?? error?.code
  if (["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) {
    return { ...receipt, kind: "transport", reason: code }
  }
  return receipt
}
