import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DeliveryExport } from "./live-delivery-contract"

export const exportData: DeliveryExport = {
  kind: "stored",
  data: {
    record: {
      id: "11111111-1111-4111-8111-111111111111",
      target: { profileID: "22222222-2222-4222-8222-222222222222", mode: "owned", authority: "http://127.0.0.1:9999", directory: "/saved/workspace" },
      meeting: { id: "mtg_export", sessionID: "ses_export", timeStarted: 1700000000000, title: "Saved café e\u0301" },
      closeRequested: true, sealed: false, status: "paused", reason: "offline", failures: 8,
    },
    segments: [{ id: "33333333-3333-4333-8333-333333333333", track: "me", text: "Saved transcript café 😀", startMs: 0, endMs: 100 }],
    receipts: [{ id: "33333333-3333-4333-8333-333333333333", sha256: "a".repeat(64), acknowledged: false }],
  },
  unsaved: { id: "44444444-4444-4444-8444-444444444444", track: "them", text: "Retained final tail", startMs: 100, endMs: 200 },
  unsavedUnavailable: true,
}

export async function withExport(body: (fixture: { root: string; destination: string; entries(): Promise<string[]>; release(cleanup: () => void): void }) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "live-recovery-export-")), releases: (() => void)[] = []
  try { await body({ root, destination: join(root, "meeting.json"), entries: async () => (await readdir(root)).sort(), release: (cleanup) => releases.push(cleanup) }) }
  finally { releases.forEach((release) => release()); await rm(root, { recursive: true, force: true }) }
}
