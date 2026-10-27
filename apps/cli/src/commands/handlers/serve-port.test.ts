import { describe, expect, test } from "bun:test"
import { createServer } from "node:net"
import { addressInUse } from "./serve-port"

describe("serve port retry", () => {
  test("recognizes a taken port, also inside wrapped causes", async () => {
    const first = createServer()
    await new Promise<void>((resolve) => first.listen(0, "127.0.0.1", resolve))
    const port = (first.address() as { port: number }).port
    const error = await new Promise<unknown>((resolve) => {
      const second = createServer()
      second.once("error", resolve)
      second.listen(port, "127.0.0.1")
    })
    first.close()

    expect(addressInUse(error)).toBe(true)
    expect(addressInUse({ _tag: "ServeError", cause: error })).toBe(true)
  })

  test("does not treat other bind failures as a taken port", () => {
    expect(addressInUse(Object.assign(new Error("denied"), { code: "EACCES" }))).toBe(false)
    expect(addressInUse({ cause: { cause: new Error("boom") } })).toBe(false)
    expect(addressInUse(undefined)).toBe(false)
  })
})
