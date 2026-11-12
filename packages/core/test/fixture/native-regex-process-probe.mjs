const pattern = "^" + "(?=a+$)".repeat(2048) + "a+$"
const subject = "a".repeat(8 * 1024 * 1024)
const output = Bun.stdout.writer({ highWaterMark: 1 })
output.write(JSON.stringify({
  type: "CPU_ENTER", payload: { pid: process.pid, patternBytes: Buffer.byteLength(pattern), subjectBytes: 8 * 1024 * 1024 },
}) + "\n")
await output.flush()
const value = new RegExp(pattern).test(subject)
output.write(JSON.stringify({ type: "CPU_DONE", payload: { pid: process.pid, value } }) + "\n")
await output.flush()
