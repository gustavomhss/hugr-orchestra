import { expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { Config } from "@orchestra/core/config"
import { WriteRootsV2 } from "../src/v2/governance/write-roots"
import { admit, governanceLayer, session, worktree } from "./fixture/v2-governance"

const primary = Schema.decodeUnknownSync(Config.Document)({ type: "document", info: { experimental: { primary_tools: ["todowrite"] } } })

test("a scoped child inherits its parent's deny and external_directory rules and is denied the primary-only tools", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        yield* Effect.gen(function* () {
          const parentID = yield* session({
            directory,
            agent: "maestro",
            permission: [
              { permission: "bash", pattern: "rm *", action: "deny" },
              { permission: "external_directory", pattern: "/shared/*", action: "allow" },
              { permission: "read", pattern: "*", action: "allow" },
            ],
          })
          expect(yield* admit({ directory, caller: "maestro", target: "backend", parentID })).toEqual({
            permissions: [
              { action: "bash", resource: "rm *", effect: "deny" },
              { action: "external_directory", resource: "/shared/*", effect: "allow" },
              { action: "todowrite", resource: "*", effect: "deny" },
              { action: WriteRootsV2.PERMISSION, resource: "*", effect: "deny" },
            ],
          })
        }).pipe(Effect.provide(governanceLayer(directory, undefined, [primary])))
      }),
    ),
  ))
