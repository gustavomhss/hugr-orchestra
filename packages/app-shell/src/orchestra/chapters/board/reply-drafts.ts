import { createStore } from "solid-js/store"

// Owned by the mounted Board, never browser storage. Inbox and issue views share the same identities.
export function createReplyDrafts() {
  const [store, setStore] = createStore({
    revision: 0,
    values: {} as Record<string, { text: string; revision: number } | undefined>,
  })
  return {
    read: (key: string, id: string) => store.values[JSON.stringify([key, id])]?.text ?? "",
    edit(key: string, id: string, text: string) {
      setStore("revision", (revision) => revision + 1)
      setStore("values", JSON.stringify([key, id]), { text, revision: store.revision })
    },
    capture(key: string, id: string) {
      const value = store.values[JSON.stringify([key, id])]
      return { key, id, text: value?.text ?? "", revision: value?.revision }
    },
    acknowledge(sent: { key: string; id: string; revision: number | undefined }) {
      const identity = JSON.stringify([sent.key, sent.id])
      if (store.values[identity]?.revision !== sent.revision) return
      setStore("values", identity, undefined)
    },
  }
}
