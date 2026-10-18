import { afterAll, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Liveness } from "@orchestra/core/research-toolkit/liveness"

const seen: string[] = []
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url)
    seen.push(`${request.method} ${url.pathname} ${request.headers.get("user-agent")} ${request.headers.get("range") ?? ""}`)
    if (url.pathname === "/ok") return new Response("ok")
    if (url.pathname === "/nohead") return request.method === "HEAD" ? new Response(null, { status: 405 }) : new Response("x", { status: 206 })
    if (url.pathname === "/hop") return Response.redirect(`${url.origin}/ok`, 302)
    if (url.pathname === "/loop") return Response.redirect(`${url.origin}/loop`, 302)
    if (url.pathname === "/slow") return new Promise<Response>(() => {})
    if (url.pathname === "/limited") return new Response(null, { status: 429 })
    return new Response("no", { status: 404 })
  },
})
afterAll(() => server.stop(true))
const base = `http://127.0.0.1:${server.port}`
const check = (urls: string[], extra: Partial<Liveness.Options> = {}) => Effect.runPromise(Liveness.check(urls, { privateNetwork: true, ...extra }))

describe("Liveness", () => {
  test("classifies 2xx, redirects, 4xx and loops", async () => {
    const results = await check([`${base}/ok`, `${base}/hop`, `${base}/gone`, `${base}/loop`, `${base}/limited`], { seen: [`${base}/gone`, `${base}/loop`] })
    expect(results.map((item) => item.status)).toEqual(["LIVE", "LIVE", "DEAD", "DEAD", "UNKNOWN"])
    expect(results[2].httpStatus).toBe(404)
  })

  test("a dead URL the dispatch never saw is LIKELY_HALLUCINATED", async () => {
    expect((await check([`${base}/gone`]))[0].status).toBe("LIKELY_HALLUCINATED")
  })

  test("HEAD first, then a one-byte ranged GET, with the fixed user agent", async () => {
    seen.length = 0
    expect((await check([`${base}/nohead`]))[0]).toMatchObject({ status: "LIVE", httpStatus: 206 })
    expect(seen).toEqual([`HEAD /nohead ${Liveness.USER_AGENT} `, `GET /nohead ${Liveness.USER_AGENT} bytes=0-0`])
  })

  test("a capture younger than 24 h is LIVE with no request", async () => {
    seen.length = 0
    const now = Date.now()
    const results = await check([`${base}/gone`, `${base}/gone/`.replace(/\/$/, "")], { now, captured: [{ url: `${base}/gone#x`, capturedAt: now - 1000 }] })
    expect(results.map((item) => item.status)).toEqual(["LIVE"])
    expect(seen).toEqual([])
    const stale = await check([`${base}/gone`], { now, captured: [{ url: `${base}/gone`, capturedAt: now - 25 * 3600_000 }], seen: [`${base}/gone`, `${base}/loop`] })
    expect(stale[0].status).toBe("DEAD")
  })

  test("private addresses and unknown schemes are refused by policy, not fetched", async () => {
    seen.length = 0
    const results = await Effect.runPromise(Liveness.check([`${base}/ok`, "ftp://example.com/a", "http://localhost/x"]))
    expect(results.map((item) => item.status)).toEqual(["UNKNOWN", "UNKNOWN", "UNKNOWN"])
    expect(seen).toEqual([])
  })

  test("a request that exceeds the timeout is UNKNOWN", async () => {
    expect((await check([`${base}/slow`]))[0].status).toBe("UNKNOWN")
  }, 15_000)

  test("domain match is by label suffix", () => {
    expect(Liveness.allowed("https://docs.github.com/a", ["github.com"])).toBe(true)
    expect(Liveness.allowed("https://github.com/a", ["github.com"])).toBe(true)
    expect(Liveness.allowed("https://evilgithub.com/a", ["github.com"])).toBe(false)
    expect(Liveness.allowed("https://x.dev", [])).toBe(false)
    expect(Liveness.allowed("https://x.dev", "unrestricted")).toBe(true)
  })
})
