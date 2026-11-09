import { expect, test } from "bun:test"
import { Effect } from "effect"
import { fetchFeed, isPublicAddress, parseFeed } from "../../src/inbox/feed"

test("RSS and Atom use real XML parsing, stable IDs and plain text, never scripts or unsafe links", () => {
  const rss = parseFeed(
    '<rss version="2.0"><channel><title>News</title><item><guid>one</guid><title>A &amp; B</title><link>https://example.com/one</link><description><![CDATA[<script>not executed</script>]]></description></item></channel></rss>',
    "https://example.com/feed",
  )
  expect(rss).toEqual([
    { id: "one", title: "A & B", text: "<script>not executed</script>", href: "https://example.com/one" },
  ])
  const atom = parseFeed(
    '<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>yt:video:one</id><title>New video</title><link rel="alternate" href="https://www.youtube.com/watch?v=one"/><summary>Summary</summary></entry></feed>',
    "https://www.youtube.com/feeds/videos.xml",
  )
  expect(atom[0]?.id).toBe("yt:video:one")
  expect(atom[0]?.href).toBe("https://www.youtube.com/watch?v=one")
  expect(
    parseFeed(
      '<rss version="2.0"><channel><item><guid>unsafe</guid><title>Title</title><link>javascript:alert(1)</link></item></channel></rss>',
      "https://example.com/feed",
    )[0]?.href,
  ).toBeUndefined()
})

test("XML errors, DTD/entities, foreign roots, excessive depth and missing identities are named failures", () => {
  for (const xml of [
    "<rss><channel>",
    '<!DOCTYPE rss [<!ENTITY leak SYSTEM "file:///etc/passwd">]><rss><channel><item><guid>one</guid><title>&leak;</title></item></channel></rss>',
    "<html><body>not a feed</body></html>",
    "<rss><channel><item><title>No identity</title></item></channel></rss>",
    `<rss><channel>${"<x>".repeat(65)}${"</x>".repeat(65)}</channel></rss>`,
  ])
    expect(() => parseFeed(xml, "https://example.com/feed")).toThrow()
})

test("feed network policy distinguishes global addresses from private, special and mapped addresses", () => {
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "2a00:1450::1"])
    expect(isPublicAddress(address)).toBe(true)
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "192.0.2.1",
    "192.88.99.1",
    "198.18.0.1",
    "224.0.0.1",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "2002:7f00:1::",
    "not-an-ip",
  ])
    expect(isPublicAddress(address)).toBe(false)
})

test("bounded feed GET uses validators, handles 304 and refuses private redirects before another request", async () => {
  const calls: Request[] = []
  const state = { redirect: false, large: false }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      calls.push(req)
      if (state.redirect) return new Response(null, { status: 302, headers: { Location: "https://127.0.0.1/private" } })
      if (state.large) return new Response("x".repeat(300_000))
      if (req.headers.get("if-none-match") === '"v1"') return new Response(null, { status: 304 })
      return new Response(
        '<rss version="2.0"><channel><item><guid>one</guid><title>Title</title></item></channel></rss>',
        { headers: { ETag: '"v1"', "Content-Type": "application/rss+xml" } },
      )
    },
  })
  try {
    const options = { fixtureOrigin: server.url.origin }
    const first = await Effect.runPromise(fetchFeed("https://feeds.example/rss", {}, options))
    expect(first.status).toBe("ok")
    expect(first.etag).toBe('"v1"')
    expect(
      (await Effect.runPromise(fetchFeed("https://feeds.example/rss", { etag: first.etag }, options))).status,
    ).toBe("not_modified")
    state.redirect = true
    expect(
      await Effect.runPromise(fetchFeed("https://feeds.example/rss", {}, options).pipe(Effect.flip)),
    ).toMatchObject({ reason: "invalid_response" })
    expect(calls).toHaveLength(3)
    state.redirect = false
    state.large = true
    expect(
      await Effect.runPromise(fetchFeed("https://feeds.example/rss", {}, options).pipe(Effect.flip)),
    ).toMatchObject({ reason: "response_limit" })
  } finally {
    await server.stop(true)
  }
})
