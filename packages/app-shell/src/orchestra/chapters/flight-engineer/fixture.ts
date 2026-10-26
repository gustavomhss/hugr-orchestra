import type {
  LiveHotkey,
  LiveHotkeyAction,
  LivePermission,
  LiveReadiness,
  LiveRunState,
  LiveSeatPlatform,
  LiveSettings,
  LiveSource,
} from "@/context/platform"
import { setDevMeetings, setDevSeat } from "./dev"
import type { Detail, Summary } from "./model"
import type { Meetings, Receipt } from "./source"

// Dev-only stand-ins for the desktop bridge and the meeting API, so the screens can be seen without a microphone or a
// finished server. run.ts imports this file behind import.meta.env.DEV; it never reaches a production build.
// In the browser console: flightFixture.on(), then flightFixture.set({ ... }) to pick a scenario, flightFixture.off().

const minute = 60_000
const at = (ago: number) => Date.now() - ago

const state = {
  running: undefined as Extract<LiveRunState, { running: true }> | undefined,
  permissions: { microphone: "granted", "system-audio": "needed" } as Record<LiveSource, LivePermission>,
  key: true,
  reachable: true as boolean | "unknown",
  startReason: undefined as "running" | "no-key" | "server" | "capture" | undefined,
  settings: { answerModel: "anthropic/claude-sonnet-5-5", language: "auto", suggestions: false, sources: { microphone: true, "system-audio": true } } as LiveSettings,
  protection: true,
  hotkeys: [
    { action: "start-stop", accelerator: "CommandOrControl+Shift+M", defaultAccelerator: "CommandOrControl+Shift+M" },
    { action: "ask", accelerator: "CommandOrControl+Enter", defaultAccelerator: "CommandOrControl+Enter" },
    { action: "toggle-overlay", accelerator: "CommandOrControl+\\", defaultAccelerator: "CommandOrControl+\\" },
    { action: "toggle-captions", accelerator: "CommandOrControl+Shift+C", defaultAccelerator: "CommandOrControl+Shift+C" },
  ] as LiveHotkey[],
}
const runListeners = new Set<(run: LiveRunState) => void>()
const levelListeners = new Set<(levels: Record<LiveSource, number>) => void>()

const emit = (run: LiveRunState) => runListeners.forEach((listener) => listener(run))

setInterval(() => {
  if (levelListeners.size === 0) return
  const wave = (offset: number) => Math.min(1, Math.max(0, 0.35 + 0.3 * Math.sin(Date.now() / 260 + offset) + Math.random() * 0.25))
  const levels = { microphone: wave(0), "system-audio": state.running ? wave(2) : 0 }
  levelListeners.forEach((listener) => listener(levels))
}, 66)

const seat: LiveSeatPlatform = {
  async start(title) {
    if (state.running) return { ok: false, reason: "running" }
    if (state.permissions.microphone !== "granted") return { ok: false, reason: "permission" }
    if (state.startReason) return { ok: false, reason: state.startReason }
    if (!state.key) return { ok: false, reason: "no-key" }
    state.running = {
      running: true,
      meetingID: "mtg_live",
      title: title ?? "Weekly sync with Northwind",
      startedAt: at(24 * minute + 18_000),
      sources: { microphone: true, "system-audio": state.permissions["system-audio"] === "granted" },
    }
    emit(state.running)
    return { ok: true, meetingID: state.running.meetingID }
  },
  async stop() {
    state.running = undefined
    emit({ running: false })
  },
  running: async () => state.running !== undefined,
  hasTranscriptionKey: async () => state.key,
  async setTranscriptionKey(key) {
    state.key = key !== ""
  },
  getContentProtection: async () => state.protection,
  async setContentProtection(enabled) {
    state.protection = enabled
  },
  readiness: async (): Promise<LiveReadiness> => ({
    permissions: { ...state.permissions },
    microphone: { label: "Built-in Microphone" },
    systemAudio: { available: true },
    transcriptionKey: state.key,
    answerModel: { id: state.settings.answerModel ?? "anthropic/claude-sonnet-5-5", reachable: state.reachable },
  }),
  requestPermission: async (source) => state.permissions[source],
  onLevels(listener) {
    levelListeners.add(listener)
    return () => levelListeners.delete(listener)
  },
  runState: async () => state.running ?? { running: false },
  onRunState(listener) {
    runListeners.add(listener)
    return () => runListeners.delete(listener)
  },
  async rename(_, title) {
    if (!state.running) return
    state.running = { ...state.running, title }
    emit(state.running)
  },
  getSettings: async () => state.settings,
  async setSettings(patch) {
    state.settings = { ...state.settings, ...patch }
    return state.settings
  },
  getHotkeys: async () => state.hotkeys.map((item) => ({ ...item })),
  async setHotkey(action: LiveHotkeyAction, accelerator: string) {
    if (!/\+/.test(accelerator)) return { ok: false, reason: "invalid" }
    // Another hotkey (or, in the fixture, another app) already holds this one.
    if (state.hotkeys.some((item) => item.action !== action && same(item.accelerator, accelerator))) return { ok: false, reason: "conflict" }
    state.hotkeys = state.hotkeys.map((item) => (item.action === action ? { ...item, accelerator } : item))
    return { ok: true }
  },
  async resetHotkeys() {
    state.hotkeys = state.hotkeys.map((item) => ({ ...item, accelerator: item.defaultAccelerator }))
    return state.hotkeys
  },
}

