export * as ReviewPackRepo from "./repo"

import { Effect } from "effect"
import { RelayCommands } from "../../relay-commands"

// The `repo` pack (plan R4, design §8.5): the gates the base revision declares, read from the base copy so the change
// under review cannot add, drop or rewrite the commands run on its head. Each runs confined in the head copy and its
// result is tagged workspace-executed. Whole test suites run in the project's CI, never in a review (design §7.2), and a
// build is not a gate.

export type Gate = {
  readonly id: string
  readonly command: string
  readonly kind: RelayCommands.Command["kind"]
} & ({ readonly argv: ReadonlyArray<string> } | { readonly skip: string })

export const TESTS = "test suite: runs in the project's CI, never in a review"

export const gates = Effect.fn("ReviewPackRepo.gates")(function* (baseRoot: string) {
  const detected = yield* RelayCommands.detect(baseRoot)
  return detected.commands
    .filter((command) => command.kind !== "build")
    .map((command): Gate => {
      const base = { id: `repo:${command.command}`, command: command.command, kind: command.kind }
      if (command.kind === "test") return { ...base, skip: TESTS }
      return { ...base, argv: argv(command) }
    })
})

/** The program a gate starts, from the host's PATH; a compiled Orchestra binary acts as bun under BUN_BE_BUN. */
export function program(name: string, env: Record<string, string>) {
  const found = Bun.which(name, { PATH: env.PATH ?? "" })
  if (found) return { binary: found, env: {} }
  if (name === "bun") return { binary: process.execPath, env: { BUN_BE_BUN: "1" } }
  return undefined
}

// A package.json script name is the manifest's text, so it stays one argument; no shell ever parses a gate.
function argv(command: RelayCommands.Command) {
  if (command.source !== "package.json") return command.command.split(" ")
  const runner = command.command.slice(0, command.command.indexOf(" "))
  return [runner, "run", command.command.slice(runner.length + " run ".length)]
}
