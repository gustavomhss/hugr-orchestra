// Closed cargo/libtest output contract, not source/prose detection. Fake cargo controls
// exercise orchestration only; qualification requires the native job's real cargo log.
export const nativeJobTest = "windows::tests::job_lifetime::native_job_closes_before_stopped_and_release"

export function requireNativeJobReceipts(output: string) {
  const lines = output.replaceAll("\r\n", "\n").trimEnd().split("\n")
  const prefix = `test ${nativeJobTest} ... `
  const tests = lines.filter((line) => line.startsWith(prefix))
  if (tests.length !== 1) throw new Error("BUNDLE_NATIVE_JOB_TEST_MISSING")
  const start = lines.findIndex((line) => line.startsWith(prefix))
  const end = lines.findIndex((line, index) => index > start && (line.startsWith("test ") || line.startsWith("test result:")))
  const summary = lines.find((line, index) => index > start && line.startsWith("test result:"))
  if (end < 0 || !summary) throw new Error("BUNDLE_NATIVE_JOB_RESULT_INVALID")
  const normalized = lines.slice(start, end).map((line) => line.startsWith(prefix) ? line.slice(prefix.length) : line)
  const receipts = [
    ...["stop", "natural", "descendant", "unknown"].map((name) => `native Job lifetime control: ${name} passed`),
    "native Job mutation control: original owned handle stayed valid; OS oracle rejected it",
  ]
  receipts.forEach((receipt) => {
    if (normalized.filter((line) => line === receipt).length !== 1) throw new Error(`BUNDLE_NATIVE_JOB_RECEIPT_MISSING: ${receipt}`)
  })
  if (normalized.filter((line) => line === "ok").length !== 1 ||
      !/^test result: ok\. [1-9]\d* passed; 0 failed; 0 ignored; 0 measured; \d+ filtered out; finished in [\d.]+s$/.test(summary) ||
      lines.some((line) => /^test result: (?!ok\..*; 0 failed;)/.test(line)))
    throw new Error("BUNDLE_NATIVE_JOB_RESULT_INVALID")
  const positions = receipts.map((receipt) => normalized.indexOf(receipt))
  if (positions.some((position, index) => index > 0 && position <= positions[index - 1]) ||
      normalized.indexOf("ok") <= positions[positions.length - 1]) throw new Error("BUNDLE_NATIVE_JOB_RECEIPT_ORDER")
}

if (import.meta.main) requireNativeJobReceipts(await Bun.file(process.argv[2]).text())
