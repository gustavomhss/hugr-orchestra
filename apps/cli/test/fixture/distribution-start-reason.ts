// Service stderr stays private; only the CLI's fixed start reason code passes.
// Effect's pretty logger may wrap that code in ANSI, which must not hide it.
export function startReason(stderr: string) {
  const plain = stderr.replace(/\u001b\[[0-9;]*m/g, "")
  const reason = plain.match(/Failed to start server \((?:exited (?:code=\d+|signal=SIG[A-Z0-9]+)|[a-z-]+), \d+ms\)/)?.[0]
  return reason ? `\n${reason}` : ""
}
