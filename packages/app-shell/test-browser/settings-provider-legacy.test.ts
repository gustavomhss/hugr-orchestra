import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { createComponent, createRoot } from "solid-js"
import type { AsyncStorage } from "@solid-primitives/storage"
import type { useSettings } from "@/context/settings"
import { rewriteImports, solidDom } from "./solid-dom"

const { PlatformProvider }: typeof import("@/context/platform") = await import(solidDom("@/context/platform", import.meta.dir))

async function until(predicate: () => boolean) {
  for (let n = 0; n < 200 && !predicate(); n++) await Bun.sleep(10)
  expect(predicate()).toBe(true)
}

async function fixture(initial?: unknown) {
  const values = new Map<string, string>()
  const writes: { name: string; key: string; value: string }[] = []
  const address = (name: string, key: string) => JSON.stringify([name, key])
  if (initial !== undefined) values.set(address("default", "settings.v3"), JSON.stringify(initial))
  const storage = (name = "default"): AsyncStorage => ({
    async getItem(key) {
      return values.get(address(name, key)) ?? null
    },
    async setItem(key, value) {
      values.set(address(name, key), value)
      writes.push({ name, key, value })
    },
    async removeItem(key) {
      values.delete(address(name, key))
    },
  })
  const originalPath = Bun.resolveSync("@/context/settings", import.meta.dir)
  // Qualify imports only: each cold root runs the actual source through the existing production-preset loader.
  const source = rewriteImports(await Bun.file(originalPath).text(), originalPath)
  // Keep bare and compiler-generated Solid imports in this test's package dependency ancestry.
  const directory = await mkdtemp(path.join(import.meta.dir, ".settings-legacy-"))
  const mounts: (() => void)[] = []

  return {
    writes,
    async mount() {
      // Let the provider's real font/wallpaper effects run, then restore only the properties they own.
      const style = document.documentElement.style
      const previous = ["--font-family-mono", "--font-family-sans", "--orchestra-wallpaper", "--orchestra-wallpaper-dim"].map(
        (name) => ({ name, value: style.getPropertyValue(name), priority: style.getPropertyPriority(name) }),
      )
      const scope: { settings?: ReturnType<typeof useSettings> } = {}
      const lifecycle: { dispose?: () => void; closed: boolean } = { closed: false }
      const close = () => {
        if (lifecycle.closed) return
        lifecycle.closed = true
        try {
          lifecycle.dispose?.()
        } finally {
          previous.forEach(({ name, value, priority }) => {
            if (value) style.setProperty(name, value, priority)
            else style.removeProperty(name)
          })
        }
      }
      const file = path.join(directory, `settings-${mounts.length}.tsx`)
      mounts.push(close)
      try {
        await Bun.write(file, source)
        // The root's defaults and context are unique; real Platform/persistence dependencies stay shared.
        const { SettingsProvider, useSettings }: typeof import("@/context/settings") = await import(
          solidDom(file, import.meta.dir)
        )
        createRoot((dispose) => {
          // Capture cleanup before fallible provider construction; this fixture mounts owners/effects, not a view.
          lifecycle.dispose = dispose
          return createComponent(PlatformProvider, {
            value: {
              platform: "desktop", storage, openExternal() {}, async restart() {}, async notify() {},
              async openDirectoryPickerDialog() { return null },
            },
            get children() {
              return createComponent(SettingsProvider, {
                get children() {
                  return createComponent(() => {
                    scope.settings = useSettings()
                    return undefined
                  }, {})
                },
              })
            },
          })
        })
        return {
          get settings() {
            if (!scope.settings) throw new Error("SettingsProvider did not mount")
            return scope.settings
          },
          dispose: close,
        }
      } catch (error) {
        close()
        throw error
      }
    },
    async dispose() {
      try {
        mounts.forEach((close) => close())
      } finally {
        // Only this fixture's exact test-local mkdtemp directory, after root cleanup; registry entries stay loaded.
        await rm(directory, { recursive: true, force: true })
      }
    },
  }
}

function expectRetiredAPI(settings: ReturnType<typeof useSettings>) {
  expect(Reflect.has(settings.general, "autoSave")).toBe(false)
  expect(Reflect.has(settings.general, "setAutoSave")).toBe(false)
  expect(Reflect.has(settings, "permissions")).toBe(false)
}

test("fresh settings become ready with defaults and without retired stored fields or accessors", async () => {
  const profile = await fixture()
  try {
    const fresh = await profile.mount()
    try {
      await until(() => fresh.settings.ready())
      expect(fresh.settings.general.showFileTree()).toBe(false)
      expect(fresh.settings.general.showTerminal()).toBe(false)
      expect(fresh.settings.general.followup()).toBe("steer")
      expect(fresh.settings.appearance.fontSize()).toBe(14)
      expect(Reflect.has(fresh.settings.current.general, "autoSave")).toBe(false)
      expect(Reflect.has(fresh.settings.current, "permissions")).toBe(false)
      expectRetiredAPI(fresh.settings)
    } finally {
      fresh.dispose()
    }
  } finally {
    await profile.dispose()
  }
})

test("legacy settings hydrate and survive an unrelated setter and remount without exposing retired accessors", async () => {
  const legacy = { general: { autoSave: false }, permissions: { autoApprove: true } }
  const profile = await fixture({
    general: { ...legacy.general, followup: "queue", showFileTree: true },
    permissions: legacy.permissions,
    appearance: { fontSize: 17 },
  })
  try {
    const first = await profile.mount()
    try {
      await until(() => first.settings.ready() && first.settings.current.general.followup === "steer")
      expect(first.settings.general.showFileTree()).toBe(true)
      expect(first.settings.general.showTerminal()).toBe(false)
      expect(first.settings.general.followup()).toBe("steer")
      expect(first.settings.appearance.fontSize()).toBe(17)
      // Unknown stored fields survive at runtime, without restoring them to the exported Settings type or live API.
      expect(first.settings.current).toMatchObject(legacy)
      expectRetiredAPI(first.settings)

      const before = profile.writes.length
      first.settings.general.setShowFileTree(false)
      const written = () => profile.writes.slice(before).find((write) =>
        write.name === "default" && write.key === "settings.v3" && JSON.parse(write.value).general?.showFileTree === false,
      )
      await until(() => written() !== undefined)
      expect(JSON.parse(written()!.value)).toMatchObject({
        general: { autoSave: false, followup: "steer", showFileTree: false },
        permissions: { autoApprove: true },
        appearance: { fontSize: 17 },
      })
    } finally {
      first.dispose()
    }

    const second = await profile.mount()
    try {
      await until(() => second.settings.ready() && second.settings.current.general.followup === "steer")
      expect(second.settings.general.showFileTree()).toBe(false)
      expect(second.settings.general.showTerminal()).toBe(false)
      expect(second.settings.general.followup()).toBe("steer")
      expect(second.settings.appearance.fontSize()).toBe(17)
      expect(second.settings.current).toMatchObject(legacy)
      expectRetiredAPI(second.settings)
    } finally {
      second.dispose()
    }
  } finally {
    await profile.dispose()
  }
})
