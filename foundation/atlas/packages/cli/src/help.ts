// @atlas/cli — src/help.ts  (ENTRY-CLI-5: the help door — DERIVED, never hand-listed)
//
// There is no help in the product before this file. `renderHelp` is a PURE function of the parser's own
// registries — `COMMAND_LEG` (map.ts, the command→leg TOTAL map) for the command NAMES, `ARITY` (parse.ts)
// for each command's required positional count, and `VALUED_FLAGS` (parse.ts) for the flags the parser
// itself recognises as carrying a value. Nothing here is a second, hand-kept list: `COMMAND_LEG`/`ARITY` are
// both typed `Record<Command, …>` where `Command = (typeof COMMANDS)[number]` (map.ts), so TypeScript
// REFUSES a command that is in `COMMANDS` but missing from either — there is no way to "add a command
// without touching help" that survives `tsc -b`, and there is nothing to remember to keep in sync (SCN-
// CLI-5c-1). Adding a command means widening `COMMANDS`+`COMMAND_LEG`+`ARITY` together (map.ts/parse.ts
// already force this); the moment that compiles, `renderHelp()` names it — automatically, not by edit.

import { COMMAND_LEG } from "./map.js"
import { ARITY, VALUED_FLAGS } from "./parse.js"

/**
 * The two environment channels that govern a write (ENTRY-CLI-5: "the actor identity and the ratifier
 * token"). Read ONLY at the composition root — `packages/adapter-io/src/compose.ts`'s `composeRuntime`
 * (`ATLAS_ACTOR` — KNOW-11 write-actor resolution; `ATLAS_RATIFY_TOKEN` — KNOW-8 full-ratify commit token).
 * `@atlas/cli` cannot import a VALUE from `@atlas/adapter-io` for this list (the layer guard runs
 * adapter-io → cli one-way, adapter-io depends on nothing that would let it re-export a cli-side constant
 * back down, and doing so would be the wrong direction of the very DAG `atlas-arch-constitution.md` polices)
 * — so this is the ONE place in this package the two names are transcribed rather than derived. The
 * containment guard (`test/help-cli.test.ts`, SCN-CLI-5d-1) reads `compose.ts` SOURCE and asserts these two
 * names are the WHOLE set `composeRuntime` reads off `process.env`, so a third channel added there without
 * being added here fails the test loudly rather than silently under-documenting the write surface.
 */
export const ENV_CHANNELS = ["ATLAS_ACTOR", "ATLAS_RATIFY_TOKEN"] as const

/**
 * Render the help door (ENTRY-CLI-5): every command in `COMMAND_LEG` with its required positional arity,
 * the flags the parser accepts as VALUED (any other `--x` is accepted too — a bare boolean, per `parse.ts`'s
 * fail-open flag fold), and the two write-governing environment channels. A PURE function of the three
 * source-of-truth tables above — no clock, no cwd, no I/O — so it renders byte-identically every call.
 */
export function renderHelp(): string {
  const commands = Object.keys(COMMAND_LEG) as ReadonlyArray<keyof typeof ARITY>
  const lines: string[] = [
    "atlas <command> [args...] [--flag | --flag=value | --flag value]",
    "",
    "commands (name — required positional argument count):",
    ...commands.map((c) => `  ${c} — ${ARITY[c]} positional argument(s)`),
    "",
    "flags accepted with a value (--flag=v or --flag v; any other --flag is a bare boolean):",
    ...[...VALUED_FLAGS].sort().map((f) => `  --${f}`),
    "",
    "environment (write governance — ENTRY-CLI-5):",
    ...ENV_CHANNELS.map((e) => `  ${e}`),
  ]
  return `${lines.join("\n")}\n`
}
