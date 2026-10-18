import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { ActionsEnvironmentReviewers } from "../../src/actions/resources/config-environment-reviewers"
import { ActionsEnvironmentSchema } from "../../src/actions/resources/config-environment-schema"
import { ActionsError } from "../../src/actions/error"
import { ActionsConfigFixture } from "./config-resource-fixture"
import { it } from "../lib/effect"

const F = ActionsConfigFixture
const S = ActionsEnvironmentSchema
const nativeRule = F.protectedEnvironment.approval_rules[0]
const omittedApprovalRule = { id: nativeRule.id, user_id: nativeRule.user_id, group_id: nativeRule.group_id, access_level: nativeRule.access_level }
const noRules = { name: F.protectedEnvironment.name, deploy_access_levels: F.protectedEnvironment.deploy_access_levels }

it.effect("reads six native users in rule order with exact case preserved", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const fixture = F.recorded(binding)
  const IDs = [4, "7", 8, 9, 10, 11]
  const names = ["Reviewer.One", "release-bot", "third", "fourth", "fifth", "sixth"]
  yield* Effect.forEach(IDs, (id, index) => {
    const returnedID = index === 1 ? 7 : String(id)
    fixture.routes[`GET users/${id}`] = F.reply({ id: returnedID, username: names[index] })
    return Effect.succeed(undefined)
  }, { concurrency: 1 })
  const result = yield* ActionsEnvironmentReviewers.read(fixture.services, binding, [{ ...F.protectedEnvironment,
    approval_rules: IDs.map((user_id) => ({ ...nativeRule, user_id })) }], "production")
  expect(result).toEqual({ reviewers: names.join(","), reviewersReadOnly: false })
  expect(fixture.calls.map((request) => request.path)).toEqual(IDs.map((id) => `users/${id}`))
  expect(fixture.writes()).toEqual([])
}))

it.effect("rejects invalid native IDs before any user request", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const invalidIDs = [0, "0", "04", -1, 1.5, "4/7", Number.MAX_SAFE_INTEGER + 1]
  const policies: readonly (typeof S.Protected.Type)[] = invalidIDs.map((user_id) => ({ ...F.protectedEnvironment,
    approval_rules: [{ ...nativeRule, user_id }] }))
  yield* Effect.forEach(policies, (selected) => Effect.gen(function* () {
    const fixture = F.recorded(binding)
    const error = yield* ActionsEnvironmentReviewers.read(fixture.services, binding, [selected], "production").pipe(Effect.flip)
    expect(error.kind).toBe("transport_failed")
    expect(fixture.calls).toEqual([])
  }), { concurrency: 1 })
  const laterInvalid = F.recorded(binding)
  const error = yield* ActionsEnvironmentReviewers.read(laterInvalid.services, binding, [{ ...F.protectedEnvironment,
    approval_rules: [{ ...nativeRule, user_id: 4 }, { ...nativeRule, user_id: "04" }] }], "production").pipe(Effect.flip)
  expect(error.kind).toBe("transport_failed")
  expect(laterInvalid.calls).toEqual([])
}))

it.effect("returns read-only for unsupported native policy shapes before lookup", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const cases: readonly (typeof S.Protected.Type)[] = [
    { ...F.protectedEnvironment, approval_rules: [{ ...nativeRule, user_id: null, group_id: 8 }] },
    { ...F.protectedEnvironment, approval_rules: [{ id: nativeRule.id, group_id: null, access_level: 30, required_approvals: 1 }] },
    { ...F.protectedEnvironment, approval_rules: [{ ...nativeRule, required_approvals: 2 }] },
    { ...F.protectedEnvironment, approval_rules: [omittedApprovalRule] },
    { ...F.protectedEnvironment, approval_rules: Array.from({ length: 7 }, (_, index) => ({ ...nativeRule, user_id: index + 1 })) },
  ]
  yield* Effect.forEach(cases, (selected) => Effect.gen(function* () {
    const fixture = F.recorded(binding)
    expect(yield* ActionsEnvironmentReviewers.read(fixture.services, binding, [selected], "production")).toEqual({ reviewersReadOnly: true })
    expect(fixture.calls).toEqual([])
  }), { concurrency: 1 })
}))

