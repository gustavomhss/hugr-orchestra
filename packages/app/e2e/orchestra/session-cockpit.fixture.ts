import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, type Locator, type Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { installDockBridge } from "./session-cockpit-bridge"
import { expectSessionTitle } from "../utils/waits"

export const directory = "/work/cockpit"
const projectID = "proj_cockpit"
export const parentID = "ses_cockpit_parent"
export const parentTitle = "Cockpit parent"
export const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
export const child = {
  running: "ses_cockpit_running",
  failed: "ses_cockpit_failed",
  waiting: "ses_cockpit_waiting",
  finished: "ses_cockpit_finished",
}

export function dockCard(page: Page) {
  return page.locator(".orchestra-dock-card")
}

export function pane(dock: Locator, name: string) {
  return dock.getByRole("tablist", { name: "Dock panes" }).getByRole("tab", { name, exact: true })
}

export async function openCockpit(page: Page) {
  await page.goto(`/server/${base64Encode(server)}/session/${parentID}`, { waitUntil: "domcontentloaded" })
  await expectSessionTitle(page, parentTitle)
  // Once the side panel mounts, the running child opens the cockpit.
  await page.getByRole("button", { name: "Toggle review" }).click()
  await expect(dockCard(page)).toBeVisible()
}

export async function setupCockpit(
  page: Page,
  options: {
    bridge: boolean
    many?: boolean
    empty?: boolean
    shell?: boolean
    // Adds a task waiting on a permission and a finished one beside the running and failed tasks.
    outcomes?: boolean
    locale?: "en" | "ar"
    scheme?: "dark" | "light"
    reads?: string[]
    lists?: string[]
  },
) {
  const extra = options.many
    ? Array.from({ length: 64 }, (_, index) =>
        session(`ses_cockpit_extra_${index}`, `Background ${index}`, 1700000010000 + index, { parentID }),
      )
    : []
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "cockpit",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: {
            "claude-opus-4-6": { id: "claude-opus-4-6", name: "Claude Opus 4.6", limit: { context: 200_000 } },
          },
        },
      ],
      connected: ["opencode"],
      default: { providerID: "opencode", modelID: "claude-opus-4-6" },
    },
    sessions: [
      session(parentID, parentTitle, 1700000000000),
      ...(options.empty
        ? []
        : [
            session(child.running, "Running task (@explore subagent)", 1700000001000, { parentID }),
            session(child.failed, "Failed task (@explore subagent)", 1700000001000, { parentID }),
          ]),
      ...(options.outcomes
        ? [
            session(child.waiting, "Waiting task (@explore subagent)", 1700000002000, { parentID }),
            session(child.finished, "Finished task (@explore subagent)", 1700000000500, { parentID }),
          ]
        : []),
      ...extra,
    ],
    sessionStatus: options.empty
      ? {}
      : {
          [child.running]: { type: "busy" },
          ...(options.outcomes ? { [child.waiting]: { type: "busy" } } : {}),
          ...Object.fromEntries(extra.map((item) => [item.id, { type: "busy" }])),
        },
    permissions: options.outcomes
      ? [
          {
            id: "per_cockpit_waiting",
            sessionID: child.waiting,
            permission: "bash",
            patterns: ["git push"],
            metadata: {},
            always: [],
          },
        ]
      : undefined,
    pageMessages: (sessionID) => ({
      items: !options.empty && sessionID === parentID ? parentMessages(options.shell, options.outcomes) : [],
    }),
    fileList: (path) => {
      options.lists?.push(path)
      return options.empty ? [] : (files[path] ?? [])
    },
    fileContent: (path) => {
      options.reads?.push(path)
      return { type: "text", content: contents[path] ?? "" }
    },
  })
  await page.addInitScript(
    ({ directory, server, sessionId, locale, scheme }) => {
      // The tabs introduction toast would sit over the cockpit's lower cards.
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { local: directory },
        }),
      )
      localStorage.setItem("opencode.window.browser.dat:tabs", JSON.stringify([{ type: "session", server, sessionId }]))
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", scheme)
      localStorage.setItem("language.v1", JSON.stringify({ locale }))
      // Web links leave through window.open; record them instead of opening a page.
      const opened: string[] = []
      Object.assign(window, {
        __opened: opened,
        open: (url: string) => {
          opened.push(url)
          return null
        },
      })
    },
    { directory, server, sessionId: parentID, locale: options.locale ?? "en", scheme: options.scheme ?? "dark" },
  )
  if (options.bridge) await page.addInitScript(installDockBridge)
}

