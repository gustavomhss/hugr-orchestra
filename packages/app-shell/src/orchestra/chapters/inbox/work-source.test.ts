import { expect, test } from "bun:test"
import { Orchestra } from "@orchestra/client"
import { createWorkSource, type GithubPreferences, type WorkState } from "./work-source"

async function fixture(
  run: (input: {
    model: ReturnType<typeof createWorkSource>
    state: { value?: WorkState; calls: string[]; preferences: GithubPreferences; fail: boolean; refreshed: number }
  }) => Promise<void>,
  source:
    | "github"
    | "linear"
    | "mail"
    | "teams"
    | "discord"
    | "gitlab"
    | "sentry"
    | "trello"
    | "pagerduty"
    | "calendar" = "github",
) {
  const state = {
    value: undefined as WorkState | undefined,
    calls: [] as string[],
    fail: false,
    refreshed: 0,
    preferences: {
      generation: "connection-1",
      repositories: [],
      reviews: true,
      mentions: true,
      assignments: true,
      ownCi: true,
    } as GithubPreferences,
  }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname
      state.calls.push(`${req.method} ${path}`)
      if (state.fail) return new Response(null, { status: 500 })
      if (path.endsWith("/disconnect")) return new Response(null, { status: 204 })
      if (path.endsWith("/calendar/choices")) return Response.json({ data: [{ id: "primary", name: "Personal" }] })
      if (path.endsWith("/calendar"))
        return Response.json({
          data: req.method === "PUT" ? await req.json() : { generation: "connection-1", selected: [] },
        })
      if (path.endsWith("/accounts"))
        return Response.json({ data: [{ source, connected: true, state: "idle", generation: "connection-1" }] })
      if (path.endsWith("/sync"))
        return Response.json({ data: { source, connected: true, state: "synced", generation: "connection-1" } })
      if (path.endsWith("/communication/choices"))
        return Response.json({
          data: { generation: "connection-1", choices: [{ id: "chosen", name: "Selected scope" }] },
        })
      if (path.endsWith("/communication"))
        return Response.json({
          data:
            req.method === "PUT"
              ? await req.json()
              : {
                  source,
                  generation: "connection-1",
                  selected: [],
                  unreadOnly: false,
                },
        })
      if (path.endsWith("/notifications"))
        return Response.json({
          data:
            req.method === "PUT"
              ? await req.json()
              : {
                  source,
                  generation: "connection-1",
                  selected: [],
                  ...(source === "sentry" ? { relevance: "review" } : {}),
                },
        })
      if (path.endsWith("/gitlab"))
        return Response.json({
          data: req.method === "PUT" ? await req.json() : { generation: "connection-1", projects: [] },
        })
      if (req.method === "PUT") state.preferences = await req.json()
      return Response.json({ data: state.preferences })
    },
  })
  const model = createWorkSource({
    api: Orchestra.make({ baseUrl: server.url.origin })["server.inbox"],
    source,
    directory: "/fixture",
    change: (value) => {
      state.value = value
    },
    synced: () => state.refreshed++,
  })
  try {
    await run({ model, state })
  } finally {
    model.dispose()
    await server.stop(true)
  }
}

test("GitHub load/configure never collects; dirty filters must be saved before explicit sync", async () => {
  await fixture(async ({ model, state }) => {
    await model.load()
    model.repositories("owner/one, owner/two\nowner/one")
    model.toggle("ownCi", false)
    await model.sync()
    expect(state.calls).toHaveLength(2)
    await model.save()
    expect(state.preferences).toEqual({
      generation: "connection-1",
      repositories: ["owner/one", "owner/two"],
      reviews: true,
      mentions: true,
      assignments: true,
      ownCi: false,
    })
    expect(state.calls.at(-1)).toBe("PUT /api/inbox/github/preferences")
    await model.sync()
    expect(state.value?.account?.state).toBe("synced")
    expect(state.refreshed).toBe(1)
  })
})

test("Calendar discovery and selection never acquire events; explicit sync waits for saved scope", async () => {
  await fixture(async ({ model, state }) => {
    await model.load()
    expect(state.calls).toEqual(["GET /api/inbox/accounts", "GET /api/inbox/calendar"])
    await model.discoverCalendars()
    expect(state.value?.calendars).toEqual([{ id: "primary", name: "Personal" }])
    model.selectCalendar("primary", true)
    await model.sync()
    expect(state.calls).toHaveLength(3)
    await model.save()
    expect(state.value?.calendar?.selected).toEqual(["primary"])
    await model.sync()
    expect(state.value?.account?.state).toBe("synced")
    await model.disconnect()
    expect(state.value?.calendar).toBeUndefined()
  }, "calendar")
})

