// Validators for MCP Dock RPC arguments: each throws a message naming the bad argument.

export const dockString = (value: unknown, name: string) => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid MCP Dock ${name}`)
  return value
}

export const dockStringArrayArg = (args: Record<string, unknown>, name: string, defaultValue: string[] = []) => {
  const value = args[name]
  if (Array.isArray(value)) return value
  if (typeof value === "string" && value.length > 0) return [value]
  return defaultValue
}

export const dockNumber = (value: unknown, name: string, min: number, max: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid MCP Dock ${name}`)
  return Math.max(min, Math.min(max, Math.round(value)))
}

export const dockEnum = (value: unknown, name: string, allowed: string[]) => {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`Invalid MCP Dock ${name}`)
  return value
}

export const dockBoolean = (value: unknown, name: string) => {
  if (typeof value !== "boolean") throw new Error(`Invalid MCP Dock ${name}`)
  return value
}

export const dockRef = (value: unknown, name: string) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid MCP Dock ${name}`)
  return value
}