function summary(id: string, title: string, ago: number, length: number | undefined, extra: Partial<Summary> = {}): Summary {
  return {
    id,
    title,
    startedAt: at(ago),
    endedAt: length === undefined ? undefined : at(ago - length * minute),
    people: [{ id: "p_ana", name: "Ana Souza" }],
    retention: "kept",
    consent: "announced",
    counts: { decisions: 2, commitments: 3, openCommitments: 1, answers: 4 },
    ...extra,
  }
}

const rows: Summary[] = [
  summary("mtg_live", "Weekly sync with Northwind", 24 * minute + 18_000, undefined, { counts: { decisions: 0, commitments: 0, openCommitments: 0, answers: 3 } }),
  summary("mtg_ready", "Weekly sync with Northwind", 26 * 60 * minute, 41),
  summary("mtg_pending", "Pricing review with Mara", 5 * 60 * minute, 18, {
    people: [{ id: "p_mara", name: "Mara Lindqvist" }],
    counts: { decisions: 0, commitments: 0, openCommitments: 0, answers: 1 },
  }),
  summary("mtg_ephemeral", "Candidate screen, no record", 3 * 24 * 60 * minute, 32, {
    retention: "ephemeral",
    consent: "not-needed",
    counts: { decisions: 1, commitments: 1, openCommitments: 0, answers: 0 },
  }),
  summary("mtg_old", "Quarterly planning", 12 * 24 * 60 * minute, 64, {
    consent: "unknown",
    people: [
      { id: "p_ana", name: "Ana Souza" },
      { id: "p_joe", name: "Joe Okafor" },
    ],
    counts: { decisions: 5, commitments: 6, openCommitments: 0, answers: 9 },
  }),
]

const ana = { id: "p_ana", name: "Ana Souza" }
const mara = { id: "p_mara", name: "Mara Lindqvist" }

function item(id: string, text: string, asserter: Detail["card"]["decisions"][number]["asserter"], quote: string, startMs?: number) {
  return { id, text, asserter, quote, startMs, status: "claimed" as const, sentToMaestro: false }
}

function segments(): Detail["segments"] {
  return [
    { id: "s1", track: "them", text: "So we agree the pilot starts on the fifth.", startMs: 62_000, endMs: 66_000 },
    { id: "s2", track: "me", text: "Yes, I will send the revised scope tomorrow.", startMs: 67_000, endMs: 71_000 },
  ]
}

function detail(row: Summary, card: Detail["card"], kept = true): Detail {
  return {
    meeting: {
      id: row.id,
      sessionID: "ses_fixture",
      title: row.title,
      timeStarted: row.startedAt,
      timeEnded: row.endedAt ?? null,
    },
    segments: kept ? segments() : [],
    summary: row,
    card,
  }
}

const pending: Detail["card"] = {
  status: "pending",
  summary: "",
  decisions: [],
  commitments: [],
  questions: [],
  suggestions: [],
  newPeople: [],
}

