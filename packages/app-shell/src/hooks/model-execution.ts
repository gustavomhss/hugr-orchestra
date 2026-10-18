// Host-only availability is not an API connection. An absent engine fact never authorizes a host
// entry; unmarked API entries retain their existing connected-catalog behavior.
export function modelSupportsExecution(providerID: string, provider: unknown, model: unknown, engine: unknown) {
  return [provider, model].every((item) => {
    const host = executionHost(item)
    if (host === undefined) return true
    return host === "claude-code" && engine === "claude-code" && providerID === "anthropic"
  })
}

function executionHost(item: unknown) {
  if (!item || typeof item !== "object" || !("options" in item)) return undefined
  const options = item.options
  if (!options || typeof options !== "object" || !("executionHost" in options)) return undefined
  return options.executionHost
}
