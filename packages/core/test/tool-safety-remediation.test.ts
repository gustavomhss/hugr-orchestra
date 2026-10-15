import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { OutputInspector } from "../src/output-inspector"
import { AppProcess } from "../src/process"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetyCommands } from "../src/tool-safety-commands"
import { ToolSafetyGit } from "../src/tool-safety-git"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([FSUtil.node, AppProcess.node, ToolSafety.node])))
const fixture = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
)
const lines = (reason: string) => new ToolSafety.Denied({ reason }).message.split("\n")

describe("tool safety HOLD remediation", () => {
  test("destructive and gate-bypass commands say nothing ran, nobody can approve them, and what to do instead", () => {
    expect(lines(ToolSafetyCommands.reason("git push --force origin dev") ?? "")).toEqual([
      "Tool safety HOLD: known-destructive-operation",
      "This destructive command is blocked for every agent and no approval unlocks it, so it did not run. Do not retry it another way; if it is really needed, give the owner the exact command to run themselves (if the match is only words in a message, reword them).",
    ])
    // A commit message word is enough to match the bypass pattern, which the second line explains.
    expect(lines(ToolSafetyCommands.reason("git commit -m 'parse -json output'") ?? "")).toEqual([
      "Tool safety HOLD: known-gate-bypass",
      "Hooks and verification gates cannot be skipped (`--no-verify`, `-n`, `HUSKY=0`, `--no-hooks`), so the command did not run. Fix what the hook reports and rerun without the bypass; words such as `-n` or `-json` in a `git commit` message also match, so reword them.",
    ])
  })

  it.live("git staging refusals name the construct they refused and the accepted commit shape", () =>
    Effect.gen(function* () {
      const tmp = yield* fixture
      const processes = yield* AppProcess.Service
      yield* processes.run(ChildProcess.make("git", ["init", "-q", tmp.path]))
      const check = (command: string) =>
        Effect.flip(ToolSafetyGit.before({ command, directory: tmp.path, projectDirectory: tmp.path }))
      const heredoc = yield* check("git commit -m \"$(cat <<'EOF'\nsubject\nEOF\n)\"")
      expect(heredoc.message.split("\n")).toEqual([
        "Tool safety HOLD: git-hygiene-dynamic-command",
        "`git add` and `git commit` commands cannot contain `$`, backticks, parentheses, redirects or heredocs (or `\\` inside double quotes), so the command did not run. Do not work around it; write the message literally, as in `git commit -m 'subject' -m 'body'`.",
      ])
      expect((yield* check("git add a.ts | cat")).reason).toBe("git-hygiene-unsupported-shell-operator")
      expect((yield* check("git commit -m 'unterminated")).reason).toBe("git-hygiene-incomplete-command")
      const combined = yield* check("git commit -am 'subject'")
      expect(combined.message.split("\n")).toEqual([
        "Tool safety HOLD: git-hygiene-stage-option-unbound",
        "The command used a `git add` or `git commit` option the guard does not accept, so it did not run. Use plain flags such as `git add <paths>` and `git commit -m '…'` (`-a`, `--amend`, `--allow-empty`, `-q` and `-s` also work); `-am`, `--no-edit`, `-F`, `--author`, `-p` and `commit -v` are refused.",
      ])
    }),
  )

  it.live("discarded secret output says the tool ran and not to reveal the value another way", () =>
    Effect.gen(function* () {
      const denied = yield* Effect.flip(ToolSafety.inspect(`token ${"gh" + "p_" + "y".repeat(40)}`))
      expect(denied.message.split("\n")).toEqual([
        "Tool safety HOLD: recognized-secret-output",
        "The tool ran, but its output contained a credential-shaped value (a private key, or an AWS, GitHub, Stripe or OpenAI key), so the output was discarded. Do not print secrets or try to reveal them another way; to check that one is set, test it without printing its value.",
      ])
    }),
  )

  test("every guard family adds one line the secret scanner accepts; codes owned elsewhere keep the bare line", () => {
    const families = [
      "known-catastrophic-delete",
      "known-unrecoverable-git-clean",
      "git-hygiene-preceding-command-unbound",
      "git-hygiene-placement-environment",
      "git-hygiene-cwd-unparsed",
      "git-hygiene-global-option-unbound",
      "git-hygiene-message-unparsed",
      "git-hygiene-managed-or-protected-data",
      "git-hygiene-root-outside-project",
      "git-hygiene-query-failed-or-overflow",
      "output-inspection-budget",
      "project-never-touch",
      "protected-instruction-or-config-write",
      "transcript-context-budget",
      "invalid-patch-acquisition",
      "missing-native-path",
      "required-process-sandbox-unbound",
      "sandbox-platform-unavailable",
      "profile-invalid",
      "filesystem-acquisition",
      "git-hygiene-command-acquisition",
    ]
    for (const reason of families) {
      const message = lines(reason)
      expect(message).toHaveLength(2)
      expect(message[0]).toBe(`Tool safety HOLD: ${reason}`)
      expect(message[1]).toMatch(/did not run|nothing was (?:written|read|applied)|was not read|discarded/)
      // The processor scans failure text for secrets; a remediation that matched would replace itself.
      expect(OutputInspector.reason(message[1] ?? "")).toBeUndefined()
    }
    for (const reason of ["approval-native-rejected", "completion-checks-not-passing", "profile-snapshot-acquisition"])
      expect(new ToolSafety.Denied({ reason }).message).toBe(`Tool safety HOLD: ${reason}`)
  })
})
