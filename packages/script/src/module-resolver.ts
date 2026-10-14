export * as ModuleResolver from "./module-resolver.ts"

export type Kind = "bun" | "npm" | "cargo"

export type Identity = {
  kind: Kind
  name: string
  scope?: string
}

export type Declaration = Identity & {
  scope: string
  path: string
  manifest: string
}

export type Selector = string | {
  name: string
  kind?: Kind
  scope?: string
}

/** Resolves captured declarations; aliases bind names, while returned paths come from the capture. */
export function make<T extends Declaration>(modules: readonly T[], aliases: Readonly<Record<string, Identity>> = {}) {
  if (!Array.isArray(modules) || modules.length === 0) throw new Error("MODULE_INVENTORY_EMPTY")
  const declarations = Array.from(modules)
  const identities = new Set<string>()
  declarations.forEach((module) => {
    const identity = requireSelector(module)
    if (identity.kind === undefined || identity.scope === undefined ||
      typeof module.path !== "string" || !module.path || typeof module.manifest !== "string" || !module.manifest)
      throw new Error("MODULE_DECLARATION_INVALID")
    const key = JSON.stringify([identity.kind, identity.scope, identity.name])
    if (identities.has(key)) throw new Error(`MODULE_IDENTITY_DUPLICATE:${key}`)
    identities.add(key)
  })
  if (!aliases || typeof aliases !== "object" || Array.isArray(aliases)) throw new Error("MODULE_ALIASES_INVALID")
  const registered = new Map<string, ReturnType<typeof requireSelector>>()

  const select = (identity: Exclude<Selector, string>) => {
    const matches = declarations.filter((module) => module.name === identity.name &&
      (identity.kind === undefined || module.kind === identity.kind) &&
      (identity.scope === undefined || module.scope === identity.scope))
    if (matches.length > 1)
      throw new Error(`MODULE_AMBIGUOUS:${JSON.stringify(identity)}:${JSON.stringify(matches.map((module) => [module.kind, module.scope, module.name]))}`)
    const found = matches[0]
    if (!found) throw new Error(`MODULE_NOT_FOUND:${JSON.stringify(identity)}`)
    return found
  }

  // Validate every registration, including unused aliases, so stale rows cannot silently survive a move.
  Object.entries(aliases).forEach(([name, identity]) => {
    requireName(name)
    const target = requireSelector(identity)
    if (target.kind === undefined) throw new Error(`MODULE_ALIAS_IDENTITY_MISSING:${JSON.stringify(name)}`)
    const found = select(target)
    registered.set(name, { kind: found.kind, name: found.name, scope: found.scope })
  })

  const resolve = (selector: Selector) => {
    const requested = requireSelector(typeof selector === "string" ? { name: requireName(selector) } : selector)
    const alias = registered.get(requested.name)
    if (alias && ((requested.kind !== undefined && requested.kind !== alias.kind) ||
      (requested.scope !== undefined && requested.scope !== alias.scope)))
      throw new Error(`MODULE_ALIAS_QUALIFIER_MISMATCH:${JSON.stringify(requested)}`)
    return select(alias ?? requested)
  }
  return { resolve }
}

function requireSelector(value: unknown): Exclude<Selector, string> {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("name" in value))
    throw new Error("MODULE_SELECTOR_INVALID")
  const kind = "kind" in value ? value.kind : undefined
  const scope = "scope" in value ? value.scope : undefined
  if (kind !== undefined && kind !== "bun" && kind !== "npm" && kind !== "cargo")
    throw new Error("MODULE_SELECTOR_KIND_INVALID")
  return { name: requireName(value.name), kind, scope: scope === undefined ? undefined : requireName(scope) }
}

function requireName(value: unknown) {
  if (typeof value !== "string" || !value || value.trim() !== value || /[\r\n\0]/.test(value))
    throw new Error("MODULE_SELECTOR_NAME_INVALID")
  return value
}
