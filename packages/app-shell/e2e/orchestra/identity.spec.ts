import { expect, test, type Locator } from "@playwright/test"
import type { GlobalEvent } from "@orchestra/sdk/v2/client"
import {
  completedAssistantInfo,
  directory,
  messageUpdated,
  project,
  sessionID,
  status,
  title,
} from "../performance/timeline-stability/fixture"
import { setupIdentity } from "./identity.fixture"

// Frozen approved app.html values, normalized by Chromium's computed-style engine.
const glass = {
  dark: {
    backgroundImage:
      "linear-gradient(rgba(26, 36, 48, 0.5) 0%, rgba(13, 19, 26, 0.46) 46%, rgba(10, 15, 21, 0.54) 100%)",
    backdropFilter: "blur(8px) brightness(0.74) saturate(0.9)",
    borderTopColor: "rgba(160, 179, 197, 0.16)",
    boxShadow:
      "rgba(214, 231, 247, 0.08) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.3) 0px -1px 0px 0px inset, rgba(0, 0, 0, 0.4) 0px 1px 2px 0px, rgba(0, 0, 0, 0.2) 0px 4px 12px 0px",
  },
  light: {
    backgroundImage:
      "linear-gradient(rgba(255, 255, 255, 0.62) 0%, rgba(248, 250, 252, 0.5) 46%, rgba(240, 244, 247, 0.6) 100%)",
    backdropFilter: "blur(16px) brightness(1.04) saturate(0.96)",
    borderTopColor: "rgba(70, 84, 98, 0.16)",
    boxShadow:
      "rgba(255, 255, 255, 0.95) 0px 1px 0px 0px inset, rgba(120, 136, 152, 0.14) 0px -1px 0px 0px inset, rgba(38, 50, 64, 0.14) 0px 1px 2px 0px, rgba(38, 50, 64, 0.08) 0px 4px 12px 0px",
  },
}

const mutation = process.env.ORCHESTRA_IDENTITY_MUTATION
if (
  mutation &&
  ![
    "sidebar-width",
    "toolbar-height",
    "workspace-gap",
    "glass",
    "profile-menu-down",
    "running-motion",
    "waiting-motion",
    "reduced-motion",
  ].includes(mutation)
) {
  throw new Error(`Unknown Orchestra identity mutation: ${mutation}`)
}

// The expanded identity oracle stays above the compact-navigation breakpoint.
// Dedicated navigation cases verify the 230px-to-1280px and 56px responsive modes.
const viewport = { width: 1672, height: 941 }
test.use({ viewport, deviceScaleFactor: 1, serviceWorkers: "block" })

