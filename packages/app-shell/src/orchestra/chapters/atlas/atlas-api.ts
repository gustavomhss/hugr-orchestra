import type { DirectorySDK } from "@/context/sdk"
import type { AtlasInput, AtlasOutput } from "./atlas-types"

export class AtlasAPIError extends Error {
  constructor(readonly reason: "unsupported" | "invalid", cause?: unknown) {
    super(reason, { cause })
  }
}

// D5: with no .atlas/ at the instance worktree every read answers { state: "empty" }.
export function isAtlasEmpty(value: unknown): value is { state: "empty" } {
  return typeof value === "object" && value !== null && "state" in value && value.state === "empty"
}

export type AtlasTransport = ReturnType<typeof createAtlasAPI>

// The `atlas` httpapi group (D4) through the generated client, keeping the SDK's directory, auth and error
// interceptors. A server without the group answers 404/405/501, which reads as unsupported.
export function createAtlasAPI(sdk: Pick<DirectorySDK, "client" | "directory" | "protocol">) {
  const response = async <T>(
    run: () => Promise<{ data?: T; error?: unknown; response?: Response }>,
    signal?: AbortSignal,
  ) => {
    const protocol = await sdk.protocol
    signal?.throwIfAborted()
    if (protocol !== "v1") throw new AtlasAPIError("unsupported")
    const result = await run()
    if (result.response && [404, 405, 501].includes(result.response.status)) throw new AtlasAPIError("unsupported")
    if (result.error !== undefined) throw result.error
    if (result.data === undefined) throw new AtlasAPIError("invalid")
    return result.data
  }
  const options = (signal?: AbortSignal) => ({ signal, throwOnError: false as const })
  return {
    snapshot: (signal?: AbortSignal): Promise<AtlasOutput<"snapshot">> =>
      response(() => sdk.client.atlas.snapshot({ directory: sdk.directory }, options(signal)), signal),
    reasoning: (id: string, signal?: AbortSignal): Promise<AtlasOutput<"reasoning">> =>
      response(() => sdk.client.atlas.reasoning({ id, directory: sdk.directory }, options(signal)), signal),
    own: (scope: string, signal?: AbortSignal): Promise<AtlasOutput<"own">> =>
      response(() => sdk.client.atlas.own({ scope, directory: sdk.directory }, options(signal)), signal),
    health: (signal?: AbortSignal): Promise<AtlasOutput<"health">> =>
      response(() => sdk.client.atlas.health({ directory: sdk.directory }, options(signal)), signal),
    promote: (input: AtlasInput<"promote">, signal?: AbortSignal): Promise<AtlasOutput<"promote">> =>
      response(() => sdk.client.atlas.promote({ ...input, directory: sdk.directory }, options(signal)), signal),
    draft: (input: AtlasInput<"draft">, signal?: AbortSignal): Promise<AtlasOutput<"draft">> =>
      response(() => sdk.client.atlas.draft({ ...input, directory: sdk.directory }, options(signal)), signal),
    emit: (input: AtlasInput<"emit">, signal?: AbortSignal): Promise<AtlasOutput<"emit">> =>
      response(() => sdk.client.atlas.emit({ ...input, directory: sdk.directory }, options(signal)), signal),
    link: (input: AtlasInput<"link">, signal?: AbortSignal): Promise<AtlasOutput<"link">> =>
      response(() => sdk.client.atlas.link({ ...input, directory: sdk.directory }, options(signal)), signal),
    verify: (input: AtlasInput<"verify">, signal?: AbortSignal): Promise<AtlasOutput<"verify">> =>
      response(() => sdk.client.atlas.verify({ ...input, directory: sdk.directory }, options(signal)), signal),
    review: (signal?: AbortSignal): Promise<AtlasOutput<"review">> =>
      response(() => sdk.client.atlas.review({ directory: sdk.directory }, options(signal)), signal),
    hold: (input: AtlasInput<"hold">, signal?: AbortSignal): Promise<AtlasOutput<"hold">> =>
      response(() => sdk.client.atlas.hold({ ...input, directory: sdk.directory }, options(signal)), signal),
    release: (input: AtlasInput<"release">, signal?: AbortSignal): Promise<AtlasOutput<"release">> =>
      response(() => sdk.client.atlas.release({ ...input, directory: sdk.directory }, options(signal)), signal),
    propose: (input: AtlasInput<"propose">, signal?: AbortSignal): Promise<AtlasOutput<"propose">> =>
      response(() => sdk.client.atlas.propose({ ...input, directory: sdk.directory }, options(signal)), signal),
    decide: (input: AtlasInput<"decide">, signal?: AbortSignal): Promise<AtlasOutput<"decide">> =>
      response(() => sdk.client.atlas.decide({ ...input, directory: sdk.directory }, options(signal)), signal),
    answer: (input: AtlasInput<"answer">, signal?: AbortSignal): Promise<AtlasOutput<"answer">> =>
      response(() => sdk.client.atlas.answer({ ...input, directory: sdk.directory }, options(signal)), signal),
    memoryDecide: (input: AtlasInput<"memoryDecide">, signal?: AbortSignal): Promise<AtlasOutput<"memoryDecide">> =>
      response(() => sdk.client.atlas.memoryDecide({ ...input, directory: sdk.directory }, options(signal)), signal),
    territory: (input: AtlasInput<"territory">, signal?: AbortSignal): Promise<AtlasOutput<"territory">> =>
      response(() => sdk.client.atlas.territory({ ...input, directory: sdk.directory }, options(signal)), signal),
    delegate: (input: AtlasInput<"delegate">, signal?: AbortSignal): Promise<AtlasOutput<"delegate">> =>
      response(() => sdk.client.atlas.delegate({ ...input, directory: sdk.directory }, options(signal)), signal),
  }
}
