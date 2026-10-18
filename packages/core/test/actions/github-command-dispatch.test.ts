import { expect } from "bun:test"
import { Effect } from "effect"
import { ActionsError } from "../../src/actions/error"
import { GitHubCommandCommon } from "../../src/actions/github/commands/common"
import { GitHubDispatchInputs } from "../../src/actions/github/commands/inputs"
import { diagnostics } from "../../src/actions/source/document"
import { GitHubCommandFixture } from "../fixture/github-command"
import { GitHubReadFixture } from "../fixture/github-read"
import { it } from "../lib/effect"

const f = GitHubCommandFixture
const route = `POST ${f.root}/actions/workflows/161335/dispatches`

it.effect("dispatch proves default branch and selected source, fills native defaults and returns exact native ID", Effect.gen(function* () {
  const fixture = f.recorded()
  expect(yield* fixture.commands.perform(f.binding, f.intent("workflow.dispatch", { workflowID: "161335", ref: "release", path: f.pathName },
    { commit: f.commit, sourceVersion: f.content(f.text).sha }), f.dispatch)).toEqual({ acknowledgement: { runID: "9101" } })
  expect(fixture.writes()).toEqual([{ method: "POST", path: `${f.root}/actions/workflows/161335/dispatches`, body: {
    ref: "release", inputs: { message: "native fixture", flag: false, count: 3, choice: "blue", environment: "prod" } } }])
  expect(fixture.calls.filter((request) => request.path.includes("/commits/")).map((request) => request.path))
    .toEqual([`${f.root}/commits/main`, `${f.root}/commits/release`])
  expect(fixture.calls.every((request) => request.path === "user" || request.path === f.root || request.path.startsWith(`${f.root}/`))).toBe(true)
}))

it.effect("ordinary comments and dynamic matrices retain valid bounded dispatch eligibility", Effect.gen(function* () {
  const fixture = f.recorded()
  const text = `# ordinary workflow comment\n\n${f.text.replace("    runs-on: ubuntu-latest", "    strategy:\n      matrix: ${{ fromJSON(vars.MATRIX) }}\n    runs-on: ubuntu-latest")}\n# ordinary trailing comment\n`
  fixture.routes[`GET ${f.root}/contents/${f.pathName}?ref=${GitHubReadFixture.sha}`] = f.reply(f.content(text))
  fixture.routes[`GET ${f.root}/contents/${f.pathName}?ref=${f.commit}`] = f.reply(f.content(text))
  const source = yield* fixture.reader.source(f.binding, { path: f.pathName, ref: "release" })
  const report = diagnostics()
  expect(GitHubDispatchInputs.definitions(f.binding, source, report).flag.type).toBe("boolean")
  expect(report.state()).toBe("complete")
  expect(report.work.parserNext).toBeGreaterThan(0)
  expect(report.work.compositions).toBe(1)
  expect(yield* fixture.commands.perform(f.binding, f.intent(), f.dispatch)).toEqual({ acknowledgement: { runID: "9101" } })
  expect(fixture.writes()).toHaveLength(1)
}))

it.effect("sub-128KiB trivia witness is source_unresolved before Parser/composer and prevents dispatch", Effect.gen(function* () {
  for (const trivia of ["\n".repeat(6000) + "  # bounded\n".repeat(6000), "  # bounded\n".repeat(6000) + "\n".repeat(6000)]) {
    const fixture = f.recorded()
    const text = trivia + f.text
    expect(Buffer.byteLength(text)).toBeLessThan(128 * 1024)
    fixture.routes[`GET ${f.root}/contents/${f.pathName}?ref=${f.commit}`] = f.reply(f.content(text))
    const source = yield* fixture.reader.source(f.binding, { path: f.pathName, ref: "release" })
    const report = diagnostics()
    const failure = yield* GitHubCommandCommon.guard(f.binding, () => GitHubDispatchInputs.definitions(f.binding, source, report), "source_unresolved")
      .pipe(Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }))
    expect(report.work).toMatchObject({ parserNext: 0, parserEnd: 0, cstNodes: 0, compositions: 0 })
    expect(failure).toMatchObject({ kind: "source_unresolved", disposition: "definitely_unsent" })
    expect(report.items.some((item) => item.includes("trivia_limit"))).toBe(true)
    expect(report.work.lexemes).toBeGreaterThan(0)
    expect(report.work.triviaPeak).toBeGreaterThan(1024)
    expect(yield* fixture.commands.perform(f.binding, f.intent(), f.dispatch).pipe(Effect.flip))
      .toMatchObject({ kind: "source_unresolved", disposition: "definitely_unsent" })
    expect(fixture.writes()).toEqual([])
  }
}))

