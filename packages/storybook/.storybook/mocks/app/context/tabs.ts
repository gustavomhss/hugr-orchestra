export type DraftTab = {
  type: "draft"
  draftID: string
  server: string
  directory: string
  worktree?: string
}

export type SessionTab = {
  type: "session"
  server: string
  sessionId: string
}

export function tabKey(tab: DraftTab | SessionTab) {
  return tab.type === "draft" ? `draft:${tab.draftID}` : `${tab.server}:${tab.sessionId}`
}

export function useTabs() {
  return {
    store: [{ type: "draft", draftID: "story-draft", server: "mock-server", directory: "/tmp/story" }] as DraftTab[],
    newDraft: async () => undefined,
  }
}