for (const scheme of ["dark", "light"] as const) {
  for (const locale of ["en", "ar"] as const) {
    test(`${scheme} ${locale}: frozen glass, 230/45/6 geometry, and upward profile portal`, async ({
      page,
    }, testInfo) => {
      await setupIdentity(page, { scheme, locale, viewport })
      const sidebar = page.locator('[data-component="orchestra-sidebar"]')
      const profile = page.locator('[data-slot="orchestra-profile"]')
      const toolbar = page.locator('[data-slot="titlebar-v2"]')
      const tabs = page.locator("#orchestra-session-tabs")
      const active = tabs.locator('[data-titlebar-tab][data-active="true"]')
      for (const locator of [sidebar, profile, toolbar, tabs, active]) {
        await expect(locator).toHaveCount(1)
        await expect(locator).toBeVisible()
      }
      await expect(active.locator('[data-slot="tab-title"]')).toHaveText(title)
      await expect(sidebar).toContainText("Human Guardrail")
      await expect(profile).toContainText(project().name)

      if (mutation === "sidebar-width")
        await sidebar.evaluate((element) =>
          (element as HTMLElement).style.setProperty("inline-size", "231px", "important"),
        )
      if (mutation === "toolbar-height")
        await toolbar.evaluate((element) => {
          ;(element as HTMLElement).style.setProperty("height", "46px", "important")
          ;(element as HTMLElement).style.setProperty("flex-basis", "46px", "important")
        })
      if (mutation === "workspace-gap")
        await sidebar.evaluate((element) => element.parentElement!.style.setProperty("gap", "7px", "important"))
      if (mutation === "glass")
        await active.evaluate((element) =>
          (element as HTMLElement).style.setProperty("backdrop-filter", "none", "important"),
        )

      const sidebarBox = await readBox(sidebar)
      const toolbarBox = await readBox(toolbar)
      const tabsBox = await readBox(tabs)
      const workspace = await sidebar.evaluate((element) => {
        if (!element.parentElement) throw new Error("Orchestra sidebar has no workspace parent")
        const style = getComputedStyle(element.parentElement)
        const box = element.parentElement.getBoundingClientRect()
        return {
          gap: [style.columnGap, style.rowGap],
          padding: [style.paddingInlineStart, style.paddingInlineEnd, style.paddingBlockStart, style.paddingBlockEnd],
          left: box.left + parseFloat(style.borderLeftWidth),
          right: box.right - parseFloat(style.borderRightWidth),
        }
      })
      expectPixels(sidebarBox.width, 230, "sidebar width")
      expectPixels(toolbarBox.height, 45, "toolbar height")
      expect(workspace.gap, "workspace gutter").toEqual(["6px", "6px"])
      expect(workspace.padding, "workspace padding").toEqual(["6px", "6px", "6px", "6px"])
      expect(tabsBox.top, "session tabs below toolbar").toBeGreaterThanOrEqual(toolbarBox.bottom)
      expectPixels(
        locale === "ar" ? sidebarBox.left - tabsBox.right : tabsBox.left - sidebarBox.right,
        6,
        "sidebar-to-session gutter",
      )
      expectPixels(
        locale === "ar" ? tabsBox.left - workspace.left : workspace.right - tabsBox.right,
        6,
        "session strip spans remaining workspace",
      )
      for (const locator of [sidebar, tabs]) expectGlass(await readPlatedGlass(locator), glass[scheme])
      expectGlass(await readGlass(active), glass[scheme])
      await expect(sidebar).toHaveCSS("border-radius", "9px")
      await expect(tabs).toHaveCSS("border-radius", "9px")

      const profileBox = await readBox(profile)
      expect(profileBox.bottom, "repository picker stays near sidebar bottom").toBeGreaterThan(sidebarBox.bottom - 180)
      await profile.click()
      await expect(profile).toHaveAttribute("aria-expanded", "true")
      const controls = await profile.getAttribute("aria-controls")
      expect(controls, "profile portal must have a controlled content ID").toBeTruthy()
      const menu = page.locator(`[id=${JSON.stringify(controls)}]`)
      await expect(menu).toHaveCount(1)
      await expect(menu).toBeVisible()
      await expect(menu.getByText(project().name, { exact: true })).toHaveCount(1)
      expect(
        await menu.evaluate((element) => !!element.closest('[data-component="orchestra-sidebar"]')),
        "profile menu must escape sidebar clipping through a portal",
      ).toBe(false)
      if (mutation === "profile-menu-down")
        await menu.evaluate((element) =>
          (element as HTMLElement).style.setProperty("transform", "translateY(100vh)", "important"),
        )
      await expect
        .poll(async () => (await readBox(menu)).bottom, { message: "profile menu opens upward" })
        .toBeLessThanOrEqual(profileBox.top)
      const menuBox = await readBox(menu)
      expect(menuBox.top, "profile menu stays within viewport").toBeGreaterThanOrEqual(0)
      expect(menuBox.left).toBeGreaterThanOrEqual(0)
      expect(menuBox.right).toBeLessThanOrEqual(viewport.width)
      expect(menuBox.height, "profile menu is nonempty").toBeGreaterThan(0)
      await page.keyboard.press("Escape")
      await expect(profile).toHaveAttribute("aria-expanded", "false")
      await profile.focus()
      await expect(profile).toBeFocused()
      await page.evaluate(() => document.fonts.ready)
      await testInfo.attach(`${scheme}-${locale}-identity`, {
        body: await page.screenshot({ animations: "disabled" }),
        contentType: "image/png",
      })
    })
  }

  for (const reducedMotion of [false, true]) {
    test(`${scheme}: model running/waiting/idle motion, reduced=${reducedMotion}`, async ({ page }) => {
      const timeline = await setupIdentity(page, { scheme, running: true, viewport })
      const active = page.locator('#orchestra-session-tabs [data-titlebar-tab][data-active="true"]')
      await expect(active).toHaveCount(1)
      const activity = active.locator("[data-activity]")
      await expect(activity).toHaveCount(1)
      await expect(activity).toHaveAttribute("data-activity", "running")
      await expect(activity).toHaveAttribute("data-logo", "openai")
      await expect(activity).toHaveAttribute("data-source", "manufacturer")
      await expect(activity).toHaveAttribute("aria-label", /gpt-5/)
      const logo = activity.locator("svg, img")
      await expect(logo).toHaveCount(1)
      await expect(logo).toBeVisible()
      if (mutation === "running-motion")
        await logo.evaluate((element) => (element as HTMLElement).style.setProperty("animation", "none", "important"))
      const running = await readMotion(logo)
      expectAnimated(running, 2400, "running model pulse")
      expect(Math.min(...running.frames.map((frame) => frame.scaleY)), "pulse contracts").toBeLessThan(1)
      expect(Math.max(...running.frames.map((frame) => frame.scaleY)), "pulse expands").toBeGreaterThan(1)
      expect(Math.min(...running.frames.map((frame) => frame.opacity)), "pulse changes opacity").toBeLessThan(1)

      // This is a real pending permission event, not a manually assigned activity label.
      await timeline.transport.writeRaw(`data: ${JSON.stringify(permissionAsked())}\n\n`)
      const permission = page.locator('[data-component="dock-prompt"][data-kind="permission"]')
      await expect(permission).toBeVisible()
      await expect(permission.getByText("git status", { exact: true })).toBeVisible()
      await expect(activity).toHaveAttribute("data-activity", "waiting")
      if (mutation === "waiting-motion")
        await logo.evaluate((element) => (element as HTMLElement).style.setProperty("animation", "none", "important"))
      const waiting = await readMotion(logo)
      expectAnimated(waiting, 1150, "human-wait model bounce")
      expect(
        Math.min(...waiting.frames.map((frame) => frame.y)),
        "bounce rises above its baseline",
      ).toBeLessThanOrEqual(-8)
      expect(Math.max(...waiting.frames.map((frame) => frame.y)), "bounce has a landing").toBeGreaterThanOrEqual(3)
      expect(Math.min(...waiting.frames.map((frame) => frame.scaleY)), "landing squashes").toBeLessThan(1)
      const shadow = await activity.evaluate((element) => {
        const style = getComputedStyle(element, "::after")
        return { content: style.content, name: style.animationName, duration: style.animationDuration }
      })
      expect(shadow.content, "human-wait impact shadow exists").not.toBe("none")
      expect(shadow.name).not.toBe("none")
      expect(shadow.duration).toBe("1.15s")

      if (reducedMotion) {
        await page.emulateMedia({ reducedMotion: "reduce" })
        expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true)
        if (mutation === "reduced-motion")
          await logo.evaluate((element) =>
            element.animate([{ transform: "translateY(0px)" }, { transform: "translateY(-8px)" }], {
              duration: 1150,
              iterations: Infinity,
            }),
          )
        await expect
          .poll(async () => (await readMotion(logo)).running, { message: "reduced motion suppresses model animation" })
          .toBe(0)
        await expect(logo).toHaveCSS("animation-name", "none")
        await expect
          .poll(() => activity.evaluate((element) => getComputedStyle(element, "::after").animationName))
          .toBe("none")
      }

      const reply = page.waitForRequest(
        (request) =>
          request.method() === "POST" &&
          /\/permission(?:\/per_orchestra_identity\/reply|s\/per_orchestra_identity)$/.test(
            new URL(request.url()).pathname,
          ),
      )
      await permission.getByRole("button", { name: "Allow once", exact: true }).click()
      const request = await reply
      expect(new URL(request.url()).pathname).toBe(`/session/${sessionID}/permissions/per_orchestra_identity`)
      expect(request.postDataJSON()).toEqual({ response: "once" })
      await timeline.transport.writeRaw(`data: ${JSON.stringify(permissionReplied())}\n\n`)
      await expect(permission).toHaveCount(0)
      await timeline.send(status("busy"))
      await expect(activity).toHaveAttribute("data-activity", "running")
      if (reducedMotion) {
        await expect(logo).toHaveCSS("animation-name", "none")
        expect((await readMotion(logo)).running, "reduced-motion running model stays static").toBe(0)
      }
      await timeline.send(messageUpdated(completedAssistantInfo(timeline.assistant.info)))
      await timeline.send(status("idle"))
      await expect(activity).toHaveAttribute("data-activity", "idle")
      await expect(logo).toHaveCSS("animation-name", "none")
      expect((await readMotion(logo)).running, "idle model stays static").toBe(0)
    })
  }
}

