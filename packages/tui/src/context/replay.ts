/**
 * The messages a mini-mode session shows: `--no-replay` hides what existed when the screen opened, and
 * `--replay-limit N` keeps the newest N of what is left. Outside mini mode every message shows.
 */
export function replayWindow<T extends { readonly time: { readonly created: number } }>(
  messages: readonly T[],
  options: { readonly mini?: boolean; readonly replay?: boolean; readonly limit?: number; readonly openedAt: number },
) {
  if (!options.mini) return messages
  const fresh = options.replay === false ? messages.filter((message) => message.time.created >= options.openedAt) : messages
  return options.limit === undefined ? fresh : fresh.slice(-options.limit)
}
