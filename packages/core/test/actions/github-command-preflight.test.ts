import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsError } from "../../src/actions/error"
import { GitHubCommandFixture } from "../fixture/github-command"
import { GitHubReadFixture } from "../fixture/github-read"
import { it } from "../lib/effect"

const f = GitHubCommandFixture

it.effect("wrong dispatcher/provider/extras/ref/mode/binding/target fail definitely_unsent before preflight", Effect.gen(function* () {
  for (const [intent, payload] of [[f.intent("source.write"), f.dispatch], [f.intent(), { provider: "gitlab", ref: "release" }],
    [f.intent(), { ...f.dispatch, mode: "all" }], [f.intent(), { ...f.dispatch, ref: "main" }],
    [f.intent("run.retry", { runID: "30433642" }), { provider: "github", mode: "failed" }],
    [f.intent("run.retry", { runID: "30433642" }), { provider: "github", mode: "all", ref: "release" }],
    [f.intent("workflow.enable", { workflowID: "161335" }), { provider: "github", enabled: false }],
    [f.intent("workflow.dispatch", { workflowID: "{workflow}", ref: "release" }), f.dispatch],
    [f.intent("workflow.dispatch", { workflowID: "161335", ref: "release", runID: "30433642" }), f.dispatch],
    [{ ...f.intent(), binding: { id: Actions.BindingID.make("ab_foreign"), revision: 3 } }, f.dispatch]] as const) {
    const fixture = f.recorded()
    expect((yield* fixture.commands.perform(f.binding, intent, payload).pipe(Effect.flip)).disposition).toBe("definitely_unsent")
    expect(fixture.calls).toEqual([])
  }
}))

it.effect("changed actor, denied native push, denied classic scopes and wrong repository never reach a write", Effect.gen(function* () {
  for (const [path, data, headers, kind] of [["GET user", { id: 2, login: "changed-user" }, {}, "binding_stale"],
    [`GET ${f.root}`, { ...GitHubReadFixture.repo, permissions: { push: false } }, {}, "permission_denied"],
    [`GET ${f.root}`, GitHubReadFixture.repo, { "x-oauth-scopes": "read:user" }, "permission_denied"],
    [`GET ${f.root}`, { ...GitHubReadFixture.repo, id: 999 }, {}, "binding_stale"]] as const) {
    const fixture = f.recorded()
    fixture.routes[path] = f.reply(data, headers)
    expect(yield* fixture.commands.perform(f.binding, f.intent(), f.dispatch).pipe(Effect.flip)).toMatchObject({ kind, disposition: "definitely_unsent" })
    expect(fixture.writes()).toEqual([])
  }
}))

it.effect("unobserved write authority is not converted into a capability or fine-grained role", Effect.gen(function* () {
  const fixture = f.recorded()
  const { permissions, ...repo } = GitHubReadFixture.repo
  fixture.routes[`GET ${f.root}`] = f.reply(repo)
  expect(yield* fixture.commands.perform(f.binding, f.intent(), f.dispatch)).toEqual({ acknowledgement: { runID: "9101" } })
  expect(Object.keys(fixture.commands)).toEqual(["perform"])
  expect(fixture.writes()).toHaveLength(1)
}))

it.effect("actor change during source preflight is rejected by immediate pre-send identity check", Effect.gen(function* () {
  const fixture = f.recorded()
  fixture.state.after = (request) => {
    if (request.path !== `${f.root}/environments/prod`) return
    fixture.routes["GET user"] = f.reply({ id: 2, login: "changed-user" })
  }
  expect(yield* fixture.commands.perform(f.binding, f.intent(), f.dispatch).pipe(Effect.flip)).toMatchObject({ kind: "binding_stale", disposition: "definitely_unsent" })
  expect(fixture.writes()).toEqual([])
}))

it.effect("provider rejection and lost reply keep distinct dispositions; command never automatically resends", Effect.gen(function* () {
  for (const [response, disposition] of [
    [new ActionsError({ kind: "permission_denied", message: "native denial", disposition: "definitely_rejected" }), "definitely_rejected"],
    [new ActionsError({ kind: "transport_failed", message: "lost reply" }), "unknown"],
    [{ status: 409, headers: {}, data: { message: "conflict" } }, "definitely_rejected"],
    [{ status: 500, headers: {}, data: { message: "uncertain" } }, "unknown"],
  ] as const) {
    const fixture = f.recorded()
    fixture.routes[`POST ${f.root}/actions/workflows/161335/dispatches`] = response
    expect((yield* fixture.commands.perform(f.binding, f.intent(), f.dispatch).pipe(Effect.flip)).disposition).toBe(disposition)
    expect(fixture.writes()).toHaveLength(1)
  }
}))