test("graphite: a palette recolors the glass and keeps the frozen geometry, radius and blur", async ({ page }) => {
  await setupIdentity(page, { scheme: "dark", palette: "graphite", viewport })
  await expect(page.locator("html")).toHaveAttribute("data-orchestra-palette", "graphite")
  const sidebar = page.locator('[data-component="orchestra-sidebar"]')
  const toolbar = page.locator('[data-slot="titlebar-v2"]')
  const tabs = page.locator("#orchestra-session-tabs")
  const active = tabs.locator('[data-titlebar-tab][data-active="true"]')
  for (const locator of [sidebar, toolbar, tabs, active]) await expect(locator).toBeVisible()
  expectPixels((await readBox(sidebar)).width, 230, "sidebar width")
  expectPixels((await readBox(toolbar)).height, 45, "toolbar height")
  for (const value of [await readPlatedGlass(sidebar), await readPlatedGlass(tabs), await readGlass(active)]) {
    expect(value.backdropFilter, "palette keeps the glass blur").toBe(glass.dark.backdropFilter)
    expect(value.backgroundImage, "palette tints the glass").toMatch(/^linear-gradient\(/)
    expect(value.backgroundImage, "palette tints the glass").not.toBe(glass.dark.backgroundImage)
    expect(value.borderTopColor, "palette tints the glass border").not.toBe(glass.dark.borderTopColor)
  }
  await expect(sidebar).toHaveCSS("border-radius", "9px")
  await expect(tabs).toHaveCSS("border-radius", "9px")
})

test("oracle calibration: real production toolbar rejects geometry and glass mutations", async ({ page }) => {
  await setupIdentity(page, { scheme: "dark", viewport })
  const toolbar = page.locator('[data-slot="titlebar-v2"]')
  await expect(toolbar).toHaveCount(1)
  await expect(toolbar).toBeVisible()
  const original = await toolbar.getAttribute("style")
  const before = await readBox(toolbar)
  const fingerprint = await readGlass(toolbar)
  expect(before.width).toBeGreaterThan(0)
  expect(before.height).toBeGreaterThan(0)
  expectPixels((await readBox(toolbar)).height, before.height, "toolbar height")
  expectGlass(await readGlass(toolbar), fingerprint)
  await toolbar.evaluate((element, height) => {
    ;(element as HTMLElement).style.setProperty("height", `${height + 1}px`, "important")
    ;(element as HTMLElement).style.setProperty("flex-basis", `${height + 1}px`, "important")
  }, before.height)
  const changed = await readBox(toolbar)
  expectPixels(changed.height, before.height + 1, "mutation applied to real toolbar")
  expect(() => expectPixels(changed.height, before.height, "toolbar height")).toThrow(/toolbar height/)
  await toolbar.evaluate((element) =>
    (element as HTMLElement).style.setProperty(
      "background-image",
      "linear-gradient(rgb(1, 2, 3), rgb(4, 5, 6))",
      "important",
    ),
  )
  const changedGlass = await readGlass(toolbar)
  expect(changedGlass.backgroundImage).not.toBe(fingerprint.backgroundImage)
  expect(() => expectGlass(changedGlass, fingerprint)).toThrow(/glass fingerprint/)
  await toolbar.evaluate((element, original) => {
    if (original !== null) return element.setAttribute("style", original)
    element.removeAttribute("style")
  }, original)
  expectPixels((await readBox(toolbar)).height, before.height, "toolbar height")
  expectGlass(await readGlass(toolbar), fingerprint)
})

test("fixture calibration: pending permission traverses the real reducer and dock", async ({ page }) => {
  const timeline = await setupIdentity(page, { scheme: "dark", running: true, viewport })
  await timeline.transport.writeRaw(`data: ${JSON.stringify(permissionAsked())}\n\n`)
  const permission = page.locator('[data-component="dock-prompt"][data-kind="permission"]')
  await expect(permission).toHaveCount(1)
  await expect(permission.getByText("git status", { exact: true })).toBeVisible()
  await timeline.transport.writeRaw(`data: ${JSON.stringify(permissionReplied())}\n\n`)
  await expect(permission).toHaveCount(0)
  await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toBeEditable()
})

function permissionAsked() {
  return {
    directory,
    payload: {
      id: "evt_orchestra_permission_asked",
      type: "permission.asked",
      properties: {
        id: "per_orchestra_identity",
        sessionID,
        permission: "bash",
        patterns: ["git status"],
        metadata: {},
        always: [],
      },
    },
  } satisfies GlobalEvent
}

function permissionReplied() {
  return {
    directory,
    payload: {
      id: "evt_orchestra_permission_replied",
      type: "permission.replied",
      properties: { sessionID, requestID: "per_orchestra_identity", reply: "once" },
    },
  } satisfies GlobalEvent
}

function readBox(locator: Locator) {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height }
  })
}

