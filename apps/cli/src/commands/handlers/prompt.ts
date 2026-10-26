import readline from "node:readline/promises"

/** The questions a command may ask a person. Commands take this so they run unattended when the answers are flags. */
export interface Prompter {
  readonly select: <A>(message: string, options: ReadonlyArray<{ label: string; value: A }>) => Promise<A>
  readonly text: (message: string) => Promise<string>
  /** Reads a secret without echoing it; with a piped stdin it takes the whole input. */
  readonly secret: (message: string) => Promise<string>
}

export const terminal: Prompter = {
  select: async (message, options) => {
    requireTTY(message)
    options.forEach((option, index) => process.stderr.write(`  ${index + 1}. ${option.label}${"\n"}`))
    while (true) {
      const answer = Number((await ask(`${message} (1-${options.length}): `)).trim())
      const chosen = options[answer - 1]
      if (Number.isInteger(answer) && chosen) return chosen.value
    }
  },
  text: async (message) => {
    requireTTY(message)
    return (await ask(`${message}: `)).trim()
  },
  secret: async (message) => {
    if (!process.stdin.isTTY) return (await Bun.stdin.text()).trim()
    process.stderr.write(`${message}: `)
    return new Promise<string>((resolve, reject) => {
      let value = ""
      const finish = (action: () => void) => {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdin.off("data", onData)
        process.stderr.write("\n")
        action()
      }
      const onData = (chunk: Buffer) => {
        for (const char of chunk.toString("utf8")) {
          if (char === "\u0003") return finish(() => reject(new Error("Cancelled")))
          if (char === "\r" || char === "\n") return finish(() => resolve(value.trim()))
          value = char === "\u007f" ? value.slice(0, -1) : value + char
        }
      }
      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.on("data", onData)
    })
  },
}

function requireTTY(message: string) {
  if (!process.stdin.isTTY) throw new Error(`${message}: an interactive terminal is required, pass the answer as a flag`)
}

async function ask(question: string) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
  try {
    return await rl.question(question)
  } finally {
    rl.close()
  }
}
