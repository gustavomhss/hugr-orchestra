import { expect, test } from "bun:test"
import { revealWindow } from "./window-state"

function fakeWindow(minimized: boolean) {
  const calls: string[] = []
  return {
    calls,
    isMinimized: () => minimized,
    restore: () => calls.push("restore"),
    show: () => calls.push("show"),
    focus: () => calls.push("focus"),
  }
}

test("reveal restores a minimized window before showing it", () => {
  const win = fakeWindow(true)
  revealWindow(win)
  expect(win.calls).toEqual(["restore", "show", "focus"])
})

test("reveal leaves an unminimized window's size alone", () => {
  const win = fakeWindow(false)
  revealWindow(win)
  expect(win.calls).toEqual(["show", "focus"])
})