it.effect("trivia-bound failure prevents the real dispatch call chain from writing", Effect.gen(function* () {
  const fixture = f.recorded()
  fixture.routes[`GET ${f.root}/contents/${f.pathName}?ref=${f.commit}`] = f.reply(f.content("\n".repeat(6000) + "  # bounded\n".repeat(6000) + f.text))
  expect(yield* fixture.commands.perform(f.binding, f.intent(), f.dispatch).pipe(Effect.flip))
    .toMatchObject({ kind: "source_unresolved", disposition: "definitely_unsent" })
  expect(fixture.writes()).toEqual([])
}))

it.effect("command byte cap rejects before guarded document reader and unresolved input tags reject", Effect.gen(function* () {
  const fixture = f.recorded()
  fixture.routes[`GET ${f.root}/contents/${f.pathName}?ref=${f.commit}`] = f.reply(f.content("#".repeat(128 * 1024) + "\n" + f.text))
  const source = yield* fixture.reader.source(f.binding, { path: f.pathName, ref: "release" })
  const report = diagnostics()
  expect(yield* GitHubCommandCommon.guard(f.binding, () => GitHubDispatchInputs.definitions(f.binding, source, report), "source_unresolved").pipe(Effect.flip))
    .toMatchObject({ kind: "metadata_truncated", disposition: "definitely_unsent" })
  expect(report.work).toMatchObject({ lexemes: 0, parserNext: 0, compositions: 0 })
  fixture.routes[`GET ${f.root}/contents/${f.pathName}?ref=${f.commit}`] = f.reply(f.content(f.text.replace("type: string", "type: !unsafe string")))
  expect(yield* fixture.commands.perform(f.binding, f.intent(), f.dispatch).pipe(Effect.flip)).toMatchObject({ kind: "source_unresolved", disposition: "definitely_unsent" })
  expect(fixture.writes()).toEqual([])
}))

it.effect("default branch workflow_dispatch gate cannot be replaced by selected-ref eligibility", Effect.gen(function* () {
  const fixture = f.recorded()
  fixture.routes[`GET ${f.root}/contents/${f.pathName}?ref=${GitHubReadFixture.sha}`] = f.reply(f.content(f.text.replace("workflow_dispatch:", "push:")))
  expect(yield* fixture.commands.perform(f.binding, f.intent(), f.dispatch).pipe(Effect.flip)).toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
  expect(fixture.writes()).toEqual([])
}))

it.effect("selected source/commit preconditions compare selected ref rather than default branch", Effect.gen(function* () {
  for (const expected of [{ commit: GitHubReadFixture.sha }, { sourceVersion: "f".repeat(40) }]) {
    const fixture = f.recorded()
    expect(yield* fixture.commands.perform(f.binding, f.intent("workflow.dispatch", { workflowID: "161335", ref: "release" }, expected), f.dispatch).pipe(Effect.flip))
      .toMatchObject({ kind: "source_conflict", disposition: "definitely_unsent" })
    expect(fixture.writes()).toEqual([])
  }
}))

it.effect("missing default source, disabled workflow, wrong workflow ID and unavailable selected source never write", Effect.gen(function* () {
  for (const [path, data] of [[`GET ${f.root}/actions/workflows/161335`, { ...GitHubReadFixture.workflow, id: 999 }],
    [`GET ${f.root}/actions/workflows/161335`, { ...GitHubReadFixture.workflow, state: "disabled_manually" }],
    [`GET ${f.root}/contents/${f.pathName}?ref=${f.commit}`, f.content(f.text.replace("workflow_dispatch:", "push:"))]] as const) {
    const fixture = f.recorded()
    fixture.routes[path] = f.reply(data)
    expect((yield* fixture.commands.perform(f.binding, f.intent(), f.dispatch).pipe(Effect.flip)).disposition).toBe("definitely_unsent")
    expect(fixture.writes()).toEqual([])
  }
  const fixture = f.recorded()
  fixture.routes[`GET ${f.root}/contents/${f.pathName}?ref=${GitHubReadFixture.sha}`] = new ActionsError({ kind: "not_found", message: "native default source missing" })
  expect(yield* fixture.commands.perform(f.binding, f.intent(), f.dispatch).pipe(Effect.flip)).toMatchObject({ kind: "not_found", disposition: "definitely_unsent" })
  expect(fixture.writes()).toEqual([])
}))

