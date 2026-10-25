export * as ShellCwd from "./shell-cwd"

// OSC 7, `ESC ] 7 ; file://<host><path>` ended by BEL or ESC \, is how a shell says where it now is. It carries no
// nonce, so any output can print one: the result is only a hint for where a new terminal starts, never a boundary.
const START = "\x1b]7;file://"
const LIMIT = 4352

/** Follows a session's output across chunks and reports the last directory the shell announced, if any. */
export function parser() {
  let pending = ""

  return {
    push(chunk: string): string | undefined {
      let data = pending + chunk
      pending = ""
      let found: string | undefined
      while (data) {
        const at = data.indexOf(START)
        if (at === -1) {
          pending = partialStart(data)
          break
        }
        const body = data.slice(at + START.length)
        const bel = body.indexOf("\x07")
        const st = body.indexOf("\x1b\\")
        const end = bel === -1 ? st : st === -1 ? bel : Math.min(bel, st)
        if (end === -1) {
          if (body.length < LIMIT) pending = data.slice(at)
          break
        }
        found = read(body.slice(0, end)) ?? found
        data = body.slice(end + (end === bel ? 1 : 2))
      }
      return found
    },
  }
}

// The host is skipped (the shell and the server share a machine); what follows its first slash is the path.
function read(uri: string) {
  const slash = uri.indexOf("/")
  if (slash === -1) return undefined
  const path = decode(uri.slice(slash))
  if (!path || path.length > 4096 || !path.startsWith("/") || /[\x00-\x1f\x7f]/.test(path)) return undefined
  return path
}

function decode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return undefined
  }
}

function partialStart(data: string) {
  for (let size = Math.min(START.length - 1, data.length); size > 0; size--)
    if (data.endsWith(START.slice(0, size))) return data.slice(-size)
  return ""
}