function expectPixels(actual: number, expected: number, label: string) {
  expect(Math.abs(actual - expected), label).toBeLessThanOrEqual(0.01)
}

function readGlass(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      backgroundImage: style.backgroundImage,
      backdropFilter: style.backdropFilter,
      borderTopColor: style.borderTopColor,
      boxShadow: style.boxShadow,
    }
  })
}

// The sidebar and the session tab strip draw their blur on a plate painted right under them (theme.css).
// The plate must cover exactly the glass's rounded box, and the glass keeps a no-op backdrop filter so
// it stays the backdrop root of the glass nested in it; the fingerprint then reads the plate's blur.
async function readPlatedGlass(locator: Locator) {
  const plate = locator.locator("xpath=preceding-sibling::*[1][@data-glass-plate]")
  await expect(plate, "glass plate right under the glass").toHaveCount(1)
  const box = await readBox(locator)
  const under = await readBox(plate)
  for (const edge of ["top", "right", "bottom", "left"] as const)
    expectPixels(under[edge], box[edge], `glass plate ${edge}`)
  await expect(plate).toHaveCSS(
    "border-radius",
    await locator.evaluate((element) => getComputedStyle(element).borderRadius),
  )
  const glass = await readGlass(locator)
  expect(glass.backdropFilter, "plated glass keeps a no-op backdrop root").toBe("brightness(1)")
  return { ...glass, backdropFilter: (await readGlass(plate)).backdropFilter }
}

function expectGlass(actual: Awaited<ReturnType<typeof readGlass>>, expected: Awaited<ReturnType<typeof readGlass>>) {
  expect(actual, "glass fingerprint").toEqual(expected)
}

function readMotion(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    const animations = element.getAnimations({ subtree: true })
    return {
      name: style.animationName,
      duration: parseFloat(style.animationDuration) * 1000,
      running: animations.filter((animation) => animation.playState === "running").length,
      frames: animations.flatMap((animation) =>
        animation.effect instanceof KeyframeEffect
          ? animation.effect.getKeyframes().map((frame) => {
              const matrix = new DOMMatrix(typeof frame.transform === "string" ? frame.transform : undefined)
              return { y: matrix.m42, scaleY: matrix.m22, opacity: Number(frame.opacity ?? 1) }
            })
          : [],
      ),
    }
  })
}

function expectAnimated(motion: Awaited<ReturnType<typeof readMotion>>, duration: number, label: string) {
  expect(motion.name, label).not.toBe("none")
  expect(motion.duration, `${label} duration`).toBe(duration)
  expect(motion.running, `${label} is active`).toBeGreaterThan(0)
  expect(motion.frames.length, `${label} has real keyframes`).toBeGreaterThan(1)
}
