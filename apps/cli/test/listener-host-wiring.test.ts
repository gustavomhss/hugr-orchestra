import { expect, test } from "bun:test"
import { Effect } from "effect"
import { Command } from "effect/unstable/cli"
import { NodeServices } from "@effect/platform-node"
import { Commands } from "../src/commands/commands"

test("serve parses repeated --allowed-host flags", async () => {
  let captured: unknown
  const withHandler = Commands.commands.serve.spec.pipe(
    Command.withHandler((input) =>
      Effect.sync(() => {
        captured = input
      }),
    ),
  )
  await Effect.runPromise(
    Command.runWith(withHandler, { version: "test" })([
      "--allowed-host",
      "proxy.example.test",
      "--allowed-host",
      "studio.local:443",
    ]).pipe(Effect.provide(NodeServices.layer)),
  )
  expect((captured as Record<string, unknown>)["allowed-host"]).toEqual(["proxy.example.test", "studio.local:443"])
})

test("web parses repeated --allowed-host flags", async () => {
  let captured: unknown
  const withHandler = Commands.commands.web.spec.pipe(
    Command.withHandler((input) =>
      Effect.sync(() => {
        captured = input
      }),
    ),
  )
  await Effect.runPromise(
    Command.runWith(withHandler, { version: "test" })([
      "--allowed-host",
      "proxy.example.test",
      "--allowed-host",
      "studio.local:443",
    ]).pipe(Effect.provide(NodeServices.layer)),
  )
  expect((captured as Record<string, unknown>)["allowed-host"]).toEqual(["proxy.example.test", "studio.local:443"])
})

test("serve defaults to no explicit allowed-host aliases", async () => {
  let captured: unknown
  const withHandler = Commands.commands.serve.spec.pipe(
    Command.withHandler((input) =>
      Effect.sync(() => {
        captured = input
      }),
    ),
  )
  await Effect.runPromise(
    Command.runWith(withHandler, { version: "test" })([]).pipe(Effect.provide(NodeServices.layer)),
  )
  expect((captured as Record<string, unknown>)["allowed-host"]).toEqual([])
})

test("web defaults to no explicit allowed-host aliases", async () => {
  let captured: unknown
  const withHandler = Commands.commands.web.spec.pipe(
    Command.withHandler((input) =>
      Effect.sync(() => {
        captured = input
      }),
    ),
  )
  await Effect.runPromise(
    Command.runWith(withHandler, { version: "test" })([]).pipe(Effect.provide(NodeServices.layer)),
  )
  expect((captured as Record<string, unknown>)["allowed-host"]).toEqual([])
})
