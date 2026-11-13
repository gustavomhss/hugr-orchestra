import { Buffer } from "node:buffer"
import { Pty, PtyProtocol } from "@orchestra/core/pty"
import { Deferred, Effect, Option, Queue } from "effect"
import { Socket } from "effect/unstable/socket"

// Independent of the UTF-16 replay ring. Includes the in-flight frame, metadata,
// and conservative frame overhead; the item cap also bounds tiny-frame overhead.
const BYTE_LIMIT = 8 * 1024 * 1024
const ITEM_LIMIT = 1024
const RETRY = new Socket.CloseEvent(1013, "terminal output backlog; reconnect with last cursor")
type Frame = string | Uint8Array | Socket.CloseEvent
const bytes = (frame: Frame) => 14 + (typeof frame === "string" ? Buffer.byteLength(frame) : frame instanceof Uint8Array ? frame.byteLength : 0)

export function connectPty(
  pty: Pick<Pty.Interface, "attach">,
  ptyID: Parameters<Pty.Interface["attach"]>[0],
  cursor: number | undefined,
  socket: Socket.Socket,
) {
  return Effect.scoped(Effect.gen(function* () {
    const write = yield* socket.writer
    const queue = yield* Queue.bounded<Frame>(ITEM_LIMIT)
    const overflow = yield* Deferred.make<void>()
    const opened = yield* Deferred.make<void>()
    const state = { bytes: 0, closed: false, ended: false, detached: false, native: undefined as globalThis.WebSocket | undefined }
    const terminate = () => {
      // NodeHttpServer uses ws, whose terminate releases buffered output without
      // waiting for the peer's close handshake. Other transports still close.
      const native = state.native
      if (!native) return
      if ("terminate" in native && typeof native.terminate === "function") return native.terminate()
      native.close()
    }
    const fail = () => {
      if (state.closed) return
      state.closed = true
      Deferred.doneUnsafe(overflow, Effect.void)
    }
    const offer = (frame: Frame) => {
      if (state.closed) return
      const size = bytes(frame)
      if (size + state.bytes + (state.native?.bufferedAmount ?? 0) > BYTE_LIMIT || !Queue.offerUnsafe(queue, frame)) return fail()
      state.bytes += size
    }
    const attachment = yield* pty.attach(ptyID, {
      cursor,
      onData: (chunk) => {
        if (state.closed || state.ended) return
        // Check huge callbacks before making frame slices or retaining them.
        if (bytes(chunk) + state.bytes + (state.native?.bufferedAmount ?? 0) > BYTE_LIMIT) return fail()
        for (const frame of PtyProtocol.chunks(chunk)) offer(frame)
      },
      onEnd: () => {
        if (state.ended) return
        state.ended = true
        offer(new Socket.CloseEvent(1000))
      },
    }).pipe(Effect.catchTag("Pty.NotFoundError", () => Effect.succeed(undefined)))
    const close = (event: Socket.CloseEvent) => write(event).pipe(Effect.timeout("100 millis"), Effect.catch(() => Effect.void))
    if (!attachment) {
      yield* socket.runRaw(() => Effect.void, { onOpen: close(new Socket.CloseEvent(4404, "session not found")) }).pipe(Effect.timeout("1 second"), Effect.catch(() => Effect.void))
      return
    }
    const detach = () => {
      if (state.detached) return
      state.detached = true
      attachment.detach()
    }
    yield* Effect.addFinalizer(() => Effect.gen(function* () {
      state.closed = true
      detach()
      yield* Queue.shutdown(queue)
      state.bytes = 0
      terminate()
    }))
    // A reconnect snapshot is charged just like live output. The ring remains
    // responsible for cursor gaps/repaint on reconnect; no output is discarded.
    for (const frame of PtyProtocol.chunks(attachment.replay)) offer(frame)
    offer(PtyProtocol.metaFrame(attachment.cursor))
    attachment.activate()

    const drain = Effect.gen(function* () {
      yield* Deferred.await(opened)
      while (true) {
        const frame = yield* Queue.take(queue)
        yield* Effect.gen(function* () {
          yield* write(frame)
          // Effect send is synchronous. Bound its native buffer too, keeping
          // this frame charged until the transport has drained it.
          while ((state.native?.bufferedAmount ?? 0) > 0) yield* Effect.sleep("10 millis")
        }).pipe(Effect.timeout("5 seconds"), Effect.catch(() => Effect.sync(fail)))
        if (state.closed) return
        state.bytes -= bytes(frame)
        if (frame instanceof Socket.CloseEvent) return
      }
    })
    const output = Effect.raceFirst(
      drain,
      Deferred.await(overflow),
    ).pipe(Effect.andThen(Effect.gen(function* () {
      if (!state.closed) return
      detach()
      yield* Queue.shutdown(queue)
      yield* close(RETRY)
      // Give the close code a bounded opportunity to reach the peer, then the
      // finalizer forcibly releases native buffers even if it never reads.
      yield* Effect.sleep("100 millis")
    })))
    yield* Effect.raceFirst(output, socket.runRaw((message) => {
      const decoded = PtyProtocol.decodeInput(message)
      if (decoded !== undefined && !state.closed) attachment.write(decoded)
    }, {
      onOpen: Effect.gen(function* () {
        const native = yield* Effect.serviceOption(Socket.WebSocket)
        state.native = Option.getOrUndefined(native)
        yield* Deferred.succeed(opened, undefined)
      }),
    })).pipe(Effect.catchReason("SocketError", "SocketCloseError", () => Effect.void))
  }))
}
