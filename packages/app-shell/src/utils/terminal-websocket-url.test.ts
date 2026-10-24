import { describe, expect, test } from "bun:test"
import { fetchPtyTicket } from "./pty-ticket"
import { terminalWebSocketURL } from "./terminal-websocket-url"

describe("terminalWebSocketURL", () => {
  test("uses the current ticketed PTY route", () => {
    const url = terminalWebSocketURL({
      url: "http://127.0.0.1:49365",
      id: "pty_test",
      directory: "/tmp/project",
      cursor: 0,
      ticket: "connect-ticket",
    })

    expect(url.protocol).toBe("ws:")
    expect(url.username).toBe("")
    expect(url.password).toBe("")
    expect(url.pathname).toBe("/api/pty/pty_test/connect")
    expect(url.searchParams.get("location[directory]")).toBe("/tmp/project")
    expect(url.searchParams.get("cursor")).toBe("0")
    expect(url.searchParams.get("ticket")).toBe("connect-ticket")
    expect(url.searchParams.has("auth_token")).toBe(false)
  })

  test("fetches a connect ticket with credentials and puts it on the WebSocket URL", async () => {
    const seen: { url: string; method?: string; headers: Record<string, string> }[] = []
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(input), method: init?.method, headers: init?.headers as Record<string, string> })
      return Response.json({ data: { ticket: "t-1", expires_in: 30 }, location: { directory: "/tmp/project" } })
    }) as unknown as typeof fetch
    const ticket = await fetchPtyTicket({
      url: "http://127.0.0.1:49365",
      ptyID: "pty_test",
      directory: "/tmp/project",
      password: "secret",
      fetch: fetcher,
    })
    expect(seen).toHaveLength(1)
    expect(seen[0]?.method).toBe("POST")
    expect(new URL(seen[0]!.url).pathname).toBe("/api/pty/pty_test/connect-token")
    expect(new URL(seen[0]!.url).searchParams.get("location[directory]")).toBe("/tmp/project")
    expect(seen[0]?.headers["x-orchestra-ticket"]).toBe("1")
    expect(seen[0]?.headers.Authorization).toBe(`Basic ${btoa("orchestra:secret")}`)
    const url = terminalWebSocketURL({ url: "http://127.0.0.1:49365", id: "pty_test", directory: "/tmp/project", cursor: 0, ticket })
    expect(url.searchParams.get("ticket")).toBe("t-1")
  })

  test("rejects when the server refuses the ticket", async () => {
    const fetcher = (async () => new Response("no", { status: 403 })) as unknown as typeof fetch
    await expect(fetchPtyTicket({ url: "http://h", ptyID: "p", directory: "/d", fetch: fetcher })).rejects.toThrow("403")
  })
})
