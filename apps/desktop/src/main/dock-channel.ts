import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { createServer, type Socket } from "node:net"

// The Dock channel to the desktop-owned V2 `serve` child: a loopback WebSocket that stands in for the V1 sidecar's
// utility port. One JSON message per text frame, in the utility port's shapes, so main's Dock handlers are reused
// unchanged. Only a client holding this launch's token may connect, and no browser may: a request with an Origin is
// refused. No electron import, so it runs under bun test.

const HOSTNAME = "127.0.0.1"
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
const MAX_HANDSHAKE = 8 * 1024
const MAX_MESSAGE = 16 * 1024 * 1024

export type Reply = (message: unknown) => void

export async function startDockChannel(options: {
  onMessage: (message: unknown, reply: Reply) => void
  /** A connected child went away. */
  onClose?: () => void
}) {
  const token = randomBytes(32).toString("base64url")
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
    accept(socket, token, options)
  })
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, HOSTNAME, () => {
      const address = server.address()
      if (typeof address === "object" && address) return resolve(address.port)
      reject(new Error("Dock channel has no port"))
    })
  })
  const url = `ws://${HOSTNAME}:${port}`
  return {
    url,
    token,
    env: { ORCHESTRA_DOCK_URL: url, ORCHESTRA_DOCK_TOKEN: token },
    close: () =>
      new Promise<void>((resolve) => {
        sockets.forEach((socket) => socket.destroy())
        server.close(() => resolve())
      }),
  }
}

function accept(socket: Socket, token: string, options: Parameters<typeof startDockChannel>[0]) {
  const state = { buffer: Buffer.alloc(0), open: false, fragments: [] as Buffer[] }
  socket.on("error", () => socket.destroy())
  socket.on("data", (chunk: Buffer) => {
    state.buffer = Buffer.concat([state.buffer, chunk])
    if (!state.open) {
      const end = state.buffer.indexOf("\r\n\r\n")
      if (end === -1) return state.buffer.length > MAX_HANDSHAKE ? refuse(socket, 400) : undefined
      const status = handshake(state.buffer.subarray(0, end).toString("latin1"), token)
      if (typeof status === "number") return refuse(socket, status)
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${status.accept}\r\n\r\n`,
      )
      state.open = true
      state.buffer = state.buffer.subarray(end + 4)
      socket.once("close", () => options.onClose?.())
    }
    drain(socket, state, options.onMessage)
  })
}

/** The accept key, or the HTTP status that refuses the request. */
function handshake(head: string, token: string) {
  const [line, ...rest] = head.split("\r\n")
  const headers = new Map(
    rest.flatMap((item) => {
      const at = item.indexOf(":")
      return at === -1 ? [] : [[item.slice(0, at).trim().toLowerCase(), item.slice(at + 1).trim()] as const]
    }),
  )
  const key = headers.get("sec-websocket-key")
  if (!line?.startsWith("GET ") || headers.get("upgrade")?.toLowerCase() !== "websocket" || !key) return 400
  if (headers.has("origin")) return 403
  if (!same(headers.get("authorization") ?? "", `Bearer ${token}`)) return 401
  return { accept: createHash("sha1").update(key + GUID).digest("base64") }
}

// Equal-length digests make the comparison constant-time whatever the client sent.
function same(left: string, right: string) {
  return timingSafeEqual(createHash("sha256").update(left).digest(), createHash("sha256").update(right).digest())
}

function refuse(socket: Socket, status: number) {
  const reason = status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Bad Request"
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
}

function drain(
  socket: Socket,
  state: { buffer: Buffer; fragments: Buffer[] },
  onMessage: (message: unknown, reply: Reply) => void,
) {
  const reply: Reply = (message) => {
    if (socket.writable) socket.write(frame(1, Buffer.from(JSON.stringify(message))))
  }
  while (state.buffer.length >= 2) {
    const first = state.buffer[0]!
    const second = state.buffer[1]!
    const short = second & 0x7f
    const offset = short === 126 ? 4 : short === 127 ? 10 : 2
    if (state.buffer.length < offset) return
    const length = short === 126 ? state.buffer.readUInt16BE(2) : short === 127 ? Number(state.buffer.readBigUInt64BE(2)) : short
    // Clients must mask their frames (RFC 6455 5.1).
    if (!(second & 0x80) || length > MAX_MESSAGE) return void socket.destroy()
    if (state.buffer.length < offset + 4 + length) return
    const mask = state.buffer.subarray(offset, offset + 4)
    const payload = Buffer.from(state.buffer.subarray(offset + 4, offset + 4 + length).map((byte, index) => byte ^ mask[index % 4]!))
    state.buffer = state.buffer.subarray(offset + 4 + length)
    const opcode = first & 0x0f
    if (opcode === 8) return void socket.end(frame(8, Buffer.alloc(0)))
    if (opcode === 9) {
      socket.write(frame(10, payload))
      continue
    }
    if (opcode !== 0 && opcode !== 1) continue
    state.fragments.push(payload)
    if (!(first & 0x80)) continue
    const text = Buffer.concat(state.fragments.splice(0)).toString("utf8")
    const parsed = parse(text)
    if (parsed.ok) onMessage(parsed.value, reply)
  }
}

function parse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

function frame(opcode: number, payload: Buffer) {
  const head =
    payload.length < 126
      ? Buffer.from([0x80 | opcode, payload.length])
      : payload.length < 65536
        ? Buffer.concat([Buffer.from([0x80 | opcode, 126]), Buffer.from([payload.length >> 8, payload.length & 0xff])])
        : Buffer.concat([Buffer.from([0x80 | opcode, 127]), bigLength(payload.length)])
  return Buffer.concat([head, payload])
}

function bigLength(length: number) {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(length))
  return buffer
}
