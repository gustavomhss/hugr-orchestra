// Visual evidence helper, not a CI test or a live-provider acceptance harness.
import { render } from "solid-js/web"
import { Router } from "@solidjs/router"
import { DialogProvider, useDialog } from "@orchestra/ui/context/dialog"
import { Orchestra } from "@orchestra/client"
import { PlatformProvider } from "../src/context/platform"
import { LanguageProvider } from "../src/context/language"
import { InboxConnections } from "../src/orchestra/chapters/inbox/controls"
import "../src/index.css"
import "../src/orchestra/chapters/kit.css"
import "../src/orchestra/chapters/inbox/inbox.css"

document.body.setAttribute("data-new-layout", "")
document.documentElement.dataset.colorScheme = "dark"

// Opt-in, in-memory visual catalog. It cannot reach providers, store credentials or send anything.
const catalog = {
  calendar: { generation: "fixture-1", selected: [] as string[] },
  gitlab: { generation: "fixture-1", projects: [] as string[] },
  feeds: [
    {
      id: "feed-1",
      source: "rss",
      name: "Engineering updates",
      url: "https://example.com/rss",
      initialized: false,
      state: "idle",
    },
  ],
}
const api = Orchestra.make({
  baseUrl: location.origin,
  ...(new URLSearchParams(location.search).has("synthetic")
    ? {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const req = new Request(input, init)
          const url = new URL(req.url)
          const body = req.method === "POST" || req.method === "PUT" ? await req.json() : undefined
          if (url.pathname === "/api/inbox/accounts")
            return Response.json({
              data: ["calendar", "gitlab", "trello", "sentry", "pagerduty"].map((source) => ({
                source,
                connected: true,
                generation: "fixture-1",
                state: "idle",
              })),
            })
          if (url.pathname === "/api/inbox/slack") return Response.json({ data: { connected: false, state: "idle" } })
          if (url.pathname === "/api/inbox/calendar/choices")
            return Response.json({
              data: [
                { id: "primary", name: "Personal calendar" },
                { id: "team", name: "Team releases" },
              ],
            })
          if (url.pathname === "/api/inbox/calendar") {
            if (body) catalog.calendar = body
            return Response.json({ data: catalog.calendar })
          }
          if (url.pathname === "/api/inbox/gitlab") {
            if (body) catalog.gitlab = body
            return Response.json({ data: catalog.gitlab })
          }
          if (url.pathname === "/api/inbox/notifications")
            return Response.json({
              data: body ?? {
                source: url.searchParams.get("source"),
                generation: "fixture-1",
                selected: [],
                ...(url.searchParams.get("source") === "sentry"
                  ? { organization: "orchestra", relevance: "review" }
                  : {}),
              },
            })
          if (url.pathname === "/api/inbox/account/sync")
            return Response.json({
              data: { source: body.source, connected: true, generation: "fixture-1", state: "synced" },
            })
          if (url.pathname === "/api/inbox/feeds") {
            if (body)
              catalog.feeds.push({
                id: "feed-2",
                source: body.source,
                name: body.name || "Public feed",
                url: body.url,
                initialized: false,
                state: "idle",
              })
            return Response.json({ data: body ? catalog.feeds.at(-1) : catalog.feeds })
          }
          if (url.pathname === "/api/inbox/feeds/sync") {
            const feed = catalog.feeds.find((feed) => feed.id === body.id)!
            feed.initialized = true
            feed.state = "synced"
            return Response.json({ data: feed })
          }
          throw new Error("Unexpected synthetic catalog request")
        },
      }
    : {}),
})["server.inbox"]

function Fixture() {
  const dialog = useDialog()
  return (
    <button
      type="button"
      onClick={() =>
        dialog.show(() => <InboxConnections api={api} directory="/synthetic-inbox" connected={() => {}} local />)
      }
    >
      Sources
    </button>
  )
}

render(
  () => (
    <PlatformProvider value={{ platform: "web", openExternal() {}, restart: async () => {}, notify: async () => {} }}>
      <LanguageProvider locale="en">
        <Router
          root={() => (
            <DialogProvider>
              <Fixture />
            </DialogProvider>
          )}
        />
      </LanguageProvider>
    </PlatformProvider>
  ),
  document.getElementById("root")!,
)
