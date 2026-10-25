import { describe, expect, test } from "bun:test"
import path from "path"
import { clientUrl, stubServer } from "./test-support"
import { prepare } from "./attach"

const base = { continue: false, fork: false }

describe("attach", () => {
  test("requires --continue or --session for --fork", async () => {
    await expect(prepare({ ...base, url: "http://127.0.0.1:1", fork: true })).rejects.toThrow(
      "--fork requires --continue or --session",
    )
  })

  test("reports a session the server does not have", async () => {
    const server = stubServer(() => new Response("not found", { status: 404 }))
    try {
      await expect(prepare({ ...base, url: clientUrl(server), session: "ses_missing" })).rejects.toThrow(
        "Session not found: ses_missing",
      )
    } finally {
      server.stop(true)
    }
  })

  test("returns the transport, args and directory for an existing session", async () => {
    const server = stubServer((request) =>
      new URL(request.url).pathname === "/api/session/ses_1"
        ? Response.json({ data: { id: "ses_1", title: "t" } })
        : new Response("not found", { status: 404 }),
    )
    try {
      const target = await prepare({ ...base, url: clientUrl(server), session: "ses_1", dir: ".", password: "secret" })
      expect(target.transport.url).toBe(clientUrl(server))
      expect(new Headers(target.transport.headers).get("authorization")).toStartWith("Basic ")
      expect(target.args).toEqual({ continue: false, sessionID: "ses_1", fork: false })
      expect(target.directory).toBe(path.resolve("."))
    } finally {
      server.stop(true)
    }
  })

  test("--mini reaches the TUI args", async () => {
    const target = await prepare({ ...base, url: "http://127.0.0.1:1", mini: true })
    expect(target.args.mini).toBe(true)
    expect((await prepare({ ...base, url: "http://127.0.0.1:1" })).args).not.toHaveProperty("mini")
  })

  test("passes a directory that does not exist locally through to the remote server", async () => {
    const target = await prepare({ ...base, url: "http://127.0.0.1:1", dir: "/remote/only/dir" })
    expect(target.directory).toBe("/remote/only/dir")
  })
})
