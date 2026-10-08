import { Capability } from "@orchestra/schema/capability"
import { Schema } from "effect"

const selection = {
  connection: Capability.ConnectionRef,
  target: Capability.TargetRef,
  purpose: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
}
const prompt = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(16000))
const strict = { parseOptions: { onExcessProperty: "error" as const } }

// Durable target carries purpose so settled-root host observation can authorize it independently.
export const TargetResource = Schema.Struct({ purpose: selection.purpose })

// Qualified request vocabulary from OpenClaw 2a305612, not ambient chat-model configuration.
export const ImageInput = Schema.Struct({
  ...selection,
  provider: Schema.Literal("openai"),
  operation: Schema.Literals(["generate", "edit"]),
  model: Schema.Literals(["gpt-image-2", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"]),
  prompt,
  options: Schema.Struct({
    size: Schema.Literals(["1024x1024", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "3840x2160", "2160x3840"]),
    quality: Schema.Literals(["low", "medium", "high", "auto", "xhigh", "max"]),
    format: Schema.Literals(["png", "jpeg"]),
    background: Schema.Literals(["transparent", "opaque", "auto"]),
    count: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 4 })),
  }).annotate(strict),
  inputArtifactRefs: Schema.Array(Capability.ArtifactRef).check(Schema.isMaxLength(5)),
}).annotate(strict)
export type ImageInput = typeof ImageInput.Type

export const VideoInput = Schema.Struct({
  ...selection,
  provider: Schema.Literal("runway"),
  operation: Schema.Literals(["generate", "image-to-video", "edit"]),
  model: Schema.Literals(["gen4.5", "gen4_turbo", "gen3a_turbo", "veo3.1", "veo3.1_fast", "veo3", "gen4_aleph"]),
  prompt,
  options: Schema.Struct({
    ratio: Schema.Literals(["1280:720", "720:1280", "960:960", "832:1104", "1104:832", "1584:672"]),
    duration: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 2, maximum: 10 })),
  }).annotate(strict),
  inputArtifactRefs: Schema.Array(Capability.ArtifactRef).check(Schema.isMaxLength(1)),
}).annotate(strict)
export type VideoInput = typeof VideoInput.Type

export const ObserveInput = Schema.Struct({
  operation: Schema.Literals(["observe", "materialize", "cancel"]),
  jobRef: Capability.JobRef,
}).annotate(strict)

export function failure(code: Capability.ErrorCode) {
  return new Capability.Failure({ code, message: "Media capability unavailable" })
}

export function validateImage(input: ImageInput) {
  if (input.connection.provider !== input.provider || input.target.connectionID !== input.connection.id ||
    (input.operation === "edit" ? input.inputArtifactRefs.length === 0 : input.inputArtifactRefs.length !== 0))
    return failure("unsupported_operation")
  if (["gpt-image-1", "gpt-image-1-mini"].includes(input.model) &&
    !["1024x1024", "1536x1024", "1024x1536"].includes(input.options.size)) return failure("unsupported_operation")
  if (["xhigh", "max"].includes(input.options.quality) &&
    !["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"].includes(input.model)) return failure("unsupported_operation")
  if (input.options.background === "transparent" && input.model !== "gpt-image-1.5") return failure("unsupported_operation")
  if (input.options.background === "transparent" && input.options.format !== "png") return failure("unsupported_operation")
}

export function validateVideo(input: VideoInput) {
  if (input.connection.provider !== input.provider || input.target.connectionID !== input.connection.id ||
    input.inputArtifactRefs.length !== (input.operation === "generate" ? 0 : 1)) return failure("unsupported_operation")
  if (input.operation === "edit") return input.model === "gen4_aleph" ? undefined : failure("unsupported_operation")
  if (input.model === "gen4_aleph") return failure("unsupported_operation")
  if (input.operation === "generate" && (!["gen4.5", "veo3.1", "veo3.1_fast", "veo3"].includes(input.model) ||
    !["1280:720", "720:1280"].includes(input.options.ratio))) return failure("unsupported_operation")
}
