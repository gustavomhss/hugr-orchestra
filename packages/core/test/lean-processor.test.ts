import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import { LeanProcessor } from "../src/tool/lean-processor"

const output = "=== RUN   TestOne\n--- PASS: TestOne (0.00s)\nPASS\nok  \texample.test\t0.001s\n"

test("approved backend artifact identity and actual pure engine reduction", async () => {
  const bytes = await Bun.file(path.join(import.meta.dir, "../vendor/hugr-lean-0.2.0.tgz")).arrayBuffer()
  expect(bytes.byteLength).toBe(110798)
  expect(createHash("sha256").update(new Uint8Array(bytes)).digest("hex"))
    .toBe("4e46ae0534937bdfedd46f667292d9904f2446a0fe01479ea0e6c71a74862af6")
  const result = LeanProcessor.process({ source: "shell", command: "go test -v .", output,
    termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" })
  expect(result.status).toBe("reduced")
  if (result.status !== "reduced") throw new Error("Approved engine did not reduce the controlled complete Go output")
  expect(result.replacement).toBe("PASS\nok  \texample.test\t0.001s\n")
  expect(result.inputBytes).toBe(Buffer.byteLength(output))
  expect(result.outputBytes).toBe(Buffer.byteLength(result.replacement))
})

test("actual backend engine preserves unknown output and nonzero termination", () => {
  for (const observation of [
    { output: "unknown producer output", termination: { kind: "exited" as const, code: 0 } },
    { output, termination: { kind: "exited" as const, code: 7 } },
  ]) {
    const result = LeanProcessor.process({ source: "shell", command: "go test -v .", completeness: "complete",
      presentation: "unknown", ...observation })
    expect(result.status).toBe("passthrough")
    expect("replacement" in result).toBe(false)
  }
})
