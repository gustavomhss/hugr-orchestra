// Mac conformance support, not a product entrypoint. Reuse an installed runtime
// checkout without installing dependencies in the isolated native worktree.
const input = JSON.parse(process.argv[2]) as {
  runtime: string
  root: string
  sockets: string[]
  shell: string
  artifact: string
}
const { Effect } = await import(`${input.runtime}/packages/core/node_modules/effect/dist/index.js`)
const { ChildProcess } = await import(
  `${input.runtime}/packages/core/node_modules/effect/dist/unstable/process/index.js`
)
const { LayerNode } = await import(`${input.runtime}/packages/core/src/effect/layer-node.ts`)
const { FSUtil } = await import(`${input.runtime}/packages/core/src/fs-util.ts`)
const { ToolSafety } = await import(`${input.runtime}/packages/core/src/tool-safety.ts`)
const { ToolSafetySandbox } = await import(`${input.runtime}/packages/core/src/tool-safety-sandbox.ts`)

const report = {}
await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const command = yield* ToolSafetySandbox.wrap(
        ChildProcess.make("/bin/sh", ["-c", input.shell], {
          cwd: input.root,
          env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: input.root },
          extendEnv: false,
        }),
      ).pipe(
        Effect.provideService(ToolSafety.RuntimeProfile, {
          requireSandbox: true,
          writeRoots: [input.root],
          sandbox: {
            enabled: true,
            scratch: true,
            allowedUnixSockets: input.sockets.map((path) => ({ directory: input.root, path })),
          },
        }),
        Effect.provideService(ToolSafety.NativeContext, { directory: input.root }),
        Effect.provideService(ToolSafety.ShellReport, report),
      )
      if (command._tag !== "StandardCommand") throw new Error("unexpected pipeline")
      yield* Effect.promise(() =>
        Bun.write(
          input.artifact,
          JSON.stringify(
            {
              command: command.command,
              args: command.args,
              options: command.options,
              report,
            },
            null,
            2,
          ),
        ),
      )
      const child = Bun.spawn([command.command, ...command.args], {
        cwd: command.options.cwd,
        env: command.options.env,
        stdout: "inherit",
        stderr: "inherit",
        timeout: 20000,
      })
      process.exitCode = yield* Effect.promise(() => child.exited)
    }),
  ).pipe(Effect.provide(LayerNode.compile(FSUtil.node))),
)

export {}
