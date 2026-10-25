export * as ShellMarks from "./shell-marks"

export type Mark = { readonly kind: "prompt" | "start" | "end"; readonly seq: number; readonly exit?: number }

// What the shell integration prints: OSC 133, a kind (A prompt, C command start, D command end with its exit code),
// then orchestra=<nonce>:<seq>, ended by BEL or ESC \. The nonce is the only thing that tells these apart from the same
// bytes in a file or a remote host's output, so a mark without it is counted and dropped, never believed.
const START = "\x1b]133;"
const KINDS = { A: "prompt", C: "start", D: "end" } as const
const LIMIT = 256

export function parser(nonce: string) {
  let pending = ""
  let rejected = 0

  return {
    push(chunk: string) {
      const marks: Mark[] = []
      let data = pending + chunk
      pending = ""
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
          if (body.length <= LIMIT) pending = data.slice(at)
          else rejected++
          break
        }
        const mark = read(body.slice(0, end), nonce)
        if (mark) marks.push(mark)
        else rejected++
        data = body.slice(end + (end === bel ? 1 : 2))
      }
      return marks
    },
    // Marks that carried a different nonce, or none, or were malformed.
    get rejected() {
      return rejected
    },
  }
}

function read(body: string, nonce: string): Mark | undefined {
  const fields = body.split(";")
  const kind = KINDS[fields[0] as keyof typeof KINDS]
  const tag = fields.at(-1)
  if (!kind || !tag?.startsWith("orchestra=")) return undefined
  const [given, seq] = tag.slice("orchestra=".length).split(":")
  if (given !== nonce || !/^\d+$/.test(seq ?? "")) return undefined
  if (kind !== "end") return fields.length === 2 ? { kind, seq: Number(seq) } : undefined
  if (fields.length !== 3 || !/^\d+$/.test(fields[1])) return undefined
  return { kind, seq: Number(seq), exit: Number(fields[1]) }
}

// The tail of `data` that could be the beginning of START cut by the end of the chunk.
function partialStart(data: string) {
  for (let size = Math.min(START.length - 1, data.length); size > 0; size--)
    if (data.endsWith(START.slice(0, size))) return data.slice(-size)
  return ""
}