it.effect("treats wildcard owners as read-only, including wildcard plus exact", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const cases: readonly { policies: readonly (typeof S.Protected.Type)[]; name: string }[] = [
    { name: "production", policies: [{ ...F.protectedEnvironment, name: "prod*" }, F.protectedEnvironment] },
    { name: "production*", policies: [{ ...F.protectedEnvironment, name: "production*" }] },
  ]
  yield* Effect.forEach(cases, (selected) => Effect.gen(function* () {
    const fixture = F.recorded(binding)
    expect(yield* ActionsEnvironmentReviewers.read(fixture.services, binding, selected.policies, selected.name)).toEqual({ reviewersReadOnly: true })
    expect(fixture.calls).toEqual([])
  }), { concurrency: 1 })
}))

it.effect("uses exact policy only and ignores nonmatching regex-special policy names", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const fixture = F.recorded(binding)
  fixture.routes["GET users/4"] = F.reply({ id: "4", username: "reviewer" })
  const result = yield* ActionsEnvironmentReviewers.read(fixture.services, binding, [
    { ...F.protectedEnvironment, name: "prod.+", approval_rules: [{ ...nativeRule, user_id: 7 }] },
    F.protectedEnvironment,
  ], "production")
  expect(result).toEqual({ reviewers: "reviewer", reviewersReadOnly: false })
  expect(fixture.calls.map((request) => request.path)).toEqual(["users/4"])
}))

it.effect("distinguishes empty exact policy, absent exact policy, and empty policy collection", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const cases: readonly { policies: readonly (typeof S.Protected.Type)[]; expected: unknown }[] = [
    { policies: [{ ...F.protectedEnvironment, approval_rules: [] }], expected: { reviewers: "", reviewersReadOnly: false } },
    { policies: [noRules], expected: { reviewers: "", reviewersReadOnly: false } },
    { policies: [{ ...noRules, required_approval_count: 0 }], expected: { reviewers: "", reviewersReadOnly: false } },
    { policies: [{ ...noRules, required_approval_count: 1 }], expected: { reviewersReadOnly: true } },
    { policies: [], expected: { reviewersReadOnly: true } },
  ]
  const decode = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))
  yield* Effect.forEach(cases, (selected) => Effect.gen(function* () {
    const fixture = F.recorded(binding)
    expect(decode(yield* ActionsEnvironmentReviewers.read(fixture.services, binding, selected.policies, "production"))).toEqual(decode(selected.expected))
    expect(fixture.calls).toEqual([])
  }), { concurrency: 1 })
}))

it.effect("propagates typed HTTP and transport 404, mismatch, and malformed metadata", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const responses = [new ActionsError({ kind: "not_found", message: "typed 404", disposition: "definitely_rejected" }), F.reply({}, 404)]
  yield* Effect.forEach(responses, (response) => Effect.gen(function* () {
    const fixture = F.recorded(binding)
    fixture.routes["GET users/4"] = response
    const error = yield* ActionsEnvironmentReviewers.read(fixture.services, binding, [F.protectedEnvironment], "production").pipe(Effect.flip)
    expect(error.kind).toBe("not_found")
    expect(fixture.writes()).toEqual([])
  }), { concurrency: 1 })
  const mismatch = F.recorded(binding)
  mismatch.routes["GET users/4"] = F.reply({ id: 5, username: "reviewer" })
  expect((yield* ActionsEnvironmentReviewers.read(mismatch.services, binding, [F.protectedEnvironment], "production").pipe(Effect.flip)).kind).toBe("source_conflict")
  const malformed = F.recorded(binding)
  malformed.routes["GET users/4"] = F.reply({ id: 4 })
  expect((yield* ActionsEnvironmentReviewers.read(malformed.services, binding, [F.protectedEnvironment], "production").pipe(Effect.flip)).kind).toBe("transport_failed")
}))

it.effect("rejects incompatible and duplicate usernames", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const cases = [
    [{ id: 4, username: "Display Name" }, { id: 7, username: "release" }],
    [{ id: 4, username: "reviewer" }, { id: 7, username: "reviewer" }],
  ]
  yield* Effect.forEach(cases, (responses) => Effect.gen(function* () {
    const fixture = F.recorded(binding)
    fixture.routes["GET users/4"] = F.reply(responses[0])
    fixture.routes["GET users/7"] = F.reply(responses[1])
    const selected = { ...F.protectedEnvironment, approval_rules: [{ ...nativeRule, user_id: 4 }, { ...nativeRule, user_id: 7 }] }
    const error = yield* ActionsEnvironmentReviewers.read(fixture.services, binding, [selected], "production").pipe(Effect.flip)
    expect(error.kind).toBe("source_unresolved")
  }), { concurrency: 1 })
}))
