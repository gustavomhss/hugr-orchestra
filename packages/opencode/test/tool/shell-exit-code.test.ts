import { describe, expect } from "bun:test"
import { Effect } from "effect"
import path from "path"
import { ShellTool } from "../../src/tool/shell"
import { provideInstance } from "../fixture/fixture"
import { Truncate } from "@/tool/truncate"
import { SessionID, MessageID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"
import { Tool } from "@/tool/tool"
import { shellLayer } from "./shell.fixture"

const it = testEffect(shellLayer)

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "maestro",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

const projectRoot = path.join(__dirname, "../..")

const run = Effect.fn("ShellExitCodeTest.run")(function* (args: Tool.InferParameters<typeof ShellTool>) {
  const info = yield* ShellTool
  const shell = yield* info.init()
  return yield* shell.execute(args, ctx)
})

// The exit code goes before the output because the app's evidence cards parse the end of it.
describe.skipIf(process.platform === "win32")("tool.shell exit code", () => {
  it.live("reports a non-zero exit code before the output, and none on success", () =>
    Effect.gen(function* () {
      const failed = yield* run({ command: "echo summary && exit 3" })
      expect(failed.metadata.exit).toBe(3)
      expect(failed.output).toBe("<shell_metadata>\nexit code: 3\n</shell_metadata>\n\nsummary\n")
      expect(failed.metadata.output).not.toContain("exit code")
      const passed = yield* run({ command: "echo summary" })
      expect(passed.metadata.exit).toBe(0)
      expect(passed.output).toBe("summary\n")
    }).pipe(provideInstance(projectRoot)),
  )

  it.live("keeps the truncation notice first and the output last when a truncated command fails", () =>
    Effect.gen(function* () {
      const lines = Truncate.MAX_LINES + 100
      const script = "console.log(Array.from({length:Number(Bun.argv[1])},(_,i)=>i+1).join(String.fromCharCode(10)))"
      const result = yield* run({ command: `"${process.execPath}" -e '${script}' ${lines} && exit 1` })
      expect(result.metadata.truncated).toBe(true)
      expect(result.output).toStartWith("...output truncated...\n\nFull output saved to: ")
      expect(result.output).toContain("\n\n<shell_metadata>\nexit code: 1\n</shell_metadata>\n\n")
      expect(result.output).toEndWith(`\n${lines}\n`)
    }).pipe(provideInstance(projectRoot)),
  )
})
