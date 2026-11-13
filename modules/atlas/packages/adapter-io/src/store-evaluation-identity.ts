import { existsSync, lstatSync, realpathSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"

// Identity is bound by the disk-store constructor, never inferred from the projection's contents.
// Keep method identities too so ordinary spread-based store views retain their origin.
const stores = new WeakMap<object, string>()
const methods = new WeakMap<object, string>()
export function registerDiskStoreIdentity(store: object, casPath: string): void {
  const path = resolve(casPath)
  const prior = stores.get(store)
  if (prior !== undefined && prior !== path) throw new Error("evaluation-store-identity-conflict")
  stores.set(store, path)
  for (const name of ["get", "put", "commitProjection", "commitStaging"]) {
    const method = (store as Record<string, unknown>)[name]
    if (typeof method === "function") {
      const previous = methods.get(method)
      if (previous !== undefined && previous !== path) throw new Error("evaluation-store-identity-conflict")
      methods.set(method, path)
    }
  }
}
function storePaths(store: object): string[] {
  const paths = new Set<string>(), own = stores.get(store)
  if (own !== undefined) paths.add(own)
  for (const name of ["get", "put", "commitProjection", "commitStaging"]) {
    const method = (store as Record<string, unknown>)[name]
    if (typeof method === "function") { const path = methods.get(method); if (path !== undefined) paths.add(path) }
  }
  if (paths.size > 1) throw new Error("evaluation-store-identity-conflict")
  return [...paths]
}

/** Presence, including a malformed or dangling-symlink marker, is sufficient to forbid operational writes. */
export function assertOperationalStateDirectory(directory: string): void {
  const paths = new Set([resolve(directory)])
  if (existsSync(directory)) paths.add(realpathSync(directory))
  for (const origin of [...paths]) {
    let parent = origin
    while (dirname(parent) !== parent) {
      if (basename(parent) === ".atlas") { paths.add(parent); break }
      parent = dirname(parent)
    }
  }
  for (const path of paths) for (const name of ["evaluation-store.json", "evaluation-policy.json"]) {
    try { lstatSync(join(path, name)) } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") continue
      throw error
    }
    throw new Error("evaluation-operational-store-refused")
  }
}

/** CAS and sidecars are one store: resolving only CAS can silently split their authority. */
function diskDirectories(path: string): { cas: string; state: string } | undefined {
  const state = dirname(path)
  // Ordinary new stores may not have materialized CAS yet. Never accept dangling aliases.
  try { lstatSync(path) } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined
    throw error
  }
  const cas = realpathSync(path), actualState = realpathSync(state)
  if (dirname(cas) !== actualState) throw new Error("evaluation-store-directory-split")
  return { cas, state: actualState }
}

export function assertOperationalDiskStore(store: object): void {
  for (const path of storePaths(store)) {
    assertOperationalStateDirectory(dirname(path))
    // Check the physical CAS parent too, before accepting the joint directory binding.
    if (existsSync(path)) assertOperationalStateDirectory(dirname(realpathSync(path)))
    diskDirectories(path)
  }
}

/** An issued capability binds BOTH real CAS and the directory holding projection/staging. */
export function assertEvaluationDiskStore(store: object, root: string): void {
  const paths = storePaths(store), expectedState = realpathSync(join(root, ".atlas"))
  const expectedCas = realpathSync(join(root, ".atlas", "cas"))
  if (paths.length !== 1 || dirname(expectedCas) !== expectedState) throw new Error("evaluation-store-identity-binding")
  const actual = diskDirectories(paths[0]!)
  if (actual === undefined || actual.cas !== expectedCas || actual.state !== expectedState)
    throw new Error("evaluation-store-identity-binding")
}
