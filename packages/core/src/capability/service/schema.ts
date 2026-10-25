export * as CapabilityServiceSchema from "./schema"

import { Capability } from "@orchestra/schema/capability"
import { Schema } from "effect"

export const FindInput = Schema.Struct({
  provider: Schema.NonEmptyString,
  query: Schema.String,
  connectionID: Schema.optionalKey(Capability.ConnectionID),
  targetID: Schema.optionalKey(Capability.TargetID),
  cursor: Schema.optionalKey(Schema.NonEmptyString),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

export const DescribeInput = Schema.Struct({ descriptor: Capability.DescriptorRef })
  .annotate({ parseOptions: { onExcessProperty: "error" } })

export const CallInput = Schema.Struct({ descriptor: Capability.DescriptorRef, input: Schema.Json })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export type CallInput = typeof CallInput.Type

export const Page = Schema.Struct({
  operations: Schema.Array(Schema.Struct({
    name: Schema.String,
    summary: Schema.String,
    readiness: Schema.Literals(["ready", "unsupported"]),
    coverage: Schema.Struct({
      input: Schema.Literals(["validated", "unsupported"]),
      output: Schema.Literals(["validated", "unvalidated", "unsupported"]),
    }),
    ref: Schema.optionalKey(Capability.DescriptorRef),
  })),
  coverage: Schema.Literals(["complete", "partial"]),
  catalogGeneration: Schema.Int,
  cursor: Schema.optionalKey(Schema.String),
})

export const Description = Schema.Struct({
  ref: Capability.DescriptorRef,
  name: Schema.String,
  summary: Schema.String,
  readiness: Schema.Literal("ready"),
  coverage: Schema.Struct({ input: Schema.Literal("validated"), output: Schema.Literals(["validated", "unvalidated"]) }),
  inputSchema: Schema.Json,
  outputSchema: Schema.optionalKey(Schema.Json),
})

export const CallOutput = Schema.Struct({
  result: Capability.Result,
  validation: Schema.Struct({ input: Schema.Literal("validated"), output: Schema.Literals(["validated", "unvalidated", "failed"]) }),
  // Untrusted provider data, never a new credential, target, executable, or fetch authority.
  data: Schema.optionalKey(Schema.Json),
  redacted: Schema.Boolean,
})
export type CallOutput = typeof CallOutput.Type
