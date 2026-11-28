export * as ConfigRelay from "./relay"

import { Schema } from "effect"
import { PositiveInt } from "../schema"

// The Messages backend uses its own settings. The owner can also explicitly bind a stored OAuth connection to one project.
export class Judge extends Schema.Class<Judge>("ConfigV2.Relay.Judge")({
  backend: Schema.Literals(["stub", "api", "orchestra"]).pipe(Schema.optional).annotate({
    description: "Judge backend: the marker stub (default), Messages API, or Orchestra's ChatGPT plan OAuth",
  }),
  model: Schema.String.pipe(Schema.optional).annotate({ description: "Model ID the judge asks" }),
  projectID: Schema.NonEmptyString.pipe(Schema.optional).annotate({
    description: "Exact project ID authorized to use the Orchestra judge, in user configuration only",
  }),
  credentialID: Schema.NonEmptyString.pipe(Schema.optional).annotate({
    description: "ID of the active ChatGPT plan OAuth connection selected by the user for the Orchestra judge",
  }),
  variant: Schema.NonEmptyString.pipe(Schema.optional).annotate({
    description: "Explicit OpenAI reasoning variant for the Orchestra judge, such as xhigh",
  }),
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
