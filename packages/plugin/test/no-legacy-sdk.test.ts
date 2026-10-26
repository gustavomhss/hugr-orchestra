import { describe, expect, test } from "bun:test"
import path from "path"

const root = path.resolve(import.meta.dir, "..")

describe("plugin package", () => {
  test("declares no dependency on the legacy SDK", async () => {
    const manifest = await Bun.file(path.join(root, "package.json")).json()
    const sections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
    expect(Object.keys(manifest.dependencies)).toContain("@orchestra/schema")
    expect(sections.flatMap((section) => Object.keys(manifest[section] ?? {})).filter((name) => name.startsWith("@orchestra/sdk"))).toEqual([])
  })

  test("no source file imports the legacy SDK", async () => {
    const files = (await Array.fromAsync(new Bun.Glob("src/**/*.{ts,tsx}").scan({ cwd: root }))).map((file) =>
      file.replaceAll("\\", "/"),
    )
    // Fails closed if the scan stops seeing the contract entrypoints.
    expect(files).toEqual(expect.arrayContaining(["src/index.ts", "src/tui.ts"]))
    const offenders = await Promise.all(
      files.map(async (file) => ((await Bun.file(path.join(root, file)).text()).includes("@orchestra/sdk") ? file : undefined)),
    )
    expect(offenders.filter((file) => file !== undefined)).toEqual([])
  })

  test("no source file names a V1 schema module", async () => {
    const files = (await Array.fromAsync(new Bun.Glob("src/**/*.{ts,tsx}").scan({ cwd: root }))).map((file) =>
      file.replaceAll("\\", "/"),
    )
    expect(files).toEqual(expect.arrayContaining(["src/index.ts", "src/tui.ts", "src/types.ts"]))
    const offenders = await Promise.all(
      files.map(async (file) =>
        /@orchestra\/schema\/(v1\/|[\w-]+-v1["/])/.test(await Bun.file(path.join(root, file)).text()) ? file : undefined,
      ),
    )
    expect(offenders.filter((file) => file !== undefined)).toEqual([])
  })
})
