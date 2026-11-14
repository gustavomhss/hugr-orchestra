import { expect, test } from "bun:test"
import type { LiveRecoveryAction, LiveRecoverySnapshot } from "../src/live"
import { controlled, item, mount, snapshot, wait } from "./live-recovery.fixture"

// The actual FlightRecovery and LanguageProvider render through the existing Solid DOM harness.
// Only the public LiveRecoveryPort is controlled; no native manager, IPC, transcript or delivery proof is fabricated.
for (const locale of ["en", "br"] as const) {
  test(`M13 recovery ${locale}: unavailable storage warns and cannot claim recording readiness`, async () => {
    const control = controlled(snapshot({ state: "storage-error", canStart: false, items: [] }))
    const view = await mount(control, locale)
    try {
      await wait(() => view.words.storage.test(view.text()), "localized storage-unavailable warning")
      expect(view.text()).not.toMatch(/ready to record|pronto para gravar/i)
      const starts = [...view.host.querySelectorAll<HTMLButtonElement>("button")]
        .filter((button) => /start (?:recording|meeting)|iniciar (?:gravação|reunião)/i.test(button.textContent ?? ""))
      expect(starts.every((button) => button.disabled || button.getAttribute("aria-disabled") === "true")).toBe(true)
    } finally { view.dispose() }
  })

  test(`M13 recovery ${locale}: pending saved delivery differs from active recording`, async () => {
    const control = controlled()
    const view = await mount(control, locale)
    try {
      await wait(() => view.text().includes(item().title), "actual pending recovery item")
      expect(view.text()).toMatch(view.words.pending)
      expect(view.leaves()).not.toContain(view.words.recording)
      control.state.value = snapshot({ items: [item({ activeProducer: true, status: "sending", reason: undefined })] })
      view.focus()
      await wait(() => view.leaves().includes(view.words.recording), "recording label for an actual active producer")
      control.state.value = snapshot()
      view.focus()
      await wait(() => !view.leaves().includes(view.words.recording), "recording label cleared by an inactive snapshot")
      expect(view.text()).toMatch(view.words.pending)
    } finally { view.dispose() }
  })

  test(`M13 recovery ${locale}: an unconfirmed start remains visible as recovery metadata`, async () => {
    const control = controlled(snapshot({ items: [], unconfirmedStarts: [{
      id: "33333333-3333-4333-8333-333333333333", title: "Start awaiting reconciliation", sessionID: "ses_uncertain", reason: "deadline",
    }] }))
    const view = await mount(control, locale)
    try {
      await wait(() => view.text().includes("Start awaiting reconciliation"), "unconfirmed start metadata")
      expect(view.leaves()).not.toContain(view.words.recording)
      view.button(view.words.retry).click()
      await wait(() => control.state.calls.length === 1, "recovery of the unconfirmed local ID")
      expect(control.state.calls).toEqual([{ action: "retry", args: ["33333333-3333-4333-8333-333333333333"] }])
    } finally { view.dispose() }
  })

  for (const unsaved of ["retained", "unavailable"] as const) {
    test(`M13 recovery ${locale}: ${unsaved} unsaved data never certifies the recent audio tail`, async () => {
      const control = controlled(snapshot({ canStart: false, items: [item({ status: "storage-error", reason: "quota", unsaved })] }))
      const view = await mount(control, locale)
      try {
        await wait(() => view.text().includes(item().title), "recovery item with unsaved warning")
        expect(view.text()).toMatch(view.words.incomplete)
        expect(view.leaves().some((text) => view.words.delivered.test(text))).toBe(false)
      } finally { view.dispose() }
    })
  }

  for (const action of ["retry", "export"] as const) {
    test(`M13 recovery ${locale}: ${action} passes only the exact opaque local ID`, async () => {
      const record = item({ id: "22222222-2222-4222-8222-222222222222" })
      const control = controlled(snapshot({ items: [record] }))
      const view = await mount(control, locale)
      try {
        await wait(() => view.text().includes(record.title), "actionable saved record")
        view.button(view.words[action]).click()
        await wait(() => control.state.calls.length === 1, "public recovery action")
        expect(control.state.calls).toEqual([{ action, args: [record.id] }])
        expect(view.text()).toContain(record.title)
      } finally { view.dispose() }
    })
  }

  test(`M13 recovery ${locale}: a cancelled native export is an ordinary result`, async () => {
    const control = controlled()
    control.actions.export = async () => ({ ok: false, reason: "cancelled" })
    const view = await mount(control, locale)
    try {
      await wait(() => view.text().includes(item().title), "exportable record")
      view.button(view.words.export).click()
      await wait(() => control.state.calls.length === 1, "cancelled public export")
      await wait(() => control.state.settledActions === 1, "native export cancellation settled")
      await Bun.sleep(0)
      expect(control.state.calls).toEqual([{ action: "export", args: [item().id] }])
      expect(view.text()).toContain(item().title)
      expect(view.errors()).toBe("")
    } finally { view.dispose() }
  })

  test(`M13 recovery ${locale}: Finish success refreshes metadata without inventing remote completion`, async () => {
    const control = controlled()
    const refreshed = Promise.withResolvers<LiveRecoverySnapshot>()
    const view = await mount(control, locale)
    try {
      await wait(() => view.text().includes(item().title), "record before local Finish")
      const before = control.state.reads
      control.reads.next = () => refreshed.promise
      view.button(view.words.finish).click()
      await wait(() => control.state.calls.some((call) => call.action === "finish"), "local Finish call")
      expect(control.state.calls).toEqual([{ action: "finish", args: [item().id] }])
      await wait(() => control.state.reads > before, "fresh snapshot after Finish acceptance")
      expect(view.text()).toContain(item().title)
      expect(view.leaves().some((text) => view.words.delivered.test(text))).toBe(false)
      refreshed.resolve(snapshot({ items: [item({ title: "Still pending after local Finish", closeRequested: true, sealed: true })] }))
      await wait(() => view.text().includes("Still pending after local Finish"), "authoritative Finish snapshot applied")
      expect(view.text()).toContain("Still pending after local Finish")
      expect(view.text()).toMatch(view.words.pending)
      expect(view.leaves().some((text) => view.words.delivered.test(text))).toBe(false)
    } finally {
      refreshed.resolve(snapshot())
      view.dispose()
    }
  })

  test(`M13 recovery ${locale}: Discard requires local-only confirmation and Cancel sends nothing`, async () => {
    const control = controlled()
    const view = await mount(control, locale)
    try {
      await wait(() => view.text().includes(item().title), "discardable recovery item")
      view.button(view.words.discard).click()
      await wait(() => view.dialog() !== null, "explicit local-data confirmation")
      const dialog = view.dialog()!
      expect(dialog.textContent).toMatch(view.words.localOnly)
      expect(dialog.textContent).toMatch(view.words.remoteUnchanged)
      expect(control.state.calls).toEqual([])
      view.button(view.words.cancel, dialog).click()
      await wait(() => view.dialog() === null, "cancelled confirmation closed")
      expect(control.state.calls).toEqual([])
      expect(view.text()).toContain(item().title)
      view.button(view.words.discard).click()
      await wait(() => view.dialog() !== null, "second explicit confirmation")
      view.button(view.words.discard, view.dialog()!).click()
      await wait(() => control.state.calls.length === 1, "confirmed local discard")
      expect(control.state.calls).toEqual([{ action: "discard", args: [item().id] }])
    } finally { view.dispose() }
  })

  test(`M13 recovery ${locale}: a refresh failure retains the last items and reports the error`, async () => {
    const control = controlled()
    const view = await mount(control, locale)
    try {
      await wait(() => view.text().includes(item().title), "last known item")
      control.reads.next = async () => { throw new Error("private native recovery diagnostic") }
      view.focus()
      await wait(() => view.errors().length > 0, "visible snapshot failure")
      expect(view.text()).toContain(item().title)
      expect(view.leaves().some((text) => view.words.delivered.test(text))).toBe(false)
      expect(view.errors()).not.toContain("private native recovery diagnostic")
    } finally { view.dispose() }
  })

  for (const failure of ["refused", "rejected"] as const) {
    test(`M13 recovery ${locale}: ${failure} action keeps the saved item and reports failure`, async () => {
      const control = controlled()
      control.actions.retry = async () => {
        if (failure === "rejected") throw new Error("private native action diagnostic")
        return { ok: false, reason: "offline" }
      }
      const view = await mount(control, locale)
      try {
        await wait(() => view.text().includes(item().title), "record before failed action")
        view.button(view.words.retry).click()
        await wait(() => view.errors().length > 0, "visible action failure")
        expect(control.state.calls).toEqual([{ action: "retry", args: [item().id] }])
        expect(view.text()).toContain(item().title)
        expect(view.errors()).not.toContain("private native action diagnostic")
        expect(view.leaves().some((text) => view.words.delivered.test(text))).toBe(false)
      } finally { view.dispose() }
    })
  }

  // Real elapsed intervals verify ownership; there is no fake clock or replacement of window timer functions.
  test(`M13 recovery ${locale}: the mounted one-second refresh runs, then stops on unmount`, async () => {
    const control = controlled()
    const view = await mount(control, locale)
    try {
      await wait(() => view.text().includes(item().title), "initial timer-owned read")
      const before = control.state.reads
      control.state.value = snapshot({ items: [item({ title: "Timer refreshed meeting" })] })
      await wait(() => view.text().includes("Timer refreshed meeting"), "actual mounted timer refresh", 3000)
      expect(control.state.reads).toBeGreaterThan(before)
      view.unmount()
      const stopped = control.state.reads
      view.focus()
      await Bun.sleep(1200)
      expect(control.state.reads).toBe(stopped)
      expect(control.state.maximumReads).toBe(1)
    } finally { view.dispose() }
  }, 10_000)

  for (const late of ["resolved", "rejected"] as const) {
    test(`M13 recovery ${locale}: timer and focus coalesce; late ${late} snapshot is ignored after unmount`, async () => {
      const control = controlled()
      const held = Promise.withResolvers<LiveRecoverySnapshot>()
      control.reads.next = () => held.promise
      const view = await mount(control, locale)
      try {
        await wait(() => control.state.reads === 1, "held actual component read")
        view.focus()
        view.focus()
        await Bun.sleep(1200)
        expect(control.state.reads).toBe(1)
        expect(control.state.maximumReads).toBe(1)
        view.unmount()
        if (late === "resolved") held.resolve(snapshot({ items: [item({ title: "Late snapshot must stay invisible" })] }))
        if (late === "rejected") held.reject(new Error("late native snapshot failure"))
        await wait(() => control.state.activeReads === 0, "late public read settled")
        await Bun.sleep(0)
        expect(view.text()).not.toContain("Late snapshot must stay invisible")
        expect(view.errors()).toBe("")
        view.focus()
        await Bun.sleep(1200)
        expect(control.state.reads).toBe(1)
      } finally {
        held.resolve(snapshot())
        view.dispose()
      }
    }, 10_000)
  }

  test(`M13 recovery ${locale}: an action rejection after unmount cannot report or refresh a disposed view`, async () => {
    const control = controlled()
    const held = Promise.withResolvers<LiveRecoveryAction>()
    control.actions.retry = () => held.promise
    const view = await mount(control, locale)
    try {
      await wait(() => view.text().includes(item().title), "record before held action")
      view.button(view.words.retry).click()
      await wait(() => control.state.calls.length === 1, "in-flight action")
      view.unmount()
      const stopped = control.state.reads
      held.reject(new Error("late recovery failure"))
      await wait(() => control.state.settledActions === 1, "late public action settled")
      await Bun.sleep(0)
      expect(view.errors()).toBe("")
      expect(control.state.reads).toBe(stopped)
      expect(view.text()).not.toContain(item().title)
    } finally {
      held.resolve({ ok: true })
      view.dispose()
    }
  })
}
