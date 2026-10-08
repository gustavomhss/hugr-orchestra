// Mac conformance support, not a product entrypoint. Reuse an installed runtime
// checkout without installing dependencies in the isolated native worktree.
const input = JSON.parse(process.argv[2]) as {
  runtime: string
  root: string
  sockets: string[]
  shell: string
  artifact: string
  production?: number
  source?: string
  argv?: string[]
}
if (input.production) {
  if (!input.source) throw new Error("missing owned native source")
  const source = input.source
  // Override only the frozen SOURCE module in this private proof process.
  // Compiler/cache/broker acquisition executes the production implementation.
  Bun.plugin({
    name: "owned-native-source",
    setup(builder) {
      builder.onLoad({ filter: /(?:^|\/)tcp-proxy-native\.ts$/ }, async () => ({
        contents: await Bun.file(source).text(),
        loader: "ts",
      }))
    },
  })
}
const { Effect } = await import(`${input.runtime}/packages/core/node_modules/effect/dist/index.js`)
const { ChildProcess } = await import(
  `${input.runtime}/packages/core/node_modules/effect/dist/unstable/process/index.js`
)
const { LayerNode } = await import(`${input.runtime}/packages/core/src/effect/layer-node.ts`)
const { FSUtil } = await import(`${input.runtime}/packages/core/src/fs-util.ts`)
const { ToolSafety } = await import(`${input.runtime}/packages/core/src/tool-safety.ts`)
const { ToolSafetySandbox } = await import(`${input.runtime}/packages/core/src/tool-safety-sandbox.ts`)
const production = input.production ? await import(`${input.runtime}/packages/core/src/tcp-proxy.ts`) : undefined

const report = {}
await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const proxy = production ? yield* production.TcpProxy.open([input.production]) : undefined
      if (proxy && !input.argv?.length) throw new Error("missing production proof command")
      const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
      const shell = proxy
        ? "export " +
          Object.entries({ ...proxy.env, DYLD_INSERT_LIBRARIES: proxy.library })
            .map(([key, value]) => key + "=" + quote(String(value)))
            .join(" ") +
          "; exec " +
          input.argv?.map(quote).join(" ")
        : input.shell
      const command = yield* ToolSafetySandbox.wrap(
        ChildProcess.make("/bin/sh", ["-c", shell], {
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
            allowedUnixSockets: (proxy?.sockets ?? input.sockets).map((path: string) => ({
              directory: input.root,
              path,
            })),
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
              proxy,
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
