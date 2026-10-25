import { base64Encode } from "@orchestra/core/util/encode"
import { expect, test, type Page } from "@playwright/test"
import {
  assistantMessage,
  directory,
  loadedPartID,
  messageUpdated,
  project,
  session,
  sessionID,
  status,
  textPart,
  title,
  userID,
  userMessage,
} from "../performance/timeline-stability/fixture"
import { mockOrchestraServer } from "../utils/mock-server"
import { installSseTransport } from "../utils/sse-transport"
import { expectSessionTitle } from "../utils/waits"

const initialPageSize = 20
const assistants = Array.from({ length: initialPageSize + 1 }, (_, index) =>
  assistantMessage([textPart(`prt_history_root_${index}`, `Assistant response ${index}`)], {
    id: `msg_${String(index + 1001).padStart(4, "0")}_history_root_assistant`,
    parentID: userID,
    created: 1700000001000 + index * 1_000,
    completed: index < initialPageSize,
  }),
)
const messages = [userMessage(), ...assistants]
const lastAssistant = assistants.at(-1)!
const lastPartID = loadedPartID(lastAssistant.info.id, "text")
const userPartID = loadedPartID(userID, "text")
const assistantParts = '[data-timeline-part-id$="_history_root_assistant:text:0"]'
const completed = {
  ...lastAssistant.info,
  time: { ...lastAssistant.info.time, completed: lastAssistant.info.time.created + 15_000 },
}
const scenarios = [
  { name: "completion", info: completed, idleFirst: false, interrupted: false },
  {
    name: "interruption",
    info: { ...completed, error: { name: "MessageAbortedError", data: { message: "Stopped" } } },
    idleFirst: true,
    interrupted: true,
  },
] as const

test.use({ viewport: { width: 646, height: 1385 } })

