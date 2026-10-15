import { describe, expect, test } from "bun:test"
import { createdPullRequest, openPullRequests, pullRequestCall, pullRequestCli } from "./pull-request"

const location = { directory: "/repo", project: { id: "p", directory: "/repo" } }
const answer = (status: number, body: unknown) => {
  const response = new Response(JSON.stringify(body), { status })
  return Promise.resolve(response.ok ? { data: body, response } : { error: body, response })
}

describe("pullRequestCall", () => {
  test("a created pull request is its https address and number, nothing less", async () => {
    const created = {
      host: "github",
      repository: "acme/widgets",
      number: 31,
      url: "https://github.com/acme/widgets/pull/31",
    }
    expect(await pullRequestCall(answer(200, { location, data: created }), createdPullRequest)).toEqual({
      data: { url: created.url, number: 31 },
    })
    for (const data of [{ ...created, url: "javascript:alert(1)" }, { ...created, number: "31" }, { number: 31 }, null])
      expect(await pullRequestCall(answer(200, { location, data }), createdPullRequest)).toEqual({
        failure: { reason: "error" },
      })
  })

  test("the server's reason, host and branch survive; anything else is an error", async () => {
    const failure = {
      name: "PullRequestError",
      data: {
        kind: "branch_not_pushed",
        message: "feature is not pushed to origin",
        host: "gitlab",
        branch: "feature",
        remote: "origin",
      },
    }
    expect(await pullRequestCall(answer(400, failure), createdPullRequest)).toEqual({
      failure: {
        reason: "branch_not_pushed",
        host: "gitlab",
        branch: "feature",
        remote: "origin",
        message: "feature is not pushed to origin",
      },
    })
    expect(
      await pullRequestCall(
        answer(400, { ...failure, data: { ...failure.data, kind: "invented" } }),
        createdPullRequest,
      ),
    ).toEqual({ failure: { reason: "error" } })
    expect(
      await pullRequestCall(answer(400, { _tag: "InvalidRequestError", message: "bad" }), createdPullRequest),
    ).toEqual({ failure: { reason: "error" } })
    expect(await pullRequestCall(Promise.reject(new TypeError("Failed to fetch")), createdPullRequest)).toEqual({
      failure: { reason: "error" },
    })
  })

  test("a server without the routes is unavailable", async () => {
    for (const status of [404, 405, 501])
      expect(await pullRequestCall(answer(status, {}), openPullRequests)).toEqual({
        failure: { reason: "unavailable" },
      })
  })

  test("an open count needs a host, a whole non-negative count and the truncation flag", async () => {
    const list = { host: "gitlab", repository: "acme/widgets", count: 3, truncated: false, items: [] }
    expect(await pullRequestCall(answer(200, { location, data: list }), openPullRequests)).toEqual({
      data: { host: "gitlab", count: 3, truncated: false },
    })
    for (const data of [
      { ...list, count: -1 },
      { ...list, count: 1.5 },
      { ...list, host: "gitea" },
      { ...list, truncated: "no" },
    ])
      expect(await pullRequestCall(answer(200, { location, data }), openPullRequests)).toEqual({
        failure: { reason: "error" },
      })
  })
})

test("each host names its own CLI", () => {
  expect(pullRequestCli("github")).toBe("gh")
  expect(pullRequestCli("gitlab")).toBe("glab")
})
