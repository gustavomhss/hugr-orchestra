export * as PermissionFixture from "./permission-fixture"

import { Effect, Layer } from "effect"
import { PermissionV2 } from "@orchestra/core/permission"

/** Existing normal runner fixture: every permission path fails closed if reached. */
export const normalLayer = Layer.succeed(
  PermissionV2.Service,
  PermissionV2.Service.of({
    askExplicit: () => Effect.die("Native askExplicit is unavailable in this normal-path fixture"),
    assert: () => Effect.die("unused"),
    ask: () => Effect.die("unused"),
    reply: () => Effect.die("unused"),
    get: () => Effect.die("unused"),
    forSession: () => Effect.die("unused"),
    list: () => Effect.die("unused"),
  }),
)
