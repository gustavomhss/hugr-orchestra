import { expect } from "bun:test"
import path from "path"
import { Effect } from "effect"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { SandboxProjectConfig } from "../src/sandbox-project-config"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(FSUtil.node))

// A governed backend is granted files (`src/x.ts`) as write roots. Every one of its shell commands used to HOLD with
// sandbox-project-config-acquisition, because `x.ts/orchestra.json` fails realpath with ENOTDIR, not NotFound.
it.live("a file write root protects the config names of its directory, its ancestors and under the file itself", () =>
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "project-config-file-root-" }).pipe(Effect.flatMap(fs.realPath))
    const file = path.join(root, "src", "x.ts")
    yield* fs.makeDirectory(path.dirname(file))
    yield* fs.writeFileString(file, "export {}\n")
    const missing = path.join(root, "later", "y.ts")
    const guarded = yield* SandboxProjectConfig.protectedPaths(fs, [root, file, missing])
    expect(guarded).toContain(path.join(root, "src", "orchestra.json"))
    expect(guarded).toContain(path.join(root, "src", ".orchestra"))
    expect(guarded).toContain(path.join(root, "orchestra.json"))
    // Seatbelt's grant on the file lets a command replace it with a directory, so its own names stay guarded, literally.
    expect(guarded.filter((entry) => FSUtil.contains(file, entry)).sort())
      .toEqual(["orchestra.json", "orchestra.jsonc", "tui.json", "tui.jsonc", ".orchestra"].map((name) => path.join(file, name)).sort())
    // A root not created yet may become a directory: its names stay guarded.
    expect(guarded).toContain(path.join(missing, "orchestra.json"))
  }),
)
