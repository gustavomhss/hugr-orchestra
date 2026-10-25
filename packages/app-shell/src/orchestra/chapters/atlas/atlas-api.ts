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

// The Atlas routes (D4) through the generated client: the V2 server serves them through `orchestra` (`/api/atlas/*`,
// inside the Location envelope). A server without the routes answers an undeclared 404/405/501, which reads as unsupported.
export function createAtlasAPI(sdk: Pick<DirectorySDK, "directory">, orchestra?: AtlasClient) {
  const call = async <K extends AtlasCall>(name: K, input: object, signal?: AbortSignal): Promise<AtlasOutput<K>> => {
    signal?.throwIfAborted()
    if (!orchestra) throw new AtlasAPIError("unsupported")
    const result = await (orchestra.atlas[name] as unknown as V2Call)(
      { location: { directory: sdk.directory }, ...input },
      { signal },
    ).catch((error: unknown) => {
      if (error instanceof ClientError && missing(error)) throw new AtlasAPIError("unsupported", error)
      throw error
    })
    if (result.data === undefined) throw new AtlasAPIError("invalid")
    return result.data as AtlasOutput<K>
  }
  return {
    snapshot: (signal?: AbortSignal) => call("snapshot", {}, signal),
    reasoning: (id: string, signal?: AbortSignal) => call("reasoning", { id }, signal),
    own: (scope: string, signal?: AbortSignal) => call("own", { scope }, signal),
    health: (signal?: AbortSignal) => call("health", {}, signal),
    promote: (input: AtlasInput<"promote">, signal?: AbortSignal) => call("promote", input, signal),
    draft: (input: AtlasInput<"draft">, signal?: AbortSignal) => call("draft", input, signal),
    emit: (input: AtlasInput<"emit">, signal?: AbortSignal) => call("emit", input, signal),
    link: (input: AtlasInput<"link">, signal?: AbortSignal) => call("link", input, signal),
    verify: (input: AtlasInput<"verify">, signal?: AbortSignal) => call("verify", input, signal),
    review: (signal?: AbortSignal) => call("review", {}, signal),
    hold: (input: AtlasInput<"hold">, signal?: AbortSignal) => call("hold", input, signal),
    release: (input: AtlasInput<"release">, signal?: AbortSignal) => call("release", input, signal),
    propose: (input: AtlasInput<"propose">, signal?: AbortSignal) => call("propose", input, signal),
    decide: (input: AtlasInput<"decide">, signal?: AbortSignal) => call("decide", input, signal),
    answer: (input: AtlasInput<"answer">, signal?: AbortSignal) => call("answer", input, signal),
    memoryDecide: (input: AtlasInput<"memoryDecide">, signal?: AbortSignal) => call("memoryDecide", input, signal),
    territory: (input: AtlasInput<"territory">, signal?: AbortSignal) => call("territory", input, signal),
    delegate: (input: AtlasInput<"delegate">, signal?: AbortSignal) => call("delegate", input, signal),
    install: (signal?: AbortSignal) => call("install", {}, signal),
    index: (signal?: AbortSignal) => call("index", {}, signal),
    mine: (input: AtlasInput<"mine">, signal?: AbortSignal) => call("mine", input, signal),
  }
}

function missing(error: ClientError) {
  const cause = error.cause
  return (
    typeof cause === "object" && cause !== null && "status" in cause && [404, 405, 501].includes(Number(cause.status))
  )
}
