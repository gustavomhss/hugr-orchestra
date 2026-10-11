export * as BashTool from "./bash"

import path from "path"
import { ToolFailure } from "@orchestra/llm"
import { Duration, Effect, Layer, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Config } from "../config"
import { makeLocationNode } from "../effect/app-node"
import { FSUtil } from "../fs-util"
import { LocationMutation } from "../location-mutation"
import { Location } from "../location"
import { AppProcess } from "../process"
import { PermissionV2 } from "../permission"
import { PositiveInt } from "../schema"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"
import { ToolSafety } from "../tool-safety"
import { ToolSafetySandbox } from "../tool-safety-sandbox"
import { ToolSafetyGit } from "../tool-safety-git"
import { OutputInspector } from "../output-inspector"

export const name = "bash"
export const DEFAULT_TIMEOUT_MS = 2 * 60 * 1_000
export const MAX_TIMEOUT_MS = 10 * 60 * 1_000
export const MAX_CAPTURE_BYTES = 1024 * 1024

export const Input = Schema.Struct({
  command: Schema.String.annotate({ description: "The command to execute" }),
  workdir: Schema.String.pipe(Schema.optional).annotate({
    description: "The directory to run the command in, relative to the working directory, which is the default",
  }),
  timeout: PositiveInt.check(Schema.isLessThanOrEqualTo(MAX_TIMEOUT_MS))
    .pipe(Schema.optional)
    .annotate({
      description: `Timeout in milliseconds. Defaults to ${DEFAULT_TIMEOUT_MS} and may not exceed ${MAX_TIMEOUT_MS}.`,
    }),
})

const StructuredOutput = Schema.Struct({
  exit: Schema.Number.pipe(Schema.optional),
  truncated: Schema.Boolean,
  timeout: Schema.Boolean.pipe(Schema.optional),
})

const Output = Schema.Struct({
  ...StructuredOutput.fields,
  output: Schema.String,
  warnings: Schema.Array(Schema.String).pipe(Schema.optional),
})

type Output = typeof Output.Type

const defaultShell = () => (process.platform === "win32" ? (process.env.COMSPEC ?? "cmd.exe") : "/bin/sh")
// cmd.exe, the default shell on Windows, does not treat single quotes as quoting.
const commitExample =
  process.platform === "win32" ? `git commit -m "subject" -m "body"` : "git commit -m 'subject' -m 'body'"

const modelOutput = (output: Output) => {
  const warnings = output.warnings?.length
    ? `\n\nWarnings:\n${output.warnings.map((warning) => `- ${warning}`).join("\n")}`
    : ""
  if (output.timeout) return `${warnings.trimStart()}${warnings ? "\n\n" : ""}Command timed out before completion.`
  return `${warnings.trimStart()}${warnings ? "\n\n" : ""}Command exited with code ${output.exit}.`
}

const isTimeout = (error: AppProcess.AppProcessError) =>
  error.cause instanceof Error && error.cause.message === "Timed out"

/**
 * Minimal V2 core shell boundary. Keep parity debt visible without pulling the
 * legacy shell runtime into core.
 */
// TODO: Port tree-sitter bash / PowerShell parser-based approval reduction.
// TODO: Port BashArity reusable command-prefix approvals.
// TODO: Replace token-based command-argument external-directory advisories with parser-based detection.
// TODO: Restore PowerShell and cmd-specific invocation/path handling on Windows.
// TODO: Add plugin shell.env environment augmentation once V2 plugin hooks exist.
// TODO: Add durable/live progress metadata streaming for long-running commands once V2 tool invocation progress context is wired.
// TODO: Persist background job status and define restart recovery before exposing remote observation.
// TODO: Re-add model-facing background launch only with owner-bound get/wait/cancel tools and completion delivery.
// TODO: Add HTTP background-job observation only after durable status, restart recovery, and authorization are defined.
// TODO: Revisit process-group cleanup and platform coverage with shell-specific tests if current AppProcess semantics do not fully cover it.
// TODO: Revisit binary output handling if stdout/stderr decoding is text-only.
// TODO: Stream full shell output into managed storage while retaining only a bounded in-memory preview.

