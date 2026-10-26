import { Option, Schema } from "effect"

import type { LiveOverlayAnswer, LiveOverlaySource, LiveOverlayView } from "./live-overlay-state"

// What the live loop says to the seat and how it reads the seat's replies into the overlay's shapes. Kept free of
// Electron and the network so the parsing rules can be tested directly. The prompts go to the model, not to the
// owner, so they are not translated; the seat answers in the language of the meeting.

export const NO_ANSWER = "[no-answer]"

export const LIVE_PROMPTS = {
  ask: "The owner pressed ask. Answer what the meeting needs from them right now.",
  look: "[On screen] The attached frame is the owner's screen now. What is on screen that matters now?",
  quick: {
    say: "What should the owner say next? Give the substance, not a script.",
    "follow-up": "Give the best follow-up question the owner could ask now.",
    "fact-check": "Fact-check the last claims heard in the meeting against what you know and the project.",
    recap: "Recap the meeting so far: decisions, open questions, and who owns what.",
  },
  suggestion: (question: string) =>
    [
      `[Heard in the meeting] Someone else asked: "${question}"`,
      `The owner wants help answering it. If it is not a question you can answer, reply only ${NO_ANSWER}.`,
    ].join("\n"),
  stop: [
    "The meeting ended. Write the meeting memory (people, decisions, open items) with your memory tools.",
    "Then reply with only one JSON object and nothing else:",
    '{"decisions": string[], "openItems": {"text": string, "owner": string}[], "followUp": string, "saved": boolean}',
    "followUp is a short drafted follow-up message the owner may copy; saved says whether the memory was written.",
  ].join("\n"),
  sendOpenItems:
    "The owner approved sending this meeting's open items to Maestro. Send them with team_message to maestro, then confirm in one sentence.",
} as const

const POINT = /^\s*(?:[-*•]|\d+[.)])\s+/
const SOURCE = /^\[(heard|screen|memory)\]\s*/i

// One bold sentence and a few points, as the seat's charter asks. Anything that does not follow the shape still shows:
// the first line is the lead and the rest become points.
export function parseAnswer(
  text: string,
  options: { source: LiveOverlaySource; latencyMs: number; question?: string },
): LiveOverlayAnswer {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^#+\s*$/.test(line))
  const lead = clean(lines[0] ?? "")
  const points = lines.slice(1).map((line) => {
    const body = clean(line.replace(POINT, ""))
    const tag = SOURCE.exec(body)
    return {
      text: tag ? body.slice(tag[0].length) : body,
      source: (tag?.[1]?.toLowerCase() as LiveOverlaySource | undefined) ?? options.source,
    }
  })
  return { question: options.question, lead, points, latencyMs: options.latencyMs }
}

export function isNoAnswer(text: string) {
  return text.trim().toLowerCase().startsWith(NO_ANSWER)
}

// The free first stage of a suggestion: only a question someone else asked, long enough not to be a backchannel
// ("right?") and not a repeat, reaches the owner. The engine punctuates, so a question carries its mark.
export function worthSuggesting(text: string, previous?: string) {
  const normalized = text.trim().toLowerCase()
  if (!normalized.includes("?")) return false
  if (normalized.split(/\s+/).length < 4) return false
  return normalized !== previous?.trim().toLowerCase()
}

const Summary = Schema.Struct({
  decisions: Schema.Array(Schema.String),
  openItems: Schema.Array(Schema.Struct({ text: Schema.String, owner: Schema.String })),
  followUp: Schema.String,
  saved: Schema.Boolean,
})
const decodeSummary = Schema.decodeUnknownOption(Schema.fromJsonString(Summary))

// The stop summary is the first JSON object in the reply. A reply that is not one still closes the meeting: its text
// becomes the follow-up draft and the memory counts as not saved.
export function parseStopSummary(
  text: string,
  meeting: { title: string; durationMs: number },
): Extract<LiveOverlayView, { kind: "stop-ready" }> {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  const summary = start >= 0 && end > start ? Option.getOrUndefined(decodeSummary(text.slice(start, end + 1))) : undefined
  return {
    kind: "stop-ready",
    title: meeting.title,
    durationMs: meeting.durationMs,
    decisions: [...(summary?.decisions ?? [])],
    openItems: (summary?.openItems ?? []).map((item) => ({ text: item.text, owner: item.owner })),
    followUp: summary?.followUp ?? text.trim(),
    saved: summary?.saved ?? false,
  }
}

function clean(line: string) {
  return line
    .replace(/^#+\s*/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .trim()
}