test("failed save preserves edits without claiming success or allowing a dirty sync", async () => {
  await fixture(async ({ model, state }) => {
    await model.load()
    model.repositories("owner/private")
    state.fail = true
    await model.save()
    expect(state.value?.failed).toBe(true)
    expect(state.value?.dirty).toBe(true)
    expect(state.value?.repositories).toBe("owner/private")
    await model.sync()
    expect(state.calls.some((path) => path.endsWith("/sync"))).toBe(false)
  })
})

test("Linear never calls GitHub settings and disposed controllers perform no later requests", async () => {
  await fixture(async ({ model, state }) => {
    await model.load()
    expect(state.calls).toEqual(["GET /api/inbox/accounts"])
    model.dispose()
    await model.sync()
    await model.load()
    expect(state.calls).toHaveLength(1)
  }, "linear")
})

test("GitLab loads local project scope, saves deduplicated IDs before explicit sync and clears on disconnect", async () => {
  await fixture(async ({ model, state }) => {
    await model.load()
    expect(state.calls).toEqual(["GET /api/inbox/accounts", "GET /api/inbox/gitlab"])
    model.repositories("20, 30\n20")
    await model.sync()
    expect(state.calls).toHaveLength(2)
    await model.save()
    expect(state.value?.gitlab?.projects).toEqual(["20", "30"])
    await model.sync()
    expect(state.value?.account?.state).toBe("synced")
    await model.disconnect()
    expect(state.value?.gitlab).toBeUndefined()
  }, "gitlab")
})

test("notification scope is local until explicit sync and Sentry-specific fields cannot leak into other sources", async () => {
  for (const source of ["sentry", "trello", "pagerduty"] as const)
    await fixture(async ({ model, state }) => {
      await model.load()
      expect(state.calls).toEqual(["GET /api/inbox/accounts", "GET /api/inbox/notifications"])
      model.repositories("id-a,id-b\nid-a")
      model.sentry("organization", "org")
      model.sentry("environment", "production")
      model.relevance("assigned")
      await model.sync()
      expect(state.calls).toHaveLength(2)
      await model.save()
      expect(state.value?.notification?.selected).toEqual(["id-a", "id-b"])
      expect(state.value?.notification?.organization).toBe(source === "sentry" ? "org" : undefined)
      expect(state.value?.notification?.relevance).toBe(source === "sentry" ? "assigned" : undefined)
      await model.sync()
      expect(state.value?.account?.state).toBe("synced")
      await model.disconnect()
      expect(state.value?.notification).toBeUndefined()
    }, source)
})

test("disconnect does not claim success on failure and clears only the local connection on success", async () => {
  await fixture(async ({ model, state }) => {
    await model.load()
    state.fail = true
    await model.disconnect()
    expect(state.value?.account?.connected).toBe(true)
    expect(state.value?.failed).toBe(true)
    state.fail = false
    await model.disconnect()
    expect(state.value?.account?.connected).toBe(false)
    expect(state.value?.preferences).toBeUndefined()
    expect(state.refreshed).toBe(1)
  })
})

test("mail, Teams and Discord load local settings only; discovery, scope saving and collection are separate actions", async () => {
  for (const source of ["mail", "teams", "discord"] as const)
    await fixture(async ({ model, state }) => {
      await model.load()
      expect(state.calls).toEqual(["GET /api/inbox/accounts", "GET /api/inbox/communication"])
      expect(state.value?.communication?.selected).toEqual([])
      await model.discover()
      expect(state.value?.choices).toEqual([{ id: "chosen", name: "Selected scope" }])
      expect(state.calls.at(-1)).toBe("POST /api/inbox/communication/choices")
      model.select("chosen", true)
      model.unread(true)
      await model.sync()
      expect(state.calls).toHaveLength(3)
      expect(state.value?.communication?.unreadOnly).toBe(source === "mail")
      await model.save()
      expect(state.calls.at(-1)).toBe("PUT /api/inbox/communication")
      expect(state.value?.communication?.selected).toEqual(["chosen"])
      expect(state.value?.dirty).toBe(false)
      await model.sync()
      expect(state.calls.at(-1)).toBe("POST /api/inbox/account/sync")
      await model.disconnect()
      expect(state.value?.communication).toBeUndefined()
      expect(state.value?.choices).toBeUndefined()
    }, source)
})
