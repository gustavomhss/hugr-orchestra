import { expect, test } from "bun:test"
import { AppDockURLBridge } from "./app-dock-url-bridge"

test("real listener admits authenticated HTTPS URL and rejects unrelated requests", async () => {
  const opened: string[] = []
  const bridge = await AppDockURLBridge.create(async url => { opened.push(url) })
  const endpoint = `http://127.0.0.1:${bridge.port}/open-url`
  const post = (value: unknown, token = bridge.token) => fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(value) })
  try {
    expect((await post({ url: "https://example.com/login" })).status).toBe(204)
    expect(opened).toEqual(["https://example.com/login"])
    expect((await post({ url: "https://example.com/login" }, "0".repeat(64))).status).toBe(403)
    expect((await post({ url: "slack://callback?token=private-control" })).status).toBe(400)
    expect((await post({ url: "https://user:password@example.com/login" })).status).toBe(400)
    expect((await post({ url: "https://example.com/login", extra: true })).status).toBe(400)
    expect((await post({ url: "https://example.com/" + "x".repeat(8192) })).status).toBe(400)
    expect(opened).toEqual(["https://example.com/login"])
  } finally {
    bridge.close()
  }
})