const shellTokens = (command: string) => command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
const unquote = (value: string) => value.replace(/^(['"])(.*)\1$/, "$2")
const externalCommandDirectories = Effect.fn("BashTool.externalCommandDirectories")(function* (
  fs: FSUtil.Interface,
  command: string,
  cwd: string,
) {
  const directories = new Set<string>()
  for (const token of shellTokens(command)) {
    const value = unquote(token).replace(/[;,|&]+$/, "")
    if (!path.isAbsolute(value)) continue
    const resolved = yield* fs.resolve(value)
    if (FSUtil.contains(cwd, resolved)) continue
    directories.add(yield* fs.resolve(path.dirname(resolved)))
  }
  return [...directories]
})

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const mutation = yield* LocationMutation.Service
    const fs = yield* FSUtil.Service
    const appProcess = yield* AppProcess.Service
    const config = yield* Config.Service
    const permission = yield* PermissionV2.Service
    const location = yield* Location.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description: `Run a command in a fresh, non-interactive process, with the configured shell or else \`/bin/sh\` (\`cmd.exe\` on Windows).

- \`cd\`, variables and other shell state do not carry over between calls. Commands run in the working directory; to run one elsewhere, set \`workdir\` rather than starting with \`cd\`. A \`workdir\` outside the working directory asks the owner first.
- Stdin is empty and there is no terminal, so nothing can answer a prompt or an editor: pass flags that skip them, such as \`-m\` for \`git commit\`. Credential-like variables such as \`GH_TOKEN\` and the SSH agent are removed.
- Read files and edit their contents with the file tools rather than shell commands.
- \`timeout\` is in milliseconds: ${DEFAULT_TIMEOUT_MS} by default, ${MAX_TIMEOUT_MS} at most.

# Results
- The result is the combined stdout and stderr, then the exit code, or a note that the command timed out. Only the first ${MAX_CAPTURE_BYTES / 1024 / 1024} MB of output is kept.
- A long result keeps its start and end, and the full output is saved to a file the result names, so there is no need to cut it yourself.

# Git and GitHub
- Commit, push or open a pull request only when asked. Before committing, check \`git status\` and \`git diff\`, and stage the files you changed by path.
- Give each paragraph of a commit message its own \`-m\`: \`${commitExample}\`. A safety guard refuses \`git add\` and \`git commit\` commands that contain \`$\`, backticks, heredocs or redirects, or options such as \`-am\`, \`--no-edit\`, \`-F\` and \`--author\`. It also refuses skipping hooks, force-pushing without \`--force-with-lease\` and \`git reset --hard\`.
- If a hook rejects a commit, fix the cause and commit again rather than amending the previous commit, and leave git config unchanged.
- Use \`gh\` for pull requests, issues, checks and releases. Before opening a pull request, review every commit it includes against the base branch, and return its URL.`,
          input: Input,
          output: Output,
          structured: StructuredOutput,
          toStructuredOutput: ({ output }) => ({
            truncated: output.truncated,
            ...(output.exit === undefined ? {} : { exit: output.exit }),
            ...(output.timeout === undefined ? {} : { timeout: output.timeout }),
          }),
          toModelOutput: ({ output }) => [
            { type: "text", text: output.output },
            { type: "text", text: modelOutput(output) },
          ],
          modelCapture: ({ input, output }) => ({
            textIndex: 0,
            observation: {
              source: "shell",
              command: input.command,
              output: output.output,
              termination: output.timeout ? { kind: "timed_out" }
                : typeof output.exit === "number" ? { kind: "exited", code: output.exit } : { kind: "unknown" },
              completeness: output.timeout ? "unknown" : output.truncated ? "truncated" : "complete",
              presentation: "unknown",
            },
          }),
          execute: (input, context) =>
            Effect.gen(function* () {
              const source = {
                type: "tool" as const,
                messageID: context.assistantMessageID,
                callID: context.toolCallID,
              }
              const target = yield* mutation.resolve({ path: input.workdir ?? ".", kind: "directory" })
              const external = target.externalDirectory
              if (external)
                yield* permission.assert({
                  ...LocationMutation.externalDirectoryPermission(external),
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source,
                })
              const warnings = (yield* externalCommandDirectories(fs, input.command, target.canonical)).map(
                (directory) =>
                  `Command argument references external directory ${path.join(directory, "*").replaceAll("\\", "/")}. Bash runs with host-user filesystem, process, and network authority; this scan is advisory only.`,
              )
              yield* permission.assert({
                action: name,
                resources: [input.command],
                save: [input.command],
                sessionID: context.sessionID,
                agent: context.agent,
                source,
              })

              if ((yield* fs.stat(target.canonical)).type !== "Directory")
                return yield* Effect.fail(new Error(`Working directory is not a directory: ${target.canonical}`))

              const entries = yield* config.entries()
              const shell =
                Object.assign({}, ...entries.flatMap((entry) => (entry.type === "document" ? [entry.info] : [])))
                  .shell ?? defaultShell()
              const command = ChildProcess.make(input.command, [], {
                cwd: target.canonical,
                shell,
                stdin: "ignore",
                detached: process.platform !== "win32",
                forceKillAfter: Duration.seconds(3),
              })
              const timeout = input.timeout ?? DEFAULT_TIMEOUT_MS
              const profile = yield* ToolSafety.RuntimeProfile
              yield* ToolSafetyGit.before({ command: input.command, directory: location.directory,
                projectDirectory: location.project.directory === "/" ? location.directory : location.project.directory,
                cwd: target.canonical, env: ToolSafetySandbox.environment(), managedPaths: profile?.managedPaths,
                neverTouch: profile?.neverTouch,
              }).pipe(Effect.provideService(FSUtil.Service, fs), Effect.provideService(AppProcess.Service, appProcess))
              const result = yield* Effect.scoped(Effect.gen(function* () {
                const inspector = OutputInspector.make()
                const wrapped = yield* ToolSafetySandbox.wrap(command, { prepareParents: true }).pipe(Effect.provideService(FSUtil.Service, fs))
                const captured = yield* appProcess.run(wrapped, {
                  combineOutput: true,
                  timeout: Duration.millis(timeout),
                  maxOutputBytes: MAX_CAPTURE_BYTES,
                  inspect: (chunk) => {
                    const reason = inspector.push(chunk)
                    if (reason) throw new ToolSafety.Denied({ reason })
                  },
                })
                const reason = inspector.finish()
                if (reason) return yield* new ToolSafety.Denied({ reason })
                return captured
              })).pipe(
                  Effect.catchTag("AppProcessError", (error): Effect.Effect<AppProcess.RunResult | undefined, AppProcess.AppProcessError | ToolSafety.Denied> =>
                    error.cause instanceof ToolSafety.Denied ? Effect.fail(error.cause)
                      : isTimeout(error) ? Effect.succeed(undefined) : Effect.fail(error),
                  ),
                )
              if (!result) {
                return {
                  output: `Command exceeded timeout of ${timeout} ms. Retry with a larger timeout if the command is expected to take longer.`,
                  truncated: false,
                  timeout: true,
                  ...(warnings.length ? { warnings } : {}),
                }
              }

              const output = result.output?.toString("utf8") || "(no output)"
              const notice = result.outputTruncated
                ? "[output capture truncated at the in-memory safety limit]"
                : undefined
              return {
                exit: result.exitCode,
                output: notice ? `${output}\n\n${notice}` : output,
                truncated: result.outputTruncated === true,
                ...(warnings.length ? { warnings } : {}),
              }
               }).pipe(Effect.provideService(ToolSafety.NativeContext, { directory: location.directory, projectID: location.project.id }),
                 Effect.mapError((error) => new ToolFailure({ message: error instanceof ToolSafety.Denied
                ? error.message : `Unable to execute command: ${input.command}`,
                ...(error instanceof ToolSafety.Denied ? { error } : {}),
              }))),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/bash",
  layer,
  deps: [ToolRegistry.node, LocationMutation.node, Location.node, FSUtil.node, AppProcess.node, Config.node, PermissionV2.node],
})
