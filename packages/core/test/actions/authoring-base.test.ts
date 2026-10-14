import { expect } from "bun:test"
import { Effect } from "effect"
import { ActionsSourceBase } from "../../src/actions/authoring/base"
import { branch, version } from "../../src/actions/authoring/input"
import { AuthoringFixture } from "./authoring-fixture"
import type { ActionsContract } from "../../src/actions/contract"
import { it } from "../lib/effect"

for (const provider of ["github", "gitlab"] as const) {
  it.effect(`${provider}: branch base exists without a workflow file and never guesses main`, Effect.gen(function* () {
    const fixture = AuthoringFixture.make(provider)
    fixture.state.exists = false
    const services = { transport: fixture.transport, reader: fixture.reader }
    expect(yield* ActionsSourceBase.read(services, fixture.binding)).toEqual({ bindingID: fixture.binding.id, ref: "dev", commit: AuthoringFixture.commit })
    expect(yield* ActionsSourceBase.read(services, fixture.binding, "feature/observed")).toEqual({ bindingID: fixture.binding.id, ref: "feature/observed", commit: AuthoringFixture.commit })
    expect(fixture.requests.every((request) => request.method === "GET")).toBe(true)
    expect(fixture.requests.some((request) => request.path.includes("/contents/") || request.path.includes("/repository/files/"))).toBe(false)
    expect(branch(fixture.binding, "feature/observed")).toBe("feature/observed")
  }))

  it.effect(`${provider}: malformed branch, missing default and wrong native identity stay errors`, Effect.gen(function* () {
    const fixture = AuthoringFixture.make(provider, { read(request): ActionsContract.Json | undefined {
      if (request.path === "repositories/21") return { id: 21, full_name: "owner/project" }
      if (request.path === "projects/21") return { id: 21, name: "Project", path_with_namespace: "owner/project", ci_config_path: null }
    } })
    const services = { transport: fixture.transport, reader: fixture.reader }
    expect(yield* ActionsSourceBase.read(services, fixture.binding).pipe(Effect.flip)).toMatchObject({ kind: "source_unresolved" })
    const before = fixture.requests.length
    expect(yield* ActionsSourceBase.read(services, fixture.binding, AuthoringFixture.commit).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
    expect(fixture.requests.length).toBe(before)
    const wrong = AuthoringFixture.make(provider, { read(request): ActionsContract.Json | undefined {
      if (request.path.includes("/heads/")) return { ref: "refs/heads/other", object: { type: "commit", sha: AuthoringFixture.commit } }
      if (request.path.includes("/repository/branches/")) return { name: "other", commit: { id: AuthoringFixture.commit } }
    } })
    expect(yield* ActionsSourceBase.read({ transport: wrong.transport, reader: wrong.reader }, wrong.binding, "dev").pipe(Effect.flip)).toMatchObject({ kind: "source_conflict" })
  }))

  it.effect(`${provider}: new draft validates observed commit and cannot impersonate native file version`, Effect.gen(function* () {
    const fixture = AuthoringFixture.make(provider)
    fixture.state.exists = false
    const services = { transport: fixture.transport, reader: fixture.reader }
    const base = yield* ActionsSourceBase.read(services, fixture.binding)
    const draft = provider === "github" ? "name: New\non: workflow_dispatch\njobs: {}\n" : "build:\n  script: echo build\n"
    const graph = yield* ActionsSourceBase.validate(services, fixture.binding, base, AuthoringFixture.path(provider), draft)
    expect(graph.source).toMatchObject({ bindingID: fixture.binding.id, ref: "dev", commit: AuthoringFixture.commit, text: draft, editable: false })
    expect(graph.source.version).toMatch(/^draft:sha256:[a-f0-9]{64}$/)
    expect(() => version(fixture.binding, graph.source.version)).toThrow()
    expect(fixture.requests.every((request) => request.method === "GET" || request.method === "POST" && request.path.endsWith("/ci/lint"))).toBe(true)
    fixture.state.commit = AuthoringFixture.nextCommit
    expect(yield* ActionsSourceBase.validate(services, fixture.binding, base, AuthoringFixture.path(provider), draft).pipe(Effect.flip)).toMatchObject({ kind: "source_conflict" })
  }))
}
