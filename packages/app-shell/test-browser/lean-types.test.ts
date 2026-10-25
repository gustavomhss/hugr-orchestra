import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

// The Lean browser lane's typechecks, each run once. The Lean test files used to build one program apiece over
// app/src plus themselves, and two of them re-ran the app and package typechecks; one program over app/src and every
// Lean browser file checks the same sources, and each package typechecks once.
const app = path.resolve(import.meta.dir, "..")

async function typecheck(args: string[], cwd = app) {
  const proc = Bun.spawn([process.execPath, ...args], { cwd, stdout: "pipe", stderr: "pipe", timeout: 600000, killSignal: "SIGKILL" })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  if (code !== 0) throw new Error(`${path.relative(app, cwd) || "app"}: ${args.join(" ")} exited ${code}/${proc.signalCode}\n${out}\n${err}`)
  console.log(out + err)
}

test("actual app and every Lean browser test file typecheck in one program", async () => {
  const files = [...new Bun.Glob("{lean-*,solid-dom}.ts").scanSync(import.meta.dir)]
  // Every file the per-file programs checked; a glob that stops matching cannot shrink the program unnoticed.
  expect(files).toEqual(expect.arrayContaining([
    "lean-chapter-route.test.ts", "lean-controller.test.ts", "lean-dom.test-helper.ts", "lean-native-product.test-helper.ts",
    "lean-native-product.test.ts", "lean-profile-view.test-helper.ts", "lean-profile-view.test.ts", "lean-tool-preservation.test.ts",
    "solid-dom.ts",
  ]))
  const scratch = await mkdtemp(path.join(os.tmpdir(), "lean-types-"))
  try {
    const config = path.join(scratch, "tsconfig.json")
    await Bun.write(config, JSON.stringify({ extends: path.join(app, "tsconfig.json"),
      // core's omni loader, reached from the native product proof, imports with explicit .ts extensions, which the
      // bundler-driven packages already allow.
      compilerOptions: { composite: false, declaration: false, emitDeclarationOnly: false, noEmit: true, allowImportingTsExtensions: true,
        rootDir: path.resolve(app, "../.."), tsBuildInfoFile: path.join(scratch, "types.tsbuildinfo") },
      include: [path.join(app, "src"), path.join(app, "package.json"), ...files.map((file) => path.join(import.meta.dir, file))],
    }))
    await typecheck(["typecheck", config])
  } finally { await rm(scratch, { recursive: true, force: true }) }
}, 600000)

test("combined Schema/Core/app/session-ui/ui types in CI", async () => {
  for (const pkg of ["schema", "core", "app-shell", "session-ui", "ui"])
    await typecheck(["typecheck"], path.resolve(app, "..", pkg))
}, 600000)

test("app e2e types, including the Lean visual capture spec", async () => {
  await typecheck(["run", "typecheck:e2e"])
}, 600000)
