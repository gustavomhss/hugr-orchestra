import { afterEach, describe, expect, test } from "bun:test"
import { connect as connectSocket } from "node:net"
import { AppDockSocket } from "@orchestra/app-dock/socket-transport"
import { startDockChannel } from "./dock-channel"

const channels: Array<{ close: () => Promise<void> }> = []
afterEach(() => Promise.all(channels.splice(0).map((channel) => channel.close())))

async function start() {
  const received: unknown[] = []
  const channel = await startDockChannel({
    onMessage: (message, reply) => {
      received.push(message)
      const request = message as { id: string; args: unknown }
      reply({ type: "dock.rpc.result", id: request.id, ok: true, value: request.args })
    },
  })
  channels.push(channel)
  return { channel, received }
}

// The raw handshake, so the status line itself is what the test reads.
function handshake(url: string, headers: Record<string, string>) {
  const target = new URL(url)
  return new Promise<string>((resolve, reject) => {
    const socket = connectSocket(Number(target.port), target.hostname, () =>
      socket.write(
        [
          "GET / HTTP/1.1",
          `Host: ${target.host}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          "Sec-WebSocket-Version: 13",
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
          ...Object.entries(headers).map(([key, value]) => `${key}: ${value}`),
          "",
          "",
        ].join("\r\n"),
      ),
    )
    socket.once("data", (chunk) => {
      resolve(chunk.toString("latin1").split("\r\n")[0] ?? "")
      socket.destroy()
    })
    socket.once("error", reject)
  })
}

describe("Dock channel", () => {
  test("refuses a wrong token and any browser origin, and accepts this launch's token", async () => {
    const { channel } = await start()
    expect(await handshake(channel.url, { Authorization: "Bearer wrong" })).toBe("HTTP/1.1 401 Unauthorized")
    expect(await handshake(channel.url, {})).toBe("HTTP/1.1 401 Unauthorized")
    expect(
      await handshake(channel.url, { Authorization: `Bearer ${channel.token}`, Origin: "https://example.com" }),
    ).toBe("HTTP/1.1 403 Forbidden")
    expect(await handshake(channel.url, { Authorization: `Bearer ${channel.token}` })).toBe(
      "HTTP/1.1 101 Switching Protocols",
    )
  })

  test("carries a utility-port request and its reply through the child transport", async () => {
    const { channel, received } = await start()
    const transport = AppDockSocket.fromEnv(channel.env)
    if (!transport) throw new Error("expected a transport from the channel env")
    const reply = new Promise<unknown>((resolve) => transport.on("message", (event) => resolve(event.data)))
    const big = "x".repeat(70_000)
    transport.postMessage({ type: "dock.rpc", id: "r1", op: "read", args: { budget: 500, big } })

    expect(await reply).toEqual({ type: "dock.rpc.result", id: "r1", ok: true, value: { budget: 500, big } })
    expect(received).toEqual([{ type: "dock.rpc", id: "r1", op: "read", args: { budget: 500, big } }])
  })
})
