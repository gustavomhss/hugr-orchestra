import { Schema } from "effect"

/** Internal injected transport sentinel, never inferred from arbitrary provider errors or zero requests. */
export class DryRequestCaptured extends Schema.TaggedErrorClass<DryRequestCaptured>()("CompleteReplayDryCaptured", {}) {}
