import { expect, test } from "bun:test"
import { cachePath, complete, incomplete, mount, readPath, row, source, unread, until } from "./activity-docker-fixture"

const labels = ["Trees", "Worktrees", "Cache", "Docker", "Temporary", "Logs", "IN/OUT", "Quarantine"]
const manual = "Read containers"
const unreadText = "Container inventory has not been read."
const emptyText = "No containers in the last complete reading."
const rawSize = "7 kB (virtual 91 MB)"
const alpha = row("container-001", "fixture-alpha", rawSize)
const beta = row("container-002", "fixture-beta")
const text = (element: Element) => element.textContent?.trim() ?? ""
const rows = (panel: HTMLElement) => [...panel.querySelectorAll("tbody tr")]
const cells = (line: Element) => [...line.querySelectorAll("td")].map(text)
const headings = (panel: HTMLElement) => [...panel.querySelectorAll("th")].map(text)
function age(panel: HTMLElement, line: Element) {
  const seconds = cells(line)[headings(panel).indexOf("Age")]
  return Number.parseInt(seconds ?? "", 10)
}

test("A161/S16 uses the eight English tabs and leaves IN/OUT and Quarantine unavailable", async () => {
  const app = mount()
  try {
    expect(app.tabs().map(text)).toEqual(labels)
    for (const tab of ["IN/OUT", "Quarantine"]) {
      app.select(tab)
      expect(text(app.panel())).toContain(tab + ": collection unavailable")
      expect(app.panel().querySelectorAll("button, form, meter, progress")).toHaveLength(0)
    }
    expect(app.calls).toHaveLength(0)
  } finally {
    app.dispose()
  }
})

test("A02–A04/A162–A171/A176/A316 Docker mounts unread and Refresh uses only the cache GET", async () => {
  const app = mount()
  try {
    app.select("Docker")
    expect(text(app.panel())).toContain(unreadText)
    expect(text(app.panel())).toContain("Age: unread")
    expect(text(app.panel())).not.toContain(emptyText)
    await Bun.sleep(20)
    app.filter("nothing")
    expect(app.calls).toHaveLength(0)

    app.button("Refresh").click()
    ;(await app.call(0, "GET", cachePath)).respond(unread())
    await until("cache Refresh should finish", () => !app.button("Refresh").disabled)
    expect(text(app.panel())).toContain(unreadText)
    expect(text(app.panel())).toContain("Age: unread")
    expect(app.calls).toHaveLength(1)
  } finally {
    app.dispose()
  }
})

test("A01–A13/A83–A88/A152–A160/A216/A218/A345–A348 only manual POST reads and the tab shows server observations", async () => {
  const app = mount()
  try {
    app.select("Docker")
    app.button(manual).click()
    app.button(manual).click()
    const read = await app.call(0, "POST", readPath)
    expect(app.button(manual).disabled).toBe(true)
    expect(app.calls).toHaveLength(1)
    read.respond(complete("1", [alpha, beta]))
    await until("manual reading rows", () => rows(app.panel()).length === 2)

    const panel = app.panel()
    expect(headings(panel)).toEqual(["Container", "Owner", "Logical", "Unique", "Use check", "Age", "Reading"])
    for (const line of rows(panel)) {
      expect(cells(line).slice(1, 5)).toEqual(["", "unread", "não colapsei", "unproved"])
    }
    const detail = rows(panel)[0]?.querySelector("details")
    expect(detail).toBeDefined()
    expect(detail?.hasAttribute("open")).toBe(false)
    expect(text(detail!)).toContain("Docker size (reported): " + rawSize)
    expect(text(panel).split(rawSize)).toHaveLength(2)
    expect(text(rows(panel)[1]!.querySelector("details")!)).toContain("Docker size (reported): unread")
    expect(text(panel)).toContain(source)
    expect(age(panel, rows(panel)[0]!)).toBeGreaterThanOrEqual(2)
    expect([...panel.querySelectorAll("button")].map(text)).toEqual(["Refresh", manual])
    expect(panel.querySelectorAll("form, meter, progress, [role='progressbar'], [role='meter']")).toHaveLength(0)
    expect(text(panel)).not.toMatch(
      /\b(pressure|residence|frequency|reclaimable|remainder|bytes\/s|plan|model|manter|quarentena|mover)\b/i,
    )

    const calls = app.calls.length
    const startingAge = age(panel, rows(panel)[0]!)
    await until("local age tick advances a displayed sample", () => age(panel, rows(panel)[0]!) > startingAge)
    expect(app.calls).toHaveLength(calls)
    app.filter("FIXTURE-BETA")
    expect(
      rows(panel)
        .map((line) => cells(line)[0])
        .join(" "),
    ).toContain(beta.name!)
    expect(rows(panel)).toHaveLength(1)
    app.filter("container-001")
    expect(
      rows(panel)
        .map((line) => cells(line)[0])
        .join(" "),
    ).toContain(alpha.name!)
    expect(rows(panel)).toHaveLength(1)
    app.filter("missing")
    expect(text(panel)).toContain("No row matches this filter.")
    expect(text(panel)).not.toContain(emptyText)
    expect(app.calls).toHaveLength(calls)
  } finally {
    app.dispose()
  }
})

