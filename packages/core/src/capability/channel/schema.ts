import { Capability } from "@orchestra/schema/capability"
import { Schema } from "effect"

export const ID = Schema.String.check(Schema.isPattern(/^[0-9A-Za-z._:-]{1,128}(?![\s\S])/))
export const Text = Schema.NonEmptyString.check(Schema.isMaxLength(2000))
const Selection = {
  provider: Schema.Literals(["slack", "discord"]),
  connectionID: Schema.optionalKey(Capability.ConnectionID),
  targetID: Schema.optionalKey(Capability.TargetID),
}
const Page = {
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
  cursor: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[0-9A-Za-z_+=\/-]{1,512}(?![\s\S])/))),
}
export const Read = Schema.Union([
  Schema.Struct({ ...Selection, ...Page, action: Schema.Literal("history") }),
  Schema.Struct({ ...Selection, ...Page, action: Schema.Literal("thread"), threadID: ID }),
  Schema.Struct({ ...Selection, action: Schema.Literal("message"), messageID: ID }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })
export const Send = Schema.Struct({ ...Selection, text: Text,
  threadID: Schema.optionalKey(ID), replyTo: Schema.optionalKey(ID),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export const Update = Schema.Union([
  Schema.Struct({ ...Selection, action: Schema.Literal("edit"), messageID: ID, text: Text }),
  Schema.Struct({ ...Selection, action: Schema.Literal("delete"), messageID: ID }),
  Schema.Struct({ ...Selection, action: Schema.Literals(["reaction_add", "reaction_remove"]), messageID: ID,
    emoji: Schema.NonEmptyString.check(Schema.isMaxLength(80)) }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })
export type Read = typeof Read.Type
export type Send = typeof Send.Type
export type Update = typeof Update.Type

export const Message = Schema.Struct({ id: ID, text: Schema.String,
  threadID: Schema.optionalKey(ID), replyTo: Schema.optionalKey(ID),
  reactions: Schema.Array(Schema.Struct({ emoji: Schema.String, own: Schema.Boolean })),
})
export type Message = typeof Message.Type
export const Acquisition = Schema.Struct({ channelID: ID, messages: Schema.Array(Message),
  hasMore: Schema.Boolean, cursor: Schema.optionalKey(Schema.String),
})
export type Acquisition = typeof Acquisition.Type
export const Output = Schema.Struct({
  result: Capability.Result,
  provider: Schema.Literals(["slack", "discord"]),
  channelID: Schema.optionalKey(ID),
  messageID: Schema.optionalKey(ID),
  jobRef: Schema.optionalKey(Capability.JobRef),
  acquisition: Schema.optionalKey(Acquisition),
})
export type Output = typeof Output.Type
