import { ClientError, type Orchestra } from "@orchestra/client"
import type { DirectorySDK } from "@/context/sdk"
import type { AtlasCall, AtlasInput, AtlasOutput } from "./atlas-types"

export class AtlasAPIError extends Error {
  constructor(
    readonly reason: "unsupported" | "invalid",
    cause?: unknown,
  ) {
    super(reason, { cause })
  }
}

// D5: with no .atlas/ at the instance worktree every read answers { state: "empty" }.
export function isAtlasEmpty(value: unknown): value is { state: "empty" } {
  return typeof value === "object" && value !== null && "state" in value && value.state === "empty"
}

export type AtlasTransport = ReturnType<typeof createAtlasAPI>

type AtlasClient = Pick<ReturnType<typeof Orchestra.make>, "atlas">
type V2Call = (input: object, options: { signal?: AbortSignal }) => Promise<{ data: unknown }>

// The Atlas routes (D4) through the generated clients. A V2 server serves them through `orchestra` (`/api/atlas/*`, the
// same wire shapes inside the Location envelope); a V1 server through the legacy `atlas` group, keeping the SDK's
// directory, auth and error interceptors. A server without the routes answers 404/405/501, which reads as unsupported.
export function createAtlasAPI(sdk: Pick<DirectorySDK, "client" | "directory" | "protocol">, orchestra?: AtlasClient) {
  const current = async <K extends AtlasCall>(call: K, input: object, signal?: AbortSignal) => {
    if (!orchestra) throw new AtlasAPIError("unsupported")
    // Both clients are generated from the same Atlas schemas (@orchestra/schema/atlas-screen).
    const result = await (orchestra.atlas[call] as unknown as V2Call)(
      { location: { directory: sdk.directory }, ...input },
      { signal },
    ).catch((error: unknown) => {
      // A server that predates the routes answers with an undeclared 404.
      if (error instanceof ClientError && missing(error)) throw new AtlasAPIError("unsupported", error)
      throw error
    })
    if (result.data === undefined) throw new AtlasAPIError("invalid")
    return result.data as AtlasOutput<K>
  }
  const response = async <K extends AtlasCall>(
    call: K,
    input: object,
    run: () => Promise<{ data?: AtlasOutput<K>; error?: unknown; response?: Response }>,
    signal?: AbortSignal,
  ): Promise<AtlasOutput<K>> => {
    const protocol = await sdk.protocol
    signal?.throwIfAborted()
    if (protocol === "v2") return current(call, input, signal)
    const result = await run()
    if (result.response && [404, 405, 501].includes(result.response!.status)) throw new AtlasAPIError("unsupported")
    if (result.error !== undefined) throw result.error
    if (result.data === undefined) throw new AtlasAPIError("invalid")
    return result.data!
  }
  const options = (signal?: AbortSignal) => ({ signal, throwOnError: false as const })
  return {
    snapshot: (signal?: AbortSignal): Promise<AtlasOutput<"snapshot">> =>
      response("snapshot", {}, () => sdk.client.atlas.snapshot({ directory: sdk.directory }, options(signal)), signal),
    reasoning: (id: string, signal?: AbortSignal): Promise<AtlasOutput<"reasoning">> =>
      response(
        "reasoning",
        { id },
        () => sdk.client.atlas.reasoning({ id, directory: sdk.directory }, options(signal)),
        signal,
      ),
    own: (scope: string, signal?: AbortSignal): Promise<AtlasOutput<"own">> =>
      response(
        "own",
        { scope },
        () => sdk.client.atlas.own({ scope, directory: sdk.directory }, options(signal)),
        signal,
      ),
    health: (signal?: AbortSignal): Promise<AtlasOutput<"health">> =>
      response("health", {}, () => sdk.client.atlas.health({ directory: sdk.directory }, options(signal)), signal),
    promote: (input: AtlasInput<"promote">, signal?: AbortSignal): Promise<AtlasOutput<"promote">> =>
      response(
        "promote",
        input,
        () => sdk.client.atlas.promote({ ...input, directory: sdk.directory }, options(signal)),
        signal,
      ),
    draft: (input: AtlasInput<"draft">, signal?: AbortSignal): Promise<AtlasOutput<"draft">> =>
      response(
        "draft",
        input,
        () => sdk.client.atlas.draft({ ...input, directory: sdk.directory }, options(signal)),
        signal,
      ),
    emit: (input: AtlasInput<"emit">, signal?: AbortSignal): Promise<AtlasOutput<"emit">> =>
      response(
        "emit",
        input,
        () => sdk.client.atlas.emit({ ...input, directory: sdk.directory }, options(signal)),
        signal,
      ),
    link: (input: AtlasInput<"link">, signal?: AbortSignal): Promise<AtlasOutput<"link">> =>
      response(
        "link",
        input,
        () => sdk.client.atlas.link({ ...input, directory: sdk.directory }, options(signal)),
        signal,
      ),
    verify: (input: AtlasInput<"verify">, signal?: AbortSignal): Promise<AtlasOutput<"verify">> =>
      response(
        "verify",
        input,
        () => sdk.client.atlas.verify({ ...input, directory: sdk.directory }, options(signal)),
        signal,
      ),
    review: (signal?: AbortSignal): Promise<AtlasOutput<"review">> =>
      response("review", {}, () => sdk.client.atlas.review({ directory: sdk.directory }, options(signal)), signal),
    hold: (input: AtlasInput<"hold">, signal?: AbortSignal): Promise<AtlasOutput<"hold">> =>
      response(
        "hold",
        input,
        () => sdk.client.atlas.hold({ ...input, directory: sdk.directory }, options(signal)),
        signal,
      ),
    release: (input: AtlasInput<"release">, signal?: AbortSignal): Promise<AtlasOutput<"release">> =>
      response(
        "release",
        input,
        () => sdk.client.atlas.release({ ...input, directory: sdk.directory }, options(signal)),
        signal,
      ),
    propose: (input: AtlasInput<"propose">, signal?: AbortSignal): Promise<AtlasOutput<"propose">> =>
      response(
        "propose",
        input,
        () => sdk.client.atlas.propose({ ...input, directory: sdk.directory }, options(signal)),
        signal,
      ),
    decide: (input: AtlasInput<"decide">, signal?: AbortSignal): Promise<AtlasOutput<"decide">> =>
      response(
        "decide",
        input,
        () => sdk.client.atlas.decide({ ...input, directory: sdk.directory }, options(signal)),
        signal,
      ),
    answer: (input: AtlasInput<"answer">, signal?: AbortSignal): Promise<AtlasOutput<"answer">> =>
      response(
        "answer",
        input,
        () => sdk.client.atlas.answer({ ...input, directory: sdk.directory }, options(signal)),
        signal,
      ),
    memoryDecide: (input: AtlasInput<"memoryDecide">, signal?: AbortSignal): Promise<AtlasOutput<"memoryDecide">> =>
      response(
        "memoryDecide",
        input,
        () => sdk.client.atlas.memoryDecide({ ...input, directory: sdk.directory }, options(signal)),
        signal,
      ),
    territory: (input: AtlasInput<"territory">, signal?: AbortSignal): Promise<AtlasOutput<"territory">> =>
      response(
        "territory",
        input,
        () => sdk.client.atlas.territory({ ...input, directory: sdk.directory }, options(signal)),
        signal,
      ),
    delegate: (input: AtlasInput<"delegate">, signal?: AbortSignal): Promise<AtlasOutput<"delegate">> =>
      response(
        "delegate",
        input,
        () => sdk.client.atlas.delegate({ ...input, directory: sdk.directory }, options(signal)),
        signal,
      ),
    install: (signal?: AbortSignal): Promise<AtlasOutput<"install">> =>
      response("install", {}, () => sdk.client.atlas.install({ directory: sdk.directory }, options(signal)), signal),
    index: (signal?: AbortSignal): Promise<AtlasOutput<"index">> =>
      response("index", {}, () => sdk.client.atlas.index({ directory: sdk.directory }, options(signal)), signal),
    mine: (input: AtlasInput<"mine">, signal?: AbortSignal): Promise<AtlasOutput<"mine">> =>
      response(
        "mine",
        input,
        () => sdk.client.atlas.mine({ ...input, directory: sdk.directory }, options(signal)),
        signal,
      ),
  }
}

function missing(error: ClientError) {
  const cause = error.cause
  return (
    typeof cause === "object" && cause !== null && "status" in cause && [404, 405, 501].includes(Number(cause.status))
  )
}