const ready: Detail["card"] = {
  status: "ready",
  summary:
    "Northwind agreed to start the pilot on the fifth if the revised scope arrives first. Pricing stays as quoted. Two open questions remain about data residency and the security review.",
  decisions: [
    item("d1", "The pilot starts on the fifth.", ana, "So we agree the pilot starts on the fifth.", 62_000),
    item("d2", "Pricing stays as quoted for the first year.", "me", "I would keep the pricing as quoted for the first year.", 314_000),
  ],
  commitments: [
    {
      ...item("c1", "Send the revised scope.", "me", "I will send the revised scope tomorrow.", 67_000),
      owner: "me",
      counterparty: ana,
      due: "2026-10-27",
      state: "accepted",
    },
    {
      // Said by Ana about a task that is Mara's: second-hand.
      ...item("c2", "Share the security questionnaire.", ana, "Mara will share the security questionnaire by Friday.", 1_204_000),
      owner: mara,
      due: "2026-10-30",
      state: "proposed",
    },
    {
      // A voice the app could not name.
      ...item("c3", "Book the data residency call.", { unknown: 2 }, "Someone should book the residency call.", 1_480_000),
      owner: "me",
      state: "proposed",
    },
  ],
  questions: [
    item("q1", "Where will the pilot data be stored?", { unknown: 2 }, "Where would the pilot data live?", 1_330_000),
    item("q2", "Does the security review block the start?", ana, "Does the security review block us?", 1_402_000),
  ],
  suggestions: [
    { ...item("g1", "Reply to Ana with the regional storage options.", "me", "Where would the pilot data live?", 1_330_000), for: "owner" as const },
    { ...item("g2", "Draft the security questionnaire answers from the existing policy.", "me", "Mara will share the security questionnaire by Friday.", 1_204_000), for: "maestro" as const },
  ],
  newPeople: [{ proposalID: "np1", name: "Joe Okafor", mergeWith: { id: "p_joe", name: "Joe O." } }],
}

const reads = new Map<string, number>()

function stub(reason: "unavailable" | "running"): never {
  throw { name: "MeetingError", data: { reason } }
}

const meetings: Meetings = {
  async list(input) {
    const query = input.query?.toLowerCase() ?? ""
    const person = input.person
    const found = rows.filter(
      (row) =>
        row.title.toLowerCase().includes(query) && (!person || row.people.some((entry) => entry.id === person || entry.name === person)),
    )
    const from = input.before ? Number(input.before) : 0
    const limit = input.limit ?? 3
    const page = found.slice(from, from + limit)
    return { items: page, next: from + limit < found.length ? String(from + limit) : null }
  },
  async read(id) {
    const row = rows.find((entry) => entry.id === id)
    if (!row) throw { name: "MeetingError", data: { reason: "missing_meeting" } }
    if (id === "mtg_pending") {
      const count = (reads.get(id) ?? 0) + 1
      reads.set(id, count)
      return detail(row, count > 4 ? ready : pending)
    }
    if (id === "mtg_ephemeral") {
      const blind = (entry: Detail["card"]["decisions"][number]) => ({ ...entry, quote: "", startMs: undefined })
      return detail(row, {
        ...ready,
        decisions: ready.decisions.map(blind),
        commitments: ready.commitments.map((entry) => ({ ...entry, quote: "", startMs: undefined })),
        questions: ready.questions.map(blind),
        suggestions: ready.suggestions.map((entry) => ({ ...entry, quote: "", startMs: undefined })),
      }, false)
    }
    return detail(row, ready)
  },
  async rename(id, title) {
    const index = rows.findIndex((entry) => entry.id === id)
    if (index >= 0) rows[index] = { ...rows[index]!, title }
  },
  async remove(id): Promise<Receipt> {
    if (id === "mtg_live" && state.running) stub("running")
    const index = rows.findIndex((entry) => entry.id === id)
    if (index >= 0) rows.splice(index, 1)
    return { segments: 214, claims: 9, commitments: 3, people: 1 }
  },
  confirm: async () => stub("unavailable"),
  commitment: async () => stub("unavailable"),
  handoff: async () => stub("unavailable"),
}

type Scenario = Partial<Pick<typeof state, "permissions" | "key" | "reachable" | "startReason">> & {
  running?: boolean
}

// The app records "Command+..." while the defaults are stored as "CommandOrControl+...".
const same = (a: string, b: string) => a.replace(/^(Command|Control)\+/, "CommandOrControl+") === b.replace(/^(Command|Control)\+/, "CommandOrControl+")

const hook = {
  on() {
    setDevSeat(seat)
    setDevMeetings(meetings)
  },
  off() {
    setDevSeat(undefined)
    setDevMeetings(undefined)
  },
  set(scenario: Scenario) {
    if ("permissions" in scenario && scenario.permissions) state.permissions = { ...state.permissions, ...scenario.permissions }
    if (scenario.key !== undefined) state.key = scenario.key
    if (scenario.reachable !== undefined) state.reachable = scenario.reachable
    if ("startReason" in scenario) state.startReason = scenario.startReason
    if (scenario.running === true) void seat.start()
    if (scenario.running === false) void seat.stop()
  },
}

if (import.meta.env?.DEV && typeof window !== "undefined") Object.assign(window, { flightFixture: hook })