const node = (path: string, type: "file" | "directory" = "file") => ({
  name: path.split("/").at(-1),
  path,
  absolute: `${directory}/${path}`,
  type,
  ignored: false,
})

const files: Record<string, unknown[]> = {
  "": [node("docs", "directory"), node("src", "directory"), node("AGENTS.md"), node("README.md"), node("package.json")],
  docs: [node("docs/guide.md"), node("docs/diagram.png"), node("docs/notes.mdx")],
}

const contents: Record<string, string> = {
  "README.md":
    "# Cockpit readme\n\nSee [the guide](docs/guide.md), [the site](https://example.org/site) and [escape](../outside.md).\n",
  "AGENTS.md": "# Agents\n",
  "docs/guide.md": "# Guide\n\nGuide body.\n",
  "docs/notes.mdx": "export default () => <button>Never execute MDX</button>",
  "package.json": "cockpit-package-contents",
}

function session(id: string, title: string, created: number, extra?: Record<string, unknown>) {
  return { id, slug: id, projectID, directory, title, version: "dev", time: { created, updated: created }, ...extra }
}

function parentMessages(shell = false, outcomes = false) {
  const userID = "msg_cockpit_user"
  const assistantID = "msg_cockpit_assistant"
  const task = (callID: string, sessionId: string, description: string, state: Record<string, unknown>) => ({
    id: `prt_${callID}`,
    sessionID: parentID,
    messageID: assistantID,
    type: "tool",
    callID,
    tool: "task",
    state: { input: { description, subagent_type: "explore" }, metadata: { sessionId }, ...state },
  })
  return [
    {
      info: {
        id: userID,
        sessionID: parentID,
        role: "user",
        time: { created: 1700000000000 },
        agent: "build",
        model: { providerID: "opencode", modelID: "claude-opus-4-6" },
      },
      parts: [{ id: "prt_cockpit_user", sessionID: parentID, messageID: userID, type: "text", text: "Delegate" }],
    },
    {
      info: {
        id: assistantID,
        sessionID: parentID,
        role: "assistant",
        time: { created: 1700000001000 },
        parentID: userID,
        modelID: "claude-opus-4-6",
        providerID: "opencode",
        mode: "build",
        agent: "build",
        path: { cwd: directory, root: directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
      parts: [
        task("call_running", child.running, "Running task", {
          status: "running",
          title: "Running task",
          time: { start: 1700000001000 },
        }),
        task("call_failed", child.failed, "Failed task", {
          status: "error",
          error: `Subagent failed (task_id: ${child.failed}): boom`,
          time: { start: 1700000001000, end: 1700000003000 },
        }),
        ...(outcomes
          ? [
              task("call_waiting", child.waiting, "Waiting task", {
                status: "running",
                title: "Waiting task",
                time: { start: 1700000002000 },
              }),
              task("call_finished", child.finished, "Finished task", {
                status: "completed",
                title: "Finished task",
                output: "Finished",
                time: { start: 1700000000500, end: 1700000002500 },
              }),
            ]
          : []),
        ...(shell
          ? [
              {
                id: "prt_shell",
                sessionID: parentID,
                messageID: assistantID,
                type: "tool",
                callID: "call_shell",
                tool: "shell",
                state: {
                  status: "running",
                  input: { command: "pwd" },
                  title: "Inspect workspace",
                  metadata: {},
                  time: { start: 1700000002000 },
                },
              },
            ]
          : []),
      ],
    },
  ]
}
