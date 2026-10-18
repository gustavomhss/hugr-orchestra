import { describe, expect, test, vi } from "bun:test"
import { createRoot } from "solid-js"
import { createShellOptions, createSoundPreviewController, readShells } from "./general-controller-behavior"

describe("settings v2 controllers", () => {
  test("normalizes shell names and preserves an unavailable configured shell", () => {
    expect(
      createShellOptions({
        shells: [
          { path: "/bin/bash", name: "bash", acceptable: true },
          { path: "/opt/bash", name: "bash", acceptable: false },
          { path: "/bin/zsh", name: "zsh", acceptable: true },
        ],
        current: "fish",
      }),
    ).toEqual([
      { id: "auto", value: "", name: "", terminalOnly: false },
      { id: "/bin/bash", value: "/bin/bash", name: "/bin/bash", terminalOnly: false },
      { id: "/opt/bash", value: "/opt/bash", name: "/opt/bash", terminalOnly: true },
      { id: "/bin/zsh", value: "zsh", name: "zsh", terminalOnly: false },
      { id: "fish", value: "fish", name: "fish", terminalOnly: false },
    ])
  })

  test("reads a well-formed shell list and rejects a malformed reply before anything maps it", () => {
    const shells = [
      { path: "/bin/zsh", name: "zsh", acceptable: true },
      { path: "/usr/bin/fish", name: "fish", acceptable: false },
    ]
    expect(readShells(shells)).toEqual(shells)
    expect(readShells([])).toEqual([])
    // The reply that took the whole app down was `{}`; a failed request leaves no data at all.
    for (const reply of [{}, undefined, null, "zsh", [{ path: "/bin/zsh", name: "zsh" }], [{ ...shells[0], name: 1 }]])
      expect(() => readShells(reply)).toThrow("The server returned a malformed shell list.")
  })

  test("debounces previews and stops owned audio on disposal", async () => {
    vi.useFakeTimers()
    try {
      const played: string[] = []
      const stopped: string[] = []
      const owned = createRoot((dispose) => ({
        dispose,
        preview: createSoundPreviewController(async (id) => {
          played.push(id ?? "")
          return () => stopped.push(id ?? "")
        }),
      }))

      owned.preview.play("first")
      vi.advanceTimersByTime(99)
      expect(played).toEqual([])

      owned.preview.play("second")
      vi.advanceTimersByTime(100)
      await Promise.resolve()
      expect(played).toEqual(["second"])

      owned.dispose()
      expect(stopped).toEqual(["second"])
    } finally {
      vi.useRealTimers()
    }
  })
})
