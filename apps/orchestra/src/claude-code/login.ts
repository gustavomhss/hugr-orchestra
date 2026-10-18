export * as ClaudeCodeLogin from "./login"

import { Process } from "@/util/process"

// Claude Code 2.1.289 `auth login` prints `If the browser didn't open, visit: <url>` (the manual flow's URL, inside an
// OSC 8 terminal hyperlink), opens the automatic flow's URL in the browser itself, then reads `code#state` lines on
// stdin for the manual flow. It prints `Login successful.` and exits 0 once either flow stores the login, and exits 1
// with the reason on stderr otherwise. Orchestra only relays the URL and the pasted code; the CLI owns the credential.
const VISIT = /If the browser didn't open, visit: (\S+)\r?\n/

/** One running `claude auth login --claudeai` (subscription sign-in) with the given executable and environment. */
export function start(input: { executable: string; env: Record<string, string | undefined> }) {
  const child = Process.spawn([input.executable, "auth", "login", "--claudeai"], {
    env: input.env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  const url = Promise.withResolvers<string>()
  url.promise.catch(() => {})
  const output: string[] = []
  const errors: string[] = []
  child.stdout?.on("data", (chunk: Buffer) => {
    output.push(chunk.toString())
    const found = VISIT.exec(plain(output.join("")))
    if (found) url.resolve(found[1])
  })
  child.stderr?.on("data", (chunk: Buffer) => errors.push(chunk.toString()))
  const exited = child.exited.then(
    (code) => {
      // A no-op once the URL arrived; otherwise the caller learns why the CLI stopped before printing one.
      url.reject(new Error(errors.join("").trim() || `Claude Code sign-in exited with code ${code}`))
      return code === 0
    },
    (error: unknown) => {
      url.reject(error)
      return false
    },
  )
  return {
    url: url.promise,
    /** True when the CLI stored a login and exited 0. */
    exited,
    /** Hand the CLI the `code#state` text the manual flow's page shows. */
    code: (text: string) => child.stdin?.write(`${text.trim()}\n`) ?? false,
    stop: () => Process.stop(child),
  }
}

export type Login = ReturnType<typeof start>

// Strip OSC 8 hyperlink wrappers (`ESC ] 8 ; params ; uri BEL|ST`) and SGR colors around the printed URL.
function plain(text: string) {
  return text.replace(/\x1b\]8;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "").replace(/\x1b\[[0-9;]*m/g, "")
}
