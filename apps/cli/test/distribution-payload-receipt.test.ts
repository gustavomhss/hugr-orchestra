import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { payloadReceipt, retainPayloadReceipt } from "./fixture/distribution-payload-receipt"

const payload = {
  version: "1.18.27",
  manifest: {
    version: "1.18.27",
    target: "darwin-arm64",
    files: [{ path: "bin/orchestra", sha256: "a".repeat(64) }],
  },
  archive: {
    sha256: "b".repeat(64),
    version: "1.18.27",
    target: "darwin-arm64",
    file: "/tmp/orchestra-distribution-native/1.18.27.tar.gz",
  },
}

describe("native payload receipt", () => {
  test("names the qualified bytes and drops the temp archive path", () => {
    const receipt = payloadReceipt({
      target: "darwin-arm64",
      channels: ["npm", "curl"],
      payloads: [payload],
      npm: [{ name: "@humanguardrail/cli-darwin-arm64", version: "1.18.27", integrity: "sha512-abc", shasum: "c".repeat(40) }],
      env: { GITHUB_SHA: "692dbc2062", GITHUB_RUN_ID: "42825161795", GITHUB_RUN_ATTEMPT: "1", GITHUB_JOB: "qualification" },
    })

    expect(receipt.schema).toBe("orchestra-native-payload-receipt-v1")
    expect(receipt.sourceSHA).toBe("692dbc2062")
    expect(receipt.runId).toBe("42825161795")
    expect(receipt.runAttempt).toBe("1")
    expect(receipt.channels).toEqual(["curl", "npm"])
    expect(receipt.payloads[0].archive).toEqual({ sha256: "b".repeat(64), version: "1.18.27", target: "darwin-arm64" })
    expect(JSON.stringify(receipt)).not.toContain("orchestra-distribution-native")
  })

  test("writes the receipt inside distribution-logs and keeps both channels", async () => {
    const workspace = await mkdtemp(join(await realpath(tmpdir()), "payload-receipt-"))
    try {
      await retainPayloadReceipt({
        target: "darwin-arm64",
        channels: ["curl"],
        payloads: [payload],
        env: { GITHUB_WORKSPACE: workspace, GITHUB_SHA: "abc" },
      })
      const file = await retainPayloadReceipt({
        target: "darwin-arm64",
        channels: ["npm"],
        payloads: [payload],
        npm: [{ name: "@humanguardrail/cli", version: "1.18.27", integrity: "sha512-abc", shasum: "d".repeat(40) }],
        env: { GITHUB_WORKSPACE: workspace, GITHUB_SHA: "abc" },
      })

      expect(file).toBe(join(workspace, "distribution-logs", "payloads.json"))
      const written = JSON.parse(await readFile(file, "utf8"))
      expect(written.channels).toEqual(["curl", "npm"])
      expect(written.npm).toEqual([{ name: "@humanguardrail/cli", version: "1.18.27", integrity: "sha512-abc", shasum: "d".repeat(40) }])
      expect(written.payloads[0].archive.sha256).toBe("b".repeat(64))
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  test("refuses to write without the hosted workspace", async () => {
    await expect(retainPayloadReceipt({ target: "darwin-arm64", channels: ["npm"], payloads: [payload], env: {} })).rejects.toThrow("PAYLOAD_RECEIPT_WORKSPACE_REQUIRED")
  })
})