it.effect("required source defaults can supply omitted inputs, while malformed defaults and duplicate keys cannot", Effect.gen(function* () {
  const fixture = f.recorded()
  const selected = f.text.replace("required: true", "required: true\n        default: native-default")
  fixture.routes[`GET ${f.root}/contents/${f.pathName}?ref=${f.commit}`] = f.reply(f.content(selected))
  expect(yield* fixture.commands.perform(f.binding, f.intent(), { provider: "github", ref: "release" })).toEqual({ acknowledgement: { runID: "9101" } })
  expect(fixture.writes()[0].body).toMatchObject({ inputs: { message: "native-default", flag: false } })
  for (const source of [f.text.replace("default: false", 'default: "false"'), f.text.replace("options: [blue, green]", "options: []"),
    f.text.replace("type: boolean", "type: boolean\n        type: string")]) {
    const invalid = f.recorded()
    invalid.routes[`GET ${f.root}/contents/${f.pathName}?ref=${f.commit}`] = f.reply(f.content(source))
    expect(yield* invalid.commands.perform(f.binding, f.intent(), f.dispatch).pipe(Effect.flip)).toMatchObject({ kind: "source_unresolved", disposition: "definitely_unsent" })
    expect(invalid.writes()).toEqual([])
  }
}))

it.effect("environment identity must be proved before dispatch", Effect.gen(function* () {
  const fixture = f.recorded()
  fixture.routes[`GET ${f.root}/environments/prod`] = f.reply({ id: 41, name: "another-environment" })
  expect(yield* fixture.commands.perform(f.binding, f.intent(), f.dispatch).pipe(Effect.flip)).toMatchObject({ kind: "source_conflict", disposition: "definitely_unsent" })
  expect(fixture.writes()).toEqual([])
}))

it.effect("strict dispatch values enforce required, choice, boolean, number, string, unknown keys and 25-key maximum", Effect.gen(function* () {
  const invalid: Readonly<Record<string, string | number | boolean>>[] = [{}, { message: "m", flag: "false" }, { message: "m", count: "3" }, { message: 7 },
    { message: "m", choice: "red" }, { message: "m", environment: true }, { message: "m", unknown: "extra" },
    Object.fromEntries(Array.from({ length: 26 }, (_, index) => [`key${index}`, "value"]))]
  for (const inputs of invalid) {
    const fixture = f.recorded()
    expect(yield* fixture.commands.perform(f.binding, f.intent(), { provider: "github", ref: "release", inputs }).pipe(Effect.flip))
      .toMatchObject({ kind: "invalid_input", disposition: "definitely_unsent" })
    expect(fixture.writes()).toEqual([])
  }
}))

it.effect("legacy dispatch204 stays unattributed and malformed success200 stays unknown without nearby polling", Effect.gen(function* () {
  const fixture = f.recorded()
  fixture.routes[route] = { status: 204, headers: {}, data: null }
  expect(yield* fixture.commands.perform(f.binding, f.intent(), f.dispatch)).toEqual({ acknowledgement: { unattributed: true } })
  fixture.routes[route] = f.reply({ id: 9101 })
  expect(yield* fixture.commands.perform(f.binding, f.intent(), f.dispatch).pipe(Effect.flip)).toMatchObject({ kind: "outcome_unknown", disposition: "unknown" })
  expect(fixture.writes()).toHaveLength(2)
  expect(fixture.calls.some((request) => request.path === `${f.root}/actions/runs`)).toBe(false)
}))

it.effect("execute data is serde-snapshotted before first remote await", Effect.gen(function* () {
  const fixture = f.recorded()
  const input = { provider: "github", ref: "release", inputs: { message: "original" } }
  const intent = { ...f.intent(), target: { workflowID: "161335", ref: "release" } }
  fixture.state.after = () => { input.ref = "changed"; input.inputs.message = "changed"; intent.target.ref = "changed" }
  expect(yield* fixture.commands.perform(f.binding, intent, input)).toEqual({ acknowledgement: { runID: "9101" } })
  expect(fixture.writes()[0].body).toMatchObject({ ref: "release", inputs: { message: "original" } })
}))
