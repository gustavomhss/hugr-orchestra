import { expect, test } from "@playwright/test"
import { attachImage, editor, evidenceFixture, evidencePage, runCard } from "./evidence.fixture"
import { directory, partUpdated, sessionID, status, toolPart } from "../performance/timeline-stability/fixture"

test.setTimeout(120_000)

test("replay confirms exact command, preserves draft and attachment, and creates a distinct run", async ({ page }) => {
  const fixture = await evidencePage(page)
  await editor(page).fill("Keep this draft")
  const image = await attachImage(page)
  await editor(page).focus()
  await editor(page).press("Home")
  await editor(page).press("ArrowRight")
  await editor(page).press("ArrowRight")
  await editor(page).press("ArrowRight")
  await editor(page).press("ArrowRight")
  await expect.poll(() => editor(page).evaluate(() => window.getSelection()?.anchorOffset)).toBe(4)
  const card = runCard(page)
  await card.getByRole("button", { name: "Run tests again…", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText(directory)
  await expect(dialog).toContainText("the earlier environment is not reproduced")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(editor(page)).toHaveText("Keep this draft")
  await editor(page).focus()
  await page.keyboard.insertText("X")
  await expect(editor(page)).toHaveText("KeepX this draft")
  expect(fixture.writes).toEqual([])

  const pending = Promise.withResolvers<void>()
  await page.route("**/api/session/*/shell", async (route) => {
    await pending.promise
    await route.fulfill({ status: 204 })
  })
  await card.getByRole("button", { name: "Run tests again…", exact: true }).click()
  await dialog.getByRole("button", { name: "Run command", exact: true }).dblclick()
  await expect(dialog.getByRole("button", { name: "Sending…", exact: true })).toBeDisabled()
  await expect.poll(() => fixture.writes.length).toBe(1)
  expect(fixture.writes[0]!.url).toContain(`/session/${sessionID}/shell`)
  // V2 shell transport carries command/id; agent/model are session-owned. The
  // shared submit helper also passes the visible selection to the V1 adapter.
  expect(fixture.writes[0]!.body).toMatchObject({ command: "bun test" })
  expect(fixture.writes[0]!.body.id).toEqual(expect.any(String))
  expect(fixture.writes[0]!.body.id).not.toBe("prt_evidence")
  await page.screenshot({ path: test.info().outputPath("replay-confirmation.png") })
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await editor(page).fill("Newer draft edit")
  // Closing the dialog does not unlock the controller while transport is pending.
  await card.getByRole("button", { name: "Run tests again…", exact: true }).click()
  await expect(dialog.getByRole("button", { name: "Run command", exact: true })).toBeDisabled()
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await card.getByRole("button", { name: "Prepare pull request…", exact: true }).click()
  await expect(dialog).toContainText("Add to your draft?")
  const response = page.waitForResponse((value) => value.url().endsWith(`/session/${sessionID}/shell`))
  pending.resolve()
  await response
  const output = await evidenceFixture("bun-pass")
  await fixture.transport.send({
    id: "evt_replay_started",
    type: "session.shell.started",
    created: 1700000004000,
    location: { directory },
    data: { sessionID, shell: { id: "shl_replay", command: "bun test", status: "running" } },
  })
  await fixture.transport.send({
    id: "evt_replay_ended",
    type: "session.shell.ended",
    created: 1700000005000,
    location: { directory },
    data: {
      sessionID,
      shell: { id: "shl_replay", command: "bun test", status: "exited", exit: 0 },
      output: { output, truncated: false, cursor: 0, size: output.length },
    },
  })
  await expect(page.locator('[data-orchestra-evidence][data-part-id="msg_replay_started:tool"]')).toHaveAttribute(
    "data-state",
    "passed",
  )
  await expect(page.locator('[data-orchestra-evidence][data-part-id="prt_evidence"]')).toHaveAttribute(
    "data-state",
    "passed",
  )
  await expect(dialog).toContainText("Add to your draft?")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(editor(page)).toHaveText("Newer draft edit")
  await expect(page.getByAltText("evidence.png", { exact: true })).toHaveAttribute("src", image!)
  expect(fixture.writes).toHaveLength(1)
})

test("busy state is rechecked after confirmation opens", async ({ page }) => {
  const fixture = await evidencePage(page, { protocol: "v1" })
  await runCard(page).getByRole("button", { name: "Run tests again…", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("button", { name: "Run command", exact: true })).toBeEnabled()
  await fixture.send(status("busy"))
  await expect(dialog).toContainText("This session is working")
  await expect(dialog.getByRole("button", { name: "Run command", exact: true })).toBeDisabled()
  await fixture.send(status("idle"))
  await expect(dialog.getByRole("button", { name: "Run command", exact: true })).toBeEnabled()
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  expect(fixture.writes).toEqual([])
})

for (const workdir of ["/other/workspace", "packages/app", ""]) {
  test(`replay refuses unsupported working directory ${JSON.stringify(workdir)}`, async ({ page }) => {
    const fixture = await evidencePage(page, { workdir })
    await runCard(page).getByRole("button", { name: "Run tests again…", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText("different working directory")
    await expect(dialog.getByRole("button", { name: "Run command", exact: true })).toBeDisabled()
    await expect(dialog.getByRole("button", { name: "Copy command", exact: true })).toBeEnabled()
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    expect(fixture.writes).toEqual([])
  })
}

for (const entry of [
  { name: "distinct POSIX backslash", directory: "/repo/a/b", workdir: "/repo/a\\b", allowed: false },
  { name: "backslash-relative POSIX", directory: "/repo/a/b", workdir: "\\repo\\a\\b", allowed: false },
  { name: "matching POSIX", directory: "/repo/a/b", workdir: "/repo/a/b/", allowed: true },
  { name: "matching Windows drive root", directory, workdir: "C:\\Orchestra\\TimelineStability\\", allowed: true },
  { name: "UNC root distinction", directory: "//server/share/repo", workdir: "/server/share/repo", allowed: false },
  { name: "UNC different share", directory: "//server/share/repo", workdir: "//server/other/repo", allowed: false },
  { name: "parent traversal", directory: "/repo", workdir: "/repo/link/..", allowed: false },
  { name: "literal current directory", directory: "/repo", workdir: ".", allowed: true },
]) {
  test(`replay validates path identity: ${entry.name}`, async ({ page }) => {
    const fixture = await evidencePage(page, entry)
    await editor(page).fill("Preserve this draft")
    await runCard(page).getByRole("button", { name: "Run tests again…", exact: true }).click()
    const dialog = page.getByRole("dialog")
    const confirm = dialog.getByRole("button", { name: "Run command", exact: true })
    await expect(dialog.getByText(entry.workdir, { exact: true })).toBeVisible()
    if (!entry.allowed) {
      await expect(confirm).toBeDisabled()
      await expect(dialog).toContainText("different working directory")
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
      await expect(editor(page)).toHaveText("Preserve this draft")
      expect(fixture.writes).toEqual([])
      return
    }
    await expect(confirm).toBeEnabled()
    const response = page.waitForResponse((value) => value.url().endsWith(`/session/${sessionID}/shell`))
    await confirm.click()
    await response
    await expect(dialog).toHaveCount(0)
    await expect(editor(page)).toHaveText("Preserve this draft")
    expect(fixture.writes).toHaveLength(1)
    expect(fixture.writes[0]!.body.command).toBe("bun test")
    expect(fixture.writes[0]!.body).not.toHaveProperty("workdir")
  })
}

test("uncertain replay response remains visible without retry or draft loss", async ({ page }) => {
  const fixture = await evidencePage(page)
  await editor(page).fill("Keep after failure")
  const image = await attachImage(page)
  await page.route("**/api/session/*/shell", (route) =>
    route.fulfill({ status: 503, json: { message: "Connection lost" } }),
  )
  await runCard(page).getByRole("button", { name: "Run tests again…", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: "Run command", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("Request state unknown")
  await expect(dialog.getByRole("button", { name: "Run command", exact: true })).toBeDisabled()
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(editor(page)).toHaveText("Keep after failure")
  await expect(page.getByAltText("evidence.png", { exact: true })).toHaveAttribute("src", image!)
  expect(fixture.writes).toHaveLength(1)
})

test("confirmation captures command instead of replaying a later part revision", async ({ page }) => {
  const fixture = await evidencePage(page, { protocol: "v1" })
  await runCard(page).getByRole("button", { name: "Run tests again…", exact: true }).click()
  await fixture.send(
    partUpdated(
      toolPart(
        "prt_evidence",
        "bash",
        "completed",
        { command: "bun test changed" },
        { output: await evidenceFixture("bun-pass"), metadata: { exit: 0, truncated: false } },
      ),
    ),
  )
  await expect(page.getByRole("dialog").locator("code")).toHaveText("bun test")
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(runCard(page, "bun test changed")).toBeVisible()
  expect(fixture.writes).toEqual([])
})

for (const action of ["Run tests again…", "Prepare pull request…"]) {
  test(`session switch invalidates captured ${action} confirmation`, async ({ page }) => {
    const fixture = await evidencePage(page)
    await editor(page).fill("Draft owned by A")
    await runCard(page).getByRole("button", { name: action, exact: true }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.evaluate(() => {
      history.pushState(null, "", location.pathname.replace(/\/session\/[^/]+$/, "/session/ses_other"))
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    await expect(page.getByRole("heading", { name: "Other session", exact: true })).toBeVisible()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(editor(page)).toBeEmpty()
    expect(fixture.writes).toEqual([])
    await page.evaluate((sessionID) => {
      history.pushState(null, "", location.pathname.replace(/\/session\/[^/]+$/, `/session/${sessionID}`))
      window.dispatchEvent(new PopStateEvent("popstate"))
    }, sessionID)
    await expect(editor(page)).toHaveText("Draft owned by A")
  })
}

test("switching server with the same session ID cancels captured replay", async ({ page }) => {
  const secondServer = "http://127.0.0.1:49192"
  const fixture = await evidencePage(page, { secondServer })
  await editor(page).fill("First server draft")
  const firstURL = page.url()
  await runCard(page).getByRole("button", { name: "Run tests again…", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  const target = `/server/${Buffer.from(secondServer).toString("base64url")}/session/${sessionID}`
  await page.evaluate((target) => {
    history.pushState(null, "", target)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }, target)
  await expect(page).toHaveURL(new RegExp(target + "$"))
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(editor(page)).toBeEmpty()
  expect(fixture.writes).toEqual([])
  await page.evaluate((target) => {
    history.pushState(null, "", target)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }, firstURL)
  await expect(editor(page)).toHaveText("First server draft")
})

test("prepare PR uses real session summary and remains unsent", async ({ page }) => {
  const fixture = await evidencePage(page, { protocol: "v1" })
  await page.getByRole("button", { name: "Toggle review", exact: true }).click()
  await expect(page.locator("#review-panel")).toContainText("approval.ts")
  await runCard(page).getByRole("button", { name: "Prepare pull request…", exact: true }).click()
  await expect(editor(page)).toContainText("Prepare a pull request for the changes in this session.")
  await expect(editor(page)).toContainText("Loaded review — files: 1 (+10 −3)")
  await expect(editor(page)).toContainText("Changed files: src/approval.ts")
  await expect(editor(page)).toContainText("Branch: main")
  await expect(editor(page)).toContainText("Selected test run: `bun test`")
  await expect(editor(page)).toContainText("ask me to confirm before any commit, push or publication")
  await expect(editor(page)).toBeFocused()
  await page.screenshot({ path: test.info().outputPath("prepare-pr-unsent.png") })
  expect(fixture.writes).toEqual([])
})

test("prepare PR asks before append and preserves attachments and later draft edits", async ({ page }) => {
  const fixture = await evidencePage(page)
  await editor(page).fill("Existing draft")
  const image = await attachImage(page)
  const prepare = runCard(page).getByRole("button", { name: "Prepare pull request…", exact: true })
  await prepare.click()
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(editor(page)).toHaveText("Existing draft")
  await prepare.click()
  // Simulate an already-dispatched editor input arriving while the modal is open.
  // This exercises the real editor/prompt store, not a replacement action implementation.
  await page.getByRole("textbox", { name: "Prompt", exact: true, includeHidden: true }).evaluate((element) => {
    element.textContent = "Newer draft edit"
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "Newer draft edit" }))
  })
  await page.getByRole("dialog").getByRole("button", { name: "Add to draft", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(editor(page)).toContainText("Newer draft edit")
  await expect(editor(page)).toContainText("Prepare a pull request")
  await expect(page.getByAltText("evidence.png", { exact: true })).toHaveAttribute("src", image!)
  expect(fixture.writes).toEqual([])
})
