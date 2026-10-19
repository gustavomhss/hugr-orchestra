import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AppDockProfileRegistry } from "./app-dock-profile-registry"

const directories: string[] = []
const userData = () => {
  const directory = mkdtempSync(join(tmpdir(), "app-dock-registry-"))
  directories.push(directory)
  return directory
}

afterEach(() => {
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
})

describe("App Dock profile registry", () => {
  test("a stale manifest write conflicts after app-dock-open creates a repository profile", () => {
    const registry = AppDockProfileRegistry.load(userData())
    registry.ensureActive("default")
    const stale = registry.manifest()
    registry.ensureActive("repo-abc")

    const tabs = { ...stale.tabs, "repo-abc": [{ url: "https://example.com/", pinned: false }] }
    const conflict = registry.replaceManifest(stale.revision, { ...stale, tabs })
    expect(conflict.status).toBe("conflict")
    expect(conflict.manifest.profiles.map((profile) => profile.id)).toEqual(["default", "repo-abc"])

    const fresh = conflict.manifest
    const updated = registry.replaceManifest(fresh.revision, {
      ...fresh,
      tabs: { ...fresh.tabs, "repo-abc": [{ url: "https://example.com/", pinned: false }] },
    })
    expect(updated.status).toBe("updated")
    expect(updated.manifest.tabs["repo-abc"]).toEqual([{ url: "https://example.com/", pinned: false }])
  })

  test("repository profiles keep one partition each across restarts", () => {
    const directory = userData()
    const registry = AppDockProfileRegistry.load(directory)
    const alpha = registry.ensureActive("repo-alpha")
    const beta = registry.ensureActive("repo-beta")
    expect(alpha.storageKey).not.toBe(beta.storageKey)
    expect(registry.ensureActive("repo-alpha")).toEqual(alpha)

    const restarted = AppDockProfileRegistry.load(directory)
    expect(restarted.ensureActive("repo-alpha")).toEqual(alpha)
    expect(restarted.ensureActive("repo-beta")).toEqual(beta)
  })
})
