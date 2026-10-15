import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { fileURLToPath } from "node:url"
import { createEffect, createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { Ghostty, Terminal } from "ghostty-web"
import { setOptionIfSupported } from "@/utils/runtime-adapters"
import { createTerminalTheme } from "@/utils/terminal-theme"
import { withAlpha } from "@orchestra/ui/theme/color"
import type { DesktopTheme } from "@orchestra/ui/theme/types"

const owners: VoidFunction[] = []
const style = document.createElement("style")

beforeAll(async () => {
  style.textContent = await Bun.file(new URL("../src/orchestra/theme.css", import.meta.url)).text()
})
beforeEach(() => {
  document.head.append(style)
  document.documentElement.dataset.colorScheme = "dark"
  document.body.setAttribute("data-new-layout", "")
})
afterEach(() => {
  owners.splice(0).forEach((dispose) => dispose())
  style.remove()
  document.body.removeAttribute("data-new-layout")
  delete document.documentElement.dataset.colorScheme
  delete document.documentElement.dataset.theme
})

function fixture(theme?: DesktopTheme) {
  return createRoot((dispose) => {
    owners.push(dispose)
    const [state, setState] = createStore({ mode: "dark" as "light" | "dark", newLayout: true, theme })
    const palette = createTerminalTheme({
      mode: () => state.mode,
      theme: () => state.theme,
      newLayout: () => state.newLayout,
    })
    return { palette, setState, dispose }
  })
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("terminal palette", () => {
  test.each([
    { mode: "dark", background: "#0e141b", foreground: "#eef1f5", accent: "#7ea5cc", alpha: 0.25 },
    { mode: "light", background: "#e9ecf0", foreground: "#1a1f26", accent: "#164775", alpha: 0.2 },
  ] as const)("reads the approved $mode Orchestra tokens", ({ mode, background, foreground, accent, alpha }) => {
    document.documentElement.dataset.colorScheme = mode
    const terminal = fixture()
    terminal.setState("mode", mode)
    expect(terminal.palette()).toEqual({
      mode,
      colors: { background, foreground, cursor: accent, selectionBackground: withAlpha(accent, alpha) },
    })
  })

  test("reacts to live previews and restores dark colors without recreating the binding", async () => {
    const terminal = fixture()
    const updates: string[] = []
    createRoot((dispose) => {
      owners.push(dispose)
      createEffect(() => {
        const palette = terminal.palette()
        updates.push(palette.colors.background)
      })
    })
    document.documentElement.dataset.colorScheme = "light"
    await flush()
    expect(terminal.palette().mode).toBe("light")
    expect(terminal.palette().colors.foreground).toBe("#1a1f26")
    document.documentElement.dataset.colorScheme = "dark"
    await flush()
    expect(updates).toEqual(["#0e141b", "#e9ecf0", "#0e141b"])
  })

  test("uses updated stylesheet tokens after a theme application", async () => {
    const terminal = fixture()
    style.textContent += "\nhtml[data-color-scheme] body[data-new-layout] { --orchestra-accent: #123456; }"
    document.documentElement.dataset.theme = "terminal-test"
    await flush()
    expect(terminal.palette().colors.cursor).toBe("#123456")
    style.textContent = await Bun.file(new URL("../src/orchestra/theme.css", import.meta.url)).text()
  })

  test("keeps legacy colors outside the Orchestra identity and observes identity changes", async () => {
    const terminal = fixture()
    document.body.removeAttribute("data-new-layout")
    await flush()
    expect(terminal.palette().colors).toEqual({
      background: "#191515",
      foreground: "#d4d4d4",
      cursor: "#d4d4d4",
      selectionBackground: withAlpha("#d4d4d4", 0.25),
    })
    document.body.setAttribute("data-new-layout", "")
    await flush()
    expect(terminal.palette().colors.background).toBe("#0e141b")
    terminal.setState({ newLayout: false, mode: "light" })
    expect(terminal.palette().colors.background).toBe("#fcfcfc")
  })

  test("preserves selected UI theme colors when Orchestra is disabled", async () => {
    const theme = await Bun.file(new URL("../../ui/src/theme/themes/oc-2.json", import.meta.url)).json()
    const terminal = fixture(theme)
    terminal.setState("newLayout", false)
    expect(terminal.palette().colors.background).toBe("#151515")
    expect(terminal.palette().colors.foreground).toBe("#EDEDED")
  })

  test("recolors the live Ghostty terminal while preserving its buffer, size, and font", async () => {
    const palette = fixture().palette
    const term = new Terminal({
      ghostty: await Ghostty.load(fileURLToPath(import.meta.resolve("ghostty-web/ghostty-vt.wasm"))),
      theme: palette().colors,
      cols: 40,
      rows: 5,
      fontFamily: "monospace",
      fontSize: 14,
    })
    owners.push(() => term.dispose())
    term.open(document.createElement("div"))
    await new Promise<void>((resolve) => term.write("retained output\r\n", resolve))
    const buffer = term.buffer.active.getLine(0)?.translateToString(true)
    expect(buffer).toBe("retained output")
    const cursor = [term.buffer.active.cursorX, term.buffer.active.cursorY]
    const wasm = term.wasmTerm
    createRoot((dispose) => {
      owners.push(dispose)
      createEffect(() => {
        setOptionIfSupported(term, "theme", palette().colors)
        setOptionIfSupported(term, "colorScheme", palette().mode)
      })
    })
    document.documentElement.dataset.colorScheme = "light"
    await flush()
    expect(term.options.theme.background).toBe("#e9ecf0")
    expect(term.options.theme.foreground).toBe("#1a1f26")
    expect(term.options.colorScheme).toBe("light")
    expect(term.wasmTerm).toBe(wasm)
    expect(term.buffer.active.getLine(0)?.translateToString(true)).toBe(buffer)
    expect([term.buffer.active.cursorX, term.buffer.active.cursorY]).toEqual(cursor)
    expect([term.cols, term.rows]).toEqual([40, 5])
    expect([term.options.fontFamily, term.options.fontSize]).toEqual(["monospace", 14])
  })

  test("disconnects the DOM observer on cleanup", async () => {
    const terminal = fixture()
    const palette = terminal.palette()
    terminal.dispose()
    document.documentElement.dataset.colorScheme = "light"
    await flush()
    expect(terminal.palette()).toBe(palette)
  })
})
