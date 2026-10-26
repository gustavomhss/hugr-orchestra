import { expect } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { Config } from "@orchestra/core/config"
import { ConfigUpgradeSource } from "@orchestra/core/config/upgrade/source"
import { ConfigUpgrade } from "@orchestra/core/config/upgrade/upgrade"
import { Policy } from "@orchestra/core/policy"
import { Location } from "@orchestra/core/location"
import { AbsolutePath } from "@orchestra/core/schema"
import { location } from "../fixture/location"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Policy.locationLayer.pipe(
    Layer.provide(
      Layer.succeed(
        Location.Service,
        Location.Service.of(location({ directory: AbsolutePath.make("/provider-policy-test") })),
      ),
    ),
  ),
)

const migrate = (input: typeof ConfigUpgradeSource.Info.Type) =>
  Schema.decodeUnknownSync(Config.Info)(ConfigUpgrade.migrate(input))

it.effect("legacy allowlist and disabled providers retain restrictions and existing policy denials", () =>
  Effect.gen(function* () {
    const policy = yield* Policy.Service
    const config = migrate({
      enabled_providers: ["opencode", "openrouter", "denied"],
      disabled_providers: ["opencode"],
      experimental: {
        policies: [
          { action: "provider.use", resource: "*", effect: "allow" },
          { action: "provider.use", resource: "denied", effect: "deny" },
        ],
      },
    })
    yield* policy.load((config.experimental?.policies ?? []).map((item) => new Policy.Info(item)))
    expect(yield* policy.evaluate("provider.use", "opencode", "allow")).toBe("deny")
    expect(yield* policy.evaluate("provider.use", "openrouter", "allow")).toBe("allow")
    expect(yield* policy.evaluate("provider.use", "denied", "allow")).toBe("deny")
    expect(yield* policy.evaluate("provider.use", "unlisted", "allow")).toBe("deny")
  }),
)

it.effect("an empty legacy allowlist denies every provider; omitted allowlist leaves policy intact", () =>
  Effect.gen(function* () {
    const policy = yield* Policy.Service
    yield* policy.load(
      (migrate({ enabled_providers: [] }).experimental?.policies ?? []).map((item) => new Policy.Info(item)),
    )
    expect(yield* policy.evaluate("provider.use", "opencode", "allow")).toBe("deny")
    const config = migrate({
      experimental: { policies: [{ action: "provider.use", resource: "blocked", effect: "deny" }] },
    })
    expect(config.experimental?.policies).toEqual([{ action: "provider.use", resource: "blocked", effect: "deny" }])
    yield* policy.load((config.experimental?.policies ?? []).map((item) => new Policy.Info(item)))
    expect(yield* policy.evaluate("provider.use", "opencode", "allow")).toBe("allow")
    expect(yield* policy.evaluate("provider.use", "blocked", "allow")).toBe("deny")
    expect(migrate({}).experimental).toBeUndefined()
  }),
)
