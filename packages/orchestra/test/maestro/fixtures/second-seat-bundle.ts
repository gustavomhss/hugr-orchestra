import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"
import { snapshotPlugin } from "./second-seat-registry"

test("build genuine second-seat Bun bundle", async () => {
  const outdir = process.env.ORCHESTRA_SEAT_BUNDLE_DIR
  const snapshot = process.env.ORCHESTRA_SEAT_SNAPSHOT
  if (!outdir || !snapshot) throw new Error("Second-seat bundle paths missing")
  const { seatSkillsModule } = await import("../../../script/seat-skills")
  // Integration seam: replace the next line with `const files = await seatSkillsFiles()` and update import above.
  const files = { "orchestra-seat-skills.gen.ts": await seatSkillsModule() }
  const omitted = process.env.ORCHESTRA_SEAT_MUTATION === "omit-embedded-map"
  const built = await Bun.build({
    entrypoints: [path.join(import.meta.dirname, "second-seat-compiled.ts")],
    outdir,
    naming: "second-seat.test.js",
    target: "bun",
    format: "esm",
    // Leave npm/workspace runtime dependencies live. The generated module and Orchestra's aliases must
    // resolve inside the bundle; `packages: external` would also externalize the generated module.
    external: ["orchestra-web-ui.gen.ts", ...(omitted ? ["orchestra-seat-skills.gen.ts"] : [])],
    tsconfig: path.resolve(import.meta.dirname, "../../../tsconfig.json"),
    define: { ORCHESTRA_COMPILED: "true" },
    files: omitted ? {} : files,
    plugins: [snapshotPlugin, {
      name: "live-runtime-dependencies",
      setup(build) {
        build.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path === "orchestra-web-ui.gen.ts" || (omitted && args.path === "orchestra-seat-skills.gen.ts")) return { path: args.path, external: true }
          if (/^(?:[A-Za-z]:[\\/]|@\/|@test\/|bun:|node:)/.test(args.path) || args.path === "orchestra-seat-skills.gen.ts") return
          // Bun's external star-reexport lowering emits an unbound namespace for Orchestra's TUI facades.
          if (args.path.startsWith("@orchestra/tui/")) return { path: Bun.resolveSync(args.path, args.resolveDir) }
          return { path: Bun.resolveSync(args.path, args.resolveDir), external: true }
        })
      },
    }, {
      name: "preserve-source-file-locations",
      setup(build) {
        // The snapshot's source skill path must stay the snapshot's path after bundling, not drift to an
        // unrelated path relative to the artifact. Other fixtures also resolve their authored assets this way.
        build.onLoad({ filter: /\.ts$/ }, async (args) => {
          if (args.path.endsWith("orchestra-seat-skills.gen.ts")) return
          return {
            loader: "ts",
            contents: (await Bun.file(args.path).text())
              .replaceAll(/import\.meta\.(dirname|dir)\b/g, JSON.stringify(path.dirname(args.path)))
              .replaceAll("import.meta.url", JSON.stringify(pathToFileURL(args.path).href)),
          }
        })
      },
    }, createSolidTransformPlugin()],
  })
  if (!built.success) throw new Error(`Second-seat bundle failed:\n${built.logs.join("\n")}`)
  expect(built.outputs.some((output) => output.path.endsWith("second-seat.test.js"))).toBe(true)
  await Bun.write(path.join(outdir, "proof.json"), JSON.stringify({ skillBytes: process.env.ORCHESTRA_SEAT_SKILL_BYTES }))
  const tree = path.join(snapshot, "packages/sample-seat-specialist/skills")
  expect(await Bun.file(path.join(tree, "sample-seat-work/SKILL.md")).exists()).toBe(true)
  await fs.rm(tree, { recursive: true })
  expect(await Bun.file(path.join(tree, "sample-seat-work/SKILL.md")).exists()).toBe(false)
  console.log(JSON.stringify({ secondSeatBundle: { target: "bun", compiled: true, sourceTreeRemoved: true, embeddedMapOmitted: omitted } }))
}, 90000)
