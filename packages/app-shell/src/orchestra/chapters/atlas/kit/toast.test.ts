import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createToaster } from "./toast"

describe("createToaster", () => {
  test("a refusal stays until it is dismissed", async () => {
    await createRoot(async (dispose) => {
      const toaster = createToaster()
      toaster.show("Refused", "xc")
      expect(toaster.state).toMatchObject({ text: "Refused", shown: true, sticky: true })
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(toaster.state.shown).toBe(true)
      toaster.dismiss()
      expect(toaster.state.shown).toBe(false)
      dispose()
    })
  })

  test("any other message is not sticky and replaces a refusal", () => {
    createRoot((dispose) => {
      const toaster = createToaster()
      toaster.show("Refused", "xc")
      toaster.show("Saved", "check")
      expect(toaster.state).toMatchObject({ text: "Saved", shown: true, sticky: false })
      toaster.show("Refused again", "xc")
      expect(toaster.state.sticky).toBe(true)
      dispose()
    })
  })
})