test("A172–A174/A219 errors without a sample stay unread while a complete zero-line response is empty", async () => {
  const app = mount()
  try {
    app.select("Docker")
    const attempts = [
      { state: "partial", gap: "stdout-truncated", label: "Partial" },
      { state: "failed", gap: "nonzero-exit", label: "Failed" },
      { state: "unavailable", gap: "executable-missing", label: "Unavailable" },
    ] as const
    for (const [index, attempt] of attempts.entries()) {
      app.button(manual).click()
      ;(await app.call(index, "POST", readPath)).respond(incomplete(String(index + 1), attempt.state, attempt.gap))
      await until(attempt.state + " status displayed", () => text(app.panel()).includes(attempt.label))
      expect(text(app.panel())).toContain(unreadText)
      expect(text(app.panel())).not.toContain(emptyText)
      expect(text(app.panel())).toContain("Age: unread")
      expect(rows(app.panel())).toHaveLength(0)
    }
    app.button(manual).click()
    ;(await app.call(3, "POST", readPath)).respond(complete("4", []))
    await until("confirmed empty inventory", () => text(app.panel()).includes(emptyText))
    expect(text(app.panel())).not.toContain(unreadText)
    expect(text(app.panel())).toContain("Complete")
    expect(rows(app.panel())).toHaveLength(0)
  } finally {
    app.dispose()
  }
})

test("A01/A162–A174/A219 unsuccessful retries retain rows and last complete age across process and HTTP failures", async () => {
  const app = mount()
  try {
    app.select("Docker")
    app.button(manual).click()
    const sample = complete("1", [alpha], { readAt: 11_000 })
    ;(await app.call(0, "POST", readPath)).respond(sample)
    await until("first last-complete inventory", () => rows(app.panel()).length === 1)
    const panel = app.panel()
    for (const [index, attempt] of [
      { state: "partial", gap: "stdout-truncated", label: "Partial", detail: "stdout truncated" },
      { state: "failed", gap: "nonzero-exit", label: "Failed", detail: "nonzero exit" },
      { state: "unavailable", gap: "executable-missing", label: "Unavailable", detail: "executable missing" },
    ].entries()) {
      app.button(manual).click()
      ;(await app.call(index + 1, "POST", readPath)).respond(
        incomplete(String(index + 2), attempt.state, attempt.gap, sample.inventory),
      )
      await until(attempt.state, () => text(panel).includes(attempt.label))
      expect(text(panel)).toContain(attempt.detail)
      expect(cells(rows(panel)[0]!)[0]).toContain(alpha.name!)
      expect(age(panel, rows(panel)[0]!)).toBeGreaterThanOrEqual(10)
      expect(text(panel)).not.toContain(emptyText)
    }
    app.button(manual).click()
    ;(await app.call(4, "POST", readPath)).respond(
      {
        _tag: "ServiceUnavailableError",
        message: "Fixture unavailable",
        service: "activity.docker",
      },
      503,
    )
    await until("transport failure alert", () => panel.querySelector("[role='alert']") !== null)
    expect(cells(rows(panel)[0]!)[0]).toContain(alpha.name!)
    expect(age(panel, rows(panel)[0]!)).toBeGreaterThanOrEqual(10)
    expect(text(panel)).not.toContain(emptyText)
    expect(app.calls).toHaveLength(5)
  } finally {
    app.dispose()
  }
})

