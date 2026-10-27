import { Option } from "effect"

/**
 * The mini-mode choices around session history and demo mode: replay is on by default,
 * and every mini flag needs `--mini`.
 */
export function miniOptions(input: {
  readonly mini: boolean
  readonly "no-replay": boolean
  readonly "replay-limit": Option.Option<number>
  readonly demo?: boolean
}) {
  const limit = Option.getOrUndefined(input["replay-limit"])
  const unsupported = [
    ["--no-replay", input["no-replay"]],
    ["--replay-limit", limit !== undefined],
    ["--demo", input.demo === true],
  ].find((entry) => entry[1] && !input.mini)?.[0]
  if (unsupported) throw new Error(`${unsupported} requires --mini`)
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0))
    throw new Error("--replay-limit must be a positive integer")
  return {
    ...(input["no-replay"] ? { replay: false } : {}),
    ...(limit !== undefined ? { replayLimit: limit } : {}),
    ...(input.demo ? { demo: true } : {}),
  }
}
