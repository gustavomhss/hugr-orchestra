import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { GitHubCommandFixture } from "../fixture/github-command"

const f = GitHubCommandFixture
const Call = Schema.Struct({ args: Schema.Array(Schema.String), stdin: Schema.String })

f.it.live("W1 dispatch uses real reader/preflight and JSON stdin, with exact native run acknowledgement", Effect.gen(function* () {
  const fixture = yield* f.subprocess()
  const recorded = f.recorded()
  yield* fixture.reply(Object.fromEntries(Object.entries(recorded.routes).map(([key, response]) => [key, {
    status: "status" in response ? response.status : 500, data: "data" in response ? response.data : null,
    headers: "headers" in response ? response.headers : {},
  }])))
  expect(yield* fixture.commands.perform(f.binding, f.intent(), { ...f.dispatch, inputs: { message: "synthetic-secret $(touch sentinel)" } }))
    .toEqual({ acknowledgement: { runID: "9101" } })
  const calls = (yield* fixture.calls()).trim().split("\n").map((line) => Schema.decodeUnknownSync(Schema.fromJsonString(Call))(line))
  const post = calls.filter((call) => call.args.includes("POST"))
  expect(post).toHaveLength(1)
  expect(post[0].args.join(" ")).not.toContain("synthetic-secret")
  expect(post[0].args).toContain("X-GitHub-Api-Version: 2026-03-10")
  expect(post[0].args.at(-1)).toBe(`${f.root}/actions/workflows/161335/dispatches`)
  expect(Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(post[0].stdin)).toMatchObject({ ref: "release",
    inputs: { message: "synthetic-secret $(touch sentinel)", flag: false, count: 3 } })
}))

f.it.live("W1 complete native empty201 rerun and empty202 cancel frames are acknowledgements, not invented attempts", Effect.gen(function* () {
  const fixture = yield* f.subprocess()
  const recorded = f.recorded()
  yield* fixture.reply(Object.fromEntries(Object.entries(recorded.routes).map(([key, response]) => [key, {
    status: "status" in response ? response.status : 500,
    ...("status" in response && [201, 202, 204].includes(response.status) ? { raw: "" } : { data: "data" in response ? response.data : null }),
    headers: "headers" in response ? response.headers : {},
  }])))
  expect(yield* fixture.commands.perform(f.binding, f.intent("run.retry", { runID: "30433642" }, { attempt: 3 }), { provider: "github", mode: "all" }))
    .toEqual({ acknowledgement: { runID: "30433642" } })
  recorded.routes[`GET ${f.root}/actions/runs/30433642`] = f.reply({ ...f.run, status: "in_progress", conclusion: null })
  yield* fixture.reply(Object.fromEntries(Object.entries(recorded.routes).map(([key, response]) => [key, {
    status: "status" in response ? response.status : 500,
    ...("status" in response && [201, 202, 204].includes(response.status) ? { raw: "" } : { data: "data" in response ? response.data : null }),
    headers: "headers" in response ? response.headers : {},
  }])))
  expect(yield* fixture.commands.perform(f.binding, f.intent("run.cancel", { runID: "30433642" }), { provider: "github" }))
    .toEqual({ acknowledgement: { runID: "30433642" } })
  expect(fixture.requests.filter((request) => request.method !== "GET")).toHaveLength(2)
}))
