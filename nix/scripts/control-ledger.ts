export function controlLedger(source: string) {
  const starts = source.match(/^\/\* CONTROL_LEDGER_BEGIN\r?$/gm) ?? []
  const ends = source.match(/^CONTROL_LEDGER_END \*\/\r?$/gm) ?? []
  const region = source.match(/^\/\* CONTROL_LEDGER_BEGIN\r?\n([\s\S]*?)^CONTROL_LEDGER_END \*\/\r?$/m)?.[1]
  if (starts.length !== 1 || ends.length !== 1 || region === undefined || !region.trim())
    throw new Error("NIX_DISTRIBUTION_FAILURE:CONTROL_LEDGER_MISSING")
  const value: unknown = (() => {
    try {
      return JSON.parse(region)
    } catch (cause) {
      throw new Error("NIX_DISTRIBUTION_FAILURE:CONTROL_LEDGER_INVALID", { cause })
    }
  })()
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("NIX_DISTRIBUTION_FAILURE:CONTROL_LEDGER_INVALID")
  if (!Object.keys(value).length) throw new Error("NIX_DISTRIBUTION_FAILURE:CONTROL_LEDGER_EMPTY")
  if (Object.values(value).some((entry) => entry !== null && typeof entry !== "string"))
    throw new Error("NIX_DISTRIBUTION_FAILURE:CONTROL_LEDGER_INVALID")
  return Object.freeze(value as Record<string, string | null>)
}
