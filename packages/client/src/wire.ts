import type { SessionEvent } from "@opencode-ai/schema/session-event"
import type { Schema } from "effect"

export type SessionEventEncoded = Schema.Codec.Encoded<typeof SessionEvent.Durable>
