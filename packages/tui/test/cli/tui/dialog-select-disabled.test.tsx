/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { DialogSelect } from "../../../src/ui/dialog-select"
import { ready, wait } from "../cmd/tui/model-execution-consumer.fixture"

async function click(fixture: Awaited<ReturnType<typeof ready>>, title: string) {
  await fixture.app.renderOnce()
  const rows = fixture.app.captureCharFrame().split("\n")
  const y = rows.findIndex((row) => row.includes(title))
  expect(y).toBeGreaterThanOrEqual(0)
  const x = rows[y]!.indexOf(title)
  // Coordinates come from the actual rendered terminal frame; deliver real mouse down/up.
  await fixture.app.mockMouse.click(x, y)
}

test.each(["keyboard", "mouse"] as const)("TUI DialogSelect disabled rows remain inspectable but cannot select or clear through %s", async (input) => {
  const fixture = await ready()
  const selected: string[] = []
  const delegated: string[] = []
  try {
    fixture.context.dialog.replace(() => <DialogSelect showDisabled title="Inspect model availability" current="blocked" options={[
      { value: "blocked", title: "Disabled choice", disabled: true, footer: "Model is not allowed for this session",
        onSelect: (dialog) => { delegated.push("blocked"); dialog.clear() } },
      { value: "ready", title: "Enabled choice", onSelect: (dialog) => { delegated.push("ready"); dialog.clear() } },
    ]} onSelect={(option) => selected.push(option.value)} />)
    await wait(() => { void fixture.app.renderOnce(); return fixture.app.captureCharFrame().includes("Disabled choice") }, "real disabled row rendered")
    expect(fixture.app.captureCharFrame()).toContain("Model is not allowed for this session")
    expect(fixture.context.dialog.stack).toHaveLength(1)
    if (input === "keyboard") await fixture.app.mockInput.pressEnter()
    if (input === "mouse") await click(fixture, "Disabled choice")
    await fixture.app.renderOnce()
    expect(selected).toEqual([])
    expect(delegated).toEqual([])
    expect(fixture.context.dialog.stack).toHaveLength(1)
    if (input === "keyboard") { await fixture.app.mockInput.pressKey("down"); await fixture.app.mockInput.pressEnter() }
    if (input === "mouse") await click(fixture, "Enabled choice")
    await wait(() => selected.length === 1, "actual enabled-row selection remains available")
    expect(selected).toEqual(["ready"])
    expect(delegated).toEqual(["ready"])
    expect(fixture.context.dialog.stack).toHaveLength(0)
  } finally { await fixture.dispose() }
})

test("TUI DialogSelect keeps disabled rows hidden by default", async () => {
  const fixture = await ready()
  const selected: string[] = []
  try {
    fixture.context.dialog.replace(() => <DialogSelect title="Existing default filtering" options={[
      { value: "blocked", title: "Disabled choice", disabled: true },
      { value: "ready", title: "Enabled choice" },
    ]} onSelect={(option) => selected.push(option.value)} />)
    await wait(() => { void fixture.app.renderOnce(); return fixture.app.captureCharFrame().includes("Enabled choice") }, "default real enabled row rendered")
    expect(fixture.app.captureCharFrame()).not.toContain("Disabled choice")
    await fixture.app.mockInput.pressEnter()
    await wait(() => selected.length === 1, "existing default selection works")
    expect(selected).toEqual(["ready"])
  } finally { await fixture.dispose() }
})

test("TUI DialogSelect footer actions remain available independently of a disabled row", async () => {
  const fixture = await ready()
  const counts = { action: 0, option: 0, select: 0 }
  try {
    fixture.context.dialog.replace(() => <DialogSelect showDisabled title="Independent provider action" options={[
      { value: "blocked", title: "Disabled choice", disabled: true, onSelect: () => { counts.option++ } },
    ]} onSelect={() => { counts.select++ }} actions={[
      { command: "model.dialog.provider", title: "Connect provider", onTrigger: () => { counts.action++ } },
    ]} />)
    await wait(() => { void fixture.app.renderOnce(); return fixture.app.captureCharFrame().includes("Connect provider") }, "actual provider footer action rendered")
    await fixture.app.mockInput.pressKey("tab")
    await fixture.app.mockInput.pressEnter()
    await wait(() => counts.action === 1, "footer action precedes disabled-row admission guard")
    expect(counts).toEqual({ action: 1, option: 0, select: 0 })
    expect(fixture.context.dialog.stack).toHaveLength(1)
  } finally { await fixture.dispose() }
})
