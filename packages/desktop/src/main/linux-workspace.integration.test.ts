import { expect, test } from "bun:test"
import { mkdtemp, mkdir, symlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { createRequire } from "node:module"

test.skipIf(process.env.APP_DOCK_ACCESS_INTEGRATION !== "1")(
  `[real Docker + PTY] Linux access proof (${process.env.APP_DOCK_ACCESS_PROOF_SCOPE ?? "full"})`,
  async () => {
    expect(process.env.APP_DOCK_ACCESS_ROOT).toBeTruthy()
    const parent = join(tmpdir(), "opencode")
    await mkdir(parent, { recursive: true })
    const directory = await mkdtemp(join(parent, "workspace-access-proof-"))
    await symlink(resolve("node_modules"), join(directory, "node_modules"), "dir")
    const built = await Bun.build({
      entrypoints: [resolve("scripts/linux-workspace-proof.ts")],
      outdir: directory,
      target: "node",
      format: "esm",
      external: ["@lydell/node-pty"],
      plugins: [
        {
          name: "access-controls",
          setup(build) {
            if (process.env.APP_DOCK_ACCESS_MUTATION === "file")
              build.onLoad({ filter: /linux-workspace-files\.ts$/ }, async (args) => {
                const text = await Bun.file(args.path).text()
                const before = "with open(sys.argv[1],'wb') as f: f.write(b)"
                expect(text.split(before)).toHaveLength(2)
                return {
                  contents: text.replace(before, "with open(sys.argv[1],'wb') as f: f.write(b'broken')"),
                  loader: "ts",
                }
              })
            if (process.env.APP_DOCK_ACCESS_MUTATION === "resize")
              build.onLoad({ filter: /linux-workspace-access\.ts$/ }, async (args) => {
                const text = await Bun.file(args.path).text()
                expect(text.split("found.process.resize(cols, rows)")).toHaveLength(2)
                return { contents: text.replace("found.process.resize(cols, rows)", "undefined"), loader: "ts" }
              })
          },
        },
      ],
    })
    expect(built.success).toBe(true)
    const electron = createRequire(resolve("package.json"))("electron") as string
    const child = Bun.spawn([electron, built.outputs[0]!.path], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: resolve("node_modules") },
      stdout: "pipe",
      stderr: "pipe",
    })
    const timer = setTimeout(() => child.kill(), 240000)
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]).finally(() => clearTimeout(timer))
    console.log(stdout)
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
    expect(stdout).toContain('"status":"pass"')
  },
  260000,
)
