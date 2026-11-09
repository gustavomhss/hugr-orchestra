import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { IntegrationID } from "@orchestra/schema/integration-id"
import { AppNodeBuilder } from "../../src/effect/app-node-builder"
import { LayerNode } from "../../src/effect/layer-node"
import { Database } from "../../src/database/database"
import { Credential } from "../../src/credential"
import { Location } from "../../src/location"
import { ProjectV2 } from "../../src/project"
import { AbsolutePath } from "../../src/schema"
import { accounts, accountSources, connect, disconnectAccount } from "../../src/inbox/remote"
import { testEffect } from "../lib/effect"

const directory = AbsolutePath.make("/account-isolation")
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, Credential.node]), [
    [Location.node, Layer.succeed(Location.Service, { directory, project: { id: ProjectV2.ID.global, directory } })],
  ]),
)

it.effect("each source credential belongs to one location, without adopting or overwriting legacy credentials", () =>
  Effect.gen(function* () {
    const credentials = yield* Credential.Service
    yield* Effect.forEach(accountSources, (source) =>
      Effect.gen(function* () {
        const legacy = yield* credentials.create({
          integrationID: IntegrationID.make(`inbox.${source}`),
          value: { type: "key", key: `legacy-${source}` },
        })
        expect(
          (yield* accounts(credentials, "location-a")).find((account) => account.source === source)?.connected,
        ).toBe(false)
        yield* connect(credentials, "location-a", { source, token: `fixture-a-${source}` })
        expect(
          (yield* accounts(credentials, "location-a")).find((account) => account.source === source)?.connected,
        ).toBe(true)
        expect(
          (yield* accounts(credentials, "location-b")).find((account) => account.source === source)?.connected,
        ).toBe(false)
        yield* connect(credentials, "location-b", { source, token: `fixture-b-${source}` })
        yield* connect(credentials, "location-a", { source, token: `fixture-a-updated-${source}` })
        const stored = yield* credentials.all()
        expect(
          stored.filter((item) => item.value.type === "key" && item.value.key === `fixture-b-${source}`),
        ).toHaveLength(1)
        expect(
          stored.filter((item) => item.value.type === "key" && item.value.key === `fixture-a-updated-${source}`),
        ).toHaveLength(1)
        const preserved = yield* credentials.get(legacy.id)
        expect(preserved?.value.type === "key" && preserved.value.key).toBe(`legacy-${source}`)
        yield* disconnectAccount(credentials, "location-a", source)
        expect(
          (yield* accounts(credentials, "location-a")).find((account) => account.source === source)?.connected,
        ).toBe(false)
        expect(
          (yield* accounts(credentials, "location-b")).find((account) => account.source === source)?.connected,
        ).toBe(true)
      }),
    )
  }),
)
