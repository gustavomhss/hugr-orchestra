import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Cause, Context, Effect, Exit, Layer, Option, Scope } from "effect"
import path from "node:path"
import { ActionsOperations } from "../../src/actions/operations"
import { ActionsError } from "../../src/actions/error"
import { Database } from "../../src/database/database"
import { tmpdir } from "../fixture/tmpdir"

export const openDatabase = (filename: string) => Effect.gen(function* () {
  const scope = yield* Effect.acquireRelease(Scope.make(), (scope) => Scope.close(scope, Exit.void))
  const context = yield* Layer.build(Database.layerFromPath(filename)).pipe(Scope.provide(scope))
  const database = Context.get(context, Database.Service)
  return { database, scope }
})

export function binding(directory: string, overrides: Partial<Actions.Binding> = {}): Actions.Binding {
  return {
    id: Actions.BindingID.make("ab_fixture"), revision: 1, remote: "origin",
    provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" },
    projectID: "1234", projectPath: "owner/repo", account: "signed-in-actor", directory,
    ...overrides,
  }
}

export function intent(binding: Actions.Binding, overrides: Partial<Actions.OperationIntent> = {}): Actions.OperationIntent {
  return {
    clientID: crypto.randomUUID(), binding: { id: binding.id, revision: binding.revision },
    kind: "run.retry", target: { runID: "9876", ref: "refs/heads/main" },
    expected: { sourceVersion: "blob-original", commit: "commit-original", attempt: 3 },
    ...overrides,
  }
}

export const open = (database: Database.Interface, directory: string, overrides: {
  readonly workspaceID?: string
  readonly projectID?: string
} = {}) => Effect.gen(function* () {
  const scope = yield* Effect.acquireRelease(Scope.make(), (scope) => Scope.close(scope, Exit.void))
  const operations = yield* ActionsOperations.make({ directory, projectID: "core-project", ...overrides }).pipe(
    Effect.provideService(Database.Service, database), Scope.provide(scope),
  )
  return { operations, scope, binding: binding(directory, { workspaceID: overrides.workspaceID }) }
})

export const fixture = Effect.gen(function* () {
  const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
  const filename = path.join(tmp.path, "operations.sqlite")
  return { directory: tmp.path, filename, ...yield* openDatabase(filename) }
})

export const fault = <A, E, R>(effect: Effect.Effect<A, E, R>, kind: Actions.ErrorKind) => Effect.gen(function* () {
  const exit = yield* Effect.exit(effect)
  expect(Exit.isFailure(exit)).toBe(true)
  if (!Exit.isFailure(exit)) return yield* Effect.die("Expected Actions failure")
  const failure = Cause.findErrorOption(exit.cause)
  expect(Option.isSome(failure)).toBe(true)
  if (Option.isNone(failure)) return yield* Effect.die("Expected typed Actions failure")
  expect(failure.value).toBeInstanceOf(ActionsError)
  expect(failure.value).toMatchObject({ kind })
})
