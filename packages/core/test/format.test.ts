import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Config } from "@orchestra/core/config"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Format } from "@orchestra/core/format"
import { Location } from "@orchestra/core/location"
import { tempLocationLayer } from "./fixture/location"
import { testEffect } from "./lib/effect"

const withFormat = (formatter: Config.Info["formatter"]) =>
  Effect.provide(
    AppNodeBuilder.build(Format.node, [
      [Location.node, tempLocationLayer],
      [
        Config.node,
        Layer.succeed(
          Config.Service,
          Config.Service.of({
            entries: () =>
              Effect.succeed([new Config.Document({ type: "document", info: new Config.Info({ formatter }) })]),
          }),
        ),
      ],
    ]),
  )

const it = testEffect(Layer.empty)

describe("Format.status", () => {
  it.live("reports no formatters when formatting is off", () =>
    Effect.gen(function* () {
      const format = yield* Format.Service
      expect(yield* format.status()).toEqual([])
    }).pipe(withFormat(false)),
  )

  it.live("merges config overrides over the built-ins", () =>
    Effect.gen(function* () {
      const format = yield* Format.Service
      const status = yield* format.status()
      const names = status.map((item) => item.name)

      expect(status.find((item) => item.name === "house")).toEqual({
        name: "house",
        extensions: [".house"],
        enabled: true,
      })
      // Disabling ruff disables uv too, as in V1.
      expect(names).not.toContain("ruff")
      expect(names).not.toContain("uv")
      expect(names).not.toContain("gofmt")
      expect(names).toContain("prettier")
      expect(status.find((item) => item.name === "prettier")?.extensions).toContain(".ts")
      expect(status.every((item) => typeof item.enabled === "boolean")).toBe(true)
    }).pipe(
      withFormat({
        ruff: { disabled: true },
        gofmt: { disabled: true },
        house: { command: ["house-fmt", "$FILE"], extensions: [".house"] },
      }),
    ),
  )
})
