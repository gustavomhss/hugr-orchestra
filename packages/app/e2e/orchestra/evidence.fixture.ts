import { readFile } from "node:fs/promises"
import { expect, type Page } from "@playwright/test"
import type { ModelInfo, SessionMessageInfo } from "@opencode-ai/client/promise"
import {
  assistantMessage,
  directory,
  project,
  session,
  sessionID,
  title,
  toolPart,
  userMessage,
} from "../performance/timeline-stability/fixture"
import { mockOpenCodeServer } from "../utils/mock-server"
import { installSseTransport } from "../utils/sse-transport"
import { expectSessionTitle } from "../utils/waits"

export const evidenceFixture = (name: string) =>
  readFile(new URL(`../../src/pages/session/orchestra-evidence-fixtures/${name}.txt`, import.meta.url), "utf8")
export const editor = (page: Page) => page.getByRole("textbox", { name: "Prompt", exact: true })
export const runCard = (page: Page, command = "bun test") =>
  page.getByRole("region", { name: `Test evidence for ${command}`, exact: true })
export const screenshotRoot = "../../specs/orchestra-visual/evidence/S11"

export async function evidencePage(
  page: Page,
  input: {
    command?: string
    output?: string
    workdir?: string
    directory?: string
    metadata?: Record<string, unknown>
    protocol?: "v1" | "v2"
    raw?: SessionMessageInfo[]
    secondServer?: string
  } = {},
) {
  const writes: { url: string; body: Record<string, unknown> }[] = []
  page.on("request", (request) => {
    if (request.method() !== "POST" || !/\/session\//.test(new URL(request.url()).pathname)) return
    writes.push({ url: request.url(), body: request.postDataJSON() })
  })
  const output = input.output ?? (await evidenceFixture("bun-pass"))
  const root = input.directory ?? directory
  const server = `http://127.0.0.1:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
  const transport = await installSseTransport<unknown>(page, { server })
  const records = [
    session({ directory: root, summary: { files: 2, additions: 10, deletions: 3 } }),
    session({ directory: root, id: "ses_other", title: "Other session" }),
  ]
  const toolInput = {
    command: input.command ?? "bun test",
    ...(input.workdir === undefined ? {} : { workdir: input.workdir }),
  }
  const metadata = { exit: 0, truncated: false, ...input.metadata }
  await mockOpenCodeServer(page, {
    protocol: input.protocol ?? "v2",
    directory: root,
    project: { ...project(), worktree: root },
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: { "test-model": { id: "test-model", name: "Test model", limit: { context: 200_000 } } },
        },
      ],
      connected: ["opencode"],
      default: { opencode: "test-model" },
    },
    sessions: records,
    vcsDiff: [{ file: "src/approval.ts", additions: 10, deletions: 3, before: "old\n", after: "new\n" }],
    sessionStatus: { [sessionID]: { type: "idle" } },
    pageMessages: () => ({
      items: [
        userMessage(),
        assistantMessage([toolPart("prt_evidence", "bash", "completed", toolInput, { output, metadata })]),
      ],
    }),
  })
  const model: ModelInfo = {
    id: "test-model",
    modelID: "test-model",
    providerID: "opencode",
    name: "Test model",
    capabilities: { input: ["text", "image"], output: ["text"], tools: true },
    variants: [],
    time: { released: 1 },
    cost: [],
    status: "active",
    enabled: true,
    limit: { context: 200_000, output: 8192 },
  }
  const raw: SessionMessageInfo[] = input.raw ?? [
    { id: "msg_1000_timeline_user", type: "user", text: "Check these test results.", time: { created: 1700000000000 } },
    {
      id: "msg_1001_timeline_assistant",
      type: "assistant",
      agent: "build",
      model: { id: model.id, providerID: model.providerID },
      time: { created: 1700000001000, completed: 1700000003000 },
      content: [
        {
          id: "prt_evidence",
          type: "tool",
          name: "shell",
          time: { created: 1700000001000, ran: 1700000001000, completed: 1700000002000 },
          state: { status: "completed", input: toolInput, metadata, content: [{ type: "text", text: output }] },
        },
      ],
    },
  ]
  // The shared legacy fixture maps metadata into structured. Use the real V2 shape
  // here, including model discovery, so evidence and composer exercise actual bindings.
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname
    const location = { directory: root }
    if (path === "/api/provider")
      return route.fulfill({ json: { location, data: [{ id: "opencode", name: "OpenCode", settings: {} }] } })
    if (path === "/api/model") return route.fulfill({ json: { location, data: [model] } })
    if (path === "/api/model/default") return route.fulfill({ json: { location, data: model } })
    if (/^\/api\/session\/[^/]+\/message$/.test(path))
      return route.fulfill({ json: { data: raw.toReversed(), cursor: {} } })
    return route.fallback()
  })
  if (input.secondServer)
    await page.route(`${input.secondServer}/**`, (route) =>
      route.fallback({ url: route.request().url().replace(input.secondServer!, server) }),
    )
  await page.addInitScript(
    ({ server, directory, sessionID, secondServer }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({
          general: { newLayoutDesigns: true, shellToolPartsExpanded: true, shouldDisplayTabsToast: false },
        }),
      )
      localStorage.setItem("opencode-color-scheme", "dark")
      localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.27" }))
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify([{ type: "session", server, sessionId: sessionID }]),
      )
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: secondServer ? [secondServer] : [],
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { local: directory },
        }),
      )
    },
    { server, directory: root, sessionID, secondServer: input.secondServer },
  )
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto(`/server/${Buffer.from(server).toString("base64url")}/session/${sessionID}`, {
    waitUntil: "domcontentloaded",
  })
  await transport.waitForConnection()
  await expectSessionTitle(page, title)
  await expect(editor(page)).toBeEditable()
  return { transport, send: (event: unknown) => transport.send(event), writes, sessionID, records }
}

export async function attachImage(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "evidence.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ),
  })
  await expect(page.getByAltText("evidence.png", { exact: true })).toBeVisible()
  return page.getByAltText("evidence.png", { exact: true }).getAttribute("src")
}
