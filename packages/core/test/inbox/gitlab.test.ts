import { expect, test } from "bun:test"
import { Effect } from "effect"
import { requestWithMetadata } from "../../src/capability/channel/http"
import { gitlabTodos } from "../../src/inbox/gitlab"

test("GitLab pending personal to-dos paginate empty pages and never include CI or unsafe destinations", async () => {
  const calls: URL[] = []
  const todo = {
    id: 1,
    state: "pending",
    action_name: "mentioned",
    body: "Please review",
    updated_at: "2026-11-05T00:00:00Z",
    author: { username: "ada" },
    project: { id: 20 },
    target_url: "https://gitlab.example.com/team/project/-/issues/1",
  }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      calls.push(url)
      expect(req.headers.get("authorization")).toBe("Bearer fixture-gitlab")
      if (url.pathname.endsWith("/user")) return Response.json({ id: 99 })
      if (url.searchParams.get("page") === "1")
        return Response.json([], {
          headers: { Link: '<https://gitlab.example.com/api/v4/todos?state=pending&per_page=100&page=2>; rel="next"' },
        })
      return Response.json([
        todo,
        todo,
        { ...todo, id: 2, action_name: "build_failed" },
        { ...todo, id: 3, target_url: "https://evil.example/" },
        { action_name: "ssh_key_expired", project: null, author: null },
      ])
    },
  })
  try {
    const result = await Effect.runPromise(
      gitlabTodos(
        (input) =>
          requestWithMetadata("https://gitlab.example.com", "Bearer fixture-gitlab", input, {
            fixtureOrigin: server.url.origin,
          }),
        "https://gitlab.example.com",
        [],
      ),
    )
    expect(result).toHaveLength(2)
    expect(result[0]?.deepLink).toBe(todo.target_url)
    expect(result[1]?.deepLink).toBeUndefined()
    expect(result.every((item) => !item.reply)).toBe(true)
    expect(calls.map((url) => url.pathname)).toEqual(["/api/v4/user", "/api/v4/todos", "/api/v4/todos"])
  } finally {
    await server.stop(true)
  }
})

test("GitLab filtering is local, cross-instance/cyclic/broadened next links fail without following them", async () => {
  for (const next of [
    "https://evil.example/api/v4/todos?page=2",
    "https://gitlab.example.com/api/v4/todos?page=1",
    "https://gitlab.example.com/api/v4/todos?page=2&state=done",
  ]) {
    const calls: URL[] = []
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const url = new URL(req.url)
        calls.push(url)
        return url.pathname.endsWith("/user")
          ? Response.json({ id: 99 })
          : Response.json([], { headers: { Link: `<${next}>; rel="next"` } })
      },
    })
    try {
      expect(
        await Effect.runPromise(
          gitlabTodos(
            (input) =>
              requestWithMetadata("https://gitlab.example.com", "Bearer fixture-gitlab", input, {
                fixtureOrigin: server.url.origin,
              }),
            "https://gitlab.example.com",
            ["20"],
          ).pipe(Effect.flip),
        ),
      ).toMatchObject({ reason: "invalid_response" })
      expect(calls).toHaveLength(2)
    } finally {
      await server.stop(true)
    }
  }
})
