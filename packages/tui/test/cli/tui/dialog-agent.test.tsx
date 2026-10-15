/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup } from "solid-js"
import { tmpdir } from "../../fixture/fixture"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { agentOption } from "../../../src/util/agent"

async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

// F1.11: the agent dialog (DialogAgent) lists agents through `agentOption` in DialogSelect. DialogAgent itself needs the
// full Local/Sync stack, so this renders the same select with the same options.
test("agent dialog lists a renamed agent by its label and selects its id", async () => {
  await using tmp = await tmpdir()
  const state = path.join(tmp.path, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")
  const [
    { DialogProvider },
    { DialogSelect },
    { KVProvider },
    { ThemeProvider },
    { TuiConfigProvider },
    { ToastProvider },
    { OrchestraKeymapProvider, registerOrchestraKeymap },
  ] = await Promise.all([
    import("../../../src/ui/dialog"),
    import("../../../src/ui/dialog-select"),
    import("../../../src/context/kv"),
    import("../../../src/context/theme"),
    import("../../../src/config"),
    import("../../../src/ui/toast"),
    import("../../../src/keymap"),
  ])
  const selected: string[] = []

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const resolvedConfig = createTuiResolvedConfig({ keybinds: {}, leader_timeout: 1000 })
    const off = registerOrchestraKeymap(keymap, renderer, resolvedConfig)
    onCleanup(off)
    return (
      <TestTuiContexts directory={tmp.path} paths={{ home: tmp.path, state, worktree: tmp.path }}>
        <OrchestraKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={resolvedConfig}>
            <KVProvider>
              <ThemeProvider mode="dark">
                <ToastProvider>
                  <DialogProvider>
                    <DialogSelect
                      title="Select agent"
                      current="maestro"
                      options={[
                        agentOption({ id: "maestro", name: "Conductor", native: true }),
                        agentOption({ id: "reviewer", name: "reviewer", description: "Custom reviewer" }),
                      ]}
                      onSelect={(option) => selected.push(option.value)}
                    />
                  </DialogProvider>
                </ToastProvider>
              </ThemeProvider>
            </KVProvider>
          </TuiConfigProvider>
        </OrchestraKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { kittyKeyboard: true, width: 80, height: 24 })
  try {
    await wait(() => {
      void app.renderOnce()
      return app.captureCharFrame().includes("Conductor")
    })
    expect(app.captureCharFrame()).not.toContain("maestro")
    app.mockInput.pressEnter()
    await wait(() => selected.length > 0)
    expect(selected).toEqual(["maestro"])
  } finally {
    app.renderer.destroy()
  }
})
