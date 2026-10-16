import { expect } from "bun:test"
import { Effect } from "effect"
import { ActionsArtifactCommands } from "../../src/actions/output/mutations"
import { OutputVersion } from "../../src/actions/output/version"
import { OutputNative } from "../../src/actions/output/native"
import { ActionsConfigFixture } from "./config-resource-fixture"
import { OutputFixture } from "./output-fixture"
import { it } from "../lib/effect"

const F = ActionsConfigFixture

it.effect("artifact mutation rejects ignored preconditions, changed actor and wrong ownership before sending", Effect.gen(function* () {
  const binding = F.binding()
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}`] = F.reply({ id: 123, full_name: "acme/renamed", private: false, archived: false, permissions: { push: true, admin: true } })
  const perform = ActionsArtifactCommands.make({ transport: fixture.services.transport, reader: () => fixture.services.reader })
  const intent = F.intent(binding, "resource.delete", "artifacts", "11", "30433642")
  const artifact = { ...OutputFixture.artifact, workflow_run: { ...OutputFixture.artifact.workflow_run, repository_id: 123 } }
  fixture.routes[`GET ${fixture.root}/actions/artifacts/11`] = F.reply(artifact)
  fixture.routes[`DELETE ${fixture.root}/actions/artifacts/11`] = F.reply(null, 204)
  for (const expected of [{ commit: "a".repeat(40) }, { sourceVersion: "b".repeat(40) }, { attempt: 1 }]) {
    expect(yield* perform(binding, { ...intent, expected }, { provider: "github" }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input", disposition: "definitely_unsent" })
  }
  expect(fixture.calls).toEqual([])
  fixture.routes["GET user"] = F.reply({ id: 1, login: "other" })
  expect(yield* perform(binding, intent, { provider: "github" }).pipe(Effect.flip)).toMatchObject({ kind: "binding_stale", disposition: "definitely_unsent" })
  fixture.routes["GET user"] = F.reply({ id: 1, login: "actor" })
  fixture.routes[`GET ${fixture.root}/actions/artifacts/11`] = F.reply({ ...artifact, workflow_run: { ...artifact.workflow_run, repository_id: 999 } })
  expect(yield* perform(binding, intent, { provider: "github" }).pipe(Effect.flip)).toMatchObject({ kind: "binding_stale", disposition: "definitely_unsent" })
  expect(fixture.writes()).toEqual([])
  fixture.routes[`GET ${fixture.root}/actions/artifacts/11`] = F.reply(artifact)
  expect(yield* perform(binding, { ...intent, expected: { resourceVersion: "native:stale" } }, { provider: "github" }).pipe(Effect.flip)).toMatchObject({ kind: "source_conflict", disposition: "definitely_unsent" })
  expect(fixture.writes()).toEqual([])
  const native = OutputNative.decode(binding, OutputNative.Artifact, artifact)
  expect(yield* perform(binding, { ...intent, expected: { resourceVersion: OutputVersion.github(native) } }, { provider: "github" })).toEqual({ acknowledgement: { resourceID: "11" } })
  expect(fixture.writes()).toHaveLength(1)
}))

it.effect("GitLab keep requires exact post-send identity and explicit null expiry; sparse ACK stays unknown", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}`] = F.reply({ id: 123, name: "Project", path_with_namespace: "acme/renamed", archived: false, permissions: { project_access: { access_level: 40 }, group_access: null } })
  const perform = ActionsArtifactCommands.make({ transport: fixture.services.transport, reader: () => fixture.services.reader })
  const job = { ...OutputFixture.job, pipeline: { id: 287, project_id: 123 } }
  fixture.routes[`GET ${fixture.root}/jobs/8`] = F.reply(job)
  fixture.routes[`POST ${fixture.root}/jobs/8/artifacts/keep`] = F.reply({ ...job, artifacts_expire_at: null })
  const intent = F.intent(binding, "artifact.keep", "artifacts", "8", "287")
  expect(yield* perform(binding, intent, { provider: "gitlab" })).toEqual({ acknowledgement: { resourceID: "8" } })
  fixture.routes[`POST ${fixture.root}/jobs/8/artifacts/keep`] = F.reply({ id: 8 })
  expect(yield* perform(binding, intent, { provider: "gitlab" }).pipe(Effect.flip)).toMatchObject({ kind: "outcome_unknown", disposition: "unknown" })
  expect(fixture.writes()).toHaveLength(2)
}))