test("Docker orders concurrent, older and equal revisions without resetting the sample age", async () => {
  const app = mount()
  try {
    app.select("Docker")
    app.button("Refresh").click()
    const pending = await app.call(0, "GET", cachePath)
    app.button(manual).click()
    ;(await app.call(1, "POST", readPath)).respond(complete("9007199254740993", [alpha], { readAt: 11_000 }))
    await until("latest inventory", () => text(app.panel()).includes(alpha.name!))
    pending.respond(complete("9007199254740992", [beta]))
    await until("older cache request settled", () => !app.button("Refresh").disabled)
    expect(text(app.panel())).not.toContain(beta.name!)

    await until("age advances before the equal revision", () => age(app.panel(), rows(app.panel())[0]!) >= 11)
    const localAge = age(app.panel(), rows(app.panel())[0]!)
    app.button("Refresh").click()
    ;(await app.call(2, "GET", cachePath)).respond(complete("9007199254740993", [beta], { readAt: 11_000 }))
    await until("equal cache request settled", () => !app.button("Refresh").disabled)
    expect(text(app.panel())).toContain(alpha.name!)
    expect(text(app.panel())).not.toContain(beta.name!)
    expect(age(app.panel(), rows(app.panel())[0]!)).toBeGreaterThanOrEqual(localAge)

    app.button("Refresh").click()
    ;(await app.call(3, "GET", cachePath)).respond(complete("9999999999999999", [beta]))
    await until("larger decimal revision rendered", () => text(app.panel()).includes(beta.name!))
    app.button("Refresh").click()
    ;(await app.call(4, "GET", cachePath)).respond(complete("10000000000000000", [alpha]))
    await until("cross-digit decimal revision rendered", () => text(app.panel()).includes(alpha.name!))
    expect(text(app.panel())).not.toContain(beta.name!)
    expect(app.calls).toHaveLength(5)
  } finally {
    app.dispose()
  }
})

test("Docker trusts a fresh cache handshake after an instance mismatch and fences the retired flight", async () => {
  const app = mount()
  try {
    app.select("Docker")
    app.button(manual).click()
    ;(await app.call(0, "POST", readPath)).respond(complete("9", [alpha]))
    await until("old instance read", () => text(app.panel()).includes(alpha.name!))

    app.button(manual).click()
    const retired = await app.call(1, "POST", readPath)
    app.button("Refresh").click()
    ;(await app.call(2, "GET", cachePath)).respond(complete("1", [beta], { instanceID: "monitor-b" }))
    const handshake = await app.call(3, "GET", cachePath)
    expect(retired.request.signal.aborted).toBe(true)
    expect(text(app.panel())).not.toContain(alpha.name!)
    expect(text(app.panel())).not.toContain(beta.name!)
    handshake.respond(unread("monitor-b"))
    await until("new instance handshake", () => !app.button("Refresh").disabled)
    retired.respond(complete("10", [alpha]))
    await Bun.sleep(20)
    expect(text(app.panel())).toContain(unreadText)
    expect(text(app.panel())).not.toContain(alpha.name!)
    expect(app.calls).toHaveLength(4)
  } finally {
    app.dispose()
  }
})

test("A09–A13/A153–A154 category and server changes abort old work and keep the new tab unread", async () => {
  const app = mount()
  try {
    app.select("Docker")
    app.button(manual).click()
    const category = await app.call(0, "POST", readPath)
    app.select("Quarantine")
    expect(category.request.signal.aborted).toBe(true)
    app.select("Docker")
    category.respond(complete("1", [alpha]))
    await Bun.sleep(20)
    expect(text(app.panel())).toContain(unreadText)
    expect(text(app.panel())).not.toContain(alpha.name!)

    app.button(manual).click()
    const oldServer = await app.call(1, "POST", readPath)
    app.switchServer("second")
    await until("request aborted after server switch", () => oldServer.request.signal.aborted)
    expect(text(app.panel())).toContain(unreadText)
    expect(app.calls).toHaveLength(2)
    app.button(manual).click()
    const active = await app.call(2, "POST", readPath)
    expect(active.url.hostname).toBe("second.test")
    active.respond(complete("1", [beta], { instanceID: "monitor-b" }))
    oldServer.respond(complete("2", [alpha]))
    await until("new server sample rendered", () => text(app.panel()).includes(beta.name!))
    expect(cells(rows(app.panel())[0]!).slice(1, 5)).toEqual(["", "unread", "não colapsei", "unproved"])
    expect(text(app.panel())).not.toContain(alpha.name!)
    expect(app.calls).toHaveLength(3)
  } finally {
    app.dispose()
  }
})

test("A83–A88/A153/A161/A216 Portuguese still displays the literal unique observation and English categories", async () => {
  const app = mount("br")
  try {
    app.select("Docker")
    await until("Portuguese read label", () =>
      [...app.panel().querySelectorAll("button")].some((button) => text(button) === "Ler contêineres"),
    )
    app.button("Ler contêineres").click()
    ;(await app.call(0, "POST", readPath)).respond(complete("1", [alpha]))
    await until("Portuguese Docker table", () => rows(app.panel()).length === 1)
    expect(headings(app.panel()).slice(1, 5)).toEqual(["Dono", "Lógico", "Único", "Verificação de uso"])
    expect(cells(rows(app.panel())[0]!).slice(1, 5)).toEqual(["", "não lido", "não colapsei", "não provado"])
    expect(app.tabs().map(text)).toEqual(labels)
  } finally {
    app.dispose()
  }
})
