import { expect, test } from "bun:test"
import path from "node:path"
import fs from "node:fs/promises"
import { seatSkillsFiles } from "../../script/seat-skills"
import { tmpdir } from "../fixture/fixture"

test.each(["bun", "node"] as const)("%s whole native registry captures/publishes/reopens/decodes with authored source unavailable", async (target) => {
  await using tmp = await tmpdir()
  const config = { target, format: "esm", entrypoints: [path.join(import.meta.dir, "fixtures/packaged-proof.ts")],
    files: { ...await seatSkillsFiles(), "orchestra-web-ui.gen.ts": "" },
    define: { ORCHESTRA_COMPILED: "true", ORCHESTRA_MODELS_DEV: "{}", ORCHESTRA_VERSION: '"local"', ORCHESTRA_CHANNEL: '"local"' },
    external: ["@lydell/node-pty", "jsonc-parser"],
  }
  const bundle = path.join(tmp.path, "native-proof.mjs")
  const builder = path.join(tmp.path, "build.ts")
  await Bun.write(builder, `const result = await Bun.build(${JSON.stringify(config)}); if (!result.success) throw new Error(result.logs.join("\\n")); await Bun.write(${JSON.stringify(bundle)}, result.outputs[0]);`)
  const build = Bun.spawn([process.execPath, builder], { cwd: path.resolve(import.meta.dir, "../.."), stdout: "pipe", stderr: "pipe" })
  const built = await Promise.all([new Response(build.stdout).text(), new Response(build.stderr).text(), build.exited])
  if (built[2] !== 0) throw new Error(`Whole native proof build failed: ${built[0]} ${built[1]}`)
  const project = path.join(tmp.path, "project")
  await fs.mkdir(project)
  await Bun.write(path.join(project, "orchestra.json"), JSON.stringify({ plugin: [], mcp: {}, lsp: false, formatter: false }))
  const child = Bun.spawn([target === "bun" ? process.execPath : "node", bundle, project], {
    cwd: tmp.path, stdout: "pipe", stderr: "pipe", env: { ...process.env,
      XDG_CACHE_HOME: path.join(tmp.path, "cache"), XDG_DATA_HOME: path.join(tmp.path, "data"), XDG_CONFIG_HOME: path.join(tmp.path, "config"),
      XDG_STATE_HOME: path.join(tmp.path, "state"), ORCHESTRA_DB: path.join(tmp.path, "native.db"), ORCHESTRA_INHERIT_CREDENTIALS: "0",
      ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true", ORCHESTRA_CONFIG_CONTENT: "{}",
    },
  })
  const output = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  if (output[2] !== 0) throw new Error(`Whole native ${target} proof failed: ${output[0]} ${output[1]}`)
  const marker = output[0].split(/\r?\n/).filter((line) => line.startsWith("PACKAGED_RESEARCH="))
  expect(marker).toHaveLength(1)
  const evidence = JSON.parse(marker[0].slice("PACKAGED_RESEARCH=".length))
  expect(evidence.runtime).toBe(target)
  expect(evidence.sourceAvailable).toBe(false)
  expect(evidence.report).toMatchObject({ card: { parsed: true }, referencesChecked: true, terminal: { reason: "ended" } })
  expect(evidence.report.documents).toEqual([evidence.document])
  expect(evidence.page).toContain("disabled rejects operation")
}, 120000)
