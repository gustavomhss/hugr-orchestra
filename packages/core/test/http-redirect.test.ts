import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { HttpRedirect } from "@orchestra/core/tool/http-redirect"

describe("HttpRedirect.reach", () => {
  test("classifies loopback, private, link-local and public addresses", () => {
    const expected = {
      localhost: "loopback",
      "app.localhost": "loopback",
      "127.0.0.1": "loopback",
      "127.8.8.8": "loopback",
      "[::1]": "loopback",
      "::1": "loopback",
      "10.1.2.3": "private",
      "172.16.0.1": "private",
      "172.31.255.255": "private",
      "172.32.0.1": "public",
      "192.168.0.10": "private",
      "100.64.0.1": "private",
      "0.0.0.0": "private",
      "169.254.169.254": "link-local",
      "fe80::1": "link-local",
      "fd00::1": "private",
      "::ffff:127.0.0.1": "loopback",
      "::ffff:10.0.0.1": "private",
      "::ffff:a9fe:a9fe": "link-local",
      "64:ff9b::a9fe:a9fe": "link-local",
      "1.1.1.1": "public",
      "2606:4700:4700::1111": "public",
      "example.com": "public",
    } as const
    expect(Object.fromEntries(Object.keys(expected).map((host) => [host, HttpRedirect.reach(host)]))).toEqual(expected)
  })
})

describe("HttpRedirect.follow", () => {
  const client = (routes: Record<string, string>, seen: string[] = []) =>
    HttpClient.make((request) => {
      seen.push(request.url)
      const location = routes[request.url]
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          location ? new Response("", { status: 302, headers: { location } }) : new Response("end"),
        ),
      )
    })

  test("follows relative redirects up to the hop cap and no further", async () => {
    const routes = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`https://1.1.1.1/${index}`, `/${index + 1}`]),
    )
    const seen: string[] = []

    const error = await Effect.runPromise(
      HttpRedirect.follow(client(routes, seen), HttpClientRequest.get("https://1.1.1.1/0"), { maxHops: 5 }).pipe(
        Effect.flip,
      ),
    )
    expect(error).toBeInstanceOf(HttpRedirect.TooManyRedirects)
    expect(seen).toHaveLength(6)

    const ok = await Effect.runPromise(
      HttpRedirect.follow(client(routes), HttpClientRequest.get("https://1.1.1.1/5"), { maxHops: 5 }).pipe(
        Effect.flatMap((response) => response.text),
      ),
    )
    expect(ok).toBe("end")
  })

  test("reports the blocked target by name", async () => {
    const error = await Effect.runPromise(
      HttpRedirect.follow(
        client({ "https://1.1.1.1/a": "http://169.254.169.254/latest" }),
        HttpClientRequest.get("https://1.1.1.1/a"),
      ).pipe(Effect.flip),
    )
    expect(error).toBeInstanceOf(HttpRedirect.Blocked)
    expect(error.message).toContain("169.254.169.254")
  })

  test("refuses a redirect to a non-http scheme", async () => {
    const error = await Effect.runPromise(
      HttpRedirect.follow(
        client({ "https://1.1.1.1/a": "file:///etc/passwd" }),
        HttpClientRequest.get("https://1.1.1.1/a"),
      ).pipe(Effect.flip),
    )
    expect(error).toBeInstanceOf(HttpRedirect.Blocked)
  })

  test("asks approve once per new origin", async () => {
    const asked: string[] = []
    await Effect.runPromise(
      HttpRedirect.follow(
        client({
          "https://1.1.1.1/a": "https://1.0.0.1/b",
          "https://1.0.0.1/b": "https://1.0.0.1/c",
          "https://1.0.0.1/c": "https://1.1.1.1/d",
        }),
        HttpClientRequest.get("https://1.1.1.1/a"),
        { approve: (url) => Effect.sync(() => void asked.push(url.href)) },
      ),
    )
    expect(asked).toEqual(["https://1.0.0.1/b"])
  })
})
