export * as ConfigRelay from "./relay"

import { Schema } from "effect"
import { PositiveInt } from "../schema"

// Relay's judge has its own settings: it never borrows a provider's auth or the process environment, so a provider key
// can neither turn the stub into an API call nor become the judge's key.
export class Judge extends Schema.Class<Judge>("ConfigV2.Relay.Judge")({
  backend: Schema.Literals(["stub", "api"]).pipe(Schema.optional).annotate({
    description: "Judge backend for Relay judge controls: the marker stub (default) or the Messages API",
  }),
  model: Schema.String.pipe(Schema.optional).annotate({ description: "Model the API judge asks" }),
  baseURL: Schema.String.pipe(Schema.optional).annotate({
    description: "Messages API endpoint; defaults to https://api.anthropic.com",
  }),
  apiKey: Schema.String.pipe(Schema.optional).annotate({ description: "API key for the judge endpoint" }),
  votes: PositiveInt.pipe(Schema.optional).annotate({ description: "Samples per verdict (default: 1)" }),
  maxContext: PositiveInt.pipe(Schema.optional).annotate({
    description: "Characters read per context file before truncation (default: 120000)",
  }),
  maxTokens: PositiveInt.pipe(Schema.optional).annotate({ description: "Reply token budget (default: 8192)" }),
}) {}

export class Info extends Schema.Class<Info>("ConfigV2.Relay")({
  judge: Judge.pipe(Schema.optional).annotate({ description: "Relay judge settings" }),
}) {}