for (const scenario of scenarios) {
  test(`keeps visible timeline content visible through ${scenario.name}`, async ({ page }) => {
    const requests: { before?: string; phase: "start" | "end" }[] = []
    const pages: { before?: string; limit: number }[] = []
    const sequence: string[] = []
    const transport = await installSseTransport<{ directory: string; payload: Record<string, unknown> }>(page, {
      server: `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`,
      retry: 20,
    })
    await mockOrchestraServer(page, {
      directory,
      project: project(),
      provider: {
        all: [
          {
            id: "opencode",
            name: "Orchestra",
            models: {
              "claude-opus-4-6": {
                id: "claude-opus-4-6",
                name: "Claude Opus 4.6",
                limit: { context: 200_000 },
              },
            },
          },
        ],
        connected: ["opencode"],
        default: { providerID: "opencode", modelID: "claude-opus-4-6" },
      },
      sessions: [session()],
      sessionStatus: { [sessionID]: { type: "busy" } },
      onMessages: (request) => {
        requests.push(request)
        sequence.push(`messages:${request.phase}:${request.before ?? "latest"}`)
      },
      pageMessages: (_, limit, before) => {
        pages.push({ before, limit })
        const end = before ? messages.findIndex((message) => message.info.id === before) : messages.length
        const start = Math.max(0, end - limit)
        return {
          items: messages.slice(start, end),
          cursor: start > 0 ? messages[start]!.info.id : undefined,
        }
      },
    })
    await page.addInitScript(() => {
      const visibleParts = () => {
        const virtual = document.querySelector<HTMLElement>("[data-timeline-virtual-content]")
        const viewport = virtual?.closest<HTMLElement>(".scroll-view__viewport")
        const view = viewport?.getBoundingClientRect()
        if (!viewport || !view) return []
        return [...viewport.querySelectorAll<HTMLElement>("[data-timeline-part-id]")]
          .filter((part) => {
            const rect = part.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0 && rect.bottom > view.top && rect.top < view.bottom
          })
          .flatMap((part) => (part.dataset.timelinePartId ? [part.dataset.timelinePartId] : []))
      }
      const state = {
        armed: false,
        hidden: false,
        visibleParts: [] as string[],
        samples: 0,
        stop: false,
        arm() {
          state.visibleParts = visibleParts()
          state.armed = true
        },
      }
      ;(window as Window & { __historyRootProbe?: typeof state }).__historyRootProbe = state
      const sample = () => {
        if (state.armed) {
          const virtual = document.querySelector<HTMLElement>("[data-timeline-virtual-content]")
          const viewport = virtual?.closest<HTMLElement>(".scroll-view__viewport")
          const view = viewport?.getBoundingClientRect()
          const visible = (partID: string) => {
            const part = viewport?.querySelector<HTMLElement>(`[data-timeline-part-id="${CSS.escape(partID)}"]`)
            const rect = part?.getBoundingClientRect()
            return (
              !!rect && !!view && rect.width > 0 && rect.height > 0 && rect.bottom > view.top && rect.top < view.bottom
            )
          }
          if (!virtual || state.visibleParts.length === 0 || state.visibleParts.some((partID) => !visible(partID)))
            state.hidden = true
          state.samples++
        }
        if (!state.stop) requestAnimationFrame(() => setTimeout(sample, 0))
      }
      requestAnimationFrame(() => setTimeout(sample, 0))
    })

    await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
    await transport.waitForConnection()
    await expectSessionTitle(page, title)
    await expect(page.locator(`[data-timeline-part-id="${lastPartID}"]`)).toBeVisible()
    await expect(page.locator(`[data-timeline-part-id="${userPartID}"]`)).toBeVisible()
    // V2 reaches the turn root by paging on while the oldest loaded message is an assistant reply.
    await expect.poll(() => requests.filter((request) => request.phase === "end").length).toBe(2)
    expect(sequence.slice(0, 4)).toEqual([
      "messages:start:latest",
      "messages:end:latest",
      `messages:start:${messages.at(-initialPageSize)!.info.id}`,
      `messages:end:${messages.at(-initialPageSize)!.info.id}`,
    ])
    await expect(page.locator(assistantParts)).toHaveCount(assistants.length)
    await page.evaluate(() => {
      ;(
        window as Window & {
          __historyRootProbe?: { arm(): void }
        }
      ).__historyRootProbe!.arm()
    })
    await waitForProbeSamples(page, 0)
    expect(await visibleContentHidden(page)).toBe(false)
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible()
    expect(pages.slice(0, 2)).toEqual([
      { before: undefined, limit: initialPageSize },
      { before: messages.at(-initialPageSize)!.info.id, limit: initialPageSize },
    ])

    const message = messageUpdated(scenario.info)
    const idle = status("idle")
    for (const event of scenario.idleFirst ? [idle, message] : [message, idle]) {
      const beforeEvent = await probeSamples(page)
      await transport.send(event)
      if (event === idle) await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0)
      if (event === message && scenario.interrupted)
        await expect(page.getByText("Interrupted", { exact: true })).toBeVisible()
      await waitForProbeSamples(page, beforeEvent)
      const current = await timelineState(page)
      expect(current, JSON.stringify(current)).toMatchObject({ virtual: true })
      expect(current.rows, JSON.stringify(current)).toBeGreaterThan(0)
    }

    expect(requests[0]).toEqual({ before: undefined, phase: "start", sessionID })
    expect(requests[1]).toEqual({ before: undefined, phase: "end", sessionID })
    await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0)
    await expect(page.locator('[data-timeline-row="bottom-spacer"]')).toBeVisible()
    if (scenario.interrupted) await expect(page.getByText("Interrupted", { exact: true })).toBeVisible()
    expect(
      await page.evaluate(() => {
        const state = (window as Window & { __historyRootProbe?: { hidden: boolean; stop: boolean } })
          .__historyRootProbe!
        state.stop = true
        return state.hidden
      }),
    ).toBe(false)
  })
}

function timelineState(page: Page) {
  return page.evaluate(() => ({
    virtual: !!document.querySelector("[data-timeline-virtual-content]"),
    rows: document.querySelectorAll("[data-timeline-key]").length,
  }))
}

function probeSamples(page: Page) {
  return page.evaluate(
    () => (window as Window & { __historyRootProbe?: { samples: number } }).__historyRootProbe!.samples,
  )
}

async function waitForProbeSamples(page: Page, after: number) {
  await page.waitForFunction(
    (after) =>
      (window as Window & { __historyRootProbe?: { samples: number } }).__historyRootProbe!.samples >= after + 3,
    after,
  )
}

function visibleContentHidden(page: Page) {
  return page.evaluate(
    () => (window as Window & { __historyRootProbe?: { hidden: boolean } }).__historyRootProbe!.hidden,
  )
}
