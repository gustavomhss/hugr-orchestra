import { expect, test } from "bun:test"
import { OutputInspector } from "../src/output-inspector"

test("quarantine covers every split of closed recognized shapes before retention", () => {
  for (const secret of ["AKIA" + "Q".repeat(16), "ASIA" + "Q".repeat(16),
    ...["p", "o", "u", "s", "r"].map((kind) => `gh${kind}_` + "Q".repeat(36)),
    "sk_live_" + "Q".repeat(20), "sk-proj-" + "Q".repeat(20),
    ...["", "RSA ", "EC ", "OPENSSH "].map((kind) => `-----BEGIN ${kind}PRIVATE KEY-----`),
  ]) {
    for (let split = 1; split < secret.length; split++) {
      const inspection = OutputInspector.quarantine()
      const ordinary = inspection.push("z\n".repeat(1000))
      expect(ordinary.text.length).toBe(1936)
      const prefix = inspection.push(secret.slice(0, split))
      expect(prefix.reason).toBeUndefined()
      expect(prefix.text).not.toContain(secret.slice(0, split))
      const held = inspection.push(secret.slice(split))
      expect(held).toEqual({ reason: "recognized-secret-output", text: "" })
      expect(inspection.finish()).toEqual({ reason: "recognized-secret-output", text: "" })
    }
  }
})

test("quarantine emits safe large chunks with bounded pending tail and lossless Unicode finish", () => {
  const inspection = OutputInspector.quarantine()
  const input = "z".repeat(100000) + "😀" + "z".repeat(63)
  const output = inspection.push(input)
  expect(output.reason).toBeUndefined()
  expect(input.length - output.text.length).toBe(65)
  const finish = inspection.finish()
  expect(finish.reason).toBeUndefined()
  expect(output.text + finish.text).toBe(input)
  const near = OutputInspector.quarantine()
  expect(near.push("ghp_short").text).toBe("")
  expect(near.finish()).toEqual({ reason: undefined, text: "ghp_short" })
})
