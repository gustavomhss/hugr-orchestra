import { expect, test } from "bun:test"
import { mkdtemp, realpath, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ActivityPrivateChannel } from "@orchestra/schema/activity-private-channel"
import { DesktopOmni } from "./omni-process"
import { startOwnedServe } from "./owned-serve"
import { until } from "./omni-process.fixture"

const on = DesktopOmni.enabled()
const channelModule = new URL("../../../../packages/schema/src/activity-private-channel.ts", import.meta.url).pathname

// The child reads only the framed stdin channel. The protocol implementation stays shared with the parent.
const privateServe = `
const channel = await import(${JSON.stringify(channelModule)})
const input = new Uint8Array(await new Response(Bun.stdin.stream()).arrayBuffer())
const key = channel.keyFromFrame(input)
if (!key) process.exit(20)
const signer = await channel.signer(key)
const port = Number(process.argv[process.argv.indexOf("--port") + 1])
const password = process.env.ORCHESTRA_SERVER_PASSWORD
const expected = "Basic " + Buffer.from("orchestra:" + password).toString("base64")
const mode = process.env.PRIVATE_PROBE_MODE
process.on("SIGTERM", () => process.exit(0))
Bun.serve({
  hostname: "127.0.0.1", port,
  fetch: async (request) => {
    if (new URL(request.url).pathname === "/api/health") return new Response("ok", { status: request.headers.get("authorization") === expected ? 200 : 401 })
    if (new URL(request.url).pathname !== channel.path || request.method !== "POST") return new Response("missing", { status: 404 })
    if (mode === "hold") return new Promise(() => {})
    if (mode === "exit") setTimeout(() => process.exit(7), 100)
    const nonce = request.headers.get(channel.nonceHeader)
    if (!await signer.verify("probe-request", nonce, request.headers.get(channel.macHeader))) return new Response("bad request signature", { status: 401 })
    const responseNonce = mode === "reflect" ? nonce : nonce
    const mac = mode === "bad-mac" ? "0".repeat(64) : await signer.sign(mode === "reflect" ? "probe-request" : "probe-response", responseNonce)
    return new Response(null, { status: 200, headers: { [channel.nonceHeader]: responseNonce, [channel.macHeader]: mac } })
  },
})
`

async function startProbe(mode?: string) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "activity-private-")))
  await writeFile(join(dir, "serve.ts"), privateServe)
  const logs: string[] = []
  const output: string[] = []
  const owned = await startOwnedServe({
    logger: { log: (message, meta) => logs.push(`${message} ${JSON.stringify(meta ?? {})}`), error: (message, meta) => logs.push(`${message} ${JSON.stringify(meta ?? {})}`) },
    command: [process.execPath, join(dir, "serve.ts")],
    env: { PATH: process.env.PATH ?? "", ...(mode ? { PRIVATE_PROBE_MODE: mode } : {}) },
    cwd: dir,
    write: (_stream, message) => output.push(message),
    privateActivityApproval: true,
  })
  return { owned, logs, output }
}

test.skipIf(!on)("owned serve: private approval uses a signed stdin channel and exposes no secret", async () => {
  expectSpawn(import.meta.path)
  const probe = await startProbe()
  try {
    await probe.owned.health.wait
    expect(await probe.owned.probeActivityApproval()).toBe(true)
    expect(probe.owned.url).not.toContain(ActivityPrivateChannel.option)
    expect(probe.owned.url).not.toContain(ActivityPrivateChannel.path)
    expect(probe.logs.join("\n")).not.toContain(ActivityPrivateChannel.option)
    expect(probe.logs.join("\n")).not.toContain(ActivityPrivateChannel.path)
    expect(probe.output.join("\n")).not.toContain(ActivityPrivateChannel.option)
    expect(probe.output.join("\n")).not.toContain(ActivityPrivateChannel.path)
  } finally {
    await probe.owned.listener.stop()
  }
}, 30_000)

test.skipIf(!on)("owned serve: approval defaults false and rejects invalid signatures", async () => {
  expectSpawn(import.meta.path)
  const defaultServe = await startOwnedServe({
    logger: { log: () => {}, error: () => {} },
    command: [process.execPath, "-e", `Bun.serve({ hostname: "127.0.0.1", port: Number(process.argv.at(-1)), fetch: () => new Response("ok") })`],
    env: { PATH: process.env.PATH ?? "" }, cwd: process.cwd(), write: () => {},
  })
  try {
    await defaultServe.health.wait
    expect(await defaultServe.probeActivityApproval()).toBe(false)
  } finally {
    await defaultServe.listener.stop()
  }

  for (const mode of ["bad-mac", "reflect"]) {
    const probe = await startProbe(mode)
    try {
      await probe.owned.health.wait
      expect(await probe.owned.probeActivityApproval()).toBe(false)
    } finally {
      await probe.owned.listener.stop()
    }
  }
}, 60_000)

test.skipIf(!on)("owned serve: approval probe cancellation and child exit invalidate the channel", async () => {
  expectSpawn(import.meta.path)
  const held = await startProbe("hold")
  try {
    await held.owned.health.wait
    const controller = new AbortController()
    const pending = held.owned.probeActivityApproval(controller.signal)
    controller.abort()
    expect(await pending).toBe(false)
  } finally {
    await held.owned.listener.stop()
  }

  const exiting = await startProbe("exit")
  try {
    await exiting.owned.health.wait
    expect(await exiting.owned.probeActivityApproval()).toBe(true)
    await until(() => exiting.logs.some((line) => line.includes('"code":7')))
    expect(await exiting.owned.probeActivityApproval()).toBe(false)
  } finally {
    await exiting.owned.listener.stop()
  }
}, 60_000)
