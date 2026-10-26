import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Layer, Scope } from "effect"
import { Config } from "@orchestra/core/config"
import { FSUtil } from "@orchestra/core/fs-util"
import { GitCli } from "@orchestra/core/git-cli"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { buildLocationServiceMap, locationServices, LocationServiceMap } from "@orchestra/core/location-services"
import { Project } from "@orchestra/core/project"
import { Relay } from "@orchestra/core/relay"
import { RelayHookRecovery } from "@orchestra/core/relay-hook-recovery"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionStore } from "@orchestra/core/session"
import { SkillV2 } from "@orchestra/core/skill"
import { MaestroSeats } from "../src/v2/seats-service"
import { WorkflowRelayV2 } from "../src/v2/workflow/relay"

const project = Project.ID.make("relay_project")

const temporary = (prefix: string) =>
  Effect.acquireRelease(
    Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), prefix))),
    (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
  )

// Knowledge services whose only live part is the skill catalog: no anchor is cited in these tests.
const services = (skills: SkillV2.Info[] = []) =>
  Effect.gen(function* () {
    return {
      store: yield* SessionStore.Service,
      seats: MaestroSeats.make([]),
      atlas: {
        config: yield* Config.Service,
        git: yield* GitCli.Service,
        fs: yield* FSUtil.Service,
        skills: yield* SkillV2.Service,
      },
    }
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.mock(SessionStore.Service, {}),
        Layer.mock(Config.Service, {}),
        Layer.mock(GitCli.Service, {}),
        AppNodeBuilder.build(FSUtil.node) as Layer.Layer<FSUtil.Service>,
        Layer.mock(SkillV2.Service, { list: () => Effect.succeed(skills) }),
      ),
    ),
  )

// The production Location map, with only the Location and its Relay real: every other Location service is inert.
const run = <A, E>(
  body: (input: { readonly directory: string; readonly data: string }) => Effect.Effect<A, E, LocationServiceMap.Service | Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const data = yield* temporary("maestro-relay-data-")
      const directory = yield* temporary("maestro-relay-location-")
      return yield* body({ directory, data }).pipe(
        Effect.provide(
          buildLocationServiceMap([
            ...locationServices.dependencies
              .filter((node) => ![Location.node.name, Relay.node.name].includes(node.name))
              .map((node): LayerNode.Replacement => [node, Layer.empty]),
            [Global.node, Global.layerWith({ data, home: data })],
            [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
            [
              Project.node,
              Layer.succeed(
                Project.Service,
                Project.Service.of({
                  resolve: (directory) => Effect.succeed({ id: project, directory }),
                  list: () => Effect.succeed([]),
                  directories: () => Effect.succeed([]),
                  commit: () => Effect.void,
                }),
              ),
            ],
            [
              RelayHookRecovery.node,
              Layer.succeed(RelayHookRecovery.Service, {
                recover: () => Effect.succeed({ scope: "implicit-local" as const, attemptedSessions: 0, errors: 0 }),
              }),
            ],
          ]),
        ),
      )
    }).pipe(Effect.scoped),
  )

test("the placement's Relay roots in the project's data and publishes its authoring documents", () =>
  run((input) =>
    Effect.gen(function* () {
      const relay = yield* WorkflowRelayV2.relay({ directory: input.directory })
      expect(relay.paths.root).toBe(path.join(input.data, "relay", project))
      const publication = yield* WorkflowRelayV2.publication(
        relay,
        { projectID: project },
        yield* services([
          { name: "review", description: "r", location: AbsolutePath.make(input.directory), content: "Review the diff." },
          { name: "blank", description: "b", location: AbsolutePath.make(input.directory), content: "  " },
        ]),
      )
      expect(publication.projectID).toBe(project)
      expect(publication.acceptance).toEqual([
        { id: "package-verification", host_check: "package-verification" },
        { id: "cold-review", host_check: "cold-review" },
      ])
      expect(yield* publication.use((store) => store.documents())).toEqual([])
      const skill = yield* publication.skills("review")
      expect(skill.content).toBe("Review the diff.")
      expect(skill.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect((yield* publication.skills("blank").pipe(Effect.flip)).code).toBe("skill-unavailable")
      expect((yield* publication.skills("missing").pipe(Effect.flip)).code).toBe("skill-unavailable")
    }),
  ))

test("a placement whose Relay names another project holds before any read", () =>
  run((input) =>
    Effect.gen(function* () {
      const error = yield* WorkflowRelayV2.publication(
        yield* WorkflowRelayV2.relay({ directory: input.directory }),
        { projectID: Project.ID.make("other_project") },
        yield* services(),
      ).pipe(Effect.flip)
      expect(error.reason).toBe("WORKFLOW_PUBLICATION_PROJECT_MISMATCH")
    }),
  ))

test("an authoring store that cannot open holds instead of crashing", () =>
  run((input) =>
    Effect.gen(function* () {
      // A file where the Relay data directory belongs: the store's synchronous open dies.
      yield* Effect.promise(async () => {
        await fs.mkdir(path.join(input.data, "relay"), { recursive: true })
        await fs.writeFile(path.join(input.data, "relay", project), "")
      })
      const publication = yield* WorkflowRelayV2.publication(
        yield* WorkflowRelayV2.relay({ directory: input.directory }),
        { projectID: project },
        yield* services(),
      )
      const error = yield* publication.use((store) => store.documents()).pipe(Effect.flip)
      expect(error.reason).toBe("WORKFLOW_PUBLICATION_ACQUISITION")
    }),
  ))
