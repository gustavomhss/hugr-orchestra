import { Effect, Stream } from "effect"
import { HttpClientResponse } from "effect/unstable/http"

export const collectBoundedResponseBody = (
  response: HttpClientResponse.HttpClientResponse,
  maximumBytes: number,
  tooLarge: () => Error,
  charge?: (bytes: number) => Error | undefined,
) =>
  Effect.gen(function* () {
    const contentLength = response.headers["content-length"]
    const parsedSize = contentLength ? Number.parseInt(contentLength, 10) : undefined
    const declaredSize =
      parsedSize !== undefined && Number.isSafeInteger(parsedSize) && parsedSize >= 0 ? parsedSize : undefined
    if (declaredSize !== undefined && declaredSize > maximumBytes) return yield* Effect.fail(tooLarge())
    return yield* collectBoundedBytes(response.stream, maximumBytes, tooLarge, charge)
  })

/** HTTP and cached files share the same pre-retention byte accounting. */
export const collectBoundedBytes = <E, R>(
  stream: Stream.Stream<Uint8Array, E, R>,
  maximumBytes: number,
  tooLarge: () => Error,
  charge?: (bytes: number) => Error | undefined,
) =>
  Effect.gen(function* () {
    let body = Buffer.allocUnsafe(Math.min(maximumBytes, 64 * 1024))
    let size = 0
    yield* Stream.runForEach(stream, (chunk) => {
      if (chunk.byteLength === 0) return Effect.void
      if (size + chunk.byteLength > maximumBytes) return Effect.fail(tooLarge())
      const refused = charge?.(chunk.byteLength)
      if (refused) return Effect.fail(refused)
      if (size + chunk.byteLength > body.byteLength) {
        const grown = Buffer.allocUnsafe(Math.min(maximumBytes, Math.max(size + chunk.byteLength, body.byteLength * 2)))
        body.copy(grown, 0, 0, size)
        body = grown
      }
      body.set(chunk, size)
      size += chunk.byteLength
      return Effect.void
    })
    return body.subarray(0, size)
  })
